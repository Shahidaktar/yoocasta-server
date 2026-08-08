import fs from 'fs';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../../config/db';
import { comparePassword, hashPassword } from '../../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import { JwtPayload } from '../../utils/jwt';
import { sendEmail, recruiterVerifiedEmailTemplate, jobApprovedTemplate, jobRejectedTemplate } from '../../config/email';
import { CATEGORY_MAP } from '../blogs/blog.service';
import { uploadToR2, r2Client } from '../../config/r2';

export const login = async (email: string, password: string) => {
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) throw { statusCode: 401, message: 'Invalid email or password' };

  const isMatch = await comparePassword(password, admin.password);
  if (!isMatch) throw { statusCode: 401, message: 'Invalid email or password' };

  const adminRole = admin.role || 'SUPER_ADMIN';
  const permissions = admin.permissions || [];

  const accessToken = generateAccessToken({ userId: admin.id, email: admin.email, role: 'ADMIN', adminRole, permissions });
  const refreshToken = generateRefreshToken({ userId: admin.id, email: admin.email, role: 'ADMIN', adminRole, permissions });

  return {
    user: { id: admin.id, email: admin.email, name: admin.name, role: 'ADMIN', adminRole, permissions },
    accessToken,
    refreshToken,
  };
};

export const getSubAdmins = async () => {
  const admins = await prisma.admin.findMany({
    where: { role: 'SUB_ADMIN' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return admins;
};

export const createSubAdmin = async (data: { email: string; name?: string; password: string; permissions: string[] }) => {
  if (!data.email || !data.password) {
    throw { statusCode: 400, message: 'Email and password are required' };
  }
  const exists = await prisma.admin.findUnique({ where: { email: data.email } });
  if (exists) throw { statusCode: 400, message: 'An admin with this email already exists' };

  const hashed = await hashPassword(data.password);
  const admin = await prisma.admin.create({
    data: {
      email: data.email,
      name: data.name || data.email,
      password: hashed,
      role: 'SUB_ADMIN',
      permissions: data.permissions || [],
    },
    select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true },
  });
  return admin;
};

export const updateSubAdminPassword = async (adminId: string, newPassword: string) => {
  if (!newPassword) throw { statusCode: 400, message: 'New password is required' };
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw { statusCode: 404, message: 'Sub admin not found' };
  if (admin.role !== 'SUB_ADMIN') throw { statusCode: 400, message: 'Cannot change password of super admin' };

  const hashed = await hashPassword(newPassword);
  return prisma.admin.update({
    where: { id: adminId },
    data: { password: hashed },
    select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true },
  });
};

export const updateSubAdminPermissions = async (adminId: string, permissions: string[]) => {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw { statusCode: 404, message: 'Sub admin not found' };
  if (admin.role !== 'SUB_ADMIN') throw { statusCode: 400, message: 'Cannot edit permissions of super admin' };

  return prisma.admin.update({
    where: { id: adminId },
    data: { permissions: permissions || [] },
    select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true },
  });
};

export const deleteSubAdmin = async (adminId: string) => {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw { statusCode: 404, message: 'Sub admin not found' };
  if (admin.role !== 'SUB_ADMIN') throw { statusCode: 400, message: 'Cannot delete super admin' };

  await prisma.admin.delete({ where: { id: adminId } });
  return { id: adminId };
};

export const getTalents = async (page: number, limit: number, status?: string, search?: string) => {
  const where: any = { role: 'TALENT' };
  if (status === 'active') where.status = 'ACTIVE';
  else if (status === 'inactive') where.status = 'INACTIVE';
  if (search) {
    const terms = search.trim().split(/\s+/).filter(Boolean);
    where.AND = terms.map((term) => ({
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { username: { contains: term, mode: 'insensitive' } },
      ],
    }));
  }

  const [talents, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        phone: true,
        whatsappNo: true,
        status: true,
        profileCompleted: true,
        createdAt: true,
        nationality: { select: { name: true } },
        talentProfile: {
          select: {
            city: { select: { name: true, country: { select: { name: true } } } },
          },
        },
        subscription: {
          select: {
            plan: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const mapped = talents.map((t, idx) => ({
    slNo: (page - 1) * limit + idx + 1,
    id: t.id,
    name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—',
    username: t.username,
    profileCompleted: t.profileCompleted,
    userId: t.username ? `YC${t.id.slice(-8).toUpperCase()}` : `#${t.id.slice(-8).toUpperCase()}`,
    country: t.nationality?.name || t.talentProfile?.city?.country?.name || '—',
    city: t.talentProfile?.city?.name || '—',
    email: t.email,
    phone: t.phone || '—',
    whatsapp: t.whatsappNo || '—',
    subscriptionPlan: t.subscription?.plan?.name || 'Basic',
    registeredDate: t.createdAt,
    status: t.status === 'ACTIVE' ? 'active' : 'inactive',
  }));

  return {
    talents: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getTalentSubscriptionDetails = async (talentId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
      image: true,
      createdAt: true,
      talentProfile: {
        select: {
          city: {
            select: { name: true, country: { select: { name: true } } },
          },
        },
      },
      subscription: {
        select: {
          id: true,
          status: true,
          activatedAt: true,
          expiresAt: true,
          createdAt: true,
          plan: { select: { id: true, name: true } },
        },
      },
      paymentTransactions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderId: true,
          amount: true,
          duration: true,
          status: true,
          createdAt: true,
          refId: true,
          plan: { select: { name: true } },
        },
      },
    },
  });

  if (!user) throw { statusCode: 404, message: 'Talent not found' };

  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—';
  const location = user.talentProfile?.city
    ? [user.talentProfile.city.name, user.talentProfile.city.country?.name].filter(Boolean).join(', ')
    : '—';
  const image = user.image;

  const lastTxn = user.paymentTransactions.length > 0
    ? user.paymentTransactions[0]
    : null;

  const lastTxnPurchaseDate = lastTxn ? new Date(lastTxn.createdAt) : null;

  let currentActivatedDate: Date | null = null;
  if (lastTxn) {
    const txnDate = new Date(lastTxn.createdAt);
    const months = parseInt(lastTxn.duration) || 0;
    if (months > 0) {
      txnDate.setMonth(txnDate.getMonth() + months);
    }
    currentActivatedDate = txnDate;
  }

  const sub = user.subscription;
  const now = new Date();

  let effectiveExpiry: Date | null = null;
  if (sub?.expiresAt) {
    effectiveExpiry = sub.expiresAt;
  } else if (lastTxn) {
    const months = parseInt(lastTxn.duration) || 0;
    if (months > 0) {
      const calculated = new Date(lastTxn.createdAt);
      calculated.setMonth(calculated.getMonth() + months);
      effectiveExpiry = calculated;
    }
  }

  const isExpired = effectiveExpiry !== null && effectiveExpiry < now;
  const hasActiveSubscription = !!sub && sub.status === 'ACTIVE' && !isExpired;

  const subscription = hasActiveSubscription && sub
    ? {
        id: sub.id,
        planId: sub.plan.id,
        planName: sub.plan.name,
        activatedDate: sub.activatedAt || lastTxnPurchaseDate || user.createdAt,
        expiresAt: sub.expiresAt,
        duration: sub.expiresAt && (sub.activatedAt || lastTxnPurchaseDate)
          ? Math.round((sub.expiresAt.getTime() - (sub.activatedAt || lastTxnPurchaseDate!).getTime()) / (1000 * 60 * 60 * 24)) + ' days'
          : 'Lifetime',
        status: sub.status,
      }
    : {
        id: null,
        planId: null,
        planName: 'Basic',
        activatedDate: currentActivatedDate || user.createdAt,
        expiresAt: null,
        duration: 'Lifetime',
        status: 'ACTIVE',
      };

  const paymentHistory = user.paymentTransactions.map((t, idx) => ({
    no: idx + 1,
    orderId: t.orderId,
    date: t.createdAt,
    packageName: t.plan.name,
    duration: t.duration,
    cost: t.amount,
    refId: t.refId || '—',
  }));

  return {
    profile: { name, email: user.email, username: user.username, image, location },
    subscription,
    paymentHistory,
  };
};

export const updateTalentSubscription = async (
  talentId: string,
  data: { planId?: string | null; status?: string; activatedAt?: string | null; expiresAt?: string | null }
) => {
  const user = await prisma.user.findUnique({
    where: { id: talentId },
    select: { id: true, subscription: { select: { id: true, planId: true } } },
  });
  if (!user) throw { statusCode: 404, message: 'Talent not found' };

  const sub = user.subscription;

  const updateData: any = {};
  if (data.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan) throw { statusCode: 400, message: 'Plan not found' };
    updateData.planId = data.planId;
  }
  if (data.status) {
    if (!['ACTIVE', 'EXPIRED', 'CANCELLED'].includes(data.status)) {
      throw { statusCode: 400, message: 'Invalid status' };
    }
    updateData.status = data.status;
  }
  if (data.expiresAt !== undefined) {
    updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  }
  if (data.activatedAt !== undefined) {
    updateData.activatedAt = data.activatedAt ? new Date(data.activatedAt) : null;
  }

  const createPlanId = updateData.planId || sub?.planId;
  if (!createPlanId) throw { statusCode: 400, message: 'Please select a plan' };

  const updated = await prisma.userSubscription.upsert({
    where: { userId: talentId },
    create: {
      userId: talentId,
      planId: createPlanId,
      status: updateData.status || 'ACTIVE',
      expiresAt: updateData.expiresAt ?? null,
    },
    update: updateData,
    select: { id: true, status: true, expiresAt: true, plan: { select: { id: true, name: true } } },
  });

  return updated;
};

export const getCompanies = async (page: number, limit: number, search?: string, verifyFilter?: string) => {
  const where: any = { role: 'RECRUITER' };
  if (verifyFilter === 'verified') where.isVerified = true;
  else if (verifyFilter === 'notverified') where.isVerified = false;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { companyProfile: { companyName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [companies, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        isVerified: true,
        profileCompleted: true,
        status: true,
        createdAt: true,
        city: {
          select: { name: true, country: { select: { name: true } } },
        },
        companyProfile: {
          select: { companyName: true, companyType: true, website: true, description: true, tradeLicense: true, tradeLicenseFile: true, isInternalCompany: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const mapped = companies.map((c, idx) => ({
    slNo: (page - 1) * limit + idx + 1,
    id: c.id,
    name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || '—',
    companyName: c.companyProfile?.companyName || '—',
    companyType: c.companyProfile?.companyType || null,
    website: c.companyProfile?.website || null,
    description: c.companyProfile?.description || null,
    tradeLicense: c.companyProfile?.tradeLicense || null,
    tradeLicenseFile: c.companyProfile?.tradeLicenseFile ? `${process.env.R2_PUBLIC_URL}/license/${c.companyProfile.tradeLicenseFile}` : null,
    isInternalCompany: c.companyProfile?.isInternalCompany || false,
    profileCompleted: c.profileCompleted,
    isVerified: c.isVerified,
    status: c.status === 'ACTIVE' ? 'active' : 'inactive',
    country: c.city?.country?.name || '—',
    city: c.city?.name || '—',
    email: c.email,
    phone: c.phone || '—',
    registeredDate: c.createdAt,
  }));

  return {
    companies: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const updateCompanyVerify = async (companyId: string, isVerified: boolean) => {
  const user = await prisma.user.findUnique({ where: { id: companyId } });
  if (!user || user.role !== 'RECRUITER') throw { statusCode: 404, message: 'Company not found' };

  const updated = await prisma.user.update({
    where: { id: companyId },
    data: { isVerified },
    select: { id: true, isVerified: true },
  });

  if (isVerified) {
    const company = await prisma.companyProfile.findUnique({ where: { userId: companyId } });
    sendEmail(
      user.email,
      'Your Account Has Been Verified — Yoocasta',
      recruiterVerifiedEmailTemplate(company?.companyName || user.firstName || 'Recruiter')
    ).catch(err => console.error('Failed to send verification email:', err));
  }

  return { id: updated.id, isVerified: updated.isVerified };
};

export const updateCompanyStatus = async (companyId: string, status: 'ACTIVE' | 'INACTIVE') => {
  const user = await prisma.user.findUnique({ where: { id: companyId } });
  if (!user || user.role !== 'RECRUITER') throw { statusCode: 404, message: 'Company not found' };

  const updated = await prisma.user.update({
    where: { id: companyId },
    data: { status },
    select: { id: true, status: true },
  });

  return { id: updated.id, status: updated.status === 'ACTIVE' ? 'active' : 'inactive' };
};

export const loginAsTalent = async (talentId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      firstName: true,
      lastName: true,
      image: true,
      isEmailVerified: true,
      isVerified: true,
      profileCompleted: true,
    },
  });

  if (!user || user.role !== 'TALENT') throw { statusCode: 404, message: 'Talent not found' };

  const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      image: user.image,
      isEmailVerified: user.isEmailVerified,
      isVerified: user.isVerified,
      profileCompleted: user.profileCompleted,
    },
    accessToken,
    refreshToken,
  };
};

export const loginAsRecruiter = async (recruiterId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: recruiterId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      firstName: true,
      lastName: true,
      image: true,
      isEmailVerified: true,
      isVerified: true,
      profileCompleted: true,
    },
  });

  if (!user || user.role !== 'RECRUITER') throw { statusCode: 404, message: 'Recruiter not found' };

  const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      image: user.image,
      isEmailVerified: user.isEmailVerified,
      isVerified: user.isVerified,
      profileCompleted: user.profileCompleted,
    },
    accessToken,
    refreshToken,
  };
};

export const getActiveCompanies = async () => {
  const companies = await prisma.user.findMany({
    where: { role: 'RECRUITER', status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyProfile: { select: { companyName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return companies.map((c) => ({
    id: c.id,
    name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || '—',
    companyName: c.companyProfile?.companyName || '—',
  }));
};

export const adminCreateJob = async (companyId: string, data: any) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId: companyId } });
  if (!company) throw { statusCode: 404, message: 'Company not found' };

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      castingService: data.castingService || 'manual',
      title: data.title || null,
      subTitle: data.subTitle || null,
      description: data.description || null,
      usage: data.usage || null,
      categoryId: data.categoryId || null,
      projectTypeId: data.projectTypeId || null,
      paymentInfo: data.paymentInfo || null,
      castingCityId: data.castingCityId || null,
      castingDates: data.castingDates ? JSON.stringify(data.castingDates) : null,
      lastDateToApply: data.lastDateToApply ? new Date(data.lastDateToApply) : null,
      shootingCityId: data.shootingCityId || null,
      shootingDates: data.shootingDates ? JSON.stringify(data.shootingDates) : null,
      image: data.image || null,
      status: 'APPROVED',
    },
    include: { roles: true },
  });

  return job;
};

export const adminAddRole = async (jobId: string, data: any) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const toJson = (arr: any) => (Array.isArray(arr) && arr.length > 0 ? JSON.stringify(arr) : null);

  const role = await prisma.role.create({
    data: {
      jobId,
      title: data.title || null,
      description: data.description || null,
      noOfCast: data.noOfCast ? parseInt(data.noOfCast) : null,
      ethnicity: toJson(data.ethnicityIds),
      ethnicityAll: data.ethnicityIds?.includes('any') || false,
      nationality: toJson(data.nationalityIds),
      nationalityAll: data.nationalityIds?.includes('any') || false,
      languageSpoken: toJson(data.languageIds),
      dialectsSpoken: toJson(data.dialectIds),
      gender: data.gender || null,
      ageMin: data.ageMin ? parseInt(data.ageMin) : null,
      ageMax: data.ageMax ? parseInt(data.ageMax) : null,
      experience: data.experience?.length > 0 ? JSON.stringify(data.experience) : null,
      paymentInfo: data.paymentInfo || null,
      paymentType: data.paymentType || null,
      locationCountry: toJson(data.locationCountryIds),
      locationCityId: (data.locationCityIds && data.locationCityIds.length && !data.locationCityIds.includes('any')) ? data.locationCityIds[0] : null,
      usage: data.usage || null,
      question1: data.question1 || null,
      question2: data.question2 || null,
      question3: data.question3 || null,
      requiredProfileVideo: data.requiredProfileVideo || false,
      requiredCastingVideo: data.requiredCastingVideo || false,
    },
  });

  if (data.paymentType && data.paymentDetails) {
    await prisma.rolePayment.create({
      data: { roleId: role.id, ...buildPaymentData(data.paymentType, data.paymentDetails) },
    });
  }

  return role;
};

export const adminUpdateRole = async (jobId: string, roleId: string, data: any) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const role = await prisma.role.findFirst({ where: { id: roleId, jobId } });
  if (!role) throw { statusCode: 404, message: 'Role not found' };

  const toJson = (arr: any) => (Array.isArray(arr) && arr.length > 0 ? JSON.stringify(arr) : null);

  const updated = await prisma.role.update({
    where: { id: roleId },
    data: {
      title: data.title ?? role.title,
      description: data.description ?? role.description,
      noOfCast: data.noOfCast ? parseInt(data.noOfCast) : role.noOfCast,
      ethnicity: data.ethnicityIds ? toJson(data.ethnicityIds) : role.ethnicity,
      ethnicityAll: data.ethnicityIds ? data.ethnicityIds.includes('any') || false : role.ethnicityAll,
      nationality: data.nationalityIds ? toJson(data.nationalityIds) : role.nationality,
      nationalityAll: data.nationalityIds ? data.nationalityIds.includes('any') || false : role.nationalityAll,
      languageSpoken: data.languageIds ? toJson(data.languageIds) : role.languageSpoken,
      dialectsSpoken: data.dialectIds ? toJson(data.dialectIds) : role.dialectsSpoken,
      gender: data.gender ?? role.gender,
      ageMin: data.ageMin ? parseInt(data.ageMin) : role.ageMin,
      ageMax: data.ageMax ? parseInt(data.ageMax) : role.ageMax,
      experience: data.experience ? JSON.stringify(data.experience) : role.experience,
      paymentInfo: data.paymentInfo ?? role.paymentInfo,
      paymentType: data.paymentType ?? role.paymentType,
      usage: data.usage ?? role.usage,
      locationCityId: (data.locationCityIds && data.locationCityIds.length && !data.locationCityIds.includes('any')) ? data.locationCityIds[0] : role.locationCityId,
      locationCountry: data.locationCountryIds ? toJson(data.locationCountryIds) : role.locationCountry,
      question1: data.question1 ?? role.question1,
      question2: data.question2 ?? role.question2,
      question3: data.question3 ?? role.question3,
      requiredProfileVideo: data.requiredProfileVideo ?? role.requiredProfileVideo,
      requiredCastingVideo: data.requiredCastingVideo ?? role.requiredCastingVideo,
    },
  });

  if (data.paymentType && data.paymentDetails) {
    await prisma.rolePayment.upsert({
      where: { roleId },
      create: { roleId, ...buildPaymentData(data.paymentType, data.paymentDetails) },
      update: buildPaymentData(data.paymentType, data.paymentDetails),
    });
  }

  return updated;
};

export const getJobs = async (page: number, limit: number, search?: string, statusFilter?: string) => {
  const where: any = {};
  if (statusFilter === 'active') where.status = 'APPROVED';
  else if (statusFilter === 'inactive') where.status = 'PENDING';
  else if (statusFilter === 'rejected') where.status = 'REJECTED';
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { company: { companyName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        lastDateToApply: true,
        createdAt: true,
        company: {
          select: { companyName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where }),
  ]);

  const mapped = jobs.map((j, idx) => ({
    slNo: (page - 1) * limit + idx + 1,
    id: j.id,
    title: j.title || 'Untitled',
    companyName: j.company.companyName,
    datePosted: j.createdAt,
    expireDate: j.lastDateToApply,
    status: j.status === 'APPROVED' ? 'active' : j.status === 'REJECTED' ? 'rejected' : 'inactive',
  }));

  return {
    jobs: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getJobPaymentDetails = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      paymentInfo: true,
      company: { select: { companyName: true } },
      roles: {
        select: {
          id: true,
          title: true,
          paymentType: true,
          payment: true,
        },
      },
    },
  });

  if (!job) throw { statusCode: 404, message: 'Job not found' };

  return job;
};

export const getAdminJobById = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      roles: {
        include: { payment: true },
      },
      company: true,
      category: true,
      projectType: true,
      castingCity: { include: { country: true } },
      shootingCity: { include: { country: true } },
    },
  });
  if (!job) throw { statusCode: 404, message: 'Job not found' };
  return job;
};

export const adminUpdateJob = async (jobId: string, data: any) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  return prisma.job.update({
    where: { id: jobId },
    data: {
      title: data.title ?? job.title,
      subTitle: data.subTitle ?? job.subTitle,
      description: data.description ?? job.description,
      usage: data.usage ?? job.usage,
      categoryId: data.categoryId ?? job.categoryId,
      projectTypeId: data.projectTypeId ?? job.projectTypeId,
      paymentInfo: data.paymentInfo ?? job.paymentInfo,
      castingCityId: data.castingCityId ?? job.castingCityId,
      castingDates: data.castingDates ? JSON.stringify(data.castingDates) : job.castingDates,
      lastDateToApply: data.lastDateToApply ? new Date(data.lastDateToApply) : job.lastDateToApply,
      shootingCityId: data.shootingCityId ?? job.shootingCityId,
      shootingDates: data.shootingDates ? JSON.stringify(data.shootingDates) : job.shootingDates,
      image: data.image ?? job.image,
    },
    include: { roles: true },
  });
};

export const updateJobStatus = async (jobId: string, status: 'APPROVED' | 'PENDING' | 'REJECTED') => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      company: {
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status },
    select: { id: true, status: true },
  });

  // Notify recruiter via email
  if ((status === 'APPROVED' || status === 'REJECTED') && job.company?.user?.email) {
    const companyName = job.company.companyName || 'Your Company';
    const recipientName = job.company.user.firstName || companyName;
    const jobTitle = job.title || 'Untitled';

    if (status === 'APPROVED') {
      sendEmail(
        job.company.user.email,
        'Your Job Has Been Approved — Yoocasta',
        jobApprovedTemplate(recipientName, jobTitle)
      ).catch(err => console.error('Failed to send job approved email:', err));
    } else {
      sendEmail(
        job.company.user.email,
        'Your Job Has Been Rejected — Yoocasta',
        jobRejectedTemplate(recipientName, jobTitle)
      ).catch(err => console.error('Failed to send job rejected email:', err));
    }
  }

  return {
    id: updated.id,
    status: updated.status === 'APPROVED' ? 'active' : updated.status === 'REJECTED' ? 'rejected' : 'inactive',
  };
};

const parseIntOrNull = (val: any) => (val ? parseInt(val, 10) : null);

const buildPaymentData = (paymentType: string, d: any) => {
  switch (paymentType) {
    case 'per_hour':
      return {
        hourPerDay: parseIntOrNull(d.hoursPerDay),
        hourBudgetPerHour: parseIntOrNull(d.budgetPerHour),
        hourNoOfDays: parseIntOrNull(d.noOfDays),
      };
    case 'per_day':
      return {
        dayFullDay: parseIntOrNull(d.fullDay),
        dayHalfDay: parseIntOrNull(d.halfDay),
        dayBudgetFullDay: parseIntOrNull(d.budgetFullDay),
        dayBudgetHalfDay: parseIntOrNull(d.budgetHalfDay),
        dayTotalBudget: parseIntOrNull(d.totalBudget),
      };
    case 'per_week':
      return {
        weekNoOfWeek: parseIntOrNull(d.noOfWeek),
        weekDaysPerWeek: parseIntOrNull(d.daysPerWeek),
        weekBudgetPerWeek: parseIntOrNull(d.budgetPerWeek),
      };
    case 'per_month':
      return {
        monthNoOfMonth: parseIntOrNull(d.noOfMonth),
        monthDayPerMonth: parseIntOrNull(d.daysPerMonth),
        monthBudgetPerMonth: parseIntOrNull(d.budgetPerMonth),
      };
    case 'package':
      return {
        packageBudgetFullDay: parseIntOrNull(d.fullDay),
        packageBudgetHalfDay: parseIntOrNull(d.halfDay),
        packageTotalBudget: parseIntOrNull(d.totalBudget),
      };
    default:
      return {};
  }
};

export const updateTalentStatus = async (talentId: string, status: 'ACTIVE' | 'INACTIVE') => {
  const user = await prisma.user.findUnique({ where: { id: talentId } });
  if (!user || user.role !== 'TALENT') throw { statusCode: 404, message: 'Talent not found' };

  const updated = await prisma.user.update({
    where: { id: talentId },
    data: { status },
    select: { id: true, status: true },
  });

  return { id: updated.id, status: updated.status === 'ACTIVE' ? 'active' : 'inactive' };
};

export const toggleInternalCompany = async (companyId: string) => {
  const profile = await prisma.companyProfile.findUnique({ where: { userId: companyId } });
  if (!profile) throw { statusCode: 404, message: 'Company profile not found' };
  const updated = await prisma.companyProfile.update({
    where: { userId: companyId },
    data: { isInternalCompany: !profile.isInternalCompany },
  });
  return { userId: companyId, isInternalCompany: updated.isInternalCompany };
};

export const getAdminBlogs = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const [blogs, total] = await Promise.all([
    prisma.blog.findMany({
      skip,
      take: limit,
      orderBy: { blogDate: 'desc' },
    }),
    prisma.blog.count(),
  ]);

  const mapped = blogs.map((b) => ({
    id: Number(b.id),
    categoryId: b.categoryCategoryId ? Number(b.categoryCategoryId) : null,
    category: b.categoryCategoryId ? (CATEGORY_MAP[Number(b.categoryCategoryId)] || 'General') : 'General',
    title: b.blogTitle || '',
    description: b.blogDescription || '',
    date: b.blogDate || '',
    image: b.blogImage || '',
  }));

  return {
    blogs: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const createBlog = async (data: {
  title: string;
  description: string;
  image: string;
  date: string;
  categoryId: number | null;
}) => {
  const maxResult = await prisma.blog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  const nextId = maxResult ? Number(maxResult.id) + 1 : 1;

  const blog = await prisma.blog.create({
    data: {
      id: BigInt(nextId),
      blogTitle: data.title,
      blogDescription: data.description,
      blogImage: data.image,
      blogDate: data.date || new Date().toISOString(),
      categoryCategoryId: data.categoryId ? BigInt(data.categoryId) : null,
    },
  });

  return {
    id: Number(blog.id),
    categoryId: blog.categoryCategoryId ? Number(blog.categoryCategoryId) : null,
    category: blog.categoryCategoryId ? (CATEGORY_MAP[Number(blog.categoryCategoryId)] || 'General') : 'General',
    title: blog.blogTitle || '',
    description: blog.blogDescription || '',
    date: blog.blogDate || '',
    image: blog.blogImage || '',
  };
};

export const updateBlog = async (
  blogId: number,
  data: { title: string; description: string; image?: string; date: string; categoryId: number | null }
) => {
  const blog = await prisma.blog.update({
    where: { id: BigInt(blogId) },
    data: {
      blogTitle: data.title,
      blogDescription: data.description,
      ...(data.image && { blogImage: data.image }),
      blogDate: data.date,
      categoryCategoryId: data.categoryId ? BigInt(data.categoryId) : null,
    },
  });

  return {
    id: Number(blog.id),
    categoryId: blog.categoryCategoryId ? Number(blog.categoryCategoryId) : null,
    category: blog.categoryCategoryId ? (CATEGORY_MAP[Number(blog.categoryCategoryId)] || 'General') : 'General',
    title: blog.blogTitle || '',
    description: blog.blogDescription || '',
    date: blog.blogDate || '',
    image: blog.blogImage || '',
  };
};

export const deleteBlog = async (blogId: number) => {
  await prisma.blog.delete({ where: { id: BigInt(blogId) } });
  return { id: blogId };
};

export const uploadBlogImageService = async (file: Express.Multer.File) => {
  const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, 'blogs');
  return { url, message: 'Blog image uploaded successfully' };
};

export const uploadJobImageService = async (file: Express.Multer.File) => {
  const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, 'job_images');
  return { url, message: 'Job image uploaded successfully' };
};

const FILTER_OPTIONS_PATH = path.resolve(process.cwd(), '../frontend/public/static/filterOptions.json');
const R2_FILTER_URL = 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/static/filterOptions.json';

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

const getFilterOptionsData = async (): Promise<any> => {
  try {
    const raw = fs.readFileSync(FILTER_OPTIONS_PATH, 'utf-8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {}
  try {
    const res = await fetch(R2_FILTER_URL + '?t=' + Date.now());
    if (res.ok) return await res.json();
  } catch {}
  return null;
};

const syncLanguagesToFilterOptions = async () => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const data = await getFilterOptionsData();
      if (!data) { console.error('Cannot read filterOptions.json from any source'); return; }
      const languages = await prisma.language.findMany({ orderBy: { name: 'asc' } });
      data.languages = languages.map((l) => ({ id: l.id, name: l.name }));
      const json = JSON.stringify(data, null, 4);
      try { fs.writeFileSync(FILTER_OPTIONS_PATH, json, 'utf-8'); } catch {}
      await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: 'static/filterOptions.json',
        Body: json,
        ContentType: 'application/json',
      }));
      console.log('filterOptions.json synced');
    } catch (err) {
      console.error('Failed to sync filterOptions.json:', err);
    }
    syncTimeout = null;
  }, 2000);
};

export const getLanguages = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [languages, total] = await Promise.all([
    prisma.language.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.language.count(),
  ]);
  return {
    languages: languages.map((l) => ({ id: l.id, name: l.name })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const createLanguage = async (name: string) => {
  const language = await prisma.language.create({ data: { name } });
  await syncLanguagesToFilterOptions();
  return { id: language.id, name: language.name };
};

export const deleteLanguage = async (id: string) => {
  await prisma.language.delete({ where: { id } });
  await syncLanguagesToFilterOptions();
  return { id };
};

export const updateLanguage = async (id: string, name: string) => {
  const language = await prisma.language.update({ where: { id }, data: { name } });
  await syncLanguagesToFilterOptions();
  return { id: language.id, name: language.name };
};

const syncNationalitiesToFilterOptions = async () => {
  try {
    const data = await getFilterOptionsData();
    if (!data) return;
    const nationalities = await prisma.nationality.findMany({ orderBy: { name: 'asc' } });
    data.nationalities = nationalities.map((n) => ({ id: n.id, name: n.name }));
    const json = JSON.stringify(data, null, 4);
    try { fs.writeFileSync(FILTER_OPTIONS_PATH, json, 'utf-8'); } catch {}
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: 'static/filterOptions.json',
      Body: json,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('Failed to sync nationalities:', err);
  }
};

export const getNationalities = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [nationalities, total] = await Promise.all([
    prisma.nationality.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.nationality.count(),
  ]);
  return {
    nationalities: nationalities.map((n) => ({ id: n.id, name: n.name })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const createNationality = async (name: string) => {
  const nationality = await prisma.nationality.create({ data: { name } });
  await syncNationalitiesToFilterOptions();
  return { id: nationality.id, name: nationality.name };
};

export const updateNationality = async (id: string, name: string) => {
  const nationality = await prisma.nationality.update({ where: { id }, data: { name } });
  await syncNationalitiesToFilterOptions();
  return { id: nationality.id, name: nationality.name };
};

export const deleteNationality = async (id: string) => {
  await prisma.nationality.delete({ where: { id } });
  await syncNationalitiesToFilterOptions();
  return { id };
};

const syncEthnicitiesToFilterOptions = async () => {
  try {
    const data = await getFilterOptionsData();
    if (!data) return;
    const ethnicities = await prisma.ethnicity.findMany({ orderBy: { name: 'asc' } });
    data.ethnicities = ethnicities.map((e) => ({ id: e.id, name: e.name }));
    const json = JSON.stringify(data, null, 4);
    try { fs.writeFileSync(FILTER_OPTIONS_PATH, json, 'utf-8'); } catch {}
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: 'static/filterOptions.json',
      Body: json,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('Failed to sync ethnicities:', err);
  }
};

export const getEthnicities = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [ethnicities, total] = await Promise.all([
    prisma.ethnicity.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.ethnicity.count(),
  ]);
  return {
    ethnicities: ethnicities.map((e) => ({ id: e.id, name: e.name })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const createEthnicity = async (name: string) => {
  const ethnicity = await prisma.ethnicity.create({ data: { name } });
  await syncEthnicitiesToFilterOptions();
  return { id: ethnicity.id, name: ethnicity.name };
};

export const updateEthnicity = async (id: string, name: string) => {
  const ethnicity = await prisma.ethnicity.update({ where: { id }, data: { name } });
  await syncEthnicitiesToFilterOptions();
  return { id: ethnicity.id, name: ethnicity.name };
};

export const deleteEthnicity = async (id: string) => {
  await prisma.ethnicity.delete({ where: { id } });
  await syncEthnicitiesToFilterOptions();
  return { id };
};

const syncCategoriesToFilterOptions = async () => {
  try {
    const data = await getFilterOptionsData();
    if (!data) return;
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    data.categories = categories.map((c) => ({ id: c.id, name: c.name }));
    const json = JSON.stringify(data, null, 4);
    try { fs.writeFileSync(FILTER_OPTIONS_PATH, json, 'utf-8'); } catch {}
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: 'static/filterOptions.json',
      Body: json,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('Failed to sync categories:', err);
  }
};

export const getCategories = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [categories, total] = await Promise.all([
    prisma.category.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.category.count(),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const createCategory = async (name: string) => {
  const category = await prisma.category.create({ data: { name } });
  await syncCategoriesToFilterOptions();
  return { id: category.id, name: category.name };
};

export const updateCategory = async (id: string, name: string) => {
  const category = await prisma.category.update({ where: { id }, data: { name } });
  await syncCategoriesToFilterOptions();
  return { id: category.id, name: category.name };
};

export const deleteCategory = async (id: string) => {
  await prisma.category.delete({ where: { id } });
  await syncCategoriesToFilterOptions();
  return { id };
};

const syncCitiesToFilterOptions = async () => {
  try {
    const data = await getFilterOptionsData();
    if (!data) return;
    const [cities, countries] = await Promise.all([
      prisma.city.findMany({ orderBy: { name: 'asc' } }),
      prisma.country.findMany({ orderBy: { name: 'asc' } }),
    ]);
    data.cities = cities.map((c) => ({ id: c.id, name: c.name, countryId: c.countryId }));
    data.countries = countries.map((c) => ({ id: c.id, name: c.name }));
    const json = JSON.stringify(data, null, 4);
    try { fs.writeFileSync(FILTER_OPTIONS_PATH, json, 'utf-8'); } catch {}
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: 'static/filterOptions.json',
      Body: json,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('Failed to sync cities:', err);
  }
};

export const getCities = async (page: number, limit: number, countryId?: string) => {
  const skip = (page - 1) * limit;
  const where = countryId ? { countryId } : {};
  const [cities, total] = await Promise.all([
    prisma.city.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: { country: true } }),
    prisma.city.count({ where }),
  ]);
  return {
    cities: cities.map((c) => ({ id: c.id, name: c.name, countryId: c.countryId, country: c.country?.name || '' })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getAllCountries = async () => {
  const countries = await prisma.country.findMany({ orderBy: { name: 'asc' } });
  return countries.map((c) => ({ id: c.id, name: c.name }));
};

export const createCity = async (data: { name: string; countryId: string | null }) => {
  const city = await prisma.city.create({ data: { name: data.name, countryId: data.countryId } });
  await syncCitiesToFilterOptions();
  return { id: city.id, name: city.name, countryId: city.countryId };
};

export const updateCity = async (id: string, data: { name: string; countryId: string | null }) => {
  const city = await prisma.city.update({ where: { id }, data: { name: data.name, countryId: data.countryId } });
  await syncCitiesToFilterOptions();
  return { id: city.id, name: city.name, countryId: city.countryId };
};

export const deleteCity = async (id: string) => {
  await prisma.city.delete({ where: { id } });
  await syncCitiesToFilterOptions();
  return { id };
};

export const getCountries = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [countries, total] = await Promise.all([
    prisma.country.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.country.count(),
  ]);
  return {
    countries: countries.map((c) => ({ id: c.id, name: c.name })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const createCountry = async (name: string) => {
  const country = await prisma.country.create({ data: { name } });
  await syncCitiesToFilterOptions();
  return { id: country.id, name: country.name };
};

export const updateCountry = async (id: string, name: string) => {
  const country = await prisma.country.update({ where: { id }, data: { name } });
  await syncCitiesToFilterOptions();
  return { id: country.id, name: country.name };
};

export const deleteCountry = async (id: string) => {
  await prisma.country.delete({ where: { id } });
  await syncCitiesToFilterOptions();
  return { id };
};

const DEFAULT_TEMPLATES = [
  {
    templateKey: 'verify_email',
    subject: 'Verify your email address',
    description: 'Sent to new users for email verification. Available variables: {{name}}, {{verifyUrl}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Welcome, {{name}}!</h2><p>Please verify your email by clicking the link below:</p><a href="{{verifyUrl}}" style="display:inline-block;padding:12px 24px;background:#3835A4;color:#fff;text-decoration:none;border-radius:6px">Verify Email</a><p>If you didn't request this, ignore this email.</p></body></html>`,
  },
  {
    templateKey: 'otp_email',
    subject: 'Password Reset OTP',
    description: 'Sent for password reset. Variables: {{name}}, {{otp}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Hi {{name}}!</h2><p>Your OTP for password reset is:</p><h1 style="letter-spacing:8px;font-size:32px;color:#C6007E">{{otp}}</h1><p>This OTP expires in 10 minutes.</p></body></html>`,
  },
  {
    templateKey: 'welcome_talent',
    subject: 'Welcome to Yoocasta!',
    description: 'Sent after talent registration. Variables: {{name}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Welcome, {{name}}!</h2><p>Thank you for joining Yoocasta. Complete your profile to start applying for roles.</p><a href="{{loginUrl}}" style="display:inline-block;padding:12px 24px;background:#C6007E;color:#fff;text-decoration:none;border-radius:6px">Get Started</a></body></html>`,
  },
  {
    templateKey: 'welcome_recruiter',
    subject: 'Welcome to Yoocasta – Recruiter Account',
    description: 'Sent after recruiter registration. Variables: {{name}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Welcome, {{name}}!</h2><p>Your recruiter account is pending verification. You will be notified once verified.</p><a href="{{loginUrl}}" style="display:inline-block;padding:12px 24px;background:#C6007E;color:#fff;text-decoration:none;border-radius:6px">Login</a></body></html>`,
  },
  {
    templateKey: 'recruiter_verified',
    subject: 'Your Company Account Has Been Verified',
    description: 'Sent when admin verifies a recruiter. Variables: {{companyName}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Congratulations, {{companyName}}!</h2><p>Your company account has been verified. You can now post jobs and find talent.</p></body></html>`,
  },
  {
    templateKey: 'job_under_review',
    subject: 'Your Job Posting Is Under Review',
    description: 'Sent when a job is submitted for review. Variables: {{name}}, {{jobTitle}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Hi {{name}}!</h2><p>Your job <strong>{{jobTitle}}</strong> has been submitted and is under review.</p><p>You will be notified once it is approved.</p></body></html>`,
  },
  {
    templateKey: 'job_approved',
    subject: 'Your Job Has Been Approved',
    description: 'Sent when a job is approved by admin. Variables: {{name}}, {{jobTitle}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Great news, {{name}}!</h2><p>Your job <strong>{{jobTitle}}</strong> has been approved and is now live.</p></body></html>`,
  },
  {
    templateKey: 'job_rejected',
    subject: 'Your Job Posting Status',
    description: 'Sent when a job is rejected by admin. Variables: {{name}}, {{jobTitle}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Hi {{name}}!</h2><p>Your job <strong>{{jobTitle}}</strong> was not approved. Please review and resubmit.</p></body></html>`,
  },
  {
    templateKey: 'application_confirmation',
    subject: 'Application Submitted Successfully',
    description: 'Sent to talent after applying. Variables: {{name}}, {{jobTitle}}, {{roleTitle}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Hi {{name}}!</h2><p>Your application for <strong>{{roleTitle}}</strong> at <strong>{{jobTitle}}</strong> has been submitted.</p><p>We wish you the best of luck!</p></body></html>`,
  },
  {
    templateKey: 'new_application_notification',
    subject: 'New Application Received',
    description: 'Sent to company when someone applies. Variables: {{companyName}}, {{talentName}}, {{jobTitle}}, {{roleTitle}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Hi {{companyName}}!</h2><p><strong>{{talentName}}</strong> has applied for <strong>{{roleTitle}}</strong> on <strong>{{jobTitle}}</strong>.</p><a href="{{dashboardUrl}}" style="display:inline-block;padding:12px 24px;background:#3835A4;color:#fff;text-decoration:none;border-radius:6px">View Application</a></body></html>`,
  },
  {
    templateKey: 'admin_new_talent',
    subject: 'New Talent Registration',
    description: 'Admin notification when a talent registers. Variables: {{name}}, {{email}}, {{phone}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>New Talent Registration</h2><p><strong>{{name}}</strong> ({{email}}, {{phone}}) has registered.</p></body></html>`,
  },
  {
    templateKey: 'admin_new_recruiter',
    subject: 'New Recruiter Registration',
    description: 'Admin notification when a recruiter registers. Variables: {{recruiterName}}, {{companyName}}, {{recruiterEmail}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>New Recruiter Registration</h2><p><strong>{{recruiterName}}</strong> from <strong>{{companyName}}</strong> ({{recruiterEmail}}) has registered.</p></body></html>`,
  },
  {
    templateKey: 'admin_new_job',
    subject: 'New Job Posted for Review',
    description: 'Admin notification when a job is posted. Variables: {{companyName}}, {{jobTitle}}, {{jobId}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>New Job Posted</h2><p><strong>{{companyName}}</strong> posted <strong>{{jobTitle}}</strong>.</p><a href="{{reviewUrl}}" style="display:inline-block;padding:12px 24px;background:#3835A4;color:#fff;text-decoration:none;border-radius:6px">Review Job</a></body></html>`,
  },
  {
    templateKey: 'talent_invitation',
    subject: 'You Have Been Invited to Apply',
    description: 'Sent to talent when a recruiter invites them. Variables: {{companyName}}, {{jobTitle}}, {{inviteUrl}}',
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>You're Invited!</h2><p><strong>{{companyName}}</strong> has invited you to apply for <strong>{{jobTitle}}</strong>.</p><a href="{{inviteUrl}}" style="display:inline-block;padding:12px 24px;background:#C6007E;color:#fff;text-decoration:none;border-radius:6px">View Job & Apply</a></body></html>`,
  },
];

const ensureEmailTemplates = async () => {
  const count = await prisma.emailTemplate.count();
  if (count > 0) return;
  for (const tpl of DEFAULT_TEMPLATES) {
    await prisma.emailTemplate.create({ data: tpl }).catch(() => {});
  }
};

export const getEmailTemplates = async () => {
  await ensureEmailTemplates();
  return prisma.emailTemplate.findMany({ orderBy: { templateKey: 'asc' } });
};

export const getEmailTemplateByKey = async (key: string) => {
  await ensureEmailTemplates();
  const tpl = await prisma.emailTemplate.findUnique({ where: { templateKey: key } });
  if (!tpl) throw { statusCode: 404, message: 'Template not found' };
  return tpl;
};

export const updateEmailTemplate = async (key: string, data: { subject: string; body: string }) => {
  await ensureEmailTemplates();
  const tpl = await prisma.emailTemplate.update({
    where: { templateKey: key },
    data: { subject: data.subject, body: data.body },
  });
  return tpl;
};

export const getCmsPages = async () => {
  await ensureCmsPages();
  return prisma.cmsPage.findMany({ orderBy: { pageKey: 'asc' } });
};

export const getCmsPageByKey = async (key: string) => {
  const page = await prisma.cmsPage.findUnique({ where: { pageKey: key } });
  if (!page) throw { statusCode: 404, message: 'Page not found' };
  return page;
};

const cleanCmsHtml = (html: string) =>
  html.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ');

const cleanCmsText = (text: string) => (text || '').replace(/\u00a0/g, ' ');

const DEFAULT_TALENT_FAQS = [
  { q: 'What is Yoocasta?', a: 'Yoocasta is Your Own Online Casting Agency which acts as a platform to connect you with various production houses or event companies or casting professionals by applying to the opportunities posted by them with its Best Feature - Next Day Payment!' },
  { q: 'Why should I register with Yoocasta?', a: 'Yoocasta offers a very interesting and attractive feature of next working day payment. With Yoocasta\'s "Premium Plus Membership" you can collect your payment up to AED 5000 (per project) on the next working day. We help you to avoid multiple follow ups and the struggle to get your hard-earned money.' },
  { q: 'How do I start working with Yoocasta.com as a talent?', a: 'It\'s very simple:\n\n1. Sign up with Yoocasta with a valid email ID which will be used for all communications henceforth.\n2. Click on the verification link sent to the registered ID.\n3. Complete your profile.\n4. Enter all the details to the best accuracy.\n5. Upload the best headshots which shows your Facial features clearly (Avoid selfies & pics with Sunglasses or hats) and you are set to apply for all the opportunities and be the Next Star in the Making!' },
  { q: 'How to have success on Yoocasta.com?', a: '1. Signing up to Yoocasta is just one step to beginning your journey towards success with us. As a self-promotion website, it is crucial to make yourself visible and appealing to the client.\n\n2. Detailed description and any special skills you have! Your description should include an overview of you as a person and your interests. Mention your special skills as this will make it easier for you to get noticed. Do you do yoga? Swimming? Acrobats? Sky Diving? Dance? Beatbox? Include them!\n\n3. Experience (if any) — let us know about your previous experiences as this will be a plus point.\n\n4. Courses (if any) — always good to mention your courses.\n\n5. Images — keep them clean! Upload pictures that show your work or characters. Avoid group pictures, avoid revealing photos.\n\n6. Apply to the Jobs! If you see a job that matches your requirement, just Apply!' },
  { q: 'How to Upload Headshots?', a: 'Tips For a good headshot:\n- Make sure Pictures are with high quality resolution\n- Make sure picture should have clear facial features (Avoid sunglasses and hats)\n\nDon\'ts:\n- Don\'t upload selfies.\n- Don\'t upload blurred, edited or photos with other people.\n- Don\'t upload photos in low resolution.\n- Don\'t upload images of other people.\n- No nudity should be in the photo.\n\nDo\'s:\n- Upload clear and recent photos on a plain background.\n- Upload photos in great lighting (natural light works best)\n- Upload photos from different angles and both full body and half shots.\n- Upload Pictures showing your personality or various characters.' },
  { q: 'Managing Photos', a: 'You can always delete and replace photos with new photos, which is essentially important if you change your style, beard, hair color or other alterations. Keep your profile up to date always as you never know someone might be viewing your profile!' },
  { q: 'How to add/manage your Videos?', a: 'Having a video on your profile is hugely beneficial. It gives the Casting Directors a chance to get to know you a little more.\n\nDon\'ts:\n- Don\'t upload a video that you are not visible in.\n- Don\'t share offensive or inappropriate content.\n- Don\'t upload bad quality video.\n\nDo\'s:\n- Do include a general casting video of yourself.\n- Do make sure you tell us about yourself and your interests.\n- Do show off your personality.\n\nAdding Your Videos:\n1. Upload the video to YouTube.com or Vimeo.com\n2. Copy the link into the provided box and click "Add Video" and give a suitable title.' },
  { q: 'How and what audios to upload?', a: 'Got an awesome voice? Want to share it with the world?\n\n1. Be sure that your audio is in either mp3 or wav format and no bigger than 1mb.\n2. From your Dashboard, select Add Video/Audios and under Audio, click "Choose File" and select the audio file you wish to upload.' },
  { q: 'Is it important to add course/experience details?', a: 'Yes, adding experience and course details adds value to your profile and increases your chance of selection for any project. Letting clients know about your experience is always good.' },
  { q: 'What is Premium Plus Membership?', a: 'We understand the struggle and pain of continuous follow ups and delays in the payment from the client. With Premium Plus membership you can collect your payment up to AED 5000 the next working day after your shoot.\n\nBenefits:\n1. Apply for unlimited roles\n2. Profile pushed to the front of the database\n3. Showcased above Premium & Basic members\n4. Upload up to 30 Photos\n5. 30 Videos\n6. 30 Voice Clips\n7. Know the number of views of your profile' },
  { q: 'What is a Premium Membership?', a: 'Our Premium Membership includes benefits same as that of Premium Plus except that the payment shall be paid when the client pays us.\n\nBenefits:\n1. Apply for unlimited roles\n2. Profile pushed to the front of the database\n3. Showcased above basic members\n4. Upload up to 30 Photos\n5. 30 Videos\n6. 30 Voice Clips\n7. Know the number of views of your profile' },
  { q: 'How many memberships can I have?', a: 'Any talent by default will have one basic membership and maximum of two paid memberships of which the last upgraded membership will be active and the second paid membership will be on hold. On hold membership will become active on expiry of the ongoing membership. Talent cannot downgrade to a lower paid/duration membership. Any upgraded membership will be effective from the next calendar day.' },
  { q: 'Can I Cancel my subscription/membership package?', a: 'Yes, you can cancel your individual plan from membership plans page. Once the subscription or the membership is cancelled it cannot be revoked.' },
  { q: 'Is there any refund on cancellation of membership/subscription?', a: 'Sorry, there is No refund of membership / payment in any case. Final decision shall be made by Yoocasta management.' },
  { q: 'Can I see which other talents have been shortlisted for the jobs I have applied for?', a: 'Yes, on "My Applications" page, for a particular role which you have applied for click on the green icon next to the status.' },
  { q: 'How to Apply to the Jobs?', a: '1. Apply through the emails you receive by clicking on the links.\n2. Apply directly on the website. Click on the job and once the job details page opens, you can apply.\n3. Click on "Apply Now" on the Job box.\n\nRemember, you cannot apply for jobs by responding to the emails, you must apply directly on the platform.' },
  { q: 'So, You Have Applied for the Role, Now What?', a: 'After applying for a job wait for a notification email from Yoocasta. If you get shortlisted or selected you shall receive an email and one of us from Yoocasta team will get in touch with you. If you DO NOT get contacted within 24 hours, please connect with us on +971582224178 or send us an email at support@yoocasta.com.' },
  { q: 'Why am I unable to apply for the jobs?', a: 'Please check your membership package. The number of jobs that you can apply to is based on your membership plan. Still if you have any problems please connect with us on 00971582224178 or send us an email at support@yoocasta.com.' },
  { q: 'How do I reset my Password?', a: 'Lost or Forgot your Password? On the Login page of Yoocasta click on Reset password. Enter your Email address and you shall receive the link on your email address to reset your password.' },
  { q: 'How do I change my password?', a: 'On the left menu on the dashboard, you have an option "Change password". Click on it and you can now change the password.' },
  { q: 'What should I do if I have Payment Problems?', a: 'Trying to upgrade but the payment is not going through? Please connect with us on +971582224178 or send us an email at support@yoocasta.com.' },
];

const DEFAULT_COMPANY_FAQS = [
  { q: 'Why am I not able to post a job without verification?', a: 'As a company protocol it takes us a few minutes to verify the account details. Once verified you will be able to post the job.' },
  { q: 'Can I Mark Talents for my future projects?', a: 'Yes, you can use our Cast Bag features to mark talents for your future projects.\n\n1. Simply create a Cast Bag, give it a name.\n2. Select the talents for the project and add them to the Cast Bag by a single click.\n3. Alternatively select multiple talents from Talent Pool and click on add to Cast Bag.\n\nGood News! You can share this folder with any of your friends and clients.' },
  { q: 'What is a Cast Bag?', a: 'Cast Bag is a feature that acts like folders where you/company user can select some talents and store their profiles for future references. A company can have multiple Cast Bags. These Cast Bags can be shared over emails with a validity period.' },
  { q: 'Is there any fee per posting a job?', a: 'Absolutely Not! Posting a job is absolutely free.' },
  { q: 'I have confirmed/selected the talents. What Next?', a: 'Great News! Someone from Yoocasta team shall get in touch with you to proceed further with the project. Alternatively, please feel free to call us on 971582224178 or send us an email at support@yoocasta.com.' },
];

const DEFAULT_VIDEO_SECTION = [
  {
    id: '1',
    title: 'Cyber Couture Editorial Walk',
    talentName: 'Amira Al-Mansoori',
    category: 'High Fashion Runway',
    location: 'Dubai Design District',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10005.mp4',
    posterUrl: '',
    views: '12.4K views',
    tags: ['Aesthetic Walk', 'Silver Metallic', 'Elite Model']
  },
  {
    id: '2',
    title: 'Neo-Glow Audition Reel',
    talentName: 'Zayd Al-Hassan',
    category: 'Commercial Screen Play',
    location: 'Riyadh Studio',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10158.mp4',
    posterUrl: '',
    views: '8.9K views',
    tags: ['Neon Cinematic', 'GCC Commercial', 'Acting Lead']
  },
  {
    id: '3',
    title: 'Golden Hour Beauty Portfolio',
    talentName: 'Elena Rostova',
    category: 'Editorial Portrait Reel',
    location: 'Jumeirah Beach Coast',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10107.mp4',
    posterUrl: '',
    views: '15.2K views',
    tags: ['Gloss Gold', 'Luxury Cosmetics', 'Face Model']
  },
  {
    id: '4',
    title: 'Vanguard Motion Showreel',
    talentName: 'Malik Al-Sayed',
    category: 'Cinematic Movement Reel',
    location: 'Downtown Dubai',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_11145.mp4',
    posterUrl: '',
    views: '18.7K views',
    tags: ['Vanguard Look', 'Urban Luxury', 'Commercial Pro']
  }
];

const DEFAULT_TESTIMONIALS_SECTION = [
  {
    id: 'test1',
    name: 'Baraa Rahmy',
    role: 'Fashion Model & Actor',
    image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=300',
    rating: 5,
    quote: 'Yoocasta is hands down the absolute best! The projects I have been casted for are legendary, professional, and helped me secure my residency visa in Dubai. Extremely supportive team.',
    verified: true,
    project: 'Emaar Properties Promo',
  },
  {
    id: 'test2',
    name: 'Elnura Abdykasymova',
    role: 'Commercial Model',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
    rating: 5,
    quote: 'The booking process was incredibly clear and honest. I booked the L\'Oréal hair commercial within my second week of registering! They pay exactly on time which is so rare in this industry.',
    verified: true,
    project: 'L\'Oréal Hair Commercial',
  },
  {
    id: 'test3',
    name: 'Evelina Alvarado',
    role: 'Hostess & Promoter',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=300',
    rating: 5,
    quote: 'Being a premium member is so worth it. The priority application and premium casting alerts gave me 3 high-paid hosting jobs at Dubai World Trade Center this quarter alone!',
    verified: true,
    project: 'DWTC Luxury Expo 2026',
  },
];

const DEFAULT_FAQ_SECTION = [
  {
    question: 'How do I submit my application for Casting Opportunities?',
    answer: 'Browse open casting calls on our dashboard, click on the card to see the full brief and rates, and click "Submit Application". Enter your registered email or profile link, upload a quick customized video or comment, and the casting team will instantly receive your comp card.',
  },
  {
    question: 'What is a Yoocasta Premium Membership and is it required?',
    answer: 'While basic profiles are free to create, our Premium Membership gives talents unlimited casting applications, priority visibility on director searches, a custom URL, and instant WhatsApp alerts for exclusive VIP campaigns. Standard premium is AED 20 per month.',
  },
  {
    question: 'How long does a booking confirmation take in the Middle East?',
    answer: 'Most commercial shoots and corporate events have short-turnarounds. After the casting team submits the shortlisted comp cards, brands usually finalize selection within 3 to 7 working days. If selected, our booking managers will contact you immediately via phone and WhatsApp.',
  },
  {
    question: 'I am a Brand or Director. How do I hire from Yoocasta?',
    answer: 'You can instantly publish a custom casting call by clicking "Post a Casting" on our header. Alternatively, reach out directly to management to access our advanced offline catalog and arrange private auditions at our Sharjah and Dubai partners.',
  },
];

const DEFAULT_CMS_PAGES = [
  {
    pageKey: 'home',
    metaTitle: 'Yoocasta | Your Own Online Casting Agency',
    metaDescription: 'Yoocasta connects talents with casting directors, producers and industry professionals. Register or login to apply to unlimited casting jobs across film, TV & events.',
    pageHeading: 'AED 20 ONLY',
    subHeading: 'Apply to unlimited jobs at',
    pageDescription: 'Register or Login to become Premium!',
    address: '',
    phone: '',
    email: '',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10107.mp4',
    bottomHeading: 'Connecting Talents & Opportunities',
    bottomDescription: 'Your own online casting agency',
    videoSection: JSON.stringify(DEFAULT_VIDEO_SECTION),
    testimonialsSection: JSON.stringify(DEFAULT_TESTIMONIALS_SECTION),
    faqSection: JSON.stringify(DEFAULT_FAQ_SECTION),
    body: '',
  },
  {
    pageKey: 'blogs',
    metaTitle: 'Blogs & Insights | Yoocasta',
    metaDescription: 'Browse our portfolio of casting projects, talent spotlights, and industry insights from the Yoocasta team.',
    pageHeading: 'Our Work',
    subHeading: '',
    pageDescription: 'Browse our portfolio of casting projects, talent spotlights, and industry insights from the Yoocasta team.',
    address: '',
    phone: '',
    email: '',
    videoUrl: '',
    body: '',
  },
  {
    pageKey: 'browse-jobs',
    metaTitle: 'Casting & Jobs | Yoocasta',
    metaDescription: 'Explore casting calls across film, TV & events and find the perfect role. Browse open casting jobs on Yoocasta.',
    pageHeading: 'Casting & Jobs',
    subHeading: 'Explore casting calls across film, TV & events',
    pageDescription: 'Find & apply to the perfect role in minutes',
    address: '',
    phone: '',
    email: '',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10107.mp4',
    body: '',
  },
  {
    pageKey: 'browse-talents',
    metaTitle: 'Talent Pool | Yoocasta',
    metaDescription: 'Discover the region\'s finest acting, modeling & creative talent. Search, filter & shortlist the perfect fit on Yoocasta.',
    pageHeading: 'Talent Pool',
    subHeading: 'Discover the region\'s finest acting, modeling & creative talent',
    pageDescription: 'Search, filter & shortlist the perfect fit in minutes',
    address: '',
    phone: '',
    email: '',
    videoUrl: 'https://pub-9a6daccdd56649a4bb690162026e4c5d.r2.dev/casting_video/casting_video_10107.mp4',
    body: '',
  },
  {
    pageKey: 'about',
    metaTitle: 'About Us | Yoocasta',
    metaDescription: 'Yoocasta is your own online casting agency connecting talents with casting directors, producers, photographers and industry professionals.',
    pageHeading: 'About Us',
    subHeading: 'Your Own Online CASTing Agency',
    pageDescription: '',
    address: '',
    phone: '',
    email: '',
    body: `<p><strong style="color:#3835A4">Yoocasta</strong>, Your Own Online CASTing Agency, is a modern style talent agency! A Talent platform that connects you, the talented, beautiful, inspiring and aspiring individuals that you are, with Casting Directors, Producers, Directors, Photographers or other industry professionals.</p><p>Yoocasta aims to help the media professionals get what they deserve in every aspect. We aim to provide the best castings &amp; job opportunities to all our talents with a good monitory reward that they deserve.</p><p>With an ever-increasing database of talents and the job opportunities in the Region, we aim to place our talents (Experienced or Freshers) in commercial work in India, UAE and MENA every year and make it easy to enter the industry of Acting, modelling, Events or other entertainment related work.</p><p>New to acting / modeling or your field of interest? Nothing to worry, we provide ample of opportunities for you to get kick start with the Journey.</p><p>Yoocasta is your own online platform, which gives you, the talent, all the control! You decide what you put on your profile and which impression you want to leave on a casting professional. You choose which opportunities to pursue and which to decline, and most importantly, you get the payment you deserve on the <strong style="color:#C6007E">NEXT WORKING DAY</strong>.</p><p>Fresher or Experienced, Yoocasta provides you the opportunities to learn and work! Self-grooming, learning at every moment every day, is a key to success. There are No shortcuts and you need to start from somewhere. And here we are for you to start with. All there is left to do is, sign up and put that passion to work!</p>`,
  },
  {
    pageKey: 'subscription-plans',
    metaTitle: 'Subscription Plans | Yoocasta',
    metaDescription: 'Pick the plan that fits your career goals. Upgrade anytime to unlock more features on Yoocasta.',
    pageHeading: 'Choose Your Plan',
    subHeading: 'Pick the plan that fits your career goals. Upgrade anytime to unlock more features.',
    pageDescription: '',
    address: '',
    phone: '',
    email: '',
    body: '',
  },
  {
    pageKey: 'contact-us',
    metaTitle: 'Contact Us | Yoocasta',
    metaDescription: 'Get in touch with the Yoocasta team for any questions about our platform, memberships, or casting services.',
    pageHeading: 'Contact Us',
    subHeading: 'Get in touch with us. We\'d love to hear from you.',
    pageDescription: '',
    address: 'Yoocasta FZE LLC\nSharjah Publishing City, UAE',
    phone: '+971582224178 | 048848938',
    email: 'casting@yoocasta.com\nmanagement@yoocasta.com',
    body: '',
  },
  {
    pageKey: 'terms-of-service',
    metaTitle: 'Terms of Service | Yoocasta',
    metaDescription: 'Please read these terms carefully before using our platform.',
    pageHeading: 'Terms of Service',
    subHeading: 'Please read these terms carefully before using our platform.',
    pageDescription: '',
    address: '',
    phone: '',
    email: '',
    body: `<h3>EFFECTIVE AS OF 10th Jan 2019</h3><h3>OVERVIEW</h3><p>These Terms of Use (Terms) govern the use of our website located at www.yoocasta.com (website) and any subdomain of this URL in platform and the services available thereon and constitute a legally binding agreement between Yoocasta FZE LLC (the "Company") and the user.</p><p>By accessing our website or using any of the services or applications provided on our Website "Services", user agrees to be bound by these Terms of Use. If user does not agree with these Terms, use and access to our Website and services must be stopped immediately.</p><h3>ACCEPTANCE OF TERMS OF USE</h3><p>By using www.yoocasta.com user acknowledge and understand that www.yoocasta.com is an online talent casting platform that connects the emerging talent with the industry professionals. Industry Professionals i.e. Companies or freelancers share their talent requirements either posting directly on Yoocasta or through the administrator of the platform and in response to that requirement Yoocasta provide them with the best matching talent out of its talent pool. The Talent categories include actors, singers, dancers, models, models, photographers, Directors, makeup professionals, promoters and other. The user further acknowledges that before using, visiting, registering and/or otherwise accessing www.yoocasta.com he/she have read the Terms of Use and hereby affirm that:</p><ul><li>User is fully able and competent to enter the terms, conditions, obligations, affirmations, representations, and warranties set forth in these Terms of Use, and to abide by and comply with these Terms of Use,</li><li>User is not a person barred from receiving services under the laws of UAE.</li><li>In case of use of the Platform or creating an Account on behalf of a business, you have the authority to bind that business.</li></ul><h3>SCOPE</h3><p>This document contains provisions that define the limits, legal rights and obligations of www.yoocasta.com and the user with respect to use of our website and services including the content that has been uploaded, communications, functions and internet links.</p><h3>TYPES OF USERS</h3><ul><li>This apply to all the visitors browsing www.yoocasta.com or using our services by becoming a member, either individuals for their own use and those using it on behalf of an entity.</li><li>1. Emerging talent, looking for the casting roles/jobs, and</li><li>2. Industry professionals i.e. organizations, agencies, institutions, or freelancers looking for the talent for different roles and jobs.</li><li>Note: Yoocata will not trade with or provide any services to OFAC and countries sanctioned by UAE Government.</li></ul><h3>JOB POSTING CRITERIA</h3><ul><li>All the Industry professionals i.e. organizations, agencies, institutions, or freelancers looking for the talent for different roles and jobs while posting jobs on Yoocasta undertake that the:</li><li>1. Posted is valid and not breach any applicable law and government regulations.</li><li>2. Will abide by the editorial guidelines of Yoocasta while listing/posting jobs.</li><li>3. The job posting must specify that the job/role offered is Paid or Unpaid work. In case the work is paid the rate of payment should also be clearly specified.</li></ul><h3>USER ACCOUNT</h3><p>In order to use our Services, user must at first create an account ("profile") and provide us with accurate, complete and updated information to complete their profile. The treatment of the data/information shared will be subject to the terms of Privacy Policy of www.yoocasta.com wherever applicable.</p><h3>MEMBERSHIP PLANS &amp; KEY FEATURES</h3><p>www.yoocasta.com operates a paid basic &amp; Premium, which falls under recurring billing with the following key features:</p><p><strong>BASIC MEMBERSHIP</strong></p><p>Basic membership is a free of charge service which allows the member to upload up to 5 photos, 1 video, 1 audio and 2 jobs apply (per month). It enables the member to receive the casting updates, payment in case of getting and performing a job through the platform as soon as the payment is released from the industry professional who casted the talent for the role/job and www.yoocasta.com receive the payment, job notifications, profile views and position/appearance in the database after the premium and premiumplus members.</p><p><strong>PREMIUM MEMBERSHIP</strong></p><p>Premium membership is a paid service provided against the charges given on www.yoocasta.com and updated from time to time for a specific time period. Premium membership allows the member to upload up to 30 photos, 30 videos, 30 audios, and apply for unlimited jobs during the premium membership period. It enables the member to receive casting updates, payment in case of getting and performing a job through the platform (as soon as the payment is released from the industry professional who casted the talent for the role/job and www.yoocasta.com receives the payment), job notifications, profile views, and position/appearance in the database before basic members (middle).</p><p>Premium membership is set to auto-renew on the day of package expiry, ensuring uninterrupted access to premium features unless canceled by the member before the renewal date.</p><p><strong>UPGRADING MEMBERSHIP</strong></p><p>A talent, at any point of time can have maximum of 1 Paid active membership/packages offered by www.yoocasta.com.</p><p>Any user holding the basic membership shall be eligible for upgrading the membership anytime.</p><p>In case a talent purchases 2nd Paid Membership on top of the 1st Paid membership, the 1st membership shall go on Hold until the expiry of the 2nd (latest) membership and shall be reactivated automatically on the expiry of 2nd membership.</p><p>The 2nd (latest) membership purchased will be the active and counted first. On expiry of the latest, the subsequent package (if any) will become active. The last active / expired membership shall be auto renewed automatically.</p><p>However, payment to any user for any role/job done shall be made as per the terms of membership plan the user possessed at the time of that job not as per the terms of payment of upgraded membership.</p><h3>USER UPLOADED CONTENT</h3><p>User understands and agrees that all their information/data of any kind and in form ("Content") that the user is uploading on our platform they are authorised to share with us i.e. they have proprietary rights over it or they have license to use without any restriction.</p><p>User undertakes that the content does not contain any harmful or destructive content, the Content is not pornographic, does not contain threats or incite violence, and does not violate the privacy or publicity rights of any third party or any of the laws of UAE. User further agrees and understand that www.yoocasta.com reserves the right to take down immediately all the content from the platform found in breach of these terms and any of UAE Laws.</p><h3>USER'S LICENCE TO US</h3><p>The user agrees and understands that www.yoocasta.com shall have the non-exclusive, irrevocable, royalty-free rights and license to use, host, reproduce, modify, communicate, publish, publicly display on www.yoocasta.com or related social media accounts, publicly perform and distribute the User Content for the limited purposes only.</p><h3>SUBSCRIPTION FEE &amp; TERMS OF PAYMENT</h3><ul><li>www.yoocasta.com contains content including but not limited to text, graphics, photographs, images, news reports, articles, editorial and other writings, audio and video recordings, data, listings, and directory information (collectively, "Content") that is accessible by Users. However, it also offers premium services, which can be accessed only through purchase or paid subscription i.e. for 3 months, 6 months and 12 months subscription.</li><li>Reserves the right to increase the membership fee at any time as per its sole discretion.</li><li>The duration of subscription period needs be selected by the user while subscribing.</li><li>The payment for the subscription shall be charged in advance.</li><li>The means of payment for the subscription shall be _______________, and payment shall be charged as per the duration/plan selected.</li><li>The subscription shall be automatically renewed unless you opt out or cancel by following the instructions in these Terms of Use.</li><li>www.yoocasta.com may, in its sole discretion, suspend access to your account or deactivate your account without notice to you if the Company is unable to process your payment.</li><li>You may update any of your billing information (including a change to your desired billing payment method).</li><li>All fees paid in connection with your account are non-refundable and non-transferable.</li><li>"United Arab of Emirates is our country of domicile" and stipulate that the governing law is the local law.</li><li>Visa and Master Card and all currencies will be accepted for payment converted in AED.</li><li>We will not trade with or provide any services to OFAC and sanctioned countries.</li><li>Customer using the website who are Minor /under the age of 18 shall not register as a User of the website and shall not transact on or use the website.</li><li>Cardholder must retain a copy of transaction records and Merchant policies and rules.</li><li>User is responsible for maintaining the confidentiality of his account.</li></ul><h3>MODIFICATION OF TERMS OF USE</h3><p>We reserve the right to change these Terms of Use at any time as per our sole discretion. If www.yoocasta.com makes a material change to these Terms of Use, an update will be posted in this regard on the website for a reasonable period and will indicate the effective date of the changes.</p><p>It is your responsibility to review these Terms of Use for any changes, having notified the changes, your constant use of website and services will constitute your acceptance of the changed terms. This Agreement applies to all persons and entities who visit any of Websites and/or use or access any of the services.</p><h3>PROPRIETARY RIGHTS ON INTELLECTUAL PROPERTY</h3><p>www.yoocasta.com owns, operates, licenses, controls, and provides access to the Website.</p><p>www.yoocasta.com has all the proprietary rights over all the associated materials, applications, software, and other contents of the Website available under the relevant laws unless otherwise notified. All trademarks, logos, service marks, trade names displayed on www.yoocasta.com are proprietary to Yoocasta FZE LLC unless otherwise noted and are protected by applicable intellectual property and other laws.</p><p>The use any of the proprietary work in any manner, except pursuant to the express limited grant of rights hereunder, is strictly prohibited. Subject to compliance of these Terms of Use, www.yoocasta.com grants user the non-exclusive and revocable license to create profile, upload or submit information, software, text, images, audio, video, and other materials, make changes or delete it, except to delete or change any Intellectual Property proprietary notices contained therein.</p><h3>THIRD PARTY CONTENT AND LINKED SITES</h3><p>www.yoocasta.com may contain links to other websites ("Third Party Services") or use third party service providers for provision of certain services to you in connection with your membership and may disclose personally identifiable information to the third party in case of providing the services you requested.</p><h3>DISRUPTION IN SITE ACCESS</h3><p>We are committed to provide continued and quality services, However, there might be circumstances when access to our website may be interrupted, restricted or delayed, which we will endeavour to resolve as soon as possible. In no case we will be liable for damages or costs for such interruption, restriction and delays.</p><h3>CUSTOMIZED EMAILS</h3><p>As a result of registration and membership with www.yoocasta.com you will receive casting calls, update emails matching your profile, our email newsletters, account updates and information about www.yoocasta.com features.</p><h3>DISCLAIMER</h3><p>www.yoocasta.com disclaims all warranties of any kind either expressed or implied, including any warranties of merchantability, non-infringement and fitness for a particular purpose i.e. validity and accuracy of the user content and any loss or damage resulted from acting upon that content/data.</p><h3>RESTRICTION OF LIABILITY</h3><ul><li>www.yoocasta.com will not be liable for any damages or injury caused by any use of our Website or services i.e. resulting from User Uploaded Information, use of, inability to use, or performance of the Website or any of the contents or features thereon, any action taken in connection with an investigation by www.yoocasta.com or law enforcement authorities regarding your use of the Website or the contents thereof, any action taken by or in connection with copyright owners.</li><li>www.yoocasta.com will not be liable for any discrepancy in description of any casting role/job posted on its website, neither www.yoocasta.com will be responsible for the for any act or omission on behalf of the referred talent to the industry professionals in the execution of the job/performance.</li><li>In case any employer and employee relationship take place between the users of the website, it is for the parties to do the mutual due diligence and adhere the all the relevant laws and www.yoocasta.com will not share any responsibility for any loss or injury resulting to anyone out of such engagement.</li><li>www.yoocasta.com will not be responsible for any loss caused to the third party as a result of any act or omission of the talent and industry professionals in the execution/performance of the role/job posted on the platform.</li><li>www.yoocasta.com is not responsible for the quality of work carried out by the referred talent to the industry professionals as the selection of the talent for a particular role/job is the responsibility of the industry professionals.</li><li>www.yoocasta.com does not in any case guarantee the job or visa status to any user or business.</li><li>In case of any advertisement on www.yoocasta.com from any third party, www.yoocasta.com shall not be responsible for any discrepancy or any loss or damage caused to anyone as result of it.</li></ul><h3>INDEMNITY</h3><p>To the fullest extent permitted by law, you agree to defend, indemnify and hold www.yoocasta.com its affiliates, subsidiaries, and office bearers harmless from any potential claims and expenses, including reasonable legal fees, related to any breach of this Agreement resulting from your use of the www.yoocasta.com or any Content.</p><h3>CANCELLATION POLICY</h3><p>www.yoocasta.com reserves the right to cancel the subscription/membership of the user at any point of time without giving prior notice if found in breach of any of these terms.</p><h3>ASSIGNMENT</h3><p>The user/subscriber shall not be able to transfer, sub-contract or otherwise deal with subscriptions of www.yoocasta.com.</p><h3>EXCLUSION OF THIRD-PARTY RIGHTS</h3><p>These terms of use are for the benefit and understanding of www.yoocasta.com and its and are not intended for or to be enforceable by any third party.</p><h3>MODIFICATIONS</h3><p>There shall be no amendment or modification of these Terms of Service unless the same is in writing and signed by www.yoocasta.com and the user or its authorized person.</p><h3>TERMINATION</h3><p>User may terminate its account by submitting a termination request to www.yoocasta.com. www.yoocasta.com reserves the right to restrict, suspend, deny or terminate access to all or part of any of the Website and to deny access to any person in its sole discretion without notice or liability of any kind. Any violation of these Terms of Use may be referred to law enforcement authorities. Termination may result in the loss of information related to your account. Proprietary, warranty, disclaimers, indemnity and liability related provisions shall survive the termination.</p><h3>TERMS OF USE GOVERNS</h3><p>In case of any conflict between www.yoocasta.com and user over the terms of use and any other document mutually signed, these Terms of Use will govern the resolution of dispute between the Parties.</p><h3>INTERPRETATION OF TERMS</h3><p>The Terms of Use and the interpretation thereof shall be governed by and construed in accordance with the laws of UAE and your continued use of the same constitutes your irrevocable submission to the exclusive jurisdiction of the Courts of UAE. If any part of these Terms of Use is declared unlawful, void, or unenforceable by any Court of UAE, that part will be deemed severable and will not affect the validity and enforceability of any remaining provisions.</p><h3>JURISDICTION</h3><p>Yoocasta FZE LLC maintains the website www.yoocasta.com ("Site") and makes no representation that the contents of the Website are appropriate or available for use outside UAE and governed under the Laws of UAE.</p><h3>ENTIRE AGREEMENT</h3><p>These terms of use contain the entire agreement between the parties relating to their engagement.</p><h3>PAYMENT CONFIRMATION</h3><ul><li>Once the payment is made, the confirmation notice will be sent to the client via email within 24 hours of receipt of payment.</li><li>Customer can cancel their membership plan within 24 hours; refunds will be made back to the payment solution used initially by the customer. Please allow for up to 45 days for the refund transfer to be completed.</li></ul><h3>REFUND POLICY</h3><ul><li>Refunds will be done only through the Original Mode of Payment and will be processed within 10 to 45 days depends on the issuing bank of the credit card.</li><li>Subscription once cancelled will be effective immediately.</li></ul>`,
  },
  {
    pageKey: 'privacy-policy',
    metaTitle: 'Privacy Policy | Yoocasta',
    metaDescription: 'Read how Yoocasta FZE LLC collects, manages, stores and protects your personal data.',
    pageHeading: 'Privacy Policy',
    subHeading: 'Last updated on 10/01/2019',
    pageDescription: '',
    address: '',
    phone: '',
    email: '',
    body: `<p>Your privacy is important to us. At https://www.yoocasta.com/ the services are provided by Yoocasta FZE LLC. We are committed to protect and handle your privacy and information in the most transparent manner. This statement lays out how we collect, manage, store and protect your personal data. Please read carefully this statement to get a clearer understanding about our privacy policy. By providing us with any personal information, you are consenting to the use of your personal information as contemplated in this privacy notice. If you do not agree to any part of this Policy, Please stop accessing the website and do not submit any of your personal information here.</p><h3>WHAT INFORMATION DO WE COLLECT</h3><ul><li>Your Internet Protocol (IP) address, operating system, browser type, last used domain and the domain accessed after exiting our website, the date and time of access of our website, items clicked on, viewed pages and the amount of time spent on a particular page of our website are the instances of "Non-Personally Identifiable Information" we may collect on account of your usage of our website.</li><li>We also collect certain information (automatically) through the use of "cookies" and similar tracking technologies. Cookies are small data files that are stored on a user's computer or device at the request of a website to enable the website to recognize previous visitors and retain information such as user preferences and history. If you wish to block, erase, or be warned of cookies, please refer to your browser instructions or "help screen" to learn about these functions. However, if your browser is set to not accept cookies or if you reject a cookie, you will not be able to sign in to your user account or use certain parts of the Services.</li><li>We collect your Personal Data i.e. full name, email address, phone number, current address, photos and other media that you voluntarily provide us, when you register for Yoocasta or create a talent profile.</li><li>We also collect Personal Data when you sign up for email newsletters or alerts on Yoocasta. Personal Data may contain your name, email, contact information, your location, as well as other information you provide us.</li><li>We also collect billing information when processing payment for the purchase of our services and membership.</li><li>We collect and store data about you when you use and/or communicate with the website administration.</li><li>We may also obtain information about you through third party sources as permitted by applicable law, such as public databases, social media platforms, and marketing partners.</li></ul><h3>USE OF INFORMATION</h3><ul><li>We use your information:</li><li>To create an account for you to use our platform and services.</li><li>To respond to your requests or to manage your user account.</li><li>To fulfil your requests, respond to your inquiries.</li><li>To match your data for the potential roles and jobs with the third parties advertising such roles and jobs.</li><li>To make your talent profile visible publicly and discoverable across the worldwide web.</li><li>To use the contents of your profile on the social media platforms of Yoocasta for the marketing and promotional purposes.</li><li>To use it for analytics, reporting and marketing purpose.</li><li>To monitor the safety and security of our services and platform.</li><li>To use data and content about users for communications promoting membership, job posting, and engagement with us.</li><li>To assess the performance of advertisements displayed to our users directly by us or through third party advertising partners.</li></ul><h3>YOUR RIGHTS IN RELATION TO YOUR INFORMATION</h3><ul><li>You have various rights in relation to your personal information as mentioned below:</li><li>To access your data.</li><li>To modify the data, you have provided to us at any time through your Yoocasta profile.</li><li>To have your data rectified promptly if it is inaccurate or incomplete.</li><li>To have your data erased in specific circumstances.</li></ul><h3>DATA RETENTION</h3><p>We retain information for the maximum period allowable by law, where there is a reasonable business need or legitimate interest to retain such data and may store it on our server.</p><h3>CHILDREN</h3><p>Our Services are not intended for use by children under the age of 18, and such use is prohibited by our Terms of Service. We do not knowingly collect Personal Information from children under 18. If you become aware that a child has provided us with Personal Information, please contact us as set forth in this Policy.</p><p>In case a user account has been created by the Guardian of a children under the age of 18, the person doing so must be the Parent or Legal Guardian of the children and, must affirm and consent to share the information of the children.</p><h3>THIRD-PARTY DISCLOSURE</h3><p>We do not sell, trade, or make your personal data commercially available to any third party.</p><p>We may share information with our service providers for the completion of the assignment you have entrusted to us or unless such disclosure is required by law of the United Arab Emirates only.</p><h3>ONLINE ADVERTISEMENT OF THIRD PARTY</h3><p>We may also use third parties to display and target ads which might possess certain functionality (such as maps), or to place their own cookies and other tracking technologies to collect, track and analyse usage and statistical information from users. We are not responsible for the information collection practices of any third parties.</p><h3>LINKS TO OTHER SITES</h3><p>Our website, newsletters, email updates and other communications may, from time to time, contain links to and from the websites of others. The personal data that you provide through such websites is not subject to this privacy notice and the treatment of your personal data by such websites is not the responsibility of www.yoocasta.com.</p><p>If you follow a link to any other websites, please note that these websites have their own privacy notices which will set out how your information is collected and processed when visiting those sites.</p><h3>HOW WE PROTECT YOUR DATA</h3><p>We have implemented reasonable administrative, technical and physical measures to protect your personal information against loss, misuse and alteration.</p><h3>SECURITY MEASURES</h3><ul><li>We endeavour to secure your Personal Information from our end, however, no security measures are perfect or impenetrable. To protect the confidentiality of your Personal Information is your responsibility. In case of any unauthorised use of your password, Yoocasta is not responsible and you must advise us immediately by emailing us if you believe your password has been misused.</li><li>https://yoocasta.com/ will not pass any debit/credit card details to third parties.</li><li>The https://yoocasta.com/ is not responsible for the privacy policies of websites to which it links. If you provide any information to such third parties different rules regarding the collection and use of your personal information may apply. You should contact these entities directly if you have any questions about their use of the information that they collect.</li></ul><h3>TRANSFERS OF INFORMATION</h3><p>Information about our customers, including Personal Information, may be disclosed as part of any merger, acquisition, debt financing, sale of company assets, as well as in the event of an insolvency, bankruptcy or receivership in which Personal Information could be transferred to third parties as one of Yoocasta business assets. In such an event, we will attempt to notify you before your Personal Information is transferred, but you may not have the right to opt out of any such transfer.</p><h3>CHANGES TO THIS PRIVACY POLICY</h3><p>This policy was last updated on 10/01/2019. We might change and update this policy from time to time by updating this page. We encourage you to check this page periodically to ensure that you are happy with any changes.</p><h3>POLICY QUESTIONS AND ENFORCEMENT</h3><p>We are committed to protecting the privacy of your personal information. If you have questions or comments about our administration of your personal data or deactivate profile, please contact us at support@yoocasta.com.</p>`,
  },
  {
    pageKey: 'faq',
    metaTitle: 'FAQ | Yoocasta',
    metaDescription: 'Find answers to common questions about Yoocasta for talents and companies.',
    pageHeading: 'Frequently Asked Questions',
    subHeading: 'Find answers to common questions about Yoocasta.',
    pageDescription: '',
    address: '',
    phone: '',
    email: '',
    talentFaqs: JSON.stringify(DEFAULT_TALENT_FAQS),
    companyFaqs: JSON.stringify(DEFAULT_COMPANY_FAQS),
    body: '',
  },
];

const ensureCmsPages = async () => {
  for (const page of DEFAULT_CMS_PAGES) {
    const existing = await prisma.cmsPage.findUnique({ where: { pageKey: page.pageKey } });
    if (!existing) {
      await prisma.cmsPage.create({
        data: {
          ...page,
          address: cleanCmsText(page.address),
          phone: cleanCmsText(page.phone),
          email: cleanCmsText(page.email),
          videoUrl: cleanCmsText(page.videoUrl || ''),
          talentFaqs: page.talentFaqs || '[]',
          companyFaqs: page.companyFaqs || '[]',
          videoSection: page.videoSection || '[]',
          testimonialsSection: page.testimonialsSection || '[]',
          faqSection: page.faqSection || '[]',
          body: cleanCmsHtml(page.body),
        },
      }).catch(() => {});
    } else {
      const clean = cleanCmsHtml(existing.body || '');
      const updateData: any = {};
      if (!existing.body || clean !== existing.body) updateData.body = clean;
      if (!existing.talentFaqs && page.talentFaqs) updateData.talentFaqs = page.talentFaqs;
      if (!existing.companyFaqs && page.companyFaqs) updateData.companyFaqs = page.companyFaqs;
      if ((!existing.videoSection || existing.videoSection === '[]') && page.videoSection) updateData.videoSection = page.videoSection;
      if ((!existing.testimonialsSection || existing.testimonialsSection === '[]') && page.testimonialsSection) updateData.testimonialsSection = page.testimonialsSection;
      if ((!existing.faqSection || existing.faqSection === '[]') && page.faqSection) updateData.faqSection = page.faqSection;
      if (!existing.videoUrl && page.videoUrl) updateData.videoUrl = page.videoUrl;
      if (!existing.bottomHeading && page.bottomHeading) updateData.bottomHeading = page.bottomHeading;
      if (!existing.bottomDescription && page.bottomDescription) updateData.bottomDescription = page.bottomDescription;
      if (Object.keys(updateData).length > 0) {
        await prisma.cmsPage.update({ where: { pageKey: page.pageKey }, data: updateData }).catch(() => {});
      }
    }
  }
};

export const createCmsPage = async (data: {
  pageKey: string;
  metaTitle: string;
  metaDescription: string;
  pageHeading: string;
  subHeading: string;
  pageDescription: string;
  address: string;
  phone: string;
  email: string;
  videoUrl?: string;
  bottomHeading?: string;
  bottomDescription?: string;
  talentFaqs?: string;
  companyFaqs?: string;
  videoSection?: string;
  testimonialsSection?: string;
  faqSection?: string;
  body: string;
}) => {
  return prisma.cmsPage.create({
    data: {
      pageKey: data.pageKey.trim(),
      metaTitle: cleanCmsText(data.metaTitle),
      metaDescription: cleanCmsText(data.metaDescription),
      pageHeading: cleanCmsText(data.pageHeading),
      subHeading: cleanCmsText(data.subHeading),
      pageDescription: cleanCmsText(data.pageDescription),
      address: cleanCmsText(data.address),
      phone: cleanCmsText(data.phone),
      email: cleanCmsText(data.email),
      videoUrl: cleanCmsText(data.videoUrl || ''),
      bottomHeading: cleanCmsText(data.bottomHeading || ''),
      bottomDescription: cleanCmsText(data.bottomDescription || ''),
      talentFaqs: data.talentFaqs || '[]',
      companyFaqs: data.companyFaqs || '[]',
      videoSection: data.videoSection !== undefined ? data.videoSection : '[]',
      testimonialsSection: data.testimonialsSection !== undefined ? data.testimonialsSection : '[]',
      faqSection: data.faqSection !== undefined ? data.faqSection : '[]',
      body: cleanCmsHtml(data.body || ''),
    },
  });
};

export const updateCmsPage = async (key: string, data: {
  metaTitle: string;
  metaDescription: string;
  pageHeading: string;
  subHeading: string;
  pageDescription: string;
  address: string;
  phone: string;
  email: string;
  videoUrl?: string;
  bottomHeading?: string;
  bottomDescription?: string;
  talentFaqs?: string;
  companyFaqs?: string;
  videoSection?: string;
  testimonialsSection?: string;
  faqSection?: string;
  body: string;
}) => {
  const existing = await prisma.cmsPage.findUnique({ where: { pageKey: key } });
  if (!existing) throw { statusCode: 404, message: 'Page not found' };
  return prisma.cmsPage.update({
    where: { pageKey: key },
    data: {
      metaTitle: cleanCmsText(data.metaTitle),
      metaDescription: cleanCmsText(data.metaDescription),
      pageHeading: cleanCmsText(data.pageHeading),
      subHeading: cleanCmsText(data.subHeading),
      pageDescription: cleanCmsText(data.pageDescription),
      address: cleanCmsText(data.address),
      phone: cleanCmsText(data.phone),
      email: cleanCmsText(data.email),
      videoUrl: cleanCmsText(data.videoUrl || ''),
      bottomHeading: cleanCmsText(data.bottomHeading || ''),
      bottomDescription: cleanCmsText(data.bottomDescription || ''),
      talentFaqs: data.talentFaqs !== undefined ? data.talentFaqs : '[]',
      companyFaqs: data.companyFaqs !== undefined ? data.companyFaqs : '[]',
      videoSection: data.videoSection !== undefined ? data.videoSection : '[]',
      testimonialsSection: data.testimonialsSection !== undefined ? data.testimonialsSection : '[]',
      faqSection: data.faqSection !== undefined ? data.faqSection : '[]',
      body: cleanCmsHtml(data.body ?? ''),
    },
  });
};

export const deleteCmsPage = async (key: string) => {
  const existing = await prisma.cmsPage.findUnique({ where: { pageKey: key } });
  if (!existing) throw { statusCode: 404, message: 'Page not found' };
  await prisma.cmsPage.delete({ where: { pageKey: key } });
  return { pageKey: key };
};

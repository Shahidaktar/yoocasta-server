import prisma from '../../config/db';
import { comparePassword } from '../../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import { JwtPayload } from '../../utils/jwt';

export const login = async (email: string, password: string) => {
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) throw { statusCode: 401, message: 'Invalid email or password' };

  const isMatch = await comparePassword(password, admin.password);
  if (!isMatch) throw { statusCode: 401, message: 'Invalid email or password' };

  const accessToken = generateAccessToken({ userId: admin.id, email: admin.email, role: 'ADMIN' });
  const refreshToken = generateRefreshToken({ userId: admin.id, email: admin.email, role: 'ADMIN' });

  return {
    user: { id: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' },
    accessToken,
    refreshToken,
  };
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
          expiresAt: true,
          createdAt: true,
          plan: { select: { name: true } },
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
        planName: sub.plan.name,
        activatedDate: lastTxnPurchaseDate || user.createdAt,
        expiresAt: sub.expiresAt,
        duration: sub.expiresAt
          ? Math.round((sub.expiresAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24)) + ' days'
          : 'Lifetime',
        status: sub.status,
      }
    : {
        id: null,
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
        status: true,
        createdAt: true,
        city: {
          select: { name: true, country: { select: { name: true } } },
        },
        companyProfile: {
          select: { companyName: true },
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
    },
    include: { roles: true },
  });
};

export const updateJobStatus = async (jobId: string, status: 'APPROVED' | 'PENDING' | 'REJECTED') => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status },
    select: { id: true, status: true },
  });

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

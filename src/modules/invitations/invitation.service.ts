import prisma from '../../config/db';
import { sendEmail } from '../../config/email';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const sendInvitation = async (recruiterId: string, jobId: string, talentUserId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: { select: { companyName: true } }, _count: { select: { roles: true } } },
  });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const talent = await prisma.user.findUnique({ where: { id: talentUserId } });
  if (!talent) throw { statusCode: 404, message: 'Talent not found' };

  const existing = await prisma.invitation.findUnique({
    where: { jobId_talentUserId: { jobId, talentUserId } },
  });
  if (existing) throw { statusCode: 409, message: 'Invitation already sent to this talent for this job' };

  const invitation = await prisma.invitation.create({
    data: { recruiterId, jobId, talentUserId },
  });

  const jobUrl = `${FRONTEND_URL}/jobs/${jobId}`;
  const companyName = job.company?.companyName || 'A recruiter';

  await sendEmail(
    talent.email,
    `You're Invited to Apply — ${job.title || 'Job Opportunity'} on Yoocasta`,
    `
    <div style="font-family:Arial;max-width:600px;margin:0 auto;">
      <h2 style="color:#3835A4;">You're Invited to Apply!</h2>
      <p>Hi ${talent.firstName || 'there'},</p>
      <p><strong>${companyName}</strong> has invited you to apply for the position of <strong>${job.title || 'a role'}</strong>.</p>
      <p>Click the button below to view the job details and submit your application:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${jobUrl}" style="background:#C6007E;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;">View Job & Apply</a>
      </div>
      <p style="color:#666;font-size:13px;">This invitation is unique to you. Don't share it with others.</p>
      <p style="color:#666;font-size:12px;">Thanks,<br/>Yoocasta Team</p>
    </div>
    `
  );

  return invitation;
};

export const getSentInvitations = async (recruiterId: string) => {
  const invitations = await prisma.invitation.findMany({
    where: { recruiterId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          image: true,
          _count: { select: { roles: true, invitations: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by job to get counts
  const jobMap = new Map<string, any>();
  for (const inv of invitations) {
    const jobId = inv.job.id;
    if (!jobMap.has(jobId)) {
      jobMap.set(jobId, {
        id: jobId,
        title: inv.job.title,
        image: inv.job.image,
        roleCount: inv.job._count.roles,
        invitationCount: 0,
      });
    }
    jobMap.get(jobId).invitationCount = inv.job._count.invitations;
  }

  return Array.from(jobMap.values());
};

export const getInvitationTalentIds = async (recruiterId: string, jobId: string) => {
  const invitations = await prisma.invitation.findMany({
    where: { recruiterId, jobId },
    select: { talentUserId: true },
  });
  return invitations.map(i => i.talentUserId);
};

export const getMyInvitations = async (talentUserId: string, filters: any) => {
  const jobWhere: any = {};

  if (filters.search) {
    jobWhere.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.categoryIds) {
    jobWhere.categoryId = Array.isArray(filters.categoryIds) ? { in: filters.categoryIds } : filters.categoryIds;
  }
  if (filters.gender) jobWhere.gender = filters.gender;
  if (filters.paymentType) jobWhere.paymentInfo = filters.paymentType;
  if (filters.projectTypeId) jobWhere.projectTypeId = filters.projectTypeId;
  if (filters.countryIds) {
    const ids = Array.isArray(filters.countryIds) ? filters.countryIds : [filters.countryIds];
    jobWhere.castingCity = { countryId: { in: ids } };
  }

  if (filters.ageFrom || filters.ageTo) {
    jobWhere.roles = {
      some: {
        ...(filters.ageFrom ? { ageMin: { lte: parseInt(filters.ageFrom as string) } } : {}),
        ...(filters.ageTo ? { ageMax: { gte: parseInt(filters.ageTo as string) } } : {}),
      },
    };
  }

  let orderBy: any = { createdAt: 'desc' };
  if (filters.sort === 'oldest') orderBy = { createdAt: 'asc' };
  if (filters.sort === 'most_viewed') {
    orderBy = { job: { views: 'desc' } };
  }
  if (filters.sort === 'expiring_soon') {
    orderBy = { job: { lastDateToApply: 'asc' } };
  }

  const invitations = await prisma.invitation.findMany({
    where: {
      talentUserId,
      ...(Object.keys(jobWhere).length > 0 ? { job: jobWhere } : {}),
    },
    orderBy,
    include: {
      job: {
        include: {
          category: { select: { name: true } },
          company: {
            select: { companyName: true, logo: true, user: { select: { isVerified: true } } },
          },
          roles: {
            select: { id: true, title: true, noOfCast: true, payment: true, paymentType: true, ageMin: true, ageMax: true },
          },
          castingCity: { select: { name: true, country: { select: { name: true } } } },
          projectType: { select: { name: true } },
        },
      },
    },
  });

  return invitations.map(inv => ({
    ...inv.job,
    image: inv.job.image
      ? (inv.job.image.startsWith('http') ? inv.job.image : `${process.env.R2_PUBLIC_URL}/jobs/${inv.job.image}`)
      : null,
    invitedAt: inv.createdAt,
  }));
};

export const getPublicJobInvitation = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      company: { select: { companyName: true, logo: true } },
      category: { select: { name: true } },
      roles: {
        select: { id: true, title: true, noOfCast: true },
      },
      invitations: {
        include: {
          talent: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              image: true,
              isVerified: true,
              nationality: { select: { name: true } },
              subscription: {
                select: { plan: { select: { name: true, slug: true } }, status: true },
              },
              talentProfile: {
                select: {
                  categories: { select: { category: { select: { name: true } } } },
                  city: { select: { name: true, country: { select: { name: true } } } },
                  gender: true,
                  dob: true,
                  bioDescription: true,
                  media: {
                    select: { id: true, url: true, type: true },
                    take: 4,
                    orderBy: { createdAt: 'desc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const R2_BASE = process.env.R2_PUBLIC_URL as string;
  const calculateAge = (dob: Date | null | undefined): number | null => {
    if (!dob) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  return {
    job: {
      id: job.id,
      title: job.title,
      description: job.description,
      image: job.image ? (job.image.startsWith('http') ? job.image : `${R2_BASE}/jobs/${job.image}`) : null,
      category: job.category?.name || null,
      companyName: job.company?.companyName || null,
      companyLogo: job.company?.logo ? `${R2_BASE}/profile/${job.company.logo}` : null,
      roleCount: job.roles.length,
      roles: job.roles.map(r => ({ id: r.id, title: r.title, noOfCast: r.noOfCast })),
    },
    talents: job.invitations.map(inv => {
      const t = inv.talent;
      return {
        id: t.id,
        username: t.username,
        firstName: t.firstName,
        lastName: t.lastName,
        image: t.image ? `${R2_BASE}/profile/${t.image}` : null,
        isVerified: t.isVerified,
        nationality: t.nationality?.name || null,
        plan: t.subscription?.status === 'ACTIVE' ? t.subscription.plan.slug : null,
        categories: t.talentProfile?.categories.map(c => c.category.name) || [],
        city: t.talentProfile?.city?.name,
        country: t.talentProfile?.city?.country?.name,
        gender: t.talentProfile?.gender,
        age: calculateAge(t.talentProfile?.dob),
        bio: t.talentProfile?.bioDescription || null,
                media: (t.talentProfile?.media || []).map((m: any) => ({ id: m.id, url: m.url, type: m.type })),
      };
    }),
  };
};

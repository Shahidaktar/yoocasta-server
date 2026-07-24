import prisma from '../../config/db';

// ─── Form Options ──────────────────────────────────────────────
export const getFormOptions = async () => {
  const [categories, projectTypes, countries, cities, languages, dialects, ethnicities, nationalities] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.projectType.findMany({ orderBy: { name: 'asc' } }),
    prisma.country.findMany({ orderBy: { name: 'asc' } }),
    prisma.city.findMany({ orderBy: { name: 'asc' }, include: { country: true } }),
    prisma.language.findMany({ orderBy: { name: 'asc' } }),
    prisma.dialect.findMany({ orderBy: { name: 'asc' } }),
    prisma.ethnicity.findMany({ orderBy: { name: 'asc' } }),
    prisma.nationality.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { categories, projectTypes, countries, cities, languages, dialects, ethnicities, nationalities };
};

// ─── Get Public Jobs (browse page) ──────────────────────────────
export const getPublicJobs = async (query: any) => {
  const {
    categoryIds, countryIds, gender, ageFrom, ageTo,
    paymentType, projectTypeId, languageIds, nationalityIds,
    ethnicityIds, dialectIds,
    status, sort, page = '1', limit = '12',
  } = query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { status: 'APPROVED' };

  if (status === 'expired') {
    where.lastDateToApply = { lt: new Date() };
  } else if (status === 'active') {
    where.OR = [
      { lastDateToApply: { gte: new Date() } },
      { lastDateToApply: null },
    ];
  }

  if (categoryIds) {
    const ids = (Array.isArray(categoryIds) ? categoryIds : categoryIds.split(',')).filter(Boolean);
    if (ids.length > 0) where.categoryId = { in: ids };
  }

  if (projectTypeId) {
    where.projectTypeId = projectTypeId;
  }

  if (countryIds) {
    const ids = (Array.isArray(countryIds) ? countryIds : countryIds.split(',')).filter(Boolean);
    if (ids.length > 0) {
      where.castingCity = { countryId: { in: ids } };
    }
  }

  if (paymentType) {
    where.paymentInfo = paymentType;
  }

  // Role-level filters
  const roleFilters: any[] = [];
  if (gender) {
    roleFilters.push({ OR: [{ gender: null }, { gender }, { gender: 'both' }] });
  }
  if (ageFrom) {
    roleFilters.push({ OR: [{ ageMin: null }, { ageMin: { lte: parseInt(ageFrom) } }] });
  }
  if (ageTo) {
    roleFilters.push({ OR: [{ ageMax: null }, { ageMax: { gte: parseInt(ageTo) } }] });
  }
  if (languageIds) {
    const ids = (Array.isArray(languageIds) ? languageIds : languageIds.split(',')).filter(Boolean);
    roleFilters.push({
      OR: [
        { languageSpoken: null },
        ...ids.map((id: string) => ({ languageSpoken: { contains: id } }))
      ]
    });
  }
  if (nationalityIds) {
    const ids = (Array.isArray(nationalityIds) ? nationalityIds : nationalityIds.split(',')).filter(Boolean);
    roleFilters.push({
      OR: [
        { nationality: null },
        ...ids.map((id: string) => ({ nationality: { contains: id } }))
      ]
    });
  }
  if (ethnicityIds) {
    const ids = (Array.isArray(ethnicityIds) ? ethnicityIds : ethnicityIds.split(',')).filter(Boolean);
    roleFilters.push({
      OR: [
        { ethnicity: null },
        ...ids.map((id: string) => ({ ethnicity: { contains: id } }))
      ]
    });
  }
  if (dialectIds) {
    const ids = (Array.isArray(dialectIds) ? dialectIds : dialectIds.split(',')).filter(Boolean);
    roleFilters.push({
      OR: [
        { dialectsSpoken: null },
        ...ids.map((id: string) => ({ dialectsSpoken: { contains: id } }))
      ]
    });
  }

  if (roleFilters.length > 0) {
    where.roles = { some: { AND: roleFilters } };
  }

  const orderBy: any = {};
  switch (sort) {
    case 'oldest': orderBy.createdAt = 'asc'; break;
    case 'expiring_soon': orderBy.lastDateToApply = 'asc'; break;
    case 'most_viewed': orderBy.views = 'desc'; break;
    default: orderBy.createdAt = 'desc';
  }

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      include: {
        company: {
          include: {
            user: { select: { firstName: true, image: true, isVerified: true } },
          }
        },
        category: true,
        castingCity: { include: { country: true } },
        roles: {
          include: { payment: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { roles: true } },
      },
      orderBy,
      skip,
      take: limitNum,
    }),
  ]);

  return {
    data: jobs,
    pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum) },
  };
};

// ─── Get Company Profile ───────────────────────────────────────
const getCompanyProfile = async (userId: string) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) throw { statusCode: 404, message: 'Company profile not found' };
  return company;
};

// ─── Create Job (Step 1) ───────────────────────────────────────
export const createJob = async (userId: string, data: any) => {
  const company = await getCompanyProfile(userId);

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      castingService: data.castingService || 'portal',
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
      status: 'PENDING',
    },
    include: { roles: true }
  });

  return job;
};

// ─── Get My Jobs ───────────────────────────────────────────────
export const getMyJobs = async (userId: string) => {
  const company = await getCompanyProfile(userId);

  const jobs = await prisma.job.findMany({
    where: { companyId: company.id },
    include: {
      category: true,
      projectType: true,
      castingCity: { include: { country: true } },
      shootingCity: { include: { country: true } },
      roles: {
        include: { 
          payment: true,
          applications: { select: { status: true } }
        }
      },
      _count: { select: { roles: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return jobs.map(job => {
    let totalApplications = 0;
    let shortlistedCount = 0;
    let selectedCount = 0;
    
    job.roles.forEach(role => {
      totalApplications += role.applications.length;
      role.applications.forEach(app => {
        if (app.status === 'SHORTLISTED') shortlistedCount++;
        if (app.status === 'SELECTED') selectedCount++;
      });
      // Optionally remove raw applications array if not needed frontend to save bandwidth
      // delete (role as any).applications;
    });

    return {
      ...job,
      totalApplications,
      shortlistedCount,
      selectedCount
    };
  });
};

const resolveIdArrays = async (role: any) => {
  const parseIds = (val: string | null | undefined): string[] => {
    if (!val) return [];
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; }
    catch { return []; }
  };

  const [ethnicities, nationalities, languages, dialects] = await Promise.all([
    prisma.ethnicity.findMany({ where: { id: { in: parseIds(role.ethnicity) } } }),
    prisma.nationality.findMany({ where: { id: { in: parseIds(role.nationality) } } }),
    prisma.language.findMany({ where: { id: { in: parseIds(role.languageSpoken) } } }),
    prisma.dialect.findMany({ where: { id: { in: parseIds(role.dialectsSpoken) } } }),
  ]);

  return {
    ...role,
    ethnicityNames: ethnicities.map(e => e.name).join(', '),
    nationalityNames: nationalities.map(n => n.name).join(', '),
    languageNames: languages.map(l => l.name).join(', '),
    dialectNames: dialects.map(d => d.name).join(', '),
  };
};

// ─── Get Public Job By ID (increments views) ───────────────────
export const getPublicJobById = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      company: {
        include: {
          user: { select: { firstName: true, email: true, image: true, createdAt: true, isVerified: true } },
          _count: { select: { jobs: true } },
        }
      },
      category: true,
      projectType: true,
      castingCity: { include: { country: true } },
      shootingCity: { include: { country: true } },
      roles: {
        include: { payment: true }
      },
    }
  });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const rolesWithAppCount = await Promise.all(
    job.roles.map(async (role) => {
      const appCount = await prisma.application.count({ where: { roleId: role.id } });
      return { ...role, _count: { applications: appCount } };
    })
  );

  const resolvedRoles = await Promise.all(rolesWithAppCount.map(resolveIdArrays));

  await prisma.job.update({
    where: { id: jobId },
    data: { views: { increment: 1 } },
  });

  return { ...job, roles: resolvedRoles, views: job.views + 1 };
};

// ─── Get Job By ID ─────────────────────────────────────────────
export const getJobById = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      company: { include: { user: { select: { firstName: true, email: true } } } },
      category: true,
      projectType: true,
      castingCity: { include: { country: true } },
      shootingCity: { include: { country: true } },
      roles: {
        include: { payment: true }
      },
    }
  });
  if (!job) throw { statusCode: 404, message: 'Job not found' };
  return job;
};

// ─── Update Job ────────────────────────────────────────────────
export const updateJob = async (userId: string, jobId: string, data: any) => {
  const company = await getCompanyProfile(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: company.id } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  return prisma.job.update({
    where: { id: jobId },
    data: {
      title: data.title,
      subTitle: data.subTitle,
      description: data.description,
      usage: data.usage,
      categoryId: data.categoryId || null,
      projectTypeId: data.projectTypeId || null,
      paymentInfo: data.paymentInfo || null,
      castingCityId: data.castingCityId || null,
      castingDates: data.castingDates ? JSON.stringify(data.castingDates) : null,
      lastDateToApply: data.lastDateToApply ? new Date(data.lastDateToApply) : null,
      shootingCityId: data.shootingCityId || null,
      shootingDates: data.shootingDates ? JSON.stringify(data.shootingDates) : null,
    },
    include: { roles: true }
  });
};

// ─── Delete Job ────────────────────────────────────────────────
export const deleteJob = async (userId: string, jobId: string) => {
  const company = await getCompanyProfile(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: company.id } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  await prisma.job.delete({ where: { id: jobId } });
  return { message: 'Job deleted successfully' };
};

// ─── Add Role ──────────────────────────────────────────────────
export const addRole = async (userId: string, jobId: string, data: any) => {
  const company = await getCompanyProfile(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: company.id } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  // Helper to stringify array fields; supports both old single string and new array format
  const toJson = (val: any) => {
    if (!val || (Array.isArray(val) && val.length === 0)) return null;
    return typeof val === 'string' ? val : JSON.stringify(val);
  };

  const ethnicityAll = Array.isArray(data.ethnicityIds) ? data.ethnicityIds.includes('any') : (data.ethnicityAll || false);
  const nationalityAll = Array.isArray(data.nationalityIds) ? data.nationalityIds.includes('any') : (data.nationalityAll || false);

  const role = await prisma.role.create({
    data: {
      jobId,
      title: data.title,
      description: data.description || null,
      noOfCast: data.noOfCast ? parseInt(data.noOfCast) : null,
      ethnicity: toJson(data.ethnicityIds) || data.ethnicityId || null,
      ethnicityAll,
      nationality: toJson(data.nationalityIds) || data.nationalityId || null,
      nationalityAll,
      languageSpoken: toJson(data.languageIds),
      dialectsSpoken: toJson(data.dialectIds),
      gender: data.gender || null,
      ageMin: data.ageMin ? parseInt(data.ageMin) : null,
      ageMax: data.ageMax ? parseInt(data.ageMax) : null,
      experience: data.experience ? JSON.stringify(data.experience) : null,
      experienceAll: data.experienceAll || false,
      paymentInfo: data.paymentInfo || null,
      paymentType: data.paymentType || null,
      usage: data.usage || null,
      locationCityId: (data.locationCityIds && data.locationCityIds.length && !data.locationCityIds.includes('any')) ? data.locationCityIds[0] : (data.locationCityId || null),
      locationCountry: toJson(data.locationCountryIds) || data.locationCountry || null,
      question1: data.question1 || null,
      question2: data.question2 || null,
      question3: data.question3 || null,
      requiredProfileVideo: data.requiredProfileVideo || false,
      requiredCastingVideo: data.requiredCastingVideo || false,
    }
  });

  // Create role payment if payment type provided
  if (data.paymentType && data.paymentDetails) {
    await prisma.rolePayment.create({
      data: {
        roleId: role.id,
        ...buildPaymentData(data.paymentType, data.paymentDetails),
      }
    });
  }

  return prisma.role.findUnique({
    where: { id: role.id },
    include: { payment: true }
  });
};

// ─── Update Role ───────────────────────────────────────────────
export const updateRole = async (userId: string, jobId: string, roleId: string, data: any) => {
  const company = await getCompanyProfile(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: company.id } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  const role = await prisma.role.findFirst({ where: { id: roleId, jobId } });
  if (!role) throw { statusCode: 404, message: 'Role not found' };

  const toJsonU = (val: any) => {
    if (!val || (Array.isArray(val) && val.length === 0)) return null;
    return typeof val === 'string' ? val : JSON.stringify(val);
  };
  const ethnicityAllU = Array.isArray(data.ethnicityIds) ? data.ethnicityIds.includes('any') : (data.ethnicityAll || false);
  const nationalityAllU = Array.isArray(data.nationalityIds) ? data.nationalityIds.includes('any') : (data.nationalityAll || false);

  await prisma.role.update({
    where: { id: roleId },
    data: {
      title: data.title,
      description: data.description || null,
      noOfCast: data.noOfCast ? parseInt(data.noOfCast) : null,
      ethnicity: toJsonU(data.ethnicityIds) || data.ethnicityId || null,
      ethnicityAll: ethnicityAllU,
      nationality: toJsonU(data.nationalityIds) || data.nationalityId || null,
      nationalityAll: nationalityAllU,
      languageSpoken: toJsonU(data.languageIds),
      dialectsSpoken: toJsonU(data.dialectIds),
      gender: data.gender || null,
      ageMin: data.ageMin ? parseInt(data.ageMin) : null,
      ageMax: data.ageMax ? parseInt(data.ageMax) : null,
      experience: data.experience ? JSON.stringify(data.experience) : null,
      paymentType: data.paymentType || null,
      locationCityId: (data.locationCityIds && data.locationCityIds.length && !data.locationCityIds.includes('any')) ? data.locationCityIds[0] : (data.locationCityId || null),
      locationCountry: toJsonU(data.locationCountryIds) || data.locationCountry || null,
      question1: data.question1 || null,
      question2: data.question2 || null,
      question3: data.question3 || null,
      requiredProfileVideo: data.requiredProfileVideo || false,
      requiredCastingVideo: data.requiredCastingVideo || false,
    }
  });

  // Update payment
  if (data.paymentType && data.paymentDetails) {
    await prisma.rolePayment.upsert({
      where: { roleId },
      create: { roleId, ...buildPaymentData(data.paymentType, data.paymentDetails) },
      update: buildPaymentData(data.paymentType, data.paymentDetails),
    });
  }

  return prisma.role.findUnique({ where: { id: roleId }, include: { payment: true } });
};

// ─── Delete Role ───────────────────────────────────────────────
export const deleteRole = async (userId: string, jobId: string, roleId: string) => {
  const company = await getCompanyProfile(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: company.id } });
  if (!job) throw { statusCode: 404, message: 'Job not found' };

  await prisma.role.delete({ where: { id: roleId } });
  return { message: 'Role deleted' };
};

// ─── Build Payment Data ────────────────────────────────────────
const parseIntOrNull = (val: any) => val ? parseInt(val, 10) : null;

const buildPaymentData = (paymentType: string, d: any) => {
  switch (paymentType) {
    case 'per_hour':
      return { 
        hourPerDay: parseIntOrNull(d.hoursPerDay), 
        hourBudgetPerHour: parseIntOrNull(d.budgetPerHour), 
        hourNoOfDays: parseIntOrNull(d.noOfDays) 
      };
    case 'per_day':
      return { 
        dayFullDay: parseIntOrNull(d.fullDay), 
        dayHalfDay: parseIntOrNull(d.halfDay), 
        dayBudgetFullDay: parseIntOrNull(d.budgetFullDay), 
        dayBudgetHalfDay: parseIntOrNull(d.budgetHalfDay), 
        dayTotalBudget: parseIntOrNull(d.totalBudget) 
      };
    case 'per_week':
      return { 
        weekNoOfWeek: parseIntOrNull(d.noOfWeek), 
        weekDaysPerWeek: parseIntOrNull(d.daysPerWeek), 
        weekBudgetPerWeek: parseIntOrNull(d.budgetPerWeek) 
      };
    case 'per_month':
      return { 
        monthNoOfMonth: parseIntOrNull(d.noOfMonth), 
        monthDayPerMonth: parseIntOrNull(d.daysPerMonth), 
        monthBudgetPerMonth: parseIntOrNull(d.budgetPerMonth) 
      };
    case 'package':
      return { 
        packageBudgetFullDay: parseIntOrNull(d.fullDay), 
        packageBudgetHalfDay: parseIntOrNull(d.halfDay), 
        packageTotalBudget: parseIntOrNull(d.totalBudget) 
      };
    default:
      return {};
  }
};
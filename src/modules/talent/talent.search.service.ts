import prisma from '../../config/db';

interface SearchParams {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  categories?: string[];
  ethnicities?: string[];
  gender?: string;
  ageFrom?: number;
  ageTo?: number;
  countryId?: string;
  cityId?: string;
  nationalities?: string[];
  languages?: string[];
  dialects?: string[];
  
  professional?: { key: string; values: string[] }[];
  physical?: {
    heightFrom?: number; heightTo?: number;
    weightFrom?: number; weightTo?: number;
    chestFrom?: number; chestTo?: number;
    waistFrom?: number; waistTo?: number;
    shoeSizeFrom?: number; shoeSizeTo?: number;
    hairColor?: string; hairType?: string; hairLength?: string;
    eyeColor?: string; bodyStructure?: string; tattoo?: string;
  };
}

const calculateAge = (dob: Date | null | undefined): number | null => {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};
// Fields where: 0 = not present, 1 = Individual, >1 = group (Band/Troupe)
const INDIVIDUAL_OR_GROUP_KEYS = new Set(['singer_individual_or_band', 'dancer_individual_or_band']);

export const searchTalents = async (params: SearchParams) => {
  const page = params.page || 1;
  const limit = params.limit || 12;
  const skip = (page - 1) * limit;

  const where: any = {
    role: 'TALENT',
    status: 'ACTIVE',
    profileCompleted: true,
  };

  const profileConditions: any = {};

  // 1. Text Search
  if (params.search) {
    where.OR = [
      { firstName: { contains: params.search, mode: 'insensitive' } },
      { lastName: { contains: params.search, mode: 'insensitive' } },
      {
        talentProfile: {
          is: {
            OR: [
              { bioDescription: { contains: params.search, mode: 'insensitive' } },
              { skillDescription: { contains: params.search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  // 2. Categories
  if (params.categories?.length) {
    profileConditions.categories = { some: { categoryId: { in: params.categories } } };
  }

  // 3. Demographics
  if (params.gender) profileConditions.gender = params.gender;
  if (params.ethnicities?.length) profileConditions.ethnicityId = { in: params.ethnicities };
  if (params.nationalities?.length) where.nationalityId = { in: params.nationalities };
  if (params.languages?.length) profileConditions.languages = { some: { languageId: { in: params.languages } } };
  if (params.dialects?.length) profileConditions.dialects = { some: { dialectId: { in: params.dialects } } };

  // 4. Location
  if (params.countryId) profileConditions.city = { countryId: params.countryId };
  if (params.cityId) profileConditions.cityId = params.cityId;

  // 5. Age -> DOB range
  if (params.ageFrom || params.ageTo) {
    const today = new Date();
    let minDob: Date | null = null;
    let maxDob: Date | null = null;

    if (params.ageTo) maxDob = new Date(today.getFullYear() - params.ageTo, today.getMonth(), today.getDate());
    if (params.ageFrom) minDob = new Date(today.getFullYear() - params.ageFrom, today.getMonth(), today.getDate());

    profileConditions.dob = {
      ...(maxDob ? { gte: maxDob } : {}),
      ...(minDob ? { lte: minDob } : {}),
    };
  }

  // 6. Physical Filters
  let physicalNumericUserIds: string[] | null = null;

  if (params.physical) {
    const { hairColor, hairType, hairLength, eyeColor, bodyStructure, tattoo, ...ranges } = params.physical;

    // categorical — exact match
    if (hairColor) profileConditions.hairColor = hairColor;
    if (hairType) profileConditions.hairType = hairType;
    if (hairLength) profileConditions.hairLength = hairLength;
    if (eyeColor) profileConditions.eyeColor = eyeColor;
    if (bodyStructure) profileConditions.bodyStructure = bodyStructure;
    if (tattoo) profileConditions.tattoo = tattoo;

    // numeric ranges — raw SQL since these columns are stored as text
    const rangeConditions: string[] = [];
    const rangeParams: any[] = [];

    const addRange = (column: string, from?: number, to?: number) => {
      if (from == null && to == null) return;
      let clause = `("${column}" ~ '^[0-9.]+$' AND CAST("${column}" AS FLOAT)`;
      const parts: string[] = [];
      if (from != null) { parts.push(`>= $${rangeParams.length + 1}`); rangeParams.push(from); }
      if (to != null) { parts.push(`<= $${rangeParams.length + 1}`); rangeParams.push(to); }
      clause += ' ' + parts.join(' AND CAST("' + column + '" AS FLOAT) ') + ')';
      rangeConditions.push(clause);
    };

    addRange('height', ranges.heightFrom, ranges.heightTo);
    addRange('weight', ranges.weightFrom, ranges.weightTo);
    addRange('chest', ranges.chestFrom, ranges.chestTo);
    addRange('waist', ranges.waistFrom, ranges.waistTo);
    addRange('shoeSize', ranges.shoeSizeFrom, ranges.shoeSizeTo);

    if (rangeConditions.length) {
      const sql = `SELECT "userId" FROM talent_profiles WHERE ${rangeConditions.join(' AND ')}`;
      const rows: { userId: string }[] = await prisma.$queryRawUnsafe(sql, ...rangeParams);
      physicalNumericUserIds = rows.map(r => r.userId);
    }
  }

  // 7. Professional/EAV Filters (AND across keys, OR within a key's selected tags)
if (params.professional?.length) {
  profileConditions.AND = params.professional
    .filter(p => p.values?.length)
    .map(p => {
      // Special handling: Individual/Band coded fields
     if (INDIVIDUAL_OR_GROUP_KEYS.has(p.key)) {
  const wantsIndividual = p.values.some(v => v.toLowerCase() === 'individual');
  const wantsGroup = p.values.some(v => ['band', 'troupe'].includes(v.toLowerCase()));

  const orConditions: any[] = [];
  if (wantsIndividual) orConditions.push({ value: '1' });
  if (wantsGroup) orConditions.push({ value: { notIn: ['0', '1'] } });

  return {
    attributes: { some: { key: p.key, OR: orConditions } },
  };
}

      // Default behavior for all other EAV fields
      return {
        attributes: {
          some: {
            key: p.key,
            OR: p.values.map(v => ({ value: { contains: v, mode: 'insensitive' } })),
          },
        },
      };
    });
}

  // Finally, attach the relation filter correctly
  where.talentProfile = {
    isNot: null,
    ...(Object.keys(profileConditions).length ? { is: profileConditions } : {}),
  };

  // Apply numeric physical range filter (computed via raw SQL above) directly on User.id
  if (physicalNumericUserIds) {
    where.id = { in: physicalNumericUserIds };
  }

  // 8. Sorting — premium (active subscription, higher plan priority) always first
  const premiumFirstOrder = [
    { subscription: { status: 'asc' } },
    { subscription: { plan: { priority: 'desc' } } },
  ];

  let sortOrder: any = { createdAt: 'desc' };
  if (params.sort === 'a-z') sortOrder = { firstName: 'asc' };
  if (params.sort === 'z-a') sortOrder = { firstName: 'desc' };
  if (params.sort === 'most_viewed') sortOrder = { talentProfile: { views: 'desc' } };

  const orderBy = [...premiumFirstOrder, sortOrder];

  const [talents, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        image: true,
        isVerified: true,
        subscription: { select: { plan: { select: { name: true, slug: true } }, status: true } },
        talentProfile: {
          select: {
            categories: { select: { category: { select: { name: true } } } },
            city: { select: { name: true, country: { select: { name: true } } } },
            ethnicity: { select: { name: true } },
            gender: true,
            dob: true,
            views: true,
            bioDescription: true,
            skillDescription: true,
            height: true,
            weight: true,
            chest: true,
            waist: true,
            shoeSize: true,
            hairColor: true,
            media: { select: { id: true, url: true, type: true }, take: 4, orderBy: { createdAt: 'desc' } },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const R2_BASE = process.env.R2_PUBLIC_URL;
  const formattedTalents = talents.map(u => ({
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    image: u.image ? `${R2_BASE}/profile/${u.image}` : null,
    isVerified: u.isVerified,
    plan: u.subscription?.status === 'ACTIVE' ? u.subscription.plan.slug : null,
    categories: u.talentProfile?.categories.map(c => c.category.name) || [],
    city: u.talentProfile?.city?.name,
    country: u.talentProfile?.city?.country?.name,
    ethnicity: u.talentProfile?.ethnicity?.name,
    gender: u.talentProfile?.gender,
    age: calculateAge(u.talentProfile?.dob),
    views: u.talentProfile?.views ?? 0,
    bio: u.talentProfile?.bioDescription || null,
    skillDescription: u.talentProfile?.skillDescription || null,
    media: (u.talentProfile?.media || []).map(m => ({
      id: m.id,
      url: m.url,
      type: m.type,
    })),
    physical: {
      height: u.talentProfile?.height || null,
      weight: u.talentProfile?.weight || null,
      chest: u.talentProfile?.chest || null,
      waist: u.talentProfile?.waist || null,
      shoeSize: u.talentProfile?.shoeSize || null,
      hairColor: u.talentProfile?.hairColor || null,
    },
  }));

  return {
    data: formattedTalents,
    pagination: { total, page, totalPages: Math.ceil(total / limit) },
  };
};

// add this helper above getTalentFilterOptions
function dedupePrefixChains(values: string[]): string[] {
  const sorted = [...values].sort((a, b) => b.length - a.length); // longest first
  const kept: string[] = [];
  for (const v of sorted) {
    const isPrefixOfKept = kept.some(k => k.startsWith(v));
    if (!isPrefixOfKept) kept.push(v);
  }
  return kept.sort((a, b) => a.localeCompare(b));
}

const PHYSICAL_NUMERIC_FIELDS = ['height', 'weight', 'chest', 'waist', 'shoeSize'] as const;
const PHYSICAL_CATEGORICAL_FIELDS = ['hairColor', 'hairType', 'hairLength', 'eyeColor', 'bodyStructure', 'tattoo'] as const;

// Fetch options for dropdowns
export const getTalentCategoryCounts = async () => {
  const [rows, totalResult] = await Promise.all([
    prisma.$queryRawUnsafe<{ id: string; name: string; count: bigint }[]>(`
      SELECT c.id, c.name, COUNT(tc.id)::int as count
      FROM categories c
      LEFT JOIN (
        SELECT tc2."categoryId", tc2.id
        FROM talent_categories tc2
        JOIN talent_profiles tp2 ON tp2.id = tc2."talentProfileId"
        JOIN users u2 ON u2.id = tp2."userId"
          AND u2.role = 'TALENT' AND u2.status = 'ACTIVE' AND u2."profileCompleted" = true
      ) tc ON tc."categoryId" = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `),
    prisma.user.count({
      where: { role: 'TALENT', status: 'ACTIVE', profileCompleted: true },
    }),
  ]);
  return {
    categories: rows.map(r => ({ id: r.id, name: r.name, count: Number(r.count) })),
    total: totalResult,
  };
};

export const getTalentFilterOptions = async () => {
  const [categories, countries, cities] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.country.findMany({ orderBy: { name: 'asc' } }),
    prisma.city.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const [nationalities, ethnicities, languages] = await Promise.all([
    prisma.nationality.findMany({ orderBy: { name: 'asc' } }),
    prisma.ethnicity.findMany({ orderBy: { name: 'asc' } }),
    prisma.language.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const [dialects, attributeRows, physicalRows] = await Promise.all([
    prisma.dialect.findMany({ orderBy: { name: 'asc' } }),
    prisma.profileAttribute.findMany({ select: { key: true, value: true } }),
    prisma.talentProfile.findMany({
      select: {
        height: true, weight: true, chest: true, waist: true, shoeSize: true,
        hairColor: true, hairType: true, hairLength: true, eyeColor: true, bodyStructure: true, tattoo: true,
      },
    }),
  ]);

  const attributeValueSets: Record<string, Set<string>> = {};
  for (const row of attributeRows) {
    if (!row.value) continue;
    const parts = row.value.split(',').map(v => v.trim()).filter(Boolean);
    for (const part of parts) {
      (attributeValueSets[row.key] ??= new Set()).add(part);
    }
  }

  const attributeValues: Record<string, string[]> = {};
  for (const [key, set] of Object.entries(attributeValueSets)) {
    attributeValues[key] = dedupePrefixChains(Array.from(set)); // <-- added
  }


  // Numeric physical fields — dedupe, keep only valid numbers, sort ascending
  const physicalNumeric: Record<string, number[]> = {};
  for (const field of PHYSICAL_NUMERIC_FIELDS) {
    const set = new Set<number>();
    for (const row of physicalRows) {
      const raw = (row as any)[field];
      const num = raw != null ? parseFloat(raw) : NaN;
      if (!isNaN(num)) set.add(num);
    }
    physicalNumeric[field] = Array.from(set).sort((a, b) => a - b);
  }

  // Categorical physical fields — dedupe, sort alphabetically
  const physicalCategorical: Record<string, string[]> = {};
  for (const field of PHYSICAL_CATEGORICAL_FIELDS) {
    const set = new Set<string>();
    for (const row of physicalRows) {
      const val = (row as any)[field];
      if (val) set.add(val);
    }
    physicalCategorical[field] = Array.from(set).sort((a, b) => a.localeCompare(b));
  }


  return {
    categories, countries, cities, nationalities, ethnicities, languages, dialects,
    attributes: Object.keys(attributeValues),
    attributeValues,
    physicalNumeric,
    physicalCategorical,
  };
};
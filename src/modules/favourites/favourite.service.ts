import prisma from '../../config/db';

const R2_BASE = process.env.R2_PUBLIC_URL as string;

const calculateAge = (dob: Date | null | undefined): number | null => {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

export const addFavourite = async (userId: string, talentUserId: string) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) throw { statusCode: 404, message: 'Company profile not found' };

  const existing = await prisma.companyFavourite.findUnique({
    where: { companyId_talentUserId: { companyId: company.id, talentUserId } },
  });
  if (existing) return existing;

  return prisma.companyFavourite.create({
    data: { companyId: company.id, talentUserId },
  });
};

export const removeFavourite = async (userId: string, talentUserId: string) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) throw { statusCode: 404, message: 'Company profile not found' };

  const existing = await prisma.companyFavourite.findUnique({
    where: { companyId_talentUserId: { companyId: company.id, talentUserId } },
  });
  if (!existing) throw { statusCode: 404, message: 'Favourite not found' };

  await prisma.companyFavourite.delete({ where: { id: existing.id } });
  return { message: 'Removed from favourites' };
};

export const getFavouriteIds = async (userId: string) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) return [];

  const favs = await prisma.companyFavourite.findMany({
    where: { companyId: company.id },
    select: { talentUserId: true },
  });
  return favs.map(f => f.talentUserId);
};

interface FavouriteFilterParams {
  userId: string;
  search?: string;
  nationalities?: string[];
  gender?: string;
  ageFrom?: number;
  ageTo?: number;
}

export const getFavourites = async (params: FavouriteFilterParams) => {
  const { userId, search, nationalities, gender, ageFrom, ageTo } = params;

  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) throw { statusCode: 404, message: 'Company profile not found' };

  const where: any = {
    companyId: company.id,
    talent: {
      role: 'TALENT',
      status: 'ACTIVE',
      profileCompleted: true,
    },
  };

  const profileConditions: any = {};

  if (search) {
    where.talent.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      {
        talentProfile: {
          is: {
            OR: [
              { bioDescription: { contains: search, mode: 'insensitive' } },
              { skillDescription: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  if (nationalities?.length) {
    where.talent.nationalityId = { in: nationalities };
  }

  if (gender) {
    profileConditions.gender = gender;
  }

  if (ageFrom || ageTo) {
    const today = new Date();
    if (ageTo) profileConditions.dob = { gte: new Date(today.getFullYear() - ageTo, today.getMonth(), today.getDate()) };
    if (ageFrom) profileConditions.dob = { ...profileConditions.dob, lte: new Date(today.getFullYear() - ageFrom, today.getMonth(), today.getDate()) };
  }

  if (Object.keys(profileConditions).length) {
    where.talent.talentProfile = { is: profileConditions };
  }

  const [favourites, total] = await Promise.all([
    prisma.companyFavourite.findMany({
      where,
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
                ethnicity: { select: { name: true } },
                gender: true,
                dob: true,
                bioDescription: true,
                skillDescription: true,
                height: true,
                weight: true,
                chest: true,
                waist: true,
                shoeSize: true,
                hairColor: true,
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
    }),
    prisma.companyFavourite.count({ where }),
  ]);

  const formatted = favourites.map(f => {
    const t = f.talent;
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
      ethnicity: t.talentProfile?.ethnicity?.name,
      gender: t.talentProfile?.gender,
      age: calculateAge(t.talentProfile?.dob),
      bio: t.talentProfile?.bioDescription || null,
      skillDescription: t.talentProfile?.skillDescription || null,
      physical: {
        height: t.talentProfile?.height || null,
        weight: t.talentProfile?.weight || null,
        chest: t.talentProfile?.chest || null,
        waist: t.talentProfile?.waist || null,
        shoeSize: t.talentProfile?.shoeSize || null,
        hairColor: t.talentProfile?.hairColor || null,
      },
      media: (t.talentProfile?.media || []).map(m => ({
        id: m.id, url: m.url, type: m.type,
      })),
    };
  });

  return { data: formatted, total };
};

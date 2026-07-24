import prisma from '../../config/db';
import { comparePassword } from '../../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';

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

export const getTalents = async (page: number, limit: number, status?: string) => {
  const where: any = { role: 'TALENT' };
  if (status === 'active') where.status = 'ACTIVE';
  else if (status === 'inactive') where.status = 'INACTIVE';

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

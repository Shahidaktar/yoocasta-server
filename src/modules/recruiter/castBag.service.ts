import prisma from '../../config/db';
import { sendEmail } from '../../config/email';
import crypto from 'crypto';

const R2_BASE = process.env.R2_PUBLIC_URL as string;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const createCastBag = async (userId: string, name: string) => {
  const company = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!company) throw { statusCode: 404, message: 'Company profile not found' };

  return prisma.castBag.create({
    data: { ownerId: userId, name },
  });
};

export const getMyCastBags = async (userId: string) => {
  const bags = await prisma.castBag.findMany({
    where: { ownerId: userId },
    include: {
      _count: { select: { talents: true } },
      links: { select: { token: true, email: true, expiresAt: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return bags.map(b => ({
    id: b.id,
    name: b.name,
    talentCount: b._count.talents,
    createdAt: b.createdAt,
    links: b.links,
  }));
};

export const deleteCastBag = async (userId: string, bagId: string) => {
  const bag = await prisma.castBag.findFirst({ where: { id: bagId, ownerId: userId } });
  if (!bag) throw { statusCode: 404, message: 'Cast bag not found' };

  await prisma.castBag.delete({ where: { id: bagId } });
  return { message: 'Cast bag deleted' };
};

export const addTalentsToBag = async (userId: string, bagId: string, talentUserIds: string[]) => {
  const bag = await prisma.castBag.findFirst({ where: { id: bagId, ownerId: userId } });
  if (!bag) throw { statusCode: 404, message: 'Cast bag not found' };

  await prisma.castBagTalent.createMany({
    data: talentUserIds.map(talentUserId => ({ castBagId: bagId, talentUserId })),
    skipDuplicates: true,
  });

  return { message: `${talentUserIds.length} talent(s) added` };
};

export const shareCastBag = async (userId: string, bagId: string, emails: string[], validityDays: number) => {
  const bag = await prisma.castBag.findFirst({ where: { id: bagId, ownerId: userId }, include: { _count: { select: { talents: true } } } });
  if (!bag) throw { statusCode: 404, message: 'Cast bag not found' };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  const token = crypto.randomBytes(16).toString('hex');
  const link = await prisma.castBagLink.create({
    data: { castBagId: bagId, token, expiresAt },
  });

  const publicUrl = `${FRONTEND_URL}/cast-bag/${token}`;

   const emailPromises = emails.map(email =>
    sendEmail(
      email,
      `Cast Bag: ${bag.name} — Yoocasta`,
      `
      <div style="font-family:Arial;max-width:600px;margin:0 auto;">
        <h2 style="color:#3835A4;">Cast Bag Shared With You</h2>
        <p>You have been invited to view the cast bag <strong>${bag.name}</strong>.</p>
        <p>This bag contains <strong>${bag._count.talents}</strong> talent profile(s).</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${publicUrl}" style="background:#C6007E;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;">View Cast Bag</a>
        </div>
        <p style="color:#666;font-size:12px;">This link expires on ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      </div>
      `
      ).catch(err => console.error(`Failed to email ${email}:`, err))
  );


  await Promise.allSettled(emailPromises);
  return { message: `Cast bag shared with ${emails.length} recipient(s)` };
};

export const getPublicCastBag = async (token: string) => {
  const link = await prisma.castBagLink.findUnique({
    where: { token },
    include: {
      castBag: {
        include: {
          _count: { select: { talents: true } },
          talents: {
            include: {
              talent: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  image: true,
                  isVerified: true,
                  subscription: {
                    select: { plan: { select: { name: true, slug: true } }, status: true },
                  },
                  talentProfile: {
                    select: {
                      city: { select: { name: true, country: { select: { name: true } } } },
                      gender: true,
                      dob: true,
                      height: true,
                      weight: true,
                      chest: true,
                      waist: true,
                      shoeSize: true,
                      hairColor: true,
                      categories: { select: { category: { select: { name: true } } } },
                    },
                  },
                },
              },
            },
            orderBy: { addedAt: 'desc' },
          },
        },
      },
    },
  });

  if (!link || !link.status) throw { statusCode: 404, message: 'Cast bag not found or expired' };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) throw { statusCode: 410, message: 'This cast bag link has expired' };

  const bag = link.castBag;

  const calculateAge = (dob: Date | null | undefined): number | null => {
    if (!dob) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  return {
    name: bag.name,
    talentCount: bag._count.talents,
    talents: bag.talents.map(bt => ({
      id: bt.talent.id,
      username: bt.talent.username,
      firstName: bt.talent.firstName,
      lastName: bt.talent.lastName,
      image: bt.talent.image ? `${R2_BASE}/profile/${bt.talent.image}` : null,
      isVerified: bt.talent.isVerified,
      plan: bt.talent.subscription?.status === 'ACTIVE' ? bt.talent.subscription.plan.slug : null,
      categories: bt.talent.talentProfile?.categories.map(c => c.category.name) || [],
      city: bt.talent.talentProfile?.city?.name,
      country: bt.talent.talentProfile?.city?.country?.name,
      gender: bt.talent.talentProfile?.gender,
      age: calculateAge(bt.talent.talentProfile?.dob),
      physical: {
        height: bt.talent.talentProfile?.height || null,
        weight: bt.talent.talentProfile?.weight || null,
        chest: bt.talent.talentProfile?.chest || null,
        waist: bt.talent.talentProfile?.waist || null,
        shoeSize: bt.talent.talentProfile?.shoeSize || null,
        hairColor: bt.talent.talentProfile?.hairColor || null,
      },
    })),
  };
};

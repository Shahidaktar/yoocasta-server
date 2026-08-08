import prisma from '../../config/db';
import { sendEmail } from '../../config/email';
import { hashPassword, comparePassword } from '../../utils/hash';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const R2_BASE = process.env.R2_PUBLIC_URL as string;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET as string;

const generateGuestPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[bytes[i] % chars.length];
  return pw;
};

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

  const emailPromises = emails.map(async email => {
    const normalizedEmail = email.trim().toLowerCase();
    const password = generateGuestPassword();

    try {
      const passwordHash = await hashPassword(password);
      await prisma.castBagGuest.upsert({
        where: { linkId_email: { linkId: link.id, email: normalizedEmail } },
        update: { passwordHash, expiresAt },
        create: { linkId: link.id, email: normalizedEmail, passwordHash, expiresAt },
      });
    } catch (err) {
      console.error(`Failed to create feedback guest for ${email}:`, err);
      return;
    }

    await sendEmail(
      normalizedEmail,
      `Cast Bag: ${bag.name} — Yoocasta`,
      `
      <div style="font-family:Arial;max-width:600px;margin:0 auto;">
        <h2 style="color:#3835A4;">Cast Bag Shared With You</h2>
        <p>You have been invited to view the cast bag <strong>${bag.name}</strong>.</p>
        <p>This bag contains <strong>${bag._count.talents}</strong> talent profile(s).</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${publicUrl}" style="background:#C6007E;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;">View Cast Bag</a>
        </div>
        <div style="background:#f6f5ff;border:2px dashed #3835A4;border-radius:12px;padding:20px;margin:24px 0;">
          <h3 style="color:#3835A4;margin:0 0 12px;">Give Your Feedback</h3>
          <p style="color:#444;font-size:14px;">Use these one-time login credentials on the cast bag page to rate and give feedback for this cast bag:</p>
          <p style="margin:8px 0;"><strong style="color:#C6007E;">Email:</strong> <span style="font-family:monospace;">${normalizedEmail}</span></p>
          <p style="margin:8px 0;"><strong style="color:#C6007E;">Password:</strong> <span style="font-family:monospace;font-weight:bold;">${password}</span></p>
          <p style="color:#888;font-size:12px;margin-top:12px;">Credentials are only valid for feedback on this cast bag and expire on ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        </div>
        <p style="color:#666;font-size:12px;">The cast bag link expires on ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      </div>
      `
      ).catch(err => console.error(`Failed to email ${email}:`, err))
  });


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

export const validateFeedbackGuest = async (token: string, email: string, password: string, talentUserId?: string) => {
  const link = await prisma.castBagLink.findUnique({ where: { token } });
  if (!link || !link.status) throw { statusCode: 404, message: 'Cast bag not found or expired' };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) throw { statusCode: 410, message: 'This cast bag link has expired' };

  const normalizedEmail = email.trim().toLowerCase();
  const guest = await prisma.castBagGuest.findUnique({
    where: { linkId_email: { linkId: link.id, email: normalizedEmail } },
  });
  if (!guest) throw { statusCode: 401, message: 'Invalid feedback credentials for this cast bag' };
  if (guest.expiresAt < new Date()) throw { statusCode: 401, message: 'Feedback credentials have expired' };
  const passwordOk = await comparePassword(password, guest.passwordHash);
  if (!passwordOk) throw { statusCode: 401, message: 'Invalid feedback credentials for this cast bag' };

  const alreadySubmitted = talentUserId
    ? await prisma.castBagFeedback.findFirst({
        where: { linkId: link.id, reviewerEmail: guest.email, talentUserId },
      })
    : null;

  const remainingSeconds = Math.max(1, Math.floor((guest.expiresAt.getTime() - Date.now()) / 1000));
  const guestToken = jwt.sign(
    { type: 'castbag-guest', guestId: guest.id, linkId: link.id, email: guest.email },
    JWT_SECRET,
    { expiresIn: remainingSeconds } as jwt.SignOptions
  );

  return {
    email: guest.email,
    alreadySubmitted: Boolean(alreadySubmitted),
    guestToken,
  };
};

export const submitCastBagFeedback = async (
  token: string,
  payload: { guestToken: string; talentUserId: string; rating?: number; comment?: string; decision?: string }
) => {
  const { guestToken, talentUserId, rating, comment, decision } = payload;

  let decoded: any;
  try {
    decoded = jwt.verify(guestToken, JWT_SECRET);
  } catch {
    throw { statusCode: 401, message: 'Invalid or expired feedback session. Please log in again.' };
  }
  if (decoded.type !== 'castbag-guest') throw { statusCode: 401, message: 'Invalid feedback session' };

  const link = await prisma.castBagLink.findUnique({ where: { token } });
  if (!link || !link.status) throw { statusCode: 404, message: 'Cast bag not found or expired' };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) throw { statusCode: 410, message: 'This cast bag link has expired' };
  if (decoded.linkId !== link.id) throw { statusCode: 401, message: 'Invalid feedback session for this cast bag' };

  const guest = await prisma.castBagGuest.findUnique({ where: { id: decoded.guestId } });
  if (!guest || guest.linkId !== link.id) throw { statusCode: 401, message: 'Invalid feedback credentials' };
  if (guest.expiresAt < new Date()) throw { statusCode: 401, message: 'Feedback credentials have expired' };

  const existing = await prisma.castBagFeedback.findFirst({
    where: { linkId: link.id, reviewerEmail: guest.email, talentUserId },
  });
  if (existing) throw { statusCode: 409, message: 'Feedback already submitted for this talent' };

  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
    throw { statusCode: 400, message: 'Rating must be between 1 and 5' };
  }
  const decisions = ['Preferred', 'Reserve', 'Pass'];
  if (decision && !decisions.includes(decision)) {
    throw { statusCode: 400, message: 'Decision must be Preferred, Reserve or Pass' };
  }

  const bagOwner = await prisma.castBag.findUnique({
    where: { id: link.castBagId },
    select: { name: true, owner: { select: { email: true, firstName: true } } },
  });

  const talentInBag = await prisma.castBagTalent.findUnique({
    where: { castBagId_talentUserId: { castBagId: link.castBagId, talentUserId } },
    include: { talent: { select: { id: true, firstName: true, lastName: true, username: true } } },
  });
  if (!talentInBag) throw { statusCode: 404, message: 'Talent not found in this cast bag' };

  const feedback = await prisma.castBagFeedback.create({
    data: {
      linkId: link.id,
      talentUserId,
      reviewerName: guest.email,
      reviewerEmail: guest.email,
      rating: rating ?? null,
      comment: comment ?? null,
      decision: decision ?? null,
    },
  });

  const talentName = `${talentInBag.talent.firstName} ${talentInBag.talent.lastName || ''}`.trim();
  if (bagOwner?.owner?.email) {
    sendEmail(
      bagOwner.owner.email,
      `New Feedback on Cast Bag: ${bagOwner.name} — Yoocasta`,
      `
      <div style="font-family:Arial;max-width:600px;margin:0 auto;">
        <h2 style="color:#3835A4;">New Cast Bag Feedback</h2>
        <p>You received new feedback on your cast bag <strong>${bagOwner.name}</strong>.</p>
        <div style="background:#f6f5ff;border:2px dashed #3835A4;border-radius:12px;padding:20px;margin:20px 0;">
          <p style="margin:6px 0;"><strong style="color:#C6007E;">Talent:</strong> ${talentName}</p>
          <p style="margin:6px 0;"><strong style="color:#C6007E;">Decision:</strong> ${decision || '—'}</p>
          ${rating ? `<p style="margin:6px 0;"><strong style="color:#C6007E;">Rating:</strong> ${rating}/5</p>` : ''}
          ${comment ? `<p style="margin:6px 0;"><strong style="color:#C6007E;">Comment:</strong> "${comment}"</p>` : ''}
          <p style="margin:6px 0;"><strong style="color:#C6007E;">From:</strong> ${guest.email}</p>
        </div>
        <p style="color:#888;font-size:12px;">You can view all feedback in your recruiter dashboard.</p>
      </div>
      `
    ).catch(err => console.error(`Failed to send feedback alert to ${bagOwner.owner.email}:`, err));
  }

  return { message: 'Feedback submitted successfully', id: feedback.id };
};

export const castBagFeedbackStatus = async (token: string, guestToken: string, talentUserId: string) => {
  let decoded: any;
  try {
    decoded = jwt.verify(guestToken, JWT_SECRET);
  } catch {
    return { alreadySubmitted: false, valid: false };
  }
  if (decoded.type !== 'castbag-guest') return { alreadySubmitted: false, valid: false };

  const link = await prisma.castBagLink.findUnique({ where: { token } });
  if (!link || !link.status || decoded.linkId !== link.id) return { alreadySubmitted: false, valid: false };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return { alreadySubmitted: false, valid: false };

  const guest = await prisma.castBagGuest.findUnique({ where: { id: decoded.guestId } });
  if (!guest || guest.linkId !== link.id) return { alreadySubmitted: false, valid: false };
  if (guest.expiresAt < new Date()) return { alreadySubmitted: false, valid: false };

  const alreadySubmitted = talentUserId
    ? Boolean(await prisma.castBagFeedback.findFirst({
        where: { linkId: link.id, reviewerEmail: guest.email, talentUserId },
      }))
    : false;

  return {
    alreadySubmitted,
    valid: true,
    email: guest.email,
  };
};

export const getCastBagFeedbacks = async (userId: string, bagId: string) => {
  const bag = await prisma.castBag.findFirst({
    where: { id: bagId, ownerId: userId },
    include: {
      links: {
        include: {
          feedback: {
            include: {
              talent: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  username: true,
                  image: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });
  if (!bag) throw { statusCode: 404, message: 'Cast bag not found' };

  const feedbacks = bag.links
    .flatMap(link =>
      link.feedback.map(f => ({
        id: f.id,
        talent: {
          id: f.talent.id,
          firstName: f.talent.firstName,
          lastName: f.talent.lastName,
          username: f.talent.username,
          image: f.talent.image ? `${R2_BASE}/profile/${f.talent.image}` : null,
        },
        rating: f.rating,
        comment: f.comment,
        decision: f.decision,
        reviewerEmail: f.reviewerEmail,
        createdAt: f.createdAt,
        link: {
          token: link.token,
          email: link.email,
          expiresAt: link.expiresAt,
        },
      }))
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    bagId: bag.id,
    bagName: bag.name,
    total: feedbacks.length,
    feedbacks,
  };
};

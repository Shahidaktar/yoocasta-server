import prisma from '../../config/db';
import { hashPassword, comparePassword, generateOTP, generateEmailVerifyToken } from '../../utils/hash';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { sendEmail, otpEmailTemplate, recruiterWelcomeEmailTemplate, adminNewRecruiterNotificationTemplate, welcomeNewUserTemplate, adminNewTalentNotificationTemplate, welcomeEmailTemplate, verifyEmailTemplate } from '../../config/email';

// ─── Register Talent ───────────────────────────────────────────
export const registerTalent = async (data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw { statusCode: 409, message: 'Email already registered' };

  const hashedPassword = await hashPassword(data.password);

  const username = await generateUniqueUsername(data.firstName + data.lastName);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: 'TALENT',
      status: 'ACTIVE',
      talentProfile: { create: {} },
    },
  });

  // Send OTP for email verification
  const otp = generateOTP();
  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpCreatedAt: new Date() },
  });

  await sendEmail(
    user.email,
    'Verify your email — Yoocasta',
    otpEmailTemplate(data.firstName, otp)
  );

  await sendEmail(
    user.email,
    'Welcome to Yoocasta — Next Steps',
    welcomeNewUserTemplate(data.firstName)
  );

  await sendEmail(
    process.env.SMTP_USER || 'shahid.indoage@gmail.com',
    `New Talent Joined — ${data.firstName} ${data.lastName}`,
    adminNewTalentNotificationTemplate(`${data.firstName} ${data.lastName}`, user.email, data.phone || '')
  );

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

  return { user: sanitizeUser(user), accessToken, refreshToken };
};

// ─── Register Recruiter ────────────────────────────────────────
export const registerRecruiter = async (data: {
  companyName: string;
  contactPerson: string;
  email: string;
  password: string;
  phone?: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw { statusCode: 409, message: 'Email already registered' };

  const hashedPassword = await hashPassword(data.password);
  const username = await generateUniqueUsername(data.companyName);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username,
      password: hashedPassword,
      firstName: data.contactPerson,
      phone: data.phone,
      role: 'RECRUITER',
      status: 'ACTIVE',
      companyProfile: {
        create: {
          companyName: data.companyName,
          contactPerson: data.contactPerson,
        },
      },
    },
  });

  // Send OTP for email verification
  const otp = generateOTP();
  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpCreatedAt: new Date() },
  });

  await sendEmail(
    user.email,
    'Verify your email — Yoocasta',
    otpEmailTemplate(data.companyName, otp)
  );

  await sendEmail(
    user.email,
    'Welcome to Yoocasta — Next Steps',
    recruiterWelcomeEmailTemplate(data.contactPerson)
  );

  await sendEmail(
    process.env.SMTP_USER || 'shahid.indoage@gmail.com',
    `New Recruiter Joined — ${data.companyName}`,
    adminNewRecruiterNotificationTemplate(data.contactPerson, data.companyName, user.email)
  );

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

  return { user: sanitizeUser(user), accessToken, refreshToken };
};

// ─── Login ─────────────────────────────────────────────────────
export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { statusCode: 401, message: 'Invalid email or password' };

  if (user.status === 'INACTIVE') throw { statusCode: 403, message: 'Account is inactive' };

 // Handle migrated users with placeholder password
  if (user.password === 'MIGRATED_NO_PASSWORD_SET') {
    throw { statusCode: 401, message: 'Please reset your password to continue' };
  }

  // Detect MD5 hash (32 char hex) — old CodeIgniter users
  const isMd5 = /^[a-f0-9]{32}$/.test(user.password);

  if (isMd5) {
    // Verify using MD5
    const crypto = await import('crypto');
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    if (md5Hash !== user.password) {
      throw { statusCode: 401, message: 'Invalid email or password' };
    }
    // Auto-upgrade to bcrypt
    const newHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHash },
    });
  } else {
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) throw { statusCode: 401, message: 'Invalid email or password' };
  }

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

  return { user: sanitizeUser(user), accessToken, refreshToken };
};

// ─── Refresh Token ─────────────────────────────────────────────
export const refreshToken = async (token: string) => {
  const decoded = verifyRefreshToken(token);

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) throw { statusCode: 401, message: 'User not found' };

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

  return { accessToken, refreshToken: newRefreshToken };
};

// ─── Forgot Password ───────────────────────────────────────────
export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { statusCode: 404, message: 'No account found with this email' };

  const otp = generateOTP();
  const otpCreatedAt = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpCreatedAt },
  });

  await sendEmail(
    user.email,
    'Password Reset OTP — Yoocasta',
    otpEmailTemplate(user.firstName || 'User', otp)
  );

  return { message: 'OTP sent to your email' };
};

// ─── Verify OTP ────────────────────────────────────────────────
export const verifyOtp = async (email: string, otp: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.otp || !user.otpCreatedAt) {
    throw { statusCode: 400, message: 'Invalid or expired OTP' };
  }

  // Check OTP expiry (10 minutes)
  const now = new Date();
  const otpAge = (now.getTime() - new Date(user.otpCreatedAt).getTime()) / 1000 / 60;
  if (otpAge > 10) throw { statusCode: 400, message: 'OTP has expired' };

  if (user.otp !== otp) throw { statusCode: 400, message: 'Invalid OTP' };

  return { message: 'OTP verified successfully' };
};

// ─── Reset Password ────────────────────────────────────────────
export const resetPassword = async (email: string, otp: string, newPassword: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.otp || !user.otpCreatedAt) {
    throw { statusCode: 400, message: 'Invalid or expired OTP' };
  }

  const now = new Date();
  const otpAge = (now.getTime() - new Date(user.otpCreatedAt).getTime()) / 1000 / 60;
  if (otpAge > 10) throw { statusCode: 400, message: 'OTP has expired' };

  if (user.otp !== otp) throw { statusCode: 400, message: 'Invalid OTP' };

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      otp: null,
      otpCreatedAt: null,
    },
  });

  return { message: 'Password reset successfully' };
};

// ─── Helpers ───────────────────────────────────────────────────
const generateUniqueUsername = async (base: string): Promise<string> => {
  const slug = base.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
  let username = slug;
  let count = 1;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${slug}${count}`;
    count++;
  }

  return username;
};

const sanitizeUser = (user: any) => {
  const { password, otp, otpCreatedAt, resetPassKey, resetPassKeyCreatedAt, emailVerifyToken, emailVerifyTokenCreatedAt, ...safe } = user;
  return safe;
};


export const verifyEmail = async (token: string) => {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
  });

  if (!user) throw { statusCode: 400, message: 'Invalid or expired verification link' };

  // Check token expiry (24 hours)
  const now = new Date();
  const tokenAge = (now.getTime() - new Date(user.emailVerifyTokenCreatedAt!).getTime()) / 1000 / 60 / 60;
  if (tokenAge > 24) throw { statusCode: 400, message: 'Verification link has expired — please request a new one' };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerifyToken: null,
      emailVerifyTokenCreatedAt: null,
    },
  });

  return { message: 'Email verified successfully' };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { statusCode: 404, message: 'No account found with this email' };
  if (user.isEmailVerified) throw { statusCode: 400, message: 'Email is already verified' };

  const otp = generateOTP();
  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpCreatedAt: new Date() },
  });

  await sendEmail(
    user.email,
    'Verify your email — Yoocasta',
    otpEmailTemplate(user.firstName || 'User', otp)
  );

  return { message: 'OTP sent successfully' };
};


export const verifyEmailOtp = async (email: string, otp: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { statusCode: 404, message: 'User not found' };
  if (user.isEmailVerified) throw { statusCode: 400, message: 'Email already verified' };
  if (!user.otp || !user.otpCreatedAt) throw { statusCode: 400, message: 'OTP not found — please request a new one' };

  const otpAge = (new Date().getTime() - new Date(user.otpCreatedAt).getTime()) / 1000 / 60;
  if (otpAge > 10) throw { statusCode: 400, message: 'OTP has expired — please request a new one' };
  if (user.otp !== otp) throw { statusCode: 400, message: 'Invalid OTP' };

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, otp: null, otpCreatedAt: null },
  });

  return { message: 'Email verified successfully' };
};
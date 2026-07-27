import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
};

export const otpEmailTemplate = (name: string, otp: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Password Reset OTP</h2>
      <p>Hi ${name},</p>
      <p>Your OTP for password reset is:</p>
      <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <h1 style="color: #e74c3c; letter-spacing: 8px; font-size: 36px;">${otp}</h1>
      </div>
      <p>This OTP is valid for <strong>10 minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const welcomeEmailTemplate = (name: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Yoocasta!</h2>
      <p>Hi ${name},</p>
      <p>Your account has been created successfully.</p>
      <p>You can now log in and complete your profile.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const recruiterWelcomeEmailTemplate = (name: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Yoocasta!</h2>
      <p>Hi ${name},</p>
      <p>Your recruiter account has been created successfully.</p>
      <p>To get full access to all features, please complete the following steps:</p>
      <ol>
        <li><strong>Verify your email</strong> — Use the OTP sent in the previous email.</li>
        <li><strong>Complete your company profile</strong> — Log in and fill in your details.</li>
      </ol>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/login"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Log In to Yoocasta
        </a>
      </div>
      <p>If you have any questions, feel free to contact our support team.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const adminNewRecruiterNotificationTemplate = (
  recruiterName: string,
  companyName: string,
  recruiterEmail: string
): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Recruiter Registration</h2>
      <p>Hi Admin,</p>
      <p>A new recruiter has joined Yoocasta:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Name</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${recruiterName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Company</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Email</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${recruiterEmail}</td>
        </tr>
      </table>
      <p>Please review and verify the recruiter's account from the admin panel.</p>
      <p>Thanks,<br/>Yoocasta System</p>
    </div>
  `;
};

export const welcomeNewUserTemplate = (name: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Yoocasta!</h2>
      <p>Hi ${name},</p>
      <p>Your account has been created successfully.</p>
      <p>To get full access to all features, please complete the following steps:</p>
      <ol>
        <li><strong>Verify your email</strong> — Use the OTP sent in the previous email.</li>
        <li><strong>Complete your profile</strong> — Log in and fill in your details.</li>
      </ol>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/login"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Log In to Yoocasta
        </a>
      </div>
      <p>If you have any questions, feel free to contact our support team.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const adminNewTalentNotificationTemplate = (
  name: string,
  email: string,
  phone: string
): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Talent Registration</h2>
      <p>Hi Admin,</p>
      <p>A new talent has joined Yoocasta:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Name</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Email</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Phone</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${phone || '—'}</td>
        </tr>
      </table>
      <p>Thanks,<br/>Yoocasta System</p>
    </div>
  `;
};

export const recruiterVerifiedEmailTemplate = (companyName: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Account Verified</h2>
      <p>Hi ${companyName},</p>
      <p>Your account has been verified by the admin team.</p>
      <p>You now have full access to all features, including posting jobs and inviting talent.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/dashboard/recruiter"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Go to Dashboard
        </a>
      </div>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const jobUnderReviewTemplate = (name: string, jobTitle: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Job Under Review</h2>
      <p>Hi ${name},</p>
      <p>Your job <strong>"${jobTitle}"</strong> has been submitted successfully and is now under review by our admin team.</p>
      <p>We will notify you once it has been approved or rejected.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/dashboard/recruiter/jobs"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          View My Jobs
        </a>
      </div>
      <p>If you have any questions, feel free to contact our support team.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const adminNewJobNotificationTemplate = (
  companyName: string,
  jobTitle: string,
  jobId: string
): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Job Posted — Needs Review</h2>
      <p>Hi Admin,</p>
      <p>A new job has been posted by <strong>${companyName}</strong>:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Company</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Job Title</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${jobTitle}</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/admin/jobs"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Review Job
        </a>
      </div>
      <p>Thanks,<br/>Yoocasta System</p>
    </div>
  `;
};

export const jobApprovedTemplate = (name: string, jobTitle: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Job Approved</h2>
      <p>Hi ${name},</p>
      <p>Your job <strong>"${jobTitle}"</strong> has been approved and is now live on Yoocasta.</p>
      <p>Talents can now view and apply for this job.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/dashboard/recruiter/jobs"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          View My Jobs
        </a>
      </div>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const jobRejectedTemplate = (name: string, jobTitle: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Job Not Approved</h2>
      <p>Hi ${name},</p>
      <p>Your job <strong>"${jobTitle}"</strong> has been reviewed and was not approved.</p>
      <p>Please review the job details and contact our support team if you have any questions.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${frontendUrl}/dashboard/recruiter/jobs"
           style="background: #3835A4; color: white; padding: 14px 30px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          View My Jobs
        </a>
      </div>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const applicationConfirmationTemplate = (name: string, jobTitle: string, roleTitle: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3835A4;">Application Submitted</h2>
      <p>Hi ${name},</p>
      <p>Your application has been submitted successfully.</p>
      <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C6007E;">
        <p style="margin: 4px 0;"><strong>Job:</strong> ${jobTitle}</p>
        <p style="margin: 4px 0;"><strong>Role:</strong> ${roleTitle}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #C6007E; font-weight: bold;">Applied</span></p>
      </div>
      <p>You will be notified when the recruiter reviews your application.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const newApplicationNotificationTemplate = (
  companyName: string,
  talentName: string,
  jobTitle: string,
  roleTitle: string
): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3835A4;">New Application Received</h2>
      <p>Hi ${companyName},</p>
      <p>A new application has been submitted for your job posting.</p>
      <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C6007E;">
        <p style="margin: 4px 0;"><strong>Talent:</strong> ${talentName}</p>
        <p style="margin: 4px 0;"><strong>Job:</strong> ${jobTitle}</p>
        <p style="margin: 4px 0;"><strong>Role:</strong> ${roleTitle}</p>
      </div>
      <p>Log in to your dashboard to review the application.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};

export const verifyEmailTemplate = (name: string, verifyUrl: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Verify Your Email</h2>
      <p>Hi ${name},</p>
      <p>Please click the button below to verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" 
           style="background: #e74c3c; color: white; padding: 14px 30px; 
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Verify Email
        </a>
      </div>
      <p>Or copy this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      <p>If you did not create an account, ignore this email.</p>
      <p>Thanks,<br/>Yoocasta Team</p>
    </div>
  `;
};
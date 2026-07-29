import prisma from '../../config/db';

interface GetPublicProfileParams {
  username: string;
  viewerUserId?: string;
  viewerRole?: string;
}

export const getPublicProfile = async (params: GetPublicProfileParams) => {
  const { username, viewerUserId, viewerRole } = params;

  // 1. Find user by username
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      subscription: { include: { plan: true } },
      talentProfile: {
        include: {
          categories: { include: { category: true } },
          languages: { include: { language: true } },
          dialects: { include: { dialect: true } },
          attributes: true,
          media: { orderBy: { order: 'asc' } },
          careerHistory: { orderBy: { startDate: 'desc' } },
          courses: {},
          ethnicity: true,
          city: { include: { country: true } },
        }
      },
      nationality: true,
    }
  });

  if (!user || !user.talentProfile) {
    throw { statusCode: 404, message: 'Talent profile not found' };
  }

  // 2. Increment views — TalentProfile is the only model that has this field
  const updatedProfile = await prisma.talentProfile.update({
    where: { userId: user.id },
    data: { views: { increment: 1 } },
    select: { views: true }, // grab the authoritative post-increment count
  });

  // 3. Internal Company visibility check
  let showContacts = false;
  if (viewerRole === 'RECRUITER' && viewerUserId) {
    const recruiterCompany = await prisma.companyProfile.findFirst({
      where: { userId: viewerUserId }
    });
    showContacts = recruiterCompany?.isInternalCompany === true;
  }

  // 4. Construct safe response
  const R2_BASE = process.env.R2_PUBLIC_URL;
  const safeUser = {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    image: user.image ? `${R2_BASE}/profile/${user.image}` : null,
    isVerified: user.isVerified,
    nationality: user.nationality,
    subscription: user.subscription,
    ...(showContacts ? { email: user.email, phone: user.phone } : { email: null, phone: null }),
    talentProfile: {
      ...user.talentProfile,
      views: updatedProfile.views, // correct, updated count
      ...(showContacts ? {
        whatsappNo: user.talentProfile.whatsappNo,
        contactNumber: user.talentProfile.contactNumber,
        contactEmail: user.talentProfile.contactEmail,
      } : {
        whatsappNo: null,
        contactNumber: null,
        contactEmail: null,
      })
    }
  };

  return safeUser;
};
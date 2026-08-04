import prisma from '../../config/db';
import { uploadToR2, deleteFromR2 } from '../../config/r2';

// ─── Get Profile ───────────────────────────────────────────────
export const getMyProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: { include: { plan: true } },
      talentProfile: {
        include: {
          categories: { include: { category: true } },
          languages: { include: { language: true } },
          dialects: { include: { dialect: true } },
          attributes: true,
          media: { orderBy: { order: 'asc' } },
          careerHistory: { orderBy: { startDate: 'desc' } }, // ADDED
          courses: {}, // ADDED
          ethnicity: true,
          city: { include: { country: true } },
        }
      },
      nationality: true,
      city: true,
    }
  });

  if (!user) throw { statusCode: 404, message: 'User not found' };

  // Add full R2 URL for profile image
  const R2_BASE = process.env.R2_PUBLIC_URL;
  return {
    ...user,
    image: user.image ? `${R2_BASE}/profile/${user.image}` : null,
    password: undefined,
    otp: undefined,
    otpCreatedAt: undefined,
  };
};

// ─── Get Portfolio Media (MOVED FROM CONTROLLER) ─────────────
export const getPortfolioMedia = async (userId: string) => {
  const profile = await prisma.talentProfile.findUnique({
    where: { userId },
    include: { media: { orderBy: { createdAt: 'desc' } } }
  });
  if (!profile) throw { statusCode: 404, message: 'Profile not found' };
  return profile.media;
};

// ─── Get Form Options ──────────────────────────────────────────
export const getFormOptions = async () => {
  const [nationalities, countries, cities, categories, languages, dialects, ethnicities] = await Promise.all([
    prisma.nationality.findMany({ orderBy: { name: 'asc' } }),
    prisma.country.findMany({ orderBy: { name: 'asc' } }),
    prisma.city.findMany({ orderBy: { name: 'asc' }, include: { country: true } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.language.findMany({ orderBy: { name: 'asc' } }),
    prisma.dialect.findMany({ orderBy: { name: 'asc' } }),
    prisma.ethnicity.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return { nationalities, countries, cities, categories, languages, dialects, ethnicities };
};

// ─── Step 1: Basic Info ────────────────────────────────────────
export const updateBasicInfo = async (userId: string, data: any) => {
  const { middleName, whatsappNo, dob, gender, nationalityId, ethnicityId,
    languageIds, dialectIds, countryId, cityId, address } = data;

  // Calculate age from DOB
  let age = null;
  if (dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  }

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: { middleName, whatsappNo, cityId: cityId || null, nationalityId: nationalityId || null },
  });

  // Update talent profile
  const profile = await prisma.talentProfile.upsert({
    where: { userId },
    create: { userId, gender, dob: dob ? new Date(dob) : null, age, ethnicityId: ethnicityId || null, cityId: cityId || null, address },
    update: { gender, dob: dob ? new Date(dob) : null, age, ethnicityId: ethnicityId || null, cityId: cityId || null, address },
  });

  // Update languages
  if (languageIds && Array.isArray(languageIds)) {
    await prisma.talentLanguage.deleteMany({ where: { talentProfileId: profile.id } });
    await prisma.talentLanguage.createMany({
      data: languageIds.map((languageId: string) => ({ talentProfileId: profile.id, languageId })),
      skipDuplicates: true,
    });
  }

  // Update dialects
  if (dialectIds && Array.isArray(dialectIds)) {
    await prisma.talentDialect.deleteMany({ where: { talentProfileId: profile.id } });
    await prisma.talentDialect.createMany({
      data: dialectIds.map((dialectId: string) => ({ talentProfileId: profile.id, dialectId })),
      skipDuplicates: true,
    });
  }

  return { message: 'Basic info updated successfully' };
};

// ─── Step 2: Physical Attributes ───────────────────────────────
export const updatePhysicalAttributes = async (userId: string, data: any) => {
  const { height, weight, hairColor, hairType, hairLength,
    eyeColor, chest, waist, shoeSize, bodyStructure, tattoo } = data;

  await prisma.talentProfile.upsert({
    where: { userId },
    create: { userId, height, weight, hairColor, hairType, hairLength, eyeColor, chest, waist, shoeSize, bodyStructure, tattoo },
    update: { height, weight, hairColor, hairType, hairLength, eyeColor, chest, waist, shoeSize, bodyStructure, tattoo },
  });

  return { message: 'Physical attributes updated successfully' };
};

// ─── Step 3: Categories & Skills ───────────────────────────────
export const updateCategoriesAndSkills = async (userId: string, data: any) => {
  const { categoryIds, attributes } = data;

  const profile = await prisma.talentProfile.findUnique({ where: { userId } });
  if (!profile) throw { statusCode: 404, message: 'Profile not found' };

  // Update categories
  if (categoryIds && Array.isArray(categoryIds)) {
    await prisma.talentCategory.deleteMany({ where: { talentProfileId: profile.id } });
    await prisma.talentCategory.createMany({
      data: categoryIds.map((categoryId: string) => ({ talentProfileId: profile.id, categoryId })),
      skipDuplicates: true,
    });
  }

  // Update category-specific attributes
  if (attributes && Array.isArray(attributes)) {
    await prisma.profileAttribute.deleteMany({ where: { talentProfileId: profile.id } });
    await prisma.profileAttribute.createMany({
      data: attributes.map((attr: any) => ({
        talentProfileId: profile.id,
        categoryId: attr.categoryId,
        key: attr.key,
        value: attr.value,
      })),
      skipDuplicates: true,
    });
  }

  return { message: 'Categories and skills updated successfully' };
};

// ─── Step 4: Bio & Description ─────────────────────────────────
export const updateBioAndDescription = async (userId: string, data: any) => {
  const { bioDescription, skillDescription, facebook, twitter, linkedin } = data;

  await prisma.talentProfile.upsert({
    where: { userId },
    create: { userId, bioDescription, skillDescription, facebook, twitter, linkedin },
    update: { bioDescription, skillDescription, facebook, twitter, linkedin },
  });

  return { message: 'Bio and description updated successfully' };
};

// ─── Step 5: Upload Profile Photo ──────────────────────────────
export const uploadProfilePhotoService = async (userId: string, file: Express.Multer.File) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  // CLEANED UP: Simplified logic. user.image stores only the filename (e.g., '123.jpg')
  if (user?.image) {
    try {
      await deleteFromR2(`${process.env.R2_PUBLIC_URL}/profile/${user.image}`);
    } catch (e) { 
      // Ignore delete error (file might not exist in R2 if it was a legacy migrated image)
    }
  }

  const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, 'profile');
  const fileName = url.split('/').pop()!;

  await prisma.user.update({
    where: { id: userId },
    data: { image: fileName },
  });
  
  // Mark profile as complete
  await checkProfileComplete(userId);

  return { image: url, message: 'Profile photo uploaded successfully' };
};

// ─── Check & Mark Profile Complete ────────────────────────────
export const checkProfileComplete = async (userId: string) => {
  const profile = await prisma.talentProfile.findUnique({
    where: { userId },
    include: { categories: true }
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  const isComplete = !!(
    profile &&
    profile.gender &&
    profile.dob &&
    profile.height &&
    profile.bioDescription &&
    profile.categories.length > 0 &&
    user?.image
  );

  if (isComplete && !user?.profileCompleted) {
    await prisma.user.update({
      where: { id: userId },
      data: { profileCompleted: true },
    });

    // Auto-assign Basic plan if talent has no subscription yet
    if (!user?.subscription) {
      const basicPlan = await prisma.plan.findFirst({
        where: { slug: 'basic' },
      });

      if (basicPlan) {
        await prisma.userSubscription.create({
          data: {
            userId,
            planId: basicPlan.id,
            status: 'ACTIVE',
            activatedAt: new Date(),
          },
        });
      }
    }
  }

  return { isComplete };
};

export const uploadPortfolioMediaService = async (userId: string, file: Express.Multer.File, type: string) => {
  const profile = await prisma.talentProfile.findUnique({ where: { userId } });
  if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    let folder = '';
  let mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'ACTING_VIDEO' | 'CASTING_VIDEO' = 'IMAGE';

  if (type === 'IMAGE') { 
    folder = 'actors'; 
    mediaType = 'IMAGE'; 
  } else if (type === 'VIDEO' || type === 'ACTING_VIDEO' || type === 'CASTING_VIDEO') {
    // All actual video files go to the same R2 folder, but keep their specific type
    folder = 'profile_video'; 
    mediaType = type; 
  } else if (type === 'AUDIO') { 
    folder = 'audio'; 
    mediaType = 'AUDIO'; 
  }

  const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, folder);

  const media = await prisma.portfolioMedia.create({
    data: {
      talentProfileId: profile.id,
      type: mediaType,
      url,
      order: 0,
    }
  });

  return media;
};

export const deletePortfolioMediaService = async (userId: string, mediaId: string) => {
  const profile = await prisma.talentProfile.findUnique({ where: { userId } });
  if (!profile) throw { statusCode: 404, message: 'Profile not found' };

  const media = await prisma.portfolioMedia.findFirst({
    where: { id: mediaId, talentProfileId: profile.id }
  });
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  // Delete from R2
   // Delete from R2
  if (media.url) {
    try {
      await deleteFromR2(media.url);
    } catch (e) { /* ignore */ }
  }

  await prisma.portfolioMedia.delete({ where: { id: mediaId } });

  return { message: 'Media deleted successfully' };
};



  // ─── Career History CRUD ────────────────────────────────────
  export const addCareerHistory = async (userId: string, data: { title: string; description?: string; startDate?: string; endDate?: string }) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    await prisma.careerHistory.create({
      data: {
        talentProfileId: profile.id,
        title: data.title,
        description: data.description || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      }
    });

    return { message: 'Career history added successfully' };
  };

  export const updateCareerHistory = async (userId: string, historyId: string, data: { title?: string; description?: string; startDate?: string; endDate?: string }) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    const history = await prisma.careerHistory.findFirst({
      where: { id: historyId, talentProfileId: profile.id }
    });
    if (!history) throw { statusCode: 404, message: 'Career history not found' };

    await prisma.careerHistory.update({
      where: { id: historyId },
      data: {
        title: data.title ?? history.title,
        description: data.description !== undefined ? data.description : history.description,
        startDate: data.startDate ? new Date(data.startDate) : history.startDate,
        endDate: data.endDate !== undefined ? new Date(data.endDate) : history.endDate,
      }
    });

    return { message: 'Career history updated successfully' };
  };

  export const deleteCareerHistory = async (userId: string, historyId: string) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    const history = await prisma.careerHistory.findFirst({
      where: { id: historyId, talentProfileId: profile.id }
    });
    if (!history) throw { statusCode: 404, message: 'Career history not found' };

    await prisma.careerHistory.delete({ where: { id: historyId } });

    return { message: 'Career history deleted successfully' };
  };

  // ─── Talent Courses CRUD ───────────────────────────────────────
  export const addCourse = async (userId: string, data: { title: string; institution?: string; year?: number }) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    await prisma.talentCourse.create({
      data: {
        talentProfileId: profile.id,
        title: data.title,
        institution: data.institution || null,
        year: data.year || null,
      }
    });

    return { message: 'Course added successfully' };
  };

  export const updateCourse = async (userId: string, courseId: string, data: { title?: string; institution?: string; year?: number }) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    const course = await prisma.talentCourse.findFirst({
      where: { id: courseId, talentProfileId: profile.id }
    });
    if (!course) throw { statusCode: 404, message: 'Course not found' };

    await prisma.talentCourse.update({
      where: { id: courseId },
      data: {
        title: data.title ?? course.title,
        institution: data.institution !== undefined ? data.institution : course.institution,
        year: data.year !== undefined ? data.year : course.year,
      }
    });

    return { message: 'Course updated successfully' };
  };

  export const deleteCourse = async (userId: string, courseId: string) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    const course = await prisma.talentCourse.findFirst({
      where: { id: courseId, talentProfileId: profile.id }
    });
    if (!course) throw { statusCode: 404, message: 'Course not found' };

    await prisma.talentCourse.delete({ where: { id: courseId } });

    return { message: 'Course deleted successfully' };
  };

  // ─── Portfolio Video Link (No File Upload) ────────────────────
  export const addPortfolioLinkService = async (userId: string, data: { videoLink: string; title?: string; type?: 'VIDEO_LINK' | 'CASTING_VIDEO' | 'ACTING_VIDEO' }) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    if (!data.videoLink) throw { statusCode: 400, message: 'Video link is required' };

    const media = await prisma.portfolioMedia.create({
      data: {
        talentProfileId: profile.id,
        type: data.type || 'VIDEO_LINK',
        videoLink: data.videoLink,
        title: data.title || null,
        order: 0,
      }
    });

    return media;
  };

  // ─── Portfolio Media Reordering ────────────────────────────────
  export const reorderPortfolioMedia = async (userId: string, mediaIds: string[]) => {
    const profile = await prisma.talentProfile.findUnique({ where: { userId } });
    if (!profile) throw { statusCode: 404, message: 'Profile not found' };

    // Validate all IDs belong to this user before updating
    const existingMedia = await prisma.portfolioMedia.findMany({
      where: { id: { in: mediaIds }, talentProfileId: profile.id }
    });

    if (existingMedia.length !== mediaIds.length) {
      throw { statusCode: 400, message: 'Invalid media IDs detected' };
    }

    // Update order in a batch
    await Promise.all(
      mediaIds.map((id, index) =>
        prisma.portfolioMedia.update({
          where: { id },
          data: { order: index }
        })
      )
    );

    return { message: 'Portfolio reordered successfully' };
  };
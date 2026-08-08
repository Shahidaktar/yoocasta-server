import prisma from '../../config/db';

const parseVideoArray = (raw: string): any[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseTestimonialsArray = (raw: string): any[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseFaqArray = (raw: string): any[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getPublicCmsPage = async (key: string) => {
  const page = await prisma.cmsPage.findUnique({ where: { pageKey: key } });
  if (!page) return null;

  return {
    pageKey: page.pageKey,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    pageHeading: page.pageHeading,
    subHeading: page.subHeading,
    pageDescription: page.pageDescription,
    address: page.address,
    phone: page.phone,
    email: page.email,
    videoUrl: page.videoUrl,
    bottomHeading: page.bottomHeading,
    bottomDescription: page.bottomDescription,
    talentFaqs: page.talentFaqs,
    companyFaqs: page.companyFaqs,
    videoSection: parseVideoArray(page.videoSection),
    testimonialsSection: parseTestimonialsArray(page.testimonialsSection),
    faqSection: parseFaqArray(page.faqSection),
    body: page.body,
  };
};

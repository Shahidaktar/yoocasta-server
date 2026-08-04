import prisma from '../../config/db';

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
    body: page.body,
  };
};

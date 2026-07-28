import prisma from '../../config/db';

export const CATEGORY_MAP: Record<number, string> = {
  1: 'Actors & Extras',
  2: 'Models',
  3: 'Dancers',
  4: 'Singers',
  5: 'Photographers',
  6: 'Directors & Crew',
  7: 'Promoters & Hosts',
  8: 'Makeup & Hair Artists',
  9: 'Cinematographers / Videographers',
  10: 'Voice Over Artists',
  11: 'MC/RJ/VJ/Voice Over',
};

export const getPublicBlogs = async (query: any) => {
  const { categoryId, page = '1', limit = '12' } = query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (categoryId) {
    where.categoryCategoryId = BigInt(categoryId);
  }

  const [blogs, total] = await Promise.all([
    prisma.blog.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { blogDate: 'desc' },
    }),
    prisma.blog.count({ where }),
  ]);

  const mapped = blogs.map((b) => ({
    id: Number(b.id),
    categoryId: b.categoryCategoryId ? Number(b.categoryCategoryId) : null,
    category: b.categoryCategoryId ? (CATEGORY_MAP[Number(b.categoryCategoryId)] || 'General') : 'General',
    title: b.blogTitle || '',
    description: b.blogDescription || '',
    date: b.blogDate || '',
    image: b.blogImage || '',
  }));

  return {
    blogs: mapped,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

export const getBlogById = async (blogId: number) => {
  const blog = await prisma.blog.findUnique({
    where: { id: BigInt(blogId) },
  });

  if (!blog) return null;

  return {
    id: Number(blog.id),
    categoryId: blog.categoryCategoryId ? Number(blog.categoryCategoryId) : null,
    category: blog.categoryCategoryId ? (CATEGORY_MAP[Number(blog.categoryCategoryId)] || 'General') : 'General',
    title: blog.blogTitle || '',
    description: blog.blogDescription || '',
    date: blog.blogDate || '',
    image: blog.blogImage || '',
  };
};

export const getCategories = async () => {
  return Object.entries(CATEGORY_MAP).map(([id, name]) => ({
    id: Number(id),
    name,
  }));
};

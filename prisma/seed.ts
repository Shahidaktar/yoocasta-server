import prisma from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const seed = async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@yoocasta.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const name = process.env.ADMIN_NAME || 'Admin';

  const hashed = await hashPassword(password);

  const admin = await prisma.admin.upsert({
    where: { email },
    create: { email, password: hashed, name },
    update: { password: hashed, name },
  });

  const action = admin.createdAt === admin.updatedAt ? 'created' : 'updated';
  console.log(`Admin ${action}: ${email} / ${password}`);
};

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

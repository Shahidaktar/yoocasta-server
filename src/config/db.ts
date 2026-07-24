import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL?.includes('?')
  ? process.env.DATABASE_URL + '&connection_limit=15'
  : process.env.DATABASE_URL + '?connection_limit=15';

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
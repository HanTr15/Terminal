// Prisma client singleton, dibuat secara lazy.
//
// Dua alasan:
//  1. Di serverless (Vercel), modul bisa dimuat ulang tiap request. Tanpa
//     singleton, koneksi ke Neon menumpuk sampai habis. Instance disimpan
//     di globalThis supaya dipakai ulang selama instance masih hangat.
//  2. Client baru dibuat saat benar-benar dipakai, bukan saat modul di-import.
//     Ini mencegah kegagalan pada tahap build Next.js (yang sempat memuat
//     modul route) kalau `prisma generate` belum sempat jalan.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getClient() {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createClient();
  }
  return globalForPrisma.__prisma;
}

// Proxy: koneksi baru dibuka saat properti pertama kali diakses
// (contoh: prisma.session.findUnique), bukan saat file ini di-import.
export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

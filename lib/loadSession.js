// Memuat state sesi seorang peserta: dari cache memori kalau ada,
// kalau tidak dari Neon (dan membuat baris baru kalau ini kunjungan pertama).
// Dipakai oleh /api/terminal (baca+tulis) dan /api/complete (baca saja).

import { prisma } from './db';
import { newSessionState } from './shell';
import { cacheGet, cacheSet } from './sessionCache';

export async function loadState(sessionId) {
  const cached = cacheGet(sessionId);
  if (cached) return cached;

  const row = await prisma.session.findUnique({
    where: { sessionId },
    select: { fs: true, cwd: true, loginUser: true, userStack: true },
  });

  if (row) {
    const state = {
      fs: row.fs,
      cwd: row.cwd,
      user: row.loginUser,
      userStack: Array.isArray(row.userStack) ? row.userStack : [],
    };
    cacheSet(sessionId, state);
    return state;
  }

  const fresh = newSessionState();
  await prisma.session.create({
    data: {
      sessionId,
      fs: fresh.fs,
      cwd: fresh.cwd,
      loginUser: fresh.user,
      userStack: fresh.userStack,
    },
  });
  cacheSet(sessionId, fresh);
  return fresh;
}

export async function persistState(sessionId, state) {
  cacheSet(sessionId, state);

  const data = {
    cwd: state.cwd,
    loginUser: state.user,
    userStack: state.userStack || [],
  };
  // Kirim ulang seluruh filesystem HANYA kalau ada yang berubah.
  if (state.dirty) {
    data.fs = state.fs;
    state.dirty = false;
  }

  await prisma.session.update({ where: { sessionId }, data });
}

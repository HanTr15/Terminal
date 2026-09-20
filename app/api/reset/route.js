import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';
import { newSessionState, promptFor } from '../../../lib/shell';
import { cacheDelete } from '../../../lib/sessionCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Kembalikan filesystem seorang peserta ke kondisi awal.
export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || '').slice(0, 128);
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib diisi' }, { status: 400 });
    }

    const fresh = newSessionState();
    const payload = {
      fs: fresh.fs,
      cwd: fresh.cwd,
      loginUser: fresh.user,
      userStack: fresh.userStack,
    };

    await prisma.session.upsert({
      where: { sessionId },
      update: payload,
      create: { sessionId, ...payload },
    });

    // Wajib: tanpa ini, state lama masih tersimpan di cache memori
    // dan akan muncul lagi pada command berikutnya.
    cacheDelete(sessionId);

    return NextResponse.json({ ok: true, prompt: promptFor(fresh) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

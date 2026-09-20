import { NextResponse } from 'next/server';
import { loadState } from '../../../lib/loadSession';
import { completePath } from '../../../lib/vfs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Read-only: tidak pernah menulis ke database, jadi aman dipanggil tiap kali
// user menekan Tab tanpa menambah beban tulis ke Neon.
export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || '').slice(0, 128);
    const partial = typeof body.partial === 'string' ? body.partial.slice(0, 500) : '';
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib diisi' }, { status: 400 });
    }

    const state = await loadState(sessionId);
    const matches = completePath(state.fs, state.cwd, state.user, partial);

    return NextResponse.json({ matches });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

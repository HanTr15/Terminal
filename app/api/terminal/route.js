import { NextResponse } from 'next/server';
import { execute, authenticate, promptFor } from '../../../lib/shell';
import { loadState, persistState } from '../../../lib/loadSession';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || '').slice(0, 128);
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib diisi' }, { status: 400 });
    }

    const state = await loadState(sessionId);

    // Mode: menjawab prompt password (su / sudo)
    if (body.mode === 'password') {
      const result = authenticate(
        state,
        String(body.pendingUser || ''),
        String(body.password || ''),
        body.pendingCommand ? String(body.pendingCommand) : null
      );
      await persistState(sessionId, result.state);
      return NextResponse.json({
        output: result.output || '',
        prompt: promptFor(result.state),
      });
    }

    // Mode: command biasa
    const command = typeof body.command === 'string' ? body.command.slice(0, 2000) : '';
    const result = execute(state, command);
    await persistState(sessionId, result.state);

    return NextResponse.json({
      output: result.output || '',
      control: result.control || null,
      pendingUser: result.pendingUser || null,
      pendingCommand: result.pendingCommand || null,
      prompt: promptFor(result.state),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

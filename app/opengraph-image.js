import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'WebTerm — CTF Challenge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Thumbnail yang muncul saat link dibagikan (WhatsApp, Discord, Twitter, dll).
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#14161c',
          padding: 64,
          fontFamily: 'monospace',
          color: '#d8dee9',
          fontSize: 30,
          justifyContent: 'center',
        }}
      >
        <div style={{ color: '#4ade80', fontSize: 26, marginBottom: 28 }}>
          student@linux-lab:~$ cat /etc/motd
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: '#eceff4', marginBottom: 20 }}>
          Linux Lab
        </div>
        <div style={{ fontSize: 32, color: '#9aa4b2', marginBottom: 36 }}>
          8 tantangan command Linux dasar.
        </div>
        <div style={{ display: 'flex', color: '#4ade80', fontSize: 26 }}>
          student@linux-lab:~$ <span style={{ marginLeft: 12, color: '#eceff4' }}>▋</span>
        </div>
      </div>
    ),
    size
  );
}

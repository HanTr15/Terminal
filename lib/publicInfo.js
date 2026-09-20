// ============================================================================
// INFO PUBLIK — file ini IKUT TERKIRIM KE BROWSER.
// Jangan menaruh flag, password, atau isi file rahasia di sini.
// Semua yang rahasia ada di lib/config.js yang hanya dibaca server.
// ============================================================================

const PUBLIC_INFO = {
  hostname: 'linux-lab',

  // Ditampilkan saat terminal dibuka. Flag intro TIDAK ditaruh di sini
  // (nanti bocor lewat View Source) — flag-nya ada di /etc/motd di server.
  banner: [
    'Welcome to Linux Fundamental Lab',
    '',
    'Linux Fundamental Lab — 8 flag menunggu.',
                'Mulai dengan:  cat /etc/motd',
    'Ketik "help" untuk melihat daftar command.',
    '',
  ].join('\n'),

  uname:
    'Linux linux-lab 5.15.0-101-generic #111-Ubuntu SMP Tue Mar 5 20:16:58 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux',

  uptime: ' 08:12:33 up 4 days,  2:02,  1 user,  load average: 0.02, 0.01, 0.00',

  date: 'Fri Sep 18 08:12:33 UTC 2026',
};

module.exports = { PUBLIC_INFO };

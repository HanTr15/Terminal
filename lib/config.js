// ============================================================================
//                      LINUX FUNDAMENTAL LAB — KONFIGURASI
//
//  SELURUH ISI SOAL ADA DI FILE INI. File lain tidak perlu disentuh.
//  File ini HANYA dibaca di server — flag dan password tidak ikut ke browser.
//
//  Isi:
//    1. FLAGS           -> 8 flag lab
//    2. SYSTEM / USERS  -> identitas mesin & akun
//    3. COMMAND_OUTPUT  -> output command kosmetik (ps, netstat, dll)
//    4. FILES           -> seluruh isi filesystem
// ============================================================================

const { PUBLIC_INFO } = require('./publicInfo');

// ─────────────────────────────────────────────────────────────────────────────
// 1. FLAGS — ganti di sini kalau mau flag sendiri
// ─────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  intro: 'FLAG{welcome_to_linux_lab}',
  nav: 'FLAG{first_steps_linux}',
  hidden: 'FLAG{hidden_in_plain_sight}',
  size: 'FLAG{size_matters}',
  time: 'FLAG{time_reveals_secrets}',
  grep: 'FLAG{grep_finds_the_truth}',
  find: 'FLAG{deep_search_success}',
  pipeline: 'FLAG{pipeline_master}',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. SYSTEM & USERS
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM = {
  ...PUBLIC_INFO,
  defaultUser: 'student', // siswa langsung masuk sebagai student
};

const USERS = {
  student: {
    password: 'student',
    canWrite: true, // boleh latihan bikin file di home sendiri & /tmp
    home: '/home/student',
    whoami: 'student',
    id: 'uid=1000(student) gid=1000(student) groups=1000(student)',
    groups: 'student',
    promptChar: '$',
  },
  root: {
    password: 'toor',
    canWrite: true,
    home: '/root',
    whoami: 'root',
    id: 'uid=0(root) gid=0(root) groups=0(root)',
    groups: 'root',
    promptChar: '#',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMMAND_OUTPUT — output statis
// ─────────────────────────────────────────────────────────────────────────────
const COMMAND_OUTPUT = {
  ps: [
    '    PID TTY          TIME CMD',
    '   1042 pts/0    00:00:00 bash',
    '   1088 pts/0    00:00:00 ps',
  ].join('\n'),
  netstat: [
    'Active Internet connections (only servers)',
    'Proto Recv-Q Send-Q Local Address           Foreign Address         State',
    'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN',
  ].join('\n'),
  ifconfig: [
    'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
    '        inet 10.10.0.7  netmask 255.255.255.0  broadcast 10.10.0.255',
    '',
    'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
    '        inet 127.0.0.1  netmask 255.0.0.0',
  ].join('\n'),
  df: [
    'Filesystem     1K-blocks     Used Available Use% Mounted on',
    '/dev/vda1       20511356  4210112  15242864  22% /',
  ].join('\n'),
  free: [
    '               total        used        free      shared  buff/cache   available',
    'Mem:         2038528      321044     1102112        1024      615372     1542288',
  ].join('\n'),
  last: [
    'student  pts/0    10.10.0.1        Fri Sep 18 08:02   still logged in',
    'reboot   system boot 5.15.0-101    Mon Sep 14 06:10   still running',
  ].join('\n'),
  w: [
    ' 08:12:33 up 4 days,  2:02,  1 user,  load average: 0.02, 0.01, 0.00',
    'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT',
    'student  pts/0    10.10.0.1        08:02    0.00s  0.03s  0.00s -bash',
  ].join('\n'),
  crontab: ['# m h  dom mon dow   command', '# (tidak ada cron job)'].join('\n'),
  sudoList: [
    'Matching Defaults entries for %USER% on linux-lab:',
    '    env_reset, mail_badpass',
    '',
    'User %USER% may run the following commands on linux-lab:',
    '    (ALL : ALL) ALL',
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper untuk membuat isi file log
// ─────────────────────────────────────────────────────────────────────────────
const IPS = ['10.10.0.14', '10.10.0.22', '192.168.1.8', '172.16.4.3', '10.10.0.51'];
const PATHS = ['/index.html', '/about', '/api/users', '/static/app.js', '/login', '/favicon.ico'];

// access.log untuk Level 05: banyak baris INFO, satu baris ERROR berisi flag.
function buildAccessLog() {
  const out = [];
  for (let i = 0; i < 60; i++) {
    const ip = IPS[i % IPS.length];
    const path = PATHS[i % PATHS.length];
    const hh = String(8 + Math.floor(i / 20)).padStart(2, '0');
    const mm = String((i * 7) % 60).padStart(2, '0');
    const ss = String((i * 13) % 60).padStart(2, '0');
    out.push(`2026-09-18 ${hh}:${mm}:${ss} INFO  ${ip} GET ${path} 200`);
  }
  // satu-satunya baris ERROR
  out.splice(
    37,
    0,
    `2026-09-18 09:14:02 ERROR 10.10.0.14 GET /admin 500 ${FLAGS.grep}`
  );
  return out.join('\n');
}

// server.log untuk Level 07: BANYAK baris ERROR, hanya satu yang berisi FLAG.
// Jadi `grep ERROR` saja tidak cukup — harus disaring lagi dengan pipe.
function buildServerLog() {
  const errors = [
    'connection timeout after 30s',
    'failed to bind socket on port 8080',
    'database connection refused',
    'invalid session token',
    'disk quota exceeded for /var/tmp',
    'upstream returned status 502',
    'cannot parse configuration line 42',
    'worker process exited unexpectedly',
    'TLS handshake failed',
    'too many open files',
  ];
  const out = [];
  let e = 0;
  for (let i = 0; i < 80; i++) {
    const hh = String(6 + Math.floor(i / 30)).padStart(2, '0');
    const mm = String((i * 11) % 60).padStart(2, '0');
    const ss = String((i * 17) % 60).padStart(2, '0');
    const ts = `2026-09-18 ${hh}:${mm}:${ss}`;
    if (i % 3 === 0) {
      out.push(`${ts} ERROR [worker-${(i % 4) + 1}] ${errors[e % errors.length]}`);
      e++;
    } else if (i % 3 === 1) {
      out.push(`${ts} INFO  [worker-${(i % 4) + 1}] request handled in ${20 + (i % 90)}ms`);
    } else {
      out.push(`${ts} WARN  [worker-${(i % 4) + 1}] slow query detected (${100 + i}ms)`);
    }
  }
  // satu-satunya baris yang ERROR sekaligus mengandung FLAG
  out.splice(
    52,
    0,
    `2026-09-18 07:41:19 ERROR [worker-2] unhandled exception: ${FLAGS.pipeline}`
  );
  return out.join('\n');
}

// Level 04: 15 file berwaktu lama + satu file paling baru.
function buildTimeFiles() {
  const files = {};
  for (let i = 1; i <= 15; i++) {
    const day = String(2 + (i % 10)).padStart(2, '0');
    const hh = String(7 + (i % 12)).padStart(2, '0');
    const mm = String((i * 4) % 60).padStart(2, '0');
    files[`/home/student/linux-lab/04-time/file${i}.txt`] = {
      content: `Ini file${i}.txt. Bukan file yang kamu cari.\nPerhatikan kolom tanggal saat menggunakan ls -l.`,
      owner: 'student',
      mtime: `2026-09-${day} ${hh}:${mm}`,
    };
  }
  // paling baru — jauh lebih baru dari yang lain
  files['/home/student/linux-lab/04-time/latest.txt'] = {
    content: `File ini yang paling baru diubah.\n\n${FLAGS.time}`,
    owner: 'student',
    mtime: '2026-09-18 08:45',
  };
  return files;
}

const DIR = { __dir: true };

// ─────────────────────────────────────────────────────────────────────────────
// 4. FILES — isi filesystem
// ─────────────────────────────────────────────────────────────────────────────
const FILES = {
  // ══ INTRO — flag diberikan saat login ═════════════════════════════════════
  '/etc/motd': {
    content: `==================================================
           LINUX FUNDAMENTAL LAB
==================================================

Selamat datang! Kamu berhasil masuk ke Linux Lab.

Ada 8 flag yang harus dikumpulkan. Yang pertama
gratis — ini dia:

    ${FLAGS.intro}

Lab-nya ada di: ~/linux-lab
Mulai dengan:   cd ~/linux-lab  lalu  ls

Ketik "help" kapan saja untuk melihat daftar command.
==================================================`,
    owner: 'root',
    mode: '-rw-r--r--',
  },

  '/home/student/README.txt': `LINUX FUNDAMENTAL LAB
=====================

Pesan selamat datang (berisi flag pertama) ada di /etc/motd.
Baca dengan:  cat /etc/motd

Materi lab ada di folder linux-lab/:

  01-navigation   pwd, ls, cd
  02-hidden       file tersembunyi
  03-size         ukuran file
  04-time         waktu modifikasi file
  05-grep         mencari teks di dalam file
  06-find         mencari file di struktur folder
  07-pipeline     menggabungkan command dengan pipe

Kerjakan berurutan. Tiap folder punya README.txt sendiri.`,

  '/home/student/linux-lab/README.txt': `Daftar level:

  01-navigation/   Level 1 — Navigasi direktori
  02-hidden/       Level 2 — File tersembunyi
  03-size/         Level 3 — Ukuran file
  04-time/         Level 4 — Waktu modifikasi
  05-grep/         Level 5 — Mencari teks
  06-find/         Level 6 — Mencari file
  07-pipeline/     Level 7 — Pipe

Masuk ke sebuah level:   cd 01-navigation
Kembali ke atas:         cd ..`,

  // ══ LEVEL 01 — NAVIGATION ═════════════════════════════════════════════════
  '/home/student/linux-lab/01-navigation/README.txt': `LEVEL 01 — NAVIGATION
=====================

Tujuan: melatih navigasi direktori.

Langkah:
  1. Cek kamu sedang ada di direktori mana.
  2. Lihat isi direktori ini.
  3. Masuk ke direktori "secret-room".
  4. Di dalamnya ada file yang tidak muncul di "ls" biasa.
  5. Baca file tersebut.

Command yang dipakai: pwd, ls, ls -a, cd, cat`,

  '/home/student/linux-lab/01-navigation/secret-room/.flag': {
    content: `Kerja bagus! Kamu berhasil menavigasi ke sini.

${FLAGS.nav}`,
    owner: 'student',
  },

  // ══ LEVEL 02 — HIDDEN FILE ════════════════════════════════════════════════
  '/home/student/linux-lab/02-hidden/README.txt': `LEVEL 02 — HIDDEN FILE
======================

Tujuan: mengenal file tersembunyi di Linux.

Di Linux, file yang namanya diawali titik (.) tidak
ditampilkan oleh "ls" biasa.

Langkah:
  1. Jalankan "ls" — hitung ada berapa file.
  2. Jalankan "ls -a" — ada berapa sekarang?
  3. Baca file yang tadinya tersembunyi.`,

  '/home/student/linux-lab/02-hidden/file1.txt':
    'Ini file biasa. Tidak ada yang menarik di sini.',
  '/home/student/linux-lab/02-hidden/file2.txt':
    'File biasa juga. Coba tampilkan file tersembunyi.',
  '/home/student/linux-lab/02-hidden/.secret': {
    content: `Ketemu! File ini tersembunyi karena namanya diawali titik.

${FLAGS.hidden}`,
    owner: 'student',
  },

  // ══ LEVEL 03 — FILE SIZE ══════════════════════════════════════════════════
  '/home/student/linux-lab/03-size/README.txt': `LEVEL 03 — FILE SIZE
====================

Tujuan: membaca informasi ukuran file.

Langkah:
  1. Tampilkan file beserta detailnya: ls -l
  2. Bandingkan angka di kolom ukuran.
  3. Cari yang paling besar.
  4. Baca file tersebut.

Tips:
  ls -l   tampilkan detail (ukuran dalam byte)
  ls -lh  ukuran dalam bentuk mudah dibaca (K, M)
  ls -lS  urutkan dari yang paling besar`,

  '/home/student/linux-lab/03-size/a.txt': 'File kecil.',
  '/home/student/linux-lab/03-size/b.txt':
    'File ini sedikit lebih besar dari a.txt, tapi masih kecil.',
  '/home/student/linux-lab/03-size/big.txt': {
    content:
      'File ini sengaja dibuat besar supaya menonjol di kolom ukuran.\n' +
      'Terus scroll ke bawah, flag-nya ada di paling akhir.\n\n' +
      Array.from(
        { length: 40 },
        (_, i) =>
          `baris pengisi ${String(i + 1).padStart(3, '0')} — ` +
          'data tidak penting, hanya untuk memperbesar ukuran file.'
      ).join('\n') +
      `\n\n${FLAGS.size}`,
    owner: 'student',
  },

  // ══ LEVEL 04 — FILE TIME (di-generate di bawah) ═══════════════════════════
  '/home/student/linux-lab/04-time/README.txt': {
    content: `LEVEL 04 — FILE TIME
====================

Tujuan: membaca waktu modifikasi file.

Di sini ada 15 file yang mirip. Hanya satu yang
terakhir diubah, dan di situlah flag-nya.

Langkah:
  1. ls -l    lihat kolom tanggal & jam.
  2. Cari yang paling baru.
  3. Baca file tersebut.

Tips:
  ls -lt   urutkan dari yang paling baru (paling atas)
  ls -ltr  urutkan terbalik (paling baru di bawah)`,
    owner: 'student',
    mtime: '2026-09-01 07:00',
  },

  ...buildTimeFiles(),

  // ══ LEVEL 05 — GREP ═══════════════════════════════════════════════════════
  '/home/student/linux-lab/05-grep/README.txt': `LEVEL 05 — GREP
===============

Tujuan: mencari teks di dalam file.

File access.log berisi puluhan baris. Membacanya satu per
satu dengan "cat" akan melelahkan. Gunakan grep.

Langkah:
  1. Cek dulu ada berapa baris:  wc -l access.log
  2. Cari baris yang berstatus ERROR.
  3. Flag ada di baris tersebut.

Tips:
  grep ERROR access.log     cari baris yang mengandung "ERROR"
  grep -n ERROR access.log  sekaligus tampilkan nomor barisnya
  grep -i error access.log  abaikan besar/kecil huruf`,

  '/home/student/linux-lab/05-grep/access.log': {
    content: buildAccessLog(),
    owner: 'student',
  },

  // ══ LEVEL 06 — FIND ═══════════════════════════════════════════════════════
  '/home/student/linux-lab/06-find/README.txt': `LEVEL 06 — FIND
===============

Tujuan: mencari file di dalam struktur direktori.

Ada file bernama secret.txt yang terkubur jauh di dalam
folder data/. Kamu bisa masuk satu per satu pakai cd,
tapi ada cara yang jauh lebih cepat.

Langkah:
  1. Cari file bernama secret.txt.
  2. Baca file tersebut.

Tips:
  find . -name secret.txt      cari mulai dari folder ini
  find . -type f               tampilkan semua file
  tree                         lihat struktur foldernya`,

  '/home/student/linux-lab/06-find/data/a/b/c/d/e/secret.txt': {
    content: `Dalam sekali, ya? Untung ada find.

${FLAGS.find}`,
    owner: 'student',
  },

  // ══ LEVEL 07 — PIPELINE ═══════════════════════════════════════════════════
  '/home/student/linux-lab/07-pipeline/README.txt': `LEVEL 07 — PIPELINE
===================

Tujuan: menggabungkan beberapa command dengan pipe ( | ).

Pipe mengirim hasil command kiri menjadi masukan command
kanan. Contoh:

    cat server.log | grep ERROR

File server.log punya BANYAK baris ERROR, jadi mencari
"ERROR" saja tidak cukup. Kamu perlu menyaring hasilnya
sekali lagi.

Langkah:
  1. Cari baris ERROR.
  2. Dari hasil itu, saring lagi yang mengandung FLAG.

Tips:
  cat server.log | grep ERROR | wc -l   hitung berapa baris ERROR
  grep X file | grep Y                  saring dua kali`,

  '/home/student/linux-lab/07-pipeline/server.log': {
    content: buildServerLog(),
    owner: 'student',
  },

  // ══ File sistem pelengkap ═════════════════════════════════════════════════
  '/etc/hostname': 'linux-lab\n',
  '/etc/os-release': `PRETTY_NAME="Ubuntu 22.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
ID=ubuntu`,
  '/etc/passwd': {
    content: `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
student:x:1000:1000:Lab Student:/home/student:/bin/bash`,
    owner: 'root',
    mode: '-rw-r--r--',
  },
  '/tmp/': DIR,
};

module.exports = { FLAGS, SYSTEM, USERS, COMMAND_OUTPUT, FILES, DIR };

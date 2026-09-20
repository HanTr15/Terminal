# Linux Fundamental Lab

Simulasi terminal Linux berbasis web untuk mengajar command dasar.
Berisi **8 flag** dalam 7 level bertingkat, dari navigasi direktori sampai pipe.

Stack: **Next.js + Prisma + Neon**, siap deploy ke Vercel.

---

## Daftar level

| Level | Materi | Lokasi flag |
|---|---|---|
| Intro | pesan welcome | `/etc/motd` |
| 01 | navigasi (`pwd`, `ls`, `cd`) | `01-navigation/secret-room/.flag` |
| 02 | file tersembunyi (`ls -a`) | `02-hidden/.secret` |
| 03 | ukuran file (`ls -l`, `ls -lhS`) | `03-size/big.txt` |
| 04 | waktu modifikasi (`ls -lt`) | `04-time/latest.txt` |
| 05 | cari teks (`grep`) | `05-grep/access.log` |
| 06 | cari file (`find`) | `06-find/data/a/b/c/d/e/secret.txt` |
| 07 | pipe (`grep X \| grep Y`) | `07-pipeline/server.log` |

Semua materi ada di `~/linux-lab`, tiap level punya `README.txt` berisi
langkah dan petunjuk command yang perlu dipakai.

Catatan desain: di Level 07 file log sengaja punya **28 baris ERROR**, jadi
`grep ERROR` saja tidak cukup — siswa harus menyaring dua kali dengan pipe.
Kalau cuma ada satu baris ERROR, tujuan levelnya tidak tercapai.

---

## Ganti flag & isi soal

Semua ada di **`lib/config.js`**. Flag di paling atas:

```js
const FLAGS = {
  intro:    'FLAG{welcome_to_linux_lab}',
  nav:      'FLAG{first_steps_linux}',
  hidden:   'FLAG{hidden_in_plain_sight}',
  size:     'FLAG{size_matters}',
  time:     'FLAG{time_reveals_secrets}',
  grep:     'FLAG{grep_finds_the_truth}',
  find:     'FLAG{deep_search_success}',
  pipeline: 'FLAG{pipeline_master}',
};
```

Menambah file cukup satu baris:

```js
const FILES = {
  '/home/student/latihan/soal.txt': 'isi filenya di sini',

  // dengan pengaturan waktu & pemilik
  '/home/student/latihan/lama.txt': {
    content: 'file ini dibuat lama',
    owner: 'student',
    mtime: '2026-09-03 08:10',     // untuk soal ls -lt
    mode: '-rw-r--r--',
  },
};
```

Format `mtime`: `'2026-09-18 08:45'`. Kalau tidak diisi, semua file dapat
waktu default yang sama.

> ⚠️ `lib/config.js` hanya dibaca server, jadi aman untuk flag.
> `lib/publicInfo.js` **ikut terkirim ke browser** — jangan taruh flag di sana.
> Itu sebabnya flag intro disimpan di `/etc/motd`, bukan di banner login.

---

## Setup Neon + Prisma

### 1. Buat database di Neon
1. Daftar di [neon.tech](https://neon.tech), buat project baru (free tier cukup).
2. Di **Connection Details**, ambil **dua** connection string:
   - yang ada `-pooler` pada host → jadi `DATABASE_URL`
   - yang **tanpa** `-pooler` → jadi `DIRECT_URL`

### 2. Isi environment variable

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15"
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
```

`DATABASE_URL` dipakai aplikasi saat jalan (lewat pooler, aman untuk
serverless). `DIRECT_URL` hanya dipakai `prisma db push`, karena migrasi tidak
bisa lewat pgbouncer.

### 3. Buat tabelnya

```bash
npm install
npx prisma db push
npm run dev
```

`prisma db push` membaca `prisma/schema.prisma` dan membuat tabel `sessions`.
Tidak perlu tulis SQL manual.

### 4. Deploy ke Vercel
1. Push ke GitHub, import di Vercel.
2. Tambahkan Environment Variables: `DATABASE_URL`, `DIRECT_URL`, dan
   (opsional) `NEXT_PUBLIC_SITE_URL`.
3. Deploy. Script `build` sudah menjalankan `prisma generate` lebih dulu,
   jadi tidak perlu konfigurasi tambahan.

### Perintah Prisma yang berguna

```bash
npx prisma db push     # terapkan perubahan schema
npx prisma studio      # lihat/edit isi database lewat GUI
```

Untuk mereset semua peserta: buka `prisma studio`, hapus semua baris di tabel
`sessions`. Untuk satu peserta saja, panggil `POST /api/reset` dengan
`{ "sessionId": "..." }`.

---

## Pasang sebagai widget melayang di web lain

Tempel satu baris sebelum `</body>`:

```html
<script src="https://DOMAIN-KAMU.vercel.app/embed.js" defer></script>
```

Muncul kartu melayang di pojok; diklik, terminal terbuka sebagai popup.
Dengan pengaturan:

```html
<script src="https://DOMAIN-KAMU.vercel.app/embed.js" defer
        data-title="Linux Fundamental Lab"
        data-subtitle="Klik untuk mulai"
        data-position="bottom-right"
        data-mode="card"
        data-open="overlay"></script>
```

- `data-position` — bottom-right, bottom-left, top-right, top-left
- `data-mode` — `card` (judul + subjudul) atau `button` (ringkas)
- `data-open` — `overlay` (popup) atau `newtab`

Iframe baru dimuat **saat kartu diklik**, jadi hampir tidak menambah beban
halaman. Script-nya ~6 KB tanpa dependency. Demo: `/contoh-embed.html`.

Ditanam langsung tanpa widget:

```html
<iframe src="https://DOMAIN-KAMU.vercel.app"
        style="width:100%;height:520px;border:1px solid #2c3038;border-radius:10px"
        loading="lazy" title="Linux Lab"></iframe>
```

Thumbnail saat link dibagikan dibuat otomatis di `app/opengraph-image.js`.

---

## Command yang tersedia

**File & folder:** `ls` (`-l -a -t -S -h -r -1`), `cd`, `pwd`, `tree`, `find` (`-name -type`), `stat`, `file`, `du`, `df`

**Baca file:** `cat`, `head`, `tail` (`-n`), `nl`, `wc` (`-l -w -c`), `less`, `more`

**Olah teks:** `grep` (`-i -n -v -r`), `sort`, `uniq`, `cut`, `tr`, `rev`, `diff`, `strings`

**Encode & hash:** `base64`, `xxd`, `md5sum`, `sha256sum`

**Buat & ubah:** `mkdir`, `touch`, `echo`, `cp`, `mv`, `chmod`, `chown`, `ln`

**User:** `whoami`, `id`, `groups`, `su`, `sudo`, `exit`, `users`, `last`, `w`

**Sistem:** `uname`, `hostname`, `uptime`, `date`, `env`, `ps`, `free`, `netstat`, `ifconfig`, `ping`, `systemctl`, `crontab`

**Shell:** pipe `|`, redirect `>` `>>`, `2>/dev/null`, quote, **Tab autocomplete**, `↑`/`↓`, `Ctrl+L`, `Ctrl+C`

Tab bekerja seperti bash asli:
- Kata pertama (nama command) diselesaikan instan dari daftar di browser — tanpa request.
- Kata berikutnya (path file/folder) memanggil `/api/complete`, yang membaca
  filesystem sesi tersebut di server — jadi hasilnya selalu akurat sesuai isi
  folder sebenarnya, termasuk memperhitungkan permission (folder yang tidak
  bisa dibuka tidak akan mengembalikan isinya).
- Satu kandidat → langsung dilengkapi (folder diberi `/`, file diberi spasi).
- Beberapa kandidat dengan prefix sama → dilengkapi sampai prefix tersebut
  (tekan Tab lagi untuk lanjut, persis seperti bash).
- Beberapa kandidat tanpa prefix tambahan → daftar ditampilkan di layar.

`/api/complete` tidak pernah menulis ke database, jadi bebas dipanggil
sesering apa pun tanpa menambah beban ke Neon.

`rm` dan `rmdir` dinonaktifkan supaya siswa tidak merusak soal.

Siswa login sebagai `student` dan bisa membuat file di home sendiri dan `/tmp`
(berguna untuk latihan `touch`, `mkdir`, `echo >`), tapi tidak di `/etc` atau `/root`.

---

## Struktur

```
lib/config.js          <- EDIT DI SINI (flag & isi soal, server-only)
lib/publicInfo.js      <- banner (IKUT ke browser, jangan taruh rahasia)
lib/vfs.js               filesystem virtual + permission + mtime
lib/commands.js          implementasi command
lib/shell.js             pipe, redirect, login su/sudo
lib/clientCommands.js    command yang jalan di browser
lib/db.js                Prisma client (lazy singleton)
lib/loadSession.js       load/simpan state sesi (dipakai bersama beberapa route)
lib/sessionCache.js      cache state di memori
prisma/schema.prisma     skema database
app/Terminal.js          UI terminal
app/api/complete/        endpoint Tab autocomplete (read-only)
app/api/terminal/        endpoint command
app/api/reset/           endpoint reset session
public/embed.js          widget melayang
```

---

## Catatan

**Performa.** Output layar disimpan sebagai satu string (bukan ratusan elemen
React) dan dibatasi ~600 baris. `help`, `clear`, `history`, `date`, `uname`,
`uptime`, `hostname` jalan langsung di browser tanpa request. Database hanya
ditulis kalau filesystem benar-benar berubah, jadi `ls`/`cat`/`grep` tidak
menyentuh Neon sama sekali. First Load JS ~90 KB.

**Keamanan.** Tidak ada eksekusi kode sungguhan, aman di-hosting publik. Flag
tersimpan di server dan sudah diverifikasi tidak ikut ke bundle browser. Tapi
isi file tetap dikirim sebagai respons API saat siswa berhasil membacanya —
jadi ini cocok untuk latihan, bukan untuk kompetisi berhadiah yang butuh
anti-cheat ketat.

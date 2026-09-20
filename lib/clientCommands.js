// Teks statis yang dijalankan LANGSUNG di browser tanpa request ke server.
// Inilah yang bikin command umum terasa instan.
//
// File ini ikut ke bundle browser, jadi hanya boleh memuat info publik.
// Sumbernya lib/publicInfo.js — bukan lib/config.js (yang berisi rahasia).

import { PUBLIC_INFO } from './publicInfo';

export const BANNER = PUBLIC_INFO.banner;

export const HELP_TEXT = [
  'Command yang tersedia:',
  '',
  '  file & folder   ls  cd  pwd  tree  find  stat  file  du  df',
  '  baca file       cat  head  tail  nl  wc  less  more',
  '  olah teks       grep  sort  uniq  cut  tr  rev  diff  strings',
  '  encode & hash   base64  xxd  md5sum  sha256sum',
  '  buat & ubah     mkdir  touch  echo  cp  mv  chmod  chown  ln',
  '  user & login    whoami  id  groups  su  sudo  exit  users  last  w',
  '  sistem          uname  hostname  uptime  date  env  ps  free',
  '                  netstat  ifconfig  ping  systemctl  crontab',
  '  lainnya         history  which  man  clear  help',
  '',
  'Shell: pipe ( | ), redirect ( > dan >> ), quote, Tab, panah atas/bawah.',
].join('\n');

// Command yang outputnya selalu sama dan tidak rahasia -> nol request.
export const LOCAL_COMMANDS = {
  'uname -a': PUBLIC_INFO.uname,
  uname: 'Linux',
  uptime: PUBLIC_INFO.uptime,
  date: PUBLIC_INFO.date,
  hostname: PUBLIC_INFO.hostname,
};

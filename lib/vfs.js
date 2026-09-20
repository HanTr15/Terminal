// Engine filesystem virtual. Biasanya kamu nggak perlu ngedit file ini —
// semua pengaturan soal ada di lib/config.js

const { FILES, USERS } = require('./config');

// Waktu default untuk file yang tidak menyebutkan mtime di config.
const DEFAULT_MTIME = Date.parse('2026-09-18T02:00:00Z');

// Terima '2026-09-18 02:00', ISO string, atau angka epoch ms.
function parseTime(v) {
  if (v === undefined || v === null) return DEFAULT_MTIME;
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? DEFAULT_MTIME : t;
}

function mkfile(content, owner, mode, mtime) {
  return {
    type: 'file',
    content,
    owner: owner || 'root',
    mode: mode || '-rw-r--r--',
    mtime: mtime === undefined ? DEFAULT_MTIME : parseTime(mtime),
  };
}

function mkdirNode(owner, mode, mtime) {
  return {
    type: 'dir',
    owner: owner || 'root',
    mode: mode || 'drwxr-xr-x',
    mtime: mtime === undefined ? DEFAULT_MTIME : parseTime(mtime),
    children: {},
  };
}

function splitPath(p) {
  return p.split('/').filter(Boolean);
}

// Bangun pohon filesystem dari map datar di config.js
function buildFilesystem() {
  const root = mkdirNode('root');

  function ensureDir(parts, owner) {
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = mkdirNode(owner || 'root');
      }
      node = node.children[part];
      if (node.type !== 'dir') throw new Error('konflik path: ' + parts.join('/'));
    }
    return node;
  }

  for (const rawPath of Object.keys(FILES)) {
    const value = FILES[rawPath];
    const isDirEntry = rawPath.endsWith('/') || (value && value.__dir);

    if (isDirEntry) {
      ensureDir(splitPath(rawPath), 'root');
      continue;
    }

    const parts = splitPath(rawPath);
    const name = parts.pop();
    let content, owner, mode, mtime;

    if (typeof value === 'string') {
      content = value;
      owner = guessOwner(rawPath);
      mode = '-rw-r--r--';
      mtime = undefined;
    } else {
      content = value.content || '';
      owner = value.owner || guessOwner(rawPath);
      mode = value.mode || '-rw-r--r--';
      mtime = value.mtime;
    }
    if (!content.endsWith('\n')) content += '\n';

    const parent = ensureDir(parts, guessOwner('/' + parts.join('/')));
    parent.children[name] = mkfile(content, owner, mode, mtime);
  }

  // Pastikan home tiap user ada dan dimiliki user tersebut
  for (const uname of Object.keys(USERS)) {
    const home = USERS[uname].home;
    if (!home) continue;
    const node = ensureDir(splitPath(home), uname);
    node.owner = uname;
    if (uname === 'root') node.mode = 'drwx------';
  }
  ensureDir(['tmp'], 'root').mode = 'drwxrwxrwt';

  return root;
}

function guessOwner(path) {
  if (path.startsWith('/root')) return 'root';
  const m = path.match(/^\/home\/([^/]+)/);
  if (m && USERS[m[1]]) return m[1];
  return 'root';
}

function normalizePath(cwd, input, user) {
  const home = (USERS[user] && USERS[user].home) || '/';
  if (!input) return cwd;
  let parts;
  if (input === '~') return home;
  if (input.startsWith('~/')) parts = splitPath(home + '/' + input.slice(2));
  else if (input.startsWith('/')) parts = splitPath(input);
  else parts = splitPath(cwd).concat(splitPath(input));

  const stack = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return '/' + stack.join('/');
}

function getNode(fs, path) {
  let node = fs;
  for (const part of splitPath(path)) {
    if (!node || node.type !== 'dir' || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

function getParent(fs, path) {
  const parts = splitPath(path);
  const name = parts.pop();
  const parent = getNode(fs, '/' + parts.join('/'));
  return { parent, name };
}

// ── PERMISSION ──────────────────────────────────────────────────────────────

// Bisa baca? root selalu bisa. Selain itu lihat bit "other" di mode,
// kecuali user-nya memang pemilik file.
function canRead(node, user) {
  if (!node) return false;
  if (user === 'root') return true;
  if (node.owner === user) return true;
  const mode = node.mode || '-rw-r--r--';
  const otherRead = mode[7] === 'r';
  return otherRead;
}

// Bisa masuk/list folder?
function canEnter(node, user) {
  if (!node) return false;
  if (user === 'root') return true;
  if (node.owner === user) return true;
  const mode = node.mode || 'drwxr-xr-x';
  return mode[7] === 'r' || mode[9] === 'x';
}

// Bisa nulis di path ini?
//   - user dengan canWrite:false -> nggak pernah bisa
//   - root -> bisa di mana aja
//   - user biasa -> cuma di home sendiri dan /tmp
function canWrite(path, user) {
  const u = USERS[user];
  if (!u || !u.canWrite) return false;
  if (user === 'root') return true;
  const home = u.home || '';
  return path === home || path.startsWith(home + '/') || path === '/tmp' || path.startsWith('/tmp/');
}

function writeDenied(path, user, cmd) {
  const u = USERS[user];
  if (!u || !u.canWrite) {
    return `${cmd}: cannot create '${path}': Permission denied (user '${user}' adalah read-only)`;
  }
  return `${cmd}: cannot create '${path}': Permission denied`;
}

// Untuk fitur Tab-autocomplete. Menerima potongan path yang sedang diketik
// (mis. "linux-lab/05-gr") dan mengembalikan daftar kandidat penyelesaian,
// meniru cara `cd`/`cat` menyelesaikan path di bash asli.
//
// Format hasil: setiap kandidat adalah PENGGANTI PENUH untuk token yang
// sedang diketik (bukan hanya sisa akhirannya), supaya klien tinggal
// mengganti token terakhir apa adanya. Folder diberi akhiran "/".
function completePath(fs, cwd, user, partial) {
  const slash = partial.lastIndexOf('/');
  const dirRaw = slash >= 0 ? partial.slice(0, slash + 1) : ''; // bagian sebelum "/" terakhir, apa adanya
  const prefix = slash >= 0 ? partial.slice(slash + 1) : partial; // yang sedang diketik di segmen ini
  const dirInput = slash >= 0 ? partial.slice(0, slash) || '/' : '.';

  const dirPath = normalizePath(cwd, dirInput, user);
  const node = getNode(fs, dirPath);
  if (!node || node.type !== 'dir' || !canEnter(node, user)) return [];

  let names = Object.keys(node.children);
  // file/folder tersembunyi hanya muncul kalau memang sedang mengetik "."
  if (!prefix.startsWith('.')) names = names.filter((n) => !n.startsWith('.'));
  names = names.filter((n) => n.startsWith(prefix)).sort();

  return names.map((n) => {
    const child = node.children[n];
    const isDir = child.type === 'dir';
    return { full: dirRaw + n + (isDir ? '/' : ''), name: n, isDir };
  });
}

module.exports = {
  buildFilesystem,
  parseTime,
  DEFAULT_MTIME,
  normalizePath,
  getNode,
  getParent,
  splitPath,
  canRead,
  canEnter,
  canWrite,
  writeDenied,
  mkfile,
  mkdirNode,
  completePath,
};

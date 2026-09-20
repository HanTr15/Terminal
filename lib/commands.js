// Implementasi command. Kalau mau nambah command baru, tambahkan entry
// di object COMMANDS paling bawah.

const { SYSTEM, USERS, COMMAND_OUTPUT } = require('./config');
const {
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
} = require('./vfs');

// ── helper ──────────────────────────────────────────────────────────────────

function ok(text) {
  return { out: text === undefined ? '' : text, err: '' };
}
function fail(text) {
  return { out: '', err: text };
}
function lines(s) {
  return String(s).replace(/\n$/, '').split('\n');
}

function parseFlags(args) {
  const flags = new Set();
  const rest = [];
  for (const a of args) {
    if (a.length > 1 && a[0] === '-' && a[1] !== '-') {
      for (const ch of a.slice(1)) flags.add(ch);
    } else if (a.startsWith('--')) {
      flags.add(a.slice(2));
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

// Ambil isi: dari stdin (pipe) atau dari file
function readInput(ctx, target, cmdName, stdin) {
  if (!target || target === '-') {
    if (stdin !== null && stdin !== undefined) return { content: stdin };
    return { error: `${cmdName}: missing operand\nTry '${cmdName} --help' for more information.` };
  }
  const path = normalizePath(ctx.cwd, target, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return { error: `${cmdName}: ${target}: No such file or directory` };
  if (node.type === 'dir') return { error: `${cmdName}: ${target}: Is a directory` };
  if (!canRead(node, ctx.user)) return { error: `${cmdName}: ${target}: Permission denied` };
  return { content: node.content };
}

function fmtMode(node) {
  return node.mode || (node.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--');
}
function sizeOf(node) {
  return node.type === 'dir' ? 4096 : (node.content || '').length;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Format waktu seperti `ls -l` asli: "Sep 18 02:00"
function fmtTime(node) {
  const d = new Date(node.mtime || 0);
  const mm = MONTHS[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, ' ');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm} ${day} ${hh}:${mi}`;
}

// Ukuran ramah manusia untuk `ls -lh`
function humanSize(n) {
  if (n < 1024) return String(n);
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'K';
  return (n / 1048576).toFixed(1) + 'M';
}
function resolveOutput(value, ctx) {
  const v = typeof value === 'function' ? value(ctx.user) : value;
  return String(v || '').replace(/%USER%/g, ctx.user);
}

// ── COMMAND: navigasi & info file ───────────────────────────────────────────

function cmd_ls(ctx, args) {
  const { flags, rest } = parseFlags(args);
  const target = rest[0] || '.';
  const path = normalizePath(ctx.cwd, target, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`ls: cannot access '${target}': No such file or directory`);

  if (node.type === 'file') {
    return ok(flags.has('l') ? lsLongLine(target, node, flags) : target);
  }
  if (!canEnter(node, ctx.user)) {
    return fail(`ls: cannot open directory '${target}': Permission denied`);
  }

  let names = Object.keys(node.children);
  if (!flags.has('a')) names = names.filter((n) => !n.startsWith('.'));

  // urutan: -t waktu terbaru dulu, -S terbesar dulu, default alfabet
  if (flags.has('t')) {
    names.sort((a, b) => (node.children[b].mtime || 0) - (node.children[a].mtime || 0));
  } else if (flags.has('S')) {
    names.sort((a, b) => sizeOf(node.children[b]) - sizeOf(node.children[a]));
  } else {
    names.sort((a, b) => a.localeCompare(b));
  }
  if (flags.has('r')) names.reverse();

  if (flags.has('l')) {
    const out = [`total ${names.length * 4}`];
    if (flags.has('a')) {
      out.push(lsLongLine('.', node, flags));
      out.push(lsLongLine('..', node, flags));
    }
    out.push(...names.map((n) => lsLongLine(n, node.children[n], flags)));
    return ok(out.join('\n'));
  }
  if (flags.has('1')) return ok(names.join('\n'));
  return ok(names.map((n) => (node.children[n].type === 'dir' ? n + '/' : n)).join('  '));
}

function lsLongLine(name, node, flags) {
  const owner = node.owner || 'root';
  const raw = sizeOf(node);
  const size = (flags && flags.has('h') ? humanSize(raw) : String(raw)).padStart(6, ' ');
  const suffix = node.type === 'dir' && name !== '.' && name !== '..' ? '/' : '';
  return `${fmtMode(node)} 1 ${owner.padEnd(8)} ${owner.padEnd(8)} ${size} ${fmtTime(node)} ${name}${suffix}`;
}

function cmd_cd(ctx, args) {
  const target = args[0] || '~';
  const path = normalizePath(ctx.cwd, target, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`cd: ${target}: No such file or directory`);
  if (node.type !== 'dir') return fail(`cd: ${target}: Not a directory`);
  if (!canEnter(node, ctx.user)) return fail(`cd: ${target}: Permission denied`);
  ctx.cwd = path;
  return ok('');
}

function cmd_pwd(ctx) {
  return ok(ctx.cwd);
}

function cmd_cat(ctx, args, stdin) {
  const { rest } = parseFlags(args);
  if (!rest.length && stdin !== null) return ok(stdin);
  if (!rest.length) return fail('cat: missing operand\nTry \'cat --help\' for more information.');
  const parts = [];
  for (const t of rest) {
    const r = readInput(ctx, t, 'cat', stdin);
    if (r.error) return fail(r.error);
    parts.push(r.content.replace(/\n$/, ''));
  }
  return ok(parts.join('\n'));
}

function cmd_head(ctx, args, stdin) {
  return headTail(ctx, args, stdin, 'head');
}
function cmd_tail(ctx, args, stdin) {
  return headTail(ctx, args, stdin, 'tail');
}
function headTail(ctx, args, stdin, mode) {
  let n = 10;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n') n = parseInt(args[++i], 10) || 10;
    else if (/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
    else rest.push(args[i]);
  }
  const r = readInput(ctx, rest[0], mode, stdin);
  if (r.error) return fail(r.error);
  const L = lines(r.content);
  return ok((mode === 'head' ? L.slice(0, n) : L.slice(-n)).join('\n'));
}

function cmd_wc(ctx, args, stdin) {
  const { flags, rest } = parseFlags(args);
  const r = readInput(ctx, rest[0], 'wc', stdin);
  if (r.error) return fail(r.error);
  const c = r.content;
  const nl = lines(c).length;
  const w = c.trim() ? c.trim().split(/\s+/).length : 0;
  const ch = c.length;
  if (flags.has('l')) return ok(`${nl}${rest[0] ? ' ' + rest[0] : ''}`);
  if (flags.has('w')) return ok(`${w}${rest[0] ? ' ' + rest[0] : ''}`);
  if (flags.has('c')) return ok(`${ch}${rest[0] ? ' ' + rest[0] : ''}`);
  return ok(`${nl} ${w} ${ch}${rest[0] ? ' ' + rest[0] : ''}`);
}

function cmd_file(ctx, args) {
  const t = args[0];
  if (!t) return fail('file: missing operand\nTry \'file --help\' for more information.');
  const node = getNode(ctx.fs, normalizePath(ctx.cwd, t, ctx.user));
  if (!node) return fail(`${t}: cannot open (No such file or directory)`);
  if (node.type === 'dir') return ok(`${t}: directory`);
  if (node.content.startsWith('#!')) return ok(`${t}: Bourne-Again shell script, ASCII text executable`);
  return ok(`${t}: ASCII text`);
}

function cmd_stat(ctx, args) {
  const t = args[0];
  if (!t) return fail('stat: missing operand\nTry \'stat --help\' for more information.');
  const path = normalizePath(ctx.cwd, t, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`stat: cannot statx '${t}': No such file or directory`);
  return ok(
    [
      `  File: ${path}`,
      `  Size: ${sizeOf(node)}\tBlocks: 8\tIO Block: 4096   ${node.type === 'dir' ? 'directory' : 'regular file'}`,
      `Access: (${fmtMode(node)})  Uid: ( ${node.owner} )   Gid: ( ${node.owner} )`,
      `Modify: ${new Date(node.mtime || 0).toISOString().replace('T', ' ').replace('Z', '')} +0000`,
    ].join('\n')
  );
}

function cmd_du(ctx, args) {
  const target = args.find((a) => !a.startsWith('-')) || '.';
  const path = normalizePath(ctx.cwd, target, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`du: cannot access '${target}': No such file or directory`);
  const out = [];
  (function walk(n, p) {
    if (n.type === 'dir' && canEnter(n, ctx.user)) {
      for (const k of Object.keys(n.children)) walk(n.children[k], p + '/' + k);
      out.push(`4\t${p || '/'}`);
    }
  })(node, path === '/' ? '' : path);
  return ok(out.join('\n'));
}

function cmd_tree(ctx, args) {
  const target = args.find((a) => !a.startsWith('-')) || '.';
  const path = normalizePath(ctx.cwd, target, ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`tree: ${target}: No such file or directory`);
  const out = [target];
  let dirs = 0,
    files = 0;
  (function walk(n, prefix) {
    if (n.type !== 'dir' || !canEnter(n, ctx.user)) return;
    const keys = Object.keys(n.children).filter((k) => !k.startsWith('.')).sort();
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const child = n.children[k];
      out.push(prefix + (last ? '└── ' : '├── ') + k);
      if (child.type === 'dir') {
        dirs++;
        walk(child, prefix + (last ? '    ' : '│   '));
      } else files++;
    });
  })(node, '');
  out.push('', `${dirs} directories, ${files} files`);
  return ok(out.join('\n'));
}

// ── COMMAND: pencarian & text processing ────────────────────────────────────

function cmd_grep(ctx, args, stdin) {
  const { flags, rest } = parseFlags(args);
  const pattern = rest[0];
  if (!pattern) return fail('Usage: grep [OPTION]... PATTERNS [FILE]...');

  let re;
  try {
    re = new RegExp(pattern, flags.has('i') ? 'i' : '');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'i' : '');
  }

  // grep -r <pola> <dir>
  if (flags.has('r') || flags.has('R')) {
    const start = normalizePath(ctx.cwd, rest[1] || '.', ctx.user);
    const startNode = getNode(ctx.fs, start);
    if (!startNode) return fail(`grep: ${rest[1]}: No such file or directory`);
    const out = [];
    (function walk(n, p) {
      if (n.type === 'file') {
        if (!canRead(n, ctx.user)) return;
        for (const l of lines(n.content)) if (re.test(l)) out.push(`${p}:${l}`);
      } else if (canEnter(n, ctx.user)) {
        for (const k of Object.keys(n.children)) walk(n.children[k], p + '/' + k);
      }
    })(startNode, start === '/' ? '' : start);
    return ok(out.join('\n'));
  }

  const targets = rest.slice(1);
  const multi = targets.length > 1;
  const out = [];

  if (!targets.length) {
    const r = readInput(ctx, null, 'grep', stdin);
    if (r.error) return fail('Usage: grep [OPTION]... PATTERNS [FILE]...');
    lines(r.content).forEach((l, i) => {
      if (re.test(l) !== flags.has('v')) out.push(flags.has('n') ? `${i + 1}:${l}` : l);
    });
    return ok(out.join('\n'));
  }

  for (const t of targets) {
    const r = readInput(ctx, t, 'grep', null);
    if (r.error) {
      out.push(r.error);
      continue;
    }
    lines(r.content).forEach((l, i) => {
      if (re.test(l) !== flags.has('v')) {
        let line = flags.has('n') ? `${i + 1}:${l}` : l;
        out.push(multi ? `${t}:${line}` : line);
      }
    });
  }
  return ok(out.join('\n'));
}

function cmd_find(ctx, args) {
  let start = '.';
  let namePattern = null;
  let typeFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name') namePattern = args[++i];
    else if (args[i] === '-type') typeFilter = args[++i];
    else if (!args[i].startsWith('-')) start = args[i];
  }
  const startPath = normalizePath(ctx.cwd, start, ctx.user);
  const startNode = getNode(ctx.fs, startPath);
  if (!startNode) return fail(`find: '${start}': No such file or directory`);

  const matcher = namePattern
    ? new RegExp('^' + namePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    : null;
  // find asli menampilkan path apa adanya: relatif kalau titik awalnya
  // relatif (find .), absolut kalau absolut (find /home).
  const relative = !start.startsWith('/');
  const prefix = relative ? start.replace(/\/$/, '') : startPath === '/' ? '' : startPath;

  const out = [];
  (function walk(n, p) {
    const base = p.split('/').pop() || '/';
    const typeOk = !typeFilter || (typeFilter === 'd' ? n.type === 'dir' : n.type === 'file');
    if ((!matcher || matcher.test(base)) && typeOk) out.push(p || '/');
    if (n.type === 'dir' && canEnter(n, ctx.user)) {
      for (const k of Object.keys(n.children)) walk(n.children[k], p + '/' + k);
    }
  })(startNode, prefix);
  return ok(out.join('\n'));
}

function cmd_sort(ctx, args, stdin) {
  const { flags, rest } = parseFlags(args);
  const r = readInput(ctx, rest[0], 'sort', stdin);
  if (r.error) return fail(r.error);
  let L = lines(r.content).sort((a, b) => a.localeCompare(b));
  if (flags.has('r')) L.reverse();
  if (flags.has('u')) L = [...new Set(L)];
  return ok(L.join('\n'));
}

function cmd_uniq(ctx, args, stdin) {
  const { flags, rest } = parseFlags(args);
  const r = readInput(ctx, rest[0], 'uniq', stdin);
  if (r.error) return fail(r.error);
  const L = lines(r.content);
  const out = [];
  let prev = null,
    count = 0;
  for (const l of L) {
    if (l === prev) count++;
    else {
      if (prev !== null) out.push(flags.has('c') ? `${String(count).padStart(7)} ${prev}` : prev);
      prev = l;
      count = 1;
    }
  }
  if (prev !== null) out.push(flags.has('c') ? `${String(count).padStart(7)} ${prev}` : prev);
  return ok(out.join('\n'));
}

function cmd_cut(ctx, args, stdin) {
  let delim = '\t';
  let fields = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-d') delim = args[++i];
    else if (args[i].startsWith('-d')) delim = args[i].slice(2);
    else if (args[i] === '-f') fields = args[++i];
    else if (args[i].startsWith('-f')) fields = args[i].slice(2);
    else rest.push(args[i]);
  }
  const r = readInput(ctx, rest[0], 'cut', stdin);
  if (r.error) return fail(r.error);
  if (!fields) return fail('cut: butuh opsi -f');
  const idxs = fields.split(',').map((f) => parseInt(f, 10) - 1);
  return ok(
    lines(r.content)
      .map((l) => idxs.map((i) => l.split(delim)[i] || '').join(delim))
      .join('\n')
  );
}

function cmd_rev(ctx, args, stdin) {
  const r = readInput(ctx, args[0], 'rev', stdin);
  if (r.error) return fail(r.error);
  return ok(lines(r.content).map((l) => l.split('').reverse().join('')).join('\n'));
}

function cmd_nl(ctx, args, stdin) {
  const r = readInput(ctx, args[0], 'nl', stdin);
  if (r.error) return fail(r.error);
  return ok(lines(r.content).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n'));
}

function cmd_tr(ctx, args, stdin) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: tr <set1> <set2>');
  const r = readInput(ctx, rest[2], 'tr', stdin);
  if (r.error) return fail(r.error);
  const [a, b] = rest;
  let out = '';
  for (const ch of r.content) {
    const i = a.indexOf(ch);
    out += i >= 0 && b[i] ? b[i] : ch;
  }
  return ok(out.replace(/\n$/, ''));
}

function cmd_base64(ctx, args, stdin) {
  const { flags, rest } = parseFlags(args);
  const r = readInput(ctx, rest[0], 'base64', stdin);
  if (r.error) return fail(r.error);
  const decode = flags.has('d') || flags.has('decode');
  try {
    if (decode) return ok(Buffer.from(r.content.trim(), 'base64').toString('utf8').replace(/\n$/, ''));
    return ok(Buffer.from(r.content, 'utf8').toString('base64'));
  } catch {
    return fail('base64: invalid input');
  }
}

function cmd_xxd(ctx, args, stdin) {
  const r = readInput(ctx, args.find((a) => !a.startsWith('-')), 'xxd', stdin);
  if (r.error) return fail(r.error);
  const buf = Buffer.from(r.content, 'utf8').slice(0, 512);
  const out = [];
  for (let i = 0; i < buf.length; i += 16) {
    const chunk = buf.slice(i, i + 16);
    const hex = chunk.toString('hex').match(/.{1,4}/g)?.join(' ') || '';
    const ascii = chunk.toString('latin1').replace(/[^\x20-\x7e]/g, '.');
    out.push(`${i.toString(16).padStart(8, '0')}: ${hex.padEnd(39)}  ${ascii}`);
  }
  return ok(out.join('\n'));
}

function cmd_strings(ctx, args, stdin) {
  const r = readInput(ctx, args.find((a) => !a.startsWith('-')), 'strings', stdin);
  if (r.error) return fail(r.error);
  const matches = r.content.match(/[\x20-\x7e]{4,}/g) || [];
  return ok(matches.join('\n'));
}

function hashCmd(algo) {
  return (ctx, args, stdin) => {
    const target = args.find((a) => !a.startsWith('-'));
    const r = readInput(ctx, target, algo, stdin);
    if (r.error) return fail(r.error);
    const crypto = require('crypto');
    const h = crypto.createHash(algo === 'md5sum' ? 'md5' : 'sha256').update(r.content).digest('hex');
    return ok(`${h}  ${target || '-'}`);
  };
}

function cmd_diff(ctx, args) {
  if (args.length < 2) return fail('usage: diff <file1> <file2>');
  const a = readInput(ctx, args[0], 'diff', null);
  const b = readInput(ctx, args[1], 'diff', null);
  if (a.error) return fail(a.error);
  if (b.error) return fail(b.error);
  const la = lines(a.content),
    lb = lines(b.content);
  const out = [];
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) {
    if (la[i] !== lb[i]) {
      if (la[i] !== undefined) out.push(`${i + 1}< ${la[i]}`);
      if (lb[i] !== undefined) out.push(`${i + 1}> ${lb[i]}`);
    }
  }
  return ok(out.join('\n'));
}

// ── COMMAND: bikin & ubah file (butuh izin tulis) ───────────────────────────

function cmd_mkdir(ctx, args) {
  const { flags, rest } = parseFlags(args);
  if (!rest.length) return fail('usage: mkdir [-p] <dir...>');
  const errs = [];
  for (const t of rest) {
    const path = normalizePath(ctx.cwd, t, ctx.user);
    if (!canWrite(path, ctx.user)) {
      errs.push(writeDenied(t, ctx.user, 'mkdir'));
      continue;
    }
    if (flags.has('p')) {
      let node = ctx.fs;
      for (const part of splitPath(path)) {
        if (!node.children[part]) node.children[part] = mkdirNode(ctx.user);
        node = node.children[part];
      }
      continue;
    }
    const { parent, name } = getParent(ctx.fs, path);
    if (!parent || parent.type !== 'dir') {
      errs.push(`mkdir: cannot create directory '${t}': No such file or directory`);
      continue;
    }
    if (parent.children[name]) {
      errs.push(`mkdir: cannot create directory '${t}': File exists`);
      continue;
    }
    parent.children[name] = mkdirNode(ctx.user);
  }
  return errs.length ? fail(errs.join('\n')) : ok('');
}

function cmd_touch(ctx, args) {
  const { rest } = parseFlags(args);
  if (!rest.length) return fail('usage: touch <file...>');
  const errs = [];
  for (const t of rest) {
    const path = normalizePath(ctx.cwd, t, ctx.user);
    if (!canWrite(path, ctx.user)) {
      errs.push(writeDenied(t, ctx.user, 'touch'));
      continue;
    }
    const { parent, name } = getParent(ctx.fs, path);
    if (!parent || parent.type !== 'dir') {
      errs.push(`touch: cannot touch '${t}': No such file or directory`);
      continue;
    }
    if (!parent.children[name]) parent.children[name] = mkfile('', ctx.user, '-rw-r--r--');
  }
  return errs.length ? fail(errs.join('\n')) : ok('');
}

function cmd_echo(ctx, args) {
  const { flags, rest } = parseFlags(args);
  const text = rest.join(' ');
  return ok(flags.has('n') ? text : text);
}

function cmd_cp(ctx, args) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: cp <src> <dst>');
  const srcPath = normalizePath(ctx.cwd, rest[0], ctx.user);
  const src = getNode(ctx.fs, srcPath);
  if (!src) return fail(`cp: cannot stat '${rest[0]}': No such file or directory`);
  if (!canRead(src, ctx.user)) return fail(`cp: cannot open '${rest[0]}': Permission denied`);

  let dstPath = normalizePath(ctx.cwd, rest[1], ctx.user);
  const dstNode = getNode(ctx.fs, dstPath);
  if (dstNode && dstNode.type === 'dir') dstPath = dstPath + '/' + srcPath.split('/').pop();
  if (!canWrite(dstPath, ctx.user)) return fail(writeDenied(rest[1], ctx.user, 'cp'));

  const { parent, name } = getParent(ctx.fs, dstPath);
  if (!parent) return fail(`cp: cannot create '${rest[1]}': No such file or directory`);
  const copy = JSON.parse(JSON.stringify(src));
  copy.owner = ctx.user;
  parent.children[name] = copy;
  return ok('');
}

function cmd_mv(ctx, args) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: mv <src> <dst>');
  const srcPath = normalizePath(ctx.cwd, rest[0], ctx.user);
  const { parent: sp, name: sn } = getParent(ctx.fs, srcPath);
  const src = sp && sp.children ? sp.children[sn] : null;
  if (!src) return fail(`mv: cannot stat '${rest[0]}': No such file or directory`);
  if (!canWrite(srcPath, ctx.user)) return fail(writeDenied(rest[0], ctx.user, 'mv'));

  let dstPath = normalizePath(ctx.cwd, rest[1], ctx.user);
  const dstNode = getNode(ctx.fs, dstPath);
  if (dstNode && dstNode.type === 'dir') dstPath = dstPath + '/' + sn;
  if (!canWrite(dstPath, ctx.user)) return fail(writeDenied(rest[1], ctx.user, 'mv'));

  const { parent: dp, name: dn } = getParent(ctx.fs, dstPath);
  if (!dp) return fail(`mv: cannot move to '${rest[1]}': No such file or directory`);
  dp.children[dn] = src;
  delete sp.children[sn];
  return ok('');
}

function cmd_chmod(ctx, args) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: chmod <mode> <file>');
  const path = normalizePath(ctx.cwd, rest[1], ctx.user);
  const node = getNode(ctx.fs, path);
  if (!node) return fail(`chmod: cannot access '${rest[1]}': No such file or directory`);
  if (ctx.user !== 'root' && node.owner !== ctx.user)
    return fail(`chmod: changing permissions of '${rest[1]}': Operation not permitted`);
  if (!USERS[ctx.user] || !USERS[ctx.user].canWrite)
    return fail(`chmod: changing permissions of '${rest[1]}': Permission denied`);

  const m = rest[0];
  if (/^[0-7]{3,4}$/.test(m)) {
    const digits = m.slice(-3).split('').map(Number);
    const bits = digits
      .map((d) => (d & 4 ? 'r' : '-') + (d & 2 ? 'w' : '-') + (d & 1 ? 'x' : '-'))
      .join('');
    node.mode = (node.type === 'dir' ? 'd' : '-') + bits;
    return ok('');
  }
  return fail(`chmod: invalid mode: '${m}' (pakai format oktal, contoh: 644)`);
}

function cmd_chown(ctx, args) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: chown <user> <file>');
  if (ctx.user !== 'root') return fail('chown: Operation not permitted (butuh root)');
  const node = getNode(ctx.fs, normalizePath(ctx.cwd, rest[1], ctx.user));
  if (!node) return fail(`chown: cannot access '${rest[1]}': No such file or directory`);
  node.owner = rest[0];
  return ok('');
}

function cmd_ln(ctx, args) {
  const { rest } = parseFlags(args);
  if (rest.length < 2) return fail('usage: ln -s <target> <linkname>');
  return cmd_cp(ctx, rest);
}

// ── COMMAND: identitas & sistem ─────────────────────────────────────────────

function cmd_whoami(ctx) {
  return ok(resolveOutput((USERS[ctx.user] || {}).whoami || ctx.user, ctx));
}
function cmd_id(ctx, args) {
  const target = args.find((a) => !a.startsWith('-'));
  const u = USERS[target || ctx.user];
  if (!u) return fail(`id: '${target}': no such user`);
  return ok(resolveOutput(u.id, { user: target || ctx.user }));
}
function cmd_groups(ctx) {
  return ok(resolveOutput((USERS[ctx.user] || {}).groups || ctx.user, ctx));
}
function cmd_hostname(ctx) {
  return ok(SYSTEM.hostname);
}
function cmd_uname(ctx, args) {
  const { flags } = parseFlags(args);
  if (flags.has('a')) return ok(SYSTEM.uname);
  if (flags.has('r')) return ok(SYSTEM.uname.split(' ')[2] || '5.15.0');
  return ok('Linux');
}
function cmd_uptime(ctx) {
  return ok(SYSTEM.uptime);
}
function cmd_date(ctx) {
  return ok(SYSTEM.date);
}
function cmd_env(ctx) {
  const u = USERS[ctx.user] || {};
  return ok(
    [
      `USER=${ctx.user}`,
      `HOME=${u.home || '/'}`,
      `PWD=${ctx.cwd}`,
      'SHELL=/bin/bash',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'LANG=en_US.UTF-8',
      'TERM=xterm-256color',
    ].join('\n')
  );
}
function cmd_which(ctx, args) {
  const name = args[0];
  if (!name) return fail('usage: which <command>');
  if (COMMANDS[name]) return ok(`/usr/bin/${name}`);
  return fail('');
}
function cmd_users(ctx) {
  return ok(Object.keys(USERS).join(' '));
}

function staticCmd(key) {
  return (ctx) => ok(resolveOutput(COMMAND_OUTPUT[key], ctx));
}

function cmd_crontab(ctx, args) {
  if (args.includes('-l')) return ok(resolveOutput(COMMAND_OUTPUT.crontab, ctx));
  return fail('usage: crontab -l');
}

function cmd_systemctl(ctx, args) {
  const svc = args[1] || '';
  if (args[0] === 'status') {
    return ok(
      [
        `● ${svc || 'nginx'}.service - ${svc || 'nginx'} web server`,
        '     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)',
        '     Active: active (running) since Sat 2026-09-06 23:22:41 UTC; 12 days ago',
      ].join('\n')
    );
  }
  if (ctx.user !== 'root') return fail('systemctl: Interactive authentication required (butuh root)');
  return ok('');
}

function cmd_ping(ctx, args) {
  const host = args.find((a) => !a.startsWith('-')) || 'localhost';
  return ok(
    [
      `PING ${host} (10.0.0.12) 56(84) bytes of data.`,
      `64 bytes from ${host} (10.0.0.12): icmp_seq=1 ttl=64 time=0.041 ms`,
      `64 bytes from ${host} (10.0.0.12): icmp_seq=2 ttl=64 time=0.038 ms`,
      '',
      `--- ${host} ping statistics ---`,
      '2 packets transmitted, 2 received, 0% packet loss, time 1024ms',
    ].join('\n')
  );
}

function cmd_man(ctx, args) {
  const name = args[0];
  if (!name) return fail('What manual page do you want?');
  const c = COMMANDS[name];
  if (!c) return fail(`No manual entry for ${name}`);
  return ok(
    [
      `${name.toUpperCase()}(1)`,
      '',
      'NAME',
      `       ${name} - ${c.desc}`,
      '',
      'SYNOPSIS',
      `       ${c.usage || name}`,
      '',
      '(halaman manual disederhanakan — ketik "help" untuk daftar lengkap)',
    ].join('\n')
  );
}

function cmd_help(ctx) {
  const groups = {
    'Navigasi & file': ['ls', 'cd', 'pwd', 'tree', 'find', 'stat', 'file', 'du', 'df'],
    'Baca isi file': ['cat', 'head', 'tail', 'nl', 'wc', 'less', 'more'],
    'Olah teks': ['grep', 'sort', 'uniq', 'cut', 'tr', 'rev', 'diff', 'strings'],
    'Encode & hash': ['base64', 'xxd', 'md5sum', 'sha256sum'],
    'Buat & ubah': ['mkdir', 'touch', 'echo', 'cp', 'mv', 'chmod', 'chown', 'ln'],
    'User & login': ['whoami', 'id', 'groups', 'su', 'sudo', 'exit', 'users', 'last', 'w'],
    'Sistem': ['uname', 'hostname', 'uptime', 'date', 'env', 'ps', 'free', 'netstat', 'ifconfig', 'ping', 'systemctl', 'crontab'],
    Lainnya: ['history', 'which', 'man', 'clear', 'help'],
  };
  const out = ['Command yang tersedia:', ''];
  for (const [g, cmds] of Object.entries(groups)) {
    out.push(`  ${g}:`);
    out.push('    ' + cmds.join('  '));
  }
  out.push('');
  out.push('Fitur shell: pipe ( | ), redirect ( > dan >> ), quote, riwayat (panah atas/bawah).');
  out.push('Ketik: man <command>   untuk keterangan singkat sebuah command.');
  return ok(out.join('\n'));
}

// ── DAFTAR COMMAND ──────────────────────────────────────────────────────────
// Mau nambah command? Tambahin entry di sini.
// Format: nama: { fn, desc, usage, stdin: true kalau nerima pipe }

const COMMANDS = {
  ls: { fn: cmd_ls, desc: 'tampilkan isi direktori', usage: 'ls [-l] [-a] [path]' },
  cd: { fn: cmd_cd, desc: 'pindah direktori', usage: 'cd <path>' },
  pwd: { fn: cmd_pwd, desc: 'tampilkan direktori saat ini', usage: 'pwd' },
  tree: { fn: cmd_tree, desc: 'tampilkan struktur folder', usage: 'tree [path]' },
  find: { fn: cmd_find, desc: 'cari file berdasarkan nama', usage: 'find <path> -name <pola>' },
  stat: { fn: cmd_stat, desc: 'info detail sebuah file', usage: 'stat <file>' },
  file: { fn: cmd_file, desc: 'tampilkan tipe file', usage: 'file <file>' },
  du: { fn: cmd_du, desc: 'ukuran direktori', usage: 'du [path]' },
  df: { fn: staticCmd('df'), desc: 'pemakaian disk', usage: 'df -h' },

  cat: { fn: cmd_cat, desc: 'tampilkan isi file', usage: 'cat <file>', stdin: true },
  less: { fn: cmd_cat, desc: 'tampilkan isi file', usage: 'less <file>', stdin: true },
  more: { fn: cmd_cat, desc: 'tampilkan isi file', usage: 'more <file>', stdin: true },
  head: { fn: cmd_head, desc: 'tampilkan baris awal file', usage: 'head [-n N] <file>', stdin: true },
  tail: { fn: cmd_tail, desc: 'tampilkan baris akhir file', usage: 'tail [-n N] <file>', stdin: true },
  nl: { fn: cmd_nl, desc: 'tampilkan file dengan nomor baris', usage: 'nl <file>', stdin: true },
  wc: { fn: cmd_wc, desc: 'hitung baris/kata/karakter', usage: 'wc [-l|-w|-c] <file>', stdin: true },

  grep: { fn: cmd_grep, desc: 'cari teks di dalam file', usage: 'grep [-i][-n][-v][-r] <pola> <file>', stdin: true },
  sort: { fn: cmd_sort, desc: 'urutkan baris', usage: 'sort [-r][-u] <file>', stdin: true },
  uniq: { fn: cmd_uniq, desc: 'hapus baris duplikat berurutan', usage: 'uniq [-c] <file>', stdin: true },
  cut: { fn: cmd_cut, desc: 'ambil kolom tertentu', usage: 'cut -d: -f1 <file>', stdin: true },
  tr: { fn: cmd_tr, desc: 'ganti karakter', usage: 'tr <set1> <set2>', stdin: true },
  rev: { fn: cmd_rev, desc: 'balik teks tiap baris', usage: 'rev <file>', stdin: true },
  diff: { fn: cmd_diff, desc: 'bandingkan dua file', usage: 'diff <f1> <f2>' },
  strings: { fn: cmd_strings, desc: 'ambil teks yang bisa dibaca', usage: 'strings <file>', stdin: true },

  base64: { fn: cmd_base64, desc: 'encode/decode base64', usage: 'base64 [-d] <file>', stdin: true },
  xxd: { fn: cmd_xxd, desc: 'tampilkan hex dump', usage: 'xxd <file>', stdin: true },
  md5sum: { fn: hashCmd('md5sum'), desc: 'hitung hash MD5', usage: 'md5sum <file>', stdin: true },
  sha256sum: { fn: hashCmd('sha256sum'), desc: 'hitung hash SHA-256', usage: 'sha256sum <file>', stdin: true },

  mkdir: { fn: cmd_mkdir, desc: 'buat direktori', usage: 'mkdir [-p] <dir>' },
  touch: { fn: cmd_touch, desc: 'buat file kosong', usage: 'touch <file>' },
  echo: { fn: cmd_echo, desc: 'cetak teks (bisa pakai > untuk tulis ke file)', usage: 'echo <teks> [> file]' },
  cp: { fn: cmd_cp, desc: 'salin file', usage: 'cp <src> <dst>' },
  mv: { fn: cmd_mv, desc: 'pindah / ganti nama file', usage: 'mv <src> <dst>' },
  chmod: { fn: cmd_chmod, desc: 'ubah permission file', usage: 'chmod 644 <file>' },
  chown: { fn: cmd_chown, desc: 'ubah pemilik file (root)', usage: 'chown <user> <file>' },
  ln: { fn: cmd_ln, desc: 'buat link ke file', usage: 'ln -s <target> <link>' },

  whoami: { fn: cmd_whoami, desc: 'tampilkan user aktif', usage: 'whoami' },
  id: { fn: cmd_id, desc: 'tampilkan uid/gid user', usage: 'id [user]' },
  groups: { fn: cmd_groups, desc: 'tampilkan grup user', usage: 'groups' },
  users: { fn: cmd_users, desc: 'daftar user di sistem', usage: 'users' },
  last: { fn: staticCmd('last'), desc: 'riwayat login', usage: 'last' },
  w: { fn: staticCmd('w'), desc: 'siapa yang sedang login', usage: 'w' },

  uname: { fn: cmd_uname, desc: 'info kernel & OS', usage: 'uname -a' },
  hostname: { fn: cmd_hostname, desc: 'nama host', usage: 'hostname' },
  uptime: { fn: cmd_uptime, desc: 'lama server menyala', usage: 'uptime' },
  date: { fn: cmd_date, desc: 'tanggal & waktu', usage: 'date' },
  env: { fn: cmd_env, desc: 'variabel environment', usage: 'env' },
  ps: { fn: staticCmd('ps'), desc: 'daftar proses', usage: 'ps aux' },
  free: { fn: staticCmd('free'), desc: 'pemakaian memori', usage: 'free -m' },
  netstat: { fn: staticCmd('netstat'), desc: 'koneksi jaringan', usage: 'netstat -tuln' },
  ss: { fn: staticCmd('netstat'), desc: 'koneksi jaringan', usage: 'ss -tuln' },
  ifconfig: { fn: staticCmd('ifconfig'), desc: 'konfigurasi jaringan', usage: 'ifconfig' },
  ip: { fn: staticCmd('ifconfig'), desc: 'konfigurasi jaringan', usage: 'ip a' },
  ping: { fn: cmd_ping, desc: 'tes koneksi ke host', usage: 'ping <host>' },
  systemctl: { fn: cmd_systemctl, desc: 'kelola service', usage: 'systemctl status <svc>' },
  crontab: { fn: cmd_crontab, desc: 'lihat jadwal cron', usage: 'crontab -l' },

  which: { fn: cmd_which, desc: 'lokasi sebuah command', usage: 'which <cmd>' },
  man: { fn: cmd_man, desc: 'keterangan sebuah command', usage: 'man <cmd>' },
  help: { fn: cmd_help, desc: 'daftar semua command', usage: 'help' },
};

module.exports = { COMMANDS, parseFlags, ok, fail, lines };

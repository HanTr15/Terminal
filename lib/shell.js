// Shell: memproses satu baris input. Menangani pipe (|), redirect (> >>),
// quote, dan proses login (su / sudo / exit).

const { SYSTEM, USERS, COMMAND_OUTPUT } = require('./config');
const { COMMANDS } = require('./commands');
const {
  buildFilesystem,
  normalizePath,
  getNode,
  getParent,
  canWrite,
  writeDenied,
  mkfile,
} = require('./vfs');

function newSessionState() {
  const defUser = SYSTEM.defaultUser || 'guest';
  return {
    fs: buildFilesystem(),
    cwd: (USERS[defUser] && USERS[defUser].home) || '/',
    user: defUser,
    userStack: [],
  };
}

function tokenize(str) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// Pecah baris jadi segmen berdasarkan | yang berada di luar quote
function splitPipes(line) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (const ch of line) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '|') {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length);
}

// Pisahkan redirect di akhir segmen.
// `2>/dev/null` dan `2>&1` diabaikan (dibuang), seperti membuang stderr.
function extractRedirect(segment) {
  let seg = segment.replace(/\s*2>\s*(&1|\/dev\/null|\S+)/g, '').trim();
  const m = seg.match(/^(.*?)\s*(>>|>)\s*(\S+)\s*$/);
  if (!m) return { cmd: seg, redirect: null };
  const target = m[3];
  // menulis ke /dev/null artinya output dibuang
  if (target === '/dev/null') return { cmd: m[1].trim(), redirect: { devnull: true } };
  return { cmd: m[1].trim(), redirect: { append: m[2] === '>>', target } };
}

const SPECIAL = new Set(['clear', 'history', 'exit', 'logout', 'su', 'sudo', 'login']);

function execute(state, rawLine) {
  const line = (rawLine || '').trim();
  if (!line) return { output: '', state };

  // ── Command khusus yang mengubah state shell ──
  const tks = tokenize(line);
  const head = tks[0];

  if (head === 'clear') return { output: '', control: 'clear', state };
  if (head === 'history') return { output: '', control: 'history', state };

  if (head === 'exit' || head === 'logout') {
    if (state.userStack && state.userStack.length) {
      const prev = state.userStack.pop();
      state.user = prev.user;
      state.cwd = prev.cwd;
      return { output: `logout\nkembali sebagai ${state.user}`, state };
    }
    return { output: 'logout: kamu sudah berada di sesi paling awal', state };
  }

  if (head === 'su' || head === 'login') {
    const target = tks.filter((t) => t !== '-' && t !== 'su' && t !== 'login')[0] || 'root';
    if (!USERS[target]) return { output: `su: user ${target} does not exist`, state };
    if (!USERS[target].password) {
      return { output: `su: Authentication failure (akun '${target}' tidak bisa dipakai login)`, state };
    }
    return { output: '', control: 'ask-password', pendingUser: target, state };
  }

  if (head === 'sudo') {
    const sub = tks.slice(1);
    if (sub[0] === '-l') {
      return {
        output: String(COMMAND_OUTPUT.sudoList || '').replace(/%USER%/g, state.user),
        state,
      };
    }
    if (!sub.length) return { output: 'usage: sudo <command>', state };
    if (!USERS[state.user] || !USERS[state.user].password) {
      return {
        output: `${state.user} is not in the sudoers file. This incident will be reported.`,
        state,
      };
    }
    // sudo <cmd> -> minta password, lalu jalankan sebagai root sekali
    return {
      output: '',
      control: 'ask-password',
      pendingUser: state.user,
      pendingCommand: sub.join(' '),
      state,
    };
  }

  return { output: runPipeline(state, line), state };
}

// Verifikasi password untuk `su` atau `sudo`
function authenticate(state, targetUser, password, pendingCommand) {
  const u = USERS[targetUser];
  if (!u || u.password !== password) {
    return {
      output: pendingCommand
        ? 'sudo: Sorry, try again.\nsudo: 1 incorrect password attempt'
        : 'su: Authentication failure',
      state,
    };
  }

  // Kasus sudo: jalankan satu command sebagai root
  if (pendingCommand) {
    const saved = state.user;
    state.user = 'root';
    let out;
    try {
      out = runPipeline(state, pendingCommand);
    } finally {
      state.user = saved;
    }
    return { output: out, state };
  }

  // Kasus su: ganti user
  state.userStack = state.userStack || [];
  state.userStack.push({ user: state.user, cwd: state.cwd });
  state.user = targetUser;
  state.cwd = u.home || '/';
  return { output: '', state };
}

// Command yang benar-benar mengubah isi filesystem.
const MUTATORS = new Set(['mkdir', 'touch', 'cp', 'mv', 'chmod', 'chown', 'ln']);

function runPipeline(state, line) {
  const segments = splitPipes(line);
  let stdin = null;
  let finalOut = '';

  for (let i = 0; i < segments.length; i++) {
    const { cmd, redirect } = extractRedirect(segments[i]);
    const tokens = tokenize(cmd);
    if (!tokens.length) continue;
    const name = tokens[0];
    const args = tokens.slice(1);

    // Tandai sesi "kotor" supaya server tahu filesystem perlu disimpan.
    if (MUTATORS.has(name) || (redirect && !redirect.devnull)) {
      state.dirty = true;
    }

    if (SPECIAL.has(name)) {
      return `${name}: tidak bisa dipakai di dalam pipe`;
    }

    const entry = COMMANDS[name];
    if (!entry) {
      if (name === 'rm' || name === 'rmdir') {
        return `bash: ${name}: command not found`;
      }
      if (name === 'nano' || name === 'vim' || name === 'vi') {
        return `bash: ${name}: command not found`;
      }
      return `bash: ${name}: command not found`;
    }

    const ctx = state;
    let result;
    try {
      result = entry.fn(ctx, args, entry.stdin ? stdin : null);
    } catch (e) {
      result = { out: '', err: `${name}: ${e.message}` };
    }

    const text = result.err ? result.err : result.out;

    if (redirect) {
      if (redirect.devnull) {
        stdin = null;
        finalOut = '';
        continue;
      }
      const writeRes = writeToFile(state, redirect, text);
      if (writeRes) return writeRes;
      stdin = null;
      finalOut = '';
      continue;
    }

    if (result.err) return result.err;
    stdin = result.out;
    finalOut = result.out;
  }
  return finalOut;
}

function writeToFile(state, redirect, text) {
  const path = normalizePath(state.cwd, redirect.target, state.user);
  if (!canWrite(path, state.user)) {
    return writeDenied(redirect.target, state.user, 'bash');
  }
  const { parent, name } = getParent(state.fs, path);
  if (!parent || parent.type !== 'dir') {
    return `bash: ${redirect.target}: No such file or directory`;
  }
  const existing = parent.children[name];
  if (existing && existing.type === 'dir') {
    return `bash: ${redirect.target}: Is a directory`;
  }
  const body = (text || '') + '\n';
  parent.children[name] =
    redirect.append && existing
      ? mkfile(existing.content + body, existing.owner, existing.mode)
      : mkfile(body, state.user, '-rw-r--r--');
  return null;
}

function promptFor(state) {
  const u = USERS[state.user] || {};
  const home = u.home || '';
  let cwd = state.cwd;
  if (home && cwd === home) cwd = '~';
  else if (home && cwd.startsWith(home + '/')) cwd = '~' + cwd.slice(home.length);
  return `${state.user}@${SYSTEM.hostname}:${cwd}${u.promptChar || '$'}`;
}

module.exports = { newSessionState, execute, authenticate, promptFor, tokenize };

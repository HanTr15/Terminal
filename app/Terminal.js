'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HELP_TEXT, LOCAL_COMMANDS, BANNER } from '../lib/clientCommands';

// Batas jumlah baris yang disimpan di layar. Baris lama dibuang supaya
// DOM tidak membengkak saat sesi panjang.
const MAX_LINES = 600;

function getSessionId() {
  try {
    let id = localStorage.getItem('ctf_term_sid');
    if (!id) {
      id = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('ctf_term_sid', id);
    }
    return id;
  } catch {
    return 's' + Math.random().toString(36).slice(2, 10);
  }
}

export default function Terminal() {
  // Seluruh output disimpan sebagai SATU string, bukan array of elements.
  // Ini menghilangkan ratusan node React dan bikin render jauh lebih ringan.
  const [screen, setScreen] = useState(BANNER);
  const [input, setInput] = useState('');
  const [prompt, setPrompt] = useState('student@linux-lab:~$');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  const histRef = useRef([]);
  const histIdxRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const sidRef = useRef('');

  useEffect(() => {
    sidRef.current = getSessionId();
    inputRef.current?.focus();
  }, []);

  // Textarea auto-grow: tinggi disesuaikan tiap kali isinya berubah, supaya
  // command yang panjang wrap ke baris baru alih-alih ke-clip/scroll ke samping.
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  useEffect(() => {
    window.addEventListener('resize', resizeInput);
    return () => window.removeEventListener('resize', resizeInput);
  }, [resizeInput]);

  // Setelah command selesai, langsung kembalikan fokus ke prompt.
  useEffect(() => {
    if (!busy && !pending) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [busy, pending]);

  // Scroll ke bawah tanpa smooth-behaviour (smooth = mahal saat output panjang)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [screen, pending]);

  const append = useCallback((text) => {
    setScreen((prev) => {
      const next = prev + text + '\n';
      if (next.length < 60000) return next;
      const lines = next.split('\n');
      return lines.slice(-MAX_LINES).join('\n');
    });
  }, []);

  const api = useCallback(async (payload) => {
    const url = payload.mode === 'complete' ? '/api/complete' : '/api/terminal';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sidRef.current, ...payload }),
    });
    return { ok: res.ok, data: await res.json() };
  }, []);

  async function runCommand(cmd) {
    // ── Fast path: command yang tidak menyentuh filesystem dijalankan
    //    langsung di browser, tanpa request ke server sama sekali.
    if (cmd === 'clear') {
      setScreen('');
      return;
    }
    if (cmd === 'history') {
      append(`${prompt} ${cmd}`);
      append(histRef.current.map((h, i) => `  ${String(i + 1).padStart(3)}  ${h}`).join('\n') || '(kosong)');
      return;
    }
    if (cmd === 'help') {
      append(`${prompt} ${cmd}`);
      append(HELP_TEXT);
      return;
    }
    const local = LOCAL_COMMANDS[cmd];
    if (local) {
      append(`${prompt} ${cmd}`);
      append(local);
      return;
    }

    append(`${prompt} ${cmd}`);
    setBusy(true);
    try {
      const { ok, data } = await api({ command: cmd });
      if (!ok) {
        append(`error: ${data.error || 'gagal menghubungi server'}`);
        return;
      }
      if (data.control === 'clear') {
        setScreen('');
        return;
      }
      if (data.control === 'ask-password') {
        setPending({ user: data.pendingUser, command: data.pendingCommand });
        return;
      }
      if (data.output) append(data.output);
      if (data.prompt) setPrompt(data.prompt);
    } catch {
      append('error: gagal terhubung ke server');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function sendPassword(pw) {
    const p = pending;
    setPending(null);
    setBusy(true);
    append(`Password: `);
    try {
      const { ok, data } = await api({
        mode: 'password',
        pendingUser: p.user,
        pendingCommand: p.command || null,
        password: pw,
      });
      if (!ok) append(`error: ${data.error || 'gagal'}`);
      else {
        if (data.output) append(data.output);
        if (data.prompt) setPrompt(data.prompt);
      }
    } catch {
      append('error: gagal terhubung ke server');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const value = input;
    setInput('');

    if (pending) {
      sendPassword(value);
      return;
    }
    const cmd = value.trim();
    if (!cmd) {
      append(prompt);
      return;
    }
    histRef.current.push(cmd);
    histIdxRef.current = null;
    runCommand(cmd);
  }

  // ── Tab autocomplete ────────────────────────────────────────────────────
  // Token pertama (nama command) diselesaikan dari daftar statis di browser
  // — instan, tanpa request. Token setelahnya (path file/folder) diselesaikan
  // lewat /api/complete yang membaca filesystem sesi ini di server, supaya
  // hasilnya selalu sesuai isi folder yang sebenarnya.
  function commonPrefix(strs) {
    if (!strs.length) return '';
    let p = strs[0];
    for (const s of strs.slice(1)) {
      let i = 0;
      while (i < p.length && i < s.length && p[i] === s[i]) i++;
      p = p.slice(0, i);
      if (!p) break;
    }
    return p;
  }

  function replaceLastToken(newToken) {
    // split(' ') pada input yang diakhiri spasi (mis. "cd ") sudah otomatis
    // menghasilkan elemen kosong di akhir ["cd",""], jadi cukup timpa elemen
    // terakhir — tidak perlu push, supaya tidak muncul spasi ganda.
    const parts = input.split(' ');
    parts[parts.length - 1] = newToken;
    setInput(parts.join(' '));
  }

  async function handleTab() {
    const endsWithSpace = input.endsWith(' ');
    const parts = input.split(' ');
    const isFirstToken = parts.length === 1 && !endsWithSpace;

    if (isFirstToken) {
      // ── Nama command: instan, dari daftar statis ──
      const word = parts[0];
      if (!word) return;
      const matches = COMPLETIONS.filter((c) => c.startsWith(word));
      if (matches.length === 1) {
        setInput(matches[0] + ' ');
      } else if (matches.length > 1) {
        const cp = commonPrefix(matches);
        if (cp.length > word.length) setInput(cp);
        else append(matches.join('  '));
      }
      return;
    }

    // ── Argumen (path file/folder): minta ke server ──
    const partial = endsWithSpace ? '' : parts[parts.length - 1];
    try {
      const { ok, data } = await api({ mode: 'complete', partial });
      if (!ok || !data.matches) return;
      const matches = data.matches;
      if (!matches.length) return; // tidak ada yang cocok, diamkan (seperti bash)

      if (matches.length === 1) {
        replaceLastToken(matches[0].full + (matches[0].isDir ? '' : ' '));
        return;
      }
      const fulls = matches.map((m) => m.full);
      const cp = commonPrefix(fulls);
      if (cp.length > partial.length) {
        replaceLastToken(cp);
      } else {
        // ambigu dan tidak bisa dipersingkat lagi -> tampilkan daftar, seperti bash
        append(matches.map((m) => m.name + (m.isDir ? '/' : '')).join('  '));
      }
    } catch {
      // koneksi gagal: diam saja, jangan ganggu pengetikan user
    }
  }

  function onKeyDown(e) {
    // Enter selalu submit (bukan newline literal di textarea), baik saat
    // command biasa maupun saat lagi diminta password.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
      return;
    }
    if (pending) return;
    const hist = histRef.current;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hist.length) return;
      const i = histIdxRef.current === null ? hist.length - 1 : Math.max(0, histIdxRef.current - 1);
      histIdxRef.current = i;
      setInput(hist[i]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdxRef.current === null) return;
      const i = histIdxRef.current + 1;
      if (i >= hist.length) {
        histIdxRef.current = null;
        setInput('');
      } else {
        histIdxRef.current = i;
        setInput(hist[i]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTab();
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setScreen('');
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      append(`${prompt} ${input}^C`);
      setInput('');
    }
  }

  return (
    <div
      ref={scrollRef}
      onMouseDown={(e) => {
        // Klik terminal = kembali ke prompt, kecuali sedang memilih teks.
        if (!window.getSelection()?.toString() && e.target === e.currentTarget) {
          inputRef.current?.focus();
        }
      }}
      onMouseUp={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
      className="term"
    >
      <div className="term-content">
        <pre className="out">{screen}</pre>
      </div>
      <form onSubmit={onSubmit} className="row">
        <span className="ps1">{pending ? `[sudo] password for ${pending.user}:` : prompt}</span>
        <textarea
          ref={inputRef}
          className={pending ? 'in in-pw' : 'in'}
          value={input}
          disabled={busy}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
      </form>
    </div>
  );
}

const COMPLETIONS = [
  'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'tree', 'head', 'tail', 'wc',
  'sort', 'uniq', 'cut', 'tr', 'rev', 'nl', 'diff', 'strings', 'stat', 'file',
  'base64', 'xxd', 'md5sum', 'sha256sum', 'mkdir', 'touch', 'echo', 'cp', 'mv',
  'chmod', 'chown', 'whoami', 'id', 'groups', 'su', 'sudo', 'exit', 'users',
  'uname', 'hostname', 'uptime', 'date', 'env', 'ps', 'free', 'df', 'du',
  'netstat', 'ifconfig', 'ping', 'systemctl', 'crontab', 'last', 'w',
  'which', 'man', 'history', 'clear', 'help',
];

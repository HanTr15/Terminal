/*!
 * WebTerm — widget terminal melayang
 * ---------------------------------------------------------------------------
 * Cara pakai di web kamu yang lain, cukup tempel SATU baris ini
 * sebelum </body>:
 *
 *   <script src="https://DOMAIN-KAMU.vercel.app/embed.js" defer></script>
 *
 * Opsi (semua opsional, pakai atribut data-*):
 *
 *   <script src="https://DOMAIN-KAMU.vercel.app/embed.js" defer
 *           data-title="CTF Challenge"
 *           data-subtitle="Klik untuk membuka terminal"
 *           data-position="bottom-right"   // bottom-left | top-right | top-left
 *           data-mode="card"               // card | button
 *           data-open="overlay"></script>  // overlay | newtab
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var origin = new URL(script.src).origin;
  var cfg = {
    title: script.dataset.title || 'WebTerm',
    subtitle: script.dataset.subtitle || 'Terminal Linux — cari flag-nya',
    position: script.dataset.position || 'bottom-right',
    mode: script.dataset.mode || 'card',
    open: script.dataset.open || 'overlay',
    url: script.dataset.url || origin,
  };

  var POS = {
    'bottom-right': 'bottom:20px;right:20px;',
    'bottom-left': 'bottom:20px;left:20px;',
    'top-right': 'top:20px;right:20px;',
    'top-left': 'top:20px;left:20px;',
  };

  var css =
    '.wt-launch{position:fixed;' +
    (POS[cfg.position] || POS['bottom-right']) +
    'z-index:2147483000;display:flex;align-items:center;gap:10px;' +
    'background:#14161c;color:#d8dee9;border:1px solid #2c3038;border-radius:10px;' +
    'padding:10px 14px;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.35);' +
    "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;" +
    'transition:transform .15s ease,border-color .15s ease;max-width:280px}' +
    '.wt-launch:hover{transform:translateY(-2px);border-color:#4ade80}' +
    '.wt-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex:none;' +
    'box-shadow:0 0 8px #4ade80}' +
    '.wt-txt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.wt-t{color:#eceff4;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.wt-s{color:#8b94a3;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.wt-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.6);' +
    'display:flex;align-items:center;justify-content:center;padding:24px;' +
    'opacity:0;transition:opacity .18s ease}' +
    '.wt-ov.on{opacity:1}' +
    '.wt-win{width:min(1000px,100%);height:min(640px,100%);background:#14161c;' +
    'border:1px solid #2c3038;border-radius:12px;overflow:hidden;display:flex;' +
    'flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.5)}' +
    '.wt-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;' +
    'background:#1a1d24;border-bottom:1px solid #2c3038;flex:none}' +
    '.wt-bar b{font:600 12px ui-monospace,monospace;color:#8b94a3;margin-left:6px;flex:1}' +
    '.wt-x{background:none;border:0;color:#8b94a3;cursor:pointer;font-size:18px;' +
    'line-height:1;padding:2px 6px;border-radius:4px}' +
    '.wt-x:hover{background:#2c3038;color:#eceff4}' +
    '.wt-f{flex:1;width:100%;border:0;display:block}' +
    '@media(max-width:600px){.wt-ov{padding:0}.wt-win{height:100%;border-radius:0;border:0}' +
    '.wt-launch{max-width:200px}.wt-s{display:none}}';

  function injectCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  var overlay = null;

  function openOverlay() {
    if (cfg.open === 'newtab') {
      window.open(cfg.url, '_blank', 'noopener');
      return;
    }
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'wt-ov';
    overlay.innerHTML =
      '<div class="wt-win" role="dialog" aria-label="' +
      cfg.title +
      '">' +
      '<div class="wt-bar">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></span>' +
      '<span style="width:10px;height:10px;border-radius:50%;background:#febc2e"></span>' +
      '<span style="width:10px;height:10px;border-radius:50%;background:#28c840"></span>' +
      '<b>' +
      cfg.title +
      '</b>' +
      '<button class="wt-x" aria-label="Tutup">&times;</button>' +
      '</div>' +
      // iframe baru di-load saat dibuka, jadi tidak membebani halaman utama
      '<iframe class="wt-f" src="' +
      cfg.url +
      '" title="' +
      cfg.title +
      '" loading="lazy"></iframe>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add('on');
    });

    overlay.querySelector('.wt-x').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeOverlay();
  }

  function closeOverlay() {
    if (!overlay) return;
    document.removeEventListener('keydown', onEsc);
    overlay.classList.remove('on');
    var el = overlay;
    overlay = null;
    setTimeout(function () {
      el.remove();
    }, 180);
  }

  function build() {
    injectCss();

    var btn = document.createElement('div');
    btn.className = 'wt-launch';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');

    if (cfg.mode === 'button') {
      btn.innerHTML = '<span class="wt-dot"></span><span class="wt-t">' + cfg.title + '</span>';
    } else {
      btn.innerHTML =
        '<span class="wt-dot"></span>' +
        '<span class="wt-txt">' +
        '<span class="wt-t">' +
        cfg.title +
        '</span>' +
        '<span class="wt-s">' +
        cfg.subtitle +
        '</span>' +
        '</span>';
    }

    btn.addEventListener('click', openOverlay);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openOverlay();
      }
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

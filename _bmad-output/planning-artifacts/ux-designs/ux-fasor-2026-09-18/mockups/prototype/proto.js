/* PRODUTO — proto.js
   Hash router + generic data-attribute behaviors for the navigable prototype.
   Screen fragments never write JS: they use the data-* API documented in README.md. */
(function () {
  'use strict';
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const frame   = $('#frame');
  const screens = $$('#screen-body > .screen');
  const DEVICES = { tablet: 'frame-tablet', 'tablet-landscape': 'frame-tablet-landscape', phone: 'frame-phone', desktop: 'frame-desktop' };
  const SYNC_SHORT = { ok: 'OK', offline: 'Off', pending: 'Pend.', error: 'Erro', conflict: 'Confl.' };
  const state = { device: 'tablet', theme: 'system', fit: true, railOpen: false, railCollapsed: false, screen: null, taps: 0 };

  /* ---------- Routing ---------- */
  function matchRoute(path) {
    const exact = screens.find(s => s.dataset.route === path);
    if (exact) return { screen: exact, params: {} };
    const segs = path.split('/');
    for (const s of screens) {
      const pat = s.dataset.route.split('/');
      if (!s.dataset.route.includes(':') || pat.length !== segs.length) continue;
      const params = {}; let ok = true;
      pat.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]); else if (p !== segs[i]) ok = false; });
      if (ok) return { screen: s, params };
    }
    return { screen: screens.find(s => s.dataset.route === '*'), params: {} };
  }
  function currentPath() { return location.hash.slice(1) || '/login'; }
  function route() {
    const path = currentPath();
    const { screen, params } = matchRoute(path);
    if (!screen) return;
    if (state.screen && state.screen !== screen) $$('.dialog-scrim', state.screen).forEach(d => { d.hidden = true; });
    screens.forEach(s => s.classList.toggle('is-active', s === screen));
    state.screen = screen;
    // dynamic segment → data-param on the section + [data-bind="<name>"] text; [data-bind="route"] shows the path
    screen.dataset.param = Object.values(params)[0] || '';
    $$('[data-bind]', screen).forEach(el => { const b = el.dataset.bind; if (b === 'route') el.textContent = path; else if (b in params) el.textContent = params[b]; });
    // shell
    let title = screen.dataset.title || '';
    Object.keys(params).forEach(k => { title = title.replace(':' + k, params[k]); });
    frame.dataset.shell = screen.dataset.shell === 'bare' ? 'bare' : 'app';
    $('#bar-title').textContent = title;
    $('#bar-back').hidden = path === '/home';
    const sync = screen.dataset.sync || 'ok', syncLabel = screen.dataset.syncLabel || 'Sincronizado';
    $('#bar-sync').dataset.state = sync;
    $('#bar-sync-label').textContent = syncLabel;
    $('#bar-sync-short').textContent = (sync === 'pending' && /^\d+/.test(syncLabel)) ? syncLabel.match(/^\d+/)[0] : (SYNC_SHORT[sync] || syncLabel);   // phone: dot + short word
    $('#bar-avatar').textContent = screen.dataset.user || 'B';
    $('#browser-url').textContent = 'produto.app/#' + path;
    $('#proto-route').textContent = '#' + path;
    document.title = 'PRODUTO — ' + (title || path);
    // banner slot: reset, then open what the screen declares (data-banner="#slot-a,#slot-b")
    $$('#banner-slot > *').forEach(b => { b.hidden = true; });
    (screen.dataset.banner || '').split(',').map(s => s.trim()).filter(Boolean).forEach(id => { const b = $(id); if (b) b.hidden = false; });
    syncBannerSlot();
    // tap counter: reset per route; shown only where the screen uses data-count-tap
    state.taps = 0; $('#proto-taps-n').textContent = '0';
    $('#proto-taps').hidden = !(screen.hasAttribute('data-count-tap') || $('[data-count-tap]', screen));
    state.railOpen = false; applyRail();
    screen.scrollTop = 0;
    $('#proto-map').hidden = true;
  }
  function syncBannerSlot() {   // one slot: the first visible banner is drawn; the others fold into its "+N" chip
    const open = $$('#banner-slot > :not([hidden])');
    open.forEach((b, i) => { const more = $('.banner-more', b); if (!more) return; more.hidden = !(i === 0 && open.length > 1); more.textContent = '+' + (open.length - 1); });
  }

  /* ---------- Rail (Relatório tree) ---------- */
  function railMode() {
    if (!state.screen || state.screen.dataset.rail !== 'true') return 'off';
    const wide = state.device === 'tablet-landscape' || state.device === 'desktop';
    if (wide && !state.railCollapsed) return 'inline';
    return state.device === 'phone' ? 'none' : 'strip';
  }
  function applyRail() {
    const mode = railMode();
    frame.dataset.railMode = mode;
    const open = mode !== 'off' && mode !== 'inline' && state.railOpen;
    frame.classList.toggle('is-rail-open', open);
    $$('[data-rail-toggle]').forEach(b => b.setAttribute('aria-expanded', String(mode === 'inline' || open)));
    const hash = '#' + currentPath();
    $$('#rail .tree-row').forEach(r => {
      const on = r.dataset.go === hash;
      r.classList.toggle('is-selected', on);
      if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
    });
  }
  function toggleRail() {
    const mode = railMode();
    const wide = state.device === 'tablet-landscape' || state.device === 'desktop';
    if (mode === 'inline') state.railCollapsed = true;
    else if (mode === 'strip' && wide && state.railCollapsed) state.railCollapsed = false;
    else state.railOpen = !state.railOpen;
    applyRail();
  }

  /* ---------- Device, theme, fit ---------- */
  function setDevice(d) {
    if (!DEVICES[d]) return;
    state.device = d;
    Object.values(DEVICES).forEach(c => frame.classList.remove(c));
    frame.classList.add(DEVICES[d]);
    $$('[data-device-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.deviceSet === d)));
    state.railOpen = false; applyRail(); fit();
  }
  function setTheme(t) {
    state.theme = t;
    if (t === 'system') frame.removeAttribute('data-theme'); else frame.dataset.theme = t;
    $$('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
  }
  function fit() {
    const stage = $('#proto-stage'), dev = $('#proto-device');
    frame.style.transform = ''; dev.style.width = ''; dev.style.height = '';
    if (!state.fit) return;
    const w = frame.offsetWidth, h = frame.offsetHeight;
    const s = Math.min(1, (stage.clientWidth - 48) / w, (stage.clientHeight - 48) / h);
    if (s < 1) { frame.style.transform = 'scale(' + s + ')'; dev.style.width = (w * s) + 'px'; dev.style.height = (h * s) + 'px'; }
  }

  /* ---------- Toast and map ---------- */
  let toastTimer;
  function toast(text, action) {
    const t = $('#proto-toast'), a = $('#proto-toast-action');
    $('#proto-toast-text').textContent = text;
    a.hidden = !action; if (action) a.textContent = action;
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }
  function buildMap() {   // the fixed route table is static in shell-foot.html; here we mark what has no fragment yet and add dynamic examples
    $$('#proto-map-list > li[data-route]').forEach(li => {
      const r = li.dataset.route, s = screens.find(x => x.dataset.route === r), sm = $('small', li);
      sm.classList.toggle('is-missing', !s);
      if (!s) { sm.textContent = sm.textContent.replace(/ · em construção$/, '') + ' · em construção'; return; }
      const ex = (s.dataset.examples || '').split(',').map(x => x.trim()).filter(Boolean);
      if (r.includes(':') && ex.length && !li.dataset.expanded) {
        li.dataset.expanded = '1';
        sm.textContent = s.dataset.title.replace(/:\w+/, '…');
        let cur = li;
        ex.forEach(v => { const p = r.replace(/:\w+/, v), e = document.createElement('li'), a = document.createElement('a'), t = document.createElement('small');
          a.href = '#' + p; a.textContent = p; t.textContent = s.dataset.title.replace(/:\w+/, v); e.append(a, t); cur.after(e); cur = e; });
      }
    });
  }

  /* ---------- Shared helpers for the data-* actions ---------- */
  function find(sel) { return (state.screen && $(sel, state.screen)) || $(sel); }   // inside the active screen first, then the shell
  function setText(spec) {   // "#a|texto" or several targets: "#a|texto||#b|texto"
    spec.split('||').forEach(pair => { const i = pair.indexOf('|'); if (i < 0) return; const t = find(pair.slice(0, i).trim()); if (t) t.textContent = pair.slice(i + 1); });
  }
  function cycle(el, spec) {   // data-cycle="MΩ|GΩ|TΩ": the unit text (.unit-text, else the element) steps to the next value
    const opts = spec.split('|'), t = $('.unit-text', el) || el, i = opts.indexOf(t.textContent.trim());
    t.textContent = opts[(i + 1) % opts.length];
  }

  /* ---------- Click delegation: the innermost element carrying any data-* action wins ---------- */
  const ACTIONS = '[data-slice-toggle],[data-go],[data-open],[data-close],[data-toast],[data-back],[data-toggle-class],[data-tab],[data-theme-set],[data-device-set],[data-rail-toggle],[data-tree-toggle],[data-set-text],[data-fit-toggle],[data-listen],[data-cycle],[data-count-tap],[role="radio"],[role="switch"],[role="checkbox"],[aria-pressed]';
  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('dialog-scrim')) { e.target.hidden = true; return; }   // tap outside the dialog
    const el = e.target.closest(ACTIONS);
    if (!el) return;
    const d = el.dataset, role = el.getAttribute('role');
    if (el.tagName === 'A' && (el.getAttribute('href') || '#') === '#') e.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    if (el.closest('[data-count-tap]') && state.screen && state.screen.contains(el)) { state.taps++; $('#proto-taps-n').textContent = String(state.taps); }   // "Toques nesta ficha"
    if ('deviceSet' in d) setDevice(d.deviceSet);
    if ('themeSet' in d) setTheme(d.themeSet);
    if ('fitToggle' in d) { state.fit = !state.fit; el.setAttribute('aria-pressed', String(state.fit)); fit(); }
    if ('sliceToggle' in d) { const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', String(on)); document.body.classList.toggle('slice-off', !on); }
    else if ('listen' in d) {   // dictation: press → "Ouvindo…" for 1.5 s → the text lands in the target (data-set-text semantics) as a suggestion
      if (el.getAttribute('aria-pressed') === 'true') { el.setAttribute('aria-pressed', 'false'); return; }
      el.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        el.setAttribute('aria-pressed', 'false'); setText(d.listen);
        d.listen.split('||').forEach(pair => { const t = find(pair.split('|')[0].trim()), sf = t && t.closest('.suggestion-field'); if (sf) sf.dataset.state = 'suggested'; });
      }, 1500);
    }
    else if (el.hasAttribute('aria-pressed') && !(role === 'radio')) {
      if (el.matches('.chips-recent .chip')) $$('.chip', el.parentElement).forEach(c => c.setAttribute('aria-pressed', String(c === el)));   // value chips: one holds the value
      else el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
    }
    if ('railToggle' in d) toggleRail();
    if ('treeToggle' in d) { const li = el.closest('li'); if (li) li.setAttribute('aria-expanded', String(li.getAttribute('aria-expanded') !== 'true')); }
    if (role === 'radio') {   // radio within the parent group: aria-checked + is-selected (or data-toggle-class) on the chosen one
      const group = el.closest('[role="radiogroup"]') || el.parentElement, cls = d.toggleClass || 'is-selected';
      $$('[role="radio"]', group).forEach(r => { r.setAttribute('aria-checked', String(r === el)); r.classList.toggle(cls, r === el); });
    } else if (role === 'switch' || role === 'checkbox') {
      const on = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(on));
      const word = $('.toggle-word', el); if (word) word.textContent = on ? 'Ativado' : 'Desativado';
    } else if ('toggleClass' in d) {   // on itself, on data-toggle-target="#id", or radio-like between .seg siblings
      const target = !d.toggleTarget ? el
        : d.toggleTarget.startsWith('closest:') ? el.closest(d.toggleTarget.slice(8))   // e.g. closest:.s9-cabine
        : find(d.toggleTarget);
      if (!d.toggleTarget && el.matches('.seg')) $$('.seg', el.parentElement).forEach(s => s.classList.toggle(d.toggleClass, s === el));
      else if (target) target.classList.toggle(d.toggleClass);
    }
    if ('tab' in d) {
      $$('[data-tab]', el.closest('.tabs') || el.parentElement).forEach(t => t.setAttribute('aria-selected', String(t === el)));
      const panel = $('#' + d.tab);
      if (panel) { $$('[data-tab-panel]', panel.parentElement).forEach(p => { p.hidden = p !== panel; }); panel.hidden = false; }
    }
    if ('setText' in d) setText(d.setText);
    if ('cycle' in d) cycle(el, d.cycle);
    if ('toast' in d) toast(d.toast, d.toastAction);
    if ('close' in d) { const t = d.close ? find(d.close) : el.closest('.dialog-scrim,[data-overlay],.banner-slot > *'); if (t) t.hidden = true; }
    if ('open' in d) { const t = find(d.open); if (t) { if (t.id === 'proto-map') buildMap(); t.hidden = false; } }
    if (('open' in d || 'close' in d) && $('#banner-slot')) syncBannerSlot();
    if ('back' in d) { if (history.length > 1) history.back(); else location.hash = '#/home'; }
    if ('go' in d) { e.preventDefault(); location.hash = d.go.startsWith('#') ? d.go : '#' + d.go; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const map = $('#proto-map');
    if (!map.hidden) { map.hidden = true; return; }
    const open = $$('.dialog-scrim:not([hidden])', state.screen);
    if (open.length) open[open.length - 1].hidden = true; else if (state.railOpen) toggleRail();
  });

  /* ---------- Init ---------- */
  $('#rail-tree-slot').appendChild($('#rail-tree').content.cloneNode(true));
  setDevice('tablet'); setTheme('system');
  if (!location.hash) history.replaceState(null, '', '#/login');
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', fit);
  route(); fit();
})();

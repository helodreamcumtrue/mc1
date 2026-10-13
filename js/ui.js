/* All the screens around the game: loading, title, skin picker, map, vault book, hints. */
(function () {
'use strict';
const BL = window.BL, SITE = window.SITE || {};
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const ui = { mode: 'loading', started: false, playTime: 0 };
let G = null;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ------------------------------------------------------------------ modes */
const SCREENS = ['loading', 'title', 'skin', 'settings', 'guide', 'map', 'book'];
function setMode(m) {
  ui.mode = m;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== m);
  $('hud').classList.toggle('hidden', m !== 'play');
  if (m === 'title') {
    $('btn-play').textContent = ui.started ? 'Back to the World' : 'Enter World';
    $('btn-map').classList.toggle('hidden', !ui.started);
  }
  if (m === 'play') { ui.started = true; if (G) G.lock(); } else if (G) G.unlock();
  if (m === 'map') openMapView();
  if (m === 'skin') renderSkinUI();
}
ui.setMode = setMode;
ui.onLock = locked => { if (!locked && ui.mode === 'play') setMode('title'); };

/* ------------------------------------------------------------------ loading */
const LOAD_MSGS = [[0, 'Generating terrain'], [14, 'Raising the Himalayas'], [28, 'Waking the animals'], [40, 'Meshing the Taj Mahal'], [60, 'Painting Jaipur pink'], [78, 'Filling the lakes'], [92, 'Lighting the lanterns']];
ui.setLoading = (pct, msg) => {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  $('load-pct').textContent = pct + '%';
  $('load-fill').style.height = pct + '%';
  if (!msg) { for (const [p, m] of LOAD_MSGS) if (pct >= p) msg = m; }
  $('load-msg').textContent = msg + '…';
};
ui.finishLoading = () => { ui.setLoading(100, 'Welcome'); setTimeout(() => setMode('title'), 650); };

function makeDirt() {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); const r = BL.mulberry(77);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (r() - 0.5) * 30 | 0; g.fillStyle = `rgb(${60 + k},${42 + k},${28 + k})`; g.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 18; i++) { g.fillStyle = 'rgb(38,26,17)'; g.fillRect(r() * 16 | 0, r() * 16 | 0, 1, 1); }
  document.documentElement.style.setProperty('--dirt', `url(${c.toDataURL()})`);
}

/* ------------------------------------------------------------------ toasts and hints */
function icon(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (kind === 'vault') { p(1, 2, 14, 12, '#2c3c4a'); p(2, 3, 12, 10, '#3f5a6e'); p(6, 6, 4, 4, '#7fe9d8'); p(7, 9, 2, 3, '#1e2a33'); p(0, 1, 16, 2, '#5b6b78'); }
  else if (kind === 'portal') { p(3, 0, 10, 16, '#1b1226'); p(5, 2, 6, 12, '#a14de8'); p(6, 4, 4, 8, '#d9a3ff'); }
  else if (kind === 'map') { p(1, 1, 14, 14, '#c9a566'); p(2, 2, 12, 12, '#e6cf9f'); p(4, 4, 3, 3, '#b8553a'); p(8, 8, 4, 2, '#8a5a2b'); p(9, 5, 3, 1, '#6a8f99'); }
  else if (kind === 'star') { p(7, 1, 2, 14, '#ffd24a'); p(1, 7, 14, 2, '#ffd24a'); p(4, 4, 8, 8, '#ffe58a'); }
  else { p(1, 3, 14, 11, '#3a3a3a'); p(2, 4, 12, 9, '#8a8a8a'); p(3, 5, 10, 6, '#d8d8d8'); p(1, 12, 14, 2, '#222'); }
  return c;
}
const tq = []; let tBusy = false;
function toast(o) { tq.push(o); pump(); }
function pump() {
  if (tBusy || !tq.length) return;
  const o = tq.shift(); tBusy = true;
  const t = el('div', 'toast'); const ic = el('div', 'toast-icon'); ic.appendChild(icon(o.icon || 'key'));
  const body = el('div', 'toast-body', `<div class="toast-title">${o.title}</div><div class="toast-text">${o.html}</div>`);
  t.appendChild(ic); t.appendChild(body); $('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => { t.remove(); tBusy = false; pump(); }, 450); }, o.ms || 7000);
}
ui.toast = toast;

const HINTS = [
  { id: 'move', when: s => s.playing, title: 'Getting around', icon: 'key', html: 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and look around with the mouse.' },
  { id: 'jump', when: s => s.playTime > 8, title: 'Jump and fly', icon: 'key', html: 'Press <kbd>Space</kbd> to jump. Tap it twice to fly, then hold <kbd>Shift</kbd> to come down.' },
  { id: 'map', when: s => s.playTime > 18, title: 'Your map', icon: 'map', html: 'Press <kbd>E</kbd> to open the map. Pick any place to travel there.' },
  { id: 'view', when: s => s.playTime > 36, title: 'Change your view', icon: 'key', html: 'Press <kbd>P</kbd> to switch between first and third person.' },
  { id: 'build', when: s => s.playTime > 58, title: 'Build anything', icon: 'key', html: '<kbd>Left click</kbd> breaks a block, <kbd>Right click</kbd> places one. <kbd>Z</kbd><kbd>X</kbd> changes the block in your slot.' },
  { id: 'vault', when: s => s.nearVault < 10, title: 'Wayfare Safe', icon: 'vault', html: 'Look at the safe and <kbd>Click</kbd> to open it. Inside are photos and stories from this place.' },
  { id: 'portal', when: s => s.nearPortal < 12, title: 'The Night Portal', icon: 'portal', html: 'Walk into the glowing portal and stay still for a moment to see the night side.' },
  { id: 'night', when: s => s.dim === 1, title: 'The night side', icon: 'portal', html: 'Fireflies, sky lanterns and aurora. Walk back into the portal to return to daylight.' }
];
let seen = new Set(lsGet('bl3_hints', []));
ui.resetHints = () => { seen = new Set(); lsSet('bl3_hints', []); };
ui.tick = (dt, s) => {
  if (ui.mode !== 'play') return;
  ui.playTime += dt; s.playTime = ui.playTime;
  if (!G.S.hints || tBusy || tq.length) return;
  for (const h of HINTS) if (!seen.has(h.id) && h.when(s)) { seen.add(h.id); lsSet('bl3_hints', [...seen]); toast({ title: h.title, html: h.html, icon: h.icon }); break; }
};

/* ------------------------------------------------------------------ skins */
function drawSkin(ctx, sk, px, ox, oy) {
  const c = sk.c, has = e => sk.extras.indexOf(e) >= 0, kurta = has('kurta');
  const r = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(ox + x * px), Math.round(oy + y * px), Math.ceil(w * px), Math.ceil(h * px)); };
  const lines = (x, y, w, h, a, b) => { for (let i = 0; i < h; i += 2) r(x, y + i, w, 0.5, a); for (let i = 0; i < w; i += 2) r(x + i, y, 0.5, h, b); };
  r(4, 20, 4, 12, c.pants); r(8, 20, 4, 12, c.pants);
  if (sk.id === 'lakshay') { for (let i = 0; i < 12; i += 3) { r(4.4, 20.5 + i, 1.2, 0.5, '#a9bccb'); r(9, 21.5 + i, 1.2, 0.5, '#a9bccb'); } r(4.7, 24, 2.6, 2, c.skin); r(8.7, 28, 2.6, 1.8, c.skin); }
  r(3.8, 30, 4.4, 2, c.shoes); r(7.8, 30, 4.4, 2, c.shoes);
  r(4, 8, 8, 12, kurta ? c.jacket : c.shirt);
  if (kurta) r(3.7, 8, 8.6, 16, c.jacket);
  const sleeve = (sk.jacket || kurta) ? c.jacket : c.shirt;
  r(0, 8, 4, 9.6, sleeve); r(12, 8, 4, 9.6, sleeve); r(0, 17.6, 4, 2.8, c.skin); r(12, 17.6, 4, 2.8, c.skin);
  if (sk.jacket) {
    const pw = sk.vest ? 2.6 : 3.3;
    r(4 - 0.2, 8, pw, 12.4, c.jacket); r(12 - pw + 0.2, 8, pw, 12.4, c.jacket);
    if (sk.plaid) { ctx.globalAlpha = 0.4; lines(3.8, 8, 3.3, 12.4, '#2a0a10', '#d0505e'); lines(8.9, 8, 3.3, 12.4, '#2a0a10', '#d0505e'); lines(0, 8, 4, 9.6, '#2a0a10', '#d0505e'); lines(12, 8, 4, 9.6, '#2a0a10', '#d0505e'); ctx.globalAlpha = 1; }
    if (sk.puffer) { for (let i = 3; i < 12; i += 3) { r(3.8, 8 + i, 3.3, 0.5, 'rgba(0,0,0,.28)'); r(8.9, 8 + i, 3.3, 0.5, 'rgba(0,0,0,.28)'); } for (let i = 3; i < 9; i += 3) { r(0, 8 + i, 4, 0.5, 'rgba(0,0,0,.28)'); r(12, 8 + i, 4, 0.5, 'rgba(0,0,0,.28)'); } }
  }
  r(4, 0, 8, 8, c.skin); r(5.3, 3.2, 1.5, 1.5, c.eye); r(9.2, 3.2, 1.5, 1.5, c.eye); r(6.8, 5.6, 2.4, 0.5, 'rgba(0,0,0,.25)');
  const covered = has('beanie') || has('cap');
  if (!covered || has('hat')) { r(3.65, -0.7, 8.7, 2.8, c.hair); r(3.65, 0, 0.9, 4.6, c.hair); r(11.45, 0, 0.9, 4.6, c.hair); r(3.65, 1.2, 8.7, 1.2, c.hair); if (sk.id === 'lakshay') { r(4.2, 2, 2.6, 1.3, c.hair); r(9.4, 2, 1.9, 1, c.hair); } }
  if (has('hat')) { r(2, -0.8, 12, 0.9, c.hat); r(3.6, -3.6, 8.8, 3.2, c.hat); }
  if (has('cap')) { r(3.5, -1.8, 9, 2.8, c.cap); r(4, 1, 8, 0.7, c.cap); }
  if (has('beanie')) { r(3.5, -2.6, 9, 3.6, c.beanie); r(6.8, -4.9, 2.4, 2.4, c.beanie); }
  if (has('goggles')) r(3.6, 1.8, 8.8, 1.7, c.goggle);
  if (has('scarf')) { r(3.5, 7.8, 9, 2.4, c.scarf); r(5.5, 10, 3, 9, c.scarf); }
  if (has('pack')) { r(4.3, 9, 1, 8, c.pack); r(10.7, 9, 1, 8, c.pack); }
  if (has('camera')) { r(7.6, 8, 0.8, 6, c.cam); r(5.8, 14, 4.4, 3.2, c.cam); r(7, 14.7, 2.2, 2.2, c.lens); }
}
function renderSkinUI() {
  const cur = G.getSkin();
  const big = $('skin-preview'), g = big.getContext('2d');
  g.clearRect(0, 0, big.width, big.height); g.imageSmoothingEnabled = false;
  const sk = BL.SKINS.find(s => s.id === cur) || BL.SKINS[0];
  drawSkin(g, sk, 10, 20, 70);
  $('skin-name').textContent = sk.name; $('skin-tag').textContent = sk.tag;
  const grid = $('skin-grid'); grid.innerHTML = '';
  for (const s of BL.SKINS) {
    const b = el('button', 'skin-card' + (s.id === cur ? ' on' : ''));
    const c = document.createElement('canvas'); c.width = 64; c.height = 112; drawSkin(c.getContext('2d'), s, 3, 8, 22);
    b.appendChild(c); b.appendChild(el('span', 'sk-name', s.name));
    b.addEventListener('click', () => { G.setSkin(s.id); renderSkinUI(); });
    grid.appendChild(b);
  }
}

/* ------------------------------------------------------------------ visited + content */
let visited = new Set(lsGet('bl3_visited', []));
function markVisited(id) { if (!visited.has(id)) { visited.add(id); lsSet('bl3_visited', [...visited]); } }
function entriesFor(L) {
  const own = SITE.places && SITE.places[L.id] && SITE.places[L.id].entries;
  if (own && own.length) return own;
  return [
    { photo: '', title: L.name, date: '', caption: L.name, story: `This Wayfare Safe is waiting for a story about ${L.name}.\n\nOpen js/content.js, find the id "${L.id}", and add a photo, a short story and what you learned here.`, learning: 'Write the one thing this place taught you.' },
    { photo: '', title: 'Add more pages', date: '', caption: 'Page two', story: 'Each page is one photo and one story. Visitors turn pages by scrolling, using the arrow keys, or pressing the buttons below.', learning: 'Short, honest lessons make the best pages.' }
  ];
}
const phCache = {};
function placeholder(text, seed) {
  const key = text + seed; if (phCache[key]) return phCache[key];
  const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d');
  const h = (BL.hash2(seed, 5, 3) * 360) | 0;
  const gr = g.createLinearGradient(0, 0, 0, 600); gr.addColorStop(0, `hsl(${h},60%,68%)`); gr.addColorStop(1, `hsl(${(h + 40) % 360},55%,38%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 800, 600);
  g.fillStyle = 'rgba(255,240,190,.9)'; g.fillRect(560, 90, 90, 90);
  for (let i = 0; i < 9; i++) { const w = 120 + i * 40, hh = 90 + ((i * 53) % 150); g.fillStyle = `hsl(${h},35%,${22 + i * 2}%)`; g.fillRect(i * 90 - 30, 600 - hh - 60, 100, hh + 60); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 470, 800, 130);
  g.fillStyle = '#fff'; g.font = 'bold 40px "Pixelify Sans", monospace'; g.textAlign = 'center';
  g.fillText('Your photo goes here', 400, 530); g.font = '24px "Pixelify Sans", monospace'; g.fillText(text, 400, 570);
  return (phCache[key] = c.toDataURL());
}

/* ------------------------------------------------------------------ vault book */
const bk = { id: null, L: null, list: [], i: 0, wheel: 0, last: 0, busy: false };
ui.openBook = id => {
  const L = BL.LOCATIONS.find(l => l.id === id); if (!L) return;
  bk.id = id; bk.L = L; bk.list = entriesFor(L); bk.i = 0; bk.wheel = 0;
  markVisited(id);
  setMode('book'); renderBook(0, true);
};
function renderBook(dir, first) {
  const e = bk.list[bk.i], n = bk.list.length;
  $('bk-place').textContent = bk.L.name;
  $('bk-page').textContent = `Page ${bk.i + 1} of ${n}`;
  $('bk-title').textContent = e.title || bk.L.name;
  $('bk-date').textContent = e.date || '';
  $('bk-story').innerHTML = '';
  String(e.story || '').split(/\n\s*\n/).forEach(p => { const pe = el('p'); pe.textContent = p; $('bk-story').appendChild(pe); });
  const learn = $('bk-learn'); learn.classList.toggle('hidden', !e.learning); learn.querySelector('span').textContent = e.learning || '';
  const img = $('bk-photo'); const fallback = placeholder(bk.L.name, bk.i + bk.id.length);
  img.onerror = () => { img.onerror = null; img.src = fallback; };
  img.alt = e.caption || bk.L.name;
  img.src = e.photo ? e.photo : fallback;
  $('bk-caption').textContent = e.caption || '';
  const dots = $('bk-dots'); dots.innerHTML = '';
  bk.list.forEach((_, k) => { const d = el('button', 'dot' + (k === bk.i ? ' on' : '')); d.setAttribute('aria-label', 'Page ' + (k + 1)); d.addEventListener('click', () => bookGo(k - bk.i)); dots.appendChild(d); });
  $('bk-prev').disabled = bk.i === 0; $('bk-next').disabled = bk.i === n - 1;
  const book = $('bk-book');
  if (first) book.animate([{ transform: 'scale(.86) translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  else if (dir) {
    $('bk-right').animate([{ transform: `perspective(900px) rotateY(${dir > 0 ? 70 : -70}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'ease-out' });
    $('bk-left').animate([{ transform: `translateY(${dir > 0 ? 18 : -18}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'ease-out' });
  }
}
function bookGo(d) {
  const ni = Math.max(0, Math.min(bk.list.length - 1, bk.i + d));
  if (ni === bk.i) return; const dir = ni > bk.i ? 1 : -1; bk.i = ni; renderBook(dir);
}
function wireBook() {
  $('bk-prev').addEventListener('click', () => bookGo(-1)); $('bk-next').addEventListener('click', () => bookGo(1));
  $('bk-close').addEventListener('click', () => setMode('play'));
  $('book').addEventListener('wheel', ev => {
    ev.preventDefault(); bk.wheel += ev.deltaY; const now = performance.now();
    if (Math.abs(bk.wheel) > 40 && now - bk.last > 380) { bookGo(bk.wheel > 0 ? 1 : -1); bk.last = now; bk.wheel = 0; }
  }, { passive: false });
  let ty = null;
  $('book').addEventListener('touchstart', ev => { ty = ev.touches[0].clientY; }, { passive: true });
  $('book').addEventListener('touchend', ev => { if (ty === null) return; const dy = ty - ev.changedTouches[0].clientY; if (Math.abs(dy) > 40) bookGo(dy > 0 ? 1 : -1); ty = null; }, { passive: true });
}

/* ------------------------------------------------------------------ parchment map */
let mapReady = false;
function buildMapCanvas() {
  const { W, D, H, blocks, idx, B } = BL, K = 3, cv = $('map-canvas'); cv.width = W * K; cv.height = D * K;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const hgt = new Uint8Array(W * D), top = new Uint8Array(W * D), kind = new Uint8Array(W * D);
  const tree = b => b === B.LEAVES || b === B.PINELEAF || b === B.CHINAR || b === B.LOG;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let y = H - 1, forest = false, water = false, b = 0;
    for (; y >= 0; y--) { b = blocks[idx(x, y, z)]; if (!b || b === B.PORTAL) continue; if (tree(b)) { forest = true; continue; } if (b === B.WATER) water = true; break; }
    const i = z * W + x; hgt[i] = y; top[i] = b; kind[i] = water ? 1 : forest ? 2 : 0;
  }
  // parchment
  ctx.fillStyle = '#e4cb98'; ctx.fillRect(0, 0, cv.width, cv.height);
  const small = document.createElement('canvas'); small.width = W; small.height = D;
  const sg = small.getContext('2d'), img = sg.createImageData(W, D);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, h = hgt[i], b = top[i]; let c;
    if (kind[i] === 1) c = [176, 198, 196];
    else if (b === B.SNOW) c = [248, 242, 230];
    else if (b === B.MARBLE) c = [252, 249, 240];
    else if (b === B.REDSTONE) c = [172, 80, 58];
    else if (b === B.PINKSTONE) c = [226, 146, 138];
    else if (b === B.GOLD) c = [226, 188, 72];
    else if (b === B.PLASTER) c = [243, 235, 214];
    else if (b === B.TERRA) c = [196, 104, 62];
    else c = h < 30 ? [236, 200, 138] : h < 42 ? [224, 182, 118] : h < 54 ? [206, 158, 98] : h < 64 ? [186, 134, 86] : [240, 232, 220];
    if (kind[i] === 2) c = mix(c, [150, 156, 92], 0.4);
    if (kind[i] !== 1 && z % 2 === 0) c = [c[0] * 0.93, c[1] * 0.92, c[2] * 0.9];
    const o = i * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  sg.putImageData(img, 0, 0); ctx.drawImage(small, 0, 0, W * K, D * K);
  // coast + contour ink, wave marks
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (kind[i] !== 1) {
      if (kind[i - 1] === 1 || kind[i + 1] === 1 || kind[i - W] === 1 || kind[i + W] === 1) { ctx.fillStyle = 'rgba(96,60,32,.9)'; ctx.fillRect(x * K, z * K, K, K); }
      else if (kind[i + 1] !== 1 && (((hgt[i] / 8) | 0) !== ((hgt[i + 1] / 8) | 0) || ((hgt[i] / 8) | 0) !== ((hgt[i + W] / 8) | 0))) { ctx.fillStyle = 'rgba(110,64,30,.28)'; ctx.fillRect(x * K, z * K, K, K); }
    } else if ((x * 7 + z * 13) % 29 === 0) { ctx.fillStyle = 'rgba(70,104,112,.55)'; ctx.fillRect(x * K, z * K, 7, 1.5); ctx.fillRect(x * K + 7, z * K - 1.5, 7, 1.5); }
  }
  ctx.textAlign = 'center'; ctx.font = 'bold 22px "Pixelify Sans", monospace'; ctx.fillStyle = 'rgba(86,48,22,.5)';
  for (const [t, x, z] of [['HIMALAYAS', 128, 22], ['KASHMIR', 46, 40], ['HIMACHAL', 150, 40], ['DELHI', 160, 128], ['RAJASTHAN', 36, 150], ['UTTAR PRADESH', 152, 202]]) ctx.fillText(t, x * K, z * K);
  const r = BL.mulberry(5); for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(110,70,30,${0.05 + r() * 0.1})`; ctx.fillRect(r() * cv.width, r() * cv.height, 1 + r() * 2, 1 + r() * 2); }
  const vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.34, cv.width / 2, cv.height / 2, cv.width * 0.72);
  vg.addColorStop(0, 'rgba(120,70,20,0)'); vg.addColorStop(1, 'rgba(90,50,16,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, cv.width - 10, cv.height - 10);
  ctx.strokeStyle = '#a07a45'; ctx.lineWidth = 2; ctx.strokeRect(16, 16, cv.width - 32, cv.height - 32);
  // compass
  const cx = cv.width - 70, cy = cv.height - 78; ctx.strokeStyle = '#5a3a1c'; ctx.fillStyle = '#5a3a1c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 18px "Pixelify Sans", monospace'; ctx.fillText('N', cx, cy - 40);
  ctx.font = '14px "Pixelify Sans", monospace'; ctx.fillStyle = 'rgba(70,40,18,.7)'; ctx.fillText('Not to scale', cv.width / 2, cv.height - 26);
}
function openMapView() {
  if (!mapReady) { buildMapCanvas(); mapReady = true; }
  const { W, D } = BL, pins = $('map-pins'); pins.innerHTML = '';
  const log = $('map-log'); log.innerHTML = '';
  const regions = []; BL.LOCATIONS.forEach(L => { if (regions.indexOf(L.region) < 0) regions.push(L.region); });
  const go = L => { G.teleport(L); toast({ title: L.name, html: L.novault ? 'Walk into the glowing portal to switch between day and night.' : 'A <b>Wayfare Safe</b> is just ahead. Look at it and click to open.', icon: L.novault ? 'portal' : 'vault', ms: 5500 }); setMode('play'); };
  const pinFor = {}, itemFor = {};
  for (const L of BL.LOCATIONS) {
    const p = el('button', 'pin' + (L.novault ? ' portal' : '') + (visited.has(L.id) ? ' done' : ''));
    p.style.left = (L.x / W * 100) + '%'; p.style.top = (L.z / D * 100) + '%';
    p.innerHTML = `<i></i><span>${L.name}</span>`; p.setAttribute('aria-label', 'Travel to ' + L.name);
    p.addEventListener('click', () => go(L));
    pins.appendChild(p); pinFor[L.id] = p;
  }
  let done = 0, total = BL.LOCATIONS.filter(l => !l.novault).length;
  for (const reg of regions) {
    log.appendChild(el('h4', '', reg));
    for (const L of BL.LOCATIONS.filter(l => l.region === reg)) {
      const ok = visited.has(L.id); if (ok) done++;
      const it = el('button', 'item' + (ok ? ' done' : ''), `<b>${L.name}</b><small>${L.blurb || ''}</small><span class="chk">${L.novault ? '' : (ok ? '✓' : '')}</span>`);
      it.addEventListener('click', () => go(L));
      it.addEventListener('mouseenter', () => pinFor[L.id].classList.add('hot')); it.addEventListener('mouseleave', () => pinFor[L.id].classList.remove('hot'));
      log.appendChild(it); itemFor[L.id] = it;
    }
  }
  for (const id in pinFor) { pinFor[id].addEventListener('mouseenter', () => itemFor[id].classList.add('hot')); pinFor[id].addEventListener('mouseleave', () => itemFor[id].classList.remove('hot')); }
  $('map-count').textContent = `Safes opened: ${done} / ${total}`;
  const me = G.player(), you = $('map-you');
  you.style.left = (me.x / W * 100) + '%'; you.style.top = (me.z / D * 100) + '%';
  you.querySelector('b').style.transform = `rotate(${Math.atan2(-Math.cos(me.yaw), -Math.sin(me.yaw)) * 180 / Math.PI}deg)`;
}
ui.openMapFromGame = () => setMode('map');

/* ------------------------------------------------------------------ HUD helpers */
ui.vaultHUD = v => {
  const lab = $('vaultlabel'), pr = $('vaultprompt');
  lab.classList.toggle('hidden', !v.label);
  if (v.label) { lab.style.left = v.label.x + 'px'; lab.style.top = v.label.y + 'px'; lab.style.opacity = v.label.a; }
  pr.classList.toggle('hidden', !v.prompt);
  if (v.prompt) $('vp-name').textContent = v.prompt;
};
ui.setWarp = a => { const w = $('warp'); w.style.opacity = a; w.style.transform = `scale(${1 + (1 - a) * 0.25})`; };
ui.banner = text => { const p = $('place'); p.textContent = text; p.classList.add('show'); clearTimeout(ui._pt); ui._pt = setTimeout(() => p.classList.remove('show'), 3500); };

/* ------------------------------------------------------------------ wiring */
ui.init = game => {
  G = game;
  makeDirt();
  const title = SITE.worldTitle || 'My World';
  $('world-title').textContent = title; $('world-tag').textContent = SITE.tagline || ''; document.title = title;
  $('btn-play').addEventListener('click', () => setMode('play'));
  $('btn-map').addEventListener('click', () => setMode('map'));
  $('btn-skin').addEventListener('click', () => setMode('skin'));
  $('btn-settings').addEventListener('click', () => setMode('settings'));
  $('btn-guide').addEventListener('click', () => setMode('guide'));
  for (const id of ['skin-done', 'settings-done', 'guide-done']) $(id).addEventListener('click', () => setMode('title'));
  $('map-close').addEventListener('click', () => setMode('play'));
  $('hints-again').addEventListener('click', () => { ui.resetHints(); $('hints-again').textContent = 'Hints will show again'; });
  wireBook();
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    const m = ui.mode, c = e.code;
    if (m === 'play') { if (c === 'KeyE') { e.preventDefault(); setMode('map'); } else if (c === 'KeyH') { e.preventDefault(); setMode('guide'); } }
    else if (m === 'map') { if (c === 'KeyE' || c === 'Escape') { e.preventDefault(); setMode('play'); } }
    else if (m === 'book') {
      if (c === 'Escape' || c === 'KeyE') setMode('play');
      else if (['ArrowRight', 'ArrowDown', 'PageDown', 'Space'].includes(c)) { e.preventDefault(); bookGo(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(c)) { e.preventDefault(); bookGo(-1); }
    }
    else if (m === 'guide') { if (c === 'Escape' || c === 'KeyH') setMode(ui.started ? 'play' : 'title'); }
    else if (m === 'skin' || m === 'settings') { if (c === 'Escape') setMode('title'); }
    else if (m === 'title' && ui.started && c === 'Escape') setMode('play');
  });
};
BL.ui = ui;
})();

/* BlockLand — world generator.
   Builds a stylised map of northern India: Himalayas, Kashmir, Himachal, Delhi, Agra, Jaipur, Udaipur,
   plus villages. Everything is generated from code, nothing is downloaded. Not to scale. */
(function () {
'use strict';

const W = 256, D = 256, H = 96, SEA = 22;
const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8, COBBLE: 9, BRICK: 10, LAMP: 11,
  MARBLE: 12, REDSTONE: 13, PINKSTONE: 14, SNOW: 15, GOLD: 16, DARKWOOD: 17, TERRA: 18, PLASTER: 19, MUD: 20,
  PINELEAF: 21, CHINAR: 22, FIELD: 23, TULIP: 24, ICE: 25, FLAGS: 26, TRICOLOR: 27,
  VAULT: 28, PORTALFRAME: 29, PORTAL: 30 };
const NAMES = { 1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Sand', 6: 'Log', 7: 'Leaves', 8: 'Planks', 9: 'Cobble', 10: 'Brick', 11: 'Lamp',
  12: 'White marble', 13: 'Red sandstone', 14: 'Pink sandstone', 15: 'Snow', 16: 'Gold', 17: 'Dark wood', 18: 'Terracotta',
  19: 'Plaster', 20: 'Mud brick', 21: 'Pine needles', 22: 'Chinar leaves', 23: 'Wheat field', 24: 'Tulips', 25: 'Ice', 26: 'Prayer flags', 27: 'Tricolour' };

const REG = { list: [], map: {}, next: 40 };
function colorTile(name, hex, pattern, v) {
  if (REG.map[name] !== undefined) return REG.map[name];
  const id = REG.next++; REG.map[name] = id;
  REG.list.push({ id, name, hex, pattern: pattern || 'plain', v: v === undefined ? 12 : v });
  return id;
}
const VAULTS = [];
const blocks = new Uint8Array(W * D * H);
const idx = (x, y, z) => (y * D + z) * W + x;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

function get(x, y, z) {
  if (y < 0) return B.STONE;
  if (y >= H) return B.AIR;
  if (x < 0 || z < 0 || x >= W || z >= D) return y <= SEA ? B.WATER : B.AIR;
  return blocks[idx(x, y, z)];
}
function solid(x, y, z) {
  if (y < 0) return true;
  if (y >= H) return false;
  if (x < 0 || z < 0 || x >= W || z >= D) return true;
  const b = blocks[idx(x, y, z)];
  return b !== B.AIR && b !== B.WATER && b !== B.PORTAL;
}
function topY(x, z) {
  for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b !== 0 && b !== B.WATER) return y; }
  return 0;
}

/* ---------- noise ---------- */
function hash2(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) {
  let a = 0.5, f = 1, t = 0;
  for (let i = 0; i < 5; i++) { t += a * vnoise(x * f, y * f, s + i); f *= 2; a *= 0.5; }
  return t;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- building primitives ---------- */
function set(x, y, z, b) { if (x < 0 || z < 0 || y < 0 || x >= W || z >= D || y >= H) return; blocks[(y * D + z) * W + x] = b; }
function at(x, y, z) { return (x < 0 || z < 0 || y < 0 || x >= W || z >= D || y >= H) ? 0 : blocks[(y * D + z) * W + x]; }
const isTree = b => b === B.LOG || b === B.LEAVES || b === B.PINELEAF || b === B.CHINAR;
function box(x0, y0, z0, x1, y1, z1, b) {
  if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b);
}
function groundAt(x, z) {
  x = clamp(x | 0, 0, W - 1); z = clamp(z | 0, 0, D - 1);
  for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b !== 0 && b !== B.WATER && !isTree(b)) return y; }
  return 0;
}
function isWaterCol(x, z) {
  x = clamp(x | 0, 0, W - 1); z = clamp(z | 0, 0, D - 1);
  for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b === B.WATER) return true; if (b !== 0 && !isTree(b)) return false; }
  return false;
}
function flatten(x0, z0, x1, z1, y, top, fill) {
  fill = fill || B.DIRT; top = top === undefined ? B.GRASS : top;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    for (let yy = y + 1; yy < Math.min(H, y + 50); yy++) set(x, yy, z, 0);
    set(x, y, z, top);
    for (let yy = y - 1; yy >= 0; yy--) { const b = at(x, yy, z); if (b !== 0 && b !== B.WATER && !isTree(b)) break; set(x, yy, z, fill); }
  }
}
function fbox(x0, z0, x1, z1, y0, y1, b) {          // box that also fills downward to the ground
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) set(x, y, z, b);
    for (let y = y0 - 1; y >= 0; y--) { const c = at(x, y, z); if (c !== 0 && c !== B.WATER && !isTree(c)) break; set(x, y, z, b); }
  }
}
function disc(cx, y, cz, r, b) {
  const R = Math.ceil(r);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= r * r + 0.25) set(cx + dx, y, cz + dz, b);
}
function cyl(cx, cz, y0, y1, r, b) { for (let y = y0; y <= y1; y++) disc(cx, y, cz, r, b); }
function profile(cx, y, cz, radii, b) { radii.forEach((r, i) => disc(cx, y + i, cz, r, b)); }
function dome(cx, y, cz, r, b, tip) {
  let top = y;
  for (let i = 0; i <= r; i++) {
    const rr = Math.sqrt(Math.max(0, r * r - i * i));
    top = y + i;
    if (rr < 0.5) { set(cx, top, cz, b); break; }
    disc(cx, top, cz, rr, b);
  }
  if (tip) set(cx, top + 1, cz, tip);
}
function rowHalf(yy, hw, h) {
  if (yy < h - hw) return hw;
  const dy = yy - (h - hw) + 1;
  return Math.max(0, Math.round(Math.sqrt(Math.max(0, hw * hw - dy * dy + 0.2))));
}
function carveZ(xc, y0, z0, z1, hw, h) { for (let yy = 0; yy < h; yy++) { const r = rowHalf(yy, hw, h); for (let z = z0; z <= z1; z++) for (let x = xc - r; x <= xc + r; x++) set(x, y0 + yy, z, 0); } }
function carveX(zc, y0, x0, x1, hw, h) { for (let yy = 0; yy < h; yy++) { const r = rowHalf(yy, hw, h); for (let x = x0; x <= x1; x++) for (let z = zc - r; z <= zc + r; z++) set(x, y0 + yy, z, 0); } }
function wallRect(x0, z0, x1, z1, y0, y1, b, t) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
    if (x < x0 + t || x > x1 - t || z < z0 + t || z > z1 - t) set(x, y, z, b);
}
function crenel(x0, z0, x1, z1, y, b) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
    if ((x === x0 || x === x1 || z === z0 || z === z1) && (x + z) % 2 === 0) set(x, y, z, b);
}
function chhatri(cx, y, cz, stone, domeB) {
  box(cx - 1, y, cz - 1, cx + 1, y, cz + 1, stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(cx + sx, y + 1, cz + sz, cx + sx, y + 3, cz + sz, stone);
  disc(cx, y + 4, cz, 2, stone);
  dome(cx, y + 5, cz, 2, domeB, B.GOLD);
}
function mini(cx, y, cz, stone, domeB) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(cx + sx, y, cz + sz, cx + sx, y + 1, cz + sz, stone);
  box(cx - 1, y + 2, cz - 1, cx + 1, y + 2, cz + 1, stone);
  dome(cx, y + 3, cz, 1, domeB, B.GOLD);
}
function mound(cx, cz, r, hgt, top) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dz) / r; if (d > 1) continue;
    const add = Math.round(hgt * (1 - sm(0.5, 1, d)));
    if (add <= 0) continue;
    const x = cx + dx, z = cz + dz, g = groundAt(x, z);
    for (let k = 1; k <= add; k++) set(x, g + k, z, k === add ? top : B.STONE);
  }
}
function flagLine(x0, y0, z0, x1, y1, z1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n, sag = Math.round(Math.sin(t * Math.PI) * 2);
    set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t) - sag, Math.round(z0 + (z1 - z0) * t), B.FLAGS);
  }
}
function flagPole(x, g, z, h) { box(x, g + 1, z, x, g + h, z, B.DARKWOOD); }
function stupa(x, y, z) {
  box(x - 1, y, z - 1, x + 1, y + 1, z + 1, B.PLASTER);
  box(x, y + 2, z, x, y + 3, z, B.PLASTER);
  set(x, y + 4, z, B.REDSTONE); set(x, y + 5, z, B.GOLD);
}
function tree(x, y, z, kind, rng) {
  if (kind === 'pine') {
    const th = 5 + (rng() * 4 | 0);
    for (let i = 1; i <= th; i++) set(x, y + i, z, B.LOG);
    const top = y + th, rs = [0, 1, 1, 2, 2, 3, 3];
    for (let k = 0; k < 7; k++) {
      const r = rs[k], yy = top + 1 - k;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dz * dz <= r * r + 1 && at(x + dx, yy, z + dz) === 0) set(x + dx, yy, z + dz, B.PINELEAF);
    }
  } else if (kind === 'chinar') {
    const th = 4 + (rng() * 2 | 0);
    for (let i = 1; i <= th; i++) set(x, y + i, z, B.LOG);
    for (let dy = -2; dy <= 2; dy++) { const r = 3.2 - Math.abs(dy) * 0.8;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++)
        if (dx * dx + dz * dz <= r * r && at(x + dx, y + th + dy, z + dz) === 0) set(x + dx, y + th + dy, z + dz, B.CHINAR); }
  } else {
    const th = 3 + (rng() * 2 | 0);
    for (let i = 1; i <= th; i++) set(x, y + i, z, B.LOG);
    for (let dy = -1; dy <= 2; dy++) { const r = 2.6 - Math.abs(dy - 0.5) * 0.7;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++)
        if (dx * dx + dz * dz <= r * r && at(x + dx, y + th + dy, z + dz) === 0) set(x + dx, y + th + dy, z + dz, B.LEAVES); }
  }
}

/* ---------- terrain ---------- */
const BASINS = [
  { cx: 46, cz: 64, rx: 32, rz: 24, level: 38, zone: 3 },    // Kashmir valley
  { cx: 96, cz: 50, rx: 22, rz: 18, level: 47 },             // Dharamshala shelf
  { cx: 120, cz: 78, rx: 24, rz: 19, level: 46 },            // Shimla ridge
  { cx: 158, cz: 54, rx: 32, rz: 18, level: 40 },            // Kullu / Manali valley
  { cx: 206, cz: 56, rx: 26, rz: 20, level: 56, zone: 1 },   // Spiti plateau
  { cx: 184, cz: 36, rx: 16, rz: 13, level: 60 },            // Chandratal
  { cx: 54, cz: 218, rx: 34, rz: 26, level: 27 }             // Udaipur basin
];
const LAKES = [
  { cx: 46, cz: 66, rx: 15, rz: 9, level: 37, depth: 4 },    // Dal Lake
  { cx: 158, cz: 54, rx: 27, rz: 2.6, level: 39, depth: 3 }, // Beas
  { cx: 184, cz: 36, rx: 9, rz: 7, level: 59, depth: 3 },    // Chandratal
  { cx: 50, cz: 220, rx: 16, rz: 11, level: 26, depth: 4 },  // Lake Pichola
  { cx: 50, cz: 98, rx: 14, rz: 8, level: 25, depth: 4 }     // Man Sagar
];
const riverX = z => 190 + 10 * Math.sin(z / 40);              // Yamuna

const RESERVED = [];
const reserve = (x0, z0, x1, z1) => RESERVED.push({ x0, z0, x1, z1 });
const hits = (x0, z0, x1, z1, pad) => RESERVED.some(r => x0 - pad <= r.x1 && x1 + pad >= r.x0 && z0 - pad <= r.z1 && z1 + pad >= r.z0);

function generate(seed) {
  blocks.fill(0); RESERVED.length = 0;
  const rng = mulberry(seed);
  const hm = new Int16Array(W * D), wl = new Uint8Array(W * D).fill(SEA), zone = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    let h = 26 + (fbm(x / 60, z / 60, seed) - 0.5) * 5;
    const mz = sm(115, 45, z);
    if (mz > 0) {
      const r = 1 - Math.abs(fbm(x / 34, z / 34, seed + 3) * 2 - 1);
      h += Math.pow(mz, 1.15) * (8 + 52 * Math.pow(r, 1.7) + 6 * fbm(x / 14, z / 14, seed + 5));
    }
    const hz = sm(98, 125, z) * sm(112, 70, x);
    if (hz > 0) h += hz * (3 + 16 * fbm(x / 22, z / 22, seed + 7));
    for (const b of BASINS) {
      const d = Math.hypot((x - b.cx) / b.rx, (z - b.cz) / b.rz);
      if (d < 1) { const t = sm(1, 0.72, d); h = h * (1 - t) + b.level * t; if (b.zone && d < 0.95) zone[i] = b.zone; }
    }
    for (const l of LAKES) {
      const d = Math.hypot((x - l.cx) / l.rx, (z - l.cz) / l.rz);
      if (d < 1) { const t = sm(1, 0.72, d); h = h * (1 - t) + (l.level - l.depth) * t; wl[i] = l.level; }
    }
    if (z >= 94) { const t = sm(9, 3.5, Math.abs(x - riverX(z))) * sm(94, 106, z); h = h * (1 - t) + 18 * t; }
    const e = Math.min(x, z, W - 1 - x, D - 1 - z), f = sm(20, 3, e);
    h = h * (1 - f) + 10 * f;
    hm[i] = clamp(Math.floor(h), 2, H - 4);
    if (x < 100 && z > 100 && !zone[i]) zone[i] = 2;
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, h = hm[i], w = wl[i];
    const snowY = 60 + (fbm(x / 9, z / 9, seed + 11) - 0.5) * 9;
    let top = B.GRASS, sub = B.DIRT;
    if (h <= w + 1) { top = B.SAND; sub = B.SAND; }
    else if (h >= snowY) { top = B.SNOW; sub = B.STONE; }
    else if (h >= 52 + (fbm(x / 7, z / 7, seed + 12) - 0.5) * 6) { top = B.STONE; sub = B.STONE; }
    else if (zone[i] === 1) { top = fbm(x / 10, z / 10, seed + 21) > 0.5 ? B.STONE : B.SAND; sub = B.STONE; }
    else if (zone[i] === 2 && fbm(x / 14, z / 14, seed + 22) > 0.52) { top = B.SAND; sub = B.SAND; }
    for (let y = 0; y <= h; y++) blocks[idx(x, y, z)] = y === h ? top : (y > h - 4 ? sub : B.STONE);
    for (let y = h + 1; y <= w; y++) blocks[idx(x, y, z)] = B.WATER;
  }
  // trees
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const i = z * W + x, h = hm[i];
    if (blocks[idx(x, h, z)] !== B.GRASS) continue;
    const mz = sm(115, 45, z);
    if (zone[i] === 3) { if (rng() < 0.012) tree(x, h, z, 'chinar', rng); }
    else if (h >= 33 && h <= 57 && mz > 0.1 && zone[i] !== 1) {
      const f = fbm(x / 16, z / 16, seed + 13);
      if (rng() < (f > 0.47 ? 0.05 : 0.006)) tree(x, h, z, 'pine', rng);
    } else if (h < 32 && rng() < 0.0035) tree(x, h, z, 'neem', rng);
  }
  // landmarks
  taj(150, 176);
  indiaGate(138, 142);
  redFort(146, 112);
  qutub(108, 150);
  jaipur(55, 128);
  udaipur();
  kashmir();
  himachal();
  villages(rng);
  nightPortal();
  placeVaults();
  return true;
}

/* ================================================================== */
/*  Houses & villages                                                  */
/* ================================================================== */
const STYLES = {
  himalayan: { wall: [B.COBBLE, B.COBBLE, B.PLANKS], roof: 'gable', roofB: B.DARKWOOD, fl: [1, 2, 2], frame: B.DARKWOOD },
  plains:    { wall: [B.MUD, B.MUD, B.PLASTER], roof: 'gable', roofB: B.TERRA, fl: [1, 1, 2], frame: B.DARKWOOD },
  raj:       { wall: [B.PLASTER, B.PLASTER, B.PINKSTONE], roof: 'flat', roofB: B.PLASTER, fl: [1, 2, 2], frame: B.REDSTONE },
  pink:      { wall: [B.PINKSTONE], roof: 'flat', roofB: B.PINKSTONE, fl: [1, 2, 2], frame: B.PINKSTONE },
  kashmiri:  { wall: [B.BRICK, B.BRICK, B.PLANKS], roof: 'gable', roofB: B.DARKWOOD, fl: [2, 2, 3], frame: B.DARKWOOD },
  spiti:     { wall: [B.PLASTER], roof: 'flat', roofB: B.PLASTER, fl: [1, 2], frame: B.DARKWOOD },
  colonial:  { wall: [B.PLASTER], roof: 'gable', roofB: B.TERRA, fl: [1, 2, 2], frame: B.DARKWOOD },
  city:      { wall: [B.PLASTER, B.REDSTONE, B.PLASTER], roof: 'flat', roofB: B.PLASTER, fl: [1, 2, 3], frame: B.REDSTONE }
};

function house(x0, z0, w, d, fl, style, rng, floorTop) {
  const S = STYLES[style];
  const gy = groundAt(x0 + (w >> 1), z0 + (d >> 1));
  const wall = S.wall[(rng() * S.wall.length) | 0];
  flatten(x0 - 1, z0 - 1, x0 + w, z0 + d, gy, floorTop === undefined ? at(x0 + (w >> 1), gy, z0 + (d >> 1)) || B.GRASS : floorTop);
  const h = fl * 3;
  box(x0, gy, z0, x0 + w - 1, gy, z0 + d - 1, B.PLANKS);
  box(x0, gy + 1, z0, x0 + w - 1, gy + h, z0 + d - 1, wall);
  box(x0 + 1, gy + 1, z0 + 1, x0 + w - 2, gy + h, z0 + d - 2, 0);
  for (const [cx, cz] of [[x0, z0], [x0 + w - 1, z0], [x0, z0 + d - 1], [x0 + w - 1, z0 + d - 1]]) box(cx, gy + 1, cz, cx, gy + h, cz, S.frame);
  const dx = x0 + (w >> 1);
  box(dx, gy + 1, z0 + d - 1, dx, gy + 2, z0 + d - 1, 0);
  for (let f = 0; f < fl; f++) {
    const wy = gy + 2 + f * 3;
    for (let x = x0 + 2; x < x0 + w - 2; x += 2) { if (x !== dx || f > 0) set(x, wy, z0 + d - 1, 0); set(x, wy, z0, 0); }
    for (let z = z0 + 2; z < z0 + d - 2; z += 2) { set(x0, wy, z, 0); set(x0 + w - 1, wy, z, 0); }
  }
  set(x0 + (w >> 1), gy + h, z0 + (d >> 1), B.LAMP);
  const top = gy + h;
  if (S.roof === 'flat') {
    box(x0, top + 1, z0, x0 + w - 1, top + 1, z0 + d - 1, S.roofB);
    wallRect(x0, z0, x0 + w - 1, z0 + d - 1, top + 2, top + 2, S.roofB, 1);
    if (rng() < 0.3 && w >= 5 && d >= 5) mini(x0 + (w >> 1), top + 2, z0 + (d >> 1), wall, S.frame === B.REDSTONE ? B.REDSTONE : B.PLASTER);
  } else {
    const alongX = w >= d;
    for (let i = 0; i < 12; i++) {
      const xa = alongX ? x0 - 1 : x0 - 1 + i, xb = alongX ? x0 + w : x0 + w - i;
      const za = alongX ? z0 - 1 + i : z0 - 1, zb = alongX ? z0 + d - i : z0 + d;
      if (xa > xb || za > zb) break;
      box(xa, top + 1 + i, za, xb, top + 1 + i, zb, S.roofB);
    }
    if (top >= 52) for (let z = z0 - 1; z <= z0 + d; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
      for (let y = top + 14; y > top; y--) if (at(x, y, z) === S.roofB) { if (at(x, y + 1, z) === 0) set(x, y + 1, z, B.SNOW); break; }
    }
  }
  return gy;
}
function well(x, z) {
  const g = groundAt(x, z);
  flatten(x - 2, z - 2, x + 2, z + 2, g, B.COBBLE);
  box(x - 1, g, z - 1, x + 1, g + 1, z + 1, B.COBBLE);
  set(x, g, z, B.WATER); set(x, g - 1, z, B.COBBLE); set(x, g + 1, z, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx, g + 2, z + sz, x + sx, g + 3, z + sz, B.DARKWOOD);
  box(x - 1, g + 4, z - 1, x + 1, g + 4, z + 1, B.TERRA);
}
function lamppost(x, z) { const g = groundAt(x, z); box(x, g + 1, z, x, g + 3, z, B.DARKWOOD); set(x, g + 4, z, B.LAMP); }
function fieldPlot(x0, z0, w, d) {
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
    if (isWaterCol(x, z)) continue;
    const g = groundAt(x, z);
    if (at(x, g, z) === B.GRASS) { set(x, g, z, B.FIELD); box(x, g + 1, z, x, g + 3, z, 0); }
  }
}
function village(cx, cz, style, count, radius, rng) {
  const placed = []; let made = 0, tries = 0;
  well(cx, cz); placed.push({ x0: cx - 4, z0: cz - 4, x1: cx + 4, z1: cz + 4 });
  lamppost(cx + 3, cz + 3); lamppost(cx - 3, cz - 3);
  while (made < count && tries < count * 60) {
    tries++;
    const a = rng() * 6.283, r = Math.sqrt(rng()) * radius;
    const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r * 0.85);
    const w = 5 + (rng() * 3 | 0), d = 5 + (rng() * 3 | 0);
    if (x < 6 || z < 6 || x + w > W - 6 || z + d > D - 6) continue;
    if (hits(x, z, x + w, z + d, 2)) continue;
    if (placed.some(p => x - 3 <= p.x1 && x + w + 3 >= p.x0 && z - 3 <= p.z1 && z + d + 3 >= p.z0)) continue;
    let ok = true, lo = 999, hi = -1;
    for (const [px, pz] of [[x, z], [x + w, z], [x, z + d], [x + w, z + d], [x + (w >> 1), z + (d >> 1)]]) {
      if (isWaterCol(px, pz)) { ok = false; break; }
      const g = groundAt(px, pz); lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
    if (!ok || hi - lo > 3) continue;
    const S = STYLES[style];
    house(x, z, w, d, S.fl[(rng() * S.fl.length) | 0], style, rng);
    placed.push({ x0: x, z0: z, x1: x + w, z1: z + d }); made++;
    if (style === 'himalayan' || style === 'spiti') {
      if (rng() < 0.5) { const g = groundAt(x, z); flagPole(x - 2, g, z - 1, 7); flagPole(x + w + 1, g, z - 1, 7); flagLine(x - 2, g + 7, z - 1, x + w + 1, g + 7, z - 1); }
    }
  }
  if (style === 'plains') {
    let n = 0;
    for (let t = 0; t < 60 && n < 6; t++) {
      const a = rng() * 6.283, r = radius + 6 + rng() * 10;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      if (x < 6 || z < 6 || x > W - 14 || z > D - 14 || hits(x, z, x + 7, z + 6, 1)) continue;
      fieldPlot(x, z, 7, 6); n++;
    }
  }
  reserve(cx - radius - 4, cz - radius - 4, cx + radius + 4, cz + radius + 4);
}

function villages(rng) {
  village(96, 58, 'himalayan', 12, 11, rng);      // below McLeod Ganj
  village(172, 62, 'himalayan', 14, 10, rng);     // Old Manali
  village(206, 66, 'spiti', 10, 9, rng);          // Spiti
  village(30, 50, 'kashmiri', 9, 8, rng);         // Kashmir
  village(122, 134, 'city', 16, 14, rng);         // Delhi old city
  village(214, 150, 'plains', 12, 12, rng);
  village(100, 100, 'plains', 10, 11, rng);
  village(168, 136, 'plains', 9, 9, rng);
  village(28, 168, 'raj', 10, 10, rng);           // Rajasthani village
  village(100, 226, 'raj', 10, 10, rng);
  village(196, 210, 'plains', 10, 11, rng);
}

/* ================================================================== */
/*  Taj Mahal, Agra                                                    */
/* ================================================================== */
function taj(cx, cz) {
  const G = 26, P = G + 7;
  const ts = (a, b, y, k) => set(cx - a, y, cz + b, k);
  const tb = (a0, a1, b0, b1, y0, y1, k) => box(cx - a1, y0, cz + b0, cx - a0, y1, cz + b1, k);
  reserve(cx - 90, cz - 38, cx + 24, cz + 38);
  flatten(cx - 86, cz - 36, cx + 22, cz + 36, G, B.GRASS);
  // garden: canal, paths, tank
  for (let a = 38; a <= 74; a++) {
    for (let b = -1; b <= 1; b++) { ts(a, b, G, B.WATER); ts(a, b, G - 1, B.MARBLE); }
    for (const b of [-3, -2, 2, 3]) ts(a, b, G, B.MARBLE);
  }
  for (let b = -22; b <= 22; b++) {
    for (const a of [55, 56, 57]) if (Math.abs(b) > 1) { ts(a, b, G, B.WATER); ts(a, b, G - 1, B.MARBLE); }
    ts(54, b, G, B.MARBLE); ts(58, b, G, B.MARBLE);
  }
  for (let a = 52; a <= 60; a++) for (let b = -4; b <= 4; b++) {
    if (a >= 53 && a <= 59 && Math.abs(b) <= 3) { ts(a, b, G, B.WATER); ts(a, b, G - 1, B.MARBLE); } else ts(a, b, G, B.MARBLE);
  }
  ts(56, G + 1, 0, B.GOLD); ts(56, G, 0, B.MARBLE);
  for (const a of [41, 45, 49, 63, 67, 71]) for (const b of [-7, 7, -15, 15]) {
    ts(a, b, G + 1, B.LOG); for (let k = 2; k <= 8; k++) ts(a, b, G + k, B.PINELEAF);
  }
  for (const a of [40, 46, 64, 70]) for (const b of [-9, 9, -18, 18]) lamppost(cx - a, cz + b);
  // garden wall + gate
  tb(36, 78, 24, 25, G + 1, G + 4, B.REDSTONE); tb(36, 78, -25, -24, G + 1, G + 4, B.REDSTONE);
  tb(77, 78, -25, 25, G + 1, G + 4, B.REDSTONE);
  for (let a = 36; a <= 78; a += 2) { ts(a, 25, G + 5, B.REDSTONE); ts(a, -25, G + 5, B.REDSTONE); }
  tb(73, 80, -9, 9, G + 1, G + 12, B.REDSTONE);
  carveX(cz, G + 1, cx - 80, cx - 73, 2, 8);
  tb(73, 80, -9, 9, G + 9, G + 9, B.MARBLE);
  for (const b of [-8, -4, 0, 4, 8]) { ts(76, b, G + 13, B.MARBLE); ts(76, b, G + 14, B.MARBLE); ts(76, b, G + 15, B.GOLD); }
  for (const sb of [-1, 1]) chhatri(cx - 77, G + 5, cz + 25 * sb, B.REDSTONE, B.MARBLE);
  // red sandstone terrace
  tb(-14, 34, -30, 30, G + 1, G + 3, B.REDSTONE);
  tb(35, 35, -4, 4, G + 1, G + 2, B.REDSTONE); tb(36, 36, -4, 4, G + 1, G + 1, B.REDSTONE);
  // mosque + jawab
  for (const sb of [-1, 1]) {
    const b0 = sb > 0 ? 18 : -29, b1 = sb > 0 ? 29 : -18, bc = sb * 23;
    tb(-8, 22, b0, b1, G + 4, G + 11, B.REDSTONE);
    for (const a of [-5, 0, 5, 10, 15, 20]) for (let yy = 0; yy < 5; yy++) {
      const r = rowHalf(yy, 1, 5);
      for (let k = -r; k <= r; k++) { ts(a + k, sb * 18, G + 5 + yy, 0); ts(a + k, sb * 19, G + 5 + yy, 0); }
    }
    tb(-8, 22, b0, b1, G + 11, G + 11, B.MARBLE);
    for (const a of [-2, 7, 16]) dome(cx - a, G + 12, cz + bc, 3, B.MARBLE, B.GOLD);
  }
  // marble plinth
  tb(-15, 15, -15, 15, G + 4, P, B.MARBLE);
  // main tomb
  for (let a = -9; a <= 9; a++) for (let b = -9; b <= 9; b++) {
    if (Math.abs(a) + Math.abs(b) >= 15) continue;
    for (let y = P + 1; y <= P + 13; y++) ts(a, b, y, B.MARBLE);
  }
  const rot = [(u, v) => [u, v], (u, v) => [-u, v], (u, v) => [v, u], (u, v) => [v, -u]];
  for (const R of rot) {
    for (let yy = 0; yy < 9; yy++) {
      const r = rowHalf(yy, 3, 9);
      for (let u = 8; u <= 9; u++) for (let v = -r; v <= r; v++) { const [a, b] = R(u, v); ts(a, b, P + 1 + yy, 0); }
    }
    for (let v = -1; v <= 1; v++) for (let yy = 0; yy < 4; yy++) { const [a, b] = R(7, v); ts(a, b, P + 1 + yy, B.DARKWOOD); }
  }
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) chhatri(cx - 7 * sa, P + 14, cz + 7 * sb, B.MARBLE, B.MARBLE);
  cyl(cx, cz, P + 14, P + 18, 6, B.MARBLE);
  profile(cx, P + 19, cz, [6.4, 7.0, 7.2, 7.0, 6.5, 5.8, 4.9, 3.9, 2.9, 2.0, 1.2, 0.6], B.MARBLE);
  box(cx, P + 31, cz, cx, P + 34, cz, B.GOLD); disc(cx, P + 31, cz, 1, B.GOLD);
  // minarets
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const mx = cx - 13 * sa, mz = cz + 13 * sb;
    cyl(mx, mz, P + 1, P + 22, 1.5, B.MARBLE);
    disc(mx, P + 8, mz, 2.5, B.MARBLE); disc(mx, P + 15, mz, 2.5, B.MARBLE);
    chhatri(mx, P + 23, mz, B.MARBLE, B.MARBLE);
  }
}

/* ================================================================== */
/*  Delhi                                                              */
/* ================================================================== */
function indiaGate(cx, cz) {
  const g = 26;
  reserve(cx - 44, cz - 28, cx + 40, cz + 28);
  flatten(cx - 42, cz - 26, cx + 38, cz + 26, g, B.GRASS);
  for (let x = cx - 40; x <= cx + 36; x++) {
    for (let z = -5; z <= 5; z++) set(x, g, cz + z, B.REDSTONE);
    for (const z of [-11, -10, -9, 9, 10, 11]) { set(x, g, cz + z, B.WATER); set(x, g - 1, cz + z, B.COBBLE); }
    for (const z of [-8, 8]) set(x, g, cz + z, B.COBBLE);
    if ((x - cx) % 7 === 0 && Math.abs(x - cx) > 12) for (const z of [-16, 16]) tree(x, g, cz + z, 'neem', mulberry(x * 31 + z));
  }
  for (let x = cx - 36; x <= cx + 34; x += 8) { lamppost(x, cz - 7); lamppost(x, cz + 7); }
  box(cx - 9, g + 1, cz - 12, cx + 9, g + 1, cz + 12, B.REDSTONE);
  box(cx - 7, g + 2, cz - 10, cx + 7, g + 2, cz + 10, B.REDSTONE);
  box(cx - 6, g + 3, cz - 9, cx + 6, g + 3, cz + 9, B.REDSTONE);
  box(cx - 2, g + 4, cz - 7, cx + 2, g + 19, cz + 7, B.REDSTONE);
  carveX(cz, g + 4, cx - 2, cx + 2, 3, 11);
  for (const x of [cx - 2, cx + 2]) box(x, g + 17, cz - 6, x, g + 18, cz + 6, B.PLASTER);
  box(cx - 3, g + 20, cz - 8, cx + 3, g + 20, cz + 8, B.REDSTONE);
  box(cx - 2, g + 21, cz - 6, cx + 2, g + 21, cz + 6, B.REDSTONE);
  box(cx - 1, g + 22, cz - 2, cx + 1, g + 22, cz + 2, B.STONE); set(cx, g + 23, cz, B.LAMP);
  set(cx, g + 4, cz, B.STONE); set(cx, g + 5, cz, B.STONE); set(cx, g + 6, cz, B.LAMP);
  for (const [dx, dz] of [[-1, -2], [1, -2], [-1, 2], [1, 2]]) set(cx + dx, g + 4, cz + dz, B.LAMP);
  for (const sz of [-1, 1]) { flagPole(cx - 8, g + 3, cz + 14 * sz, 14); box(cx - 8, g + 16, cz + 14 * sz, cx - 6, g + 17, cz + 14 * sz, B.TRICOLOR); }
  const kx = cx - 26;
  for (const sx of [-3, 3]) for (const sz of [-3, 3]) box(kx + sx, g + 1, cz + sz, kx + sx, g + 9, cz + sz, B.REDSTONE);
  box(kx - 4, g + 10, cz - 4, kx + 4, g + 10, cz + 4, B.REDSTONE);
  dome(kx, g + 11, cz, 3, B.REDSTONE, B.GOLD);
}

function redFort(cx, cz) {
  const g = 26, x0 = cx - 28, x1 = cx + 27, z0 = cz - 20, z1 = cz + 19;
  reserve(x0 - 6, z0 - 6, x1 + 6, z1 + 28);
  flatten(x0 - 6, z0 - 6, x1 + 6, z1 + 28, g, B.GRASS);
  wallRect(x0, z0, x1, z1, g + 1, g + 8, B.REDSTONE, 3);
  crenel(x0, z0, x1, z1, g + 9, B.REDSTONE);
  for (const [bx, bz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { cyl(bx, bz, g + 1, g + 11, 3, B.REDSTONE); mini(bx, g + 12, bz, B.REDSTONE, B.MARBLE); }
  for (const k of [-6, 6]) lamppost(cx + k, z1 + 8);
  // Lahori gate
  box(cx - 8, g + 1, z1 - 2, cx + 8, g + 12, z1 + 4, B.REDSTONE);
  carveZ(cx, g + 1, z1 - 3, z1 + 4, 3, 9);
  for (const sx of [-1, 1]) { cyl(cx + 9 * sx, z1 + 4, g + 1, g + 13, 3, B.REDSTONE); dome(cx + 9 * sx, g + 14, z1 + 4, 3, B.MARBLE, B.GOLD); }
  for (let k = -6; k <= 6; k += 3) mini(cx + k, g + 13, z1 + 1, B.MARBLE, B.MARBLE);
  box(cx - 8, g + 12, z1 + 4, cx + 8, g + 12, z1 + 4, B.MARBLE);
  // Diwan-i-Aam
  box(cx - 10, g + 1, cz - 14, cx + 9, g + 1, cz - 6, B.REDSTONE);
  box(cx - 10, g + 2, cz - 14, cx + 9, g + 6, cz - 13, B.REDSTONE);
  for (let x = cx - 10; x <= cx + 9; x += 2) box(x, g + 2, cz - 6, x, g + 6, cz - 6, B.REDSTONE);
  box(cx - 10, g + 7, cz - 14, cx + 9, g + 7, cz - 6, B.REDSTONE);
  for (const k of [-6, 0, 6]) dome(cx + k, g + 8, cz - 10, 2, B.MARBLE, B.GOLD);
  // Diwan-i-Khas
  box(cx + 8, g + 1, cz + 3, cx + 17, g + 6, cz + 10, B.MARBLE); box(cx + 9, g + 2, cz + 4, cx + 16, g + 6, cz + 9, 0);
  for (let x = cx + 10; x <= cx + 15; x += 2) { box(x, g + 2, cz + 3, x, g + 4, cz + 3, 0); box(x, g + 2, cz + 10, x, g + 4, cz + 10, 0); }
  box(cx + 8, g + 7, cz + 3, cx + 17, g + 7, cz + 10, B.MARBLE);
  for (const [px, pz] of [[cx + 9, cz + 4], [cx + 16, cz + 4], [cx + 9, cz + 9], [cx + 16, cz + 9]]) mini(px, g + 8, pz, B.MARBLE, B.MARBLE);
  // Moti Masjid
  box(cx - 22, g + 1, cz + 3, cx - 14, g + 6, cz + 10, B.MARBLE); box(cx - 21, g + 2, cz + 4, cx - 15, g + 6, cz + 9, 0);
  carveZ(cx - 18, g + 2, cz + 3, cz + 4, 1, 3);
  for (const k of [-20, -18, -16]) dome(k, g + 7, cz + 6, 1, B.MARBLE, B.GOLD);
  // canal
  for (let x = cx - 24; x <= cx + 24; x++) for (const z of [cz - 2, cz - 1]) { set(x, g, z, B.WATER); set(x, g - 1, z, B.MARBLE); }
  flagPole(cx + 20, g, cz - 12, 22);
  box(cx + 21, g + 20, cz - 12, cx + 24, g + 22, cz - 12, B.TRICOLOR);
}

function qutub(cx, cz) {
  const g = 26;
  reserve(cx - 26, cz - 26, cx + 26, cz + 26);
  flatten(cx - 24, cz - 24, cx + 24, cz + 24, g, B.GRASS);
  cyl(cx, cz, g + 1, g + 12, 4, B.REDSTONE); disc(cx, g + 12, cz, 5.2, B.REDSTONE);
  cyl(cx, cz, g + 13, g + 23, 3.6, B.REDSTONE); disc(cx, g + 23, cz, 4.6, B.REDSTONE);
  cyl(cx, cz, g + 24, g + 32, 3.1, B.REDSTONE); disc(cx, g + 32, cz, 4.1, B.REDSTONE);
  cyl(cx, cz, g + 33, g + 39, 2.6, B.MARBLE); disc(cx, g + 39, cz, 3.5, B.MARBLE);
  cyl(cx, cz, g + 40, g + 44, 2.1, B.REDSTONE); disc(cx, g + 45, cz, 2.8, B.MARBLE);
  dome(cx, g + 46, cz, 1, B.MARBLE, B.GOLD);
  for (let y = g + 1; y <= g + 40; y += 3) for (let k = 0; k < 8; k++) {       // ribbing hints
    const a = k / 8 * 6.283, r = y < g + 12 ? 4 : y < g + 23 ? 3.6 : y < g + 32 ? 3.1 : 2.6;
    if (y < g + 33 && (y - g) % 11 !== 0) set(Math.round(cx + Math.cos(a) * r), y, Math.round(cz + Math.sin(a) * r), B.PINKSTONE);
  }
  box(cx + 10, g + 1, cz - 4, cx + 18, g + 7, cz + 4, B.REDSTONE); box(cx + 11, g + 2, cz - 3, cx + 17, g + 7, cz + 3, 0);
  carveX(cz, g + 1, cx + 10, cx + 18, 2, 5);
  dome(cx + 14, g + 8, cz, 3, B.MARBLE, B.GOLD);
  cyl(cx - 10, cz, g + 1, g + 7, 0.5, B.STONE); set(cx - 10, g + 8, cz, B.GOLD);
  for (let a = 0; a < 6; a++) { const r = 12; tree(Math.round(cx - 8 + Math.cos(a) * r), g, Math.round(cz + Math.sin(a) * r), 'neem', mulberry(a + 5)); }
}

/* ================================================================== */
/*  Jaipur                                                             */
/* ================================================================== */
function jaipur(cx, cz) {
  const g = 26, x0 = cx - 22, x1 = cx + 22, z0 = cz - 18, z1 = cz + 18;
  reserve(x0 - 4, z0 - 4, x1 + 4, z1 + 4);
  flatten(x0 - 3, z0 - 3, x1 + 3, z1 + 3, g, B.GRASS);
  wallRect(x0, z0, x1, z1, g + 1, g + 7, B.PINKSTONE, 2);
  crenel(x0, z0, x1, z1, g + 8, B.PINKSTONE);
  for (let x = x0 + 2; x <= x1 - 2; x++) for (let z = cz - 2; z <= cz + 2; z++) set(x, g, z, B.COBBLE);
  for (let z = z0 + 2; z <= z1 - 2; z++) for (let x = cx - 2; x <= cx + 2; x++) set(x, g, z, B.COBBLE);
  for (const [gx, gz, axis] of [[cx, z0, 'z'], [cx, z1, 'z'], [x1, cz, 'x'], [x0, cz, 'x']]) {
    if (axis === 'z') { box(gx - 5, g + 1, gz - 3, gx + 5, g + 11, gz + 3, B.PINKSTONE); carveZ(gx, g + 1, gz - 3, gz + 3, 2, 7); }
    else { box(gx - 3, g + 1, gz - 5, gx + 3, g + 11, gz + 5, B.PINKSTONE); carveX(gz, g + 1, gx - 3, gx + 3, 2, 7); }
    chhatri(gx, g + 12, gz, B.PINKSTONE, B.PINKSTONE);
  }
  // Hawa Mahal
  const hx = cx, hz = cz - 15, hws = [8, 7, 5, 3, 2];
  for (let f = 0; f < 5; f++) {
    const y0 = g + 1 + f * 3, hw = hws[f];
    box(hx - hw, y0, hz, hx + hw, y0 + 2, hz + 2, B.PINKSTONE);
    for (let x = hx - hw + 1; x <= hx + hw - 1; x++) {
      const yy = ((x - hx) % 2 === 0) ? y0 + 1 : y0 + 2;
      set(x, yy, hz + 2, 0); set(x, yy, hz + 1, 0);
    }
    box(hx - hw, y0, hz + 2, hx - hw, y0 + 2, hz + 2, B.MARBLE); box(hx + hw, y0, hz + 2, hx + hw, y0 + 2, hz + 2, B.MARBLE);
    const nxt = f < 4 ? hws[f + 1] : -1;
    for (let x = hx - hw; x <= hx + hw; x += 3) if (Math.abs(x - hx) > nxt) { set(x, y0 + 3, hz + 1, B.MARBLE); set(x, y0 + 4, hz + 1, B.GOLD); }
  }
  chhatri(hx, g + 16, hz + 1, B.PINKSTONE, B.MARBLE);
  carveZ(hx, g + 1, hz, hz + 2, 1, 4);
  for (const s of [-1, 1]) { box(hx + s * 9, g + 1, hz, hx + s * 16, g + 8, hz + 2, B.PINKSTONE);
    for (let x = hx + s * 10; x <= hx + s * 15; x += 2) { set(x, g + 4, hz + 2, 0); set(x, g + 6, hz + 2, 0); }
    mini(hx + s * 12, g + 9, hz + 1, B.PINKSTONE, B.MARBLE); }
  for (let k = -14; k <= 14; k += 7) { lamppost(cx + 3, cz + k); lamppost(cx - 3, cz + k); }
  // pink city houses
  const rng = mulberry(77);
  for (let gx = x0 + 3; gx < x1 - 6; gx += 8) for (let gz = z0 + 3; gz < z1 - 6; gz += 8) {
    if (Math.abs(gx + 3 - cx) < 5 || Math.abs(gz + 3 - cz) < 5) continue;
    if (gx + 6 > hx - 18 && gx < hx + 18 && gz < hz + 8) continue;
    house(gx, gz, 5 + (rng() * 2 | 0), 5 + (rng() * 2 | 0), 1 + (rng() * 2 | 0), 'pink', rng, B.COBBLE);
  }
  // Jantar Mantar (Samrat Yantra)
  const jx = cx + 12, jz = cz + 10;
  for (let k = 0; k < 8; k++) box(jx + k, g + 1, jz, jx + k, g + 1 + k, jz + 1, B.REDSTONE);
  box(jx + 8, g + 1, jz, jx + 8, g + 9, jz + 1, B.REDSTONE);
  for (let k = 0; k < 6; k++) box(jx + k + 1, g + 1, jz - 3, jx + k + 1, g + 1 + k, jz - 3, B.MARBLE);
  // Man Sagar + Jal Mahal
  reserve(34, 86, 68, 110);
  const wx = 50, wz = 98;
  box(wx - 5, 22, wz - 4, wx + 5, 27, wz + 4, B.PINKSTONE);
  wallRect(wx - 4, wz - 3, wx + 4, wz + 3, 28, 31, B.PINKSTONE, 1);
  for (let x = wx - 3; x <= wx + 3; x += 2) { set(x, 29, wz - 3, 0); set(x, 29, wz + 3, 0); }
  box(wx - 4, 32, wz - 3, wx + 4, 32, wz + 3, B.PINKSTONE);
  for (const [dx, dz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) mini(wx + dx, 33, wz + dz, B.PINKSTONE, B.MARBLE);
  chhatri(wx, 33, wz, B.PINKSTONE, B.MARBLE);
  // Amber Fort
  const ax = 96, az = 104;
  reserve(ax - 20, az - 20, ax + 20, az + 28);
  mound(ax, az, 18, 14, B.STONE);
  const ay = groundAt(ax, az);
  flatten(ax - 11, az - 8, ax + 11, az + 8, ay, B.MARBLE);
  wallRect(ax - 12, az - 8, ax + 12, az + 8, ay + 1, ay + 6, B.PINKSTONE, 2);
  crenel(ax - 12, az - 8, ax + 12, az + 8, ay + 7, B.PINKSTONE);
  box(ax - 4, ay + 1, az + 6, ax + 4, ay + 9, az + 10, B.PINKSTONE);
  carveZ(ax, ay + 1, az + 6, az + 10, 2, 6);
  chhatri(ax, ay + 10, az + 8, B.PINKSTONE, B.MARBLE);
  box(ax - 6, ay + 1, az - 7, ax + 6, ay + 5, az - 3, B.MARBLE); box(ax - 5, ay + 2, az - 6, ax + 5, ay + 5, az - 4, 0);
  for (const sx of [-1, 1]) { cyl(ax + 12 * sx, az - 8, ay + 1, ay + 9, 2, B.PINKSTONE); dome(ax + 12 * sx, ay + 10, az - 8, 2, B.MARBLE, B.GOLD); }
  for (let k = 0; k <= 12; k++) {
    const z = az + 28 - k * 1.6 | 0, yy = g + Math.round(k * (ay - g) / 12);
    for (let x = ax - 2; x <= ax + 2; x++) { fbox(x, z, x, z + 1, yy, yy, B.COBBLE); box(x, yy + 1, z, x, yy + 4, z + 1, 0); }
  }
}

/* ================================================================== */
/*  Udaipur                                                            */
/* ================================================================== */
function udaipur() {
  reserve(20, 196, 104, 240);
  // Lake Palace
  const lx = 48, lz = 220;
  box(lx - 6, 22, lz - 5, lx + 6, 27, lz + 5, B.MARBLE);
  wallRect(lx - 5, lz - 4, lx + 5, lz + 4, 28, 33, B.MARBLE, 2);
  box(lx - 1, 28, lz - 1, lx + 1, 33, lz + 1, 0); box(lx - 1, 27, lz - 1, lx + 1, 27, lz + 1, B.WATER);
  for (let x = lx - 4; x <= lx + 4; x += 2) for (const y of [29, 32]) { set(x, y, lz - 4, 0); set(x, y, lz + 4, 0); }
  for (let z = lz - 3; z <= lz + 3; z += 2) for (const y of [29, 32]) { set(lx - 5, y, z, 0); set(lx + 5, y, z, 0); }
  box(lx - 5, 34, lz - 4, lx + 5, 34, lz + 4, B.MARBLE); box(lx - 1, 34, lz - 1, lx + 1, 34, lz + 1, 0);
  for (const [dx, dz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) chhatri(lx + dx, 35, lz + dz, B.MARBLE, B.MARBLE);
  mini(lx, 35, lz - 4, B.MARBLE, B.MARBLE); mini(lx, 35, lz + 4, B.MARBLE, B.MARBLE);
  // Jag Mandir
  const jx = 58, jz = 226;
  box(jx - 4, 22, jz - 3, jx + 4, 27, jz + 3, B.MARBLE);
  wallRect(jx - 3, jz - 2, jx + 3, jz + 2, 28, 31, B.REDSTONE, 1);
  box(jx - 3, 32, jz - 2, jx + 3, 32, jz + 2, B.MARBLE);
  dome(jx, 33, jz, 3, B.MARBLE, B.GOLD);
  for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) mini(jx + dx, 33, jz + dz, B.MARBLE, B.MARBLE);
  for (let z = 210; z <= 232; z += 5) lamppost(65, z);
  // City Palace
  const px = 71, pz0 = 206, pz1 = 234, g = groundAt(px, 220);
  flatten(66, pz0 - 2, 86, pz1 + 2, g, B.COBBLE);
  box(px, g + 1, pz0, px + 9, g + 10, pz1, B.PLASTER);
  for (const y of [g + 3, g + 7]) for (let z = pz0 + 2; z <= pz1 - 2; z += 2) { set(px, y, z, 0); set(px, y + 1, z, 0); }
  for (let z = pz0 + 4; z <= pz1 - 4; z += 6) { box(px - 1, g + 4, z, px - 1, g + 4, z + 1, B.MARBLE); box(px - 1, g + 8, z, px - 1, g + 8, z + 1, B.MARBLE); mini(px - 1, g + 5, z, B.MARBLE, B.MARBLE); }
  for (const z of [pz0 + 2, 220, pz1 - 2]) { cyl(px + 1, z, g + 1, g + 17, 3, B.PLASTER); dome(px + 1, g + 18, z, 3, B.MARBLE, B.GOLD); }
  for (let z = pz0 + 6; z <= pz1 - 6; z += 4) mini(px + 5, g + 11, z, B.MARBLE, B.MARBLE);
  carveX(220, g + 1, px, px + 9, 2, 6);
  for (let z = pz0; z <= pz1; z++) { set(px - 2, g, z, B.MARBLE); set(px - 3, g - 1 + 0, z, B.MARBLE); }
  // Monsoon Palace
  const mx = 28, mz = 206;
  mound(mx, mz, 13, 16, B.STONE);
  const my = groundAt(mx, mz);
  flatten(mx - 7, mz - 5, mx + 7, mz + 5, my, B.MARBLE);
  wallRect(mx - 6, mz - 4, mx + 6, mz + 4, my + 1, my + 6, B.MARBLE, 1);
  for (let x = mx - 4; x <= mx + 4; x += 2) { set(x, my + 3, mz + 4, 0); set(x, my + 3, mz - 4, 0); }
  box(mx - 6, my + 7, mz - 4, mx + 6, my + 7, mz + 4, B.MARBLE);
  dome(mx, my + 8, mz, 4, B.MARBLE, B.GOLD);
  for (const [dx, dz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) { cyl(mx + dx, mz + dz, my + 1, my + 8, 1.5, B.MARBLE); dome(mx + dx, my + 9, mz + dz, 2, B.MARBLE, B.GOLD); }
  const rng = mulberry(5);
  village(92, 222, 'raj', 12, 11, rng);
}

/* ================================================================== */
/*  Kashmir                                                            */
/* ================================================================== */
function houseboat(x0, z0, lvl) {
  box(x0, lvl, z0, x0 + 13, lvl, z0 + 3, B.DARKWOOD);
  box(x0 + 1, lvl + 1, z0, x0 + 12, lvl + 3, z0 + 3, B.PLANKS);
  box(x0 + 2, lvl + 1, z0 + 1, x0 + 11, lvl + 3, z0 + 2, 0);
  for (let x = x0 + 2; x <= x0 + 11; x += 2) { set(x, lvl + 2, z0, 0); set(x, lvl + 2, z0 + 3, 0); }
  box(x0, lvl + 4, z0 - 1, x0 + 13, lvl + 4, z0 + 4, B.DARKWOOD);
  box(x0 + 1, lvl + 5, z0, x0 + 12, lvl + 5, z0 + 3, B.DARKWOOD);
  box(x0 + 3, lvl + 6, z0 + 1, x0 + 10, lvl + 6, z0 + 2, B.DARKWOOD);
  set(x0 + 1, lvl + 1, z0 + 1, 0); set(x0 + 1, lvl + 2, z0 + 1, 0); set(x0 + 5, lvl + 3, z0 + 1, B.LAMP);
  box(x0 - 2, lvl, z0 + 1, x0, lvl, z0 + 2, B.DARKWOOD);
}
function shikara(x, z, lvl) {
  box(x, lvl, z, x + 5, lvl, z, B.DARKWOOD); set(x - 1, lvl + 1, z, B.DARKWOOD); set(x + 6, lvl + 1, z, B.DARKWOOD);
  for (const px of [x + 1, x + 4]) box(px, lvl + 1, z, px, lvl + 2, z, B.DARKWOOD);
  box(x + 1, lvl + 3, z, x + 4, lvl + 3, z, B.REDSTONE);
}
function kashmir() {
  reserve(10, 38, 98, 100);
  const lvl = 37;
  houseboat(36, 60, lvl); houseboat(40, 69, lvl); houseboat(50, 66, lvl);
  const r = mulberry(31);
  for (let i = 0; i < 9; i++) {
    const sx = 33 + (r() * 22 | 0), sz = 58 + (r() * 14 | 0);
    if (at(sx, lvl, sz) === B.WATER && at(sx + 6, lvl, sz) === B.WATER && !at(sx, lvl + 1, sz) && at(sx, lvl - 1, sz) !== B.DARKWOOD) shikara(sx, sz, lvl);
  }
  for (const [fx, fz] of [[34, 64], [57, 62], [44, 58], [52, 72]]) if (at(fx, lvl, fz) === B.WATER && at(fx + 5, lvl, fz + 2) === B.WATER) box(fx, lvl, fz, fx + 5, lvl, fz + 2, B.FIELD);
  // tulip garden
  flatten(20, 72, 38, 84, 38, B.GRASS);
  const cols = [B.TULIP];
  for (let z = 73; z <= 83; z++) for (let x = 21; x <= 37; x++) set(x, 38, z, ((z % 3) === 0 && (x % 6) !== 0) ? B.GRASS : cols[0]);
  // Mughal garden terraces (Nishat Bagh style)
  const z0 = 64, x0 = 64;
  for (let i = 0; i < 6; i++) {
    const xs = x0 + i * 5, xe = xs + 4, y = 38 + i;
    flatten(xs, z0 - 9, xe, z0 + 9, y, B.GRASS);
    for (let x = xs; x <= xe; x++) { set(x, y, z0, B.WATER); set(x, y - 1, z0, B.MARBLE); set(x, y, z0 - 1, B.MARBLE); set(x, y, z0 + 1, B.MARBLE); }
    for (let x = xs; x <= xe; x++) for (const dz of [-5, -4, 4, 5]) set(x, y, z0 + dz, B.TULIP);
    for (const dz of [-8, 8]) tree(xs + 2, y, z0 + dz, 'chinar', r);
  }
  const py = 38 + 6, px = x0 + 31;
  flatten(px - 4, z0 - 5, px + 4, z0 + 5, py, B.MARBLE);
  wallRect(px - 3, z0 - 3, px + 3, z0 + 3, py + 1, py + 4, B.MARBLE, 1);
  for (const [dx, dz] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) carveZ(px + dx, py + 1, z0 + dz, z0 + dz, 1, 3);
  box(px - 3, py + 5, z0 - 3, px + 3, py + 5, z0 + 3, B.MARBLE);
  dome(px, py + 6, z0, 3, B.MARBLE, B.GOLD);
  // Shankaracharya Temple
  const sx = 62, sz = 84;
  mound(sx, sz, 9, 9, B.STONE);
  const sy = groundAt(sx, sz);
  disc(sx, sy, sz, 5, B.STONE); disc(sx, sy + 1, sz, 4, B.COBBLE); disc(sx, sy + 2, sz, 3.4, B.COBBLE);
  cyl(sx, sz, sy + 3, sy + 6, 2, B.COBBLE); box(sx, sy + 3, sz + 2, sx, sy + 4, sz + 2, 0);
  disc(sx, sy + 7, sz, 3, B.COBBLE); dome(sx, sy + 8, sz, 2, B.COBBLE, B.GOLD);
  for (let k = 0; k < 4; k++) box(sx - 1, sy + 1 - 0, sz + 5 + k, sx + 1, sy, sz + 5 + k, B.COBBLE);
  // Chinar ring around the lake
  for (let a = 0; a < 28; a++) {
    const ang = a / 28 * 6.283, x = Math.round(46 + Math.cos(ang) * 20), z = Math.round(66 + Math.sin(ang) * 13);
    if (!isWaterCol(x, z) && at(x, groundAt(x, z), z) === B.GRASS && !hits(x - 1, z - 1, x + 1, z + 1, 0)) tree(x, groundAt(x, z), z, 'chinar', r);
  }
}

/* ================================================================== */
/*  Himachal Pradesh                                                   */
/* ================================================================== */
function himachal() {
  const rng = mulberry(909);
  // --- Dharamshala / McLeod Ganj: Tsuglagkhang
  let cx = 96, cz = 46, g = groundAt(cx, cz);
  reserve(cx - 16, cz - 12, cx + 16, cz + 12);
  flatten(cx - 14, cz - 10, cx + 14, cz + 12, g, B.GRASS);
  box(cx - 6, g + 1, cz - 6, cx + 6, g + 6, cz + 4, B.PLASTER); box(cx - 5, g + 1, cz - 5, cx + 5, g + 6, cz + 3, 0);
  box(cx - 6, g + 6, cz - 6, cx + 6, g + 6, cz + 4, B.REDSTONE);
  carveZ(cx, g + 1, cz + 3, cz + 4, 1, 4);
  for (let i = 0; i < 5; i++) box(cx - 8 + i, g + 7 + i, cz - 8 + i, cx + 8 - i, g + 7 + i, cz + 6 - i, B.GOLD);
  box(cx - 3, g + 12, cz - 3, cx + 3, g + 14, cz + 1, B.PLASTER); box(cx - 3, g + 14, cz - 3, cx + 3, g + 14, cz + 1, B.REDSTONE);
  for (let i = 0; i < 4; i++) box(cx - 5 + i, g + 15 + i, cz - 5 + i, cx + 5 - i, g + 15 + i, cz + 3 - i, B.GOLD);
  box(cx, g + 19, cz - 1, cx, g + 21, cz - 1, B.GOLD);
  for (let x = cx - 8; x <= cx + 8; x += 2) { box(x, g + 1, cz + 9, x, g + 2, cz + 9, B.REDSTONE); set(x, g + 3, cz + 9, B.GOLD); }
  flagPole(cx - 12, g, cz + 2, 9); flagPole(cx + 12, g, cz + 2, 9); flagLine(cx - 12, g + 9, cz + 2, cx + 12, g + 9, cz + 2);
  flagLine(cx - 12, g + 9, cz + 2, cx - 6, g + 14, cz - 6); flagLine(cx + 12, g + 9, cz + 2, cx + 6, g + 14, cz - 6);
  // --- Shimla
  cx = 120; cz = 74; g = groundAt(cx, cz);
  reserve(cx - 18, cz - 14, cx + 18, cz + 14);
  flatten(cx - 16, cz - 12, cx + 16, cz + 12, g, B.GRASS);
  box(cx - 5, g + 1, cz - 8, cx + 1, g + 7, cz + 4, B.PLASTER); box(cx - 4, g + 1, cz - 7, cx, g + 7, cz + 3, 0);
  for (let i = 0; i < 4; i++) box(cx - 6 + i, g + 8 + i, cz - 9, cx + 2 - i, g + 8 + i, cz + 5, B.STONE);
  for (let z = cz - 6; z <= cz + 2; z += 3) { box(cx - 5, g + 3, z, cx - 5, g + 5, z, B.ICE); box(cx + 1, g + 3, z, cx + 1, g + 5, z, B.ICE); }
  box(cx - 4, g + 1, cz + 5, cx - 1, g + 15, cz + 8, B.PLASTER); box(cx - 3, g + 1, cz + 6, cx - 2, g + 14, cz + 7, 0);
  for (let i = 0; i < 3; i++) box(cx - 5 + i, g + 16 + i, cz + 4 + i, cx + i, g + 16 + i, cz + 9 - i, B.STONE);
  box(cx - 3, g + 19, cz + 6, cx - 3, g + 21, cz + 6, B.DARKWOOD);
  box(cx - 3, g + 1, cz + 8, cx - 2, g + 2, cz + 8, 0); box(cx - 3, g + 9, cz + 8, cx - 2, g + 11, cz + 8, B.ICE);
  for (let x = cx - 14; x <= cx + 14; x++) set(x, g, cz + 10, B.COBBLE);
  for (let x = cx - 14; x <= cx + 6; x += 6) house(x, cz + 11, 5, 5, 2, 'colonial', rng, B.COBBLE);
  mansion(cx + 7, cz - 10, 10, 8, g);
  // --- Manali: Hadimba temple + bridge
  cx = 150; cz = 44; g = groundAt(cx, cz);
  reserve(cx - 12, cz - 12, cx + 12, cz + 12);
  flatten(cx - 10, cz - 10, cx + 10, cz + 10, g, B.GRASS);
  box(cx - 6, g + 1, cz - 6, cx + 6, g + 2, cz + 6, B.COBBLE); box(cx - 5, g + 3, cz - 5, cx + 5, g + 3, cz + 5, B.COBBLE);
  pagoda(cx, cz, g + 3);
  for (let z = 50; z <= 58; z++) box(159, 40, z, 160, 40, z, B.DARKWOOD);
  for (let z = 50; z <= 58; z += 4) { box(159, 41, z, 159, 42, z, B.DARKWOOD); box(160, 41, z, 160, 42, z, B.DARKWOOD); }
  // --- Spiti: Key Monastery
  cx = 206; cz = 54;
  reserve(cx - 20, cz - 16, cx + 20, cz + 16);
  mound(cx, cz, 13, 12, B.SAND);
  const gt = groundAt(cx, cz);
  const T = [[-9, 9, -5, 5, gt - 9, gt - 5], [-8, 8, -5, 3, gt - 4, gt - 1], [-6, 6, -5, 1, gt, gt + 3], [-4, 4, -5, -1, gt + 4, gt + 7], [-2, 2, -5, -3, gt + 8, gt + 10]];
  for (const [a0, a1, b0, b1, y0, y1] of T) {
    fbox(cx + a0, cz + b0, cx + a1, cz + b1, y0, y1, B.PLASTER);
    for (let x = cx + a0 + 1; x <= cx + a1 - 1; x += 2) set(x, y1 - 1, cz + b1, B.DARKWOOD);
    wallRect(cx + a0, cz + b0, cx + a1, cz + b1, y1, y1, B.REDSTONE, 1);
  }
  stupa(cx - 6, gt + 4, cz - 1 + 0); stupa(cx + 6, gt + 4, cz - 1 + 0); set(cx, gt + 11, cz - 4, B.GOLD); set(cx - 1, gt + 11, cz - 4, B.GOLD); set(cx + 1, gt + 11, cz - 4, B.GOLD);
  flagPole(cx - 11, gt - 8, cz + 1, 12); flagPole(cx + 11, gt - 8, cz + 1, 12);
  flagLine(cx - 11, gt + 4, cz + 1, cx, gt + 11, cz - 4); flagLine(cx + 11, gt + 4, cz + 1, cx, gt + 11, cz - 4);
  // Chandratal flags
  reserve(170, 26, 198, 48);
  const ct = groundAt(184, 47);
  flagPole(176, ct, 46, 6); flagPole(192, ct, 46, 6); flagLine(176, ct + 6, 46, 192, ct + 6, 46);
}

function pagoda(cx, cz, y0) {
  const tiers = [{ hw: 4, wh: 4, r0: 6 }, { hw: 2, wh: 3, r0: 4 }, { hw: 1, wh: 2, r0: 3 }];
  let y = y0;
  tiers.forEach((t, k) => {
    box(cx - t.hw, y + 1, cz - t.hw, cx + t.hw, y + t.wh, cz + t.hw, B.PLANKS);
    box(cx - t.hw + 1, y + 1, cz - t.hw + 1, cx + t.hw - 1, y + t.wh, cz + t.hw - 1, 0);
    for (const [px, pz] of [[-t.hw, -t.hw], [t.hw, -t.hw], [-t.hw, t.hw], [t.hw, t.hw]]) box(cx + px, y + 1, cz + pz, cx + px, y + t.wh, cz + pz, B.DARKWOOD);
    if (k === 0) { box(cx, y + 1, cz + t.hw, cx, y + 2, cz + t.hw, 0); for (let x = cx - 2; x <= cx + 2; x += 2) set(x, y + 3, cz + t.hw, 0); }
    const base = y + t.wh;
    for (let i = 0; i < t.r0 + 1; i++) {
      const hw = t.r0 - i; if (hw < 0) break;
      box(cx - hw, base + 1 + i, cz - hw, cx + hw, base + 1 + i, cz + hw, B.DARKWOOD);
      if (k < 2 && hw <= t.hw - 0) break;
    }
    y = base + (k < 2 ? t.r0 - tiers[k + 1].hw - 0 : t.r0 + 1);
  });
  box(cx, y + 1, cz, cx, y + 3, cz, B.GOLD);
}
function mansion(x0, z0, w, d, g) {
  flatten(x0 - 1, z0 - 1, x0 + w, z0 + d, g, B.GRASS);
  box(x0, g, z0, x0 + w - 1, g, z0 + d - 1, B.PLANKS);
  box(x0, g + 1, z0, x0 + w - 1, g + 9, z0 + d - 1, B.COBBLE); box(x0 + 1, g + 1, z0 + 1, x0 + w - 2, g + 9, z0 + d - 2, 0);
  for (let x = x0 + 2; x < x0 + w - 2; x += 2) for (const y of [g + 2, g + 5, g + 8]) { set(x, y, z0 + d - 1, B.ICE); set(x, y, z0, B.ICE); }
  box(x0 + (w >> 1), g + 1, z0 + d - 1, x0 + (w >> 1), g + 2, z0 + d - 1, 0);
  for (let i = 0; i < 5; i++) box(x0 - 1, g + 10 + i, z0 - 1 + i, x0 + w, g + 10 + i, z0 + d - i, B.DARKWOOD);
  for (const sx of [0, w - 3]) { box(x0 + sx, g + 1, z0 + d - 3, x0 + sx + 2, g + 14, z0 + d - 1, B.COBBLE);
    for (let i = 0; i < 3; i++) box(x0 + sx - 1 + i, g + 15 + i, z0 + d - 4 + i, x0 + sx + 3 - i, g + 15 + i, z0 + d - i, B.DARKWOOD); }
}

/* ================================================================== */
const LOCATIONS = [
  { id: 'taj', name: 'Taj Mahal, Agra', region: 'Uttar Pradesh', x: 80, z: 179, yaw: -Math.PI / 2, blurb: 'White marble tomb above the Yamuna' },
  { id: 'plainsvillage', name: 'Village by the Yamuna', region: 'Uttar Pradesh', x: 214, z: 162, yaw: 0, blurb: 'Wheat fields and mud-brick homes' },
  { id: 'indiagate', name: 'India Gate, Delhi', region: 'Delhi', x: 100, z: 142, yaw: -Math.PI / 2, blurb: 'War memorial on a long green avenue' },
  { id: 'redfort', name: 'Red Fort, Delhi', region: 'Delhi', x: 146, z: 146, yaw: 0, blurb: 'Red sandstone walls and marble halls' },
  { id: 'qutub', name: 'Qutub Minar, Delhi', region: 'Delhi', x: 94, z: 164, yaw: -Math.PI / 4, blurb: 'A five-storey tower of red stone' },
  { id: 'hawa', name: 'Hawa Mahal, Jaipur', region: 'Rajasthan', x: 55, z: 124, yaw: 0, blurb: 'The pink palace of a thousand windows' },
  { id: 'amber', name: 'Amber Fort, Jaipur', region: 'Rajasthan', x: 96, z: 134, yaw: 0, blurb: 'A hill fort above the plains' },
  { id: 'jal', name: 'Jal Mahal, Jaipur', region: 'Rajasthan', x: 50, z: 89, yaw: Math.PI, blurb: 'A palace floating in Man Sagar lake' },
  { id: 'lakepalace', name: 'Lake Palace, Udaipur', region: 'Rajasthan', x: 50, z: 234, yaw: 0, blurb: 'White marble on Lake Pichola' },
  { id: 'monsoon', name: 'Monsoon Palace, Udaipur', region: 'Rajasthan', x: 28, z: 226, yaw: 0, blurb: 'A hilltop palace above the city' },
  { id: 'rajvillage', name: 'Rajasthani village', region: 'Rajasthan', x: 28, z: 178, yaw: 0, blurb: 'Whitewashed houses and camels' },
  { id: 'dal', name: 'Dal Lake, Srinagar', region: 'Kashmir', x: 46, z: 80, yaw: 0, blurb: 'Houseboats, shikaras and chinar trees' },
  { id: 'nishat', name: 'Mughal Gardens, Kashmir', region: 'Kashmir', x: 61, z: 64, yaw: -Math.PI / 2, blurb: 'Terraced gardens and water channels' },
  { id: 'shankar', name: 'Shankaracharya Temple', region: 'Kashmir', x: 62, z: 94, yaw: 0, blurb: 'A stone shrine on a hill above the valley' },
  { id: 'dharam', name: 'McLeod Ganj, Dharamshala', region: 'Himachal Pradesh', x: 96, z: 58, yaw: 0, blurb: 'Golden roofs and prayer flags' },
  { id: 'shimla', name: 'Shimla Ridge', region: 'Himachal Pradesh', x: 120, z: 96, yaw: 0, blurb: 'Colonial streets on a mountain ridge' },
  { id: 'manali', name: 'Hadimba Temple, Manali', region: 'Himachal Pradesh', x: 154, z: 58, yaw: 0, blurb: 'A wooden pagoda in the pine forest' },
  { id: 'oldmanali', name: 'Mountain village (Old Manali)', region: 'Himachal Pradesh', x: 172, z: 70, yaw: 0, blurb: 'Stone and timber homes in the valley' },
  { id: 'spiti', name: 'Key Monastery, Spiti', region: 'Himachal Pradesh', x: 206, z: 68, yaw: 0, blurb: 'A whitewashed monastery in the cold desert' },
  { id: 'chandratal', name: 'Chandratal Lake', region: 'Himachal Pradesh', x: 184, z: 48, yaw: 0, blurb: 'A high-altitude lake under snow peaks' },
  { id: 'portal', name: 'The Night Portal', region: 'Special', x: 84, z: 186, yaw: -0.6, blurb: 'Step through to see the night side', novault: true }
];

/* The portal that switches the world between day and night */
function nightPortal() {
  const x = 88, z0 = 180, g = groundAt(x, z0 + 1);
  box(x - 1, g + 1, z0 - 1, x + 1, g + 6, z0 + 4, 0);
  box(x - 1, g, z0 - 1, x + 1, g, z0 + 4, B.COBBLE);
  // 4 wide x 5 tall frame; its bottom row replaces the ground so the opening is walkable
  for (let dz = 0; dz < 4; dz++) for (let dy = 0; dy < 5; dy++) {
    const edge = dz === 0 || dz === 3 || dy === 0 || dy === 4;
    set(x, g + dy, z0 + dz, edge ? B.PORTALFRAME : B.PORTAL);
  }
  lamppost(x + 2, z0 - 1); lamppost(x + 2, z0 + 4);
}

/* One "Wayfare Safe" next to every place's arrival point */
function placeVaults() {
  VAULTS.length = 0;
  for (const L of LOCATIONS) {
    if (L.novault) continue;
    const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw), rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    let spot = null;
    for (const [f, r] of [[4, 2.5], [4, -2.5], [5, 0], [3, 3.5], [3, -3.5], [6, 3], [6, -3], [2, 4]]) {
      const x = Math.round(L.x + fx * f + rx * r), z = Math.round(L.z + fz * f + rz * r);
      if (x < 3 || z < 3 || x >= W - 3 || z >= D - 3 || isWaterCol(x, z)) continue;
      const g = groundAt(x, z);
      if (at(x, g + 1, z) !== 0 || at(x, g + 2, z) !== 0) continue;
      spot = { x, y: g + 1, z, g }; break;
    }
    if (!spot) continue;
    set(spot.x, spot.g, spot.z, B.COBBLE);
    set(spot.x, spot.y, spot.z, B.VAULT);
    for (const sgn of [-1, 1]) {
      const lx = Math.round(spot.x + fx * 1.6 + rx * 1.6 * sgn), lz = Math.round(spot.z + fz * 1.6 + rz * 1.6 * sgn), lg = groundAt(lx, lz);
      if (at(lx, lg + 1, lz) === 0 && !isWaterCol(lx, lz)) { box(lx, lg + 1, lz, lx, lg + 2, lz, B.DARKWOOD); set(lx, lg + 3, lz, B.LAMP); }
    }
    VAULTS.push({ id: L.id, name: L.name, x: spot.x, y: spot.y, z: spot.z });
  }
}

window.BL = { W, D, H, SEA, B, NAMES, blocks, idx, get, solid, topY, generate, LOCATIONS, VAULTS, mulberry, hash2, fbm, clamp, sm, colorTile, REG };
})();

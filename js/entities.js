/* Animals, the player avatar and ambient particles. Everything is made from coloured cuboids that are
   rebuilt each frame into one dynamic mesh (same vertex layout as the terrain). */
(function () {
'use strict';
const BL = window.BL, { B, W, D, H, blocks, idx } = BL;
const CT = BL.colorTile;
const STRIDE = 11, MAXF = 420000;
const data = new Float32Array(MAXF);
let nf = 0;

/* ---------- palette ---------- */
const C = {
  white: CT('a.white', '#efeae0'), cream: CT('a.cream', '#e4d9bd'), brown: CT('a.brown', '#7a4b2a'), dbrown: CT('a.dbrown', '#4a2d1b'),
  dark: CT('a.dark', '#2b2a2e'), grey: CT('a.grey', '#8d8f94'), dgrey: CT('a.dgrey', '#5f6166'), tan: CT('a.tan', '#c9a46a'),
  camel: CT('a.camel', '#c08c4e'), ivory: CT('a.ivory', '#f4efdc'), pink: CT('a.pink', '#e8a5a0'), teal: CT('a.teal', '#1c8a9a'),
  blue: CT('a.blue', '#1d4fa8'), green: CT('a.green', '#2e9a55'), gold: CT('a.gold', '#d8b03a'), black: CT('a.black', '#111214'),
  wool: CT('a.wool', '#f2efe6', 'wool'), yak: CT('a.yak', '#3b2a22', 'wool'), fan: CT('a.fan', '#1d7f8c', 'fan'),
  glow: CT('a.glow', '#d8ff7a', 'glow', 0), lantern: CT('a.lantern', '#ff9a3c', 'lantern', 6),
  bf1: CT('a.bf1', '#ff9a2e'), bf2: CT('a.bf2', '#fff176'), bf3: CT('a.bf3', '#f48fb1'), bf4: CT('a.bf4', '#ffffff')
};

/* ---------- cuboid emitter ---------- */
const FACES = [
  { n: [1, 0, 0], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] }, { n: [-1, 0, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] }, { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0, 0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, { n: [0, 0, -1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }
];
const UVS = [[0, 1], [1, 1], [1, 0], [0, 0]];
const CX = new Float32Array(8), CY = new Float32Array(8), CZ = new Float32Array(8);

// T: { x, y, z, cs, sn, s } world transform of the whole creature
function box(T, cx, cy, cz, sx, sy, sz, tile, rx, py, pz, em) {
  if (nf + 264 > MAXF) return;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cr = rx ? Math.cos(rx) : 1, sr = rx ? Math.sin(rx) : 0;
  for (let i = 0; i < 8; i++) {
    let x = cx + ((i & 1) ? hx : -hx), y = cy + ((i & 2) ? hy : -hy), z = cz + ((i & 4) ? hz : -hz);
    if (rx) { const dy = y - py, dz = z - pz; y = py + dy * cr - dz * sr; z = pz + dy * sr + dz * cr; }
    x *= T.s; y *= T.s; z *= T.s;
    CX[i] = T.x + x * T.cs + z * T.sn; CY[i] = T.y + y; CZ[i] = T.z - x * T.sn + z * T.cs;
  }
  const e = em || 0;
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    let ny = F.n[1] * cr - F.n[2] * sr, nz = F.n[1] * sr + F.n[2] * cr, nx = F.n[0];
    const wx = nx * T.cs + nz * T.sn, wz = -nx * T.sn + nz * T.cs;
    for (let k = 0; k < 4; k++) {
      const v = F.v[k], ci = v[0] + v[1] * 2 + v[2] * 4;
      data[nf++] = CX[ci]; data[nf++] = CY[ci]; data[nf++] = CZ[ci];
      data[nf++] = UVS[k][0]; data[nf++] = UVS[k][1];
      data[nf++] = wx; data[nf++] = ny; data[nf++] = wz;
      data[nf++] = 1; data[nf++] = e; data[nf++] = tile;
    }
  }
}

/* ---------- terrain queries for animals ---------- */
const isTree = b => b === B.LOG || b === B.LEAVES || b === B.PINELEAF || b === B.CHINAR;
function surf(x, z, y0) {
  x = Math.floor(x); z = Math.floor(z);
  if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return null;
  let y = Math.min(H - 1, Math.floor(y0) + 4), water = false;
  for (; y >= 0; y--) {
    const b = blocks[idx(x, y, z)];
    if (b === 0 || b === B.PORTAL) continue;
    if (b === B.WATER) { water = true; continue; }
    return { y, water, b };
  }
  return { y: 0, water, b: 0 };
}
const NATURAL = new Set([B.GRASS, B.DIRT, B.SAND, B.FIELD, B.SNOW, B.STONE, B.TULIP]);

/* ---------- species ---------- */
const SP = {
  cow:      { spd: 0.8, sc: 1, q: { bl: 1.4, bh: 0.75, bw: 0.7, lh: 0.55, lw: 0.2, body: 'white', leg: 'white', head: { w: 0.46, h: 0.42, l: 0.46, c: 'white' }, hy: 0.25, ears: 'brown', horns: 'ivory', tail: 'brown', udder: true, patches: true } },
  buffalo:  { spd: 0.7, sc: 1.1, q: { bl: 1.5, bh: 0.8, bw: 0.8, lh: 0.5, lw: 0.22, body: 'dgrey', leg: 'dgrey', head: { w: 0.5, h: 0.4, l: 0.55, c: 'dgrey' }, hy: 0.1, ears: 'dark', horns: 'dark', hornWide: true, tail: 'dark' } },
  goat:     { spd: 1.3, sc: 1, q: { bl: 0.85, bh: 0.45, bw: 0.32, lh: 0.4, lw: 0.1, body: 'cream', leg: 'cream', head: { w: 0.22, h: 0.26, l: 0.3, c: 'cream' }, hy: 0.28, ears: 'brown', horns: 'dark', hornUp: true, beard: true, tail: 'cream', tailUp: true } },
  sheep:    { spd: 1, sc: 1, q: { bl: 0.9, bh: 0.55, bw: 0.55, lh: 0.4, lw: 0.1, body: 'wool', leg: 'dbrown', head: { w: 0.28, h: 0.3, l: 0.32, c: 'dbrown' }, hy: 0.22, ears: 'dbrown', wool: true } },
  dog:      { spd: 1.7, sc: 1, q: { bl: 0.65, bh: 0.26, bw: 0.22, lh: 0.28, lw: 0.08, body: 'tan', leg: 'tan', head: { w: 0.2, h: 0.2, l: 0.2, c: 'tan' }, hy: 0.2, snout: 'dbrown', ears: 'dbrown', floppy: true, tail: 'tan', tailUp: true } },
  horse:    { spd: 2, sc: 1, q: { bl: 1.3, bh: 0.6, bw: 0.45, lh: 0.9, lw: 0.14, body: 'brown', leg: 'dbrown', head: { w: 0.24, h: 0.3, l: 0.55, c: 'brown' }, neck: { len: 0.8, lean: 0.55, w: 0.26 }, mane: 'dark', ears: 'dark', tail: 'dark', tailLong: true } },
  camel:    { spd: 1.4, sc: 1, q: { bl: 1.5, bh: 0.7, bw: 0.55, lh: 1.15, lw: 0.16, body: 'camel', leg: 'camel', head: { w: 0.26, h: 0.3, l: 0.5, c: 'camel' }, neck: { len: 1.0, lean: 0.35, w: 0.24 }, hump: true, tail: 'camel' } },
  elephant: { spd: 0.9, sc: 1, q: { bl: 2.2, bh: 1.5, bw: 1.2, lh: 1.1, lw: 0.5, body: 'grey', leg: 'grey', head: { w: 0.95, h: 1.05, l: 0.9, c: 'grey' }, hy: 0.35, trunk: true, bigEars: true, tusks: true, tail: 'dgrey' } },
  yak:      { spd: 0.8, sc: 1, q: { bl: 1.3, bh: 0.75, bw: 0.75, lh: 0.45, lw: 0.2, body: 'yak', leg: 'dbrown', head: { w: 0.44, h: 0.4, l: 0.46, c: 'dbrown' }, hy: 0.12, ears: 'dbrown', horns: 'ivory', hornWide: true, skirt: true, tail: 'dbrown' } },
  peacock:  { spd: 0.9, sc: 1, bird: true }
};

function quadruped(T, a, q) {
  const t = C, sw = Math.sin(a.ph) * 0.65 * a.mv, by = q.lh + q.bh / 2, bz = q.bl / 2;
  const col = k => t[k];
  // body
  box(T, 0, by, 0, q.bw, q.bh, q.bl, col(q.body));
  if (q.wool) { box(T, 0, by + 0.04, 0, q.bw + 0.1, q.bh + 0.1, q.bl + 0.08, t.wool); }
  if (q.skirt) box(T, 0, q.lh + 0.02, 0, q.bw + 0.1, 0.4, q.bl - 0.1, t.yak);
  if (q.patches && a.v === 0) {
    box(T, 0.1, by + q.bh / 2 + 0.01, -0.15, 0.4, 0.02, 0.45, t.brown);
    box(T, -q.bw / 2 - 0.01, by + 0.05, 0.25, 0.02, 0.3, 0.35, t.brown);
    box(T, q.bw / 2 + 0.01, by - 0.05, -0.3, 0.02, 0.28, 0.32, t.brown);
  } else if (q.patches) { box(T, 0, by, 0, q.bw + 0.01, q.bh + 0.01, q.bl + 0.01, t.tan); }
  if (q.hump) { box(T, 0, by + q.bh / 2 + 0.2, 0.05, 0.4, 0.42, 0.5, t.camel); }
  if (q.udder) box(T, 0, q.lh + 0.02, bz - 0.35, 0.22, 0.1, 0.22, t.pink);
  // legs (diagonal pairs swing together)
  const lx = q.bw / 2 - q.lw / 2 - 0.01, lz = bz - q.lw / 2 - 0.04;
  for (const [x, z, ang] of [[-lx, -lz, sw], [lx, -lz, -sw], [-lx, lz, -sw], [lx, lz, sw]]) box(T, x, q.lh / 2, z, q.lw, q.lh, q.lw, col(q.leg), ang, q.lh, z);
  // neck + head
  const hd = q.head; let hx = 0, hy, hz;
  if (q.neck) {
    const nb = [by + q.bh * 0.25, -bz + 0.1], n = q.neck;
    box(T, 0, nb[0] + n.len / 2, nb[1], n.w, n.len, n.w, col(q.body), -n.lean, nb[0], nb[1]);
    const topY = nb[0] + n.len * Math.cos(n.lean), topZ = nb[1] - n.len * Math.sin(n.lean);
    hy = topY - hd.h * 0.1; hz = topZ - hd.l * 0.3;
    if (q.mane) box(T, 0, nb[0] + n.len / 2 + 0.02, nb[1] + 0.06, 0.06, n.len, 0.1, t[q.mane], -n.lean, nb[0], nb[1]);
  } else { hy = by + q.hy; hz = -(bz + hd.l * 0.35); }
  const bob = a.mv < 0.1 ? Math.sin(a.t * 1.3) * 0.04 : 0;
  box(T, hx, hy + bob, hz, hd.w, hd.h, hd.l, col(hd.c));
  if (q.snout) box(T, 0, hy - 0.04 + bob, hz - hd.l / 2 - 0.05, hd.w * 0.6, hd.h * 0.5, 0.12, t[q.snout]);
  for (const s of [-1, 1]) {
    box(T, s * hd.w * 0.3, hy + hd.h * 0.12 + bob, hz - hd.l / 2 - 0.005, 0.05, 0.05, 0.02, t.black);
    if (q.ears) box(T, s * (hd.w / 2 + 0.07), hy + hd.h * 0.35 + bob, hz + hd.l * 0.15, 0.14, q.floppy ? 0.2 : 0.1, 0.12, t[q.ears]);
    if (q.horns) {
      if (q.hornWide) box(T, s * (hd.w / 2 + 0.16), hy + hd.h * 0.4 + bob, hz + hd.l * 0.1, 0.34, 0.07, 0.08, t[q.horns]);
      else if (q.hornUp) box(T, s * hd.w * 0.3, hy + hd.h / 2 + 0.12 + bob, hz + hd.l * 0.15, 0.04, 0.24, 0.04, t[q.horns]);
      else box(T, s * hd.w * 0.35, hy + hd.h / 2 + 0.05 + bob, hz + hd.l * 0.2, 0.06, 0.12, 0.06, t[q.horns]);
    }
    if (q.bigEars) box(T, s * (hd.w / 2 + 0.05), hy + 0.1, hz + 0.2, 0.08, 0.95, 0.85, t.grey, 0, 0, 0);
    if (q.tusks) box(T, s * 0.3, hy - 0.4, hz - hd.l / 2 - 0.1, 0.09, 0.09, 0.6, t.ivory);
  }
  if (q.beard) box(T, 0, hy - hd.h / 2 - 0.05 + bob, hz - hd.l / 2 + 0.03, 0.05, 0.14, 0.05, t.dbrown);
  if (q.trunk) {
    const sway = Math.sin(a.t * 1.1) * 0.18 + sw * 0.3;
    let ty = hy - 0.1, tz = hz - hd.l / 2 - 0.05;
    for (let i = 0; i < 3; i++) { box(T, 0, ty - 0.3, tz, 0.34 - i * 0.05, 0.6, 0.34 - i * 0.05, t.grey, sway * (i + 1) * 0.6, ty, tz); ty -= 0.52; tz -= 0.07 + sway * 0.2; }
  }
  // tail
  if (q.tail) {
    const tl = q.tailLong ? 0.7 : 0.4, sway = Math.sin(a.t * 3 + a.v) * 0.25 + sw * 0.2;
    if (q.tailUp) box(T, 0, by + q.bh / 2 + 0.05, bz + 0.1, 0.07, tl * 0.7, 0.07, t[q.tail], 0.9 + sway, by + q.bh / 2, bz);
    else box(T, 0, by + q.bh / 2 - tl / 2, bz + 0.04, 0.07, tl, 0.07, t[q.tail], sway, by + q.bh / 2, bz);
  }
}

function peacock(T, a) {
  const sw = Math.sin(a.ph) * 0.6 * a.mv;
  for (const s of [-1, 1]) box(T, s * 0.07, 0.17, 0, 0.04, 0.34, 0.04, C.gold, s * sw, 0.34, 0);
  box(T, 0, 0.5, 0, 0.3, 0.3, 0.55, C.teal);
  box(T, 0, 0.58, -0.3, 0.12, 0.45, 0.12, C.blue, -0.35, 0.58, -0.3);
  box(T, 0, 0.9, -0.42, 0.13, 0.13, 0.17, C.blue);
  box(T, 0, 1.0, -0.4, 0.04, 0.12, 0.04, C.green);
  box(T, 0, 0.88, -0.52, 0.03, 0.03, 0.08, C.gold);
  for (const s of [-1, 1]) box(T, s * 0.07, 0.92, -0.5, 0.025, 0.025, 0.02, C.black);
  if (a.fan) {
    box(T, 0, 0.9, 0.4, 1.3, 1.0, 0.04, C.fan);
    box(T, 0, 0.45, 0.32, 0.3, 0.2, 0.1, C.green);
  } else {
    box(T, 0, 0.3, 0.95, 0.3, 0.05, 1.1, C.fan, 0.06, 0.3, 0.4);
  }
}

/* ---------- animals ---------- */
const animals = [];
let seedState = 1;
const rand = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };

const SPAWNS = [
  ['cow', 96, 60, 12, 3], ['goat', 96, 56, 14, 5], ['sheep', 100, 52, 14, 5], ['dog', 96, 58, 8, 2],
  ['cow', 172, 62, 12, 3], ['yak', 172, 66, 14, 4], ['horse', 164, 60, 12, 3], ['yak', 150, 62, 14, 3], ['sheep', 150, 58, 14, 5],
  ['yak', 206, 66, 14, 4], ['goat', 206, 62, 12, 4], ['dog', 206, 64, 8, 2], ['sheep', 200, 70, 10, 3],
  ['sheep', 34, 52, 14, 6], ['horse', 30, 48, 12, 3], ['cow', 28, 54, 10, 2], ['dog', 30, 50, 8, 1], ['sheep', 70, 80, 12, 4],
  ['horse', 120, 100, 10, 3], ['dog', 120, 94, 8, 2], ['sheep', 112, 98, 10, 3],
  ['cow', 122, 134, 14, 4], ['dog', 124, 136, 12, 3], ['peacock', 124, 138, 16, 3], ['cow', 140, 150, 20, 3],
  ['cow', 214, 150, 18, 5], ['buffalo', 214, 152, 18, 4], ['goat', 212, 148, 14, 3], ['dog', 214, 150, 10, 2], ['peacock', 214, 156, 16, 3],
  ['cow', 100, 100, 16, 3], ['buffalo', 100, 102, 16, 3], ['goat', 98, 98, 12, 3],
  ['buffalo', 168, 136, 14, 3], ['cow', 168, 138, 12, 3], ['goat', 166, 134, 10, 2],
  ['camel', 28, 168, 16, 4], ['goat', 28, 168, 14, 5], ['cow', 30, 170, 10, 2], ['dog', 28, 168, 10, 2], ['peacock', 30, 164, 14, 2],
  ['camel', 100, 226, 14, 3], ['goat', 100, 226, 12, 3], ['cow', 98, 224, 10, 2], ['peacock', 96, 224, 14, 2],
  ['cow', 196, 210, 14, 3], ['buffalo', 196, 212, 14, 3], ['goat', 194, 208, 12, 3],
  ['peacock', 105, 178, 22, 5], ['peacock', 146, 118, 14, 2], ['cow', 140, 148, 14, 2],
  ['elephant', 96, 128, 10, 3], ['camel', 60, 150, 12, 2], ['camel', 55, 128, 8, 2],
  ['peacock', 92, 222, 16, 3], ['horse', 90, 218, 10, 2], ['cow', 92, 226, 10, 2]
];

function init(seed) {
  animals.length = 0; seedState = (seed * 2654435761) >>> 0 || 1;
  for (const [sp, cx, cz, r, n] of SPAWNS) {
    let made = 0;
    for (let tries = 0; tries < 60 && made < n; tries++) {
      const ang = rand() * 6.283, rr = Math.sqrt(rand()) * r, x = Math.floor(cx + Math.cos(ang) * rr), z = Math.floor(cz + Math.sin(ang) * rr);
      const s = surf(x, z, H);
      if (!s || s.water || !NATURAL.has(s.b)) continue;
      const big = sp === 'elephant' ? 3 : 2;
      let clear = true; for (let k = 1; k <= big; k++) if (blocks[idx(x, s.y + k, z)] !== 0) clear = false;
      if (!clear) continue;
      animals.push({ sp, x: x + 0.5, y: s.y + 1, z: z + 0.5, yaw: rand() * 6.283, ph: rand() * 6, t: rand() * 10, st: 0, tm: rand() * 3, mv: 0, v: (rand() * 2) | 0, fan: false, fanT: 4 + rand() * 8 });
      made++;
    }
  }
}

function updateAnimals(dt, px, pz) {
  for (const a of animals) {
    const dx = a.x - px, dz = a.z - pz;
    if (dx * dx + dz * dz > 90 * 90) continue;
    const S = SP[a.sp]; a.t += dt; a.tm -= dt;
    if (a.sp === 'peacock') { a.fanT -= dt; if (a.fanT < 0) { a.fan = !a.fan && a.mv < 0.1; a.fanT = a.fan ? 4 + rand() * 3 : 6 + rand() * 12; } }
    if (a.tm <= 0) {
      if (a.st === 0) { a.st = 1; a.tm = 2 + rand() * 5; a.yaw += (rand() - 0.5) * 2.2; }
      else { a.st = 0; a.tm = 1.5 + rand() * 5; }
    }
    let target = 0;
    if (a.st === 1 && !a.fan) {
      const sp = S.spd * dt, nx = a.x - Math.sin(a.yaw) * sp, nz = a.z - Math.cos(a.yaw) * sp;
      const s = surf(nx, nz, a.y);
      const big = a.sp === 'elephant' ? 3 : 2;
      let ok = s && !s.water && NATURAL.has(s.b) && s.y + 1 - a.y <= 1.01 && s.y + 1 - a.y >= -3;
      if (ok) for (let k = 1; k <= big; k++) if (blocks[idx(Math.floor(nx), s.y + k, Math.floor(nz))] !== 0) { ok = false; break; }
      if (ok) { a.x = nx; a.z = nz; a.gy = s.y + 1; target = 1; }
      else { a.yaw += 1.8 + rand() * 1.5; a.st = 0; a.tm = 0.6 + rand(); }
    }
    a.mv += (target - a.mv) * Math.min(1, 6 * dt);
    a.ph += dt * a.mv * S.spd * 7;
    const s0 = surf(a.x, a.z, a.y);
    if (s0 && !s0.water) { const gy = s0.y + 1; a.y += (gy - a.y) * Math.min(1, 10 * dt); }
  }
}

function buildAnimals(px, pz) {
  for (const a of animals) {
    const dx = a.x - px, dz = a.z - pz;
    if (dx * dx + dz * dz > 80 * 80) continue;
    const S = SP[a.sp];
    const T = { x: a.x, y: a.y, z: a.z, cs: Math.cos(a.yaw), sn: Math.sin(a.yaw), s: S.sc };
    if (S.bird) peacock(T, a); else quadruped(T, a, S.q);
  }
}

/* ---------- avatar ---------- */
function buildAvatar(P) {
  const sk = P.skin, c = sk.t, k = 1.8 / 32;
  const T = { x: P.x, y: P.y, z: P.z, cs: Math.cos(P.yaw), sn: Math.sin(P.yaw), s: k };
  const sw = Math.sin(P.phase) * 0.85 * P.mv, idle = Math.sin(P.time * 1.6) * 0.04 * (1 - P.mv);
  const has = e => sk.extras.indexOf(e) >= 0;
  const kurta = has('kurta');
  // legs
  for (const s of [-1, 1]) {
    const a = s * sw;
    box(T, s * 2, 6, 0, 4, 12, 4, c.pants, a, 12, 0);
    box(T, s * 2, 1.3, -0.6, 4.4, 2.6, 5.4, c.shoes, a, 12, 0);
    if (sk.ripped) { box(T, s * 2, 8.2, -2.1, 2.6, 2.2, 0.3, c.skin, a, 12, 0); box(T, s * 2, 3.6, -2.1, 2.4, 1.6, 0.3, c.skin, a, 12, 0); }
  }
  // torso
  box(T, 0, 18, 0, 8, 12, 4, kurta ? c.jacket : c.shirt);
  if (kurta) box(T, 0, 10, 0, 8.6, 7, 4.6, c.jacket);
  if (sk.jacket) {
    const pw = sk.vest ? 2.6 : 3.3;
    for (const s of [-1, 1]) box(T, s * (4.3 - pw / 2), 18, 0, pw, 12.4, 4.6, c.jacket);
    box(T, 0, 18, 2.15, 2.4, 12.4, 0.7, c.jacket);
  }
  // arms
  for (const s of [-1, 1]) {
    const a = -s * sw + idle;
    box(T, s * 6.1, 19.2, 0, 4.4, 9.6, 4.4, sk.jacket || kurta ? c.jacket : c.shirt, a, 24, 0);
    box(T, s * 6.1, 13.1, 0, 4, 2.8, 4, c.skin, a, 24, 0);
  }
  // head (pitches with the camera)
  const hp = P.pitch * 0.8;
  const H8 = (cx, cy, cz, sx, sy, sz, tile) => box(T, cx, cy, cz, sx, sy, sz, tile, hp, 24, 0);
  H8(0, 28, 0, 8, 8, 8, c.skin);
  for (const s of [-1, 1]) H8(s * 2, 28.6, -4.05, 1.5, 1.5, 0.3, c.eye);
  H8(0, 25.4, -4.05, 2.4, 0.5, 0.3, c.skin);
  if (!has('beanie') && !has('hat') && !has('cap') || has('hat')) {
    H8(0, 31.8, 0, 8.7, 2.6, 8.7, c.hair); H8(0, 28.6, 4.1, 8.7, 7, 1.2, c.hair);
    for (const s of [-1, 1]) H8(s * 4.3, 29.6, 0.2, 0.9, 4.6, 7.4, c.hair);
    H8(0, 30.9, -4.1, 8.7, 1.8, 1.0, c.hair); if (sk.id === 'lakshay') { H8(-2.5, 29.8, -4.15, 2.2, 1.2, 0.8, c.hair); H8(2.6, 29.9, -4.15, 1.6, 1.0, 0.8, c.hair); }
  } else { H8(0, 28.6, 4.1, 8.7, 6, 1.2, c.hair); }
  if (has('hat')) { H8(0, 32.6, 0, 12.5, 0.8, 12.5, c.hat); H8(0, 34.5, 0, 8.9, 3.2, 8.9, c.hat); }
  if (has('cap')) { H8(0, 33, 0, 8.9, 2.6, 8.9, c.cap); H8(0, 32.2, -6.2, 8, 0.6, 4, c.cap); }
  if (has('beanie')) { H8(0, 33.2, 0, 9, 3.4, 9, c.beanie); H8(0, 35.8, 0, 2.4, 2.4, 2.4, c.beanie); }
  if (has('goggles')) { H8(0, 31.2, -4.4, 8.8, 1.8, 0.9, c.goggle); }
  if (has('scarf')) { box(T, 0, 24.6, 0, 9, 2.4, 5, c.scarf); box(T, -1.5, 18.5, -2.6, 3, 9, 0.8, c.scarf); }
  if (has('pack')) box(T, 0, 19.5, 3.7, 7, 9.5, 3, c.pack);
  if (has('camera')) { box(T, 0, 18, -3.3, 4.4, 3.2, 2, c.cam); box(T, 0, 18, -4.8, 2.2, 2.2, 1.4, c.lens); box(T, 0, 22.5, -2.5, 0.8, 4, 0.4, c.cam); }
}

/* ---------- ambient particles ---------- */
function wrap(v, centre, span) { return ((((v - centre + span / 2) % span) + span) % span) - span / 2 + centre; }
const gcache = new Map();
function groundFor(x, z) {
  const key = (x | 0) * 4096 + (z | 0);
  let g = gcache.get(key);
  if (g === undefined) { const s = surf(x, z, H); g = s ? (s.water ? -1 : s.y + 1) : -1; if (gcache.size > 4000) gcache.clear(); gcache.set(key, g); }
  return g;
}
function hf(i, s) { return BL.hash2(i, s, 99) ; }

function buildGlow(px, py, pz, time, night) {
  const T = { x: 0, y: 0, z: 0, cs: 1, sn: 0, s: 1 };
  if (night) {
    for (let i = 0; i < 70; i++) {
      const x = wrap(hf(i, 1) * 64, px, 64), z = wrap(hf(i, 2) * 64, pz, 64), g = groundFor(x, z);
      if (g < 0) continue;
      const y = g + 0.6 + hf(i, 3) * 2.6 + Math.sin(time * 0.9 + i) * 0.35;
      const bx = x + Math.sin(time * 0.5 + i * 2) * 0.8, bz = z + Math.cos(time * 0.43 + i) * 0.8;
      const blink = 0.5 + 0.5 * Math.sin(time * 2 + i * 5);
      if (blink > 0.15) box(T, bx, y, bz, 0.09, 0.09, 0.09, C.glow, 0, 0, 0, 1);
    }
    for (let i = 0; i < 38; i++) {
      const x = wrap(hf(i, 7) * 110 + time * 0.35, px, 110), z = wrap(hf(i, 8) * 110 + Math.sin(time * 0.1 + i) * 4, pz, 110);
      const g = groundFor(x, z); const base = g < 0 ? 24 : g;
      const y = base + 4 + ((hf(i, 9) * 50 + time * (0.9 + hf(i, 10) * 0.6)) % 55);
      box(T, x, y, z, 0.55, 0.65, 0.55, C.lantern, 0, 0, 0, 1);
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const x = wrap(hf(i, 21) * 70 + Math.sin(time * 0.3 + i) * 2, px, 70), z = wrap(hf(i, 22) * 70 + Math.cos(time * 0.27 + i * 2) * 2, pz, 70);
      const g = groundFor(x, z); if (g < 0 || g > 62) continue;
      const y = g + 0.8 + Math.sin(time * 1.6 + i * 3) * 0.4 + hf(i, 23) * 1.2;
      const tile = [C.bf1, C.bf2, C.bf3, C.bf4][i & 3], fl = Math.sin(time * 14 + i * 7) * 0.9;
      const yawB = time * 0.4 + i, B1 = { x, y, z, cs: Math.cos(yawB), sn: Math.sin(yawB), s: 1 };
      box(B1, 0, 0, 0, 0.04, 0.04, 0.16, C.black);
      for (const s of [-1, 1]) box(B1, s * 0.1, 0, 0, 0.17, 0.015, 0.14, tile, s * fl * 0.5, 0, 0);
    }
  }
}

/* ---------- public API ---------- */
const counts = { a: 0, v: 0, g: 0 };
function build(P) {
  nf = 0;
  buildAnimals(P.x, P.z);
  counts.a = nf / (STRIDE * 4) * 6;
  buildAvatar(P);
  counts.v = nf / (STRIDE * 4) * 6;
  buildGlow(P.x, P.y, P.z, P.time, P.night);
  counts.g = nf / (STRIDE * 4) * 6;
  return counts;
}
BL.Entities = { init, update: updateAnimals, build, data, get floats() { return nf; }, counts, animals, MAXQUADS: MAXF / (STRIDE * 4) };
})();

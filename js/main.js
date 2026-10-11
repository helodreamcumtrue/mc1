/* BlockLand Shaders — an original voxel sandbox with a BSL-inspired lighting pipeline.
   Raw WebGL2, no dependencies. */
(() => {
'use strict';

/* ------------------------------------------------------------------ *
 *  Constants & settings
 * ------------------------------------------------------------------ */
const W = 128, D = 128, H = 64, SEA = 22, CS = 16, CXN = W / CS, CZN = D / CS;
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, WATER = 5, LOG = 6, LEAVES = 7,
      PLANKS = 8, COBBLE = 9, BRICK = 10, LAMP = 11;
const HOTBAR = [GRASS, DIRT, STONE, SAND, COBBLE, PLANKS, LOG, BRICK, LEAVES, LAMP];
const BLOCK_NAMES = { 1:'Grass', 2:'Dirt', 3:'Stone', 4:'Sand', 6:'Log', 7:'Leaves', 8:'Planks', 9:'Cobble', 10:'Brick', 11:'Lamp' };

const DEFAULTS = {
  shadows: true, shadowRes: 2048, bloom: true, rays: true, waves: true, clouds: true,
  fov: 75, exposure: 1.0, time: 9.5, autoTime: false, scale: 1.0, sens: 1.0
};
let S = Object.assign({}, DEFAULTS);
try { Object.assign(S, JSON.parse(localStorage.getItem('bl_settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('bl_settings', JSON.stringify(S)); } catch (e) {} };

/* ------------------------------------------------------------------ *
 *  Small math helpers
 * ------------------------------------------------------------------ */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lin = (r, g, b) => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];

const M4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  },
  lookAt(e, c, up) {
    const z = norm3([e[0] - c[0], e[1] - c[1], e[2] - c[2]]);
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, e), -dot3(y, e), -dot3(z, e), 1
    ]);
  }
};

/* ------------------------------------------------------------------ *
 *  World data + generation
 * ------------------------------------------------------------------ */
const blocks = new Uint8Array(W * D * H);
const idx = (x, y, z) => (y * D + z) * W + x;
function get(x, y, z) {
  if (y < 0) return STONE;
  if (y >= H) return AIR;
  if (x < 0 || z < 0 || x >= W || z >= D) return y <= SEA ? WATER : AIR;
  return blocks[idx(x, y, z)];
}
function solid(x, y, z) {
  if (y < 0) return true;
  if (y >= H) return false;
  if (x < 0 || z < 0 || x >= W || z >= D) return true;
  const b = blocks[idx(x, y, z)];
  return b !== AIR && b !== WATER;
}

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

let worldSeed = parseInt(localStorage.getItem('bl_seed') || '1337', 10);
const edits = new Map();
try {
  const e = JSON.parse(localStorage.getItem('bl_edits') || '[]');
  for (const [i, b] of e) edits.set(i, b);
} catch (e) {}
let editsDirty = false;

function generate(seed) {
  blocks.fill(0);
  const rng = mulberry(seed);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = fbm(x / 44, z / 44, seed);
    const ridge = Math.abs(fbm(x / 70 + 31, z / 70 + 17, seed + 9) - 0.5) * 2;
    const dd = Math.hypot(x - W / 2, z - D / 2) / (W / 2);
    const f = sm(0.42, 0.95, dd);
    let h = 14 + n * 26 + (1 - ridge) * 7;
    h = h * (1 - f) + 9 * f;
    h = Math.floor(h);
    const beach = h <= SEA + 1;
    for (let y = 0; y <= h; y++) {
      let b = STONE;
      if (y === h) b = beach ? SAND : GRASS;
      else if (y > h - 4) b = beach ? SAND : DIRT;
      blocks[idx(x, y, z)] = b;
    }
    for (let y = h + 1; y <= SEA; y++) blocks[idx(x, y, z)] = WATER;
  }
  // trees
  for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
    if (rng() > 0.011) continue;
    let y = H - 1;
    while (y > 0 && blocks[idx(x, y, z)] === AIR) y--;
    if (blocks[idx(x, y, z)] !== GRASS || y <= SEA + 1) continue;
    const th = 4 + Math.floor(rng() * 3), top = y + th;
    for (let ty = y + 1; ty <= top; ty++) blocks[idx(x, ty, z)] = LOG;
    for (let ly = top - 2; ly <= top + 1; ly++) {
      const r = ly >= top ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (ly === top + 1 || rng() < 0.5)) continue;
        if (blocks[idx(x + dx, ly, z + dz)] === AIR) blocks[idx(x + dx, ly, z + dz)] = LEAVES;
      }
    }
  }
  for (const [i, b] of edits) blocks[i] = b;
}

function topY(x, z) {
  for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b !== AIR && b !== WATER) return y; }
  return 0;
}

/* ------------------------------------------------------------------ *
 *  WebGL setup
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  document.getElementById('nogl').classList.remove('hidden');
  return;
}
let hdr = !!gl.getExtension('EXT_color_buffer_float');

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s), '\n', src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    throw new Error('Shader compile failed');
  }
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return { prog: p, l: {} };
}
let cur = null;
const use = p => { cur = p; gl.useProgram(p.prog); };
const L = n => (n in cur.l) ? cur.l[n] : (cur.l[n] = gl.getUniformLocation(cur.prog, n));
const f1 = (n, v) => gl.uniform1f(L(n), v);
const f2 = (n, a) => gl.uniform2f(L(n), a[0], a[1]);
const f3 = (n, a) => gl.uniform3f(L(n), a[0], a[1], a[2]);
const i1 = (n, v) => gl.uniform1i(L(n), v);
const m4 = (n, m) => gl.uniformMatrix4fv(L(n), false, m);

/* ------------------------------------------------------------------ *
 *  Shaders
 * ------------------------------------------------------------------ */
const V300 = '#version 300 es\nprecision highp float;\nprecision highp sampler2DShadow;\n';

const SKY_GLSL = `
uniform vec3 uZen, uHor, uSunDir, uSunCol, uCloudCol;
uniform float uTime, uNight, uClouds;
float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm4(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
vec3 sky(vec3 d){
  float h = max(d.y, 0.0);
  vec3 c = mix(uHor, uZen, pow(h, 0.45));
  if (d.y < 0.0) c = mix(uHor, uHor * vec3(0.25, 0.4, 0.5), clamp(-d.y * 4.0, 0.0, 1.0));
  float up = smoothstep(-0.03, 0.02, d.y);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 6.0) * 0.06 * (1.0 - h) + pow(sd, 60.0) * 0.25) * up;
  c += uSunCol * smoothstep(0.9996, 0.9998, sd) * 6.0 * up;
  float md = dot(d, -uSunDir);
  c += vec3(0.75, 0.85, 1.0) * smoothstep(0.9994, 0.9996, md) * 1.6 * uNight * up;
  if (d.y > 0.0) {
    float st = step(0.9975, h31(floor(d * 220.0))) * uNight * smoothstep(0.0, 0.25, d.y);
    c += vec3(st) * 0.9;
    if (uClouds > 0.5) {
      vec2 q = d.xz / (d.y + 0.12) * 0.6 + vec2(uTime * 0.012, uTime * 0.004);
      float n = fbm4(q * 1.5);
      float cv = smoothstep(0.48, 0.72, n);
      c = mix(c, uCloudCol, cv * smoothstep(0.0, 0.2, d.y) * 0.92);
    }
  }
  return c;
}
`;

const FS_QUAD_VS = V300 + `
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  vUV = p;
}`;

const SHADOW_VS = V300 + `
layout(location=0) in vec3 aPos;
layout(location=5) in float aTile;
uniform mat4 uLightVP; uniform float uTime, uWave;
void main(){
  vec3 p = aPos;
  if (aTile > 6.5 && aTile < 7.5 && uWave > 0.5) {
    float w = sin(uTime * 1.7 + p.x * 1.3 + p.z * 0.9) * 0.04 + sin(uTime * 2.3 + p.z * 1.7 + p.y) * 0.03;
    p.x += w; p.z += w * 0.7;
  }
  gl_Position = uLightVP * vec4(p, 1.0);
}`;
const SHADOW_FS = V300 + `void main(){}`;

const WORLD_VS = V300 + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aN;
layout(location=3) in float aAO;
layout(location=4) in float aEmis;
layout(location=5) in float aTile;
uniform mat4 uVP, uLightVP;
uniform float uTime, uWave;
uniform int uWater;
out vec3 vPos; out vec2 vUV; out vec3 vN; out float vAO; out float vEmis; out float vTile; out vec4 vLP;
void main(){
  vec3 p = aPos;
  if (uWave > 0.5) {
    if (aTile > 6.5 && aTile < 7.5) {
      float w = sin(uTime * 1.7 + p.x * 1.3 + p.z * 0.9) * 0.04 + sin(uTime * 2.3 + p.z * 1.7 + p.y) * 0.03;
      p.x += w; p.z += w * 0.7;
    }
    if (uWater == 1 && aN.y > 0.5) p.y += sin(uTime * 1.3 + p.x * 0.9) * 0.025 + cos(uTime * 1.1 + p.z * 0.8) * 0.025;
  }
  vPos = p; vUV = aUV; vN = aN; vAO = aAO; vEmis = aEmis; vTile = aTile;
  vLP = uLightVP * vec4(p + aN * 0.05, 1.0);
  gl_Position = uVP * vec4(p, 1.0);
}`;

const LIGHT_GLSL = `
uniform sampler2DShadow uShadow;
uniform vec3 uCam, uLightDir, uLightCol, uAmbSky, uAmbGnd, uFog;
uniform float uFogDen, uShadowOn, uTexel;
in vec3 vPos; in vec2 vUV; in vec3 vN; in float vAO; in float vEmis; in float vTile; in vec4 vLP;
float shadowAt(vec4 lp){
  if (uShadowOn < 0.5) return 1.0;
  vec3 pc = lp.xyz * 0.5 + 0.5;
  if (pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0 || pc.z > 1.0) return 1.0;
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadow, vec3(pc.xy + vec2(float(x), float(y)) * uTexel * 1.2, pc.z - 0.0005));
  s /= 9.0;
  vec2 e = min(pc.xy, 1.0 - pc.xy);
  return mix(1.0, s, smoothstep(0.0, 0.06, min(e.x, e.y)));
}
vec3 applyFog(vec3 col){
  float d = length(vPos - uCam);
  float f = 1.0 - exp(-pow(d * uFogDen, 1.5));
  return mix(col, uFog, clamp(f, 0.0, 1.0));
}
`;

const WORLD_FS = V300 + `
uniform sampler2D uAtlas;
out vec4 oColor;
` + LIGHT_GLSL + `
void main(){
  vec2 t = vec2(mod(vTile, 4.0), floor(vTile / 4.0));
  vec4 tex = texture(uAtlas, (t + clamp(vUV, 0.002, 0.998)) / 4.0);
  if (tex.a < 0.5) discard;
  vec3 alb = pow(tex.rgb, vec3(2.2));
  vec3 n = normalize(vN);
  float ndl = max(dot(n, uLightDir), 0.0);
  float sh = ndl > 0.0 ? shadowAt(vLP) : 0.0;
  vec3 amb = mix(uAmbGnd, uAmbSky, n.y * 0.5 + 0.5);
  float ao = vAO * vAO;
  vec3 col = alb * (amb * ao + uLightCol * ndl * sh);
  col += alb * vEmis * 4.5;
  oColor = vec4(applyFog(col), 1.0);
}`;

const WATER_FS = V300 + SKY_GLSL + `
uniform float uWaveAmp;
out vec4 oColor;
` + LIGHT_GLSL + `
vec3 wnorm(vec3 p){
  float t = uTime; vec2 q = p.xz;
  float dx = cos(q.x * 1.1 + t * 1.2) * 0.12 + cos((q.x + q.y) * 2.3 + t * 1.9) * 0.05 + cos(q.y * 0.7 - q.x * 0.4 + t * 0.8) * 0.06;
  float dz = cos(q.y * 1.3 + t * 1.0) * 0.12 + cos((q.x - q.y) * 2.1 + t * 1.7) * 0.05 + cos(q.y * 0.8 + q.x * 0.5 + t * 0.9) * 0.06;
  return normalize(vec3(-dx * uWaveAmp, 1.0, -dz * uWaveAmp));
}
void main(){
  vec3 n = wnorm(vPos);
  vec3 V = normalize(uCam - vPos);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.85 + 0.08;
  vec3 rd = reflect(-V, n);
  vec3 refl = sky(rd);
  float sh = shadowAt(vLP);
  vec3 lit = uAmbSky * 0.6 + uLightCol * 0.12 * sh;
  vec3 base = vec3(0.04, 0.32, 0.4) * lit;
  vec3 col = mix(base, refl, fres);
  col += uSunCol * pow(max(dot(rd, uSunDir), 0.0), 380.0) * 10.0 * sh;
  float a = mix(0.7, 0.96, fres);
  oColor = vec4(applyFog(col), a);
}`;

const SKY_VS = V300 + `
out vec2 vN;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
  vN = p * 2.0 - 1.0;
}`;
const SKY_FS = V300 + SKY_GLSL + `
in vec2 vN;
uniform vec3 uRight, uUp, uFwd; uniform float uTan, uAsp;
out vec4 oColor;
void main(){
  vec3 d = normalize(uFwd + uRight * vN.x * uTan * uAsp + uUp * vN.y * uTan);
  oColor = vec4(sky(d), 1.0);
}`;

const LINE_VS = V300 + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform vec3 uOff;
void main(){ gl_Position = uVP * vec4(aPos + uOff, 1.0); gl_Position.z -= 0.0004; }`;
const LINE_FS = V300 + `out vec4 oColor; void main(){ oColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

const BRIGHT_FS = V300 + `
uniform sampler2D uScene; in vec2 vUV; out vec4 oColor;
void main(){
  vec2 ts = 0.5 / vec2(textureSize(uScene, 0));
  vec3 c = (texture(uScene, vUV + vec2(ts.x, ts.y)).rgb + texture(uScene, vUV + vec2(-ts.x, ts.y)).rgb +
            texture(uScene, vUV + vec2(ts.x, -ts.y)).rgb + texture(uScene, vUV + vec2(-ts.x, -ts.y)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  oColor = vec4(c * smoothstep(0.9, 2.2, l), 1.0);
}`;
const BLUR_FS = V300 + `
uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUV; out vec4 oColor;
void main(){
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 c = texture(uTex, vUV).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(uTex, vUV + uDir * float(i)).rgb * w[i];
    c += texture(uTex, vUV - uDir * float(i)).rgb * w[i];
  }
  oColor = vec4(c, 1.0);
}`;
const COMP_FS = V300 + `
uniform sampler2D uScene, uBloom, uDepth;
uniform vec2 uSunScr;
uniform vec3 uSunCol;
uniform float uVis, uBloomS, uRayS, uExp, uUnder, uAsp, uTime;
in vec2 vUV; out vec4 oColor;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV;
  if (uUnder > 0.5) uv += vec2(sin(uv.y * 40.0 + uTime * 2.0), cos(uv.x * 40.0 + uTime * 2.2)) * 0.0025;
  vec3 c = texture(uScene, uv).rgb;
  if (uBloomS > 0.0) c += texture(uBloom, uv).rgb * uBloomS;
  if (uRayS > 0.0 && uVis > 0.0) {
    vec2 stp = (uSunScr - uv) / 48.0 * 0.85;
    vec2 p = uv; float ill = 1.0; float acc = 0.0;
    for (int i = 0; i < 48; i++) {
      p += stp;
      vec2 pp = clamp(p, 0.001, 0.999);
      float sk = step(0.99999, texture(uDepth, pp).r);
      float w = smoothstep(0.6, 0.0, length((pp - uSunScr) * vec2(uAsp, 1.0)));
      acc += sk * w * ill;
      ill *= 0.965;
    }
    c += acc / 48.0 * uSunCol * uRayS * uVis;
  }
  if (uUnder > 0.5) c = mix(c, vec3(0.02, 0.16, 0.22) * 0.8, 0.4);
  c *= uExp;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.14);                       // slight saturation lift
  vec2 q = vUV - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;                       // vignette
  oColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

const P = {
  shadow: program(SHADOW_VS, SHADOW_FS),
  world: program(WORLD_VS, WORLD_FS),
  water: program(WORLD_VS, WATER_FS),
  sky: program(SKY_VS, SKY_FS),
  line: program(LINE_VS, LINE_FS),
  bright: program(FS_QUAD_VS, BRIGHT_FS),
  blur: program(FS_QUAD_VS, BLUR_FS),
  comp: program(FS_QUAD_VS, COMP_FS)
};
const emptyVAO = gl.createVertexArray();

/* ------------------------------------------------------------------ *
 *  Procedural texture atlas (4x4 tiles of 16px) — all original art
 * ------------------------------------------------------------------ */
function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry(20240611);
  const px = (t, x, y, r, gg, b) => {
    g.fillStyle = `rgb(${clamp(r, 0, 255) | 0},${clamp(gg, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
    g.fillRect((t % 4) * 16 + x, ((t / 4) | 0) * 16 + y, 1, 1);
  };
  const fill = (t, base, v) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (rnd() - 0.5) * v; px(t, x, y, base[0] + k, base[1] + k, base[2] + k); } };
  fill(0, [92, 150, 58], 40);                                   // grass top
  for (let i = 0; i < 20; i++) px(0, rnd() * 16 | 0, rnd() * 16 | 0, 70, 125, 45);
  fill(2, [121, 85, 58], 34);                                   // dirt
  for (let i = 0; i < 14; i++) px(2, rnd() * 16 | 0, rnd() * 16 | 0, 96, 66, 44);
  fill(1, [121, 85, 58], 34);                                   // grass side
  for (let x = 0; x < 16; x++) {
    const hgt = 3 + (rnd() * 3 | 0);
    for (let y = 0; y < hgt; y++) { const k = (rnd() - 0.5) * 36; px(1, x, y, 92 + k, 150 + k, 58 + k); }
  }
  fill(3, [128, 130, 138], 28);                                 // stone
  for (let i = 0; i < 22; i++) { const x = rnd() * 16 | 0, y = rnd() * 16 | 0, d = rnd() < 0.5 ? 100 : 150; px(3, x, y, d, d, d + 6); }
  fill(4, [218, 202, 150], 22);                                 // sand
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // log side
    const k = Math.sin(x * 1.6 + (rnd() - 0.5)) * 14 + (rnd() - 0.5) * 12;
    px(5, x, y, 104 + k, 76 + k * 0.8, 46 + k * 0.6);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // log top rings
    const r = Math.hypot(x - 7.5, y - 7.5), k = Math.sin(r * 1.9) * 16 + (rnd() - 0.5) * 8;
    const edge = r > 7 ? -26 : 0;
    px(6, x, y, 170 + k + edge, 128 + k + edge, 78 + k * 0.6 + edge);
  }
  fill(7, [58, 128, 52], 44);                                   // leaves
  for (let i = 0; i < 60; i++) g.clearRect(((7) % 4) * 16 + (rnd() * 16 | 0), (((7 / 4) | 0)) * 16 + (rnd() * 16 | 0), 1, 1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // planks
    const row = (y / 4) | 0, k = ((x + row * 5) % 16 === 0 ? -30 : 0) + (rnd() - 0.5) * 16 + (y % 4 === 3 ? -22 : 0);
    px(8, x, y, 178 + k, 138 + k, 82 + k * 0.7);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // cobble
    const cell = ((x / 5) | 0) * 7 + ((y / 5) | 0) * 13, base = 112 + (hash2(cell, 3, 5) - 0.5) * 50;
    const edge = (x % 5 === 4 || y % 5 === 4) ? -45 : 0, k = (rnd() - 0.5) * 18;
    px(9, x, y, base + edge + k, base + edge + k, base + edge + k + 4);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // brick
    const row = (y / 4) | 0, off = (row % 2) * 4, mortar = (y % 4 === 3) || ((x + off) % 8 === 7), k = (rnd() - 0.5) * 20;
    if (mortar) px(10, x, y, 190 + k * 0.4, 184 + k * 0.4, 172 + k * 0.4); else px(10, x, y, 156 + k, 70 + k * 0.6, 56 + k * 0.6);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // lamp
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)), k = (rnd() - 0.5) * 22;
    const frame = (r > 6.5) ? -70 : (r > 5.5 ? -30 : 0);
    px(11, x, y, 255 + frame + k, 214 + frame + k, 120 + frame * 1.2 + k);
  }
  fill(12, [40, 120, 160], 10);
  return c;
}

/* ------------------------------------------------------------------ *
 *  Meshing
 * ------------------------------------------------------------------ */
const FACES = [
  { n: [1, 0, 0],  v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { n: [-1, 0, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n: [0, 1, 0],  v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0, 0, 1],  v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { n: [0, 0, -1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }
];
const UVS = [[0, 1], [1, 1], [1, 0], [0, 0]];
const AO_TAB = [0.42, 0.62, 0.8, 1.0];
function tileFor(b, f) {
  switch (b) {
    case GRASS: return f === 2 ? 0 : f === 3 ? 2 : 1;
    case DIRT: return 2; case STONE: return 3; case SAND: return 4;
    case LOG: return (f === 2 || f === 3) ? 6 : 5;
    case LEAVES: return 7; case PLANKS: return 8; case COBBLE: return 9;
    case BRICK: return 10; case LAMP: return 11; case WATER: return 12;
  }
  return 0;
}
const aoSolid = (x, y, z) => { const b = get(x, y, z); return b !== AIR && b !== WATER; };

function mkMesh() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer(), ib = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  [[0, 3, 0], [1, 2, 12], [2, 3, 20], [3, 1, 32], [4, 1, 36], [5, 1, 40]].forEach(([l, s, o]) => {
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, s, gl.FLOAT, false, 44, o);
  });
  gl.bindVertexArray(null);
  return { vao, vb, ib, n: 0 };
}
function uploadMesh(m, verts, inds) {
  gl.bindVertexArray(m.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(inds), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  m.n = inds.length;
}

const chunks = [];
for (let i = 0; i < CXN * CZN; i++) chunks.push({ op: mkMesh(), wt: mkMesh() });

function buildChunk(cx, cz) {
  const ch = chunks[cx + cz * CXN];
  const ov = [], oi = [], wv = [], wi = [];
  const x0 = cx * CS, z0 = cz * CS;
  const ao = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
    const b = blocks[idx(x, y, z)];
    if (!b) continue;
    const isW = b === WATER;
    const lower = isW && get(x, y + 1, z) !== WATER;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], n = F.n;
      const nb = get(x + n[0], y + n[1], z + n[2]);
      const emit = isW ? (nb === AIR || nb === LEAVES) : (nb === AIR || nb === WATER || (nb === LEAVES && b !== LEAVES));
      if (!emit) continue;
      const vs = isW ? wv : ov, is = isW ? wi : oi, base = vs.length / 11;
      const tile = tileFor(b, f), emis = b === LAMP ? 1 : 0;
      const ax = n[0] ? 0 : n[1] ? 1 : 2, b1 = (ax + 1) % 3, b2 = (ax + 2) % 3;
      for (let i = 0; i < 4; i++) {
        const v = F.v[i];
        if (isW) { ao[i] = 1; } else {
          const bx = x + n[0], by = y + n[1], bz = z + n[2];
          const o1 = [0, 0, 0], o2 = [0, 0, 0];
          o1[b1] = v[b1] * 2 - 1; o2[b2] = v[b2] * 2 - 1;
          const s1 = aoSolid(bx + o1[0], by + o1[1], bz + o1[2]) ? 1 : 0;
          const s2 = aoSolid(bx + o2[0], by + o2[1], bz + o2[2]) ? 1 : 0;
          const sc = aoSolid(bx + o1[0] + o2[0], by + o1[1] + o2[1], bz + o1[2] + o2[2]) ? 1 : 0;
          ao[i] = AO_TAB[(s1 && s2) ? 0 : 3 - (s1 + s2 + sc)];
        }
        const py = y + v[1] - ((lower && v[1] === 1) ? 0.1 : 0);
        vs.push(x + v[0], py, z + v[2], UVS[i][0], UVS[i][1], n[0], n[1], n[2], ao[i], emis, tile);
      }
      if (ao[0] + ao[2] < ao[1] + ao[3]) is.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else is.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  uploadMesh(ch.op, ov, oi);
  uploadMesh(ch.wt, wv, wi);
}
const dirty = new Set();
function markDirty(x, z) {
  const cx = x >> 4, cz = z >> 4;
  if (cx < 0 || cz < 0 || cx >= CXN || cz >= CZN) return;
  dirty.add(cx + cz * CXN);
}
function buildAll() { for (let cz = 0; cz < CZN; cz++) for (let cx = 0; cx < CXN; cx++) buildChunk(cx, cz); }
function flushDirty() { for (const k of dirty) buildChunk(k % CXN, (k / CXN) | 0); dirty.clear(); }

// ocean ring beyond the island (same shader as water)
const ocean = mkMesh();
(function () {
  const R = 900, y = SEA + 0.9, v = [], i = [];
  const quad = (x0, z0, x1, z1) => {
    const b = v.length / 11;
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(p => v.push(p[0], y, p[1], 0, 0, 0, 1, 0, 1, 0, 12));
    i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(-R, -R, 0, D + R); quad(W, -R, W + R, D + R); quad(0, -R, W, 0); quad(0, D, W, D + R);
  uploadMesh(ocean, v, i);
})();

// block highlight
const lineVAO = gl.createVertexArray();
(function () {
  gl.bindVertexArray(lineVAO);
  const e = 0.002, a = -e, b = 1 + e;
  const c = [[a,a,a],[b,a,a],[b,a,b],[a,a,b],[a,b,a],[b,b,a],[b,b,b],[a,b,b]];
  const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const d = []; pairs.forEach(([p, q]) => d.push(...c[p], ...c[q]));
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);
})();

/* ------------------------------------------------------------------ *
 *  Textures / render targets
 * ------------------------------------------------------------------ */
const atlasCanvas = makeAtlas();
const atlasTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, atlasTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

function mkTex(w, h, internal, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function colorTex(w, h) {
  return hdr ? mkTex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
             : mkTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
}
function fboWith(tex, depthTex) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  if (tex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  return f;
}

let T = null; // render targets
function freeTargets() {
  if (!T) return;
  [T.sceneTex, T.depthTex, T.b0, T.b1].forEach(t => gl.deleteTexture(t));
  [T.sceneFbo, T.b0Fbo, T.b1Fbo].forEach(f => gl.deleteFramebuffer(f));
}
function makeTargets() {
  freeTargets();
  const w = canvas.width, h = canvas.height, bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
  T = { w, h, bw, bh };
  T.sceneTex = colorTex(w, h);
  T.depthTex = mkTex(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
  T.sceneFbo = fboWith(T.sceneTex, T.depthTex);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && hdr) { hdr = false; return makeTargets(); }
  T.b0 = colorTex(bw, bh); T.b0Fbo = fboWith(T.b0, null);
  T.b1 = colorTex(bw, bh); T.b1Fbo = fboWith(T.b1, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// shadow map
let SM = null;
function makeShadow() {
  if (SM) { gl.deleteTexture(SM.tex); gl.deleteFramebuffer(SM.fbo); }
  const size = S.shadowRes;
  const tex = mkTex(size, size, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = fboWith(null, tex);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  SM = { tex, fbo, size };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * S.scale;
  const w = Math.max(2, Math.floor(canvas.clientWidth * dpr)), h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h || !T) { canvas.width = w; canvas.height = h; makeTargets(); }
}

/* ------------------------------------------------------------------ *
 *  Atmosphere / time of day
 * ------------------------------------------------------------------ */
const env = {};
function updateEnv() {
  const ang = (S.time - 6) / 24 * Math.PI * 2;
  const sd = norm3([Math.cos(ang) * 0.9, Math.sin(ang), 0.35]);
  const sy = sd[1];
  env.sunDir = sd;
  const zenN = lin(0.02, 0.03, 0.09), zenS = lin(0.25, 0.35, 0.65), zenD = lin(0.18, 0.42, 0.85);
  const horN = lin(0.07, 0.09, 0.16), horS = lin(1.0, 0.55, 0.30), horD = lin(0.62, 0.78, 0.95);
  const t1 = sm(-0.25, 0.02, sy), t2 = sm(0.02, 0.4, sy);
  env.zen = mix3(mix3(zenN, zenS, t1), zenD, t2);
  env.hor = mix3(mix3(horN, horS, t1), horD, t2);
  const dayF = sm(-0.1, 0.2, sy);
  const sunI = 3.0 * dayF;
  const sc = mix3(lin(1.0, 0.5, 0.2), lin(1.0, 0.93, 0.8), sm(0.0, 0.45, sy));
  env.sunCol = [sc[0] * sunI, sc[1] * sunI, sc[2] * sunI];
  env.night = 1 - sm(-0.2, 0.05, sy);
  const moonI = 0.35 * sm(-0.1, -0.25, sy);
  const moonCol = [0.5 * moonI, 0.6 * moonI, 1.0 * moonI];
  let ld, lc;
  if (sy > -0.1) { ld = sd.slice(); lc = env.sunCol; } else { ld = [-sd[0], -sd[1], -sd[2]]; lc = moonCol; }
  ld[1] = Math.max(ld[1], 0.12); env.lightDir = norm3(ld); env.lightCol = lc;
  const avg = mix3(env.zen, env.hor, 0.5);
  const lum = avg[0] * 0.3 + avg[1] * 0.55 + avg[2] * 0.15;
  let amb = mix3(avg, [lum, lum, lum], 0.35);
  amb = [amb[0] * 1.15 + (1 - dayF) * 0.03, amb[1] * 1.15 + (1 - dayF) * 0.045, amb[2] * 1.15 + (1 - dayF) * 0.09];
  env.ambSky = amb;
  env.ambGnd = [amb[0] * 0.5 + env.sunCol[0] * 0.04, amb[1] * 0.5 + env.sunCol[1] * 0.035, amb[2] * 0.5 + env.sunCol[2] * 0.03];
  const cl = [env.sunCol[0] * 0.28 + amb[0] * 0.9 + 0.04, env.sunCol[1] * 0.28 + amb[1] * 0.9 + 0.04, env.sunCol[2] * 0.28 + amb[2] * 0.9 + 0.05];
  env.cloudCol = cl;
}
function setEnv(fogDen) {
  f3('uZen', env.zen); f3('uHor', env.hor); f3('uSunDir', env.sunDir); f3('uSunCol', env.sunCol);
  f3('uCloudCol', env.cloudCol); f1('uTime', time); f1('uNight', env.night); f1('uClouds', S.clouds ? 1 : 0);
  f3('uFog', env.fogCol); f1('uFogDen', fogDen);
}

/* ------------------------------------------------------------------ *
 *  Player / input
 * ------------------------------------------------------------------ */
const pl = { x: W / 2 + 0.5, y: 40, z: D / 2 + 0.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: -0.15, ground: false, fly: false };
const keys = {};
let sel = 0, locked = false, time = 0;
const R = 0.3, PH = 1.8, EYE = 1.62;

function spawn() {
  const x = (W / 2) | 0, z = (D / 2) | 0;
  pl.x = x + 0.5; pl.z = z + 0.5; pl.y = topY(x, z) + 1.01; pl.vx = pl.vy = pl.vz = 0;
}
function collides(x, y, z) {
  const y0 = Math.floor(y), y1 = Math.floor(y + PH - 1e-4);
  for (let yy = y0; yy <= y1; yy++) for (let zz = Math.floor(z - R); zz <= Math.floor(z + R); zz++)
    for (let xx = Math.floor(x - R); xx <= Math.floor(x + R); xx++) if (solid(xx, yy, zz)) return true;
  return false;
}
function physics(dt) {
  const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fx; mz += fz; }
  if (keys['KeyS']) { mx -= fx; mz -= fz; }
  if (keys['KeyD']) { mx += rx; mz += rz; }
  if (keys['KeyA']) { mx -= rx; mz -= rz; }
  const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
  const inWater = get(Math.floor(pl.x), Math.floor(pl.y + 0.5), Math.floor(pl.z)) === WATER;
  let speed = pl.fly ? 11 : (keys['ControlLeft'] || keys['ControlRight']) ? 7.2 : 4.6;
  if (inWater && !pl.fly) speed *= 0.6;
  const k = pl.ground || pl.fly ? 14 : 5;
  pl.vx += (mx * speed - pl.vx) * Math.min(1, k * dt);
  pl.vz += (mz * speed - pl.vz) * Math.min(1, k * dt);
  if (pl.fly) {
    const t = (keys['Space'] ? 1 : 0) - ((keys['ShiftLeft'] || keys['ShiftRight']) ? 1 : 0);
    pl.vy += (t * 9 - pl.vy) * Math.min(1, 10 * dt);
  } else if (inWater) {
    pl.vy -= 8 * dt; pl.vy *= 1 - Math.min(1, 3 * dt);
    if (keys['Space']) pl.vy = Math.min(pl.vy + 22 * dt, 3.6);
  } else {
    pl.vy -= 28 * dt;
    if (keys['Space'] && pl.ground) { pl.vy = 8.6; pl.ground = false; }
  }
  pl.vy = Math.max(pl.vy, -50);
  let nx = pl.x + pl.vx * dt; if (collides(nx, pl.y, pl.z)) { pl.vx = 0; nx = pl.x; } pl.x = nx;
  let nz = pl.z + pl.vz * dt; if (collides(pl.x, pl.y, nz)) { pl.vz = 0; nz = pl.z; } pl.z = nz;
  let ny = pl.y + pl.vy * dt;
  pl.ground = false;
  if (collides(pl.x, ny, pl.z)) { if (pl.vy < 0) pl.ground = true; pl.vy = 0; ny = pl.y; }
  pl.y = ny;
  if (pl.y < -20) spawn();
}

function camDirs() {
  const cy = Math.cos(pl.pitch), sy = Math.sin(pl.pitch);
  const fwd = [-Math.sin(pl.yaw) * cy, sy, -Math.cos(pl.yaw) * cy];
  const right = [Math.cos(pl.yaw), 0, -Math.sin(pl.yaw)];
  const up = cross3(right, fwd);
  return { fwd, right, up };
}

function raycast(o, d, maxD) {
  let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
  const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
  const tdx = d[0] !== 0 ? Math.abs(1 / d[0]) : Infinity, tdy = d[1] !== 0 ? Math.abs(1 / d[1]) : Infinity, tdz = d[2] !== 0 ? Math.abs(1 / d[2]) : Infinity;
  let tx = d[0] !== 0 ? (d[0] > 0 ? x + 1 - o[0] : o[0] - x) * tdx : Infinity;
  let ty = d[1] !== 0 ? (d[1] > 0 ? y + 1 - o[1] : o[1] - y) * tdy : Infinity;
  let tz = d[2] !== 0 ? (d[2] > 0 ? z + 1 - o[2] : o[2] - z) * tdz : Infinity;
  let px = x, py = y, pz = z;
  for (let i = 0; i < 80; i++) {
    const b = get(x, y, z);
    if (b !== AIR && b !== WATER) return { x, y, z, px, py, pz };
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { if (tx > maxD) break; x += sx; tx += tdx; }
    else if (ty < tz) { if (ty > maxD) break; y += sy; ty += tdy; }
    else { if (tz > maxD) break; z += sz; tz += tdz; }
  }
  return null;
}
let target = null;

function setBlock(x, y, z, b) {
  if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return;
  blocks[idx(x, y, z)] = b;
  edits.set(idx(x, y, z), b); editsDirty = true;
  markDirty(x, z);
  if ((x & 15) === 0) markDirty(x - 1, z);
  if ((x & 15) === 15) markDirty(x + 1, z);
  if ((z & 15) === 0) markDirty(x, z - 1);
  if ((z & 15) === 15) markDirty(x, z + 1);
}
function breakBlock() {
  if (!target) return;
  const b = get(target.x, target.y, target.z);
  if (b === AIR) return;
  setBlock(target.x, target.y, target.z, AIR);
  // refill with water if sea level neighbour
  if (target.y <= SEA) {
    const nbs = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
    if (nbs.some(n => get(target.x + n[0], target.y + n[1], target.z + n[2]) === WATER)) setBlock(target.x, target.y, target.z, WATER);
  }
}
function placeBlock() {
  if (!target) return;
  const { px, py, pz } = target;
  if (py < 0 || py >= H) return;
  const e = get(px, py, pz);
  if (e !== AIR && e !== WATER) return;
  // don't place inside the player
  const ax0 = pl.x - R, ax1 = pl.x + R, az0 = pl.z - R, az1 = pl.z + R, ay0 = pl.y, ay1 = pl.y + PH;
  if (px + 1 > ax0 && px < ax1 && pz + 1 > az0 && pz < az1 && py + 1 > ay0 && py < ay1) return;
  setBlock(px, py, pz, HOTBAR[sel]);
}

/* UI wiring */
const $ = id => document.getElementById(id);
const menu = $('menu'), hud = $('hud');
function buildHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  HOTBAR.forEach((b, i) => {
    const d = document.createElement('div'); d.className = 'slot'; d.dataset.i = i;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const tile = tileFor(b, b === GRASS ? 1 : 0), tx = (tile % 4) * 16, ty = ((tile / 4) | 0) * 16;
    g.drawImage(atlasCanvas, tx, ty, 16, 16, 0, 0, 16, 16);
    const k = document.createElement('span'); k.textContent = (i + 1) % 10;
    d.appendChild(c); d.appendChild(k);
    d.addEventListener('click', () => { sel = i; refreshHotbar(); });
    hb.appendChild(d);
  });
  refreshHotbar();
}
function refreshHotbar() {
  document.querySelectorAll('.slot').forEach((s, i) => s.classList.toggle('on', i === sel));
  $('blockname').textContent = BLOCK_NAMES[HOTBAR[sel]] || '';
}

function lock() { canvas.requestPointerLock && canvas.requestPointerLock(); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  menu.classList.toggle('hidden', locked);
  hud.classList.toggle('hidden', !locked);
  if (!locked) { for (const k in keys) keys[k] = false; }
});
$('play').addEventListener('click', lock);
canvas.addEventListener('click', () => { if (!locked) lock(); });
document.addEventListener('mousemove', e => {
  if (!locked) return;
  const s = 0.0022 * S.sens;
  pl.yaw -= e.movementX * s;
  pl.pitch = clamp(pl.pitch - e.movementY * s, -1.55, 1.55);
});
document.addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock();
  else if (e.button === 1 && target) { const b = get(target.x, target.y, target.z); const i = HOTBAR.indexOf(b); if (i >= 0) { sel = i; refreshHotbar(); } }
  e.preventDefault();
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => { if (!locked) return; sel = (sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length; refreshHotbar(); }, { passive: true });
let lastSpace = 0;
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!locked) return;
  if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10); sel = (n + 9) % 10; refreshHotbar(); }
  if (e.code === 'KeyF') { pl.fly = !pl.fly; pl.vy = 0; }
  if (e.code === 'Space') { const t = performance.now(); if (t - lastSpace < 280) { pl.fly = !pl.fly; pl.vy = 0; } lastSpace = t; }
  if (e.code === 'KeyR') spawn();
  if (e.code === 'KeyT') { S.autoTime = !S.autoTime; syncUI(); saveSettings(); }
  if (e.code === 'KeyB') { S.bloom = !S.bloom; syncUI(); saveSettings(); }
  if (e.code === 'KeyV') { S.shadows = !S.shadows; syncUI(); saveSettings(); }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
window.addEventListener('resize', resize);

/* settings panel */
const bind = [
  ['s_shadows', 'shadows', 'check'], ['s_bloom', 'bloom', 'check'], ['s_rays', 'rays', 'check'],
  ['s_waves', 'waves', 'check'], ['s_clouds', 'clouds', 'check'], ['s_auto', 'autoTime', 'check'],
  ['s_shres', 'shadowRes', 'int'], ['s_fov', 'fov', 'num'], ['s_exp', 'exposure', 'num'],
  ['s_time', 'time', 'num'], ['s_scale', 'scale', 'num'], ['s_sens', 'sens', 'num']
];
function fmtHour(h) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
function syncUI() {
  bind.forEach(([id, key, type]) => {
    const el = $(id); if (!el) return;
    if (type === 'check') el.checked = !!S[key]; else el.value = S[key];
  });
  $('o_fov').textContent = S.fov + '°'; $('o_exp').textContent = (+S.exposure).toFixed(2);
  $('o_time').textContent = fmtHour(S.time); $('o_scale').textContent = Math.round(S.scale * 100) + '%';
  $('o_sens').textContent = (+S.sens).toFixed(2);
}
bind.forEach(([id, key, type]) => {
  const el = $(id); if (!el) return;
  el.addEventListener('input', () => {
    S[key] = type === 'check' ? el.checked : type === 'int' ? parseInt(el.value, 10) : parseFloat(el.value);
    if (key === 'shadowRes') makeShadow();
    if (key === 'scale') resize();
    syncUI(); saveSettings();
  });
});
$('reset').addEventListener('click', () => { S = Object.assign({}, DEFAULTS); makeShadow(); resize(); syncUI(); saveSettings(); });
$('newworld').addEventListener('click', () => {
  if (!confirm('Generate a new world? Your current builds will be erased.')) return;
  worldSeed = (Math.random() * 1e6) | 0; edits.clear(); editsDirty = true;
  localStorage.setItem('bl_seed', String(worldSeed));
  generate(worldSeed); buildAll(); spawn(); saveEdits();
});
function saveEdits() {
  try { localStorage.setItem('bl_edits', JSON.stringify([...edits])); localStorage.setItem('bl_seed', String(worldSeed)); } catch (e) {}
  editsDirty = false;
}
setInterval(() => { if (editsDirty) saveEdits(); }, 4000);
window.addEventListener('beforeunload', () => { if (editsDirty) saveEdits(); });

/* ------------------------------------------------------------------ *
 *  Render
 * ------------------------------------------------------------------ */
let vpMat = new Float32Array(16), lightVP = new Float32Array(16);

function drawChunks(water) {
  for (let i = 0; i < chunks.length; i++) {
    const m = water ? chunks[i].wt : chunks[i].op;
    if (!m.n) continue;
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
  }
}

function computeLightVP() {
  const ld = env.lightDir, up = Math.abs(ld[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
  const f = [-ld[0], -ld[1], -ld[2]];
  const r = norm3(cross3(f, up)), u = cross3(r, f);
  const half = 62, ts = (half * 2) / SM.size;
  const c = [pl.x, pl.y, pl.z];
  const cx = dot3(c, r), cy = dot3(c, u);
  const sx = Math.round(cx / ts) * ts - cx, sy = Math.round(cy / ts) * ts - cy;
  const sc = [c[0] + r[0] * sx + u[0] * sy, c[1] + r[1] * sx + u[1] * sy, c[2] + r[2] * sx + u[2] * sy];
  const eye = [sc[0] + ld[0] * 130, sc[1] + ld[1] * 130, sc[2] + ld[2] * 130];
  const view = M4.lookAt(eye, sc, up);
  const proj = M4.ortho(-half, half, -half, half, 1, 260);
  lightVP = M4.mul(proj, view);
}

function render() {
  resize();
  const aspect = canvas.width / canvas.height;
  const { fwd, right, up } = camDirs();
  const eye = [pl.x, pl.y + EYE, pl.z];
  const under = get(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2])) === WATER;
  env.fogCol = under ? [0.02, 0.16, 0.22] : env.hor;
  const fogDen = under ? 0.09 : 0.0125;
  const proj = M4.persp(S.fov * Math.PI / 180, aspect, 0.1, 1200);
  const view = M4.lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
  vpMat = M4.mul(proj, view);

  /* shadow pass */
  const doShadow = S.shadows && env.lightCol[0] + env.lightCol[1] + env.lightCol[2] > 0.01;
  if (doShadow) {
    computeLightVP();
    gl.bindFramebuffer(gl.FRAMEBUFFER, SM.fbo);
    gl.viewport(0, 0, SM.size, SM.size);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    use(P.shadow);
    m4('uLightVP', lightVP); f1('uTime', time); f1('uWave', S.waves ? 1 : 0);
    drawChunks(false);
  }

  /* scene pass */
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.sceneFbo);
  gl.viewport(0, 0, T.w, T.h);
  gl.clearColor(0, 0, 0, 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // sky
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
  use(P.sky); setEnv(fogDen);
  f3('uRight', right); f3('uUp', up); f3('uFwd', fwd); f1('uTan', Math.tan(S.fov * Math.PI / 360)); f1('uAsp', aspect);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  const bindCommon = (isWater) => {
    setEnv(fogDen);
    m4('uVP', vpMat); m4('uLightVP', doShadow ? lightVP : new Float32Array(16));
    f1('uWave', S.waves ? 1 : 0); i1('uWater', isWater ? 1 : 0);
    f3('uCam', eye); f3('uLightDir', env.lightDir); f3('uLightCol', env.lightCol);
    f3('uAmbSky', env.ambSky); f3('uAmbGnd', env.ambGnd);
    f1('uShadowOn', doShadow ? 1 : 0); f1('uTexel', 1 / SM.size);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, SM.tex); i1('uShadow', 1);
    gl.activeTexture(gl.TEXTURE0);
  };
  use(P.world); bindCommon(false);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex); i1('uAtlas', 0);
  drawChunks(false);

  // block outline
  if (target) {
    use(P.line); m4('uVP', vpMat); f3('uOff', [target.x, target.y, target.z]);
    gl.bindVertexArray(lineVAO); gl.drawArrays(gl.LINES, 0, 24);
  }

  // water (transparent)
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  use(P.water); bindCommon(true); f1('uWaveAmp', S.waves ? 1 : 0.15);
  drawChunks(true);
  gl.bindVertexArray(ocean.vao); gl.drawElements(gl.TRIANGLES, ocean.n, gl.UNSIGNED_INT, 0);
  gl.depthMask(true); gl.disable(gl.BLEND);

  /* bloom */
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(emptyVAO);
  if (S.bloom) {
    gl.viewport(0, 0, T.bw, T.bh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.b0Fbo);
    use(P.bright); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.sceneTex); i1('uScene', 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    use(P.blur); i1('uTex', 0);
    const radii = [1.6, 3.4];
    for (const r of radii) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.b1Fbo); gl.bindTexture(gl.TEXTURE_2D, T.b0);
      f2('uDir', [r / T.bw, 0]); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.b0Fbo); gl.bindTexture(gl.TEXTURE_2D, T.b1);
      f2('uDir', [0, r / T.bh]); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /* composite to screen */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  use(P.comp);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.sceneTex); i1('uScene', 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.b0); i1('uBloom', 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.depthTex); i1('uDepth', 2);
  gl.activeTexture(gl.TEXTURE0);
  // sun on screen
  const sp = [eye[0] + env.sunDir[0] * 500, eye[1] + env.sunDir[1] * 500, eye[2] + env.sunDir[2] * 500];
  const cx = vpMat[0] * sp[0] + vpMat[4] * sp[1] + vpMat[8] * sp[2] + vpMat[12];
  const cy = vpMat[1] * sp[0] + vpMat[5] * sp[1] + vpMat[9] * sp[2] + vpMat[13];
  const cw = vpMat[3] * sp[0] + vpMat[7] * sp[1] + vpMat[11] * sp[2] + vpMat[15];
  let vis = 0, scr = [0.5, 0.5];
  if (cw > 0.01) {
    const nx = cx / cw, ny = cy / cw;
    scr = [nx * 0.5 + 0.5, ny * 0.5 + 0.5];
    vis = 1 - sm(1.1, 2.0, Math.max(Math.abs(nx), Math.abs(ny)));
    vis *= sm(-0.05, 0.1, env.sunDir[1]);
  }
  if (under) vis = 0;
  f2('uSunScr', scr); f3('uSunCol', env.sunCol); f1('uVis', vis);
  f1('uBloomS', S.bloom ? (0.55 + env.night * 0.25) : 0); f1('uRayS', S.rays ? 0.42 : 0);
  f1('uExp', S.exposure * 0.85); f1('uUnder', under ? 1 : 0); f1('uAsp', aspect); f1('uTime', time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
}

/* ------------------------------------------------------------------ *
 *  Main loop
 * ------------------------------------------------------------------ */
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  time += dt;
  if (S.autoTime) { S.time = (S.time + dt * 0.12) % 24; if ((fpsN & 7) === 0) { $('s_time').value = S.time; $('o_time').textContent = fmtHour(S.time); } }
  if (locked) physics(dt);
  else { pl.yaw += dt * 0.04; }   // slow idle pan behind the menu
  if (locked) {
    const { fwd } = camDirs();
    target = raycast([pl.x, pl.y + EYE, pl.z], fwd, 6);
  } else target = null;
  flushDirty();
  updateEnv();
  render();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    const fps = Math.round(fpsN / fpsAcc);
    $('info').textContent = fps + ' fps   ' + fmtHour(S.time) + '   ' + (pl.fly ? 'flying   ' : '') + Math.floor(pl.x) + ', ' + Math.floor(pl.y) + ', ' + Math.floor(pl.z);
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(frame);
}

/* boot */
generate(worldSeed);
buildAll();
spawn();
pl.y += 0; pl.pitch = -0.12;
makeShadow();
buildHotbar();
syncUI();
resize();
requestAnimationFrame(frame);
})();

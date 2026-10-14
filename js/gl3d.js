/* A small WebGL2 renderer for the 3D bench: matrices, a few solid-modelling primitives
   (rounded box, lathe, swept tube), and a forward renderer with one shadow-casting light,
   image-free reflections, glass, and additive glows. No libraries. */
(function (G) {
'use strict';
const EP = G.EP = G.EP || {};

/* ---------- 4×4 matrices, column-major ---------- */
const M = {
  id() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  chain(...ms) { return ms.reduce(M.mul); },
  tr(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  sc(x, y, z) { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
  rx(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = M.id();
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
  },
  look(e, at, up) {
    const z = V.norm(V.sub(e, at)), x = V.norm(V.cross(up, z)), y = V.cross(z, x), m = M.id();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -V.dot(x, e); m[13] = -V.dot(y, e); m[14] = -V.dot(z, e); return m;
  },
  pt(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
  dir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; },
  /* clip-space position of a world point: [x, y, z, w] */
  proj(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]]; }
};
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};
M.AX = M.rz(-Math.PI / 2);      // turns a part modelled along +Y so that it lies along +X
M.AZ = M.rx(Math.PI / 2);       // … along +Z
M.AZN = M.rx(-Math.PI / 2);     // … along −Z

/* ---------- geometry: {p: positions, n: normals, i: indices, u: distance along (tubes)} ---------- */
/* make every triangle face the way its normals point, whatever order it was written in */
function fix(g) {
  const p = g.p, n = g.n, ix = g.i;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * (n[a] + n[b] + n[c]) + cy * (n[a + 1] + n[b + 1] + n[c + 1]) + cz * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (d < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
  }
  return g;
}
/* a box with softened edges, centred on the origin: 24 corners, each keeping the normal of its face,
   so the narrow bevels shade like a rounded edge */
function rbox(w, h, d, r) {
  const hs = [w / 2, h / 2, d / 2]; r = Math.min(r == null ? 1.2 : r, hs[0] * 0.9, hs[1] * 0.9, hs[2] * 0.9);
  const g = {p: [], n: [], i: []};
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) for (let a = 0; a < 3; a++) {
    const s = [sx, sy, sz], v = [0, 0, 0], nn = [0, 0, 0];
    for (let k = 0; k < 3; k++) v[k] = (k === a ? hs[k] : hs[k] - r) * s[k];
    nn[a] = s[a]; g.p.push(...v); g.n.push(...nn);
  }
  const at = (s, a) => (((s[0] > 0) * 4 + (s[1] > 0) * 2 + (s[2] > 0)) * 3 + a);     // slot of corner s on the face of axis a
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of [-1, 1]) {                                   // faces
      const q = [];
      for (const [sb, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const s = [0, 0, 0]; s[a] = sa; s[b] = sb; s[c] = sc; q.push(at(s, a)); }
      g.i.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    for (const sb of [-1, 1]) for (const sc of [-1, 1]) {         // bevels along axis a
      const s0 = [0, 0, 0], s1 = [0, 0, 0]; s0[a] = -1; s1[a] = 1; s0[b] = s1[b] = sb; s0[c] = s1[c] = sc;
      g.i.push(at(s0, b), at(s1, b), at(s1, c), at(s0, b), at(s1, c), at(s0, c));
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const s = [sx, sy, sz]; g.i.push(at(s, 0), at(s, 1), at(s, 2)); }   // corners
  return fix(g);
}
/* turn a profile [[radius, height, smooth?], …] around the Y axis. List it bottom-centre → outside → top-centre. */
function lathe(prof, seg) {
  seg = seg || 22;
  const g = {p: [], n: [], i: []}, N = prof.length, bn = [];
  for (let k = 0; k < N - 1; k++) { const dr = prof[k + 1][0] - prof[k][0], dy = prof[k + 1][1] - prof[k][1], l = Math.hypot(dr, dy) || 1; bn.push([dy / l, -dr / l]); }
  const nrm = (k, pt) => {                                        // band normal, blended with the neighbour at smooth points
    let a = bn[k], o = null;
    if (prof[pt][2]) o = pt === k ? bn[k - 1] : bn[k + 1];
    if (!o) return a;
    const x = a[0] + o[0], y = a[1] + o[1], l = Math.hypot(x, y) || 1; return [x / l, y / l];
  };
  for (let k = 0; k < N - 1; k++) {
    if (prof[k][0] === 0 && prof[k + 1][0] === 0) continue;
    const base = g.p.length / 3, n0 = nrm(k, k), n1 = nrm(k, k + 1);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      g.p.push(prof[k][0] * c, prof[k][1], prof[k][0] * s, prof[k + 1][0] * c, prof[k + 1][1], prof[k + 1][0] * s);
      g.n.push(n0[0] * c, n0[1], n0[0] * s, n1[0] * c, n1[1], n1[0] * s);
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3;
      if (prof[k][0] > 0) g.i.push(a, c, b);
      if (prof[k + 1][0] > 0) g.i.push(b, c, d);
    }
  }
  return fix(g);
}
/* a solid cylinder standing on y = 0, with slightly broken edges */
function cyl(r, h, seg, ch) { ch = ch == null ? Math.min(0.6, r * 0.25, h * 0.25) : ch; return lathe([[0, 0], [r - ch, 0], [r, ch], [r, h - ch], [r - ch, h], [0, h]], seg); }
/* round off the corners of a polyline */
function smooth(pts, rad, steps) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]]; steps = steps || 5;
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k], a = V.sub(pts[k - 1], p), b = V.sub(pts[k + 1], p), la = V.len(a), lb = V.len(b);
    const r = Math.min(rad, la * 0.45, lb * 0.45);
    if (r < 0.3) { out.push(p); continue; }
    const s = V.add(p, V.mul(a, r / la)), e = V.add(p, V.mul(b, r / lb));
    for (let t = 0; t <= steps; t++) { const u = t / steps, v = 1 - u; out.push([v * v * s[0] + 2 * v * u * p[0] + u * u * e[0], v * v * s[1] + 2 * v * u * p[1] + u * u * e[1], v * v * s[2] + 2 * v * u * p[2] + u * u * e[2]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/* sweep a circle along a path */
function tube(pts, rad, seg, caps) {
  seg = seg || 8;
  const g = {p: [], n: [], i: [], u: []}, P = [];
  for (const p of pts) if (!P.length || V.len(V.sub(p, P[P.length - 1])) > 1e-3) P.push(p);
  if (P.length < 2) return g;
  let nrm = null, u = 0; const rs = [];
  for (let k = 0; k < P.length; k++) {
    const t = V.norm(V.sub(P[Math.min(k + 1, P.length - 1)], P[Math.max(k - 1, 0)]));
    if (!nrm) { nrm = V.cross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]); }
    nrm = V.norm(V.sub(nrm, V.mul(t, V.dot(nrm, t))));
    const b = V.cross(t, nrm);
    if (k) u += V.len(V.sub(P[k], P[k - 1]));
    rs.push(g.p.length / 3);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), d = [nrm[0] * c + b[0] * s, nrm[1] * c + b[1] * s, nrm[2] * c + b[2] * s];
      g.p.push(P[k][0] + d[0] * rad, P[k][1] + d[1] * rad, P[k][2] + d[2] * rad); g.n.push(d[0], d[1], d[2]); g.u.push(u);
    }
    if (k) for (let j = 0; j < seg; j++) { const a = rs[k - 1] + j, c = rs[k] + j; g.i.push(a, c, a + 1, a + 1, c, c + 1); }
    if (caps && (k === 0 || k === P.length - 1)) {
      const base = g.p.length / 3, sg = k ? 1 : -1, ring = rs[k];
      g.p.push(P[k][0], P[k][1], P[k][2]); g.n.push(t[0] * sg, t[1] * sg, t[2] * sg); g.u.push(u);
      for (let j = 0; j <= seg; j++) { const q = ring + j; g.p.push(g.p[q * 3], g.p[q * 3 + 1], g.p[q * 3 + 2]); g.n.push(t[0] * sg, t[1] * sg, t[2] * sg); g.u.push(u); }
      for (let j = 0; j < seg; j++) g.i.push(base, base + 1 + j, base + 2 + j);
    }
  }
  g.len = u;
  return fix(g);
}

/* ---------- colours: written as sRGB hex, lit in linear light ---------- */
function lin(hex) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.pow(v / 255, 2.2);
  return [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)];
}

/* many small solids gathered into one vertex buffer: position, normal, colour, (metal, roughness, distance along) */
class Batch {
  constructor() { this.v = []; this.i = []; this.n = 0; this.min = [1e9, 1e9, 1e9]; this.max = [-1e9, -1e9, -1e9]; }
  add(g, m, col, metal, rough) {
    const c = typeof col === 'string' ? lin(col) : col, base = this.n, np = g.p.length / 3;
    for (let k = 0; k < np; k++) {
      const p = m ? M.pt(m, g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]) : [g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]];
      const n = m ? V.norm(M.dir(m, g.n[k * 3], g.n[k * 3 + 1], g.n[k * 3 + 2])) : [g.n[k * 3], g.n[k * 3 + 1], g.n[k * 3 + 2]];
      this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], metal || 0, rough == null ? 0.5 : rough, g.u ? g.u[k] : 0);
      for (let a = 0; a < 3; a++) { if (p[a] < this.min[a]) this.min[a] = p[a]; if (p[a] > this.max[a]) this.max[a] = p[a]; }
    }
    for (const x of g.i) this.i.push(base + x);
    this.n += np;
    return this;
  }
}

const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in vec3 aM;
uniform mat4 uVP, uModel, uLVP;
out vec3 vW, vN, vC, vM; out vec4 vL;
void main() { vec4 w = uModel * vec4(aP, 1.); vW = w.xyz; vN = mat3(uModel) * aN; vC = aC; vM = aM; vL = uLVP * w; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vC, vM; in vec4 vL;
uniform vec3 uEye, uL, uTint, uEmis, uBg, uSky, uGnd, uFlowCol, uCtr;
uniform float uAlpha, uTime, uFlow, uFlowSpd, uKind, uFade, uShOn;
uniform sampler2DShadow uSh;
out vec4 o;
float shadow() {
  if (uShOn < .5) return 1.;
  vec3 p = vL.xyz / vL.w * .5 + .5;
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1. || p.z > 1.) return 1.;
  float s = 0.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(uSh, vec3(p.xy + vec2(x, y) * (1.4 / 2048.), p.z - .0009));
  return s / 9.;
}
/* a studio without a photograph: a soft gradient and two overhead light panels */
vec3 env(vec3 r, float rough) {
  vec3 c = mix(uGnd, uSky, smoothstep(-.4, .7, r.y));
  float w = rough * .45;
  float b1 = smoothstep(.86 - w, .97, dot(r, normalize(vec3(.3, .9, .35))));
  float b2 = smoothstep(.92 - w, .985, dot(r, normalize(vec3(-.65, .6, -.25))));
  return c + (vec3(2.4) * b1 + vec3(1.1, 1.15, 1.3) * b2) * (1. - rough * .75);
}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uEye - vW);
  vec3 base = vC * uTint; float metal = vM.x, rough = vM.y, ao = 1.;
  if (uKind > .5 && uKind < 1.5) {                 // the slotted aluminium plate: a groove every 50 units
    float top = step(.9, N.y), g = abs(fract(vW.z / 50. + .5) - .5) * 50., gr = (1. - smoothstep(1.5, 2.3, g)) * top;
    float lip = (smoothstep(2.3, 2.9, g) - smoothstep(2.9, 4.4, g)) * top;
    base *= mix(1., .28, gr); base += vec3(.035) * lip; rough = mix(rough, .9, gr);
  } else if (uKind < .5) ao = mix(.5, 1., smoothstep(-1., 14., vW.y));   // parts get darker where they meet the plate
  float sh = shadow(), ndl = max(dot(N, uL), 0.);
  vec3 hemi = mix(uGnd, uSky, N.y * .5 + .5);
  float occ = mix(.42, 1., sh);                    // a shadow also dims what a surface reflects, which is what seats parts on the plate
  vec3 col = base * (1. - metal) * (hemi * .62 * ao * mix(.75, 1., sh) + vec3(1., .96, .9) * 1.15 * ndl * sh);
  vec3 H = normalize(uL + V);
  float sp = pow(max(dot(N, H), 0.), mix(240., 10., rough)) * mix(2.4, .1, rough) * step(0., dot(N, uL));
  vec3 F0 = mix(vec3(.04), base, metal);
  float fr = pow(1. - max(dot(N, V), 0.), 5.);
  vec3 F = F0 + (max(vec3(1. - rough), F0) - F0) * fr;
  col += F * (env(reflect(-V, N), rough) * mix(1., .45, rough) * ao * occ + vec3(1.) * sp * sh);
  col += uEmis;
  if (uFlow > 0.) {                                 // bright beads travelling along a wire or tube
    float s = fract(vM.z * .05 - uTime * uFlowSpd), band = smoothstep(0., .1, s) * (1. - smoothstep(.12, .34, s));
    col += uFlowCol * band * uFlow;
  }
  float a = uAlpha; if (a < 1.) a = clamp(a + fr * .45 + sp * .4, 0., 1.);
  col = (col * (2.51 * col + .03)) / (col * (2.43 * col + .59) + .14);
  col = pow(clamp(col, 0., 1.), vec3(1. / 2.2));
  if (uKind > 1.5) col = mix(col, uBg, smoothstep(.45, 1., length(vW.xz - uCtr.xz) / uFade));   // the table melts into the backdrop
  o = vec4(col, a);
}`;
const DVS = `#version 300 es
layout(location=0) in vec3 aP; uniform mat4 uLVP, uModel; void main() { gl_Position = uLVP * uModel * vec4(aP, 1.); }`;
const DFS = `#version 300 es
precision mediump float; void main() {}`;
const GVS = `#version 300 es
layout(location=0) in vec2 aQ; uniform mat4 uVP; uniform vec3 uPos, uRight, uUp; uniform float uSize; out vec2 vQ;
void main() { vQ = aQ; gl_Position = uVP * vec4(uPos + (uRight * aQ.x + uUp * aQ.y) * uSize, 1.); }`;
const GFS = `#version 300 es
precision mediump float; in vec2 vQ; uniform vec3 uCol; uniform float uK; out vec4 o;
void main() { float d = dot(vQ, vQ); float a = exp(-d * 5.) * .9 + exp(-d * 40.) * .8; o = vec4(uCol * a * uK * (1. - smoothstep(.8, 1., d)), 1.); }`;

/* flat printed markings (lettering, terminal numbers, symbols) cut from one texture sheet */
const TVS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec2 aT; uniform mat4 uVP, uLVP; out vec2 vT; out vec4 vL;
void main() { vT = aT; vL = uLVP * vec4(aP, 1.); gl_Position = uVP * vec4(aP, 1.); }`;
const TFS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec2 vT; in vec4 vL; uniform sampler2D uTex; uniform sampler2DShadow uSh; uniform float uLit; out vec4 o;
void main() {
  vec4 t = texture(uTex, vT); vec3 p = vL.xyz / vL.w * .5 + .5; float s = 1.;
  if (p.x > 0. && p.x < 1. && p.y > 0. && p.y < 1. && p.z < 1.) s = texture(uSh, vec3(p.xy, p.z - .0009));
  o = vec4(t.rgb * mix(.5, 1., s) * uLit, t.a);
}`;

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', {antialias: true, alpha: false, powerPreference: 'high-performance'});
    if (!gl) throw new Error('WebGL2 is not available');
    this.cv = canvas;
    this.main = this.prog(VS, FS); this.depth = this.prog(DVS, DFS); this.glowP = this.prog(GVS, GFS); this.decP = this.prog(TVS, TFS);
    this.tex = gl.createTexture();
    this.SH = 2048;
    this.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.SH, this.SH, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.quad = gl.createVertexArray(); gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  }
  prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return {p, u};
  }
  mesh(b) {
    const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.v), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(b.i), gl.STATIC_DRAW);
    for (let a = 0; a < 4; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 48, a * 12); }
    gl.bindVertexArray(null);
    return {vao, vbo, ibo, count: b.i.length, min: b.min, max: b.max};
  }
  /* upload the sheet all printed markings are cut from */
  atlas(cv) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.activeTexture(gl.TEXTURE0);
  }
  /* quads for markings: x, y, z, u, v per corner */
  dmesh(arr) {
    const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    return {vao, vbo, n: arr.length / 5};
  }
  freeD(m) { const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); }
  free(m) { const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); }
  resize() {
    const dpr = Math.min(this.maxDpr || 2, G.devicePixelRatio || 1), w = Math.max(2, Math.round(this.cv.clientWidth * dpr)), h = Math.max(2, Math.round(this.cv.clientHeight * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
  }
  /* scene: {pieces: [{mesh, model, tint, emis, alpha, kind, flow, layer, hide, noShadow}], glows: [{pos, size, col, k}],
             eye, at, fov, bounds: {min, max}, env: {bg, sky, gnd}, time} */
  render(sc) {
    const gl = this.gl, W = this.cv.width, H = this.cv.height;
    const view = M.look(sc.eye, sc.at, [0, 1, 0]), d = V.len(V.sub(sc.eye, sc.at));
    const vp = this.vp = M.mul(M.persp(sc.fov, W / H, Math.max(4, d * 0.04), d * 6 + 4000), view);
    const L = V.norm([-0.6, 0.9, 0.22]), b = sc.bounds, ctr = V.mul(V.add(b.min, b.max), 0.5), rad = V.len(V.sub(b.max, b.min)) / 2 + 40;
    const lvp = M.mul(M.ortho(-rad, rad, -rad, rad, rad * 0.9, rad * 3.1), M.look(V.add(ctr, V.mul(L, rad * 2)), ctr, [0, 1, 0]));
    const solid = [], glass = [];
    for (const p of sc.pieces) { if (p.hide || !p.mesh.count) continue; if (p.alpha != null && p.alpha < 0.995) { if (p.alpha > 0.004) glass.push(p); } else solid.push(p); }

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    // 1. what the lamp sees
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo); gl.viewport(0, 0, this.SH, this.SH); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depth.p); gl.uniformMatrix4fv(this.depth.u.uLVP, false, lvp);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4); gl.disable(gl.CULL_FACE);
    for (const p of solid) { if (p.noShadow) continue; gl.uniformMatrix4fv(this.depth.u.uModel, false, p.model); gl.bindVertexArray(p.mesh.vao); gl.drawElements(gl.TRIANGLES, p.mesh.count, gl.UNSIGNED_INT, 0); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    // 2. what the eye sees
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(sc.env.bg[0], sc.env.bg[1], sc.env.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const u = this.main.u; gl.useProgram(this.main.p);
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniformMatrix4fv(u.uLVP, false, lvp);
    gl.uniform3fv(u.uEye, sc.eye); gl.uniform3fv(u.uL, L); gl.uniform3fv(u.uBg, sc.env.bg); gl.uniform3fv(u.uSky, sc.env.sky); gl.uniform3fv(u.uGnd, sc.env.gnd);
    gl.uniform3fv(u.uCtr, ctr); gl.uniform1f(u.uFade, rad * 3.2); gl.uniform1f(u.uTime, sc.time); gl.uniform1f(u.uShOn, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(u.uSh, 0);
    const ONE = [1, 1, 1], ZERO = [0, 0, 0];
    const draw = p => {
      gl.uniformMatrix4fv(u.uModel, false, p.model); gl.uniform3fv(u.uTint, p.tint || ONE); gl.uniform3fv(u.uEmis, p.emis || ZERO);
      gl.uniform1f(u.uAlpha, p.alpha == null ? 1 : p.alpha); gl.uniform1f(u.uKind, p.kind || 0);
      const f = p.flow;
      gl.uniform1f(u.uFlow, f ? f.amp : 0); if (f) { gl.uniform1f(u.uFlowSpd, f.spd); gl.uniform3fv(u.uFlowCol, f.col); }
      gl.bindVertexArray(p.mesh.vao); gl.drawElements(gl.TRIANGLES, p.mesh.count, gl.UNSIGNED_INT, 0);
    };
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    for (const p of solid) draw(p);
    if (sc.decals) {                               // printed markings lie on the surfaces drawn so far
      const t = this.decP.u, dc = sc.decals; gl.useProgram(this.decP.p);
      gl.uniformMatrix4fv(t.uVP, false, vp); gl.uniformMatrix4fv(t.uLVP, false, lvp); gl.uniform1i(t.uSh, 0); gl.uniform1f(t.uLit, 0.94);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(t.uTex, 1); gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      if (dc.st) { gl.bindVertexArray(dc.st.vao); gl.drawArrays(gl.TRIANGLES, 0, dc.st.n); }
      if (dc.dy) { gl.bindVertexArray(dc.dy.vao); for (const d of dc.list) if (!d.hide) gl.drawArrays(gl.TRIANGLES, d.first, 6); }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.useProgram(this.main.p);
    }
    // 3. glass and air, far to near
    const dist = p => { const c = M.pt(p.model, (p.mesh.min[0] + p.mesh.max[0]) / 2, (p.mesh.min[1] + p.mesh.max[1]) / 2, (p.mesh.min[2] + p.mesh.max[2]) / 2); return V.len(V.sub(c, sc.eye)); };
    for (const p of glass) p._d = dist(p);
    glass.sort((a, b) => (a.layer || 0) - (b.layer || 0) || b._d - a._d);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    for (const p of glass) draw(p);
    // 4. light that spills: LEDs, lamps, exhaust puffs
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(this.glowP.p); const g = this.glowP.u;
    gl.uniformMatrix4fv(g.uVP, false, vp);
    gl.uniform3f(g.uRight, view[0], view[4], view[8]); gl.uniform3f(g.uUp, view[1], view[5], view[9]);
    gl.bindVertexArray(this.quad);
    for (const s of sc.glows) { if (!(s.k > 0.01)) continue; gl.uniform3fv(g.uPos, s.pos); gl.uniform1f(g.uSize, s.size); gl.uniform3fv(g.uCol, s.col); gl.uniform1f(g.uK, s.k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
}

EP.gl3 = {M, V, rbox, lathe, cyl, smooth, tube, lin, Batch, Renderer};
})(typeof window !== 'undefined' ? window : globalThis);

/* The 3D bench. This window owns no simulation: the main PneuLab window sends the circuit and,
   every frame, the state of each part. Here each 2D symbol becomes a piece of hardware standing
   at the same place on a slotted plate, so the sheet and the bench can be read side by side. */
(function () {
'use strict';
const EP = window.EP, D = EP.defs, {M, V, rbox, lathe, cyl, smooth, tube, lin, Batch, Renderer} = EP.gl3;
const $ = s => document.querySelector(s), T = M.tr;
const main = window.opener || (window.parent !== window ? window.parent : null);      // a second window, or docked inside the main page
const send = m => { try { if (main && !main.closed) main.postMessage(m, '*'); } catch (e) { /* main window gone */ } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- materials: [colour, metal, roughness] ---------- */
const ALU = ['#b9c0ca', 0.9, 0.38], ALUD = ['#7f8793', 0.9, 0.45], STEEL = ['#e3e7ec', 1, 0.16], BRASS = ['#c9a24e', 1, 0.3], COPPER = ['#c5723a', 1, 0.36];
const BLK = ['#1f2227', 0, 0.42], DARK = ['#2b3038', 0, 0.55], HOUSE = ['#3b4252', 0, 0.5], RING = ['#2f6fd0', 0, 0.4], CHROME = ['#dfe3e8', 1, 0.12];
const isCyl = t => t === 'cyl_da' || t === 'cyl_sa', isValve = t => t === 'v52s' || t === 'v52d' || t === 'v32s' || t === 'v53';
const isLs = t => t === 'ls_no' || t === 'ls_nc' || t === 'reed_no', isSens = t => !!D[t].sensor, isDet = t => isLs(t) || isSens(t);
const isProx = t => isSens(t) || !!D[t].reed;       // senses without being touched

const GC = new Map(), geo = (k, f) => { let g = GC.get(k); if (!g) GC.set(k, g = f()); return g; };
const gBox = (w, h, d, r) => geo('b' + [w, h, d, r], () => rbox(w, h, d, r));
const gRod = (r, h, seg, ch) => geo('c' + [r, h, seg, ch], () => cyl(r, h, seg, ch));

/* a collector of solids with shorthand for the shapes used over and over */
class Sol extends Batch {
  box(w, h, d, x, y, z, m, r) { return this.add(gBox(w, h, d, r), T(x, y + h / 2, z), m[0], m[1], m[2]); }       // x, z: centre · y: underside
  cy(r, h, x, y, z, m, seg) { return this.add(gRod(r, h, seg), T(x, y, z), m[0], m[1], m[2]); }                    // stands on (x, y, z)
  cx(r, h, x, y, z, m, seg) { return this.add(gRod(r, h, seg), M.mul(T(x, y, z), M.AX), m[0], m[1], m[2]); }       // runs from x towards +x
  cz(r, h, x, y, z, m, seg) { return this.add(gRod(r, Math.abs(h), seg), M.mul(T(x, y, z), h < 0 ? M.AZN : M.AZ), m[0], m[1], m[2]); }   // from z towards ±z
  g(geom, mat, m) { return this.add(geom, mat, m[0], m[1], m[2]); }
}

/* everything that makes up one built scene */
class World {
  constructor() { this.st = new Sol(); this.pieces = []; this.glows = []; this.tags = []; this.picks = []; this.upd = []; this.coil = {}; this.lsw = {}; this.psw = {}; this.links = [];
    this.sock = {}; this.buses = []; this.claimed = new Set(); this.equip = new Map(); this.dv = []; this.ddv = []; this.dd = []; this.ext = [1e9, 1e9, -1e9, -1e9]; }
  need(name, n) { this.equip.set(name, (this.equip.get(name) || 0) + (n == null ? 1 : n)); }
  dyn(fill, o) { const b = new Sol(); fill(b); const p = Object.assign({batch: b, model: M.id()}, o); this.pieces.push(p); return p; }
  glow(x, y, z, size, col) { const g = {pos: [x, y, z], size, col: lin(col), k: 0}; this.glows.push(g); return g; }
  tag(text, x, y, z, cls) { const t = {text, pos: [x, y, z], cls: cls || ''}; this.tags.push(t); return t; }
  led(x, y, z, col, size) { this.st.cy(1.5, 1.1, x, y, z, ['#3a3d44', 0, 0.3], 10); return this.glow(x, y + 1.4, z, size || 11, col); }
}

let R = null, W = null, S = null, circ = null, sel = null, selPiece = null;
const opt = {bench: true, xray: false, labels: true, links: true, flow: true};
const rest = c => ({c: D[c.type].contact === 'nc', a: false});
const cs = c => (S && S.c && S.c[c.id]) || null;

/* ---------- electrical parts ---------- */
function eBase(c, hh, mat, led) {
  const x = c.x, z = c.y, s = W.st;
  for (const zz of [z, z + 60]) { s.box(22, 8, 13, x, 0, zz, DARK, 1.5); s.cy(3.4, 5, x, 8, zz, BRASS, 14); }
  if (hh) s.box(26, hh, 36, x, 0, z + 30, mat, 2);
  W.picks.push({id: c.id, min: [x - 14, 0, z - 7], max: [x + 14, (hh || 8) + 14, z + 67]});
  if (led) { const g = W.led(x + 8, 8, z + 60, '#ffb347', 10); W.upd.push(() => { g.k = (cs(c) || rest(c)).c ? 0.9 : 0; }); }
}
function mPush(c) {
  const d = D[c.type], x = c.x, z = c.y + 30, nc = d.contact === 'nc';
  eBase(c, 18, HOUSE, true);
  let p, drop;
  if (d.detent && nc) {                           // emergency stop: red mushroom on a yellow ring
    W.st.cy(14, 2.5, x, 18, z, ['#f2c230', 0, 0.45], 28);
    p = W.dyn(b => { b.cy(5, 6, 0, 0, 0, BLK, 14); b.g(geo('mush', () => lathe([[0, 0], [12.5, 0], [13.5, 1.6, 1], [12, 5, 1], [8, 8, 1], [0, 9.2, 1]], 30)), T(0, 5, 0), ['#d5302b', 0, 0.32]); });
    drop = 4;
  } else if (d.detent) {                          // selector switch: a knob that turns and stays
    W.st.cy(11, 2.5, x, 18, z, CHROME, 26);
    p = W.dyn(b => { b.cy(8.5, 6, 0, 0, 0, BLK, 24); b.box(3, 2.4, 14, 0, 5, -2, ['#eceff2', 0, 0.4], 0.8); });
  } else {                                        // pushbutton: green makes, red breaks
    W.st.cy(11, 2.5, x, 18, z, CHROME, 26);
    p = W.dyn(b => b.g(geo('cap', () => lathe([[0, 0], [9, 0], [9, 4.6], [8.2, 6.2, 1], [5, 7.1, 1], [0, 7.4, 1]], 26)), null, [nc ? '#d5302b' : '#2fa860', 0, 0.35]));
    drop = 3.2;
  }
  W.upd.push(() => { const a = (cs(c) || rest(c)).a; p.model = drop ? T(x, 20.5 - (a ? drop : 0), z) : M.mul(T(x, 20.5, z), M.ry(a ? -0.8 : 0.8)); });
  W.picks[W.picks.length - 1].press = c.label;
  W.tag(c.label, x, 36, z);
}
function mLs(c) {
  const x = c.x, z = c.y + 30;
  eBase(c, 13, ['#3f5f8f', 0, 0.5], true);
  const p = W.dyn(b => { b.cy(2, 4, 0, 0, 6, STEEL, 10); b.g(gBox(3, 2, 17, 0.6), M.chain(T(0, 5, 0), M.rx(0.5)), STEEL); b.cx(3.8, 4, -2, 9, -7.2, ['#e6a23c', 0, 0.4], 16); });
  W.upd.push(() => { p.model = T(x, 13 - ((cs(c) || rest(c)).a ? 2.6 : 0), z); });
  W.pickLs = W.pickLs || []; W.pickLs.push({pick: W.picks[W.picks.length - 1], label: c.label});
  W.tag(c.label, x, 30, z); W.links.push({from: [x, 13.5, z - 12], kind: 'lsw', label: c.label, col: '#8e949d'});
}
/* the business end of a proximity sensor, standing on (x, y, z) and looking up: a threaded barrel with a coloured face, or a flat optical head */
const SENS = {ind: ['#2f6fd0', 'Inductive sensor'], cap: ['#e0a21a', 'Capacitive sensor'], opt: ['#c8322c', 'Optical sensor']};
const MATC = {steel: [0.62, 0.65, 0.7], plastic: [0.95, 0.36, 0.1], glass: [0.62, 0.86, 0.95], magnet: [0.8, 0.12, 0.12]};
function sensHead(kind, x, y, z) {
  const s = W.st;
  if (kind === 'opt') s.box(13, 15, 9, x, y, z, BLK, 1.4).box(8, 1, 5, x, y + 15, z, [SENS.opt[0], 0, 0.15], 0.4);
  else s.cy(5.4, 3, x, y, z, ALUD, 6).cy(4.4, 11, x, y + 3, z, CHROME, 18).cy(4.5, 2.6, x, y + 14, z, [SENS[kind][0], 0, 0.4], 18);
}
/* the workpiece that hovers over a sensor while one is held in front of it, in the colour of its material */
function workpiece(c, x, y, z) {
  const p = W.dyn(b => b.box(15, 7, 15, 0, 0, 0, ['#ffffff', 0, 0.4], 1.6));
  p.model = T(x, y, z); p.hide = true;
  W.upd.push(() => { const st = cs(c); p.hide = !(st && st.p); p.tint = MATC[S && S.mat] || MATC.steel; });
}
function mSens(c) {
  const x = c.x, z = c.y, s = W.st;
  for (const [px, pz] of [[x, z], [x, z + 60], [x + 20, z + 60]]) { s.box(16, 8, 13, px, 0, pz, DARK, 1.5); s.cy(3.4, 5, px, 8, pz, BRASS, 14); }
  s.box(26, 12, 30, x, 0, z + 30, HOUSE, 2);
  sensHead(D[c.type].sensor, x, 12, z + 30);
  const g = W.led(x + 9, 12, z + 41, '#ffb347', 11); W.upd.push(() => { const st = cs(c); g.k = st && st.on ? 1 : 0; });
  workpiece(c, x, 33, z + 30);
  const pk = {id: c.id, min: [x - 14, 0, z - 7], max: [x + 28, 30, z + 67]}; W.picks.push(pk);
  W.pickLs = W.pickLs || []; W.pickLs.push({pick: pk, label: c.label});
  W.tag(c.label, x, 44, z + 30); W.links.push({from: [x, 13, z + 17], kind: 'lsw', label: c.label, col: '#8e949d'});
}
function mContact(c) {                            // relay and pressure contacts: a copper blade under a clear cover
  const x = c.x, z = c.y + 30, k = c.type[0] === 'k';
  eBase(c, 7, BLK, true);
  W.st.box(26.6, 1.6, 36.6, x, 3, z, [k ? '#e8890c' : '#12a3a8', 0, 0.5], 1.5);
  W.st.cy(2.2, 9, x, 7, z - 10, BRASS, 12).cy(2.2, 9, x, 7, z + 10, BRASS, 12).cy(1.4, 1, x, 16, z - 10, ['#f1e3b0', 1, 0.2], 10);
  const blade = W.dyn(b => b.box(3.6, 1.1, 22, 0, 0, -10.5, COPPER, 0.4));
  W.dyn(b => b.box(25, 15, 34, x, 7.2, z, ['#dceef6', 0, 0.08], 2.2), {alpha: 0.15, layer: 2, noShadow: true});
  W.upd.push(() => { const st = cs(c) || rest(c); blade.model = M.mul(T(x, 16.6, z + 10), M.rx(st.c ? 0 : 0.42)); blade.emis = st.c ? [0.22, 0.07, 0.01] : null; });
  W.tag(c.label, x, 30, z);
  if (!k) W.links.push({from: [x, 22, z + 14], kind: 'psw', label: c.label, col: '#12868a'});
}
function mRelay(c) {                              // coil, yoke and a hinged armature you can watch pulling in
  const x = c.x, z = c.y + 30, t = c.type;
  eBase(c, 6, BLK);
  const s = W.st;
  s.cy(7.6, 15, x, 6, z + 4, ['#b5652a', 0.75, 0.5], 26).cy(8.8, 1.2, x, 6, z + 4, ['#e8e2d0', 0, 0.6], 26).cy(8.8, 1.2, x, 20, z + 4, ['#e8e2d0', 0, 0.6], 26).cy(3.2, 1.6, x, 21.2, z + 4, STEEL, 14);
  s.box(16, 17.5, 2.4, x, 6, z - 10, ALUD, 0.6);
  const arm = W.dyn(b => b.box(15, 1.5, 25, 0, 0, 12.5, STEEL, 0.5));
  W.dyn(b => b.box(25, 24, 34, x, 6.2, z, ['#dceef6', 0, 0.08], 2.4), {alpha: 0.13, layer: 2, noShadow: true});
  if (t !== 'relay') { s.cy(6.2, 2.4, x, 30.2, z - 2, [t === 'timer' ? '#e8890c' : '#2f6fd0', 0, 0.4], 22); s.box(1.4, 0.8, 5, x, 32.6, z - 4, ['#f4f4f0', 0, 0.4], 0.3); }
  const g = W.led(x + 8, 6, z + 16, '#ff4a3d', 13);
  const tg = W.tag(c.label, x, 42, z);
  W.upd.push(() => {
    const st = cs(c) || {on: false, tm: 0};
    arm.model = M.mul(T(x, 23, z - 9), M.rx(st.on ? 0 : -0.17)); g.k = st.on ? 1 : 0;
    const timing = t === 'timer' ? !st.on && st.tm > 0 : t === 'timer_off' ? st.on && st.tm > 0.02 : false;
    tg.text = c.label + (timing ? '  ' + Math.max(0, c.props.delay - st.tm).toFixed(1) + ' s' : ''); tg.cls = timing ? 'val' : '';
  });
}
function mCounter(c) {
  const x = c.x, z = c.y + 30;
  eBase(c, 22, ['#d5d8dd', 0, 0.5]);
  W.st.box(20, 0.8, 11, x, 22, z - 7, ['#0e1114', 0, 0.2], 0.4).cy(3.6, 3, x + 6, 22, z + 9, BLK, 14);
  const g = W.led(x - 7, 22, z + 9, '#ff4a3d', 12), tg = W.tag('', x, 36, z, 'val');
  W.upd.push(() => { const st = cs(c) || {n: 0}; tg.text = c.label + '  ' + (st.n || 0) + '/' + c.props.preset; g.k = st.on ? 1 : 0; });
}
function mReset(c) {
  eBase(c, 12, ['#c3c7cd', 0, 0.5]);
  W.st.cy(5, 2.2, c.x, 12, c.y + 30, ['#d5302b', 0, 0.4], 18);
  W.tag(c.label + ' reset', c.x, 26, c.y + 30);
}
function mSol(c) {                                // the plug that carries current to a valve coil
  const x = c.x, z = c.y + 30;
  eBase(c, 15, BLK);
  W.st.box(12, 5, 12, x, 15, z, ['#4a4f58', 0, 0.5], 1.2);
  const g = W.led(x + 8, 15, z + 13, '#ff4a3d', 14);
  W.upd.push(() => { const st = cs(c); g.k = st && st.on ? 1 : 0; });
  W.tag(c.label, x, 32, z); W.links.push({from: [x, 20, z], kind: 'coil', label: c.label, col: '#1b1d21'});
}
function mLamp(c) {
  const x = c.x, z = c.y + 30;
  eBase(c, 10, DARK);
  W.st.cy(9.6, 4, x, 10, z, CHROME, 26);
  const lens = W.dyn(b => b.g(geo('lens', () => lathe([[0, 0], [8, 0], [8, 3, 1], [6.6, 7, 1], [3.6, 9.4, 1], [0, 10, 1]], 26)), null, ['#ffffff', 0, 0.25]));
  lens.model = T(x, 13, z);
  const g = W.glow(x, 19, z, 40, '#ffc94a');
  W.upd.push(() => { const st = cs(c), b = st ? Math.min(1, Math.pow(st.v / 24, 2)) : 0; lens.tint = [0.5 + 0.5 * b, 0.36 + 0.44 * b, 0.07 + 0.1 * b]; lens.emis = [2.6 * b, 1.7 * b, 0.3 * b]; g.k = b * 0.75; });
  W.tag(c.label, x, 34, z);
}
function mPsu(c) {
  const x = c.x, z = c.y, w = c.props.w, h = c.props.h, s = W.st, bx = x - 46, bz = z + h / 2;
  for (const zz of [z, z + h]) {
    for (let k = 0; k <= Math.floor(w / 100); k++) s.cy(2.4, 11, x + Math.min(w - 4, 4 + k * 100), 0, zz, BLK, 10);
    s.box(18, 13, 18, x - 16, 0, zz, [zz === z ? '#c8372f' : '#2c5fb8', 0, 0.45], 2).cy(3.4, 2, x - 16, 13, zz, BRASS, 14);
  }
  const plus = W.dyn(b => b.box(w + 12, 3, 7, x + w / 2 - 2, 11, z, ['#ffffff', 0.3, 0.4], 1));
  s.box(w + 12, 3, 7, x + w / 2 - 2, 11, z + h, ['#2c5fb8', 0.3, 0.4], 1);
  s.box(36, 24, 54, bx, 0, bz, ['#2a2e36', 0.2, 0.45], 3);
  for (let k = 0; k < 5; k++) s.box(24, 0.7, 2.2, bx, 24, bz - 20 + k * 5, ['#0e1013', 0, 0.6], 0.3);
  s.box(26, 0.5, 9, bx, 24, bz + 16, ['#e9ecef', 0, 0.5], 0.3);
  const on = W.led(bx - 7, 24.4, bz + 16, '#3ddc6a', 13), trip = W.led(bx + 7, 24.4, bz + 16, '#ff3b30', 16);
  const lead = (zz, col) => s.g(tube(smooth([[bx, 22, bz + (zz < bz ? -22 : 22)], [bx, 30, bz + (zz < bz ? -34 : 34)], [bx + 14, 26, zz], [x - 16, 15, zz]], 12, 6), 1.7, 8, true), null, [col, 0, 0.45]);
  lead(z, '#c8372f'); lead(z + h, '#2c5fb8');
  W.picks.push({id: c.id, min: [bx - 19, 0, bz - 28], max: [bx + 19, 27, bz + 28], psu: true});
  W.tag('+24 V', x - 16, 24, z); W.tag('0 V', x - 16, 24, z + h);
  const tg = W.tag('', bx, 42, bz, 'warn');
  W.upd.push(() => {
    const st = cs(c), live = !!(S && S.on && !(st && st.trip));
    plus.tint = live ? [0.95, 0.1, 0.08] : [0.42, 0.06, 0.05]; plus.emis = live ? [0.5, 0.03, 0.02] : null;
    on.k = live ? 1 : 0; trip.k = st && st.trip ? 0.6 + 0.4 * Math.sin(now * 9) : 0; tg.text = st && st.trip ? 'FUSE TRIPPED · click to reset' : '';
  });
}

/* ---------- pneumatic parts ---------- */
const PH = {cyl_da: 20, cyl_sa: 20, v52s: 13, v52d: 13, v53: 13, v32s: 13, air: 9, fcv: 9, gauge: 9, psw: 9};
/* a push-in fitting: brass stub and blue release ring, ending where the tube plugs in */
function fitting(x, y, z0, z1) { const d = Math.sign(z1 - z0); W.st.cz(3.1, z1 - z0 - d * 2, x, y, z0, BRASS, 14).cz(4, d * 2.4, x, y, z1 - d * 2.4, RING, 16); }

function mCyl(c) {
  const x = c.x, z = c.y + 15, Y = 20, s = W.st, sa = c.type === 'cyl_sa';
  s.box(14, 5, 38, x + 7, 0, z, DARK, 1.2).box(14, 5, 38, x + 113, 0, z, DARK, 1.2);
  for (const fx of [x + 7, x + 113]) s.cy(4.2, 3.4, fx, 5, z + 16.5, FBLUE, 9).cy(4.2, 3.4, fx, 5, z - 16.5, FBLUE, 9);      // blue quick-fix nuts hold it on the plate
  W.need(sa ? 'Single-acting cylinder' : 'Double-acting cylinder');
  s.box(14, 30, 30, x + 7, 5, z, ALU, 2.2).box(14, 30, 30, x + 113, 5, z, ALU, 2.2);
  for (const dy of [-11.5, 11.5]) for (const dz of [-11.5, 11.5]) {            // tie rods and their nuts
    s.cx(1.2, 121, x - 0.5, Y + dy, z + dz, STEEL, 8).cx(2.5, 2.4, x - 2.6, Y + dy, z + dz, ALUD, 6).cx(2.5, 2.4, x + 120.2, Y + dy, z + dz, ALUD, 6);
  }
  s.cx(6.2, 4, x + 120, Y, z, ALUD, 18);
  fitting(x + 10, Y, z + 15, z + 25);
  if (sa) s.cz(2.8, 4, x + 110, Y, z + 15, ['#b08d45', 0.6, 0.8], 12); else fitting(x + 110, Y, z + 15, z + 25);
  const rodP = W.dyn(b => {
    b.cx(12.3, 8, 0, 0, 0, ['#2a2e35', 0.2, 0.45], 28).cx(12.75, 2.2, 2.9, 0, 0, ['#e0792b', 0, 0.5], 28);
    b.cx(4, 114, 8, 0, 0, CHROME, 18).cx(6.5, 6, 116, 0, 0, ALUD, 20);
  });
  const air = () => W.dyn(b => b.g(geo('air', () => cyl(12.4, 1, 26, 0)), null, ['#ffffff', 0, 0.6]), {alpha: 0, layer: 0, noShadow: true, tint: [0.08, 0.62, 0.9]});
  const aA = air(), aB = sa ? null : air();
  W.dyn(b => b.g(geo('barrel', () => lathe([[13, 0], [13, 92]], 30)), M.mul(T(x + 14, Y, z), M.AX), ['#e2f2f8', 0, 0.05]), {alpha: 0.2, layer: 1, noShadow: true});
  const spring = sa ? W.dyn(b => { const p = []; for (let k = 0; k <= 160; k++) { const u = k / 160, a = u * Math.PI * 2 * 8; p.push([u * 84, Math.cos(a) * 8.4, Math.sin(a) * 8.4]); } b.g(tube(p, 1, 6, true), null, STEEL); }) : null;
  const sw = [];
  for (const [lab, off, ext] of [[c.props.markRet, 133, false], [c.props.markExt, 217, true]]) {
    if (!lab) continue;
    const X = x + off, zb = z - 16;
    const all = circ.comps.filter(k => isDet(k.type) && k.label === lab), prox = all.length > 0 && all.every(k => isProx(k.type));
    const ls = opt.bench ? all.filter(k => !W.claimed.has(k.id)) : [];
    if (opt.bench) {                               // the real thing: a switch body with its own sockets, wired straight from the boxes
      const dd = 8 + 11 * Math.max(1, ls.length);
      s.box(32, 14, dd, X, 0, zb + 7 - dd / 2, GREYU, 1.8).box(32.4, 2.2, dd + 0.4, X, 3, zb + 7 - dd / 2, FBLUE, 1);
      ls.forEach((k, i) => isSens(k.type) ? tri(k, X, 14, zb - 6 - 11 * i) : pair(k, D[k.type].contact, D[k.type].contact === 'no' ? ['3', '4'] : ['1', '2'], X - 8, X + 8, 14, zb - 6 - 11 * i));
      W.need(!prox ? 'Limit switch, electrical' : D[all[0].type].reed ? 'Reed switch for a cylinder' : SENS[D[all[0].type].sensor][1]);
    } else s.box(12, 14, 14, X, 0, zb, ['#3f5f8f', 0, 0.5], 1.6);
    // a roller that the rod pushes aside, or, for a sensor, nothing that moves: a reed switch clamped on the barrel, a proximity sensor beside the rod
    const arm = prox ? null : W.dyn(b => { b.cy(1.8, 6.5, 0, 14, 0, STEEL, 10); b.box(3, 2, 8, 0, 18, 3.4, STEEL, 0.6); b.cy(3, 3.6, 0, 18.2, 6.5, ['#e6a23c', 0, 0.4], 16); });
    if (prox) { if (D[all[0].type].reed) s.box(13, 5, 8, x + (ext ? 99 : 21), Y + 12.6, z, BLK, 1.2).box(13.4, 1.2, 8.4, x + (ext ? 99 : 21), Y + 12.2, z, FBLUE, 0.4); else sensHead(D[all[0].type].sensor, X, 14, zb + (opt.bench ? 2 : 0)); }
    sw.push({arm, g: W.led(X + (opt.bench ? 13 : 0), 14, zb + (opt.bench ? 4 : -4), '#ffb347', 12), X, zb, ext});
    (W.lsw[lab] = W.lsw[lab] || []).push([X - 3, 14.5, zb - 3]);
    W.tag(lab, X, 32, zb);
  }
  W.upd.push(() => {
    const st = cs(c) || {f: 0, a: 0, b: 0}, f = clamp(st.f, 0, 1);
    rodP.model = T(x + 14 + 84 * f, Y, z);
    aA.model = M.chain(T(x + 14, Y, z), M.sc(Math.max(0.01, 84 * f), 1, 1), M.AX); aA.alpha = f < 0.005 ? 0 : 0.05 + 0.5 * clamp(st.a / 6, 0, 1);
    if (aB) { aB.model = M.chain(T(x + 22 + 84 * f, Y, z), M.sc(Math.max(0.01, 84 - 84 * f), 1, 1), M.AX); aB.alpha = f > 0.995 ? 0 : 0.05 + 0.5 * clamp(st.b / 6, 0, 1); }
    if (spring) spring.model = M.mul(T(x + 22 + 84 * f, Y, z), M.sc(Math.max(0.03, 1 - f), 1, 1));
    for (const q of sw) { const hit = q.ext ? f >= 0.97 : f <= 0.03; if (q.arm) q.arm.model = T(q.X, 0, q.zb - (hit ? 2 : 0)); q.g.k = hit ? 1 : 0; }
  });
  W.picks.push({id: c.id, min: [x - 3, 0, z - 24], max: [x + 226, 38, z + 27]});
  W.tag(c.label, x + 60, 46, z);
}
function mValve(c) {
  const t = c.type, x = c.x, z = c.y, xl = t === 'v32s' ? -30 : -40, xr = t === 'v32s' ? 30 : t === 'v53' ? 80 : 40, dbl = t === 'v52d' || t === 'v53';
  const cx0 = x + (xl + xr) / 2, w = xr - xl, s = W.st, lands = t === 'v32s' ? 3 : t === 'v53' ? 5 : 4;
  W.need({v52s: '5/2 solenoid valve, spring return', v52d: '5/2 double solenoid valve', v53: '5/3 solenoid valve, closed centre', v32s: '3/2 solenoid valve, normally closed'}[t]);
  const body = W.dyn(b => { b.box(w, 24, 30, 0, 0, 0, ['#aeb6c1', 0.85, 0.4], 2.2); b.box(w - 14, 0.8, 10, 0, 24, 0, ['#22262c', 0, 0.5], 0.4); });
  body.model = T(cx0, 0, z + 15);
  const spool = W.dyn(b => { b.cx(2.3, w - 6, -(w - 6) / 2, 0, 0, STEEL, 12); for (let k = 0; k < lands; k++) b.cx(5.4, 6, -(w - 6) / 2 + 5 + k * (w - 22) / (lands - 1), 0, 0, BRASS, 18); });
  const coil = (cx, lab, key) => {
    s.box(20, 20, 22, cx, 2, z + 15, BLK, 1.8);
    if (opt.bench) { const k = circ.comps.find(q => q.type === 'sol' && q.label === lab && !W.claimed.has(q.id)); pair(k, 'coil', ['', ''], cx - 5.2, cx + 5.2, 22, z + 15, null, true); }
    else s.box(9, 6, 9, cx + (cx < cx0 ? -3 : 3), 22, z + 15, ['#40464f', 0, 0.5], 1);
    const g = W.led(cx + (cx < cx0 ? 5 : -5), 22, z + 8, '#ffd23d', 14);
    const knob = W.dyn(b => b.cy(2.4, 2.6, 0, 0, 0, FBLUE, 12));
    (W.coil[lab] = W.coil[lab] || []).push([cx + (cx < cx0 ? -3 : 3), 28, z + 15]);
    return st => { g.k = st[key] ? 1 : 0; knob.model = T(cx + (cx < cx0 ? 5 : -5), 22 - (st[key === 'a' ? 'mL' : 'mR'] ? 1.5 : 0), z + 22); };
  };
  const cl = coil(x + xl - 10, c.props.y1, 'a'), cr = dbl ? coil(x + xr + 10, c.props.y2, 'b') : null;
  if (!dbl) s.cx(9.6, 12, x + xr, 12, z + 15, ALUD, 24).cx(4, 2, x + xr + 12, 12, z + 15, STEEL, 12);
  for (const p of D[t].ports) { if (p.d === 'u') fitting(x + p.x, 13, z, z - 10); else fitting(x + p.x, 13, z + 30, z + 40); }
  const ex = t === 'v32s' ? [[20, 'e3']] : [[10, 'e5'], [30, 'e3']], puffs = [];
  for (const [ox, key] of ex) { s.cz(3.4, 6, x + ox, 13, z + 30, ['#b08d45', 0.6, 0.8], 12); puffs.push([W.glow(x + ox, 13, z + 42, 30, '#bfe6f2'), key]); }
  W.upd.push(() => {
    const st = cs(c) || {pos: 0};
    spool.model = T(cx0 + (t === 'v53' ? [0, 5, -5][st.pos || 0] : st.pos ? 4 : -4), 12, z + 15); spool.hide = !opt.xray; body.alpha = opt.xray ? 0.2 : 1; body.layer = 2;
    cl(st); if (cr) cr(st);
    for (const [g, key] of puffs) g.k = clamp((st[key] || 0) / 1.2e-3, 0, 1) * (0.55 + 0.25 * Math.sin(now * 31));
  });
  W.picks.push({id: c.id, min: [x + xl - 22, 0, z - 10], max: [x + xr + (dbl ? 22 : 14), 30, z + 40], valve: cx0, dbl});
  W.tag(c.label, cx0, 38, z + 15);
}
function mAir(c) {
  const x = c.x, z = c.y, s = W.st; W.need('Service unit with on/off valve');
  s.box(26, 20, 24, x, 0, z + 24, ['#2f4a6b', 0.1, 0.45], 2.5).cy(8, 11, x, 20, z + 24, BLK, 22).cy(6.6, 1.5, x, 31, z + 24, RING, 20);
  s.cz(8.4, 3, x, 11, z + 36, CHROME, 24).cz(7, 0.5, x, 11, z + 38.8, ['#f6f6f2', 0, 0.6], 24);
  fitting(x, 9, z + 12, z);
  const needle = W.dyn(b => b.box(1, 6.2, 0.6, 0, -0.6, 0, ['#d5302b', 0, 0.4], 0.2)), g = W.led(x + 9, 20, z + 32, '#3ddc6a', 12);
  W.upd.push(() => { const on = !!(S && S.on); needle.model = M.mul(T(x, 11, z + 39.7), M.rz(2.3 - 4.6 * (on ? clamp(c.props.bar / 8, 0, 1) : 0))); g.k = on ? 1 : 0; });
  W.picks.push({id: c.id, min: [x - 14, 0, z - 2], max: [x + 14, 33, z + 40]});
  W.tag(c.props.bar + ' bar', x, 42, z + 24);
}
function mGauge(c) {
  W.need('Pressure gauge');
  const x = c.x, z = c.y, s = W.st, F = M.mul(T(x, 13, z + 8), M.rx(0.95));
  s.box(10, 11, 10, x, 0, z + 9, HOUSE, 1.5);
  s.g(gRod(12.5, 8, 28), F, BLK).g(gRod(13.2, 1.4, 28), M.mul(F, T(0, 7.4, 0)), CHROME).g(gRod(11.4, 0.5, 28, 0), M.mul(F, T(0, 8.5, 0)), ['#f6f6f2', 0, 0.6]);
  s.g(tube(smooth([[x, 9, z + 28], [x, 9, z + 19], [x, 12, z + 13]], 4, 4), 2.6, 9, true), null, BRASS).cz(4, 2.4, x, 9, z + 27.6, RING, 16);
  const needle = W.dyn(b => { b.box(1.1, 0.6, 9.5, 0, 0, -4, ['#d5302b', 0, 0.4], 0.2); b.cy(1.6, 0.9, 0, 0, 0, BLK, 12); });
  const tg = W.tag('', x, 36, z + 4, 'val');
  W.upd.push(() => { const st = cs(c), p = st ? Math.max(0, st.p) : 0; needle.model = M.chain(F, T(0, 9.1, 0), M.ry(2.3 - 4.6 * clamp(p / 8, 0, 1))); tg.text = p.toFixed(1) + ' bar'; });
  W.picks.push({id: c.id, min: [x - 14, 0, z - 6], max: [x + 14, 30, z + 30]});
}
function mPsw(c) {
  const x = c.x, z = c.y, bs = opt.bench ? circ.comps.filter(k => D[k.type].link === 'psw' && k.label === c.label && !W.claimed.has(k.id)) : [];
  if (opt.bench) {
    const dd = 10 + 11 * Math.max(1, bs.length);
    W.st.box(32, 16, dd, x, 0, z + 18 - dd / 2, GREYU, 2).box(32.4, 2.2, dd + 0.4, x, 3, z + 18 - dd / 2, FBLUE, 1);
    bs.forEach((k, i) => pair(k, D[k.type].contact, D[k.type].contact === 'no' ? ['3', '4'] : ['1', '2'], x - 8, x + 8, 16, z + 10 - 11 * i));
  } else W.st.box(18, 16, 20, x, 0, z + 8, ['#2f6f73', 0.1, 0.45], 2);
  W.need('Pressure sensor');
  fitting(x, 9, z + 18, z + 30);
  const g = W.led(x + (opt.bench ? 13 : 0), 16, z + (opt.bench ? 15 : 8), '#ffb347', 15);
  W.upd.push(() => { const st = cs(c); g.k = st && st.on ? 1 : 0; });
  (W.psw[c.label] = W.psw[c.label] || []).push([x - 5, 16.5, z + 2]);
  W.picks.push({id: c.id, min: [x - 10, 0, z - 3], max: [x + 10, 20, z + 30]});
  W.tag(c.label + ' ≥ ' + c.props.set + ' bar', x, 30, z + 8);
}
function mFcv(c) {
  const x = c.x, z = c.y, s = W.st; W.need('One-way flow control valve');
  s.box(14, 16, 26, x, 1, z + 30, ['#9aa3ae', 0.85, 0.4], 1.6);
  fitting(x, 9, z + 17, z); fitting(x, 9, z + 43, z + 60);
  s.cy(5, 2, x, 17, z + 30, BRASS, 6).cy(3.6, 3 + c.props.open * 0.05, x, 19, z + 30, BLK, 14);
  W.picks.push({id: c.id, min: [x - 8, 0, z], max: [x + 8, 26, z + 60]});
  W.tag(Math.round(c.props.open) + ' %', x, 34, z + 30);
}
const MODELS = {psu: mPsu, air: mAir, pb_no: mPush, pb_nc: mPush, sw_no: mPush, sw_nc: mPush, ls_no: mLs, ls_nc: mLs, reed_no: mLs, s_ind: mSens, s_cap: mSens, s_opt: mSens, b_no: mContact, b_nc: mContact, k_no: mContact, k_nc: mContact,
  relay: mRelay, timer: mRelay, timer_off: mRelay, counter: mCounter, counter_r: mReset, sol: mSol, lamp: mLamp, v52s: mValve, v52d: mValve, v53: mValve, v32s: mValve,
  cyl_da: mCyl, cyl_sa: mCyl, fcv: mFcv, gauge: mGauge, psw: mPsw};

/* ---------- the training bench: devices live in the boxes a pneumatics lab really has ----------
   Pushbuttons share a signal input unit, relays a three-fold relay unit, and so on. Every unit carries a red
   +24 V and a blue 0 V bus, fed from the power supply, and each contact of the sheet is a pair of 4 mm sockets. */
const HT = 30, GREYU = ['#d2d5d9', 0, 0.6], FACE = ['#eceef0', 0, 0.55], FBLUE = ['#0091dc', 0, 0.42], SRED = ['#d2232a', 0, 0.4], SBLUE = ['#1e5bb8', 0, 0.4], SBLK = ['#26292e', 0, 0.4];
const INK = '#2b2f36', PXU = 8;
const sheet = {
  cv: null, g: null, map: new Map(), x: 2, y: 2, rowH: 0,
  reset() { if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = 2048; this.g = this.cv.getContext('2d'); } this.g.clearRect(0, 0, 2048, 2048); this.map.clear(); this.x = this.y = 2; this.rowH = 0; },
  /* reserve a patch w × h bench units and paint it once; the same key reuses the same patch */
  slot(key, w, h, draw) {
    let r = this.map.get(key); if (r) return r;
    const pw = Math.ceil(w * PXU), ph = Math.ceil(h * PXU);
    if (this.x + pw > 2044) { this.x = 2; this.y += this.rowH + 3; this.rowH = 0; }
    if (this.y + ph > 2044) return null;
    const g = this.g; g.save(); g.translate(this.x, this.y); g.scale(PXU, PXU); draw(g, w, h); g.restore();
    r = [this.x / 2048, this.y / 2048, (this.x + w * PXU) / 2048, (this.y + h * PXU) / 2048];
    this.x += pw + 3; this.rowH = Math.max(this.rowH, ph); this.map.set(key, r); return r;
  }
};
/* a marking lying flat, centred on (x, z), reading from the front of the bench */
function decal(key, w, h, draw, x, y, z, dyn) {
  const r = sheet.slot(key, w, h, draw); if (!r) return {hide: true};
  const a = dyn ? W.ddv : W.dv, first = a.length / 5, x0 = x - w / 2, x1 = x + w / 2, z0 = z - h / 2, z1 = z + h / 2;
  a.push(x0, y, z0, r[0], r[1], x0, y, z1, r[0], r[3], x1, y, z1, r[2], r[3], x0, y, z0, r[0], r[1], x1, y, z1, r[2], r[3], x1, y, z0, r[2], r[1]);
  const d = {first, hide: false}; if (dyn) W.dd.push(d); return d;
}
function txt(str, x, y, z, size, col, weight) {
  if (!str) return;
  const font = `${weight || 700} ${size}px "Segoe UI", Arial, sans-serif`; sheet.g.font = font;
  const w = sheet.g.measureText(str).width + size * 0.3, h = size * 1.3;
  decal('t|' + font + '|' + col + '|' + str, w, h, g => { g.font = font; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, w / 2, h * 0.54); }, x, y, z);
}
/* the little drawings printed between a pair of sockets */
function symbol(kind, x, y, z, dyn) {
  return decal('s|' + kind, 10, 5, g => {
    const on = kind === 'closed'; g.lineWidth = 0.55; g.lineCap = 'round'; g.strokeStyle = g.fillStyle = on ? '#d9480f' : INK; g.beginPath();
    if (kind === 'coil') { g.moveTo(0.3, 2.5); g.lineTo(2.6, 2.5); g.moveTo(7.4, 2.5); g.lineTo(9.7, 2.5); g.rect(2.6, 0.9, 4.8, 3.2); }
    else { g.moveTo(0.3, 2.5); g.lineTo(3, 2.5); g.moveTo(7, 2.5); g.lineTo(9.7, 2.5); g.moveTo(3, 2.5); g.lineTo(on ? 7 : 6.6, on ? 2.5 : 0.7); }
    g.stroke();
    if (kind !== 'coil') { g.beginPath(); g.arc(3, 2.5, 0.55, 0, 7); g.arc(7, 2.5, 0.55, 0, 7); g.fill(); }
  }, x, y, z, dyn);
}
/* a 4 mm safety socket */
function sock(x, y, z, mat, small) {
  const r = small ? 3 : 3.7;
  W.st.cy(r, 2.4, x, y, z, mat, 16).cy(r * 0.55, 0.3, x, y + 2.4, z, ['#0c0d0f', 0.5, 0.3], 12);
  return {pos: [x, y + 2.6, z], n: 0};
}
/* two sockets that stand for one symbol on the sheet: a contact, or the two ends of a coil */
function pair(c, kind, names, xl, xr, y, z, bus, small) {
  const a = sock(xl, y, z, SBLK, small), b = sock(xr, y, z, SBLK, small); a.bus = b.bus = bus || null;
  if (!small) { txt(names[0], xl, y + 0.12, z - 6.1, 2.9, INK); txt(names[1], xr, y + 0.12, z - 6.1, 2.9, INK); }
  if (c) {
    const P = D[c.type].ports; W.sock[c.id + '.' + P[0].n] = a; W.sock[c.id + '.' + P[1].n] = b; W.claimed.add(c.id);
    W.picks.push({id: c.id, min: [xl - 5, y, z - 5.5], max: [xr + 5, y + 8, z + 5.5]});
  }
  if (small) return;
  if (kind === 'no' || kind === 'nc') {
    const o = symbol('open', (xl + xr) / 2, y + 0.12, z, true), cl = symbol('closed', (xl + xr) / 2, y + 0.12, z, true);
    if (c) W.upd.push(() => { const on = (cs(c) || rest(c)).c; o.hide = on; cl.hide = !on; }); else (kind === 'no' ? cl : o).hide = true;
  } else symbol('coil', (xl + xr) / 2, y + 0.12, z, false);
}
/* the three sockets of a proximity sensor: red for +24 V, black for the signal, blue for 0 V */
function tri(c, x, y, z) {
  const a = sock(x - 10, y, z, SRED, true), o = sock(x, y, z, SBLK, true), n = sock(x + 10, y, z, SBLUE, true);
  W.sock[c.id + '.BN'] = a; W.sock[c.id + '.BK'] = o; W.sock[c.id + '.BU'] = n; W.claimed.add(c.id);
  W.picks.push({id: c.id, min: [x - 14, y, z - 5.5], max: [x + 14, y + 8, z + 5.5]});
}
/* the grey housing every unit shares, with its blue title strip and the two supply buses */
function unitBox(x, z, w, d, title, bus) {
  const s = W.st, cx = x + w / 2, cz = z + d / 2;
  s.box(w, HT - 1, d, cx, 0, cz, GREYU, 2.6).box(w - 3, 1, d - 3, cx, HT - 1, cz, FACE, 0.7).box(w - 3, 1.2, 9, cx, HT - 1, z + 6, FBLUE, 0.5);
  s.box(3, HT - 8, d - 12, x - 0.4, 2, cz, DARK, 1).box(3, HT - 8, d - 12, x + w + 0.4, 2, cz, DARK, 1);
  txt(title, cx, HT + 0.32, z + 6, 4.2, '#ffffff');
  W.ext = [Math.min(W.ext[0], x), Math.min(W.ext[1], z), Math.max(W.ext[2], x + w), Math.max(W.ext[3], z + d)];
  if (!bus) return null;
  const b = {red: [], blue: []};
  const nb = w < 100 ? 2 : 4;
  for (let k = 0; k < nb; k++) { const sx = x + 30 + k * (w - 42) / (nb - 1); b.red.push(sock(sx, HT, z + 19, SRED)); b.blue.push(sock(sx, HT, z + d - 9, SBLUE)); }
  txt('+24 V', x + 13, HT + 0.12, z + 19, 3.4, '#d2232a'); txt('0 V', x + 12, HT + 0.12, z + d - 9, 3.4, '#1e5bb8');
  W.buses.push(b); return b;
}
const CAP = () => geo('cap2', () => lathe([[0, 0], [8.2, 0], [8.2, 3.6], [7.4, 5, 1], [4.5, 5.8, 1], [0, 6, 1]], 26));
/* what sits at the top of one column of a unit */
const HEADS = {
  pb(col, cx, hz) {
    const tint = col.pairs.some(p => p.c && p.kind === 'no') || !col.label ? '#2fa860' : '#d5302b';
    W.st.cy(10.6, 2.2, cx, HT, hz, BLK, 28);
    const p = W.dyn(b => b.g(CAP(), null, [col.label ? tint : '#c9ccd1', 0, 0.35])), g = W.glow(cx, HT + 8, hz, 26, tint);
    p.model = T(cx, HT + 2.2, hz); if (!col.label) return;
    const c0 = col.pairs.find(q => q.c).c;
    W.upd.push(() => { const a = (cs(c0) || rest(c0)).a; p.model = T(cx, HT + 2.2 - (a ? 2.4 : 0), hz); g.k = a ? 0.55 : 0; });
    W.picks.push({id: c0.id, min: [cx - 11, HT, hz - 11], max: [cx + 11, HT + 10, hz + 11], press: col.label});
  },
  latch(col, cx, hz) {                               // stays in when pressed, and lights up
    W.st.cy(10.6, 2.2, cx, HT, hz, BLK, 28);
    const p = W.dyn(b => b.g(CAP(), null, [col.label ? '#2f6fd0' : '#c9ccd1', 0, 0.35])), g = W.glow(cx, HT + 8, hz, 30, '#5aa8ff');
    p.model = T(cx, HT + 2.2, hz); if (!col.label) return;
    const c0 = col.pairs.find(q => q.c).c;
    W.upd.push(() => { const a = (cs(c0) || rest(c0)).a; p.model = T(cx, HT + 2.2 - (a ? 3 : 0), hz); p.emis = a ? [0.05, 0.25, 0.7] : null; g.k = a ? 0.8 : 0; });
    W.picks.push({id: c0.id, min: [cx - 11, HT, hz - 11], max: [cx + 11, HT + 10, hz + 11], press: col.label});
  },
  estop(col, cx, hz) {
    W.st.cy(15, 1.6, cx, HT, hz, ['#f2c230', 0, 0.45], 30);
    const p = W.dyn(b => { b.cy(5, 6, 0, 0, 0, BLK, 14); b.g(geo('mush', () => lathe([[0, 0], [12.5, 0], [13.5, 1.6, 1], [12, 5, 1], [8, 8, 1], [0, 9.2, 1]], 30)), T(0, 5, 0), ['#d5302b', 0, 0.32]); });
    const c0 = col.pairs.find(q => q.c).c;
    W.upd.push(() => { p.model = T(cx, HT + 1.6 - ((cs(c0) || rest(c0)).a ? 4 : 0), hz); });
    W.picks.push({id: c0.id, min: [cx - 14, HT, hz - 14], max: [cx + 14, HT + 18, hz + 14], press: col.label});
  },
  relay(col, cx, hz) {                               // a window on to the relay itself: coil, yoke and armature
    const s = W.st, c = col.main, t = c ? c.type : col.kind;
    s.box(26, 1.6, 22, cx, HT, hz, BLK, 1).cy(5.8, 9, cx, HT + 1.6, hz + 3, ['#b5652a', 0.75, 0.5], 22).cy(6.6, 0.9, cx, HT + 10.6, hz + 3, ['#e8e2d0', 0, 0.6], 22).box(13, 11, 2, cx, HT + 1.6, hz - 8, ALUD, 0.5);
    const arm = W.dyn(b => b.box(12, 1.2, 17, 0, 0, 8.5, STEEL, 0.4));
    W.dyn(b => b.box(25, 14.5, 21, cx, HT + 1.4, hz, ['#dceef6', 0, 0.08], 2), {alpha: 0.14, layer: 2, noShadow: true});
    arm.model = M.mul(T(cx, HT + 12.4, hz - 8), M.rx(-0.2));
    if (t !== 'relay') { s.cy(5, 2.6, cx - 15.5, HT, hz + 6, BLK, 18).box(1.2, 0.8, 4, cx - 15.5, HT + 2.6, hz + 4.6, [t === 'timer' ? '#e8890c' : '#2f9be0', 0, 0.4], 0.3); txt(t === 'timer' ? 'on' : 'off', cx - 15.5, HT + 0.12, hz - 3.4, 2.8, INK); }
    const g = W.led(cx + 16.5, HT, hz - 7, '#ffd23d', 13); if (!c) return;
    const tg = W.tag(c.label, cx, HT + 24, hz);
    W.upd.push(() => {
      const st = cs(c) || {on: false, tm: 0}; arm.model = M.mul(T(cx, HT + 12.4, hz - 8), M.rx(st.on ? 0 : -0.2)); g.k = st.on ? 1 : 0;
      const timing = t === 'timer' ? !st.on && st.tm > 0 : t === 'timer_off' ? st.on && st.tm > 0.02 : false;
      tg.text = c.label + (timing ? '  ' + Math.max(0, c.props.delay - st.tm).toFixed(1) + ' s' : ''); tg.cls = timing ? 'val' : '';
    });
  },
  counter(col, cx, hz) {
    const c = col.main; W.st.box(34, 2, 15, cx, HT, hz - 2, ['#0e1114', 0, 0.2], 1).cy(3.4, 2.6, cx + 12, HT, hz + 12, BLK, 14);
    const g = W.led(cx - 12, HT, hz + 12, '#ffd23d', 12), tg = W.tag('', cx, HT + 20, hz, 'val');
    W.upd.push(() => { const st = cs(c) || {n: 0}; tg.text = c.label + '  ' + (st.n || 0) + '/' + c.props.preset; g.k = st.on ? 1 : 0; });
  },
  lamp(col, cx, hz) {
    const c = col.main; W.st.cy(9.2, 3, cx, HT, hz, CHROME, 26);
    const lens = W.dyn(b => b.g(geo('lens', () => lathe([[0, 0], [8, 0], [8, 3, 1], [6.6, 7, 1], [3.6, 9.4, 1], [0, 10, 1]], 26)), null, ['#ffffff', 0, 0.25]));
    lens.model = T(cx, HT + 2, hz); lens.tint = [0.5, 0.36, 0.07]; if (!c) return;
    const g = W.glow(cx, HT + 9, hz, 40, '#ffc94a');
    W.upd.push(() => { const st = cs(c), b = st ? Math.min(1, Math.pow(st.v / 24, 2)) : 0; lens.tint = [0.5 + 0.5 * b, 0.36 + 0.44 * b, 0.07 + 0.1 * b]; lens.emis = [2.6 * b, 1.7 * b, 0.3 * b]; g.k = b * 0.75; });
    W.tag(c.label, cx, HT + 22, hz);
  },
  ls(col, cx, hz) {                                  // a limit switch that is not mounted on any cylinder: press its roller by hand
    const c = col.main, p = W.dyn(b => { b.cy(2, 4, 0, 0, 6, STEEL, 10); b.g(gBox(3, 2, 17, 0.6), M.chain(T(0, 5, 0), M.rx(0.5)), STEEL); b.cx(3.8, 4, -2, 9, -7.2, ['#e6a23c', 0, 0.4], 16); });
    W.upd.push(() => { p.model = T(cx, HT - ((cs(c) || rest(c)).a ? 2.6 : 0), hz); });
    W.picks.push({id: c.id, min: [cx - 10, HT, hz - 12], max: [cx + 10, HT + 14, hz + 10], press: c.label});
  },
  sens(col, cx, hz) {                                // a proximity sensor on a bracket, looking up at whatever is held over it
    const c = col.main; sensHead(D[c.type].sensor, cx, HT, hz);
    const g = W.led(cx + 13, HT, hz + 9, '#ffb347', 12); W.upd.push(() => { const st = cs(c); g.k = st && st.on ? 1 : 0; });
    workpiece(c, cx, HT + 21, hz);
    W.picks.push({id: c.id, min: [cx - 10, HT, hz - 10], max: [cx + 10, HT + 22, hz + 10], press: c.label});
  },
  reed(col, cx, hz) {                                // a reed switch off its cylinder: hold a magnet to it
    const c = col.main; W.st.box(9, 6, 18, cx, HT, hz, BLK, 1.4).box(9.4, 1.4, 4, cx, HT + 2.4, hz + 5, FBLUE, 0.4);
    W.picks.push({id: c.id, min: [cx - 8, HT, hz - 11], max: [cx + 8, HT + 10, hz + 11], press: c.label});
  },
  sol(col, cx, hz) { const c = col.main, g = W.led(cx, HT, hz, '#ffd23d', 16); W.st.box(20, 7, 16, cx, HT, hz + 1, BLK, 1.5); W.upd.push(() => { const st = cs(c); g.k = st && st.on ? 1 : 0; }); },
  reset(col, cx, hz) { W.st.cy(6, 2.4, cx, HT, hz, ['#d5302b', 0, 0.4], 18); },
  contact() {}
};
/* a unit: a row of columns, each with a head and some socket pairs below it */
function unit(x, z, u) {
  const n = u.cols.length, rows = Math.max(...u.cols.map(c => c.tri ? 1 : c.pairs.length)), d = 68 + rows * 13 + (u.bus ? 14 : 4), cw = (u.w - 12) / n;
  const bus = unitBox(x, z, u.w, d, u.name, u.bus);
  u.cols.forEach((col, i) => {
    const cx = x + 6 + cw * (i + 0.5), hz = z + 43 - (u.bus ? 0 : 8);
    HEADS[col.kind === 'timer' || col.kind === 'timer_off' ? 'relay' : col.kind](col, cx, hz);
    if (col.label && !['relay', 'timer', 'timer_off', 'counter', 'lamp'].includes(col.kind)) W.tag(col.label, cx, HT + 20, hz);
    if (col.label) txt(col.label, cx, HT + 0.12, hz + 14.5, 3.6, INK);
    if (col.tri) { const zz = z + 70 - (u.bus ? 0 : 8); tri(col.main, cx, HT, zz); [['BN', -10], ['BK', 0], ['BU', 10]].forEach(q => txt(q[0], cx + q[1], HT + 0.12, zz - 5.8, 2.5, INK)); }
    col.pairs.forEach((p, k) => pair(p.c, p.kind, p.names, cx - 10, cx + 10, HT, z + 70 - (u.bus ? 0 : 8) + k * 13, bus));
  });
  W.need(u.name);
  return d;
}
function benchPsu(x, z, c) {
  const w = 104, d = 100, s = W.st;
  unitBox(x, z, w, d, 'Power supply', false);
  const b = {red: [sock(x + 24, HT, z + 34, SRED), sock(x + 42, HT, z + 34, SRED)], blue: [sock(x + 24, HT, z + 56, SBLUE), sock(x + 42, HT, z + 56, SBLUE)]};
  txt('+24 V', x + 33, HT + 0.12, z + 25, 3.6, '#d2232a'); txt('0 V', x + 33, HT + 0.12, z + 47, 3.6, '#1e5bb8'); txt('24 V DC · 4.5 A', x + w / 2, HT + 0.12, z + 86, 4, INK); txt('I / O', x + 78, HT + 0.12, z + 25, 3, INK);
  s.box(16, 2, 24, x + 78, HT, z + 44, BLK, 1);
  const rocker = W.dyn(bb => bb.box(12, 3.4, 20, 0, 0, 0, ['#ffffff', 0, 0.35], 1)), on = W.led(x + 70, HT, z + 68, '#3ddc6a', 14), trip = W.led(x + 86, HT, z + 68, '#ff3b30', 16);
  const tg = W.tag('', x + w / 2, HT + 26, z + 50, 'warn');
  W.upd.push(() => {
    const st = cs(c), live = !!(S && S.on && !(st && st.trip));
    rocker.model = M.mul(T(x + 78, HT + 1.6, z + 44), M.rx(live ? 0.13 : -0.13)); rocker.tint = live ? [0.12, 0.75, 0.3] : [0.16, 0.18, 0.2]; rocker.emis = live ? [0.02, 0.35, 0.08] : null;
    on.k = live ? 1 : 0; trip.k = st && st.trip ? 0.6 + 0.4 * Math.sin(now * 9) : 0; tg.text = st && st.trip ? 'FUSE TRIPPED · click to reset' : '';
  });
  W.picks.push({id: c.id, min: [x, 0, z], max: [x + w, HT + 6, z + d], psu: true});
  W.need('Power supply unit, 24 V'); W.psuBus = b;
  return [w, d];
}
/* sort the electrical side of the sheet into units and stand them on the plate, right of the pneumatics */
function bench(ex0, ez0) {
  const E = circ.comps.filter(c => D[c.type].cat === 'e' && !W.claimed.has(c.id)), of = f => E.filter(f), units = [];
  const nm = (kind, i) => kind === 'no' ? [(i + 1) + '3', (i + 1) + '4'] : [(i + 1) + '1', (i + 1) + '2'];
  const rows = (cs2, min) => {                       // socket pairs for a list of contacts, made up to what the real unit offers
    const p = cs2.slice().sort((a, b) => (D[a.type].contact === 'nc') - (D[b.type].contact === 'nc')).map(c => ({c, kind: D[c.type].contact}));
    while (p.length < (min == null ? 2 : min)) p.push({c: null, kind: p.some(q => q.kind === 'no') ? 'nc' : 'no'});
    p.sort((a, b) => (a.kind === 'nc') - (b.kind === 'nc')); p.forEach((q, i) => { q.names = nm(q.kind, i); }); return p;
  };
  const blank = kind => ({label: null, kind, main: null, pairs: kind === 'lamp' ? [{c: null, kind: 'coil', names: ['X1', 'X2']}] : [...(kind === 'pb' || kind === 'latch' ? [] : [{c: null, kind: 'coil', names: ['A1', 'A2']}]), ...rows([])]});
  // pushbuttons and switches, grouped by label: one actuator, several contact blocks
  const groups = new Map(); for (const c of of(c => D[c.type].act === 'push')) { if (!groups.has(c.label)) groups.set(c.label, []); groups.get(c.label).push(c); }
  const mom = [], lat = [], est = [];
  for (const [label, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0], undefined, {numeric: true}))) {
    const col = {label, pairs: rows(g), kind: g.some(c => c.type === 'sw_nc') ? 'estop' : D[g[0].type].detent ? 'latch' : 'pb'};
    (col.kind === 'estop' ? est : col.kind === 'latch' ? lat : mom).push(col);
  }
  for (let i = 0; i < Math.max(Math.ceil(mom.length / 2), lat.length); i++) units.push({name: 'Signal input', w: 150, bus: true, cols: [mom[2 * i] || blank('pb'), mom[2 * i + 1] || blank('pb'), lat[i] || blank('latch')]});
  for (const col of est) units.push({name: 'Emergency stop', w: 66, bus: true, cols: [col]});
  // relays, timers and counters with the contacts that carry their label
  const kc = l => of(c => D[c.type].link === 'relay' && c.label === l), coilCol = c => ({label: c.label, kind: c.type, main: c, pairs: [{c, kind: 'coil', names: ['A1', 'A2']}, ...rows(kc(c.label))]});
  const rel = of(c => c.type === 'relay').map(coilCol), ton = of(c => c.type === 'timer').map(coilCol), tof = of(c => c.type === 'timer_off').map(coilCol);
  for (let i = 0; i < rel.length; i += 3) units.push({name: 'Relay, three-fold', w: 150, bus: true, cols: [rel[i], rel[i + 1] || blank('relay'), rel[i + 2] || blank('relay')]});
  for (let i = 0; i < Math.max(ton.length, tof.length); i++) units.push({name: 'Time relay, two-fold', w: 126, bus: true, cols: [ton[i] || blank('timer'), tof[i] || blank('timer_off')]});
  for (const c of of(c => c.type === 'counter')) {
    const r = of(q => q.type === 'counter_r' && q.label === c.label)[0] || null;
    units.push({name: 'Preset counter', w: 80, bus: true, cols: [{label: c.label, kind: 'counter', main: c, pairs: [{c, kind: 'coil', names: ['A1', 'A2']}, {c: r, kind: 'coil', names: ['R1', 'R2']}, ...rows(kc(c.label), 1)]}]});
    if (r) W.claimed.add(r.id);
  }
  const lamps = of(c => c.type === 'lamp').map(c => ({label: c.label, kind: 'lamp', main: c, pairs: [{c, kind: 'coil', names: ['X1', 'X2']}]}));
  for (let i = 0; i < lamps.length; i += 4) units.push({name: 'Indicator unit', w: 172, bus: true, cols: [0, 1, 2, 3].map(k => lamps[i + k] || blank('lamp'))});
  // stand the units in rows
  let ux = ex0, uz = ez0, rowD = 0; const lim = ex0 + 560, place = (w, f) => { if (ux > ex0 && ux + w > lim) { ux = ex0; uz += rowD + 22; rowD = 0; } const d = f(ux, uz); ux += w + 20; rowD = Math.max(rowD, d); };
  const psu = circ.comps.find(c => c.type === 'psu');
  if (psu) place(104, (x, z) => benchPsu(x, z, psu)[1]);
  for (const u of units) { u.cols.forEach(col => col.pairs.forEach(p => { if (p.c) W.claimed.add(p.c.id); })); place(u.w, (x, z) => unit(x, z, u)); }
  // whatever belongs to no unit (a contact without its relay, a coil without its valve) gets a small module of its own
  for (const c of circ.comps) {
    if (D[c.type].cat !== 'e' || c.type === 'psu' || W.claimed.has(c.id)) continue;
    if (isSens(c.type)) { place(58, (x, z) => unit(x, z, {name: SENS[D[c.type].sensor][1], w: 58, bus: false, cols: [{label: c.label, kind: 'sens', main: c, pairs: [], tri: true}]})); continue; }
    const d = D[c.type], kind = d.reed ? 'reed' : isLs(c.type) ? 'ls' : c.type === 'sol' ? 'sol' : c.type === 'counter_r' ? 'reset' : 'contact';
    const names = d.contact ? (d.contact === 'no' ? ['3', '4'] : ['1', '2']) : [d.ports[0].n.toUpperCase(), d.ports[1].n.toUpperCase()];
    place(58, (x, z) => unit(x, z, {name: d.reed ? 'Reed switch' : isLs(c.type) ? 'Limit switch' : c.type === 'sol' ? 'Solenoid' : 'Contact', w: 58, bus: false, cols: [{label: c.label, kind, main: c, pairs: [{c, kind: d.contact || 'coil', names}]}]}));
  }
}
/* lab leads: a stackable plug at each end and a cable that arches between them */
const LEAD = {red: '#d2232a', blue: '#1e5bb8', black: '#25282d'};
function lead(a, b, colName, wid, idx, feeder) {
  const col = LEAD[colName], pa = [a.pos[0], a.pos[1] + a.n * 9.4, a.pos[2]], pb = [b.pos[0], b.pos[1] + b.n * 9.4, b.pos[2]]; a.n++; b.n++;
  for (const p of [pa, pb]) W.st.cy(3.15, 9.2, p[0], p[1] - 0.4, p[2], [col, 0, 0.4], 14).cy(3.5, 1.6, p[0], p[1] + 6, p[2], [col, 0, 0.5], 14);
  let dx = pb[0] - pa[0], dz = pb[2] - pa[2]; const dh = Math.hypot(dx, dz) || 1; dx /= dh; dz /= dh;
  const s0 = [pa[0] + dx * 3.2, pa[1] + 6.8, pa[2] + dz * 3.2], s1 = [pb[0] - dx * 3.2, pb[1] + 6.8, pb[2] - dz * 3.2], d = V.len(V.sub(s1, s0));
  const h = clamp(5 + d * 0.15, 8, 46), off = ((idx % 3) - 1) * Math.min(9, d * 0.08), k = Math.min(d * 0.22, 30);
  const c0 = [s0[0] + dx * k - dz * off, s0[1] + h, s0[2] + dz * k + dx * off], c1 = [s1[0] - dx * k - dz * off, s1[1] + h, s1[2] - dz * k + dx * off], path = [];
  for (let i = 0; i <= 22; i++) { const u = i / 22, w = 1 - u, f = [w * w * w, 3 * w * w * u, 3 * w * u * u, u * u * u]; path.push([0, 1, 2].map(q => f[0] * s0[q] + f[1] * c0[q] + f[2] * c1[q] + f[3] * s1[q])); }
  const p = W.dyn(bb => bb.g(tube(path, 1.3, 7, true), null, [col, 0, 0.45]));
  W.need('Lab lead, ' + colName);
  W.upd.push(() => {
    const st = wid && S && S.w && S.w[wid], v = feeder ? (S && S.on && colName === 'red' ? 24 : 0) : st ? st[0] : 0, i = st ? st[1] : 0;
    p.emis = v > 20 ? (colName === 'black' ? [0.42, 0.03, 0.02] : [0.3, 0.02, 0.01]) : v > 3 ? [0.26, 0.11, 0.01] : null;
    p.flow = opt.flow && Math.abs(i) > 0.002 ? {amp: 1.1, spd: Math.sign(i) * 1.5, col: [1, 0.86, 0.66]} : null;
  });
}
function leads(byId) {
  const par = new Map(), root = k => { if (!par.has(k)) par.set(k, k); let r = k; while (par.get(r) !== r) r = par.get(r); par.set(k, r); return r; }, key = e => e.c + '.' + e.p;
  const ew = circ.wires.filter(w => w.k === 'e' && byId.get(w.a.c) && byId.get(w.b.c));
  for (const w of ew) par.set(root(key(w.a)), root(key(w.b)));
  const psu = circ.comps.find(c => c.type === 'psu'), rp = psu && root(psu.id + '.pos'), rn = psu && root(psu.id + '.neg');
  const busFor = (t, k) => { let best = null, bd = 1e9; for (const b of (t && t.bus ? [t.bus] : W.buses.concat(W.psuBus || []))) for (const s of b[k]) { const d = (t ? V.len(V.sub(s.pos, t.pos)) : 0) + s.n * 400; if (d < bd) { bd = d; best = s; } } return best; };
  if (W.psuBus) { let pr = W.psuBus; W.buses.forEach((b, i) => { lead(pr.red[pr.red.length - 1], b.red[0], 'red', null, i, true); lead(pr.blue[pr.blue.length - 1], b.blue[0], 'blue', null, i + 1, true); pr = b; }); }
  ew.forEach((w, i) => {
    const A = byId.get(w.a.c), B = byId.get(w.b.c), k = e => e.p === 'pos' ? 'red' : 'blue';
    let sa = A.type === 'psu' ? null : W.sock[key(w.a)], sb = B.type === 'psu' ? null : W.sock[key(w.b)];
    if (A.type === 'psu' && B.type === 'psu') { if (!W.psuBus) return; sa = W.psuBus[k(w.a)][0]; sb = W.psuBus[k(w.b)][1]; }
    else if (A.type === 'psu') sa = sb && busFor(sb, k(w.a)); else if (B.type === 'psu') sb = sa && busFor(sa, k(w.b));
    if (!sa || !sb || sa === sb) return;
    const r = root(key(w.a)); lead(sa, sb, r === rp ? 'red' : r === rn ? 'blue' : 'black', w.id, i, false);
  });
}

/* ---------- wires and tubes: the same routes as on the sheet, lifted off the plate ---------- */
const IDLE = lin('#4b525d'), LIVE = lin('#e5382f'), HALF = lin('#f09a2a'), SLACK = lin('#8f9aa8'), FULL = lin('#12a9d1');
function mWires(byId) {
  circ.wires.forEach((w, wi) => {
    const pts = EP.wirePts(byId, w), A = byId.get(w.a.c), B = byId.get(w.b.c); if (!pts || pts.length < 2) return;
    const n = pts.length, first = pts[0], last = pts[n - 1];
    if (w.k === 'e' && opt.bench) return;
    if (w.k === 'p') W.need('Plastic tubing, pieces');
    if (w.k === 'e') {
      const h = 21 + (wi % 5) * 2.2, ya = A.type === 'psu' ? 14 : 13, yb = B.type === 'psu' ? 14 : 13;
      const path = smooth([[first[0], ya + 5, first[1]], ...pts.map(p => [p[0], h, p[1]]), [last[0], yb + 5, last[1]]], 4.5, 4);
      W.st.cy(2.3, 6.5, first[0], ya, first[1], BLK, 12).cy(2.3, 6.5, last[0], yb, last[1], BLK, 12);
      const p = W.dyn(b => b.g(tube(path, 1.3, 7), null, ['#ffffff', 0, 0.45]));
      W.upd.push(() => {
        const st = S && S.w && S.w[w.id], v = st ? st[0] : 0, i = st ? st[1] : 0;
        p.tint = v > 20 ? LIVE : v > 3 ? HALF : IDLE; p.emis = v > 20 ? [0.3, 0.02, 0.01] : v > 3 ? [0.22, 0.09, 0.01] : null;
        p.flow = opt.flow && Math.abs(i) > 0.002 ? {amp: 1.1, spd: Math.sign(i) * 1.5, col: [1, 0.82, 0.6]} : null;
      });
    } else {
      const ha = PH[A.type] || 9, hb = PH[B.type] || 9, ht = 6.5, path = [[first[0], ha, first[1]]];
      const stub = (p, q, y) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d > 20) path.push([p[0] + (q[0] - p[0]) / d * 9, y, p[1] + (q[1] - p[1]) / d * 9]); };
      stub(first, pts[1], ha);
      for (let k = 1; k < n - 1; k++) path.push([pts[k][0], ht, pts[k][1]]);
      stub(last, pts[n - 2], hb); path.push([last[0], hb, last[1]]);
      const p = W.dyn(b => b.g(tube(smooth(path, 8, 5), 2.5, 10), null, ['#ffffff', 0, 0.3]));
      W.upd.push(() => {
        const st = S && S.w && S.w[w.id], pr = st ? clamp(st[0] / 6, 0, 1) : 0, q = st ? st[1] : 0;
        p.tint = V.lerp(SLACK, FULL, pr); p.emis = pr > 0.05 ? [0, 0.05 * pr, 0.09 * pr] : null;
        p.flow = opt.flow && Math.abs(q) > 3e-5 ? {amp: 1.1, spd: Math.sign(q) * clamp(Math.abs(q) * 2500, 0.7, 3.2), col: [0.75, 0.97, 1]} : null;
      });
    }
  });
}
/* thin cables that tie the two halves of one device together: coil plug ↔ valve, contact ↔ switch or sensor */
function mLinks() {
  for (const l of W.links) for (const to of (W[l.kind][l.label] || [])) {
    const a = l.from, d = V.len(V.sub(to, a)), mid = [(a[0] + to[0]) / 2, Math.max(a[1], to[1]) + 16 + d * 0.11, (a[2] + to[2]) / 2], path = [];
    for (let k = 0; k <= 18; k++) { const u = k / 18, v = 1 - u; path.push([v * v * a[0] + 2 * v * u * mid[0] + u * u * to[0], v * v * a[1] + 2 * v * u * mid[1] + u * u * to[1], v * v * a[2] + 2 * v * u * mid[2] + u * u * to[2]]); }
    const p = W.dyn(b => b.g(tube(path, 0.8, 6, true), null, [l.col, 0, 0.5]), {link: true});
    W.upd.push(() => { p.hide = !opt.links; });
  }
}

/* ---------- building a scene from a circuit ---------- */
const THEME = {
  dark: {bg: [0.071, 0.086, 0.114], sky: lin('#b9c4d6'), gnd: lin('#3b4049'), table: '#2a303b', plate: '#8b93a0'},
  light: {bg: [0.925, 0.91, 0.88], sky: lin('#ffffff'), gnd: lin('#8f8a80'), table: '#cdc6b8', plate: '#b6bcc5'}
};
let theme = 'dark';
function dispose() { if (!W) return; for (const p of W.pieces) if (p.mesh) R.free(p.mesh); if (selPiece) { R.free(selPiece.mesh); selPiece = null; } if (W.decals) { if (W.decals.st) R.freeD(W.decals.st); if (W.decals.dy) R.freeD(W.decals.dy); } }
function build() {
  dispose();
  W = new World();
  $('#tags').innerHTML = ''; sheet.reset();
  if (!circ || !circ.comps.length) { W = null; equipment(); return; }
  const byId = new Map(circ.comps.map(c => [c.id, c]));
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const c of circ.comps) {
    const m = MODELS[c.type]; if (!m || (opt.bench && D[c.type].cat === 'e')) continue;
    try { m(c); } catch (e) { console.error('3D model failed for', c.type, e); }
    const b = EP.box(c); x0 = Math.min(x0, c.x + b[0]); z0 = Math.min(z0, c.y + b[1] - (opt.bench && isCyl(c.type) ? 30 : 0)); x1 = Math.max(x1, c.x + b[0] + b[2]); z1 = Math.max(z1, c.y + b[1] + b[3]);
  }
  if (opt.bench) {
    try { bench(x1 > -1e8 ? Math.ceil((x1 + 60) / 10) * 10 : 0, z0 < 1e8 ? Math.floor(z0 / 10) * 10 + 10 : 0); leads(byId); } catch (e) { console.error('bench layout failed', e); }
    x0 = Math.min(x0, W.ext[0]); z0 = Math.min(z0, W.ext[1]); x1 = Math.max(x1, W.ext[2]); z1 = Math.max(z1, W.ext[3]);
  }
  mWires(byId); mLinks();
  for (const q of W.pickLs || []) if (!W.lsw[q.label]) q.pick.press = q.label;        // a limit switch with no cylinder can be pressed by hand
  const sn = (v, up) => (up ? Math.ceil : Math.floor)(v / 50) * 50;
  x0 = sn(x0 - 28); z0 = sn(z0 - 28); x1 = sn(x1 + 28, true); z1 = sn(z1 + 28, true);
  const T0 = THEME[theme];
  W.dyn(b => { b.box(x1 - x0, 9, z1 - z0, (x0 + x1) / 2, -9, (z0 + z1) / 2, [T0.plate, 0.7, 0.55], 1.5); }, {kind: 1});
  for (const xx of [x0 - 3, x1 + 3]) W.st.box(6, 11, z1 - z0 + 2, xx, -10, (z0 + z1) / 2, DARK, 1.5);
  W.dyn(b => b.g(geo('table', () => cyl(1, 1, 64, 0)), M.mul(T((x0 + x1) / 2, -11, (z0 + z1) / 2), M.sc(6000, 1, 6000)), [T0.table, 0, 0.75]), {kind: 2, noShadow: true});
  W.pieces.push({batch: W.st, model: M.id()});
  for (const p of W.pieces) { p.mesh = R.mesh(p.batch); p.batch = null; }
  R.atlas(sheet.cv); W.decals = {st: W.dv.length ? R.dmesh(W.dv) : null, dy: W.ddv.length ? R.dmesh(W.ddv) : null, list: W.dd}; W.dv = W.ddv = null;
  equipment();
  W.bounds = {min: [x0 - 10, -11, z0 - 10], max: [x1 + 10, 50, z1 + 10]};
  for (const t of W.tags) { t.el = document.createElement('div'); t.el.className = 'tag'; $('#tags').appendChild(t.el); t.shown = null; t.k = null; }
  setSel(sel, true);
}

/* what you would have to fetch from the cupboard to build this for real */
function equipment() {
  const el = $('#v-equip'); el.textContent = '';
  const h = document.createElement('h4'); h.textContent = 'Equipment for this circuit'; el.appendChild(h);
  if (!W || !W.equip.size) { const p = document.createElement('p'); p.textContent = 'Nothing on the bench yet.'; el.appendChild(p); return; }
  for (const [name, n] of W.equip) { const d = document.createElement('div'), a = document.createElement('b'), s = document.createElement('span'); a.textContent = n + ' ×'; s.textContent = name; d.append(a, s); el.appendChild(d); }
}

/* ---------- camera ---------- */
const cam = {at: [300, 6, 200], yaw: 0, pitch: 1.5, dist: 900, fov: 0.52}, goal = {at: [300, 6, 200], yaw: -0.3, pitch: 0.8, dist: 900};
let fitted = '';
function fit(force) {
  if (!W) return;
  const b = W.bounds, w = b.max[0] - b.min[0], d = b.max[2] - b.min[2], key = [b.min[0], b.min[2], w, d].join();
  if (!force && key === fitted) return;
  const cv = R.cv, asp = cv.clientWidth / Math.max(1, cv.clientHeight), t = Math.tan(cam.fov / 2);
  goal.at = [(b.min[0] + b.max[0]) / 2, 6, (b.min[2] + b.max[2]) / 2 + d * 0.04];
  goal.dist = Math.max(w / (2 * t * asp), d * 0.85 / (2 * t)) * 1.02 + 40;
  if (!fitted) { cam.at = goal.at.slice(); cam.dist = goal.dist * 1.25; }
  fitted = key;
}
function eye() { const c = Math.cos(cam.pitch); return [cam.at[0] + cam.dist * Math.sin(cam.yaw) * c, cam.at[1] + cam.dist * Math.sin(cam.pitch), cam.at[2] + cam.dist * Math.cos(cam.yaw) * c]; }
function ray(px, py) {
  const cv = R.cv, e = eye(), f = V.norm(V.sub(cam.at, e)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f), t = Math.tan(cam.fov / 2);
  const nx = (px / cv.clientWidth * 2 - 1) * t * cv.clientWidth / cv.clientHeight, ny = (1 - py / cv.clientHeight * 2) * t;
  return {o: e, d: V.norm([f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny])};
}
function pick(px, py) {
  if (!W) return null;
  const {o, d} = ray(px, py); let best = null, bt = 1e9;
  for (const p of W.picks) {
    let t0 = 0, t1 = 1e9;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < p.min[a] || o[a] > p.max[a]) { t0 = 1; t1 = 0; break; } continue; }
      let u = (p.min[a] - o[a]) / d[a], v = (p.max[a] - o[a]) / d[a]; if (u > v) { const k = u; u = v; v = k; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    }
    if (t0 <= t1 && t0 < bt) { bt = t0; best = {p, x: o[0] + d[0] * t0}; }
  }
  return best;
}
function setSel(id, force) {
  if (id === sel && !force) return;
  sel = id;
  if (selPiece) { R.free(selPiece.mesh); selPiece = null; }
  const p = W && id && W.picks.find(q => q.id === id); if (!p) return;
  const b = new Sol(), x0 = p.min[0] - 4, x1 = p.max[0] + 4, z0 = p.min[2] - 4, z1 = p.max[2] + 4, m = ['#ffffff', 0, 0.5];
  b.box(x1 - x0, 1.2, 1.6, (x0 + x1) / 2, 0.2, z0, m, 0.4).box(x1 - x0, 1.2, 1.6, (x0 + x1) / 2, 0.2, z1, m, 0.4).box(1.6, 1.2, z1 - z0, x0, 0.2, (z0 + z1) / 2, m, 0.4).box(1.6, 1.2, z1 - z0, x1, 0.2, (z0 + z1) / 2, m, 0.4);
  selPiece = {mesh: R.mesh(b), model: M.id(), noShadow: true, tint: [1, 0.42, 0.1]};
}

/* ---------- pointer: orbit, pan, zoom, and pressing things ---------- */
let drag = null;
const pts = new Map();                // fingers on the glass
function two() { const [a, b] = [...pts.values()]; return {d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; }
function slide(dx, dy) {
  const k = cam.dist * 0.0016, s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  goal.at = [goal.at[0] - (c * dx + s * dy) * k, goal.at[1], goal.at[2] - (-s * dx + c * dy) * k];
}
function release(d) { if (d && d.mode === 'press') { if (d.p.press) send({t: 'press', label: d.p.press, on: false}); else send({t: 'valve', id: d.p.id, side: d.side, on: false}); } }
function initInput(cv) {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      if (e.isPrimary) pts.clear();
      pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pts.size === 2) { release(drag); const t = two(); drag = {mode: 'pinch', d: t.d, dist: goal.dist, x: t.x, y: t.y}; return; }
      if (pts.size > 2) return;
    }
    const h = pick(e.offsetX, e.offsetY);
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointer already gone */ }
    if (e.button === 0 && !e.shiftKey && h && S && S.on && (h.p.press || h.p.valve != null)) {
      const side = h.p.dbl && h.x > h.p.valve ? 'R' : 'L';
      drag = {mode: 'press', p: h.p, side};
      if (h.p.press) send({t: 'press', label: h.p.press, on: true}); else send({t: 'valve', id: h.p.id, side, on: true});
      send({t: 'select', id: h.p.id});
      return;
    }
    drag = {mode: e.button !== 0 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, moved: 0, hit: h};
  });
  cv.addEventListener('pointermove', e => {
    const tp = pts.get(e.pointerId); if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
    if (drag && drag.mode === 'pinch') {
      if (pts.size < 2) return;
      const t = two(); goal.dist = clamp(drag.dist * drag.d / t.d, 120, 6000); slide(t.x - drag.x, t.y - drag.y); drag.x = t.x; drag.y = t.y;
      return;
    }
    if (!drag) { if (e.pointerType === 'touch') return; const h = pick(e.offsetX, e.offsetY); cv.style.cursor = h && S && S.on && (h.p.press || h.p.valve != null || h.p.psu) ? 'pointer' : 'grab'; return; }
    if (drag.mode === 'press') return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'orbit') { goal.yaw -= dx * 0.006; goal.pitch = clamp(goal.pitch + dy * 0.005, 0.12, 1.5); }
    else slide(dx, dy);
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'pinch') { if (pts.size < 2) drag = null; return; }
    const d = drag; drag = null;
    if (d.mode === 'press') { release(d); return; }
    if (d.moved < (e.pointerType === 'touch' ? 14 : 5) && e.type === 'pointerup') { if (d.hit && d.hit.p.psu && S && S.c && S.c[d.hit.p.id] && S.c[d.hit.p.id].trip) send({t: 'fuse'}); send({t: 'select', id: d.hit ? d.hit.p.id : null}); setSel(d.hit ? d.hit.p.id : null); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0012), 120, 6000); }, {passive: false});
}

/* ---------- the frame ---------- */
let now = 0, lastT = 0, prevT = 0, lag = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (ts - lastT) / 1000 || 0.016)); lastT = ts; now = ts / 1000;
  if (!R) return;
  const raw = Math.min(0.2, (ts - prevT) / 1000 || 0); prevT = ts;
  lag = raw > 0.045 ? lag + raw : Math.max(0, lag - raw * 0.5);          // a device that cannot keep up gets a coarser picture, not a slower one
  if (lag > 1.5 && (R.maxDpr || 2) > 1) { R.maxDpr = Math.max(1, (R.maxDpr || 2) - 0.5); lag = 0; }
  R.resize();
  const k = 1 - Math.exp(-dt * 9);
  cam.yaw += (goal.yaw - cam.yaw) * k; cam.pitch += (goal.pitch - cam.pitch) * k; cam.dist += (goal.dist - cam.dist) * k; cam.at = V.lerp(cam.at, goal.at, k);
  const T0 = THEME[theme];
  if (!W) { R.render({pieces: [], glows: [], eye: [0, 400, 600], at: [0, 0, 0], fov: cam.fov, bounds: {min: [-100, 0, -100], max: [100, 50, 100]}, env: T0, time: now}); return; }
  for (const f of W.upd) f();
  const pieces = selPiece ? W.pieces.concat(selPiece) : W.pieces;
  if (selPiece) { const a = 0.75 + 0.5 * Math.sin(now * 5); selPiece.emis = [1.5 * a, 0.5 * a, 0.08 * a]; }
  R.render({pieces, glows: W.glows, decals: W.decals, eye: eye(), at: cam.at, fov: cam.fov, bounds: W.bounds, env: T0, time: now});
  const cw = R.cv.clientWidth, ch = R.cv.clientHeight;
  for (const t of W.tags) {
    const show = opt.labels && !!t.text, q = show ? M.proj(R.vp, t.pos) : null, vis = show && q[3] > 1;
    if (vis !== t.shown) { t.el.style.display = vis ? '' : 'none'; t.shown = vis; }
    if (!vis) continue;
    const key = t.text + '|' + t.cls; if (key !== t.k) { t.el.textContent = t.text; t.el.className = 'tag ' + t.cls; t.k = key; }
    t.el.style.transform = `translate(${((q[0] / q[3] * 0.5 + 0.5) * cw).toFixed(1)}px,${((0.5 - q[1] / q[3] * 0.5) * ch).toFixed(1)}px) translate(-50%,-100%)`;
  }
}

/* ---------- talking to the main window ---------- */
let heard = 0;
function setTheme(t) { t = t === 'light' ? 'light' : 'dark'; const ch = t !== theme; theme = t; document.documentElement.dataset.theme = t; return ch; }
function status() {
  const on = !!(S && S.on);
  $('#v-power span').textContent = on ? 'Power OFF' : 'Power ON'; document.body.classList.toggle('running', on);
  const m = $('#v-msg');
  if (!main) { m.innerHTML = '<b>This is the 3D bench of PneuLab.</b><br>Open <code>index.html</code>, go to a lesson or the sandbox, and press <b>3D view</b> there.'; m.classList.remove('hidden'); }
  else if (!W) { m.innerHTML = '<b>Nothing on the bench yet.</b><br>Open a lesson or the sandbox in the PneuLab window. Whatever is on the sheet appears here, part for part.'; m.classList.remove('hidden'); }
  else m.classList.add('hidden');
}
window.addEventListener('message', e => {
  if (!main || e.source !== main) return;
  const m = e.data; if (!m || typeof m !== 'object') return;
  heard = performance.now();
  if (m.t === 'circ') {
    const th = setTheme(m.theme), j = JSON.stringify(m.circ);
    $('#v-title').textContent = m.title || '';
    if (j !== build.last || th) { build.last = j; circ = m.circ; if (!m.on) S = null; build(); fit(false); }
    status();
  } else if (m.t === 'state') { S = m.on ? m : null; if ('sel' in m) setSel(m.sel); status(); }
  else if (m.t === 'sel') setSel(m.sel);
  else if (m.t === 'insp') {
    const el = $('#v-card');
    if (!m.name) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.textContent = '';
    const h = document.createElement('h4'); h.textContent = m.name; el.appendChild(h);
    for (const r of m.rows || []) { const d = document.createElement('div'), k = document.createElement('span'), v = document.createElement('b'); k.textContent = r[0]; v.textContent = r[1]; d.append(k, v); el.appendChild(d); }
  }
});
setInterval(() => { if (main && performance.now() - heard > 1500) send({t: 'hello'}); }, 1000);     // (re)introduce ourselves, e.g. after the main page reloads

function start() {
  const cv = $('#gl');
  try { R = new Renderer(cv); } catch (e) { $('#v-msg').textContent = 'This browser cannot show the 3D bench (WebGL 2 is not available).'; $('#v-msg').classList.remove('hidden'); return; }
  initInput(cv);
  $('#v-toggles').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; opt[k] = !opt[k]; b.classList.toggle('on', opt[k]);
    if (k === 'bench') { b.textContent = opt.bench ? 'Bench' : 'Sheet'; fitted = ''; build(); fit(true); status(); }
  });
  $('#v-list').addEventListener('click', () => { const on = $('#v-equip').classList.toggle('hidden'); $('#v-list').classList.toggle('on', !on); });
  cv.addEventListener('dblclick', e => { const h = pick(e.offsetX, e.offsetY); if (!h) return; goal.at = [(h.p.min[0] + h.p.max[0]) / 2, 8, (h.p.min[2] + h.p.max[2]) / 2]; goal.dist = 250; });
  $('#v-power').addEventListener('click', () => send({t: 'power'}));
  $('#v-reset').addEventListener('click', () => { goal.yaw = -0.3; goal.pitch = 0.8; fit(true); });
  $('#v-top').addEventListener('click', () => { goal.yaw = 0; goal.pitch = 1.5; fit(true); });
  $('#v-shot').addEventListener('click', () => {
    if (!W) return;
    R.render({pieces: selPiece ? W.pieces.concat(selPiece) : W.pieces, glows: W.glows, decals: W.decals, eye: eye(), at: cam.at, fov: cam.fov, bounds: W.bounds, env: THEME[theme], time: now});
    cv.toBlob(b => {
      if (!b) return;
      const nat = window.PneuLabNative;             // inside the Android app there are no downloads: the app saves the picture itself
      if (nat && nat.saveFile) { const r = new FileReader(); r.onload = () => { try { nat.saveFile('pneulab-3d.png', 'image/png', String(r.result).split(',')[1] || ''); } catch (x) { /* the app refused */ } }; r.readAsDataURL(b); return; }
      const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'pneulab-3d.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
    }, 'image/png');
  });
  window.addEventListener('keydown', e => { if (S && S.on && !e.repeat && /^[0-9]$/.test(e.key)) send({t: 'press', label: 'S' + e.key, on: true}); else if (e.key === 'p' || e.key === 'P') send({t: 'power'}); });
  window.addEventListener('keyup', e => { if (/^[0-9]$/.test(e.key)) send({t: 'press', label: 'S' + e.key, on: false}); });
  setTheme(matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  status(); send({t: 'hello'});
  requestAnimationFrame(frame);
}
/* for tests and the curious: load a circuit without a main window */
EP.v3 = {load(c, state) { circ = c; S = state || null; build.last = ''; build(); fit(true); status(); }, state(s) { S = s; }, cam, goal, opt, frame, get world() { return W; }, get renderer() { return R; }};
start();
})();

/* Component library: what each part is, where its ports are, and how its symbol is drawn.
   Drawing functions are pure (they return SVG strings) so the same code serves the editor,
   the handbook figures and the headless test bench. */
(function (G) {
'use strict';
const EP = G.EP = G.EP || {};
const P_ATM = 101325;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[m]));
EP.esc = esc;

const ln = (x1, y1, x2, y2, cls = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ink ${cls}"/>`;
const tx = (x, y, t, cls = 'lbl', a = 'middle') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${a}">${esc(t)}</text>`;
const rc = (x, y, w, h, cls = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="ink ${cls}"/>`;
const r1 = v => Math.round(v * 10) / 10;

function arrow(x1, y1, x2, y2, cls = '') {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 5;
  const bx = x2 - Math.cos(a) * s, by = y2 - Math.sin(a) * s;
  const nx = Math.sin(a) * 2.4, ny = -Math.cos(a) * 2.4;
  return ln(x1, y1, r1(bx), r1(by), cls) +
    `<polygon points="${x2},${y2} ${r1(bx + nx)},${r1(by + ny)} ${r1(bx - nx)},${r1(by - ny)}" class="ink head ${cls}"/>`;
}
const tee = (x, y, up) => ln(x, y, x, y + (up ? -6 : 6)) + ln(x - 3, y + (up ? -6 : 6), x + 3, y + (up ? -6 : 6));
const exh = (x, y) => `<polygon points="${x - 4},${y + 1} ${x + 4},${y + 1} ${x},${y + 7}" class="ink nofill"/>`;
const puff = (x, y) => `<g class="puff">${ln(x, y, x, y + 7)}${ln(x - 3, y, x - 6, y + 6)}${ln(x + 3, y, x + 6, y + 6)}</g>`;

const E2 = (a, b) => [{n: a, x: 0, y: 0, d: 'u', k: 'e'}, {n: b, x: 0, y: 60, d: 'd', k: 'e'}];
/* a three-wire sensor, named by the colours of its leads: brown to +24 V, blue to 0 V, black is the switched output */
const E3 = [{n: 'BN', x: 0, y: 0, d: 'u', k: 'e'}, {n: 'BU', x: 0, y: 60, d: 'd', k: 'e'}, {n: 'BK', x: 20, y: 60, d: 'd', k: 'e'}];
/* the workpieces that can be held in front of a sensor, and which kind of sensor notices which */
EP.MATS = [['steel', 'Steel'], ['plastic', 'Plastic'], ['glass', 'Glass'], ['magnet', 'Magnet']];
EP.SEES = {reed: ['magnet'], ind: ['steel', 'magnet'], cap: ['steel', 'plastic', 'glass', 'magnet'], opt: ['steel', 'plastic', 'magnet']};
const BOX2 = [-36, 2, 52, 56];

/* ---------- electrical symbols ---------- */

function contact(c, sim, o) {
  const closed = sim ? sim.closed(c) : !o.no;
  const act = o.no ? closed : !closed;
  let g = ln(0, 0, 0, 20) + ln(0, 40, 0, 60), mx;
  const on = sim ? 'blade on' : 'blade';      // only a live bench shows which contacts are made
  if (o.no) { g += closed ? ln(0, 40, 0, 20, on) : ln(0, 40, -10, 21, 'blade'); mx = closed ? 0 : -5; }
  else { g += ln(0, 20, 8, 20); g += closed ? ln(0, 40, 8, 20, on) : ln(0, 40, -9, 22, 'blade'); mx = closed ? 4 : -4.5; }
  const hx = act ? -19 : -22, ac = act ? 'act' : '';
  if (o.act === 'push' || o.act === 'detent') {
    g += `<line x1="${mx}" y1="30" x2="${hx}" y2="30" class="ink dash ${ac}"/>` +
      ln(hx, 24, hx, 36, ac) + ln(hx, 24, hx + 4, 24, ac) + ln(hx, 36, hx + 4, 36, ac);
    if (o.act === 'detent') g += `<polyline points="${hx + 6},30 ${hx + 8.5},26 ${hx + 11},30" class="ink nofill ${ac}"/>`;   // the notch that holds it
  } else if (o.act === 'roller') {
    g += `<line x1="${mx}" y1="30" x2="${hx + 3.5}" y2="30" class="ink dash ${ac}"/>` +
      `<circle cx="${hx}" cy="30" r="3.5" class="ink nofill ${ac}"/>`;
  } else if (o.act === 'reed') {                 // a diamond: operated by coming near, not by being touched
    g += `<line x1="${mx}" y1="30" x2="${hx + 4.5}" y2="30" class="ink dash ${ac}"/>` +
      `<polygon points="${hx},25 ${hx + 4.5},30 ${hx},35 ${hx - 4.5},30" class="ink nofill ${ac}"/>`;
  } else if (o.act === 'pressure') {
    g += `<line x1="${mx}" y1="30" x2="-15" y2="30" class="ink dash ${ac}"/>` + rc(-25, 25, 10, 10, 'nofill ' + ac) + tx(-20, 33, 'p', 'pin');
  }
  g += tx(o.act === 'relay' ? -14 : -29, o.act === 'pressure' ? 20 : 34, c.label, 'lbl', 'end');
  g += tx(5, 13, o.no ? '3' : '1', 'pin', 'start') + tx(5, 55, o.no ? '4' : '2', 'pin', 'start');
  return g;
}

function coil(c, sim, kind) {
  const s = sim && sim.st[c.id], on = !!(s && s.on);
  let g = ln(0, 0, 0, 23) + ln(0, 37, 0, 60) + rc(-12, 23, 24, 14, 'coil ' + (on ? 'hot' : ''));
  if (kind === 'sol') {
    g += ln(-12, 37, 12, 23) + ln(12, 30, 18, 30) +
      `<path d="M18,26 L26,34 L26,26 L18,34 Z" class="ink nofill"/>`;
    return g + tx(-17, 34, c.label, 'lbl', 'end');
  }
  const r = kind === 'reset';
  g += tx(5, 13, r ? 'R1' : 'A1', 'pin', 'start') + tx(5, 55, r ? 'R2' : 'A2', 'pin', 'start');
  if (kind === 'timer' || kind === 'timer_off') {   // crossed box: "pulls in late"; solid box: "lets go late"
    const off = kind === 'timer_off', run = !!(s && s.tm > 0 && s.on === off);
    g += rc(-18, 23, 6, 14, off && !run ? 'piston' : 'coil ' + (run ? 'busy' : '')) + (off ? '' : ln(-18, 23, -12, 37) + ln(-18, 37, -12, 23)) +
      tx(-21, 47, (run ? Math.max(0, c.props.delay - s.tm).toFixed(1) : c.props.delay) + ' s', 'pin', 'end');
    return g + tx(-22, 34, c.label, 'lbl', 'end');
  }
  if (kind === 'timer_pulse' || kind === 'timer_flash') {   // a single pulse, or a pulse train, drawn in the side box
    const run = !!(s && s.hi), left = run && kind === 'timer_pulse' && s.on ? Math.max(0, c.props.delay - s.tt).toFixed(1) + ' s' : c.props.delay + ' s';
    g += rc(-20, 23, 8, 14, 'coil ' + (run ? 'busy' : '')) +
      (kind === 'timer_pulse' ? `<polyline points="-19,34 -17.5,34 -17.5,27 -14.5,27 -14.5,34 -13,34" class="ink nofill thin"/>`
        : `<polyline points="-19.5,34 -19.5,27 -17.7,27 -17.7,34 -15.9,34 -15.9,27 -14.1,27 -14.1,34 -12.5,34" class="ink nofill thin"/>`) +
      tx(-23, 47, left, 'pin', 'end');
    return g + tx(-24, 34, c.label, 'lbl', 'end');
  }
  if (kind === 'counter') g += tx(0, 33.5, (s ? s.count : 0) + '/' + c.props.preset, 'cnt ' + (on ? 'inv' : ''));
  if (r) g += tx(0, 33.5, 'R', 'cnt ' + (on ? 'inv' : ''));
  return g + tx(-17, 34, c.label, 'lbl', 'end');
}

/* A proximity sensor with its own electronics. The diamond means "senses without contact"; the mark inside says how. */
function sensor(c, sim, kind) {
  const s = sim && sim.st[c.id], on = !!(s && s.on), near = !!(s && s.act) ? 'act' : '';
  let g = ln(0, 0, 0, 18) + ln(0, 42, 0, 60) + `<polyline points="13,36 20,36 20,60" class="ink nofill"/>` +
    rc(-13, 18, 26, 24, 'coil ' + (on ? 'hot' : '')) + `<polygon points="0,21.5 8.5,30 0,38.5 -8.5,30" class="ink nofill ${near}"/>`;
  if (kind === 'ind') g += `<path d="M-4.5,31.5 q1.5,-4.5 3,0 q1.5,-4.5 3,0 q1.5,-4.5 3,0" class="ink nofill thin"/>`;                  // a coil
  else if (kind === 'cap') g += ln(-4.5, 30, -1.5, 30, 'thin') + ln(1.5, 30, 4.5, 30, 'thin') + ln(-1.5, 26.5, -1.5, 33.5, 'thin') + ln(1.5, 26.5, 1.5, 33.5, 'thin');   // two plates
  else g += `<path d="M-4,32.5 L2.5,27.5 M2.5,27.5 l-3.2,0.4 M2.5,27.5 l-1,3 M-1.5,34.5 L4,30.2" class="ink nofill thin"/>`;        // light
  return g + tx(-18, 34, c.label, 'lbl', 'end') + tx(4, 12, 'BN +', 'pin', 'start') + tx(-4, 55, 'BU −', 'pin', 'end') + tx(24, 52, 'BK', 'pin', 'start');
}

function lamp(c, sim) {
  const s = sim && sim.st[c.id], b = s ? Math.min(1, (s.v / 24) ** 2) : 0;
  return ln(0, 0, 0, 21) + ln(0, 39, 0, 60) +
    (b > 0.05 ? `<circle cx="0" cy="30" r="15" class="glow" opacity="${r1(b)}"/>` : '') +
    `<circle cx="0" cy="30" r="9" class="ink lampb" style="--b:${r1(b)}"/>` +
    ln(-6.4, 23.6, 6.4, 36.4) + ln(-6.4, 36.4, 6.4, 23.6) + tx(-15, 34, c.label, 'lbl', 'end');
}

function psu(c, sim) {
  const w = c.props.w, h = c.props.h, s = sim && sim.st[c.id];
  const live = !!(sim && sim.on && !s.tripped);
  return `<line x1="0" y1="0" x2="${w}" y2="0" class="ink bar ${live ? 'v-hi' : ''}"/>` +
    `<line x1="0" y1="${h}" x2="${w}" y2="${h}" class="ink bar"/>` +
    `<circle cx="-5" cy="0" r="3" class="ink nofill"/><circle cx="-5" cy="${h}" r="3" class="ink nofill"/>` +
    `<rect x="-60" y="-11" width="50" height="22" rx="7" class="pill ${live ? 'hot' : ''}"/>` + tx(-35, 4, '+24V', 'lbl pilltx') +
    `<rect x="-60" y="${h - 11}" width="50" height="22" rx="7" class="pill"/>` + tx(-35, h + 4, '0V', 'lbl pilltx') +
    (s && s.tripped ? `<g class="trip"><rect x="${w / 2 - 92}" y="-34" width="184" height="20" rx="6"/>` +
      tx(w / 2, -20, 'FUSE TRIPPED · click to reset', 'triptx') + '</g>' : '');
}

/* ---------- pneumatic symbols ---------- */

function valve52(c, sim, dbl) {
  const s = sim && sim.st[c.id], pos = s ? s.pos : 0, off = pos * 40;
  const on1 = !!(sim && sim.solOn(c.props.y1)), on2 = !!(dbl && sim && sim.solOn(c.props.y2));
  const pr = !!(sim && sim.portP(c.id, '1') > P_ATM + 3e4) ? 'air' : '';
  let g = ln(10, -10, 10, 0) + ln(30, -10, 30, 0) + ln(20, 30, 20, 40) + exh(10, 30) + exh(30, 30);
  if (s && s.ex5 > 1e-4) g += puff(10, 39);
  if (s && s.ex3 > 1e-4) g += puff(30, 39);
  g += `<g transform="translate(${off},0)">` + rc(-40, 0, 40, 30, 'vbox') + rc(0, 0, 40, 30, 'vbox');
  g += arrow(20, 30, 30, 0, pos === 0 ? pr : '') + arrow(10, 0, 10, 30) + tee(30, 30, true);       // normal: 1→2, 4→5
  g += arrow(-20, 30, -30, 0, pos === 1 ? pr : '') + arrow(-10, 0, -10, 30) + tee(-30, 30, true);  // actuated: 1→4, 2→3
  g += rc(-58, 8, 18, 14, 'coil ' + (on1 ? 'hot' : '')) + ln(-58, 22, -40, 8) + ln(-58, 15, -63, 15) + ln(-63, 11, -63, 19, s && s.mL ? 'act' : '');
  if (dbl) g += rc(40, 8, 18, 14, 'coil ' + (on2 ? 'hot' : '')) + ln(40, 8, 58, 22) + ln(58, 15, 63, 15) + ln(63, 11, 63, 19, s && s.mR ? 'act' : '');
  else g += `<polyline points="40,15 43,9 47,21 51,9 55,21 58,15" class="ink nofill"/>`;
  g += '</g>';
  g += tx(6, -3, '4', 'pin', 'end') + tx(34, -3, '2', 'pin', 'start') + tx(4, 41, '5', 'pin', 'end') +
    tx(24, 41, '1', 'pin', 'start') + tx(37, 41, '3', 'pin', 'start');
  g += tx(-68, 19, c.props.y1 || '?', 'lbl', 'end');
  if (dbl) g += tx(108, 19, c.props.y2 || '?', 'lbl', 'start');
  return g + tx(-28, 46, c.label, 'lbl sm', 'end');
}

/* 5/3, closed centre: three squares, a spring at each end holding the middle one over the ports */
function valve53(c, sim) {
  const s = sim && sim.st[c.id], pos = s ? s.pos : 0, off = [0, 40, -40][pos];
  const on1 = !!(sim && sim.solOn(c.props.y1)), on2 = !!(sim && sim.solOn(c.props.y2));
  const pr = !!(sim && sim.portP(c.id, '1') > P_ATM + 3e4) ? 'air' : '';
  let g = ln(10, -10, 10, 0) + ln(30, -10, 30, 0) + ln(20, 30, 20, 40) + exh(10, 30) + exh(30, 30);
  if (s && s.ex5 > 1e-4) g += puff(10, 39);
  if (s && s.ex3 > 1e-4) g += puff(30, 39);
  g += `<g transform="translate(${off},0)">` + rc(-40, 0, 40, 30, 'vbox') + rc(0, 0, 40, 30, 'vbox') + rc(40, 0, 40, 30, 'vbox');
  g += arrow(-20, 30, -30, 0, pos === 1 ? pr : '') + arrow(-10, 0, -10, 30) + tee(-30, 30, true);            // left: 1→4, 2→3
  g += tee(10, 0, false) + tee(30, 0, false) + tee(10, 30, true) + tee(20, 30, true) + tee(30, 30, true);    // middle: every port blocked
  g += arrow(60, 30, 70, 0, pos === 2 ? pr : '') + arrow(50, 0, 50, 30) + tee(70, 30, true);                 // right: 1→2, 4→5
  const spring = x => `<polyline points="${x},5 ${x + 3},1 ${x + 7},9 ${x + 11},1 ${x + 15},9 ${x + 18},5" class="ink nofill thin"/>`;
  g += rc(-58, 12, 18, 14, 'coil ' + (on1 ? 'hot' : '')) + ln(-58, 26, -40, 12) + ln(-58, 19, -63, 19) + ln(-63, 15, -63, 23, s && s.mL ? 'act' : '') + spring(-58);
  g += rc(80, 12, 18, 14, 'coil ' + (on2 ? 'hot' : '')) + ln(80, 12, 98, 26) + ln(98, 19, 103, 19) + ln(103, 15, 103, 23, s && s.mR ? 'act' : '') + spring(80);
  g += '</g>';
  g += tx(6, -3, '4', 'pin', 'end') + tx(34, -3, '2', 'pin', 'start') + tx(4, 41, '5', 'pin', 'end') +
    tx(24, 41, '1', 'pin', 'start') + tx(37, 41, '3', 'pin', 'start');
  return g + tx(-108, 23, c.props.y1 || '?', 'lbl', 'end') + tx(148, 23, c.props.y2 || '?', 'lbl', 'start') + tx(-28, 46, c.label, 'lbl sm', 'end');
}

function valve32(c, sim) {
  const s = sim && sim.st[c.id], pos = s ? s.pos : 0, off = pos * 30;
  const on1 = !!(sim && sim.solOn(c.props.y1));
  const pr = !!(sim && sim.portP(c.id, '1') > P_ATM + 3e4) ? 'air' : '';
  let g = ln(10, -10, 10, 0) + ln(10, 30, 10, 40) + exh(20, 30);
  if (s && s.ex3 > 1e-4) g += puff(20, 39);
  g += `<g transform="translate(${off},0)">` + rc(-30, 0, 30, 30, 'vbox') + rc(0, 0, 30, 30, 'vbox');
  g += arrow(10, 0, 20, 30) + tee(10, 30, true);                               // normal: 2→3, 1 blocked
  g += arrow(-20, 30, -20, 0, pos === 1 ? pr : '') + tee(-10, 30, true);       // actuated: 1→2, 3 blocked
  g += rc(-48, 8, 18, 14, 'coil ' + (on1 ? 'hot' : '')) + ln(-48, 22, -30, 8) + ln(-48, 15, -53, 15) + ln(-53, 11, -53, 19, s && s.mL ? 'act' : '');
  g += `<polyline points="30,15 33,9 37,21 41,9 45,21 48,15" class="ink nofill"/></g>`;
  g += tx(6, -3, '2', 'pin', 'end') + tx(6, 41, '1', 'pin', 'end') + tx(27, 41, '3', 'pin', 'start');
  return g + tx(-58, 19, c.props.y1 || '?', 'lbl', 'end') + tx(-20, 46, c.label, 'lbl sm', 'end');
}

function cylinder(c, sim, sa) {
  const s = sim && sim.st[c.id], f = s ? s.x / c.props.stroke : 0, px = r1(6 + f * 84);
  const op = p => r1(Math.max(0, Math.min(1, (p - P_ATM) / 6e5)) * 6) / 10;
  let g = `<rect x="1" y="1" width="${r1(px - 1)}" height="28" class="airfill" fill-opacity="${s ? op(s.pA) : 0}"/>` +
    `<rect x="${px + 8}" y="1" width="${r1(111 - px)}" height="28" class="airfill" fill-opacity="${s && !sa ? op(s.pB) : 0}"/>`;
  if (sa) {
    let pts = '';
    for (let i = 0; i <= 8; i++) pts += r1(px + 8 + (111 - px) * i / 8) + ',' + (i === 0 || i === 8 ? 15 : i % 2 ? 5 : 25) + ' ';
    g += `<polyline points="${pts}" class="ink nofill thin"/>` + ln(110, 30, 110, 34) + ln(107, 34, 113, 34);
  } else g += ln(110, 30, 110, 40);
  g += ln(10, 30, 10, 40) + rc(0, 0, 120, 30, 'nofill thick') + rc(px, 1, 8, 28, 'piston') +
    rc(px + 8, 12, 116, 6, 'rod') + rc(px + 124, 8, 6, 14, 'rod');
  const mark = (x, l) => l
    ? ln(x, -10, x, 0, 'mark') + `<circle cx="${x}" cy="4" r="3" class="ink nofill mark"/>` + tx(x, -14, l, 'lbl sm')
    : ln(x, -8, x, -3, 'faint');
  g += mark(133, c.props.markRet) + mark(217, c.props.markExt);
  return g + tx(60, -8, c.label, 'lbl');
}

function fcv(c, sim) {
  const o = Math.round(c.props.open);
  return ln(0, 0, 0, 16) + ln(0, 44, 0, 60) + ln(-8, 16, 8, 16) + ln(-8, 44, 8, 44) + ln(-8, 16, -8, 44) +
    `<rect x="-17" y="10" width="34" height="40" class="ink nofill dash thin"/>` +
    `<path d="M-13,25 Q-9.5,30 -13,35 M-3,25 Q-6.5,30 -3,35" class="ink nofill"/>` + arrow(-15, 38, -1, 22, 'thin') +
    ln(8, 16, 8, 25) + ln(8, 35, 8, 44) + `<circle cx="8" cy="28" r="3" class="ink nofill"/>` +
    `<polyline points="4,31 8,35 12,31" class="ink nofill"/>` +
    tx(21, 28, c.label, 'lbl sm', 'start') + tx(21, 39, o + '%', 'pin', 'start');
}

function air(c, sim) {
  const on = !!(sim && sim.on);
  return ln(0, 0, 0, 12, on ? 'air' : '') + `<polygon points="0,12 -7,24 7,24" class="ink ${on ? 'airtri' : 'nofill'}"/>` +
    tx(0, 37, c.props.bar + ' bar', 'pin');
}

function gauge(c, sim) {
  const s = sim && sim.st[c.id], bar = s ? Math.max(0, (s.p - P_ATM) / 1e5) : 0;
  const a = (-225 + Math.min(1, bar / 8) * 270) * Math.PI / 180;
  return ln(0, 22, 0, 30) + `<circle cx="0" cy="10" r="12" class="ink gface"/>` +
    `<line x1="0" y1="10" x2="${r1(Math.cos(a) * 9)}" y2="${r1(10 + Math.sin(a) * 9)}" class="ink needle"/>` +
    tx(17, 14, bar.toFixed(1) + ' bar', 'pin', 'start');
}

function psw(c, sim) {
  const s = sim && sim.st[c.id], on = !!(s && s.on);
  return ln(0, 20, 0, 30) + rc(-11, -2, 22, 22, 'coil ' + (on ? 'hot' : '')) + arrow(-6, 15, 6, 3, 'thin') +
    tx(16, 8, c.label, 'lbl sm', 'start') + tx(16, 18, '\u2265 ' + c.props.set + ' bar', 'pin', 'start');
}

/* ---------- definitions ---------- */

const D = EP.defs = {
  psu: {name: 'Power supply 24 V DC', short: '24 V supply', cat: 'e', grp: 'Power', prefix: '', one: true,
    props: {w: 300, h: 220}, ports: [{n: 'pos', k: 'e', bar: true}, {n: 'neg', k: 'e', bar: true}],
    box: c => [-62, -14, c.props.w + 70, c.props.h + 28], draw: psu,
    desc: 'The two rails every control circuit hangs between. Current leaves the +24 V rail, must pass through a load (a coil or lamp), and returns to the 0 V rail. A path with no load is a short circuit and trips the fuse.'},
  air: {name: 'Compressed air supply', short: 'Air supply', cat: 'p', grp: 'Power', prefix: '', props: {bar: 6},
    ports: [{n: 'out', x: 0, y: 0, d: 'u', k: 'p'}], box: [-12, 0, 24, 42], draw: air,
    desc: 'Filtered, regulated air from the compressor. Workshop systems normally run at 6 bar. This is the “muscle power” — connect it to port 1 of a valve.'},

  pb_no: {name: 'Pushbutton, normally open', short: 'Pushbutton NO', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'no', act: 'push',
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'push'}),
    desc: 'Open at rest: no current passes. While you hold it, terminals 3 and 4 are connected. Let go and a spring opens it again. Terminal numbers ending in 3–4 always mean “normally open”.'},
  pb_nc: {name: 'Pushbutton, normally closed', short: 'Pushbutton NC', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'nc', act: 'push',
    ports: E2('1', '2'), box: BOX2, draw: (c, s) => contact(c, s, {no: false, act: 'push'}),
    desc: 'Closed at rest: current passes. Pressing it breaks the circuit. Used for STOP buttons, because a broken wire then stops the machine too. Terminals ending in 1–2 mean “normally closed”.'},
  sw_no: {name: 'Toggle switch (stays put)', short: 'Toggle switch', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'no', act: 'push', detent: true,
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'detent'}),
    desc: 'A switch with a detent: click once and it stays closed, click again and it opens. Use it for things that should stay selected, like a main switch or an AUTO / MANUAL selector.'},
  sw_nc: {name: 'Toggle switch, normally closed', short: 'Toggle switch NC', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'nc', act: 'push', detent: true,
    ports: E2('1', '2'), box: BOX2, draw: (c, s) => contact(c, s, {no: false, act: 'detent'}),
    desc: 'Conducts until it is switched, then stays open until it is switched back. An emergency-stop button is built like this: hit it and it latches in, cutting the circuit until someone deliberately releases it. Switches with the same label flip together, like one button with several contact blocks.'},
  ls_no: {name: 'Limit switch, normally open', short: 'Limit switch NO', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'no', act: 'roller',
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'roller'}),
    desc: 'A switch pressed by the machine instead of a finger. A roller is pushed by the piston rod when it reaches an end position. Give it the same label as a mark on a cylinder to mount it there.'},
  ls_nc: {name: 'Limit switch, normally closed', short: 'Limit switch NC', cat: 'e', grp: 'Switches', prefix: 'S', contact: 'nc', act: 'roller',
    ports: E2('1', '2'), box: BOX2, draw: (c, s) => contact(c, s, {no: false, act: 'roller'}),
    desc: 'Conducts until the piston rod arrives and pushes its roller, then it opens. Handy for breaking a latch automatically at the end of a stroke.'},

  b_no: {name: 'Pressure switch contact, normally open', short: 'Pressure contact NO', cat: 'e', grp: 'Switches', prefix: 'B', contact: 'no', act: 'pressure', link: 'psw',
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'pressure'}),
    desc: 'The electrical half of a pressure switch. It closes when the pressure sensor with the same label (B1) reads at least its set pressure.'},
  b_nc: {name: 'Pressure switch contact, normally closed', short: 'Pressure contact NC', cat: 'e', grp: 'Switches', prefix: 'B', contact: 'nc', act: 'pressure', link: 'psw',
    ports: E2('1', '2'), box: BOX2, draw: (c, s) => contact(c, s, {no: false, act: 'pressure'}),
    desc: 'Opens when the pressure sensor with the same label reaches its set pressure.'},

  reed_no: {name: 'Reed switch (magnetic), normally open', short: 'Reed switch', cat: 'e', grp: 'Sensors', prefix: 'B', contact: 'no', act: 'roller', reed: true,
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'reed'}),
    desc: 'Two thin steel tongues in a glass tube. A magnet pulls them together, and the piston of most cylinders carries one. Clamped on the cylinder barrel it reports a position without anything touching the rod, so nothing wears and nothing sticks out. It sees magnets and nothing else. Give it the label of a mark on a cylinder to mount it there.'},
  s_ind: {name: 'Inductive proximity sensor', short: 'Inductive sensor', cat: 'e', grp: 'Sensors', prefix: 'B', sensor: 'ind', R: 2400,
    ports: E3, box: [-40, 2, 86, 56], draw: (c, s) => sensor(c, s, 'ind'),
    desc: 'A coil in its tip sends out a small high-frequency field. Metal that comes close soaks up energy from the field, and the electronics notice. It sees <b>metal only</b>, from a few millimetres away. Three wires: brown to +24 V, blue to 0 V, and black, which it connects to +24 V while it sees a target.'},
  s_cap: {name: 'Capacitive proximity sensor', short: 'Capacitive sensor', cat: 'e', grp: 'Sensors', prefix: 'B', sensor: 'cap', R: 2400,
    ports: E3, box: [-40, 2, 86, 56], draw: (c, s) => sensor(c, s, 'cap'),
    desc: 'Its tip is one plate of a capacitor, and whatever comes close changes that capacitance. So it sees <b>nearly everything</b>: metal, plastic, glass, wood, even liquid behind a tank wall. Use it where an inductive sensor is blind. Wired like every three-wire sensor: brown +24 V, blue 0 V, black output.'},
  s_opt: {name: 'Optical sensor (diffuse)', short: 'Optical sensor', cat: 'e', grp: 'Sensors', prefix: 'B', sensor: 'opt', R: 2400,
    ports: E3, box: [-40, 2, 86, 56], draw: (c, s) => sensor(c, s, 'opt'),
    desc: 'It sends out a beam of light and watches for it bouncing back. Anything that reflects light is seen, from much further away than the other kinds. Clear glass lets the beam straight through, so <b>it does not see transparent parts</b>. Brown +24 V, blue 0 V, black output.'},

  relay: {name: 'Relay coil', short: 'Relay coil', cat: 'e', grp: 'Relay', prefix: 'K', load: true, R: 580,
    ports: E2('A1', 'A2'), box: BOX2, draw: (c, s) => coil(c, s, 'relay'),
    desc: 'An electromagnet. When about 24 V is across A1–A2 it pulls an armature that flips every contact carrying the same label (K1 → all K1 contacts). It needs a few milliseconds to pull in and to drop out.'},
  k_no: {name: 'Relay contact, normally open', short: 'Relay contact NO', cat: 'e', grp: 'Relay', prefix: 'K', contact: 'no', act: 'relay', link: 'relay',
    ports: E2('3', '4'), box: BOX2, draw: (c, s) => contact(c, s, {no: true, act: 'relay'}),
    desc: 'Closes when the relay coil with the same label is energised. One coil can drive several contacts in different branches.'},
  k_nc: {name: 'Relay contact, normally closed', short: 'Relay contact NC', cat: 'e', grp: 'Relay', prefix: 'K', contact: 'nc', act: 'relay', link: 'relay',
    ports: E2('1', '2'), box: BOX2, draw: (c, s) => contact(c, s, {no: false, act: 'relay'}),
    desc: 'Opens when the relay coil with the same label is energised. Used for interlocks: “this may only run while that relay is off”.'},

  timer: {name: 'Timer relay, on-delay', short: 'Timer · on-delay', cat: 'e', grp: 'Relay', prefix: 'KT', load: true, R: 580, props: {delay: 3},
    ports: E2('A1', 'A2'), box: [-48, 2, 64, 56], draw: (c, s) => coil(c, s, 'timer'),
    desc: 'A relay that waits. Its contacts only change over after the coil has been energised for the whole set time. Cut the power and they drop back at once, and the clock starts from zero next time.'},
  timer_off: {name: 'Timer relay, off-delay', short: 'Timer · off-delay', cat: 'e', grp: 'Relay', prefix: 'KT', load: true, R: 580, props: {delay: 2},
    ports: E2('A1', 'A2'), box: [-48, 2, 64, 56], draw: (c, s) => coil(c, s, 'timer_off'),
    desc: 'The opposite kind of patience. Its contacts change over the moment the coil is energised, like any relay. But when the coil loses power they hold on for the set time before they drop back. The solid box on the symbol means “lets go late”.'},
  timer_pulse: {name: 'Timer relay, pulse (interval)', short: 'Timer · pulse', cat: 'e', grp: 'Relay', prefix: 'KT', load: true, R: 580, props: {delay: 1},
    ports: E2('A1', 'A2'), box: [-50, 2, 66, 56], draw: (c, s) => coil(c, s, 'timer_pulse'),
    desc: 'Its contacts switch the moment the coil is energised and drop back after the set time, even if the coil stays energised. Taking the voltage away ends the pulse early. It turns a long press into a short signal of fixed length.'},
  timer_flash: {name: 'Timer relay, flasher', short: 'Timer · flasher', cat: 'e', grp: 'Relay', prefix: 'KT', load: true, R: 580, props: {delay: 0.5},
    ports: E2('A1', 'A2'), box: [-50, 2, 66, 56], draw: (c, s) => coil(c, s, 'timer_flash'),
    desc: 'While its coil is energised, its contacts switch on and off again and again, each for the set time: on, off, on, off. It starts with “on”. Use it for a flashing warning lamp, or to drive a cylinder back and forth.'},
  counter: {name: 'Preset counter', short: 'Counter', cat: 'e', grp: 'Relay', prefix: 'C', load: true, R: 580, props: {preset: 3},
    ports: E2('A1', 'A2'), box: BOX2, draw: (c, s) => coil(c, s, 'counter'),
    desc: 'Counts pulses: every time voltage appears across A1–A2 the count goes up by one. When it reaches the preset, every contact with its label changes over and stays that way until the counter is reset.'},
  counter_r: {name: 'Counter reset coil', short: 'Counter reset', cat: 'e', grp: 'Relay', prefix: 'C', load: true, R: 580, link: 'counter',
    ports: E2('R1', 'R2'), box: BOX2, draw: (c, s) => coil(c, s, 'reset'),
    desc: 'The reset input of the counter with the same label. While it is energised the count is held at zero.'},

  sol: {name: 'Solenoid coil (valve)', short: 'Solenoid coil', cat: 'e', grp: 'Outputs', prefix: 'Y', load: true, R: 120,
    ports: E2('a', 'b'), box: [-36, 2, 66, 56], draw: (c, s) => coil(c, s, 'sol'),
    desc: 'The electrical half of a solenoid valve. Energise it and its magnet shifts the valve that carries the same label (Y1 here ↔ Y1 on the valve). This is where electricity hands over to air.'},
  lamp: {name: 'Indicator lamp', short: 'Lamp', cat: 'e', grp: 'Outputs', prefix: 'H', load: true, R: 480,
    ports: E2('a', 'b'), box: BOX2, draw: lamp,
    desc: 'Lights when voltage is across it. A simple way to see whether a branch is live.'},

  v52s: {name: '5/2 valve, single solenoid, spring return', short: '5/2 valve · spring', cat: 'p', grp: 'Pneumatics', prefix: 'V', suffix: true, props: {y1: 'Y1'},
    ports: [{n: '4', x: 10, y: -10, d: 'u', k: 'p'}, {n: '2', x: 30, y: -10, d: 'u', k: 'p'}, {n: '1', x: 20, y: 40, d: 'd', k: 'p'}],
    box: [-84, -12, 190, 62], draw: (c, s) => valve52(c, s, false),
    desc: '5 ports, 2 positions. At rest the spring holds it so that 1→2 is open (cylinder retracted) and 4 exhausts through 5. While its solenoid is energised it connects 1→4 and exhausts 2 through 3. No signal → the spring pushes it back. It has no memory.'},
  v52d: {name: '5/2 valve, double solenoid', short: '5/2 valve · double', cat: 'p', grp: 'Pneumatics', prefix: 'V', suffix: true, props: {y1: 'Y1', y2: 'Y2'},
    ports: [{n: '4', x: 10, y: -10, d: 'u', k: 'p'}, {n: '2', x: 30, y: -10, d: 'u', k: 'p'}, {n: '1', x: 20, y: 40, d: 'd', k: 'p'}],
    box: [-84, -12, 216, 62], draw: (c, s) => valve52(c, s, true),
    desc: 'No spring: it stays wherever the last signal put it, so a short pulse is enough. It is a memory. If both solenoids are energised at once it does not move — the signal that came first wins.'},
  v53: {name: '5/3 valve, double solenoid, closed centre', short: '5/3 valve · closed centre', cat: 'p', grp: 'Pneumatics', prefix: 'V', suffix: true, props: {y1: 'Y1', y2: 'Y2'},
    ports: [{n: '4', x: 10, y: -10, d: 'u', k: 'p'}, {n: '2', x: 30, y: -10, d: 'u', k: 'p'}, {n: '1', x: 20, y: 40, d: 'd', k: 'p'}],
    box: [-128, -12, 296, 62], draw: valve53,
    desc: '5 ports, 3 positions. A spring at each end holds it in the middle, where every port is blocked: no air gets in and none gets out, so the piston stays put between two cushions of trapped air. The left solenoid extends, the right one retracts, and the moment the signal ends the springs centre it again. Both solenoids together cancel out.'},
  v32s: {name: '3/2 valve, single solenoid, normally closed', short: '3/2 valve · spring', cat: 'p', grp: 'Pneumatics', prefix: 'V', suffix: true, props: {y1: 'Y1'},
    ports: [{n: '2', x: 10, y: -10, d: 'u', k: 'p'}, {n: '1', x: 10, y: 40, d: 'd', k: 'p'}],
    box: [-74, -12, 152, 62], draw: valve32,
    desc: '3 ports, 2 positions. At rest port 1 is blocked and port 2 exhausts through 3. Energised: 1→2. The right valve for a single-acting cylinder, which only needs air on one side.'},
  cyl_da: {name: 'Double-acting cylinder', short: 'Cylinder · double-acting', cat: 'p', grp: 'Pneumatics', prefix: 'A', suffix: true,
    props: {stroke: 0.2, bore: 0.032, rod: 0.012, load: 0, markRet: '', markExt: ''},
    ports: [{n: 'a', x: 10, y: 40, d: 'd', k: 'p'}, {n: 'b', x: 110, y: 40, d: 'd', k: 'p'}],
    box: [-4, -28, 232, 70], draw: (c, s) => cylinder(c, s, false),
    desc: 'Air pushes the piston both ways. Air on the left (cap) side extends the rod; air on the right (rod) side retracts it. The other side must be able to exhaust, or the trapped air stops the piston. Force = pressure × piston area, and the rod side is weaker because the rod takes up area.'},
  cyl_sa: {name: 'Single-acting cylinder', short: 'Cylinder · single-acting', cat: 'p', grp: 'Pneumatics', prefix: 'A', suffix: true,
    props: {stroke: 0.2, bore: 0.032, rod: 0.012, load: 0, markRet: '', markExt: ''},
    ports: [{n: 'a', x: 10, y: 40, d: 'd', k: 'p'}],
    box: [-4, -28, 232, 70], draw: (c, s) => cylinder(c, s, true),
    desc: 'Air extends it, a built-in spring brings it back. Only one port. It works against its own spring, so it is a little weaker than a double-acting cylinder.'},
  fcv: {name: 'One-way flow control valve', short: 'Flow control', cat: 'p', grp: 'Pneumatics', prefix: 'F', props: {open: 60},
    ports: [{n: 'out', x: 0, y: 0, d: 'u', k: 'p'}, {n: 'in', x: 0, y: 60, d: 'd', k: 'p'}],
    box: [-20, 4, 62, 52], draw: fcv,
    desc: 'A throttle with a bypass. Air going up (towards the cylinder) lifts the check ball and passes freely. Air coming back down must squeeze through the adjustable throttle. Throttling the exhaust like this sets the piston speed smoothly.'},
  gauge: {name: 'Pressure gauge', short: 'Gauge', cat: 'p', grp: 'Pneumatics', prefix: 'P', props: {},
    ports: [{n: 'p', x: 0, y: 30, d: 'd', k: 'p'}], box: [-14, -4, 62, 34], draw: gauge,
    desc: 'Shows the pressure in whatever line it is connected to, in bar above atmospheric.'},
  psw: {name: 'Pressure sensor', short: 'Pressure sensor', cat: 'p', grp: 'Pneumatics', prefix: 'B', props: {set: 5},
    ports: [{n: 'p', x: 0, y: 30, d: 'd', k: 'p'}], box: [-14, -6, 78, 38], draw: psw,
    desc: 'The pneumatic half of a pressure switch. Tee it into a line; when the pressure there reaches the set value, every pressure contact with the same label switches. Pressure only builds up fully once a piston has stopped — so this senses “I have met resistance”.'}
};

EP.box = c => { const b = D[c.type].box; return typeof b === 'function' ? b(c) : b; };

EP.portPos = function (c, pn, ox) {
  if (c.type === 'psu') {
    const x = Math.max(c.x, Math.min(c.x + c.props.w, ox == null ? c.x + 20 : ox));
    return pn === 'pos' ? {x, y: c.y, d: 'd'} : {x, y: c.y + c.props.h, d: 'u'};
  }
  const p = D[c.type].ports.find(p => p.n === pn);
  return p ? {x: c.x + p.x, y: c.y + p.y, d: p.d} : null;
};

EP.newComp = function (type, id, x, y, extra) {
  const d = D[type], props = Object.assign({}, d.props || {});
  const label = extra && extra.label != null ? extra.label : id;
  if (extra) for (const k in extra) if (k !== 'label' && k !== 'fixed') props[k] = extra[k];
  return {id, type, x, y, label, props, fixed: !!(extra && extra.fixed)};
};

/* A stand-alone picture of one symbol, for the palette, the handbook and lesson slides. */
EP.symbolSVG = function (type, extra, cls) {
  const c = EP.newComp(type, '_', 0, 0, extra || {}), d = D[type];
  if (!extra || extra.label == null) c.label = !d.prefix ? '' : d.suffix ? '1' + d.prefix : d.prefix + '1';
  if (type === 'psu') { c.props.w = 90; c.props.h = 50; }
  const b = EP.box(c);
  return `<svg class="sym-fig ${cls || ''}" viewBox="${b[0]} ${b[1]} ${b[2]} ${b[3]}" style="aspect-ratio:${b[2]}/${b[3]}">${D[type].draw(c, null)}</svg>`;
};

/* Orthogonal route between two ports. All ports face up or down. */
EP.route = function (p, q) {
  const sg = d => d === 'u' ? -1 : 1, ST = 10;
  const pts = [[p.x, p.y]];
  if (p.d !== q.d) {
    const facing = p.d === 'd' ? q.y >= p.y : q.y <= p.y;
    if (facing) {
      if (p.x !== q.x) { const m = Math.round((p.y + q.y) / 20) * 10; pts.push([p.x, m], [q.x, m]); }
    } else {
      const py = p.y + sg(p.d) * ST, qy = q.y + sg(q.d) * ST;
      const mx = Math.abs(p.x - q.x) < 60 ? Math.max(p.x, q.x) + 40 : Math.round((p.x + q.x) / 20) * 10;
      pts.push([p.x, py], [mx, py], [mx, qy], [q.x, qy]);
    }
  } else {
    const py = p.y + sg(p.d) * ST, qy = q.y + sg(q.d) * ST;
    const yy = p.d === 'd' ? Math.max(py, qy) : Math.min(py, qy);
    pts.push([p.x, yy], [q.x, yy]);
  }
  pts.push([q.x, q.y]);
  return pts;
};

EP.wirePts = function (byId, w) {
  const A = byId.get(w.a.c), B = byId.get(w.b.c);
  if (!A || !B) return null;
  let pa, pb;
  if (A.type === 'psu' && B.type !== 'psu') { pb = EP.portPos(B, w.b.p); pa = EP.portPos(A, w.a.p, pb.x); }
  else if (B.type === 'psu' && A.type !== 'psu') { pa = EP.portPos(A, w.a.p); pb = EP.portPos(B, w.b.p, pa.x); }
  else { pa = EP.portPos(A, w.a.p); pb = EP.portPos(B, w.b.p); }
  return pa && pb ? EP.route(pa, pb) : null;
};
})(typeof window !== 'undefined' ? window : globalThis);

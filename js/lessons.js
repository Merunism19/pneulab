/* Course content. Every build lesson carries its own reference solution; the starting circuit is
   derived from it (usually "same parts, wires removed"), and the test bench that grades the
   player's circuit is the same one that verifies the solution in tests/run.js. */
(function (G) {
'use strict';
const EP = G.EP = G.EP || {};
const D = EP.defs;

/* ---------- circuit builder ---------- */
function B() {
  const circ = {comps: [], wires: []}; let n = 0;
  const sp = r => { const i = r.lastIndexOf('.'); return {c: r.slice(0, i), p: r.slice(i + 1)}; };
  const api = {
    circ,
    add(type, id, x, y, extra) { circ.comps.push(EP.newComp(type, id, x, y, Object.assign({fixed: true}, extra))); return api; },
    w(...refs) {
      for (let i = 0; i < refs.length; i += 2) {
        const a = sp(refs[i]), b = sp(refs[i + 1]), ca = circ.comps.find(c => c.id === a.c);
        circ.wires.push({id: 'w' + (++n), k: D[ca.type].cat === 'p' ? 'p' : 'e', a, b});
      }
      return api;
    }
  };
  return api;
}
/* the pneumatic power section: cylinder 1A, valve 1V, air supply, optional flow controls */
function rig(b, o = {}) {
  const x = o.x == null ? 100 : o.x, y = o.y == null ? 80 : o.y, v = o.valve || 'v52s';
  const n = o.n || 1, A = n + 'A', V = n + 'V', AIR = n === 1 ? 'AIR' : 'AIR' + n, F = n + 'F', ys = o.ys || ['Y1', 'Y2'];
  b.add('cyl_da', A, x, y, {markRet: o.ret || '', markExt: o.ext || ''});
  b.add(v, V, x + 40, y + 170, v === 'v52d' || v === 'v53' ? {y1: ys[0], y2: ys[1]} : {y1: ys[0]});
  b.add('air', AIR, x + 60, y + 250, {label: ''});
  b.w(V + '.1', AIR + '.out');
  if (o.fa) { b.add('fcv', F + '1', x + 10, y + 60, {open: o.open || 60}); b.w(A + '.a', F + '1.out', F + '1.in', V + '.4'); } else b.w(A + '.a', V + '.4');
  if (o.fb) { b.add('fcv', F + '2', x + 110, y + 60, {open: o.open || 60}); b.w(A + '.b', F + '2.out', F + '2.in', V + '.2'); } else b.w(A + '.b', V + '.2');
  return b;
}
/* the electrical frame: two rails with a grid of branch columns and rows between them */
function frame(b, cols, rows, o = {}) {
  const ex = o.ex == null ? 440 : o.ex, ey = o.ey == null ? 50 : o.ey;
  b.add('psu', 'PSU', ex, ey, {w: 20 + 80 * cols, h: 30 + 80 * rows, label: ''});
  return {c: i => ex + 50 + 80 * i, r: j => ey + 30 + 80 * j};
}
const clone = o => JSON.parse(JSON.stringify(o));
const strip = (circ, dropComp, dropWire) => clone({
  comps: circ.comps.filter(c => !(dropComp && dropComp(c))),
  wires: circ.wires.filter(w => !(dropWire && dropWire(w)))
});
const unwired = sol => strip(sol, null, w => w.k === 'e');
const bare = sol => strip(sol, c => D[c.type].cat === 'e' && c.type !== 'psu', w => w.k === 'e');
EP.clone = clone;

/* ---------- small HTML helpers for slides ---------- */
const fig = (type, cap, extra) => `<figure>${EP.symbolSVG(type, extra)}<figcaption>${cap}</figcaption></figure>`;
const figs = (...f) => `<div class="figrow">${f.join('')}</div>`;
const tt = (head, rows) => `<table class="tt"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
  rows.map(r => `<tr>${r.map((v, i) => `<td class="${i === r.length - 1 ? 'out' : ''} b${v}">${v}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
const links = (x, pairs) => pairs.every(([a, b]) => x.q.linked(a, b));

/* ---------- reference circuits ---------- */
const sol = {
  air() { return rig(B()).circ; },
  direct() {
    const b = rig(B()), f = frame(b, 1, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  or() {
    const b = rig(B()), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S2', f.c(1), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'S2.3', 'S1.4', 'Y1.a', 'S2.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  and() {
    const b = rig(B()), f = frame(b, 1, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S2', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  mix() {
    const b = rig(B()), f = frame(b, 3, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0), {fixed: false}).add('pb_no', 'S2', f.c(1), f.r(0), {fixed: false})
      .add('pb_no', 'S3', f.c(0), f.r(1), {fixed: false}).add('sol', 'Y1', f.c(0), f.r(2), {fixed: false});
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'S2.3', 'S1.4', 'S3.3', 'S2.4', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  memory() {
    const b = rig(B(), {valve: 'v52d'}), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1)).add('pb_no', 'S2', f.c(1), f.r(0)).add('sol', 'Y2', f.c(1), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  limit() {
    const b = rig(B(), {valve: 'v52d', ext: 'S2', fa: 1, fb: 1}), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1)).add('ls_no', 'S2', f.c(1), f.r(0)).add('sol', 'Y2', f.c(1), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  pressDirect() {
    const b = rig(B(), {valve: 'v52d', ext: 'S3', fa: 1, fb: 1}), f = frame(b, 3, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S2', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(2))
      .add('ls_no', 'S3', f.c(1), f.r(0)).add('pb_no', 'S4', f.c(2), f.r(0)).add('sol', 'Y2', f.c(1), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'Y1.a', 'Y1.b', 'PSU.neg',
      'PSU.pos', 'S3.3', 'PSU.pos', 'S4.3', 'S3.4', 'Y2.a', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  relay() {
    const b = rig(B()), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('relay', 'K1', f.c(0), f.r(1))
      .add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(1), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'K1.A1', 'K1.A2', 'PSU.neg', 'PSU.pos', 'K1a.3', 'K1a.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  pressIndirect() {
    const b = rig(B(), {valve: 'v52d', ext: 'S3', fa: 1, fb: 1}), f = frame(b, 5, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S2', f.c(0), f.r(1)).add('relay', 'K1', f.c(0), f.r(2))
      .add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(1), f.r(2))
      .add('ls_no', 'S3', f.c(2), f.r(0)).add('pb_no', 'S4', f.c(3), f.r(0)).add('relay', 'K2', f.c(2), f.r(2))
      .add('k_no', 'K2a', f.c(4), f.r(0), {label: 'K2'}).add('sol', 'Y2', f.c(4), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1a.3', 'K1a.4', 'Y1.a', 'Y1.b', 'PSU.neg',
      'PSU.pos', 'S3.3', 'PSU.pos', 'S4.3', 'S3.4', 'K2.A1', 'S4.4', 'K2.A1', 'K2.A2', 'PSU.neg',
      'PSU.pos', 'K2a.3', 'K2a.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  classIndirect() {
    const b = rig(B()), f = frame(b, 3, 3), o = {fixed: false};
    b.add('pb_no', 'S1', f.c(0), f.r(0), o).add('pb_no', 'S2', f.c(0), f.r(1), o).add('pb_no', 'S3', f.c(1), f.r(0), o)
      .add('relay', 'K1', f.c(0), f.r(2), o).add('k_no', 'K1a', f.c(2), f.r(0), {label: 'K1', fixed: false}).add('sol', 'Y1', f.c(2), f.r(2), o);
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'K1.A1', 'PSU.pos', 'S3.3', 'S3.4', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1a.3', 'K1a.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  classDirect() {
    const b = rig(B()), f = frame(b, 3, 3), o = {fixed: false};
    b.add('pb_no', 'S1', f.c(0), f.r(0), o).add('pb_no', 'S2', f.c(0), f.r(1), o).add('pb_no', 'S3', f.c(1), f.r(0), o).add('sol', 'Y1', f.c(0), f.r(2), o);
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'Y1.a', 'PSU.pos', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  latchOff() {
    const b = B(), f = frame(b, 3, 3, {ex: 200});
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('pb_nc', 'S2', f.c(0), f.r(1))
      .add('relay', 'K1', f.c(0), f.r(2)).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('lamp', 'H1', f.c(2), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.1', 'S2.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'H1.a', 'H1.b', 'PSU.neg', 'PSU.pos', 'K1a.3', 'K1a.4', 'S2.1').circ;
  },
  latchOn() {
    const b = B(), f = frame(b, 3, 3, {ex: 200});
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('pb_nc', 'S2', f.c(1), f.r(1))
      .add('relay', 'K1', f.c(0), f.r(2)).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('lamp', 'H1', f.c(2), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'K1.A1', 'K1.A2', 'PSU.neg', 'PSU.pos', 'K1a.3', 'K1a.4', 'S2.1', 'S2.2', 'K1.A1',
      'PSU.pos', 'K1b.3', 'K1b.4', 'H1.a', 'H1.b', 'PSU.neg').circ;
  },
  feeder() {
    const b = rig(B(), {ext: 'S2', fa: 1}), f = frame(b, 3, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('ls_nc', 'S2', f.c(0), f.r(1))
      .add('relay', 'K1', f.c(0), f.r(2)).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(2), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'K1a.3', 'S1.4', 'S2.1', 'K1a.4', 'S2.1', 'S2.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  auto() {
    const b = rig(B(), {valve: 'v52d', ret: 'S3', ext: 'S4', fa: 1, fb: 1}), f = frame(b, 4, 3), o = {fixed: false};
    b.add('pb_no', 'S1', f.c(0), f.r(0), o).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1', fixed: false}).add('pb_nc', 'S2', f.c(0), f.r(1), o)
      .add('relay', 'K1', f.c(0), f.r(2), o).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1', fixed: false}).add('ls_no', 'S3', f.c(2), f.r(1), o)
      .add('sol', 'Y1', f.c(2), f.r(2), o).add('ls_no', 'S4', f.c(3), f.r(0), o).add('sol', 'Y2', f.c(3), f.r(2), o);
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'K1a.3', 'S1.4', 'S2.1', 'K1a.4', 'S2.1', 'S2.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S4.3', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  pipe() {
    const b = B(), x = 120, y = 80;
    b.add('cyl_sa', '1A', x, y).add('v32s', '1V', x, y + 170, {y1: 'Y1'}).add('air', 'AIR', x + 10, y + 250, {label: ''});
    b.w('AIR.out', '1V.1', '1V.2', '1A.a');
    const f = frame(b, 1, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  timer() {
    const b = rig(B(), {valve: 'v52d', ext: 'S2', fb: 1}), f = frame(b, 3, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1)).add('ls_no', 'S2', f.c(1), f.r(0))
      .add('timer', 'KT1', f.c(1), f.r(1), {delay: 2}).add('k_no', 'KT1a', f.c(2), f.r(0), {label: 'KT1'}).add('sol', 'Y2', f.c(2), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'KT1.A1', 'KT1.A2', 'PSU.neg',
      'PSU.pos', 'KT1a.3', 'KT1a.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  dwell() {
    const b = rig(B(), {ext: 'S2', fa: 1}), f = frame(b, 4, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('k_nc', 'KT1a', f.c(0), f.r(1), {label: 'KT1'})
      .add('relay', 'K1', f.c(0), f.r(2)).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(2), f.r(2))
      .add('ls_no', 'S2', f.c(3), f.r(0)).add('timer', 'KT1', f.c(3), f.r(2), {delay: 3});
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'K1a.3', 'S1.4', 'KT1a.1', 'K1a.4', 'KT1a.1', 'KT1a.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'KT1.A1', 'KT1.A2', 'PSU.neg').circ;
  },
  counter() {
    const b = rig(B(), {valve: 'v52d', ret: 'S3', ext: 'S4', fa: 1, fb: 1}), f = frame(b, 6, 4);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('pb_nc', 'S2', f.c(0), f.r(1))
      .add('k_nc', 'C1a', f.c(0), f.r(2), {label: 'C1'}).add('relay', 'K1', f.c(0), f.r(3))
      .add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('ls_no', 'S3', f.c(2), f.r(1)).add('sol', 'Y1', f.c(2), f.r(3))
      .add('ls_no', 'S4', f.c(3), f.r(0)).add('sol', 'Y2', f.c(3), f.r(3)).add('counter', 'C1', f.c(4), f.r(3), {preset: 3})
      .add('pb_no', 'S5', f.c(5), f.r(0)).add('counter_r', 'C1r', f.c(5), f.r(3), {label: 'C1'});
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'K1a.3', 'S1.4', 'S2.1', 'K1a.4', 'S2.1', 'S2.2', 'C1a.1', 'C1a.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S4.3', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg',
      'S4.4', 'C1.A1', 'C1.A2', 'PSU.neg', 'PSU.pos', 'S5.3', 'S5.4', 'C1r.R1', 'C1r.R2', 'PSU.neg').circ;
  },
  pressure() {
    const b = rig(B(), {valve: 'v52d'}), f = frame(b, 2, 2), o = {fixed: false};
    b.add('psw', 'B1', 30, 100, {set: 5.5}).w('B1.p', '1A.a');
    b.add('pb_no', 'S1', f.c(0), f.r(0), o).add('sol', 'Y1', f.c(0), f.r(1), o).add('b_no', 'B1c', f.c(1), f.r(0), {label: 'B1', fixed: false}).add('sol', 'Y2', f.c(1), f.r(1), o);
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'B1c.3', 'B1c.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  sequence() {
    const b = B();
    rig(b, {valve: 'v52d', ret: 'S2', ext: 'S3', fb: 1});
    rig(b, {n: 2, valve: 'v52d', ys: ['Y3', 'Y4'], ret: 'S4', ext: 'S5', fb: 1, y: 430});
    const f = frame(b, 4, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('ls_no', 'S4', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(2))
      .add('ls_no', 'S3', f.c(1), f.r(0)).add('sol', 'Y3', f.c(1), f.r(2)).add('ls_no', 'S5', f.c(2), f.r(0)).add('sol', 'Y2', f.c(2), f.r(2))
      .add('ls_no', 'S2', f.c(3), f.r(0)).add('sol', 'Y4', f.c(3), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S4.3', 'S4.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S3.3', 'S3.4', 'Y3.a', 'Y3.b', 'PSU.neg',
      'PSU.pos', 'S5.3', 'S5.4', 'Y2.a', 'Y2.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'Y4.a', 'Y4.b', 'PSU.neg').circ;
  },
  /* single cycle from S1, or continuous while toggle S2 is on */
  modes() {
    const b = rig(B(), {valve: 'v52d', ret: 'S3', ext: 'S4', fa: 1, fb: 1}), f = frame(b, 3, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sw_no', 'S2', f.c(1), f.r(0)).add('ls_no', 'S3', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(2))
      .add('ls_no', 'S4', f.c(2), f.r(0)).add('sol', 'Y2', f.c(2), f.r(2));
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'S2.3', 'S1.4', 'S3.3', 'S2.4', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg',
      'PSU.pos', 'S4.3', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  /* automatic press with an emergency stop S0: one contact block kills the latch, the other forces the return stroke */
  estop() {
    const b = rig(B(), {valve: 'v52d', ret: 'S3', ext: 'S4', fa: 1, fb: 1}), f = frame(b, 5, 3);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sw_nc', 'S0', f.c(0), f.r(1)).add('relay', 'K1', f.c(0), f.r(2))
      .add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'}).add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('ls_no', 'S3', f.c(2), f.r(1)).add('sol', 'Y1', f.c(2), f.r(2))
      .add('ls_no', 'S4', f.c(3), f.r(0)).add('sol', 'Y2', f.c(3), f.r(2)).add('sw_no', 'S0b', f.c(4), f.r(0), {label: 'S0'});
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'K1a.3', 'S1.4', 'S0.1', 'K1a.4', 'S0.1', 'S0.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'S3.3', 'S3.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S4.3', 'S4.4', 'Y2.a', 'PSU.pos', 'S0b.3', 'S0b.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  /* A+ B+ B- A- wired the naive way: every limit switch straight onto a coil. It jams twice. */
  overlap() {
    const b = B();
    rig(b, {valve: 'v52d', ret: 'S2', ext: 'S3', fb: 1});
    rig(b, {n: 2, valve: 'v52d', ys: ['Y3', 'Y4'], ret: 'S4', ext: 'S5', fb: 1, y: 430});
    const f = frame(b, 4, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1)).add('ls_no', 'S3', f.c(1), f.r(0)).add('sol', 'Y3', f.c(1), f.r(1))
      .add('ls_no', 'S5', f.c(2), f.r(0)).add('sol', 'Y4', f.c(2), f.r(1)).add('ls_no', 'S4', f.c(3), f.r(0)).add('sol', 'Y2', f.c(3), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S3.3', 'S3.4', 'Y3.a', 'Y3.b', 'PSU.neg',
      'PSU.pos', 'S5.3', 'S5.4', 'Y4.a', 'Y4.b', 'PSU.neg', 'PSU.pos', 'S4.3', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  /* A+ B+ B- A- done properly: memory relay K1 feeds group 1 (A+, B+) or group 2 (B-, A-), never both */
  cascade() {
    const b = B();
    rig(b, {valve: 'v52d', ret: 'S2', ext: 'S3', fb: 1});
    rig(b, {n: 2, valve: 'v52d', ys: ['Y3', 'Y4'], ret: 'S4', ext: 'S5', fb: 1, y: 430});
    const f = frame(b, 6, 4);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('ls_no', 'S2', f.c(0), f.r(1)).add('ls_nc', 'S5', f.c(0), f.r(2)).add('relay', 'K1', f.c(0), f.r(3))
      .add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'})
      .add('k_no', 'K1b', f.c(2), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(2), f.r(3)).add('ls_no', 'S3', f.c(3), f.r(1)).add('sol', 'Y3', f.c(3), f.r(3))
      .add('k_nc', 'K1c', f.c(4), f.r(0), {label: 'K1'}).add('sol', 'Y4', f.c(4), f.r(3)).add('ls_no', 'S4', f.c(5), f.r(1)).add('sol', 'Y2', f.c(5), f.r(3));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'S2.4', 'S5.1', 'PSU.pos', 'K1a.3', 'K1a.4', 'S5.1', 'S5.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'Y1.a', 'K1b.4', 'S3.3', 'S3.4', 'Y3.a', 'Y1.b', 'PSU.neg', 'Y3.b', 'PSU.neg',
      'PSU.pos', 'K1c.1', 'K1c.2', 'Y4.a', 'K1c.2', 'S4.3', 'S4.4', 'Y2.a', 'Y4.b', 'PSU.neg', 'Y2.b', 'PSU.neg').circ;
  },
  /* jog control: a 5/3 closed-centre valve moves the piston only while a button is held */
  jog() {
    const b = rig(B(), {valve: 'v53', fa: 1, fb: 1, open: 30}), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(0), f.r(1)).add('pb_no', 'S2', f.c(1), f.r(0)).add('sol', 'Y2', f.c(1), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S2.3', 'S2.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
  },
  /* off-delay: the press stays down for two seconds after the button is released */
  offdelay() {
    const b = rig(B(), {}), f = frame(b, 2, 2);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('timer_off', 'KT1', f.c(0), f.r(1), {delay: 2}).add('k_no', 'KT1a', f.c(1), f.r(0), {label: 'KT1'}).add('sol', 'Y1', f.c(1), f.r(1));
    return b.w('PSU.pos', 'S1.3', 'S1.4', 'KT1.A1', 'KT1.A2', 'PSU.neg', 'PSU.pos', 'KT1a.3', 'KT1a.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  /* two-hand safety start: both buttons within half a second, or nothing */
  twohand() {
    const b = rig(B(), {}), f = frame(b, 5, 4);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('timer', 'KT1', f.c(0), f.r(3), {delay: 0.5}).add('pb_no', 'S2', f.c(1), f.r(0))
      .add('pb_no', 'S1b', f.c(2), f.r(0), {label: 'S1'}).add('pb_no', 'S2b', f.c(2), f.r(1), {label: 'S2'}).add('k_nc', 'KT1c', f.c(2), f.r(2), {label: 'KT1'}).add('relay', 'K1', f.c(2), f.r(3))
      .add('k_no', 'K1a', f.c(3), f.r(2), {label: 'K1'}).add('k_no', 'K1b', f.c(4), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(4), f.r(3));
    return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'S2.3', 'S1.4', 'KT1.A1', 'S2.4', 'KT1.A1', 'KT1.A2', 'PSU.neg',
      'PSU.pos', 'S1b.3', 'S1b.4', 'S2b.3', 'S2b.4', 'KT1c.1', 'KT1c.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'S2b.4', 'K1a.3', 'K1a.4', 'K1.A1', 'PSU.pos', 'K1b.3', 'K1b.4', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
  },
  /* A+ A- B+ B-: memory relay K1 is set when 1A is out and reset when 2A is out */
  cascade2() {
    const b = B();
    rig(b, {valve: 'v52d', ret: 'S2', ext: 'S3', fb: 1});
    rig(b, {n: 2, valve: 'v52d', ys: ['Y3', 'Y4'], ret: 'S4', ext: 'S5', fb: 1, y: 430});
    const f = frame(b, 6, 4);
    b.add('ls_no', 'S3', f.c(0), f.r(0)).add('ls_nc', 'S5', f.c(0), f.r(2)).add('relay', 'K1', f.c(0), f.r(3)).add('k_no', 'K1a', f.c(1), f.r(0), {label: 'K1'})
      .add('k_nc', 'K1c', f.c(2), f.r(0), {label: 'K1'}).add('sol', 'Y4', f.c(2), f.r(3)).add('pb_no', 'S1', f.c(3), f.r(1)).add('ls_no', 'S4', f.c(3), f.r(2)).add('sol', 'Y1', f.c(3), f.r(3))
      .add('k_no', 'K1b', f.c(4), f.r(0), {label: 'K1'}).add('sol', 'Y2', f.c(4), f.r(3)).add('ls_no', 'S2', f.c(5), f.r(1)).add('sol', 'Y3', f.c(5), f.r(3));
    return b.w('PSU.pos', 'S3.3', 'S3.4', 'S5.1', 'PSU.pos', 'K1a.3', 'K1a.4', 'S5.1', 'S5.2', 'K1.A1', 'K1.A2', 'PSU.neg',
      'PSU.pos', 'K1c.1', 'K1c.2', 'Y4.a', 'K1c.2', 'S1.3', 'S1.4', 'S4.3', 'S4.4', 'Y1.a', 'Y4.b', 'PSU.neg', 'Y1.b', 'PSU.neg',
      'PSU.pos', 'K1b.3', 'K1b.4', 'Y2.a', 'K1b.4', 'S2.3', 'S2.4', 'Y3.a', 'Y2.b', 'PSU.neg', 'Y3.b', 'PSU.neg').circ;
  },
  /* the press with a "press active" lamp: wrong (lamp in series with Y1) and right (lamp in parallel) */
  pressLamp(series) {
    const b = rig(B(), {valve: 'v52d', ext: 'S3', fa: 1, fb: 1}), f = frame(b, 4, 4);
    b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S2', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(3))
      .add('ls_no', 'S3', f.c(1), f.r(0)).add('pb_no', 'S4', f.c(2), f.r(0)).add('sol', 'Y2', f.c(1), f.r(3))
      .add('lamp', 'H1', series ? f.c(0) : f.c(3), series ? f.r(2) : f.r(3));
    b.w('PSU.pos', 'S1.3', 'S1.4', 'S2.3', 'Y1.b', 'PSU.neg', 'PSU.pos', 'S3.3', 'PSU.pos', 'S4.3', 'S3.4', 'Y2.a', 'S4.4', 'Y2.a', 'Y2.b', 'PSU.neg');
    if (series) b.w('S2.4', 'H1.a', 'H1.b', 'Y1.a'); else b.w('S2.4', 'Y1.a', 'S2.4', 'H1.a', 'H1.b', 'PSU.neg');
    return b.circ;
  }
};
/* ----- sensors ----- */
sol.prox = function () {                     // one inductive sensor feeding a solenoid directly
  const b = rig(B()), f = frame(b, 2, 2);
  b.add('s_ind', 'B1', f.c(0), f.r(0)).add('sol', 'Y1', f.c(1), f.r(1));
  return b.w('PSU.pos', 'B1.BN', 'B1.BU', 'PSU.neg', 'B1.BK', 'Y1.a', 'Y1.b', 'PSU.neg').circ;
};
sol.senses = function () {                   // the four kinds side by side, each with a lamp of its own
  const b = B(), f = frame(b, 7, 2, {ex: 80});
  b.add('reed_no', 'B1', f.c(0), f.r(0)).add('lamp', 'H1', f.c(0), f.r(1)).w('PSU.pos', 'B1.3', 'B1.4', 'H1.a', 'H1.b', 'PSU.neg');
  [['s_ind', 2], ['s_cap', 3], ['s_opt', 4]].forEach(([t, n], i) => {
    const B_ = 'B' + n, H = 'H' + n;
    b.add(t, B_, f.c(1 + 2 * i), f.r(0)).add('lamp', H, f.c(2 + 2 * i), f.r(1));
    b.w('PSU.pos', B_ + '.BN', B_ + '.BU', 'PSU.neg', B_ + '.BK', H + '.a', H + '.b', 'PSU.neg');
  });
  return b.circ;
};
sol.sorter = function () {                   // metal is pushed off the belt, anything else is reported by a lamp
  const b = rig(B()), f = frame(b, 5, 3), o = {fixed: false};
  b.add('s_ind', 'B1', f.c(0), f.r(0)).add('relay', 'K1', f.c(1), f.r(2), o)
    .add('k_no', 'K1a', f.c(2), f.r(0), {label: 'K1', fixed: false}).add('sol', 'Y1', f.c(2), f.r(2), o)
    .add('s_cap', 'B2', f.c(3), f.r(0)).add('k_nc', 'K1b', f.c(4), f.r(1), {label: 'K1', fixed: false}).add('lamp', 'H1', f.c(4), f.r(2), o);
  return b.w('PSU.pos', 'B1.BN', 'B1.BU', 'PSU.neg', 'B1.BK', 'K1.A1', 'K1.A2', 'PSU.neg', 'PSU.pos', 'K1a.3', 'K1a.4', 'Y1.a', 'Y1.b', 'PSU.neg',
    'PSU.pos', 'B2.BN', 'B2.BU', 'PSU.neg', 'B2.BK', 'K1b.1', 'K1b.2', 'H1.a', 'H1.b', 'PSU.neg').circ;
};
sol.reedcyl = function () {                  // out and back by itself, with reed switches on the barrel instead of rollers at the rod
  const b = rig(B(), {valve: 'v52d', ret: 'B1', ext: 'B2', fb: 1}), f = frame(b, 2, 3);
  b.add('pb_no', 'S1', f.c(0), f.r(0)).add('reed_no', 'B1', f.c(0), f.r(1)).add('sol', 'Y1', f.c(0), f.r(2)).add('reed_no', 'B2', f.c(1), f.r(0)).add('sol', 'Y2', f.c(1), f.r(2));
  return b.w('PSU.pos', 'S1.3', 'S1.4', 'B1.3', 'B1.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'B2.3', 'B2.4', 'Y2.a', 'Y2.b', 'PSU.neg').circ;
};
/* ----- exam projects ----- */
sol.clampCheck = function () {               // clamp only if a part is there; a lamp for "clamp closed"
  const b = rig(B(), {valve: 'v52d', ext: 'S3'}), f = frame(b, 4, 3);
  b.add('s_cap', 'B1', f.c(0), f.r(0)).add('pb_no', 'S1', f.c(1), f.r(1)).add('sol', 'Y1', f.c(1), f.r(2))
    .add('pb_no', 'S2', f.c(2), f.r(0)).add('sol', 'Y2', f.c(2), f.r(2)).add('ls_no', 'S3', f.c(3), f.r(0)).add('lamp', 'H1', f.c(3), f.r(2));
  return b.w('PSU.pos', 'B1.BN', 'B1.BU', 'PSU.neg', 'B1.BK', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'PSU.neg',
    'PSU.pos', 'S2.3', 'S2.4', 'Y2.a', 'Y2.b', 'PSU.neg', 'PSU.pos', 'S3.3', 'S3.4', 'H1.a', 'H1.b', 'PSU.neg').circ;
};
sol.doorTwo = function () {                  // two OPEN buttons, one CLOSE button that wins, a relay that remembers
  const b = rig(B()), f = frame(b, 5, 3);
  b.add('pb_no', 'S1', f.c(0), f.r(0)).add('pb_no', 'S3', f.c(1), f.r(0)).add('k_no', 'K1a', f.c(2), f.r(0), {label: 'K1'})
    .add('pb_nc', 'S2', f.c(0), f.r(1)).add('relay', 'K1', f.c(0), f.r(2))
    .add('k_no', 'K1b', f.c(3), f.r(0), {label: 'K1'}).add('sol', 'Y1', f.c(3), f.r(2)).add('k_no', 'K1c', f.c(4), f.r(0), {label: 'K1'}).add('lamp', 'H1', f.c(4), f.r(2));
  return b.w('PSU.pos', 'S1.3', 'PSU.pos', 'S3.3', 'PSU.pos', 'K1a.3', 'S1.4', 'S2.1', 'S3.4', 'S2.1', 'K1a.4', 'S2.1', 'S2.2', 'K1.A1', 'K1.A2', 'PSU.neg',
    'PSU.pos', 'K1b.3', 'K1b.4', 'Y1.a', 'Y1.b', 'PSU.neg', 'PSU.pos', 'K1c.3', 'K1c.4', 'H1.a', 'H1.b', 'PSU.neg').circ;
};
sol.batch = function () {                    // every third box: push the batch on, come back, count again
  const b = rig(B(), {ext: 'S3'}), f = frame(b, 4, 3);
  b.add('s_opt', 'B1', f.c(0), f.r(0)).add('counter', 'C1', f.c(1), f.r(1), {preset: 3}).add('k_no', 'C1a', f.c(2), f.r(0), {label: 'C1'}).add('sol', 'Y1', f.c(2), f.r(2))
    .add('ls_no', 'S3', f.c(3), f.r(0)).add('counter_r', 'C1r', f.c(3), f.r(2), {label: 'C1'});
  return b.w('PSU.pos', 'B1.BN', 'B1.BU', 'PSU.neg', 'B1.BK', 'C1.A1', 'C1.A2', 'PSU.neg', 'PSU.pos', 'C1a.3', 'C1a.4', 'Y1.a', 'Y1.b', 'PSU.neg',
    'PSU.pos', 'S3.3', 'S3.4', 'C1r.R1', 'C1r.R2', 'PSU.neg').circ;
};
EP.solutions = sol;
/* make every part editable (sandbox examples, repair jobs) */
const loose = c => { c.comps.forEach(x => { x.fixed = false; }); return c; };
/* ----- broken machines for the repair shop ----- */
const broken = {
  swapped() { const c = loose(sol.direct()); for (const w of c.wires) if (w.k === 'p' && w.a.c === '1A') w.b.p = w.b.p === '4' ? '2' : '4'; return c; },
  wrongEnd() { const c = loose(sol.pressDirect()), a = c.comps.find(x => x.id === '1A'); a.props.markRet = 'S3'; a.props.markExt = ''; return c; },
  noRelease() { const c = loose(sol.feeder()); for (const w of c.wires) if (w.a.c === 'K1a' && w.a.p === '4') w.b = {c: 'K1', p: 'A1'}; return c; },
  series() { return loose(sol.pressLamp(true)); }
};

/* ---------- shared test steps for the press ---------- */
const pressTests = [
  {kind: 'seq', title: 'Two-hand start', steps: [
    {say: 'Hold only S1 — the press must stay up', press: ['S1'], run: 0.8, expect: [['ret', '1A']], why: 'The press came down with one hand on a button. S1 and S2 must be in series (AND) so both are needed.'},
    {say: 'Hold only S2 — the press must stay up', release: ['S1'], press: ['S2'], run: 0.8, expect: [['ret', '1A']], why: 'The press came down with only S2 pressed. S1 and S2 must be in series (AND).'},
    {say: 'Hold S1 and S2 together — the press comes down', press: ['S1'], run: 3.5, expect: [['ext', '1A']], why: 'With both buttons held the press did not reach the bottom. Check the path +24 V → S1 → S2 → Y1 → 0 V.'},
    {say: 'Let go — limit switch S3 sends it back up', release: ['S1', 'S2'], run: 3.5, expect: [['ret', '1A'], ['cycles', '1A', 1]], why: 'The press did not return by itself. Limit switch S3 (at the bottom) has to energise Y2.'}
  ]},
  {kind: 'seq', title: 'Limit switch S3 is broken — release by hand', faults: {S3: true}, steps: [
    {say: 'Both buttons: the press comes down', press: ['S1', 'S2'], run: 3.5, expect: [['ext', '1A']], why: 'The press did not come down.'},
    {say: 'S3 has failed, so the press stays down', release: ['S1', 'S2'], run: 1.5, expect: [['ext', '1A']], why: 'Something other than S3 or S4 sent the press back up.'},
    {say: 'Tap S4 — the press is released', tap: ['S4'], run: 3.5, expect: [['ret', '1A']], why: 'S4 did not release the press. It needs its own path to Y2, in parallel with S3 (OR).'}
  ]}
];

/* ---------- the course ---------- */
EP.chapters = [
  {title: 'First contact', blurb: 'Air does the work. Electricity gives the orders.'},
  {title: 'Logic with wires', blurb: 'OR, AND, and reading truth tables.'},
  {title: 'Memory and feeling', blurb: 'Valves that remember, switches the machine presses itself.'},
  {title: 'Relays', blurb: 'Indirect control: a small circuit commands a bigger one.'},
  {title: 'Latching', blurb: 'Circuits that hold a signal after you let go.'},
  {title: 'Time and counting', blurb: 'Beyond the module: machines that wait, and machines that keep count.'},
  {title: 'Operating modes and safety', blurb: 'One cycle or many, a red button that always wins, two honest hands, and stopping half-way.'},
  {title: 'Pressure and sequences', blurb: 'Sensing force through air pressure, and two cylinders working in step.'},
  {title: 'Repair shop', blurb: 'Four machines came back broken. Find the fault, fix it, prove it.'},
  {title: 'Sensors', blurb: 'Switches with no moving parts: what each kind can see, and how three wires make them work.'},
  {title: 'Exam projects', blurb: 'Practical tasks set the way an exam sets them: a specification, a bench, and no step-by-step help.'}
];

EP.lessons = [
/* ===== Chapter 1 ===== */
{
  id: 'air', ch: 0, kind: 'guided', title: 'Air does the work',
  brief: 'Get to know the two parts that do all the heavy lifting: the cylinder and the 5/2 valve. No electricity yet — you will shift the valve by hand.',
  solution: sol.air, start: s => clone(s), palette: [],
  intro: [
    {h: 'Muscles and nerves', html: `<p>Electro-pneumatics joins two worlds. <b class="c-air">Compressed air</b> is the muscle: it pushes pistons with real force. <b class="c-el">Electricity</b> is the nervous system: it decides <i>when</i> the air may flow.</p>
      <p>Factories love the mix. Air is clean, fast and hard to overload. Electrical signals travel instantly, are easy to combine into logic, and cost almost nothing to route.</p>
      <p>You are going to build these machines yourself. Every wire and tube here obeys the same physics as the real thing.</p>`},
    {h: 'The cylinder', html: figs(fig('cyl_da', 'Double-acting cylinder 1A')) + `<p>A piston in a tube. Put air on the <b>left (cap) side</b> and the rod is pushed out. Put air on the <b>right (rod) side</b> and it is pulled back in.</p>
      <p>How hard does it push? <b>Force = pressure × piston area.</b> At 6 bar, this 32 mm piston pushes with about 480 N — enough to lift 49 kg. Pulling back it is a bit weaker, because the rod covers part of the piston.</p>
      <p>One rule matters more than any other: air on one side can only move the piston if the air on the <i>other</i> side has somewhere to escape.</p>`},
    {h: 'The 5/2 valve', html: figs(fig('v52s', '5/2 valve with solenoid and spring')) + `<p><b>5 ports, 2 positions</b> — that is all “5/2” means.</p>
      <ul><li><b>1</b> — compressed air comes in</li><li><b>2</b> and <b>4</b> — working lines to the cylinder</li><li><b>3</b> and <b>5</b> — exhaust, back to the room</li></ul>
      <p>Each square is one position. Only the square sitting on the port lines is active; the arrows inside show which ports it joins, and a ⊤ means “blocked”. When the valve switches, picture the whole symbol sliding sideways so the other square sits on the ports. Here it really does slide.</p>`}
  ],
  steps: [
    {t: 'Switch the bench on with <b>Power ON</b> at the top.', ok: x => x.running},
    {t: 'The rod side is filled with air (blue), holding the piston in. Now <b>press and hold the valve 1V</b> — you are pushing its manual override.', hl: ['1V'], sticky: true, ok: x => x.running && x.ext('1A')},
    {t: 'Let go. The spring shoves the valve back and the piston retracts.', sticky: true, ok: x => x.running && x.ret('1A')}
  ],
  learned: ['Air on the cap side extends, air on the rod side retracts — and the other side must exhaust.', 'A 5/2 valve has 5 ports and 2 positions: 1 = supply, 2/4 = cylinder, 3/5 = exhaust.', 'A spring-return valve falls back to its rest position the moment the signal stops.'],
  quiz: [
    {q: 'What do the numbers in “5/2 valve” mean?', o: ['5 bar pressure, 2 cylinders', '5 ports, 2 switching positions', '5 mm ports, 2 solenoids'], a: 1, why: 'Count the connections (1, 2, 3, 4, 5) and the squares (2).'},
    {q: 'At rest the valve connects 1→2. Why does that keep the piston retracted?', o: ['Port 2 feeds the rod side, pushing the piston in', 'Port 2 is an exhaust', 'The spring inside the cylinder pulls it back'], a: 0, why: 'Port 2 is piped to the rod side. Pressure there pushes the piston back while the cap side exhausts through 4→5.'}
  ]
},
{
  id: 'direct', ch: 0, kind: 'guided', title: 'Electricity gives the orders',
  brief: 'Wire your first control circuit: a pushbutton that energises the valve solenoid. Hold the button, the cylinder extends.',
  solution: sol.direct, start: unwired, palette: [],
  intro: [
    {h: 'A circuit is a loop', html: `<p>Current only flows around a <b>closed loop</b>: out of the <b class="c-el">+24 V</b> rail, through a switch, through a <b>load</b> that does something useful, and back to the <b>0 V</b> rail.</p>
      <p>Break the loop anywhere and everything in it stops. That is all a switch does — it opens or closes the loop.</p>
      <p>The load matters. It is what limits the current. A loop with no load is a <b>short circuit</b>: the current shoots up and the fuse trips. Try it once, on purpose. It is safe here.</p>`},
    {h: 'Two new parts', html: figs(fig('pb_no', 'Pushbutton S1 (normally open)'), fig('sol', 'Solenoid coil Y1')) + `<p><b>S1</b> is a pushbutton. At rest its contact is open. While you hold it, terminals 3 and 4 are joined.</p>
      <p><b>Y1</b> is the coil of the valve's solenoid. Current through it makes a magnet that shifts the valve.</p>
      <p><b>Same label = same device.</b> The coil Y1 in the electrical diagram and the little solenoid marked Y1 on the valve are one physical part, drawn twice: once where it is wired, once where it acts.</p>`},
    {h: 'How to wire', html: `<ul><li><b>Drag</b> from one terminal dot to another to make a wire. Drop it anywhere on a rail to connect to the rail.</li><li><b>Click</b> a wire, then press <kbd>Delete</kbd> to remove it.</li><li>Wiring is done with the power <b>off</b> — just like on a real bench.</li></ul>
      <p>When the power is on, live wires glow red and moving dashes show where current is flowing.</p>`}
  ],
  steps: [
    {t: 'Drag a wire from the <b>+24V rail</b> to terminal <b>3</b> of pushbutton S1.', hl: ['PSU.pos', 'S1.3'], ok: x => x.q.linked('PSU.pos', 'S1.3')},
    {t: 'Wire terminal <b>4</b> of S1 to the top of coil <b>Y1</b>.', hl: ['S1.4', 'Y1.a'], ok: x => x.q.linked('S1.4', 'Y1.a')},
    {t: 'Close the loop: bottom of Y1 to the <b>0V rail</b>.', hl: ['Y1.b', 'PSU.neg'], ok: x => x.q.linked('Y1.b', 'PSU.neg')},
    {t: '<b>Power ON</b>, then hold S1 — click it, or hold key <kbd>1</kbd>.', hl: ['S1'], sticky: true, ok: x => x.running && x.sol('Y1') && x.ext('1A')},
    {t: 'Release S1 and watch the cylinder return.', sticky: true, ok: x => x.running && !x.sol('Y1') && x.ret('1A')}
  ],
  learned: ['Current needs a closed loop from +24 V through a load to 0 V.', 'A normally-open pushbutton (terminals 3–4) conducts only while pressed.', 'This is direct control: the current through the pushbutton is the very current that drives the solenoid.'],
  quiz: [
    {q: 'What happens if you wire +24 V straight to 0 V with nothing in between?', o: ['Nothing, no load means no current', 'A short circuit: huge current, the fuse trips', 'The cylinder extends faster'], a: 1, why: 'With no load to limit it, the current is enormous. The power supply protects itself by tripping.'},
    {q: 'You let go of S1 and the piston went back. Why?', o: ['The air ran out', 'The valve has a spring and no memory', 'The pushbutton reversed the current'], a: 1, why: 'No current → no magnet → the spring returns the valve → air goes to the rod side.'}
  ]
},
{
  id: 'pipe', ch: 0, kind: 'guided', title: 'Pipe it yourself',
  brief: 'So far the air side was ready-made. This time the wiring is done and the tubes are missing. Connect a single-acting cylinder to its 3/2 valve.',
  solution: sol.pipe, start: s => strip(s, null, w => w.k === 'p'), palette: [],
  intro: [
    {h: 'A simpler pair', html: figs(fig('cyl_sa', 'Single-acting cylinder'), fig('v32s', '3/2 valve, normally closed')) +
      `<p>A <b>single-acting cylinder</b> has one air port. Air pushes the piston out; a built-in spring pushes it back as soon as the air is let out. It only does work in one direction.</p>
      <p>It needs a simpler valve too: a <b>3/2 valve</b> — 3 ports, 2 positions. At rest, port 1 (supply) is blocked and the cylinder line 2 is open to exhaust 3. Energised, it connects 1→2.</p>`},
    {h: 'Tubes work like wires', html: `<ul><li><b>Drag</b> from one blue air port to another to lay a tube.</li><li>Tubes only fit air ports; wires only fit terminals. The bench will tell you if you mix them up.</li><li>Everything a tube joins shares one pressure.</li></ul>
      <p>One difference from wires: a port with <b>nothing connected is simply open</b>. If a valve switches supply air onto an open port, the air blows straight out into the room. Try it afterwards — pull off the cylinder tube and press the button.</p>`}
  ],
  steps: [
    {t: 'Drag a tube from the <b>air supply</b> triangle to port <b>1</b> of the valve.', hl: ['AIR.out', '1V.1'], ok: x => x.q.linked('AIR.out', '1V.1')},
    {t: 'Now from valve port <b>2</b> up to the <b>cylinder port</b>.', hl: ['1V.2', '1A.a'], ok: x => x.q.linked('1V.2', '1A.a')},
    {t: '<b>Power ON</b> and hold S1. Air pushes the piston out against its spring.', hl: ['S1'], sticky: true, ok: x => x.running && x.ext('1A')},
    {t: 'Let go. The valve vents the cylinder through port 3 and the spring does the rest.', sticky: true, ok: x => x.running && x.ret('1A') && !x.sol('Y1')}
  ],
  learned: ['A single-acting cylinder needs air on one side only; a spring returns it.', 'A 3/2 valve either feeds its outlet (1→2) or vents it (2→3).', 'An unconnected port is open to the atmosphere.'],
  quiz: [
    {q: 'Why is a 3/2 valve enough for a single-acting cylinder?', o: ['There is only one chamber to fill and to vent', 'It is stronger than a 5/2 valve', 'Single-acting cylinders need no exhaust'], a: 0, why: 'One working line: pressurise it to extend, vent it to let the spring return the piston.'},
    {q: 'The power fails while the piston is out. What happens?', o: ['It stays out', 'The spring valve vents the cylinder and the piston retracts', 'It extends further'], a: 1, why: 'No current → the valve spring returns it → line 2 vents → the cylinder spring pushes the piston home. Often that is exactly the safe behaviour you want.'}
  ]
},

/* ===== Chapter 2 ===== */
{
  id: 'or', ch: 1, kind: 'build', title: 'OR — either button will do',
  brief: 'A machine has two operator stations. Pressing S1 <b>or</b> S2 (or both) must extend the cylinder. Wire it, then send it to the test bench.',
  solution: sol.or, start: unwired, palette: [],
  intro: [
    {h: 'Logic with wires', html: `<p>Real machines rarely have one button. They combine signals: <i>this</i> or <i>that</i>, <i>this</i> and <i>that</i>. In electro-pneumatics you build that logic simply by how you arrange the contacts.</p>
      <p>We describe logic with a <b>truth table</b>. <b>0</b> means “not pressed” or “off”, <b>1</b> means “pressed” or “on”. One row for every possible combination of inputs.</p>`},
    {h: 'OR = side by side', html: tt(['S1', 'S2', 'Y1'], [[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) + `<p>For an OR, give the current <b>two separate paths</b> to the coil — one through each button. Contacts side by side like this are connected in <b>parallel</b>.</p>
      <p>The current only needs one open door. Either button closes a complete loop.</p>`}
  ],
  hints: ['Each button needs its own complete path from the +24 V rail to the coil.', 'Connect +24 V to terminal 3 of S1 and also to terminal 3 of S2. Then join both terminals 4 to the top of Y1, and Y1 down to 0 V.'],
  tests: [{kind: 'truth', title: 'Truth table', inputs: ['S1', 'S2'], out: ['sol', 'Y1'], fn: (a, b) => a || b}],
  learned: ['Contacts in parallel make an OR: any one of them completes the loop.', 'A truth table lists the output for every combination of inputs.'],
  quiz: [{q: 'Which of these is a natural job for an OR circuit?', o: ['A door that opens from a button on either side', 'A press that needs both hands on buttons', 'A light that goes off when a door opens'], a: 0, why: 'Either button alone should work — that is exactly OR.'}]
},
{
  id: 'and', ch: 1, kind: 'build', title: 'AND — both or nothing',
  brief: 'For safety, the cylinder may extend only while S1 <b>and</b> S2 are both held. One button alone must do nothing.',
  solution: sol.and, start: unwired, palette: [],
  intro: [
    {h: 'AND = one after the other', html: tt(['S1', 'S2', 'Y1'], [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]]) + `<p>For an AND there is only <b>one path</b>, and both contacts sit in it, one after the other. That is a <b>series</b> connection.</p>
      <p>The current has to get through two doors in a row. If either one is open, the loop is broken.</p>`},
    {h: 'Why machines use it', html: `<p>Put two start buttons far apart and wire them in series: the operator needs <b>both hands</b> on the buttons to start the machine, so neither hand can be in the danger zone. You will build exactly this press in the next chapter.</p>
      <p><b>Tip:</b> to hold two buttons at once, use the number keys (<kbd>1</kbd> and <kbd>2</kbd>), or <kbd>Shift</kbd>+click a button to lock it down.</p>`}
  ],
  hints: ['There should be just one path, and the current must pass through both buttons to reach the coil.', '+24 V → S1 (3 to 4) → S2 (3 to 4) → Y1 → 0 V. One single chain.'],
  tests: [{kind: 'truth', title: 'Truth table', inputs: ['S1', 'S2'], out: ['sol', 'Y1'], fn: (a, b) => a && b}],
  learned: ['Contacts in series make an AND: every one of them must be closed.', 'Two-hand start circuits use AND to keep hands out of danger.'],
  quiz: [{q: 'A two-hand press uses buttons wired in series. What does that guarantee?', o: ['The press runs twice as fast', 'The press only moves while both buttons are held', 'Either button can start the press'], a: 1, why: 'Series = AND. Release either button and the loop opens.'}]
},
{
  id: 'mix', ch: 1, kind: 'build', title: 'Read the table, build the circuit',
  brief: 'Here is only a truth table. Work out the logic, take parts from the bin on the left, and build a circuit that matches every row.',
  solution: sol.mix, start: bare, palette: ['pb_no', 'pb_nc', 'sol', 'lamp'],
  intro: [
    {h: 'The job', html: tt(['S1', 'S2', 'S3', 'Y1'], [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [1, 1, 0, 0], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]]) +
      `<p>Look for the pattern before you touch a wire. In which rows is Y1 = 1? What do those rows have in common? Is there an input that <i>must</i> be 1 every time?</p>`},
    {h: 'Using the parts bin', html: `<ul><li><b>Drag</b> a part from the bin onto the sheet.</li><li>Parts are numbered as you add them: S1, S2, S3… The test bench finds parts by these labels, so the solenoid coil must be called <b>Y1</b> to match the valve.</li><li><b>Click</b> a part to see what it is, rename it or delete it.</li><li>Series groups and parallel groups can be nested: a parallel pair can sit in series with something else.</li></ul>`}
  ],
  hints: ['Y1 is never 1 unless S3 is 1. So S3 is in series with everything else.', 'With S3 = 1, either S1 or S2 is enough. So: (S1 OR S2) AND S3.', 'Put S1 and S2 in parallel from the +24 V rail, join their outputs, then run that through S3 to the coil Y1 and on to 0 V.'],
  tests: [{kind: 'truth', title: 'Truth table', inputs: ['S1', 'S2', 'S3'], out: ['sol', 'Y1'], fn: (a, b, c) => (a || b) && c}],
  learned: ['Any truth table can be turned into series and parallel groups.', 'An input that must always be 1 belongs in series with the rest.'],
  quiz: [{q: 'In words, when does this circuit switch Y1 on?', o: ['S1 and S2 and S3 all pressed', 'S3 pressed, together with S1 or S2', 'Any one button pressed'], a: 1, why: 'S3 AND (S1 OR S2) — a parallel pair in series with one more contact.'}]
},

/* ===== Chapter 3 ===== */
{
  id: 'memory', ch: 2, kind: 'guided', title: 'The valve that remembers',
  brief: 'A valve with a solenoid on both ends and no spring. Find out what it does with short pulses — and what happens when both ends pull at once.',
  solution: sol.memory, start: s => clone(s), palette: [],
  intro: [
    {h: 'No spring, no forgetting', html: figs(fig('v52d', '5/2 valve, double solenoid')) + `<p>Take away the spring and put a second solenoid in its place. Now nothing pushes the valve back by itself. It <b>stays where the last signal left it</b>.</p>
      <p>A short pulse on Y1 switches it one way. It stays. A short pulse on Y2 switches it back. This kind of valve is a <b>memory</b>, and it is the reason a tap on a button can start a whole stroke.</p>`},
    {h: 'When both pull', html: `<p>What if Y1 and Y2 are both energised? The two magnets pull against each other and the valve <b>does not move</b>. Whichever signal arrived first keeps its position.</p><p>Remember that. It causes surprises in real machines, and you will meet one in this chapter.</p>`}
  ],
  steps: [
    {t: '<b>Power ON</b>, then just <b>tap</b> S1 — press and let go.', hl: ['S1'], sticky: true, ok: x => x.running && x.ext('1A') && !x.sol('Y1')},
    {t: 'Y1 is off, yet the piston stays out. The valve remembered. Now tap <b>S2</b>.', hl: ['S2'], sticky: true, ok: x => x.running && x.ret('1A') && !x.sol('Y2')},
    {t: 'Now the conflict: <b>hold S2 down</b>, and while holding it press <b>S1</b> as well (keys <kbd>2</kbd> then <kbd>1</kbd>).', sticky: true, ok: x => x.running && x.sol('Y1') && x.sol('Y2') && x.ret('1A')},
    {t: 'Both coils are live and nothing moves: the first signal wins. Release both buttons.', sticky: true, ok: x => x.running && !x.sol('Y1') && !x.sol('Y2')}
  ],
  learned: ['A double-solenoid valve keeps its position without any signal — it stores the last command.', 'A short pulse is enough to switch it.', 'If both solenoids are energised, it stays put: the first signal dominates.'],
  quiz: [
    {q: 'Both solenoids of a double-solenoid 5/2 valve are energised. What does the valve do?', o: ['It switches back and forth rapidly', 'It moves to a middle position', 'It stays in the position it already has'], a: 2, why: 'The forces cancel. The valve keeps whatever position the first signal gave it.'}
  ]
},
{
  id: 'limit', ch: 2, kind: 'guided', title: 'Limit switches: the machine feels',
  brief: 'Make the cylinder come back by itself. A limit switch at the end of the stroke will tell the valve “I have arrived”. Then tame the speed.',
  solution: sol.limit, start: s => strip(s, null, w => ['S2', 'Y2'].includes(w.a.c) || ['S2', 'Y2'].includes(w.b.c)), palette: [],
  intro: [
    {h: 'A switch pressed by the machine', html: figs(fig('ls_no', 'Limit switch S2', {label: 'S2'})) + `<p>A <b>limit switch</b> is a contact with a little roller instead of a button. When the piston rod arrives, it pushes the roller.</p>
      <p>Look at the cylinder: above the rod there is a mark labelled <b>S2</b> at the fully extended position. That is where the switch is bolted on. Again: <b>same label = same device</b>. The switch is wired in the electrical diagram and acts at the cylinder.</p>`},
    {h: 'Controlling speed', html: figs(fig('fcv', 'One-way flow control valve')) + `<p>A piston moves as fast as air can get <i>out</i> of the other side. So to slow it down you throttle the <b>exhaust</b>.</p>
      <p>The one-way flow control valve does this neatly: air heading for the cylinder lifts a check ball and passes freely, but air coming back out has to squeeze through an adjustable throttle. The piston then moves against a cushion of air, smoothly, at a speed you choose.</p>
      <p><b>1F2</b> sits in the rod-side line, so it controls the <b>extend</b> stroke. <b>1F1</b> controls the return.</p>`}
  ],
  steps: [
    {t: 'S1 → Y1 is already wired. Now wire <b>+24V</b> to terminal <b>3</b> of limit switch S2.', hl: ['PSU.pos', 'S2.3'], ok: x => x.q.linked('PSU.pos', 'S2.3')},
    {t: 'S2 terminal <b>4</b> → top of coil <b>Y2</b>.', hl: ['S2.4', 'Y2.a'], ok: x => x.q.linked('S2.4', 'Y2.a')},
    {t: 'Bottom of Y2 → <b>0V</b>.', hl: ['Y2.b', 'PSU.neg'], ok: x => x.q.linked('Y2.b', 'PSU.neg')},
    {t: '<b>Power ON</b> and tap S1. The piston travels out, presses S2, and comes back on its own.', hl: ['S1'], sticky: true, ok: x => x.running && x.cycles('1A') >= 1 && x.ret('1A')},
    {t: 'Click flow control <b>1F2</b> and turn it down <b>below 30 %</b>. Tap S1 again and compare the extend stroke.', hl: ['1F2'], sticky: true, ok: x => x.running && x.comp('1F2').props.open < 30 && x.cycles('1A') >= 2 && x.ret('1A')}
  ],
  learned: ['A limit switch is mounted on the cylinder by giving both the same label.', 'Tap a button → piston out → limit switch → piston back: your first automatic cycle.', 'Speed is set by throttling the exhaust air with a one-way flow control valve.'],
  quiz: [
    {q: 'You want a slower extend stroke. Which air do you throttle?', o: ['The air leaving the rod side', 'The air entering the cap side', 'The supply to the whole valve'], a: 0, why: 'Throttle the exhaust. The piston then pushes against a cushion and moves smoothly; throttling the supply makes it jerky.'}
  ]
},
{
  id: 'press1', ch: 2, kind: 'build', title: 'Practical task 1 — the press, direct control', scene: 'press',
  brief: 'The press may only come down while <b>both</b> start buttons S1 and S2 are held. Limit switch S3 at the bottom sends it back up automatically, and pushbutton S4 can release it by hand if S3 ever fails.',
  solution: sol.pressDirect, start: unwired, palette: [],
  intro: [
    {h: 'The pneumatic press', html: `<p>This is a real workshop task. A press is dangerous, so the requirements are about protecting the operator:</p>
      <ul><li>The press may only be started with <b>two switches at the same time</b>, to keep both hands away from the tool.</li><li>It is <b>released automatically</b> by a limit switch at the bottom of the stroke.</li><li><b>Another switch</b> must be able to release the press in case the limit switch fails.</li></ul>
      <p>The valve is a double-solenoid 5/2: <b>Y1</b> sends the press down, <b>Y2</b> sends it up. Both strokes have flow control.</p>`},
    {h: 'Plan before you wire', html: `<p>Turn each requirement into logic, one coil at a time.</p>
      <ul><li><b>Y1</b> (down): S1 <b>AND</b> S2 → series.</li><li><b>Y2</b> (up): S3 <b>OR</b> S4 → parallel.</li></ul>
      <p>The test bench will try one hand, then two, then it will secretly break limit switch S3 to see whether S4 can still rescue the press.</p>`}
  ],
  hints: ['Two separate jobs: one branch for Y1, one group for Y2. Do them one at a time.', 'Y1: +24 V → S1 → S2 → Y1 → 0 V, all in one chain.', 'Y2: +24 V to terminal 3 of both S3 and S4, both terminals 4 to the top of Y2, then Y2 to 0 V.'],
  tests: pressTests,
  learned: ['Requirements become logic: “both” → series, “either” → parallel.', 'A double-solenoid valve lets short signals from limit switches drive a full stroke.', 'Safety functions get a backup: S4 does the job of S3 if it fails.'],
  quiz: [
    {q: 'The operator keeps both buttons held after the press reaches the bottom. What does this circuit do?', o: ['The press goes up anyway', 'The press stays down until the buttons are released', 'The fuse trips'], a: 1, why: 'Y1 is still energised when S3 energises Y2. With both solenoids on, the valve does not move — the first signal wins. Let go, Y1 drops, and Y2 takes over.'}
  ]
},

/* ===== Chapter 4 ===== */
{
  id: 'relay', ch: 3, kind: 'guided', title: 'Meet the relay',
  brief: 'A relay is a switch operated by electricity instead of a finger. Wire one so that the pushbutton commands the relay, and the relay commands the valve.',
  solution: sol.relay, start: unwired, palette: [],
  intro: [
    {h: 'A switch with a coil', html: figs(fig('relay', 'Relay coil K1'), fig('k_no', 'Contact of K1 (NO)', {label: 'K1'}), fig('k_nc', 'Contact of K1 (NC)', {label: 'K1'})) +
      `<p>A relay has two halves. The <b>coil</b> (terminals A1, A2) is an electromagnet. Its <b>contacts</b> are ordinary switches, moved by that magnet instead of by a finger.</p>
      <p>Energise coil K1 and <i>every</i> contact labelled K1 changes over at once: normally-open ones close, normally-closed ones open. They can sit in completely different branches of the circuit.</p>`},
    {h: 'Indirect control', html: `<p>Until now the pushbutton current ran straight through the solenoid: <b>direct control</b>. With a relay you get two loops:</p>
      <ul><li>the <b>control circuit</b>: pushbutton → relay coil</li><li>the <b>power circuit</b>: relay contact → solenoid</li></ul>
      <p>That is <b>indirect control</b>. It looks like extra work, but it buys a lot: a tiny switch can command a big load, one coil can operate many contacts at once, and — next chapter — a relay can hold itself on, which gives the circuit a memory.</p>
      <p>How to tell them apart on a drawing: if a solenoid coil is switched by a relay contact, it is indirect.</p>`}
  ],
  steps: [
    {t: 'Build the <b>control circuit</b>: +24V → S1 (3–4) → coil K1 (A1–A2) → 0V.', hl: ['PSU.pos', 'S1.3', 'S1.4', 'K1.A1', 'K1.A2', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'S1.3'], ['S1.4', 'K1.A1'], ['K1.A2', 'PSU.neg']])},
    {t: 'Build the <b>power circuit</b>: +24V → contact K1 (3–4) → coil Y1 → 0V.', hl: ['PSU.pos', 'K1a.3', 'K1a.4', 'Y1.a', 'Y1.b', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'K1a.3'], ['K1a.4', 'Y1.a'], ['Y1.b', 'PSU.neg']])},
    {t: '<b>Power ON</b> and hold S1. Listen for the relay click, then watch its contact close and the valve shift.', hl: ['S1'], sticky: true, ok: x => x.running && x.relay('K1') && x.ext('1A')},
    {t: 'Try the <b>¼× speed</b> button at the top and press S1 again — you can see the relay pull in a moment before the valve moves. Release to finish.', sticky: true, ok: x => x.running && !x.relay('K1') && x.ret('1A')}
  ],
  learned: ['A relay coil (A1–A2) operates every contact that carries its label.', 'Indirect control: the pushbutton switches a relay, the relay switches the solenoid.', 'Relays take a few milliseconds to act — signals ripple through a circuit in order.'],
  quiz: [
    {q: 'K1 appears twice in the diagram. What is the difference between K1 in branch 1 and K1 in branch 2?', o: ['They are two different relays', 'Branch 1 is the coil; branch 2 is a contact operated by that coil', 'Branch 1 is 24 V, branch 2 is 0 V'], a: 1, why: 'One device, drawn where each part does its work: the coil in the control circuit, the contact in the power circuit.'},
    {q: 'How do you recognise indirect control in a circuit diagram?', o: ['It has more than one pushbutton', 'The solenoid coils are switched by relay contacts, not by the pushbuttons themselves', 'It uses a double-solenoid valve'], a: 1, why: 'Direct: button → solenoid. Indirect: button → relay coil, relay contact → solenoid.'}
  ]
},
{
  id: 'press2', ch: 3, kind: 'build', title: 'Practical task 2 — the press, indirect control', scene: 'press',
  brief: 'Same press, same rules — but now the pushbuttons and the limit switch may only switch relays. Relay K1 drives Y1, relay K2 drives Y2.',
  solution: sol.pressIndirect, start: unwired, palette: [],
  intro: [
    {h: 'Same machine, grown-up wiring', html: `<p>The requirements have not changed: two-hand start, automatic return from limit switch S3, manual release with S4.</p>
      <p>What changes is the structure. The logic now lives in the <b>control circuit</b> and acts on relay coils:</p>
      <ul><li><b>K1</b> = S1 AND S2</li><li><b>K2</b> = S3 OR S4</li></ul>
      <p>The <b>power circuit</b> is then trivial: a K1 contact feeds Y1, a K2 contact feeds Y2.</p>`},
    {h: 'Reading a bigger diagram', html: `<p>Diagrams like this are read left to right, branch by branch. Each vertical path between the rails is one <b>branch</b> (current path), usually numbered along the top.</p>
      <p>Under a relay coil, real drawings put a small <b>contact table</b> that says in which branches that relay's contacts sit — so you can find them without hunting.</p>`}
  ],
  hints: ['Wire the logic exactly as in the direct version, but end each group on a relay coil instead of a solenoid.', 'K1: +24 V → S1 → S2 → K1 (A1–A2) → 0 V. K2: S3 and S4 in parallel, both feeding K2.', 'Then two simple branches: +24 V → contact K1 → Y1 → 0 V, and +24 V → contact K2 → Y2 → 0 V.'],
  tests: pressTests.concat([{kind: 'rule', title: 'Indirect control', why: 'A solenoid coil is still wired straight to a pushbutton or limit switch. Only relay contacts may switch Y1 and Y2.',
    check: q => q.count('relay') >= 2 && [...q.byId.values()].filter(c => c.type === 'sol').every(c => ['a', 'b'].every(p => { const t = q.netTypes(c.id + '.' + p); return !['pb_no', 'pb_nc', 'ls_no', 'ls_nc'].some(k => t.has(k)); }))}]),
  learned: ['Logic goes in the control circuit and ends on relay coils.', 'The power circuit just passes each relay state on to a solenoid.', 'The behaviour is identical to direct control — the structure is what scales.'],
  quiz: [
    {q: 'Under coil K1 the sheet draws a small table with a “2” on its left side. What does it tell you?', o: ['K1 needs 2 volts to pull in', 'A normally-open contact of K1 sits in branch 2', 'K1 has two coils'], a: 1, why: 'It is the contact table: left column = branches with normally-open contacts of this relay, right column = normally-closed ones. Branch numbers run along the top rail.'},
    {q: 'What is the difference between K1 and Y1?', o: ['K1 is a relay that switches electrical contacts; Y1 is a solenoid that shifts an air valve', 'K1 is for 24 V, Y1 is for 230 V', 'There is none, both are relays'], a: 0, why: 'Both are coils, but K-coils move contacts and Y-coils move valve spools.'}
  ]
},
{
  id: 'convert', ch: 3, kind: 'build', title: 'Class work — throw the relay out',
  brief: 'This circuit controls the valve <b>indirectly</b> through relay K1. Study it, then rebuild it as <b>direct control</b>: same behaviour, no relay.',
  solution: sol.classDirect, start: () => sol.classIndirect(), palette: ['pb_no', 'pb_nc', 'sol', 'relay', 'k_no'],
  intro: [
    {h: 'Read it first', html: `<p>Before changing anything, switch the power on and play with the circuit. Work out the answer to the class-work question: <i>how do you extend and retract this cylinder?</i></p>
      <p>Then predict the truth table for S1, S2, S3 → Y1. You can check your prediction by pressing the buttons.</p>`},
    {h: 'Then convert it', html: `<p>Converting indirect to direct is mechanical once you see it: whatever logic feeds the relay coil can feed the solenoid coil instead. The relay and its contact simply drop out.</p>
      <p>Delete parts by clicking them and pressing <kbd>Delete</kbd>. Delete wires the same way. The test bench checks the full truth table — and that no relay is left.</p>`}
  ],
  hints: ['The relay coil is fed by “(S1 AND S2) OR S3”. That whole group can feed Y1 directly.', 'Delete K1 and its contact. Move Y1 to where the relay coil was: S1 → S2 → Y1, with S3 in parallel reaching the top of Y1 too. Y1 → 0 V.'],
  tests: [
    {kind: 'truth', title: 'Truth table', inputs: ['S1', 'S2', 'S3'], out: ['sol', 'Y1'], fn: (a, b, c) => (a && b) || c},
    {kind: 'rule', title: 'Direct control', why: 'There is still a relay coil in the circuit. Direct control means the switches feed the solenoid themselves.', check: q => q.count('relay') === 0}
  ],
  learned: ['To read a circuit, follow each path from +24 V down to a coil and note which contacts it passes.', 'Indirect ↔ direct conversion keeps the logic and swaps where it ends.'],
  quiz: [
    {q: 'S1 = 1, S2 = 0, S3 = 0. What is Y1?', o: ['0', '1'], a: 0, why: 'S1 alone cannot complete the series path through S2, and S3 is open.'},
    {q: 'S1 = 0, S2 = 0, S3 = 1. What is Y1?', o: ['0', '1'], a: 1, why: 'S3 has its own parallel path, so it is enough by itself.'}
  ]
},

/* ===== Chapter 5 ===== */
{
  id: 'latch', ch: 4, kind: 'guided', title: 'Latching: a circuit that remembers',
  brief: 'Tap START and the lamp must stay on after you let go. Tap STOP and it goes off. The trick: let the relay feed its own coil.',
  solution: sol.latchOff, start: s => strip(s, null, () => true), palette: [],
  intro: [
    {h: 'Holding a signal', html: `<p>A pushbutton only gives a signal while your finger is on it. Often that is not enough: you want to tap START and walk away.</p>
      <p><b>Latching</b> (also called self-holding) keeps a relay energised after the pushbutton that started it has been released.</p>`},
    {h: 'How the relay holds itself', html: `<p>Put one of the relay's own normally-open contacts <b>in parallel with the start button</b>.</p>
      <ol><li>You press START. Current reaches the coil. The relay pulls in.</li><li>Its contact closes — and now there is a <i>second</i> path to the coil that does not need your finger.</li><li>You let go. The coil keeps feeding itself through its own contact.</li></ol>
      <p>To switch it off, break that loop: a normally-closed STOP button in the path does it.</p>`}
  ],
  steps: [
    {t: 'Start with the plain version. Wire: +24V → S1 (3–4) → S2 (1–2) → coil K1 → 0V.', hl: ['PSU.pos', 'S1.3', 'S1.4', 'S2.1', 'S2.2', 'K1.A1', 'K1.A2', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'S1.3'], ['S1.4', 'S2.1'], ['S2.2', 'K1.A1'], ['K1.A2', 'PSU.neg']])},
    {t: 'Lamp branch: +24V → the <b>right-hand</b> K1 contact → lamp H1 → 0V.', hl: ['PSU.pos', 'K1b.3', 'K1b.4', 'H1.a', 'H1.b', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'K1b.3'], ['K1b.4', 'H1.a'], ['H1.b', 'PSU.neg']])},
    {t: '<b>Power ON</b> and hold S1. The lamp lights — but only while you hold. No memory yet.', hl: ['S1'], sticky: true, ok: x => x.running && x.lamp('H1') && x.pressed('S1')},
    {t: '<b>Power OFF.</b> Add the holding contact: wire the middle K1 contact in parallel with S1 (+24V → its terminal 3, its terminal 4 → the wire between S1 and S2).', hl: ['PSU.pos', 'K1a.3', 'K1a.4', 'S2.1'],
      ok: x => links(x, [['PSU.pos', 'K1a.3'], ['K1a.4', 'S2.1']])},
    {t: '<b>Power ON</b> and just tap S1. The lamp stays on: the relay is holding itself.', hl: ['S1'], sticky: true, ok: x => x.running && x.lamp('H1') && !x.pressed('S1')},
    {t: 'Press <b>S2</b> (STOP) to break the loop.', hl: ['S2'], sticky: true, ok: x => x.running && !x.relay('K1') && !x.pressed('S2')}
  ],
  learned: ['Latching: a relay contact in parallel with the start button keeps the coil energised.', 'A normally-closed stop button breaks the holding path.', 'A latching relay is a one-bit memory made from ordinary parts.'],
  quiz: [
    {q: 'Which contact is the holding (latching) contact?', o: ['The K1 contact in parallel with the start button', 'The K1 contact feeding the lamp', 'The stop button S2'], a: 0, why: 'It bridges the start button so the coil keeps its supply after the button opens.'},
    {q: 'Why is the STOP button a normally-closed type?', o: ['It is cheaper', 'It must pass current normally and interrupt it when pressed', 'So it lights the lamp'], a: 1, why: 'And there is a safety bonus: if a wire to the stop button breaks, the machine stops by itself.'}
  ]
},
{
  id: 'dominant', ch: 4, kind: 'build', title: 'Dominant ON or dominant OFF?',
  brief: 'What if START and STOP are pressed together? The circuit on the sheet is <b>dominant OFF</b>: stop wins. Rewire it into a <b>dominant ON</b> latch, where start wins.',
  solution: sol.latchOn, start: () => sol.latchOff(), palette: [],
  intro: [
    {h: 'Who wins?', html: `<p>Every latch has to answer one question: if ON and OFF are pressed at the same moment, what happens?</p>
      <ul><li><b>Dominant OFF</b> — the stop button is in series with <i>everything</i>, start button included. Press both: no current reaches the coil. Stop wins.</li>
      <li><b>Dominant ON</b> — the stop button sits <i>only in the holding branch</i>, next to the relay contact. Press both: the start button still feeds the coil directly. Start wins.</li></ul>`},
    {h: 'Your job', html: `<p>The sheet shows the dominant-OFF latch from the last lesson, ready wired. Move the stop button S2 so it interrupts only the holding path.</p>
      <p>You can drag S2 to a new spot; wires follow. Click a wire and press <kbd>Delete</kbd> to remove it.</p>
      <p>Which type belongs on a real machine? Almost always dominant OFF — when someone hits stop, stop has to win.</p>`}
  ],
  hints: ['S1 should reach the coil directly, without passing through S2.', 'The holding branch becomes: +24 V → K1 contact → S2 (1–2) → coil K1. The start branch is just: +24 V → S1 → coil K1.'],
  tests: [{kind: 'seq', title: 'Latch behaviour', steps: [
    {say: 'Tap S1 — the relay latches', tap: ['S1'], run: 0.3, expect: [['relay', 'K1', true], ['lamp', 'H1', true]], why: 'After tapping S1 the relay did not stay on. The holding contact must bridge S1.'},
    {say: 'Tap S2 — the latch releases', tap: ['S2'], run: 0.3, expect: [['relay', 'K1', false]], why: 'S2 did not release the latch. It has to interrupt the holding branch.'},
    {say: 'Hold S1 and S2 together — ON must win', press: ['S1', 'S2'], run: 0.3, expect: [['relay', 'K1', true]], why: 'With both pressed the relay is off — that is still dominant OFF. S1 must reach the coil without going through S2.'},
    {say: 'Release S1 while S2 is still held — relay drops', release: ['S1'], run: 0.3, expect: [['relay', 'K1', false]], why: 'The relay stayed on although S2 is pressed and S1 released. S2 must sit in the holding branch.'},
    {say: 'Release S2 — it stays off', release: ['S2'], run: 0.3, expect: [['relay', 'K1', false]], why: 'The relay came back on by itself.'}
  ]}],
  learned: ['Dominant OFF: stop button in series with everything — stop wins.', 'Dominant ON: stop button only in the holding branch — start wins.', 'Machines use dominant OFF so that stopping always works.'],
  quiz: [{q: 'An emergency-stop circuit should be…', o: ['dominant ON', 'dominant OFF', 'it does not matter'], a: 1, why: 'Nothing may override a stop command.'}]
},
{
  id: 'feeder', ch: 4, kind: 'build', title: 'Practical task 3 — the magazine feeder', scene: 'feeder',
  brief: 'One <b>tap</b> on S1 must push a part out of the magazine: the slide travels all the way forward, then returns by itself. The valve has a spring, so it cannot remember — a latching relay has to.',
  solution: sol.feeder, start: unwired, palette: [],
  intro: [
    {h: 'The feeder', html: `<p>Parts sit stacked in a gravity-feed magazine. A slide, driven by cylinder 1A, pushes the bottom part out to a clamping device. After the slide reaches its forward end position it must return to the start, and the next part drops down.</p>
      <p>The valve is a <b>single-solenoid</b> 5/2 with spring return. The moment Y1 loses power, the slide comes back. So Y1 has to stay on for the whole forward stroke, even though the operator only taps the button.</p>
      <p><b>Hint from the task sheet:</b> a relay with latching function is to be used for signal storage.</p>`},
    {h: 'Plan it', html: `<ul><li><b>Set</b> the latch: pushbutton S1 with a K1 holding contact in parallel.</li><li><b>Reset</b> the latch: limit switch <b>S2</b> at the forward end. It is a normally-closed type, so it conducts until the slide arrives and then breaks the holding path — it does the job of a stop button.</li><li><b>Use</b> the latch: a second K1 contact feeds Y1.</li></ul>`}
  ],
  hints: ['It is the latching circuit from two lessons ago, with the limit switch S2 where the stop button was, and Y1 where the lamp was.', 'Control: +24 V → S1 → S2 (1–2) → K1 → 0 V, with the first K1 contact in parallel with S1.', 'Power: +24 V → second K1 contact → Y1 → 0 V.'],
  tests: [{kind: 'seq', title: 'One tap, one part', steps: [
    {say: 'Tap S1 — the slide goes fully forward and returns', tap: ['S1'], run: 4, expect: [['ret', '1A'], ['cycles', '1A', 1]], why: 'One tap must give exactly one full stroke out and back. If the slide only twitched, the relay is not latching; if it stayed out, S2 is not breaking the latch.'},
    {say: 'It waits at the start position', run: 1.5, expect: [['still', '1A']], why: 'The slide started again by itself.'},
    {say: 'Tap again — the next part', tap: ['S1'], run: 4, expect: [['ret', '1A'], ['cycles', '1A', 2]], why: 'The second tap did not give a second full stroke.'}
  ]}],
  learned: ['A spring-return valve plus a latching relay behaves like a memory valve.', 'A normally-closed limit switch can unlatch a circuit automatically.', 'Set, reset, use: the three parts of every latching circuit.'],
  quiz: [
    {q: 'Which switch releases (unlatches) this circuit?', o: ['S1', 'The limit switch S2', 'The K1 contact in front of Y1'], a: 1, why: 'When the slide reaches the forward end, S2 opens and the coil loses its supply.'},
    {q: 'Is this system controlled directly or indirectly?', o: ['Directly', 'Indirectly — Y1 is switched by a contact of relay K1'], a: 1, why: 'The pushbutton never carries the solenoid current.'}
  ]
},
{
  id: 'auto', ch: 4, kind: 'build', title: 'Project — the automatic press', scene: 'press',
  brief: 'Tap <b>START (S1)</b> and the press keeps stamping, stroke after stroke, on its own. Tap <b>STOP (S2)</b> and it finishes its stroke, returns to the top and waits. Stop must win over start. You get the pneumatics and an empty panel.',
  solution: sol.auto, start: bare, palette: ['pb_no', 'pb_nc', 'ls_no', 'ls_nc', 'relay', 'k_no', 'k_nc', 'sol', 'lamp'],
  intro: [
    {h: 'Everything at once', html: `<p>No recipe this time. You have a double-solenoid valve (Y1 down, Y2 up) and two limit-switch mounts on the cylinder: <b>S3</b> at the top (retracted) and <b>S4</b> at the bottom (extended).</p>
      <p>Requirements:</p><ul><li>Tap S1 → continuous cycling.</li><li>Tap S2 → the press completes its stroke, returns to the top, and stays there.</li><li>S2 held → S1 does nothing (dominant OFF).</li></ul>`},
    {h: 'Think in three blocks', html: `<ol><li><b>“The machine is running”</b> — a memory. A latching relay K1, set by S1, reset by a normally-closed S2.</li>
      <li><b>Go down</b> — when the machine is running <b>and</b> the press is at the top. Which contacts, in series, feed Y1?</li>
      <li><b>Go up</b> — when the press is at the bottom. What feeds Y2?</li></ol>
      <p>Labels matter: limit switches must be called <b>S3</b> and <b>S4</b> to sit on the cylinder marks, relay contacts must carry their coil's label, and the coils must be <b>Y1</b> and <b>Y2</b>. Click any part to rename it.</p>`}
  ],
  hints: ['Block 1 is the dominant-OFF latch: +24 V → S1 → S2 (NC) → K1 → 0 V, with a K1 contact bridging S1.', 'Block 2: +24 V → K1 contact → limit switch S3 (NO, top) → Y1 → 0 V. Running AND at the top.', 'Block 3: +24 V → limit switch S4 (NO, bottom) → Y2 → 0 V. The valve remembers each command, so short pulses from the limit switches are enough.'],
  tests: [
    {kind: 'seq', title: 'Continuous cycle with stop', steps: [
      {say: 'Tap S1 — the press cycles on its own', tap: ['S1'], run: 9, expect: [['cyclesMin', '1A', 2]], why: 'After one tap on S1 the press should keep stamping. It needs a latched “running” relay, and Y1 must fire each time the press is back at the top (S3).'},
      {say: 'Tap S2 — it finishes and returns to the top', tap: ['S2'], run: 5, expect: [['ret', '1A']], why: 'After STOP the press did not come to rest at the top.'},
      {say: 'It stays there', run: 4, expect: [['still', '1A']], why: 'The press kept cycling after STOP. S2 must unlatch the “running” relay.'}
    ]},
    {kind: 'seq', title: 'Stop wins over start', steps: [
      {say: 'Hold S2 and tap S1 — nothing may move', press: ['S2'], tap: ['S1'], run: 3, expect: [['cycles', '1A', 0], ['ret', '1A']], why: 'The press started although STOP was held. Put S2 in series with both the start button and the holding contact.'}
    ]}
  ],
  learned: ['Big circuits are small blocks: a memory, plus conditions for each movement.', 'Limit switches at both ends turn a single stroke into an endless cycle.', 'You can now read and build every circuit in this module.'],
  quiz: [{q: 'STOP is tapped while the press is on its way down. What happens?', o: ['It freezes in place', 'It reverses immediately', 'It completes the stroke, returns to the top and stays there'], a: 2, why: 'K1 drops, so Y1 will not fire again. But the valve remembers “down”, the press reaches S4, Y2 sends it up, and there it waits.'}]
},

/* ===== Chapter 6: time and counting ===== */
{
  id: 'timer', ch: 5, kind: 'guided', title: 'The timer relay: wait, then act',
  brief: 'A glued joint needs pressure for a moment. Make the cylinder go out, <b>wait</b> at the end, then come back — with a relay that pulls in late.',
  solution: sol.timer, start: s => strip(s, null, w => ['S2', 'KT1', 'KT1a', 'Y2'].some(i => w.a.c === i || w.b.c === i)), palette: [],
  intro: [
    {h: 'A relay with patience', html: figs(fig('timer', 'Timer relay KT1, on-delay', {label: 'KT1', delay: 2}), fig('k_no', 'Its contact', {label: 'KT1'})) +
      `<p>An <b>on-delay timer relay</b> looks like a relay with an extra crossed box. You energise its coil — and nothing happens. Only when the coil has been live for the <b>whole set time</b> do its contacts change over.</p>
      <p>Take the voltage away and they drop back immediately. The clock starts from zero next time.</p>
      <p>Its contacts are ordinary relay contacts carrying the timer's label.</p>`},
    {h: 'Dwell time', html: `<p>Here the limit switch S2 does not fire Y2 directly, as it did before. It starts the timer. The piston sits at the end of its stroke while the clock runs; when the timer pulls in, its contact energises Y2 and the piston returns.</p>
      <p>That pause is called <b>dwell time</b>. You find it wherever something has to be pressed, glued, heated or held for a while.</p>
      <p>Watch the <b>signal recorder</b> on the right while it runs: you can see S2 come on, KT1 follow two seconds later, and Y2 fire at that instant.</p>`}
  ],
  steps: [
    {t: 'Let the limit switch start the clock: +24V → S2 (3–4) → timer coil KT1 (A1–A2) → 0V.', hl: ['PSU.pos', 'S2.3', 'S2.4', 'KT1.A1', 'KT1.A2', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'S2.3'], ['S2.4', 'KT1.A1'], ['KT1.A2', 'PSU.neg']])},
    {t: 'Let the timer send the piston back: +24V → contact KT1 (3–4) → coil Y2 → 0V.', hl: ['PSU.pos', 'KT1a.3', 'KT1a.4', 'Y2.a', 'Y2.b', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'KT1a.3'], ['KT1a.4', 'Y2.a'], ['Y2.b', 'PSU.neg']])},
    {t: '<b>Power ON</b> and tap S1. The piston goes out, waits 2 seconds while the timer counts down, and returns.', hl: ['S1'], sticky: true, ok: x => x.running && x.cycles('1A') >= 1 && x.ret('1A')},
    {t: 'Click the timer <b>KT1</b> and set its delay to <b>4 s or more</b>. Tap S1 again and feel the difference.', hl: ['KT1'], sticky: true, ok: x => x.running && x.comp('KT1').props.delay >= 4 && x.cycles('1A') >= 2 && x.ret('1A')}
  ],
  learned: ['An on-delay timer switches its contacts only after its coil has been energised for the set time.', 'When the coil loses power the contacts drop back at once.', 'Dwell time: limit switch starts the timer, the timer starts the return stroke.'],
  quiz: [
    {q: 'The timer is set to 3 s. Its coil is energised for 2 s, then switched off. What do its contacts do?', o: ['Switch after one more second', 'Nothing — the time never ran out, and the clock resets', 'Switch immediately when the coil goes off'], a: 1, why: 'On-delay means the coil must stay energised for the full time. Interrupt it and it starts again from zero.'}
  ]
},
{
  id: 'dwell', ch: 5, kind: 'build', title: 'The glue press', scene: 'press',
  brief: 'One <b>tap</b> on S1: the press comes down, holds the workpiece for <b>3 seconds</b>, and goes back up by itself. The valve has a spring, so a latching relay has to hold it down — and the timer has to release the latch.',
  solution: sol.dwell, start: unwired, palette: [],
  intro: [
    {h: 'Two ideas, one machine', html: `<p>You have built both halves of this already:</p>
      <ul><li>the <b>latch</b> from the magazine feeder: tap S1, relay K1 holds itself, a K1 contact keeps Y1 energised;</li><li>the <b>timer</b> from the last lesson: limit switch S2 at the bottom starts KT1.</li></ul>
      <p>What is new is how they meet. In the feeder, a normally-closed limit switch broke the latch the instant the slide arrived. Here the press must <i>stay</i> — so the thing that breaks the latch is a <b>normally-closed contact of the timer</b>.</p>`},
    {h: 'Follow the chain', html: `<ol><li>Tap S1 → K1 latches → Y1 on → press comes down.</li><li>Press reaches the bottom → S2 closes → timer KT1 starts counting.</li><li>3 s later KT1 pulls in → its NC contact opens → K1 drops → Y1 off → the spring valve sends the press up.</li><li>Press leaves the bottom → S2 opens → KT1 drops → its NC contact closes again. Ready for the next tap.</li></ol>
      <p>The bench checks the timing: still down after about 3 s, back up shortly after.</p>`}
  ],
  hints: ['Three branches: the latch (ending on K1), the power branch (K1 contact → Y1), and the timer branch (S2 → KT1).', 'Latch: +24 V → S1 → KT1 contact (the NC one, 1–2) → K1 → 0 V, with the first K1 contact bridging S1 only.', 'Then +24 V → second K1 contact → Y1 → 0 V, and +24 V → S2 (3–4) → KT1 (A1–A2) → 0 V.'],
  tests: [{kind: 'seq', title: 'Press, hold, release', steps: [
    {say: 'Tap S1 — the press comes down and stays', tap: ['S1'], run: 1.3, expect: [['ext', '1A'], ['relay', 'K1', true]], why: 'One tap should latch K1 and bring the press all the way down. If it only twitched, the K1 holding contact is not bridging S1.'},
    {say: 'It is still holding after 3 seconds', run: 2.1, expect: [['ext', '1A']], why: 'The press let go too early. Only the timer contact may break the latch, and the timer should be set to 3 s.'},
    {say: 'Then it goes back up by itself', run: 2.6, expect: [['ret', '1A'], ['cycles', '1A', 1], ['relay', 'K1', false]], why: 'The press did not release. The normally-closed KT1 contact must sit in the latch path so K1 drops when the time is up.'},
    {say: 'A second tap works the same way', tap: ['S1'], run: 1.3, expect: [['ext', '1A']], why: 'The second tap did nothing — after a cycle the timer must drop out so its contact closes again.'}
  ]}],
  learned: ['A timer contact can reset a latch, just as a stop button or limit switch can.', 'Latch + timer gives a machine a timed step in its cycle.', 'Following the chain of cause and effect is how every sequence is designed.'],
  quiz: [{q: 'Why does the timer relay drop out again once the press goes up?', o: ['Its time has run out', 'Limit switch S2 opens as soon as the piston leaves the bottom, cutting the timer coil', 'K1 switches it off directly'], a: 1, why: 'S2 feeds the timer coil. No S2, no coil voltage, and an on-delay timer drops out at once.'}]
},
{
  id: 'offdelay', ch: 5, kind: 'build', title: 'The other timer: let go late', scene: 'press',
  brief: 'A heat-sealing press closes while the operator holds <b>S1</b>. When the button is released the press must stay closed for <b>2 more seconds</b> so the seam can set, then open by itself. No latch this time: one off-delay timer does the whole job.',
  solution: sol.offdelay, start: unwired, palette: [],
  intro: [
    {h: 'Two kinds of patience', html: figs(fig('timer', 'On-delay: crossed box', {label: 'KT1', delay: 2}), fig('timer_off', 'Off-delay: solid box', {label: 'KT1', delay: 2})) +
      `<p>The timer you know <b>pulls in late</b>: energise the coil, wait, and only then do the contacts switch.</p>
      <p>The <b>off-delay timer</b> is its mirror image. Its contacts switch <b>at once</b> when the coil is energised. The waiting happens at the other end: when the coil loses power, the contacts <b>hold on for the set time</b> and only then drop back.</p>
      ${tt(['', 'coil switched on', 'coil switched off'], [['on-delay', 'contacts wait, then switch', 'contacts drop at once'], ['off-delay', 'contacts switch at once', 'contacts wait, then drop']]).replace(/ class="[^"]*"/g, '')}`},
    {h: 'Things that run on', html: `<p>You meet off-delay wherever something must <b>keep going after its signal has gone</b>: a fan that cools for a minute after the heater is off, the light in a stairwell, a blow-off nozzle, a clamp that holds until the glue has set.</p>
      <p>The valve here has a spring, so the press is closed exactly as long as Y1 is energised. Put the timer between the button and the solenoid:</p>
      <ul><li>S1 feeds the timer coil KT1.</li><li>A KT1 contact feeds Y1.</li></ul>
      <p>Press S1: KT1 pulls in immediately and the press closes. Release S1: KT1 holds for 2 s, lets go, and the spring opens the press. On the <b>signal recorder</b> you can see KT1 and Y1 outlast S1 by exactly two seconds.</p>`}
  ],
  hints: ['Two branches, like indirect control with a relay — only the relay is a timer.', 'Control branch: +24 V → S1 → timer coil KT1 (A1–A2) → 0 V.', 'Power branch: +24 V → contact KT1 (3–4) → Y1 → 0 V.'],
  tests: [{kind: 'seq', title: 'Close, hold on, open', steps: [
    {say: 'Tap S1 — the press closes and stays closed after the button is released', tap: ['S1'], run: 1.2, expect: [['ext', '1A'], ['relay', 'KT1', true]], why: 'After a short tap the press should still be closed a second later. S1 must feed the timer coil, and a KT1 contact must feed Y1.'},
    {say: 'About two seconds after the tap it opens by itself', run: 2.3, expect: [['ret', '1A'], ['cycles', '1A', 1], ['relay', 'KT1', false]], why: 'The press did not open again. When the off-delay time is over, KT1 must drop and take Y1 with it. Is the timer set to 2 s?'},
    {say: 'Hold S1 for four seconds — closed the whole time', press: ['S1'], run: 4, expect: [['ext', '1A']], why: 'While S1 is held the press must stay closed, however long that is. The delay only starts when the coil loses power.'},
    {say: 'Let go — still closed one second later', release: ['S1'], run: 1, expect: [['ext', '1A']], why: 'The press opened too soon after the button was released.'},
    {say: 'And open after the two seconds', run: 2.2, expect: [['ret', '1A'], ['cycles', '1A', 2]], why: 'The press did not open two seconds after the button was released.'}
  ]}],
  learned: ['An off-delay timer switches at once and drops out late: the delay runs after the coil loses power.', 'On-delay delays the start of something; off-delay delays its end.', 'Crossed box = pulls in late. Solid box = lets go late.'],
  quiz: [
    {q: 'An off-delay timer is set to 5 s. Its coil is energised for 1 s, then switched off. How long are its contacts switched in total?', o: ['1 second', '5 seconds', 'About 6 seconds'], a: 2, why: 'They switch the moment the coil comes on, stay switched for the second it is on, and hold for 5 s more after it goes off.'},
    {q: 'A cooling fan must keep running for a minute after a heater is switched off. Which timer drives the fan?', o: ['An on-delay timer', 'An off-delay timer', 'A counter'], a: 1, why: 'The fan should start with the heater and stop late. Delaying the end is what off-delay does.'}
  ]
},
{
  id: 'counter', ch: 5, kind: 'build', title: 'A batch of three', scene: 'press',
  brief: 'The automatic press again — but an order is for exactly <b>three parts</b>. After the third stamp the machine must stop on its own. Pushbutton <b>S5</b> resets the counter for the next batch.',
  solution: sol.counter, start: unwired, palette: [],
  intro: [
    {h: 'A relay that counts', html: figs(fig('counter', 'Counter C1 (preset 3)', {label: 'C1'}), fig('counter_r', 'Its reset coil', {label: 'C1'}), fig('k_nc', 'Its contact (NC)', {label: 'C1'})) +
      `<p>A <b>preset counter</b> has two inputs. Every time voltage <i>appears</i> on the count input (A1–A2), the count goes up by one. It counts pulses, not time: holding the input on counts once.</p>
      <p>When the count reaches the preset, every contact labelled C1 changes over — and <b>stays</b> changed until the reset coil (R1–R2) is energised.</p>`},
    {h: 'Where it goes', html: `<p>Start from the automatic press you built: a “running” latch K1 (S1 start, S2 stop), K1 AND S3 → Y1, S4 → Y2.</p>
      <ul><li><b>What should be counted?</b> One stamp = one arrival at the bottom = one pulse from S4. So S4 feeds the counter as well as Y2.</li><li><b>What should happen at three?</b> The machine must stop — exactly what the stop button does. So a normally-closed C1 contact goes in series with S2 in the latch.</li><li><b>Reset:</b> S5 → reset coil.</li></ul>`}
  ],
  hints: ['The latch is the familiar one with one extra contact in the chain: +24 V → S1 → S2 (NC) → C1 contact (NC) → K1 → 0 V, K1 contact bridging S1.', 'Motion: +24 V → K1 contact → S3 → Y1 → 0 V, and +24 V → S4 → Y2 → 0 V.', 'Counting: from terminal 4 of S4 also to counter C1 (A1), C1 (A2) → 0 V. Reset: +24 V → S5 → reset coil (R1–R2) → 0 V.'],
  tests: [{kind: 'seq', title: 'Three parts, then stop', steps: [
    {say: 'Tap S1 — it stamps three parts and stops at the top', tap: ['S1'], run: 12, expect: [['cycles', '1A', 3], ['ret', '1A'], ['count', 'C1', 3]], why: 'The machine should make exactly three strokes. Count the pulses from S4, and let a normally-closed C1 contact break the “running” latch.'},
    {say: 'It stays stopped', run: 3, expect: [['still', '1A']], why: 'The press carried on after three parts.'},
    {say: 'Tap S1 without resetting — nothing happens', tap: ['S1'], run: 3, expect: [['still', '1A']], why: 'The machine started although the batch is complete and the counter was not reset. The C1 contact must block the start button too, not only the holding contact.'},
    {say: 'Tap S5 to reset, tap S1 — three more', tap: ['S5'], run: 0.3, expect: [['count', 'C1', 0]], why: 'S5 did not reset the counter. It has to energise the reset coil of C1.'},
    {say: 'The second batch runs', tap: ['S1'], run: 12, expect: [['cycles', '1A', 6], ['ret', '1A']], why: 'After the reset the machine should make exactly three more parts.'}
  ]}],
  learned: ['A counter counts pulses and switches its contacts when the preset is reached.', 'It keeps its state until it is reset — it is a memory with a number in it.', 'Adding a feature to a working machine usually means one more contact in the right chain.'],
  quiz: [{q: 'Limit switch S4 stays closed for half a second each stroke. How much does the counter count per stroke?', o: ['One — it counts the moment the signal appears', 'It counts as long as the signal is there', 'Nothing until S4 opens'], a: 0, why: 'Counters respond to the rising edge of the signal: off → on is one count, however long it stays on.'}]
},

/* ===== Chapter 7: operating modes and safety ===== */
{
  id: 'modes', ch: 6, kind: 'build', title: 'Single cycle or continuous', scene: 'press',
  brief: 'Give the press two operating modes. A tap on pushbutton <b>S1</b> makes exactly <b>one</b> stroke. With the toggle switch <b>S2</b> turned on, it keeps cycling until S2 is turned off again — and then finishes its stroke.',
  solution: sol.modes, start: unwired, palette: [],
  intro: [
    {h: 'Operating modes', html: figs(fig('sw_no', 'Toggle switch S2', {label: 'S2'})) + `<p>Most machines can be run in more than one way: <b>single cycle</b> for setting up and testing, <b>continuous</b> for production. The operator chooses with a selector switch.</p>
      <p>A selector is a <b>toggle switch</b>: its symbol has a little notch on the actuator, meaning it stays where you put it. Click it once and it is on. Click again and it is off. No finger needed in between, and no latching relay either — the switch itself is the memory.</p>`},
    {h: 'Think about what starts a stroke', html: `<p>The press has a double-solenoid valve and limit switches at the top (<b>S3</b>) and the bottom (<b>S4</b>). The return is simple: S4 → Y2.</p>
      <p>A new down-stroke may begin when the press is at the top (S3) <b>and</b> somebody wants one. “Somebody wants one” is either a tap on S1 <b>or</b> the selector S2 being on.</p>
      <p>That sentence is the whole circuit. No relay is needed this time.</p>`}
  ],
  hints: ['Y2 first: +24 V → S4 → Y2 → 0 V.', 'For Y1, S1 and S2 are two ways of asking for a stroke: put them in parallel.', '+24 V → S1 and +24 V → S2, both terminals 4 joined → S3 → Y1 → 0 V. That is (S1 OR S2) AND S3.'],
  tests: [{kind: 'seq', title: 'Two operating modes', steps: [
    {say: 'Tap S1 — exactly one stroke', tap: ['S1'], run: 4, expect: [['cycles', '1A', 1], ['ret', '1A']], why: 'One tap on S1 should give one stroke down and back up.'},
    {say: 'Then it waits', run: 2, expect: [['still', '1A']], why: 'The press started another stroke by itself in single-cycle mode.'},
    {say: 'Switch S2 on — it cycles continuously', press: ['S2'], run: 7, expect: [['cyclesMin', '1A', 3]], why: 'With S2 on the press should keep cycling. S2 must be able to start a stroke whenever the press is back at the top (S3).'},
    {say: 'Switch S2 off — it finishes the stroke and stops at the top', release: ['S2'], run: 4, expect: [['ret', '1A']], why: 'After S2 was switched off the press did not come to rest at the top.'},
    {say: 'It stays there', run: 3, expect: [['still', '1A']], why: 'The press kept cycling after S2 was switched off.'}
  ]}],
  learned: ['A toggle switch stays in position: it is a memory you operate by hand.', 'Single cycle and continuous differ only in what asks for the next stroke.', '(S1 OR S2) AND S3 — a request, and a condition that the machine is ready.'],
  quiz: [{q: 'Why is no latching relay needed for continuous mode here?', o: ['The valve is spring-returned', 'The toggle switch itself remembers that continuous mode is selected', 'Limit switches cannot be latched'], a: 1, why: 'A pushbutton needs a latch to remember a tap. A toggle switch stays closed by itself.'}]
},
{
  id: 'estop', ch: 6, kind: 'build', title: 'The emergency stop', scene: 'press',
  brief: 'Add a red mushroom button <b>S0</b> to the automatic press. Hit it and the press must go <b>straight back up</b>, even in the middle of a stroke. Nothing may restart until S0 is released <b>and</b> START is pressed again.',
  solution: sol.estop, start: unwired, palette: [],
  intro: [
    {h: 'A stop that always wins', html: figs(fig('sw_nc', 'E-stop S0, opening block', {label: 'S0'}), fig('sw_no', 'E-stop S0, closing block', {label: 'S0'})) +
      `<p>An emergency-stop button latches in when it is hit and stays in until someone deliberately pulls it out. Behind the red mushroom sit <b>two contact blocks</b> on one plunger:</p>
      <ul><li>a <b>normally-closed</b> block that opens — it breaks circuits;</li><li>a <b>normally-open</b> block that closes — it makes one.</li></ul>
      <p>Both carry the label S0 and both flip together. On the sheet they are two symbols; on the bench they are one button. Press key <kbd>0</kbd> or click either one.</p>`},
    {h: 'Two jobs', html: `<p>Stopping the automatic cycle is not enough. If the E-stop only dropped the “running” relay, the press would still finish its stroke — on someone's hand.</p>
      <ol><li><b>Kill the cycle.</b> The opening block of S0 goes into the latch, in series with the start button <i>and</i> the holding contact, so K1 drops and cannot be set again.</li>
      <li><b>Go to the safe position.</b> The closing block of S0 energises <b>Y2</b> directly, in parallel with limit switch S4, so the valve reverses at once.</li></ol>
      <p>When S0 is released, K1 is still off: the machine waits for a new START. That is the rule for every real E-stop — <b>releasing it must never restart the machine</b>.</p>`}
  ],
  hints: ['Start from the automatic press: latch K1 (S1, holding contact), K1 AND S3 → Y1, S4 → Y2. The stop button of that latch is now the opening block of S0.', 'Latch: +24 V → S1 → S0 (1–2) → K1 → 0 V, with the K1 holding contact from +24 V to terminal 1 of S0.', 'Emergency return: +24 V → the other S0 block (3–4) → top of Y2. It joins the wire from S4, so Y2 has two parallel feeds.'],
  tests: [{kind: 'seq', title: 'Emergency stop', steps: [
    {say: 'Tap S1 — the press starts down', tap: ['S1'], run: 0.3, expect: [['relay', 'K1', true], ['cycles', '1A', 0]], why: 'After a tap on S1 the “running” relay K1 should be latched and the press on its way down.'},
    {say: 'Hit S0 mid-stroke — straight back up, without finishing', press: ['S0'], run: 2, expect: [['ret', '1A'], ['cycles', '1A', 0], ['relay', 'K1', false]], why: 'On emergency stop the press must reverse immediately. Dropping K1 is not enough — the closing block of S0 has to energise Y2.'},
    {say: 'S0 still locked in — START does nothing', tap: ['S1'], run: 2, expect: [['still', '1A'], ['relay', 'K1', false]], why: 'The press could be started while the emergency stop was still pressed. The opening block of S0 must be in series with the start button too.'},
    {say: 'Release S0 — nothing restarts by itself', release: ['S0'], run: 2, expect: [['still', '1A'], ['relay', 'K1', false]], why: 'The machine restarted just because the emergency stop was released. It must wait for a new START.'},
    {say: 'Tap S1 — normal cycling again', tap: ['S1'], run: 6, expect: [['cyclesMin', '1A', 2]], why: 'After releasing S0 and pressing START the press should cycle again.'}
  ]}],
  learned: ['An emergency stop must do two things: end the cycle and drive the machine to a safe position.', 'One button, several contact blocks: an opening block breaks the latch, a closing block forces the return.', 'Releasing the E-stop must never restart the machine by itself.'],
  quiz: [
    {q: 'Why is dropping the “running” relay not enough for an emergency stop on this press?', o: ['The relay is too slow', 'The memory valve would still complete the stroke it has begun', 'The limit switches would stop working'], a: 1, why: 'The double-solenoid valve remembers “down”. Only a signal on Y2 turns it round, so the E-stop has to give one.'},
    {q: 'The E-stop is pulled out again. What should the machine do?', o: ['Carry on where it stopped', 'Nothing, until START is pressed', 'Run one cycle to check itself'], a: 1, why: 'Restart after an emergency stop is always a separate, deliberate action.'}
  ]
},
{
  id: 'twohand', ch: 6, kind: 'build', title: 'Two hands, half a second', scene: 'press',
  brief: 'The first press you built needed two buttons, and an operator could cheat it by taping one of them down. Build a real two-hand control: the press starts only if <b>S1 and S2 go down within half a second of each other</b>, and returns the moment either one is released.',
  solution: sol.twohand, start: unwired, palette: [],
  intro: [
    {h: 'Why AND is not enough', html: `<p>Two buttons in series keep both hands out of the press — until someone wedges a matchstick into S1 and works one-handed. A plain AND circuit cannot tell “pressed together” from “one of them pressed since Monday”.</p>
      <p>A proper two-hand control checks <b>time</b> as well. Both buttons must go down within about half a second. If the second hand arrives later, nothing happens, and <b>both</b> buttons have to be released before the next try.</p>
      <p>You already know every part it needs: an on-delay timer and a latching relay.</p>`},
    {h: 'A race between a relay and a timer', html: figs(fig('timer', 'KT1, set to 0.5 s', {label: 'KT1', delay: 0.5}), fig('k_nc', 'Its NC contact: the gate', {label: 'KT1'})) +
      `<p>Each pushbutton has <b>two contact blocks</b> with one label, so S1 and S2 each appear twice on the sheet.</p>
      <ol><li><b>The clock.</b> S1 <i>or</i> S2 starts timer KT1. Whichever finger comes down first starts it.</li>
      <li><b>The gate.</b> S1 <i>and</i> S2 in series, then a <b>normally-closed KT1 contact</b>, then relay K1. K1 can pull in only while the timer has <i>not yet</i> run out.</li>
      <li><b>The hold.</b> A K1 contact bridges the KT1 contact, and nothing else. Once K1 is in, the timer may run out without dropping it. S1 and S2 are still in the chain, so letting go of either one drops K1.</li>
      <li><b>The power.</b> A second K1 contact feeds Y1.</li></ol>
      <p>Too slow? KT1 has shut the gate before both buttons were down — and it keeps it shut for as long as <i>either</i> button is held.</p>`}
  ],
  hints: ['Four branches. Start with the clock: +24 V → S1 → timer coil KT1 → 0 V, and a second feed +24 V → S2 joining the same wire into KT1. That is S1 OR S2.',
    'The gate: +24 V → the other S1 block → the other S2 block → KT1 contact (1–2) → relay coil K1 → 0 V.',
    'The hold: the K1 contact beside the gate goes in parallel with the KT1 contact only — from the wire under S2 to the wire above coil K1. Last branch: +24 V → K1 contact → Y1 → 0 V.'],
  tests: [{kind: 'seq', title: 'Two-hand control with a time check', steps: [
    {say: 'Hold S1 alone — nothing', press: ['S1'], run: 1, expect: [['still', '1A'], ['relay', 'K1', false]], why: 'The press moved with one button. S1 and S2 must be in series in front of K1.'},
    {say: 'Add S2 a second later — too late, still nothing', press: ['S2'], run: 1.5, expect: [['still', '1A'], ['relay', 'K1', false]], why: 'The second hand came a full second after the first and the press still started. K1 may only pull in through the normally-closed contact of timer KT1, and the timer must be started by S1 OR S2.'},
    {say: 'Release both — the timer resets', release: ['S1', 'S2'], run: 0.4, expect: [['relay', 'KT1', false], ['still', '1A']], why: 'With both buttons released the timer KT1 must drop out, ready for the next try.'},
    {say: 'Press both together — down it goes, and stays down while both are held', press: ['S1', 'S2'], run: 2.5, expect: [['ext', '1A'], ['relay', 'K1', true]], why: 'Pressed together, K1 should pull in and hold itself past the half second. The K1 holding contact must bridge the KT1 contact.'},
    {say: 'Let go of S2 only — straight back up', release: ['S2'], run: 2, expect: [['ret', '1A'], ['relay', 'K1', false]], why: 'Releasing one button must drop K1. The holding contact may bridge only the timer contact, never the buttons.'},
    {say: 'Press S2 again with S1 still held — no restart', press: ['S2'], run: 1.5, expect: [['still', '1A'], ['relay', 'K1', false]], why: 'One button stayed down, the other was pressed again, and the press restarted. As long as either button is held the timer must stay pulled in and keep the gate shut.'},
    {say: 'Release both again', release: ['S1', 'S2'], run: 0.4, expect: [['relay', 'KT1', false]], why: 'The timer did not reset after both buttons were released.'},
    {say: 'S2 first…', press: ['S2'], run: 0.2, expect: [['relay', 'K1', false]], why: 'K1 pulled in with only one button pressed.'},
    {say: '…and S1 a fifth of a second later: close enough, the press comes down', press: ['S1'], run: 2.5, expect: [['ext', '1A']], why: 'Two presses 0.2 s apart are inside the half second and should start the press. Is the timer still set to 0.5 s?'}
  ]}],
  learned: ['AND checks that two signals are present. A timer can check that they arrived together.', 'A normally-closed timer contact is a gate that shuts after a set time.', 'A holding contact bridges only what it is meant to bridge: here the gate, never the buttons.'],
  quiz: [
    {q: 'S1 is taped down. The operator presses S2. What happens?', o: ['The press starts, as with a plain AND circuit', 'Nothing: the timer ran out long ago and its contact keeps K1 from pulling in', 'The fuse trips'], a: 1, why: 'The taped button started the clock. Half a second later the gate shut, and it stays shut while that button is held.'},
    {q: 'Why does the K1 holding contact bridge only the KT1 contact, and not the two buttons as well?', o: ['To save wire', 'So that releasing either button still drops K1 and the press returns', 'Because relay contacts cannot bridge pushbuttons'], a: 1, why: 'Bridge the buttons and the press would stay down with both hands free. The hold must only cancel the time limit.'}
  ]
},
{
  id: 'jog', ch: 6, kind: 'guided', title: 'Stop anywhere: the 5/3 valve',
  brief: 'Every valve so far had two positions, so every piston ran to one end or the other. A third position in the middle lets you stop a piston <b>anywhere</b> — and shows you that air is a spring.',
  solution: sol.jog, start: unwired, palette: [],
  intro: [
    {h: 'A third square', html: figs(fig('v53', '5/3 valve, closed centre')) + `<p><b>5 ports, 3 positions.</b> The two outer squares are the ones you know: left extends (1→4), right retracts (1→2). New is the <b>middle square</b>, where all five ports end in a ⊤: blocked.</p>
      <p>A spring at <i>each</i> end pushes the spool to the middle. With no signal, the valve shuts every port. Air cannot get into the cylinder and, just as important, cannot get <b>out</b>. The piston is held between two cushions of trapped air.</p>
      <p>Energise Y1 and the piston extends for as long as the signal lasts. Y2 retracts. Let go and it stops. This is <b>jog</b> or <b>inching</b> control, the setting-up mode of almost every machine.</p>`},
    {h: 'Three honest warnings', html: `<p>A closed-centre valve stops a piston. It does not <i>lock</i> it.</p>
      <ul><li><b>Air is compressible.</b> Push on the rod and the trapped air gives like a spring. You will try this.</li>
      <li><b>It coasts.</b> The piston does not stop dead; it settles where the two cushions balance.</li>
      <li><b>The first stroke leaps.</b> Just after switching on there is no air on the far side of the piston yet, so nothing brakes the first movement. Watch for it.</li></ul>
      <p>So a 5/3 valve positions a piston “about here”. It is never the only thing holding a load above someone's hand.</p>`}
  ],
  steps: [
    {t: 'Wire the two jog buttons: +24V → S1 → Y1 → 0V, and +24V → S2 → Y2 → 0V.', hl: ['PSU.pos', 'S1.3', 'S1.4', 'Y1.a', 'Y1.b', 'S2.3', 'S2.4', 'Y2.a', 'Y2.b', 'PSU.neg'],
      ok: x => links(x, [['PSU.pos', 'S1.3'], ['S1.4', 'Y1.a'], ['Y1.b', 'PSU.neg'], ['PSU.pos', 'S2.3'], ['S2.4', 'Y2.a'], ['Y2.b', 'PSU.neg']])},
    {t: '<b>Power ON.</b> Hold S1 until the piston is fully out, then hold S2 until it is home again. The very first stroke leaps: there was no air cushion in front of the piston yet.', hl: ['S1', 'S2'], sticky: true, ok: x => x.running && x.cycles('1A') >= 1 && x.ret('1A')},
    {t: 'Now <b>stop it half-way</b>: hold S1 and let go while the piston is still travelling. It stays between the ends.', hl: ['S1'], sticky: true, ok: x => x.running && x.mid('1A') && !x.sol('Y1') && !x.sol('Y2')},
    {t: 'Click the <b>cylinder</b>. Both sides show pressure — trapped air. Drag <b>Load against the rod</b> up to 300 N or more and watch the piston give way. Air is a spring.', hl: ['1A'], sticky: true, ok: x => x.running && x.comp('1A').props.load >= 300},
    {t: 'Set the load back to 0. Then hold <b>S1 and S2 together</b> (keys 1 and 2). Both solenoids pull, their forces cancel, and the springs keep the valve in the middle.', hl: ['1V'], sticky: true, ok: x => x.running && x.sol('Y1') && x.sol('Y2')}
  ],
  learned: ['A 5/3 closed-centre valve blocks every port when it has no signal, so the piston stops where it is.', 'Trapped air holds the piston, but it is a spring: under load the piston gives.', 'Jog control: the piston moves only while the button is held.'],
  quiz: [
    {q: 'The power fails while a 5/3 closed-centre valve is extending a cylinder. What does the piston do?', o: ['Runs on to the end of its stroke', 'Returns home', 'Stops about where it is, held by trapped air'], a: 2, why: 'With no signal the springs centre the valve and all ports are blocked. A spring-return 5/2 valve would have sent it home; a double-solenoid 5/2 would have let it finish.'},
    {q: 'Why is a closed-centre valve alone not enough to hold a heavy vertical load safely?', o: ['The solenoids overheat', 'Air is compressible and can leak, so the load sinks', 'The springs are too weak'], a: 1, why: 'Trapped air is a cushion, not a lock. Loads that must not move get a mechanical brake or a rod lock.'}
  ]
},

/* ===== Chapter 8: pressure and sequences ===== */
{
  id: 'pressure', ch: 7, kind: 'build', title: 'Press until it is tight', scene: 'press',
  brief: 'An embossing press must push with <b>full force</b> before it lets go — reaching the end of the stroke is not proof of that. Use a pressure sensor instead of a limit switch: return when the cap-side pressure reaches 5.5 bar.',
  solution: sol.pressure, start: s => strip(s, c => D[c.type].cat === 'e' && c.type !== 'psu', w => w.k === 'e' || w.a.c === 'B1' || w.b.c === 'B1'), palette: ['pb_no', 'pb_nc', 'b_no', 'b_nc', 'sol', 'lamp'],
  intro: [
    {h: 'Feeling force through pressure', html: figs(fig('psw', 'Pressure sensor B1', {label: 'B1', set: 5.5}), fig('b_no', 'Its contact', {label: 'B1'})) +
      `<p>While a piston is moving, the air behind it keeps expanding into the growing chamber, so the pressure there stays <b>below</b> supply pressure. Only when the piston <b>stops</b> — at the end of its stroke, or against a workpiece — does the chamber fill right up to the full 6 bar.</p>
      <p>So the pressure behind the piston tells you: <i>I have met resistance and I am now pushing with full force.</i> A <b>pressure switch</b> turns that into an electrical signal.</p>
      <p>As usual it is drawn twice with one label: the <b>sensor B1</b> on the air line, and its <b>contact B1</b> in the electrical circuit.</p>`},
    {h: 'The job', html: `<ul><li>Tee the sensor into the cap-side line: drag a tube from <b>B1</b> to the cylinder's left port (or to valve port 4 — it is the same line).</li><li>Tap S1 → Y1 → the press comes down.</li><li>Pressure reaches 5.5 bar → contact B1 closes → Y2 → the press goes up.</li></ul>
      <p>There is no limit switch on this cylinder. Click the cylinder while it runs and watch the cap-side pressure: around 4–5 bar during the stroke, then a jump to 6.</p>
      <p>Take parts from the bin. New contacts for B1 are in the <b>Switches</b> group.</p>`}
  ],
  hints: ['First the tube: B1 has to be connected to the cap-side line, or it will never see any pressure.', 'Electrically it is the memory-valve circuit: +24 V → S1 → Y1 → 0 V and +24 V → pressure contact B1 (normally open) → Y2 → 0 V.', 'Check the labels: the contact must be called B1, the coils Y1 and Y2.'],
  tests: [
    {kind: 'seq', title: 'Press to full force, then return', steps: [
      {say: 'Tap S1 — the press goes all the way down and comes back', tap: ['S1'], run: 3, expect: [['ret', '1A'], ['cycles', '1A', 1]], why: 'The press must reach the bottom and then return by itself. If it stayed down, B1 is not connected to the cap-side line or its contact does not feed Y2. If it turned back early, the contact is the wrong type.'},
      {say: 'It waits at the top', run: 1.5, expect: [['still', '1A']], why: 'The press started again by itself.'},
      {say: 'Second part', tap: ['S1'], run: 3, expect: [['ret', '1A'], ['cycles', '1A', 2]], why: 'The second tap did not produce a second full stroke.'}
    ]},
    {kind: 'rule', title: 'Pressure, not position', why: 'Use the pressure switch for the return signal — there should be no limit switch in this circuit.', check: q => q.count('ls_no') + q.count('ls_nc') === 0 && q.count('b_no') + q.count('b_nc') >= 1}
  ],
  learned: ['Pressure behind a piston only reaches supply pressure once the piston has stopped.', 'A pressure switch senses force, where a limit switch senses position.', 'Sensor on the air line, contact in the circuit, one label.'],
  quiz: [{q: 'A workpiece is thicker than usual, so the piston stops 20 mm early. Which signal still comes?', o: ['The limit switch at the end of the stroke', 'The pressure switch', 'Neither'], a: 1, why: 'The piston never reaches the limit switch, but it has stopped, so the pressure rises to supply pressure. That is why pressing and clamping jobs use pressure sensing.'}]
},
{
  id: 'sequence', ch: 7, kind: 'build', title: 'Two cylinders in step', scene: 'transfer',
  brief: 'A transfer station: cylinder <b>1A lifts</b> a box, cylinder <b>2A pushes</b> it onto the upper conveyor, then both go home — lift first. One tap on S1 must run the whole sequence 1A+ 2A+ 1A− 2A−.',
  solution: sol.sequence, start: unwired, palette: [],
  intro: [
    {h: 'A sequence', html: `<p>Real machines have several cylinders that must move in a fixed order. Engineers write the order in shorthand: <b>+</b> means extend, <b>−</b> means retract.</p>
      <p style="font:700 20px var(--mono);text-align:center;letter-spacing:.04em">1A+ &nbsp; 2A+ &nbsp; 1A− &nbsp; 2A−</p>
      <p>Lift up, push out, lift down, pusher back. Each cylinder has its own double-solenoid valve and a limit switch at each end:</p>
      ${tt(['', 'retracted', 'extended', 'extend coil', 'retract coil'], [['1A', 'S2', 'S3', 'Y1', 'Y2'], ['2A', 'S4', 'S5', 'Y3', 'Y4']]).replace(/ class="[^"]*"/g, '')}`},
    {h: 'Each step starts the next', html: `<p>The trick to every sequence: <b>the limit switch that confirms one step is the signal that starts the next one.</b></p>
      <ol><li>Start S1, and 2A is home (S4) → <b>Y1</b>: 1A extends.</li><li>1A has arrived (S3) → <b>Y3</b>: 2A extends.</li><li>2A has arrived (S5) → <b>Y2</b>: 1A retracts.</li><li>1A is home (S2) → <b>Y4</b>: 2A retracts.</li></ol>
      <p>The valves remember, so each limit switch only needs to give a short signal. The bench checks the <i>order</i> of the four movements. Use the signal recorder to see the staircase.</p>`}
  ],
  hints: ['Four coils, four little branches. Only Y1 needs two contacts in series.', 'Y1: +24 V → S1 → S4 → Y1 → 0 V.   Y3: +24 V → S3 → Y3 → 0 V.', 'Y2: +24 V → S5 → Y2 → 0 V.   Y4: +24 V → S2 → Y4 → 0 V.'],
  tests: [{kind: 'seq', title: 'The sequence 1A+ 2A+ 1A− 2A−', steps: [
    {say: 'Nothing moves before the start', run: 1, expect: [['order', []], ['ret', '1A'], ['ret', '2A']], why: 'A cylinder moved before S1 was pressed. At rest only Y4 may be energised (through S2), which just keeps 2A at home.'},
    {say: 'Tap S1 — lift, push, lower, pull back', tap: ['S1'], run: 8, expect: [['order', ['1A+', '2A+', '1A-', '2A-']], ['ret', '1A'], ['ret', '2A']], why: 'The four movements did not happen in the order 1A+ 2A+ 1A− 2A−. Check which limit switch feeds which coil: S3 → Y3, S5 → Y2, S2 → Y4.'},
    {say: 'A second tap repeats it', tap: ['S1'], run: 8, expect: [['order', ['1A+', '2A+', '1A-', '2A-', '1A+', '2A+', '1A-', '2A-']]], why: 'The second cycle did not run correctly.'}
  ]}],
  learned: ['A sequence is written as a list of movements: 1A+ 2A+ 1A− 2A−.', 'Each movement is started by the limit switch that confirms the one before it.', 'Double-solenoid valves hold each step, so short signals are enough.'],
  quiz: [{q: 'Why does the start branch include S4 (2A at home) in series with S1?', o: ['To make the lift stronger', 'So a new cycle cannot begin until the pusher is back and the last one is finished', 'Because S4 needs current to work'], a: 1, why: 'It is a start interlock: S1 AND “machine is in its home position”.'}]
},
{
  id: 'overlap', ch: 7, kind: 'guided', title: 'A+ B+ B− A−: the sequence that jams',
  brief: 'Clamp, stamp, lift the stamp, unclamp: <b>1A+ 2A+ 2A− 1A−</b>. It looks no harder than the last sequence, and it has been wired the same way. Watch it fail twice, and find out why.',
  solution: sol.overlap, start: s => clone(s), palette: [],
  intro: [
    {h: 'Clamp and stamp', html: `<p style="font:700 20px var(--mono);text-align:center;letter-spacing:.04em">1A+ &nbsp; 2A+ &nbsp; 2A− &nbsp; 1A−</p>
      <p>Cylinder <b>1A clamps</b> the workpiece, cylinder <b>2A stamps</b> it and lifts off, then the clamp opens. The clamp must stay closed while the stamp does its work, so the cylinder that moved <i>first</i> goes home <i>last</i>.</p>
      <p>The circuit on the sheet uses the rule that worked last time — each limit switch starts the next movement:</p>
      <ul><li>S1 (start) → Y1: 1A+</li><li>S3 (1A is out) → Y3: 2A+</li><li>S5 (2A is out) → Y4: 2A−</li><li>S4 (2A is home) → Y2: 1A−</li></ul>
      <p>Every step is logical. The machine still will not run.</p>`},
    {h: 'Signal overlap', html: `<p>A limit switch does not give a pulse. It stays closed <b>for as long as the piston sits on it</b>.</p>
      <p>In the last sequence each cylinder left its switch before the opposite command arrived. Here the order is different: a cylinder has to turn round while the switch that sent it out is <i>still pressed</i>. Its valve then has both solenoids energised — and you know what a double-solenoid valve does then. Nothing. The first signal wins.</p>
      <p>This is called <b>signal overlap</b>, and it appears in any sequence where the same cylinder moves twice in a row (…2A+ 2A−…) or the sequence ends by reversing its start (…1A− then 1A+).</p>
      <p>Keep an eye on the <b>signal recorder</b> and the <b>movement log</b> beneath it.</p>`}
  ],
  steps: [
    {t: '<b>Power ON</b>, then hold S1 and watch cylinder 1A.', hl: ['S1'], sticky: true, ok: x => x.running && x.sol('Y1') && x.sol('Y2') && x.ret('1A')},
    {t: 'Nothing. <b>Y2 was already energised</b>: S4 reports “2A is home”, which this circuit reads as “retract 1A” — all the time. First overlap. To see further, <b>Power OFF</b> and delete the wire between <b>S4</b> and <b>Y2</b> (click it, then <kbd>Delete</kbd>).', hl: ['S4.4', 'Y2.a'], ok: x => !x.q.linked('S4.4', 'Y2.a')},
    {t: '<b>Power ON</b> and tap S1 again. 1A clamps, 2A stamps…', hl: ['S1'], sticky: true, ok: x => x.running && x.ext('1A') && x.ext('2A') && x.sol('Y3') && x.sol('Y4')},
    {t: '…and stays down. S5 energises Y4, but <b>S3 is still held by the clamp</b>, so Y3 never lets go. Second overlap. Click valve 2V to see it, then <b>Power OFF</b>.', hl: ['2V'], sticky: true, ok: x => !x.running}
  ],
  learned: ['A limit switch signals for as long as the piston rests on it, not just for a moment.', 'Signal overlap: both solenoids of a valve energised, so it cannot reverse.', 'It happens when a cylinder must turn round while its “go” signal is still present, as in 1A+ 2A+ 2A− 1A−.'],
  quiz: [
    {q: 'Why did 2A stay extended?', o: ['Its flow control was closed', 'Y3 (from S3) was still on when Y4 (from S5) arrived, so valve 2V could not switch', 'Limit switch S5 was broken'], a: 1, why: 'The clamp is still out, so S3 is still closed and Y3 still energised. Two signals on one valve: the first wins.'},
    {q: 'Which of these sequences has signal overlap?', o: ['1A+ 2A+ 1A− 2A−', '1A+ 2A+ 2A− 1A−', 'Neither'], a: 1, why: 'In the second one 2A must reverse immediately, while 1A has not moved off the switch that sent 2A out.'}
  ]
},
{
  id: 'cascade', ch: 7, kind: 'build', title: 'A+ B+ B− A−: fixed with a memory relay', scene: 'clamp',
  brief: 'Make the clamp-and-stamp sequence <b>1A+ 2A+ 2A− 1A−</b> run from one tap on S1. A memory relay K1 splits the cycle into two halves, and only one half may have power at a time.',
  solution: sol.cascade, start: unwired, palette: [],
  intro: [
    {h: 'Split the cycle in two', html: `<p>The cure for signal overlap: <b>switch the signals off when they are no longer wanted</b>. Cut the sequence into groups so that no cylinder appears twice in one group:</p>
      <p style="font:700 19px var(--mono);text-align:center;letter-spacing:.03em"><span class="c-el">1A+ &nbsp;2A+</span> &nbsp;│&nbsp; <span class="c-air">2A− &nbsp;1A−</span></p>
      <p style="text-align:center;margin-top:-6px;color:var(--muted)">group 1 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; group 2</p>
      <p>A latching relay <b>K1</b> remembers which half is running. A normally-open K1 contact feeds everything in group 1; a normally-closed K1 contact feeds everything in group 2. They can never both conduct, so a “+” and a “−” for the same valve can never meet.</p>
      <p>Industry calls this the <b>cascade method</b>.</p>`},
    {h: 'The plan', html: `<ul><li><b>K1 on = group 1.</b> Set by the start button — but only if the clamp is home: S1 AND S2. A K1 contact holds it.</li>
      <li><b>K1 off = group 2.</b> Reset when the stamp is fully out: limit switch <b>S5</b> is a normally-closed type in the latch, exactly like the feeder.</li></ul>
      <p>Then hang the coils on the two group lines:</p>
      ${tt(['line', 'directly', 'through a limit switch'], [['group 1 (K1 NO)', 'Y1 · 1A+', 'S3 → Y3 · 2A+'], ['group 2 (K1 NC)', 'Y4 · 2A−', 'S4 → Y2 · 1A−']]).replace(/ class="[^"]*"/g, '')}
      <p>Read it as a story: K1 on → clamp. Clamp arrived (S3) → stamp. Stamp arrived (S5) → K1 drops → stamp lifts. Stamp home (S4) → clamp opens.</p>`}
  ],
  hints: ['Start with the latch in the left column: +24 V → S1 → S2 → S5 (1–2) → K1 → 0 V, and the first K1 contact from +24 V to the top of S5, so it bridges S1 and S2 together.', 'Group 1: +24 V → second K1 contact (normally open). From its terminal 4 go to Y1 directly, and also through S3 to Y3.', 'Group 2: +24 V → the normally-closed K1 contact. From its terminal 2 go to Y4 directly, and also through S4 to Y2. All four coils then go to 0 V.'],
  tests: [{kind: 'seq', title: 'The sequence 1A+ 2A+ 2A− 1A−', steps: [
    {say: 'Nothing moves before the start', run: 1, expect: [['order', []], ['ret', '1A'], ['ret', '2A']], why: 'A cylinder moved before S1 was pressed. At rest K1 is off, so only the group 2 coils (Y4, Y2) may be energised — and they just hold both cylinders at home.'},
    {say: 'Tap S1 — clamp, stamp, lift, unclamp', tap: ['S1'], run: 8, expect: [['order', ['1A+', '2A+', '2A-', '1A-']], ['ret', '1A'], ['ret', '2A']], why: 'The movements did not happen in the order 1A+ 2A+ 2A− 1A−. If it jams with both cylinders out, K1 is not dropping when the stamp reaches S5. If the clamp opens first, check that Y2 is fed through S4.'},
    {say: 'A second tap repeats it', tap: ['S1'], run: 8, expect: [['order', ['1A+', '2A+', '2A-', '1A-', '1A+', '2A+', '2A-', '1A-']], ['relay', 'K1', false]], why: 'The second cycle did not run correctly. After a cycle K1 must be off and both cylinders at home.'}
  ]}],
  learned: ['Signal overlap is cured by removing power from signals that are no longer wanted.', 'Cascade method: split the sequence into groups with no cylinder repeated, and let a memory relay power one group at a time.', 'A normally-open and a normally-closed contact of the same relay can never both conduct — a perfect changeover.'],
  quiz: [
    {q: 'Y3 (2A+) and Y4 (2A−) can no longer be energised together. Why not?', o: ['The limit switches are faster now', 'Y3 hangs on the K1 normally-open contact and Y4 on the K1 normally-closed contact', 'The timer keeps them apart'], a: 1, why: 'One relay, two opposite contacts: whenever one group line is live the other is dead.'},
    {q: 'Into how many groups must 1A+ 2A+ 2A− 1A− be split?', o: ['One', 'Two', 'Four'], a: 1, why: 'Cut wherever a cylinder would otherwise appear twice in a group: 1A+ 2A+ │ 2A− 1A−.'}
  ]
},
{
  id: 'cascade2', ch: 7, kind: 'build', title: 'Your turn: A+ A− B+ B−',
  brief: 'Stamp, then eject: <b>1A+ 1A− 2A+ 2A−</b>. Cylinder 1A stamps the part and lifts off; then 2A pushes the finished part out and comes back. Wired the simple way it misbehaves before you even press start. Find the groups and tame it with one memory relay.',
  solution: sol.cascade2, start: unwired, palette: [],
  intro: [
    {h: 'Find the overlap first', html: `<p style="font:700 20px var(--mono);text-align:center;letter-spacing:.04em">1A+ &nbsp; 1A− &nbsp; 2A+ &nbsp; 2A−</p>
      <p>Wire it in your head the simple way, each limit switch starting the next movement:</p>
      <ul><li>S3 (1A is out) → Y2: 1A−</li><li>S2 (1A is home) → Y3: 2A+</li><li>S5 (2A is out) → Y4: 2A−</li></ul>
      <p>Look at the middle line. 1A is home <b>at rest</b>, so S2 is pressed before anyone touches the start button. The ejector would shoot out the moment the power comes on — and stay out, because S2 never lets go of Y3.</p>
      <p>Same illness as the clamp-and-stamp station. Same cure.</p>
      ${tt(['', 'retracted', 'extended', 'extend coil', 'retract coil'], [['1A', 'S2', 'S3', 'Y1', 'Y2'], ['2A', 'S4', 'S5', 'Y3', 'Y4']]).replace(/ class="[^"]*"/g, '')}`},
    {h: 'Cut it into groups', html: `<p>No cylinder may appear twice in one group. Cutting gives three pieces: 1A+ │ 1A− 2A+ │ 2A−. But a cycle runs in a circle, and the last piece and the first contain different cylinders — so they can share a group:</p>
      <p style="font:700 18px var(--mono);text-align:center;letter-spacing:.03em"><span class="c-air">2A− &nbsp;1A+</span> &nbsp;│&nbsp; <span class="c-el">1A− &nbsp;2A+</span></p>
      <p style="text-align:center;margin-top:-6px;color:var(--muted)">group 1 (K1 off) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; group 2 (K1 on)</p>
      <ul><li><b>Group 1</b> hangs on a normally-closed K1 contact: Y4 directly, and S1 AND S4 → Y1.</li>
      <li><b>Group 2</b> hangs on a normally-open K1 contact: Y2 directly, and S2 → Y3.</li>
      <li><b>Set K1</b> when group 1 has finished: S3, the stamp is out.</li>
      <li><b>Reset K1</b> when group 2 has finished: S5, the ejector is out. It is a normally-closed limit switch sitting in the latch.</li></ul>
      <p>The rule behind it: <b>the last movement of each group switches the memory over to the next group.</b></p>`}
  ],
  hints: ['The latch in the left column: +24 V → S3 → S5 (1–2) → K1 → 0 V, with the first K1 contact from +24 V to the top of S5 so it bridges S3.',
    'Group 1: +24 V → the normally-closed K1 contact. From its terminal 2 go to Y4 directly, and also through S1 and then S4 to Y1.',
    'Group 2: +24 V → the second normally-open K1 contact. From its terminal 4 go to Y2 directly, and also through S2 to Y3. All four coils go to 0 V.'],
  tests: [{kind: 'seq', title: 'The sequence 1A+ 1A− 2A+ 2A−', steps: [
    {say: 'Nothing moves before the start', run: 1, expect: [['order', []], ['ret', '1A'], ['ret', '2A']], why: 'A cylinder moved before S1 was pressed. 1A is home at rest, so S2 is closed all the time — it may only reach Y3 while K1 is on.'},
    {say: 'Tap S1 — stamp down, stamp up, eject, ejector back', tap: ['S1'], run: 8, expect: [['order', ['1A+', '1A-', '2A+', '2A-']], ['ret', '1A'], ['ret', '2A'], ['relay', 'K1', false]], why: 'The movements did not happen in the order 1A+ 1A− 2A+ 2A−. If the stamp stays down, K1 is not being set by S3. If the ejector stays out, K1 is not being reset by S5.'},
    {say: 'A second tap repeats it', tap: ['S1'], run: 8, expect: [['order', ['1A+', '1A-', '2A+', '2A-', '1A+', '1A-', '2A+', '2A-']]], why: 'The second cycle did not run correctly. After a cycle K1 must be off and both cylinders at home.'}
  ]}],
  learned: ['Check a sequence for overlap before wiring it: which limit switches are still pressed when the opposite command arrives?', 'Groups may wrap around the end of the cycle, which often saves a relay.', 'The last movement of each group switches the memory to the next group.'],
  quiz: [
    {q: 'Into how few groups can 1A+ 1A− 2A+ 2A− be split?', o: ['Two, because the last step can join the first group', 'Three', 'Four'], a: 0, why: '1A+ │ 1A− 2A+ │ 2A− looks like three, but 2A− and 1A+ contain different cylinders and can share one group around the end of the cycle.'},
    {q: 'In your circuit, why does the ejector no longer shoot out when the power comes on?', o: ['S2 is disconnected at rest', 'S2 feeds Y3 through the K1 normally-open contact, and K1 is off at rest', 'The valve 2V has a spring'], a: 1, why: 'S2 is still pressed at rest, but its group line is dead until the stamp has been out and set K1.'}
  ]
},

/* ===== Chapter 9: repair shop ===== */
{
  id: 'fix1', ch: 8, kind: 'build', title: 'Repair: out when it should be in',
  brief: '<b>Customer complaint:</b> “The cylinder is fully extended as soon as we switch on, and pressing S1 pulls it <i>in</i>.” It should be retracted at rest and extend while S1 is held. Find the fault and fix it.',
  solution: sol.direct, start: () => broken.swapped(), palette: ['pb_no', 'pb_nc', 'sol', 'lamp'],
  intro: [
    {h: 'Welcome to the repair shop', html: `<p>These machines were built by someone else, and they do not work. Nothing is hidden: every fault is something you can see on the sheet and put right with the tools you already have — move a tube, rewire a branch, fix a label, change a setting.</p>
      <p>Work like a technician:</p><ol><li><b>Reproduce it.</b> Switch on and watch what really happens.</li><li><b>Split it.</b> Is the electrical side doing the right thing? Click a coil: does it get 24 V when it should? If yes, the fault is on the air side.</li><li><b>Follow the signal</b> from the button to the piston until something is wrong.</li><li><b>Fix one thing</b>, then run the tests.</li></ol>`}
  ],
  hints: ['Switch on and press S1. Y1 gets 24 V exactly when it should — the electrical side is fine.', 'Look at where the valve sends air at rest (1→2), and which end of the cylinder that tube goes to.', 'The two cylinder tubes are swapped. Port 4 must go to the cap (left) side, port 2 to the rod (right) side.'],
  tests: [{kind: 'seq', title: 'Normal operation', steps: [
    {say: 'At rest the piston is retracted', run: 0.5, expect: [['ret', '1A']], why: 'The cylinder is still extended at rest.'},
    {say: 'Hold S1 — it extends', press: ['S1'], run: 1.5, expect: [['ext', '1A']], why: 'Holding S1 does not extend the cylinder.'},
    {say: 'Release — it retracts', release: ['S1'], run: 1.5, expect: [['ret', '1A']], why: 'Releasing S1 does not retract the cylinder.'}
  ]}],
  learned: ['Split the problem: check whether the coil gets its voltage before blaming the air side.', 'Swapped working lines reverse a cylinder — a classic assembly mistake.'],
  quiz: [{q: 'How could you tell the fault was pneumatic without touching a tube?', o: ['The fuse had not tripped', 'Coil Y1 was energised exactly when S1 was pressed, so the electrics were doing their job', 'The cylinder moved slowly'], a: 1, why: 'Half-splitting: if the signal is right at the hand-over point (the solenoid), everything before it is fine.'}]
},
{
  id: 'fix2', ch: 8, kind: 'build', title: 'Repair: the press that will not start', scene: 'press',
  brief: '<b>Customer complaint:</b> “After maintenance the press does nothing. Both start buttons held, Y1 lights up — and the press stays at the top.” The wiring was checked twice and matches the drawing.',
  solution: sol.pressDirect, start: () => broken.wrongEnd(), palette: ['pb_no', 'ls_no', 'sol'],
  intro: [
    {h: 'The wiring is right. So what is wrong?', html: `<p>This is the press from practical task 1, wired correctly. Believe the customer on that point.</p>
      <p>Switch it on and look carefully at what is energised <i>before</i> anybody touches a button. Then remember what a double-solenoid valve does when both coils pull.</p>
      <p>Parts on this sheet can be clicked and their settings changed.</p>`}
  ],
  hints: ['With the power on and no button pressed, click coil Y2. It is energised. Why would the “go up” coil be on all the time?', 'Y2 is fed by limit switch S3 — which is closed although the press is at the top. Where is S3 mounted? Click the cylinder.', 'S3 was refitted at the retracted end. Clear “Switch at retracted end” and type S3 into “Switch at extended end”.'],
  tests: pressTests,
  learned: ['A sensor in the wrong place gives a perfectly healthy wrong signal.', 'A permanent signal on one solenoid blocks a double-solenoid valve: the first signal wins.', 'Always look at the state of the machine at rest before pressing anything.'],
  quiz: [{q: 'Why did Y1 have no effect although it was energised?', o: ['Its coil was burnt out', 'Y2 was already energised, and the valve stays with the first signal', 'There was no air pressure'], a: 1, why: 'S3 at the wrong end kept Y2 on from the moment the power came up.'}]
},
{
  id: 'fix3', ch: 8, kind: 'build', title: 'Repair: the feeder that will not come back', scene: 'feeder',
  brief: '<b>Customer complaint:</b> “One tap and the slide goes forward — fine. But then it stays there until we switch the whole machine off.” It should return by itself once it reaches the front.',
  solution: sol.feeder, start: () => broken.noRelease(), palette: ['pb_no', 'ls_nc', 'relay', 'k_no', 'sol'],
  intro: [
    {h: 'A latch that will not let go', html: `<p>The magazine feeder from practical task 3. It latches properly. It just never unlatches.</p>
      <p>Tap S1 and let the slide run forward. Limit switch S2 at the front is a normally-closed type: watch whether its contact really opens when the slide arrives. Then ask the important question: with S2 open, <b>how is current still reaching the K1 coil?</b> Follow the red.</p>`}
  ],
  hints: ['S2 does open when the slide arrives. So the coil must be getting its current by a path that does not go through S2.', 'Look at where the holding contact (the middle K1 contact) ends. It should rejoin the start branch <i>above</i> S2.', 'Delete the wire from terminal 4 of the holding contact and connect it to terminal 1 of S2 (the wire between S1 and S2) instead.'],
  tests: [{kind: 'seq', title: 'One tap, one part', steps: [
    {say: 'Tap S1 — the slide goes forward and returns', tap: ['S1'], run: 4, expect: [['ret', '1A'], ['cycles', '1A', 1]], why: 'The slide still does not return. The holding path must pass through S2 so the limit switch can break it.'},
    {say: 'It waits at the start position', run: 1.5, expect: [['still', '1A']], why: 'The slide started again by itself.'},
    {say: 'Tap again — the next part', tap: ['S1'], run: 4, expect: [['ret', '1A'], ['cycles', '1A', 2]], why: 'The second tap did not give a second full stroke.'}
  ]}],
  learned: ['Whatever is meant to break a latch must sit in the path the holding current actually takes.', 'Following the live (red) wires shows the real current path, not the intended one.'],
  quiz: [{q: 'The limit switch opened correctly. Why did the relay stay on?', o: ['The relay was stuck mechanically', 'The holding contact fed the coil directly, bypassing the limit switch', 'The timer was set too long'], a: 1, why: 'The holding branch rejoined below S2, so opening S2 only interrupted the start button path.'}]
},
{
  id: 'fix4', ch: 8, kind: 'build', title: 'Repair: the lamp that broke the press', scene: 'press',
  brief: '<b>Customer complaint:</b> “We added a ‘press active’ lamp H1. Since then the lamp only glows weakly when both buttons are held, and the press no longer comes down.” The lamp must light fully whenever Y1 is energised, and the press must work as before.',
  solution: () => sol.pressLamp(false), start: () => broken.series(), palette: ['pb_no', 'ls_no', 'sol', 'lamp'],
  intro: [
    {h: 'Measure first', html: `<p>Hold both start buttons (keys <kbd>1</kbd> and <kbd>2</kbd>) and click the parts in the Y1 branch one after the other. The panel on the right shows the <b>voltage across</b> each one.</p>
      <p>A solenoid coil needs close to 24 V to pull in. What is Y1 actually getting? What is the lamp getting? Add the two numbers together.</p>
      <p>The wires in that branch glow <b>orange</b> where the voltage is neither 24 V nor 0 V — the sign of two loads sharing one path.</p>`}
  ],
  hints: ['Y1 gets about 5 V and the lamp about 19 V. Together: 24 V. They are sharing the supply.', 'Two loads in series divide the voltage. Each load needs its own path from the switched wire down to 0 V.', 'Take the lamp out of the chain: S2 terminal 4 → Y1 directly. Then wire the lamp in parallel: S2 terminal 4 → top of H1, bottom of H1 → 0 V.'],
  tests: [{kind: 'seq', title: 'Press and lamp', steps: [
    {say: 'Hold S1 and S2 — the lamp lights and the press comes down', press: ['S1', 'S2'], run: 3.5, expect: [['ext', '1A'], ['lamp', 'H1', true], ['sol', 'Y1', true]], why: 'With both buttons held, Y1 must be energised, the lamp lit and the press at the bottom. Y1 and H1 each need their own path to 0 V.'},
    {say: 'Release — the lamp goes out and the press returns', release: ['S1', 'S2'], run: 3.5, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'After release the lamp should be off and the press back at the top.'},
    {say: 'One button alone does nothing', press: ['S1'], run: 0.8, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'The lamp or the press reacts to a single button. The lamp belongs after both start buttons, in parallel with Y1.'}
  ]}],
  learned: ['Loads in series share the voltage — in proportion to their resistance.', 'Every coil and lamp gets its own branch between the switched wire and 0 V: loads go in parallel.', 'Measuring the voltage across each part finds this kind of fault in seconds.'],
  quiz: [{q: 'The lamp has four times the resistance of the solenoid coil. In series on 24 V, what does the coil get?', o: ['24 V', '12 V', 'About 5 V'], a: 2, why: 'The voltage divides in proportion to resistance: one fifth for the coil (4.8 V), four fifths for the lamp (19.2 V).'}]
},
{
  id: 'prox', ch: 9, kind: 'guided', title: 'Three wires: the proximity sensor',
  brief: 'A sensor that notices metal without touching it. It has three wires because, unlike a plain contact, it needs power of its own. Wire one up and let it run a cylinder.',
  solution: sol.prox, start: s => unwired(s), palette: [],
  intro: [
    {h: 'A switch with nothing to press', html: figs(fig('s_ind', 'Inductive sensor B1', {label: 'B1'}), fig('ls_no', 'A limit switch, for comparison', {label: 'S2'})) +
      `<p>A limit switch has to be <b>pushed</b>. That wears it out, and the part doing the pushing must be strong enough. A <b>proximity sensor</b> only needs its target to come <b>near</b>.</p>
      <p>This one is <b>inductive</b>. A coil in its tip sends out a small, fast-changing magnetic field. Metal that comes within a few millimetres soaks up energy from the field, and the electronics inside notice the loss. The diamond in the symbol means “senses without contact”; the little coil inside says how.</p>`},
    {h: 'Why three wires', html: `<p>Those electronics need power all the time, whether a target is there or not. So the sensor has its own supply:</p>
      <ul><li><b>Brown (BN)</b> to <b>+24 V</b></li><li><b>Blue (BU)</b> to <b>0 V</b></li><li><b>Black (BK)</b> is the output</li></ul>
      <p>While it sees a target, the sensor connects black to brown inside itself, so +24 V appears on the black wire. This kind is called <b>PNP</b>, or “positive switching”. The load goes between <b>black and 0 V</b>.</p>
      <p>With no supply on brown and blue the sensor is blind, however close the metal is. The colours are the same on every make of sensor.</p>`}
  ],
  steps: [
    {t: 'Give the sensor its supply. First <b>+24V</b> to the brown terminal <b>BN</b> on top of B1.', hl: ['PSU.pos', 'B1.BN'], ok: x => x.q.linked('PSU.pos', 'B1.BN')},
    {t: 'Now the blue terminal <b>BU</b>, bottom left, to <b>0V</b>.', hl: ['B1.BU', 'PSU.neg'], ok: x => x.q.linked('B1.BU', 'PSU.neg')},
    {t: 'The output: black terminal <b>BK</b>, bottom right, to the top of coil <b>Y1</b>.', hl: ['B1.BK', 'Y1.a'], ok: x => x.q.linked('B1.BK', 'Y1.a')},
    {t: 'Bottom of Y1 to <b>0V</b>.', hl: ['Y1.b', 'PSU.neg'], ok: x => x.q.linked('Y1.b', 'PSU.neg')},
    {t: '<b>Power ON.</b> A row of workpieces appears at the bottom. With <b>Steel</b> chosen, hold the <b>Workpiece</b> button: the sensor turns red and the cylinder goes out.', hl: ['B1'], sticky: true, ok: x => x.running && x.mat === 'steel' && x.shown && x.sens('B1') && x.ext('1A')},
    {t: 'Now choose <b>Plastic</b> and hold it in front of the sensor. Nothing happens: an inductive sensor is blind to anything that is not metal.', hl: ['B1'], sticky: true, ok: x => x.running && x.mat === 'plastic' && x.shown && !x.sens('B1')}
  ],
  learned: ['A proximity sensor has its own electronics, so it needs +24 V on brown and 0 V on blue before it can do anything.', 'A PNP sensor puts +24 V on its black wire while it sees a target. The load goes between black and 0 V.', 'An inductive sensor sees metal and nothing else.'],
  quiz: [
    {q: 'A three-wire sensor has brown on +24 V and black on a relay coil, but its blue wire has come loose. What happens when metal comes near?', o: ['The relay pulls in as usual', 'Nothing: without 0 V the sensor has no supply', 'The fuse trips'], a: 1, why: 'The electronics are powered between brown and blue. With one of them missing the sensor is dead, whatever is in front of it.'},
    {q: 'Which wire of a PNP sensor carries the signal to the load?', o: ['Brown', 'Blue', 'Black'], a: 2, why: 'Brown and blue are the supply. Black is the switched output: it shows +24 V while the sensor sees its target.'}
  ]
},
{
  id: 'senses', ch: 9, kind: 'guided', title: 'Who sees what?',
  brief: 'Four kinds of sensor, each with a lamp. Hold four different workpieces in front of them and find out what each kind notices and what it misses.',
  solution: sol.senses, start: s => clone(s), palette: [],
  intro: [
    {h: 'Four ways to notice a part', html: figs(fig('reed_no', 'Reed switch B1', {label: 'B1'}), fig('s_ind', 'Inductive B2', {label: 'B2'}), fig('s_cap', 'Capacitive B3', {label: 'B3'}), fig('s_opt', 'Optical B4', {label: 'B4'})) +
      `<ul><li><b>Reed switch</b>: two steel tongues in a glass tube that a <b>magnet</b> pulls together. Two wires, no electronics.</li>
      <li><b>Inductive</b>: a coil whose field is disturbed by <b>metal</b>.</li>
      <li><b>Capacitive</b>: its tip is one plate of a capacitor, and <b>almost any material</b> nearby changes it.</li>
      <li><b>Optical</b>: it sends out light and watches for the <b>reflection</b>.</li></ul>
      <p>The mark inside the diamond tells them apart: a coil, two plates, a ray of light.</p>`},
    {h: 'The test bench', html: `<p>Everything is wired. Each sensor feeds one lamp: B1 → H1, B2 → H2, B3 → H3, B4 → H4.</p>
      <p>With the power on, choose a workpiece at the bottom and hold the <b>Workpiece</b> button to put it in front of all four at once. Try all four materials and watch which lamps light.</p>
      <p>Choosing the right sensor is mostly a matter of knowing this table by heart.</p>`}
  ],
  steps: [
    {t: '<b>Power ON</b>, choose <b>Steel</b> and hold <b>Workpiece</b>. Three lamps light. The reed switch does not care: steel is not a magnet.', sticky: true, ok: x => x.running && x.mat === 'steel' && x.shown && !x.lamp('H1') && x.lamp('H2') && x.lamp('H3') && x.lamp('H4')},
    {t: 'Now <b>Plastic</b>. The inductive sensor drops out as well. Capacitive and optical still see the part.', sticky: true, ok: x => x.running && x.mat === 'plastic' && x.shown && !x.lamp('H2') && x.lamp('H3') && x.lamp('H4')},
    {t: 'Now <b>Glass</b>. The light of the optical sensor goes straight through it. Only the capacitive sensor is left.', sticky: true, ok: x => x.running && x.mat === 'glass' && x.shown && !x.lamp('H2') && x.lamp('H3') && !x.lamp('H4')},
    {t: 'Last, the <b>Magnet</b>. Now the reed switch closes too, and since a magnet is a piece of metal, all four lamps are on.', sticky: true, ok: x => x.running && x.mat === 'magnet' && x.shown && x.lamp('H1') && x.lamp('H2') && x.lamp('H3') && x.lamp('H4')}
  ],
  learned: ['Reed switch: magnets only. That is why it sits on a cylinder, whose piston carries a magnet.', 'Inductive: metal only. Capacitive: nearly everything. Optical: anything that reflects light, so not clear glass.', 'Two sensors of different kinds can tell materials apart: seen by the capacitive one but not by the inductive one means “not metal”.'],
  quiz: [
    {q: 'Bottles of clear glass must be counted on a conveyor. Which sensor is the safe choice?', o: ['Inductive', 'Capacitive', 'Optical, diffuse'], a: 1, why: 'Glass is not metal, and a light beam passes through it. A capacitive sensor reacts to almost any material, glass included.'},
    {q: 'An inductive and a capacitive sensor look at the same spot. The capacitive one switches, the inductive one does not. What is in front of them?', o: ['A steel part', 'Nothing at all', 'A part that is not metal'], a: 2, why: 'Something is there, because the capacitive sensor reacts. It is not metal, or the inductive sensor would react too.'}
  ]
},
{
  id: 'sorter', ch: 9, kind: 'build', title: 'Metal or not? The sorting station', scene: 'sorter',
  brief: 'Parts come down a belt past two sensors. <b>Metal</b> parts must be pushed off into the bin by cylinder 1A. Anything else stays on the belt, and lamp <b>H1</b> reports it.',
  solution: sol.sorter, start: s => strip(s, c => ['K1', 'K1a', 'K1b', 'Y1', 'H1'].includes(c.id), w => w.k === 'e'), palette: ['relay', 'k_no', 'k_nc', 'sol', 'lamp'],
  intro: [
    {h: 'Two sensors, two questions', html: figs(fig('s_ind', 'B1 sees metal', {label: 'B1'}), fig('s_cap', 'B2 sees any part', {label: 'B2'})) +
      `<p>The station has an <b>inductive</b> sensor B1 and a <b>capacitive</b> sensor B2 looking at the same spot on the belt.</p>
      ` + tt(['part', 'B1', 'B2', 'pusher 1A', 'lamp H1'], [['steel', 1, 1, 'out', 0], ['plastic', 0, 1, 'stays', 1], ['glass', 0, 1, 'stays', 1], ['none', 0, 0, 'stays', 0]]) +
      `<p>So: <b>Y1 = B1</b>, and <b>H1 = B2 and not B1</b>.</p>`},
    {h: 'A sensor has no “normally closed” side', html: `<p>“Not B1” needs a normally-closed contact, and a sensor has only its one output. The answer is the same as for any signal you need more than once or need inverted: let the sensor drive a <b>relay</b>, and use the relay's contacts.</p>
      <ul><li>B1 black → relay coil <b>K1</b> → 0 V</li><li>+24 V → K1 normally open → <b>Y1</b> → 0 V</li><li>B2 black → K1 normally <b>closed</b> → <b>H1</b> → 0 V</li></ul>
      <p>Both sensors first need their own supply: brown to +24 V, blue to 0 V.</p>
      <p>When your circuit passes the tests, press <b>Belt</b> at the bottom with the power on, and the station feeds itself with random parts.</p>`}
  ],
  hints: ['Start with the supplies: brown of B1 and of B2 to +24 V, blue of both to 0 V. A sensor without supply never switches.', 'B1 black → K1 coil → 0 V. Then +24 V → K1 (normally open) → Y1 → 0 V. Now metal parts are pushed off.', 'The lamp: B2 black → K1 normally closed → H1 → 0 V. The lamp gets current only while B2 sees a part and K1 has not pulled in.'],
  tests: [
    {kind: 'seq', title: 'Sort what comes down the belt', steps: [
      {say: 'A steel part arrives: the pusher throws it into the bin, the lamp stays dark', mat: 'steel', show: true, run: 2, expect: [['ext', '1A'], ['lamp', 'H1', false]], why: 'A metal part must extend 1A, and H1 must stay off. Check that both sensors have brown on +24 V and blue on 0 V, that B1 switches K1, and that a normally-open K1 contact feeds Y1.'},
      {say: 'The spot is empty again: the pusher goes back', show: false, run: 2, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'With no part at the sensors the pusher must return and the lamp must be off.'},
      {say: 'A plastic part arrives: the pusher stays in, the lamp lights', mat: 'plastic', show: true, run: 1.2, expect: [['ret', '1A'], ['lamp', 'H1', true]], why: 'Plastic is seen by B2 only. H1 should light through B2 and a normally-closed K1 contact, and the pusher must not move.'},
      {say: 'It moves on: the lamp goes out', show: false, run: 0.6, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'The lamp must go out when the part has left.'},
      {say: 'A glass part arrives: lamp on, pusher in', mat: 'glass', show: true, run: 1.2, expect: [['ret', '1A'], ['lamp', 'H1', true]], why: 'Glass is not metal, so it should be reported like plastic. If the lamp stayed dark, the sensor feeding it cannot see glass: it has to be the capacitive one.'}
    ]},
    {kind: 'rule', title: 'No hands', why: 'This station runs by itself: there should be no pushbutton or switch in it.', check: q => q.count('pb_no') + q.count('pb_nc') + q.count('sw_no') + q.count('sw_nc') === 0}
  ],
  learned: ['Two different sensors on one spot can tell materials apart.', 'A sensor has one output. Feed a relay with it and you get as many contacts as you need, normally closed ones included.', 'Every three-wire sensor needs brown on +24 V and blue on 0 V, however many of them there are.'],
  quiz: [{q: 'You need the signal “no metal here” from an inductive sensor. How do you get it?', o: ['Swap its brown and blue wires', 'Let it drive a relay and use a normally-closed relay contact', 'It cannot be done'], a: 1, why: 'The sensor only says “metal here”. A relay driven by it has normally-closed contacts, which conduct exactly when the sensor is not switched.'}]
},
{
  id: 'proj1', ch: 10, kind: 'build', title: 'Project — the gluing clamp',
  brief: 'Plastic housings are clamped for gluing. Tap <b>S1</b> to close clamp 1A, but only while sensor <b>B1</b> sees a housing. Tap <b>S2</b> to open it. Lamp <b>H1</b> shows “clamp closed”, using limit switch <b>S3</b> at the front end.',
  solution: sol.clampCheck, start: bare, palette: ['pb_no', 'pb_nc', 'sw_no', 'sw_nc', 'ls_no', 'ls_nc', 'reed_no', 's_ind', 's_cap', 's_opt', 'relay', 'k_no', 'k_nc', 'timer', 'timer_off', 'counter', 'counter_r', 'sol', 'lamp'],
  intro: [{h: 'Specification', html: `<ul><li>Cylinder <b>1A</b> with a double-solenoid valve: <b>Y1</b> closes the clamp, <b>Y2</b> opens it. Air is already piped.</li>
    <li><b>S1</b> (pushbutton): close the clamp, but only if a housing is in place.</li><li><b>B1</b> (sensor): “housing in place”. The housings are <b>plastic</b>, so choose the kind of sensor that can see them.</li>
    <li><b>S2</b> (pushbutton): open the clamp.</li><li><b>H1</b> (lamp): lit while the clamp is fully closed. Limit switch <b>S3</b> is already marked at the front end of 1A.</li></ul><p><b>Exam habit:</b> before you place a single part, write down the inputs, the outputs and what must happen, then sketch the circuit. Every part you use needs the label the specification gives it.</p>`}],
  hints: ['The sensor needs its supply first: brown to +24 V, blue to 0 V. Its black output then acts as one more switch in the S1 branch.', 'Y1 = B1 AND S1: +24 V → (sensor output) → S1 → Y1 → 0 V. Y2 = S2. H1 = S3.', 'If nothing happens with a part in place, check the kind of sensor: an inductive one does not see plastic.'],
  tests: [
    {kind: 'seq', title: 'Clamp with part check', steps: [
      {say: 'No housing: tap S1 — the clamp stays open', show: false, tap: ['S1'], run: 1.5, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'With no housing in front of B1, S1 must do nothing.'},
      {say: 'A plastic housing is put in place, tap S1 — the clamp closes and H1 lights', mat: 'plastic', show: true, tap: ['S1'], run: 2, expect: [['ext', '1A'], ['lamp', 'H1', true]], why: 'With a housing in place S1 must close the clamp, and H1 must light at the front end. If nothing moved, the sensor may not see plastic, or it has no supply.'},
      {say: 'The clamp stays closed while the glue sets', run: 1, expect: [['ext', '1A']], why: 'The clamp opened by itself.'},
      {say: 'Tap S2 — the clamp opens and H1 goes out', tap: ['S2'], run: 2, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'S2 must open the clamp through Y2, and the lamp must go out.'}
    ]}
  ],
  learned: ['A sensor output can be one contact in a chain, like any switch.', 'Read the specification for the material: it decides the kind of sensor.', 'A double-solenoid valve keeps the clamp closed with no signal at all.'],
  quiz: [{q: 'The clamp of this project must also work with aluminium housings. Which sensor would see both plastic and aluminium?', o: ['Capacitive', 'Inductive', 'Reed switch'], a: 0, why: 'Capacitive sensors react to almost any material. Inductive ones see the aluminium but not the plastic, and a reed switch needs a magnet.'}]
},
{
  id: 'proj2', ch: 10, kind: 'build', title: 'Project — the automatic door',
  brief: 'A door (cylinder 1A, spring-return valve) opens from <b>S1</b> inside or <b>S3</b> outside and stays open after the button is released. <b>S2</b> closes it and must win when it is held. Lamp <b>H1</b> is lit while the door is commanded open. Use relay <b>K1</b>.',
  solution: sol.doorTwo, start: bare, palette: ['pb_no', 'pb_nc', 'sw_no', 'sw_nc', 'ls_no', 'ls_nc', 'reed_no', 's_ind', 's_cap', 's_opt', 'relay', 'k_no', 'k_nc', 'timer', 'timer_off', 'counter', 'counter_r', 'sol', 'lamp'],
  intro: [{h: 'Specification', html: `<ul><li>Cylinder <b>1A</b>, 5/2 valve with spring return, solenoid <b>Y1</b>: Y1 on = door open.</li>
    <li><b>S1</b> and <b>S3</b> (pushbuttons): open. One tap is enough; the door stays open.</li><li><b>S2</b> (pushbutton): close. Pressed together with an OPEN button, CLOSE wins.</li>
    <li><b>H1</b> (lamp): lit while the door is commanded open.</li><li>Use relay <b>K1</b> as the memory.</li></ul><p><b>Exam habit:</b> before you place a single part, write down the inputs, the outputs and what must happen, then sketch the circuit. Every part you use needs the label the specification gives it.</p>`}],
  hints: ['A spring-return valve forgets, so the memory has to be a latching relay: K1 holds itself through one of its own normally-open contacts.', 'The two OPEN buttons and the holding contact sit side by side in parallel. CLOSE must win, so its normally-closed contact goes in series after all three: dominant OFF.', 'Y1 and H1 each get their own normally-open K1 contact.'],
  tests: [
    {kind: 'seq', title: 'Open, close, and CLOSE wins', steps: [
      {say: 'Tap S1 — the door opens and H1 lights', tap: ['S1'], run: 1.5, expect: [['ext', '1A'], ['lamp', 'H1', true]], why: 'One tap on S1 must open the door and keep it open, with H1 lit.'},
      {say: 'Tap S2 — the door closes and H1 goes out', tap: ['S2'], run: 1.5, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'S2 must break the latch.'},
      {say: 'Tap S3 — the door opens from outside too', tap: ['S3'], run: 1.5, expect: [['ext', '1A'], ['lamp', 'H1', true]], why: 'S3 must open the door just like S1.'},
      {say: 'Hold S2 and tap S3 — the door closes and stays closed', press: ['S2'], tap: ['S3'], run: 1.5, expect: [['ret', '1A'], ['lamp', 'H1', false]], why: 'With S2 held, nothing may open the door: CLOSE must win (dominant OFF).'},
      {say: 'Let go of S2 — the door stays closed', release: ['S2'], run: 1, expect: [['ret', '1A']], why: 'The door opened by itself when S2 was released.'}
    ]},
    {kind: 'rule', title: 'A relay as the memory', why: 'The specification asks for relay K1 as the memory.', check: q => q.count('relay') >= 1}
  ],
  learned: ['Several START buttons go in parallel with the holding contact; the STOP contact goes in series after them all.', 'With a spring-return valve, the relay latch is the only memory in the machine.', 'Each load gets its own relay contact.'],
  quiz: [{q: 'The specification changes: OPEN must win when both are pressed. What do you move?', o: ['The STOP contact, so it is in series with the holding contact only', 'The lamp', 'Nothing, it already works that way'], a: 0, why: 'In a dominant-ON latch the START paths reach the coil directly, and STOP only breaks the holding path.'}]
},
{
  id: 'proj3', ch: 10, kind: 'build', title: 'Project — the batch pusher',
  brief: 'Boxes pass a light barrier <b>B1</b>. After every third box, pusher 1A shoves the batch on, comes back by itself when it reaches limit switch <b>S3</b> at the front end, and counting starts again from zero. Use counter <b>C1</b>.',
  solution: sol.batch, start: bare, palette: ['pb_no', 'pb_nc', 'sw_no', 'sw_nc', 'ls_no', 'ls_nc', 'reed_no', 's_ind', 's_cap', 's_opt', 'relay', 'k_no', 'k_nc', 'timer', 'timer_off', 'counter', 'counter_r', 'sol', 'lamp'],
  intro: [{h: 'Specification', html: `<ul><li>Cylinder <b>1A</b>, 5/2 valve with spring return, solenoid <b>Y1</b>. Limit switch <b>S3</b> is marked at the front end.</li>
    <li><b>B1</b> (sensor): counts the boxes. The boxes are cardboard, so an inductive sensor will not do.</li><li><b>C1</b> (preset counter, preset 3): counts B1's pulses.</li>
    <li>When the count is reached, 1A extends. At S3 the counter is reset, so 1A returns and counting starts again.</li></ul>
    <p>Test it with the <b>Workpiece</b> button: each press is one box going past.</p><p><b>Exam habit:</b> before you place a single part, write down the inputs, the outputs and what must happen, then sketch the circuit. Every part you use needs the label the specification gives it.</p>`}],
  hints: ['B1 black → counter coil C1 (A1) → 0 V. Every box is one rising edge, and the counter counts edges.', 'A normally-open contact labelled C1 feeds Y1. It closes when the count reaches 3.', 'S3 → reset coil labelled C1 → 0 V. When the pusher reaches S3, the count goes to zero, the C1 contact opens and the spring brings the valve, and the pusher, back.'],
  tests: [
    {kind: 'seq', title: 'Three boxes, one push', steps: [
      {say: 'Box 1 passes — nothing moves', mat: 'plastic', show: true, run: 0.3, expect: [], why: ''},
      {say: 'Box 1 has gone', show: false, run: 0.3, expect: [['ret', '1A'], ['count', 'C1', 1]], why: 'The first box must be counted (C1 = 1) and the pusher must stay back. Check that B1 can see the boxes and feeds counter C1.'},
      {say: 'Box 2', show: true, run: 0.3, expect: [], why: ''},
      {say: 'Box 2 has gone', show: false, run: 0.3, expect: [['ret', '1A'], ['count', 'C1', 2]], why: 'The second box must be counted and the pusher must still stay back.'},
      {say: 'Box 3 — the pusher shoves the batch, returns at S3, and the count starts again', show: true, run: 0.3, expect: [], why: ''},
      {say: 'Box 3 has gone', show: false, run: 3, expect: [['cycles', '1A', 1], ['ret', '1A'], ['count', 'C1', 0]], why: 'After the third box 1A must extend once, come back on its own, and the counter must be at zero again. If it stayed out, S3 does not reset C1.'},
      {say: 'Box 4 starts a new batch', show: true, run: 0.3, expect: [], why: ''},
      {say: 'Box 4 has gone', show: false, run: 0.3, expect: [['ret', '1A'], ['count', 'C1', 1]], why: 'The next box must count as the first of a new batch.'}
    ]}
  ],
  learned: ['A sensor can feed a counter directly: every new detection is one count.', 'The machine resets its own counter, from the limit switch at the end of the push.', 'Because the reset also opens the C1 contact, the spring-return valve brings the pusher back by itself.'],
  quiz: [{q: 'In this project, what would happen if S3 were missing?', o: ['After three boxes the pusher would extend and stay out', 'The pusher would extend after every box', 'Nothing would ever move'], a: 0, why: 'Without the reset the count stays at 3, the C1 contact stays closed and Y1 stays energised.'}]
}
];

/* examples offered in the sandbox */
EP.examples = [
  ['Direct control', sol.direct], ['OR circuit', sol.or], ['AND circuit', sol.and], ['Press, direct control', sol.pressDirect],
  ['Press, indirect control', sol.pressIndirect], ['Latching, dominant OFF', sol.latchOff], ['Latching, dominant ON', sol.latchOn],
  ['Magazine feeder', sol.feeder], ['Automatic press cycle', sol.auto], ['Single-acting cylinder', sol.pipe], ['Timer: dwell at the end', sol.timer],
  ['Glue press (latch + timer)', sol.dwell], ['Counter: batch of three', sol.counter], ['Pressure switch return', sol.pressure], ['Sequence A+ B+ A− B−', sol.sequence],
  ['Sequence A+ B+ B− A− (cascade)', sol.cascade]
];

EP.examples.push(['Single cycle / continuous', sol.modes], ['Emergency stop', sol.estop]);
EP.examples.push(['Off-delay timer', sol.offdelay], ['Two-hand safety start', sol.twohand], ['Jog with a 5/3 valve', sol.jog], ['Sequence A+ A− B+ B− (cascade)', sol.cascade2]);

EP.examples.push(['Gluing clamp with part check', sol.clampCheck], ['Door: two OPEN buttons, CLOSE wins', sol.doorTwo], ['Batch pusher with counter', sol.batch]);
EP.examples.push(['Proximity sensor, three wires', sol.prox], ['Sensor test bench', sol.senses], ['Sorting station', sol.sorter], ['Reed switches on the cylinder', sol.reedcyl]);

/* ---------- fault hunt: a healthy machine with one invisible defect ---------- */
const HUNTS = [
  ['press1', 'The two-hand press', 'Holding S1 and S2 together brings the press down. Once the buttons are released, limit switch S3 at the bottom sends it back up. S4 releases it by hand.'],
  ['press2', 'The relay-controlled press', 'Holding S1 and S2 together brings the press down (through relay K1). Limit switch S3 at the bottom, or pushbutton S4, sends it back up (through relay K2).'],
  ['feeder', 'The magazine feeder', 'One tap on S1: the slide travels fully forward and returns by itself.'],
  ['auto', 'The automatic press', 'A tap on S1 starts continuous cycling. A tap on S2 lets it finish the stroke, return to the top and stop.'],
  ['dwell', 'The glue press', 'One tap on S1: the press comes down, holds for 3 seconds, and goes back up.'],
  ['modes', 'The two-mode press', 'A tap on S1 gives one stroke. With toggle switch S2 on, it cycles continuously.'],
  ['sequence', 'The transfer station', 'One tap on S1 runs the sequence 1A+ 2A+ 1A− 2A−.'],
  ['cascade', 'The clamp-and-stamp station', 'One tap on S1 runs the sequence 1A+ 2A+ 2A− 1A−.'],
  ['offdelay', 'The heat-sealing press', 'The press closes while S1 is held and stays closed for 2 seconds after S1 is released.'],
  ['twohand', 'The two-hand safety press', 'The press comes down only if S1 and S2 are pressed within half a second of each other, and goes back up when either is released.'],
  ['cascade2', 'The stamp-and-eject station', 'One tap on S1 runs the sequence 1A+ 1A− 2A+ 2A−.'],
  ['sorter', 'The sorting station', 'A steel part in front of the sensors is pushed off the belt by 1A. A plastic or glass part is left alone, and lamp H1 lights for it. Use the workpieces at the bottom to try it.']
];
EP.makeHunt = function (avoid) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let h; do h = pick(HUNTS); while (h[0] === avoid);
  const L0 = EP.lessons.find(l => l.id === h[0]), circ = L0.solution(), byId = new Map(circ.comps.map(c => [c.id, c]));
  circ.comps.forEach(c => { c.fixed = true; });
  const name = e => { const c = byId.get(e.c); return c.type === 'psu' ? (e.p === 'pos' ? 'the +24 V rail' : 'the 0 V rail') : c.type === 'air' ? 'the air supply' : (c.label || D[c.type].short) + ' (' + e.p + ')'; };
  const pool = {open: [], blocked: [], dead: [], stuck: [], blind: []};
  for (const w of circ.wires) pool[w.k === 'e' ? 'open' : 'blocked'].push({id: w.id, at: 'between ' + name(w.a) + ' and ' + name(w.b)});
  for (const c of circ.comps) {
    if (c.type === 'sol' || EP.is.isCoil(c.type)) pool.dead.push({id: c.id, at: c.label});
    if (c.type === 'pb_no' || c.type === 'ls_no' || c.type === 'k_no') pool.stuck.push({id: c.id, at: c.label});
    if (EP.is.isSens(c.type)) pool.blind.push({id: c.id, at: c.label});
  }
  const kinds = Object.keys(pool).filter(k => pool[k].length);
  let f = null;
  for (let n = 0; n < 15 && !f; n++) {                 // only accept a fault that really stops the machine doing its job
    const kind = pick(kinds), c = pick(pool[kind]);
    if (!EP.evalLesson(circ, L0, {[kind]: {[c.id]: true}}).pass) f = {kind, id: c.id, at: c.at};
  }
  if (!f) { const c = pool.dead[0]; f = {kind: 'dead', id: c.id, at: c.at}; }
  const why = {
    open: `The wire ${f.at} had a broken conductor inside its insulation. It looked perfect, but voltage arrived at one end and never reached the other.`,
    blocked: `The tube ${f.at} was kinked shut: pressure on one side, nothing on the other.`,
    dead: `The coil of ${f.at} had burnt out. It still got its full 24 V, but with the winding open no current could flow, so it never pulled in.`,
    stuck: `The contact of ${f.at} was worn out. It was operated, but its contact never closed.`,
    blind: `Sensor ${f.at} had failed inside. It had its supply and a part it should see in front of it, but its output never switched.`
  }[f.kind];
  const tip = {
    open: 'How to find it: follow the red. A healthy wire has the same voltage at both ends — click wires along the dead path until one reads 24 V at one end and 0 V at the other.',
    blocked: 'How to find it: follow the blue. Click the tubes along the line that should be pressurised until one shows different pressures at its two ends.',
    dead: 'How to find it: click the coil while it should be on. Voltage across it but 0 mA through it means the coil itself is open.',
    stuck: 'How to find it: click the switch while it is being operated. “Operated: yes” together with “contact: open” means the contact has failed.',
    blind: 'How to find it: click the sensor while a part is in front of it. Full supply, the right material in front, and the output still off: the sensor itself is dead.'
  }[f.kind];
  return {
    id: 'hunt', hunt: {src: L0.id, fault: f, name: h[1], does: h[2], why, tip}, ch: -1, kind: 'hunt', title: 'Fault hunt', scene: L0.scene,
    solution: () => circ, start: s => s, palette: [], tests: L0.tests, learned: [], quiz: [],
    intro: [{h: 'One part has failed', html: `<p><b>${h[1]}.</b> ${h[2]}</p><p>That is what it did yesterday. Today something inside it has failed, and <b>nothing on the sheet shows it</b>: the drawing is correct and every part is where it belongs.</p>
      <p>You may not rewire anything. Switch on, operate the machine, and <b>measure</b>: click any part or line to read its voltage, current or pressure.</p>
      <ul><li>A <b>broken wire</b> reads different voltages at its two ends.</li><li>A <b>burnt-out coil</b> has voltage across it but no current.</li><li>A <b>worn contact</b> is operated but stays open.</li><li>A <b>kinked tube</b> has pressure on one side only.</li></ul>
      <p>Select the culprit and accuse it. The self-test tells you which function has failed, if you want a starting point.</p>`}]
  };
};

/* ---------- logic drill: an endless supply of truth tables to build ---------- */
const DRILLS = [
  [2, (a, b) => a && !b, 'S1 AND NOT S2', 'A normally-closed pushbutton passes current until it is pressed. Put S1 (normally open) in series with S2 (normally closed).'],
  [2, (a, b) => a || !b, 'S1 OR NOT S2', 'Two parallel paths: one through a normally-open S1, one through a normally-closed S2.'],
  [2, (a, b) => !a && !b, 'NOT S1 AND NOT S2', 'The coil is on at rest and either button switches it off: two normally-closed contacts in series.'],
  [2, (a, b) => a !== b, 'exactly one of S1, S2 (exclusive OR)', 'You need each button twice. Two parallel paths: [S1 normally open → S2 normally closed] and [S1 normally closed → S2 normally open]. Rename the extra pushbuttons so two are called S1 and two S2.'],
  [2, (a, b) => a === b, 'both or neither (equivalence)', 'Two parallel paths: [S1 NO → S2 NO] and [S1 NC → S2 NC]. Rename the extra pushbuttons so two are called S1 and two S2.'],
  [3, (a, b, c) => (a && b) || c, '(S1 AND S2) OR S3', 'A series pair with one more contact in parallel around both.'],
  [3, (a, b, c) => a && (b || c), 'S1 AND (S2 OR S3)', 'S1 first, then a parallel pair.'],
  [3, (a, b, c) => (a || b) && !c, '(S1 OR S2) AND NOT S3', 'A parallel pair, followed in series by a normally-closed S3.'],
  [3, (a, b, c) => a && b && !c, 'S1 AND S2 AND NOT S3', 'Three contacts in one chain; the last one is normally closed.'],
  [3, (a, b, c) => (a && !b) || c, '(S1 AND NOT S2) OR S3', 'One path through S1 (NO) and S2 (NC) in series; a second path through S3 alone.'],
  [3, (a, b, c) => a || (b && c), 'S1 OR (S2 AND S3)', 'S1 alone in one path; S2 and S3 in series in the other.'],
  [3, (a, b, c) => !a && (b || c), 'NOT S1 AND (S2 OR S3)', 'A normally-closed S1 in series with a parallel pair.'],
  [3, (a, b, c) => (a && b) || (a && c) || (b && c), 'at least two of the three (majority vote)', 'Three parallel paths, each a series pair: S1–S2, S1–S3, S2–S3. You need every button twice, so rename the extra pushbuttons.']
];
EP.makeDrill = function (avoid) {
  let i; do i = Math.floor(Math.random() * DRILLS.length); while (i === avoid && DRILLS.length > 1);
  const d = DRILLS[i], ins = ['S1', 'S2', 'S3'].slice(0, d[0]), rows = [];
  for (let m = 0; m < (1 << d[0]); m++) { const bits = ins.map((_, k) => (m >> k) & 1); rows.push(bits.concat(d[1](...bits) ? 1 : 0)); }
  const table = tt(ins.concat('Y1'), rows);
  return {
    id: 'drill', drill: i, ch: -1, kind: 'build', title: 'Logic drill', noSolve: true,
    brief: 'Build a circuit for coil <b>Y1</b> that matches this table.' + table,
    solution: sol.mix, start: bare, palette: ['pb_no', 'pb_nc', 'sol', 'lamp'],
    intro: [{h: 'Match this truth table', html: table + `<p>Take pushbuttons and a solenoid coil from the bin. A <b>normally-closed</b> pushbutton gives you “NOT”: it conducts until pressed.</p>
      <p>If the same input is needed in two places, use two pushbuttons with the <b>same label</b> — click a part to rename it. Pressing that label operates both, like a button with two contact blocks.</p>`}],
    hints: ['Find the rows where Y1 = 1. Each of them is one way for current to get through — one path. Inputs that are 0 in such a row need a normally-closed contact.', d[3], 'In words: Y1 = ' + d[2] + '.'],
    tests: [{kind: 'truth', title: 'Truth table', inputs: ins, out: ['sol', 'Y1'], fn: d[1]}],
    learned: ['This one was: Y1 = ' + d[2] + '.', 'Series = AND, parallel = OR, normally closed = NOT. Every logic function is built from those three.'], quiz: []
  };
};
})(typeof window !== 'undefined' ? window : globalThis);

// Headless check: every lesson's reference solution must pass its own test bench,
// and every unsolved starting circuit must fail it.
require('../js/components.js'); require('../js/engine.js'); require('../js/lessons.js'); require('../js/practice.js');
const EP = globalThis.EP;
let bad = 0;
for (const L of EP.lessons) {
  const s = L.solution(), start = L.start(L.solution());
  if (!L.tests) { console.log('  -   ', L.id, '(guided)'); continue; }
  const t0 = Date.now(), a = EP.evalLesson(s, L), b = EP.evalLesson(start, L);
  const ok = a.pass && !b.pass; if (!ok) bad++;
  console.log(ok ? '  ok  ' : ' FAIL ', L.id, 'solution:', a.pass, 'start:', b.pass, (Date.now() - t0) + 'ms');
  if (!a.pass) for (const r of a.out) if (!r.ok) console.log('      ', r.t.title, JSON.stringify(r.rows.filter(x => !x.ok)));
}
// guided lessons have no test bench, so spot-check their reference circuits here
const chk = (name, ok) => { if (!ok) bad++; console.log(ok ? '  ok  ' : ' FAIL ', name); };
{
  const s = new EP.Sim(EP.solutions.pipe()); s.power(true); s.run(0.5); s.pressLabel('S1', true); s.run(1.5);
  const out = s.check(['ext', '1A']); s.pressLabel('S1', false); s.run(2.5);
  chk('pipe: single-acting cylinder extends and spring-returns', out && s.check(['ret', '1A']));
  const t = new EP.Sim(EP.solutions.timer()); t.power(true); t.run(0.5); t.pressLabel('S1', true); t.run(0.15); t.pressLabel('S1', false); t.run(2.4);
  const held = t.check(['ext', '1A']); t.run(2.5);
  chk('timer: dwells about 2 s at the end, then returns', held && t.check(['ret', '1A']) && t.check(['cycles', '1A', 1]));
  // A+ B+ B- A- wired naively must jam in exactly the two places the lesson describes
  const o = new EP.Sim(EP.solutions.overlap()); o.power(true); o.run(0.5); o.pressLabel('S1', true); o.run(1.5);
  chk('overlap: 1A blocked by Y2 at the start', o.solOn('Y1') && o.solOn('Y2') && o.check(['ret', '1A']));
  const c2 = EP.solutions.overlap(); c2.wires = c2.wires.filter(w => !(w.a.c === 'S4' && w.b.c === 'Y2'));
  const o2 = new EP.Sim(c2); o2.power(true); o2.run(0.5); o2.pressLabel('S1', true); o2.run(0.15); o2.pressLabel('S1', false); o2.run(4);
  chk('overlap: 2A jams extended with Y3 and Y4 both on', o2.check(['ext', '1A']) && o2.check(['ext', '2A']) && o2.solOn('Y3') && o2.solOn('Y4'));
  // a drill that needs the same button twice: exclusive OR built from two NO and two NC pushbuttons
  const N = (t, id, label) => EP.newComp(t, id, 0, 0, {label}), W = (a, b) => ({id: a + b, k: 'e', a: {c: a.split('.')[0], p: a.split('.')[1]}, b: {c: b.split('.')[0], p: b.split('.')[1]}});
  const xor = {comps: [N('psu', 'P', ''), N('pb_no', 'a1', 'S1'), N('pb_nc', 'a2', 'S1'), N('pb_no', 'b1', 'S2'), N('pb_nc', 'b2', 'S2'), N('sol', 'Y', 'Y1')],
    wires: [W('P.pos', 'a1.3'), W('a1.4', 'b2.1'), W('b2.2', 'Y.a'), W('P.pos', 'a2.1'), W('a2.2', 'b1.3'), W('b1.4', 'Y.a'), W('Y.b', 'P.neg')]};
  chk('drill: XOR from doubled buttons passes its table', EP.evalLesson(xor, {tests: [{kind: 'truth', inputs: ['S1', 'S2'], out: ['sol', 'Y1'], fn: (a, b) => a !== b}]}).pass);
  const dr = EP.makeDrill(-1);
  chk('drill: generator makes a lesson whose empty start fails', !EP.evalLesson(dr.start(dr.solution()), dr).pass);
  // fault hunt: every generated machine is healthy without its fault and broken with it
  const kinds = {};
  let huntOk = true;
  for (let i = 0; i < 12; i++) {
    const h = EP.makeHunt(null), f = h.hunt.fault, c = h.solution();
    kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    if (!EP.evalLesson(c, h).pass || EP.evalLesson(c, h, {[f.kind]: {[f.id]: true}}).pass) huntOk = false;
  }
  chk('hunt: 12 generated faults all break a healthy machine ' + JSON.stringify(kinds), huntOk);
  // each kind of fault leaves the trace the game tells players to look for
  const pd = EP.solutions.direct(), W1 = pd.wires.find(w => w.a.c === 'S1' && w.b.c === 'Y1'), T1 = pd.wires.find(w => w.k === 'p' && w.a.c === '1A' && w.a.p === 'a');
  const run1 = F => { const s = new EP.Sim(pd, F); s.power(true); s.run(0.5); s.pressLabel('S1', true); s.run(1.5); return s; };
  let fs = run1({open: {[W1.id]: true}});
  chk('fault trace: broken wire has 24 V on one end, 0 V on the other', Math.abs(fs.nodeV('S1', '4') - 24) < 0.1 && fs.nodeV('Y1', 'a') < 0.1 && fs.check(['ret', '1A']));
  fs = run1({dead: {Y1: true}});
  chk('fault trace: dead coil has 24 V across it and does not pull in', fs.st.Y1.v > 23 && !fs.solOn('Y1') && fs.st.PSU.I < 0.001);
  fs = run1({stuck: {S1: true}});
  chk('fault trace: worn contact is operated but open', fs.st.S1.pressed && !fs.closed(pd.comps.find(c => c.id === 'S1')));
  fs = run1({blocked: {[T1.id]: true}});
  chk('fault trace: kinked tube has pressure on one side only', fs.portP('1V', '4') > 6.5e5 && fs.portP('1A', 'a') < 1.5e5 && !fs.check(['ext', '1A']));
  // 5/3 closed centre: stops on trapped air, gives under load like a spring, and two signals cancel
  const j = EP.solutions.jog(), js = new EP.Sim(j); js.power(true); js.run(0.6);
  js.pressLabel('S1', true); js.run(3); const jOut = js.check(['ext', '1A']); js.pressLabel('S1', false); js.run(0.3);
  js.pressLabel('S2', true); js.run(0.6); js.pressLabel('S2', false); js.run(2);
  const jx = js.st['1A'].x;
  chk('5/3 valve: piston stops mid-stroke and stays there', jOut && js.check(['mid', '1A']) && js.st['1V'].pos === 0);
  j.comps.find(c => c.id === '1A').props.load = 400; js.run(2);
  chk('5/3 valve: trapped air gives under a 400 N load (' + ((jx - js.st['1A'].x) * 1000).toFixed(0) + ' mm) and still holds', jx - js.st['1A'].x > 0.01 && js.check(['mid', '1A']));
  js.pressLabel('S1', true); js.pressLabel('S2', true); js.run(0.5);
  chk('5/3 valve: both solenoids energised, spool stays centred', js.st['1V'].pos === 0 && js.solOn('Y1') && js.solOn('Y2'));
  // air drawn from the supply per double stroke = swept volume x absolute pressure
  const as = new EP.Sim(EP.solutions.direct()); as.power(true); as.run(1);
  const ag = EP.geo(as.cyl('1A')), a0 = as.airKg;
  as.pressLabel('S1', true); as.run(2); as.pressLabel('S1', false); as.run(2);
  const used = (as.airKg - a0) / 1.185 * 1000, want = (ag.AA + ag.AB) * ag.L * (6e5 + 101325) / 101325 * 1000;
  chk('air per double stroke ' + used.toFixed(2) + ' l, textbook V x p_abs gives ' + want.toFixed(2) + ' l', Math.abs(used / want - 1) < 0.12);
  for (const k of Object.keys(EP.defs)) EP.symbolSVG(k);
  chk('every part draws a symbol', true);
}
// sensors: each kind sees exactly the materials its row of the table says, needs its supply, and can short out through its output
{
  const N = (t, id, label) => EP.newComp(t, id, 0, 0, {label}), W = (a, b) => ({id: a + b, k: 'e', a: {c: a.split('.')[0], p: a.split('.')[1]}, b: {c: b.split('.')[0], p: b.split('.')[1]}});
  let table = true;
  for (const [type, kind] of [['s_ind', 'ind'], ['s_cap', 'cap'], ['s_opt', 'opt']]) for (const m of EP.MATS) {
    const s = new EP.Sim({comps: [N('psu', 'PSU', ''), N(type, 'B1', 'B1'), N('sol', 'Y1', 'Y1')], wires: [W('PSU.pos', 'B1.BN'), W('B1.BU', 'PSU.neg'), W('B1.BK', 'Y1.a'), W('Y1.b', 'PSU.neg')]});
    s.power(true); s.run(0.1); if (s.solOn('Y1')) table = false;
    s.mat = m[0]; s.present = true; s.run(0.1); if (s.solOn('Y1') !== EP.SEES[kind].includes(m[0])) table = false;
    s.present = false; s.run(0.1); if (s.solOn('Y1')) table = false;
  }
  chk('sensors: inductive, capacitive and optical each see what the table says', table);
  const bench = new EP.Sim(EP.solutions.senses()); bench.power(true); bench.run(0.1);
  const lit = m => { bench.mat = m; bench.present = true; bench.run(0.15); const r = ['H1', 'H2', 'H3', 'H4'].map(l => bench.check(['lamp', l, true]) ? 1 : 0).join(''); bench.present = false; bench.run(0.1); return r; };
  chk('sensors: test bench lights 0111 / 0011 / 0010 / 1111', lit('steel') === '0111' && lit('plastic') === '0011' && lit('glass') === '0010' && lit('magnet') === '1111');
  const ns = new EP.Sim({comps: [N('psu', 'PSU', ''), N('s_ind', 'B1', 'B1'), N('sol', 'Y1', 'Y1')], wires: [W('PSU.pos', 'B1.BN'), W('B1.BK', 'Y1.a'), W('Y1.b', 'PSU.neg')]});
  ns.power(true); ns.present = true; ns.run(0.2);
  chk('sensors: no 0 V on the blue wire, no signal', !ns.sensOn('B1') && !ns.solOn('Y1'));
  const sh = new EP.Sim({comps: [N('psu', 'PSU', ''), N('s_cap', 'B1', 'B1')], wires: [W('PSU.pos', 'B1.BN'), W('B1.BU', 'PSU.neg'), W('B1.BK', 'PSU.neg')]});
  sh.power(true); sh.run(0.1); const calm = !sh.st.PSU.tripped && Math.abs(sh.st.PSU.I - 0.01) < 0.001; sh.present = true; sh.run(0.1);
  chk('sensors: 10 mA at rest; output wired straight to 0 V trips the fuse when it switches', calm && sh.st.PSU.tripped);
  const px = new EP.Sim(EP.solutions.prox()); px.power(true); px.run(0.5); px.pressLabel('B1', true); px.run(1.5);
  const out = px.check(['ext', '1A']); px.pressLabel('B1', false); px.run(2);
  chk('prox: steel in front of B1 extends 1A, and it returns when the part goes', out && px.check(['ret', '1A']));
  const rc = new EP.Sim(EP.solutions.reedcyl()); rc.power(true); rc.run(0.5); rc.pressLabel('S1', true); rc.run(0.15); rc.pressLabel('S1', false); rc.run(4);
  chk('reed switches on the barrel: one tap, out and back', rc.check(['ret', '1A']) && rc.check(['cycles', '1A', 1]));
  const L = EP.lessons.find(l => l.id === 'sorter');
  chk('sorter: a blind inductive sensor fails the tests', !EP.evalLesson(L.solution(), L, {blind: {B1: true}}).pass);
}
// exam practice: every generated question is well formed, and every circuit it draws behaves as its answer says
{
  const P = EP.practice; let ok = true, sims = 0;
  for (let i = 0; i < 150; i++) for (const g of P.gens) {
    const q = g();
    if (!q.q || !q.why || q.o.length < 2 || new Set(q.o).size !== q.o.length || q.a !== 0 || !P.topics.some(t => t.id === q.topic)) ok = false;
    if (q.tree) {
      const labs = ['S1', 'S2', 'S3'].filter(l => q.circ.comps.some(c => c.label === l));
      for (let m = 0; m < (1 << labs.length); m++) { const on = {}; labs.forEach((l, k) => { on[l] = !!((m >> k) & 1); }); sims++; if (P.simY1(q.circ, on) !== P.evalT(q.tree, on)) ok = false; }
      if (q.on && q.o[0].startsWith('Yes') !== P.evalT(q.tree, q.on)) ok = false;
    }
  }
  chk('practice: 1500 generated questions well formed, ' + sims + ' circuit readings agree with the simulator', ok);
  const w = P.allWritten();
  chk('practice: ' + w.length + ' written questions, each with an answer, a topic and a reason', w.every(q => q.o[q.a] && q.why && P.topics.some(t => t.id === q.topic)) && new Set(w.map(q => q.id)).size === w.length);
  const set = P.make(['calc'], 10, {});
  chk('practice: a round on one topic stays on that topic', set.length === 10 && set.every(q => q.topic === 'calc'));
  const L = EP.lessons.find(l => l.id === 'proj1'), c = L.solution(); c.comps.find(x => x.id === 'B1').type = 's_ind';
  chk('proj1: an inductive sensor cannot see the plastic housings, so it fails', !EP.evalLesson(c, L).pass);
}
// physics sanity
const sim = new EP.Sim(EP.solutions.direct()); sim.power(true); sim.run(0.6);
const c = sim.cyl('1A'), st = sim.st[c.id];
console.log('rest: x=%s pA=%s pB=%s bar', st.x.toFixed(3), ((st.pA-101325)/1e5).toFixed(2), ((st.pB-101325)/1e5).toFixed(2));
sim.pressLabel('S1', true); let t = 0; while (st.x < 0.194 && t < 5) { sim.run(0.01); t += 0.01; }
console.log('extend time %ss, I=%sA', t.toFixed(2), sim.st.PSU.I.toFixed(3)); sim.run(0.5);
console.log('ext: pA=%s pB=%s bar F=%sN', ((st.pA-101325)/1e5).toFixed(2), ((st.pB-101325)/1e5).toFixed(2), st.F.toFixed(0));
sim.pressLabel('S1', false); t = 0; while (st.x > 0.006 && t < 5) { sim.run(0.01); t += 0.01; }
console.log('retract time %ss', t.toFixed(2));
const s2 = new EP.Sim(EP.solutions.limit()); s2.power(true); s2.run(0.6); s2.pressLabel('S1', true); s2.run(0.1); s2.pressLabel('S1', false);
const st2 = s2.st['1A']; t = 0; while (st2.x < 0.194 && t < 9) { s2.run(0.01); t += 0.01; } console.log('throttled 60%% extend %ss', t.toFixed(2));
// short circuit
const sc = EP.solutions.direct(); sc.wires.push({id: 'x', k: 'e', a: {c: 'PSU', p: 'pos'}, b: {c: 'PSU', p: 'neg'}});
const s3 = new EP.Sim(sc); s3.power(true); s3.run(0.01); console.log('short trips fuse:', s3.st.PSU.tripped);
// two coils in series share the voltage
const B = {comps: [EP.newComp('psu','PSU',0,0), EP.newComp('sol','Y1',0,0), EP.newComp('sol','Y2',0,0)], wires: [
 {id:'a',k:'e',a:{c:'PSU',p:'pos'},b:{c:'Y1',p:'a'}},{id:'b',k:'e',a:{c:'Y1',p:'b'},b:{c:'Y2',p:'a'}},{id:'c',k:'e',a:{c:'Y2',p:'b'},b:{c:'PSU',p:'neg'}}]};
const s4 = new EP.Sim(B); s4.power(true); s4.run(0.05); console.log('series coils: V=%s on=%s', s4.st.Y1.v.toFixed(2), s4.st.Y1.on);
console.log('diagnose(start of press):', EP.diagnose(EP.lessons.find(l => l.id === 'press1').start(EP.solutions.pressDirect())).length, 'notes');
process.exit(bad ? 1 : 0);

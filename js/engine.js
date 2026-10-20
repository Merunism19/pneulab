/* Simulation engine.
   Electrical side: every terminal is a node; wires and closed contacts are small resistances,
   coils and lamps are real resistances. Node voltages come from nodal analysis, so series loads
   share voltage, parallel branches add current, and a path without a load trips the fuse.
   Pneumatic side: every connected group of ports is a volume of air (ideal gas, isothermal).
   Valves and throttles are orifices following the ISO 6358 flow model (choked / subsonic).
   Pistons obey F = m·a with pressure forces on both faces, friction and end stops. */
(function (G) {
'use strict';
const EP = G.EP = G.EP || {};
const D = EP.defs;

const P_ATM = 101325, RT = 287.05 * 293.15, RHO0 = 1.185, BCR = 0.3;
const R_WIRE = 0.05, G_MIN = 1e-6, I_TRIP = 6, PULL_IN = 18, DROP_OUT = 6;
const C_VALVE = 3e-9, C_CHECK = 4e-9, V_DEAD = 5e-6, DT = 1e-3, SUB = 4;
EP.K = {P_ATM, RT, PULL_IN, DROP_OUT, I_TRIP};

const isCyl = t => t === 'cyl_da' || t === 'cyl_sa';
const isValve = t => t === 'v52s' || t === 'v52d' || t === 'v32s' || t === 'v53';
const isCoil = t => t === 'relay' || t === 'timer' || t === 'timer_off' || t === 'timer_pulse' || t === 'timer_flash';   // coils whose contacts carry their label
const isPush = t => D[t].act === 'push';
const isLs = t => t === 'ls_no' || t === 'ls_nc' || t === 'reed_no';        // two-wire position contacts: roller or reed
const isSens = t => !!D[t].sensor;                                           // three-wire proximity sensors
const isDet = t => isLs(t) || isSens(t);                                     // everything that can sit on a cylinder and report a position
const R_SENS_ON = 2;                                                         // the output transistor is not a perfect switch
EP.is = {isCyl, isValve, isPush, isLs, isCoil, isSens, isDet};

/* mass flow (kg/s) through an orifice of sonic conductance C from pu down to pd */
function mdot(pu, pd, C) {
  const r = pd / pu;
  if (r >= 1) return 0;
  const f = r <= BCR ? 1 : Math.sqrt(1 - ((r - BCR) / (1 - BCR)) ** 2);
  return C * RHO0 * pu * f;
}

function gauss(A, b, n) {
  for (let i = 0; i < n; i++) {
    let p = i, m = Math.abs(A[i * n + i]);
    for (let r = i + 1; r < n; r++) { const v = Math.abs(A[r * n + i]); if (v > m) { m = v; p = r; } }
    if (m < 1e-14) continue;
    if (p !== i) {
      for (let j = i; j < n; j++) { const t = A[i * n + j]; A[i * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[i]; b[i] = b[p]; b[p] = t;
    }
    const d = A[i * n + i];
    for (let r = i + 1; r < n; r++) {
      const f = A[r * n + i] / d;
      if (f === 0) continue;
      for (let j = i; j < n; j++) A[r * n + j] -= f * A[i * n + j];
      b[r] -= f * b[i];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
    const d = A[i * n + i];
    x[i] = Math.abs(d) < 1e-14 ? 0 : s / d;
  }
  return x;
}

function geo(c) {
  const p = c.props, AA = Math.PI * p.bore * p.bore / 4, AB = AA - Math.PI * p.rod * p.rod / 4;
  return {L: p.stroke, AA, AB, sa: c.type === 'cyl_sa'};
}
EP.geo = geo;

class Sim {
  /* faults: {open: {wireId}, dead: {compId}, stuck: {compId}, blocked: {tubeId}, blind: {sensorId}} plus limit-switch labels that never actuate */
  constructor(circ, faults) {
    this.c = circ; this.t = 0; this.on = false; this.acc = 0; this.events = []; this.faults = faults || {};
    this.st = {}; this.byId = new Map(); this.sig = null;
    for (const c of circ.comps) {
      this.byId.set(c.id, c);
      const t = c.type;
      this.st[c.id] = isCyl(t) ? {x: 0, v: 0, pA: P_ATM, pB: P_ATM, F: 0, cycles: 0, atExt: false, atRet: true, mA: 0, mB: 0}
        : isValve(t) ? {pos: 0, tm: 0, mL: false, mR: false, ex3: 0, ex5: 0, a3: 0, a5: 0, leak: 0, aLeak: 0, pilot: false}
        : t === 'psu' ? {tripped: false, I: 0}
        : t === 'gauge' || t === 'psw' ? {p: P_ATM, on: false}
        : t === 'counter' ? {count: 0, hi: false, on: false, v: 0}
        : t === 'fcv' ? {leak: 0, aLeak: 0}
        : {pressed: false, act: false, mounted: false, on: false, tm: 0, v: 0};
    }
    const of = f => circ.comps.filter(c => f(c.type));
    this.cyls = of(isCyl); this.valves = of(isValve); this.lss = of(isDet);
    this.mat = 'steel'; this.present = false;       // the workpiece at the sensing station: what it is made of, and whether it is there
    this.sols = of(t => t === 'sol'); this.relays = of(isCoil);
    this.counters = of(t => t === 'counter'); this.psws = of(t => t === 'psw'); this.log = [];
    this.fcvs = of(t => t === 'fcv'); this.gauges = of(t => t === 'gauge');
    this.geo = {}; for (const c of this.cyls) this.geo[c.id] = geo(c);
    this.buildElec(); this.buildPneu(); this.updLimits();
  }

  power(on) {
    this.on = on; this.sig = null;
    for (const n of this.nets) if (n.src) n.fixed = on ? P_ATM + n.src.props.bar * 1e5 : P_ATM;
  }
  resetFuse() { if (this.psu) { this.st[this.psu.id].tripped = false; this.sig = null; } }

  /* ----- lookups by label: "same label = same device" ----- */
  relayOn(label) {
    for (const r of this.relays) if (r.label === label && this.st[r.id].on) return true;
    for (const r of this.counters) if (r.label === label && this.st[r.id].on) return true;
    return false;
  }
  sensOn(label) { for (const q of this.eS) if (q.c.label === label && this.st[q.c.id].on) return true; return false; }
  pswOn(label) { for (const r of this.psws) if (r.label === label && this.st[r.id].on) return true; return false; }
  solOn(label) { if (!label) return false; for (const s of this.sols) if (s.label === label && this.st[s.id].on) return true; return false; }
  closed(c) {
    if (this.faults.stuck && this.faults.stuck[c.id]) return false;      // worn contact: operated, but never makes
    const d = D[c.type], s = this.st[c.id];
    const act = d.act === 'push' ? s.pressed : d.act === 'roller' ? s.act : d.act === 'pressure' ? this.pswOn(c.label) : this.relayOn(c.label);
    return d.contact === 'no' ? act : !act;
  }
  updLimits() {
    for (const l of this.lss) {
      const s = this.st[l.id]; let mounted = false, hit = false;
      for (const c of this.cyls) {
        const x = this.st[c.id].x, L = c.props.stroke;
        if (c.props.markExt === l.label) { mounted = true; if (x >= L * 0.97) hit = true; }
        if (c.props.markRet === l.label) { mounted = true; if (x <= L * 0.03) hit = true; }
      }
      s.mounted = mounted;
      // off the cylinder: a roller is pressed by hand; a sensor reacts to the workpiece, if it is one of the things it can see
      const kind = D[l.type].sensor || (D[l.type].reed ? 'reed' : null);
      const near = !kind ? s.pressed : kind === 'reed' ? s.pressed || (this.present && this.mat === 'magnet') : (s.pressed || this.present) && EP.SEES[kind].includes(this.mat);
      s.act = mounted ? (hit && !this.faults[l.label]) : near;
    }
  }

  /* ----- electrical network ----- */
  buildElec() {
    const idx = new Map(), id = k => { if (!idx.has(k)) idx.set(k, idx.size); return idx.get(k); };
    this.eC = []; this.eL = []; this.eS = []; this.psu = null;
    for (const c of this.c.comps) {
      const d = D[c.type];
      if (d.cat !== 'e') continue;
      for (const p of d.ports) id(c.id + '.' + p.n);
      const a = id(c.id + '.' + d.ports[0].n), b = id(c.id + '.' + d.ports[1].n);
      if (c.type === 'psu') { if (!this.psu) { this.psu = c; this.iPos = a; this.iNeg = b; } }
      else if (d.contact) this.eC.push({c, a, b});
      else if (d.sensor) this.eS.push({c, p: id(c.id + '.BN'), n: id(c.id + '.BU'), o: id(c.id + '.BK'), g: 1 / d.R});
      else if (d.load) this.eL.push({c, a, b, g: 1 / d.R});
    }
    this.eW = [];
    for (const w of this.c.wires) {
      if (w.k !== 'e') continue;
      const a = idx.get(w.a.c + '.' + w.a.p), b = idx.get(w.b.c + '.' + w.b.p);
      if (a != null && b != null) this.eW.push({w, a, b, i: 0});
    }
    this.eIdx = idx; this.nE = idx.size; this.V = new Float64Array(this.nE);
    this.wI = new Map();
  }
  solveElec() {
    const n = this.nE, pst = this.psu && this.st[this.psu.id];
    let V = this.V = new Float64Array(n);
    for (const w of this.eW) w.i = 0;
    if (pst) pst.I = 0;
    if (pst && this.on && !pst.tripped) {
      const A = new Float64Array(n * n), b = new Float64Array(n), edges = [];
      for (let i = 0; i < n; i++) A[i * n + i] = G_MIN;
      const add = (a, c, g) => {
        if (a === c) return;
        A[a * n + a] += g; A[c * n + c] += g; A[a * n + c] -= g; A[c * n + a] -= g; edges.push(a, c, g);
      };
      const F = this.faults;
      for (const w of this.eW) if (!(F.open && F.open[w.w.id])) add(w.a, w.b, 1 / R_WIRE);          // a broken conductor carries nothing
      for (const k of this.eC) if (this.closed(k.c)) add(k.a, k.b, 1 / R_WIRE);
      for (const l of this.eL) if (!(F.dead && F.dead[l.c.id])) add(l.a, l.b, l.g);                 // a burnt-out coil is an open circuit
      for (const q of this.eS) {                    // a sensor always draws a little current for its electronics; switched on, it joins black to brown
        add(q.p, q.n, q.g);
        if (this.st[q.c.id].on) add(q.p, q.o, 1 / R_SENS_ON);
      }
      const fix = (i, v) => { for (let j = 0; j < n; j++) A[i * n + j] = 0; A[i * n + i] = 1; b[i] = v; };
      fix(this.iPos, 24); fix(this.iNeg, 0);
      V = this.V = gauss(A, b, n);
      let I = 0;
      for (let e = 0; e < edges.length; e += 3) {
        if (edges[e] === this.iPos) I += (24 - V[edges[e + 1]]) * edges[e + 2];
        else if (edges[e + 1] === this.iPos) I += (24 - V[edges[e]]) * edges[e + 2];
      }
      if (I > I_TRIP) { pst.tripped = true; this.events.push({type: 'trip'}); V.fill(0); }
      else { pst.I = I; for (const w of this.eW) w.i = (V[w.a] - V[w.b]) / R_WIRE; }
    }
    for (const w of this.eW) this.wI.set(w.w.id, w.i);
    for (const l of this.eL) this.st[l.c.id].v = Math.abs(V[l.a] - V[l.b]);
    for (const q of this.eS) this.st[q.c.id].v = V[q.p] - V[q.n];
  }
  nodeV(cid, port) { const i = this.eIdx.get(cid + '.' + port); return i == null ? 0 : this.V[i]; }

  /* ----- pneumatic network ----- */
  buildPneu() {
    const P = new Map();
    const find = k => { let r = k; while (P.get(r) !== r) r = P.get(r); while (P.get(k) !== r) { const n = P.get(k); P.set(k, r); k = n; } return r; };
    for (const c of this.c.comps) if (D[c.type].cat === 'p') for (const p of D[c.type].ports) P.set(c.id + '.' + p.n, c.id + '.' + p.n);
    const blk = this.faults.blocked || {}, sealed = new Set();          // a kinked tube joins nothing, and leaks nothing
    for (const w of this.c.wires) if (w.k === 'p' && blk[w.id]) { sealed.add(w.a.c + '.' + w.a.p); sealed.add(w.b.c + '.' + w.b.p); }
    const tubes = this.c.wires.filter(w => w.k === 'p' && !blk[w.id] && P.has(w.a.c + '.' + w.a.p) && P.has(w.b.c + '.' + w.b.p));
    for (const t of tubes) P.set(find(t.a.c + '.' + t.a.p), find(t.b.c + '.' + t.b.p));
    const map = new Map();
    for (const k of P.keys()) {
      const r = find(k);
      if (!map.has(r)) map.set(r, {ports: [], tubes: [], fixed: null, open: false, src: null, ch: [], m: 0, p: P_ATM, V: 1e-6});
      map.get(r).ports.push(k);
    }
    for (const t of tubes) map.get(find(t.a.c + '.' + t.a.p)).tubes.push(t);
    this.nets = [...map.values()];
    this.netOf = new Map();
    for (const n of this.nets) {
      for (const k of n.ports) {
        this.netOf.set(k, n);
        const c = this.byId.get(k.slice(0, k.lastIndexOf('.')));
        if (c.type === 'air') n.src = c;
      }
      const owner = this.byId.get(n.ports[0].slice(0, n.ports[0].lastIndexOf('.')));
      // a port with nothing plugged in is simply open to the room
      if (!n.src && n.ports.length === 1 && owner.type !== 'gauge' && owner.type !== 'psw' && !sealed.has(n.ports[0])) { n.fixed = P_ATM; n.open = true; }
      if (n.src) n.fixed = P_ATM;
      n.vol0 = 2e-6 + 3e-6 * n.tubes.length;
    }
    for (const c of this.cyls) {
      this.netOf.get(c.id + '.a').ch.push({c, side: 'a'});
      if (c.type === 'cyl_da') this.netOf.get(c.id + '.b').ch.push({c, side: 'b'});
    }
    for (const n of this.nets) { n.V = this.vol(n); n.m = P_ATM * n.V / RT; }
    this.inj = new Map(); this.accT = 0; this.tubeQ = new Map();
    this.airKg = 0; this.airPrev = 0; this.airRate = 0;      // air drawn from the supply: total (kg) and current rate (kg/s)
  }
  chVol(ch) {
    const g = this.geo[ch.c.id], x = this.st[ch.c.id].x;
    return ch.side === 'a' ? g.AA * x + V_DEAD : g.AB * (g.L - x) + V_DEAD;
  }
  vol(n) { let v = n.vol0; for (const ch of n.ch) v += this.chVol(ch); return v; }
  portP(cid, port) { const n = this.netOf.get(cid + '.' + port); return n ? n.p : P_ATM; }

  /* move air between two volumes (b = null means the atmosphere); returns kg moved a→b */
  xfer(a, b, Cab, Cba, dt) {
    const pa = a.p, pb = b ? b.p : P_ATM;
    if (pa === pb) return 0;
    let dm = pa > pb ? mdot(pa, pb, Cab) * dt : -mdot(pb, pa, Cba) * dt;
    const fa = a.fixed == null, fb = !!b && b.fixed == null;
    let lim = Infinity;                       // never overshoot pressure equalisation in one step
    if (fa && fb) lim = Math.abs(pa - pb) / (RT * (1 / a.V + 1 / b.V));
    else if (fa) lim = Math.abs(pa - pb) * a.V / RT;
    else if (fb) lim = Math.abs(pa - pb) * b.V / RT;
    lim *= 0.5;
    if (Math.abs(dm) > lim) dm = Math.sign(dm) * lim;
    if (fa) a.m -= dm;
    if (fb) b.m += dm;
    if (a.src) this.airKg += dm; else if (b && b.src) this.airKg -= dm;
    return dm;
  }
  ij(key, dm) { this.inj.set(key, (this.inj.get(key) || 0) + dm); }

  pstep(dt) {
    for (const n of this.nets) {
      if (n.fixed != null) n.p = n.fixed; else { n.V = this.vol(n); n.p = n.m * RT / n.V; }
    }
    for (const v of this.valves) {
      const s = this.st[v.id], N = p => this.netOf.get(v.id + '.' + p), id = v.id;
      const path = (pa, pb) => {
        const nb = N(pb), d = this.xfer(N(pa), nb, C_VALVE, C_VALVE, dt);
        this.ij(id + '.' + pa, -d); this.ij(id + '.' + pb, d);
        if (nb.open && d > 0) s.aLeak += d;
      };
      const vent = (p, k) => { const d = this.xfer(N(p), null, C_VALVE, C_VALVE, dt); this.ij(id + '.' + p, -d); s[k] += d; };
      if (v.type === 'v32s') { if (s.pos) path('1', '2'); else vent('2', 'a3'); }
      else if (v.type === 'v53') {                 // centre position: every port shut, the air on both sides is trapped
        if (s.pos === 1) { path('1', '4'); vent('2', 'a3'); } else if (s.pos === 2) { path('1', '2'); vent('4', 'a5'); }
      }
      else if (s.pos) { path('1', '4'); vent('2', 'a3'); }
      else { path('1', '2'); vent('4', 'a5'); }
    }
    for (const f of this.fcvs) {
      const ni = this.netOf.get(f.id + '.in'), no = this.netOf.get(f.id + '.out');
      const Ct = C_VALVE * Math.max(0, Math.min(100, f.props.open)) / 100;
      const d = this.xfer(ni, no, Ct + C_CHECK, Ct, dt);   // free flow in→out, throttled out→in
      this.ij(f.id + '.in', -d); this.ij(f.id + '.out', d);
      if ((no.open && d > 0) || (ni.open && d < 0)) this.st[f.id].aLeak += Math.abs(d);
    }
    for (const n of this.nets) if (n.fixed == null) n.p = n.m * RT / n.V;

    for (const c of this.cyls) {
      const s = this.st[c.id], g = this.geo[c.id], p = c.props;
      const pA = this.netOf.get(c.id + '.a').p, pB = g.sa ? P_ATM : this.netOf.get(c.id + '.b').p;
      let F = pA * g.AA - pB * g.AB - P_ATM * (g.AA - g.AB) - (p.load || 0);
      if (g.sa) F -= 45 + 250 * s.x;            // return spring: preload plus stiffness
      const m = 2, Fc = 15, Fs = 22, cv = 120;
      let a;
      if (s.v === 0) a = Math.abs(F) <= Fs ? 0 : (F - Math.sign(F) * Fc) / m;
      else a = (F - Math.sign(s.v) * Fc - cv * s.v) / m;
      let v = s.v + a * dt;
      if (s.v !== 0 && v * s.v < 0 && Math.abs(F) <= Fs) v = 0;
      let x = s.x + v * dt;
      if (x <= 0) { x = 0; if (v < 0) { if (v < -0.08) this.events.push({type: 'thunk', id: c.id}); v = 0; } }
      if (x >= g.L) { x = g.L; if (v > 0) { if (v > 0.08) this.events.push({type: 'thunk', id: c.id}); v = 0; } }
      s.x = x; s.v = v; s.pA = pA; s.pB = pB; s.F = F;
      const ext = x >= g.L * 0.97, ret = x <= g.L * 0.03;
      if (ext && !s.atExt) { s.cycles++; if (this.log.length < 500) this.log.push(c.label + '+'); }
      if (ret && !s.atRet && this.log.length < 500) this.log.push(c.label + '-');
      s.atExt = ext; s.atRet = ret;
    }
  }

  tick() {
    const dt = DT;
    this.updLimits();
    let sig = this.on ? '1' : '0';
    if (this.psu && this.st[this.psu.id].tripped) sig += 'T';
    for (const k of this.eC) sig += this.closed(k.c) ? '1' : '0';
    for (const q of this.eS) sig += this.st[q.c.id].on ? 's' : '-';
    if (sig !== this.sig) { this.sig = sig; this.solveElec(); }

    for (const q of this.eS) {                     // a sensor only works while it has its supply, and it switches within milliseconds
      const s = this.st[q.c.id], want = s.act && s.v >= 10 && !(this.faults.blind && this.faults.blind[q.c.id]);     // a failed sensor is powered, has its target, and stays off
      if (want !== s.on) { s.tm += dt; if (s.tm >= 0.002) { s.on = want; s.tm = 0; } } else s.tm = 0;
    }

    for (const l of this.eL) {
      const s = this.st[l.c.id], t = l.c.type, v = this.faults.dead && this.faults.dead[l.c.id] ? 0 : s.v;
      if (t === 'timer_pulse' || t === 'timer_flash') {     // timed from the moment the coil is energised: one pulse, or on and off by turns
        const hi = s.hi ? v > DROP_OUT : v >= PULL_IN;
        if (hi !== !!s.hi) { s.hi = hi; s.tt = 0; } else if (hi) s.tt += dt;
        const T = Math.max(0.05, l.c.props.delay), want = !hi ? false : t === 'timer_pulse' ? s.tt < T : Math.floor(s.tt / T) % 2 === 0;
        if (want !== s.on) { s.on = want; this.events.push({type: 'relay', id: l.c.id, on: want}); }
        s.tm = hi ? s.tt : 0;
      } else if (isCoil(t)) {                           // an armature needs time to pull in; a timer relay waits its whole delay
        const want = s.on ? v > DROP_OUT : v >= PULL_IN;
        if (want !== s.on) {
          s.tm += dt;
          const need = s.on ? (t === 'timer_off' ? Math.max(0.008, l.c.props.delay) : 0.008) : (t === 'timer' ? Math.max(0.012, l.c.props.delay) : 0.012);
          if (s.tm >= need) { s.on = want; s.tm = 0; this.events.push({type: 'relay', id: l.c.id, on: want}); }
        } else s.tm = 0;
      } else if (t === 'counter') {              // counts rising edges of its input
        const hi = s.hi ? v > DROP_OUT : v >= PULL_IN;
        if (hi && !s.hi) { s.count++; this.events.push({type: 'count', id: l.c.id}); }
        s.hi = hi;
      } else if (t === 'sol' || t === 'counter_r') s.on = s.on ? v > DROP_OUT : v >= PULL_IN;
    }
    for (const c of this.counters) {
      const s = this.st[c.id];
      for (const l of this.eL) if (l.c.type === 'counter_r' && l.c.label === c.label && this.st[l.c.id].on) s.count = 0;
      s.on = s.count >= c.props.preset;
    }

    for (const v of this.valves) {
      const s = this.st[v.id];
      s.pilot = this.portP(v.id, '1') >= P_ATM + 1.5e5;   // pilot-assisted: no air, no shift
      const a = this.solOn(v.props.y1) || s.mL;
      let want = s.pos;
      if (v.type === 'v52d') {
        const b = this.solOn(v.props.y2) || s.mR;
        if (s.pilot) { if (a && !b) want = 1; else if (b && !a) want = 0; }
      } else if (v.type === 'v53') {              // spring-centred: one signal shifts it, none or both leave it in the middle
        const b = this.solOn(v.props.y2) || s.mR;
        want = !s.pilot ? 0 : a && !b ? 1 : b && !a ? 2 : 0;
      } else want = a && s.pilot ? 1 : 0;
      if (want !== s.pos) { s.tm += dt; if (s.tm >= 0.02) { s.pos = want; s.tm = 0; this.events.push({type: 'valve', id: v.id}); } }
      else s.tm = 0;
    }

    for (let i = 0; i < SUB; i++) this.pstep(dt / SUB);
    for (const g of this.gauges) this.st[g.id].p = this.portP(g.id, 'p');
    for (const b of this.psws) {
      const s = this.st[b.id], set = P_ATM + b.props.set * 1e5;
      s.p = this.portP(b.id, 'p'); s.on = s.on ? s.p > set - 4e4 : s.p >= set;
    }
    this.t += dt; this.accT += dt;
  }
  advance(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n++ < 120) { this.tick(); this.acc -= DT; }
    if (n > 120) this.acc = 0;
  }
  run(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) this.tick(); }

  /* per-frame picture of where air is moving: exhaust rates, leaks, and flow in every tube */
  snapshot() {
    const T = this.accT || 1e-3;
    for (const v of this.valves) { const s = this.st[v.id]; s.ex3 = s.a3 / T; s.ex5 = s.a5 / T; s.leak = s.aLeak / T; s.a3 = s.a5 = s.aLeak = 0; }
    for (const f of this.fcvs) { const s = this.st[f.id]; s.leak = s.aLeak / T; s.aLeak = 0; }
    for (const c of this.cyls) {
      const s = this.st[c.id], g = this.geo[c.id];
      const mA = s.pA * (g.AA * s.x + V_DEAD) / RT, mB = s.pB * (g.AB * (g.L - s.x) + V_DEAD) / RT;
      this.ij(c.id + '.a', -(mA - s.mA)); if (!g.sa) this.ij(c.id + '.b', -(mB - s.mB));
      s.mA = mA; s.mB = mB;
    }
    this.tubeQ.clear();
    for (const n of this.nets) {
      if (!n.tubes.length) continue;
      const inj = new Map(); let sum = 0, slack = null;
      for (const k of n.ports) {
        const v = this.inj.get(k) || 0; inj.set(k, v); sum += v;
        if (n.src && k === n.src.id + '.out') slack = k;
      }
      if (slack) inj.set(slack, -sum);
      for (const t of n.tubes) {            // air crossing this tube = everything injected on its a-side
        const seen = new Set([t.a.c + '.' + t.a.p]), q = [t.a.c + '.' + t.a.p];
        while (q.length) {
          const k = q.pop();
          for (const u of n.tubes) {
            if (u === t) continue;
            const ua = u.a.c + '.' + u.a.p, ub = u.b.c + '.' + u.b.p;
            if (ua === k && !seen.has(ub)) { seen.add(ub); q.push(ub); }
            else if (ub === k && !seen.has(ua)) { seen.add(ua); q.push(ua); }
          }
        }
        let s = 0; for (const k of seen) s += inj.get(k) || 0;
        this.tubeQ.set(t.id, s / T);
      }
    }
    this.inj.clear(); this.accT = 0;
    this.airRate = (this.airKg - this.airPrev) / T; this.airPrev = this.airKg;
  }

  /* ----- helpers for the test bench ----- */
  pressLabel(label, down) {
    for (const c of this.c.comps) if ((isPush(c.type) || isDet(c.type)) && c.label === label) this.st[c.id].pressed = down;
  }
  cyl(label) { return this.cyls.find(c => c.label === label); }
  check(e) {
    const [k, l, val] = e, want = val === undefined ? true : val;
    if (k === 'sol') return this.solOn(l) === want;
    if (k === 'relay') return this.relayOn(l) === want;
    if (k === 'sens') return this.sensOn(l) === want;
    if (k === 'order') return this.log.join(' ') === l.join(' ');
    if (k === 'count') return this.counters.some(c => c.label === l && this.st[c.id].count === val);
    if (k === 'lamp') return this.c.comps.some(c => c.type === 'lamp' && c.label === l && this.st[c.id].v >= 12) === want;
    const c = this.cyl(l); if (!c) return false;
    const s = this.st[c.id], L = c.props.stroke;
    if (k === 'ext') return s.x >= L * 0.97;
    if (k === 'ret') return s.x <= L * 0.03;
    if (k === 'cycles') return s.cycles === val;
    if (k === 'cyclesMin') return s.cycles >= val;
    if (k === 'still') return s.x <= L * 0.03 && s.cycles === this._prevCycles;
    if (k === 'mid') return s.x > L * 0.03 && s.x < L * 0.97 && Math.abs(s.v) < 0.005;          // at rest between the end positions
    if (k === 'stay') return Math.abs(s.x - ((this._px && this._px[c.id]) || 0)) < L * 0.03;      // has not moved during this test step
    return false;
  }
}
EP.Sim = Sim;

/* ----- circuit queries (which terminals are joined by wires) ----- */
EP.query = function (circ) {
  const P = new Map();
  const find = k => { if (!P.has(k)) P.set(k, k); let r = k; while (P.get(r) !== r) r = P.get(r); P.set(k, r); return r; };
  for (const w of circ.wires) P.set(find(w.a.c + '.' + w.a.p), find(w.b.c + '.' + w.b.p));
  const byId = new Map(circ.comps.map(c => [c.id, c]));
  const q = {
    linked: (a, b) => find(a) === find(b),
    count: t => circ.comps.filter(c => c.type === t).length,
    /* types of every component that shares a wire-net with this terminal */
    netTypes(ref) {
      const r = find(ref), out = new Set();
      for (const k of P.keys()) if (find(k) === r && k !== ref) { const c = byId.get(k.slice(0, k.lastIndexOf('.'))); if (c) out.add(c.type); }
      return out;
    },
    wired: ref => circ.wires.some(w => w.a.c + '.' + w.a.p === ref || w.b.c + '.' + w.b.p === ref),
    byId
  };
  return q;
};

/* ----- static check: things a technician would spot before switching on ----- */
EP.diagnose = function (circ) {
  const out = [], q = EP.query(circ), cs = circ.comps;
  const has = t => cs.some(c => c.type === t);
  const anyE = cs.some(c => D[c.type].cat === 'e' && c.type !== 'psu'), anyP = cs.some(c => D[c.type].cat === 'p' && c.type !== 'air');
  if (anyE && !has('psu')) out.push('There is no 24 V power supply, so nothing electrical can work.');
  if (anyP && !has('air')) out.push('There is no compressed air supply. Without air, valves and cylinders cannot move.');
  const relays = cs.filter(c => isCoil(c.type) || c.type === 'counter').map(c => c.label);
  const psws = cs.filter(c => c.type === 'psw').map(c => c.label), ctrs = cs.filter(c => c.type === 'counter').map(c => c.label);
  const sols = cs.filter(c => c.type === 'sol').map(c => c.label);
  const vy = []; for (const c of cs) if (isValve(c.type)) { vy.push(c.props.y1); if (c.type === 'v52d' || c.type === 'v53') vy.push(c.props.y2); }
  const marks = []; for (const c of cs) if (isCyl(c.type)) marks.push(c.props.markRet, c.props.markExt);
  for (const c of cs) {
    const d = D[c.type];
    if (d.link === 'relay' && !relays.includes(c.label)) out.push(`Contact ${c.label} has no relay, timer or counter called ${c.label}, so it will never switch.`);
    if (d.link === 'psw' && !psws.includes(c.label)) out.push(`Pressure contact ${c.label} has no pressure sensor called ${c.label}.`);
    if (d.link === 'counter' && !ctrs.includes(c.label)) out.push(`Reset coil ${c.label} has no counter called ${c.label}.`);
    if (c.type === 'psw' && !q.wired(c.id + '.p')) out.push(`Pressure sensor ${c.label} is not connected to any air line.`);
    if (c.type === 'sol' && !vy.includes(c.label)) out.push(`Solenoid coil ${c.label} is not fitted to any valve. Give a valve solenoid the same label.`);
    if (isLs(c.type) && !marks.includes(c.label)) out.push(d.reed ? `Reed switch ${c.label} is not mounted on a cylinder. Only a magnet held near it will close it.` : `Limit switch ${c.label} is not mounted on a cylinder. You can press it by hand, but no piston will reach it.`);
    if (d.cat === 'e' && c.type !== 'psu') for (const p of d.ports) if (!q.wired(c.id + '.' + p.n)) { out.push(`${c.label}: terminal ${p.n} is not connected.`); break; }
    if (isValve(c.type) && !q.wired(c.id + '.1')) out.push(`Valve ${c.label}: port 1 has no air supply.`);
  }
  for (const y of vy) if (y && !sols.includes(y)) out.push(`A valve has a solenoid ${y}, but there is no coil ${y} in the electrical circuit.`);
  for (const l of new Set(relays)) if (relays.filter(x => x === l).length > 1) out.push(`Two relay coils are both called ${l}.`);
  return out;
};

/* ----- headless test bench ----- */
function fresh(circ, faults) {
  const s = new Sim(circ, faults); s.power(true); s.run(0.6); return s;
}
function truth(circ, t, faults) {
  const n = t.inputs.length, rows = []; let ok = true;
  for (let m = 0; m < (1 << n); m++) {
    const s = fresh(circ, faults), bits = t.inputs.map((_, i) => (m >> i) & 1);
    if (t.mat) s.mat = t.mat;
    t.inputs.forEach((l, i) => { if (bits[i]) s.pressLabel(l, true); });
    s.run(0.25);
    const got = s.check([t.out[0], t.out[1], true]) ? 1 : 0, want = t.fn(...bits) ? 1 : 0;
    const trip = !!(s.psu && s.st[s.psu.id].tripped);
    const good = got === want && !trip;
    if (!good) ok = false;
    rows.push({bits, want, got, ok: good, trip});
  }
  return {ok, rows};
}
function seq(circ, t, faults) {
  const s = fresh(circ, Object.assign({}, faults, t.faults)), rows = []; let ok = true;
  s._prevCycles = 0;
  for (const st of t.steps) {
    s._px = {}; for (const c of s.cyls) s._px[c.id] = s.st[c.id].x;
    if (st.mat) s.mat = st.mat;                      // which workpiece, and whether it is in front of the sensors
    if (st.show != null) s.present = !!st.show;
    (st.press || []).forEach(l => s.pressLabel(l, true));
    (st.release || []).forEach(l => s.pressLabel(l, false));
    if (st.tap) { st.tap.forEach(l => s.pressLabel(l, true)); s.run(0.15); st.tap.forEach(l => s.pressLabel(l, false)); }
    s.run(st.run == null ? 0.5 : st.run);
    const trip = !!(s.psu && s.st[s.psu.id].tripped);
    const good = !trip && (st.expect || []).every(e => s.check(e));
    for (const c of s.cyls) s._prevCycles = s.st[c.id].cycles;
    rows.push({say: st.say, ok: good, why: trip ? 'The fuse tripped: somewhere +24 V reaches 0 V without passing through a coil or lamp.' : st.why});
    if (!good) { ok = false; break; }
  }
  return {ok, rows};
}
EP.evalLesson = function (circ, lesson, faults) {
  const out = []; let pass = true;
  for (const t of lesson.tests || []) {
    const r = t.kind === 'truth' ? truth(circ, t, faults) : t.kind === 'seq' ? seq(circ, t, faults) : {ok: !!t.check(EP.query(circ), circ), rows: []};
    r.t = t; out.push(r); if (!r.ok) pass = false;
  }
  return {pass, out};
};
})(typeof window !== 'undefined' ? window : globalThis);

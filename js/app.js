/* PneuLab UI: lesson map, circuit editor, live bench, coach panel. */
(function () {
'use strict';
const EP = window.EP, D = EP.defs, {isCyl, isValve, isPush, isLs, isCoil, isSens, isDet} = EP.is, P_ATM = EP.K.P_ATM, esc = EP.esc;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const snap = v => Math.round(v / 10) * 10;
const bar = p => ((p - P_ATM) / 1e5).toFixed(2);

const store = {
  get(k, d) { try { const v = localStorage.getItem('pneulab.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pneulab.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

/* ---------- where this runs: a browser tab, an installed web app, or the Android shell ---------- */
const NAT = window.PneuLabNative || null;               // put there by the Android app; absent everywhere else
const SITE = 'https://merunism19.github.io/pneulab/';   // where the workshop lives on the web: links to shared circuits point here
const nat = (fn, ...a) => { try { if (NAT && typeof NAT[fn] === 'function') { NAT[fn](...a); return true; } } catch (e) { /* the shell refused */ } return false; };
const small = () => matchMedia('(max-width: 900px)').matches;
const coarse = () => matchMedia('(pointer: coarse)').matches;
const Hap = {                                           // a short buzz under the finger, where the device has a motor for it
  on: store.get('hap', true), can: typeof navigator.vibrate === 'function',
  buzz(p) { if (this.on && this.can) { try { navigator.vibrate(p); } catch (e) { /* not allowed yet */ } } }
};

/* ---------- sound ---------- */
const Snd = {
  on: store.get('snd', true), ctx: null,
  ac() {
    if (!this.on) return null;
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(f, d, type, g, when) {
    const a = this.ac(); if (!a) return;
    const o = a.createOscillator(), v = a.createGain(), t = a.currentTime + (when || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    v.gain.setValueAtTime(g || 0.08, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v); v.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, freq, q, g) {
    const a = this.ac(); if (!a) return;
    const n = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; v.gain.value = g;
    s.connect(f); f.connect(v); v.connect(a.destination); s.start();
  },
  click() { this.noise(0.03, 2400, 1.5, 0.5); },
  hiss() { this.noise(0.35, 5200, 0.7, 0.2); },
  thunk() { this.tone(90, 0.12, 'sine', 0.22); this.noise(0.05, 300, 1, 0.3); },
  pop() { this.tone(160, 0.25, 'sawtooth', 0.1); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.09, i * 0.09)); },
  bad() { this.tone(180, 0.18, 'square', 0.04); this.tone(140, 0.25, 'square', 0.04, 0.12); },
  tick() { this.tone(880, 0.06, 'triangle', 0.05); }
};

/* ---------- state ---------- */
const S = {
  mode: 'home', lesson: null, circ: {comps: [], wires: []}, sim: null, speed: 1, sel: null,
  view: {x: 40, y: 20, k: 1}, undo: [], done: [], hints: 0, fails: 0, shown: false, solved: false,
  res: null, src: {}, notes: [], scn: {carry: true, n: 0, last: 0, stamped: false}, prog: store.get('prog', {}), seq: 1,
  badges: store.get('badges', {}), bt: {}, drill: store.get('drill', {solved: 0, streak: 0, best: 0}),
  hunt: store.get('hunt', {solved: 0, streak: 0, best: 0}), lock: false, redo: []
};
const comp = id => S.circ.comps.find(c => c.id === id);
EP.state = S;
const uid = p => { let id; do id = p + (S.seq++); while (S.circ.comps.some(c => c.id === id) || S.circ.wires.some(w => w.id === id)); return id; };

function wireCls(w, sim) {
  let c = 'wire ' + w.k;
  if (!sim) return c;
  if (w.k === 'e') {
    const v = Math.max(sim.nodeV(w.a.c, w.a.p), sim.nodeV(w.b.c, w.b.p)), i = sim.wI.get(w.id) || 0;
    if (v > 20) c += ' v-hi'; else if (v > 3) c += ' v-mid';
    if (Math.abs(i) > 0.002) c += i > 0 ? ' f-fwd' : ' f-rev';
  } else {
    const p = sim.portP(w.a.c, w.a.p) - P_ATM, q = sim.tubeQ.get(w.id) || 0;
    if (p > 3e5) c += ' pr'; else if (p > 3e4) c += ' pr-lo';
    if (Math.abs(q) > 3e-5) c += q > 0 ? ' f-fwd' : ' f-rev';
  }
  return c;
}

/* Draws a circuit into two SVG layers and afterwards only touches what changed. */
class Painter {
  constructor(gW, gC) { this.gW = gW; this.gC = gC; this.sym = new Map(); this.cache = new Map(); this.wel = new Map(); this.wcls = new Map(); }
  build(circ, sim, o) {
    o = o || {};
    const ids = new Map(circ.comps.map(c => [c.id, c])), cnt = new Map();
    let hw = '', dots = '', hc = '';
    for (const w of circ.wires) {
      const pts = EP.wirePts(ids, w); if (!pts) continue;
      const d = 'M' + pts.map(p => p[0] + ',' + p[1]).join('L');
      hw += `<g class="${wireCls(w, sim)}${o.selWire === w.id ? ' sel' : ''}" data-wire="${w.id}"><path class="hitw" d="${d}"/><path class="base" d="${d}"/><path class="flow" d="${d}"/></g>`;
      [[w.a, pts[0]], [w.b, pts[pts.length - 1]]].forEach(([e, pt]) => {
        const k = e.c + '.' + e.p, n = (cnt.get(k) || 0) + 1; cnt.set(k, n);
        if (ids.get(e.c).type === 'psu' || n === 2) dots += `<circle class="jdot ${w.k}" cx="${pt[0]}" cy="${pt[1]}" r="${w.k === 'p' ? 3.6 : 2.7}"/>`;
      });
    }
    this.cache.clear();
    for (const c of circ.comps) {
      const d = D[c.type], b = EP.box(c), s = d.draw(c, sim);
      this.cache.set(c.id, s);
      const int = isPush(c.type) || isValve(c.type) || isDet(c.type) || c.type === 'psu';
      hc += `<g class="comp${o.selComp === c.id ? ' sel' : ''}${int ? ' int' : ''}" data-id="${c.id}" transform="translate(${c.x},${c.y})">`;
      if (c.type === 'psu') hc += `<rect class="hit" x="-63" y="-14" width="56" height="28" rx="8"/><rect class="hit" x="-63" y="${c.props.h - 14}" width="56" height="28" rx="8"/>`;
      else hc += `<rect class="hit" x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}" rx="7"/>`;
      hc += `<g class="sym">${s}</g>`;
      if (o.ports) {
        if (c.type === 'psu') hc += `<rect class="port e barport" data-port="pos" x="0" y="-8" width="${c.props.w}" height="16"/><rect class="port e barport" data-port="neg" x="0" y="${c.props.h - 8}" width="${c.props.w}" height="16"/>`;
        else {
          for (const p of d.ports) hc += `<circle class="port-h" data-port="${p.n}" cx="${p.x}" cy="${p.y}" r="14"/>`;      // a finger-sized target under each terminal
          for (const p of d.ports) hc += `<circle class="port ${p.k}" data-port="${p.n}" cx="${p.x}" cy="${p.y}" r="4.6"/>`;
        }
      }
      hc += '</g>';
    }
    this.gW.innerHTML = hw + dots; this.gC.innerHTML = hc;
    this.sym.clear(); this.wel.clear(); this.wcls.clear();
    $$('.comp', this.gC).forEach(g => this.sym.set(g.dataset.id, g.querySelector('.sym')));
    $$('.wire', this.gW).forEach(g => { this.wel.set(g.dataset.wire, g); this.wcls.set(g.dataset.wire, g.getAttribute('class')); });
    this.selWire = o.selWire;
  }
  update(circ, sim) {
    for (const c of circ.comps) {
      const s = D[c.type].draw(c, sim);
      if (this.cache.get(c.id) !== s) { const el = this.sym.get(c.id); if (el) el.innerHTML = s; this.cache.set(c.id, s); }
    }
    for (const w of circ.wires) {
      const cls = wireCls(w, sim) + (this.selWire === w.id ? ' sel' : '');
      if (this.wcls.get(w.id) !== cls) { const el = this.wel.get(w.id); if (el) el.setAttribute('class', cls); this.wcls.set(w.id, cls); }
    }
  }
}
function bounds(circ) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of circ.comps) { const b = EP.box(c); x0 = Math.min(x0, c.x + b[0]); y0 = Math.min(y0, c.y + b[1]); x1 = Math.max(x1, c.x + b[0] + b[2]); y1 = Math.max(y1, c.y + b[1] + b[3]); }
  return x0 === Infinity ? [0, 0, 600, 400] : [x0, y0, x1 - x0, y1 - y0];
}

/* ---------- toasts ---------- */
const toastSeen = {};
function toast(msg, kind, key) {
  const now = Date.now();
  if (key) { if (toastSeen[key] && now - toastSeen[key] < 6000) return; toastSeen[key] = now; }
  const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.innerHTML = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), kind === 'bad' ? 6500 : 3800);
}

/* hand a file to the user: a download in a browser, the Downloads folder in the Android app */
function saveFile(name, mime, data) {
  const blob = data instanceof Blob ? data : new Blob([data], {type: mime});
  if (NAT) {
    const r = new FileReader();
    r.onload = () => { if (!nat('saveFile', name, mime, String(r.result).split(',')[1] || '')) toast('This file could not be saved.', 'bad'); };
    r.readAsDataURL(blob); return;
  }
  const u = URL.createObjectURL(blob), el = document.createElement('a');
  el.href = u; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
EP.saveFile = saveFile;

/* ---------- modal ---------- */
let modalAct = null;
function openModal(html, onAct) { const m = $('#modal'); m.innerHTML = html; m.classList.remove('hidden'); modalAct = onAct || null; }
function closeModal() { document.body.classList.remove('cert-open'); $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; modalAct = null; if (S.mode !== 'home') drawAll(); }
$('#modal').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && b.dataset.act === 'close') { closeModal(); return; }
  if (b && modalAct) modalAct(b.dataset.act, b);
});

/* ---------- home ---------- */
let hero = null;
function showHome() {
  setPower(false, true); S.mode = 'home'; S.lesson = null; closeModal();
  $('#work').classList.add('hidden'); $('#home').classList.remove('hidden');
  document.body.style.overflow = '';
  const total = EP.lessons.length, done = EP.lessons.filter(l => S.prog[l.id]).length, next = EP.lessons.find(l => !S.prog[l.id]);
  const starSum = EP.lessons.reduce((a, l) => a + (S.prog[l.id] || 0), 0);
  let h = `<div class="home-wrap"><section class="hero"><div>
    <div class="kick">PneuLab · electro-pneumatics workshop</div>
    <h1>Build machines that run on <em>air</em> and obey <em>electricity</em>.</h1>
    <p>Wire real control circuits, switch the bench on, and watch current and compressed air do exactly what the laws of physics say they should. ${total} lessons, from your first pushbutton to timers, counters, safety circuits, two-cylinder sequences, a repair shop and proximity sensors. The 3D button shows whatever you build as real hardware.</p>
    <div class="hero-cta">
      <button class="btn primary big" data-go="${next ? next.id : 'sandbox'}">${!done ? 'Start lesson 1' : next ? 'Continue: ' + esc(next.title) : 'Open the sandbox'}</button>
      <button class="btn big" data-go="sandbox">Sandbox</button>
      <button class="btn big ghost" data-go="book">Handbook</button>
      <button class="btn big ghost" data-go="set">Settings</button>
    </div>
    <div class="prog"><span>${done}/${total} lessons</span><div class="prog-bar"><i style="width:${done / total * 100}%"></i></div><span>${starSum} ★</span></div>
    ${NAT ? '' : '<p class="getapp">On an Android phone? <a href="PneuLab.apk" download>Download the app</a>, or choose “Add to Home screen” in the browser menu. Both work without a connection.</p>'}
  </div><div class="hero-art"><svg id="hero-svg"><g id="hero-w"></g><g id="hero-c"></g></svg></div></section>`;
  let num = 0;
  EP.chapters.forEach((ch, ci) => {
    h += `<section class="chap"><div class="chap-h"><span class="n">CHAPTER ${ci + 1}</span><h2>${esc(ch.title)}</h2><span>${esc(ch.blurb)}</span></div><div class="cards">`;
    for (const l of EP.lessons.filter(l => l.ch === ci)) {
      num++;
      const st = S.prog[l.id] || 0;
      h += `<button class="card ${next && next.id === l.id ? 'next' : ''}" data-go="${l.id}"><div class="top"><span>Lesson ${num}</span><span class="chip">${st ? 'done' : next && next.id === l.id ? 'up next' : l.kind === 'guided' ? 'guided' : l.id.startsWith('fix') ? 'repair' : 'challenge'}</span></div>
        <h3>${esc(l.title)}</h3><div class="stars">${'<b>★</b>'.repeat(st)}${'★'.repeat(3 - st)}</div></button>`;
    }
    h += '</div></section>';
  });
  h += `<section class="chap"><div class="chap-h"><span class="n">FREE PLAY</span><h2>Sandbox and practice</h2><span>Build anything you like, let the bench set you a fresh puzzle, or sit the exam.</span></div>
    <div class="cards"><button class="card sand" data-go="drill"><div class="top"><span>Endless practice</span><span class="chip">random</span></div><h3>Logic drill</h3><div class="stars" style="color:var(--muted);font-size:13px;letter-spacing:0">A new truth table every time. Solved: ${S.drill.solved} · first-try streak: ${S.drill.streak} (best ${S.drill.best})</div></button>
    <button class="card sand" data-go="hunt"><div class="top"><span>Endless practice</span><span class="chip">random</span></div><h3>Fault hunt</h3><div class="stars" style="color:var(--muted);font-size:13px;letter-spacing:0">A working machine with one hidden fault. Measure, then accuse. Found: ${S.hunt.solved} · clean streak: ${S.hunt.streak} (best ${S.hunt.best})</div></button>
    <button class="card sand" data-go="exam"><div class="top"><span>When you feel ready</span><span class="chip">${S.exam.passed ? 'passed' : 'exam'}</span></div><h3>Final exam</h3><div class="stars" style="color:var(--muted);font-size:13px;letter-spacing:0">Ten questions from the whole course, a different paper every time. Eight right earns a certificate you can print.${S.exam.best ? ' Best so far: ' + S.exam.best + '/10' : ''}</div></button>
    <button class="card sand" data-go="sandbox"><div class="top"><span>Open bench</span></div><h3>Build anything</h3><div class="stars" style="color:var(--muted);font-size:13px;letter-spacing:0">Your sheet is saved automatically, and you can send it to someone.</div></button>
    <button class="card sand" data-go="lib"><div class="top"><span>On this device</span><span class="chip">${libAll().length} saved</span></div><h3>My circuits</h3><div class="stars" style="color:var(--muted);font-size:13px;letter-spacing:0">Sheets you saved under a name. This is also where you open a circuit someone sent you.</div></button></div></section>
    <section class="chap"><div class="chap-h"><span class="n">BADGES</span><h2>Things to try</h2><span>${BADGES.filter(b => S.badges[b[0]]).length} of ${BADGES.length} earned. Most of them reward breaking something on purpose.</span></div>
    <div class="cards badges">${BADGES.map(b => `<div class="bdg ${S.badges[b[0]] ? 'got' : ''}"><i>${S.badges[b[0]] ? '★' : '☆'}</i><div><b>${b[1]}</b><span>${b[2]}</span></div></div>`).join('')}</div></section></div>`;
  $('#home').innerHTML = h;
  // a living picture: the final project, running by itself
  const circ = EP.solutions.auto(), sim = new EP.Sim(circ), b = bounds(circ);
  sim.power(true);
  const svg = $('#hero-svg'); svg.setAttribute('viewBox', `${b[0] - 10} ${b[1] - 10} ${b[2] + 20} ${b[3] + 20}`);
  hero = {circ, sim, p: new Painter($('#hero-w'), $('#hero-c')), t: 0, started: false};
  hero.p.build(circ, sim);
  natTheme();
}
$('#home').addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  Snd.ac();
  const g = b.dataset.go;
  if (g === 'book') handbook(); else if (g === 'set') settings(); else if (g === 'lib') library(); else if (g === 'sandbox') startSandbox(); else if (g === 'drill') startDrill(); else if (g === 'hunt') startHunt(); else if (g === 'exam') startExam(); else startLesson(g);
});

/* ---------- entering the workspace ---------- */
function enterWork() {
  hero = null;
  $('#home').innerHTML = ''; $('#home').classList.add('hidden'); $('#work').classList.remove('hidden');
  S.sel = null; S.undo = []; S.redo = []; S.res = null; S.done = []; S.hints = 0; S.fails = 0; S.shown = false; S.solved = false; S.notes = [];
  closeSheet(); natTheme();
  renderPalette(); renderCoach(); renderInsp(); renderScene(true); renderOpanel(); fit(); drawAll();
  requestAnimationFrame(() => { fit(); drawAll(); });
}
function startLesson(id) { const L = EP.lessons.find(l => l.id === id); if (L) openLesson(L); }
function startHunt() { openLesson(EP.makeHunt(S.lesson && S.lesson.hunt ? S.lesson.hunt.src : null)); }
function startDrill() { openLesson(EP.makeDrill(S.lesson && S.lesson.drill != null ? S.lesson.drill : -1)); }
function openLesson(L) {
  setPower(false, true);
  S.mode = 'lesson'; S.lesson = L; S.circ = L.start(L.solution()); S.lock = L.kind === 'hunt';
  const i = EP.lessons.indexOf(L);
  $('#w-kicker').textContent = L.kind === 'hunt' ? 'Practice · find the hidden fault' : L.drill != null ? 'Practice · a new table every time' : `Lesson ${i + 1} · ${EP.chapters[L.ch].title}`; $('#w-title').textContent = L.title;
  enterWork(); showIntro(0);
}
function startSandbox() {
  setPower(false, true);
  S.mode = 'sandbox'; S.lesson = null; S.lock = false;
  const saved = store.get('sandbox', null);
  S.circ = saved && saved.comps && saved.comps.length ? saved : unfix(EP.solutions.direct());
  $('#w-kicker').textContent = 'Free play'; $('#w-title').textContent = 'Sandbox';
  enterWork();
}
function unfix(c) { c.comps.forEach(x => { x.fixed = false; }); return c; }

function showIntro(i) {
  const L = S.lesson, sl = L.intro[i], n = L.intro.length;
  openModal(`<div class="dlg"><button class="dlg-x" data-act="close" title="Close">×</button>
    <div class="dlg-h"><div class="kick">${esc(L.title)} · briefing ${i + 1}/${n}</div><h2>${esc(sl.h)}</h2></div>
    <div class="dlg-b">${sl.html}</div>
    <div class="dlg-f"><div class="dots">${L.intro.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row">${i > 0 ? '<button class="btn" data-act="prev">Back</button>' : ''}<button class="btn primary" data-act="next">${i === n - 1 ? 'To the bench' : 'Next'}</button></div></div></div>`,
  a => { if (a === 'next') { if (i === n - 1) closeModal(); else showIntro(i + 1); } else if (a === 'prev') showIntro(i - 1); });
}

/* ---------- palette ---------- */
function allowed() { return S.mode === 'sandbox' ? Object.keys(D) : (S.lesson && S.lesson.palette) || []; }
function renderPalette() {
  const el = $('#palette'), types = allowed();
  el.classList.toggle('off', !!S.sim); el.classList.toggle('empty', !types.length);
  if (!types.length) { el.innerHTML = '<div class="pal-h">Parts bin</div><div class="pal-empty">All the parts for this lesson are already on the sheet. You only need to wire them.</div>'; return; }
  let h = '', grp = '';
  for (const t of Object.keys(D)) {
    if (!types.includes(t)) continue;
    const d = D[t];
    if (d.grp !== grp) { grp = d.grp; h += `<div class="pal-h">${grp}</div>`; }
    const dis = d.one && S.circ.comps.some(c => c.type === t);
    h += `<button class="pal-item" data-type="${t}" title="${esc(d.name)}" ${dis ? 'disabled' : ''}>${EP.symbolSVG(t)}<span>${esc(d.short)}</span></button>`;
  }
  el.innerHTML = h;
}
function autoLabel(type) {
  const d = D[type];
  if (!d.prefix) return '';
  if (d.link) {                 // a contact or reset coil takes the label of the device it belongs to
    const kinds = {relay: ['relay', 'timer', 'timer_off', 'counter'], psw: ['psw'], counter: ['counter']}[d.link];
    const r = S.circ.comps.find(c => kinds.includes(c.type));
    return r ? r.label : {relay: 'K1', psw: 'B1', counter: 'C1'}[d.link];
  }
  const used = new Set(S.circ.comps.filter(c => D[c.type].prefix === d.prefix && !D[c.type].link).map(c => c.label));
  for (let n = 1; ; n++) { const l = d.suffix ? n + d.prefix : d.prefix + n; if (!used.has(l)) return l; }
}

/* ---------- canvas ---------- */
const cv = $('#cv'), paint = new Painter($('#l-wires'), $('#l-comps'));

/* on a phone the coach panel is a sheet that slides up from the bottom edge; its top strip always shows what matters now */
const coachEl = $('#coach');
function closeSheet() { if (coachEl.classList.contains('open')) { coachEl.classList.remove('open'); coachEl.scrollTop = 0; } }
$('#coach-peek').addEventListener('click', () => { if (!coachEl.classList.toggle('open')) coachEl.scrollTop = 0; });
function renderPeek() {
  const el = $('#peek-t'), c = S.sel && S.sel.id && comp(S.sel.id), L = S.lesson, st = curStep();
  let t = '';
  if (c) t = (c.label ? c.label + ' · ' : '') + D[c.type].short + (S.sim ? ' — live values' : ' — settings');
  else if (S.sel && S.sel.wire) t = 'Line selected — ' + (S.sim ? 'live values' : 'open to delete it');
  else if (st) { const d = document.createElement('div'); d.innerHTML = st.t; t = d.textContent; }
  else if (S.mode === 'sandbox') t = 'Sandbox — examples, my circuits, share';
  else if (L && L.kind === 'hunt') t = 'Fault hunt — measure, then accuse';
  else if (L) t = S.res ? (S.res.pass ? 'All tests passed' : 'A test failed — open for the details') : 'Task and test bench';
  if (el._t !== t) { el.textContent = t; el._t = t; }
  document.body.classList.toggle('has-sel', !!S.sel);
}
function applyView() { $('#view').setAttribute('transform', `translate(${S.view.x},${S.view.y}) scale(${S.view.k})`); }
function toWorld(e) { const r = cv.getBoundingClientRect(); return {x: (e.clientX - r.left - S.view.x) / S.view.k, y: (e.clientY - r.top - S.view.y) / S.view.k}; }
function fit() {
  const r = cv.getBoundingClientRect(), b = bounds(S.circ);
  if (!r.width) return;
  // the machine view sits top-right: make room beside it or below it, whichever leaves the circuit bigger
  const sm = small(), low = sm && r.height < 420;          // low: a phone held sideways, where every pixel of height counts
  const sc = $('#scene'), has = !sc.classList.contains('hidden'), padB = low ? 14 : 96, padX = sm ? 12 : 30;
  const kOf = (W, H) => Math.max(sm ? 0.28 : 0.45, Math.min(1.5, (W - padX * 2) / b[2], H / b[3]));
  let padR = 0, padT = low ? 58 : sm ? 74 : 46, k = kOf(r.width, r.height - padT - padB);
  if (has) {
    const kSide = kOf(r.width - sc.offsetWidth - 14, r.height - 46 - padB), kBelow = kOf(r.width, r.height - sc.offsetHeight - 30 - padB);
    if (kSide >= kBelow) { padR = sc.offsetWidth + 14; k = kSide; } else { padT = sc.offsetHeight + 30; k = kBelow; }
  }
  const W = r.width - padR;
  S.view.k = k; S.view.x = (W - b[2] * k) / 2 - b[0] * k; S.view.y = padT + (r.height - padT - padB - b[3] * k) / 2 - b[1] * k;
  applyView();
}
function zoom(f, cx, cy) {
  const r = cv.getBoundingClientRect(); if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
  const k = Math.max(0.25, Math.min(3, S.view.k * f)), g = k / S.view.k;
  S.view.x = cx - (cx - S.view.x) * g; S.view.y = cy - (cy - S.view.y) * g; S.view.k = k; applyView();
}
function curStep() { const L = S.lesson; if (!L || !L.steps) return null; const i = L.steps.findIndex((_, j) => !S.done[j]); return i < 0 ? null : L.steps[i]; }

function drawAll() {
  applyView();
  document.body.classList.toggle('running', !!S.sim);
  paint.build(S.circ, S.sim, {ports: !S.sim && !S.lock, selComp: S.sel && S.sel.id, selWire: S.sel && S.sel.wire});
  // headings over the two halves, as on a circuit sheet
  let z = '';
  const half = (f, t) => { const cs = S.circ.comps.filter(f); if (!cs.length) return; const b = bounds({comps: cs}); z += `<text class="zonet" x="${b[0]}" y="${b[1] - 16}">${t}</text>`; };
  half(c => D[c.type].cat === 'p', 'PNEUMATIC CIRCUIT'); half(c => D[c.type].cat === 'e', 'ELECTRIC CIRCUIT');
  const psu = S.circ.comps.find(c => c.type === 'psu');
  if (psu) {
    const ecs = S.circ.comps.filter(c => D[c.type].cat === 'e' && c.type !== 'psu' && c.x >= psu.x - 5 && c.x <= psu.x + psu.props.w + 5 && c.y > psu.y - 30 && c.y < psu.y + psu.props.h);
    const xs = [...new Set(ecs.map(c => c.x))].sort((a, b) => a - b);
    xs.forEach((x, i) => { z += `<text class="brn" x="${x}" y="${psu.y - 9}" text-anchor="middle">${i + 1}</text>`; });   // current-path numbers
    for (const k of ecs) {
      if (!isCoil(k.type) && k.type !== 'counter') continue;
      const no = [], nc = [];                         // under each coil: the branches where its contacts sit
      for (const c of ecs) if (D[c.type].link === 'relay' && c.label === k.label) (D[c.type].contact === 'no' ? no : nc).push(xs.indexOf(c.x) + 1);
      if (!no.length && !nc.length) continue;
      const y = psu.y + psu.props.h + 9, n = Math.max(no.length, nc.length);
      z += `<g class="ctab"><line x1="${k.x - 13}" y1="${y}" x2="${k.x + 13}" y2="${y}"/><line x1="${k.x}" y1="${y - 9}" x2="${k.x}" y2="${y + 5 + 9 * n}"/>` +
        no.map((v, i) => `<text x="${k.x - 4}" y="${y + 10 + 9 * i}" text-anchor="end">${v}</text>`).join('') +
        nc.map((v, i) => `<text x="${k.x + 4}" y="${y + 10 + 9 * i}" text-anchor="start">${v}</text>`).join('') + '</g>';
    }
  }
  $('#l-zones').innerHTML = z;
  // pulsing rings on whatever the current step is about
  let o = ''; const st = curStep();
  if (st && st.hl && !$('#modal').firstChild) for (const ref of st.hl) {
    const i = ref.lastIndexOf('.'), c = comp(i < 0 ? ref : ref.slice(0, i)) || comp(ref);
    if (!c) continue;
    if (i < 0 || c.id === ref) { const b = EP.box(c); o += `<rect class="hl fillr" x="${c.x + b[0] - 3}" y="${c.y + b[1] - 3}" width="${b[2] + 6}" height="${b[3] + 6}" rx="9"/>`; }
    else if (S.sim) continue;
    else if (c.type === 'psu') { const y = c.y + (ref.endsWith('neg') ? c.props.h : 0); o += `<rect class="hl" x="${c.x - 4}" y="${y - 8}" width="${c.props.w + 8}" height="16" rx="8"/>`; }
    else { const p = EP.portPos(c, ref.slice(i + 1)); if (p) o += `<circle class="hl" cx="${p.x}" cy="${p.y}" r="9"/>`; }
  }
  $('#l-over').innerHTML = o;
  $('#modeflag').textContent = !S.sim && S.lock ? 'Power is off — this machine may not be rewired' : S.sim ? '● Live — power is on · switch off to rewire' : 'Build mode — power is off';
}

/* ---------- editing ---------- */
function pushUndo() { S.undo.push(JSON.stringify(S.circ)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (S.sim || S.lock || !S.undo.length) return; S.redo.push(JSON.stringify(S.circ)); S.circ = JSON.parse(S.undo.pop()); S.sel = null; changed(); renderInsp(); renderPalette(); }
function redo() { if (S.sim || S.lock || !S.redo.length) return; S.undo.push(JSON.stringify(S.circ)); S.circ = JSON.parse(S.redo.pop()); S.sel = null; changed(); renderInsp(); renderPalette(); }
function duplicate() {
  if (S.sim || S.lock || !S.sel || !S.sel.id) return;
  const c = comp(S.sel.id); if (!c) return;
  if (!allowed().includes(c.type) || D[c.type].one) { toast('This part cannot be duplicated here.'); return; }
  pushUndo();
  const n = EP.newComp(c.type, uid('c'), c.x + 80, c.y, Object.assign({}, c.props, {label: D[c.type].link ? c.label : autoLabel(c.type)}));
  S.circ.comps.push(n); S.sel = {id: n.id}; changed(); renderInsp(); renderPalette();
}
function changed() {
  S.res = null;
  if (S.mode === 'sandbox') store.set('sandbox', S.circ);
  checkSteps(true); drawAll(); renderCoach();
}
function select(sel) { S.sel = sel; drawAll(); renderInsp(); }
function delSel() {
  if (S.sim || S.lock || !S.sel) return;
  if (S.sel.wire) { pushUndo(); S.circ.wires = S.circ.wires.filter(w => w.id !== S.sel.wire); }
  else {
    const c = comp(S.sel.id); if (!c) return;
    if (c.fixed) { toast('This part belongs to the lesson and stays on the sheet. You can still move it.'); return; }
    pushUndo();
    S.circ.comps = S.circ.comps.filter(x => x !== c);
    S.circ.wires = S.circ.wires.filter(w => w.a.c !== c.id && w.b.c !== c.id);
  }
  S.sel = null; changed(); renderInsp(); renderPalette();
}
function addWire(a, b, k) {
  if (a.c === b.c && a.p === b.p) return;
  const same = (w, x, y) => w.a.c === x.c && w.a.p === x.p && w.b.c === y.c && w.b.p === y.p;
  if (S.circ.wires.some(w => same(w, a, b) || same(w, b, a))) return;
  pushUndo(); S.circ.wires.push({id: uid('w'), k, a, b}); Snd.tick(); changed();
}
function nearest(w, from, reach) {
  let best = null, bd = reach || 18;
  const tryIt = (c, p, k, x, y, d) => { if (from && from.c === c.id && from.p === p) return; if (d < bd) { bd = d; best = {c: c.id, p, k, x, y}; } };
  for (const c of S.circ.comps) {
    if (c.type === 'psu') {
      for (const pn of ['pos', 'neg']) {
        const y = c.y + (pn === 'neg' ? c.props.h : 0);
        if (w.x >= c.x - 8 && w.x <= c.x + c.props.w + 8) tryIt(c, pn, 'e', Math.max(c.x, Math.min(c.x + c.props.w, w.x)), y, Math.abs(w.y - y) + 3);
      }
    } else for (const p of D[c.type].ports) tryIt(c, p.n, p.k, c.x + p.x, c.y + p.y, Math.hypot(w.x - c.x - p.x, w.y - c.y - p.y));
  }
  return best;
}

/* ---------- operating things while the power is on ---------- */
function canPress(c) { return isPush(c.type) || isValve(c.type) || (isDet(c.type) && S.sim && !S.sim.st[c.id].mounted); }
function press(c, src, on, side) {
  if (!S.sim) return;
  const key = c.id + (isValve(c.type) ? side || 'L' : ''), set = S.src[key] || (S.src[key] = new Set());
  if (on) set.add(src); else set.delete(src);
  const st = S.sim.st[c.id];
  if (isValve(c.type)) st[side === 'R' ? 'mR' : 'mL'] = set.size > 0; else st.pressed = set.size > 0;
}
function pressLabel(label, src, on) {
  let flipped = false;
  for (const c of S.circ.comps) if (c.label === label && (isPush(c.type) || isDet(c.type))) {
    if (D[c.type].detent) { if (on && !flipped) { toggleLabel(c); flipped = true; } }       // a toggle switch flips on each press and stays
    else press(c, src, on);
  }
}
function toggleLabel(c) {                 // every contact block with this label flips together
  const on = !(S.src[c.id] && S.src[c.id].has('hold'));
  for (const x of S.circ.comps) if (x.label === c.label && D[x.type].detent) press(x, 'hold', on);
}
function toggleHold(c, side) { const key = c.id + (isValve(c.type) ? side || 'L' : ''); press(c, 'hold', !(S.src[key] && S.src[key].has('hold')), side); }

function huntFaults() { const h = S.lesson && S.lesson.hunt; return h ? {[h.fault.kind]: {[h.fault.id]: true}} : null; }
function setPower(on, quiet) {
  if (on === !!S.sim) return;
  if (on) {
    S.sim = new EP.Sim(S.circ, huntFaults()); S.sim.power(true); S.src = {}; S.notes = EP.diagnose(S.circ);
    S.scn = {carry: true, n: 0, last: 0, stamped: false}; S.bt = {}; S.lockTap = false; S.cyc = null;
    Snd.ac(); Snd.hiss(); Hap.buzz(15);
  } else S.sim = null;
  Part.clear(); Belt.reset();
  Scope.reset();
  $('#btn-power span').textContent = on ? 'Power OFF' : 'Power ON';
  $('#stepper').classList.toggle('hidden', !(on && S.speed === 0));
  nat('keepAwake', !!on);                               // a running machine should not be dimmed away
  if (quiet) { document.body.classList.remove('running'); return; }
  drawAll(); renderPalette(); renderOpanel(); renderCoach(); renderInsp(); renderScene(true);
}

/* ---------- pointer handling ---------- */
let drag = null, pinch = null, palPend = null; const presses = new Map(), tch = new Map();
function cancelDrag() {                                   // a second finger arrived: whatever the first one began is called off
  const d = drag; drag = null; cv.classList.remove('panning'); $('#l-rubber').innerHTML = '';
  if (d && d.type === 'move' && d.moved && !d.isNew && S.undo.length) { S.circ = JSON.parse(S.undo.pop()); drawAll(); }
}
function cap(e) { try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointer already gone */ } }
function pinchStart() {
  const [a, b] = [...tch.values()], r = cv.getBoundingClientRect();
  cancelDrag();
  pinch = {d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), k: S.view.k, wx: ((a.x + b.x) / 2 - r.left - S.view.x) / S.view.k, wy: ((a.y + b.y) / 2 - r.top - S.view.y) / S.view.k};
}
function pinchMove() {                                    // the spot between two fingers stays between them while the sheet scales
  const [a, b] = [...tch.values()], r = cv.getBoundingClientRect();
  const k = Math.max(0.25, Math.min(3, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
  S.view.k = k; S.view.x = (a.x + b.x) / 2 - r.left - pinch.wx * k; S.view.y = (a.y + b.y) / 2 - r.top - pinch.wy * k; applyView();
}
cv.addEventListener('contextmenu', e => { if (e.pointerType === 'touch' || coarse()) e.preventDefault(); });
cv.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  closeSheet();
  if (e.pointerType === 'touch') {
    if (e.isPrimary) { tch.clear(); pinch = null; }
    tch.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pinch) return;
    if (tch.size === 2 && !presses.size && !(drag && drag.isNew)) { pinchStart(); return; }
  }
  const w = toWorld(e), t = e.target, pe = t.closest('[data-port]'), ce = t.closest('.comp'), we = t.closest('.wire');
  Snd.ac();
  if (S.sim) {
    if (ce) {
      const c = comp(ce.dataset.id);
      if (c.type === 'psu' && S.sim.st[c.id].tripped) { S.sim.resetFuse(); toast('Fuse reset. If it trips again, find the path that has no load in it.'); }
      const vp = S.sim.st[c.id].pos, side = (c.type === 'v52d' || c.type === 'v53') && w.x > c.x + 20 + (c.type === 'v53' ? [0, 40, -40][vp] : vp * 40) ? 'R' : 'L';
      if (!S.sel || S.sel.id !== c.id) select({id: c.id});
      if (canPress(c)) {
        Hap.buzz(8);
        if (D[c.type].detent) toggleLabel(c);
        else if (e.shiftKey || S.lockTap) toggleHold(c, side);
        else { press(c, 'p' + e.pointerId, true, side); presses.set(e.pointerId, {c, side}); cap(e); }
      } else if (isDet(c.type)) toast(`${esc(c.label)} is mounted on the cylinder — only the piston can operate it.`, '', 'ls');
      return;
    }
    if (we) { select({wire: we.dataset.wire}); return; }
    if (S.sel) select(null);
  } else if (pe && ce && !S.lock) {
    const c = comp(ce.dataset.id), pn = pe.dataset.port, k = D[c.type].cat === 'p' ? 'p' : 'e';
    const pp = c.type === 'psu' ? EP.portPos(c, pn, snap(w.x)) : EP.portPos(c, pn);
    drag = {type: 'wire', from: {c: c.id, p: pn}, k, x0: pp.x, y0: pp.y, tgt: null, touch: e.pointerType === 'touch'};
    cap(e); return;
  } else if (ce) {
    const c = comp(ce.dataset.id);
    if (!S.sel || S.sel.id !== c.id) select({id: c.id});
    if (S.lock) return;                                   // a machine under diagnosis is not to be rebuilt
    drag = {type: 'move', id: c.id, ox: w.x - c.x, oy: w.y - c.y, moved: false};
    cap(e); return;
  } else if (we) { select({wire: we.dataset.wire}); return; }
  else if (S.sel) select(null);
  drag = {type: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y};
  cv.classList.add('panning'); cap(e);
});
window.addEventListener('pointermove', e => {
  const tp = tch.get(e.pointerId); if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
  if (pinch) { if (tp && tch.size >= 2) pinchMove(); return; }
  if (palPend && e.pointerId === palPend.id) {            // pulled out of the bin, across the way it scrolls: now it is a part in the hand
    const dx = Math.abs(e.clientX - palPend.sx), dy = Math.abs(e.clientY - palPend.sy);
    if (palPend.strip ? dy > 10 && dy > dx : dx > 10 && dx > dy) { const type = palPend.type; palPend = null; newPart(type, e); }
    return;
  }
  if (!drag) return;
  if (drag.type === 'pan') { S.view.x = drag.vx + e.clientX - drag.sx; S.view.y = drag.vy + e.clientY - drag.sy; applyView(); return; }
  const w = toWorld(e);
  if (drag.type === 'move') {
    const c = comp(drag.id); if (!c) return;
    const nx = snap(w.x - drag.ox), ny = snap(w.y - drag.oy);
    if (nx === c.x && ny === c.y) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    c.x = nx; c.y = ny; drawAll();
  } else if (drag.type === 'wire') {
    const n = nearest(w, drag.from, drag.touch ? Math.max(18, 30 / S.view.k) : 18); drag.tgt = n;      // a finger hides its target, so it reaches further
    const ex = n ? n.x : w.x, ey = n ? n.y : w.y;
    $('#l-rubber').innerHTML = `<path class="rubber" d="M${drag.x0},${drag.y0}L${ex},${ey}"/>` + (n ? `<circle class="snapring" cx="${n.x}" cy="${n.y}" r="8"/>` : '');
  }
});
function endPointer(e) {
  tch.delete(e.pointerId);
  if (pinch) { if (tch.size < 2) pinch = null; return; }
  if (palPend && e.pointerId === palPend.id) {            // the finger never left the spot: a tap puts the part on the sheet
    const type = palPend.type; palPend = null;
    if (e.type !== 'pointerup') return;
    newPart(type, e, true);
  }
  const pr = presses.get(e.pointerId);
  if (pr) { press(pr.c, 'p' + e.pointerId, false, pr.side); presses.delete(e.pointerId); }
  if (!drag) return;
  const d = drag; drag = null; cv.classList.remove('panning');
  if (d.type === 'wire') {
    $('#l-rubber').innerHTML = '';
    if (d.tgt) {
      if (d.tgt.k !== d.k) toast(d.k === 'e' ? 'That is an air port. Wires carry current between electrical terminals; air needs a tube between air ports.' : 'That is an electrical terminal. Air tubes only fit air ports.', 'bad', 'kind');
      else { addWire(d.from, {c: d.tgt.c, p: d.tgt.p}, d.k); Hap.buzz(6); }
    }
  } else if (d.type === 'move') {
    if (d.isNew) {
      const r = $('#stage').getBoundingClientRect(), c = comp(d.id);
      const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
      const still = d.tap || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6;
      if (e.type === 'pointercancel' || (!still && !inside)) { S.circ.comps = S.circ.comps.filter(x => x !== c); S.undo.pop(); S.sel = null; }
      else if (still) {                                    // a plain click or tap: drop it mid-sheet, beside anything already lying there
        const b = EP.box(c);
        let x = snap((r.width / 2 - S.view.x) / S.view.k - b[0] - b[2] / 2), y = snap((r.height / 2 - S.view.y) / S.view.k - b[1] - b[3] / 2);
        while (S.circ.comps.some(o => o !== c && o.x === x && o.y === y)) { x += 20; y += 20; }
        c.x = x; c.y = y;
      }
      renderPalette(); renderInsp();
    }
    if (d.moved || d.isNew) changed();
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, {passive: false});

function newPart(type, e, tap) {
  const w = toWorld(e);
  pushUndo();
  const c = EP.newComp(type, uid('c'), 0, 0, {label: autoLabel(type)}), bx = EP.box(c);
  const ox = bx[0] + bx[2] / 2, oy = bx[1] + bx[3] / 2;
  c.x = snap(w.x - ox); c.y = snap(w.y - oy);
  S.circ.comps.push(c); S.sel = {id: c.id};
  drag = {type: 'move', id: c.id, ox, oy, moved: true, isNew: true, tap: !!tap, sx: e.clientX, sy: e.clientY};
  drawAll();
}
$('#palette').addEventListener('pointerdown', e => {
  const b = e.target.closest('.pal-item'); if (!b || b.disabled || S.sim) return;
  if (e.pointerType === 'touch') {                        // a finger may be scrolling the bin instead: wait and see which way it goes
    const cs = getComputedStyle($('#palette'));
    palPend = {type: b.dataset.type, id: e.pointerId, sx: e.clientX, sy: e.clientY, strip: cs.display === 'flex' && cs.flexDirection === 'row'};
    return;
  }
  e.preventDefault(); newPart(b.dataset.type, e);
});

$('#tools').addEventListener('click', e => {
  const tb = e.target.closest('button'), t = tb && tb.dataset.t;
  if (t === 'undo') undo(); else if (t === 'redo') redo(); else if (t === 'svg') exportPicture(); else if (t === 'del') delSel(); else if (t === 'zin') zoom(1.2); else if (t === 'zout') zoom(1 / 1.2); else if (t === 'fit') fit();
});
window.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (S.mode === 'home') return;
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) { closeModal(); drawAll(); return; }
  if (!$('#modal').classList.contains('hidden')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && !S.sim) { e.preventDefault(); delSel(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
  else if (S.sim && !e.repeat && /^[0-9]$/.test(e.key)) pressLabel('S' + e.key, 'key', true);
  else if (S.sim && !e.repeat && (e.key === 'w' || e.key === 'W')) partSrc('key', true);
  else if (e.key === 'p' || e.key === 'P') setPower(!S.sim);
  else if (e.key === '?') handbook('keys');
  else if (e.key === '.' && S.sim) { stepOnce(); toast('Paused. Each press of <kbd>.</kbd> moves time on by 20 ms. Pick a speed to run again.', '', 'step'); }   // freeze time, then walk through it
});
window.addEventListener('keyup', e => { if (S.sim && /^[0-9]$/.test(e.key)) pressLabel('S' + e.key, 'key', false); else if (e.key === 'w' || e.key === 'W') partSrc('key', false); });
window.addEventListener('blur', () => { if (S.sim) { for (const c of S.circ.comps) if (isPush(c.type)) press(c, 'key', false); partSrc('key', false); } });
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (S.mode === 'home') return;
  if (coarse() && window.innerWidth !== lastW) { lastW = window.innerWidth; fit(); }      // the device was turned; a keyboard sliding in changes only the height
  else applyView();
});
/* time frozen: walk through it in small steps */
function setSpeed(s) {
  S.speed = s; $$('#speed button').forEach(x => x.classList.toggle('on', +x.dataset.s === s));
  $('#stepper').classList.toggle('hidden', !(S.sim && s === 0));
}
function stepOnce(dt) { if (!S.sim) return; if (S.speed !== 0) setSpeed(0); S.sim.advance(dt || 0.02); }
$('#stepper').addEventListener('click', e => { const v = e.target.dataset.st; if (!v) return; if (v === 'run') setSpeed(1); else stepOnce(+v); });

/* ---------- operator panel ---------- */
/* A workpiece is held in front of the sensors by whoever asks for it: a finger on the button, the lock, a key, or the belt. */
const Part = new Set();
function syncPart() { if (S.sim) S.sim.present = Part.size > 0 || Belt.here; }
function partSrc(src, on) { if (on) Part.add(src); else Part.delete(src); syncPart(); }
function setMat(m) { if (!S.sim || S.sim.mat === m) return; S.sim.mat = m; $$('#opanel [data-mat]').forEach(b => b.classList.toggle('on', b.dataset.mat === m)); }
/* The belt feeds the sensing station by itself: a new part of a random material every few seconds.
   A part counts as sorted right when metal was pushed off by the first cylinder and everything else was left alone. */
const Belt = {
  on: false, t: 0, T: 4, here: false, mat: 'steel', pushed: false, py: 51, n: 0, ok: 0, run: 0,
  reset() { this.on = false; this.t = 0; this.here = false; this.pushed = false; this.py = 51; this.n = this.ok = this.run = 0; },
  toggle() {
    this.on = !this.on; this.t = 0; this.here = false; syncPart();
    $$('#opanel [data-belt]').forEach(b => b.classList.toggle('on', this.on));
    if (this.on) toast('The belt is running. A new part reaches the sensors every four seconds: steel, plastic or glass.', '', 'belt');
  },
  step(dt, sim) {
    if (!this.on || dt <= 0) return;
    if (this.t === 0 || this.t >= this.T) {                       // the next part sets off
      this.t = this.t >= this.T ? this.t - this.T : 0;
      const r = Math.random(); this.mat = r < 0.5 ? 'steel' : r < 0.8 ? 'plastic' : 'glass'; this.pushed = false; this.py = 51;
    }
    this.t += dt;
    const here = this.t >= 1 && this.t < 2.8, c = sim.cyl('1A') || sim.cyls[0];
    if (here) { setMat(this.mat); if (c && sim.st[c.id].x > c.props.stroke * 0.6) this.pushed = true; }
    else if (this.here) {                                          // it has just left the sensors: was it handled right?
      const right = this.pushed === (this.mat === 'steel');
      this.n++; if (right) { this.ok++; this.run++; } else this.run = 0;
      if (this.run >= 10) award('sort');
    }
    this.here = here; syncPart();
  }
};
function renderOpanel() {
  const el = $('#opanel');
  if (!S.sim) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const seen = new Set(), free = c => isDet(c.type) && !S.sim.st[c.id].mounted, prox = c => isSens(c.type) || D[c.type].reed; let h = '';
  const list = S.circ.comps.filter(c => isPush(c.type) || free(c)).sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
  for (const c of list) {
    if (seen.has(c.label)) continue; seen.add(c.label);
    const m = /^S([0-9])$/.exec(c.label);
    h += `<button class="op ${c.type === 'pb_nc' || c.type === 'sw_nc' ? 'nc' : ''} ${prox(c) ? 'sn' : isLs(c.type) ? 'ls' : ''} ${D[c.type].detent ? 'sw' : ''}" data-label="${esc(c.label)}"${prox(c) ? ' title="Hold the chosen workpiece in front of this sensor only"' : ''}><span class="cap"></span><b>${esc(c.label)}</b><i>${m ? 'key ' + m[1] : '&nbsp;'}</i></button>`;
  }
  if (S.circ.comps.some(c => free(c) && prox(c))) {             // sensors that are not on a cylinder look at workpieces instead
    h += `<div class="mats" title="What the workpiece is made of">${EP.MATS.map(m => `<button data-mat="${m[0]}" class="m-${m[0]}${S.sim.mat === m[0] ? ' on' : ''}">${m[1]}</button>`).join('')}</div>` +
      `<button class="op part" data-part="1" title="Hold the workpiece in front of every sensor (W key)"><span class="cap"></span><b>Workpiece</b><i>key W</i></button>` +
      `<button class="op-lock${Belt.on ? ' on' : ''}" data-belt="1" title="Let a belt bring a new random part every four seconds">Belt</button>`;
  }
  if (!h) { el.classList.add('hidden'); return; }
  el.innerHTML = h + `<button class="op-lock${S.lockTap ? ' on' : ''}" data-lock="1" title="Lock: a tap presses a button and leaves it pressed until you tap it again">Lock</button>` +
    (coarse() ? '' : '<div class="op-tip">Hold several at once with the number keys. <b>Shift</b>+click locks a button down.</div>');
  el.classList.remove('hidden');
}
const op = $('#opanel');
op.addEventListener('pointerdown', e => {
  if (!S.sim) return;
  const mt = e.target.closest('[data-mat]'); if (mt) { setMat(mt.dataset.mat); return; }
  if (e.target.closest('[data-belt]')) { Belt.toggle(); return; }
  if (e.target.closest('[data-part]')) {
    e.preventDefault(); Hap.buzz(8);
    if (e.shiftKey || S.lockTap) { partSrc('hold', !Part.has('hold')); return; }
    const id = 'o' + e.pointerId; partSrc(id, true);
    const up = ev => { if (ev.pointerId !== e.pointerId) return; partSrc(id, false); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return;
  }
  const lk = e.target.closest('[data-lock]');
  if (lk) { S.lockTap = !S.lockTap; lk.classList.toggle('on', S.lockTap); if (S.lockTap) toast('Lock is on. A tap now presses a button and leaves it pressed; tap it again to let go.', '', 'lock'); return; }
  const b = e.target.closest('.op'); if (!b) return;
  e.preventDefault(); Hap.buzz(8);
  if (e.shiftKey || S.lockTap) { const c = S.circ.comps.find(c => c.label === b.dataset.label && (isPush(c.type) || isDet(c.type))); const on = !(S.src[c.id] && S.src[c.id].has('hold')); pressLabel(b.dataset.label, 'hold', on); return; }
  pressLabel(b.dataset.label, 'o' + e.pointerId, true);
  const up = ev => { if (ev.pointerId !== e.pointerId) return; pressLabel(b.dataset.label, 'o' + e.pointerId, false); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
});
op.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- machine scene ---------- */
function renderScene(reset) {
  const el = $('#scene'), kind = S.lesson && S.lesson.scene;
  if (!kind) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const cy = S.sim && S.sim.cyl('1A'), st = cy && S.sim.st[cy.id];
  const f = st ? st.x / cy.props.stroke : 0, n = st ? st.cycles : 0, sc = S.scn;
  let g = '';
  const I = 'stroke="var(--ink)" stroke-width="1.5"';
  if (kind === 'press') {
    if (n > sc.last) { sc.stamped = true; sc.last = n; }
    if (f < 0.12) sc.stamped = false;
    const y = 24 + f * 56;
    g = `<rect x="38" y="106" width="174" height="12" rx="2" fill="var(--ink)"/><rect x="52" y="20" width="8" height="86" fill="var(--metal)" ${I}/><rect x="190" y="20" width="8" height="86" fill="var(--metal)" ${I}/>
      <rect x="44" y="12" width="162" height="10" rx="2" fill="var(--ink)"/><rect x="110" y="2" width="30" height="14" rx="2" fill="var(--panel)" ${I}/>
      <rect x="122" y="22" width="6" height="${(y - 22).toFixed(1)}" fill="var(--metal)" ${I}/><rect x="92" y="${y.toFixed(1)}" width="66" height="14" rx="3" fill="var(--accent)" ${I}/>
      <rect x="112" y="${(y + 14).toFixed(1)}" width="26" height="6" fill="var(--ink)"/>` +
      (sc.stamped ? `<path d="M96,98 L110,98 L114,105 L136,105 L140,98 L154,98 L154,106 L96,106 Z" fill="var(--air)" ${I}/>` : `<rect x="96" y="100" width="58" height="6" fill="var(--metal)" ${I}/>`);
  } else if (kind === 'feeder') {
    if (f < 0.06) sc.carry = true;
    if (f >= 0.97 && sc.carry) { sc.carry = false; sc.n++; }
    const px = 138 - f * 52, blk = (x, y, c) => `<rect x="${x.toFixed(1)}" y="${y}" width="40" height="24" rx="2" fill="${c || 'var(--air)'}" fill-opacity=".8" ${I}/>`;
    const cx = 98 - f * 52, last = sc.carry ? Math.min(46, cx - 42) : 46;
    g = `<rect x="0" y="112" width="250" height="6" fill="var(--ink)"/>` + blk(98, 10) + blk(98, 36) + blk(98, 62) +
      (sc.carry ? blk(cx, 88) : '') + (sc.n > 0 ? blk(last, 88, 'var(--warn)') : '') + (sc.n > 1 ? blk(last - 42, 88, 'var(--warn)') : '') +
      `<line x1="96" y1="6" x2="96" y2="86" ${I}/><line x1="140" y1="6" x2="140" y2="86" ${I}/>
      <rect x="${px.toFixed(1)}" y="92" width="60" height="16" rx="2" fill="var(--accent)" ${I}/><rect x="${(px + 60).toFixed(1)}" y="97" width="${Math.max(0, 204 - px - 60).toFixed(1)}" height="6" fill="var(--metal)" ${I}/>
      <rect x="202" y="88" width="46" height="24" rx="3" fill="var(--panel)" ${I}/>`;
  }
  if (kind === 'transfer') {
    const c2 = S.sim && S.sim.cyl('2A'), s2 = c2 && S.sim.st[c2.id], f2 = s2 ? s2.x / c2.props.stroke : 0;
    if (f < 0.05 && f2 < 0.05) sc.carry = true;                       // a new box waits on the lift
    if (sc.carry && f > 0.9 && f2 > 0.95) { sc.carry = false; sc.n++; }
    const ly = 98 - f * 56, hx = 70 + f2 * 62;
    const box = (x, y, c) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="30" height="22" rx="2" fill="${c}" fill-opacity=".85" ${I}/>`;
    g = `<rect x="0" y="112" width="250" height="6" fill="var(--ink)"/><rect x="118" y="42" width="132" height="6" fill="var(--ink)"/><rect x="124" y="48" width="6" height="64" fill="var(--metal)" ${I}/>
      <rect x="86" y="${(ly + 6).toFixed(1)}" width="8" height="${(112 - ly - 6).toFixed(1)}" fill="var(--metal)" ${I}/><rect x="66" y="${ly.toFixed(1)}" width="50" height="6" rx="1" fill="var(--accent)" ${I}/>
      <rect x="4" y="18" width="40" height="16" rx="3" fill="var(--panel)" ${I}/><rect x="44" y="23" width="${(hx - 44).toFixed(1)}" height="6" fill="var(--metal)" ${I}/><rect x="${hx.toFixed(1)}" y="16" width="6" height="24" rx="1" fill="var(--accent)" ${I}/>` +
      (sc.carry ? box(f > 0.9 ? Math.max(78, hx + 6) : 78, ly - 22, 'var(--air)') : '') +
      (sc.n > 0 ? box(140 + (sc.carry ? 36 : 0), 20, 'var(--warn)') : '') + (sc.n > 1 ? box(176 + (sc.carry ? 36 : 0), 20, 'var(--warn)') : '');
  }
  if (kind === 'clamp') {
    const c2 = S.sim && S.sim.cyl('2A'), s2 = c2 && S.sim.st[c2.id], f2 = s2 ? s2.x / c2.props.stroke : 0, n2 = s2 ? s2.cycles : 0;
    if (n2 > sc.last) { sc.stamped = true; sc.last = n2; }
    if (f < 0.1 && f2 < 0.1) sc.stamped = false;                       // clamp open: a fresh blank is loaded
    sc.n = n2;
    const jx = 62 + f * 46, ry = 8 + f2 * 46;
    g = `<rect x="0" y="108" width="250" height="10" fill="var(--ink)"/><rect x="160" y="78" width="12" height="30" fill="var(--ink)"/>
      <rect x="6" y="84" width="40" height="18" rx="3" fill="var(--panel)" ${I}/><rect x="46" y="90" width="${(jx - 46).toFixed(1)}" height="6" fill="var(--metal)" ${I}/><rect x="${jx.toFixed(1)}" y="80" width="12" height="28" rx="2" fill="var(--accent)" ${I}/>
      <rect x="120" y="84" width="40" height="24" rx="2" fill="${sc.stamped ? 'var(--air)' : 'var(--metal)'}" ${I}/>` + (sc.stamped ? `<path d="M132,84 l8,7 l8,-7" fill="var(--sheet)" ${I}/>` : '') +
      `<rect x="122" y="0" width="36" height="12" rx="2" fill="var(--panel)" ${I}/><rect x="137" y="12" width="6" height="${(ry - 6).toFixed(1)}" fill="var(--metal)" ${I}/><rect x="126" y="${(ry + 6).toFixed(1)}" width="28" height="12" rx="2" fill="var(--accent)" ${I}/>
      <path d="M134,${(ry + 18).toFixed(1)} h12 l-6,12 z" fill="var(--ink)"/>`;
  }
  if (kind === 'sorter') {
    const sim = S.sim, mcol = {steel: 'var(--metal)', plastic: 'var(--accent)', glass: 'var(--air)', magnet: 'var(--hot)'}, hy = 30 + f * 59, at = Math.max(51, hy + 6);
    const part = (x, y, m, o) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="22" height="22" rx="3" fill="${mcol[m]}" fill-opacity="${m === 'glass' ? 0.28 : 0.92}" opacity="${o == null ? 1 : o.toFixed(2)}" ${I}/>`;
    const eye = (l, y) => `<rect x="96" y="${y}" width="9" height="11" rx="2" fill="${sim && sim.sensOn(l) ? 'var(--hot)' : 'var(--panel)'}" ${I}/><text x="92" y="${y + 9}" class="pin" text-anchor="end">${l}</text>`;
    let pt = '';
    if (sim && Belt.on) {
      const t = Belt.t;
      if (t < 1) pt = part(-24 + 139 * t, 51, Belt.mat);
      else if (t < 2.8) { Belt.py = Math.max(Belt.py, at); pt = part(115, Belt.py, Belt.mat); }
      else pt = Belt.py > 80 ? part(115, Belt.py, Belt.mat, 1 - (t - 2.8) / 1.2) : part(115 + (t - 2.8) / 1.2 * 150, 51, Belt.mat);
    } else if (sim && sim.present) pt = part(115, at, sim.mat);
    g = `<rect x="0" y="44" width="250" height="36" fill="var(--soft)" ${I}/><line x1="0" y1="62" x2="250" y2="62" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="7 7"/>
      <rect x="104" y="88" width="44" height="32" rx="3" fill="var(--panel)" ${I}/><text x="126" y="116" class="pin" text-anchor="middle">metal</text>` + eye('B1', 46) + eye('B2', 66) + pt +
      `<rect x="112" y="0" width="28" height="20" rx="3" fill="var(--panel)" ${I}/><rect x="123" y="20" width="6" height="${(hy - 20).toFixed(1)}" fill="var(--metal)" ${I}/><rect x="108" y="${hy.toFixed(1)}" width="36" height="6" rx="1" fill="var(--accent)" ${I}/>`;
  }
  const cnt = kind === 'press' ? n : sc.n;
  const capR = kind === 'sorter' ? (Belt.n ? `${Belt.ok} of ${Belt.n} sorted right` : Belt.on ? 'belt running' : 'belt off') : `${cnt} ${kind === 'transfer' ? 'box' + (cnt === 1 ? '' : 'es') : 'part' + (cnt === 1 ? '' : 's')}`;
  const h = `<svg viewBox="0 0 250 122">${g}</svg><div class="cap"><span>${{press: 'Press 1A', feeder: 'Magazine feeder 1A', transfer: 'Lift 1A · pusher 2A', clamp: 'Clamp 1A · stamp 2A', sorter: 'Sorting station'}[kind]}</span><b>${capR}</b></div>`;
  if (reset || el._h !== h) { el.innerHTML = h; el._h = h; }
}

/* ---------- inspector ---------- */
function fld(label, inner) { return `<label class="fld"><span>${label}</span><span>${inner}</span></label>`; }
function renderInsp() {
  const el = $('#insp'), s = S.sel, run = !!S.sim;
  if (!s) { el.innerHTML = `<div class="empty">${run ? 'Click any part or line to read its live values.' : 'Click a part to see what it is and change its settings. Drag from terminal to terminal to connect.'}</div>`; return; }
  if (s.wire) {
    const w = S.circ.wires.find(x => x.id === s.wire); if (!w) { S.sel = null; return renderInsp(); }
    el.innerHTML = `<h4>${w.k === 'e' ? 'Wire' : 'Air tube'}</h4><p class="desc">${w.k === 'e' ? 'An ideal conductor: both of its ends are always at the same voltage.' : 'Plastic tubing. Everything it joins shares one pressure.'}</p>
      <div class="live" id="live"></div>${run || S.lock ? '' : '<div class="row" style="margin-top:10px"><button class="btn" data-a="del">Delete</button></div>'}`;
    return liveInsp();
  }
  const c = comp(s.id); if (!c) { S.sel = null; return renderInsp(); }
  const d = D[c.type], lock = run || c.fixed || S.lock ? 'disabled' : '', lockRun = run || S.lock ? 'disabled' : '';
  const text = (attr, val, ph, dis) => `<input type="text" ${attr} value="${esc(val)}" placeholder="${ph || ''}" maxlength="6" ${dis}>`;
  const range = (p, min, max, step, unit) => `<input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${c.props[p]}"><output>${c.props[p]}${unit}</output>`;
  let h = `<div class="insp-top">${EP.symbolSVG(c.type, Object.assign({label: c.label}, c.props))}<div><h4>${esc(d.name)}</h4><p class="desc">${d.desc}</p></div></div>`;
  if (d.prefix) h += fld('Label', text('data-f="label"', c.label, '', lock));
  if (d.link) h += `<p class="desc">${{relay: 'It follows the relay, timer or counter with the same label.', psw: 'It follows the pressure sensor with the same label.', counter: 'It resets the counter with the same label.'}[d.link]}</p>`;
  if (d.sensor || d.reed) h += `<p class="desc">Sees: <b>${EP.SEES[d.sensor || 'reed'].join(', ')}</b>.</p>`;
  if (isDet(c.type)) h += `<p class="desc">To mount it on a cylinder, type its label into one of the cylinder's end-position fields.</p>`;
  if (isValve(c.type)) { h += fld('Solenoid (left)', text('data-p="y1"', c.props.y1, 'Y1', lock)); if (c.type === 'v52d' || c.type === 'v53') h += fld('Solenoid (right)', text('data-p="y2"', c.props.y2, 'Y2', lock)); }
  if (isCyl(c.type)) {
    h += fld('Switch or sensor at retracted end', text('data-p="markRet"', c.props.markRet, 'none', lock)) + fld('Switch or sensor at extended end', text('data-p="markExt"', c.props.markExt, 'none', lock));
    h += fld('Load against the rod', range('load', 0, 600, 10, ' N'));
  }
  if (c.type === 'fcv') h += fld('Throttle opening', range('open', 0, 100, 1, ' %'));
  if (c.type === 'timer' || c.type === 'timer_off') h += fld('Delay', range('delay', 0.5, 10, 0.5, ' s'));
  if (c.type === 'counter') h += fld('Preset count', range('preset', 1, 9, 1, ''));
  if (c.type === 'psw') h += fld('Switches at', range('set', 0.5, 6, 0.5, ' bar'));
  if (c.type === 'air') h += fld('Supply pressure', `<input type="range" data-p="bar" min="0" max="8" step="0.5" value="${c.props.bar}" ${lockRun}><output>${c.props.bar} bar</output>`);
  if (c.type === 'psu') h += fld('Width', `<input type="range" data-p="w" min="100" max="700" step="20" value="${c.props.w}" ${lockRun}><output></output>`) + fld('Height', `<input type="range" data-p="h" min="110" max="520" step="10" value="${c.props.h}" ${lockRun}><output></output>`);
  h += '<div class="live" id="live"></div>';
  if (!run && !S.lock) {
    const dup = allowed().includes(c.type) && !d.one;
    if (!c.fixed || dup) h += '<div class="row" style="margin-top:10px">' + (c.fixed ? '' : '<button class="btn" data-a="del">Delete part</button>') + (dup ? '<button class="btn" data-a="dup" title="Ctrl+D">Duplicate</button>' : '') + '</div>';
  }
  el.innerHTML = h; liveInsp();
}
function liveInsp() {
  const el = $('#live'); if (!el || !S.sel) return;
  const sim = S.sim, row = (k, v) => `<div><span class="k">${k}</span><b>${v}</b></div>`;
  let h = '';
  if (S.sel.wire) {
    const w = S.circ.wires.find(x => x.id === S.sel.wire); if (!w || !sim) { el.innerHTML = ''; return; }
    const va = sim.nodeV(w.a.c, w.a.p), vb = sim.nodeV(w.b.c, w.b.p), pa = sim.portP(w.a.c, w.a.p), pb = sim.portP(w.b.c, w.b.p);
    // a meter on each end: on a healthy line both read the same
    if (w.k === 'e') h = (Math.abs(va - vb) > 1 ? row('voltage, one end', va.toFixed(1) + ' V') + row('voltage, other end', vb.toFixed(1) + ' V') : row('voltage to 0 V', va.toFixed(1) + ' V')) + row('current', (Math.abs(sim.wI.get(w.id) || 0) * 1000).toFixed(0) + ' mA');
    else h = (Math.abs(pa - pb) > 2e4 ? row('pressure, one end', bar(pa) + ' bar') + row('pressure, other end', bar(pb) + ' bar') : row('pressure', bar(pa) + ' bar')) + row('air flow', (Math.abs(sim.tubeQ.get(w.id) || 0) / 1.185 * 60000).toFixed(0) + ' l/min');
    el.innerHTML = h; return;
  }
  const c = comp(S.sel.id); if (!c) return;
  const d = D[c.type], st = sim && sim.st[c.id];
  if (isCyl(c.type)) {
    const g = EP.geo(c), sup = (S.circ.comps.find(x => x.type === 'air') || {props: {bar: 6}}).props.bar * 1e5;
    h += row('push force (max)', (sup * g.AA).toFixed(0) + ' N');
    if (!g.sa) h += row('pull force (max)', (sup * g.AB).toFixed(0) + ' N');
    if (st) h += row('position', (st.x * 1000).toFixed(0) + ' / ' + (g.L * 1000).toFixed(0) + ' mm') + row('speed', st.v.toFixed(2) + ' m/s') +
      row('cap side', bar(st.pA) + ' bar') + (g.sa ? '' : row('rod side', bar(st.pB) + ' bar')) + row('net force', st.F.toFixed(0) + ' N');
  } else if (!st) h = '';
  else if (d.sensor) {
    const mat = !st.mounted && (st.pressed || sim.present) ? sim.mat : '';
    h = row('supply, brown to blue', st.v.toFixed(1) + ' V' + (st.v < 10 ? ' — too little to work' : '')) +
      row('in front of it', st.mounted ? (st.act ? 'the piston' : 'nothing') : !mat ? 'nothing' : st.act ? mat : mat + ' — it cannot see that') +
      row('output, black', st.on ? '+24 V — switched' : 'off') + row('mounted', st.mounted ? 'on a cylinder' : 'no (it watches the workpieces)');
  }
  else if (d.contact) h = row('operated', (d.act === 'push' ? st.pressed : d.act === 'roller' ? st.act : d.act === 'pressure' ? sim.pswOn(c.label) : sim.relayOn(c.label)) ? 'yes' : 'no') + row('contact', sim.closed(c) ? 'closed — conducts' : 'open') + (isLs(c.type) ? row('mounted', st.mounted ? 'on a cylinder' : 'no (press by hand)') : '');
  else if (d.load) {
    const dead = !!(sim.faults.dead && sim.faults.dead[c.id]);
    h = row('voltage across', st.v.toFixed(1) + ' V') + row('current', (dead ? 0 : st.v / d.R * 1000).toFixed(0) + ' mA');
    if (dead && st.v >= 18) h += row('state', 'full voltage, yet no current'); else
    if (c.type === 'counter') h += row('count', st.count + ' of ' + c.props.preset) + row('contacts', st.on ? 'switched (preset reached)' : 'at rest');
    else if (c.type === 'timer') h += row('state', st.on ? 'timed out — contacts switched' : st.tm > 0 ? 'timing… ' + Math.max(0, c.props.delay - st.tm).toFixed(1) + ' s left' : 'off');
    else if (c.type === 'timer_off') h += row('state', st.on && st.tm > 0 ? 'holding on… ' + Math.max(0, c.props.delay - st.tm).toFixed(1) + ' s left' : st.on ? 'energised — contacts switched' : 'off');
    else if (c.type !== 'lamp') h += row('state', st.on ? 'energised' : st.v > 1 ? 'too little voltage' : 'off');
  } else if (c.type === 'psu') h = row('total current', (st.I * 1000).toFixed(0) + ' mA') + row('fuse', st.tripped ? 'TRIPPED' : 'ok (trips at 6 A)');
  else if (c.type === 'v53') h = row('position', ['centre (springs)', 'left square: extend', 'right square: retract'][st.pos]) + row('flow path', ['none — every port blocked', '1 → 4,  2 → 3', '1 → 2,  4 → 5'][st.pos]) + row('pilot air', st.pilot ? 'ok' : 'missing — cannot shift');
  else if (c.type === 'air') h = row('delivering now', (Math.max(0, sim.airRate) / 1.185 * 60000).toFixed(0) + ' l/min') + row('used since power-on', (sim.airKg / 1.185 * 1000).toFixed(1) + ' l of free air');
  else if (isValve(c.type)) h = row('position', st.pos ? 'actuated' : 'rest') + row('flow path', c.type === 'v32s' ? (st.pos ? '1 → 2' : '2 → 3 (exhaust)') : st.pos ? '1 → 4,  2 → 3' : '1 → 2,  4 → 5') + row('pilot air', st.pilot ? 'ok' : 'missing — cannot shift');
  else if (c.type === 'gauge') h = row('pressure', bar(st.p) + ' bar');
  else if (c.type === 'psw') h = row('pressure', bar(st.p) + ' bar') + row('signal', st.on ? 'ON — set pressure reached' : 'off');
  else if (c.type === 'fcv') h = row('in (valve side)', bar(sim.portP(c.id, 'in')) + ' bar') + row('out (cyl. side)', bar(sim.portP(c.id, 'out')) + ' bar');
  if (el._h !== h) { el.innerHTML = h; el._h = h; }
}
const insp = $('#insp');
insp.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT' && !S.sim) pushUndo(); });
insp.addEventListener('input', e => {
  const t = e.target, c = S.sel && comp(S.sel.id); if (!c) return;
  if (t.dataset.f === 'label') c.label = t.value.trim();
  else if (t.dataset.p) {
    const k = t.dataset.p; c.props[k] = t.type === 'range' ? +t.value : t.value.trim();
    const o = t.parentNode.querySelector('output'); if (o) o.textContent = k === 'w' || k === 'h' ? '' : c.props[k] + ({open: ' %', load: ' N', bar: ' bar', delay: ' s', set: ' bar'}[k] || '');
  }
  if (S.sim) { paint.update(S.circ, S.sim); if (S.mode === 'sandbox') store.set('sandbox', S.circ); }
  else { S.res = null; if (S.mode === 'sandbox') store.set('sandbox', S.circ); drawAll(); }
});
insp.addEventListener('change', () => { if (!S.sim) { checkSteps(true); renderCoach(); } });
insp.addEventListener('click', e => { if (e.target.dataset.a === 'del') delSel(); else if (e.target.dataset.a === 'dup') duplicate(); });

/* ---------- coach ---------- */
function ctx() {
  const sim = S.sim, st = id => sim && sim.st[id];
  return {
    q: EP.query(S.circ), running: !!sim, circ: S.circ, comp,
    sol: l => !!sim && sim.solOn(l), relay: l => !!sim && sim.relayOn(l),
    ext: l => !!sim && sim.check(['ext', l]), ret: l => !!sim && sim.check(['ret', l]), mid: l => !!sim && sim.check(['mid', l]), lamp: l => !!sim && sim.check(['lamp', l, true]),
    cycles: l => { const c = sim && sim.cyl(l); return c ? sim.st[c.id].cycles : 0; },
    pressed: id => !!(st(id) && st(id).pressed),
    sens: l => !!sim && sim.sensOn(l), mat: sim ? sim.mat : '',
    shown: !!sim && (sim.present || sim.lss.some(l => !sim.st[l.id].mounted && sim.st[l.id].pressed))
  };
}
function checkSteps(silent) {
  const L = S.lesson; if (!L || !L.steps || S.solved) return;
  const x = ctx(); let ch = false, blocked = false;
  L.steps.forEach((st, i) => {
    let d = false;
    try { d = st.sticky ? (!!S.done[i] || (!blocked && !!st.ok(x))) : !!st.ok(x); } catch (e) { d = false; }
    if (!d) blocked = true;
    if (d !== !!S.done[i]) { S.done[i] = d; ch = true; if (d && !silent) Snd.tick(); }
  });
  if (ch && !silent) { renderCoach(); if (!drag) drawAll(); }
  if (!blocked && L.kind === 'guided') { S.solved = true; setTimeout(complete, 900); }
}
function renderCoach() {
  const el = $('#coach-main'), L = S.lesson;
  let h = '';
  if (S.mode === 'sandbox') {
    h = `<div class="kick">Free play</div><h2>Sandbox</h2><p class="brief">Drag parts from the bin, wire them, switch the power on. Nothing can break — a short circuit only trips the fuse.</p>
      <div class="box"><h4>Load an example</h4><div class="row">${EP.examples.map((x, i) => `<button class="btn" data-a="ex" data-i="${i}">${esc(x[0])}</button>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" data-a="clear">Empty sheet</button><button class="btn ghost" data-a="save">Save to file</button><button class="btn ghost" data-a="load">Load from file</button><button class="btn ghost" data-a="share">Share</button></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-a="lib">My circuits</button></div></div>`;
  } else if (L && L.kind === 'hunt') {
    h = `<div class="kick">Fault hunt</div><h2>${esc(L.hunt.name)}</h2><p class="brief">This machine ran perfectly yesterday. Today <b>one part has failed</b>, and from the outside it looks fine. Nothing may be rewired — find it by measuring.</p>
      <div class="box"><h4>What it should do</h4><p>${L.hunt.does}</p></div>
      <div class="box"><h4>Find it</h4><p>Switch the power on, operate the machine, and click parts and lines to read them. A broken wire, a burnt coil, a worn contact or a kinked tube each leave a different trace. Select the culprit, then accuse it.</p>
      <div class="row"><button class="btn primary" data-a="accuse">Accuse the selected part</button><button class="btn" data-a="test">Self-test</button><button class="btn ghost" data-a="giveup">Show me</button></div>
      ${S.fails ? `<p>Wrong accusations so far: <b>${S.fails}</b></p>` : ''}${S.res ? resultsHTML(S.res, true) : ''}</div>`;
  } else if (L) {
    h = `<div class="kick">${L.kind === 'guided' ? 'Guided lesson' : L.id.startsWith('fix') ? 'Repair job' : L.drill != null ? 'Logic drill' : 'Challenge'}</div><h2>${esc(L.title)}</h2><p class="brief">${L.brief}</p><button class="link" data-a="brief">Read the briefing again</button>`;
    if (L.steps) {
      const cur = L.steps.findIndex((_, j) => !S.done[j]);
      h += '<ol class="steps">' + L.steps.map((s, i) => `<li class="${S.done[i] ? 'done' : i === cur ? 'cur' : ''}">${s.t}</li>`).join('') + '</ol>';
    }
    if (L.tests) {
      h += `<div class="box"><h4>Test bench</h4><p>When your circuit is ready, let the bench try every case. It works with the power on or off.</p>
        <div class="row"><button class="btn primary" data-a="test">Run the tests</button>${L.hints ? `<button class="btn" data-a="hint">${S.hints ? 'Another hint' : 'Hint'}</button>` : ''}</div>`;
      for (let i = 0; i < Math.min(S.hints, L.hints.length); i++) h += `<div class="hint">${L.hints[i]}</div>`;
      if (!L.noSolve && (S.hints > L.hints.length || (S.hints === L.hints.length && S.fails >= 2))) h += `<div class="hint">Still stuck? <button class="link" data-a="solve">Show me a working circuit</button> (you can undo it).</div>`;
      if (S.res) h += resultsHTML(S.res);
      h += '</div>';
    }
  }
  if (S.sim && S.notes.length && !(L && (L.kind === 'guided' || L.kind === 'hunt'))) h += `<div class="box"><h4>Bench check</h4><ul class="notes">${S.notes.slice(0, 5).map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  el.innerHTML = h;
}
function resultsHTML(res, plain) {
  let h = '<div class="res">';
  for (const r of res.out) {
    const t = r.t;
    h += `<h5><span class="badge ${r.ok ? 'ok' : 'no'}">${r.ok ? 'PASS' : 'FAIL'}</span>${esc(t.title)}</h5>`;
    if (t.kind === 'truth') {
      h += `<table class="tt"><thead><tr>${t.inputs.map(i => `<th>${i}</th>`).join('')}<th>${t.out[1]} should be</th><th>yours</th><th style="border:0;background:none"></th></tr></thead><tbody>` +
        r.rows.map(x => `<tr class="${x.ok ? '' : 'no'}">${x.bits.map(b => `<td class="b${b}">${b}</td>`).join('')}<td class="out b${x.want}">${x.want}</td><td class="b${x.got}">${x.trip ? '⚡' : x.got}</td><td class="mk">${x.ok ? '✓' : '✗'}</td></tr>`).join('') + '</tbody></table>';
      if (r.rows.some(x => x.trip)) h += '<div class="why">The fuse tripped in a marked row: somewhere +24 V reaches 0 V without passing through a coil.</div>';
      else if (!r.ok) h += '<div class="why">Find a red row and set the buttons that way yourself. Follow the red (live) wires from +24 V: where does the current get through when it should not, or stop when it should pass?</div>';
    } else if (t.kind === 'seq') {
      h += '<ol>' + t.steps.map((s, i) => { const x = r.rows[i]; return `<li class="${!x ? 'skip' : x.ok ? 'ok' : 'no'}">${esc(s.say)}</li>` + (x && !x.ok && !plain ? `<div class="why">${esc(x.why || '')}</div>` : ''); }).join('') + '</ol>';
    } else if (!r.ok) h += `<div class="why">${esc(t.why)}</div>`;
  }
  return h + '</div>';
}
$('#coach-main').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, L = S.lesson;
  if (a === 'brief') showIntro(0);
  else if (a === 'hint') { S.hints++; renderCoach(); }
  else if (a === 'solve') { setPower(false); pushUndo(); S.circ = L.solution(); S.shown = true; S.sel = null; changed(); renderInsp(); fit(); toast('Here is one working circuit. Study it, run it, then press “Run the tests”.'); }
  else if (a === 'test') runTests();
  else if (a === 'share') shareCircuit(S.circ);
  else if (a === 'lib') library();
  else if (a === 'accuse') accuse();
  else if (a === 'giveup') completeHunt(false);
  else if (a === 'ex') { setPower(false); pushUndo(); S.circ = unfix(EP.examples[+b.dataset.i][1]()); S.sel = null; changed(); renderInsp(); renderPalette(); fit(); }
  else if (a === 'save') saveFile('pneulab-circuit.json', 'application/json', JSON.stringify(S.circ, null, 1));
  else if (a === 'load') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(t => loadCircuit(JSON.parse(t))).catch(() => toast('That file is not a PneuLab circuit.', 'bad')); };
    inp.click();
  }
  else if (a === 'clear') { setPower(false); pushUndo(); S.circ = {comps: [], wires: []}; S.sel = null; changed(); renderInsp(); renderPalette(); }
});
/* Rebuild a circuit from a saved file, keeping only what the part definitions allow. */
const LIMITS = {open: [0, 100], load: [0, 600], bar: [0, 8], delay: [0.5, 10], preset: [1, 9], set: [0.5, 6], w: [100, 700], h: [110, 520]};   // the adjustable numbers and their ranges
function cleanCircuit(raw) {
  if (!raw || !Array.isArray(raw.comps) || !Array.isArray(raw.wires)) throw new Error('bad file');
  const comps = [], ids = new Map(), cid = v => String(v).replace(/[^\w]/g, '').slice(0, 24);
  for (const o of raw.comps.slice(0, 300)) {
    if (!o || !Object.prototype.hasOwnProperty.call(D, o.type)) continue;
    const id = cid(o.id); if (!id || ids.has(id)) continue;
    const c = EP.newComp(o.type, id, snap(Math.max(-4000, Math.min(4000, +o.x || 0))), snap(Math.max(-4000, Math.min(4000, +o.y || 0))), {label: String(o.label == null ? '' : o.label).slice(0, 6)});
    for (const k in c.props) {
      const v = o.props && o.props[k];
      if (typeof c.props[k] === 'string') { if (typeof v === 'string') c.props[k] = v.slice(0, 6); }
      else if (LIMITS[k] && typeof v === 'number' && isFinite(v)) c.props[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], v));
    }
    comps.push(c); ids.set(c.id, c);
  }
  const wires = [], port = e => { const c = e && ids.get(cid(e.c)); return c && D[c.type].ports.find(p => p.n === String(e.p)); };
  for (const w of raw.wires.slice(0, 600)) {
    const pa = w && port(w.a), pb = w && port(w.b);
    if (pa && pb && pa.k === pb.k) wires.push({id: 'w' + wires.length, k: pa.k, a: {c: cid(w.a.c), p: pa.n}, b: {c: cid(w.b.c), p: pb.n}});
  }
  if (!comps.length) throw new Error('empty');
  return {comps, wires};
}
function loadCircuit(raw, msg) {
  const c = cleanCircuit(raw);
  setPower(false); pushUndo(); S.circ = c; S.sel = null; changed(); renderInsp(); renderPalette(); fit();
  toast(msg || 'Circuit loaded.', 'good');
}

/* ----- a whole circuit packed into a link: nothing is uploaded, the sheet travels inside the address ----- */
function packCircuit(c) {
  const o = {c: c.comps.map(x => [x.type, x.id, x.x, x.y, x.label, x.props]), w: c.wires.map(w => [w.a.c, w.a.p, w.b.c, w.b.p])};
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unpackCircuit(s) {
  const o = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  return {comps: o.c.map(x => ({type: x[0], id: x[1], x: x[2], y: x[3], label: x[4], props: x[5]})), wires: o.w.map(w => ({a: {c: w[0], p: w[1]}, b: {c: w[2], p: w[3]}}))};
}
/* The sheet travels as a link to the website. Opened from a file or from the app, the link still points at the public site, so it works for whoever gets it. */
function shareCircuit(circ) {
  if (!circ.comps.length) { toast('The sheet is empty — there is nothing to share yet.'); return; }
  const code = packCircuit(circ), web = !NAT && /^https?:$/.test(location.protocol);
  const text = (web ? location.href.split('#')[0] : SITE) + '#c=' + code;
  const canSend = !!NAT || typeof navigator.share === 'function';
  openModal(`<div class="dlg"><button class="dlg-x" data-act="close">×</button><div class="dlg-h"><div class="kick">Share</div><h2>This sheet as a link</h2></div>
    <div class="dlg-b"><p>Whoever opens this link gets your circuit in their sandbox, in any browser. In the Android app they can paste it under <b>My circuits</b> instead. The whole circuit is written into the link itself; nothing is uploaded anywhere.</p>
      <input class="share" type="text" readonly value="${esc(text)}">
      <p style="font-size:13.5px;color:var(--muted)">${text.length} characters.${text.length > 2000 ? ' Some chat apps cut long messages short — for a circuit this big, “Save to file” is the safer way.' : ''}</p></div>
    <div class="dlg-f"><span></span><div class="row"><button class="btn" data-act="close">Close</button>${canSend ? '<button class="btn" data-act="send">Send…</button>' : ''}<button class="btn primary" data-act="copy">Copy</button></div></div></div>`,
  act => {
    const i = $('#modal .share');
    if (act === 'send') { if (!nat('share', 'A PneuLab circuit:\n' + i.value)) { try { navigator.share({title: 'PneuLab circuit', text: i.value}).catch(() => { /* cancelled */ }); } catch (e) { /* not available */ } } return; }
    if (act !== 'copy') return;
    const ok = () => toast('Copied.', 'good'), old = () => { i.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Select the text and copy it by hand.'); } };
    i.select();
    if (nat('copy', i.value)) ok(); else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(i.value).then(ok, old); else old();
  });
}
/* Open a circuit from a link, a code, or any text that contains one. */
function openCode(text) {
  const m = /[#?&\/]c[=\/]([\w-]{8,})/.exec(String(text)) || /^\s*([\w-]{8,})\s*$/.exec(String(text));
  let c = null;
  try { c = m && cleanCircuit(unpackCircuit(m[1])); } catch (e) { c = null; }
  if (!c) { toast(m ? 'That code does not contain a readable circuit.' : 'There is no circuit in that text.', 'bad'); return false; }
  if (S.mode !== 'sandbox') startSandbox();
  closeModal();
  loadCircuit(c, 'Circuit opened. Undo brings your own sheet back.');
  return true;
}
function openFromHash() {
  if (!/^#c=[\w-]+$/.test(location.hash)) return;
  openCode(location.hash);
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* file:// may refuse */ }
}
EP.openCode = openCode;
EP.packCircuit = packCircuit;
EP.loadCircuit = loadCircuit;
function runTests() {
  const L = S.lesson; if (!L || !L.tests) return;
  S.res = EP.evalLesson(S.circ, L, huntFaults()); renderCoach();
  const box = $('#coach-main .res'); if (box) box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  if (L.kind === 'hunt') return;                       // the self-test only shows which function has failed
  if (S.res.pass) { S.solved = true; setTimeout(complete, 700); } else { S.fails++; Snd.bad(); renderCoach(); }
}

function accuse() {
  const f = S.lesson.hunt.fault, s = S.sel;
  if (!s) { toast('Click the part or the line you suspect first, then accuse it.'); return; }
  if ((s.wire || s.id) === f.id) { completeHunt(true); return; }
  S.fails++; Snd.bad(); toast('Not that one — it is doing its job. Measure again.', 'bad'); renderCoach();
}
function completeHunt(found) {
  const L = S.lesson, f = L.hunt.fault, d = S.hunt;
  if (!S.solved) { if (found) d.solved++; d.streak = found && !S.fails ? d.streak + 1 : 0; d.best = Math.max(d.best, d.streak); store.set('hunt', d); }
  S.solved = true;
  S.sel = f.kind === 'open' || f.kind === 'blocked' ? {wire: f.id} : {id: f.id}; drawAll(); renderInsp();
  if (found) Snd.win(); if (d.streak >= 3) award('sleuth');
  openModal(`<div class="dlg"><div class="dlg-h"><div class="kick">${esc(L.hunt.name)}</div><h2>${found ? 'Fault found' : 'Here is the fault'}</h2></div>
    <div class="dlg-b"><div class="stars-big">${found && !S.fails ? '<b>★</b>' : '★'}</div>
      <p style="text-align:center;color:var(--muted);margin-top:0">Faults found: <b>${d.solved}</b> · clean streak: <b>${d.streak}</b> · best: <b>${d.best}</b></p>
      <ul class="learned"><li>${L.hunt.why}</li><li>${L.hunt.tip}</li></ul>
      <p style="color:var(--muted);font-size:14px">The faulty part is now selected on the sheet, so you can look at its readings again.</p></div>
    <div class="dlg-f"><button class="btn" data-act="stay">Look at it</button><div class="row"><button class="btn" data-act="home">Lesson map</button>
      <button class="btn primary" data-act="nx">Another machine</button></div></div></div>`,
  a => { if (a === 'stay') closeModal(); else if (a === 'home') showHome(); else if (a === 'nx') startHunt(); });
}
/* A clean picture of the sheet for printing or handing in: light paper, no editing marks. */
function exportSVG(quiet) {
  drawAll();
  const b = bounds(S.circ), p = 44;
  const css = 'svg{--ink:#1c2330;--muted:#69707d;--line:#d8d2c4;--sheet:#fff;--panel:#fff;--accent:#d9480f;--air:#0b93a8;--hot:#e03131;--warn:#e8890c;--tube:#9aa7b4;--metal:#b9c0c9;--lamp:#ffd43b}' +
    '.ink{stroke:var(--ink);stroke-width:1.6;fill:var(--sheet);stroke-linecap:round;stroke-linejoin:round}line.ink,polyline.ink,.nofill{fill:none}.thin{stroke-width:1}.thick{stroke-width:2.2}.dash{stroke-dasharray:3 2.5}.faint{stroke:var(--line)}' +
    '.blade{stroke-width:2.2}.blade.on{stroke:var(--hot)}.act,.mark{stroke:var(--accent)}.coil.hot{fill:var(--hot)}.coil.busy{fill:var(--warn)}.head{fill:var(--ink)}.ink.air{stroke:var(--air);stroke-width:2.2}.head.air{fill:var(--air)}' +
    '.airtri{fill:var(--air);stroke:var(--air)}.airfill{fill:var(--air);stroke:none}.piston{fill:var(--ink)}.rod{fill:var(--metal);stroke-width:1.2}.gface{fill:#fff}.needle{stroke:var(--hot)}.lampb{fill:#fff}.glow{fill:var(--lamp);opacity:.5}' +
    '.bar{stroke-width:3.2}.bar.v-hi{stroke:var(--hot)}.pill{fill:#fff;stroke:var(--ink);stroke-width:1.4}.pill.hot{fill:var(--hot);stroke:var(--hot)}.pill.hot+text{fill:#fff}' +
    'text{font-family:Consolas,Menlo,monospace;stroke:none}text.lbl{font-size:11px;font-weight:700;fill:var(--ink)}text.sm{font-size:9.5px}text.pin{font-size:7.5px;fill:var(--muted)}text.cnt{font-size:8.5px;font-weight:700;fill:var(--ink)}text.cnt.inv{fill:#fff}' +
    'text.zonet{font-size:10px;fill:var(--muted);letter-spacing:.14em;font-weight:700}text.brn{font-size:9px;fill:var(--muted);font-weight:700}.ctab line{stroke:var(--ink);stroke-width:1.2}.ctab text{font-size:8.5px;fill:var(--ink);font-weight:700}' +
    '.hit,.hitw,.port,.port-h,.flow,.puff,.trip{display:none}.jdot{fill:var(--ink)}.jdot.p{fill:var(--tube)}.wire .base{fill:none;stroke:var(--ink);stroke-width:1.6;stroke-linejoin:round}.wire.p .base{stroke:var(--tube);stroke-width:4;stroke-linecap:round}' +
    '.wire.v-hi .base{stroke:var(--hot);stroke-width:2}.wire.v-mid .base{stroke:var(--warn);stroke-width:2}.wire.pr .base{stroke:var(--air)}.wire.pr-lo .base{stroke:#5fb3c2}';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b[0] - p} ${b[1] - p} ${b[2] + 2 * p} ${b[3] + 2 * p}" width="${Math.round((b[2] + 2 * p) * 1.5)}" height="${Math.round((b[3] + 2 * p) * 1.5)}"><style>${css}</style>` +
    `<rect x="${b[0] - p}" y="${b[1] - p}" width="${b[2] + 2 * p}" height="${b[3] + 2 * p}" fill="#fff"/>` + $('#l-zones').innerHTML + $('#l-wires').innerHTML + $('#l-comps').innerHTML + '</svg>';
  if (!quiet) { saveFile('pneulab-circuit.svg', 'image/svg+xml', svg); toast('Picture saved as pneulab-circuit.svg — it opens in any browser and prints cleanly.', 'good'); }
  return svg;
}
function exportPicture() {
  if (!NAT && !coarse()) { exportSVG(); return; }
  // a phone has little use for an SVG file: draw the same picture into a PNG that any gallery or chat shows
  const svg = exportSVG(true), b = bounds(S.circ), W = Math.round((b[2] + 88) * 2), H = Math.round((b[3] + 88) * 2), img = new Image();
  const fail = () => toast('The picture could not be made.', 'bad');
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H);
    c.toBlob(bl => { if (!bl) return fail(); saveFile('pneulab-circuit.png', 'image/png', bl); if (!NAT) toast('Picture saved as pneulab-circuit.png.', 'good'); }, 'image/png');
  };
  img.onerror = fail;
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
EP.exportSVG = exportSVG;
function completeDrill(L) {
  const first = !S.fails, d = S.drill;
  d.solved++; d.streak = first ? d.streak + 1 : 0; d.best = Math.max(d.best, d.streak); store.set('drill', d);
  Snd.win(); if (d.streak >= 3) award('logic');
  openModal(`<div class="dlg"><div class="dlg-h"><div class="kick">Logic drill solved</div><h2>${first ? 'Right first time' : 'Got there'}</h2></div>
    <div class="dlg-b"><div class="stars-big">${first ? '<b>★</b>' : '★'}</div>
      <p style="text-align:center;color:var(--muted);margin-top:0">Drills solved: <b>${d.solved}</b> · first-try streak: <b>${d.streak}</b> · best: <b>${d.best}</b></p>
      <ul class="learned">${L.learned.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="dlg-f"><button class="btn" data-act="stay">Keep playing here</button><div class="row"><button class="btn" data-act="home">Lesson map</button>
      <button class="btn primary" data-act="nx">Another one</button></div></div></div>`,
  a => { if (a === 'stay') closeModal(); else if (a === 'home') showHome(); else if (a === 'nx') startDrill(); });
}
function complete() {
  const L = S.lesson; if (!L) return;
  if (L.drill != null) return completeDrill(L);
  const stars = S.shown ? 1 : Math.max(1, 3 - (S.hints ? 1 : 0) - (S.fails ? 1 : 0));
  S.prog[L.id] = Math.max(S.prog[L.id] || 0, stars); store.set('prog', S.prog);
  Snd.win(); Hap.buzz([20, 60, 20, 60, 45]);
  if (EP.lessons.filter(l => l.id.startsWith('fix')).every(l => S.prog[l.id])) award('tech');
  if (EP.lessons.filter(l => S.prog[l.id] === 3).length >= 12) award('stars');
  if (EP.lessons.every(l => S.prog[l.id])) award('grad');
  const idx = EP.lessons.indexOf(L), nx = EP.lessons[idx + 1];
  const cols = ['var(--accent)', 'var(--air)', 'var(--warn)', 'var(--ok)', 'var(--hot)'];
  let conf = ''; for (let i = 0; i < 36; i++) conf += `<i style="left:${Math.random() * 100}%;background:${cols[i % 5]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;transform:rotate(${Math.random() * 90}deg)"></i>`;
  const quiz = (L.quiz || []).map((q, qi) => `<div class="quiz" data-q="${qi}"><h4>${esc(q.q)}</h4><div class="opts">${q.o.map((o, oi) => `<button data-act="ans" data-q="${qi}" data-o="${oi}">${esc(o)}</button>`).join('')}</div><p class="why hidden">${esc(q.why)}</p></div>`).join('');
  openModal(`<div class="dlg"><div class="confetti">${conf}</div>
    <div class="dlg-h"><div class="kick">Lesson ${idx + 1} complete</div><h2>${esc(L.title)}</h2></div>
    <div class="dlg-b"><div class="stars-big">${'<b>★</b>'.repeat(stars)}${'★'.repeat(3 - stars)}</div>
      <p style="text-align:center;color:var(--muted);margin-top:0">${stars === 3 ? 'Flawless.' : S.shown ? 'Done with a peek at the solution — try it again from scratch for more stars.' : 'Solved. No hints and a first-time pass earn three stars.'}</p>
      <ul class="learned">${L.learned.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${quiz ? '<p style="margin-bottom:0"><b>Check yourself</b></p>' + quiz : ''}</div>
    <div class="dlg-f"><button class="btn" data-act="stay">Keep playing here</button><div class="row"><button class="btn" data-act="home">Lesson map</button>
      <button class="btn primary" data-act="nx">${nx ? 'Next lesson' : 'Finish'}</button></div></div></div>`,
  (a, b) => {
    if (a === 'ans') {
      const q = L.quiz[+b.dataset.q], box = b.closest('.quiz'), ok = +b.dataset.o === q.a;
      $$('button', box).forEach((x, i) => { x.disabled = true; if (i === q.a) x.classList.add('right'); });
      if (!ok) { b.classList.add('wrong'); Snd.bad(); } else Snd.tick();
      $('.why', box).classList.remove('hidden');
    } else if (a === 'stay') closeModal();
    else if (a === 'home') showHome();
    else if (a === 'nx') { if (nx) startLesson(nx.id); else showHome(); }
  });
}

/* ---------- final exam: ten questions drawn from the whole course, and a certificate for eight ---------- */
const PASS = 8, EXAM_N = 10;
let exam = null;
S.exam = store.get('exam', {best: 0, passed: false, name: ''});
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startExam() {
  const pool = [];
  for (const l of EP.lessons) for (const q of l.quiz || []) pool.push({q, from: l.title});
  exam = {i: 0, score: 0, miss: [], qs: shuffled(pool).slice(0, EXAM_N).map(p => {
    const order = shuffled(p.q.o.map((_, i) => i));               // answers in a fresh order, so position is no help
    return {q: p.q.q, o: order.map(i => p.q.o[i]), a: order.indexOf(p.q.a), why: p.q.why, from: p.from};
  })};
  examQ();
}
function examQ() {
  const q = exam.qs[exam.i], n = exam.qs.length;
  openModal(`<div class="dlg"><button class="dlg-x" data-act="close" title="Give up">×</button>
    <div class="dlg-h"><div class="kick">Final exam · question ${exam.i + 1} of ${n}</div><h2 class="exam-q">${esc(q.q)}</h2></div>
    <div class="dlg-b"><div class="quiz exam"><div class="opts">${q.o.map((o, oi) => `<button data-act="ans" data-o="${oi}">${esc(o)}</button>`).join('')}</div>
      <p class="why hidden">${esc(q.why)} <i>From the lesson “${esc(q.from)}”.</i></p></div></div>
    <div class="dlg-f"><div class="dots">${exam.qs.map((x, j) => `<i class="${j < exam.i ? (x.ok ? 'ok' : 'no') : j === exam.i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn primary" data-act="next" disabled>${exam.i === n - 1 ? 'See the result' : 'Next question'}</button></div></div>`,
  (act, b) => {
    if (act === 'ans') {
      const ok = +b.dataset.o === q.a; q.ok = ok;
      $$('#modal .opts button').forEach((x, i) => { x.disabled = true; if (i === q.a) x.classList.add('right'); });
      if (ok) { exam.score++; Snd.tick(); } else { b.classList.add('wrong'); exam.miss.push(q.from); Snd.bad(); }
      $('#modal .why').classList.remove('hidden'); $('#modal [data-act=next]').disabled = false;
    } else if (act === 'next') { exam.i++; if (exam.i < n) examQ(); else examResult(); }
  });
}
function examResult() {
  const n = exam.qs.length, sc = exam.score, pass = sc >= PASS, E = S.exam;
  E.best = Math.max(E.best, sc); if (pass) E.passed = true; store.set('exam', E);
  if (pass) { Snd.win(); award('cert'); }
  const done = EP.lessons.filter(l => S.prog[l.id]).length, date = new Date().toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'});
  const miss = [...new Set(exam.miss)];
  const body = pass ? `<p class="no-print" style="text-align:center;margin-top:0">${sc === n ? 'A perfect paper.' : 'Passed.'} Put your name on it:</p>
      <p class="no-print" style="text-align:center"><input class="share" data-cert="1" type="text" maxlength="40" placeholder="Your name" value="${esc(E.name)}" style="max-width:320px;text-align:center"></p>
      <div class="cert"><div class="cert-k">PneuLab · electro-pneumatics workshop</div><div class="cert-t">Certificate</div><p>This is to certify that</p>
        <div class="cert-name">${esc(E.name) || 'your name'}</div>
        <p>has passed the final examination in <b>electro-pneumatic control</b><br>with <b>${sc} out of ${n}</b> questions answered correctly.</p>
        <p class="cert-s">Logic circuits · relays and latching · timers and counters · safety circuits · sequences and the cascade method · fault finding</p>
        <div class="cert-f"><span>${esc(date)}</span><span>${done} of ${EP.lessons.length} lessons completed</span></div></div>`
    : `<p style="text-align:center;margin-top:0">You need ${PASS} to pass. ${miss.length ? 'These lessons are worth another look:' : ''}</p><ul class="learned">${miss.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
  document.body.classList.toggle('cert-open', pass);
  openModal(`<div class="dlg"><div class="dlg-h"><div class="kick">Final exam</div><h2>${sc} out of ${n}</h2></div>
    <div class="dlg-b"><div class="stars-big no-print">${pass ? '<b>★</b>' : '★'}</div>${body}</div>
    <div class="dlg-f"><button class="btn" data-act="again">${pass ? 'Sit it again' : 'Try again'}</button><div class="row">${pass ? '<button class="btn" data-act="print">Print certificate</button>' : ''}<button class="btn primary" data-act="done">Done</button></div></div></div>`,
  act => { if (act === 'again') startExam(); else if (act === 'print') { if (!nat('print')) window.print(); } else if (act === 'done') { if (S.mode === 'home') showHome(); else closeModal(); } });
}
$('#modal').addEventListener('input', e => {
  if (!e.target.dataset.cert) return;
  S.exam.name = e.target.value.trim().slice(0, 40); store.set('exam', S.exam);
  $('#modal .cert-name').textContent = S.exam.name || 'your name';
});

const BADGES = [
  ['fuse', 'Sparks fly', 'Cause a short circuit and trip the fuse.'],
  ['series', 'Voltage divider', 'Put two coils or lamps in series and catch one starving on too little voltage.'],
  ['both', 'Tug of war', 'Energise both solenoids of a double-solenoid valve at the same time.'],
  ['leak', 'Hisss', 'Let supply air blow out of an open port.'],
  ['stuck', 'Immovable', 'Tell a cylinder to move and stop it anyway, with a heavy load or a closed throttle.'],
  ['slow', 'Bullet time', 'Watch a relay switch at ⅒× speed.'],
  ['mass', 'Mass production', 'Let one cylinder complete 10 strokes in a single run.'],
  ['tinker', 'Tinkerer', 'Run a sandbox circuit with at least 12 parts and a moving cylinder.'],
  ['logic', 'Logician', 'Solve three logic drills in a row, each on the first test run.'],
  ['hold', 'Halfway there', 'Stop a piston between its end positions with a 5/3 valve and keep it there for 3 seconds.'],
  ['sort', 'Quality control', 'Let the belt run until ten parts in a row have been sorted right: metal pushed off, everything else left alone.'],
  ['cert', 'Certified', 'Pass the final exam with at least 8 out of 10.'],
  ['sleuth', 'Fault finder', 'Find three hidden faults in a row without a single wrong accusation.'],
  ['tech', 'Technician', 'Fix all four machines in the repair shop.'],
  ['stars', 'Perfectionist', 'Earn three stars on 12 lessons.'],
  ['grad', 'Graduate', 'Complete every lesson.']
];

/* ---------- handbook ---------- */
const LAWS = [
  ['Current needs a closed loop', 'Electricity only flows around a complete path from +24 V, through a load, back to 0 V. Open the path anywhere and all current in it stops at once.'],
  ['No load, no limit', 'Coils and lamps limit the current. A path from +24 V to 0 V without a load is a short circuit: the current jumps to hundreds of amps and the supply trips its fuse.'],
  ['Series contacts = AND, parallel contacts = OR', 'One path through several contacts needs them all closed. Several paths side by side need only one.'],
  ['Loads in series share the voltage', 'Two coils in one path each get only part of the 24 V — usually too little to pull in. Give every coil its own branch between the rails.'],
  ['A relay contact follows its coil', 'Every contact labelled K1 switches when coil K1 pulls in, a few milliseconds later. Normally-open contacts close, normally-closed contacts open.'],
  ['Air flows from high pressure to low', 'And only if it has somewhere to go. A piston moves when one side is fed and the other side can exhaust. Trap the exhaust and the piston stops against a cushion of air.'],
  ['Force = pressure × area', 'At 6 bar a 32 mm piston pushes with about 480 N. On the rod side the rod covers part of the piston, so the pull is weaker (about 415 N). A load bigger than this simply does not move.'],
  ['Speed is set by flow', 'A piston moves as fast as air can leave the other side. Throttling the exhaust (meter-out) gives smooth, adjustable speed.'],
  ['Spring valves forget, double-solenoid valves remember', 'A single-solenoid valve returns as soon as its signal ends. A double-solenoid valve keeps its last position, and if both coils are energised the first one wins.'],
  ['Pilot valves need air to switch', 'The solenoid only opens a tiny pilot; compressed air does the real work of moving the spool. Without supply pressure at port 1 the valve cannot shift.'],
  ['Trapped air is a spring', 'Shut both ports of a cylinder and the piston stops, held between two cushions of air. But air can be squeezed: push on the rod and it gives. A closed-centre 5/3 valve parks a piston roughly where you want it. It does not lock it.'],
  ['Compressed air is not free', 'Every stroke fills a chamber to supply pressure and then throws that air away through the exhaust. Air per stroke = chamber volume × absolute pressure in bar. A 32 mm cylinder with a 200 mm stroke at 6 bar uses about 2 litres of free air for one stroke out and back. Throttling makes a piston slower, not cheaper; lower pressure, shorter strokes and no leaks make it cheaper.']
];
function handbook(tab) {
  tab = tab || 'laws';
  let b = '';
  if (tab === 'laws') b = LAWS.map((l, i) => `<div class="law"><div class="n">${i + 1}</div><div><h4>${l[0]}</h4><p>${l[1]}</p></div></div>`).join('');
  else if (tab === 'parts') b = Object.keys(D).map(t => `<div class="hb-part">${EP.symbolSVG(t)}<div><h4>${esc(D[t].name)}</h4><p>${D[t].desc}</p></div></div>`).join('');
  else if (tab === 'read') b = `<p><b>Letters tell you what a part is.</b></p><ul><li><b>S</b> — switches: pushbuttons and limit switches (S1, S2…)</li><li><b>B</b> — sensors: proximity sensors, reed switches and pressure switches (B1, B2…)</li><li><b>K</b> — relays (coil K1 and all its contacts K1)</li><li><b>Y</b> — solenoid coils of valves (Y1, Y2)</li><li><b>H</b> — indicator lamps</li><li><b>1A</b> — cylinder (actuator) of circuit 1, <b>1V</b> — its valve</li></ul>
    <p><b>Same label = same device.</b> A part is drawn wherever it does something: the solenoid Y1 appears as a coil in the electrical diagram and as an actuator on the valve. A limit switch appears as a contact in the electrical diagram and as a mark at the cylinder.</p>
    <p><b>Terminal numbers tell you the contact type.</b> 3–4 is normally open, 1–2 is normally closed. Relay coils are A1–A2.</p>
    <p><b>Timer coils carry an extra box.</b> Crossed = on-delay (pulls in late). Solid = off-delay (lets go late).</p>
    <p><b>Valve ports:</b> 1 = supply, 2 and 4 = working lines, 3 and 5 = exhaust. In “5/2”, 5 is the number of ports and 2 the number of positions.</p>
    <p><b>Valve squares:</b> each square is one switching position. The square touching the port lines is the active one. Arrows are flow paths; ⊤ is a blocked port. A 5/3 valve has three squares; springs at both ends hold the middle one over the ports at rest.</p>
    <p><b>Electrical diagrams are drawn de-energised</b>, between a +24 V rail on top and a 0 V rail at the bottom. Each vertical path is a numbered <b>branch</b>: the small numbers above the +24 V rail.</p>
    <p><b>The little table under a relay coil</b> lists where its contacts are. A number on the left is a branch holding a normally-open contact of that relay; a number on the right is a branch with a normally-closed one. The bench draws these for you as you build.</p>
    <p><b>Direct or indirect?</b> If the switches feed the solenoid coil themselves, it is direct control. If they feed a relay coil and a relay contact feeds the solenoid, it is indirect.</p>`;
  else if (tab === 'sens') {
    const kinds = [['Limit switch (roller)', null], ['Reed switch', 'reed'], ['Inductive', 'ind'], ['Capacitive', 'cap'], ['Optical, diffuse', 'opt']];
    b = `<p><b>What each kind notices.</b> A sensor is chosen by what it has to see.</p>
    <table class="tt"><thead><tr><th>sensor</th>${EP.MATS.map(m => `<th>${m[1].toLowerCase()}</th>`).join('')}<th>needs touching</th><th>wires</th></tr></thead><tbody>` +
      kinds.map(k => `<tr><td style="text-align:left">${k[0]}</td>${EP.MATS.map(m => !k[1] ? '<td class="b1">●</td>' : EP.SEES[k[1]].includes(m[0]) ? '<td class="b1">●</td>' : '<td class="b0">–</td>').join('')}<td>${k[1] ? 'no' : 'yes'}</td><td>${!k[1] || k[1] === 'reed' ? 2 : 3}</td></tr>`).join('') + `</tbody></table>
    <p><b>Three wires, always the same colours.</b> A proximity sensor has electronics inside, and they need power whether a target is there or not. <b>Brown</b> goes to +24 V and <b>blue</b> to 0 V. <b>Black</b> is the output. With brown or blue missing, the sensor is blind.</p>
    <p><b>PNP and NPN.</b> The sensors on this bench are <b>PNP</b>: while they see a target they connect black to +24 V, so the load sits between black and 0 V. An <b>NPN</b> sensor connects black to 0 V instead, and its load sits between +24 V and black. European machines use PNP almost everywhere. A signal wire that rubs through and touches the machine frame, which is at 0 V, then cannot fake a signal.</p>
    <p><b>How much the output can carry.</b> About 200 mA. A solenoid coil or a relay is fine; anything bigger gets a relay in between. One output is also all there is: for a second contact, or a normally-closed one, let the sensor drive a relay.</p>
    <p><b>On a cylinder.</b> Type the label of any switch or sensor into an end-position field of a cylinder and it is mounted there. A reed switch is clamped on the barrel and feels the magnet in the piston through the wall. The others look at the end of the rod.</p>
    <p><b>Off the cylinder.</b> A sensor with no place on a cylinder watches the workpieces. With the power on, choose a material at the bottom and hold <b>Workpiece</b> (or the <kbd>W</kbd> key). <b>Belt</b> brings a new random part every four seconds.</p>
    <p><b>Which one for the job?</b></p>
    <ul><li>The position of a piston: a <b>reed switch</b>. Nothing sticks out and nothing wears.</li><li>A metal part is there: <b>inductive</b>. Cheap, tough, and indifferent to dirt and oil.</li>
    <li>Any part at all, or a level seen through a tank wall: <b>capacitive</b>.</li><li>From further away, or very small parts: <b>optical</b>. It needs a clean lens and a target that is not transparent.</li>
    <li>“I am pushing with full force”: a <b>pressure switch</b>.</li><li>Simple, cheap and able to switch a load by itself: a <b>limit switch</b>, where something strong enough is there to press it.</li></ul>`;
  }
  else b = `<p>When a circuit does not do what you expect, work through it like a technician:</p>
    <ol><li><b>Is the power on?</b> Rails live, air supply connected to port 1.</li><li><b>Follow the red.</b> Live wires glow red from the +24 V rail. The first place the red stops is where the path is open.</li>
    <li><b>Is the loop closed to 0 V?</b> A coil with red on top but no connection below does nothing.</li><li><b>Do the labels match?</b> Coil Y1 ↔ valve solenoid Y1. Contact K1 ↔ coil K1. Limit switch S3 ↔ cylinder mark S3.</li>
    <li><b>Click the part.</b> The panel on the right shows its real voltage, current, pressure and force while the bench is live.</li><li><b>Slow it down.</b> Use ¼× or ⅒× speed to watch relays, valves and pistons act in sequence.</li>
    <li><b>Read the signal recorder.</b> It draws every switch, relay, solenoid and piston over the last 8 seconds, so you can see what came first and what never came at all.</li>
    <li><b>Fuse tripped?</b> Some path reaches 0 V without passing through a coil or lamp. Click the supply to reset it once you have found the path.</li>
    <li><b>Both solenoids on?</b> A double-solenoid valve will not move until one of them lets go.</li><li><b>Piston will not move?</b> Check that the other side can exhaust, that the flow control is not fully closed, and that the load is not bigger than pressure × area.</li></ol>`;
  if (tab === 'keys') b = `<p><b>On the sheet</b></p><ul><li><kbd>1</kbd>…<kbd>9</kbd>, <kbd>0</kbd> — press S1…S9, S0 while the power is on. Hold several keys for several buttons.</li>
    <li><b>Shift</b>+click a button — lock it down. Click again to release.</li><li><kbd>P</kbd> — power on and off.</li>
    <li><kbd>.</kbd> — pause, and step time forward 20 ms per press. The <b>❚❚</b> button pauses too. A relay needs 12 ms to pull in and a valve 20 ms to shift, so this is how you catch a race.</li>
    <li>Drag from terminal to terminal — connect. Click a wire or part, then <kbd>Delete</kbd> — remove it.</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> — undo and redo. <kbd>Ctrl</kbd>+<kbd>D</kbd> — duplicate the selected part.</li>
    <li>Mouse wheel — zoom. Drag the empty sheet — move it. <kbd>?</kbd> — this page.</li></ul>
    <p><b>On a touch screen</b></p>
    <ul><li>Tap a part in the bin to put it on the sheet, or pull it out of the bin and drop it where you want it. Swipe along the bin to see the rest.</li>
    <li>Drag from one terminal to another to connect them. The ring shows which terminal the wire will take.</li>
    <li>One finger on the empty sheet moves it. Two fingers zoom and move it together.</li>
    <li>Tap a part to select it. The strip along the bottom edge then opens its settings, and <b>Delete</b> in the toolbar removes it.</li>
    <li>With the power on, press the round buttons at the bottom, or the parts on the sheet. Use two fingers for two buttons. <b>Lock</b> makes a tap leave a button pressed.</li>
    <li><b>⋯</b> in the top bar holds the speed, sound, vibration and appearance. When time is paused, a small bar steps it forward 20 ms or 100 ms at a time.</li>
    <li>In the 3D bench: one finger looks around, two fingers zoom and slide, a tap presses or selects, a double tap flies to a part.</li></ul>
    <p><b>The 3D bench</b> (the <b>3D</b> button in the top bar)</p>
    <p>It opens a second window showing the sheet as a training-lab bench on a slotted plate. Put the two windows side by side. Build and operate in either one; they always show the same machine. On a phone the bench takes over the screen instead, and <b>Back to the sheet</b> returns.</p>
    <p><b>Bench layout</b> (the default) sorts the electrical side into the units a pneumatics lab really has: a power supply with red +24 V and blue 0 V sockets, a signal input unit with two pushbuttons and a latching one, a three-fold relay unit, a two-fold time relay, a preset counter and an indicator unit. Every contact on your sheet is a pair of 4 mm sockets with its terminal numbers printed beside it, and every wire is a lab lead with stackable plugs: <b>red</b> on the +24 V side, <b>blue</b> on the 0 V side, <b>black</b> for signals in between. Limit switches sit at the cylinder and solenoid sockets on the valve, so leads run to them just as on a real bench. Switch <b>Bench</b> off to get the <b>sheet layout</b> instead, where every symbol stands exactly where you drew it.</p>
    <p><b>Equipment</b> lists what you would have to fetch from the cupboard to build the circuit for real: units, leads by colour, and pieces of tubing.</p>
    <ul><li>Drag — look around. Right-drag or <b>Shift</b>+drag — slide the view. Wheel — zoom. <b>Top</b> looks straight down, which is the circuit sheet again.</li>
    <li>Click a pushbutton, selector, E-stop or a valve's orange override to operate it. The number keys work there too.</li>
    <li>Click any part to select it in both windows and read its live values.</li>
    <li><b>X-ray</b> makes valve bodies glass so you can watch the spool. Cylinders are always glass: the blue haze on each side of the piston is air, and it gets stronger with pressure.</li>
    <li>In the sheet layout, <b>Links</b> are thin cables joining the two halves of one device — coil plug and valve, contact and limit switch. On the bench they are not needed: the two halves are one unit.</li>
    <li>A lead that glows is live. The printed contact symbol between two sockets turns orange and closes when that contact conducts. Bright tubes are under pressure. Moving beads show which way current and air are flowing.</li>
    <li>Double-click a part to fly the camera to it.</li></ul>`;
  const tabs = [['laws', 'The twelve laws'], ['parts', 'Parts and symbols'], ['read', 'Reading diagrams'], ['sens', 'Sensors'], ['fix', 'Fault finding'], ['keys', 'Keys, touch and 3D']];
  openModal(`<div class="dlg wide"><button class="dlg-x" data-act="close">×</button><div class="dlg-h"><div class="kick">Handbook</div><h2>${tabs.find(t => t[0] === tab)[1]}</h2></div>
    <div class="tabs">${tabs.map(t => `<button data-act="tab" data-t="${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
    <div class="dlg-b">${b}</div></div>`, (a, el) => { if (a === 'tab') handbook(el.dataset.t); });
}

/* ---------- my circuits: sheets kept under a name on this device ---------- */
function libAll() { const a = store.get('lib', []); return Array.isArray(a) ? a.filter(x => x && typeof x.name === 'string' && x.circ && Array.isArray(x.circ.comps)) : []; }
function library() {
  const items = libAll(), can = S.mode !== 'home' && S.circ.comps.length > 0;
  const day = t => { try { return new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}); } catch (e) { return ''; } };
  const sug = S.mode === 'home' || S.mode === 'sandbox' ? '' : $('#w-title').textContent.slice(0, 30);
  openModal(`<div class="dlg wide"><button class="dlg-x" data-act="close">×</button><div class="dlg-h"><div class="kick">On this device</div><h2>My circuits</h2></div>
    <div class="dlg-b">
      ${can ? `<div class="lib-new"><input class="share" id="lib-name" type="text" maxlength="30" placeholder="A name for the sheet on the bench" value="${esc(sug)}"><button class="btn primary" data-act="keep">Save</button></div>` : ''}
      <div class="lib-list">${items.length ? items.map((it, i) => `<div class="lib-it"><svg class="lib-th" data-i="${i}"><g class="lw"></g><g class="lc"></g></svg><div class="lib-m"><b>${esc(it.name)}</b><span>${it.circ.comps.length} parts · ${day(it.t)}</span>
        <div class="row"><button class="btn primary" data-act="open" data-i="${i}">Open</button><button class="btn ghost" data-act="send" data-i="${i}">Share</button><button class="btn ghost" data-act="drop" data-i="${i}">Delete</button></div></div></div>`).join('')
        : `<p class="lib-empty">Nothing saved yet. ${can ? 'Give the sheet on the bench a name above and it is kept here.' : 'Build something in the sandbox or in a lesson, then come back here to keep it under a name.'}</p>`}</div>
      <div class="box"><h4>Open a circuit someone sent you</h4><div class="lib-new"><input class="share" id="lib-code" type="text" placeholder="Paste the link or the code" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn" data-act="paste">Open</button></div></div>
    </div></div>`, (act, b) => {
    const it = b.dataset.i != null ? items[+b.dataset.i] : null;
    if (act === 'keep') {
      const name = ($('#lib-name').value.trim() || 'Sheet ' + (items.length + 1)).slice(0, 30);
      store.set('lib', [{name, t: Date.now(), circ: JSON.parse(JSON.stringify(S.circ))}].concat(items.filter(x => x.name !== name)).slice(0, 40));
      toast('Saved as “' + esc(name) + '”.', 'good'); library();
    } else if (act === 'open' && it) {
      let c; try { c = cleanCircuit(it.circ); } catch (e) { toast('That sheet is damaged and cannot be opened.', 'bad'); return; }
      if (S.mode !== 'sandbox') startSandbox();
      closeModal(); loadCircuit(c, 'Opened “' + esc(it.name) + '”. Undo brings the previous sheet back.');
    } else if (act === 'send' && it) { try { shareCircuit(cleanCircuit(it.circ)); } catch (e) { toast('That sheet is damaged and cannot be shared.', 'bad'); } }
    else if (act === 'drop' && it) { b.dataset.act = 'drop2'; b.textContent = 'Tap again to delete'; b.classList.add('danger'); }
    else if (act === 'drop2' && it) { store.set('lib', items.filter(x => x !== it)); library(); }
    else if (act === 'paste') openCode($('#lib-code').value);
  });
  $$('#modal .lib-th').forEach(svg => {                 // a small drawing of each saved sheet
    try {
      const c = cleanCircuit(items[+svg.dataset.i].circ), b = bounds(c);
      svg.setAttribute('viewBox', `${b[0] - 10} ${b[1] - 10} ${b[2] + 20} ${b[3] + 20}`);
      new Painter(svg.querySelector('.lw'), svg.querySelector('.lc')).build(c, null);
    } catch (e) { /* a damaged entry simply has no picture */ }
  });
}

/* ---------- settings ---------- */
const VERSION = '1.0';
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });      // the browser offers to install the page as an app
function setSound(on) { Snd.on = on; store.set('snd', on); $('#btn-snd').innerHTML = ICON.snd(on); if (on) Snd.tick(); }
function applyTheme(t) { setTheme(t); store.set('theme', t); Scope.colors(); natTheme(); }
function natTheme() {                                   // the bars the system draws around the page take the colour of the page
  const dark = v3theme() === 'dark', col = getComputedStyle(document.documentElement).getPropertyValue(S.mode === 'home' ? '--bg' : '--panel').trim();
  const m = $('meta[name=theme-color]'); if (m && col) m.content = col;
  nat('theme', dark, col);
}
function settings() {
  const th = store.get('theme', null) || 'auto', inWork = S.mode !== 'home';
  const done = EP.lessons.filter(l => S.prog[l.id]).length, stars = EP.lessons.reduce((a, l) => a + (S.prog[l.id] || 0), 0), bd = BADGES.filter(b => S.badges[b[0]]).length;
  const sw = (act, on, label, sub) => `<button class="set-row" data-act="${act}" role="switch" aria-checked="${on}"><span><b>${label}</b><i>${sub}</i></span><em class="sw${on ? ' on' : ''}"></em></button>`;
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(o => `<button data-act="${act}" data-v="${o[0]}" class="${String(cur) === String(o[0]) ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
  openModal(`<div class="dlg"><button class="dlg-x" data-act="close">×</button><div class="dlg-h"><div class="kick">PneuLab ${VERSION}</div><h2>Settings</h2></div>
    <div class="dlg-b sets">
      ${inWork ? `<div class="set-row"><span><b>Simulation speed</b><i>Pause freezes time. A small bar then steps it forward 20 ms at a time.</i></span>${seg('speed', S.speed, [[0, '&#10074;&#10074;'], [0.1, '&#8530;&times;'], [0.25, '&frac14;&times;'], [1, '1&times;']])}</div>` : ''}
      ${sw('snd', Snd.on, 'Sound', 'Relay clicks, valve hiss, pistons reaching their end stops')}
      ${Hap.can ? sw('hap', Hap.on, 'Vibration', 'A short buzz for a button press, an end stop and a blown fuse') : ''}
      <div class="set-row"><span><b>Appearance</b><i>Auto follows this device</i></span>${seg('theme', th, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="row" style="margin:14px 0 4px"><button class="btn" data-act="book">Handbook</button><button class="btn" data-act="lib">My circuits</button>${installEvt ? '<button class="btn primary" data-act="install">Install as an app</button>' : ''}</div>
      <div class="box"><h4>Progress on this device</h4><p>${done} of ${EP.lessons.length} lessons · ${stars} ★ · ${bd} of ${BADGES.length} badges · ${libAll().length} saved circuits</p>
        <div class="row"><button class="btn ghost" data-act="reset">Reset lessons, stars and badges</button></div></div>
      <p class="about">PneuLab works without a connection. Everything you build and every score stays on this device; nothing is uploaded. The same workshop runs in any browser at ${NAT ? SITE.replace('https://', '') : `<a href="${SITE}">${SITE.replace('https://', '')}</a>`}</p>
    </div></div>`, (act, b) => {
    if (act === 'speed') { setSpeed(+b.dataset.v); settings(); }
    else if (act === 'snd') { setSound(!Snd.on); settings(); }
    else if (act === 'hap') { Hap.on = !Hap.on; store.set('hap', Hap.on); Hap.buzz(25); settings(); }
    else if (act === 'theme') { applyTheme(b.dataset.v === 'auto' ? null : b.dataset.v); settings(); }
    else if (act === 'book') handbook();
    else if (act === 'lib') library();
    else if (act === 'install' && installEvt) { const ev = installEvt; installEvt = null; closeModal(); try { ev.prompt(); } catch (e) { /* the offer has lapsed */ } }
    else if (act === 'reset') { b.dataset.act = 'reset2'; b.textContent = 'Tap again to erase all progress'; b.classList.add('danger'); }
    else if (act === 'reset2') {
      S.prog = {}; S.badges = {}; S.drill = {solved: 0, streak: 0, best: 0}; S.hunt = {solved: 0, streak: 0, best: 0}; S.exam = {best: 0, passed: false, name: S.exam.name};
      for (const k of ['prog', 'badges', 'drill', 'hunt', 'exam']) store.set(k, S[k]);
      if (S.mode === 'home') showHome(); else settings();
      toast('Progress erased. Your saved circuits are still there.');
    }
  });
}

/* ---------- top bar ---------- */
const ICON = {
  snd: on => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h2.5L8 3v10L4.5 10H2z"/>${on ? '<path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"/>' : '<path d="M11 6l4 4M15 6l-4 4"/>'}</svg>`,
  theme: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor"/></svg>`
};
function setTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#btn-home').addEventListener('click', showHome);
$('#btn-power').addEventListener('click', () => setPower(!S.sim));
$('#btn-book').addEventListener('click', () => handbook());
$('#btn-more').addEventListener('click', settings);
$('#btn-snd').addEventListener('click', () => setSound(!Snd.on));
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { Scope.colors(); natTheme(); });
$('#speed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
$('#btn-snd').innerHTML = ICON.snd(Snd.on); $('#btn-theme').innerHTML = ICON.theme;
setTheme(store.get('theme', null));

/* ---------- signal recorder: a strip chart of every signal, like a state diagram that draws itself ---------- */
const Scope = {
  show: store.get('scope', true), rows: [], t: [], last: -1, WIN: 8, col: {},
  reset() {
    this.rows = []; this.t = []; this.last = -1; this.nlog = -1; $('#seqlog').innerHTML = ''; $('#airuse').innerHTML = ''; $('#airuse')._h = '';
    const sim = S.sim, el = $('#scope');
    if (sim) {
      const seen = new Set(), add = (name, kind, get) => { if (!name || seen.has(name) || this.rows.length >= 16) return; seen.add(name); this.rows.push({name, kind, get, d: []}); };
      const cs = [...S.circ.comps].sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
      const sw = c => isPush(c.type) || isDet(c.type);
      for (const c of cs) if (sw(c)) add(c.label, 'in', () => S.circ.comps.some(x => x.label === c.label && sw(x) && (isSens(x.type) ? sim.st[x.id].on : isLs(x.type) ? sim.st[x.id].act : sim.st[x.id].pressed)));
      for (const c of cs) if (c.type === 'psw') add(c.label, 'in', () => sim.pswOn(c.label));
      for (const c of cs) if (isCoil(c.type) || c.type === 'counter') add(c.label, 'k', () => sim.relayOn(c.label));
      for (const c of cs) if (c.type === 'sol') add(c.label, 'y', () => sim.solOn(c.label));
      for (const c of cs) if (c.type === 'lamp') add(c.label, 'y', () => sim.st[c.id].v >= 12);
      for (const c of cs) if (isCyl(c.type)) add(c.label, 'pos', () => sim.st[c.id].x / c.props.stroke);
    }
    el.classList.toggle('hidden', !sim || !this.rows.length);
    el.classList.toggle('shut', !this.show);
    $('#scope-tg').textContent = this.show ? 'hide' : 'show';
    this.colors();
  },
  colors() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    this.col = {in: v('--accent'), k: v('--warn'), y: v('--hot'), pos: v('--air'), muted: v('--muted'), line: v('--line')};
  },
  sample(sim) {
    if (sim.t - this.last < 0.02) return;
    this.last = sim.t; this.t.push(sim.t);
    for (const r of this.rows) r.d.push(+r.get());
    while (this.t.length && this.t[0] < sim.t - this.WIN - 0.3) { this.t.shift(); for (const r of this.rows) r.d.shift(); }
  },
  draw(sim) {
    const cv = $('#scope canvas'), W = cv.clientWidth, RH = 17, LW = 36, H = this.rows.length * RH + 16, dpr = window.devicePixelRatio || 1;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
    const g = cv.getContext('2d'), t1 = sim.t, t0 = t1 - this.WIN, X = t => LW + (t - t0) / this.WIN * (W - LW - 2), T = this.t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.strokeStyle = this.col.line; g.lineWidth = 1; g.beginPath();
    for (let sec = Math.ceil(t0); sec <= t1; sec++) { if (sec < 0) continue; const x = Math.round(X(sec)) + 0.5; g.moveTo(x, 0); g.lineTo(x, H - 14); }
    g.stroke();
    g.font = '600 10px ui-monospace, Consolas, monospace'; g.textBaseline = 'alphabetic';
    this.rows.forEach((r, i) => {
      const y = i * RH, hi = y + 4, lo = y + RH - 3;
      g.fillStyle = this.col.muted; g.fillText(r.name, 2, lo);
      g.strokeStyle = this.col[r.kind]; g.lineWidth = r.kind === 'pos' ? 1.8 : 1.5; g.beginPath();
      let py = null;
      for (let j = 0; j < T.length; j++) {
        const x = X(T[j]); if (x < LW) continue;
        const yy = lo - r.d[j] * (lo - hi);
        if (py == null) g.moveTo(x, yy); else { if (r.kind !== 'pos') g.lineTo(x, py); g.lineTo(x, yy); }
        py = yy;
      }
      g.stroke();
    });
    g.fillStyle = this.col.muted; g.textAlign = 'right'; g.fillText('one line = 1 s · last ' + this.WIN + ' s', W - 2, H - 3); g.textAlign = 'left';
  }
};
$('#scope-tg').addEventListener('click', () => { Scope.show = !Scope.show; store.set('scope', Scope.show); $('#scope').classList.toggle('shut', !Scope.show); $('#scope-tg').textContent = Scope.show ? 'hide' : 'show'; });

/* what the machine costs to run: air drawn from the supply, as litres of free (atmospheric) air */
function airUse(sim) {
  const el = $('#airuse'), l = sim.airKg / 1.185 * 1000, cyc = Math.max(0, ...sim.cyls.map(c => sim.st[c.id].cycles));
  const cy = S.cyc || (S.cyc = {n: 0, t: 0, dt: 0});      // how long one cycle takes: the time between two completed strokes
  if (cyc > cy.n) { if (cy.n > 0) cy.dt = (sim.t - cy.t) / (cyc - cy.n); cy.n = cyc; cy.t = sim.t; }
  const h = l < 0.05 ? '' : `<span>Air used</span><b>${l.toFixed(1)} l</b>` + (cyc ? `<span>·</span><b>${(l / cyc).toFixed(1)} l</b><span>per cycle</span>` : '') + `<span>· now</span><b>${(Math.max(0, sim.airRate) / 1.185 * 60000).toFixed(0)} l/min</b>` +
    (cy.dt > 0 ? `<span>· cycle time</span><b>${cy.dt.toFixed(1)} s</b><span>=</span><b>${(60 / cy.dt).toFixed(0)}</b><span>per minute</span>` : '');
  if (el._h !== h) { el.innerHTML = h; el._h = h; }
}

/* ---------- badges: small discoveries worth making on purpose ---------- */
function award(id) {
  if (S.badges[id]) return;
  const b = BADGES.find(x => x[0] === id); if (!b) return;
  S.badges[id] = 1; store.set('badges', S.badges);
  toast(`<b>★ Badge earned — ${b[1]}</b><br>${b[2]}`, 'good'); Snd.win();
}
function checkBadges(sim) {
  const hold = (key, cond, sec) => { if (!cond) { delete S.bt[key]; return false; } if (S.bt[key] == null) S.bt[key] = sim.t; return sim.t - S.bt[key] >= sec; };
  let starving = false, both = false; const has53 = S.circ.comps.some(c => c.type === 'v53');
  for (const c of S.circ.comps) {
    const st = sim.st[c.id];
    if (D[c.type].load && st.v > 3 && st.v < 17) starving = true;
    if (c.type === 'v52d' && sim.solOn(c.props.y1) && sim.solOn(c.props.y2)) both = true;
    if (isCyl(c.type)) {
      const L = c.props.stroke;
      const parked = st.x > L * 0.03 && st.x < L * 0.97 && Math.abs(st.v) < 1e-3;
      if (!has53 && hold('stuck' + c.id, parked, 1.5)) award('stuck');
      if (has53 && hold('hold' + c.id, parked, 3)) award('hold');
      if (st.cycles >= 10) award('mass');
      if (S.mode === 'sandbox' && S.circ.comps.length >= 12 && st.cycles >= 1) award('tinker');
    }
  }
  if (hold('series', starving, 0.3)) award('series');
  if (hold('both', both, 0.2)) award('both');
}

/* ---------- the 3D bench: a second window that shows this sheet as hardware ----------
   It has no simulation of its own. This window sends it the circuit and, every frame, the state
   of every part; it sends back button presses. Messages are the only link, so it also works from file://. */
const V3 = {win: null, sent: null, t: 0, dock: null};
const v3alive = () => !!V3.win && !V3.win.closed;
const v3post = m => { try { V3.win.postMessage(m, '*'); } catch (e) { /* window gone */ } };
const v3theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function v3close() { if (V3.dock) { V3.dock.remove(); V3.dock = null; V3.win = null; } }
function v3open() {
  if (V3.dock) { v3close(); return; }
  if (v3alive()) { V3.win.focus(); return; }
  const inPage = !!NAT || small() || coarse();    // a phone or the app has no second window to give: the bench opens inside this page
  let w = null; if (!inPage) try { w = window.open('view3d.html', 'pneulab3d', 'popup,width=1180,height=780'); } catch (e) { /* blocked */ }
  if (!w) {                                       // no second window: dock the bench inside this page instead
    const d = V3.dock = document.createElement('div'); d.id = 'v3dock';
    d.innerHTML = `<div class="v3bar"><b>3D bench</b><span>${!inPage ? 'pop-ups are blocked, so it is docked here' : window.innerHeight > window.innerWidth ? 'turn the device sideways for a wider view' : 'the same machine as on the sheet'}</span><button class="btn" title="Close the 3D bench">${inPage ? 'Back to the sheet' : 'Close'}</button></div><iframe src="view3d.html" title="3D bench"></iframe>`;
    document.body.appendChild(d); d.querySelector('button').addEventListener('click', v3close);
    w = d.querySelector('iframe').contentWindow;
  }
  V3.win = w; V3.sent = null;
}
function v3sync() {
  const idle = S.mode === 'home', title = idle ? '' : $('#w-title').textContent;
  const j = idle ? '' : JSON.stringify(S.circ) + '|' + title + '|' + v3theme() + '|' + !!S.sim;
  if (j !== V3.sent) {
    V3.sent = j; v3post({t: 'circ', circ: idle ? null : S.circ, title, theme: v3theme(), on: !!S.sim});
    if (!S.sim) v3post({t: 'state', on: false});
  }
  const c = !idle && S.sel && S.sel.id ? comp(S.sel.id) : null;
  v3post({t: 'sel', sel: c ? c.id : null});
  v3post({t: 'insp', name: c ? (c.label ? c.label + ' · ' : '') + D[c.type].name : '', rows: c && S.sim ? $$('#live > div').map(d => [d.firstChild.textContent, d.lastChild.textContent]) : []});
}
function v3state(sim) {
  const c = {}, w = {};
  for (const x of S.circ.comps) {
    const st = sim.st[x.id], d = D[x.type], t = x.type;
    if (isCyl(t)) c[x.id] = {f: st.x / x.props.stroke, a: (st.pA - P_ATM) / 1e5, b: (st.pB - P_ATM) / 1e5};
    else if (isValve(t)) c[x.id] = {pos: st.pos, a: sim.solOn(x.props.y1), b: sim.solOn(x.props.y2), mL: st.mL, mR: st.mR, e3: st.ex3, e5: st.ex5};
    else if (d.contact) c[x.id] = {c: sim.closed(x), a: !!(d.act === 'push' ? st.pressed : d.act === 'roller' ? st.act : d.act === 'pressure' ? sim.pswOn(x.label) : sim.relayOn(x.label))};
    else if (d.load) c[x.id] = {on: !!st.on, v: st.v || 0, tm: st.tm || 0, n: st.count || 0};
    else if (d.sensor) c[x.id] = {on: !!st.on, a: !!st.act, p: !st.mounted && !!(st.pressed || sim.present)};
    else if (t === 'psu') c[x.id] = {trip: st.tripped, I: st.I};
    else if (t === 'gauge' || t === 'psw') c[x.id] = {p: (st.p - P_ATM) / 1e5, on: st.on};
  }
  for (const x of S.circ.wires) w[x.id] = x.k === 'e' ? [Math.max(sim.nodeV(x.a.c, x.a.p), sim.nodeV(x.b.c, x.b.p)), sim.wI.get(x.id) || 0] : [(sim.portP(x.a.c, x.a.p) - P_ATM) / 1e5, sim.tubeQ.get(x.id) || 0];
  v3post({t: 'state', on: true, c, w, mat: sim.mat});
}
window.addEventListener('message', e => {
  const m = e.data; if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !e.source) return;
  if (e.source !== V3.win) {                      // a 3D window we opened before this page was reloaded may introduce itself again
    let ours = false; try { ours = m.t === 'hello' && e.source.opener === window; } catch (x) { /* not ours */ }
    if (!ours) return;
    V3.win = e.source;
  }
  if (m.t === 'hello') { V3.sent = null; v3sync(); if (S.sim) v3state(S.sim); return; }
  if (S.mode === 'home') return;
  if (m.t === 'power') setPower(!S.sim);
  else if (m.t === 'press' && typeof m.label === 'string') pressLabel(m.label, '3d', !!m.on);
  else if (m.t === 'valve') { const c = comp(m.id); if (c && isValve(c.type)) press(c, '3d', !!m.on, m.side === 'R' ? 'R' : 'L'); }
  else if (m.t === 'select') { const c = comp(m.id); if (c ? !S.sel || S.sel.id !== c.id : S.sel) select(c ? {id: c.id} : null); }
  else if (m.t === 'fuse' && S.sim) S.sim.resetFuse();
});
$('#btn-3d').addEventListener('click', v3open);

/* ---------- main loop ---------- */
let last = performance.now(), slow = 0;
function frame(ts) {
  const dt = Math.max(0, Math.min(0.05, (ts - last) / 1000)); last = ts;
  V3.t += dt; if (V3.t > 0.12) { V3.t = 0; if (v3alive()) v3sync(); }
  if (hero && S.mode === 'home') {
    hero.t += dt; hero.sim.advance(dt);
    if (!hero.started && hero.t > 1.2) { hero.sim.pressLabel('S1', true); hero.started = true; }
    else if (hero.started && hero.t > 1.5) hero.sim.pressLabel('S1', false);
    hero.sim.snapshot(); hero.sim.events.length = 0; hero.p.update(hero.circ, hero.sim);
    return;
  }
  const sim = S.sim;
  if (sim) {
    Belt.step(dt * S.speed, sim);
    sim.advance(dt * S.speed); sim.snapshot();
    if (v3alive()) v3state(sim);
    const seen = {};
    for (const ev of sim.events) {
      if (seen[ev.type]) continue; seen[ev.type] = 1;
      if (ev.type === 'relay') { Snd.click(); if (S.speed === 0.1) award('slow'); } else if (ev.type === 'valve') Snd.hiss(); else if (ev.type === 'thunk') { Snd.thunk(); Hap.buzz(14); } else if (ev.type === 'count') Snd.tick();
      else if (ev.type === 'trip') { Snd.pop(); Hap.buzz([30, 50, 70]); award('fuse'); toast('<b>Short circuit — the fuse tripped.</b> Somewhere +24 V reaches 0 V without passing through a coil or lamp. Switch the power off, find that path, then try again.', 'bad', 'trip'); }
    }
    sim.events.length = 0;
    for (const c of S.circ.comps) if ((isValve(c.type) || c.type === 'fcv') && sim.st[c.id].leak > 2e-4) { award('leak'); toast(`Air is blowing out of an open port on ${esc(c.label)}. Nothing is connected there.`, 'bad', 'leak' + c.id); }
    paint.update(S.circ, sim);
    Scope.sample(sim); if (Scope.show) Scope.draw(sim);
    if (sim.log.length !== Scope.nlog) {                                // the sequence so far, in + / − shorthand
      Scope.nlog = sim.log.length;
      $('#seqlog').innerHTML = sim.log.length ? '<span>Movements</span>' + sim.log.slice(-10).map(x => `<b>${esc(x).replace('-', '−')}</b>`).join('') : '';
    }
    $$('#opanel .op').forEach(b => {
      if (b.dataset.part) { b.classList.toggle('down', sim.present); b.classList.toggle('held', Part.has('hold')); return; }
      const cs = S.circ.comps.filter(c => c.label === b.dataset.label && (isPush(c.type) || isDet(c.type)));
      b.classList.toggle('down', cs.some(c => sim.st[c.id].pressed));
      b.classList.toggle('held', cs.some(c => S.src[c.id] && S.src[c.id].has('hold')));
    });
    renderScene();
  }
  slow += dt;
  if (slow > 0.12 && S.mode !== 'home') { slow = 0; checkSteps(); renderPeek(); if (sim) { liveInsp(); checkBadges(sim); airUse(sim); } }
}

EP.frame = frame;
/* The back button or back gesture closes whatever is open, innermost first. It returns false when nothing was left to close. */
EP.back = function () {
  if (!$('#modal').classList.contains('hidden')) { closeModal(); return true; }
  if (V3.dock) { v3close(); return true; }
  if (coachEl.classList.contains('open')) { closeSheet(); return true; }
  if (S.mode !== 'home') { showHome(); return true; }
  return false;
};
showHome();
openFromHash();
window.addEventListener('hashchange', openFromHash);
if (!NAT && (coarse() || matchMedia('(display-mode: standalone)').matches)) {
  try {                                                   // in a phone browser, Back should step out of a lesson before it leaves the page
    history.pushState({ep: 1}, '');
    window.addEventListener('popstate', () => { if (/^#c=/.test(location.hash)) return; if (EP.back()) history.pushState({ep: 1}, ''); else history.back(); });
  } catch (e) { /* no history to work with */ }
}
if (!NAT && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* no offline copy, the page still works */ }); });
}
function loop(ts) { requestAnimationFrame(loop); frame(ts); }
requestAnimationFrame(loop);
/* Browsers stop animation frames in a window that is covered or minimised. While the 3D bench is open,
   a worker keeps the clock ticking so the machine does not freeze when the 3D window is put on top. */
try {
  const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], {type: 'text/javascript'})));
  wk.onmessage = () => { if (document.hidden && S.sim && v3alive()) frame(performance.now()); };
} catch (e) { /* no worker: the bench simply pauses while this window is hidden */ }
})();

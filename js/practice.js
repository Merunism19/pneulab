/* Exam practice: a bank of written questions, generators that make endless fresh ones, a glossary and a flashcard deck.
   Everything here is plain data and pure functions, so the headless test bench can check every generated answer
   against the simulator. Question shape: {id?, topic, q, o: [options], a: index of the right one, why, fig?, circ?}.
   Text is plain (no markup); figures come separately as SVG (fig) or as a circuit to draw (circ). */
(function (G) {
'use strict';
const EP = G.EP, D = EP.defs;
const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* topics, and the chapters whose lessons teach them (for "worth another look") */
const TOPICS = [
  {id: 'air', name: 'Air and cylinders', ch: [0]},
  {id: 'valve', name: 'Valves and symbols', ch: [0, 2]},
  {id: 'elec', name: 'Electrical basics', ch: [0, 3]},
  {id: 'logic', name: 'Logic and truth tables', ch: [1]},
  {id: 'relay', name: 'Relays and latching', ch: [3, 4]},
  {id: 'time', name: 'Timers and counters', ch: [5, 11]},
  {id: 'sens', name: 'Sensors and switches', ch: [2, 9]},
  {id: 'seq', name: 'Sequences and cascades', ch: [7, 12]},
  {id: 'safe', name: 'Safety and operating modes', ch: [6]},
  {id: 'fault', name: 'Fault finding', ch: [8]},
  {id: 'calc', name: 'Calculations', ch: [0]}
];
const CH_TOPIC = ['air', 'logic', 'valve', 'relay', 'relay', 'time', 'safe', 'seq', 'fault', 'sens', 'relay', 'time', 'seq'];   // lesson chapter → topic

/* ---------- the written bank: [id, topic, question, [right answer, ...wrong answers], why] ---------- */
const BANK = [
  ['a1', 'air', 'The rod side of a double-acting cylinder pushes with less force than the cap side. Why?', ['The rod covers part of the piston area', 'Air leaks past the rod seal', 'The exhaust air brakes it'], 'Force = pressure × area. On the rod side the rod takes up part of the piston face, so less area is left for the air to push on.'],
  ['a2', 'air', 'What happens to the pressure behind a piston while it moves freely?', ['It stays below supply pressure', 'It equals supply pressure the whole time', 'It drops to zero'], 'The chamber keeps growing, so the air in it keeps expanding. Only when the piston stops does the chamber fill right up to supply pressure.'],
  ['a3', 'air', 'Why is the exhaust air throttled to set piston speed, rather than the supply air?', ['The piston then moves against a cushion of air and runs smoothly', 'It uses less air', 'The valve could not switch otherwise'], 'Meter-out control: the piston is held between full supply pressure and a cushion of throttled exhaust air, so its speed stays steady even when the load changes.'],
  ['a4', 'air', 'A single-acting cylinder returns by…', ['a built-in spring', 'air on the rod side', 'its own weight only'], 'Air extends it; a spring inside pushes it back once the air is let out.'],
  ['a5', 'air', 'What decides how fast a cylinder can extend?', ['How fast air can leave the other side', 'Only the supply pressure', 'The size of the solenoid coil'], 'Supply pressure gives the force, but the speed is limited by how fast the air in front of the piston can escape through valve and throttle.'],
  ['a6', 'air', 'A cylinder will not move although its valve has switched. Which is NOT a likely cause?', ['The lamp in the circuit is broken', 'The other side cannot exhaust', 'The load is bigger than pressure × area'], 'A piston needs supply on one side, a way out for the air on the other, and a load smaller than its force. A lamp elsewhere has nothing to do with it.'],
  ['v1', 'valve', 'Which port of a 5/2 valve is connected to the air supply?', ['1', '2', '4', '3 and 5'], '1 is supply, 2 and 4 are the working lines to the cylinder, 3 and 5 are exhausts.'],
  ['v2', 'valve', 'Ports 3 and 5 on a 5/2 valve are…', ['exhausts', 'working lines', 'pilot ports'], 'Odd numbers after 1 are exhausts: 3 and 5. Even numbers, 2 and 4, go to the cylinder.'],
  ['v3', 'valve', 'In “5/2 valve”, what does the 2 stand for?', ['Two switching positions', 'Two solenoids', 'Two working ports'], 'The first number counts the ports, the second the positions. Each position is one square in the symbol.'],
  ['v4', 'valve', 'A single-solenoid 5/2 valve with spring return loses its signal. It…', ['springs back to its rest position', 'stays where it is', 'moves to a middle position'], 'The spring holds it in the rest position whenever the solenoid is not energised. It has no memory.'],
  ['v5', 'valve', 'A double-solenoid 5/2 valve loses its signal. It…', ['stays in its last position', 'springs back', 'exhausts both cylinder sides'], 'Without a spring nothing moves the spool, so the valve remembers the last signal. That is why a short pulse is enough to switch it.'],
  ['v6', 'valve', 'A one-way flow control valve lets air pass freely in one direction because…', ['a check valve opens a bypass', 'the throttle opens fully', 'the piston pushes it open'], 'In the free direction the air lifts a check ball and goes round the throttle. In the other direction the ball seats and all the air must pass the throttle.'],
  ['v7', 'valve', 'What does a pilot-operated solenoid valve need in order to switch?', ['Supply pressure at port 1', 'A stronger coil', '230 V instead of 24 V'], 'The solenoid only opens a tiny pilot; the supply air does the work of moving the spool. No air at port 1, no switching.'],
  ['v8', 'valve', 'Which valve is the natural choice for a single-acting cylinder?', ['3/2', '5/2', '5/3'], 'A single-acting cylinder has one port: it needs supply (1→2) or exhaust (2→3). That is exactly a 3/2 valve.'],
  ['v9', 'valve', 'A closed-centre 5/3 valve in its middle position…', ['blocks every port, so the piston stops', 'exhausts both sides of the cylinder', 'connects both sides to the supply'], 'All five ports are shut. The air on both sides of the piston is trapped and holds it where it is.'],
  ['v10', 'valve', 'Why can a closed-centre 5/3 valve not hold a piston perfectly still when the load changes?', ['Trapped air is compressible', 'The valve leaks on purpose', 'The springs push the spool'], 'The piston sits between two cushions of air. Air can be squeezed, so a bigger load moves the piston a little.'],
  ['e1', 'elec', '+24 V is connected to 0 V through a closed pushbutton and nothing else. What happens?', ['A short circuit: the fuse trips', 'The button gets warm, nothing more', 'Nothing, because there is no load'], 'Without a load nothing limits the current. It jumps to hundreds of amps and the supply protects itself.'],
  ['e2', 'elec', 'Two identical 24 V relay coils are connected in series across 24 V. What happens?', ['Each gets about 12 V and neither pulls in', 'Both pull in', 'The fuse trips'], 'Loads in series share the voltage. 12 V is far too little for a 24 V coil. Every coil needs its own branch between the rails.'],
  ['e3', 'elec', 'Which terminal numbers mark a normally-closed contact?', ['Ending in 1–2, such as 11–12', 'Ending in 3–4, such as 13–14', 'A1–A2'], 'The last digit tells the function: 1–2 normally closed, 3–4 normally open. The first digit numbers the contact on its device.'],
  ['e4', 'elec', 'What are terminals A1 and A2 on a relay?', ['The ends of its coil', 'A normally-open contact', 'The supply for its contacts'], 'A1–A2 is the coil. The contacts carry other numbers, such as 13–14 or 21–22.'],
  ['e5', 'elec', 'On a contact block marked 23–24, what does the 2 tell you?', ['It is the second contact of that device', 'It is normally closed', 'It is rated for 2 A'], 'The first digit is the contact’s position number on the device. The 3–4 ending says normally open.'],
  ['e6', 'elec', 'Why is a STOP button wired with a normally-closed contact?', ['A broken wire then stops the machine too', 'NC contacts are cheaper', 'NC contacts switch faster'], 'If the stop circuit is interrupted for any reason, a broken wire included, the machine stops. A normally-open stop button with a broken wire would simply never work.'],
  ['e7', 'elec', 'In an electrical circuit diagram, devices are drawn…', ['at rest: no power, not operated', 'operated', 'in the state they are in most often'], 'Diagrams show the rest state. A normally-closed contact is drawn closed, a normally-open one open.'],
  ['e8', 'elec', 'Current flows only if…', ['there is a closed loop from +24 V through a load back to 0 V', '+24 V reaches the load, whatever happens after it', 'the switch is normally closed'], 'An open loop anywhere stops all current in it. A coil with +24 V on one end and nothing on the other does nothing.'],
  ['l1', 'logic', 'Two normally-open pushbuttons in series feed a coil. This is…', ['AND', 'OR', 'NOT'], 'Current must pass through both, so both must be pressed.'],
  ['l2', 'logic', 'Two normally-open pushbuttons in parallel feed a coil. This is…', ['OR', 'AND', 'exclusive OR'], 'Each button opens its own path. Either one is enough.'],
  ['l3', 'logic', 'How do you build a NOT with a switch?', ['Use a normally-closed contact', 'Put a normally-open contact in series', 'Put two contacts in parallel'], 'A normally-closed contact conducts until it is operated: the output is 1 when the input is 0.'],
  ['l4', 'logic', 'How many rows does a truth table with three inputs have?', ['8', '6', '9'], 'Each input is 0 or 1: 2 × 2 × 2 = 8 combinations.'],
  ['l5', 'logic', 'The output is 1 only when exactly one of two buttons is pressed. That function is…', ['exclusive OR (XOR)', 'OR', 'AND'], 'OR would also give 1 with both pressed. Exclusive OR is 1 only when the inputs differ.'],
  ['l6', 'logic', 'One pushbutton is needed in two different branches. How?', ['Use a button with two contact blocks under one label', 'Wire both branches to the same terminal 4', 'It cannot be done'], 'A real button carries several contact blocks on one actuator. On the diagram they appear as separate contacts with the same label.'],
  ['r1', 'relay', 'What is indirect control?', ['The switches feed a relay coil, and a relay contact feeds the solenoid', 'The switches feed the solenoid directly', 'The valve is operated by hand'], 'The control circuit and the load are separated by the relay. That gives logic, extra contacts and protection for small switches.'],
  ['r2', 'relay', 'Which is NOT a reason to use a relay?', ['It makes the cylinder faster', 'One signal can operate several contacts', 'A small switch can control a bigger load'], 'A relay adds logic, contacts and switching power. The cylinder speed is set by air flow.'],
  ['r3', 'relay', 'What is a self-holding (latching) circuit?', ['A NO contact of the relay in parallel with the start button keeps the coil energised', 'A relay coil connected twice', 'A double-solenoid valve'], 'Once the coil pulls in, its own contact takes over from the start button, so the relay stays on after you let go.'],
  ['r4', 'relay', 'Dominant OFF latch: START and STOP are pressed together. The relay…', ['stays off', 'pulls in', 'pulls in and out repeatedly'], 'In a dominant-OFF latch the STOP contact sits in series with everything, so STOP always wins.'],
  ['r5', 'relay', 'In a dominant-ON latch, the STOP contact sits…', ['in series with the holding contact only', 'in series with the start button and the holding contact', 'in parallel with START'], 'START then reaches the coil directly, past STOP. Pressing both together leaves the relay on.'],
  ['r6', 'relay', 'After a power cut, a relay latch…', ['stays off until START is pressed again', 'switches itself back on', 'remembers its state'], 'The coil drops out without power and its holding contact opens. Nothing restarts by surprise: a safety advantage over a memory valve.'],
  ['r7', 'relay', 'Why can a double-solenoid valve be a hazard after a power cut?', ['It keeps its position, so motion can continue when power and air return', 'It moves to a middle position', 'It exhausts the cylinder'], 'A memory valve does not forget. A machine that stopped half-way may finish its movement the moment the air comes back.'],
  ['t1', 'time', 'An on-delay timer set to 3 s is energised for only 2 s. Its contacts…', ['never switch', 'switch after 2 s', 'switch at once and drop after 3 s'], 'The time starts again from zero every time the coil is energised. It must stay on for the whole set time.'],
  ['t2', 'time', 'An off-delay timer…', ['switches at once and lets go the set time after the coil loses power', 'waits the set time before switching on', 'counts pulses'], 'Its symbol has a solid box: “lets go late”.'],
  ['t3', 'time', 'What makes a preset counter count?', ['Each new appearance of voltage at its input', 'How long its input stays on', 'Every relay click in the circuit'], 'It counts rising edges. Holding the input on does not count again.'],
  ['t4', 'time', 'How is a preset counter set back to zero?', ['By energising its reset input R1–R2', 'By pressing one of its contacts', 'It resets itself after reaching the preset'], 'The count stays, and its contacts stay switched, until the reset input is energised.'],
  ['t5', 'time', 'A press must hold its stroke for 3 s and then return. Which device fits?', ['An on-delay timer started at the end position', 'An off-delay timer started by the start button', 'A preset counter'], 'The limit switch at the end starts an on-delay timer; when it times out, its contact sends the press back.'],
  ['s1', 'sens', 'Which sensor reports the piston position through the cylinder wall?', ['A reed switch', 'An inductive sensor', 'An optical sensor'], 'The piston carries a magnet. A reed switch clamped on the barrel feels it through the aluminium wall.'],
  ['s2', 'sens', 'An inductive sensor detects…', ['metal only', 'any material', 'magnets only'], 'Its high-frequency field is disturbed by metal and by nothing else.'],
  ['s3', 'sens', 'On a three-wire PNP sensor, brown, blue and black are…', ['+24 V, 0 V, output', '0 V, +24 V, output', 'output, 0 V, +24 V'], 'Brown supply plus, blue supply minus, black the switched output. The same on every make.'],
  ['s4', 'sens', 'Where does the load go on a PNP sensor?', ['Between black and 0 V', 'Between black and +24 V', 'Between brown and blue'], 'A PNP sensor switches +24 V onto its black wire. The current then flows through the load to 0 V.'],
  ['s5', 'sens', 'A three-wire sensor is wired black → coil → 0 V and brown → +24 V, but its blue wire is loose. What happens when a target comes?', ['Nothing: the sensor has no supply', 'The coil pulls in as usual', 'The fuse trips'], 'The electronics are fed between brown and blue. Without blue the sensor is dead.'],
  ['s6', 'sens', 'Which sensor reliably detects a clear glass bottle?', ['Capacitive', 'Optical, diffuse', 'Inductive'], 'Glass is not metal and lets light through. A capacitive sensor reacts to almost any material.'],
  ['s7', 'sens', 'A pressing job ends at a different position for every workpiece, but must always reach full force. What should send the press back?', ['A pressure switch', 'A limit switch at the end of the stroke', 'An optical sensor'], 'The pressure behind the piston only reaches supply pressure once the piston has stopped against the work, wherever that is.'],
  ['s8', 'sens', 'A limit switch differs from a proximity sensor in that it…', ['must be touched and pressed', 'needs three wires', 'only sees metal'], 'A limit switch has a roller that the machine must physically press. Proximity sensors work without contact.'],
  ['q1', 'seq', 'In sequence notation, what does “A+” mean?', ['Cylinder A extends', 'Cylinder A retracts', 'Valve A is energised'], '+ means extend, − means retract.'],
  ['q2', 'seq', 'A+ B+ B− A− wired directly with limit switches jams. Why?', ['A signal is still present when the opposite one is needed (signal overlap)', 'The cylinders are too slow', 'The valves have springs'], 'For example the signal that extends B is still there when B should retract. Both solenoids of B are energised and the valve does not move.'],
  ['q3', 'seq', 'How does the cascade method cure signal overlap?', ['It switches the supply between groups, so only one group’s signals are live at a time', 'It adds flow control valves', 'It uses single-solenoid valves'], 'A memory relay (or valve) feeds one supply line at a time. A signal from a group that is not live can do nothing.'],
  ['q4', 'seq', 'Which of these sequences works with double-solenoid valves and plain limit switches, with no cascade?', ['A+ B+ A− B−', 'A+ B+ B− A−', 'A+ A− B+ B−'], 'In A+ B+ A− B− every signal is gone before the opposite signal for the same cylinder is needed.'],
  ['q5', 'seq', 'What does a displacement-step diagram show?', ['The position of every cylinder at each step of the sequence', 'The electrical wiring', 'The air consumption'], 'Each cylinder gets a line that goes up when it extends and down when it retracts, step by step.'],
  ['f1', 'safe', 'What must an emergency stop do?', ['Stop the dangerous motion and stay latched until deliberately released', 'Pause the machine while it is held', 'Switch off only the lamps'], 'An emergency stop latches. Letting go must not restart anything.'],
  ['f2', 'safe', 'Why must both buttons of a two-hand control be pressed within about half a second?', ['So that one button cannot be wedged down to free a hand', 'To save air', 'To give the valve time to warm up'], 'If one button could be held down permanently, one hand would be free to reach into the press.'],
  ['f3', 'safe', 'What normally selects single cycle or continuous operation?', ['A selector switch that stays where it is put', 'A pushbutton', 'A pressure switch'], 'The mode must stay selected, so it needs a switch with a detent.'],
  ['d1', 'fault', 'While current should flow, a wire reads 24 V at one end and 0 V at the other. The wire is…', ['broken inside', 'fine', 'short-circuited'], 'A healthy wire has the same voltage at both ends.'],
  ['d2', 'fault', 'A coil has 24 V across it but 0 mA through it. It is…', ['burnt out: the winding is open', 'working normally', 'short-circuited'], 'A healthy 24 V coil draws tens of milliamps. Voltage without current means the circuit inside it is open.'],
  ['d3', 'fault', 'A switch reads “operated: yes” and “contact: open”. What is wrong?', ['The contact is worn out', 'The coil is broken', 'There is no air'], 'It is being operated but does not close: the contact itself has failed.'],
  ['d4', 'fault', 'A tube shows 6 bar at one end and 0 bar at the other. It is…', ['kinked or blocked', 'fine', 'leaking at both ends'], 'A tube joins two points into one volume. Two different pressures mean something in between is shut.'],
  ['d5', 'fault', 'The fuse trips as soon as a button is pressed. What do you look for?', ['A path from +24 V to 0 V without a load', 'A broken wire', 'A burnt-out coil'], 'Only a path with no load draws enough current to trip the fuse.'],
  ['d6', 'fault', 'A sensor has 24 V between brown and blue, a steel part in front of it, and its output stays off. Which kind of sensor would that be normal for?', ['None: an inductive sensor should switch, so if it is inductive it has failed', 'A capacitive sensor', 'An optical sensor'], 'Steel is seen by inductive, capacitive and optical sensors alike. With supply and a target present, an output that stays off means the sensor is faulty.'],
  ['c1', 'calc', '1 bar is…', ['100 000 Pa (N/m²)', '1 000 Pa', '10 Pa'], '1 bar = 10⁵ Pa = 10 N/cm². So 6 bar push on 1 cm² with 60 N.'],
  ['c2', 'calc', 'The bore of a cylinder is doubled. Its force at the same pressure becomes…', ['four times as big', 'twice as big', 'eight times as big'], 'Area grows with the square of the diameter: (2d)² = 4d².'],
  ['c3', 'calc', 'Why is free air consumption bigger than the cylinder volume?', ['The cylinder is filled to supply pressure, so it holds several volumes of atmospheric air', 'Air leaks from every fitting', 'The exhaust air is counted twice'], 'At 6 bar gauge the air is compressed to about 1/7 of its free volume, so each fill takes about 7 times the cylinder volume of free air.']
];

/* ---------- glossary ---------- */
const GLOSSARY = [
  ['Actuator', 'The part that does the work: a cylinder or a motor. On a diagram, cylinders are labelled 1A, 2A…'],
  ['AND', 'Output only when all inputs are present. With contacts: in series.'],
  ['Bore', 'The inside diameter of a cylinder. Force grows with the square of it.'],
  ['Cascade method', 'A way to build sequences without signal overlap: a memory switches the supply between groups of signals, so only one group is live.'],
  ['Contact block', 'One contact of a switch or relay. Several blocks on one actuator share a label.'],
  ['Detent', 'A notch that holds a switch in the position it was put in, as on a selector switch or an emergency stop.'],
  ['Direct control', 'The switches feed the solenoid themselves, with no relay in between.'],
  ['Dominant OFF / ON', 'What a latch does when START and STOP are pressed together: stays off (dominant OFF) or stays on (dominant ON).'],
  ['Double-acting cylinder', 'A cylinder moved by air in both directions, with a port on each side of the piston.'],
  ['Exhaust', 'Where used air leaves a valve into the room: ports 3 and 5.'],
  ['Free air', 'Air at atmospheric pressure. Air consumption is given in litres of free air.'],
  ['Indirect control', 'The switches feed a relay coil, and relay contacts feed the solenoid.'],
  ['Inductive sensor', 'A proximity sensor that detects metal with a high-frequency magnetic field.'],
  ['Capacitive sensor', 'A proximity sensor that detects nearly any material, because the material changes a capacitance.'],
  ['Optical sensor', 'A sensor that sends out light and watches for its reflection or for a beam being interrupted. Diffuse ones miss transparent parts.'],
  ['Latching (self-holding)', 'A relay keeps itself energised through one of its own normally-open contacts, wired in parallel with the start button.'],
  ['Limit switch', 'A switch with a roller that the machine presses at an end position.'],
  ['Meter-out', 'Speed control by throttling the air that leaves the cylinder.'],
  ['NC (normally closed)', 'A contact that conducts at rest and opens when operated. Terminal numbers end in 1–2.'],
  ['NO (normally open)', 'A contact that is open at rest and closes when operated. Terminal numbers end in 3–4.'],
  ['NOT', 'The output is the opposite of the input. With contacts: a normally-closed contact.'],
  ['OR', 'Output when at least one input is present. With contacts: in parallel.'],
  ['On-delay timer', 'A timer relay whose contacts switch only after its coil has been energised for the whole set time.'],
  ['Off-delay timer', 'A timer relay whose contacts switch at once and drop back the set time after its coil loses power.'],
  ['Pilot-operated valve', 'A solenoid valve whose coil only opens a small pilot; supply air moves the spool. It needs air at port 1 to switch.'],
  ['PNP output', 'A sensor output that switches +24 V onto its black wire. The load goes from black to 0 V.'],
  ['Port numbers', '1 supply, 2 and 4 working lines, 3 and 5 exhausts, 12 and 14 pilot signals.'],
  ['Preset counter', 'Counts pulses at its input; at the preset count its contacts switch, until it is reset.'],
  ['Pressure switch', 'Switches when the air pressure at its port reaches a set value. It senses force rather than position.'],
  ['Reed switch', 'Two steel tongues in a glass tube, pulled together by a magnet. Used on cylinders to sense the piston magnet.'],
  ['Relay', 'An electromagnetic switch: a coil (A1–A2) operating one or more contacts with the same label.'],
  ['Short circuit', 'A path from +24 V to 0 V without a load. The current is limited only by the supply, so the fuse trips.'],
  ['Signal overlap', 'In a sequence, a signal that is still present when the signal for the opposite movement arrives, so a double-solenoid valve cannot switch.'],
  ['Single-acting cylinder', 'A cylinder driven by air one way and returned by a spring.'],
  ['Solenoid', 'The electromagnet that switches a valve. Labelled Y1, Y2…'],
  ['Spring return', 'A valve that goes back to its rest position by spring force when its signal ends. It has no memory.'],
  ['Stroke', 'How far a piston rod travels between its two end positions.'],
  ['Truth table', 'A list of every combination of inputs and the output each one should give.'],
  ['5/2 valve', 'A valve with five ports and two switching positions.'],
  ['5/3 valve, closed centre', 'Five ports, three positions. In the middle every port is blocked and the piston stops.'],
  ['Displacement-step diagram', 'A chart of every cylinder’s position, step by step through a sequence.']
];

/* ---------- generators: each makes a fresh question ---------- */
const mk = (topic, q, right, wrong, why, extra) => Object.assign({topic, q, o: [right].concat(wrong), a: 0, why}, extra || {});
const distinct = a => new Set(a).size === a.length;
const r0 = v => Math.round(v);

/* which part is this? */
function genSymbol() {
  const types = Object.keys(D).filter(t => t !== 'psu'), t = pick(types), d = D[t];
  const same = shuffle(types.filter(x => x !== t && D[x].grp === d.grp)), other = shuffle(types.filter(x => x !== t && D[x].grp !== d.grp));
  const wrong = same.concat(other).slice(0, 3).map(x => D[x].name);
  return mk(d.cat === 'p' ? 'valve' : D[t].grp === 'Sensors' ? 'sens' : 'elec', 'Which part does this symbol show?', d.name, wrong,
    d.name + '. ' + d.desc.replace(/<[^>]+>/g, ''), {fig: EP.symbolSVG(t)});
}
/* what is K3? */
function genLetter() {
  const L = [['S', 'a switch: pushbutton or limit switch'], ['K', 'a relay (or timer relay)'], ['Y', 'a solenoid coil of a valve'], ['H', 'an indicator lamp'], ['B', 'a sensor'], ['A', 'a cylinder (actuator)'], ['V', 'a valve']];
  const [l, m] = pick(L), n = 1 + rnd(4), label = l === 'A' || l === 'V' ? n + l : l + n;
  return mk('elec', `On a circuit diagram, what is ${label}?`, m, shuffle(L.filter(x => x[0] !== l)).slice(0, 3).map(x => x[1]),
    `The letter names the kind of device: S switches, K relays, Y solenoids, H lamps, B sensors; 1A is cylinder 1 and 1V its valve. The number tells devices of one kind apart.`);
}
/* terminal and port numbers */
function genTerminal() {
  const T = [['contact terminals 13–14', 'a normally-open contact'], ['contact terminals 21–22', 'a normally-closed contact'], ['contact terminals 33–34', 'a normally-open contact'],
    ['contact terminals 41–42', 'a normally-closed contact'], ['terminals A1–A2', 'the coil of a relay or timer'], ['terminals R1–R2 on a counter', 'its reset input'],
    ['port 1 of a valve', 'the compressed-air supply'], ['ports 2 and 4 of a valve', 'the working lines to the cylinder'], ['ports 3 and 5 of a valve', 'exhausts'],
    ['the brown wire of a sensor', '+24 V supply'], ['the blue wire of a sensor', '0 V supply'], ['the black wire of a sensor', 'the switched output']];
  const [x, m] = pick(T), wrong = shuffle([...new Set(T.map(t => t[1]).filter(v => v !== m))]).slice(0, 3);
  return mk(/wire|port/.test(x) ? (/port/.test(x) ? 'valve' : 'sens') : 'elec', `What are ${x}?`, m, wrong,
    'Contacts: last digit 3–4 normally open, 1–2 normally closed; the first digit counts the contacts on one device. Coils A1–A2. Valve ports: 1 supply, 2 and 4 working lines, 3 and 5 exhaust. Sensors: brown +24 V, blue 0 V, black output.');
}
/* the n/m valve code */
function genValveCode() {
  const [p, s] = pick([[3, 2], [4, 2], [5, 2], [5, 3]]);
  return mk('valve', `A ${p}/${s} valve has…`, `${p} ports and ${s} switching positions`, [`${s} ports and ${p} switching positions`, `${p} switching positions and ${s} solenoids`, `${p + s} ports`],
    'The first number counts the ports (connections), the second the switching positions: one square each in the symbol.');
}
const BORES = [[16, 6], [20, 8], [25, 10], [32, 12], [40, 16], [50, 20], [63, 20]];
/* force = pressure × area */
function genForce() {
  for (;;) {
    const [D_, d] = pick(BORES), p = pick([4, 5, 6, 7, 8]), pull = Math.random() < 0.4;
    const Ap = Math.PI * D_ * D_ / 4, Ar = Math.PI * (D_ * D_ - d * d) / 4, A = pull ? Ar : Ap, F = p * 0.1 * A;     // mm², bar → N/mm² is 0.1
    const opts = [r0(F), r0(p * 0.1 * Math.PI * D_ * D_ * (pull ? (D_ * D_ - d * d) / (D_ * D_) : 1)), r0(p * 0.1 * (pull ? Ap : Ar)), r0(F / 10)];     // right; forgot the /4; the other side; bar taken as 0.01 N/mm²
    if (!distinct(opts) || opts.some(v => v <= 0)) continue;
    return mk('calc', `What force does a ${D_} mm cylinder (rod ${d} mm) give when ${pull ? 'retracting (rod side)' : 'extending (cap side)'} at ${p} bar? Ignore friction.`,
      opts[0] + ' N', opts.slice(1).map(v => v + ' N'),
      pull ? `Rod side: A = π × (D² − d²) / 4 = π × (${D_}² − ${d}²) / 4 = ${r0(Ar)} mm². F = p × A = ${p} bar × 0.1 N/mm² per bar × ${r0(Ar)} mm² ≈ ${opts[0]} N.`
        : `Cap side: A = π × D² / 4 = π × ${D_}² / 4 = ${r0(Ap)} mm². F = p × A = ${p} bar × 0.1 N/mm² per bar × ${r0(Ap)} mm² ≈ ${opts[0]} N. (1 bar = 0.1 N/mm².) A real cylinder loses roughly another 10 % to friction.`);
  }
}
/* free air per double stroke */
function genAir() {
  for (;;) {
    const [D_, d] = pick(BORES), p = pick([4, 5, 6, 7]), s = pick([50, 100, 160, 200, 250]);
    const Vg = (Math.PI * D_ * D_ / 4 + Math.PI * (D_ * D_ - d * d) / 4) * s / 1e6, k = (p + 1.013) / 1.013;   // litres
    const f = v => v.toFixed(2) + ' l', opts = [Vg * k, Vg * p / 1.013, Math.PI * D_ * D_ / 4 * s / 1e6 * k, Vg].map(f);
    if (!distinct(opts)) continue;
    return mk('calc', `How much free air does a ${D_} mm cylinder (rod ${d} mm, stroke ${s} mm) use for one stroke out and back at ${p} bar?`, opts[0], opts.slice(1),
      `Volume swept: cap side ${r0(Math.PI * D_ * D_ / 4)} mm² plus rod side ${r0(Math.PI * (D_ * D_ - d * d) / 4)} mm², times ${s} mm = ${Vg.toFixed(3)} l. It is filled to ${p} bar gauge, which is ${(p + 1.013).toFixed(2)} bar absolute, so the free air is ${Vg.toFixed(3)} × ${(p + 1.013).toFixed(2)} / 1.013 ≈ ${opts[0]}.`);
  }
}
/* which sensor sees this material */
function genSensor() {
  const K = {reed: 'Reed switch', ind: 'Inductive sensor', cap: 'Capacitive sensor', opt: 'Optical sensor (diffuse)'}, M = {steel: 'a steel part', plastic: 'a plastic part', glass: 'a clear glass part', magnet: 'a magnet'};
  const m = pick(Object.keys(M)), yes = Object.keys(K).filter(k => EP.SEES[k].includes(m)), no = Object.keys(K).filter(k => !EP.SEES[k].includes(m));
  if (Math.random() < 0.5 && no.length) {
    const right = pick(no), wrong = yes.slice(0, 3);
    return mk('sens', `Which of these does NOT notice ${M[m]}?`, K[right], wrong.map(k => K[k]), `Reed: magnets only. Inductive: metal. Capacitive: nearly everything. Optical: anything that reflects light, so not clear glass.`);
  }
  const right = pick(yes), wrong = no.slice(0, 3);
  if (!wrong.length) return genSymbol();
  return mk('sens', `Which of these notices ${M[m]}?`, K[right], wrong.map(k => K[k]), `Reed: magnets only. Inductive: metal. Capacitive: nearly everything. Optical: anything that reflects light, so not clear glass.`);
}

/* ---- reading a circuit: a random network of contacts in front of Y1, drawn as a ladder and checked by the simulator ---- */
const LAB = ['S1', 'S2', 'S3'];
function tree(n) {                                           // n leaves, each its own button, some normally closed
  const leaves = shuffle(LAB.slice(0, n)).map(l => ({l, nc: Math.random() < 0.3}));
  if (n === 1) return leaves[0];
  if (n === 2) return {op: pick(['and', 'or']), a: leaves[0], b: leaves[1]};
  const op = pick(['and', 'or']), inner = {op: op === 'and' ? 'or' : 'and', a: leaves[0], b: leaves[1]};
  return Math.random() < 0.5 ? {op, a: inner, b: leaves[2]} : {op, a: leaves[2], b: inner};
}
const evalT = (t, on) => t.l ? (t.nc ? !on[t.l] : !!on[t.l]) : t.op === 'and' ? evalT(t.a, on) && evalT(t.b, on) : evalT(t.a, on) || evalT(t.b, on);
const nameT = (t, top) => t.l ? (t.nc ? 'NOT ' + t.l : t.l) : (top ? '' : '(') + nameT(t.a) + (t.op === 'and' ? ' AND ' : ' OR ') + nameT(t.b) + (top ? '' : ')');
const sizeT = t => t.l ? [1, 1] : (([w1, h1], [w2, h2]) => t.op === 'and' ? [Math.max(w1, w2), h1 + h2] : [w1 + w2, Math.max(h1, h2)])(sizeT(t.a), sizeT(t.b));
function circuitOf(t) {
  const [w, h] = sizeT(t), ex = 0, ey = 0, comps = [], wires = [];
  let n = 0;
  const add = (type, id, col, row, label) => comps.push(EP.newComp(type, id, ex + 50 + 80 * col, ey + 30 + 80 * row, {label: label || id}));
  const wire = (a, b) => { const sp = r => ({c: r.slice(0, r.lastIndexOf('.')), p: r.slice(r.lastIndexOf('.') + 1)}); wires.push({id: 'w' + (++n), k: 'e', a: sp(a), b: sp(b)}); };
  comps.push(EP.newComp('psu', 'PSU', ex, ey, {label: '', w: 20 + 80 * Math.max(1, w), h: 30 + 80 * (h + 1)}));
  let k = 0;
  const place = (t, col, row) => {                           // returns {top: [refs], bot: [refs]}
    if (t.l) { const id = 'c' + (++k); add(t.nc ? 'pb_nc' : 'pb_no', id, col, row, t.l); return t.nc ? {top: [id + '.1'], bot: [id + '.2']} : {top: [id + '.3'], bot: [id + '.4']}; }
    const [w1, h1] = sizeT(t.a), A = place(t.a, col, row);
    if (t.op === 'and') { const B_ = place(t.b, col, row + h1); for (const x of A.bot.slice(1)) wire(A.bot[0], x); for (const y of B_.top) wire(A.bot[0], y); return {top: A.top, bot: B_.bot}; }
    const B_ = place(t.b, col + w1, row); return {top: A.top.concat(B_.top), bot: A.bot.concat(B_.bot)};
  };
  const net = place(t, 0, 0);
  add('sol', 'Y1', 0, h, 'Y1');
  for (const x of net.top) wire('PSU.pos', x);
  for (const x of net.bot) wire(x, 'Y1.a');
  wire('Y1.b', 'PSU.neg');
  return {comps, wires};
}
/* the simulator's verdict for one set of pressed buttons */
function simY1(circ, on) {
  const s = new EP.Sim(circ); s.power(true); s.run(0.02);
  for (const l of LAB) if (on[l]) s.pressLabel(l, true);
  s.run(0.08); return s.solOn('Y1');
}
function genCircuit() {
  const n = 2 + rnd(2), t = tree(n), circ = circuitOf(t), labs = LAB.slice(0, n), name = nameT(t, true);
  if (Math.random() < 0.5) {                                 // name the function
    const tbl = f => { let s = ''; for (let m = 0; m < (1 << n); m++) { const on = {}; labs.forEach((l, i) => { on[l] = !!((m >> i) & 1); }); s += evalT(f, on) ? 1 : 0; } return s; };
    const mine = tbl(t), wrong = [], seen = new Set([mine]);
    for (let g = 0; g < 60 && wrong.length < 3; g++) { const u = tree(n), tb = tbl(u), nm = nameT(u, true); if (!seen.has(tb) && !wrong.includes(nm) && nm !== name) { seen.add(tb); wrong.push(nm); } }
    if (wrong.length < 2) return genCircuit();
    return mk('logic', 'Which logic function does this circuit give for coil Y1?', 'Y1 = ' + name, wrong.map(x => 'Y1 = ' + x),
      `Read it path by path: contacts in series are AND, branches in parallel are OR, and a normally-closed contact is NOT. Here Y1 = ${name}.`, {circ, tree: t});
  }
  const on = {}; labs.forEach(l => { on[l] = Math.random() < 0.5; });
  const yes = evalT(t, on), say = labs.map(l => l + (on[l] ? ' pressed' : ' not pressed')).join(', ');
  return mk('logic', `${say}. Is coil Y1 energised?`, yes ? 'Yes, Y1 is energised' : 'No, Y1 stays off', [yes ? 'No, Y1 stays off' : 'Yes, Y1 is energised'],
    `This circuit is Y1 = ${name}. Follow the current from +24 V: a normally-open contact conducts only while pressed, a normally-closed one only while not pressed.`, {circ, tree: t, on});
}
/* the two kinds of latch, read from the diagram */
function genLatch() {
  const kind = pick(['latchOff', 'latchOn']), circ = EP.solutions[kind](), s = new EP.Sim(circ);
  s.power(true); s.run(0.05); s.pressLabel('S1', true); s.pressLabel('S2', true); s.run(0.2);
  const on = s.relayOn('K1');
  return mk('relay', 'START (S1) and STOP (S2) are pressed at the same time. What does K1 do?', on ? 'It pulls in and holds: this latch is dominant ON' : 'It stays off: this latch is dominant OFF',
    [on ? 'It stays off: this latch is dominant OFF' : 'It pulls in and holds: this latch is dominant ON', 'It pulls in and drops out over and over'],
    on ? 'S1 reaches the coil without passing S2; STOP only breaks the holding contact. So START wins.' : 'S2 sits in series with both S1 and the holding contact, so while it is pressed nothing reaches the coil. STOP wins.',
    {circ});
}
/* ---- timer relays: when is the contact closed, and which timer drew this picture ---- */
const TIMERS = {on: 'On-delay timer', off: 'Off-delay timer', pulse: 'Pulse timer', flash: 'Flasher'};
const TWHY = {on: 'An on-delay timer switches only after its coil has been energised for the whole set time, and drops back the moment the coil loses power.',
  off: 'An off-delay timer switches at once and holds on for the set time after the coil loses power.',
  pulse: 'A pulse timer switches at once and drops back after the set time, or earlier if the coil loses power first.',
  flash: 'A flasher switches on and off by turns, each for the set time, starting with on, for as long as the coil is energised.'};
const num = x => String(+x.toFixed(1));
function timerOn(kind, D, X) {                              // when the contact is closed, if the coil is energised from 0 to X
  if (kind === 'on') return X > D ? [[D, X]] : [];
  if (kind === 'off') return [[0, X + D]];
  if (kind === 'pulse') return [[0, Math.min(D, X)]];
  const out = []; for (let t = 0; t < X - 1e-9; t += 2 * D) out.push([t, Math.min(t + D, X)]); return out;
}
const ivText = a => !a.length ? 'never' : a.map(([x, y]) => `from ${num(x)} s to ${num(y)} s`).join(', and ');
function genTimerWhen() {
  for (;;) {
    const kind = pick(Object.keys(TIMERS)), D = pick([0.5, 1, 1.5, 2, 3]), X = pick([1, 2, 2.5, 3, 4, 5]);
    if (kind === 'flash' && X / D > 6) continue;
    const ans = ivText(timerOn(kind, D, X)), wrong = [...new Set(Object.keys(TIMERS).filter(k => k !== kind).map(k => ivText(timerOn(k, D, X))))].filter(o => o !== ans);
    if (wrong.length < 2) continue;
    return mk('time', `${TIMERS[kind]}, set to ${num(D)} s. Its coil is energised from 0 s to ${num(X)} s. When is its normally-open contact closed?`, ans, wrong, TWHY[kind]);
  }
}
function genTimerPick() {
  const D = pick([1, 1.5]), X = pick([3.5, 4, 4.5, 5]), kind = pick(Object.keys(TIMERS)), T = X + D + 1, sx = t => (40 + t / T * 250).toFixed(1);
  const row = (iv, y, label, col) => {
    let d = `M${sx(0)},${y + 22}`;
    for (const [a, b] of iv) d += `L${sx(a)},${y + 22}L${sx(a)},${y}L${sx(b)},${y}L${sx(b)},${y + 22}`;
    return `<text x="2" y="${y + 15}" class="pin">${label}</text><line x1="${sx(0)}" y1="${y + 22}" x2="${sx(T)}" y2="${y + 22}" class="ink faint thin"/><path d="${d}L${sx(T)},${y + 22}" class="ink nofill thick" style="stroke:${col}"/>`;
  };
  let ticks = ''; for (let t = 0; t <= T; t++) ticks += `<line x1="${sx(t)}" y1="8" x2="${sx(t)}" y2="84" class="ink faint thin"/><text x="${sx(t)}" y="96" class="pin" text-anchor="middle">${t}</text>`;
  const fig = `<svg class="tdia" viewBox="0 0 300 100">${ticks}${row([[0, X]], 10, 'coil', 'var(--ink)')}${row(timerOn(kind, D, X), 50, 'contact', 'var(--accent)')}</svg>`;
  return mk('time', `A timer relay is set to ${num(D)} s and its coil is energised from 0 s to ${num(X)} s. Its normally-open contact does what the lower line shows. Which kind is it?`,
    TIMERS[kind], Object.keys(TIMERS).filter(k => k !== kind).map(k => TIMERS[k]), TWHY[kind], {fig});
}

/* ---- sequences: does it run directly, where does it jam, how many groups, where to cut ---- */
function seqWith(conflict) { const C = EP.cascade; for (let g = 0; g < 300; g++) { const ms = C.random(2 + rnd(2)); if (!!C.problems(ms).length === conflict) return ms; } return C.parse(conflict ? 'A+ B+ B- A-' : 'A+ B+ A- B-').moves; }
function genSeqRuns() {
  const C = EP.cascade, ms = seqWith(Math.random() < 0.6), pr = C.problems(ms), t = C.text(ms);
  return mk('seq', `Wired directly, with limit switches and double-solenoid valves, does the sequence ${t} run?`, pr.length ? 'No, it jams or goes wrong' : 'Yes, it runs', [pr.length ? 'Yes, it runs' : 'No, it jams or goes wrong'],
    pr.length ? C.problemText(pr[0]) : 'Every signal is gone before the opposite move of the same cylinder is due, and no switch starts a move out of turn.', {fig: C.diagram(ms)});
}
function genSeqSignal() {
  const C = EP.cascade, ms = seqWith(true), pr = C.problems(ms), t = C.text(ms), cy = [...new Set(ms.map(m => m.c.toLowerCase()))];
  const all = []; cy.forEach(c => all.push(c + '0', c + '1'));
  const ans = pr[0].signal, wrong = PR_shuffle(all.filter(x => x !== ans && !ans.endsWith(x))).slice(0, 3);
  return mk('seq', `Wired directly, the sequence ${t} goes wrong. Which signal causes the first problem?`, ans, wrong, C.problemText(pr[0]), {fig: C.diagram(ms)});
}
function genSeqGroups() {
  const C = EP.cascade, ms = seqWith(true), G = C.groups(ms), n = G.length, t = C.text(ms);
  const opts = [n, n + 1, n - 1 >= 2 ? n - 1 : n + 2].map(v => v + ' groups, ' + (v - 1) + ' relay' + (v - 1 === 1 ? '' : 's'));
  return mk('seq', `How many groups, and how many relays, does an electrical cascade for ${t} need?`, opts[0], opts.slice(1),
    `Cut wherever a cylinder would appear twice in one group: ${C.groupText(G)}. The last group is live whenever no relay is on, so ${n} groups need ${n - 1} relay${n - 1 === 1 ? '' : 's'}.`, {fig: C.diagram(ms)});
}
function genSeqSplit() {
  const C = EP.cascade, ms = seqWith(true), G = C.groups(ms), n = G.length, t = C.text(ms), right = C.groupText(G), wrong = new Set();
  for (let g = 0; g < 300 && wrong.size < 3; g++) {
    const cuts = ms.map((_, i) => i > 0 && Math.random() < 0.4), parts = [[]];
    ms.forEach((m, i) => { if (cuts[i]) parts.push([]); parts[parts.length - 1].push(m); });
    const valid = parts.every(p => new Set(p.map(m => m.c)).size === p.length), txt = C.groupText(parts);
    if (txt !== right && !(valid && parts.length === n)) wrong.add(txt);
  }
  if (wrong.size < 2) return genSeqGroups();
  return mk('seq', `Which group division for ${t} follows the rule: no cylinder twice in one group, and as few groups as possible?`, right, [...wrong],
    `Go along the sequence and cut just before a cylinder would appear for the second time in the current group: ${right}.`);
}
const PR_shuffle = shuffle;
const GENS = [genSymbol, genLetter, genTerminal, genValveCode, genForce, genAir, genSensor, genCircuit, genCircuit, genLatch,
  genTimerWhen, genTimerPick, genSeqRuns, genSeqSignal, genSeqGroups, genSeqSplit];

/* ---------- putting a set together ---------- */
function bankQ(b) { return {id: b[0], topic: b[1], q: b[2], o: b[3], a: 0, why: b[4]}; }
function lessonQs() {
  const out = [];
  EP.lessons.forEach(l => (l.quiz || []).forEach((q, i) => out.push({id: 'L:' + l.id + ':' + i, topic: CH_TOPIC[l.ch] || 'logic', q: q.q, o: q.o, a: q.a, why: q.why, from: l.title})));
  return out;
}
function allWritten() { return BANK.map(bankQ).concat(lessonQs()); }
/* n questions from the chosen topics: about 60 % written (those least well known first), the rest generated */
function make(topics, n, boxes) {
  const want = t => !topics || !topics.length || topics.includes(t);
  const box = q => (boxes && boxes[q.id] != null ? boxes[q.id] : -1);           // -1 never seen, 0 got wrong last time, up to 3 known well
  const written = shuffle(allWritten().filter(q => want(q.topic))).sort((a, b) => (box(a) === 0 ? -1 : box(a)) - (box(b) === 0 ? -1 : box(b)));
  const out = written.slice(0, Math.round(n * 0.6));
  for (let g = 0; out.length < n && g < 400; g++) { const q = pick(GENS)(); if (want(q.topic) && !out.some(x => x.q === q.q && !x.circ)) out.push(q); }
  for (const q of written.slice(out.length)) { if (out.length >= n) break; out.push(q); }
  return shuffle(out);
}
function weak(boxes) { return allWritten().filter(q => boxes && boxes[q.id] === 0); }
function deck() {
  return Object.keys(D).filter(t => t !== 'psu').map(t => ({id: 'p:' + t, fig: EP.symbolSVG(t), front: 'What is this symbol?', back: D[t].name, more: D[t].desc.replace(/<[^>]+>/g, '')}))
    .concat(GLOSSARY.map(g => ({id: 'g:' + g[0], front: g[0], back: g[1]})));
}

EP.practice = {topics: TOPICS, bank: BANK, glossary: GLOSSARY, gens: GENS, make, weak, deck, allWritten, evalT, circuitOf, simY1, tree, nameT, shuffle};
})(typeof window !== 'undefined' ? window : globalThis);

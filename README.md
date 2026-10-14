# PneuLab

An electro-pneumatics workshop that runs in the browser. You wire real control circuits, switch the bench on,
and watch current and compressed air do what the laws of physics say they should.

**Open it: https://merunism19.github.io/pneulab/**

- 36 lessons, from a first pushbutton to relays, latching, timers, counters, safety circuits, two-cylinder sequences, sensors and a repair shop
- A sandbox with every part, examples to load, and links for sharing a circuit
- A 3D bench that shows the sheet as training-lab hardware
- Endless practice: logic drills, a fault hunt, and a final exam with a certificate

It works on phones as well as desktops, and it keeps working without a connection once it has been opened.
On Android you can also install [PneuLab.apk](https://merunism19.github.io/pneulab/PneuLab.apk).

## How it is built

Plain HTML, CSS and JavaScript. There is no build step and nothing to install: open `index.html` in a browser.

| Path | What it holds |
| --- | --- |
| `js/components.js` | The parts: ports, symbols, descriptions |
| `js/engine.js` | The simulation: nodal analysis for the electrics, orifice flow and piston dynamics for the air |
| `js/lessons.js` | Lessons, reference circuits, the fault-hunt and drill generators |
| `js/app.js` | The editor, the coach panel, the handbook |
| `js/gl3d.js`, `js/view3d.js`, `view3d.html` | The 3D bench (WebGL 2, no libraries) |
| `sw.js`, `manifest.webmanifest` | Offline copy and "install as an app" |
| `android/` | The Android app: the same files in a WebView. See `android/README.md` |
| `tests/run.js` | Headless checks |

## Tests

```
node tests/run.js
```

Every lesson's reference circuit must pass its own test bench, every unsolved starting circuit must fail it,
and a set of physics checks must hold.

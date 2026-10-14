# Boundary — cricket scoreboard simulator

A working local simulation of the ten-digit scoreboard and twelve enclosure buttons in **Cricket_Scoreboard_Schematic.pdf, CSB-001 revision B** and **Cricket_Scoreboard_BOM.xlsx, revision B**. Both documents were reviewed: all three schematic sheets and both BOM worksheets. The app uses plain HTML, CSS, JavaScript and local SVG digits. No app dependencies, backend, accounts, CDN assets, or external requests.

## Open the downloadable HTML

Download **Cricket-Scoreboard.html** and double-click it (or use your browser's Open File command). This self-contained copy includes all styles and JavaScript and works offline. No terminal, server, Python, or Node is needed to use it. Keep the file at the same location for refresh recovery; some browsers restrict saving for local files, in which case the app shows a warning and scoring still works in memory.

The separate files below remain the readable source. After editing them, run `npm run bundle` with Node.js 22+ to regenerate `Cricket-Scoreboard.html`. This uses the included dependency-free build script, not a third-party bundler.

## Run the separate source files locally

From the checkout directory, with Python 3 installed:

```sh
cd /workspace/Scoreboard  # or your local checkout directory
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000` in your browser. Stop the static file server with Ctrl+C. Alternatively, `npm start` runs the same command. Do not open `index.html` directly: browsers restrict ES module imports on `file:` URLs.

Everything happens in the browser. The Python command only serves static files. It is needed only when using the separate source files, not the self-contained HTML. To try it on an actual phone on your local Wi-Fi, bind the static server to `0.0.0.0` instead and visit your computer's LAN IP on port 8000; the computer and phone then run **independent simulations**, not two clients of one server. The phone panel inside a single page shares the page's controller.

## Use it

- The physical display uses leading zeroes: three runs digits, two wickets digits, two whole-overs digits, and three target digits. **TO WIN is the fixed target**, never runs remaining.
- Phone buttons add 1, 4 or 6 runs, or subtract 1. Wickets and overs change by one. **Set target** edits the target; **Edit score** corrects any of the four fields. Both open forms directly inside the phone controls, so they do not depend on browser pop-up dialogs. Save applies the correction; Cancel or Escape closes the form.
- All twelve physical buttons use the same rules. Plus/minus changes one unit. **Target +/− can be held to repeat**: one unit immediately, a 400 ms delay, then repeated one-unit steps that accelerate after 2 and 4 seconds. Release, move outside, cancel the touch, lose focus or leave the tab to stop. Mouse, touch and focused Space/Enter work. Repeating stops at 0/999. Undo reverses the entire hold; an intervening scoring action splits a hold into separate history entries so undo preserves that action.
- A reset needs a continuous **2-second hold** with a visible progress indicator. Early release, moving outside the button, pointer cancellation, loss of focus or leaving the tab cancels it. A tap does nothing. Mouse, touch, and focused Space/Enter holds work; keyboard repeat does not restart or repeat a reset.
- Bounds: runs/target 0–999, wickets 0–10, overs 0–99. Invalid values or boundary-crossing actions are rejected in full; values never wrap or silently clamp.
- **Undo** restores the whole last action, including physical adjustments, resets, direct edits and new innings. Undoing +6 removes six runs. No-op changes do not add history.
- **New innings** requires confirmation and an explicit target choice: **use current runs + 1**, keep the current target, clear it to zero, or enter a new target. For example, 199 runs becomes a fixed target of 200. The runs + 1 choice uses the controller's current runs when confirmed; it is unavailable at 999 runs because 1000 will not fit the target display. Runs, wickets and overs reset together. Undo restores the complete previous innings. Zero represents an unset target; the field still displays 000.
- **Disconnect phone** freezes the phone's last received display and blocks its commands. Physical controls continue working. Reconnecting fetches the current controller score and history; offline commands are never queued.
- Score and undo history survive a refresh via `localStorage`, using key `cricket-scoreboard-simulator.v1`. Use the same browser/origin/port to restore them. **Clear saved simulation data** confirms, clears all fields and history, and removes only this app's saved entry. It cannot be undone. Storage failures show a warning and allow scoring in memory.

## Test

Node.js 22+ is sufficient; no `npm install` is needed:

```sh
npm test
# equivalent: node --test tests/*.test.js
```

The focused suite covers scoring, field bounds, invalid input, complete-action undo, independent resets, two-second hold timing and cancellation, reconnection, save restoration, and clearing/corrupt/unavailable storage.

For real browser interaction checks, first start the static server, then run in another terminal with Chromium installed:

```sh
npm run test:browser
```

This dependency-free runner uses Node's built-in WebSocket and Chromium's DevTools protocol. It starts an isolated temporary browser profile, exercises mouse/touch/keyboard holds, dialogs, offline behaviour, persistence, and responsive layouts, then removes the profile. It uses `--no-sandbox` for this container; only run it against this local app. Set `CHROMIUM_PATH` if the executable is not named `chromium`, or `SCOREBOARD_URL` for a different local port. `SCREENSHOT_DIR=/tmp/scoreboard-shots npm run test:browser` optionally saves desktop and phone screenshots. The runner never changes your normal browser's saved score.

## Source map and state flow

| File | Responsibility |
| --- | --- |
| `index.html` | Semantic layout and confirmation/edit dialogs |
| `css/base.css` | Page layout, shared buttons, feedback and footer |
| `css/scoreboard.css` | Physical display, seven-segment illumination and enclosure controls |
| `css/phone.css` | Phone score and control styling |
| `css/panels.css`, `css/responsive.css` | Dialog styling and phone/tablet layout adjustments |
| `js/scoring.js` | Pure scoring rules, validation, snapshots and whole-action undo |
| `js/controller.js` | Single simulated ESP32 source of truth; accepts commands, saves state, broadcasts snapshots |
| `js/phone-connection.js` | Explicit in-process phone transport, disconnect gating and reconnection snapshot |
| `js/hold-reset.js` | Testable monotonic two-second hold timer |
| `js/hold-repeat.js`, `js/repeat-button.js` | Accelerated target repeats and pointer/keyboard press handling |
| `js/physical-controls.js` | Twelve buttons, pointer/keyboard handling, switch/GPIO labels |
| `js/phone-controls.js` | Phone buttons, validated corrections and confirmation dialogs |
| `js/panels.js` | In-page edit/confirmation forms with focus and cancel handling, including embedded viewers without native dialog APIs |
| `js/render.js` | Seven-segment SVGs and interface rendering; no scoring rules |
| `js/storage.js` | Versioned local save/load of score and undo history |
| `js/app.js` | Wires the controller, connection, inputs and renderers together |
| `tests/` | Rule/integration/hold tests and optional real-browser smoke checks |
| `scripts/create-standalone.mjs` | Generates the self-contained downloadable `Cricket-Scoreboard.html` |

The flow is **phone input → connection.send(command) → controller.dispatch(command) → scoring engine → persist → broadcast → display and connected phone**. Physical input enters at `controller.dispatch(command)`. Both use the very same engine. Snapshots are copies; views cannot mutate the controller. The controller applies commands synchronously so each action finishes before the next begins.

Command examples:

```js
{ type: 'adjust', field: 'runs', amount: 6 }
{ type: 'set', field: 'target', value: 201 }
{ type: 'reset', field: 'overs' }
{ type: 'new-innings', target: 124 }
{ type: 'new-innings', targetChoice: 'runs-plus-one' }
{ type: 'undo' }
```

Every command returns `{ ok, message, ... }`. Successful replies include `changed` and a snapshot with `{ score, canUndo, undoLabel, historyCount }`. `subscribe(callback)` immediately supplies the current snapshot and then every update. A successful reset command is generated only after the physical input layer has verified the continuous hold.

Target repeat commands carry a `groupId` for each press. The engine combines consecutive steps with that ID into one undo entry, while broadcasting and saving every new value. Group tracking is runtime-only; the resulting score and undo entry are persisted normally. Any intervening successful action ends the group.

## Later: ESP32 connection

Replace `SimulatedPhoneConnection` with an adapter exposing the same `send`, `subscribe`, `setConnected`, and `connected` interface. Its `send` is already asynchronous. HTTP can carry commands and current-state requests; WebSocket can deliver updates. Move controller authority, validation, undo and persistence to the actual ESP32, with physical buttons entering that controller. Fetch a fresh authoritative snapshot on every connection; never infer it from the phone's cache. A real transport must also handle acknowledgements, concurrent commands, connection failures and duplicate/retried requests.

The browser digit rendering, phone input controls and command schema can remain. The simulated controller, physical button event binding and browser storage are development substitutes. Hardware debounce (approximately 30 ms), startup blanking, 80-bit driver shifting, nonvolatile wear management, GPIO and power circuitry are outside this app.

The schematic maps D1–D3 to runs, D4–D5 to wickets, D6–D7 to overs and D8–D10 to target; this simulator draws the same ten static seven-segment digits in the suggested two-by-two field arrangement. Physical labels follow SW2–SW13 and GPIO 13/14/16, 17/18/19, 21/22/32 and 33/34/35 respectively. The BOM's power, driver, panel and enclosure selections provide context; this simulation does not verify their electrical compatibility, brightness or cost.

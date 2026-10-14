// Optional real-browser checks using Chromium's DevTools protocol and Node built-ins.
// Start the static server first. No Playwright, npm packages, or browser downloads.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const url = process.env.SCOREBOARD_URL ?? 'http://127.0.0.1:8000';
const profile = await mkdtemp(join(tmpdir(), 'scoreboard-browser-'));
const browser = spawn(process.env.CHROMIUM_PATH ?? 'chromium', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let passed = 0;

try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chromium did not start in 15 seconds.')), 15000);
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited early (${code}). ${output.slice(-1000)}`)); });
    browser.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const debuggingOrigin = new URL(endpoint).origin.replace('ws:', 'http:');
  const targets = await (await fetch(`${debuggingOrigin}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Browser command timed out: ${method}`)); }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    const page = await evaluate('({ url: location.href, ready: document.readyState, text: document.body?.innerText.slice(0, 400) })');
    throw new Error(`Page condition did not become true: ${expression}\n${JSON.stringify({ page, errors })}`);
  }
  const selector = value => JSON.stringify(value);
  const click = value => evaluate(`document.querySelector(${selector(value)}).click()`);
  const text = value => evaluate(`document.querySelector(${selector(value)}).textContent`);
  async function fill(value, contents) {
    await evaluate(`{ const input = document.querySelector(${selector(value)}); input.value = ${JSON.stringify(contents)}; input.dispatchEvent(new Event('change', { bubbles: true })); }`);
  }
  async function edit(field, value) {
    await click('#correct');
    await fill('#edit-field', field);
    await fill('#edit-value', String(value));
    await click('#edit-form [type="submit"]');
    await waitFor('document.getElementById("edit-dialog").hidden');
  }
  const score = () => evaluate('Object.fromEntries(["runs", "wickets", "overs", "target"].map(field => [field, Number(document.getElementById(`phone-${field}`).textContent)]))');
  const pass = label => { passed++; console.log(`PASS ${label}`); };
  const resetSelector = field => `[aria-label="Physical: hold 2 seconds to reset ${field}"]`;
  async function center(value) {
    return evaluate(`(() => { const element = document.querySelector(${selector(value)}); element.scrollIntoView({ block: 'center' }); const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  }
  async function mouseHold(field, milliseconds, moveAway = false) {
    return mouseHoldButton(resetSelector(field), milliseconds, moveAway);
  }
  async function mouseHoldButton(button, milliseconds, moveAway = false) {
    const point = await center(button);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await delay(milliseconds);
    if (moveAway) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 200, y: point.y });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async function screenshot(name) {
    if (!process.env.SCREENSHOT_DIR) return;
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(process.env.SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
  }

  await send('Runtime.enable');
  await send('Page.enable');
  if (process.env.NO_NATIVE_DIALOGS) {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'HTMLDialogElement.prototype.showModal = undefined; HTMLDialogElement.prototype.close = undefined;',
    });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1150, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await waitFor('document.querySelectorAll(".seven-segment").length === 10 && document.querySelectorAll(".physical-row button").length === 12');
  assert.equal(await evaluate('document.querySelectorAll(".segment").length'), 70);
  pass('ten seven-segment digits and twelve physical controls render');

  await click('#edit-target');
  assert.equal(await evaluate('document.getElementById("edit-dialog").hasAttribute("open")'), true);
  assert.equal(await evaluate('document.querySelector(".phone-panel").contains(document.getElementById("edit-dialog"))'), true);
  assert.equal(await evaluate('document.querySelectorAll("dialog").length'), 0);
  assert.equal(await text('#edit-title'), 'Set target to win');
  assert.equal(await evaluate('document.getElementById("edit-field").disabled'), true);
  await fill('#edit-value', '201');
  await click('#edit-form [type="submit"]');
  await waitFor('!document.getElementById("edit-dialog").hasAttribute("open")');
  assert.equal((await score()).target, 201);
  await click('#correct');
  assert.equal(await text('#edit-title'), 'Edit score');
  assert.equal(await evaluate('document.getElementById("edit-field").disabled'), false);
  await click('#edit-dialog [data-close-dialog]');
  pass('Set target opens and saves; Edit score re-enables the field selector');
  await click('[data-phone-field="runs"][data-amount="6"]');
  assert.equal((await score()).runs, 6);
  assert.equal((await score()).target, 201);
  await click('#undo');
  assert.equal((await score()).runs, 0);
  pass('phone +6, fixed target, and whole-action undo');

  await edit('runs', 123);
  await edit('wickets', 4);
  await edit('overs', 25);
  await screenshot('desktop.png');
  await click('#correct');
  for (const invalid of ['', '-1', '2.5', '1000']) {
    await fill('#edit-value', invalid);
    await click('#edit-form [type="submit"]');
    assert.ok(await text('#edit-error'));
    assert.equal((await score()).runs, 123);
  }
  await click('#edit-dialog [data-close-dialog]');
  pass('direct corrections for every field; invalid input stays rejected');

  await mouseHold('runs', 350);
  assert.equal((await score()).runs, 123);
  assert.match(await text('#action-status'), /cancelled/);
  const point = await center(resetSelector('runs'));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await delay(750);
  assert.match(await text(`${resetSelector('runs')} .hold-label`), /Holding/);
  const progress = await evaluate(`Number(document.querySelector(${selector(resetSelector('runs'))}).style.getPropertyValue('--hold-progress'))`);
  assert.ok(progress > 0 && progress < 1);
  await delay(1400);
  assert.deepEqual(await score(), { runs: 0, wickets: 4, overs: 25, target: 201 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await click('#undo');
  assert.equal((await score()).runs, 123);
  await mouseHold('runs', 300, true);
  await delay(1900);
  assert.equal((await score()).runs, 123);
  pass('mouse short hold, visible progress, full reset, undo, and drag cancellation');

  await evaluate(`document.querySelector(${selector(resetSelector('wickets'))}).focus()`);
  const key = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await delay(350);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  assert.equal((await score()).wickets, 4);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await delay(1000);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', autoRepeat: true, ...key });
  await delay(1150);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  assert.equal((await score()).wickets, 0);
  await click('#undo');
  pass('keyboard short and full hold; auto-repeat does not restart the timer');

  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchPoint = await center(resetSelector('overs'));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touchPoint, id: 0 }] });
  await delay(350);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await score()).overs, 25);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touchPoint, id: 0 }] });
  await delay(2150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await score()).overs, 0);
  await click('#undo');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  pass('touch early release cancels; full hold resets just overs');

  await click('#toggle-connection');
  assert.equal(await evaluate('document.getElementById("phone-command-controls").disabled'), true);
  await click('[data-phone-field="runs"][data-amount="6"]');
  assert.equal((await score()).runs, 123);
  await click('[aria-label="Physical: add 1 run"]');
  assert.equal((await score()).runs, 123);
  assert.equal(await evaluate('document.querySelector("[data-display=runs]").getAttribute("aria-label")'), 'Runs 124');
  await mouseHold('target', 2150);
  assert.equal((await score()).target, 201);
  await click('#toggle-connection');
  assert.deepEqual(await score(), { runs: 124, wickets: 4, overs: 25, target: 0 });
  await click('#undo');
  assert.equal((await score()).target, 201);
  pass('offline phone is blocked; physical actions continue; reconnect and undo synchronise');

  const targetPlus = '[aria-label="Physical: add 1 target"]';
  const targetMinus = '[aria-label="Physical: subtract 1 target"]';
  await mouseHoldButton(targetPlus, 70);
  assert.equal((await score()).target, 202);
  await delay(500);
  assert.equal((await score()).target, 202);
  await click('#undo');
  const countBeforeHold = await text('#history-count');
  await mouseHoldButton(targetPlus, 2300);
  const heldTarget = (await score()).target;
  assert.ok(heldTarget > 211);
  await delay(500);
  assert.equal((await score()).target, heldTarget);
  await click('#undo');
  assert.equal((await score()).target, 201);
  assert.equal(await text('#history-count'), countBeforeHold);
  await mouseHoldButton(targetMinus, 700, true);
  const cancelledTarget = (await score()).target;
  assert.ok(cancelledTarget < 201);
  await delay(500);
  assert.equal((await score()).target, cancelledTarget);
  await click('#undo');
  assert.equal((await score()).target, 201);
  pass('target mouse tap changes one; hold repeats; release/drag stop; undo restores the whole hold');

  await evaluate(`document.querySelector(${selector(targetPlus)}).focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await delay(700);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', autoRepeat: true, ...key });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  assert.ok((await score()).target > 202);
  const keyboardTarget = (await score()).target;
  await delay(500);
  assert.equal((await score()).target, keyboardTarget);
  await click('#undo');
  assert.equal((await score()).target, 201);
  await evaluate(`document.querySelector(${selector(targetMinus)}).focus()`);
  const enterKey = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...enterKey });
  await delay(70);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...enterKey });
  assert.equal((await score()).target, 200);
  await click('#undo');
  pass('target keyboard holds repeat; Space/Enter do not duplicate a tap');

  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const targetTouch = await center(targetPlus);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...targetTouch, id: 0 }] });
  await delay(1000);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await score()).target > 202);
  await click('#undo');
  assert.equal((await score()).target, 201);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...targetTouch, id: 0 }] });
  await delay(600);
  await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const touchCancelled = (await score()).target;
  await delay(500);
  assert.equal((await score()).target, touchCancelled);
  await click('#undo');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  pass('target touch holds repeat; release and touch cancellation stop them');

  for (const [start, button, bound] of [[998, targetPlus, 999], [1, targetMinus, 0]]) {
    await edit('target', start);
    await mouseHoldButton(button, 1200);
    assert.equal((await score()).target, bound);
    await click('#undo');
    assert.equal((await score()).target, start);
    await click('#undo');
    assert.equal((await score()).target, 201);
  }
  pass('target hold stops at 0/999 without wrapping or adding failed steps to undo');

  await edit('target', 0);
  const longHoldPoint = await center(targetPlus);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...longHoldPoint, button: 'left', clickCount: 1 });
  const reachDeadline = Date.now() + 10000;
  while ((await score()).target < 200 && Date.now() < reachDeadline) await delay(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...longHoldPoint, button: 'left', clickCount: 1 });
  assert.ok((await score()).target >= 200, 'A continuous hold should reach 200 within ten seconds.');
  await click('#undo');
  assert.equal((await score()).target, 0);
  await click('#undo');
  assert.equal((await score()).target, 201);
  pass('one accelerated hold reaches a target of 200 and undoes in one action');

  await click('#toggle-connection');
  await mouseHoldButton(targetPlus, 700);
  assert.equal((await score()).target, 201);
  await click('#toggle-connection');
  assert.ok((await score()).target > 202);
  await click('#undo');
  assert.equal((await score()).target, 201);
  pass('target holds continue while phone is offline and synchronise on reconnect');

  const beforeChase = await score();
  await click('#new-innings');
  assert.equal(Number(await text('#innings-chase-target')), beforeChase.runs + 1);
  await click('[name="target-choice"][value="runs-plus-one"]');
  assert.deepEqual(await score(), beforeChase, 'Choosing an option must not reset scores before confirmation.');
  await click('[aria-label="Physical: add 1 run"]');
  assert.equal(Number(await text('#innings-chase-target')), beforeChase.runs + 2);
  const beforeChaseConfirmation = await score();
  await click('#innings-form [type="submit"]');
  assert.deepEqual(await score(), { runs: 0, wickets: 0, overs: 0, target: beforeChaseConfirmation.runs + 1 });
  await click('#undo');
  assert.deepEqual(await score(), beforeChaseConfirmation);
  await click('#undo');
  assert.deepEqual(await score(), beforeChase);
  pass('new innings uses current runs + 1 at confirmation, displays live changes, and undoes atomically');

  await edit('runs', 999);
  await edit('wickets', 10);
  await edit('overs', 99);
  await edit('target', 999);
  for (const field of ['runs', 'wickets', 'overs']) await click(`[data-phone-field="${field}"][data-amount="1"]`);
  await click('[aria-label="Physical: add 1 target"]');
  assert.deepEqual(await score(), { runs: 999, wickets: 10, overs: 99, target: 999 });
  assert.ok(await evaluate('document.getElementById("action-status").classList.contains("error")'));
  pass('phone and physical upper bounds reject increments without wrapping');

  for (const width of [320, 390, 768, 1280, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.scrollTo(0, 0)');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `Horizontal overflow at ${width}px`);
    const buttonsFit = await evaluate('[...document.querySelectorAll("button")].filter(button => button.getClientRects().length > 0).every(button => { const r = button.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1 && r.height >= 44; })');
    assert.ok(buttonsFit, `Touch targets or layout failed at ${width}px`);
    if (width === 390) await screenshot('phone.png');
  }
  pass('320, 390, 768, 1280 and 1440px layouts fit; buttons meet 44px minimum height');

  await click('#new-innings');
  assert.equal(await evaluate('document.querySelector("[name=target-choice][value=runs-plus-one]").disabled'), true);
  assert.match(await text('#innings-chase-target'), /exceeds/);
  await click('#innings-form [type="submit"]');
  assert.match(await text('#innings-error'), /Choose a target/);
  await click('#innings-dialog [data-close-dialog]');
  assert.equal((await score()).runs, 999);
  await click('#new-innings');
  await click('[name="target-choice"][value="custom"]');
  await fill('#innings-target', '202');
  await click('#innings-form [type="submit"]');
  assert.deepEqual(await score(), { runs: 0, wickets: 0, overs: 0, target: 202 });
  await click('#undo');
  assert.deepEqual(await score(), { runs: 999, wickets: 10, overs: 99, target: 999 });
  pass('new innings requires an explicit target and confirmation; cancel and undo preserve score');

  const beforeReload = await score();
  await send('Page.reload');
  await waitFor('document.querySelectorAll(".physical-row button").length === 12');
  assert.deepEqual(await score(), beforeReload);
  assert.equal(await evaluate('document.getElementById("undo").disabled'), false);
  await click('#undo');
  assert.deepEqual(await score(), { runs: 999, wickets: 10, overs: 99, target: 201 });
  pass('page reload restores score and undo history');

  await evaluate('localStorage.setItem("unrelated-browser-check", "keep")');
  await click('#clear-data');
  await click('#clear-dialog [data-close-dialog]');
  assert.equal((await score()).runs, 999);
  await click('#clear-data');
  await click('#clear-form [type="submit"]');
  assert.deepEqual(await score(), { runs: 0, wickets: 0, overs: 0, target: 0 });
  assert.equal(await evaluate('localStorage.getItem("cricket-scoreboard-simulator.v1")'), null);
  assert.equal(await evaluate('localStorage.getItem("unrelated-browser-check")'), 'keep');
  await send('Page.reload');
  await waitFor('document.querySelectorAll(".physical-row button").length === 12');
  assert.equal((await score()).runs, 0);
  assert.equal(await evaluate('document.getElementById("undo").disabled'), true);
  pass('confirmed clear removes only simulator storage and history; refresh remains zero');

  assert.deepEqual(errors, [], 'Unexpected browser JavaScript errors');
  console.log(`\n${passed} browser checks passed. No browser JavaScript errors.`);
} finally {
  socket?.close();
  const exited = new Promise(resolve => browser.once('exit', resolve));
  browser.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (browser.exitCode === null) browser.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

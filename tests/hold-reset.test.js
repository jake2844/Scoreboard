import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldReset } from '../js/hold-reset.js';

function fakeHold() {
  let time = 0;
  let pending;
  let completed = 0;
  let progress = 0;
  const hold = new HoldReset({
    now: () => time,
    schedule: callback => { pending = callback; return 1; },
    unschedule: () => { pending = null; },
    complete: () => completed++,
    progress: value => { progress = value; },
  });
  return {
    hold,
    advance: (milliseconds, tick = true) => { time += milliseconds; if (tick && pending) { const callback = pending; pending = null; callback(); } },
    get completed() { return completed; },
    get progress() { return progress; },
  };
}

test('early release cancels; the next hold starts from zero', () => {
  const clock = fakeHold();
  clock.hold.start();
  clock.advance(1999);
  assert.equal(clock.completed, 0);
  assert.ok(clock.progress > .99);
  assert.equal(clock.hold.release(), false);
  assert.equal(clock.progress, 0);
  clock.advance(5000);
  assert.equal(clock.completed, 0);
  clock.hold.start();
  clock.advance(1);
  assert.equal(clock.completed, 0);
  clock.advance(1999);
  assert.equal(clock.completed, 1);
});

test('continuous two-second hold fires exactly once, even when held longer', () => {
  const clock = fakeHold();
  clock.hold.start();
  clock.advance(1000);
  assert.equal(clock.progress, .5);
  clock.hold.start(); // Key auto-repeat must not restart the clock.
  clock.advance(1000);
  assert.equal(clock.completed, 1);
  clock.advance(10000);
  clock.hold.release();
  assert.equal(clock.completed, 1);
});

test('pointer cancellation or loss of focus never completes a reset', () => {
  const clock = fakeHold();
  clock.hold.start();
  clock.advance(1900);
  clock.hold.cancel();
  clock.advance(5000);
  assert.equal(clock.completed, 0);
  assert.equal(clock.hold.active, false);
  assert.equal(clock.progress, 0);
});

test('elapsed time governs release even if the timer callback was delayed', () => {
  const clock = fakeHold();
  clock.hold.start();
  clock.advance(2000, false);
  assert.equal(clock.hold.release(), true);
  assert.equal(clock.completed, 1);
  clock.advance(1000);
  assert.equal(clock.completed, 1);
});

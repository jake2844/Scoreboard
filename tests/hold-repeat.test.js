import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldRepeat } from '../js/hold-repeat.js';

function fakeRepeat(step = () => true) {
  let time = 0;
  let pending = null;
  let nextDelay = null;
  let steps = 0;
  const repeat = new HoldRepeat({
    step: () => { steps++; return step(); },
    now: () => time,
    schedule: (callback, delay) => { pending = callback; nextDelay = delay; return 1; },
    unschedule: () => { pending = null; nextDelay = null; },
  });
  return {
    repeat,
    tick: () => {
      if (!pending) return;
      time += nextDelay;
      const callback = pending;
      pending = null;
      nextDelay = null;
      callback();
    },
    stall: milliseconds => { time += milliseconds; },
    get steps() { return steps; },
    get nextDelay() { return nextDelay; },
  };
}

test('a tap changes one unit immediately; release cancels any repeats', () => {
  const clock = fakeRepeat();
  clock.repeat.start();
  assert.equal(clock.steps, 1);
  assert.equal(clock.nextDelay, 400);
  clock.repeat.stop();
  clock.tick();
  assert.equal(clock.steps, 1);
  assert.equal(clock.repeat.active, false);
});

test('held button repeats and accelerates; keyboard auto-repeat cannot restart it', () => {
  const clock = fakeRepeat();
  clock.repeat.start();
  clock.tick();
  assert.equal(clock.steps, 2);
  assert.equal(clock.nextDelay, 120);
  clock.repeat.start();
  assert.equal(clock.steps, 2);
  while (clock.nextDelay !== 50) clock.tick();
  while (clock.nextDelay !== 20) clock.tick();
  assert.ok(clock.steps > 20);
  clock.repeat.stop();
  assert.equal(clock.nextDelay, null);
});

test('a rejected step at a bound stops repeating instead of flooding commands', () => {
  let target = 997;
  const clock = fakeRepeat(() => {
    if (target === 999) return false;
    target++;
    return true;
  });
  clock.repeat.start(); clock.tick(); clock.tick();
  assert.equal(target, 999);
  assert.equal(clock.repeat.active, false);
  const steps = clock.steps;
  clock.tick();
  assert.equal(clock.steps, steps);
  assert.equal(clock.nextDelay, null);
});

test('release, cancellation, and a new press do not reuse the previous timer', () => {
  const clock = fakeRepeat();
  clock.repeat.start(); clock.tick();
  clock.repeat.stop();
  clock.stall(10000);
  clock.tick();
  assert.equal(clock.steps, 2);
  clock.repeat.start();
  assert.equal(clock.steps, 3);
  assert.equal(clock.nextDelay, 400);
});

test('a delayed callback performs only one step rather than catching up in a burst', () => {
  const clock = fakeRepeat();
  clock.repeat.start();
  clock.stall(10000);
  clock.tick();
  assert.equal(clock.steps, 2);
  assert.equal(clock.nextDelay, 20);
});

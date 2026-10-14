import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoringEngine, FIELDS, parseScoreInput, emptyScore } from '../js/scoring.js';

test('runs +1, +4, +6, -1 are whole actions; target stays fixed', () => {
  const engine = new ScoringEngine();
  engine.apply({ type: 'set', field: 'target', value: 201 });
  for (const amount of [1, 4, 6, -1]) engine.apply({ type: 'adjust', field: 'runs', amount });
  assert.deepEqual(engine.snapshot().score, { runs: 10, wickets: 0, overs: 0, target: 201 });
  engine.apply({ type: 'undo' });
  assert.equal(engine.snapshot().score.runs, 11);
  engine.apply({ type: 'undo' });
  assert.equal(engine.snapshot().score.runs, 5);
  assert.equal(engine.snapshot().score.target, 201);
});

for (const [field, { max }] of Object.entries(FIELDS)) {
  test(`${field}: rejects underflow, overflow, and invalid direct edits without history changes`, () => {
    const engine = new ScoringEngine();
    assert.throws(() => engine.apply({ type: 'adjust', field, amount: -1 }));
    assert.equal(engine.snapshot().historyCount, 0);
    engine.apply({ type: 'set', field, value: max });
    const before = engine.exportData();
    for (const value of [-1, max + 1, 1.5, NaN, Infinity, '4', null, undefined]) {
      assert.throws(() => engine.apply({ type: 'set', field, value }));
      assert.deepEqual(engine.exportData(), before);
    }
    assert.throws(() => engine.apply({ type: 'adjust', field, amount: 1 }));
    assert.deepEqual(engine.exportData(), before);
    engine.apply({ type: 'adjust', field, amount: -1 });
    assert.equal(engine.snapshot().score[field], max - 1);
  });

  test(`${field}: reset changes only its own field and undo restores it`, () => {
    const initial = { runs: 123, wickets: 4, overs: 25, target: 201 };
    const engine = new ScoringEngine({ score: initial, history: [] });
    engine.apply({ type: 'reset', field });
    assert.deepEqual(engine.snapshot().score, { ...initial, [field]: 0 });
    engine.apply({ type: 'undo' });
    assert.deepEqual(engine.snapshot().score, initial);
  });
}

test('a boundary-crossing +6 is rejected in its entirety', () => {
  const engine = new ScoringEngine({ score: { ...emptyScore(), runs: 997 }, history: [] });
  assert.throws(() => engine.apply({ type: 'adjust', field: 'runs', amount: 6 }));
  assert.equal(engine.snapshot().score.runs, 997);
  assert.equal(engine.snapshot().historyCount, 0);
});

test('new innings requires a target, resets three fields atomically, and undoes atomically', () => {
  const initial = { runs: 123, wickets: 4, overs: 25, target: 201 };
  const engine = new ScoringEngine({ score: initial, history: [] });
  assert.throws(() => engine.apply({ type: 'new-innings' }));
  assert.throws(() => engine.apply({ type: 'new-innings', target: 1000 }));
  assert.deepEqual(engine.snapshot().score, initial);
  engine.apply({ type: 'new-innings', target: 124 });
  assert.deepEqual(engine.snapshot().score, { ...emptyScore(), target: 124 });
  assert.equal(engine.snapshot().historyCount, 1);
  engine.apply({ type: 'undo' });
  assert.deepEqual(engine.snapshot().score, initial);
  engine.apply({ type: 'new-innings', target: 0 });
  assert.deepEqual(engine.snapshot().score, emptyScore());
});

test('no-op edits and resets do not obscure the last undoable action', () => {
  const engine = new ScoringEngine();
  engine.apply({ type: 'adjust', field: 'runs', amount: 6 });
  assert.equal(engine.apply({ type: 'set', field: 'runs', value: 6 }).changed, false);
  assert.equal(engine.apply({ type: 'reset', field: 'overs' }).changed, false);
  assert.equal(engine.snapshot().historyCount, 1);
  engine.apply({ type: 'undo' });
  assert.deepEqual(engine.snapshot().score, emptyScore());
  assert.throws(() => engine.apply({ type: 'undo' }));
});

test('reject malformed commands and score text', () => {
  const engine = new ScoringEngine();
  for (const action of [null, {}, { type: 'clear' }, { type: 'set', field: '__proto__', value: 1 },
    { type: 'adjust', field: 'runs', amount: 1.1 }, { type: 'adjust', field: 'runs', amount: '6' }]) {
    assert.throws(() => engine.apply(action));
  }
  for (const text of ['', ' ', '-1', '+1', '2.5', '1e2', '0x10', 'NaN', '12abc', '1 2', '1000']) {
    assert.throws(() => parseScoreInput('runs', text));
  }
  assert.equal(parseScoreInput('runs', ' 012 '), 12);
  assert.equal(parseScoreInput('overs', '99'), 99);
  assert.throws(() => parseScoreInput('overs', '100'));
});

test('snapshots and exports cannot mutate state or history', () => {
  const engine = new ScoringEngine();
  engine.apply({ type: 'adjust', field: 'runs', amount: 4 });
  engine.snapshot().score.runs = 800;
  engine.exportData().history[0].score.runs = 900;
  assert.equal(engine.snapshot().score.runs, 4);
  engine.apply({ type: 'undo' });
  assert.equal(engine.snapshot().score.runs, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoringEngine, emptyScore } from '../js/scoring.js';
import { ScoreboardController } from '../js/controller.js';
import { SimulatedPhoneConnection } from '../js/phone-connection.js';
import { loadEngine, STORAGE_KEY } from '../js/storage.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('both interfaces share one controller and see each successful command immediately', async () => {
  const controller = new ScoreboardController();
  const phone = new SimulatedPhoneConnection(controller);
  let received;
  phone.subscribe(message => { received = message.snapshot; });
  await phone.send({ type: 'adjust', field: 'runs', amount: 6 });
  assert.equal(controller.getSnapshot().score.runs, 6);
  controller.dispatch({ type: 'adjust', field: 'wickets', amount: 1 });
  assert.equal(received.score.wickets, 1);
  controller.dispatch({ type: 'reset', field: 'runs' });
  assert.equal(received.score.runs, 0);
  await phone.send({ type: 'undo' });
  assert.equal(received.score.runs, 6);
  assert.equal(received.score.wickets, 1);
  await phone.send({ type: 'undo' });
  assert.equal(received.score.wickets, 0);
});

test('offline phone cannot send; physical controls work; reconnect fetches current state', async () => {
  const controller = new ScoreboardController();
  const phone = new SimulatedPhoneConnection(controller);
  let received;
  phone.subscribe(message => { received = message; });
  await phone.send({ type: 'adjust', field: 'runs', amount: 4 });
  phone.setConnected(false);
  for (const action of [{ type: 'adjust', field: 'runs', amount: 6 }, { type: 'undo' }, { type: 'new-innings', target: 200 }, { type: 'set', field: 'target', value: 50 }]) {
    assert.equal((await phone.send(action)).ok, false);
  }
  controller.dispatch({ type: 'adjust', field: 'runs', amount: 1 });
  controller.dispatch({ type: 'set', field: 'target', value: 201 });
  assert.equal(received.snapshot.score.runs, 4);
  assert.equal(controller.getSnapshot().score.runs, 5);
  phone.setConnected(true);
  assert.equal(received.connected, true);
  assert.equal(received.snapshot.score.runs, 5);
  assert.equal(received.snapshot.score.target, 201);
  assert.equal(received.snapshot.historyCount, 3);
  assert.equal((await phone.send({ type: 'adjust', field: 'overs', amount: 1 })).ok, true);
});

test('a receiver cannot mutate another receiver or the controller', () => {
  const controller = new ScoreboardController();
  const phone = new SimulatedPhoneConnection(controller);
  phone.subscribe(message => { message.snapshot.score.runs = 999; });
  let received;
  phone.subscribe(message => { received = message; });
  controller.dispatch({ type: 'adjust', field: 'runs', amount: 1 });
  assert.equal(received.snapshot.score.runs, 1);
  assert.equal(controller.getSnapshot().score.runs, 1);
});

test('refresh restores controller score and whole-action undo history', () => {
  const storage = memoryStorage();
  const first = new ScoreboardController(new ScoringEngine(), storage);
  first.dispatch({ type: 'set', field: 'target', value: 201 });
  first.dispatch({ type: 'adjust', field: 'runs', amount: 6 });
  first.dispatch({ type: 'reset', field: 'target' });
  const loaded = loadEngine(storage);
  assert.equal(loaded.warning, '');
  const restored = new ScoreboardController(loaded.engine, storage);
  assert.deepEqual(restored.getSnapshot(), first.getSnapshot());
  restored.dispatch({ type: 'undo' });
  assert.equal(restored.getSnapshot().score.target, 201);
  restored.dispatch({ type: 'undo' });
  assert.equal(restored.getSnapshot().score.runs, 0);
  assert.equal(loadEngine(storage).engine.snapshot().score.runs, 0);
});

test('clear removes only simulator data, resets score and history, and informs connected phone', async () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep me');
  const controller = new ScoreboardController(new ScoringEngine(), storage);
  const phone = new SimulatedPhoneConnection(controller);
  let received;
  phone.subscribe(message => { received = message; });
  await phone.send({ type: 'adjust', field: 'runs', amount: 6 });
  assert.equal(controller.clearSavedData().ok, true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep me');
  assert.deepEqual(received.snapshot.score, emptyScore());
  assert.equal(received.snapshot.canUndo, false);
  assert.deepEqual(loadEngine(storage).engine.snapshot().score, emptyScore());
});

test('corrupt storage and denied saving do not prevent in-memory scoring', () => {
  const storage = memoryStorage();
  for (const value of ['{broken', '{"version":2}', '{"version":1,"data":{"score":{"runs":1000}}}']) {
    storage.setItem(STORAGE_KEY, value);
    const loaded = loadEngine(storage);
    assert.ok(loaded.warning);
    assert.deepEqual(loaded.engine.snapshot().score, emptyScore());
  }
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  const controller = new ScoreboardController(loadEngine(denied).engine, denied);
  assert.equal(controller.dispatch({ type: 'adjust', field: 'runs', amount: 4 }).ok, true);
  assert.equal(controller.getSnapshot().score.runs, 4);
  assert.ok(controller.storageWarning);
  assert.equal(controller.clearSavedData().ok, false);
  assert.equal(controller.getSnapshot().score.runs, 4);
});

test('save restoration preserves the full target hold as one undo action', () => {
  const storage = memoryStorage();
  const controller = new ScoreboardController(new ScoringEngine(), storage);
  for (let step = 0; step < 200; step++) {
    controller.dispatch({ type: 'adjust', field: 'target', amount: 1, groupId: 'hold' });
  }
  const restored = new ScoreboardController(loadEngine(storage).engine, storage);
  assert.equal(restored.getSnapshot().score.target, 200);
  assert.equal(restored.getSnapshot().historyCount, 1);
  restored.dispatch({ type: 'undo' });
  assert.equal(restored.getSnapshot().score.target, 0);
});

import { ScoringEngine } from './scoring.js';

export const STORAGE_KEY = 'cricket-scoreboard-simulator.v1';

// Persist the controller state and undo history together, never a phone snapshot.
export function loadEngine(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { engine: new ScoringEngine(), warning: '' };
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw new Error('Unsupported save version.');
    return { engine: new ScoringEngine(saved.data), warning: '' };
  } catch {
    return {
      engine: new ScoringEngine(),
      warning: 'Saved data could not be read. Starting at zero; clear saved data to remove an invalid save. Scores still work in memory.',
    };
  }
}

export function saveEngine(storage, engine) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: engine.exportData() }));
}

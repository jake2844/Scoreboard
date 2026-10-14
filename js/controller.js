import { ScoringEngine } from './scoring.js';
import { saveEngine, STORAGE_KEY } from './storage.js';

// Represents U1, the ESP32: every input is serialised through this one controller.
export class ScoreboardController {
  #engine;
  #storage;
  #listeners = new Set();
  storageWarning = '';

  constructor(engine = new ScoringEngine(), storage = null) {
    this.#engine = engine;
    this.#storage = storage;
  }

  getSnapshot() { return this.#engine.snapshot(); }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  }

  #broadcast() {
    for (const listener of this.#listeners) listener(this.getSnapshot());
  }

  dispatch(action) {
    try {
      const result = this.#engine.apply(action);
      if (result.changed) {
        this.storageWarning = '';
        if (this.#storage) {
          try { saveEngine(this.#storage, this.#engine); }
          catch { this.storageWarning = 'Local saving is unavailable. This score is held in memory only.'; }
        }
        this.#broadcast();
      }
      return { ok: true, ...result, snapshot: this.getSnapshot() };
    } catch (error) {
      return { ok: false, changed: false, message: error.message };
    }
  }

  // An explicit simulation maintenance action, deliberately outside score undo.
  clearSavedData() {
    try {
      this.#storage?.removeItem(STORAGE_KEY);
    } catch {
      return { ok: false, message: 'Saved data could not be cleared. Check browser storage permissions.' };
    }
    this.#engine = new ScoringEngine();
    this.storageWarning = '';
    this.#broadcast();
    return { ok: true, message: 'Saved simulation data cleared. All fields and undo history are now zero.' };
  }
}

// This is the transport boundary for a future ESP32 HTTP/WebSocket adapter.
// Public interface: send(command), subscribe(callback), setConnected(boolean), connected.
// Snapshot payload: { score, canUndo, undoLabel, historyCount }. No DOM dependencies.
export class SimulatedPhoneConnection {
  #controller;
  #snapshot;
  #connected = true;
  #listeners = new Set();

  constructor(controller) {
    this.#controller = controller;
    controller.subscribe(snapshot => {
      if (!this.#connected) return;
      this.#snapshot = snapshot;
      this.#notify();
    });
  }

  get connected() { return this.#connected; }

  #notify() {
    for (const listener of this.#listeners) {
      // Each receiver gets its own copy; no caller can change the controller state.
      listener({ connected: this.#connected, snapshot: structuredClone(this.#snapshot) });
    }
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener({ connected: this.#connected, snapshot: structuredClone(this.#snapshot) });
    return () => this.#listeners.delete(listener);
  }

  async send(command) {
    if (!this.#connected) return { ok: false, message: 'Phone is disconnected. Reconnect before sending a command.' };
    return this.#controller.dispatch(command);
  }

  setConnected(connected) {
    this.#connected = Boolean(connected);
    // Offline commands are rejected, never queued or replayed on reconnection.
    if (this.#connected) this.#snapshot = this.#controller.getSnapshot();
    this.#notify();
  }
}

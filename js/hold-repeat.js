// One step immediately, then repeat while pressed. No burst of catch-up steps.
// Every step still changes the target by exactly one through the scoring engine.
export class HoldRepeat {
  #started = null;
  #timer = null;

  constructor({ step, now = () => performance.now(),
    schedule = (callback, delay) => setTimeout(callback, delay), unschedule = id => clearTimeout(id) }) {
    Object.assign(this, { step, now, schedule, unschedule });
  }

  get active() { return this.#started !== null; }

  start() {
    if (this.active) return;
    this.#started = this.now();
    if (this.step() === false) { this.stop(); return; }
    this.#timer = this.schedule(this.#tick, 400);
  }

  #tick = () => {
    this.#timer = null;
    if (!this.active) return;
    if (this.step() === false) { this.stop(); return; }
    const elapsed = this.now() - this.#started;
    const interval = elapsed >= 4000 ? 20 : elapsed >= 2000 ? 50 : 120;
    this.#timer = this.schedule(this.#tick, interval);
  };

  stop() {
    if (this.#timer !== null) this.unschedule(this.#timer);
    this.#timer = null;
    this.#started = null;
  }
}

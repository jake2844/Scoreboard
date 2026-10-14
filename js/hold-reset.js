// A continuous hold, measured with a monotonic clock. Inject time in focused tests.
export class HoldReset {
  #started = null;
  #timer = null;

  constructor({ complete, progress = () => {}, duration = 2000,
    now = () => performance.now(), schedule = callback => setTimeout(callback, 16),
    unschedule = id => clearTimeout(id) }) {
    Object.assign(this, { complete, progress, duration, now, schedule, unschedule });
  }

  get active() { return this.#started !== null; }

  start() {
    if (this.active) return; // Keyboard auto-repeat cannot restart or shorten the hold.
    this.#started = this.now();
    this.progress(0);
    this.#tick();
  }

  #tick = () => {
    this.#timer = null;
    if (!this.active) return;
    const elapsed = this.now() - this.#started;
    this.progress(Math.min(1, elapsed / this.duration));
    if (elapsed >= this.duration) {
      this.#started = null;
      this.complete();
    } else {
      this.#timer = this.schedule(this.#tick);
    }
  };

  release() {
    // Account for a delayed animation callback without granting early releases a reset.
    const completed = this.active && this.now() - this.#started >= this.duration;
    this.cancel();
    if (completed) this.complete();
    return completed;
  }

  cancel() {
    if (this.#timer !== null) this.unschedule(this.#timer);
    this.#timer = null;
    this.#started = null;
    this.progress(0);
  }
}

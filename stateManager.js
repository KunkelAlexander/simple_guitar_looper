export const LoopState = Object.freeze({
  IDLE: "idle",
  RECORDING: "recording",
  READY: "ready",
  PLAYING: "playing",
});

export class StateManager {
  constructor() {
    this.state = LoopState.IDLE;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setState(next) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  getState() {
    return this.state;
  }
}

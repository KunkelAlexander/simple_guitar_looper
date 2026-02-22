/**
 * Handles looper state transitions independent of rendering and audio internals.
 */
export const LoopState = Object.freeze({
  IDLE: "idle",
  RECORDING: "recording",
  PLAYING: "playing",
  OVERDUBBING: "overdubbing",
});

export class StateManager {
  constructor() {
    this.state = LoopState.IDLE;
    this.subscribers = new Set();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  setState(nextState) {
    this.state = nextState;
    for (const subscriber of this.subscribers) {
      subscriber(this.state);
    }
  }

  getState() {
    return this.state;
  }
}

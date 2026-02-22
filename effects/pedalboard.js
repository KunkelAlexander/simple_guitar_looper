/**
 * Minimal pedalboard placeholder using GainNodes.
 * Future implementation can map to richer DSP effects (delay/reverb/drive/etc).
 */
export class Pedalboard {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.drive = audioContext.createGain();
    this.drive.gain.value = 1;

    this.input.connect(this.drive);
    this.drive.connect(this.output);
  }

  connect(destination) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  bypass(isBypassed) {
    this.drive.gain.value = isBypassed ? 0 : 1;
  }

  setParams({ drive = 1 } = {}) {
    this.drive.gain.value = drive;
  }
}

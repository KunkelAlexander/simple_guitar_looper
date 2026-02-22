/**
 * Placeholder neural amp model effect for future TF.js / ONNX / WASM integration.
 * Current behavior is transparent pass-through via GainNode.
 */
export class AmpModel {
  constructor(audioContext, { modelUrl = null } = {}) {
    this.audioContext = audioContext;
    this.modelUrl = modelUrl;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.bypassNode = audioContext.createGain();
    this.enabled = true;

    this.input.connect(this.output);
    this.bypassNode.connect(this.output);
  }

  connect(destination) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  bypass(isBypassed) {
    this.enabled = !isBypassed;
    this.input.gain.value = this.enabled ? 1 : 0;
    this.bypassNode.gain.value = this.enabled ? 0 : 1;
  }

  setParams(_params) {
    // Placeholder for future model controls (gain/tone/presence/etc).
  }

  async loadModel() {
    if (!this.modelUrl) {
      return;
    }
    // Future hook: load model using TF.js, ONNX Runtime Web, or WASM in AudioWorklet.
    console.info(`Model loading placeholder for: ${this.modelUrl}`);
  }

  /**
   * Future hook to process audio buffers when model inference path is added.
   */
  async process(_audioBuffer) {
    return _audioBuffer;
  }
}

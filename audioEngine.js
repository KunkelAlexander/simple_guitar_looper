import { AmpModel } from "./effects/ampModel.js";
import { Pedalboard } from "./effects/pedalboard.js";

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.stream = null;
    this.sourceNode = null;

    this.inputGain = null;
    this.highpassFilter = null;
    this.captureGain = null;
    this.monitorGain = null;
    this.loopGain = null;
    this.masterGain = null;
    this.compressor = null;
    this.analyser = null;

    this.effects = [];
    this.recorderNode = null;
    this.silentSink = null;
    this.recordedChunks = [];

    this.loopBuffers = [null, null];
    this.previousLoopBuffers = [null, null];
    this.currentTrack = 0;
    this.loopSource = null;

    this.onLevel = null;
    this.levelRaf = null;
    this.isCapturing = false;
    this.monitorEnabled = false;
    this.lowLatencyMode = true;
    this.processingMode = "guitar";
  }

  async init(stream) {
    this.stream = stream;
    this.audioContext = this.audioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.highpassFilter = this.audioContext.createBiquadFilter();
    this.captureGain = this.audioContext.createGain();
    this.monitorGain = this.audioContext.createGain();
    this.loopGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.analyser = this.audioContext.createAnalyser();

    this.highpassFilter.type = "highpass";
    this.highpassFilter.frequency.value = 35;
    this.highpassFilter.Q.value = 0.707;

    this.loopGain.gain.value = 0.9;
    this.masterGain.gain.value = 0.8;

    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 2.5;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.15;

    this.analyser.fftSize = 512;

    this.effects = [new Pedalboard(this.audioContext), new AmpModel(this.audioContext)];
    this.#wireGraph();
    await this.#setupRecorder();
    this.setProcessingMode(this.processingMode);
    this.setInputMonitoring(false);
    this.#startLevelMeter();
  }

  async updateInputStream(stream) {
    this.stop();
    this.#teardownLevelMeter();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.sourceNode?.disconnect();
    this.stream = stream;
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.#wireGraph();
    await this.#setupRecorder();
    this.#startLevelMeter();
  }

  #disconnect(node) { try { node?.disconnect(); } catch {} }

  #wireGraph() {
    [this.sourceNode, this.inputGain, this.highpassFilter, this.captureGain, this.monitorGain, this.loopGain, this.masterGain, this.compressor]
      .forEach((n) => this.#disconnect(n));
    this.effects.forEach((e) => { this.#disconnect(e.input); this.#disconnect(e.output); });

    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.highpassFilter);

    let node = this.highpassFilter;
    if (!this.lowLatencyMode) {
      for (const effect of this.effects) {
        node.connect(effect.input);
        node = effect.output;
      }
    }

    node.connect(this.captureGain);
    this.captureGain.connect(this.analyser);
    this.captureGain.connect(this.monitorGain);
    this.loopGain.connect(this.masterGain);

    if (this.lowLatencyMode) {
      this.monitorGain.connect(this.audioContext.destination);
      this.masterGain.connect(this.audioContext.destination);
    } else {
      this.monitorGain.connect(this.masterGain);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.audioContext.destination);
    }
  }

  async #setupRecorder() {
    this.recordedChunks = [];
    this.#disconnect(this.recorderNode);
    this.#disconnect(this.silentSink);
    this.recorderNode = null;
    this.silentSink = null;

    if (!this.audioContext.audioWorklet) return this.#setupScriptProcessorFallback();

    try {
      await this.audioContext.audioWorklet.addModule("./recorderWorklet.js");
      this.recorderNode = new AudioWorkletNode(this.audioContext, "recorder-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.silentSink = this.audioContext.createGain();
      this.silentSink.gain.value = 0;
      this.captureGain.connect(this.recorderNode);
      this.recorderNode.connect(this.silentSink);
      this.silentSink.connect(this.audioContext.destination);

      this.recorderNode.port.onmessage = (event) => {
        if (!this.isCapturing) return;
        const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
        this.recordedChunks.push(chunk);
      };
    } catch {
      this.#setupScriptProcessorFallback();
    }
  }

  #setupScriptProcessorFallback() {
    this.recorderNode = this.audioContext.createScriptProcessor(512, 1, 1);
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;
    this.captureGain.connect(this.recorderNode);
    this.recorderNode.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);
    this.recorderNode.onaudioprocess = (event) => {
      if (!this.isCapturing) return;
      this.recordedChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
  }

  setLowLatencyMode(enabled) { this.lowLatencyMode = enabled; if (this.audioContext) this.#wireGraph(); }

  setProcessingMode(mode) {
    this.processingMode = mode;
    if (!this.inputGain || !this.highpassFilter) return;
    if (mode === "guitar") {
      this.inputGain.gain.setTargetAtTime(2.4, this.audioContext.currentTime, 0.01);
      this.highpassFilter.frequency.setTargetAtTime(25, this.audioContext.currentTime, 0.01);
    } else {
      this.inputGain.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.01);
      this.highpassFilter.frequency.setTargetAtTime(70, this.audioContext.currentTime, 0.01);
    }
  }

  setInputMonitoring(enabled) {
    this.monitorEnabled = enabled;
    if (this.monitorGain) this.monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, this.audioContext.currentTime, 0.008);
  }

  setMasterVolume(value) { if (this.masterGain) this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01); }
  setLevelCallback(cb) { this.onLevel = cb; if (this.analyser) { this.#teardownLevelMeter(); this.#startLevelMeter(); } }

  #startLevelMeter() {
    if (!this.onLevel || !this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const draw = () => {
      this.analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      this.onLevel(peak);
      this.levelRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  #teardownLevelMeter() { if (this.levelRaf) cancelAnimationFrame(this.levelRaf); this.levelRaf = null; }

  setActiveTrack(index) {
    this.currentTrack = index;
    this.stopLoopSource();
    if (this.loopBuffers[index]) this.playLoop();
  }

  startRecording() { this.stopLoopSource(); this.recordedChunks = []; this.isCapturing = true; }

  stopRecordingToLoop() {
    this.isCapturing = false;
    const buffer = this.#chunksToBuffer(this.recordedChunks);
    if (!buffer) return null;
    this.previousLoopBuffers[this.currentTrack] = this.loopBuffers[this.currentTrack];
    this.loopBuffers[this.currentTrack] = buffer;
    this.playLoop();
    return buffer;
  }

  startOverdub() { if (!this.hasLoop()) return; this.recordedChunks = []; this.isCapturing = true; }
  stopOverdub() {
    if (!this.hasLoop()) { this.isCapturing = false; return; }
    this.isCapturing = false;
    const overdub = this.#chunksToBuffer(this.recordedChunks);
    if (!overdub) return;
    const base = this.loopBuffers[this.currentTrack];
    const merged = this.#mixBuffers(base, overdub);
    this.previousLoopBuffers[this.currentTrack] = base;
    this.loopBuffers[this.currentTrack] = merged;
    this.playLoop();
  }

  playLoop() {
    const buffer = this.loopBuffers[this.currentTrack];
    if (!buffer) return;
    this.stopLoopSource();
    this.loopSource = this.audioContext.createBufferSource();
    this.loopSource.buffer = buffer;
    this.loopSource.loop = true;
    this.loopSource.connect(this.loopGain);
    this.loopSource.start(this.audioContext.currentTime);
  }

  stop() { this.isCapturing = false; this.stopLoopSource(); }
  clear() { this.stop(); this.previousLoopBuffers[this.currentTrack] = null; this.loopBuffers[this.currentTrack] = null; }
  undo() {
    const prev = this.previousLoopBuffers[this.currentTrack];
    if (!prev) return false;
    this.loopBuffers[this.currentTrack] = prev;
    this.previousLoopBuffers[this.currentTrack] = null;
    this.playLoop();
    return true;
  }

  stopLoopSource() { if (!this.loopSource) return; try { this.loopSource.stop(); } catch {} this.loopSource.disconnect(); this.loopSource = null; }

  #chunksToBuffer(chunks) {
    const frameCount = chunks.reduce((s, c) => s + c.length, 0);
    if (!frameCount) return null;
    const b = this.audioContext.createBuffer(2, frameCount, this.audioContext.sampleRate);
    const l = b.getChannelData(0); const r = b.getChannelData(1);
    let offset = 0;
    for (const c of chunks) { l.set(c, offset); r.set(c, offset); offset += c.length; }
    return b;
  }

  #mixBuffers(base, overdub) {
    const frames = base.length;
    const out = this.audioContext.createBuffer(2, frames, this.audioContext.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const o = out.getChannelData(ch), b = base.getChannelData(ch), d = overdub.getChannelData(ch);
      for (let i = 0; i < frames; i += 1) {
        const mixed = (b[i] * 0.9) + ((d[i % d.length] || 0) * 0.6);
        o[i] = Math.max(-0.95, Math.min(0.95, mixed));
      }
    }
    return out;
  }

  async setOutputDevice(_deviceId) { return false; }
  hasLoop() { return Boolean(this.loopBuffers[this.currentTrack]); }
  hasAnyLoop() { return this.loopBuffers.some(Boolean); }
}

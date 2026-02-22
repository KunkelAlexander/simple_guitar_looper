import { AmpModel } from "./effects/ampModel.js";
import { Pedalboard } from "./effects/pedalboard.js";

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.inputGain = null;
    this.highpassFilter = null;
    this.captureGain = null;
    this.monitorGain = null;
    this.loopGain = null;
    this.masterGain = null;
    this.analyser = null;
    this.effects = [];
    this.recorderNode = null;
    this.silentSink = null;
    this.recordedChunks = [];
    this.loopBuffers = [null, null];
    this.previousLoopBuffers = [null, null];
    this.currentTrack = 0;
    this.loopSource = null;
    this.isCapturing = false;
    this.monitorEnabled = false;
    this.lowLatencyMode = true;
    this.onLevel = null;
    this.levelRaf = null;
  }

  async init(stream) {
    this.audioContext = this.audioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.highpassFilter = this.audioContext.createBiquadFilter();
    this.captureGain = this.audioContext.createGain();
    this.monitorGain = this.audioContext.createGain();
    this.loopGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();

    this.highpassFilter.type = "highpass";
    this.highpassFilter.frequency.value = 30;
    this.loopGain.gain.value = 0.9;
    this.masterGain.gain.value = 0.85;
    this.monitorGain.gain.value = 0;
    this.analyser.fftSize = 512;

    this.effects = [new Pedalboard(this.audioContext), new AmpModel(this.audioContext)];
    this.#wireGraph();
    await this.#setupRecorder();
    this.#startLevelMeter();
  }

  async updateInputStream(stream) {
    this.stop();
    this.sourceNode?.disconnect();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.#wireGraph();
    await this.#setupRecorder();
  }

  #disconnect(node) { try { node?.disconnect(); } catch {} }

  #wireGraph() {
    [this.sourceNode, this.inputGain, this.highpassFilter, this.captureGain, this.monitorGain, this.loopGain, this.masterGain].forEach((n) => this.#disconnect(n));
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
    this.captureGain.connect(this.monitorGain);
    this.captureGain.connect(this.analyser);
    this.loopGain.connect(this.masterGain);
    this.monitorGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  async #setupRecorder() {
    this.#disconnect(this.recorderNode);
    this.#disconnect(this.silentSink);

    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule("./recorderWorklet.js");
        this.recorderNode = new AudioWorkletNode(this.audioContext, "recorder-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        this.silentSink = this.audioContext.createGain();
        this.silentSink.gain.value = 0;
        this.captureGain.connect(this.recorderNode);
        this.recorderNode.connect(this.silentSink);
        this.silentSink.connect(this.audioContext.destination);
        this.recorderNode.port.onmessage = (event) => {
          if (this.isCapturing) this.recordedChunks.push(new Float32Array(event.data));
        };
        return;
      } catch {}
    }

    this.recorderNode = this.audioContext.createScriptProcessor(512, 1, 1);
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;
    this.captureGain.connect(this.recorderNode);
    this.recorderNode.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);
    this.recorderNode.onaudioprocess = (event) => {
      if (this.isCapturing) this.recordedChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
  }

  setLowLatencyMode(enabled) { this.lowLatencyMode = enabled; if (this.audioContext) this.#wireGraph(); }
  setInputMonitoring(enabled) { this.monitorEnabled = enabled; this.monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, this.audioContext.currentTime, 0.01); }
  setMasterVolume(value) { this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01); }
  setProcessingMode(mode) {
    if (mode === "guitar") {
      this.inputGain.gain.setTargetAtTime(2.6, this.audioContext.currentTime, 0.01);
      this.highpassFilter.frequency.setTargetAtTime(22, this.audioContext.currentTime, 0.01);
    } else {
      this.inputGain.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.01);
      this.highpassFilter.frequency.setTargetAtTime(70, this.audioContext.currentTime, 0.01);
    }
  }

  setLevelCallback(callback) { this.onLevel = callback; }
  #startLevelMeter() {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const draw = () => {
      this.analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      this.onLevel?.(peak);
      this.levelRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  setActiveTrack(index) {
    this.currentTrack = index;
    this.stopLoopSource();
  }

  startRecording() { this.stopLoopSource(); this.recordedChunks = []; this.isCapturing = true; }
  stopRecordingToLoop() {
    this.isCapturing = false;
    const buffer = this.#chunksToBuffer(this.recordedChunks);
    if (!buffer) return false;
    this.previousLoopBuffers[this.currentTrack] = this.loopBuffers[this.currentTrack];
    this.loopBuffers[this.currentTrack] = buffer;
    return true;
  }

  playLoop() {
    const buffer = this.loopBuffers[this.currentTrack];
    if (!buffer) return false;
    this.stopLoopSource();
    this.loopSource = this.audioContext.createBufferSource();
    this.loopSource.buffer = buffer;
    this.loopSource.loop = true;
    this.loopSource.connect(this.loopGain);
    this.loopSource.start();
    return true;
  }

  stop() { this.isCapturing = false; this.stopLoopSource(); }
  clearTrack(index = this.currentTrack) { this.stop(); this.previousLoopBuffers[index] = null; this.loopBuffers[index] = null; }

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

  hasLoop(index = this.currentTrack) { return Boolean(this.loopBuffers[index]); }
}

import { AmpModel } from "./effects/ampModel.js";
import { Pedalboard } from "./effects/pedalboard.js";

/**
 * Audio engine with modular effect pipeline and loop capture/playback.
 */
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

    this.useWorkletRecorder = false;
    this.recorderNode = null;
    this.silentSink = null;
    this.recordedChunks = [];

    this.loopBuffer = null;
    this.previousLoopBuffer = null;
    this.loopSource = null;

    this.onLevel = null;
    this.levelRaf = null;
    this.isCapturing = false;
  }

  async init(stream) {
    this.stream = stream;
    this.audioContext = this.audioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.inputGain.gain.value = 1;

    this.highpassFilter = this.audioContext.createBiquadFilter();
    this.highpassFilter.type = "highpass";
    this.highpassFilter.frequency.value = 35;
    this.highpassFilter.Q.value = 0.707;

    this.captureGain = this.audioContext.createGain();
    this.captureGain.gain.value = 1;

    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.gain.value = 0;

    this.loopGain = this.audioContext.createGain();
    this.loopGain.gain.value = 0.85;

    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.8;

    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 2.5;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.15;

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;

    this.effects = [new Pedalboard(this.audioContext), new AmpModel(this.audioContext)];

    this.#wireGraph();
    await this.#setupRecorder();
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

  #wireGraph() {
    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.highpassFilter);

    let currentNode = this.highpassFilter;
    for (const effect of this.effects) {
      currentNode.connect(effect.input);
      currentNode = effect.output;
    }

    currentNode.connect(this.captureGain);
    this.captureGain.connect(this.monitorGain);
    this.captureGain.connect(this.analyser);

    this.monitorGain.connect(this.masterGain);
    this.loopGain.connect(this.masterGain);
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.audioContext.destination);
  }

  async #setupRecorder() {
    this.recordedChunks = [];

    if (this.recorderNode) {
      this.recorderNode.port?.close?.();
      this.recorderNode.disconnect();
      this.recorderNode = null;
    }
    this.silentSink?.disconnect();
    this.silentSink = null;

    if (!this.audioContext.audioWorklet) {
      this.#setupScriptProcessorFallback();
      return;
    }

    try {
      await this.audioContext.audioWorklet.addModule("./recorderWorklet.js");
      this.recorderNode = new AudioWorkletNode(this.audioContext, "recorder-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.useWorkletRecorder = true;
      this.silentSink = this.audioContext.createGain();
      this.silentSink.gain.value = 0;

      this.captureGain.connect(this.recorderNode);
      this.recorderNode.connect(this.silentSink);
      this.silentSink.connect(this.audioContext.destination);

      this.recorderNode.port.onmessage = (event) => {
        if (!this.isCapturing) {
          return;
        }
        this.recordedChunks.push(event.data);
      };
    } catch (_error) {
      this.#setupScriptProcessorFallback();
    }
  }

  #setupScriptProcessorFallback() {
    this.useWorkletRecorder = false;
    const channelCount = 1;
    const bufferSize = 2048;
    this.recorderNode = this.audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;

    this.captureGain.connect(this.recorderNode);
    this.recorderNode.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);

    this.recorderNode.onaudioprocess = (event) => {
      if (!this.isCapturing) {
        return;
      }
      const mono = event.inputBuffer.getChannelData(0);
      this.recordedChunks.push(new Float32Array(mono));
    };
  }

  setInputMonitoring(enabled) {
    if (this.monitorGain) {
      this.monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, this.audioContext.currentTime, 0.01);
    }
  }

  #startLevelMeter() {
    if (!this.onLevel || !this.analyser) {
      return;
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const draw = () => {
      this.analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      }
      this.onLevel(peak);
      this.levelRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  #teardownLevelMeter() {
    if (this.levelRaf) {
      cancelAnimationFrame(this.levelRaf);
      this.levelRaf = null;
    }
  }

  setMasterVolume(value) {
    if (!this.masterGain) {
      return;
    }
    this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
  }

  setLevelCallback(callback) {
    this.onLevel = callback;
    if (this.analyser) {
      this.#teardownLevelMeter();
      this.#startLevelMeter();
    }
  }

  startRecording() {
    this.stopLoopSource();
    this.recordedChunks = [];
    this.isCapturing = true;
  }

  stopRecordingToLoop() {
    this.isCapturing = false;
    const buffer = this.#chunksToBuffer(this.recordedChunks);
    if (!buffer) {
      return null;
    }
    this.previousLoopBuffer = this.loopBuffer;
    this.loopBuffer = buffer;
    this.playLoop();
    return buffer;
  }

  startOverdub() {
    if (!this.loopBuffer) {
      return;
    }
    this.recordedChunks = [];
    this.isCapturing = true;
  }

  stopOverdub() {
    if (!this.loopBuffer) {
      this.isCapturing = false;
      return;
    }

    this.isCapturing = false;
    const overdubBuffer = this.#chunksToBuffer(this.recordedChunks);
    if (!overdubBuffer) {
      return;
    }

    const merged = this.#mixBuffers(this.loopBuffer, overdubBuffer);
    this.previousLoopBuffer = this.loopBuffer;
    this.loopBuffer = merged;
    this.playLoop();
  }

  playLoop() {
    if (!this.loopBuffer) {
      return;
    }
    this.stopLoopSource();

    this.loopSource = this.audioContext.createBufferSource();
    this.loopSource.buffer = this.loopBuffer;
    this.loopSource.loop = true;
    this.loopSource.connect(this.loopGain);
    this.loopSource.start(this.audioContext.currentTime + 0.01, 0);
  }

  stop() {
    this.isCapturing = false;
    this.stopLoopSource();
  }

  clear() {
    this.stop();
    this.previousLoopBuffer = null;
    this.loopBuffer = null;
  }

  undo() {
    if (!this.previousLoopBuffer) {
      return false;
    }
    this.loopBuffer = this.previousLoopBuffer;
    this.previousLoopBuffer = null;
    this.playLoop();
    return true;
  }

  stopLoopSource() {
    if (!this.loopSource) {
      return;
    }
    try {
      this.loopSource.stop();
    } catch (_error) {
      // no-op
    }
    this.loopSource.disconnect();
    this.loopSource = null;
  }

  #chunksToBuffer(chunks) {
    const frameCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!frameCount) {
      return null;
    }

    const buffer = this.audioContext.createBuffer(2, frameCount, this.audioContext.sampleRate);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    let offset = 0;
    for (const chunk of chunks) {
      leftChannel.set(chunk, offset);
      rightChannel.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }

  #mixBuffers(baseBuffer, overdubBuffer) {
    const frameCount = baseBuffer.length;
    const output = this.audioContext.createBuffer(2, frameCount, this.audioContext.sampleRate);

    for (let channel = 0; channel < 2; channel += 1) {
      const outData = output.getChannelData(channel);
      const baseData = baseBuffer.getChannelData(channel);
      const overData = overdubBuffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i += 1) {
        const over = overData[i % overData.length] || 0;
        const mixed = (baseData[i] * 0.9) + (over * 0.55);
        outData[i] = Math.max(-0.95, Math.min(0.95, mixed));
      }
    }

    return output;
  }

  async setOutputDevice(_deviceId) {
    // Direct AudioContext.destination path is used for best quality/lowest latency.
    // Output switching remains browser-limited and is intentionally a no-op here.
    return false;
  }

  hasLoop() {
    return Boolean(this.loopBuffer);
  }
}

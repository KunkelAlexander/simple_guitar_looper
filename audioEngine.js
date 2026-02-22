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
    this.monitorGain = null;
    this.masterGain = null;
    this.analyser = null;
    this.outputNode = null;
    this.outputElement = null;

    this.effects = [];
    this.recorderNode = null;
    this.recordedChunks = [[], []];

    this.loopBuffer = null;
    this.previousLoopBuffer = null;
    this.loopSource = null;
    this.loopStartTime = 0;

    this.onLevel = null;
    this.levelRaf = null;
  }

  async init(stream) {
    this.stream = stream;
    this.audioContext = this.audioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.monitorGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.8;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;

    this.effects = [
      new Pedalboard(this.audioContext),
      new AmpModel(this.audioContext),
    ];

    this.#wireGraph();
    this.#setupRecorder();
    this.#startLevelMeter();
  }

  async updateInputStream(stream) {
    this.stop();
    this.clear();
    this.#teardownLevelMeter();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    this.stream = stream;
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.#wireGraph();
    this.#setupRecorder();
    this.#startLevelMeter();
  }

  #wireGraph() {
    this.sourceNode.connect(this.inputGain);

    let currentNode = this.inputGain;
    for (const effect of this.effects) {
      currentNode.connect(effect.input);
      currentNode = effect.output;
    }

    currentNode.connect(this.monitorGain);
    this.monitorGain.connect(this.masterGain);
    this.outputNode = this.audioContext.createMediaStreamDestination();
    this.masterGain.connect(this.outputNode);
    this.monitorGain.connect(this.analyser);

    this.outputElement = new Audio();
    this.outputElement.autoplay = true;
    this.outputElement.srcObject = this.outputNode.stream;
    this.outputElement.play().catch(() => {});
  }

  #setupRecorder() {
    if (this.recorderNode) {
      this.recorderNode.disconnect();
    }
    const channelCount = 2;
    const bufferSize = 1024;
    this.recorderNode = this.audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
    this.monitorGain.connect(this.recorderNode);
    this.recorderNode.connect(this.audioContext.destination);
    this.isCapturing = false;

    this.recorderNode.onaudioprocess = (event) => {
      if (!this.isCapturing) {
        return;
      }
      const left = event.inputBuffer.getChannelData(0);
      const right = event.inputBuffer.numberOfChannels > 1
        ? event.inputBuffer.getChannelData(1)
        : left;

      this.recordedChunks[0].push(new Float32Array(left));
      this.recordedChunks[1].push(new Float32Array(right));
    };
  }

  #startLevelMeter() {
    if (!this.onLevel) {
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
    this.recordedChunks = [[], []];
    this.isCapturing = true;
    this.recordStartTime = this.audioContext.currentTime;
  }

  stopRecordingToLoop() {
    this.isCapturing = false;
    const buffer = this.#chunksToBuffer(this.recordedChunks);
    this.previousLoopBuffer = this.loopBuffer;
    this.loopBuffer = buffer;
    this.playLoop();
    return buffer;
  }

  startOverdub() {
    if (!this.loopBuffer) {
      return;
    }
    this.recordedChunks = [[], []];
    this.isCapturing = true;
    this.overdubStartTime = this.audioContext.currentTime;
  }

  stopOverdub() {
    if (!this.loopBuffer) {
      this.isCapturing = false;
      return;
    }

    this.isCapturing = false;
    const overdubBuffer = this.#chunksToBuffer(this.recordedChunks);
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
    this.loopSource.connect(this.masterGain);

    const startAt = this.audioContext.currentTime + 0.02;
    this.loopStartTime = startAt;
    this.loopSource.start(startAt, 0);
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
    const leftLength = chunks[0].reduce((sum, channel) => sum + channel.length, 0);
    const rightLength = chunks[1].reduce((sum, channel) => sum + channel.length, 0);
    const frameCount = Math.max(leftLength, rightLength);

    const buffer = this.audioContext.createBuffer(2, frameCount, this.audioContext.sampleRate);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    let offset = 0;
    for (const chunk of chunks[0]) {
      leftChannel.set(chunk, offset);
      offset += chunk.length;
    }

    offset = 0;
    for (const chunk of chunks[1]) {
      rightChannel.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }

  #mixBuffers(baseBuffer, overdubBuffer) {
    const channels = Math.max(baseBuffer.numberOfChannels, overdubBuffer.numberOfChannels);
    const frameCount = baseBuffer.length;
    const output = this.audioContext.createBuffer(channels, frameCount, this.audioContext.sampleRate);

    for (let channel = 0; channel < channels; channel += 1) {
      const outData = output.getChannelData(channel);
      const baseData = baseBuffer.getChannelData(Math.min(channel, baseBuffer.numberOfChannels - 1));
      const overData = overdubBuffer.getChannelData(Math.min(channel, overdubBuffer.numberOfChannels - 1));
      for (let i = 0; i < frameCount; i += 1) {
        const over = overData[i % overData.length] || 0;
        outData[i] = Math.max(-1, Math.min(1, baseData[i] + over));
      }
    }

    return output;
  }

  async setOutputDevice(deviceId) {
    if (!this.outputElement || typeof this.outputElement.setSinkId !== "function") {
      return false;
    }
    await this.outputElement.setSinkId(deviceId);
    return true;
  }

  hasLoop() {
    return Boolean(this.loopBuffer);
  }
}

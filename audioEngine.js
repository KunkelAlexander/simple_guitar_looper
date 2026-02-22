export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.inputGain = null;
    this.captureGain = null;
    this.monitorGain = null;
    this.masterGain = null;
    this.analyser = null;

    this.outputDestination = null;
    this.outputElement = null;

    this.recorderNode = null;
    this.silentSink = null;
    this.recordedChunks = [];
    this.loopBuffer = null;
    this.loopSource = null;
    this.isRecording = false;
    this.levelRaf = null;
    this.onLevel = null;
  }

  async init(stream) {
    this.audioContext = this.audioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.captureGain = this.audioContext.createGain();
    this.monitorGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();

    this.inputGain.gain.value = 2.2;
    this.monitorGain.gain.value = 0;
    this.masterGain.gain.value = 0.85;
    this.analyser.fftSize = 512;

    this.#wireGraph();
    this.#setupRecorder();
    this.#startMeter();
  }

  async updateInputStream(stream) {
    this.stop();
    this.sourceNode?.disconnect();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.#wireGraph();
    this.#setupRecorder();
  }

  #disconnect(node) { try { node?.disconnect(); } catch {} }

  #wireGraph() {
    [this.sourceNode, this.inputGain, this.captureGain, this.monitorGain, this.masterGain, this.outputDestination].forEach((n) => this.#disconnect(n));

    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.captureGain);
    this.captureGain.connect(this.monitorGain);
    this.captureGain.connect(this.analyser);

    this.monitorGain.connect(this.masterGain);

    // loop playback joins master path
    this.outputDestination = this.audioContext.createMediaStreamDestination();
    this.masterGain.connect(this.outputDestination);

    this.outputElement = this.outputElement || new Audio();
    this.outputElement.autoplay = true;
    this.outputElement.srcObject = this.outputDestination.stream;
    this.outputElement.play().catch(() => {});
  }

  #setupRecorder() {
    this.#disconnect(this.recorderNode);
    this.#disconnect(this.silentSink);

    this.recorderNode = this.audioContext.createScriptProcessor(512, 1, 1);
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;

    this.captureGain.connect(this.recorderNode);
    this.recorderNode.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);

    this.recorderNode.onaudioprocess = (event) => {
      if (!this.isRecording) return;
      this.recordedChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
  }

  setProcessingMode(mode) {
    if (!this.inputGain) return;
    this.inputGain.gain.setTargetAtTime(mode === "guitar" ? 2.6 : 1.0, this.audioContext.currentTime, 0.01);
  }

  setInputMonitoring(enabled) {
    if (!this.monitorGain) return;
    this.monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, this.audioContext.currentTime, 0.01);
  }

  setMasterVolume(value) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
  }

  setLevelCallback(callback) {
    this.onLevel = callback;
  }

  #startMeter() {
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

  startRecording() {
    this.stopLoop();
    this.recordedChunks = [];
    this.isRecording = true;
  }

  stopRecordingToLoop() {
    this.isRecording = false;
    const frameCount = this.recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!frameCount) return false;

    const buffer = this.audioContext.createBuffer(2, frameCount, this.audioContext.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let offset = 0;
    for (const chunk of this.recordedChunks) {
      left.set(chunk, offset);
      right.set(chunk, offset);
      offset += chunk.length;
    }

    this.loopBuffer = buffer;
    return true;
  }

  playLoop() {
    if (!this.loopBuffer) return false;
    this.stopLoop();
    this.loopSource = this.audioContext.createBufferSource();
    this.loopSource.buffer = this.loopBuffer;
    this.loopSource.loop = true;
    this.loopSource.connect(this.masterGain);
    this.loopSource.start();
    return true;
  }

  stopLoop() {
    if (!this.loopSource) return;
    try { this.loopSource.stop(); } catch {}
    this.loopSource.disconnect();
    this.loopSource = null;
  }

  stop() {
    this.isRecording = false;
    this.stopLoop();
  }

  clear() {
    this.stop();
    this.loopBuffer = null;
  }

  hasLoop() {
    return Boolean(this.loopBuffer);
  }

  async setOutputDevice(deviceId) {
    if (!this.outputElement || typeof this.outputElement.setSinkId !== "function") return false;
    await this.outputElement.setSinkId(deviceId);
    return true;
  }
}

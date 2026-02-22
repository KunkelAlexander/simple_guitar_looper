export class DeviceManager {
  constructor() {
    this.lowLatencyMode = true;
    this.processingMode = "guitar";
  }

  setLowLatencyMode(enabled) { this.lowLatencyMode = enabled; }
  setProcessingMode(mode) { this.processingMode = mode; }

  async requestInputStream(inputDeviceId = "") {
    const voice = this.processingMode === "voice";
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        latency: this.lowLatencyMode ? { ideal: 0.005 } : { ideal: 0.02 },
        echoCancellation: voice,
        noiseSuppression: voice,
        autoGainControl: voice,
      },
      video: false,
    });
  }

  async listAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === "audioinput"),
      outputs: devices.filter((d) => d.kind === "audiooutput"),
    };
  }

  outputSelectionSupported() {
    return typeof HTMLMediaElement.prototype.setSinkId === "function";
  }
}

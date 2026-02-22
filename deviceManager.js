/**
 * Handles input and output device enumeration and selection.
 */
export class DeviceManager {
  constructor() {
    this.processingMode = "guitar";
    this.lowLatencyMode = true;
  }

  setProcessingMode(mode) {
    this.processingMode = mode;
  }

  setLowLatencyMode(enabled) {
    this.lowLatencyMode = enabled;
  }

  async requestInputStream(inputDeviceId) {
    const voiceMode = this.processingMode === "voice";
    const constraints = {
      audio: {
        deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 },
        latency: this.lowLatencyMode ? { ideal: 0.005 } : { ideal: 0.02 },
        echoCancellation: voiceMode,
        noiseSuppression: voiceMode,
        autoGainControl: voiceMode,
      },
      video: false,
    };

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async listAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === "audioinput"),
      outputs: devices.filter((d) => d.kind === "audiooutput"),
    };
  }

  outputSelectionSupported() {
    return typeof HTMLMediaElement.prototype.setSinkId === "function" && typeof navigator.mediaDevices.selectAudioOutput === "function";
  }
}

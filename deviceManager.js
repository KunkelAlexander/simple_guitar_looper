/**
 * Handles input and output device enumeration and selection.
 */
export class DeviceManager {
  constructor() {
    this.currentInputId = "";
    this.currentOutputId = "";
  }

  async requestInputStream(inputDeviceId) {
    const constraints = {
      audio: inputDeviceId
        ? { deviceId: { exact: inputDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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

  async requestOutputDevice() {
    if (!this.outputSelectionSupported()) {
      return null;
    }
    const output = await navigator.mediaDevices.selectAudioOutput();
    this.currentOutputId = output.deviceId;
    return output;
  }
}

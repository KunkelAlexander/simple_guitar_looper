import { LoopState } from "./stateManager.js";

export class UIController {
  constructor() {
    this.elements = {
      inputSelect: document.getElementById("input-device-select"),
      outputSelect: document.getElementById("output-device-select"),
      refreshDevicesButton: document.getElementById("refresh-devices-btn"),
      recordButton: document.getElementById("record-btn"),
      playButton: document.getElementById("play-btn"),
      stopButton: document.getElementById("stop-btn"),
      clearButton: document.getElementById("clear-btn"),
      monitorToggleButton: document.getElementById("monitor-toggle-btn"),
      processingToggleButton: document.getElementById("input-processing-btn"),
      latencyModeButton: document.getElementById("latency-mode-btn"),
      indicator: document.getElementById("loop-indicator"),
      volume: document.getElementById("master-volume"),
      supportNote: document.getElementById("support-note"),
      meter: document.getElementById("level-meter"),
    };
    this.meterContext = this.elements.meter.getContext("2d");
  }

  bindHandlers(h) {
    this.elements.recordButton.addEventListener("click", h.onRecord);
    this.elements.playButton.addEventListener("click", h.onPlay);
    this.elements.stopButton.addEventListener("click", h.onStop);
    this.elements.clearButton.addEventListener("click", h.onClear);
    this.elements.monitorToggleButton.addEventListener("click", h.onToggleMonitor);
    this.elements.processingToggleButton.addEventListener("click", h.onToggleProcessing);
    this.elements.latencyModeButton.addEventListener("click", h.onToggleLatencyMode);
    this.elements.refreshDevicesButton.addEventListener("click", h.onRefreshDevices);
    this.elements.inputSelect.addEventListener("change", () => h.onInputDeviceChange(this.elements.inputSelect.value));
    this.elements.outputSelect.addEventListener("change", () => h.onOutputDeviceChange(this.elements.outputSelect.value));
    this.elements.volume.addEventListener("input", () => h.onVolumeChange(Number(this.elements.volume.value)));
  }

  renderDevices({ inputs, outputs, outputSupported }) {
    this.#renderSelect(this.elements.inputSelect, inputs, "No inputs");
    this.#renderSelect(this.elements.outputSelect, outputs, "Default output");
    this.elements.outputSelect.disabled = !outputSupported;
  }

  #renderSelect(select, devices, placeholder) {
    select.innerHTML = "";
    if (!devices.length) {
      const option = document.createElement("option");
      option.textContent = placeholder;
      option.value = "";
      select.appendChild(option);
      return;
    }
    devices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Device ${index + 1}`;
      select.appendChild(option);
    });
  }

  renderState(state, { hasLoop }) {
    this.elements.indicator.textContent = state === LoopState.READY ? "Ready" : state.charAt(0).toUpperCase() + state.slice(1);
    this.elements.indicator.className = `badge ${state === LoopState.READY ? "idle" : state}`;

    this.elements.recordButton.textContent = state === LoopState.RECORDING ? "Stop Rec" : "Record";
    this.elements.recordButton.disabled = state === LoopState.PLAYING;
    this.elements.playButton.disabled = !hasLoop || state === LoopState.RECORDING;
    this.elements.stopButton.disabled = state === LoopState.IDLE && !hasLoop;
    this.elements.clearButton.disabled = !hasLoop;
  }

  setMonitor(enabled) { this.elements.monitorToggleButton.textContent = enabled ? "Monitor On" : "Monitor Off"; }
  setProcessing(mode) { this.elements.processingToggleButton.textContent = `Mode: ${mode === "voice" ? "Voice" : "Guitar"}`; }
  setLatency(low) { this.elements.latencyModeButton.textContent = `Latency: ${low ? "Low" : "Balanced"}`; }
  setSupportNote(text) { this.elements.supportNote.textContent = text; }

  drawLevel(level) {
    const { width, height } = this.elements.meter;
    this.meterContext.clearRect(0, 0, width, height);
    this.meterContext.fillStyle = "#121a2f";
    this.meterContext.fillRect(0, 0, width, height);
    this.meterContext.fillStyle = level > 0.8 ? "#ff7f7f" : "#57d8ff";
    this.meterContext.fillRect(0, 0, width * Math.min(level, 1), height);
  }
}

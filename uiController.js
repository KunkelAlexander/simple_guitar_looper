import { LoopState } from "./stateManager.js";

/**
 * UI binding layer: renders state and delegates user actions.
 */
export class UIController {
  constructor() {
    this.elements = {
      inputSelect: document.getElementById("input-device-select"),
      outputSelect: document.getElementById("output-device-select"),
      refreshDevicesButton: document.getElementById("refresh-devices-btn"),
      recordButton: document.getElementById("record-btn"),
      overdubButton: document.getElementById("overdub-btn"),
      stopButton: document.getElementById("stop-btn"),
      clearButton: document.getElementById("clear-btn"),
      undoButton: document.getElementById("undo-btn"),
      monitorToggleButton: document.getElementById("monitor-toggle-btn"),
      processingToggleButton: document.getElementById("input-processing-btn"),
      latencyModeButton: document.getElementById("latency-mode-btn"),
      indicator: document.getElementById("loop-indicator"),
      volume: document.getElementById("master-volume"),
      supportNote: document.getElementById("support-note"),
      meter: document.getElementById("level-meter"),
    };

    this.meterContext = this.elements.meter.getContext("2d");
    this.handlers = {};
  }

  bindHandlers(handlers) {
    this.handlers = handlers;
    this.elements.recordButton.addEventListener("click", () => this.handlers.onRecord());
    this.elements.overdubButton.addEventListener("click", () => this.handlers.onOverdub());
    this.elements.stopButton.addEventListener("click", () => this.handlers.onStop());
    this.elements.clearButton.addEventListener("click", () => this.handlers.onClear());
    this.elements.undoButton.addEventListener("click", () => this.handlers.onUndo());
    this.elements.monitorToggleButton.addEventListener("click", () => this.handlers.onToggleMonitor());
    this.elements.processingToggleButton.addEventListener("click", () => this.handlers.onToggleProcessing());
    this.elements.latencyModeButton.addEventListener("click", () => this.handlers.onToggleLatencyMode());
    this.elements.refreshDevicesButton.addEventListener("click", () => this.handlers.onRefreshDevices());
    this.elements.inputSelect.addEventListener("change", () => this.handlers.onInputDeviceChange(this.elements.inputSelect.value));
    this.elements.outputSelect.addEventListener("change", () => this.handlers.onOutputDeviceChange(this.elements.outputSelect.value));
    this.elements.volume.addEventListener("input", () => this.handlers.onVolumeChange(Number(this.elements.volume.value)));
  }

  renderDevices({ inputs, outputs, outputSupported }) {
    this.#renderOptions(this.elements.inputSelect, inputs, "No input devices");
    this.#renderOptions(this.elements.outputSelect, outputs, "Default output");
    this.elements.outputSelect.disabled = !outputSupported;
  }

  #renderOptions(select, devices, placeholder) {
    select.innerHTML = "";
    if (!devices.length) {
      const option = document.createElement("option");
      option.textContent = placeholder;
      option.value = "";
      select.appendChild(option);
      return;
    }
    for (const device of devices) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Device ${select.options.length + 1}`;
      select.appendChild(option);
    }
  }

  setMonitorState(enabled) {
    this.elements.monitorToggleButton.textContent = `Input Monitor: ${enabled ? "On" : "Off"}`;
  }

  setProcessingState(mode) {
    this.elements.processingToggleButton.textContent = `Input Processing: ${mode === "voice" ? "Voice" : "Guitar"}`;
  }

  setLatencyModeState(lowLatencyEnabled) {
    this.elements.latencyModeButton.textContent = `Latency: ${lowLatencyEnabled ? "Low" : "Balanced"}`;
  }

  renderState(state, { hasLoop }) {
    this.elements.indicator.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    this.elements.indicator.className = `indicator ${state}`;

    const isIdle = state === LoopState.IDLE;
    const isRecording = state === LoopState.RECORDING;
    const isPlaying = state === LoopState.PLAYING;
    const isOverdubbing = state === LoopState.OVERDUBBING;

    this.elements.recordButton.disabled = isRecording || isOverdubbing;
    this.elements.overdubButton.disabled = !hasLoop || isRecording || isOverdubbing;
    this.elements.stopButton.disabled = isIdle;
    this.elements.clearButton.disabled = !hasLoop && !isRecording;
    this.elements.undoButton.disabled = !hasLoop;

    if (isPlaying) {
      this.elements.recordButton.textContent = "Re-record";
    } else if (isRecording) {
      this.elements.recordButton.textContent = "Finish Record";
    } else {
      this.elements.recordButton.textContent = "Record";
    }
  }

  setSupportNote(text) {
    this.elements.supportNote.textContent = text;
  }

  drawLevel(level) {
    const { width, height } = this.elements.meter;
    this.meterContext.clearRect(0, 0, width, height);
    this.meterContext.fillStyle = "#1b2438";
    this.meterContext.fillRect(0, 0, width, height);

    const barWidth = width * Math.min(level, 1);
    this.meterContext.fillStyle = level > 0.8 ? "#ff5d73" : "#5e8bff";
    this.meterContext.fillRect(0, 0, barWidth, height);
  }
}

import { LoopState } from "./stateManager.js";

export class UIController {
  constructor() {
    this.elements = {
      inputSelect: document.getElementById("input-device-select"),
      refreshDevicesButton: document.getElementById("refresh-devices-btn"),
      stopButton: document.getElementById("stop-btn"),
      monitorToggleButton: document.getElementById("monitor-toggle-btn"),
      processingToggleButton: document.getElementById("input-processing-btn"),
      latencyModeButton: document.getElementById("latency-mode-btn"),
      track1Button: document.getElementById("track-1-btn"),
      track2Button: document.getElementById("track-2-btn"),
      indicator: document.getElementById("loop-indicator"),
      volume: document.getElementById("master-volume"),
      supportNote: document.getElementById("support-note"),
      meter: document.getElementById("level-meter"),
    };
    this.meterContext = this.elements.meter.getContext("2d");
  }

  bindHandlers(handlers) {
    this.elements.track1Button.addEventListener("click", () => handlers.onTrackPress(0));
    this.elements.track2Button.addEventListener("click", () => handlers.onTrackPress(1));
    this.elements.stopButton.addEventListener("click", () => handlers.onStop());
    this.#bindLongPress(this.elements.stopButton, handlers.onClearLongPress);

    this.elements.monitorToggleButton.addEventListener("click", () => handlers.onToggleMonitor());
    this.elements.processingToggleButton.addEventListener("click", () => handlers.onToggleProcessing());
    this.elements.latencyModeButton.addEventListener("click", () => handlers.onToggleLatencyMode());
    this.elements.refreshDevicesButton.addEventListener("click", () => handlers.onRefreshDevices());
    this.elements.inputSelect.addEventListener("change", () => handlers.onInputDeviceChange(this.elements.inputSelect.value));
    this.elements.volume.addEventListener("input", () => handlers.onVolumeChange(Number(this.elements.volume.value)));
  }

  #bindLongPress(button, callback) {
    let timer = null;
    const start = () => { timer = setTimeout(() => callback(), 700); };
    const cancel = () => { clearTimeout(timer); };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
  }

  renderDevices(inputs) {
    this.elements.inputSelect.innerHTML = "";
    if (!inputs.length) {
      const option = document.createElement("option");
      option.textContent = "No input devices";
      this.elements.inputSelect.appendChild(option);
      return;
    }
    inputs.forEach((device, idx) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Input ${idx + 1}`;
      this.elements.inputSelect.appendChild(option);
    });
  }

  renderState(state, { activeTrack, loopPresence }) {
    this.elements.indicator.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    this.elements.indicator.className = `indicator ${state}`;

    this.#paintTrackButton(this.elements.track1Button, 0, activeTrack, loopPresence[0], state);
    this.#paintTrackButton(this.elements.track2Button, 1, activeTrack, loopPresence[1], state);
  }

  #paintTrackButton(button, trackIndex, activeTrack, hasLoop, state) {
    button.className = "loop-pad";
    button.classList.add(trackIndex === 0 ? "track1" : "track2");
    if (hasLoop) button.classList.add("has-loop");
    if (trackIndex === activeTrack) button.classList.add("active");
    if (state === LoopState.RECORDING && trackIndex === activeTrack) button.classList.add("recording");

    if (state === LoopState.RECORDING && trackIndex === activeTrack) button.firstElementChild.textContent = `Track ${trackIndex + 1} • REC`;
    else if (hasLoop) button.firstElementChild.textContent = `Track ${trackIndex + 1} • LOOP`;
    else button.firstElementChild.textContent = `Track ${trackIndex + 1}`;
  }

  setMonitorState(enabled) { this.elements.monitorToggleButton.textContent = enabled ? "Monitor On" : "Monitor Off"; }
  setProcessingState(mode) { this.elements.processingToggleButton.textContent = `Mode: ${mode === "voice" ? "Voice" : "Guitar"}`; }
  setLatencyModeState(low) { this.elements.latencyModeButton.textContent = `Latency: ${low ? "Low" : "Balanced"}`; }
  setSupportNote(text) { this.elements.supportNote.textContent = text; }

  drawLevel(level) {
    const { width, height } = this.elements.meter;
    this.meterContext.clearRect(0, 0, width, height);
    this.meterContext.fillStyle = "#161c2f";
    this.meterContext.fillRect(0, 0, width, height);
    this.meterContext.fillStyle = level > 0.8 ? "#ff7070" : "#59d8ff";
    this.meterContext.fillRect(0, 0, width * Math.min(1, level), height);
  }
}

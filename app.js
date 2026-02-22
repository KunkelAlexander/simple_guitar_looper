import { AudioEngine } from "./audioEngine.js";
import { DeviceManager } from "./deviceManager.js";
import { StateManager, LoopState } from "./stateManager.js";
import { UIController } from "./uiController.js";

const audioEngine = new AudioEngine();
const deviceManager = new DeviceManager();
const stateManager = new StateManager();
const ui = new UIController();

let monitorEnabled = false;
let processingMode = "guitar";
let lowLatencyMode = true;
let activeInputId = "";
let overdubTimer = null;

async function bootstrap() {
  ui.bindHandlers({
    onRecord: handleRecord,
    onOverdub: handleOverdub,
    onStop: handleStop,
    onClear: handleClear,
    onUndo: handleUndo,
    onToggleMonitor: toggleMonitor,
    onToggleProcessing: toggleProcessing,
    onToggleLatencyMode: toggleLatencyMode,
    onRefreshDevices: refreshDevices,
    onInputDeviceChange: switchInputDevice,
    onOutputDeviceChange: switchOutputDevice,
    onVolumeChange: (value) => audioEngine.setMasterVolume(value),
  });

  stateManager.subscribe((state) => {
    ui.renderState(state, { hasLoop: audioEngine.hasLoop() });
  });

  audioEngine.setLevelCallback((level) => ui.drawLevel(level));

  await initializeAudio();
  await refreshDevices();
  ui.setMonitorState(monitorEnabled);
  ui.setProcessingState(processingMode);
  ui.setLatencyModeState(lowLatencyMode);
  showSupportNote();
}

async function initializeAudio(inputId = "") {
  activeInputId = inputId;
  deviceManager.setProcessingMode(processingMode);
  deviceManager.setLowLatencyMode(lowLatencyMode);

  const stream = await deviceManager.requestInputStream(inputId);
  if (!audioEngine.audioContext) {
    await audioEngine.init(stream);
  } else {
    await audioEngine.updateInputStream(stream);
  }

  audioEngine.setLowLatencyMode(lowLatencyMode);
  audioEngine.setInputMonitoring(monitorEnabled);
  audioEngine.setMasterVolume(Number(ui.elements.volume.value));
}

async function refreshDevices() {
  const deviceList = await deviceManager.listAudioDevices();
  ui.renderDevices({
    inputs: deviceList.inputs,
    outputs: deviceList.outputs,
    outputSupported: deviceManager.outputSelectionSupported(),
  });
}

async function switchInputDevice(inputDeviceId) {
  await initializeAudio(inputDeviceId);
}

async function switchOutputDevice(outputDeviceId) {
  try {
    const switched = await audioEngine.setOutputDevice(outputDeviceId);
    if (!switched) {
      ui.setSupportNote("Output switching is not active in low-latency mode. Use system/browser output routing.");
    }
  } catch (error) {
    console.warn("Output switching failed", error);
  }
}

function toggleMonitor() {
  monitorEnabled = !monitorEnabled;
  audioEngine.setInputMonitoring(monitorEnabled);
  ui.setMonitorState(monitorEnabled);
}

async function toggleProcessing() {
  processingMode = processingMode === "guitar" ? "voice" : "guitar";
  ui.setProcessingState(processingMode);
  await initializeAudio(activeInputId);
  showSupportNote();
}

async function toggleLatencyMode() {
  lowLatencyMode = !lowLatencyMode;
  ui.setLatencyModeState(lowLatencyMode);
  await initializeAudio(activeInputId);
  showSupportNote();
}

function handleRecord() {
  const state = stateManager.getState();

  if (state === LoopState.RECORDING) {
    const loop = audioEngine.stopRecordingToLoop();
    stateManager.setState(loop ? LoopState.PLAYING : LoopState.IDLE);
    return;
  }

  if (state === LoopState.PLAYING) {
    audioEngine.clear();
  }

  audioEngine.startRecording();
  stateManager.setState(LoopState.RECORDING);
}

function handleOverdub() {
  if (!audioEngine.hasLoop()) {
    return;
  }
  clearTimeout(overdubTimer);
  audioEngine.startOverdub();
  stateManager.setState(LoopState.OVERDUBBING);

  const loopDurationMs = (audioEngine.loopBuffer.duration || 0) * 1000;
  overdubTimer = setTimeout(() => {
    if (stateManager.getState() === LoopState.OVERDUBBING) {
      audioEngine.stopOverdub();
      stateManager.setState(LoopState.PLAYING);
    }
  }, loopDurationMs);
}

function handleStop() {
  const state = stateManager.getState();
  if (state === LoopState.RECORDING) {
    const loop = audioEngine.stopRecordingToLoop();
    stateManager.setState(loop ? LoopState.PLAYING : LoopState.IDLE);
    return;
  }
  if (state === LoopState.OVERDUBBING) {
    audioEngine.stopOverdub();
    stateManager.setState(LoopState.PLAYING);
    return;
  }

  clearTimeout(overdubTimer);
  audioEngine.stop();
  stateManager.setState(LoopState.IDLE);
}

function handleClear() {
  clearTimeout(overdubTimer);
  audioEngine.clear();
  stateManager.setState(LoopState.IDLE);
}

function handleUndo() {
  const restored = audioEngine.undo();
  if (restored) {
    stateManager.setState(LoopState.PLAYING);
  }
}

function showSupportNote() {
  const processingText = processingMode === "guitar"
    ? "Guitar mode keeps browser DSP off for cleaner tone."
    : "Voice mode enables browser echo/noise cleanup, which can color guitar tone.";
  const latencyText = lowLatencyMode
    ? "Low latency mode prioritizes fastest monitoring and playback response."
    : "Balanced mode enables full processing chain with a bit more latency.";
  ui.setSupportNote(`${processingText} ${latencyText}`);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

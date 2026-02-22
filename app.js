import { AudioEngine } from "./audioEngine.js";
import { DeviceManager } from "./deviceManager.js";
import { StateManager, LoopState } from "./stateManager.js";
import { UIController } from "./uiController.js";

const audioEngine = new AudioEngine();
const deviceManager = new DeviceManager();
const stateManager = new StateManager();
const ui = new UIController();

let monitorEnabled = false;
let processingMode = "raw";
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
  showSupportNote();
}

async function initializeAudio(inputId = "") {
  activeInputId = inputId;
  deviceManager.setProcessingMode(processingMode);
  const stream = await deviceManager.requestInputStream(inputId);
  if (!audioEngine.audioContext) {
    await audioEngine.init(stream);
  } else {
    await audioEngine.updateInputStream(stream);
  }
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
    await audioEngine.setOutputDevice(outputDeviceId);
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
  processingMode = processingMode === "raw" ? "voice" : "raw";
  ui.setProcessingState(processingMode);
  await initializeAudio(activeInputId);
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
  const outputSupported = deviceManager.outputSelectionSupported();
  const note = outputSupported
    ? "Raw input mode avoids voice breakup artifacts; switch to Voice mode only when you need browser noise/echo cleanup."
    : "Raw input mode is default for cleaner loop playback. Voice processing can be toggled if needed on supported devices.";
  ui.setSupportNote(note);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

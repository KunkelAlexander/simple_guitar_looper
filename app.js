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
let activeTrack = 0;
let overdubTimer = null;

async function bootstrap() {
  ui.bindHandlers({
    onRecord: handleRecord,
    onPlayPause: handlePlayPause,
    onOverdub: handleOverdub,
    onStop: handleStop,
    onClear: handleClear,
    onUndo: handleUndo,
    onToggleMonitor: toggleMonitor,
    onToggleProcessing: toggleProcessing,
    onToggleLatencyMode: toggleLatencyMode,
    onSelectTrack: selectTrack,
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
  ui.setTrackState(activeTrack);
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

  if (!audioEngine.audioContext) await audioEngine.init(stream);
  else await audioEngine.updateInputStream(stream);

  audioEngine.setActiveTrack(activeTrack);
  audioEngine.setLowLatencyMode(lowLatencyMode);
  audioEngine.setProcessingMode(processingMode);
  audioEngine.setInputMonitoring(monitorEnabled);
  audioEngine.setMasterVolume(Number(ui.elements.volume.value));
}

async function refreshDevices() {
  const devices = await deviceManager.listAudioDevices();
  ui.renderDevices({ inputs: devices.inputs, outputs: devices.outputs, outputSupported: deviceManager.outputSelectionSupported() });
}

async function switchInputDevice(inputDeviceId) { await initializeAudio(inputDeviceId); }

async function switchOutputDevice(outputDeviceId) {
  try {
    const switched = await audioEngine.setOutputDevice(outputDeviceId);
    if (!switched) ui.setSupportNote("Output switching is not active in low-latency mode. Use system/browser output routing.");
  } catch (error) {
    console.warn("Output switching failed", error);
  }
}

function selectTrack(track) {
  activeTrack = track;
  audioEngine.setActiveTrack(track);
  ui.setTrackState(track);
  stateManager.setState(audioEngine.hasLoop() ? LoopState.PLAYING : LoopState.IDLE);
}

function toggleMonitor() { monitorEnabled = !monitorEnabled; audioEngine.setInputMonitoring(monitorEnabled); ui.setMonitorState(monitorEnabled); }
async function toggleProcessing() { processingMode = processingMode === "guitar" ? "voice" : "guitar"; ui.setProcessingState(processingMode); await initializeAudio(activeInputId); showSupportNote(); }
async function toggleLatencyMode() { lowLatencyMode = !lowLatencyMode; ui.setLatencyModeState(lowLatencyMode); await initializeAudio(activeInputId); showSupportNote(); }

function handleRecord() {
  const state = stateManager.getState();
  if (state === LoopState.RECORDING) {
    const loop = audioEngine.stopRecordingToLoop();
    stateManager.setState(loop || audioEngine.hasLoop() ? LoopState.PLAYING : LoopState.IDLE);
    return;
  }
  audioEngine.startRecording();
  stateManager.setState(LoopState.RECORDING);
}

function handlePlayPause() {
  const state = stateManager.getState();
  if (!audioEngine.hasLoop()) return;
  if (state === LoopState.PLAYING) {
    audioEngine.stop();
    stateManager.setState(LoopState.IDLE);
  } else {
    audioEngine.playLoop();
    stateManager.setState(LoopState.PLAYING);
  }
}

function handleOverdub() {
  if (!audioEngine.hasLoop()) return;
  clearTimeout(overdubTimer);
  audioEngine.startOverdub();
  stateManager.setState(LoopState.OVERDUBBING);
  const durationMs = (audioEngine.loopBuffers[audioEngine.currentTrack]?.duration || 0) * 1000;
  overdubTimer = setTimeout(() => {
    if (stateManager.getState() === LoopState.OVERDUBBING) {
      audioEngine.stopOverdub();
      stateManager.setState(LoopState.PLAYING);
    }
  }, Math.max(durationMs, 50));
}

function handleStop() {
  const state = stateManager.getState();
  if (state === LoopState.RECORDING) {
    const loop = audioEngine.stopRecordingToLoop();
    stateManager.setState(loop || audioEngine.hasLoop() ? LoopState.PLAYING : LoopState.IDLE);
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

function handleClear() { clearTimeout(overdubTimer); audioEngine.clear(); stateManager.setState(LoopState.IDLE); }
function handleUndo() { if (audioEngine.undo()) stateManager.setState(LoopState.PLAYING); }

function showSupportNote() {
  const processing = processingMode === "guitar"
    ? "Guitar mode now includes an input boost for interfaces with low instrument level."
    : "Voice mode enables browser cleanup and typically higher perceived input loudness.";
  const latency = lowLatencyMode
    ? "Low latency mode is best for live guitar timing."
    : "Balanced mode adds processing but can feel slower.";
  ui.setSupportNote(`${processing} ${latency}`);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

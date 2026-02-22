import { AudioEngine } from "./audioEngine.js";
import { DeviceManager } from "./deviceManager.js";
import { StateManager, LoopState } from "./stateManager.js";
import { UIController } from "./uiController.js";

const audioEngine = new AudioEngine();
const deviceManager = new DeviceManager();
const stateManager = new StateManager();
const ui = new UIController();

let currentStream = null;

async function bootstrap() {
  ui.bindHandlers({
    onRecord: handleRecord,
    onOverdub: handleOverdub,
    onStop: handleStop,
    onClear: handleClear,
    onUndo: handleUndo,
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
  showSupportNote();
}

async function initializeAudio(inputId = "") {
  currentStream = await deviceManager.requestInputStream(inputId);
  if (!audioEngine.audioContext) {
    await audioEngine.init(currentStream);
  } else {
    await audioEngine.updateInputStream(currentStream);
  }
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

function handleRecord() {
  const state = stateManager.getState();

  if (state === LoopState.RECORDING) {
    audioEngine.stopRecordingToLoop();
    stateManager.setState(LoopState.PLAYING);
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
  audioEngine.startOverdub();
  stateManager.setState(LoopState.OVERDUBBING);

  const loopDurationMs = (audioEngine.loopBuffer.duration || 0) * 1000;
  setTimeout(() => {
    if (stateManager.getState() === LoopState.OVERDUBBING) {
      audioEngine.stopOverdub();
      stateManager.setState(LoopState.PLAYING);
    }
  }, loopDurationMs);
}

function handleStop() {
  const state = stateManager.getState();
  if (state === LoopState.RECORDING) {
    audioEngine.stopRecordingToLoop();
    stateManager.setState(LoopState.PLAYING);
    return;
  }
  if (state === LoopState.OVERDUBBING) {
    audioEngine.stopOverdub();
    stateManager.setState(LoopState.PLAYING);
    return;
  }

  audioEngine.stop();
  stateManager.setState(LoopState.IDLE);
}

function handleClear() {
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
    ? "Output device selection is available in this browser."
    : "Output device switching is limited on many mobile browsers; input selection still works.";
  ui.setSupportNote(note);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

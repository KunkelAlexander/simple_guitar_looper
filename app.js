import { AudioEngine } from "./audioEngine.js";
import { DeviceManager } from "./deviceManager.js";
import { StateManager, LoopState } from "./stateManager.js";
import { UIController } from "./uiController.js";

const engine = new AudioEngine();
const devices = new DeviceManager();
const state = new StateManager();
const ui = new UIController();

let monitorEnabled = false;
let processingMode = "guitar";
let lowLatencyMode = true;
let activeInputId = "";

async function bootstrap() {
  ui.bindHandlers({
    onRecord: handleRecord,
    onPlay: handlePlay,
    onStop: handleStop,
    onClear: handleClear,
    onToggleMonitor: toggleMonitor,
    onToggleProcessing: toggleProcessing,
    onToggleLatencyMode: toggleLatency,
    onRefreshDevices: refreshDevices,
    onInputDeviceChange: switchInput,
    onOutputDeviceChange: switchOutput,
    onVolumeChange: (value) => engine.setMasterVolume(value),
  });

  state.subscribe((current) => {
    ui.renderState(current, { hasLoop: engine.hasLoop() });
  });

  engine.setLevelCallback((level) => ui.drawLevel(level));

  await initializeAudio();
  await refreshDevices();
  ui.setMonitor(monitorEnabled);
  ui.setProcessing(processingMode);
  ui.setLatency(lowLatencyMode);
  setHelpText();
}

async function initializeAudio(inputId = "") {
  activeInputId = inputId;
  devices.setProcessingMode(processingMode);
  devices.setLowLatencyMode(lowLatencyMode);
  const stream = await devices.requestInputStream(inputId);

  if (!engine.audioContext) await engine.init(stream);
  else await engine.updateInputStream(stream);

  engine.setProcessingMode(processingMode);
  engine.setInputMonitoring(monitorEnabled);
  engine.setMasterVolume(Number(ui.elements.volume.value));
}

async function refreshDevices() {
  const list = await devices.listAudioDevices();
  ui.renderDevices({
    inputs: list.inputs,
    outputs: list.outputs,
    outputSupported: devices.outputSelectionSupported(),
  });
}

async function switchInput(deviceId) {
  await initializeAudio(deviceId);
}

async function switchOutput(deviceId) {
  try {
    const switched = await engine.setOutputDevice(deviceId);
    if (!switched) ui.setSupportNote("Output selection not supported by this browser.");
  } catch (error) {
    console.warn(error);
  }
}

function handleRecord() {
  const current = state.getState();
  if (current === LoopState.RECORDING) {
    const ok = engine.stopRecordingToLoop();
    state.setState(ok ? LoopState.READY : LoopState.IDLE);
    return;
  }
  if (current === LoopState.PLAYING) {
    engine.stop();
  }
  engine.startRecording();
  state.setState(LoopState.RECORDING);
}

function handlePlay() {
  const played = engine.playLoop();
  state.setState(played ? LoopState.PLAYING : LoopState.IDLE);
}

function handleStop() {
  if (state.getState() === LoopState.RECORDING) {
    const ok = engine.stopRecordingToLoop();
    state.setState(ok ? LoopState.READY : LoopState.IDLE);
    return;
  }
  engine.stop();
  state.setState(engine.hasLoop() ? LoopState.READY : LoopState.IDLE);
}

function handleClear() {
  engine.clear();
  state.setState(LoopState.IDLE);
}

function toggleMonitor() {
  monitorEnabled = !monitorEnabled;
  engine.setInputMonitoring(monitorEnabled);
  ui.setMonitor(monitorEnabled);
}

async function toggleProcessing() {
  processingMode = processingMode === "guitar" ? "voice" : "guitar";
  ui.setProcessing(processingMode);
  await initializeAudio(activeInputId);
  setHelpText();
}

async function toggleLatency() {
  lowLatencyMode = !lowLatencyMode;
  ui.setLatency(lowLatencyMode);
  await initializeAudio(activeInputId);
  setHelpText();
}

function setHelpText() {
  const mode = processingMode === "guitar"
    ? "Guitar mode boosts input for interfaces."
    : "Voice mode uses browser cleanup and can color tone.";
  ui.setSupportNote(`${mode} Flow: Record → Stop (ready) → Play → Stop.`);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

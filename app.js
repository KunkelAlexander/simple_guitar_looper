import { AudioEngine } from "./audioEngine.js";
import { DeviceManager } from "./deviceManager.js";
import { StateManager, LoopState } from "./stateManager.js";
import { UIController } from "./uiController.js";

const audioEngine = new AudioEngine();
const deviceManager = new DeviceManager();
const stateManager = new StateManager();
const ui = new UIController();

let activeTrack = 0;
let processingMode = "guitar";
let lowLatencyMode = true;
let monitorEnabled = false;
let activeInputId = "";

async function bootstrap() {
  ui.bindHandlers({
    onTrackPress: handleTrackPress,
    onStop: handleStop,
    onClearLongPress: handleClearLongPress,
    onToggleMonitor: toggleMonitor,
    onToggleProcessing: toggleProcessing,
    onToggleLatencyMode: toggleLatency,
    onRefreshDevices: refreshDevices,
    onInputDeviceChange: switchInputDevice,
    onVolumeChange: (v) => audioEngine.setMasterVolume(v),
    onOutputDeviceChange: () => {},
  });

  stateManager.subscribe((state) => {
    ui.renderState(state, { activeTrack, loopPresence: [audioEngine.hasLoop(0), audioEngine.hasLoop(1)] });
  });

  audioEngine.setLevelCallback((level) => ui.drawLevel(level));

  await initializeAudio();
  await refreshDevices();
  ui.setTrackState(activeTrack);
  ui.setProcessingState(processingMode);
  ui.setLatencyModeState(lowLatencyMode);
  ui.setMonitorState(monitorEnabled);
  showSupportNote();
}

async function initializeAudio(inputId = "") {
  activeInputId = inputId;
  deviceManager.setProcessingMode(processingMode);
  deviceManager.setLowLatencyMode(lowLatencyMode);
  const stream = await deviceManager.requestInputStream(inputId);

  if (!audioEngine.audioContext) await audioEngine.init(stream);
  else await audioEngine.updateInputStream(stream);

  audioEngine.setLowLatencyMode(lowLatencyMode);
  audioEngine.setProcessingMode(processingMode);
  audioEngine.setInputMonitoring(monitorEnabled);
  audioEngine.setActiveTrack(activeTrack);
  audioEngine.setMasterVolume(Number(ui.elements.volume.value));
}

async function refreshDevices() {
  const { inputs } = await deviceManager.listAudioDevices();
  ui.renderDevices(inputs);
}

async function switchInputDevice(deviceId) { await initializeAudio(deviceId); }

async function toggleProcessing() {
  processingMode = processingMode === "guitar" ? "voice" : "guitar";
  ui.setProcessingState(processingMode);
  await initializeAudio(activeInputId);
  showSupportNote();
}

async function toggleLatency() {
  lowLatencyMode = !lowLatencyMode;
  ui.setLatencyModeState(lowLatencyMode);
  await initializeAudio(activeInputId);
  showSupportNote();
}

function toggleMonitor() {
  monitorEnabled = !monitorEnabled;
  audioEngine.setInputMonitoring(monitorEnabled);
  ui.setMonitorState(monitorEnabled);
}

function handleTrackPress(trackIndex) {
  const state = stateManager.getState();

  if (state === LoopState.RECORDING && trackIndex === activeTrack) {
    audioEngine.stopRecordingToLoop();
    stateManager.setState(LoopState.IDLE);
    return;
  }

  if (trackIndex !== activeTrack) {
    activeTrack = trackIndex;
    audioEngine.setActiveTrack(trackIndex);
    ui.setTrackState(trackIndex);
    stateManager.setState(LoopState.IDLE);
    return;
  }

  if (!audioEngine.hasLoop(trackIndex)) {
    audioEngine.startRecording();
    stateManager.setState(LoopState.RECORDING);
    return;
  }

  const played = audioEngine.playLoop();
  stateManager.setState(played ? LoopState.PLAYING : LoopState.IDLE);
}

function handleStop() {
  const state = stateManager.getState();
  if (state === LoopState.RECORDING) {
    audioEngine.stopRecordingToLoop();
  }
  audioEngine.stop();
  stateManager.setState(LoopState.IDLE);
}

function handleClearLongPress() {
  audioEngine.clearTrack(activeTrack);
  stateManager.setState(LoopState.IDLE);
  showSupportNote("Track cleared");
}

function showSupportNote(custom) {
  if (custom) {
    ui.setSupportNote(custom);
    return;
  }
  const processing = processingMode === "guitar" ? "Guitar mode adds input boost for audio interfaces." : "Voice mode enables browser voice processing.";
  ui.setSupportNote(`${processing} Tap track pad: record -> stop -> play. Hold Stop to clear current track.`);
}

bootstrap().catch((error) => {
  console.error(error);
  ui.setSupportNote(`Initialization error: ${error.message}`);
});

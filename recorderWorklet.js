class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || !channelData.length) {
      return true;
    }

    const clone = new Float32Array(channelData.length);
    clone.set(channelData);
    this.port.postMessage(clone, [clone.buffer]);
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);

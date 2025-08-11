declare module 'opus-media-recorder' {
  const OpusMediaRecorder: typeof MediaRecorder;
  export default OpusMediaRecorder;
}

declare module 'opus-media-recorder/encoderWorker' {
  const EncoderWorker: Worker;
  export default EncoderWorker;
}

declare module 'opus-media-recorder/OggOpusEncoder.wasm' {
  const OggOpusWasm: URL;
  export default OggOpusWasm;
}

declare module 'opus-media-recorder/WebMOpusEncoder.wasm' {
  const WebMOpusWasm: URL;
  export default WebMOpusWasm;
}

import { floatToPcm16, level, resample } from "./pcm";
import { ENGINE_SAMPLE_RATE } from "./protocol";

/**
 * Mikrofon → 16 kHz mono PCM16 i biter på ~100 ms. Lyden går bare til
 * «onChunk»; den lagres ikke og sendes ikke noe annet sted.
 */
export interface MicrophoneCapture {
  stop(): void;
}

export interface CaptureEvents {
  onChunk(pcm16: Int16Array): void;
  onLevel(level: number): void;
}

const CHUNK_SECONDS = 0.1;

// AudioWorklet-prosessoren sender rå float32-blokker til hovedtråden.
const WORKLET_SOURCE = `
class EvidaPcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("evida-pcm-tap", EvidaPcmTap);
`;

export type CaptureFailure = "permission_denied" | "no_microphone" | "unsupported";

export class CaptureError extends Error {
  constructor(readonly reason: CaptureFailure) {
    super(reason);
  }
}

export async function startMicrophone(events: CaptureEvents): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new CaptureError("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new CaptureError(name === "NotAllowedError" || name === "SecurityError" ? "permission_denied" : "no_microphone");
  }

  // Be om 16 kHz direkte; nettleseren kan likevel gi en annen rate, og da samples det ned.
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE });
  } catch {
    ctx = new AudioContext();
  }
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "evida-pcm-tap");
  const rate = ctx.sampleRate;
  const target = Math.round(CHUNK_SECONDS * ENGINE_SAMPLE_RATE);
  let buffered: Float32Array[] = [];
  let bufferedLength = 0;

  tap.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    const block = resample(ev.data, rate);
    buffered.push(block);
    bufferedLength += block.length;
    if (bufferedLength < target) return;
    const joined = new Float32Array(bufferedLength);
    let offset = 0;
    for (const b of buffered) {
      joined.set(b, offset);
      offset += b.length;
    }
    buffered = [];
    bufferedLength = 0;
    events.onLevel(level(joined));
    events.onChunk(floatToPcm16(joined));
  };
  source.connect(tap);

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      tap.port.onmessage = null;
      source.disconnect();
      tap.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
      buffered = [];
    }
  };
}

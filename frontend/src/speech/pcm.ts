import { ENGINE_SAMPLE_RATE } from "./protocol";

/**
 * Lineær nedsampling fra mikrofonens rate til 16 kHz, og float32 [-1, 1] til
 * 16-bit PCM. Brukes når nettleseren ikke gir en AudioContext på 16 kHz.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number = ENGINE_SAMPLE_RATE): Float32Array {
  if (fromRate === toRate) return input;
  if (fromRate < toRate) throw new Error(`kan ikke oppsample fra ${fromRate} Hz`);
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    const a = input[j];
    const b = j + 1 < input.length ? input[j + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}

/** Lydnivå 0–1 for lytteindikatoren (RMS). */
export function level(input: Float32Array): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.min(1, Math.sqrt(sum / input.length) * 4);
}

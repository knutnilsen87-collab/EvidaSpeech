/**
 * nsb-engine protokoll versjon 1, slik EvidaSpeech bruker den.
 * Se docs/SPEECH_CONTRACT.md.
 */

export const ENGINE_SAMPLE_RATE = 16000;

export interface EngineWord {
  text: string;
  start: number;
  end: number;
  probability: number;
  joined: boolean;
  uncertain: boolean;
}

interface StreamPayload {
  committed: EngineWord[];
  tentative: EngineWord[];
  text: string;
  tentativeText: string;
  preview: string;
  endpoint: boolean;
}

export interface UpdateMessage extends StreamPayload {
  type: "update";
}

export interface FinalMessage extends StreamPayload {
  type: "final";
  words: EngineWord[];
}

export interface ErrorMessage {
  type: "error";
  detail: string;
}

export type EngineMessage = UpdateMessage | FinalMessage | ErrorMessage;

export interface StartMessage {
  type: "start";
  hotwords: string;
  format: "legal";
}

/**
 * Startmeldingen kan ikke inneholde «store» eller «consent»: EvidaSpeech ber
 * aldri motoren lagre lyd eller tekst uten et eksplisitt valg, og det valget
 * finnes ikke ennå.
 */
export function buildStartMessage(hotwords: readonly string[]): StartMessage {
  const cleaned = hotwords
    .map((h) => h.replace(/[,\s]+/g, " ").trim())
    .filter((h, i, all) => h.length > 0 && all.indexOf(h) === i);
  return { type: "start", hotwords: cleaned.join(", "), format: "legal" };
}

export class ProtocolError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new ProtocolError(`${key} mangler eller er ikke tekst`);
  return v;
}

function parseWord(v: unknown): EngineWord {
  if (!isRecord(v)) throw new ProtocolError("ord er ikke et objekt");
  const num = (k: string) => {
    const n = v[k];
    if (typeof n !== "number" || !Number.isFinite(n)) throw new ProtocolError(`ord.${k} er ikke et tall`);
    return n;
  };
  return {
    text: str(v, "text"),
    start: num("start"),
    end: num("end"),
    probability: num("probability"),
    joined: v.joined === true,
    uncertain: v.uncertain === true
  };
}

function words(o: Record<string, unknown>, key: string): EngineWord[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new ProtocolError(`${key} er ikke en liste`);
  return v.map(parseWord);
}

/** Tolker én tekstmelding fra motoren. Ukjente felt ignoreres; manglende felt er en feil. */
export function parseEngineMessage(raw: string): EngineMessage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProtocolError("ikke gyldig JSON");
  }
  if (!isRecord(data)) throw new ProtocolError("meldingen er ikke et objekt");
  if (data.type === "error") return { type: "error", detail: typeof data.detail === "string" ? data.detail : "ukjent feil" };
  if (data.type !== "update" && data.type !== "final") throw new ProtocolError(`ukjent meldingstype ${String(data.type)}`);
  const payload: StreamPayload = {
    committed: words(data, "committed"),
    tentative: words(data, "tentative"),
    text: str(data, "text"),
    tentativeText: str(data, "tentative_text"),
    preview: str(data, "preview"),
    endpoint: data.endpoint === true
  };
  if (data.type === "final") return { type: "final", ...payload, words: words(data, "words") };
  return { type: "update", ...payload };
}

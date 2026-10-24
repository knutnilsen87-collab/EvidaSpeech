import type { EngineTransport } from "./engine";
import { buildStartMessage, parseEngineMessage, ProtocolError } from "./protocol";
import { applyMessage, EMPTY_TRANSCRIPT, type Transcript } from "./transcript";

/**
 * Grensesnittet resten av appen ser. Implementasjonen under snakker med
 * nsb-engine, men UI-et vet ikke om det.
 */
export interface SpeechTranscriber {
  /** Åpner én ytring. hotwords: partsnavn og dokumenttitler i åpen sak. */
  open(options: { hotwords: readonly string[]; user?: string }, events: TranscriptEvents): SpeechStream;
}

export interface SpeechStream {
  sendAudio(pcm16: Int16Array): void;
  /** Slutt på lyden (knappen slippes): motoren gjør teksten ferdig. */
  finish(): void;
  /** Avbryt uten resultat. */
  cancel(): void;
}

export type StreamFailure =
  | { kind: "not_paired" }
  | { kind: "rejected" }       // feil nøkkel eller Origin: nøkkelen er slettet
  | { kind: "connection" }     // motoren kjører ikke eller forbindelsen falt
  | { kind: "engine"; detail: string }
  | { kind: "protocol"; detail: string };

export interface TranscriptEvents {
  onTranscript(t: Transcript): void;
  onFinal(t: Transcript): void;
  onFailure(f: StreamFailure): void;
}

export type SocketFactory = (url: string) => WebSocket;

/** WebSocket-lukkekode motoren bruker ved feil nøkkel eller ukjent Origin. */
const POLICY_VIOLATION = 1008;

export class NsbTranscriber implements SpeechTranscriber {
  constructor(
    private readonly transport: EngineTransport,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url)
  ) {}

  open(options: { hotwords: readonly string[]; user?: string }, events: TranscriptEvents): SpeechStream {
    const url = this.transport.streamUrl(options.user);
    if (!url) {
      queueMicrotask(() => events.onFailure({ kind: "not_paired" }));
      return { sendAudio: () => undefined, finish: () => undefined, cancel: () => undefined };
    }

    const ws = this.socketFactory(url);
    ws.binaryType = "arraybuffer";
    let transcript = EMPTY_TRANSCRIPT;
    let done = false;
    let opened = false;
    let finishRequested = false;
    const pending: ArrayBuffer[] = [];

    const fail = (f: StreamFailure) => {
      if (done) return;
      done = true;
      events.onFailure(f);
      try {
        ws.close();
      } catch {
        /* allerede lukket */
      }
    };

    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify(buildStartMessage(options.hotwords)));
      for (const chunk of pending.splice(0)) ws.send(chunk);
      if (finishRequested) ws.send(JSON.stringify({ type: "end" }));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (done || typeof ev.data !== "string") return;
      try {
        const msg = parseEngineMessage(ev.data);
        if (msg.type === "error") {
          fail({ kind: "engine", detail: msg.detail });
          return;
        }
        transcript = applyMessage(transcript, msg);
        if (msg.type === "final") {
          done = true;
          events.onFinal(transcript);
          ws.close();
        } else {
          events.onTranscript(transcript);
        }
      } catch (e) {
        fail({ kind: "protocol", detail: e instanceof ProtocolError ? e.message : String(e) });
      }
    };

    ws.onclose = (ev: CloseEvent) => {
      if (done) return;
      if (ev.code === POLICY_VIOLATION) {
        this.transport.tokens.clear();
        fail({ kind: "rejected" });
        return;
      }
      if (opened) {
        fail({ kind: "connection" });
        return;
      }
      // Motoren avviser feil nøkkel før håndtrykket er ferdig, så nettleseren
      // ser bare at forbindelsen ikke ble åpnet. Spør motoren om nøkkelen.
      done = true;
      void this.transport.checkToken().then((status) => {
        events.onFailure(status === "invalid" ? { kind: "rejected" } : { kind: "connection" });
      });
    };

    ws.onerror = () => {
      /* onclose følger alltid og avgjør hva som gikk galt */
    };

    return {
      sendAudio: (pcm16) => {
        if (done || finishRequested) return;
        const chunk = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength) as ArrayBuffer;
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
        else if (ws.readyState === WebSocket.CONNECTING) pending.push(chunk);
      },
      finish: () => {
        if (done || finishRequested) return;
        finishRequested = true;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end" }));
      },
      cancel: () => {
        if (done) return;
        done = true;
        pending.length = 0;
        try {
          ws.close();
        } catch {
          /* allerede lukket */
        }
      }
    };
  }
}

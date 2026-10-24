import { describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/mock-stream.json";
import { assertLoopback, browserTokenStore, EngineTransport, TOKEN_STORAGE_KEY, type TokenStore } from "./engine";
import { floatToPcm16, level, resample } from "./pcm";
import { buildStartMessage, parseEngineMessage, ProtocolError, type EngineWord } from "./protocol";
import { NsbTranscriber, type StreamFailure } from "./session";
import { applyMessage, EMPTY_TRANSCRIPT, markUncertain, type Transcript } from "./transcript";

const rawMessages = fixture.messages.map((m) => JSON.stringify(m));
const finalMessage = fixture.messages[fixture.messages.length - 1] as unknown as { text: string; words: EngineWord[] };

describe("protokoll mot ekte motor (kontraktsfasit fra mock)", () => {
  it("tolker hver melding motoren sendte", () => {
    const parsed = rawMessages.map(parseEngineMessage);
    expect(parsed.map((m) => m.type)).toEqual([...Array(parsed.length - 1).fill("update"), "final"]);
  });

  it("gir motorens formaterte tekst, med hardt mellomrom etter §", () => {
    let t = EMPTY_TRANSCRIPT;
    for (const raw of rawMessages) t = applyMessage(t, parseEngineMessage(raw));
    expect(t.final).toBe(true);
    expect(t.committedText).toBe("Etter § 271 har saksøker krav.");
  });

  it("formateringen kan endre ferdig tekst; klienten viser motorens tekst, ikke sammensatte ord", () => {
    const texts = rawMessages.map((raw) => parseEngineMessage(raw)).map((m) => (m.type === "error" ? "" : m.text));
    expect(texts).toContain("Etter § 200 og");
    expect(texts[texts.length - 1]).not.toContain("200");
  });

  it("samler alle ferdige råord fra oppdateringene", () => {
    let t = EMPTY_TRANSCRIPT;
    for (const raw of rawMessages.slice(0, -1)) t = applyMessage(t, parseEngineMessage(raw));
    expect(t.committedWords.map((w) => w.text).join(" ")).toBe(
      finalMessage.words.slice(0, t.committedWords.length).map((w) => w.text).join(" ")
    );
  });

  it("avviser meldinger som mangler felt eller har ukjent type", () => {
    expect(() => parseEngineMessage("{")).toThrow(ProtocolError);
    expect(() => parseEngineMessage(JSON.stringify({ type: "update" }))).toThrow(ProtocolError);
    expect(() => parseEngineMessage(JSON.stringify({ type: "noe" }))).toThrow(ProtocolError);
    expect(parseEngineMessage(JSON.stringify({ type: "error", detail: "lagring krever samtykke" }))).toEqual({
      type: "error",
      detail: "lagring krever samtykke"
    });
  });
});

describe("startmeldingen", () => {
  it("sender sakens hotwords og ber aldri om lagring", () => {
    const msg = buildStartMessage(["Kirkerud", " Ås ", "Kirkerud", "", "Skademelding, motorvogn"]);
    expect(msg).toEqual({ type: "start", hotwords: "Kirkerud, Ås, Skademelding motorvogn", format: "legal" });
    expect(Object.keys(msg).sort()).toEqual(["format", "hotwords", "type"]);
  });

  it("har tomme hotwords når ingen sak er åpen", () => {
    expect(buildStartMessage([]).hotwords).toBe("");
  });
});

describe("usikre ord", () => {
  const word = (text: string, uncertain = false) => ({ text, start: 0, end: 0, probability: uncertain ? 0.3 : 0.9, joined: false, uncertain });

  it("markeres der de står i teksten", () => {
    const { spans, unplaced } = markUncertain("vitnet Holm forklarte", [word("vitnet"), word("Holm", true), word("forklarte")]);
    expect(spans).toEqual([
      { text: "vitnet ", uncertain: false },
      { text: "Holm", uncertain: true },
      { text: " forklarte", uncertain: false }
    ]);
    expect(unplaced).toEqual([]);
  });

  it("som formateringen har gjort om, listes i stedet for å forsvinne", () => {
    const { spans, unplaced } = markUncertain(finalMessage.text, finalMessage.words);
    expect(unplaced).toEqual(["syttien"]);
    expect(spans.map((s) => s.text).join("")).toBe(finalMessage.text);
  });

  it("matcher hele ord, ikke deler av ord", () => {
    const { spans } = markUncertain("Holmen og Holm", [word("Holm", true)]);
    expect(spans).toEqual([
      { text: "Holmen og ", uncertain: false },
      { text: "Holm", uncertain: true }
    ]);
  });
});

describe("lyd", () => {
  it("sampler ned til 16 kHz", () => {
    const input = new Float32Array(48000).fill(0.5);
    expect(resample(input, 48000).length).toBe(16000);
    expect(resample(input, 16000)).toBe(input);
  });

  it("gjør float om til 16-bit PCM og klipper", () => {
    expect(Array.from(floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it("gir lydnivå mellom 0 og 1", () => {
    expect(level(new Float32Array(100))).toBe(0);
    expect(level(new Float32Array(100).fill(1))).toBe(1);
  });
});

describe("transport", () => {
  function memoryStore(initial: string | null = null): TokenStore {
    let v = initial;
    return { get: () => v, set: (t) => (v = t), clear: () => (v = null) };
  }

  it("godtar bare motor på denne maskinen", () => {
    expect(() => assertLoopback("http://127.0.0.1:8765")).not.toThrow();
    expect(() => assertLoopback("http://localhost:8765")).not.toThrow();
    expect(() => assertLoopback("http://192.168.1.10:8765")).toThrow(/denne maskinen/);
    expect(() => assertLoopback("https://speech.example.com")).toThrow();
    expect(() => new EngineTransport("http://10.0.0.2:8765", memoryStore())).toThrow();
  });

  it("sier ærlig fra når motoren ikke kjører", async () => {
    const t = new EngineTransport(undefined, memoryStore(), vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await t.health()).toEqual({ status: "not_running" });
    expect(await t.pair("123")).toEqual({ ok: false, reason: "not_running" });
  });

  it("lagrer nøkkelen etter vellykket paring", async () => {
    const store = memoryStore();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "abc" }), { status: 200 }));
    const t = new EngineTransport(undefined, store, fetchImpl);
    expect(await t.pair(" 12345678 ")).toEqual({ ok: true });
    expect(store.get()).toBe("abc");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ code: "12345678" });
  });

  it("skiller feil kode, stengt paring og avvist nettside", async () => {
    for (const [status, reason] of [[401, "wrong_code"], [410, "closed"], [403, "origin_refused"], [500, "unexpected"]] as const) {
      const t = new EngineTransport(undefined, memoryStore(), vi.fn().mockResolvedValue(new Response("{}", { status })));
      expect(await t.pair("1")).toEqual({ ok: false, reason });
    }
  });

  it("sletter en nøkkel motoren ikke lenger godtar", async () => {
    const store = memoryStore("gammel");
    const t = new EngineTransport(undefined, store, vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect(await t.isPaired()).toBe(false);
    expect(store.get()).toBeNull();
  });

  it("bygger ws-adresse med nøkkel og bruker", () => {
    const t = new EngineTransport(undefined, memoryStore("k1"));
    expect(t.streamUrl("advokat")).toBe("ws://127.0.0.1:8766/v1/stream?token=k1&user=advokat");
    expect(new EngineTransport(undefined, memoryStore()).streamUrl()).toBeNull();
  });

  it("husker nøkkelen i minnet når localStorage kaster", () => {
    const broken = { getItem: () => { throw new Error("blokkert"); }, setItem: () => { throw new Error("blokkert"); }, removeItem: () => { throw new Error("blokkert"); } };
    const store = browserTokenStore(broken);
    store.set("x");
    expect(store.get()).toBe("x");
    store.clear();
    expect(store.get()).toBeNull();
  });

  it("lagrer bare nøkkelen under sin egen nøkkel i localStorage", () => {
    const data = new Map<string, string>();
    const store = browserTokenStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) });
    store.set("tok");
    expect([...data.keys()]).toEqual([TOKEN_STORAGE_KEY]);
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  binaryType = "blob";
  sent: (string | ArrayBuffer)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  open() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  serverClose(code: number) {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

describe("strømøkt", () => {
  function setup(token: string | null = "k1", whoamiStatus: number | "down" = 200) {
    FakeSocket.instances = [];
    let stored = token;
    const store: TokenStore = { get: () => stored, set: (t) => (stored = t), clear: () => (stored = null) };
    const fetchImpl = vi.fn(async () => {
      if (whoamiStatus === "down") throw new TypeError("Failed to fetch");
      return new Response("{}", { status: whoamiStatus });
    });
    const transport = new EngineTransport(undefined, store, fetchImpl as unknown as typeof fetch);
    const transcriber = new NsbTranscriber(transport, (url) => new FakeSocket(url) as unknown as WebSocket);
    const seen: Transcript[] = [];
    const finals: Transcript[] = [];
    const failures: StreamFailure[] = [];
    const events = { onTranscript: (t: Transcript) => seen.push(t), onFinal: (t: Transcript) => finals.push(t), onFailure: (f: StreamFailure) => failures.push(f) };
    return { transcriber, events, seen, finals, failures, store: () => stored };
  }

  it("sender start først, så lyd (også lyd tatt opp før forbindelsen var åpen), så end", () => {
    const s = setup();
    const stream = s.transcriber.open({ hotwords: ["Kirkerud"] }, s.events);
    const sock = FakeSocket.instances[0];
    stream.sendAudio(new Int16Array([1, 2]));
    sock.open();
    stream.sendAudio(new Int16Array([3]));
    stream.finish();
    stream.sendAudio(new Int16Array([4]));
    expect(JSON.parse(sock.sent[0] as string)).toEqual({ type: "start", hotwords: "Kirkerud", format: "legal" });
    expect(sock.sent.slice(1, 3).map((b) => Array.from(new Int16Array(b as ArrayBuffer)))).toEqual([[1, 2], [3]]);
    expect(JSON.parse(sock.sent[3] as string)).toEqual({ type: "end" });
    expect(sock.sent).toHaveLength(4);
  });

  it("sender end når forbindelsen åpnes hvis knappen ble sluppet før", () => {
    const s = setup();
    const stream = s.transcriber.open({ hotwords: [] }, s.events);
    stream.finish();
    const sock = FakeSocket.instances[0];
    sock.open();
    expect(JSON.parse(sock.sent[sock.sent.length - 1] as string)).toEqual({ type: "end" });
  });

  it("gir oppdateringer og ferdig tekst fra motorens meldinger", () => {
    const s = setup();
    s.transcriber.open({ hotwords: [] }, s.events);
    const sock = FakeSocket.instances[0];
    sock.open();
    for (const raw of rawMessages) sock.receive(raw);
    expect(s.seen).toHaveLength(rawMessages.length - 1);
    expect(s.finals).toHaveLength(1);
    expect(s.finals[0].committedText).toBe("Etter § 271 har saksøker krav.");
    sock.serverClose(1000);
    expect(s.failures).toEqual([]);
  });

  it("sletter nøkkelen når motoren lukker med 1008 etter åpning", () => {
    const s = setup();
    s.transcriber.open({ hotwords: [] }, s.events);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].serverClose(1008);
    expect(s.failures).toEqual([{ kind: "rejected" }]);
    expect(s.store()).toBeNull();
  });

  it("avvist håndtrykk med nøkkel motoren ikke godtar: «rejected» og nøkkelen slettes", async () => {
    const s = setup("gammel", 401);
    s.transcriber.open({ hotwords: [] }, s.events);
    FakeSocket.instances[0].serverClose(1006);
    await vi.waitFor(() => expect(s.failures).toEqual([{ kind: "rejected" }]));
    expect(s.store()).toBeNull();
  });

  it("avvist håndtrykk når motoren ikke kjører: «connection», nøkkelen beholdes", async () => {
    const s = setup("k1", "down");
    s.transcriber.open({ hotwords: [] }, s.events);
    FakeSocket.instances[0].serverClose(1006);
    await vi.waitFor(() => expect(s.failures).toEqual([{ kind: "connection" }]));
    expect(s.store()).toBe("k1");
  });

  it("sier fra når en åpen forbindelse faller", () => {
    const s = setup();
    s.transcriber.open({ hotwords: [] }, s.events);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].serverClose(1006);
    expect(s.failures).toEqual([{ kind: "connection" }]);
    expect(s.store()).toBe("k1");
  });

  it("melder feil fra motoren og ugyldige meldinger", () => {
    const s = setup();
    s.transcriber.open({ hotwords: [] }, s.events);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].receive(JSON.stringify({ type: "error", detail: "ugyldig JSON" }));
    expect(s.failures).toEqual([{ kind: "engine", detail: "ugyldig JSON" }]);

    const t = setup();
    t.transcriber.open({ hotwords: [] }, t.events);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].receive("{\"type\":\"update\"}");
    expect(t.failures[0].kind).toBe("protocol");
  });

  it("uten paring åpnes ingen forbindelse", async () => {
    const s = setup(null);
    s.transcriber.open({ hotwords: [] }, s.events);
    await Promise.resolve();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(s.failures).toEqual([{ kind: "not_paired" }]);
  });

  it("avbrutt ytring gir verken tekst eller feil", () => {
    const s = setup();
    const stream = s.transcriber.open({ hotwords: [] }, s.events);
    const sock = FakeSocket.instances[0];
    sock.open();
    stream.cancel();
    sock.receive(rawMessages[0]);
    sock.serverClose(1000);
    expect(s.seen).toEqual([]);
    expect(s.failures).toEqual([]);
  });
});

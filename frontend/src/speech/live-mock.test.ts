// @vitest-environment node
/**
 * Kontraktstest mot en kjørende mock-motor: ekte HTTP, ekte WebSocket, ekte
 * nsb_engine-tjeneste. Kjøres av speech\run_contract_check.ps1, som starter
 * motoren og setter NSB_MOCK_URL og NSB_MOCK_PAIRING_FILE. Uten dem hoppes
 * testen over (vanlig `npm test`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EngineTransport, type TokenStore } from "./engine";
import { ENGINE_SAMPLE_RATE } from "./protocol";
import { NsbTranscriber, type StreamFailure } from "./session";
import type { Transcript } from "./transcript";

const url = process.env.NSB_MOCK_URL;
const pairingFile = process.env.NSB_MOCK_PAIRING_FILE;
const ORIGIN = "http://127.0.0.1:5174";

function memoryStore(): TokenStore {
  let v: string | null = null;
  return { get: () => v, set: (t) => (v = t), clear: () => (v = null) };
}

// Node sender ikke Origin av seg selv; nettleseren gjør det alltid.
const fetchAsEvida: typeof fetch = (input, init) =>
  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: ORIGIN } });

function dictate(transcriber: NsbTranscriber, seconds: number, hotwords: string[]): Promise<{ final?: Transcript; updates: number; failure?: StreamFailure }> {
  return new Promise((resolve) => {
    let updates = 0;
    const stream = transcriber.open(
      { hotwords, user: "kontraktstest" },
      {
        onTranscript: () => updates++,
        onFinal: (t) => resolve({ final: t, updates }),
        onFailure: (f) => resolve({ updates, failure: f })
      }
    );
    const chunk = new Int16Array(ENGINE_SAMPLE_RATE / 4).fill(300);
    for (let i = 0; i < seconds * 4; i++) stream.sendAudio(chunk);
    stream.finish();
  });
}

describe.skipIf(!url || !pairingFile)("mot kjørende mock-motor", () => {
  const store = memoryStore();
  const transport = new EngineTransport(url, store, fetchAsEvida);
  const transcriber = new NsbTranscriber(transport, (u) => new WebSocket(u));

  it("svarer på helse og sier at modellen er skriptet", async () => {
    const h = await transport.health();
    expect(h).toMatchObject({ status: "running", model: "mock (skriptet)" });
  });

  it("strøm uten paring åpner ingen forbindelse", async () => {
    expect((await dictate(transcriber, 1, [])).failure).toEqual({ kind: "not_paired" });
  });

  it("feil kode gir ikke nøkkel", async () => {
    expect(await transport.pair("00000000")).toEqual({ ok: false, reason: "wrong_code" });
    expect(store.get()).toBeNull();
  });

  it("riktig kode gir nøkkel, og nøkkelen godtas", async () => {
    const code = readFileSync(pairingFile!, "utf8").trim();
    expect(await transport.pair(code)).toEqual({ ok: true });
    expect(await transport.isPaired()).toBe(true);
  });

  it("dikterer med juridisk formatering og sakens hotwords", async () => {
    const r = await fetch(new URL("/mock/script", url), {
      method: "POST",
      headers: { Authorization: `Bearer ${store.get()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "etter paragraf to hundre og syttien punktum" })
    });
    expect(r.status).toBe(200);
    const result = await dictate(transcriber, 3, ["Kirkerud", "Ås"]);
    expect(result.failure).toBeUndefined();
    expect(result.updates).toBeGreaterThan(0);
    expect(result.final?.committedText).toBe("etter § 271.");
  });

  it("avvist nøkkel slettes og gir «rejected»", async () => {
    store.set("feil-nokkel");
    expect((await dictate(transcriber, 1, [])).failure).toEqual({ kind: "rejected" });
    expect(store.get()).toBeNull();
  });
});

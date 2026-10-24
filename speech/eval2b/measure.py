"""Fase 2b: ventetid og ordfeilrate for den ekte motoren på innlest juridisk diktat.

Motoren må kjøre (``speech\\RUN_ENGINE.cmd``). For hvert opptak i
``speech/recordings/2b/`` strømmes lyden i sanntid (100 ms biter), slik
nettleseren gjør, to ganger:

* **Push-to-talk:** talen, så ``end`` med en gang (knappen slippes).
  Måler tiden fra ``end`` er sendt til ``final`` kommer.
* **Pause:** talen, så 1,5 s stillhet uten ``end``. Måler tiden fra pausen
  begynner til motoren selv gjør teksten ferdig (``endpoint``), og deretter
  fra ``end`` til ``final``.

Stillhet før og etter talen i opptaket skjæres bort først, så «pausen
begynner» er et kjent tidspunkt og ikke avhenger av når opptaket ble stoppet.

Ordfeilrate (WER) og tegnfeilrate (CER) regnes med målestokkens egen
normalisering (``nsb_eval.normalize``, profil «lesbar»), mot manusets
forventede tekst. I tillegg telles hvor mange setninger som ble formatert
helt likt forventet tekst (paragraf, datoer, beløp, saksnummer).

    speech\\.venv\\Scripts\\python.exe -B speech\\eval2b\\measure.py
    speech\\.venv\\Scripts\\python.exe -B speech\\eval2b\\measure.py --wav fil.wav --ref "forventet tekst"

Resultatene skrives til ``speech/recordings/2b/results.json`` (ikke i git).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
import wave
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SPEECH = HERE.parent
sys.path.insert(0, str(SPEECH))

import nsb_bridge  # noqa: E402

nsb_bridge.enable()

import websockets  # noqa: E402
from eval2b.prompts import small_set  # noqa: E402
from nsb_eval.metrics import char_counts, word_counts  # noqa: E402
from nsb_eval.normalize import normalize  # noqa: E402

RATE = 16000
CHUNK = RATE // 10  # 100 ms
PAUSE_SECONDS = 1.5
RECORDINGS = SPEECH / "recordings" / "2b"


def read_wav(path: Path) -> np.ndarray:
    """16-bit WAV til 16 kHz mono (mikses ned og samples om ved behov)."""
    with wave.open(str(path), "rb") as w:
        if w.getsampwidth() != 2:
            raise SystemExit(f"{path}: må være 16-bit PCM")
        rate, channels = w.getframerate(), w.getnchannels()
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32)
    if channels > 1:
        pcm = pcm.reshape(-1, channels).mean(axis=1)
    if rate != RATE:
        n = int(len(pcm) * RATE / rate)
        pcm = np.interp(np.arange(n) * rate / RATE, np.arange(len(pcm)), pcm)
    return np.clip(pcm, -32768, 32767).astype("<i2")


def trim_silence(pcm: np.ndarray, frame: int = 320, below_peak_db: float = 35.0, margin: float = 0.15) -> np.ndarray:
    """Skjærer bort stillhet før og etter talen (20 ms rammer, terskel relativt til sterkeste ramme)."""
    if len(pcm) < frame:
        return pcm
    frames = pcm[: len(pcm) // frame * frame].astype(np.float32).reshape(-1, frame)
    rms = np.sqrt((frames**2).mean(axis=1)) + 1e-9
    voiced = np.where(20 * np.log10(rms / rms.max()) > -below_peak_db)[0]
    if len(voiced) == 0:
        return pcm
    pad = int(margin * RATE)
    return pcm[max(0, voiced[0] * frame - pad): min(len(pcm), (voiced[-1] + 1) * frame + pad)]


@dataclass
class Run:
    final_text: str = ""
    end_to_final_s: float | None = None
    pause_to_endpoint_s: float | None = None
    endpoint_text: str = ""
    uncertain_words: list[str] = field(default_factory=list)


async def stream(url: str, pcm: np.ndarray, *, pause: float, hotwords: str) -> Run:
    run = Run()
    async with websockets.connect(url, max_size=None) as ws:
        await ws.send(json.dumps({"type": "start", "hotwords": hotwords, "format": "legal"}))
        speech_end: float | None = None
        end_sent: float | None = None
        done = asyncio.Event()

        async def receiver():
            async for raw in ws:
                m = json.loads(raw)
                now = time.perf_counter()
                if m["type"] == "update" and m.get("endpoint") and speech_end is not None and run.pause_to_endpoint_s is None:
                    run.pause_to_endpoint_s = now - speech_end
                    run.endpoint_text = m["text"]
                elif m["type"] == "final":
                    run.final_text = m["text"]
                    run.uncertain_words = [w["text"] for w in m["words"] if w.get("uncertain")]
                    if end_sent is not None:
                        run.end_to_final_s = now - end_sent
                    done.set()
                    return
                elif m["type"] == "error":
                    raise RuntimeError(m.get("detail"))

        rx = asyncio.create_task(receiver())
        silence = np.zeros(int(pause * RATE), dtype="<i2")
        audio = np.concatenate([pcm, silence]) if pause else pcm
        t0 = time.perf_counter()
        for i in range(0, len(audio), CHUNK):
            if i >= len(pcm) and speech_end is None:
                speech_end = time.perf_counter()
            await ws.send(audio[i: i + CHUNK].tobytes())
            # Sanntid: vent til denne biten «er tatt opp».
            await asyncio.sleep(max(0.0, t0 + (i + CHUNK) / RATE - time.perf_counter()))
        if speech_end is None:
            speech_end = time.perf_counter()
        end_sent = time.perf_counter()
        await ws.send(json.dumps({"type": "end"}))
        await asyncio.wait_for(done.wait(), timeout=60)
        await rx
    return run


def score(ref: str, hyp: str) -> dict:
    r, h = normalize(ref), normalize(hyp)
    w, c = word_counts(r, h), char_counts(r, h)
    return {"wer_errors": w.errors, "wer_ref_words": w.reference_length, "cer_errors": c.errors, "cer_ref_chars": c.reference_length,
            "exact_format": " ".join(hyp.replace(" ", " ").split()) == " ".join(ref.split())}


def pct(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


async def run_all(args) -> dict:
    token = Path(args.token_file).read_text(encoding="utf-8").strip()
    url = args.url.replace("http://", "ws://").rstrip("/") + f"/v1/stream?token={token}&user=fase2b"

    if args.wav:
        items = [("enkeltfil", "", args.ref or "", Path(args.wav))]
    else:
        items = [(p.id, p.category, p.text, RECORDINGS / f"{p.id}.wav") for p in small_set()]
        missing = [i for i, *_, path in items if not path.exists()]
        if missing:
            print(f"Mangler opptak for {', '.join(missing)}; de hoppes over.")
        items = [it for it in items if it[3].exists()]
    if not items:
        raise SystemExit("Ingen opptak å måle. Spill inn med speech\\eval2b\\record.py først.")

    # Oppvarming: første dekoding på GPU laster kjerner og er tregere enn resten.
    await stream(url, trim_silence(read_wav(items[0][3])), pause=0, hotwords="")

    rows = []
    for pid, category, ref, path in items:
        pcm = trim_silence(read_wav(path))
        ptt = await stream(url, pcm, pause=0, hotwords=args.hotwords)
        paused = await stream(url, pcm, pause=PAUSE_SECONDS, hotwords=args.hotwords)
        row = {"id": pid, "category": category, "audio_s": round(len(pcm) / RATE, 2), "reference": ref,
               "ptt": asdict(ptt), "pause": asdict(paused), **({"score": score(ref, ptt.final_text)} if ref else {})}
        rows.append(row)
        s = row.get("score")
        wer = f"{s['wer_errors']}/{s['wer_ref_words']}" if s else "-"
        print(f"{pid:10} {row['audio_s']:5.1f}s  slipp→final {ptt.end_to_final_s:5.2f}s  "
              f"pause→ferdig {paused.pause_to_endpoint_s if paused.pause_to_endpoint_s is not None else float('nan'):5.2f}s  "
              f"feil {wer:6}  {ptt.final_text}")

    ptt_lat = [r["ptt"]["end_to_final_s"] for r in rows if r["ptt"]["end_to_final_s"] is not None]
    ep_lat = [r["pause"]["pause_to_endpoint_s"] for r in rows if r["pause"]["pause_to_endpoint_s"] is not None]
    scored = [r["score"] for r in rows if "score" in r]
    summary = {
        "items": len(rows),
        "audio_seconds": round(sum(r["audio_s"] for r in rows), 1),
        "release_to_final_s": {"median": statistics.median(ptt_lat), "p90": pct(ptt_lat, 0.9), "max": max(ptt_lat)} if ptt_lat else None,
        "pause_to_endpoint_s": {"median": statistics.median(ep_lat), "p90": pct(ep_lat, 0.9), "max": max(ep_lat),
                                "missing": len(rows) - len(ep_lat)} if ep_lat else {"missing": len(rows)},
    }
    if scored:
        we, wn = sum(s["wer_errors"] for s in scored), sum(s["wer_ref_words"] for s in scored)
        ce, cn = sum(s["cer_errors"] for s in scored), sum(s["cer_ref_chars"] for s in scored)
        summary |= {"wer": we / wn, "cer": ce / cn, "exact_format": sum(s["exact_format"] for s in scored), "scored": len(scored)}
    return {"engine_url": args.url, "hotwords": args.hotwords, "pause_seconds": PAUSE_SECONDS, "summary": summary, "rows": rows}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://127.0.0.1:8766")
    ap.add_argument("--token-file", default=str(SPEECH / ".data" / "engine" / "access_token"))
    ap.add_argument("--hotwords", default="")
    ap.add_argument("--wav", help="mål én fil i stedet for settet")
    ap.add_argument("--ref", help="forventet tekst for --wav")
    ap.add_argument("--out", default=str(RECORDINGS / "results.json"))
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    result = asyncio.run(run_all(args))
    s = result["summary"]
    print("\nSammendrag")
    print(f"  {s['items']} opptak, {s['audio_seconds']} s tale")
    if s.get("release_to_final_s"):
        r = s["release_to_final_s"]
        print(f"  Slipp → ferdig tekst (push-to-talk): median {r['median']:.2f} s, p90 {r['p90']:.2f} s, maks {r['max']:.2f} s")
    e = s["pause_to_endpoint_s"]
    if "median" in e:
        print(f"  Pause → ferdig tekst (uten å slippe): median {e['median']:.2f} s, p90 {e['p90']:.2f} s, maks {e['max']:.2f} s"
              + (f", {e['missing']} uten endepunkt" if e["missing"] else ""))
    if "wer" in s:
        print(f"  WER {s['wer']:.1%}, CER {s['cer']:.1%} (normalisert), formatert helt riktig: {s['exact_format']}/{s['scored']}")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  Detaljer: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

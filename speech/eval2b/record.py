"""Spill inn det lille diktatsettet for fase 2b.

    speech\\.venv\\Scripts\\python.exe -B speech\\eval2b\\record.py
    speech\\.venv\\Scripts\\python.exe -B speech\\eval2b\\record.py --list-devices
    speech\\.venv\\Scripts\\python.exe -B speech\\eval2b\\record.py --device 3 --only jd-006

Opptakene lagres som 16 kHz mono WAV i ``speech/recordings/2b/`` på denne
maskinen. De er ikke i git (``.gitignore``) og sendes ingen steder. Slett dem
med ``--delete-all`` når målingen er vurdert.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from eval2b.prompts import small_set  # noqa: E402

OUT = HERE.parent / "recordings" / "2b"
RATE = 16000


def record_one(device: int | None) -> bytes:
    import numpy as np
    import sounddevice as sd

    chunks: list = []

    def cb(indata, frames, time, status):  # noqa: ARG001
        chunks.append(indata.copy())

    with sd.InputStream(samplerate=RATE, channels=1, dtype="int16", device=device, callback=cb):
        input("   Opptak pågår … trykk Enter når du er ferdig. ")
    if not chunks:
        return b""
    return np.concatenate(chunks)[:, 0].astype("<i2").tobytes()


def save(path: Path, pcm: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--device", type=int, default=None)
    ap.add_argument("--list-devices", action="store_true")
    ap.add_argument("--only", action="append", help="bare disse id-ene (kan gjentas)")
    ap.add_argument("--redo", action="store_true", help="spill inn på nytt selv om filen finnes")
    ap.add_argument("--delete-all", action="store_true", help="slett alle opptak i speech/recordings/2b")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    if args.delete_all:
        if OUT.exists():
            shutil.rmtree(OUT)
        print(f"Slettet {OUT}")
        return 0
    if args.list_devices:
        import sounddevice as sd

        print(sd.query_devices())
        return 0

    prompts = [p for p in small_set() if not args.only or p.id in args.only]
    print(f"{len(prompts)} setninger. Les teksten under «Si:» i vanlig dikteringstempo.")
    print(f"Opptakene lagres bare her: {OUT}\n")
    for i, p in enumerate(prompts, 1):
        path = OUT / f"{p.id}.wav"
        if path.exists() and not args.redo:
            print(f"[{i}/{len(prompts)}] {p.id} finnes, hopper over (--redo for å spille inn på nytt)")
            continue
        print(f"[{i}/{len(prompts)}] {p.id} · {p.category}")
        print(f"   Si: {p.say}")
        while True:
            input("   Trykk Enter og begynn å snakke. ")
            pcm = record_one(args.device)
            seconds = len(pcm) / 2 / RATE
            answer = input(f"   {seconds:.1f} s tatt opp. Behold? [J/n/q] ").strip().lower()
            if answer == "q":
                return 0
            if answer in ("", "j", "ja", "y"):
                save(path, pcm)
                break
        print()
    print("Ferdig. Kjør målingen med speech\\eval2b\\RUN_MEASURE.cmd mens motoren går.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

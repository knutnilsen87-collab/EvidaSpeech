"""Talemotor med skriptet modell, for utvikling og tester uten skjermkort.

Dette er den ekte tjenesten fra NorwegianSpeechBase (``nsb_engine.server.create_app``)
med samme protokoll, tilgangsnøkkel, paring, Origin-kontroll og innsynslogg.
Bare modellen er byttet ut: i stedet for å høre på lyden «hører» den et
manus, ett ord per 0,4 sekunder lyd. Derfor oppfører strømmen seg som den
ekte (foreløpige ord som blir ferdige når to dekodinger er enige, juridisk
formatering), men teksten er alltid manuset.

Manus velges per strøm: neste i køen (``POST /mock/script``), ellers neste
linje i standardlisten, i rekkefølge. Et ord som slutter med ``?`` får lav
sikkerhet og merkes som usikkert av motoren.

Begrensning: modellen har ingen stemmeaktivitetsdeteksjon, så en pause gir
ikke ``endpoint``. Ytringen avsluttes når klienten sender ``{"type": "end"}``
(push-to-talk). Manus over omtrent 45 ord blir kuttet når motoren trimmer
bufferen etter 20 sekunder.

    python speech/mock_engine.py            # http://127.0.0.1:8765
"""

from __future__ import annotations

import argparse
import threading
import time
from collections import deque
from pathlib import Path

import nsb_bridge

nsb_bridge.enable()

from fastapi import Depends, HTTPException, Request  # noqa: E402
from nsb_engine.server import create_app  # noqa: E402
from nsb_engine.streaming import SAMPLE_RATE, Word  # noqa: E402

WORD_SECONDS = 0.4
UNCERTAIN_PROBABILITY = 0.3

DEFAULT_SCRIPTS = (
    "gå til lerretet",
    "Vitnet Holm forklarte at ulykken skjedde klokka sju førtifem punktum",
    "åpne bilag fem side trettien",
    "Etter paragraf to hundre og syttien? har saksøker krav på erstatning punktum",
    "søk etter forsikringsoppgjør",
)

EVIDA_ORIGINS = ["http://127.0.0.1:5174", "http://localhost:5174"]


class ScriptedBackend:
    """Oppfyller ``nsb_engine.streaming.Backend``: gir manusets ord for så mye lyd som er mottatt."""

    def __init__(self, scripts=DEFAULT_SCRIPTS, decode_delay: float = 0.0) -> None:
        self._defaults = list(scripts) or [""]
        self._next_default = 0
        self._queue: deque[str] = deque()
        self._words: list[tuple[str, float]] = []
        self._lock = threading.Lock()
        self.decode_delay = decode_delay
        self.current = ""
        self.hotwords: list[str | None] = []

    def enqueue(self, text: str) -> None:
        with self._lock:
            self._queue.append(text)

    def new_stream(self) -> None:
        with self._lock:
            if self._queue:
                text = self._queue.popleft()
            else:
                text = self._defaults[self._next_default % len(self._defaults)]
                self._next_default += 1
            self.current = text
            self._words = [
                (tok[:-1], UNCERTAIN_PROBABILITY) if tok.endswith("?") and len(tok) > 1 else (tok, 0.95)
                for tok in text.split()
            ]

    def transcribe(self, audio, prompt=None, hotwords=None):
        self.hotwords.append(hotwords)
        if self.decode_delay:
            time.sleep(self.decode_delay)
        with self._lock:
            words = list(self._words)
        n = min(len(words), int(len(audio) / SAMPLE_RATE / WORD_SECONDS))
        return [Word(t, i * WORD_SECONDS, i * WORD_SECONDS + 0.35, p) for i, (t, p) in enumerate(words[:n])]


class NewStreamHook:
    """ASGI-omslag: hver ny WebSocket-forbindelse til /v1/stream får neste manus."""

    def __init__(self, app, backend: ScriptedBackend) -> None:
        self.app = app
        self.backend = backend
        self.state = app.state

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket" and scope.get("path") == "/v1/stream":
            self.backend.new_stream()
        await self.app(scope, receive, send)


def build_app(backend: ScriptedBackend, *, data_root: Path, port: int = 8765, allowed_origins=None, use_dpapi=None):
    app = create_app(
        backend,
        detector_factory=None,
        model_label="mock (skriptet)",
        device="cpu",
        data_root=data_root,
        port=port,
        allowed_origins=EVIDA_ORIGINS if allowed_origins is None else allowed_origins,
        use_dpapi=use_dpapi,
    )
    token = app.state.token

    def require_token(request: Request) -> None:
        auth = request.headers.get("authorization", "")
        if not token.check(auth[7:] if auth.lower().startswith("bearer ") else None):
            raise HTTPException(401, "mangler eller feil tilgangsnøkkel")

    @app.post("/mock/script", dependencies=[Depends(require_token)])
    async def set_script(request: Request):
        body = await request.json()
        texts = body.get("texts") if isinstance(body, dict) else None
        if isinstance(body, dict) and isinstance(body.get("text"), str):
            texts = [body["text"]]
        if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
            raise HTTPException(400, 'forventet {"text": "..."} eller {"texts": ["...", ...]}')
        for t in texts:
            backend.enqueue(t)
        return {"queued": len(texts)}

    return NewStreamHook(app, backend)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="nsb-engine med skriptet modell (mock)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--data-dir", default=str(Path(__file__).resolve().parent / ".data" / "mock"))
    ap.add_argument("--allow-origin", action="append", default=None, help="standard: EvidaSpeech på 5174")
    ap.add_argument("--script-file", help="ett manus per linje, brukes i rekkefølge")
    ap.add_argument("--decode-delay", type=float, default=0.0, help="sekunder per dekoding, for å etterligne GPU-tid")
    ap.add_argument("--pairing-file", help="skriv paringskoden hit (for automatiske kontraktstester)")
    args = ap.parse_args(argv)

    import uvicorn

    scripts = DEFAULT_SCRIPTS
    if args.script_file:
        scripts = [line.strip() for line in Path(args.script_file).read_text(encoding="utf-8").splitlines() if line.strip()]
    backend = ScriptedBackend(scripts, decode_delay=args.decode_delay)
    app = build_app(backend, data_root=Path(args.data_dir), port=args.port, allowed_origins=args.allow_origin)
    print(f"Mock-talemotor på http://127.0.0.1:{args.port}/ (skriptet modell, ingen lyd tolkes)")
    print(f"Paringskode: {app.state.pairing['code']} (gjelder i 15 minutter, én gang)")
    if args.pairing_file:
        Path(args.pairing_file).write_text(app.state.pairing["code"], encoding="utf-8")
    print(f"Tilgangsnøkkel: {app.state.paths.token}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

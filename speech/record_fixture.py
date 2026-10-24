"""Tar opp en ekte meldingssekvens fra motoren (skriptet modell) som kontraktsfasit for frontend.

    speech\\.venv\\Scripts\\python.exe -B speech\\record_fixture.py

Skriver ``frontend/src/speech/__fixtures__/mock-stream.json``. Frontendtestene
leser hver melding med protokolltolkeren, så en endring i motorens protokoll
oppdages når fasiten tas opp på nytt.
"""

import json
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import mock_engine  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from nsb_engine import __version__  # noqa: E402
from nsb_engine.streaming import SAMPLE_RATE  # noqa: E402

OUT = HERE.parent / "frontend" / "src" / "speech" / "__fixtures__" / "mock-stream.json"
SCRIPT = "Etter paragraf to hundre og syttien? har saksøker krav punktum"
START = {"type": "start", "hotwords": "Kirkerud, Ås", "format": "legal"}


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        backend = mock_engine.ScriptedBackend([SCRIPT])
        app = mock_engine.build_app(backend, data_root=Path(tmp), use_dpapi=False)
        token = app.state.token.value
        chunk = (np.zeros(int(0.25 * SAMPLE_RATE)) + 0.01 * 32767).astype("<i2").tobytes()
        received = []
        with TestClient(app, base_url="http://127.0.0.1:8765") as client:
            with client.websocket_connect(f"ws://127.0.0.1:8765/v1/stream?token={token}",
                                          headers={"origin": "http://127.0.0.1:5174"}) as ws:
                ws.send_text(json.dumps(START))
                for _ in range(16):
                    ws.send_bytes(chunk)
                ws.send_text(json.dumps({"type": "end"}))
                while True:
                    m = json.loads(ws.receive_text())
                    received.append(m)
                    if m["type"] == "final":
                        break
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"engine_version": __version__, "script": SCRIPT, "start": START, "messages": received},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(received)} meldinger -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

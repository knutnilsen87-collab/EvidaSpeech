import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mock_engine  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from nsb_engine.streaming import SAMPLE_RATE  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

BASE = "http://127.0.0.1:8765"
WS = "ws://127.0.0.1:8765/v1/stream"
EVIDA = "http://127.0.0.1:5174"


def pcm(seconds: float) -> bytes:
    return (np.zeros(int(seconds * SAMPLE_RATE)) + 0.01 * 32767).astype("<i2").tobytes()


@pytest.fixture
def engine(tmp_path):
    backend = mock_engine.ScriptedBackend(["gå til lerretet", "andre manus"])
    app = mock_engine.build_app(backend, data_root=tmp_path, use_dpapi=False)
    token = app.state.token.value
    with TestClient(app, base_url=BASE, headers={"Authorization": f"Bearer {token}"}) as client:
        client.token = token
        client.backend = backend
        client.app_ = app
        client.data_root = tmp_path
        yield client


def dictate(client, script_seconds: float, start: dict | None = None, origin: str | None = EVIDA):
    headers = {"origin": origin} if origin else {}
    msgs = []
    with client.websocket_connect(f"{WS}?token={client.token}", headers=headers) as ws:
        if start is not None:
            ws.send_text(json.dumps(start))
        for _ in range(int(script_seconds / 0.25)):
            ws.send_bytes(pcm(0.25))
        ws.send_text(json.dumps({"type": "end"}))
        while True:
            m = json.loads(ws.receive_text())
            msgs.append(m)
            if m["type"] in ("final", "error"):
                break
    return msgs


def test_health_is_open_and_names_the_mock(engine):
    r = engine.get("/v1/health", headers={"Authorization": ""})
    assert r.status_code == 200
    assert r.json()["model"] == "mock (skriptet)"


def test_stream_requires_token(engine):
    with pytest.raises(WebSocketDisconnect), engine.websocket_connect(WS, headers={"origin": EVIDA}) as ws:
        ws.receive_text()


def test_stream_refuses_unknown_origin(engine):
    with pytest.raises(WebSocketDisconnect), engine.websocket_connect(
        f"{WS}?token={engine.token}", headers={"origin": "http://127.0.0.1:5173"}
    ) as ws:
        ws.receive_text()


def test_pairing_from_evidaspeech_gives_the_token(engine):
    code = engine.app_.state.pairing["code"]
    r = engine.post("/v1/pair", json={"code": code}, headers={"origin": EVIDA, "Authorization": ""})
    assert r.status_code == 200
    assert r.json()["token"] == engine.token


def test_pairing_from_other_origin_is_refused(engine):
    code = engine.app_.state.pairing["code"]
    r = engine.post("/v1/pair", json={"code": code}, headers={"origin": "http://evil.example", "Authorization": ""})
    assert r.status_code == 403


def test_stream_gives_progressive_updates_and_final_script(engine):
    msgs = dictate(engine, 1.5, {"type": "start", "hotwords": "Kirkerud, Ås", "format": "legal"})
    final = msgs[-1]
    assert final["type"] == "final"
    assert final["text"] == "gå til lerretet"
    assert [m["type"] for m in msgs[:-1]] == ["update"] * (len(msgs) - 1)
    assert any(m["tentative"] for m in msgs[:-1]), "foreløpige ord skal vises før de blir ferdige"
    assert all(h == "Kirkerud, Ås" for h in engine.backend.hotwords)


def test_each_stream_gets_next_script(engine):
    assert dictate(engine, 1.5)[-1]["text"] == "gå til lerretet"
    assert dictate(engine, 1.5)[-1]["text"] == "andre manus"
    assert dictate(engine, 1.5)[-1]["text"] == "gå til lerretet"


def test_queued_script_is_used_first(engine):
    r = engine.post("/mock/script", json={"text": "paragraf to hundre og syttien punktum"})
    assert r.status_code == 200
    # Motoren setter hardt mellomrom (U+00A0) etter §, så «§ 271» aldri brytes over to linjer.
    assert dictate(engine, 3.0)[-1]["text"] == "§ 271."
    assert dictate(engine, 1.5)[-1]["text"] == "gå til lerretet"


def test_queue_requires_token(engine):
    r = engine.post("/mock/script", json={"text": "x"}, headers={"Authorization": ""})
    assert r.status_code == 401


def test_uncertain_word_is_marked(engine):
    engine.post("/mock/script", json={"text": "vitnet Holm? forklarte"})
    words = dictate(engine, 1.5)[-1]["words"]
    assert [(w["text"], w["uncertain"]) for w in words] == [("vitnet", False), ("Holm", True), ("forklarte", False)]


def test_nothing_is_stored_without_explicit_choice(engine):
    dictate(engine, 1.5, {"type": "start", "hotwords": "", "format": "legal"})
    assert engine.get("/v1/sessions").json()["sessions"] == []
    sessions_dir = engine.data_root / "sessions"
    assert not sessions_dir.exists() or not any(sessions_dir.iterdir())


def test_storing_without_consent_is_refused(engine):
    msgs = dictate(engine, 1.5, {"type": "start", "store": True})
    assert any(m["type"] == "error" and "samtykke" in m["detail"] for m in msgs)


def test_audit_log_has_no_text(engine):
    dictate(engine, 1.5)
    log = (engine.data_root / "audit.jsonl").read_text(encoding="utf-8")
    assert "stream.started" in log
    assert "lerretet" not in log

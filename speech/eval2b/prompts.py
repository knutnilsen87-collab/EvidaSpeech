"""Det lille diktatsettet for fase 2b.

Manusene leses fra NorwegianSpeechBase (``eval/recording/legal_dictation_v1/prompts.jsonl``),
bare lesende. Vi tar det første manuset i hver kategori, så settet dekker
lovhenvisninger, saksnummer, datoer og beløp, fagord, navn, nynorsk og
dikteringskommandoer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import nsb_bridge

PROMPTS_FILE = "eval/recording/legal_dictation_v1/prompts.jsonl"


@dataclass(frozen=True)
class Prompt:
    id: str
    category: str
    say: str   # det som leses høyt
    text: str  # forventet tekst etter juridisk formatering


def load_all() -> list[Prompt]:
    path = nsb_bridge.nsb_root() / PROMPTS_FILE
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [Prompt(r["id"], r["category"], r["say"], r["text"]) for r in rows]


def small_set() -> list[Prompt]:
    seen: set[str] = set()
    out = []
    for p in load_all():
        if p.category not in seen:
            seen.add(p.category)
            out.append(p)
    return out

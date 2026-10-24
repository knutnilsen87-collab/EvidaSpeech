"""Gjør NorwegianSpeechBase importerbar uten å installere eller endre noe der.

NorwegianSpeechBase er en avhengighet, ikke kode som kopieres inn. Vi legger
roten til på ``sys.path`` i stedet for ``pip install -e``, fordi en
installasjon skriver egg-info og build-mapper inn i det andre repoet. Av samme
grunn skrives ingen ``__pycache__`` (``sys.dont_write_bytecode``).

Roten kan overstyres med ``NSB_ROOT``.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

DEFAULT_NSB_ROOT = Path(r"F:\prosjekter_MAIN\NorwegianSpeechBase")
SUPPORTED_ENGINE = "0.2."


def nsb_root() -> Path:
    return Path(os.environ.get("NSB_ROOT") or DEFAULT_NSB_ROOT)


def enable() -> Path:
    root = nsb_root()
    if not (root / "nsb_engine" / "server.py").is_file():
        raise SystemExit(f"Fant ikke nsb_engine i {root}. Sett NSB_ROOT til NorwegianSpeechBase-mappen.")
    sys.dont_write_bytecode = True
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    import nsb_engine

    if not nsb_engine.__version__.startswith(SUPPORTED_ENGINE):
        raise SystemExit(f"nsb_engine {nsb_engine.__version__} er ikke testet her (forventet {SUPPORTED_ENGINE}x).")
    return root

# Fase 2 · Talegrensesnitt og mock

Dato: 2026-10-25.

## Levert

**Talemotoren som egen tjeneste** (`speech/`), med NorwegianSpeechBase som avhengighet. Ingenting er kopiert inn.

- `nsb_bridge.py` gjør `nsb_engine` importerbar via `sys.path` i stedet for `pip install -e`, som ville skrevet egg-info inn i NorwegianSpeechBase. Ingen `__pycache__` skrives, og motorversjonen sjekkes (0.2.x).
- `mock_engine.py` er den ekte tjenesten (`nsb_engine.server.create_app`) med samme protokoll, nøkkel, paring, Origin-kontroll og innsynslogg, men med skriptet modell: ett ord per 0,4 s lyd fra et manus. Manus per strøm hentes fra en kø (`POST /mock/script`) eller en standardliste. `ord?` gir et usikkert ord. Start: `speech\RUN_MOCK_ENGINE.cmd`.
- `run_engine.ps1` / `RUN_ENGINE.cmd` starter den ekte motoren. Den kjører med NorwegianSpeechBase sin egen tolk (`.venv-bench`) uten `pip install` og med `-B`. Data (nøkkel, økter, innsynslogg) ligger i `speech\.data\engine`, og motoren godtar bare EvidaSpeech (port 5174). NorwegianSpeechBase sin egen `run_engine.ps1` brukes ikke, fordi den kjører `pip install` i sin venv.
- `speech/.venv` har egne avhengigheter for mock og tester, med samme versjoner som NorwegianSpeechBase.

**Grensesnittet** er beskrevet i [SPEECH_CONTRACT.md](../SPEECH_CONTRACT.md). Det er motorens WebSocket-protokoll v1 med EvidaSpeechs regler på toppen: aldri `store` eller `consent`, hotwords fra åpen sak, bare loopback.

**Frontend** (`frontend/src/speech/`):

- `SpeechTranscriber`: grensesnittet appen ser.
- `NsbTranscriber`: WebSocket-implementasjonen.
- `EngineTransport`: helse, paring, nøkkelsjekk og loopback-kontroll.
- Protokolltolker, transkripsjonsmodell, markering av usikre ord, PCM-konvertering.
- Mikrofonopptak (AudioWorklet).

## Verifisert

- `speech`: `pytest` 13/13 mot mock-motoren. Tester tilgang, Origin, paring, strømming med foreløpige ord, juridisk formatering, at hotwords kommer fram, usikre ord, at ingenting lagres uten valg, at lagring uten samtykke avvises, og at innsynsloggen er uten tekst.
- `frontend`: `npm test` 49/49 (6 kontraktstester hoppes over uten kjørende motor). `npm run build` PASS.
- Kontraktstest mot **kjørende** mock-motor (ekte HTTP og WebSocket): `speech\run_contract_check.ps1`, 6/6.
- Kontraktsfasit tatt opp fra motoren (`frontend/src/speech/__fixtures__/mock-stream.json`). Frontend tolker alle meldingene.
- NorwegianSpeechBase: `git status` uendret, og ingen nye filer i `nsb_engine/` eller `nsb_eval/`.

## Funnet underveis

- **Feil nøkkel gir ikke kode 1008 i klienten.** Motoren avviser før håndtrykket er ferdig, så klienten ser 1006. Den første versjonen av klienten tolket dette som nettverksfeil og ville aldri bedt om ny paring. Kontraktstesten mot kjørende motor fant feilen. Rettet: klienten spør `/v1/whoami`.
- Motorens formatering endrer ferdig tekst underveis («§ 200 og» blir «§ 271»), og den bruker hardt mellomrom etter §. Klienten viser derfor motorens tekst og setter aldri sammen ord selv.
- Usikre ord som formateringen har gjort om, kan ikke pekes ut i teksten. De vises ved siden av i stedet for å forsvinne.

## Ikke gjort / kjent

- Mikrofonopptaket (`capture.ts`) kan ikke testes i jsdom. Det testes i nettleser i fase 3 og med ekte mikrofon i fase 7.
- Den ekte motoren er ikke startet herfra ennå. Det skjer i fase 2b.
- Mocken har ingen stemmeaktivitetsdeteksjon, så pause gir ikke `endpoint`. Det spiller ingen rolle med push-to-talk.
- `starlette.testclient` varsler om at `httpx` er foreldet. Det gjelder bare testverktøyet.

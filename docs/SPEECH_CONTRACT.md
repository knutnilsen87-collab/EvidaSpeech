# Talegrensesnittet

EvidaSpeech snakker med talemotoren `nsb-engine` fra NorwegianSpeechBase, versjon 0.2.x. Protokollen er motorens egen (NorwegianSpeechBase `docs/ENGINE.md`, «API (versjon 1)»). Her står bare det EvidaSpeech bruker, og reglene vi legger på toppen.

```
Mikrofon ─ AudioWorklet (16 kHz mono PCM16) ─WS─▶ nsb-engine på 127.0.0.1:8766
                                                    ├ ekte:  speech\RUN_ENGINE.cmd       (NB-Whisper på GPU)
                                                    └ mock:  speech\RUN_MOCK_ENGINE.cmd  (skriptet modell)
```

Mock og ekte motor er samme tjeneste (`nsb_engine.server.create_app`) med samme protokoll, nøkkel, paring, Origin-kontroll og innsynslogg. Bare modellen er forskjellig. Frontend vet ikke hvilken den snakker med, bortsett fra `model` i `/v1/health`.

## Kall EvidaSpeech bruker

| Kall | Når |
| --- | --- |
| `GET /v1/health` | Kjører motoren? Viser modellnavn. Uten nøkkel |
| `POST /v1/pair` `{"code"}` | Første gang: engangskoden fra motorens vindu gir tilgangsnøkkelen. Bare fra `http://127.0.0.1:5174` / `http://localhost:5174` |
| `GET /v1/whoami` | Gjelder lagret nøkkel fortsatt? |
| `WS /v1/stream?token=…&user=…` | Én forbindelse per ytring (ett trykk på push-to-talk) |

## Strømmen

Klient til motor:

1. Første melding, alltid: `{"type":"start","hotwords":"<partsnavn og dokumenttitler, kommaseparert>","format":"legal"}`.
   - **Aldri `store` eller `consent`.** Lagring krever eksplisitt valg, og det valget finnes ikke i EvidaSpeech ennå. Klienten kan ikke sende feltene, se `buildStartMessage`.
   - `hotwords` er tom når ingen sak er åpen.
2. Binære meldinger: 16 kHz, mono, 16-bit PCM little endian.
3. Når knappen slippes: `{"type":"end"}`.

Motor til klient:

- `{"type":"update","committed":[ord…],"tentative":[ord…],"text","tentative_text","preview","endpoint","audio_end"}`
- til slutt `{"type":"final", …, "words":[ord…]}`
- ved feil `{"type":"error","detail"}`

Et ord er `{"text","start","end","probability","joined","revisions","uncertain"}`.

### Det klienten må vite

- `committed` i en `update` er bare de **nye** ferdige ordene siden forrige melding. `final.words` er alle.
- `text` er hele den ferdige teksten **formatert på nytt** ved hver melding. Formateringen kan endre tekst som allerede er ferdig: «Etter § 200 og» blir «Etter § 271 har» når «syttien» kommer. Vis derfor `text` og `preview` slik de kommer, og sett aldri sammen ord selv.
- `preview` er ferdig og foreløpig tekst formatert sammen: motorens beste gjetning akkurat nå.
- Juridisk formatering bruker hardt mellomrom (U+00A0) etter `§`.
- `uncertain` gjelder råordet, ikke den formaterte teksten. Et usikkert ord som formateringen har gjort om (for eksempel «syttien» i «§ 271»), kan ikke pekes ut i teksten. Det vises da som «usikkert: syttien» ved siden av, ikke stille.
- Ved feil nøkkel eller ukjent Origin lukker motoren *før* håndtrykket er ferdig. Klienten ser da bare at forbindelsen ikke ble åpnet (1006), ikke kode 1008. Klienten spør derfor `/v1/whoami`: 401 betyr avvist nøkkel, og nøkkelen slettes og ny paring kreves. Ellers er det en forbindelsesfeil. Kode 1008 etter åpning behandles også som avvist nøkkel. Dette ble funnet av kontraktstesten mot kjørende motor.
- Uten stemmeaktivitetsdeteksjon (mock) kommer `endpoint` aldri før `end`. Med push-to-talk avsluttes ytringen uansett av `end`.

## Personvern i klienten

- Lyd går bare til 127.0.0.1. Adressen kan ikke settes til noe annet enn loopback (`assertLoopback`).
- Transkripsjoner holdes i minnet til de er satt inn eller forkastet. De logges ikke og legges ikke i `localStorage`.
- Bare motorens tilgangsnøkkel lagres, i `localStorage` (`evidaspeech.nsbEngineToken`). En XSS-feil i EvidaSpeech kan derfor bruke motoren på maskinen. Siden EvidaSpeech aldri ber motoren lagre noe, finnes det ingen lagret lyd å hente.
- Motorens innsynslogg (`speech\.data\…\audit.jsonl`) registrerer hver strøm uten innhold.

## Mock

`speech\mock_engine.py`. Ett ord per 0,4 sekunder lyd fra et manus. Manus per strøm: neste i køen (`POST /mock/script {"text"}` eller `{"texts":[…]}`, krever nøkkel), ellers neste i standardlisten. `ord?` gir et usikkert ord. Kontraktsfasit for frontend: `speech\record_fixture.py` → `frontend/src/speech/__fixtures__/mock-stream.json`.

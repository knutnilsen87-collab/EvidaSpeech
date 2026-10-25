# EvidaSpeech

EVIDA med designet fra Claude Design-prosjektet «Kirkerud mot Ås prototype», styrbart med tale via den lokale talemotoren i NorwegianSpeechBase.

## Oppbygging

| Del | Hvor | Hva |
| --- | --- | --- |
| Frontend | `frontend/` | React 19 + Vite + TypeScript. Komponentbibliotek med design tokens |
| Backend | `F:\prosjekter_MAIN\EvidaNy2.0\backend\saksrom-api` | Gjenbrukes uendret (Spring Boot / Java 21). Ikke kopiert inn hit |
| Talemotor | `F:\prosjekter_MAIN\NorwegianSpeechBase\nsb_engine` | Egen lokal tjeneste på 127.0.0.1. Brukes som avhengighet, ikke kopiert inn |

## Start alt med én fil

Dobbeltklikk `start.cmd`, eller i PowerShell:

```powershell
.\start.ps1              # saksrom-api, ekte talemotor (GPU) og frontend
.\start.ps1 -Mock        # mock-talemotor, ingen GPU
.\start.ps1 -NoSpeech    # uten talemotor
.\start.ps1 -NoBrowser   # ikke åpne nettleseren
.\stop.ps1               # eller stop.cmd: stopper alt start.ps1 startet
```

`start.ps1` sjekker først at alt er på plass, og starter ingenting hvis noe mangler: Java 21, Node, Python-miljøet (`speech\.venv` for mock, NorwegianSpeechBase sin tolk og modellmappe for ekte motor), at PostgreSQL svarer, at EvidaNy2.0 og NorwegianSpeechBase finnes, og at portene er ledige. Hver mangel vises med hvordan den fikses.

Så startes tjenestene i rekkefølge. Hver må svare før neste startes:

1. saksrom-api: `/actuator/health` må gi `UP`
2. talemotoren: `/v1/health`
3. Vite-frontenden

Feiler en tjeneste, stoppes de som allerede kjører, og de siste linjene fra loggen vises. Når alt kjører, åpnes nettleseren og en statuslinje viser tjenestene, modell eller mock, og build-stempelet. Paringskoden til talemotoren vises også; den trengs bare første gang.

| Hva | Hvor |
| --- | --- |
| Lokal konfigurasjon | `evidaspeech.local.json` (gitignored). Kopier `evidaspeech.example.json`. Uten den brukes standardverdiene i eksempelfilen |
| Logger | `logs\<tjeneste>.out.log` / `.err.log`, forrige kjøring som `.prev.log` |
| Hva som kjører | `.data\running.json` (PID og starttid; `stop.ps1` stopper bare disse) |
| saksrom-api sin arbeidsmappe og karantene | `.data\saksrom\` |

Konfigurasjonen inneholder stier, porter, databaseadresse og modell (`engine.model`, eller en egen `engine.modelDir`). Databasepassordet står ikke i skriptene. Det leses fra miljøvariabelen i `database.passwordEnv` (standard `EVIDA_DATABASE_PASSWORD`) eller fra `database.password` i den lokale filen. Er ingen av dem satt, bruker saksrom-api sin egen standard for lokal utvikling.

**Ingenting skrives i EvidaNy2.0 eller NorwegianSpeechBase.** Derfor bygger ikke `start.ps1` saksrom-api, siden Maven ville skrevet `target\` i EvidaNy2.0. Den trenger en ferdig jar (`paths.saksromJar`). `scripts\build-saksrom.ps1` lager den ved å kopiere `pom.xml`, Maven-wrapperen og `src\main` til `.build\saksrom-api\kilde` og bygge der. Hvilken commit jaren er bygd fra, står i `.build\saksrom-api\KILDE.txt`.

**PostgreSQL** installeres ikke av skriptet. saksrom-api trenger PostgreSQL 16 med databasen og brukeren i `database.url` / `database.user`. Den bruker samme database som EvidaNy2.0 hvis adressen er den samme, og Flyway-migreringene fra saksrom-api kjøres på den. EvidaNy2.0 sin utviklingsdatabase i Docker kan startes med `docker compose -f F:\prosjekter_MAIN\EvidaNy2.0\backend\saksrom-api\docker-compose.yml up -d postgres`.

## Kom i gang (hver del for seg)

```powershell
cd frontend
npm install
npm test
npm run dev        # http://127.0.0.1:5174
```

Byggstempelet nederst i appen viser commit og byggetidspunkt.

### Talemotor

```powershell
py -3.11 -m venv speech\.venv
speech\.venv\Scripts\pip install -r speech\requirements.txt
speech\RUN_MOCK_ENGINE.cmd        # skriptet modell, ingen GPU
speech\RUN_ENGINE.cmd             # ekte modell (NB-Whisper) på GPU
```

Tester: `speech\.venv\Scripts\python -B -m pytest` i `speech\`, og kontraktstesten mot kjørende mock: `speech\run_contract_check.ps1`.

## Dokumentasjon

- [Design tokens](docs/DESIGN_TOKENS.md)
- [Talegrensesnittet](docs/SPEECH_CONTRACT.md)
- [Fasestatus](docs/progress/)

# EvidaSpeech

EVIDA med designet fra Claude Design-prosjektet «Kirkerud mot Ås prototype», styrbart med tale via den lokale talemotoren i NorwegianSpeechBase.

## Oppbygging

| Del | Hvor | Hva |
| --- | --- | --- |
| Frontend | `frontend/` | React 19 + Vite + TypeScript. Komponentbibliotek med design tokens |
| Backend | `F:\prosjekter_MAIN\EvidaNy2.0\backend\saksrom-api` | Gjenbrukes uendret (Spring Boot / Java 21). Ikke kopiert inn hit |
| Talemotor | `F:\prosjekter_MAIN\NorwegianSpeechBase\nsb_engine` | Egen lokal tjeneste på 127.0.0.1. Brukes som avhengighet, ikke kopiert inn |

## Kom i gang

```powershell
cd frontend
npm install
npm test
npm run dev        # http://127.0.0.1:5174
```

Byggstempelet nederst i appen viser commit og byggetidspunkt.

## Dokumentasjon

- [Design tokens](docs/DESIGN_TOKENS.md)
- [Fasestatus](docs/progress/)

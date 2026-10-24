# Fase 1 · Fundament

Dato: 2026-10-25.

## Levert

- `frontend/`: React 19.3.0, Vite 5.4.21, TypeScript 5.9.3, vitest 2.1.9. Samme versjoner som EvidaNy2.0. Port 5174 (5173 er EvidaNy2.0), `/api` videresendes til saksrom-api på 8080.
- Design tokens (`src/design/tokens.css`) og koblingen mellom domeneverdier og visning (`src/design/semantics.ts`). Se [DESIGN_TOKENS.md](../DESIGN_TOKENS.md), blant annet for to avvik fra prototypen.
- Komponentbibliotek (`src/ui/`): knapp, sitatpille, merker (stance, eksportklarhet, tillit), maskinforslag, panel, og tilstandene tom, laster (stille under 300 ms, forklaring over 4 s), delvis og feil (med trace_id).
- Byggstempel: commit-hash, om det er lokale endringer, og byggetidspunkt i UTC, synlig nederst i appen. Uten commit står det «ingen commit», aldri en oppdiktet hash.
- Skrift lastes lokalt (`@fontsource`), ingen kall til Google Fonts.
- Appen viser foreløpig bare en komponentoversikt med eksempeltekst. Siden sier selv at den ikke viser saksdata.

## Verifisert

- `npm test`: 18/18 tester i 3 filer, blant annet kontrast på minst 4,5:1 for tekst mot alle flater.
- `npm run build` (tsc + vite build): PASS.
- Ingen `fonts.googleapis` i bygget.

## Ikke gjort / kjent

- Ikke sett på i nettleser av meg. Visuell sjekk mot prototypen gjenstår (`npm run dev`).
- `npm audit`: 0 sårbarheter i produksjonsavhengigheter. 6 i utviklingsverktøy (vite 5, vitest 2, esbuild-utviklingsserveren), de samme som i EvidaNy2.0. Utviklingsserveren lytter bare på 127.0.0.1. Oppgradering til vite 8 / vitest 5 er et eget steg.

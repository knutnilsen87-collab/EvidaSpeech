# Design tokens

Kilder, i prioritet ved uenighet:

1. «UI-UX og backend-integrasjon» (Claude Design-prosjektet), kap. 13 Visuelt språk og kap. 14 Tilgjengelighet.
2. Prototypen «EVIDA Prototype standalone-src.html» — referanse for form, avstand og stemning, ikke kode.

Tokenene ligger i `frontend/src/design/tokens.css`. Koblingen mellom domeneverdier (stance, eksportklarhet, tillit) og visning ligger i `frontend/src/design/semantics.ts`.

## Regler

- Fargene bærer betydning. Grønn betyr *kildebelagt / vi fører*, aldri «vellykket handling». Rød betyr *motstrid / mangler kilde / de fører*, aldri systemfeil.
- Systemfeil vises på nøytral flate med rød ramme (`--ev-system-error-*`).
- Ingen status vises med farge alene: hvert merke har tekst og eget symbol.
- Maskinforslag (EVIDA-forslag og diktert tekst som ikke er bekreftet) har stiplet ramme (`--ev-suggestion-border`).
- Brødtekst og sekundærtekst har minst 4,5:1 kontrast mot alle flater. Dette testes i `tokens.test.ts`.
- Skrift lastes lokalt (`@fontsource`), ikke fra Google Fonts, slik at appen ikke gjør kall ut.

## Avvik mellom prototypen og dokumentet

| Hva | Prototypen | Dokumentet (gjelder) | Valgt |
| --- | --- | --- | --- |
| «Vi fører» | blå `#60A5FA` | grønn `#6EE7C8` («bekreftet, kildebelagt, vi fører») | grønn |
| Gul / usikkert | `#F0B65C` | `#E3B341` | `#E3B341` |
| Brødtekstfont | Geist | Geist | Geist Sans (Fontsource-navnet på samme font) |

Avvikene bør bekreftes av produkt. Hvis prototypens blå «vi fører» er det som er ønsket, endres bare `STANCE.vi_forer.tone` i `semantics.ts`.

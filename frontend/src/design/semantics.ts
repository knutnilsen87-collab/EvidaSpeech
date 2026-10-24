/**
 * Domeneverdier fra CTO-handoffen (vedlegg A) koblet til visning.
 * Hver verdi har tekst og form i tillegg til farge (UI/UX kap. 14: fargeblinde
 * skal se forskjellen).
 */

export type Stance = "vi_forer" | "usikkert" | "de_forer";
export type ExportState = "rettsklar" | "kildeklar" | "mangler_kilde" | "intern";
export type Confidence = "bekreftet" | "delvis" | "usikker";

type Tone = "green" | "yellow" | "red" | "blue" | "muted";

export interface Presentation {
  label: string;
  tone: Tone;
  glyph: string;
}

export const STANCE: Record<Stance, Presentation> = {
  vi_forer: { label: "Vi fører", tone: "green", glyph: "◀" },
  usikkert: { label: "Usikkert", tone: "yellow", glyph: "◆" },
  de_forer: { label: "De fører", tone: "red", glyph: "▶" }
};

export const EXPORT_STATE: Record<ExportState, Presentation> = {
  rettsklar: { label: "Rettsklar", tone: "green", glyph: "●" },
  kildeklar: { label: "Kildeklar", tone: "blue", glyph: "◐" },
  mangler_kilde: { label: "Mangler kilde", tone: "red", glyph: "○" },
  intern: { label: "Intern", tone: "muted", glyph: "◇" }
};

export const CONFIDENCE: Record<Confidence, Presentation> = {
  bekreftet: { label: "Bekreftet", tone: "green", glyph: "●" },
  delvis: { label: "Delvis", tone: "yellow", glyph: "◐" },
  usikker: { label: "Usikker", tone: "red", glyph: "○" }
};

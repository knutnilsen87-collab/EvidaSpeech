import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIDENCE, EXPORT_STATE, STANCE } from "./semantics";

// vitest kjøres fra frontend/; CSS-importer gir tom streng i testmiljøet.
const css = readFileSync(resolve(process.cwd(), "src/design/tokens.css"), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`fant ikke --${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens", () => {
  it("følger fargene i UI/UX-dokumentets kapittel 13", () => {
    expect(token("ev-bg")).toBe("#03080f");
    expect(token("ev-blue")).toBe("#60a5fa");
    expect(token("ev-green")).toBe("#6ee7c8");
    expect(token("ev-yellow")).toBe("#e3b341");
    expect(token("ev-red")).toBe("#f0785c");
    expect(token("ev-text-muted")).toBe("#93a9c4");
  });

  it("brødtekst og sekundærtekst har minst 4,5:1 mot alle flater", () => {
    for (const surface of ["ev-bg", "ev-surface", "ev-surface-raised"]) {
      for (const text of ["ev-text", "ev-text-soft", "ev-text-muted", "ev-text-cite"]) {
        expect(contrast(token(text), token(surface)), `${text} mot ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("betydningsfargene er lesbare som tekst på arbeidsflaten", () => {
    for (const c of ["ev-blue", "ev-green", "ev-yellow", "ev-red"]) {
      expect(contrast(token(c), token("ev-surface-raised")), c).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("hver status har tekst og symbol, og symbolene skiller verdiene", () => {
    for (const table of [STANCE, EXPORT_STATE, CONFIDENCE]) {
      const values = Object.values(table);
      expect(new Set(values.map((v) => v.glyph)).size).toBe(values.length);
      for (const v of values) expect(v.label.length).toBeGreaterThan(0);
    }
  });
});

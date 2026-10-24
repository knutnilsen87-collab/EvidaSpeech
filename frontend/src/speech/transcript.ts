import type { EngineMessage, EngineWord } from "./protocol";

/**
 * Det brukeren ser under diktering. Teksten er alltid motorens egen
 * (formateringen kan endre ferdig tekst), aldri satt sammen av ord i klienten.
 */
export interface Transcript {
  /** Ferdig tekst, formatert. Kan fortsatt endres av formateringen til strømmen er slutt. */
  committedText: string;
  /** Motorens beste gjetning nå: ferdig og foreløpig tekst formatert sammen. */
  preview: string;
  /** Alle ferdige råord, med sikkerhet. */
  committedWords: EngineWord[];
  tentativeWords: EngineWord[];
  final: boolean;
}

export const EMPTY_TRANSCRIPT: Transcript = { committedText: "", preview: "", committedWords: [], tentativeWords: [], final: false };

export function applyMessage(state: Transcript, msg: EngineMessage): Transcript {
  if (msg.type === "error") return state;
  if (msg.type === "final") {
    return { committedText: msg.text, preview: msg.text, committedWords: msg.words, tentativeWords: [], final: true };
  }
  return {
    committedText: msg.text,
    preview: msg.preview,
    committedWords: [...state.committedWords, ...msg.committed],
    tentativeWords: msg.tentative,
    final: false
  };
}

export interface TextSpan {
  text: string;
  uncertain: boolean;
}

/**
 * Markerer usikre ord i den formaterte teksten. Ord som formateringen har gjort
 * om (for eksempel «syttien» i «§ 271»), kan ikke pekes ut og returneres i
 * «unplaced», så de kan vises ved siden av i stedet for å forsvinne stille.
 */
export function markUncertain(text: string, words: readonly EngineWord[]): { spans: TextSpan[]; unplaced: string[] } {
  const spans: TextSpan[] = [];
  const unplaced: string[] = [];
  let searchFrom = 0; // ord letes etter i rekkefølge
  let emitted = 0; // så langt teksten er lagt i spans
  for (const w of words) {
    const token = w.text.trim();
    if (!token) continue;
    const at = findToken(text, token, searchFrom);
    if (at < 0) {
      if (w.uncertain) unplaced.push(token);
      continue;
    }
    searchFrom = at + token.length;
    if (!w.uncertain) continue;
    if (at > emitted) spans.push({ text: text.slice(emitted, at), uncertain: false });
    spans.push({ text: text.slice(at, at + token.length), uncertain: true });
    emitted = at + token.length;
  }
  if (emitted < text.length) spans.push({ text: text.slice(emitted), uncertain: false });
  return { spans: mergePlain(spans), unplaced };
}

/** Finner token som helt ord (ikke inni et annet ord), fra og med «from». */
function findToken(text: string, token: string, from: number): number {
  const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  let at = text.indexOf(token, from);
  while (at >= 0) {
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + token.length])) return at;
    at = text.indexOf(token, at + 1);
  }
  return -1;
}

function mergePlain(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && !last.uncertain && !s.uncertain) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

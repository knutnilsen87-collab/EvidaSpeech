/**
 * Sitatanker slik sitatpillen trenger det (UI/UX kap. 6): alt i én pakke, så
 * pillen aldri gjør et eget kall for å vise hoveren. Bilagsnummer brukes bare
 * i visning; dokument-ID er den interne nøkkelen (CTO-handoff kap. 4).
 */
export interface SourceAnchor {
  documentId: string;
  bilagNo: number | null;
  title: string;
  pageNo: number;
  segmentId: string | null;
  charStart: number | null;
  charEnd: number | null;
  quote: string;
}

export function anchorLabel(a: Pick<SourceAnchor, "bilagNo" | "title" | "pageNo">): string {
  const doc = a.bilagNo === null ? a.title : `Bilag ${a.bilagNo}`;
  return `${doc}, s. ${a.pageNo}`;
}

/** Skjermleser: «kilde: bilag 5, side 31, sitat …», ikke «lenke» (UI/UX kap. 14). */
export function anchorSpokenLabel(a: SourceAnchor): string {
  const doc = a.bilagNo === null ? a.title : `bilag ${a.bilagNo}`;
  return `kilde: ${doc}, side ${a.pageNo}, sitat: ${a.quote}`;
}

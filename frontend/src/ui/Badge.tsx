import { CONFIDENCE, EXPORT_STATE, STANCE, type Confidence, type ExportState, type Presentation, type Stance } from "../design/semantics";

/** Merke med tekst, form og farge — aldri bare farge. */
export function Badge({ presentation, title }: { presentation: Presentation; title?: string }) {
  return (
    <span className={`ev-badge ev-badge--${presentation.tone}`} title={title}>
      <span className="ev-badge__glyph" aria-hidden="true">{presentation.glyph}</span>
      {presentation.label}
    </span>
  );
}

export function StanceBadge({ stance }: { stance: Stance }) {
  return <Badge presentation={STANCE[stance]} />;
}

export function ExportStateBadge({ state }: { state: ExportState }) {
  return <Badge presentation={EXPORT_STATE[state]} />;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <Badge presentation={CONFIDENCE[confidence]} />;
}

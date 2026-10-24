import type { ReactNode } from "react";
import { Button } from "./Button";

export interface MachineSuggestionProps {
  /** Hvem som foreslår: «EVIDA-forslag», «Diktert, ikke bekreftet» … */
  label: string;
  children: ReactNode;
  onConfirm?: () => void;
  onDiscard?: () => void;
  confirmLabel?: string;
  discardLabel?: string;
  /** Bekreftelsen er en skriving mot serveren: knappen er opptatt til den har svart. */
  confirming?: boolean;
}

/**
 * Maskinens forslag er merket til noen bekrefter dem (UI/UX kap. 1): stiplet
 * ramme og egen etikett. Brukes også for diktert tekst før brukeren godtar den.
 */
export function MachineSuggestion({
  label,
  children,
  onConfirm,
  onDiscard,
  confirmLabel = "Bekreft",
  discardLabel = "Forkast",
  confirming = false
}: MachineSuggestionProps) {
  return (
    <div className="ev-suggestion" role="group" aria-label={label}>
      <div className="ev-suggestion__label">{label}</div>
      <div className="ev-suggestion__body">{children}</div>
      {(onConfirm || onDiscard) && (
        <div className="ev-suggestion__actions">
          {onConfirm && (
            <Button variant="primary" onClick={onConfirm} busy={confirming} busyLabel="Lagrer …">
              {confirmLabel}
            </Button>
          )}
          {onDiscard && (
            <Button variant="ghost" onClick={onDiscard} disabled={confirming}>
              {discardLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useId, useState } from "react";
import { anchorLabel, anchorSpokenLabel, type SourceAnchor } from "../domain/anchor";

export interface CitationPillProps {
  anchor: SourceAnchor;
  onOpen: (anchor: SourceAnchor) => void;
}

/**
 * Produktets viktigste komponent (UI/UX kap. 6): viser «Bilag 5, s. 31»,
 * forhåndsviser sitatet ved hover/fokus, og åpner leseren ved klikk.
 */
export function CitationPill({ anchor, onOpen }: CitationPillProps) {
  const [preview, setPreview] = useState(false);
  const tipId = useId();
  return (
    <span className="ev-cite">
      <button
        type="button"
        className="ev-cite__pill"
        aria-label={anchorSpokenLabel(anchor)}
        aria-describedby={preview ? tipId : undefined}
        onClick={() => onOpen(anchor)}
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={() => setPreview(false)}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
      >
        <span className="ev-cite__glyph" aria-hidden="true">▤</span>
        {anchorLabel(anchor)}
      </button>
      {preview && (
        <span id={tipId} role="tooltip" className="ev-cite__preview">
          «{anchor.quote}»
        </span>
      )}
    </span>
  );
}

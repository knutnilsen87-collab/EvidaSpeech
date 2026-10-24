import type { ReactNode } from "react";

export interface PanelProps {
  /** Liten monospace-etikett over innholdet, som i prototypen. */
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  tone?: "default" | "raised";
  className?: string;
}

export function Panel({ eyebrow, title, children, tone = "default", className }: PanelProps) {
  return (
    <section className={["ev-panel", `ev-panel--${tone}`, className ?? ""].filter(Boolean).join(" ")}>
      {eyebrow && <div className="ev-eyebrow">{eyebrow}</div>}
      {title && <h2 className="ev-panel__title">{title}</h2>}
      {children}
    </section>
  );
}

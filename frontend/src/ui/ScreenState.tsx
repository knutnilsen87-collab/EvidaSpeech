import { useEffect, useState, type ReactNode } from "react";

/** Under denne grensen vises ingenting, for å unngå blink (UI/UX kap. 11). */
export const LOADING_QUIET_MS = 300;
/** Over denne grensen forklares det hva som tar tid. */
export const LOADING_SLOW_MS = 4000;

export function Loading({ shape = "list", slowText }: { shape?: "list" | "page" | "canvas"; slowText: string }) {
  const [phase, setPhase] = useState<"quiet" | "skeleton" | "slow">("quiet");
  useEffect(() => {
    const show = setTimeout(() => setPhase("skeleton"), LOADING_QUIET_MS);
    const slow = setTimeout(() => setPhase("slow"), LOADING_SLOW_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, []);
  if (phase === "quiet") return <div aria-busy="true" />;
  return (
    <div className={`ev-skeleton ev-skeleton--${shape}`} aria-busy="true" role="status">
      <span className="ev-visually-hidden">Laster</span>
      <div className="ev-skeleton__bar" />
      <div className="ev-skeleton__bar ev-skeleton__bar--short" />
      <div className="ev-skeleton__bar" />
      {phase === "slow" && <p className="ev-skeleton__slow">{slowText}</p>}
    </div>
  );
}

/** Forklarer hva skjermen blir når den fylles, og har én handling som fyller den. */
export function EmptyState({ title, explanation, action }: { title: string; explanation: string; action?: ReactNode }) {
  return (
    <div className="ev-state ev-state--empty">
      <h2 className="ev-state__title">{title}</h2>
      <p className="ev-state__text">{explanation}</p>
      {action && <div className="ev-state__action">{action}</div>}
    </div>
  );
}

/** Saken er lesbar, men noe mangler. Banner øverst, ikke skjult. */
export function PartialBanner({ children }: { children: ReactNode }) {
  return (
    <div className="ev-partial" role="status">
      <span className="ev-partial__glyph" aria-hidden="true">◐</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Systemfeil: hva som gikk galt, hva brukeren kan gjøre, og trace_id i liten
 * skrift. Nøytral flate med rød ramme — ikke rød flate (UI/UX kap. 13).
 */
export function ErrorState({ message, remedy, traceId, action }: { message: string; remedy: string; traceId?: string | null; action?: ReactNode }) {
  return (
    <div className="ev-state ev-state--error" role="alert">
      <h2 className="ev-state__title">{message}</h2>
      <p className="ev-state__text">{remedy}</p>
      {action && <div className="ev-state__action">{action}</div>}
      {traceId && <div className="ev-state__trace">trace_id {traceId}</div>}
    </div>
  );
}

export interface BuildInfo {
  commit: string;
  dirty: boolean;
  time: string;
  /** Commit saksrom-api-jaren er bygd fra (satt av start.ps1). null: ukjent. Utelatt: vises ikke. */
  backend?: string | null;
}

export const BUILD: BuildInfo = {
  commit: __BUILD_COMMIT__,
  dirty: __BUILD_DIRTY__,
  time: __BUILD_TIME__,
  backend: __SAKSROM_COMMIT__
};

export function formatBuildStamp(info: BuildInfo): string {
  const when = new Date(info.time);
  const stamp = Number.isNaN(when.getTime())
    ? info.time
    : when.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const backend =
    info.backend === undefined ? "" : ` · saksrom-api ${info.backend === null ? "ukjent bygg" : info.backend.slice(0, 10)}`;
  return `${info.commit}${info.dirty ? " + lokale endringer" : ""} · ${stamp}${backend}`;
}

/** Commit-hash og byggetidspunkt, alltid synlig. */
export function BuildStamp({ info = BUILD }: { info?: BuildInfo }) {
  return (
    <div className="ev-buildstamp" title={`Bygg: commit og tidspunkt${info.backend ? `. saksrom-api: ${info.backend}` : ""}`}>
      bygg {formatBuildStamp(info)}
    </div>
  );
}

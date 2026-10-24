export interface BuildInfo {
  commit: string;
  dirty: boolean;
  time: string;
}

export const BUILD: BuildInfo = { commit: __BUILD_COMMIT__, dirty: __BUILD_DIRTY__, time: __BUILD_TIME__ };

export function formatBuildStamp(info: BuildInfo): string {
  const when = new Date(info.time);
  const stamp = Number.isNaN(when.getTime())
    ? info.time
    : when.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `${info.commit}${info.dirty ? " + lokale endringer" : ""} · ${stamp}`;
}

/** Commit-hash og byggetidspunkt, alltid synlig. */
export function BuildStamp({ info = BUILD }: { info?: BuildInfo }) {
  return (
    <div className="ev-buildstamp" title="Bygg: commit og tidspunkt">
      bygg {formatBuildStamp(info)}
    </div>
  );
}

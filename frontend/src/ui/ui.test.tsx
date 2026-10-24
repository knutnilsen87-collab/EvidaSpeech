import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceAnchor } from "../domain/anchor";
import {
  Button,
  CitationPill,
  EmptyState,
  ErrorState,
  ExportStateBadge,
  formatBuildStamp,
  Loading,
  LOADING_QUIET_MS,
  LOADING_SLOW_MS,
  MachineSuggestion,
  StanceBadge
} from ".";

afterEach(cleanup);

const anchor: SourceAnchor = {
  documentId: "d1",
  bilagNo: 2,
  title: "Vitneforklaring",
  pageNo: 4,
  segmentId: "s1",
  charStart: 10,
  charEnd: 40,
  quote: "Klokka var 07:45"
};

describe("CitationPill", () => {
  it("viser bilag og side, og leses opp som kilde for skjermleser", () => {
    render(<CitationPill anchor={anchor} onOpen={() => undefined} />);
    const pill = screen.getByRole("button", { name: "kilde: bilag 2, side 4, sitat: Klokka var 07:45" });
    expect(pill.textContent).toContain("Bilag 2, s. 4");
  });

  it("forhåndsviser sitatet ved hover og fokus uten eget kall", () => {
    render(<CitationPill anchor={anchor} onOpen={() => undefined} />);
    const pill = screen.getByRole("button");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(pill);
    expect(screen.getByRole("tooltip").textContent).toBe("«Klokka var 07:45»");
    fireEvent.mouseLeave(pill);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(pill);
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("åpner leseren med hele ankeret ved klikk", () => {
    const onOpen = vi.fn();
    render(<CitationPill anchor={anchor} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(anchor);
  });

  it("bruker dokumenttittel når bilagsnummer ikke er satt", () => {
    render(<CitationPill anchor={{ ...anchor, bilagNo: null }} onOpen={() => undefined} />);
    expect(screen.getByRole("button").textContent).toContain("Vitneforklaring, s. 4");
  });
});

describe("merker", () => {
  it("har tekst og form, ikke bare farge", () => {
    render(
      <>
        <StanceBadge stance="de_forer" />
        <ExportStateBadge state="mangler_kilde" />
      </>
    );
    expect(screen.getByText("De fører")).toBeTruthy();
    expect(screen.getByText("Mangler kilde")).toBeTruthy();
    expect(screen.getByText("▶")).toBeTruthy();
  });
});

describe("Button", () => {
  it("er deaktivert og bytter tekst mens arbeid pågår", () => {
    const onClick = vi.fn();
    render(<Button busy busyLabel="Autentiserer …" onClick={onClick}>Logg inn</Button>);
    const button = screen.getByRole("button", { name: "Autentiserer …" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("er type=button som standard, så den ikke sender skjemaer ved et uhell", () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });
});

describe("MachineSuggestion", () => {
  it("merker forslaget og lar brukeren bekrefte eller forkaste", () => {
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();
    render(
      <MachineSuggestion label="Diktert, ikke bekreftet" onConfirm={onConfirm} onDiscard={onDiscard}>
        tekst
      </MachineSuggestion>
    );
    expect(screen.getByRole("group", { name: "Diktert, ikke bekreftet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bekreft" }));
    fireEvent.click(screen.getByRole("button", { name: "Forkast" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("holder bekreftelsen opptatt til serveren har svart", () => {
    render(
      <MachineSuggestion label="EVIDA-forslag" onConfirm={() => undefined} onDiscard={() => undefined} confirming>
        tekst
      </MachineSuggestion>
    );
    expect((screen.getByRole("button", { name: "Lagrer …" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Forkast" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("tilstander", () => {
  it("lasting: ingenting under 300 ms, skjelett etterpå, forklaring etter 4 s", () => {
    vi.useFakeTimers();
    try {
      render(<Loading slowText="Henter sidene." />);
      expect(screen.queryByRole("status")).toBeNull();
      act(() => vi.advanceTimersByTime(LOADING_QUIET_MS));
      expect(screen.getByRole("status")).toBeTruthy();
      expect(screen.queryByText("Henter sidene.")).toBeNull();
      act(() => vi.advanceTimersByTime(LOADING_SLOW_MS - LOADING_QUIET_MS));
      expect(screen.getByText("Henter sidene.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tom tilstand forklarer og har én handling", () => {
    render(<EmptyState title="Ingen bilag" explanation="Last opp for å starte." action={<Button>Last opp</Button>} />);
    expect(screen.getByRole("heading", { name: "Ingen bilag" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("feil viser hva som skjedde, hva brukeren kan gjøre og trace_id", () => {
    render(<ErrorState message="Noe feilet." remedy="Prøv igjen." traceId="abc123" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Noe feilet.");
    expect(alert.textContent).toContain("Prøv igjen.");
    expect(alert.textContent).toContain("trace_id abc123");
  });
});

describe("byggstempel", () => {
  it("viser commit, lokale endringer og tidspunkt i UTC", () => {
    expect(formatBuildStamp({ commit: "abc1234567", dirty: true, time: "2026-10-24T09:05:00.000Z" })).toBe(
      "abc1234567 + lokale endringer · 2026-10-24 09:05 UTC"
    );
    expect(formatBuildStamp({ commit: "abc1234567", dirty: false, time: "2026-10-24T09:05:00.000Z" })).toBe(
      "abc1234567 · 2026-10-24 09:05 UTC"
    );
  });
});

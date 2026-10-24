import { useState } from "react";
import type { SourceAnchor } from "./domain/anchor";
import {
  Button,
  CitationPill,
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  ExportStateBadge,
  Loading,
  MachineSuggestion,
  Panel,
  PartialBanner,
  StanceBadge
} from "./ui";

/**
 * Komponentoversikt for utvikling. Innholdet her er eksempeltekst for å vise
 * komponentene, ikke saksdata, og siden sier det selv.
 */
const EXAMPLE_ANCHOR: SourceAnchor = {
  documentId: "eksempel",
  bilagNo: 5,
  title: "Eksempeldokument",
  pageNo: 31,
  segmentId: null,
  charStart: null,
  charEnd: null,
  quote: "Eksempelsitat som vises ved hover."
};

export function ComponentGallery() {
  const [opened, setOpened] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(0);
  return (
    <main className="ev-gallery">
      <header>
        <div className="ev-eyebrow">Komponentoversikt</div>
        <h1 className="ev-gallery__title">EVIDA designsystem</h1>
        <p className="ev-gallery__note">Eksempelinnhold for å vise komponentene. Ingen saksdata vises her.</p>
      </header>

      <Panel eyebrow="Handlinger" title="Knapper">
        <div className="ev-gallery__row">
          <Button variant="primary">Last opp bilag</Button>
          <Button>Sekundær</Button>
          <Button variant="ghost">Avbryt</Button>
          <Button variant="danger">Slett sak</Button>
          <Button variant="primary" busy busyLabel="Autentiserer …">Logg inn</Button>
          <Button disabled>Deaktivert</Button>
        </div>
      </Panel>

      <Panel eyebrow="Kilder" title="Sitatpille">
        <CitationPill anchor={EXAMPLE_ANCHOR} onOpen={(a) => setOpened(`${a.documentId} s. ${a.pageNo}`)} />
        {opened && <p className="ev-gallery__note">Ville åpnet leseren: {opened}</p>}
      </Panel>

      <Panel eyebrow="Betydning" title="Merker">
        <div className="ev-gallery__row">
          <StanceBadge stance="vi_forer" />
          <StanceBadge stance="usikkert" />
          <StanceBadge stance="de_forer" />
        </div>
        <div className="ev-gallery__row">
          <ExportStateBadge state="rettsklar" />
          <ExportStateBadge state="kildeklar" />
          <ExportStateBadge state="mangler_kilde" />
          <ExportStateBadge state="intern" />
        </div>
        <div className="ev-gallery__row">
          <ConfidenceBadge confidence="bekreftet" />
          <ConfidenceBadge confidence="delvis" />
          <ConfidenceBadge confidence="usikker" />
        </div>
      </Panel>

      <Panel eyebrow="Tillit" title="Maskinforslag">
        <MachineSuggestion label="EVIDA-forslag" onConfirm={() => undefined} onDiscard={() => undefined}>
          Eksempeltekst for et forslag som ikke er bekreftet.
        </MachineSuggestion>
      </Panel>

      <Panel eyebrow="Tilstander" title="Tom, laster, delvis, feil">
        <div className="ev-gallery__stack">
          <EmptyState
            title="Ingen bilag ennå"
            explanation="Når bilagene er lastet opp, vises de her med status for lesing og indeksering."
            action={<Button variant="primary">Last opp bilag</Button>}
          />
          <div>
            <Loading key={loadingKey} slowText="Henter sidene. Store bilag tar litt lenger tid." />
            <Button variant="ghost" onClick={() => setLoadingKey((k) => k + 1)}>Vis lasting på nytt</Button>
          </div>
          <PartialBanner>Ett bilag er ikke lest. Svar kan være ufullstendige.</PartialBanner>
          <ErrorState
            message="EVIDA er midlertidig utilgjengelig."
            remedy="Arbeidet ditt er lagret. Prøv igjen om et par minutter."
            traceId="eksempel-trace"
            action={<Button>Prøv igjen</Button>}
          />
        </div>
      </Panel>
    </main>
  );
}

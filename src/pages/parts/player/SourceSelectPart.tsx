import { ScrapeMedia } from "@nexus/providers";
import React, { ReactNode, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { Loading } from "@/components/layout/Loading";
import {
  useEmbedScraping,
  useSourceScraping,
} from "@/components/player/hooks/useSourceSelection";
import { Menu } from "@/components/player/internals/ContextMenu";
import { SelectableLink } from "@/components/player/internals/ContextMenu/Links";
import { getLiveNexusProviders } from "@/providers/nexus-providers-index";
import { getPackedEmbedLabel } from "@/providers/embeds/shared";
import { usePreferencesStore } from "@/stores/preferences";
import { usePlayerStore } from "@/stores/player/store";
import { isAnimeByTitle, getAllowedSourceIds } from "@/providers/allowed-providers";

// Embed option component
function EmbedOption(props: {
  embedId: string;
  url: string;
  sourceId: string;
  routerId: string;
}) {
  const { t } = useTranslation();
  const unknownEmbedName = t("player.menus.sources.unknownOption");

  // Track currently active embed for checkmark
  const activeEmbedId = usePlayerStore((s) => s.embedId);
  const isActive = props.embedId === activeEmbedId;

  const embedName = useMemo(() => {
    if (!props.embedId) return unknownEmbedName;
    // Prefer the real server name packed by the source (Prime / Orbit / Euro).
    const packedLabel = getPackedEmbedLabel(props.url);
    if (packedLabel) return packedLabel;
    const meta = getCachedMetadata().find((s) => s.id === props.embedId);
    return meta?.name ?? unknownEmbedName;
  }, [props.embedId, props.url, unknownEmbedName]);

  const { run, errored, loading, notFound } = useEmbedScraping(
    props.routerId,
    props.sourceId,
    props.url,
    props.embedId,
  );

  let rightSide: React.ReactNode;
  if (loading) {
    rightSide = undefined;
  } else if (notFound) {
    rightSide = (
      <div className="flex items-center text-video-scraping-noresult">
        <div className="w-4 h-4 rounded-full border-2 border-current bg-current flex items-center justify-center">
          <div className="w-2 h-0.5 bg-background-main rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <SelectableLink
      loading={loading}
      error={errored && !notFound}
      onClick={run}
      selected={isActive}
      rightSide={isActive ? undefined : rightSide}
    >
      <span>{embedName}</span>
    </SelectableLink>
  );

}

// Embed selection view (when a source is selected)
function EmbedSelectionView(props: {
  sourceId: string;
  routerId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { run, notfound, loading, items, errored } = useSourceScraping(
    props.sourceId,
    props.routerId,
  );

  const sourceName = useMemo(() => {
    if (!props.sourceId) return "...";
    const sourceMeta = getCachedMetadata().find((s) => s.id === props.sourceId);
    return sourceMeta?.name ?? "...";
  }, [props.sourceId]);

  const lastSourceId = useRef<string | null>(null);
  useEffect(() => {
    if (lastSourceId.current === props.sourceId) return;
    lastSourceId.current = props.sourceId;
    if (!props.sourceId) return;
    run();
  }, [run, props.sourceId]);

  let content: ReactNode = null;
  if (loading)
    content = (
      <Menu.TextDisplay noIcon>
        <Loading />
      </Menu.TextDisplay>
    );
  else if (notfound)
    content = (
      <Menu.TextDisplay
        title={t("player.menus.sources.noStream.title") ?? undefined}
      >
        {t("player.menus.sources.noStream.text")}
      </Menu.TextDisplay>
    );
  else if (items?.length === 0)
    content = (
      <Menu.TextDisplay
        title={t("player.menus.sources.noEmbeds.title") ?? undefined}
      >
        {t("player.menus.sources.noEmbeds.text")}
      </Menu.TextDisplay>
    );
  else if (errored)
    content = (
      <Menu.TextDisplay
        title={t("player.menus.sources.failed.title") ?? undefined}
      >
        {t("player.menus.sources.failed.text")}
      </Menu.TextDisplay>
    );
  else if (items && props.sourceId)
    content = items.map((v) => (
      <EmbedOption
        key={`${v.embedId}-${v.url}`}
        embedId={v.embedId}
        url={v.url}
        routerId={props.routerId}
        sourceId={props.sourceId}
      />
    ));

  return (
    <>
      <Menu.BackLink onClick={props.onBack}>{sourceName}</Menu.BackLink>
      <Menu.Section>{content}</Menu.Section>
    </>
  );
}

// Main source selection view
export function SourceSelectPart(props: { media: ScrapeMedia }) {
  const { t } = useTranslation();
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | null>(
    null,
  );
  const routerId = "manualSourceSelect";
  const preferredSourceOrder = usePreferencesStore((s) => s.sourceOrder);
  const enableSourceOrder = usePreferencesStore((s) => s.enableSourceOrder);
  const lastSuccessfulSource = usePreferencesStore(
    (s) => s.lastSuccessfulSource,
  );
  const enableLastSuccessfulSource = usePreferencesStore(
    (s) => s.enableLastSuccessfulSource,
  );
  // Track currently active source for checkmark display
  const activeSourceId = usePlayerStore((s) => s.sourceId);

  const [live, setLive] = React.useState<{ id: string; name: string }[]>([]);
  const [liveLoaded, setLiveLoaded] = React.useState(false);

  useEffect(() => {
    let active = true;
    getLiveNexusProviders()
      .then((p) => {
        if (!active) return;
        setLive(p);
        setLiveLoaded(true);
      })
      .catch(() => {
        if (active) setLiveLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const sources = useMemo(() => {
    const metaType = props.media.type;
    if (!metaType) return [];

    const isAnime = isAnimeByTitle(props.media.title, props.media.tmdbId);
    const allowedIds = getAllowedSourceIds(metaType, isAnime);
    const liveIds = new Set(live.map((provider) => provider.id));
    const allSources = getCachedMetadata()
      .filter(
        (v) =>
          v.type === "source" &&
          allowedIds.includes(v.id) &&
          (!liveLoaded || liveIds.has(v.id)),
      )
      .sort((a, b) => allowedIds.indexOf(a.id) - allowedIds.indexOf(b.id));



    if (!enableSourceOrder || preferredSourceOrder.length === 0) {
      // Even without custom source order, prioritize last successful source if enabled
      if (enableLastSuccessfulSource && lastSuccessfulSource) {
        const lastSourceIndex = allSources.findIndex(
          (s) => s.id === lastSuccessfulSource,
        );
        if (lastSourceIndex !== -1) {
          const lastSource = allSources.splice(lastSourceIndex, 1)[0];
          return [lastSource, ...allSources];
        }
      }
      return allSources;
    }

    // Sort sources according to preferred order, but prioritize last successful source
    const orderedSources = [];
    const remainingSources = [...allSources];

    // First, add the last successful source if it exists, is available, and the feature is enabled
    if (enableLastSuccessfulSource && lastSuccessfulSource) {
      const lastSourceIndex = remainingSources.findIndex(
        (s) => s.id === lastSuccessfulSource,
      );
      if (lastSourceIndex !== -1) {
        orderedSources.push(remainingSources[lastSourceIndex]);
        remainingSources.splice(lastSourceIndex, 1);
      }
    }

    // Add sources in preferred order
    for (const sourceId of preferredSourceOrder) {
      const sourceIndex = remainingSources.findIndex((s) => s.id === sourceId);
      if (sourceIndex !== -1) {
        orderedSources.push(remainingSources[sourceIndex]);
        remainingSources.splice(sourceIndex, 1);
      }
    }

    // Add remaining sources that weren't in the preferred order
    orderedSources.push(...remainingSources);

    return orderedSources;
  }, [
    props.media.type,
    preferredSourceOrder,
    enableSourceOrder,
    lastSuccessfulSource,
    enableLastSuccessfulSource,
    live,
    liveLoaded,
  ]);

  if (selectedSourceId) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-full max-w-md h-[50vh] flex flex-col">
          <Menu.CardWithScrollable>
            <EmbedSelectionView
              sourceId={selectedSourceId}
              routerId={routerId}
              onBack={() => setSelectedSourceId(null)}
            />
          </Menu.CardWithScrollable>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="w-full max-w-md h-[50vh] flex flex-col">
        <Menu.CardWithScrollable>
          <Menu.Title>{t("player.menus.sources.title")}</Menu.Title>
          <Menu.Section className="pb-4">
            {sources.map((v) => (
              <SelectableLink
                key={v.id}
                onClick={() => setSelectedSourceId(v.id)}
                selected={v.id === activeSourceId}
              >
                {v.name}
              </SelectableLink>
            ))}
          </Menu.Section>
        </Menu.CardWithScrollable>
      </div>
    </div>
  );
}

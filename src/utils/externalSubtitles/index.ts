/* eslint-disable no-console */
import { PlayerMeta } from "@/stores/player/slices/source";

import { scrapeFebboxCaptions as _scrapeFebboxCaptions } from "./febbox";
import { scrapeNatsukiCaptions } from "./natsuki";
import { scrapeOpenSubtitlesCaptions } from "./opensubtitles";
import { scrapeVdrkCaptions } from "./vdrk";
import { scrapeWyzieCaptions } from "./wyzie";

export async function scrapeExternalSubtitles(
  meta: PlayerMeta,
): Promise<import("@/stores/player/slices/source").CaptionListItem[]> {
  try {
    const imdbId = meta.imdbId;
    const tmdbId = meta.tmdbId;

    if (!imdbId && !tmdbId) {
      console.log(
        "No IMDb or TMDB ID available for external subtitle scraping",
      );
      return [];
    }

    const season = meta.season?.number;
    const episode = meta.episode?.number;

    // Wyzie aggregates multiple unexus sources so needs a longer timeout
    const wyzieTimeout = 30000;
    const natsukiTimeout = 30000;
    const timeout = 10000;

    // Create promises for each source with individual timeouts
    const wyziePromise = scrapeWyzieCaptions(
      tmdbId,
      imdbId ?? "",
      season,
      episode,
    );
    const natsukiPromise = scrapeNatsukiCaptions(
      tmdbId,
      imdbId ?? "",
      season,
      episode,
    );
    const openSubsPromise = imdbId
      ? scrapeOpenSubtitlesCaptions(imdbId, season, episode)
      : Promise.resolve([]);
    // const febboxPromise = scrapeFebboxCaptions(imdbId, season, episode);
    const vdrkPromise = scrapeVdrkCaptions(tmdbId, season, episode);

    // Create timeout promises
    const wyzieTimeoutPromise = new Promise<
      import("@/stores/player/slices/source").CaptionListItem[]
    >((resolve) => {
      setTimeout(() => resolve([]), wyzieTimeout);
    });
    const natsukiTimeoutPromise = new Promise<
      import("@/stores/player/slices/source").CaptionListItem[]
    >((resolve) => {
      setTimeout(() => resolve([]), natsukiTimeout);
    });
    const timeoutPromise = new Promise<
      import("@/stores/player/slices/source").CaptionListItem[]
    >((resolve) => {
      setTimeout(() => resolve([]), timeout);
    });

    // Start all promises and collect results as they complete
    const allCaptions: import("@/stores/player/slices/source").CaptionListItem[] =
      [];
    let completedSources = 0;
    const totalSources = 4;

    // Helper function to handle individual source completion
    const _handleSourceCompletion = (
      sourceName: string,
      captions: import("@/stores/player/slices/source").CaptionListItem[],
    ) => {
      allCaptions.push(...captions);
      completedSources += 1;
      console.log(
        `${sourceName} completed with ${captions.length} captions (${completedSources}/${totalSources} sources done)`,
      );
    };

    // Wait for all sources to complete (with timeouts)
    const results = await Promise.allSettled([
      Promise.race([natsukiPromise, natsukiTimeoutPromise]),
      Promise.race([wyziePromise, wyzieTimeoutPromise]),
      Promise.race([openSubsPromise, timeoutPromise]),
      Promise.race([vdrkPromise, timeoutPromise]),
    ]);

    // Order: Natsuki first, then others
    const natsukiSubs = results[0].status === "fulfilled" ? results[0].value : [];
    const wyzieSubs = results[1].status === "fulfilled" ? results[1].value : [];
    const openSubSubs = results[2].status === "fulfilled" ? results[2].value : [];
    const vdrkSubs = results[3].status === "fulfilled" ? results[3].value : [];

    const orderedCaptions = [...natsukiSubs, ...wyzieSubs, ...openSubSubs, ...vdrkSubs];

    console.log(
      `Found ${orderedCaptions.length} total external captions (${natsukiSubs.length} Natsuki priority)`,
    );

    return orderedCaptions;
  } catch (error) {
    console.error("Error in scrapeExternalSubtitles:", error);
    return [];
  }
}

// Re-export individual functions for direct access if needed
export { scrapeWyzieCaptions } from "./wyzie";
export { scrapeNatsukiCaptions } from "./natsuki";
export { scrapeOpenSubtitlesCaptions } from "./opensubtitles";
export { scrapeFebboxCaptions } from "./febbox";
export { scrapeVdrkCaptions } from "./vdrk";

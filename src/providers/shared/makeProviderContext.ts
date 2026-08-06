import { MovieScrapeContext, ShowScrapeContext, SourcererOutput, Flags, flags } from "@nexus/providers";

export interface ProviderContextOptions {
  id: string;
  name: string;
  rank: number;
  disabled?: boolean;
  scrape: (ctx: any) => Promise<any>;
}

export function makeProviderContext(options: ProviderContextOptions) {
  const scrapeWrapper = async (ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> => {
    const result = await options.scrape(ctx);
    if (!result) return { embeds: [] };

    let streams = result.stream;
    if (streams && !Array.isArray(streams)) {
      streams = [streams];
    }

    // Empty [] is truthy in JS — would crash player on result.stream[0].captions
    return {
      embeds: result.embeds || [],
      stream: streams?.length ? streams : undefined,
    };
  };

  return {
    id: options.id,
    name: options.name,
    rank: options.rank,
    disabled: options.disabled ?? false,
    type: "source" as const,
    externalSource: false,
    mediaTypes: ["movie", "show"] as const,
    flags: [flags.CORS_ALLOWED] as Flags[],
    scrapeMovie: scrapeWrapper,
    scrapeShow: scrapeWrapper,
  };
}

export interface EmbedContextOptions {
  id: string;
  name: string;
  rank: number;
  disabled?: boolean;
  scrape: (ctx: any) => Promise<any>;
  /** Optional metadata attached to the returned embed (used by the app). */
  backend?: string;
  anime?: boolean;
}

export function makeEmbedContext(options: EmbedContextOptions) {
  const scrapeWrapper = async (ctx: { url: string }): Promise<SourcererOutput> => {
    const result = await options.scrape(ctx);
    if (!result) return { embeds: [] };

    let streams = result.stream;
    if (streams && !Array.isArray(streams)) {
      streams = [streams];
    }

    // Empty [] is truthy in JS — would crash player on result.stream[0].captions
    return {
      embeds: result.embeds || [],
      stream: streams?.length ? streams : undefined,
    };
  };

  return {
    id: options.id,
    name: options.name,
    rank: options.rank,
    disabled: options.disabled ?? false,
    type: "embed" as const,
    mediaTypes: ["movie", "show"] as const,
    flags: [flags.CORS_ALLOWED] as Flags[],
    scrape: scrapeWrapper,
    ...(options.backend ? { backend: options.backend } : {}),
    ...(options.anime ? { anime: options.anime } : {}),
  };
}

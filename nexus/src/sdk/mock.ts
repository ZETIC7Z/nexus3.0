// Local mock of @nexus/providers exports not yet in the installed
// package. Swap index.ts's export line to point here when you don't have
// access to the private repo. Keep signatures in sync with unexus.

export type FileVariant = {
  fid: string;
  name: string;
  size: string;
  quality?: string;
  codec?: string;
  tag?: string;
};

export type VariantMeta = {
  variants: FileVariant[];
  shareKey: string;
};

export type VariantStream = {
  url: string;
  type: "hls" | "mp4";
};

export type VariantSubtitle = {
  subtitle_link: string;
};

export type ResolveVariantResult = {
  streams: Record<string, VariantStream>;
  subtitles?: Record<string, VariantSubtitle>;
};

export function getVariantMeta(): VariantMeta | null {
  return null;
}

export async function resolveVariant(
  _fid: string,
  _shareKey: string,
  _token: string,
): Promise<ResolveVariantResult | null> {
  return null;
}

export type ArtemisFileVariant = FileVariant;

export type ArtemisVariantMeta = {
  variants: ArtemisFileVariant[];
};

export function getArtemisVariantMeta(): ArtemisVariantMeta | null {
  return null;
}

export function resolveArtemisVariant(_fid: string): { url: string } | null {
  return null;
}

export type GridDownloadSource = {
  url: string;
  name: string;
};

export type GridDownload = {
  title: string;
  format?: string;
  resolution?: string;
  size?: string;
  sources: GridDownloadSource[];
};

export type GridData = {
  downloads: GridDownload[];
};

export async function fetchGridData(_tmdbId: string): Promise<GridData> {
  return { downloads: [] };
}

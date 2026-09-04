import Hls from "hls.js";

const DefaultLoader: any = (Hls as any).DefaultConfig.loader;

/**
 * Compatibility export for older imports. The TMDB-Embed backend returns
 * browser-ready URLs, so hls.js must receive every URL unchanged.
 */
export class ArtemisRetryLoader extends DefaultLoader {
  load(context: any, config: any, callbacks: any): void {
    super.load(context, config, callbacks);
  }
}

import { ofetch } from "ofetch";

import { conf } from "@/setup/config";
import { useSimklAuthStore } from "@/stores/simkl/store";
import {
  SimklActivities,
  SimklAddToListBody,
  SimklContentData,
  SimklListType,
  SimklSyncBody,
  SimklSyncItem,
  SimklUser,
} from "@/utils/services/simklTypes";

export const SIMKL_OAUTH_URL = "https://simkl.com/oauth/authorize";
export const SIMKL_API_URL = "https://api.simkl.com";
const APP_NAME = "nexus";
const APP_VERSION = "1.0";


export const SIMKL_OAUTH_STATE = "simkl";

class SimklService {
  // eslint-disable-next-line no-use-before-define
  private static instance: SimklService;

  private readonly MIN_API_INTERVAL = 500;

  private lastApiCall: number = 0;

  public static getInstance(): SimklService {
    if (!SimklService.instance) {
      SimklService.instance = new SimklService();
    }
    return SimklService.instance;
  }

  // eslint-disable-next-line class-methods-use-this
  public getAuthUrl(): string {
    const config = conf();
    if (!config.SIMKL_CLIENT_ID || !config.SIMKL_REDIRECT_URI) return "";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.SIMKL_CLIENT_ID,
      redirect_uri: config.SIMKL_REDIRECT_URI,
      state: SIMKL_OAUTH_STATE,
    });
    return `${SIMKL_OAUTH_URL}?${params.toString()}`;
  }

  public async exchangeCodeForToken(code: string): Promise<boolean> {
    const config = conf();
    if (
      !config.SIMKL_CLIENT_ID ||
      !config.SIMKL_CLIENT_SECRET ||
      !config.SIMKL_REDIRECT_URI
    )
      throw new Error("Missing Simkl config");

    try {
      const data = await ofetch<{ access_token: string }>(
        `${SIMKL_API_URL}/oauth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            code,
            client_id: config.SIMKL_CLIENT_ID,
            client_secret: config.SIMKL_CLIENT_SECRET,
            redirect_uri: config.SIMKL_REDIRECT_URI,
            grant_type: "authorization_code",
          },
        },
      );

      useSimklAuthStore.getState().setAccessToken(data.access_token);
 
      await this.getUserSettings();
      return true;
    } catch (error: any) {
      const msg =
        error?.data?.message ??
        error?.data?.error_description ??
        error?.message ??
        "Failed to exchange code";
      console.error("[SimklService] Failed to exchange code:", msg);
      throw new Error(msg);
    }
  }

  private async apiRequest<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body: any = undefined,
    retryCount = 0,
  ): Promise<T> {
    const config = conf();
    if (!config.SIMKL_CLIENT_ID) throw new Error("Missing Simkl Client ID");

   
    const now = Date.now();
    const since = now - this.lastApiCall;
    if (since < this.MIN_API_INTERVAL) {
      await new Promise((resolve) => {
        setTimeout(resolve, this.MIN_API_INTERVAL - since);
      });
    }
    this.lastApiCall = Date.now();

    const accessToken = useSimklAuthStore.getState().accessToken;
    if (!accessToken) throw new Error("Not authenticated");

    const url = endpoint.includes("?")
      ? `${SIMKL_API_URL}${endpoint}&client_id=${config.SIMKL_CLIENT_ID}`
      : `${SIMKL_API_URL}${endpoint}?client_id=${config.SIMKL_CLIENT_ID}`;

    try {
      return (await ofetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${APP_NAME}/${APP_VERSION}`,
          Authorization: `Bearer ${accessToken}`,
          "simkl-api-key": config.SIMKL_CLIENT_ID,
        },
        body,
        retry: 0,
        query: { "app-name": APP_NAME, "app-version": APP_VERSION },
      })) as T;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429 && retryCount < 3) {
        const retryAfter = error.response.headers?.get?.("Retry-After");
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 1000 * 2 ** retryCount;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
        return this.apiRequest<T>(endpoint, method, body, retryCount + 1);
      }
      if (status === 401) {
  
        useSimklAuthStore.getState().clear();
      }
      throw error;
    }
  }

  public async getUserSettings(): Promise<SimklUser> {

    const profile = await this.apiRequest<SimklUser>("/users/settings", "POST");
    useSimklAuthStore.getState().setUser(profile);
    return profile;
  }

  public async getActivities(): Promise<SimklActivities> {
    return this.apiRequest<SimklActivities>("/sync/activities");
  }

  
  public async getAllItems(opts?: {
    type?: SimklListType;
    dateFrom?: string;
    extended?: string;
  }): Promise<Partial<Record<SimklListType | "tv_shows", SimklSyncItem[]>>> {
    const segments = ["/sync/all-items"];
    if (opts?.type) segments.push(`/${opts.type}`);
    const params = new URLSearchParams();
    if (opts?.dateFrom) params.set("date_from", opts.dateFrom);
    if (opts?.extended) params.set("extended", opts.extended);
    const qs = params.toString();
    const endpoint = `${segments.join("")}${qs ? `?${qs}` : ""}`;
    return this.apiRequest(endpoint);
  }

  public async addToHistory(
    item: SimklContentData,
    watchedAt?: string,
  ): Promise<void> {
    const payload = this.buildSyncPayload(item, watchedAt);
    await this.apiRequest("/sync/history", "POST", payload);
  }


  public async removeFromHistory(item: SimklContentData): Promise<void> {
    const payload = this.buildSyncPayload(item);
    await this.apiRequest("/sync/history/remove", "POST", payload);
  }


  public async addToList(
    to: SimklAddToListBody["to"],
    item: SimklContentData,
  ): Promise<void> {
    const base = this.buildSyncPayload(item);
    const payload: SimklAddToListBody = { to, ...base };
    await this.apiRequest("/sync/add-to-list", "POST", payload);
  }


  public async removeFromList(item: SimklContentData): Promise<void> {
    const payload = this.buildSyncPayload(item);
    
    await this.apiRequest("/sync/history/remove", "POST", payload);
  }

  // eslint-disable-next-line class-methods-use-this
  private buildSyncPayload(
    item: SimklContentData,
    watchedAt?: string,
  ): SimklSyncBody {
     const ids: Record<string, any> = {};
    if (item.simklId) ids.simkl = item.simklId;
    if (item.imdbId) ids.imdb = item.imdbId;
    if (item.tmdbId) ids.tmdb = item.tmdbId;

    if (item.type === "movie") {
      const entry: any = { ids, title: item.title, year: item.year };
      if (watchedAt) entry.watched_at = watchedAt;
      return { movies: [entry] };
    }
    if (item.type === "show") {
      const entry: any = { ids, title: item.title, year: item.year };
      if (watchedAt) entry.watched_at = watchedAt;
      return { shows: [entry] };
    }
    if (item.type === "episode") {

      const showIds: Record<string, any> = {};
      if (item.showTmdbId) showIds.tmdb = item.showTmdbId;
      const entry: any = {
        ids: showIds,
        title: item.showTitle ?? item.title,
        year: item.showYear ?? item.year,
        seasons: [
          {
            number: item.season,
            episodes: [
              {
                number: item.episode,
                watched_at: watchedAt,
              },
            ],
          },
        ],
      };
      return { shows: [entry] };
    }
    return {};
  }
}

export const simklService = SimklService.getInstance();

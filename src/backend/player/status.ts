import { AccountWithToken } from "@/stores/auth";

export interface PlayerStatusContent {
  title: string;
  type: "movie" | "show" | string;
  tmdbId?: string | number;
  seasonId?: string | number;
  episodeId?: string | number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface PlayerStatusPlayer {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  hasPlayedOnce: boolean;
  time: number;
  duration: number;
  volume?: number;
  playbackRate: number;
  buffered: number;
}

export interface PlayerStatusRequest {
  userId: string;
  roomCode: string;
  isHost: boolean;
  content: PlayerStatusContent;
  player: PlayerStatusPlayer;
}

export interface PlayerStatusEntry {
  userId: string;
  roomCode: string;
  isHost: boolean;
  content: PlayerStatusContent;
  player: PlayerStatusPlayer;
  timestamp: number;
}

export interface PlayerStatusResponse {
  success: boolean;
  timestamp: number;
}

export interface UserStatusResponse {
  userId: string;
  roomCode: string;
  statuses: PlayerStatusEntry[];
}

export interface RoomStatusesResponse {
  roomCode: string;
  users: Record<string, PlayerStatusEntry[]>;
}

function buildHeaders(
  account: AccountWithToken | null,
): Record<string, string> {
  if (!account) return {};
  return { Authorization: `Bearer ${account.token}` };
}

export async function sendPlayerStatus(
  backendUrl: string | null,
  account: AccountWithToken | null,
  data: PlayerStatusRequest,
): Promise<PlayerStatusResponse> {
  if (!backendUrl) throw new Error("Backend URL not set");

  const response = await fetch(`${backendUrl}/api/player/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildHeaders(account),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`sendPlayerStatus ${response.status}`);
  }
  return response.json();
}

export async function getUserPlayerStatus(
  backendUrl: string | null,
  account: AccountWithToken | null,
  userId: string,
  roomCode: string,
): Promise<UserStatusResponse> {
  if (!backendUrl) throw new Error("Backend URL not set");

  const response = await fetch(
    `${backendUrl}/api/player/status?userId=${encodeURIComponent(userId)}&roomCode=${encodeURIComponent(roomCode)}`,
    { headers: buildHeaders(account) },
  );
  if (!response.ok) throw new Error(`getUserPlayerStatus ${response.status}`);
  return response.json();
}

export async function getRoomStatuses(
  backendUrl: string | null,
  account: AccountWithToken | null,
  roomCode: string,
): Promise<RoomStatusesResponse> {
  if (!backendUrl) throw new Error("Backend URL not set");

  const response = await fetch(
    `${backendUrl}/api/player/status?roomCode=${encodeURIComponent(roomCode)}`,
    { headers: buildHeaders(account) },
  );
  if (!response.ok) throw new Error(`getRoomStatuses ${response.status}`);
  return response.json();
}

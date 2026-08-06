import { ofetch } from "ofetch";

import { getAuthHeaders, SessionResponse } from "@/backend/accounts/auth";
import { UserResponse } from "@/backend/accounts/user";
import { AccountWithToken } from "@/stores/auth";

export interface PasswordAuthResponse {
  user: UserResponse;
  session: SessionResponse;
  token: string;
}

export interface PasswordRegisterInput {
  username: string;
  password: string;
  device: string;
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
  };
}

export async function registerWithPassword(
  url: string,
  data: PasswordRegisterInput,
): Promise<PasswordAuthResponse> {
  return ofetch<PasswordAuthResponse>("/auth/password/register", {
    method: "POST",
    body: {
      namespace: "movie-web",
      ...data,
    },
    baseURL: url,
  });
}

export interface PasswordLoginInput {
  username: string;
  password: string;
  device: string;
}

export async function loginWithPassword(
  url: string,
  data: PasswordLoginInput,
): Promise<PasswordAuthResponse> {
  return ofetch<PasswordAuthResponse>("/auth/password/login", {
    method: "POST",
    body: data,
    baseURL: url,
  });
}

export async function migrateToPassword(
  url: string,
  account: AccountWithToken,
  username: string,
  password: string,
): Promise<void> {
  await ofetch("/auth/password/migrate", {
    method: "POST",
    body: { username, password },
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export async function addPassword(
  url: string,
  account: AccountWithToken,
  username: string,
  password: string,
): Promise<void> {
  await ofetch("/auth/password/add", {
    method: "POST",
    body: { username, password },
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

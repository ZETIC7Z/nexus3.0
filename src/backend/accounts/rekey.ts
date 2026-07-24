import { ofetch } from "ofetch";

import { SessionResponse } from "@/backend/accounts/auth";
import { UserResponse } from "@/backend/accounts/user";

export interface ChallengeTokenResponse {
  challenge: string;
}

export async function getRekeyChallengeToken(
  url: string,
  oldPublicKey: string,
): Promise<ChallengeTokenResponse> {
  return ofetch<ChallengeTokenResponse>("/auth/rekey/start", {
    method: "POST",
    body: {
      publicKey: oldPublicKey,
    },
    baseURL: url,
  });
}

export interface RekeyResponse {
  user: UserResponse;
  session: SessionResponse;
  token: string;
}

export interface RekeyInput {
  oldPublicKey: string;
  newPublicKey: string;
  challenge: {
    code: string;
    oldSignature: string;
    newSignature: string;
  };
  device: string;
}

export async function rekeyAccount(
  url: string,
  data: RekeyInput,
): Promise<RekeyResponse> {
  return ofetch<RekeyResponse>("/auth/rekey/complete", {
    method: "POST",
    body: data,
    baseURL: url,
  });
}

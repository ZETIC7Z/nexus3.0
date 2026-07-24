import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useTraktAuthStore } from "@/stores/trakt/store";
import { SIMKL_OAUTH_STATE } from "@/utils/services/simkl";
import { traktService } from "@/utils/services/trakt";

export function TraktAuthHandler() {
  const [searchParams, setSearchParams] = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const processedRef = useRef(false);
  const setStatus = useTraktAuthStore((s) => s.setStatus);
  const setError = useTraktAuthStore((s) => s.setError);

  useEffect(() => {
   
    if (!code || state === SIMKL_OAUTH_STATE || processedRef.current) return;
    processedRef.current = true;

    const exchange = async () => {
      setStatus("syncing");
      setError(null);
      try {
        const success = await traktService.exchangeCodeForToken(code);
        if (success) {
          const newParams = new URLSearchParams(searchParams);
          newParams.delete("code");
          setSearchParams(newParams, { replace: true });
        } else {
          setError("Failed to connect to Trakt");
        }
      } catch (err: any) {
        console.error("Trakt auth failed", err);
        setError(err?.message ?? "Failed to connect to Trakt");
      } finally {
        setStatus("idle");
      }
    };

    exchange();
  }, [code, state, searchParams, setSearchParams, setStatus, setError]);

  return null;
}

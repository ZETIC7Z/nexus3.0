import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useSimklAuthStore } from "@/stores/simkl/store";
import { SIMKL_OAUTH_STATE, simklService } from "@/utils/services/simkl";

export function SimklAuthHandler() {
  const [searchParams, setSearchParams] = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const processedRef = useRef(false);
  const setStatus = useSimklAuthStore((s) => s.setStatus);
  const setError = useSimklAuthStore((s) => s.setError);

  useEffect(() => {
    if (!code || state !== SIMKL_OAUTH_STATE || processedRef.current) return;
    processedRef.current = true;

    const exchange = async () => {
      setStatus("syncing");
      setError(null);
      try {
        const success = await simklService.exchangeCodeForToken(code);
        if (success) {
          const next = new URLSearchParams(searchParams);
          next.delete("code");
          next.delete("state");
          setSearchParams(next, { replace: true });
        } else {
          setError("Failed to connect to Simkl");
        }
      } catch (err: any) {
        console.error("Simkl auth failed", err);
        setError(err?.message ?? "Failed to connect to Simkl");
      } finally {
        setStatus("idle");
      }
    };

    exchange();
  }, [code, state, searchParams, setSearchParams, setStatus, setError]);

  return null;
}

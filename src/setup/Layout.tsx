import { ReactNode, useEffect } from "react";

import { useBannerSize, useBannerStore } from "@/stores/banner";
import { useAuthStore } from "@/stores/auth";
import { useProfileStore } from "@/stores/profiles";
import { BannerLocation } from "@/stores/banner/BannerLocation";

export function Layout(props: { children: ReactNode }) {
  const bannerSize = useBannerSize();
  const location = useBannerStore((s) => s.location);
  const account = useAuthStore((s) => s.account);
  const ensureAccountProfile = useProfileStore((s) => s.ensureAccountProfile);
  const restoreActiveProfile = useProfileStore(
    (s) => s.restoreActiveProfile,
  );

  useEffect(() => {
    ensureAccountProfile(account);
    restoreActiveProfile(account);
  }, [account, ensureAccountProfile, restoreActiveProfile]);

  return (
    <div>
      <div className="fixed inset-x-0 z-[1000]">
        <BannerLocation />
      </div>
      <div
        style={{
          paddingTop: location === null ? `${bannerSize}px` : "0px",
        }}
        className="flex min-h-screen flex-col"
      >
        {props.children}
      </div>
    </div>
  );
}

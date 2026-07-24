import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Toggle } from "@/components/buttons/Toggle";
import { BackendSelector } from "@/components/form/BackendSelector";
import { Dropdown } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { Modal, ModalCard, useModal } from "@/components/overlays/Modal";
import {
  StatusCircle,
  StatusCircleProps,
} from "@/components/player/internals/StatusCircle";
import { MwLink } from "@/components/text/Link";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { Divider } from "@/components/utils/Divider";
import { Heading1, Heading2, Paragraph } from "@/components/utils/Text";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";
import {
  SetupPart,
  Status,
  fetchFebboxQuota,
  testFebboxKey,
  testTorboxToken,
  testdebridToken,
} from "@/pages/parts/settings/SetupPart";
import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";
import { useSimklStore } from "@/stores/simkl/store";
import { useTraktStore } from "@/stores/trakt/store";
import { simklService } from "@/utils/services/simkl";

interface ProxyEditProps {
  proxyUrls: string[] | null;
  setProxyUrls: Dispatch<SetStateAction<string[] | null>>;
  proxyTmdb: boolean;
  setProxyTmdb: Dispatch<SetStateAction<boolean>>;
}

interface BackendEditProps {
  backendUrl: string | null;
  setBackendUrl: Dispatch<SetStateAction<string | null>>;
}

interface FebboxKeyProps {
  febboxKey: string | null;
  setFebboxKey: (value: string | null) => void;
}

interface DebridProps {
  debridToken: string | null;
  setdebridToken: (value: string | null) => void;
  debridService: string;
  setdebridService: (value: string) => void;
  // eslint-disable-next-line react/no-unused-prop-types
  mode?: "onboarding" | "settings";
}

interface TIDBKeyProps {
  tidbKey: string | null;
  setTIDBKey: (value: string | null) => void;
}

function ProxyEdit({
  proxyUrls,
  setProxyUrls,
  proxyTmdb,
  setProxyTmdb,
}: ProxyEditProps) {
  const { t } = useTranslation();
  const add = useCallback(() => {
    setProxyUrls((s) => [...(s ?? []), ""]);
  }, [setProxyUrls]);

  const changeItem = useCallback(
    (index: number, val: string) => {
      setProxyUrls((s) => [
        ...(s ?? []).map((v, i) => {
          if (i !== index) return v;
          return val;
        }),
      ]);
    },
    [setProxyUrls],
  );

  const removeItem = useCallback(
    (index: number) => {
      setProxyUrls((s) => [...(s ?? []).filter((v, i) => i !== index)]);
    },
    [setProxyUrls],
  );

  const toggleProxyUrls = useCallback(() => {
    const newValue = proxyUrls === null ? [] : null;
    setProxyUrls(newValue);
    // Disable TMDB proxying when proxy workers are disabled
    if (newValue === null) setProxyTmdb(false);
  }, [proxyUrls, setProxyUrls, setProxyTmdb]);

  return (
    <SettingsCard>
      <div className="flex justify-between items-center gap-4">
        <div className="my-3">
          <p className="text-white font-bold mb-3">
            {t("settings.connections.workers.label")}
          </p>
          <p className="max-w-[30rem] font-medium">
            <Trans i18nKey="settings.connections.workers.description">
              <MwLink to="https://nexus.github.io/docs/proxy/deploy">
                {t("settings.connections.workers.documentation")}
              </MwLink>
            </Trans>
          </p>
        </div>
        <div>
          <Toggle onClick={toggleProxyUrls} enabled={proxyUrls !== null} />
        </div>
      </div>
      {proxyUrls !== null ? (
        <>
          <Divider marginClass="my-6 px-8 box-content -mx-8" />
          <p className="text-white font-bold mb-3">
            {t("settings.connections.workers.urlLabel")}
          </p>

          <div className="my-6 space-y-2 max-w-md">
            {(proxyUrls?.length ?? 0) === 0 ? (
              <p>{t("settings.connections.workers.emptyState")}</p>
            ) : null}
            {(proxyUrls ?? []).map((v, i) => (
              <div
                // not the best but we can live with it
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="grid grid-cols-[1fr,auto] items-center gap-2"
              >
                <AuthInputBox
                  value={v}
                  onChange={(val) => changeItem(i, val)}
                  placeholder={
                    t("settings.connections.workers.urlPlaceholder") ??
                    undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="h-full scale-90 hover:scale-100 rounded-full aspect-square bg-authentication-inputBg hover:bg-authentication-inputBgHover flex justify-center items-center transition-transform duration-200 hover:text-white cursor-pointer"
                >
                  <Icon className="text-xl" icon={Icons.X} />
                </button>
              </div>
            ))}
          </div>

          <Button theme="purple" onClick={add}>
            {t("settings.connections.workers.addButton")}
          </Button>
          <Divider marginClass="my-6 px-8 box-content -mx-8" />

          <div className="flex justify-between items-center gap-4">
            <div className="my-3">
              <p className="text-white font-bold mb-3">
                {t("settings.connections.workers.proxyTMDB.title")}
              </p>
              <p className="max-w-[30rem] font-medium">
                {t("settings.connections.workers.proxyTMDB.description")}
              </p>
            </div>
            <div>
              <Toggle
                enabled={proxyTmdb}
                onClick={() => setProxyTmdb(!proxyTmdb)}
              />
            </div>
          </div>
        </>
      ) : null}
    </SettingsCard>
  );
}

function BackendEdit({ backendUrl, setBackendUrl }: BackendEditProps) {
  const { t } = useTranslation();
  const user = useAuthStore();
  const config = conf();
  const availableBackends =
    config.BACKEND_URLS.length > 0
      ? config.BACKEND_URLS
      : config.BACKEND_URL
        ? [config.BACKEND_URL]
        : [];
  const currentBackendUrl =
    backendUrl ?? (availableBackends.length > 0 ? availableBackends[0] : null);
  const [pendingBackendUrl, setPendingBackendUrl] = useState<string | null>(
    currentBackendUrl,
  );
  const confirmationModal = useModal("backend-change-confirmation");

  const handleBackendSelect = (url: string | null) => {
    if (!user.account) {
      // No account - just update without confirmation
      setBackendUrl(url);
      setPendingBackendUrl(url);
    } else if (url !== currentBackendUrl) {
      // User is logged in and changing backend - show confirmation
      setPendingBackendUrl(url);
      confirmationModal.show();
    } else {
      // Same backend - just update
      setBackendUrl(url);
      setPendingBackendUrl(url);
    }
  };

  const handleConfirmChange = () => {
    setBackendUrl(pendingBackendUrl);
    confirmationModal.hide();
  };

  return (
    <>
      <SettingsCard>
        <div className="my-3">
          <p className="text-white font-bold mb-3">
            {t("settings.connections.server.label")}
          </p>
          <p className="max-w-[30rem] font-medium">
            <Trans i18nKey="settings.connections.server.description">
              <MwLink to="https://nexus.github.io/docs/backend/deploy">
                {t("settings.connections.server.documentation")}
              </MwLink>
            </Trans>
          </p>
          {user.account && (
            <div>
              <br />
              <p className="max-w-[30rem] font-medium">
                <Trans i18nKey="settings.connections.server.migration.description">
                  <MwLink to="/migration">
                    {t("settings.connections.server.migration.link")}
                  </MwLink>
                </Trans>
              </p>
            </div>
          )}
        </div>
        {(availableBackends.length > 0 || currentBackendUrl) && (
          <>
            <Divider marginClass="my-6 px-8 box-content -mx-8" />
            <p className="text-white font-bold mb-3">
              {t("settings.connections.server.selectBackend")}
            </p>
            {availableBackends.length > 0 || currentBackendUrl ? (
              <BackendSelector
                selectedUrl={currentBackendUrl}
                onSelect={handleBackendSelect}
                availableUrls={
                  availableBackends.length > 0
                    ? availableBackends
                    : currentBackendUrl
                      ? [currentBackendUrl]
                      : []
                }
                showCustom={false}
              />
            ) : null}
          </>
        )}
      </SettingsCard>
      {user.account && (
        <Modal id={confirmationModal.id}>
          <ModalCard>
            <Heading2 className="!mt-0 !mb-4">
              {t("settings.connections.server.changeWarningTitle")}
            </Heading2>
            <Paragraph className="!mt-1 !mb-6">
              {t("settings.connections.server.changeWarning")}
            </Paragraph>
            <div className="flex justify-end gap-3">
              <Button theme="secondary" onClick={confirmationModal.hide}>
                {t("settings.connections.server.cancel")}
              </Button>
              <Button theme="purple" onClick={handleConfirmChange}>
                {t("settings.connections.server.confirm")}
              </Button>
            </div>
          </ModalCard>
        </Modal>
      )}
    </>
  );
}

async function getFebboxKeyStatus(febboxKey: string | null) {
  if (febboxKey) {
    const status: Status = await testFebboxKey(febboxKey);
    const quota = await fetchFebboxQuota(febboxKey);
    return { status, quota };
  }
  return { status: "unset" as Status, quota: null };
}

interface FebboxSetupProps extends FebboxKeyProps {
  mode: "onboarding" | "settings";
}

export function FebboxSetup({
  febboxKey,
  setFebboxKey,
  mode,
}: FebboxSetupProps) {
  const [showVideo, setShowVideo] = useState(false);
  const user = useAuthStore();
  const preferences = usePreferencesStore();
  const exampleModal = useModal("febbox-example");

  // Initialize expansion state for onboarding mode
  const [isFebboxExpanded, setIsFebboxExpanded] = useState(
    mode === "onboarding" && febboxKey !== null && febboxKey !== "",
  );

  // Expand when key is set in onboarding mode
  useEffect(() => {
    if (mode === "onboarding" && febboxKey && febboxKey.length > 0) {
      setIsFebboxExpanded(true);
    }
  }, [febboxKey, mode]);

  // Enable febbox token when account is loaded in settings mode
  useEffect(() => {
    if (
      mode === "settings" &&
      user.account &&
      febboxKey === null &&
      preferences.febboxKey
    ) {
      setFebboxKey(preferences.febboxKey);
    }
  }, [user.account, febboxKey, preferences.febboxKey, setFebboxKey, mode]);

  const [status, setStatus] = useState<Status>("unset");
  const [quota, setQuota] = useState<any>(null);
  const statusMap: Record<Status, StatusCircleProps["type"]> = {
    error: "error",
    success: "success",
    unset: "noresult",
    api_down: "error",
    invalid_token: "error",
  };

  useEffect(() => {
    const checkTokenStatus = async () => {
      const result = await getFebboxKeyStatus(febboxKey);
      setStatus(result.status);
      setQuota(result.quota);
    };
    checkTokenStatus();
  }, [febboxKey]);

  // Toggle handler based on mode
  const toggleFebboxExpanded = () => {
    if (mode === "onboarding") {
      // Onboarding mode: expand/collapse, preserve key
      if (isFebboxExpanded) {
        setFebboxKey("");
        setIsFebboxExpanded(false);
      } else {
        setIsFebboxExpanded(true);
      }
    } else {
      // Settings mode: enable/disable
      setFebboxKey(febboxKey === null ? "" : null);
    }
  };

  // Determine if content is visible
  const isFebboxVisible =
    mode === "onboarding" ? isFebboxExpanded : febboxKey !== null;

  if (conf().ALLOW_FEBBOX_KEY) {
    return (
      <>
        <SettingsCard>
          <div className="flex justify-between items-center gap-4">
            <div className="my-3">
              <p className="text-white font-bold mb-3">
                Aurora API (4K)
              </p>
              <p className="max-w-[30rem] font-medium">
                Bring your own FREE Febbox account to unlock Aurora API — the best sources with 4K quality, Dolby Atmos, and the fastest load times.
              </p>
              <p className="max-w-[30rem] mt-2 text-sm text-type-secondary italic">
                Aurora requires a Febbox token. Your token is never stored on our servers — it is sent directly from your browser to Febbox.
              </p>
            </div>
            <div>
              <Toggle
                onClick={toggleFebboxExpanded}
                enabled={
                  mode === "onboarding" ? isFebboxExpanded : febboxKey !== null
                }
              />
            </div>
          </div>
          {isFebboxVisible ? (
            <>
              <Divider marginClass="my-6 px-8 box-content -mx-8" />

              <div className="my-3">
                <p className="max-w-[30rem] font-medium">
                  To get your Febbox token:
                  <br />
                  <div
                    onClick={() => setShowVideo(!showVideo)}
                    className="flex items-center justify-between p-1 px-2 my-2 w-fit border border-type-secondary rounded-lg cursor-pointer text-type-secondary hover:text-white transition-colors duration-200"
                  >
                    <span className="text-sm">
                      {showVideo ? "Hide Video Tutorial" : "Show Video Tutorial"}
                    </span>
                    {showVideo ? (
                      <Icon icon={Icons.CHEVRON_UP} className="pl-1" />
                    ) : (
                      <Icon icon={Icons.CHEVRON_DOWN} className="pl-1" />
                    )}
                  </div>
                  {showVideo && (
                    <>
                      <div className="relative pt-[56.25%] mt-2">
                        <iframe
                          src="https://player.vimeo.com/video/1059834885?h=c3ab398d42&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                          className="absolute top-0 left-0 w-full h-full border border-type-secondary rounded-lg bg-black"
                          title="Aurora API Setup Tutorial"
                        />
                      </div>
                      <br />
                    </>
                  )}
                  1. Go to <MwLink url="https://febbox.com">febbox.com</MwLink> and log in with Google (use a fresh account!)
                  <br />
                  2. Open DevTools or inspect the page
                  <br />
                  3. Go to Application tab &rarr; Cookies
                  <br />
                  4. Copy the &apos;ui&apos; cookie&apos;s value.{" "}
                  <button
                    type="button"
                    onClick={exampleModal.show}
                    className="text-type-link hover:text-type-linkHover"
                  >
                    (Example)
                  </button>
                  <br />
                  5. Close the tab, but do NOT logout!
                </p>
              </div>

              <Divider marginClass="my-6 px-8 box-content -mx-8" />
              <p className="text-white font-bold mb-3">
                Token
              </p>
              <div className="flex md:flex-row flex-col items-center w-full gap-4">
                <div className="flex items-center w-full">
                  <StatusCircle type={statusMap[status]} className="mx-2" />
                  <AuthInputBox
                    onChange={(newToken) => {
                      setFebboxKey(newToken);
                    }}
                    value={febboxKey ?? ""}
                    placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOi..."
                    passwordToggleable
                    className="flex-grow"
                  />
                </div>
              </div>
              {status === "error" && (
                <p className="text-type-danger mt-4">
                  Failed to validate token. Please check your Febbox token.
                </p>
              )}
              {status === "api_down" && (
                <p className="text-type-danger mt-4">
                  Cannot reach Aurora API. Please try again later.
                </p>
              )}
              {status === "invalid_token" && (
                <p className="text-type-danger mt-4">
                  Your token is invalid or expired. Please get a new one from Febbox.
                </p>
              )}
              {status === "success" &&
                quota &&
                (() => {
                  if (!quota?.traffic_today_usage) return null;
                  const used = quota.traffic_today_usage;
                  const limit = quota.traffic_limit;
                  const reset = quota.reset_at;
                  return (
                    <>
                      <p className="text-sm text-green-500 mt-2">
                        {used} / {limit} High-speed Traffic (resets {reset})
                      </p>
                      <p className="max-w-[30rem] text-xs opacity-70 mt-2">
                        Febbox gives you high-speed traffic per month. Streams may buffer more after you&apos;ve used your quota.
                      </p>
                    </>
                  );
                })()}
              <div className="flex justify-between items-center gap-4 mt-6">
                <div className="my-3">
                  <p className="max-w-[32rem] font-medium">
                    Enable MP4 streams. May be faster outside of the U.S., but audio tracks cannot be changed.
                  </p>
                </div>
                <div>
                  <Toggle
                    onClick={() =>
                      preferences.setFebboxUseMp4(!preferences.febboxUseMp4)
                    }
                    enabled={preferences.febboxUseMp4}
                  />
                </div>
              </div>
            </>
          ) : null}
        </SettingsCard>
        <Modal id={exampleModal.id}>
          <ModalCard>
            <Heading2 className="!mt-0 !mb-4 !text-2xl">
              Example Token
            </Heading2>
            <Paragraph className="!mt-1 !mb-6">
              This is what a Febbox UI token looks like:
            </Paragraph>
            <div className="bg-authentication-inputBg p-4 rounded-lg mb-6 font-mono text-sm break-all">
              eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NDc1MTI2MTksIm5iZiI6MTc0NzUxMjYxOSwiZXhwIjoxNzc4NjE2NjM5LCJkYXRhIjp7InVpZCI6NTI1NTc3LCsudujeI6IjE4NTQ4NmEwMzBjMGNlMWJjY2IzYWJjMjI2OTYwYzQ4dhdhs.qkuTF2aVPu54S0RFJS_ca7rlHuGz_Fe6kWkBydYQoCg
            </div>
            <Paragraph className="!mt-1 !mb-6 text-type-danger">
              Don&apos;t try to use this — it&apos;s fake.
            </Paragraph>
            <div className="flex justify-end">
              <Button theme="secondary" onClick={exampleModal.hide}>
                Got it
              </Button>
            </div>
          </ModalCard>
        </Modal>
      </>
    );
  }
}

async function getdebridTokenStatus(
  debridToken: string | null,
  debridService: string,
) {
  if (debridToken) {
    const status: Status =
      debridService === "torbox"
        ? await testTorboxToken(debridToken)
        : await testdebridToken(debridToken);
    return status;
  }
  return "unset";
}

export function DebridEdit({
  debridToken,
  setdebridToken,
  debridService,
  setdebridService,
  mode = "settings",
}: DebridProps) {
  const { t } = useTranslation();
  const user = useAuthStore();
  const preferences = usePreferencesStore();

  // Initialize expansion state for onboarding mode
  const [isDebridExpanded, setIsDebridExpanded] = useState(
    mode === "onboarding" && debridToken !== null && debridToken !== "",
  );

  // Expand when key is set in onboarding mode
  useEffect(() => {
    if (mode === "onboarding" && debridToken && debridToken.length > 0) {
      setIsDebridExpanded(true);
    }
  }, [debridToken, mode]);

  // Enable Real Debrid token when account is loaded and we have a token
  useEffect(() => {
    if (user.account && debridToken === null && preferences.debridToken) {
      setdebridToken(preferences.debridToken);
    }
  }, [user.account, debridToken, preferences.debridToken, setdebridToken]);

  // Determine if content is visible
  const isDebridVisible =
    mode === "onboarding" ? isDebridExpanded : debridToken !== null;

  // Toggle handler based on mode
  const toggleDebridExpanded = () => {
    if (mode === "onboarding") {
      // Onboarding mode: expand/collapse, preserve key
      if (isDebridExpanded) {
        setdebridToken("");
        setIsDebridExpanded(false);
      } else {
        setIsDebridExpanded(true);
      }
    } else {
      // Settings mode: enable/disable
      setdebridToken(debridToken === null ? "" : null);
    }
  };

  const [status, setStatus] = useState<Status>("unset");
  const statusMap: Record<Status, StatusCircleProps["type"]> = {
    error: "error",
    success: "success",
    unset: "noresult",
    api_down: "error",
    invalid_token: "error",
  };

  useEffect(() => {
    const checkTokenStatus = async () => {
      const result = await getdebridTokenStatus(debridToken, debridService);
      setStatus(result);
    };
    checkTokenStatus();
  }, [debridToken, debridService]);

  if (conf().ALLOW_DEBRID_KEY) {
    return (
      <SettingsCard>
        <div className="flex justify-between items-center gap-4">
          <div className="my-3">
            <p className="text-white font-bold mb-3">{t("debrid.title")}</p>
            <Trans i18nKey="debrid.description">
              <MwLink to="https://real-debrid.com/" />
              {/* fifth's referral code */}
              <MwLink to="https://torbox.app/subscription?referral=3f665ece-0405-4012-9db7-c6f90e8567e1" />
            </Trans>
            <p className="text-type-danger mt-2 max-w-[30rem]">
              {t("debrid.notice")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Toggle onClick={toggleDebridExpanded} enabled={isDebridVisible} />
          </div>
        </div>
        {isDebridVisible ? (
          <>
            <Divider marginClass="my-6 px-8 box-content -mx-8" />
            <p className="text-white font-bold mb-3">
              {t("debrid.tokenLabel")}
            </p>
            <div className="flex md:flex-row flex-col items-center w-full gap-4">
              <div className="flex items-center w-full">
                <StatusCircle type={statusMap[status]} className="mx-2 mr-4" />
                <AuthInputBox
                  onChange={(newToken) => {
                    setdebridToken(newToken);
                  }}
                  value={debridToken ?? ""}
                  placeholder="ABC123..."
                  passwordToggleable
                  className="flex-grow"
                />
              </div>
              <div className="flex items-center">
                <Dropdown
                  options={[
                    {
                      id: "realdebrid",
                      name: t("debrid.serviceOptions.realdebrid"),
                    },
                    {
                      id: "torbox",
                      name: t("debrid.serviceOptions.torbox"),
                    },
                  ]}
                  selectedItem={{
                    id: debridService,
                    name: t(`debrid.serviceOptions.${debridService}`),
                  }}
                  setSelectedItem={(item) => setdebridService(item.id)}
                  direction="up"
                />
              </div>
            </div>
            {status === "error" && (
              <p className="text-type-danger mt-4">
                {t("debrid.status.failure")}
              </p>
            )}
            {status === "api_down" && (
              <p className="text-type-danger mt-4">
                {t("debrid.status.api_down")}
              </p>
            )}
            {status === "invalid_token" && (
              <p className="text-type-danger mt-4">
                {t("debrid.status.invalid_token")}
              </p>
            )}
          </>
        ) : null}
      </SettingsCard>
    );
  }
  return null;
}

export function TIDBEdit({ tidbKey, setTIDBKey }: TIDBKeyProps) {
  const { t } = useTranslation();
  const preferences = usePreferencesStore();
  const initializedRef = useRef(false);

  // Enable TIDB key when component loads
  useEffect(() => {
    if (!initializedRef.current && tidbKey === null && preferences.tidbKey) {
      initializedRef.current = true;
      setTIDBKey(preferences.tidbKey);
    }
  }, [tidbKey, preferences.tidbKey, setTIDBKey]);

  return (
    <SettingsCard paddingClass="px-5 py-4">
      <p className="text-white font-bold mb-2">TheIntroDB</p>
      <p className="font-medium text-sm mb-3 text-type-secondary">
        <Trans i18nKey="settings.connections.tidb.description">
          <MwLink to="https://theintrodb.org/" />
        </Trans>
      </p>
      <p className="text-white font-bold mb-2 text-sm">
        {t("settings.connections.tidb.tokenLabel")}
      </p>
      <AuthInputBox
        onChange={(newToken) => {
          setTIDBKey(newToken);
        }}
        value={tidbKey ?? ""}
        placeholder="theintrodb:user..."
        passwordToggleable
        className="w-full"
      />
    </SettingsCard>
  );
}

export function WyzieEdit() {
  const wyzieKey = usePreferencesStore((s) => s.wyzieKey);
  const setWyzieKey = usePreferencesStore((s) => s.setWyzieKey);
  return (
    <SettingsCard paddingClass="px-5 py-4">
      <p className="text-white font-bold mb-2">Wyzie Subtitles</p>
      <p className="font-medium text-sm mb-3 text-type-secondary">
        Optional API key for better-synced subtitles. Stored only in your
        browser. Get one at{" "}
        <MwLink url="https://store.wyzie.io/redeem">
          store.wyzie.io/redeem
        </MwLink>
        .
      </p>
      <p className="text-white font-bold mb-2 text-sm">API Key</p>
      <AuthInputBox
        onChange={(newKey) => {
          setWyzieKey(newKey || null);
        }}
        value={wyzieKey ?? ""}
        placeholder="wyzie-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        passwordToggleable
        className="w-full"
      />
    </SettingsCard>
  );
}

export function ArtemisVipEdit() {
  const artemisVipKey = usePreferencesStore((s) => s.artemisVipKey);
  const setArtemisVipKey = usePreferencesStore((s) => s.setArtemisVipKey);
  return (
    <SettingsCard paddingClass="px-5 py-4">
      <p className="text-white font-bold mb-2">Artemis VIP</p>
      <p className="font-medium text-sm mb-3 text-type-secondary">
        Artemis is a high quality source with the fastest load times, 4K
        content, and a huge content library. Join our{" "}
        <MwLink url="https://discord.gg/Jrj3w6t9mY">Discord server</MwLink> to
        purchase access.
      </p>
      <p className="text-white font-bold mb-2 text-sm">API Key</p>
      <AuthInputBox
        onChange={(newKey) => {
          setArtemisVipKey(newKey || null);
        }}
        value={artemisVipKey ?? ""}
        placeholder="avip_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        passwordToggleable
        className="w-full"
      />
    </SettingsCard>
  );
}

export function TraktEdit() {
  const { t } = useTranslation();
  const { user, status, logout, error } = useTraktStore();
  const config = conf();

  const connect = () => {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.TRAKT_CLIENT_ID ?? "",
      redirect_uri: config.TRAKT_REDIRECT_URI ?? "",
    });
    window.location.href = `https://trakt.tv/oauth/authorize?${params.toString()}`;
  };

  if (
    !config.TRAKT_CLIENT_ID ||
    !config.TRAKT_CLIENT_SECRET ||
    !config.TRAKT_REDIRECT_URI
  )
    return null;

  return (
    <SettingsCard paddingClass="px-5 py-4">
      <div className="flex flex-col h-full">
        <p className="text-white font-bold mb-2">
          {t("settings.connections.trakt.title")}
        </p>
        <p className="font-medium text-sm text-type-secondary mb-1">
          {t("settings.connections.trakt.description")}
        </p>
        <p className="text-type-secondary text-xs mb-4">
          {t("settings.connections.trakt.details")}
        </p>
        {error && <p className="text-type-danger text-sm mb-2">{error}</p>}
        <div className="mt-auto">
          {user ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {user.images?.avatar?.full && (
                  <img
                    src={user.images.avatar.full}
                    alt={user.username}
                    className="w-7 h-7 rounded-full flex-shrink-0"
                  />
                )}
                <span className="font-bold truncate">
                  {user.name || user.username}
                </span>
              </div>
              <Button theme="danger" onClick={logout}>
                {t("settings.connections.trakt.disconnect")}
              </Button>
            </div>
          ) : (
            <Button
              theme="purple"
              onClick={connect}
              disabled={status === "syncing"}
            >
              {status === "syncing"
                ? t("settings.connections.trakt.syncing")
                : t("settings.connections.trakt.connect")}
            </Button>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

export function SimklEdit() {
  const { user, status, logout, error } = useSimklStore();
  const config = conf();

  const connect = () => {
    const url = simklService.getAuthUrl();
    if (url) window.location.href = url;
  };

  if (
    !config.SIMKL_CLIENT_ID ||
    !config.SIMKL_CLIENT_SECRET ||
    !config.SIMKL_REDIRECT_URI
  )
    return null;

  const displayName = user?.user?.name;

  return (
    <SettingsCard paddingClass="px-5 py-4">
      <div className="flex flex-col h-full">
        <p className="text-white font-bold mb-2">Simkl</p>
        <p className="font-medium text-sm text-type-secondary mb-1">
          Sync your watchlist and history with Simkl.
        </p>
        <p className="text-type-secondary text-xs mb-4">
          Syncing might take a few minutes. Local changes are prioritized on
          conflict.
        </p>
        {error && <p className="text-type-danger text-sm mb-2">{error}</p>}
        <div className="mt-auto">
          {displayName ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {user?.user?.avatar && (
                  <img
                    src={user.user.avatar}
                    alt={displayName}
                    className="w-7 h-7 rounded-full flex-shrink-0"
                  />
                )}
                <span className="font-bold truncate">{displayName}</span>
              </div>
              <Button theme="danger" onClick={logout}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              theme="purple"
              onClick={connect}
              disabled={status === "syncing"}
            >
              {status === "syncing" ? "Connecting..." : "Connect Simkl"}
            </Button>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

export function ConnectionsPart(
  props: BackendEditProps &
    ProxyEditProps &
    FebboxKeyProps &
    DebridProps &
    TIDBKeyProps,
) {
  const { t } = useTranslation();
  const isDesktopApp = useIsDesktopApp();
  return (
    <div>
      <Heading1 border>{t("settings.connections.title")}</Heading1>
      <div className="space-y-6">
        <SetupPart />
        {!isDesktopApp && (
          <ProxyEdit
            proxyUrls={props.proxyUrls}
            setProxyUrls={props.setProxyUrls}
            proxyTmdb={props.proxyTmdb}
            setProxyTmdb={props.setProxyTmdb}
          />
        )}
        <BackendEdit
          backendUrl={props.backendUrl}
          setBackendUrl={props.setBackendUrl}
        />
        <FebboxSetup
          febboxKey={props.febboxKey}
          setFebboxKey={props.setFebboxKey}
          mode="settings"
        />
        <DebridEdit
          debridToken={props.debridToken}
          setdebridToken={props.setdebridToken}
          debridService={props.debridService}
          setdebridService={props.setdebridService}
          mode="settings"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TIDBEdit tidbKey={props.tidbKey} setTIDBKey={props.setTIDBKey} />
          <WyzieEdit />
          <ArtemisVipEdit />
          <TraktEdit />
          <SimklEdit />
        </div>
      </div>
    </div>
  );
}

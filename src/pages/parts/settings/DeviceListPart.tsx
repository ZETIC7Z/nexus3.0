import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { SessionResponse } from "@/backend/accounts/auth";
import { base64ToBuffer, decryptData } from "@/backend/accounts/crypto";
import { removeSession } from "@/backend/accounts/sessions";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { Loading } from "@/components/layout/Loading";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { Modal, ModalCard, useModal } from "@/components/overlays/Modal";
import { SecondaryLabel } from "@/components/text/SecondaryLabel";
import { Heading2 } from "@/components/utils/Text";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { parseUserAgentDevice } from "@/utils/common/device";

export const signOutAllDevices = () => {
  const buttons = document.querySelectorAll(".logout-button");
  buttons.forEach((button) => {
    (button as HTMLElement).click();
  });
};

/** Format an ISO timestamp into a short, readable local date-time. */
function formatLoginTime(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Device(props: {
  name: string;
  id: string;
  isCurrent?: boolean;
  userAgent?: string;
  accessedAt?: string;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const url = useBackendUrl();
  const token = useAuthStore((s) => s.account?.token);
  const confirmModal = useModal(`remove-device-${props.id}`);
  const [confirming, setConfirming] = useState(false);
  const [result, exec] = useAsyncFn(async () => {
    if (!token) throw new Error("No token present");
    if (!url) throw new Error("No backend set");
    await removeSession(url, token, props.id);
    setConfirming(false);
    confirmModal.hide();
    props.onRemove?.();
  }, [url, token, props.id, confirmModal]);

  const deviceInfo = useMemo(
    () => parseUserAgentDevice(props.userAgent),
    [props.userAgent],
  );
  const loginTime = useMemo(
    () => formatLoginTime(props.accessedAt ?? props.accessedAt),
    [props.accessedAt],
  );

  return (
    <SettingsCard className="flex items-center justify-between gap-4" paddingClass="px-6 py-4">
      <div className="min-w-0 flex-1">
        <SecondaryLabel>
          {t("settings.account.devices.deviceNameLabel")}
        </SecondaryLabel>
        <p className="truncate font-medium text-white">
          {props.name}
          {props.isCurrent ? (
            <span className="ml-2 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-400">
              {t("settings.account.devices.current")}
            </span>
          ) : null}
        </p>
        {deviceInfo ? (
          <p className="mt-0.5 truncate text-xs text-white/50">{deviceInfo}</p>
        ) : null}
        {loginTime ? (
          <p className="mt-0.5 truncate text-xs text-white/40">
            {t("settings.account.devices.lastAccessed")}: {loginTime}
          </p>
        ) : null}
      </div>

      {!props.isCurrent ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            confirmModal.show();
          }}
          aria-label={t("settings.account.devices.removeDevice")}
          title={t("settings.account.devices.removeDevice")}
          className="logout-button flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/45 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
        >
          <Icon icon={Icons.X} className="text-base" />
        </button>
      ) : null}

      <Modal id={confirmModal.id}>
        <ModalCard>
          <Heading2 className="!mt-0 !mb-3">
            {t("settings.account.devices.removeConfirmTitle")}
          </Heading2>
          <p className="mb-6 text-sm text-type-secondary">
            {t("settings.account.devices.removeConfirmBody")}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              theme="secondary"
              disabled={result.loading}
              onClick={() => {
                setConfirming(false);
                confirmModal.hide();
              }}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              theme="danger"
              loading={result.loading}
              onClick={exec}
            >
              {t("settings.account.devices.removeConfirmYes")}
            </Button>
          </div>
        </ModalCard>
      </Modal>
      {confirming ? null : null}
    </SettingsCard>
  );
}

export function DeviceListPart(props: {
  loading?: boolean;
  error?: boolean;
  sessions: SessionResponse[];
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const seed = useAuthStore((s) => s.account?.seed);
  const sessions = props.sessions;
  const currentSessionId = useAuthStore((s) => s.account?.sessionId);
  const deviceListSorted = useMemo(() => {
    if (!seed) return [];
    const list = sessions.map((session) => {
      let decryptedName: string;
      const parts = session.device?.split(".");
      if (!parts || parts.length !== 3) {
        decryptedName =
          session.device || t("settings.account.devices.unknownDevice");
      } else {
        try {
          decryptedName = decryptData(session.device, base64ToBuffer(seed));
        } catch (error) {
          console.warn(
            `Failed to decrypt device name for session ${session.id}:`,
            error,
          );
          decryptedName = t("settings.account.devices.unknownDevice");
        }
      }
      return {
        current: session.id === currentSessionId,
        id: session.id,
        name: decryptedName,
        userAgent: session.userAgent,
        accessedAt: session.accessedAt ?? session.createdAt,
      };
    });
    list.sort((a, b) => {
      if (a.current) return -1;
      if (b.current) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [seed, sessions, currentSessionId, t]);
  if (!seed) return null;

  return (
    <div>
      <Heading2 border className="mt-0 mb-9">
        {t("settings.account.devices.title")}
      </Heading2>
      {props.loading ? (
        <Loading />
      ) : props.error && deviceListSorted.length === 0 ? (
        <p>{t("settings.account.devices.failed")}</p>
      ) : (
        <div className="space-y-5">
          {deviceListSorted.map((session) => (
            <Device
              name={session.name}
              id={session.id}
              key={session.id}
              isCurrent={session.current}
              userAgent={session.userAgent}
              accessedAt={session.accessedAt}
              onRemove={props.onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsync } from "react-use";

import { getBackendMeta } from "@/backend/accounts/meta";
import { getRoomStatuses } from "@/backend/player/status";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { Spinner } from "@/components/layout/Spinner";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useWatchPartySync } from "@/hooks/useWatchPartySync";
import { openWindowSafely } from "@/setup/popupGuard";
import { useAuthStore } from "@/stores/auth";
import { getProgressPercentage } from "@/stores/progress";
import { useWatchPartyStore } from "@/stores/watchParty";

import { useDownloadLink } from "./Downloads";

export function WatchPartyView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  const downloadUrl = useDownloadLink();
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "code" | "link">("idle");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const backendUrl = useBackendUrl();
  const account = useAuthStore((s) => s.account);

  const {
    enabled,
    roomCode,
    isHost,
    enableAsHost,
    enableAsGuest,
    updateRoomCode,
    disable,
    showStatusOverlay,
    setShowStatusOverlay,
  } = useWatchPartyStore();

  const { roomUsers, isOffline } = useWatchPartySync();

  const backendMeta = useAsync(async () => {
    if (!backendUrl) return undefined;
    return getBackendMeta(backendUrl);
  }, [backendUrl]);

  const backendSupportsWatchParty = backendMeta?.value?.version
    ? backendMeta.value.version >= "2.0.1"
    : false;

  const getDisplayName = (userId: string) => {
    if (account?.userId === userId && account?.nickname) return account.nickname;
    if (account?.userId === userId) return t("watchParty.you");
    return `${userId.substring(0, 8)}`;
  };

  const handleLegacyWatchPartyClick = () => {
    if (!downloadUrl) return;
    const url = `https://www.watchparty.me/create?video=${encodeURIComponent(downloadUrl)}`;
    openWindowSafely(url);
  };

  const handleHostParty = () => {
    enableAsHost();
    setShowJoinInput(false);
  };

  const handleJoinParty = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length === 0) return;

    setIsValidating(true);
    setValidationError(null);

    try {
      const response = await getRoomStatuses(backendUrl, account, code);
      if (Object.keys(response.users).length === 0) {
        setValidationError(t("watchParty.emptyRoom"));
        setIsValidating(false);
        return;
      }
      enableAsGuest(code);
      setShowJoinInput(false);
      setJoinCode("");
    } catch (err) {
      console.error("watchparty: join failed", err);
      setValidationError(t("watchParty.invalidRoom"));
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisableParty = () => {
    disable();
    setShowJoinInput(false);
    setJoinCode("");
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    setCopyState("code");
    setTimeout(() => setCopyState("idle"), 1500);
  };

  const handleCopyLink = async () => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("watchparty", roomCode);
    await navigator.clipboard.writeText(url.toString());
    setCopyState("link");
    setTimeout(() => setCopyState("idle"), 1500);
  };

  const handleEditCode = () => {
    if (!isHost || !roomCode) return;
    setCustomCode(roomCode);
    setEditingCode(true);
  };

  const handleSaveCode = () => {
    const next = customCode.trim().toUpperCase();
    if (next.length === 0) return;
    updateRoomCode(next);
    setEditingCode(false);
    const url = new URL(window.location.href);
    url.searchParams.set("watchparty", next);
    window.history.replaceState({}, "", url.toString());
  };

  const toggleStatusOverlay = () => setShowStatusOverlay(!showStatusOverlay);

  useEffect(() => {
    if (!enabled) setValidationError(null);
  }, [enabled]);

  const renderUnsupported = () => (
    <div className="rounded-lg border border-type-danger/30 bg-type-danger/5 p-4 text-sm text-type-secondary">
      {t("watchParty.backendRequirement")}
    </div>
  );

  const renderHostJoinChoice = () => (
    <div className="space-y-3">
      {showJoinInput ? (
        <div className="space-y-3">
          <div>
            <input
              type="text"
              maxLength={10}
              autoFocus
              className="w-full px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono bg-mediaCard-hoverBackground border border-mediaCard-hoverAccent border-opacity-20 rounded-lg text-type-logo uppercase focus:border-buttons-purple focus:outline-none transition-colors"
              placeholder="ABC123"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinParty();
              }}
            />
            {validationError && (
              <p className="text-xs text-center text-type-danger mt-2">
                {validationError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              theme="secondary"
              onClick={() => {
                setShowJoinInput(false);
                setValidationError(null);
                setJoinCode("");
              }}
            >
              {t("watchParty.cancel")}
            </Button>
            <Button
              className="flex-1"
              theme="purple"
              onClick={handleJoinParty}
              disabled={joinCode.length === 0 || isValidating}
            >
              {isValidating ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4" />
                  {t("watchParty.validating")}
                </span>
              ) : (
                t("watchParty.join")
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button className="w-full" theme="purple" onClick={handleHostParty}>
            <span className="flex items-center justify-center gap-2">
              <Icon icon={Icons.RISING_STAR} className="text-lg" />
              {t("watchParty.hostParty")}
            </span>
          </Button>
          <Button
            className="w-full"
            theme="secondary"
            onClick={() => setShowJoinInput(true)}
          >
            {t("watchParty.joinParty")}
          </Button>
        </div>
      )}
    </div>
  );

  const renderActiveRoom = () => (
    <div className="space-y-3">
      <div className="rounded-lg bg-mediaCard-hoverBackground border border-mediaCard-hoverAccent/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isOffline ? "bg-type-danger" : "bg-green-500 animate-ping"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isOffline ? "bg-type-danger" : "bg-green-500"
                }`}
              />
            </span>
            <span className="text-xs uppercase tracking-wider font-semibold text-type-secondary">
              {isOffline
                ? t("watchParty.status.offline")
                : isHost
                  ? t("watchParty.hosting")
                  : t("watchParty.watching")}
            </span>
          </div>
          {isHost && !editingCode && (
            <button
              type="button"
              className="text-xs text-type-secondary hover:text-white transition-colors flex items-center gap-1"
              onClick={handleEditCode}
            >
              <Icon icon={Icons.EDIT} className="w-3 h-3" />
              {t("watchParty.edit")}
            </button>
          )}
        </div>

        {editingCode ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={customCode}
              maxLength={10}
              autoFocus
              className="flex-1 bg-transparent border-b border-mediaCard-hoverAccent/40 focus:border-buttons-purple text-center font-mono tracking-[0.3em] outline-none text-type-logo text-2xl uppercase py-1 transition-colors"
              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCode();
              }}
            />
            <Button
              theme="purple"
              className="px-3 py-1 text-xs"
              onClick={handleSaveCode}
            >
              {t("watchParty.save")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="w-full text-center font-mono tracking-[0.3em] text-type-logo text-2xl uppercase py-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleCopyCode}
            title={t("watchParty.copyCode") ?? undefined}
          >
            {copyState === "code" ? t("watchParty.copied") : roomCode}
          </button>
        )}

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded bg-mediaCard-hoverShadow hover:bg-mediaCard-hoverAccent/30 text-type-secondary hover:text-white transition-colors"
            onClick={handleCopyCode}
          >
            <Icon icon={Icons.COPY} className="w-3 h-3" />
            {copyState === "code"
              ? t("watchParty.copied")
              : t("watchParty.copyCode")}
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded bg-mediaCard-hoverShadow hover:bg-mediaCard-hoverAccent/30 text-type-secondary hover:text-white transition-colors"
            onClick={handleCopyLink}
          >
            <Icon icon={Icons.LINK} className="w-3 h-3" />
            {copyState === "link"
              ? t("watchParty.copied")
              : t("watchParty.copyLink")}
          </button>
        </div>
      </div>

      {roomUsers.length > 1 && (
        <div className="rounded-lg bg-mediaCard-hoverBackground border border-mediaCard-hoverAccent/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-type-secondary">
              {t("watchParty.viewers", { count: roomUsers.length })}
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {roomUsers.map((user) => {
              const isMe = account?.userId === user.userId;
              return (
                <div
                  key={user.userId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon
                      icon={user.isHost ? Icons.RISING_STAR : Icons.USER}
                      className={`w-3 h-3 flex-shrink-0 ${user.isHost ? "text-onboarding-best" : "text-type-secondary"}`}
                    />
                    <span
                      className={`truncate ${user.isHost ? "text-onboarding-best font-medium" : isMe ? "text-white" : "text-type-secondary"}`}
                    >
                      {getDisplayName(user.userId)}
                      {isMe ? ` · ${t("watchParty.you")}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-type-secondary font-mono ml-2">
                    {user.player.duration > 0
                      ? `${Math.floor(getProgressPercentage(user.player.time, user.player.duration))}%`
                      : `${Math.floor(user.player.time)}s`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label className="flex items-center justify-between rounded-lg bg-mediaCard-hoverBackground border border-mediaCard-hoverAccent/20 p-3 cursor-pointer">
        <span className="text-sm text-white">
          {t("watchParty.showStatusOverlay")}
        </span>
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={showStatusOverlay}
            onChange={toggleStatusOverlay}
          />
          <span className="w-9 h-5 bg-mediaCard-hoverShadow rounded-full peer-checked:bg-buttons-purple transition-colors" />
          <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
        </span>
      </label>

      <Button className="w-full" theme="danger" onClick={handleDisableParty}>
        {t("watchParty.leaveWatchParty")}
      </Button>
    </div>
  );

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.watchparty.watchpartyItem")}
      </Menu.BackLink>
      <Menu.Section>
        <div className="pb-4 space-y-3">
          {!backendSupportsWatchParty
            ? renderUnsupported()
            : enabled
              ? renderActiveRoom()
              : renderHostJoinChoice()}

          {backendSupportsWatchParty && <Menu.Divider />}

          <Menu.Link
            clickable
            onClick={handleLegacyWatchPartyClick}
            rightSide={<Icon className="text-xl" icon={Icons.WATCH_PARTY} />}
          >
            {t("player.menus.watchparty.legacyWatchparty")}
          </Menu.Link>
          <Menu.Paragraph marginClass="text-xs text-type-secondary mt-2">
            <Trans i18nKey="player.menus.watchparty.notice" />
          </Menu.Paragraph>
        </div>
      </Menu.Section>
    </>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { useWatchPartySync } from "@/hooks/useWatchPartySync";
import { useAuthStore } from "@/stores/auth";
import { getProgressPercentage } from "@/stores/progress";
import { useWatchPartyStore } from "@/stores/watchParty";

export function WatchPartyStatus() {
  const { t } = useTranslation();
  const { enabled, roomCode, isHost, showStatusOverlay } = useWatchPartyStore();
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [lastCount, setLastCount] = useState(1);
  const account = useAuthStore((s) => s.account);

  const {
    roomUsers,
    hostUser,
    isBehindHost,
    isAheadOfHost,
    timeDifferenceFromHost,
    syncWithHost,
    isSyncing,
    userCount,
    isOffline,
  } = useWatchPartySync();

  useEffect(() => {
    if (userCount > lastCount) {
      setPulse(true);
      const t1 = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(t1);
    }
    setLastCount(userCount);
  }, [userCount, lastCount]);

  if (!enabled || !roomCode || !showStatusOverlay) return null;

  const getDisplayName = (userId: string) => {
    if (account?.userId === userId && account?.nickname) return account.nickname;
    if (account?.userId === userId) return t("watchParty.you");
    return `${userId.substring(0, 12)}`;
  };

  const outOfSync = !isHost && hostUser && (isBehindHost || isAheadOfHost);

  return (
    <div
      className={`absolute top-4 right-4 z-50 max-w-[280px] text-white text-xs rounded-lg backdrop-blur-md bg-black/60 border border-white/10 transition-all duration-300 ${
        pulse ? "ring-2 ring-buttons-purple shadow-lg shadow-buttons-purple/30" : ""
      }`}
    >
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center justify-between gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isOffline
                  ? "bg-type-danger"
                  : outOfSync
                    ? "bg-yellow-500 animate-ping"
                    : "bg-green-500 animate-ping"
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isOffline
                  ? "bg-type-danger"
                  : outOfSync
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
            />
          </span>
          <span className="font-semibold">
            {isHost ? t("watchParty.hosting") : t("watchParty.watching")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-type-logo font-mono tracking-wider">
            {roomCode}
          </span>
          <Icon
            icon={expanded ? Icons.CHEVRON_DOWN : Icons.CHEVRON_RIGHT}
            className="w-3 h-3 text-type-secondary"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/10 pt-2 space-y-2">
          <div className="text-type-secondary">
            {roomUsers.length <= 1
              ? t("watchParty.alone")
              : t("watchParty.withCount", { count: roomUsers.length - 1 })}
          </div>

          {roomUsers.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {roomUsers.map((user) => {
                const isMe = account?.userId === user.userId;
                return (
                  <div
                    key={user.userId}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-1 min-w-0">
                      <Icon
                        icon={user.isHost ? Icons.RISING_STAR : Icons.USER}
                        className={`w-3 h-3 flex-shrink-0 ${user.isHost ? "text-onboarding-best" : ""}`}
                      />
                      <span
                        className={`truncate ${user.isHost ? "text-onboarding-best" : isMe ? "text-white" : "text-type-secondary"}`}
                      >
                        {getDisplayName(user.userId)}
                      </span>
                    </span>
                    <span className="text-type-secondary font-mono">
                      {user.player.duration > 0
                        ? `${Math.floor(getProgressPercentage(user.player.time, user.player.duration))}%`
                        : `${Math.floor(user.player.time)}s`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {outOfSync && (
        <div className="px-3 pb-3">
          <Button
            theme="secondary"
            className="w-full text-xs py-1.5 bg-buttons-purple/50 hover:bg-buttons-purple flex items-center justify-center gap-1"
            onClick={syncWithHost}
            disabled={isSyncing}
          >
            <Icon icon={Icons.CLOCK} className="w-3 h-3" />
            <span className="whitespace-nowrap">
              {isSyncing
                ? t("watchParty.syncing")
                : isBehindHost
                  ? t("watchParty.behindHost", {
                      seconds: Math.abs(Math.round(timeDifferenceFromHost)),
                    })
                  : t("watchParty.aheadOfHost", {
                      seconds: Math.round(timeDifferenceFromHost),
                    })}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

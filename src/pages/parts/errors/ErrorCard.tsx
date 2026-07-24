import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { Modal } from "@/components/overlays/Modal";
import { DisplayError } from "@/components/player/display/displayInterface";
import {
  formatErrorDebugInfo,
  gatherErrorDebugInfo,
} from "@/utils/browser/errorDebugInfo";

type AnyError = DisplayError | string | Error;

function buildHeadline(
  error: AnyError,
  t: (key: string) => string,
): string | null {
  if (typeof error === "string") {
    // First line of the string, in case it contains a stack trace.
    const firstLine = error.split("\n", 1)[0];
    return firstLine || error;
  }
  if (error instanceof Error) {
    return `${error.name || "Error"}: ${error.message}`;
  }
  if (error.key) return `${error.type}: ${t(error.key)}`;
  if (error.message) return `${error.type}: ${t(error.message)}`;
  return null;
}

export function ErrorCard(props: {
  error: AnyError;
  componentStack?: string;
  onClose: () => void;
}) {
  const [hasCopied, setHasCopied] = useState(false);
  const hasCopiedUnsetDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { t } = useTranslation();

  const headline = useMemo(
    () => buildHeadline(props.error, t),
    [props.error, t],
  );

  // Build the full debug dump once per (error, componentStack) change.
  // The same string is shown inline AND copied to clipboard, so what users
  // can read is exactly what they paste back.
  const formattedDebugInfo = useMemo(() => {
    try {
      const debugInfo = gatherErrorDebugInfo(
        props.error,
        props.componentStack,
      );
      return formatErrorDebugInfo(debugInfo);
    } catch (e: any) {
      // Never let the error reporter itself throw — fall back to a minimal dump.
      const fallback =
        typeof props.error === "string"
          ? props.error
          : props.error instanceof Error
            ? `${props.error.name}: ${props.error.message}\n${props.error.stack ?? ""}`
            : JSON.stringify(props.error, null, 2);
      return `(failed to gather full debug info: ${e?.message ?? e})\n\n${fallback}`;
    }
  }, [props.error, props.componentStack]);

  function copyError() {
    if (!props.error || !navigator.clipboard) return;

    const fullErrorReport = headline
      ? `\`\`\`\n${headline}\n\n${formattedDebugInfo}\n\`\`\``
      : `\`\`\`\n${formattedDebugInfo}\n\`\`\``;

    navigator.clipboard.writeText(fullErrorReport);

    setHasCopied(true);

    // Debounce unsetting the "has copied" label
    if (hasCopiedUnsetDebounce.current)
      clearTimeout(hasCopiedUnsetDebounce.current);
    hasCopiedUnsetDebounce.current = setTimeout(() => setHasCopied(false), 2e3);
  }

  return (
    // I didn't put a <Transition> here because it'd fade out, then jump height weirdly
    <div className="bg-errors-card w-full rounded-lg p-6 text-left">
      <div className="border-errors-border flex items-center justify-between border-b pb-2">
        <span className="font-medium text-white">{t("errors.details")}</span>
        <div className="flex items-center justify-center gap-3">
          <Button
            theme="secondary"
            padding="p-2 h-10 min-w-[40px] md:px-4"
            onClick={() => copyError()}
          >
            {hasCopied ? (
              <>
                <Icon icon={Icons.CHECKMARK} className="text-xs" />
                <span className="hidden min-[400px]:inline-block ml-3">
                  {t("actions.copied")}
                </span>
              </>
            ) : (
              <>
                <Icon icon={Icons.COPY} className="text-2xl" />
                <span className="hidden min-[400px]:inline-block ml-3">
                  {t("player.playbackError.copyDebugInfo")}
                </span>
              </>
            )}
          </Button>
          <Button
            theme="secondary"
            padding="p-2 md:px-2"
            onClick={props.onClose}
          >
            <Icon icon={Icons.X} className="text-2xl" />
          </Button>
        </div>
      </div>
      {headline ? (
        <div className="mt-4 select-text break-words font-medium text-white">
          {headline}
        </div>
      ) : null}
      <div className="pointer-events-auto mt-3 max-h-[60vh] min-h-[15rem] select-text overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-3 text-left font-mono text-xs leading-relaxed">
        {formattedDebugInfo}
      </div>
      <p className="mt-4 text-sm">{t("player.playbackError.debugInfo")}</p>
    </div>
  );
}

// use plain modal version if there is no access to history api (like in error boundary)
export function ErrorCardInPlainModal(props: {
  error?: AnyError;
  componentStack?: string;
  onClose: () => void;
  show?: boolean;
}) {
  if (!props.show || !props.error) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex h-full w-full items-center justify-center bg-black bg-opacity-50 p-4 sm:p-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="w-full max-w-2xl">
        <ErrorCard
          error={props.error}
          componentStack={props.componentStack}
          onClose={props.onClose}
        />
      </div>
    </div>
  );
}

export function ErrorCardInModal(props: {
  error?: AnyError;
  componentStack?: string;
  id: string;
  onClose: () => void;
}) {
  if (!props.error) return null;

  return (
    <Modal id={props.id}>
      <div className="pointer-events-auto w-11/12 max-w-2xl">
        <ErrorCard
          error={props.error}
          componentStack={props.componentStack}
          onClose={props.onClose}
        />
      </div>
    </Modal>
  );
}

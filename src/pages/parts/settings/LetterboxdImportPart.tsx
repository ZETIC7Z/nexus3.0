import { ChangeEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  LetterboxdImportItemResult,
  LetterboxdWatchlistRow,
  importLetterboxdWatchlist,
  parseLetterboxdWatchlist,
} from "@/backend/metadata/letterboxdImport";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { Heading1, Paragraph } from "@/components/utils/Text";
import { useBookmarkStore } from "@/stores/bookmarks";

type ImportStatus = "idle" | "parsing" | "ready" | "importing" | "done" | "error";

interface ImportSummary {
  added: number;
  duplicates: number;
  notfound: number;
  errors: number;
}

function summarize(results: LetterboxdImportItemResult[]): ImportSummary {
  return results.reduce<ImportSummary>(
    (acc, r) => {
      if (r.status === "added") acc.added += 1;
      else if (r.status === "duplicate") acc.duplicates += 1;
      else if (r.status === "notfound") acc.notfound += 1;
      else acc.errors += 1;
      return acc;
    },
    { added: 0, duplicates: 0, notfound: 0, errors: 0 },
  );
}

export function LetterboxdImportPart() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<LetterboxdWatchlistRow[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setSummary(null);
      setProgress({ done: 0, total: 0 });
      setStatus("parsing");

      try {
        const content = await file.text();
        const parsed = parseLetterboxdWatchlist(content);
        setRows(parsed);
        setStatus("ready");
      } catch (err) {
        setRows([]);
        setStatus("error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (rows.length === 0 || status === "importing") return;

    setStatus("importing");
    setProgress({ done: 0, total: rows.length });

    const results = await importLetterboxdWatchlist({
      rows,
      isAlreadyBookmarked: (tmdbId) =>
        Boolean(useBookmarkStore.getState().bookmarks[tmdbId]),
      addBookmark,
      onProgress: (done, total) => setProgress({ done, total }),
    });

    setSummary(summarize(results));
    setStatus("done");
  }, [rows, status, addBookmark]);

  const parsedLabel = t("settings.letterboxd.parsed").replace(
    "{n}",
    String(rows.length),
  );
  const progressLabel = t("settings.letterboxd.progress")
    .replace("{done}", String(progress.done))
    .replace("{total}", String(progress.total));
  const summaryLabel = summary
    ? t("settings.letterboxd.summary")
        .replace("{added}", String(summary.added))
        .replace("{duplicates}", String(summary.duplicates))
        .replace("{notfound}", String(summary.notfound + summary.errors))
    : "";
  const progressPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const showImportAction = rows.length > 0 && status !== "done";
  const statusMessage =
    status === "error"
      ? t("settings.letterboxd.invalid")
      : status === "ready" && rows.length === 0
        ? t("settings.letterboxd.empty")
        : status === "importing"
          ? progressLabel
          : status === "done" && summary
            ? summaryLabel
            : rows.length > 0
              ? parsedLabel
              : t("settings.letterboxd.help");
  const statusTone =
    status === "error" || (status === "ready" && rows.length === 0)
      ? "text-red-400"
      : status === "done"
        ? "text-green-400"
        : "text-type-secondary";
  const statusTitle =
    status === "done"
      ? "Done"
      : status === "importing"
        ? "Importing"
        : status === "parsing"
          ? "Parsing"
          : status === "ready"
            ? "Ready"
            : "Idle";

  return (
    <div className="space-y-4">
      <Heading1 border>{t("settings.letterboxd.heading")}</Heading1>
      <Paragraph className="max-w-[42rem]">
        {t("settings.letterboxd.description")}
      </Paragraph>

      <SettingsCard>
        <div className="flex flex-col gap-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="hidden"
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-type-secondary">
                {t("settings.letterboxd.help")}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Icon
                  icon={
                    status === "done"
                      ? Icons.CHECKMARK
                      : status === "error" || (status === "ready" && rows.length === 0)
                        ? Icons.WARNING
                        : Icons.FILE
                  }
                  className={statusTone}
                />
                <span className={`min-w-0 break-all ${statusTone}`}>
                  {statusMessage}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
              <Button
                theme="secondary"
                onClick={handleFileButtonClick}
                disabled={status === "importing"}
                className="sm:min-w-[12rem]"
              >
                <Icon icon={Icons.FILE} className="mr-2" />
                {fileName
                  ? t("settings.letterboxd.changeFile")
                  : t("settings.letterboxd.selectFile")}
              </Button>

              {showImportAction && (
                <Button
                  theme="purple"
                  onClick={handleImport}
                  disabled={status === "importing"}
                  className="sm:min-w-[12rem]"
                >
                  <Icon icon={Icons.BOOKMARK} className="mr-2" />
                  {status === "importing"
                    ? t("settings.letterboxd.importing")
                    : t("settings.letterboxd.import")}
                </Button>
              )}
            </div>
          </div>

          {(fileName || rows.length > 0 || status === "importing" || status === "done") && (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 rounded-2xl border border-settings-card-border/60 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-type-secondary/80">
                  Letterboxd
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {fileName ?? t("settings.letterboxd.selectFile")}
                </p>
              </div>
              <div className="rounded-2xl border border-settings-card-border/60 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-type-secondary/80">
                  Parsed
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {rows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-settings-card-border/60 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-type-secondary/80">
                  Status
                </p>
                <p className={`mt-1 text-sm font-semibold ${statusTone}`}>
                  {statusTitle}
                </p>
              </div>
            </div>
          )}

          {status === "importing" && (
            <div className="rounded-2xl border border-settings-card-border/60 bg-black/20 px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-white font-medium">
                  {t("settings.letterboxd.importing")}
                </span>
                <span className="text-type-secondary">{progressLabel}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full bg-buttons-purple transition-[width] duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {status === "done" && summary && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Icon icon={Icons.CHECKMARK} className="mr-1" />
                <span className="font-medium">{summaryLabel}</span>
              </div>
            </div>
          )}

          {(status === "error" || (status === "ready" && rows.length === 0)) && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <Icon icon={Icons.WARNING} className="mr-1" />
                {status === "error"
                  ? t("settings.letterboxd.invalid")
                  : t("settings.letterboxd.empty")}
              </div>
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}

/** Shared formatting helpers for the env preflight banner (kept out of the
 * component file so fast refresh keeps working and tests can import them). */

export interface CheckRecord {
  at: number;
  ok: boolean;
  missing: string[];
}

/** Verbose countdown text for screen readers ("2 minutes 5 seconds"). */
export function announceCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** CSV export of recent checks. */
export const EXPORT_COUNT_OPTIONS = [5, 10, 25] as const;

/**
 * Timestamped, human-identifiable export filename, e.g.
 * `env-preflight-abc123-last-10-2026-08-01T10-12-30Z.csv`.
 */
export function buildExportFilename(
  projectRef: string | undefined,
  count: number,
  extension: "json" | "csv",
  at: Date = new Date(),
): string {
  const stamp = at.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
  return `env-preflight-${projectRef ?? "project"}-last-${count}-${stamp}.${extension}`;
}

export function buildHistoryCsv(records: CheckRecord[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ["checked_at", "status", "missing_variables"].join(","),
    ...records.map((entry) =>
      [
        escape(new Date(entry.at).toISOString()),
        escape(entry.ok ? "ok" : "missing"),
        escape(entry.missing.join(" ")),
      ].join(","),
    ),
  ];
  return rows.join("\n");
}

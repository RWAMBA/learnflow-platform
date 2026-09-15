export const HEALTHY_POLL_MS = 30_000;
export const DEGRADED_POLL_MS = 10_000;
export const MAX_DEGRADED_POLL_MS = 60_000;

export function statusPollDelay(failures: number, random = Math.random): number {
  if (failures <= 0) return HEALTHY_POLL_MS;
  const base = Math.min(DEGRADED_POLL_MS * 2 ** (failures - 1), MAX_DEGRADED_POLL_MS);
  return Math.min(Math.round(base * (0.8 + random() * 0.4)), MAX_DEGRADED_POLL_MS);
}

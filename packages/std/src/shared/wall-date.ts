/**
 * Wall-clock vs UTC-instant helpers for a named IANA time zone (pure,
 * unit-tested). Extracted from calendar-availability so scheduling code
 * outside the calendar integration (voice schedule, assessment timeline)
 * can share the exact same DST-correct arithmetic.
 */

/** Offset (ms) of a time zone at an instant: local wall time minus UTC. */
function tzOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - at;
}

/** The UTC instant of a wall-clock time in a time zone. */
export function zonedTime(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): number {
  const guess = Date.UTC(y, m, d, h, min);
  const first = guess - tzOffset(guess, timeZone);
  return guess - tzOffset(first, timeZone);
}

export function wallDate(at: number, timeZone: string) {
  const local = new Date(at + tzOffset(at, timeZone));
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    wd: local.getUTCDay(),
  };
}

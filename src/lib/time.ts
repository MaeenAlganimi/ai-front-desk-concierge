// Timezone helpers: all instants are stored as TIMESTAMPTZ (UTC); opening hours,
// availability and display use the business's IANA timezone.
export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a timezone. */
export function zonedParts(instant: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    time: `${parts.hour}:${parts.minute}`,
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    offsetMinutes:
      (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) -
        Math.floor(instant.getTime() / 1000) * 1000) /
      60000,
  };
}

/** Convert a wall-clock date + "HH:MM" in tz into a UTC instant. */
export function zonedToUtc(date: string, time: string, tz: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  let instant = new Date(+guess - zonedParts(guess, tz).offsetMinutes * 60000);
  // second pass handles DST transitions
  instant = new Date(+guess - zonedParts(instant, tz).offsetMinutes * 60000);
  return instant;
}

/** ISO 8601 with the zone's offset, e.g. 2026-10-25T09:00:00+02:00 */
export function toZonedIso(instant: Date, tz: string) {
  const p = zonedParts(instant, tz);
  const off = p.offsetMinutes;
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${p.date}T${p.time}:00${sign}${hh}:${mm}`;
}

export const todayIn = (tz: string, now = new Date()) => zonedParts(now, tz).date;

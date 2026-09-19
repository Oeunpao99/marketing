// The portal runs on Phnom Penh time (Asia/Phnom_Penh, UTC+7, no DST) for every
// user, whatever timezone their own device is in. Scheduling inputs are read as
// Phnom Penh wall-clock time and all times are displayed the same way.

export const TZ = "Asia/Phnom_Penh";
export const TZ_LABEL = "Phnom Penh (UTC+7)";

const clockFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD

/** "2026-09-04" + "04:48"  ->  UTC ISO string for that Phnom Penh wall time. */
export function phnomPenhToISO(date, time) {
  // Phnom Penh has no DST, so a fixed +07:00 offset is exact.
  const d = new Date(`${date}T${time || "12:00"}:00+07:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Any date/ISO -> "HH:MM" on a Phnom Penh clock. */
export function phnomPenhClock(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16) || "--:--";
  return clockFmt.format(d);
}

/** Today's date in Phnom Penh as YYYY-MM-DD (offsetDays shifts by whole days). */
export function phnomPenhDate(offsetDays = 0) {
  return dateFmt.format(new Date(Date.now() + offsetDays * 86400000));
}

/** Any date/ISO -> "YYYY-MM-DD" on a Phnom Penh clock, or "" when unknown. */
export function phnomPenhDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}

/** "2026-09-04" -> { weekday: "Thursday", rest: "4 September" }. */
export function fullDayLabel(dateStr) {
  if (!dateStr) return { weekday: "", rest: "" };
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return { weekday: "", rest: dateStr };
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const rest = d.toLocaleDateString("en-US", { day: "numeric", month: "long", timeZone: "UTC" });
  return { weekday, rest };
}

/** "2026-09-04" -> "Thu 4 Sep" (Phnom Penh weekday + short label). */
export function dayLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const wd = d
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
  const md = d
    .toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
    .replace(".", "");
  return `${wd} ${md}`;
}

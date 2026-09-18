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

import { dayjs, validDate, zonedDate } from "./validation.js";

export function occurrenceForYear(schedule, year) {
  if (!schedule.recurringYearly) return { start: new Date(schedule.startAt), end: new Date(schedule.endAt) };
  const sourceYear = Number(schedule.startDate.slice(0, 4));
  if (year < sourceYear) return null;
  const delta = Number(schedule.endDate.slice(0, 4)) - sourceYear;
  const startDate = `${year}${schedule.startDate.slice(4)}`;
  const endDate = `${year + delta}${schedule.endDate.slice(4)}`;
  if (!validDate(startDate) || !validDate(endDate)) return null; // Leap-day recurrences skip non-leap years.
  const start = zonedDate(startDate, schedule.startTime, schedule.timezone);
  const end = zonedDate(endDate, schedule.endTime, schedule.timezone);
  return start && end && end > start ? { start, end } : null;
}
export function scheduleWindows(schedule, now = new Date()) {
  if (!schedule.recurringYearly) return [occurrenceForYear(schedule, now.getUTCFullYear())];
  const year = Number(dayjs(now).tz(schedule.timezone).format("YYYY"));
  const firstYear = Math.max(year - 1, Number(schedule.startDate.slice(0, 4)));
  // Eight years include the next leap-day occurrence and Gregorian century gaps.
  return Array.from({ length: 10 }, (_, index) => occurrenceForYear(schedule, firstYear + index)).filter(Boolean);
}
export function currentOccurrence(schedule, now = new Date()) {
  if (!schedule.recurringYearly) { const window = occurrenceForYear(schedule, 0); return window.start <= now && now < window.end ? window : undefined; }
  const year = Number(dayjs(now).tz(schedule.timezone).format("YYYY"));
  return [occurrenceForYear(schedule, year - 1), occurrenceForYear(schedule, year)].filter(Boolean).find((window) => window.start <= now && now < window.end);
}
export function nextOccurrence(schedule, now = new Date()) {
  return scheduleWindows(schedule, now).find((window) => window.start > now);
}
export const occurrenceKey = (schedule, window) => `${schedule._id}:${window.start.toISOString()}`;

export function schedulesConflict(first, second, now = new Date()) {
  if (!first.enabled || !second.enabled || first.priority !== second.priority) return false;
  const years = new Set([now.getUTCFullYear(), Number(first.startDate.slice(0, 4)), Number(second.startDate.slice(0, 4))]);
  const windows = (schedule) => !schedule.recurringYearly ? [occurrenceForYear(schedule, 0)] : [...years].flatMap((year) => Array.from({ length: 10 }, (_, i) => occurrenceForYear(schedule, year - 1 + i))).filter(Boolean);
  return windows(first).some((a) => windows(second).some((b) => a.start < b.end && b.start < a.end));
}

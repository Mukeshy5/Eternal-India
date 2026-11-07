import { attendanceStatuses, indiaDate, legacyAttendanceStatuses } from "../../shared/staff.js";

export const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01" && value <= "2100-12-31" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
export function validateStaff(body, existing) {
  const errors = {};
  const fields = {};
  for (const [key, min, max] of [["name", 2, 100], ["department", 2, 80], ["designation", 2, 80]]) {
    fields[key] = clean(body?.[key] ?? existing?.[key]);
    if (fields[key].length < min || fields[key].length > max || /[\x00-\x1f<>]/.test(fields[key])) errors[key] = `Use ${min}–${max} characters.`;
  }
  const email = body?.email ?? existing?.email;
  fields.email = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (fields.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = "Enter a valid email address.";
  const phone = body?.phone ?? existing?.phone;
  fields.phone = typeof phone === "string" ? phone.replace(/[\s().-]/g, "") : "";
  // Normalize Indian local and country-prefixed numbers to the same unique key.
  if (/^[6-9]\d{9}$/.test(fields.phone)) fields.phone = `+91${fields.phone}`;
  else if (/^91[6-9]\d{9}$/.test(fields.phone)) fields.phone = `+${fields.phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(fields.phone)) errors.phone = "Enter a phone number with country code, or a 10-digit Indian mobile number.";
  fields.status = body?.status ?? existing?.status ?? "active";
  if (!["active", "inactive"].includes(fields.status)) errors.status = "Choose Active or Inactive.";
  if (existing && Number(body?.version) !== existing.version) errors.version = "This staff record changed. Refresh before editing.";
  return { fields, errors };
}

export function validateAttendance(body) {
  const errors = {};
  const { date, status } = body || {};
  if (!validDate(date) || date > indiaDate()) errors.date = "Choose a valid date up to today (Asia/Kolkata).";
  if (!Object.hasOwn({ ...attendanceStatuses, ...legacyAttendanceStatuses }, status || "")) errors.status = "Choose an attendance status.";
  const checkIn = body?.checkIn ?? "";
  const checkOut = body?.checkOut ?? "";
  const leaveType = clean(body?.leaveType);
  const remarks = clean(body?.remarks);
  if (leaveType.length > 80) errors.leaveType = "Use up to 80 characters.";
  if (remarks.length > 300) errors.remarks = "Use up to 300 characters.";
  for (const [key, value] of [["checkIn", checkIn], ["checkOut", checkOut]]) if (typeof value !== "string" || (value !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) errors[key] = "Use a valid 24-hour time.";
  if (["absent", "leave"].includes(status) && (checkIn || checkOut)) errors.checkIn = "Absent and Leave cannot include working times.";
  if (status !== "leave" && leaveType) errors.leaveType = "Leave type is only used with Leave status.";
  if (checkOut && !checkIn) errors.checkIn = "Enter check-in before check-out.";
  if (checkIn && checkOut && checkOut <= checkIn) errors.checkOut = "Check-out must be later than check-in on the same day.";
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const workingMinutes = !Object.keys(errors).length && checkIn && checkOut ? minutes(checkOut) - minutes(checkIn) : 0;
  return { fields: { date, status, checkIn, checkOut, workingMinutes, leaveType: status === "leave" ? leaveType : "", remarks }, errors };
}

export function reportRange(query) {
  let from = query.from, to = query.to;
  const date = query.date ?? indiaDate();
  if (query.month !== undefined) {
    if (typeof query.month !== "string" || !/^\d{4}-\d{2}$/.test(query.month) || !validDate(`${query.month}-01`)) return null;
    from = `${query.month}-01`;
    to = new Date(Date.UTC(Number(query.month.slice(0, 4)), Number(query.month.slice(5)), 0)).toISOString().slice(0, 10);
  } else if (!from && !to) {
    if (!validDate(date) || (query.period && !["daily", "weekly", "monthly"].includes(query.period))) return null;
    from = to = date;
    if (query.period === "weekly") {
      const start = new Date(`${date}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
      from = start.toISOString().slice(0, 10);
      start.setUTCDate(start.getUTCDate() + 6); to = start.toISOString().slice(0, 10);
    } else if (query.period === "monthly") return reportRange({ month: date.slice(0, 7) });
  }
  if (!validDate(from) || !validDate(to) || to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 365) return null;
  return { from, to };
}

export function summary(groups) {
  const result = { present: 0, absent: 0, half_day: 0, leave: 0, totalWorkingMinutes: 0 };
  for (const group of groups) if (["present", "absent", "half_day", "leave"].includes(group._id)) { result[group._id] = group.count; result.totalWorkingMinutes += group.minutes || 0; }
  result.totalWorkingDays = result.present + result.absent + result.half_day;
  result.totalRecordedDays = result.totalWorkingDays + result.leave;
  result.attendancePercentage = result.totalWorkingDays ? Math.round((result.present + result.half_day * 0.5) / result.totalWorkingDays * 10000) / 100 : 0;
  result.totalWorkingHours = Math.round(result.totalWorkingMinutes / 60 * 100) / 100;
  return result;
}

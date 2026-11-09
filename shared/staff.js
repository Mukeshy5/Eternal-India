export const staffPermissions = {
  view: "View staff and attendance", create: "Add staff", edit: "Edit staff",
  delete: "Delete staff", attendance: "Modify attendance", export: "Download cards and reports",
};
export const attendanceStatuses = { present: "Present", absent: "Absent", leave: "Leave", half_day: "Half Day", weekly_off: "Weekly Off" };
export const legacyAttendanceStatuses = {};
export const attendancePolicy = "Attendance = (Present + 0.5 × Half Day) / marked working days × 100. Leave, Weekly Off and unmarked dates are excluded. Sunday/holiday shading is calendar information and never creates an attendance record. Times use Asia/Kolkata.";
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

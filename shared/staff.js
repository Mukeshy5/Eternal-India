export const staffPermissions = {
  view: "View staff and attendance", create: "Add staff", edit: "Edit staff",
  delete: "Delete staff", attendance: "Modify attendance", export: "Download cards and reports",
};
export const attendanceStatuses = { present: "Present", absent: "Absent", half_day: "Half Day", leave: "Leave" };
export const attendancePolicy = "Working days are marked Present, Absent or Half Day dates. Attendance = (Present + 0.5 × Half Day) / Working days. Leave and unmarked dates are excluded. Times use Asia/Kolkata; check-out must be later on the same day.";
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

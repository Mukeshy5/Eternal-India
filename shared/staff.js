export const staffPermissions = {
  view: "View staff and attendance", create: "Add staff", edit: "Edit staff",
  delete: "Delete staff", attendance: "Modify attendance", export: "Download cards and reports",
};
export const attendanceStatuses = { present: "Present", absent: "Absent", leave: "Leave", half_day: "Half Day" };
export const legacyAttendanceStatuses = {};
export const attendancePolicy = "Attendance is marked Present, Absent, Leave or Half Day for each staff member. Leave and unmarked dates are excluded from attendance percentage.";
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

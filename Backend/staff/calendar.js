import { reportRange, summary, validDate } from "./validation.js";
import { indiaDate } from "../../shared/staff.js";
import { staffAccess } from "./permissions.js";

export function calendarDates(from, to) {
  const result = [];
  for (let time = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); time <= end; time += 86400000) {
    const value = new Date(time); result.push({ date: value.toISOString().slice(0, 10), weekday: value.getUTCDay(), isSunday: value.getUTCDay() === 0 });
  }
  return result;
}
export function calendarRange(query) {
  const view = query.view ?? "monthly", date = query.date ?? indiaDate();
  if (!["daily", "weekly", "monthly"].includes(view) || !validDate(date)) return null;
  const range = view === "monthly" ? reportRange({ month: query.month ?? date.slice(0, 7) }) : reportRange({ period: view, date });
  return range && { ...range, view, dates: calendarDates(range.from, range.to) };
}

export function registerStaffCalendar({ router, db, guard, searchFilter, config, events }) {
  router.get("/staff-calendar", ...guard(), async (req, res) => {
    const range = calendarRange(req.query);
    if (!range) return res.status(400).json({ message: "Choose a valid calendar month, date and view." });
    if (req.query.department !== undefined && (typeof req.query.department !== "string" || req.query.department.length > 80)) return res.status(400).json({ message: "Choose a valid department." });
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1)), limit = 50;
    const filter = { status: "active", deletedAt: null, ...searchFilter(req.query.search), ...(req.query.department ? { department: req.query.department } : {}) };
    const staff = db.collection("staff"), attendance = db.collection("staff_attendance");
    const [people, total, departments, revision, settings] = await Promise.all([
      staff.find(filter, { projection: { photo: 0, createdBy: 0, updatedBy: 0 } }).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
      staff.countDocuments(filter), staff.distinct("department", { status: "active", deletedAt: null }), db.collection("staff_runtime").findOne({ _id: "revision" }), db.collection("staff_settings").findOne({ _id: "attendance" }),
    ]);
    const records = people.length ? await attendance.find({ staffId: { $in: people.map((person) => person._id) }, date: { $gte: range.from, $lte: range.to } }, { projection: { createdBy: 0, updatedBy: 0 } }).toArray() : [];
    const byStaff = new Map(), groups = new Map(), weeklyHolidays = settings?.weeklyHolidays || [0];
    for (const record of records) {
      const key = record.staffId.toString(); if (!byStaff.has(key)) byStaff.set(key, {}); byStaff.get(key)[record.date] = record;
      const group = groups.get(record.status) || { _id: record.status, count: 0, minutes: 0 }; group.count++; group.minutes += record.workingMinutes; groups.set(record.status, group);
    }
    res.json({ ...range, dates: range.dates.map((day) => ({ ...day, isWeeklyOff: weeklyHolidays.includes(day.weekday) })), staff: people.map((person) => ({ ...person, attendance: byStaff.get(person._id.toString()) || {} })), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit, departments: departments.sort((a, b) => a.localeCompare(b)), revision: revision?.value || 0, summary: summary([...groups.values()]), today: indiaDate(), weeklyHolidays, sundayCount: range.dates.filter((day) => day.isSunday).length });
  });
  router.get("/staff-events", ...guard(), async (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" }); res.flushHeaders();
    let last = -1, running = false, closed = false;
    const send = (value) => {
      if (closed || value <= last) return;
      last = value; res.write(`event: change\ndata: ${JSON.stringify({ revision: value })}\n\n`); res.flush?.();
    };
    async function check() {
      if (running || closed) return; running = true;
      try {
        const [revision, account] = await Promise.all([db.collection("staff_runtime").findOne({ _id: "revision" }), db.collection("admins").findOne({ _id: req.admin._id })]);
        if (!account || !staffAccess(account, config).includes("view") || (account.passwordChangedAt && new Date(req.session.signedInAt) <= account.passwordChangedAt)) { res.end(); return; }
        const value = revision?.value || 0;
        if (value > last) send(value);
        else res.write(": heartbeat\n\n");
        res.flush?.();
      } catch { res.end(); } finally { running = false; }
    }
    const timer = setInterval(check, 3000), expiry = setTimeout(() => res.end(), 120000); timer.unref(); expiry.unref();
    events?.on("change", send);
    req.on("close", () => { closed = true; clearInterval(timer); clearTimeout(expiry); events?.off("change", send); }); void check();
  });
}

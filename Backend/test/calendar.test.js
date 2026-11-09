import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { ObjectId } from "mongodb";
import sharp from "sharp";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { createApp } from "../app.js";
import { calendarRange } from "../staff/calendar.js";

test("calendar date ranges include leap years and week boundaries", () => {
  assert.equal(calendarRange({ view: "monthly", month: "2024-02", date: "2024-02-20" }).dates.length, 29);
  const week = calendarRange({ view: "weekly", date: "2026-11-01" }); assert.equal(week.from, "2026-10-26"); assert.equal(week.to, "2026-11-01"); assert.equal(week.dates.length, 7);
  assert.equal(calendarRange({ view: "daily", date: "2026-01-01" }).dates.length, 1);
  assert.equal(calendarRange({ month: "2026-99" }), null); assert.equal(calendarRange({ view: "invalid" }), null);
});

test("calendar, weekly offs, live events, permissions and 500+ staff against MongoDB", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "calendar-owner@example.com", technicalEmail: "", adminPassword: "CalendarIntegrationTest9" };
  const { client, db } = await connectDatabase(config); const owner = await ensureAdmin(db, config);
  const viewer = await ensureAdmin(db, { ...config, adminEmail: "calendar-viewer@example.com" }); await db.collection("admins").updateOne({ _id: viewer._id }, { $set: { roles: ["technical"], staffPermissions: ["view"] } });
  const denied = await ensureAdmin(db, { ...config, adminEmail: "calendar-observer@example.com" }); await db.collection("admins").updateOne({ _id: denied._id }, { $set: { roles: ["observer"] } });
  const photo = await sharp({ create: { width: 8, height: 10, channels: 3, background: "#bbc4d4" } }).png().toBuffer();
  const now = new Date(), people = Array.from({ length: 502 }, (_, i) => ({ _id: new ObjectId(), employeeId: `EI-${i.toString(16).toUpperCase().padStart(12, "0")}`, name: `Calendar Staff ${String(i).padStart(4, "0")}`, phone: `+91${7000000000 + i}`, email: `calendar-${i}@example.com`, department: i % 2 ? "Technical" : "Operations", designation: "Team member", status: "active", photo, photoMime: "image/png", version: 1, deletedAt: null, createdAt: now, updatedAt: now }));
  await db.collection("staff").insertMany(people);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "", viewerCookie = "";
  const request = (path, { method = "GET", body, sessionCookie = cookie, signal } = {}) => fetch(base + path, { method, signal, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const login = async (email, panel = "admin") => { const result = await request(`/${panel}/login`, { method: "POST", body: { email, password: config.adminPassword }, sessionCookie: "" }); assert.equal(result.status, 200); return result.headers.get("set-cookie").split(";")[0]; };
  const mark = (date, status, times = {}) => request("/admin/staff-attendance", { method: "POST", body: { staffId: people[0]._id.toString(), date, status, ...times } });
  try {
    await t.test("protects calendars, writes and management roles", async () => {
      assert.equal((await request("/admin/staff-calendar?month=2026-01")).status, 401); assert.equal((await request("/technical/staff-events")).status, 401);
      cookie = await login(owner.email); viewerCookie = await login(viewer.email, "technical");
      assert.equal((await request("/technical/staff-calendar?month=2026-01", { sessionCookie: viewerCookie })).status, 200);
      assert.equal((await request("/technical/staff-calendar-settings", { method: "PATCH", body: { weeklyHolidays: [0] }, sessionCookie: viewerCookie })).status, 403);
      assert.equal((await request("/admin/login", { method: "POST", body: { email: denied.email, password: config.adminPassword }, sessionCookie: "" })).status, 403);
    });
    await t.test("paginates 502 real staff, filters departments and never fabricates attendance", async () => {
      const first = await (await request("/admin/staff-calendar?month=2026-01")).json();
      assert.equal(first.staff.length, 50); assert.equal(first.total, 502); assert.equal(first.pages, 11); assert.equal(first.dates.length, 31); assert.equal(first.sundayCount, 4);
      assert.equal(first.staff[0].photo, undefined); assert.deepEqual(first.staff[0].attendance, {}); assert.equal(await db.collection("staff_attendance").countDocuments(), 0);
      assert.deepEqual(first.departments, ["Operations", "Technical"]);
      const filtered = await (await request("/technical/staff-calendar?month=2026-01&department=Operations&page=2")).json(); assert.equal(filtered.total, 251); assert.equal(filtered.staff.length, 50); assert.ok(filtered.staff.every((person) => person.department === "Operations"));
      assert.equal((await (await request(`/admin/staff-calendar?month=2026-01&search=${people[501].employeeId}`)).json()).total, 1);
      assert.equal((await (await request("/admin/staff-calendar?month=2026-01&search=Calendar.*")).json()).total, 0);
      for (const query of ["month=2026-99", "date=2026-02-30&view=daily", "view=invalid", "department=Operations&department=Technical"]) assert.equal((await request(`/admin/staff-calendar?${query}`)).status, 400);
    });
    await t.test("saves Weekly Off separately and calculates summary without unmarked dates", async () => {
      assert.equal((await mark("2026-01-04", "weekly_off")).status, 201);
      assert.equal((await mark("2026-01-05", "present", { checkIn: "09:00", checkOut: "17:00" })).status, 201);
      assert.equal((await mark("2026-01-06", "absent")).status, 201); assert.equal((await mark("2026-01-07", "leave")).status, 201);
      assert.equal((await mark("2026-01-11", "weekly_off", { checkIn: "09:00" })).status, 400);
      const calendar = await (await request("/technical/staff-calendar?month=2026-01")).json(); assert.equal(calendar.staff[0].attendance["2026-01-04"].status, "weekly_off"); assert.equal(Object.keys(calendar.staff[0].attendance).length, 4);
      const profile = await (await request(`/admin/staff/${people[0]._id}/attendance?month=2026-01`)).json(); assert.equal(profile.summary.weekly_off, 1); assert.equal(profile.summary.totalSundays, 4); assert.equal(profile.summary.attendancePercentage, 50); assert.equal(profile.summary.totalWorkingDays, 2);
      assert.equal((await request("/admin/staff-calendar-settings", { method: "PATCH", body: { weeklyHolidays: [9] } })).status, 400);
      assert.equal((await request("/admin/staff-calendar-settings", { method: "PATCH", body: { weeklyHolidays: [0, 6] } })).status, 200);
      const updated = await (await request("/technical/staff-calendar?month=2026-01")).json(); assert.equal(updated.dates.find((day) => day.date === "2026-01-03").isWeeklyOff, true); assert.equal(await db.collection("staff_attendance").countDocuments(), 4);
    });
    await t.test("bulk saves preserve unchanged working times and reject stale edits", async () => {
      const entry = { staffId: people[0]._id.toString(), status: "present", version: 1 };
      assert.equal((await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-01-05", attendance: [entry] } })).status, 200);
      let saved = await db.collection("staff_attendance").findOne({ staffId: people[0]._id, date: "2026-01-05" }); assert.equal(saved.workingMinutes, 480); assert.equal(saved.version, 1);
      assert.equal((await request("/technical/staff-attendance/bulk", { method: "POST", body: { date: "2026-01-05", attendance: [{ ...entry, status: "absent" }] } })).status, 200);
      saved = await db.collection("staff_attendance").findOne({ _id: saved._id }); assert.equal(saved.version, 2); assert.equal(saved.workingMinutes, 0);
      assert.equal((await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-01-05", attendance: [entry] } })).status, 409);
      const attendance = people.slice(0, 500).map((person) => ({ staffId: person._id.toString(), status: "weekly_off", version: 0 }));
      assert.ok(Buffer.byteLength(JSON.stringify({ date: "2026-02-01", attendance })) > 16384);
      assert.equal((await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-02-01", attendance } })).status, 200);
      const day = await (await request("/technical/staff-attendance?date=2026-02-01")).json(); assert.equal(day.staff.length, 50); assert.equal(day.stats.weekly_off, 500); assert.equal(day.pages, 11);
    });
    await t.test("pushes a MongoDB revision to the other panel after attendance changes", async () => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
      let reader;
      try {
        const stream = await request("/technical/staff-events", { signal: controller.signal }); assert.equal(stream.status, 200); reader = stream.body.getReader();
        let text = ""; const decoder = new TextDecoder();
        while (!text.includes("data:")) text += decoder.decode((await reader.read()).value);
        const before = JSON.parse(text.match(/data: (\{[^\n]+\})/)[1]).revision;
        assert.equal((await mark("2026-01-08", "half_day", { checkIn: "09:00", checkOut: "13:00" })).status, 201);
        let changed = false;
        while (!changed) { text += decoder.decode((await reader.read()).value); changed = [...text.matchAll(/data: (\{[^\n]+\})/g)].some((match) => JSON.parse(match[1]).revision > before); }
        assert.equal(changed, true);
        const afterMark = Math.max(...[...text.matchAll(/data: (\{[^\n]+\})/g)].map((match) => JSON.parse(match[1]).revision));
        const deletion = await request("/admin/staff-attendance/range", { method: "DELETE", body: { from: "2026-01-08", to: "2026-01-08", scope: "staff", staffId: people[0]._id.toString() } });
        const deleted = await deletion.json(); assert.equal(deletion.status, 200); assert.equal(deleted.deletedCount, 1);
        let deletionPushed = false;
        while (!deletionPushed) { text += decoder.decode((await reader.read()).value); deletionPushed = [...text.matchAll(/data: (\{[^\n]+\})/g)].some((match) => JSON.parse(match[1]).revision > afterMark); }
        assert.equal(deletionPushed, true); assert.ok(deleted.revision > afterMark);
        assert.equal(await db.collection("staff_attendance").countDocuments({ staffId: people[0]._id, date: "2026-01-08" }), 0);
      } finally { clearTimeout(timeout); controller.abort(); await reader?.cancel().catch(() => {}); }
    });
    await t.test("weekly and monthly deletion respect staff, filters, date boundaries and every page", async () => {
      const dates = ["2026-03-01", "2026-03-02", "2026-03-08", "2026-03-09", "2026-04-01"];
      const record = (staffId, date) => ({ staffId, date, status: "absent", checkIn: "", checkOut: "", workingMinutes: 0, version: 1, createdAt: now, updatedAt: now });
      await db.collection("staff_attendance").insertMany([...dates.map((date) => record(people[0]._id, date)), record(people[1]._id, "2026-03-02"), record(people[2]._id, "2026-03-02")]);
      const week = { from: "2026-03-02", to: "2026-03-08", scope: "staff", staffId: people[0]._id.toString() };
      assert.equal((await request("/admin/staff-attendance/range", { method: "DELETE", body: week, sessionCookie: "" })).status, 401);
      assert.equal((await request("/technical/staff-attendance/range", { method: "DELETE", body: week, sessionCookie: viewerCookie })).status, 403);
      for (const body of [{}, { ...week, from: "bad" }, { ...week, to: "2026-03-01" }, { ...week, to: "2028-01-01" }, { ...week, staffId: { $ne: null } }, { ...week, search: { $ne: null } }, { from: week.from, to: week.to, scope: "filtered" }, { from: week.from, to: week.to, scope: "all", search: "Calendar" }]) assert.equal((await request("/admin/staff-attendance/range", { method: "DELETE", body })).status, 400);
      const deletion = await request("/technical/staff-attendance/range", { method: "DELETE", body: week }); assert.equal(deletion.status, 200); assert.equal((await deletion.json()).deletedCount, 2);
      assert.equal(await db.collection("staff_attendance").countDocuments({ staffId: people[0]._id, date: { $in: ["2026-03-01", "2026-03-09", "2026-04-01"] } }), 3);
      assert.equal(await db.collection("staff_attendance").countDocuments({ staffId: people[1]._id, date: "2026-03-02" }), 1);
      assert.equal((await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-03-02", attendance: [{ staffId: people[0]._id.toString(), status: "present", version: 1 }] } })).status, 409, "a stale panel cannot recreate deleted attendance");
      const fresh = await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-03-02", attendance: [{ staffId: people[0]._id.toString(), status: "present", version: 0 }] } });
      assert.equal(fresh.status, 200); assert.equal((await fresh.json()).attendance[0].status, "present");
      const month = await request("/admin/staff-attendance/range", { method: "DELETE", body: { from: "2026-03-01", to: "2026-03-31", scope: "filtered", department: "Operations", activeOnly: true } });
      assert.equal(month.status, 200); assert.equal((await month.json()).deletedCount, 4);
      const report = await (await request("/technical/staff-reports?month=2026-03")).json(); assert.equal(report.total, 1); assert.equal(report.records[0].staffId, people[1]._id.toString());
      const entireMonth = await request("/technical/staff-attendance/range", { method: "DELETE", body: { from: "2026-02-01", to: "2026-02-28", scope: "all" } });
      assert.equal(entireMonth.status, 200); assert.equal((await entireMonth.json()).deletedCount, 500, "bulk deletion includes records beyond the first page");
      assert.equal(await db.collection("staff_attendance").countDocuments({ date: "2026-04-01" }), 1, "other months are preserved");
      const calendar = await (await request("/admin/staff-calendar?month=2026-02")).json(); assert.equal(calendar.summary.totalRecordedDays, 0);
    });
  } finally { await backend.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve)); await db.dropDatabase(); await client.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import sharp from "sharp";
import * as ZXing from "@zxing/library";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { createApp } from "../app.js";
import { reportRange, validDate } from "../staff/validation.js";
import { cookieHeader } from "../lib/cookies.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64");
const fields = { name: "Staff Integration Test", email: "staff@example.com", phone: "9876543210", department: "Operations", designation: "Travel coordinator", status: "active" };

test("staff report calendar boundaries and invalid dates", () => {
  assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2026-99-99"), false);
  assert.deepEqual(reportRange({ period: "weekly", date: "2026-11-01" }), { from: "2026-10-26", to: "2026-11-01" });
  assert.deepEqual(reportRange({ month: "2024-02" }), { from: "2024-02-01", to: "2024-02-29" });
  assert.equal(reportRange({ from: "2026-01-01", to: "2025-01-01" }), null);
});

test("staff and attendance real MongoDB/API workflow", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "staff-owner@example.com", technicalEmail: "", adminPassword: "StaffIntegrationTest9" };
  const { client, db } = await connectDatabase(config);
  await ensureAdmin(db, config);
  const viewer = await ensureAdmin(db, { ...config, adminEmail: "staff-viewer@example.com" });
  const ordinary = await ensureAdmin(db, { ...config, adminEmail: "ordinary@example.com" });
  await db.collection("admins").updateOne({ _id: viewer._id }, { $set: { roles: ["technical"], staffPermissions: ["view"] } });
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } });
  await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "", viewerCookie, ordinaryCookie, person, record;
  const request = (path, { method = "GET", body, form, sessionCookie = cookie } = {}) => fetch(base + path, { method, headers: { Origin: "http://localhost:5173", ...(form ? {} : { "Content-Type": "application/json" }), ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const login = async (email, panel = "admin") => { const result = await request(`/${panel}/login`, { method: "POST", body: { email, password: config.adminPassword }, sessionCookie: "" }); assert.equal(result.status, 200); return cookieHeader(result); };
  const form = (patch = {}) => { const body = new FormData(); for (const [key, value] of Object.entries({ ...fields, ...patch })) body.append(key, String(value)); body.append("photo", new Blob([png], { type: "image/png" }), "photo.png"); return body; };
  try {
    await t.test("authentication, role and permission enforcement in both namespaces", async () => {
      for (const panel of ["admin", "technical"]) for (const path of ["staff", "staff-attendance", "staff-reports"]) assert.equal((await request(`/${panel}/${path}`)).status, 401);
      cookie = await login(config.adminEmail);
      viewerCookie = await login(viewer.email, "technical"); ordinaryCookie = await login(ordinary.email);
      assert.equal((await request("/technical/staff", { sessionCookie: ordinaryCookie })).status, 403);
      for (const panel of ["admin", "technical"]) {
        assert.equal((await request(`/${panel}/staff`, { sessionCookie: viewerCookie })).status, 200);
        assert.equal((await request(`/${panel}/staff`, { method: "POST", form: form(), sessionCookie: viewerCookie })).status, 403);
        assert.equal((await request(`/${panel}/staff-attendance`, { method: "POST", body: {}, sessionCookie: viewerCookie })).status, 403);
        assert.equal((await request(`/${panel}/staff-reports?format=xlsx`, { sessionCookie: viewerCookie })).status, 403);
      }
    });
    await t.test("staff CRUD, live-photo upload, normalization, duplicate protection and shared lists", async () => {
      assert.equal((await request("/admin/staff", { method: "POST", body: fields })).status, 400, "photo is required");
      const bad = form({ name: " " }); assert.equal((await request("/admin/staff", { method: "POST", form: bad })).status, 400);
      const result = await request("/admin/staff", { method: "POST", form: form() }); assert.equal(result.status, 201, await result.clone().text()); person = (await result.json()).staff;
      assert.match(person.employeeId, /^EI-[A-F0-9]{12}$/); assert.equal(person.photo, undefined); assert.equal(person.phone, "+919876543210");
      const saved = await db.collection("staff").findOne({ email: fields.email }); assert.ok(saved.photo); assert.equal(saved.photoMime, "image/png");
      assert.equal((await request(`/technical/staff/${person._id}/photo`)).headers.get("content-type"), "image/png");
      assert.equal((await request("/admin/staff", { method: "POST", form: form({ phone: "9123456780" }) })).status, 409);
      assert.equal((await request("/technical/staff", { method: "POST", form: form({ email: "other@example.com", phone: "+91 9876543210" }) })).status, 409);
      assert.equal(await db.collection("staff").countDocuments(), 1);
      for (const panel of ["admin", "technical"]) { const list = await (await request(`/${panel}/staff?search=${person.employeeId}`)).json(); assert.equal(list.staff[0]._id, person._id); }
      const updated = await request(`/technical/staff/${person._id}`, { method: "PATCH", body: { name: "Updated Staff", version: person.version } }); assert.equal(updated.status, 200); person = (await updated.json()).staff;
      assert.equal(person.employeeId, saved.employeeId);
      assert.equal((await request(`/admin/staff/${person._id}`, { method: "PATCH", body: { name: "Stale", version: 1 } })).status, 409);
      assert.equal((await (await request("/admin/staff?search=Updated.*")).json()).total, 0);
    });
    await t.test("true-size card PDF download and protected access", async () => {
      const result = await request(`/admin/staff/${person._id}/card`); assert.equal(result.status, 200);
      const pdf = Buffer.from(await result.arrayBuffer()).toString("latin1"); assert.match(pdf, /^%PDF-/);
      const mediaBox = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(mediaBox);
      assert.ok(Math.abs(Number(mediaBox[1]) * 25.4 / 72 - 53.98) < 0.001); assert.ok(Math.abs(Number(mediaBox[2]) * 25.4 / 72 - 85.60) < 0.001);
      assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 1);
      assert.equal((await request(`/technical/staff/${person._id}/card`, { sessionCookie: viewerCookie })).status, 403);
      assert.equal((await request(`/admin/staff/${person._id}/photo`, { sessionCookie: "" })).status, 401);
      for (const panel of ["admin", "technical"]) for (const method of ["PATCH", "DELETE"]) assert.equal((await request(`/${panel}/staff/${person._id}`, { method, body: { version: person.version }, sessionCookie: viewerCookie })).status, 403);
    });
    await t.test("premium card preview, high-resolution PNG and a decodable employee barcode use current MongoDB details", async () => {
      const preview = await request(`/admin/staff/${person._id}/card-preview`, { sessionCookie: viewerCookie });
      assert.equal(preview.status, 200); assert.match(preview.headers.get("content-type"), /image\/svg\+xml/);
      const svg = await preview.text();
      for (const value of [person.name, person.employeeId, person.designation, person.department, person.phone, person.email]) assert.ok(svg.includes(value));
      const updated = await request(`/technical/staff/${person._id}`, { method: "PATCH", body: { version: person.version, designation: "Senior journey coordinator" } }); assert.equal(updated.status, 200); person = (await updated.json()).staff;
      const refreshed = await (await request(`/admin/staff/${person._id}/card-preview`)).text(); assert.ok(refreshed.includes(person.designation)); assert.notEqual(refreshed, svg);
      assert.ok(svg.includes('clip-path="url(#employee-photo)"')); assert.ok(svg.includes("data:image/png;base64,"));
      const result = await request(`/technical/staff/${person._id}/card?format=png`); assert.equal(result.status, 200); assert.match(result.headers.get("content-disposition"), /\.png/);
      const png = Buffer.from(await result.arrayBuffer()), metadata = await sharp(png).metadata();
      assert.equal(metadata.width, 1275); assert.equal(metadata.height, 2022); assert.equal(metadata.density, 600);
      const { data, info } = await sharp(png).extract({ left: 0, top: 1724, width: 1275, height: 201 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const grayscale = new Uint8ClampedArray(info.width * info.height);
      for (let pixel = 0; pixel < grayscale.length; pixel++) grayscale[pixel] = Math.round(data[pixel * 3] * 0.299 + data[pixel * 3 + 1] * 0.587 + data[pixel * 3 + 2] * 0.114);
      const { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, DecodeHintType, BarcodeFormat } = ZXing.default || ZXing;
      const reader = new MultiFormatReader(); reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]], [DecodeHintType.TRY_HARDER, true]]));
      assert.equal(reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(grayscale, info.width, info.height)))).getText(), person.employeeId);
      assert.equal((await request(`/admin/staff/${person._id}/card?format=png`, { sessionCookie: viewerCookie })).status, 403);
      assert.equal((await request(`/admin/staff/${person._id}/card-preview`, { sessionCookie: "" })).status, 401);
      assert.equal((await request(`/admin/staff/${person._id}/card?format=svg`)).status, 400);
    });
    await t.test("attendance validation, unique date under concurrent writes, check-out hours and edit conflicts", async () => {
      const body = { staffId: person._id, date: "2026-01-01", status: "present", checkIn: "09:00", checkOut: "17:30" };
      for (const patch of [{ status: "invalid" }, { date: "2026-02-30" }, { date: "2099-01-01" }, { checkOut: "08:00" }, { checkIn: "" }, { status: "leave" }, { checkIn: "25:00" }]) assert.equal((await request("/admin/staff-attendance", { method: "POST", body: { ...body, ...patch } })).status, 400, JSON.stringify(patch));
      const replies = await Promise.all([request("/admin/staff-attendance", { method: "POST", body }), request("/technical/staff-attendance", { method: "POST", body })]);
      assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]); record = (await replies.find((r) => r.status === 201).json()).attendance;
      assert.equal(record.workingMinutes, 510); assert.equal(await db.collection("staff_attendance").countDocuments(), 1);
      const changed = await request(`/technical/staff-attendance/${record._id}`, { method: "PATCH", body: { ...body, checkOut: "18:00", version: 1 } }); assert.equal(changed.status, 200); record = (await changed.json()).attendance;
      assert.equal(record.workingMinutes, 540);
      assert.equal((await request(`/admin/staff-attendance/${record._id}`, { method: "PATCH", body: { ...body, version: 1 } })).status, 409);
      for (const [index, status] of ["absent", "half_day", "leave"].entries()) assert.equal((await request("/technical/staff-attendance", { method: "POST", body: { staffId: person._id, date: `2026-01-0${index + 2}`, status, checkIn: status === "half_day" ? "09:00" : "", checkOut: status === "half_day" ? "13:00" : "" } })).status, 201);
      const bulk = await request("/admin/staff-attendance/bulk", { method: "POST", body: { date: "2026-04-01", attendance: [{ staffId: person._id, status: "present" }] } });
      assert.equal(bulk.status, 200);
      assert.equal((await db.collection("staff_attendance").findOne({ staffId: new ObjectId(person._id), date: "2026-04-01" })).checkIn, "");
    });
    await t.test("dashboard counts, individual daily/monthly totals, search and complete PDF/Excel exports", async () => {
      const day = await (await request("/admin/staff-attendance?date=2026-01-01")).json(); assert.equal(day.stats.present, 1); assert.equal(day.stats.unmarked, 0); assert.equal(day.staff[0].attendance._id, record._id);
      const profile = await (await request(`/technical/staff/${person._id}/attendance?month=2026-01`)).json();
      assert.equal(profile.summary.present, 1); assert.equal(profile.summary.absent, 1); assert.equal(profile.summary.half_day, 1); assert.equal(profile.summary.leave, 1); assert.equal(profile.summary.totalWorkingDays, 3); assert.equal(profile.summary.attendancePercentage, 50); assert.equal(profile.summary.totalWorkingHours, 13); assert.equal(profile.daily.length, 4); assert.equal(profile.monthly.length, 1);
      for (const period of ["daily", "weekly", "monthly"]) assert.equal((await request(`/admin/staff-reports?period=${period}&date=2026-01-01`)).status, 200);
      const exported = await request(`/admin/staff-reports?month=2026-01&format=xlsx&search=${person.employeeId}`); assert.equal(exported.status, 200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer())); assert.equal(workbook.getWorksheet("Attendance").rowCount, 5); assert.equal(workbook.getWorksheet("Attendance").getCell("H5").value, 9);
      const pdf = await request("/technical/staff-reports?month=2026-01&format=pdf"); assert.equal(pdf.status, 200); assert.match(Buffer.from(await pdf.arrayBuffer()).toString("latin1"), /^%PDF-/);
      assert.equal((await (await request("/admin/staff-reports?month=2026-01&search=missing")).json()).total, 0);
    });
    await t.test("pagination and exports cover all matching records, including Hindi staff details", async () => {
      person = (await (await request(`/admin/staff/${person._id}`, { method: "PATCH", body: { version: person.version, name: "आरव शर्मा", designation: "यात्रा समन्वयक" } })).json()).staff;
      const dates = Array.from({ length: 51 }, (_, index) => new Date(Date.UTC(2026, 1, index + 1)).toISOString().slice(0, 10));
      try {
        const replies = await Promise.all(dates.map((date) => request("/admin/staff-attendance", { method: "POST", body: { staffId: person._id, date, status: "present", checkIn: "09:00", checkOut: "17:00" } })));
        assert.ok(replies.every((reply) => reply.status === 201));
        const filter = `from=${dates[0]}&to=${dates.at(-1)}`;
        const first = await (await request(`/technical/staff/${person._id}/attendance?${filter}`)).json();
        assert.equal(first.total, 51); assert.equal(first.pages, 2); assert.equal(first.records.length, 50); assert.equal(first.summary.totalWorkingHours, 408);
        assert.equal((await (await request(`/admin/staff/${person._id}/attendance?${filter}&page=2`)).json()).records.length, 1);
        const excel = await request(`/admin/staff-reports?${filter}&format=xlsx`);
        const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await excel.arrayBuffer())); assert.equal(book.getWorksheet("Attendance").rowCount, 52); assert.equal(book.getWorksheet("Attendance").getCell("B2").value, "आरव शर्मा");
        const pdf = Buffer.from(await (await request(`/admin/staff-reports?${filter}&format=pdf`)).arrayBuffer()).toString("latin1");
        assert.ok((pdf.match(/\/Type \/Page\b/g) || []).length > 1); assert.ok(pdf.includes("/ToUnicode"));
        assert.equal((await request(`/technical/staff/${person._id}/card`)).status, 200);
      } finally { await db.collection("staff_attendance").deleteMany({ staffId: new ObjectId(person._id), date: { $in: dates } }); }
    });
    await t.test("inactive staff disappear from attendance; deleting staff permanently removes their attendance", async () => {
      person = (await (await request(`/admin/staff/${person._id}`, { method: "PATCH", body: { version: person.version, status: "inactive" } })).json()).staff;
      assert.equal((await (await request("/technical/staff-attendance?date=2026-01-01")).json()).staff.length, 0);
      assert.equal((await request("/admin/staff-attendance", { method: "POST", body: { staffId: person._id, date: "2026-01-05", status: "present" } })).status, 409);
      assert.equal((await request(`/technical/staff/${person._id}`, { method: "DELETE", body: { version: person.version } })).status, 204);
      assert.equal((await (await request("/admin/staff")).json()).total, 0);
      assert.equal((await (await request("/admin/staff-reports?month=2026-01")).json()).total, 0);
      assert.equal(await db.collection("staff").countDocuments({ _id: new ObjectId(person._id) }), 0);
      assert.equal(await db.collection("staff_attendance").countDocuments({ staffId: new ObjectId(person._id) }), 0);
      assert.equal((await request(`/admin/staff/${person._id}/photo`)).status, 404);
      const second = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await second.decorationsReady;
      const restarted = second.app.listen(0, "127.0.0.1"); await once(restarted, "listening");
      try { const persisted = await fetch(`http://127.0.0.1:${restarted.address().port}/api/technical/staff/${person._id}/attendance?month=2026-01`, { headers: { Cookie: cookie } }); assert.equal(persisted.status, 404); }
      finally { await second.decorationScheduler.stop(); await new Promise((resolve) => restarted.close(resolve)); }
    });
  } finally { await backend.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve)); await db.dropDatabase(); await client.close(); }
});

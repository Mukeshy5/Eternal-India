import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin, verifyPassword } from "../lib/passwords.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";
import { staffActor, staffPasswordValid } from "../staff-portal/auth.js";
import { invoiceNotes, invoiceToday } from "../../shared/invoices.js";
import { indiaDate } from "../../shared/staff.js";

test("staff passwords require length, case, a digit and a symbol", () => {
  assert.equal(staffPasswordValid("SecureStaff12!"), true);
  for (const value of ["short9!A", "lowercasepassword1!", "UPPERCASEPASSWORD1!", "NoNumbersHere!", "NoSymbolsHere123", null, "A1!".repeat(100)]) assert.equal(staffPasswordValid(value), false);
});

test("Staff Panel uses real MongoDB with technical provisioning and strict record isolation", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_staff_${randomUUID().replaceAll("-", "").slice(0, 10)}`, adminEmail: "portal-owner@example.com", technicalEmail: "", adminPassword: "PortalAdminTest9!" };
  const { client, db } = await connectDatabase(config);
  await ensureAdmin(db, config);
  const admin = await ensureAdmin(db, { ...config, adminEmail: "portal-admin@example.com" });
  await db.collection("admins").updateOne({ _id: admin._id }, { $set: { roles: ["admin"] } });
  const system = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await system.decorationsReady;
  const server = system.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let technicalCookie = "", staffCookie = "", secondCookie = "", account, secondAccount, employee, enquiry, voucher, voucherBody, invoice;
  const password = "AssignedStaff12!";
  const request = (path, { auth = technicalCookie, method = "GET", body } = {}) => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  async function json(path, options) { const response = await request(path, options), data = response.status === 204 ? null : await response.json(); assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`); return data; }
  const staffLogin = async (username = "staff.one", secret = password) => { const response = await request("/staff/login", { auth: "", method: "POST", body: { username, password: secret } }); assert.equal(response.status, 200, await response.clone().text()); return cookieHeader(response); };
  try {
    const now = new Date(), photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64");
    employee = { _id: new ObjectId(), employeeId: "EI-001122334455", name: "Portal Employee", email: "portal-staff@example.com", phone: "+919876543210", department: "Operations", designation: "Travel coordinator", status: "active", photo, photoMime: "image/png", version: 1, createdAt: now, updatedAt: now, deletedAt: null };
    const second = { ...employee, _id: new ObjectId(), employeeId: "EI-112233445566", name: "Other Employee", email: "second-staff@example.com", phone: "+919876543211" }, inactive = { ...employee, _id: new ObjectId(), employeeId: "EI-223344556677", email: "inactive-staff@example.com", phone: "+919876543212", status: "inactive" };
    await db.collection("staff").insertMany([employee, second, inactive]);
    technicalCookie = cookieHeader(await request("/technical/login", { auth: "", method: "POST", body: { email: config.adminEmail, password: config.adminPassword } }));
    const adminCookie = cookieHeader(await request("/admin/login", { auth: "", method: "POST", body: { email: admin.email, password: config.adminPassword } }));
    await t.test("only technical administrators can provision verified active employees", async () => {
      const body = { employeeId: employee.employeeId, username: "Staff.One", password };
      assert.equal((await request("/technical/staff-accounts", { auth: "", method: "POST", body })).status, 401);
      assert.equal((await request("/admin/staff-accounts", { auth: adminCookie, method: "POST", body })).status, 403);
      assert.equal((await request("/technical/staff-accounts", { auth: adminCookie, method: "POST", body })).status, 403);
      assert.equal((await request("/technical/staff-accounts", { method: "POST", body: { ...body, employeeId: inactive.employeeId } })).status, 400);
      assert.equal((await request("/technical/staff-accounts", { method: "POST", body: { ...body, employeeId: "EI-FFFFFFFFFFFF" } })).status, 400);
      assert.equal((await request("/technical/staff-accounts", { method: "POST", body: { ...body, password: "short" } })).status, 400);
      const lookup = await json(`/technical/staff-account-employee?employeeId=${employee.employeeId}`); assert.equal(lookup.employee.name, employee.name); assert.equal(lookup.employee.photo, undefined); assert.equal(lookup.hasAccount, false);
      account = (await json("/technical/staff-accounts", { method: "POST", body })).account;
      assert.equal(account.username, "staff.one"); assert.equal(account.employeeId, employee.employeeId); assert.equal(account.passwordHash, undefined);
      const saved = await db.collection("staff_accounts").findOne({ _id: new ObjectId(account._id) }); assert.ok(saved.staffId.equals(employee._id)); assert.notEqual(saved.passwordHash, password); assert.ok(await verifyPassword(password, saved.passwordHash));
      const duplicates = await Promise.all([request("/technical/staff-accounts", { method: "POST", body: { ...body, username: "duplicate.staff" } }), request("/technical/staff-accounts", { method: "POST", body: { ...body, employeeId: second.employeeId } })]);
      for (const duplicate of duplicates) assert.equal(duplicate.status, 409);
      secondAccount = (await json("/technical/staff-accounts", { method: "POST", body: { ...body, employeeId: second.employeeId, username: "staff.two" } })).account;
      assert.equal((await json("/technical/staff-accounts")).accounts.some((row) => "passwordHash" in row), false);
      const generated = await json("/technical/staff-credentials", { method: "POST", body: {} }); assert.ok(staffPasswordValid(generated.password));
    });
    await t.test("username-only staff authentication is isolated from privileged panels", async () => {
      assert.equal((await request("/staff/login", { auth: "", method: "POST", body: { email: employee.email, password } })).status, 401);
      assert.equal((await request("/staff/login", { auth: "", method: "POST", body: { username: "staff.one", password: "wrong" } })).status, 401);
      staffCookie = await staffLogin(); secondCookie = await staffLogin("staff.two");
      const profile = (await json("/staff/me", { auth: staffCookie })).staff; assert.equal(profile.employeeId, employee.employeeId); assert.equal(profile.role, "staff"); assert.equal(profile.passwordHash, undefined);
      for (const path of ["/admin/me", "/technical/me", "/invoices", "/technical/staff-accounts"]) assert.equal((await request(path, { auth: staffCookie })).status, 401, path);
      assert.equal((await request("/staff/me", { auth: technicalCookie })).status, 401);
      assert.equal((await request("/staff/register", { auth: staffCookie, method: "POST", body: {} })).status, 404);
    });
    await t.test("enquiry assignment and optimistic edits enforce ownership on the server", async () => {
      enquiry = (await system.enquirySystem.enquiries.create({ name: "Assigned Guest", message: "Journey request", destination: "Delhi", source: "WEBSITE", email: "guest@example.com" })).enquiry;
      await json(`/technical/enquiries/${enquiry._id}`, { method: "PATCH", body: { assignedTo: account._id } });
      const assignees = await json("/technical/enquiry-assignees"); assert.ok(assignees.assignees.some((row) => row._id === account._id));
      assert.equal((await json("/staff/enquiries", { auth: staffCookie })).total, 1); assert.equal((await json("/staff/enquiries", { auth: secondCookie })).total, 0);
      assert.equal((await request(`/staff/enquiries/${enquiry._id}`, { auth: secondCookie })).status, 404);
      const current = (await json(`/staff/enquiries/${enquiry._id}`, { auth: staffCookie })).enquiry;
      assert.equal((await request(`/staff/enquiries/${enquiry._id}`, { auth: staffCookie, method: "PATCH", body: { status: "RESOLVED", revision: current.revision, assignedTo: secondAccount._id } })).status, 400);
      const updated = await json(`/staff/enquiries/${enquiry._id}`, { auth: staffCookie, method: "PATCH", body: { status: "IN_PROGRESS", revision: current.revision } }); assert.equal(updated.enquiry.status, "IN_PROGRESS");
      assert.equal((await request(`/staff/enquiries/${enquiry._id}`, { auth: staffCookie, method: "PATCH", body: { status: "RESOLVED", revision: current.revision } })).status, 409);
      assert.equal((await request(`/staff/enquiries/${enquiry._id}`, { auth: secondCookie, method: "PATCH", body: { status: "RESOLVED", revision: updated.enquiry.revision } })).status, 404);
    });
    await t.test("attendance, personal notifications and printable ID cards use linked employee data", async () => {
      await json("/technical/staff-attendance", { method: "POST", body: { staffId: employee._id.toString(), date: indiaDate(), status: "present", checkIn: "09:00", checkOut: "17:00" } });
      const attendance = await json(`/staff/attendance?from=${indiaDate()}&to=${indiaDate()}&staffId=${second._id}`, { auth: staffCookie }); assert.equal(attendance.total, 1); assert.equal(attendance.summary.totalWorkingHours, 8);
      assert.equal((await json("/staff/attendance", { auth: secondCookie })).total, 0);
      assert.equal((await request("/staff/attendance", { auth: staffCookie, method: "POST", body: {} })).status, 404);
      const card = await request("/staff/id-card", { auth: staffCookie }); assert.equal(card.status, 200); assert.match(Buffer.from(await card.arrayBuffer()).toString("latin1"), /^%PDF-/);
      const preview = await request("/staff/id-card/preview", { auth: staffCookie }); assert.equal(preview.status, 200); assert.ok((await preview.text()).includes(employee.employeeId));
      const notifications = await json("/staff/notifications", { auth: staffCookie }); assert.ok(notifications.notifications.some((row) => row.enquiryId === enquiry._id));
      const note = notifications.notifications[0]; assert.equal((await request(`/staff/notifications/${encodeURIComponent(note._id)}/read`, { auth: secondCookie, method: "PATCH", body: {} })).status, 404);
      await json(`/staff/notifications/${encodeURIComponent(note._id)}/read`, { auth: staffCookie, method: "PATCH", body: {} });
      await json("/staff/notifications/read-all", { auth: staffCookie, method: "PATCH", body: {} }); assert.equal((await json("/staff/notifications", { auth: staffCookie })).unread, 0);
    });
    await t.test("staff voucher CRUD, quoting, history and PDF exports cannot cross ownership", async () => {
      const hotel = (await json("/technical/hotels", { method: "POST", body: { name: "Portal hotel", address: "Delhi", starRating: "4-Star (Upscale / Deluxe)", amount: 1000 } })).hotel;
      const gst = (await json("/technical/gst", { method: "POST", body: { gstNumber: "07ABCDE1234F1Z5" } })).gstRate;
      const office = (await json("/technical/office-addresses", { method: "POST", body: { name: "Delhi office", address: "12 Office Road, Delhi", phone: "+91 11 41715155" } })).address;
      const reservation = (await json("/staff/vouchers/invoice", { auth: staffCookie, method: "POST", body: { requestId: randomUUID() } })).invoice;
      voucherBody = { reservationId: reservation.reservationId, hotelId: hotel._id, gstId: gst._id, officeAddressId: office._id, mealPlan: "MAP", guestName: "Portal Guest", voucherDate: indiaDate(), requirement: "Two rooms", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", arrivalPlace: "Delhi airport", departureDate: "2026-12-03", departurePlace: "Delhi station", basePrice: "1000", status: "confirmed", createdBy: "spoofed-admin" };
      voucher = (await json("/staff/vouchers", { auth: staffCookie, method: "POST", body: voucherBody })).voucher; assert.equal(voucher.createdBy, staffActor(employee._id));
      assert.equal((await json("/staff/vouchers", { auth: secondCookie })).total, 0); assert.equal((await json("/technical/vouchers")).total, 1);
      for (const suffix of ["", "/pdf", "/print-data"]) assert.equal((await request(`/staff/vouchers/${voucher._id}${suffix}`, { auth: secondCookie })).status, 404);
      assert.equal((await request("/staff/vouchers/quote", { auth: secondCookie, method: "POST", body: { ...voucherBody, voucherId: voucher._id } })).status, 404);
      assert.equal((await request(`/staff/vouchers/${voucher._id}`, { auth: secondCookie, method: "PATCH", body: { ...voucherBody, revision: voucher.revision } })).status, 404);
      assert.equal((await request(`/staff/vouchers/${voucher._id}?revision=${voucher.revision}`, { auth: secondCookie, method: "DELETE" })).status, 404);
      voucher = (await json(`/staff/vouchers/${voucher._id}`, { auth: staffCookie, method: "PATCH", body: { ...voucherBody, revision: voucher.revision, guestName: "Updated Guest" } })).voucher; assert.equal(voucher.guestName, "Updated Guest");
      const pdf = await request(`/staff/vouchers/${voucher._id}/pdf`, { auth: staffCookie }); assert.equal(pdf.status, 200); assert.match(Buffer.from(await pdf.arrayBuffer()).toString("latin1"), /^%PDF-/);
      assert.equal((await request("/staff/vouchers/export?format=pdf", { auth: staffCookie })).status, 200);
      assert.equal((await json("/staff/vouchers/options", { auth: secondCookie })).usedHotels.length, 0);
    });
    await t.test("Technical Panel explicitly grants and revokes invoice read/download access", async () => {
      invoice = (await json("/technical/invoices", { method: "POST", body: { requestId: randomUUID(), invoiceDate: invoiceToday(), clientName: "Authorized Client", totalPerson: 2, perPersonAmount: "1500", recipientDetails: "Delhi", description: "Travel / Tour Services", notes: invoiceNotes, invoiceType: "invoice" } })).invoice;
      assert.equal((await request(`/staff/invoices/${invoice._id}`, { auth: staffCookie })).status, 404);
      await json(`/technical/staff-accounts/${account._id}/invoices/${invoice._id}`, { method: "PATCH", body: { authorized: true } });
      assert.equal((await json("/staff/invoices", { auth: staffCookie })).total, 1); assert.equal((await json("/staff/invoices", { auth: secondCookie })).total, 0);
      assert.equal((await request(`/staff/invoices/${invoice._id}/pdf`, { auth: staffCookie })).status, 200); assert.equal((await request(`/staff/invoices/${invoice._id}/pdf`, { auth: secondCookie })).status, 404);
      assert.equal((await request(`/staff/invoices/${invoice._id}`, { auth: staffCookie, method: "PUT", body: {} })).status, 404);
      await json(`/technical/staff-accounts/${account._id}/invoices/${invoice._id}`, { method: "PATCH", body: { authorized: false } }); assert.equal((await request(`/staff/invoices/${invoice._id}/pdf`, { auth: staffCookie })).status, 404);
    });
    await t.test("live updates contain only a scoped revision and revoke active connections", async () => {
      const controller = new AbortController(), response = await fetch(`${base}/staff/events`, { headers: { Cookie: staffCookie }, signal: controller.signal }); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const reader = response.body.getReader(), decoder = new TextDecoder(); let content = decoder.decode((await reader.read()).value); assert.match(content, /event: changed/); assert.doesNotMatch(content, /Assigned Guest|Other Employee|Portal Guest/);
      await json(`/technical/staff-accounts/${account._id}`, { method: "PATCH", body: { status: "inactive", version: account.version } });
      const deadline = setTimeout(() => controller.abort(), 10000);
      try { while (!content.includes("event: revoked")) { const chunk = await reader.read(); if (chunk.done) break; content += decoder.decode(chunk.value); } assert.match(content, /event: revoked/); }
      finally { clearTimeout(deadline); controller.abort(); }
      assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401); assert.equal((await request("/staff/login", { auth: "", method: "POST", body: { username: "staff.one", password } })).status, 401);
      account = (await json("/technical/staff-accounts")).accounts.find((row) => row._id === account._id); await json(`/technical/staff-accounts/${account._id}`, { method: "PATCH", body: { status: "active", version: account.version } });
      assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401); staffCookie = await staffLogin();
    });
    await t.test("employee deactivation immediately blocks requests and prevents old sessions returning", async () => {
      employee = (await json(`/technical/staff/${employee._id}`, { method: "PATCH", body: { version: employee.version, status: "inactive" } })).staff;
      assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401);
      assert.equal((await request("/staff/login", { auth: "", method: "POST", body: { username: "staff.one", password } })).status, 401);
      employee = (await json(`/technical/staff/${employee._id}`, { method: "PATCH", body: { version: employee.version, status: "active" } })).staff;
      assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401); staffCookie = await staffLogin();
    });
    await t.test("password rotation invalidates every session, and login deletion preserves records", async () => {
      const otherSession = await staffLogin(), newPassword = "NewAssignedStaff34!";
      assert.equal((await request("/staff/change-password", { auth: staffCookie, method: "POST", body: { currentPassword: "wrong", password: newPassword, confirmPassword: newPassword } })).status, 400);
      await json("/staff/change-password", { auth: staffCookie, method: "POST", body: { currentPassword: password, password: newPassword, confirmPassword: newPassword } });
      for (const auth of [staffCookie, otherSession]) assert.equal((await request("/staff/me", { auth })).status, 401);
      assert.equal((await request("/staff/login", { auth: "", method: "POST", body: { username: "staff.one", password } })).status, 401); staffCookie = await staffLogin("staff.one", newPassword);
      await json(`/staff/vouchers/${voucher._id}?revision=${voucher.revision}`, { auth: staffCookie, method: "DELETE" }); assert.equal((await request(`/staff/vouchers/${voucher._id}`, { auth: staffCookie })).status, 404);
      await json("/staff/logout", { auth: staffCookie, method: "POST", body: {} }); assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401); staffCookie = await staffLogin("staff.one", newPassword);
      account = (await json("/technical/staff-accounts")).accounts.find((row) => row._id === account._id);
      await json(`/technical/staff-accounts/${account._id}`, { method: "DELETE", body: { version: account.version } });
      assert.equal((await request("/staff/me", { auth: staffCookie })).status, 401); assert.ok(await db.collection("staff").findOne({ _id: new ObjectId(employee._id) })); assert.ok(await db.collection("enquiries").findOne({ _id: new ObjectId(enquiry._id) })); assert.ok(await db.collection("billing_invoices").findOne({ _id: new ObjectId(invoice._id) })); assert.equal(await db.collection("staff_attendance").countDocuments({ staffId: new ObjectId(employee._id) }), 1);
    });
  } finally {
    system.decorationScheduler.stop(); await system.enquirySystem.stop(); await system.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!config.databaseName.startsWith("eternal_india_test_staff_")) throw new Error("Refusing cleanup outside the isolated staff portal test database.");
    await db.dropDatabase(); await client.close();
  }
});

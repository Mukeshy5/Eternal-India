import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";

test("session probes and backup-protected deletes tolerate storage contention", { timeout: 180000 }, async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "eternal-delete-"));
  const config = { ...readConfig(), production: false, databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "delete-owner@example.com", technicalEmail: "", adminPassword: "DeleteContentionTest9", dataControl: { backupDirectory: resolve(root, "backups"), uploadDirectory: resolve(root, "uploads"), tempDirectory: resolve(root, "temporary") } };
  const { db, client } = await connectDatabase(config);
  const owner = await ensureAdmin(db, config);
  const technical = { _id: new ObjectId(), email: "delete-technical@example.com", passwordHash: owner.passwordHash, roles: ["technical"], status: "active" };
  await db.collection("admins").insertOne(technical);
  const backend = createApp({ db, client, config, schedulerOptions: { intervalMs: 0 } });
  await Promise.all([backend.dataControlReady, backend.decorationsReady]);
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const request = (path, { method = "GET", body, auth = cookie, signal } = {}) => fetch(base + path, { method, signal, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const waitFor = async (check) => { const end = Date.now() + 10000; while (!await check()) { assert.ok(Date.now() < end, "operation should reach its waiting state"); await delay(25); } };
  const enquiry = async () => {
    const record = { _id: new ObjectId(), name: "Delete regression guest", reference: `EI-${randomUUID()}`, source: "WEBSITE", status: "NEW", message: "Actual saved enquiry", receivedAt: new Date(), createdAt: new Date(), revision: 0, pendingEvents: [] };
    await db.collection("enquiries").insertOne(record); return record;
  };
  try {
    await t.test("signed-out probes return a normal state while protected routes retain 401", async () => {
      for (const panel of ["admin", "technical"]) {
        const reply = await request(`/${panel}/session`); assert.equal(reply.status, 200); assert.deepEqual(await reply.json(), { admin: null });
        assert.equal((await request(`/${panel}/me`)).status, 401);
      }
      const signedIn = await request("/admin/login", { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } });
      assert.equal(signedIn.status, 200); cookie = cookieHeader(signedIn);
      assert.equal((await (await request("/admin/session")).json()).admin.id, owner._id.toString());
      assert.deepEqual(await (await request("/admin/session", { auth: "eternal_india.auth=invalid" })).json(), { admin: null });
    });
    await t.test("a wrong-panel login explains 403 without granting another role", async () => {
      const denied = await request("/admin/login", { method: "POST", body: { email: technical.email, password: config.adminPassword } });
      assert.equal(denied.status, 403); const details = await denied.json();
      assert.equal(details.code, "PANEL_ACCESS_DENIED"); assert.equal(details.suggestedPanel, "technical");
      const allowed = await request("/technical/login", { method: "POST", body: { email: technical.email, password: config.adminPassword }, auth: "" });
      assert.equal(allowed.status, 200); const technicalCookie = cookieHeader(allowed);
      const probe = await request("/admin/session", { auth: technicalCookie }); assert.equal(probe.status, 200);
      assert.equal((await probe.json()).admin, null);
      assert.equal((await request("/admin/enquiries", { auth: technicalCookie })).status, 403);
      assert.deepEqual((await db.collection("admins").findOne({ _id: technical._id })).roles, ["technical"]);
      await request("/technical/logout", { method: "POST", body: {}, auth: technicalCookie });
      assert.deepEqual(await (await request("/technical/session", { auth: technicalCookie })).json(), { admin: null });
    });
    await t.test("delete waits for an active writer and only then creates its verified backup", async () => {
      const record = await enquiry(), runtime = db.collection("data_control_runtime");
      await runtime.deleteOne({ _id: "operation" });
      await runtime.insertOne({ _id: "write:delete-regression", bytes: 1024, until: new Date(Date.now() + 120000) });
      let finished = false;
      const deleting = request(`/technical/enquiries/${record._id}/permanent`, { method: "DELETE" }).finally(() => { finished = true; });
      try {
        await waitFor(() => runtime.findOne({ _id: "operation" }));
        await delay(9000);
        assert.equal(finished, false, "the active writer must not turn a queued delete into an early 409");
        assert.ok(await db.collection("enquiries").findOne({ _id: record._id }));
      } finally { await runtime.deleteOne({ _id: "write:delete-regression" }); }
      const reply = await deleting; assert.equal(reply.status, 204, await reply.text());
      const backup = await db.collection("data_control_backups").findOne({ _id: reply.headers.get("X-Data-Control-Backup") });
      assert.equal(backup.status, "verified"); assert.equal(await db.collection("enquiries").findOne({ _id: record._id }), null);
    });
    await t.test("simultaneous enquiry, attendance-range and staff deletes all finish with backups", async () => {
      const first = await enquiry(), archived = await enquiry();
      const now = new Date();
      const staff = [
        { _id: new ObjectId(), employeeId: "EI-000000000001", name: "Delete staff", phone: "+919876543210", email: "delete-staff@example.com", department: "Operations", designation: "Coordinator", status: "active", deletedAt: null, photo: Buffer.from("photo"), photoMime: "image/png", version: 1, createdAt: now, updatedAt: now },
        { _id: new ObjectId(), employeeId: "EI-000000000002", name: "Range staff", phone: "+919876543211", email: "range-staff@example.com", department: "Operations", designation: "Coordinator", status: "active", deletedAt: null, photo: Buffer.from("photo"), photoMime: "image/png", version: 1, createdAt: now, updatedAt: now },
      ];
      await db.collection("staff").insertMany(staff);
      await db.collection("staff_attendance").insertOne({ staffId: staff[1]._id, date: "2026-01-08", status: "present", checkIn: "", checkOut: "", workingMinutes: 0, version: 1, createdAt: now, updatedAt: now });
      const replies = await Promise.all([
        request(`/admin/enquiries/${first._id}/permanent`, { method: "DELETE" }),
        request(`/technical/enquiries/${archived._id}`, { method: "DELETE" }),
        request("/technical/staff-attendance/range", { method: "DELETE", body: { from: "2026-01-08", to: "2026-01-08", scope: "staff", staffId: staff[1]._id.toString() } }),
        request(`/technical/staff/${staff[0]._id}`, { method: "DELETE", body: { version: 1 } }),
      ]);
      assert.deepEqual(replies.map((reply) => reply.status), [204, 204, 200, 204]);
      assert.equal((await replies[2].json()).deletedCount, 1);
      for (const reply of replies) assert.equal((await db.collection("data_control_backups").findOne({ _id: reply.headers.get("X-Data-Control-Backup") })).status, "verified");
      assert.equal(await db.collection("enquiries").findOne({ _id: first._id }), null);
      assert.ok((await db.collection("enquiries").findOne({ _id: archived._id })).archivedAt);
      assert.equal(await db.collection("staff").findOne({ _id: staff[0]._id }), null);
    });
    await t.test("a backup validation failure runs once, preserves data and does not poison the queue", async () => {
      const record = await enquiry(), control = backend.dataControl, createBackup = control.createBackup;
      let attempts = 0;
      control.createBackup = async () => { attempts++; throw Object.assign(new Error("Backup verification failed."), { status: 409, publicMessage: true }); };
      try {
        const reply = await request(`/technical/enquiries/${record._id}/permanent`, { method: "DELETE" });
        assert.equal(reply.status, 409); assert.equal((await reply.json()).message, "Backup verification failed.");
        assert.equal(attempts, 1); assert.ok(await db.collection("enquiries").findOne({ _id: record._id }));
      } finally { control.createBackup = createBackup; }
      assert.equal((await request(`/technical/enquiries/${record._id}/permanent`, { method: "DELETE" })).status, 204);
    });
    await t.test("cancelling a queued delete prevents it from executing later", async () => {
      const record = await enquiry(), control = backend.dataControl, original = control.withQueuedLock;
      const runtime = db.collection("data_control_runtime");
      await waitFor(async () => !await runtime.findOne({ _id: "operation", until: { $gt: new Date() } }));
      let release, entered;
      const held = new Promise((resolve) => { release = resolve; });
      const acquired = new Promise((resolve) => { entered = resolve; });
      const blocker = control.withLock(async () => { entered(); await held; }); await acquired;
      let queued;
      const admitted = new Promise((resolve) => { queued = resolve; });
      control.withQueuedLock = (...args) => { queued(); return original(...args); };
      const controller = new AbortController();
      try {
        const deleting = request(`/technical/enquiries/${record._id}/permanent`, { method: "DELETE", signal: controller.signal });
        await admitted; controller.abort(); await assert.rejects(deleting, { name: "AbortError" });
        await delay(100);
      } finally { control.withQueuedLock = original; release(); await blocker; }
      await control.withQueuedLock(() => {});
      assert.ok(await db.collection("enquiries").findOne({ _id: record._id }));
    });
  } finally {
    await backend.enquirySystem.stop(); await backend.decorationScheduler.stop(); await backend.dataControl.stop(); await backend.drainSessions();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
    assert.ok(resolve(root).startsWith(resolve(tmpdir(), "eternal-delete-"))); await rm(root, { recursive: true, force: true });
  }
});

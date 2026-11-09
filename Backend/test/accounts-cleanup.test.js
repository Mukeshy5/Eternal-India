import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin, verifyPassword } from "../lib/passwords.js";
import { cleanupDatabase } from "../lib/database-cleanup.js";
import { createApp } from "../app.js";

test("panel accounts, one-time password recovery and safe database cleanup", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "owner@example.com", technicalEmail: "", adminPassword: "OwnerPassword9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const mail = [];
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 }, sendPasswordReset: async (message) => mail.push(message) });
  await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "", techCookie = "", technical;
  const request = (path, method = "GET", body, sessionCookie = cookie) => fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test("public account requests require approval and credentials are protected", async () => {
      assert.equal((await request("/admin/accounts", "GET", undefined, "")).status, 401);
      assert.equal((await request("/admin/register", "POST", { email: "new-admin@example.com", password: "NewAdminPassword9", roles: ["admin", "technical"], status: "active" }, "")).status, 202);
      const pending = await db.collection("admins").findOne({ email: "new-admin@example.com" });
      assert.equal(pending.status, "pending"); assert.deepEqual(pending.roles, []); assert.ok(pending.expiresAt);
      assert.ok(await verifyPassword("NewAdminPassword9", pending.passwordHash));
      assert.equal((await request("/admin/login", "POST", { email: pending.email, password: "NewAdminPassword9" }, "")).status, 403);
      const login = await request("/admin/login", "POST", { email: config.adminEmail, password: config.adminPassword }, "");
      cookie = login.headers.get("set-cookie").split(";")[0];
      assert.equal((await login.json()).admin.canManageAccounts, true);
      assert.equal((await request(`/admin/accounts/${pending._id}/approve`, "PATCH", {})).status, 200);
      const approved = await db.collection("admins").findOne({ _id: pending._id }); assert.equal(approved.expiresAt, undefined);
      assert.equal((await request("/admin/login", "POST", { email: pending.email, password: "NewAdminPassword9" }, "")).status, 200);
      const create = await request("/admin/accounts", "POST", { email: "engineer@example.com", password: "EngineerPassword9", role: "technical" }); assert.equal(create.status, 201);
      technical = (await create.json()).account;
      const technicalLogin = await request("/technical/login", "POST", { email: technical.email, password: "EngineerPassword9" }, ""); assert.equal(technicalLogin.status, 200);
      techCookie = technicalLogin.headers.get("set-cookie").split(";")[0];
      assert.equal((await technicalLogin.json()).admin.canManageAccounts, false);
      assert.equal((await request("/technical/accounts", "POST", { email: "bad@example.com", password: "AnyPassword9", role: "admin" }, techCookie)).status, 403);
      const list = await (await request("/admin/accounts")).json(); assert.ok(list.accounts.every((account) => !account.passwordHash && !account.passwordReset));
    });
    await t.test("reset links are hashed, expire, work once, and revoke the old account sessions", async () => {
      const reply = await request("/technical/forgot-password", "POST", { email: technical.email }, ""); assert.equal(reply.status, 200);
      assert.equal(mail.length, 1); assert.equal(mail[0].email, technical.email);
      const token = new URL(mail[0].resetUrl).searchParams.get("token"); assert.ok(mail[0].resetUrl.includes("/technical/reset-password?"));
      const record = await db.collection("admins").findOne({ email: technical.email }); assert.notEqual(record.passwordReset.hash, token);
      const unknown = await request("/admin/forgot-password", "POST", { email: "missing@example.com" }, ""); assert.deepEqual(await unknown.json(), await reply.json()); assert.equal(mail.length, 1);
      assert.equal((await request("/technical/reset-password", "POST", { token, password: "ChangedPassword9" }, "")).status, 200);
      assert.equal((await request("/technical/me", "GET", undefined, techCookie)).status, 401);
      assert.equal((await request("/admin/me")).status, 200, "another account's session remains valid");
      assert.equal((await request("/technical/reset-password", "POST", { token, password: "AgainPassword9" }, "")).status, 400);
      assert.equal((await db.collection("admins").findOne({ email: technical.email })).passwordReset, undefined);
      assert.equal((await request("/technical/login", "POST", { email: technical.email, password: "ChangedPassword9" }, "")).status, 200);
      await request("/admin/forgot-password", "POST", { email: config.adminEmail }, "");
      const expiredToken = new URL(mail.at(-1).resetUrl).searchParams.get("token");
      await db.collection("admins").updateOne({ email: config.adminEmail }, { $set: { "passwordReset.expiresAt": new Date(0) } });
      assert.equal((await request("/admin/reset-password", "POST", { token: expiredToken, password: "AnotherPassword9" }, "")).status, 400);
      assert.equal((await request(`/admin/accounts/${technical._id}`, "DELETE")).status, 204);
      assert.equal(await db.collection("admins").findOne({ email: technical.email }), null);
    });
    await t.test("cleanup removes only legacy deletions, expired uploads and broken references", async () => {
      const now = new Date(), old = new Date(now.getTime() - 2 * 86400000);
      const staff = { employeeId: "EI-0123456789AB", name: "Deleted staff", phone: "+919999999999", email: "deleted@example.com", department: "Tours", designation: "Guide", status: "inactive", photo: Buffer.from("photo"), photoMime: "image/png", version: 1, createdAt: old, updatedAt: old, deletedAt: old };
      const staffId = (await db.collection("staff").insertOne(staff)).insertedId;
      await db.collection("staff_attendance").insertOne({ staffId, date: "2026-01-01", status: "absent", checkIn: "", checkOut: "", workingMinutes: 0, version: 1, createdAt: old, updatedAt: old });
      const usedImage = new ObjectId(), orphanImage = new ObjectId(), draftImage = new ObjectId();
      await db.collection("offer_images").insertMany([{ _id: usedImage, data: Buffer.from("used"), createdAt: old }, { _id: orphanImage, data: Buffer.from("orphan"), createdAt: old }, { _id: draftImage, data: Buffer.from("draft"), createdAt: now }]);
      await db.collection("tour_promotions").insertOne({ _id: "package:golden-triangle", amount: 100, offerImage: `/api/offer-images/${usedImage}` });
      await db.collection("decoration_activity").insertOne({ decorationId: new ObjectId().toString(), timestamp: now });
      const preview = await cleanupDatabase(db); assert.equal(preview.deletedStaff, 1); assert.equal(preview.orphanAttendance, 1); assert.equal(preview.offer_images, 1);
      assert.equal(await db.collection("staff").countDocuments(), 1, "preview does not delete data");
      await cleanupDatabase(db, { apply: true });
      assert.equal(await db.collection("staff").countDocuments(), 0); assert.equal(await db.collection("staff_attendance").countDocuments(), 0);
      assert.equal(await db.collection("offer_images").countDocuments(), 2); assert.ok(await db.collection("offer_images").findOne({ _id: usedImage })); assert.ok((await db.collection("offer_images").findOne({ _id: draftImage })).expiresAt);
      assert.equal(await db.collection("decoration_activity").countDocuments(), 0);
      assert.equal((await db.collection("admins").findOne({ email: config.adminEmail })).passwordReset, undefined);
    });
  } finally {
    await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to delete a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

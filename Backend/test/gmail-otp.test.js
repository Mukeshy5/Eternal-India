import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { gmailIdentity } from "../lib/email-identity.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";

test("Gmail identity prevents case, dot, tag and googlemail duplicate aliases", () => {
  for (const email of ["First.Last@gmail.com", "firstlast+travel@gmail.com", "first.last@googlemail.com"]) assert.equal(gmailIdentity(email).gmailKey, "firstlast@gmail.com");
  for (const email of ["guest@example.com", "a@gmail.com.evil", "a..b@gmail.com", "bad email@gmail.com", { $ne: null }]) assert.equal(gmailIdentity(email), null);
});

test("real MongoDB/API OTP gates reject bypasses and preserve existing account management", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "otp-owner@eternal-india.local", technicalEmail: "", adminPassword: "OtpOwnerPassword9", smtp: {} };
  const { client, db } = await connectDatabase(config); const owner = await ensureAdmin(db, config);
  const existing = await ensureAdmin(db, { ...config, adminEmail: "existing.account@gmail.com", adminPassword: "ExistingPassword9" });
  const pending = await ensureAdmin(db, { ...config, adminEmail: "legacy.request@gmail.com" });
  await db.collection("admins").updateOne({ _id: pending._id }, { $set: { status: "pending", roles: [], expiresAt: new Date(Date.now() + 86400000) } });
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const request = (path, body, method = "POST", authenticated = false) => fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test("all public registration routes require backend verification", async () => {
      for (const path of ["/auth/register", "/admin/register", "/technical/register"]) assert.equal((await request(path, { email: "new.registration@gmail.com", password: "RegistrationPassword9", verified: true, emailVerified: true })).status, 403);
      assert.equal(await db.collection("admins").countDocuments(), 3);
      assert.equal((await request("/auth/send-otp", { email: "not-gmail@example.com" })).status, 400);
      const unavailable = await request("/auth/send-otp", { email: "new.registration@gmail.com" }); assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json()).code, "EMAIL_NOT_CONFIGURED");
      assert.equal(await db.collection("email_verifications").countDocuments(), 0, "missing Gmail credentials never create a verification or grant access");
      assert.equal((await request("/auth/verify-otp", { email: "new.registration@gmail.com", otp: "invalid" })).status, 400);
      assert.equal((await request("/auth/send-otp", { email: "new.registration@gmail.com", purpose: "account-create" })).status, 401);
    });
    await t.test("duplicate Gmail aliases and unsafe account edits are rejected", async () => {
      assert.equal((await request("/auth/register", { email: "existingaccount+new@googlemail.com", password: "RegistrationPassword9" })).status, 409);
      const login = await request("/admin/login", { email: config.adminEmail, password: config.adminPassword }); assert.equal(login.status, 200); cookie = cookieHeader(login);
      assert.equal((await request("/admin/accounts", { email: "managed.registration@gmail.com", password: "RegistrationPassword9", role: "technical" }, "POST", true)).status, 403);
      assert.equal((await request(`/admin/accounts/${existing._id}`, { email: "changed.account@gmail.com", role: "technical", version: 0 }, "PATCH", true)).status, 403);
      assert.equal((await db.collection("admins").findOne({ _id: existing._id })).email, existing.email);
      assert.equal((await request(`/admin/accounts/${owner._id}`, { email: "owner.change@gmail.com", role: "technical", version: 0 }, "PATCH", true)).status, 409);
      assert.equal((await request(`/admin/accounts/${pending._id}/approve`, {}, "PATCH", true)).status, 403, "old unverified pending accounts cannot bypass verification through approval");
      const list = await (await request("/admin/accounts", undefined, "GET", true)).json();
      assert.ok(list.accounts.every((account) => !account.passwordHash && !account.passwordReset && !account.otpHash));
      assert.equal(list.accounts.find((account) => account._id === owner._id.toString()).editable, false);
      assert.equal((await request(`/admin/accounts/${existing._id}`, undefined, "DELETE", true)).status, 204);
      assert.equal(await db.collection("admins").findOne({ _id: existing._id }), null);
    });
    await t.test("OTP verification is rate limited even without a valid challenge", async () => {
      let response;
      for (let attempt = 0; attempt < 31; attempt++) response = await request("/auth/verify-otp", { email: "new.registration@gmail.com", otp: "invalid" });
      assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
    });
    const indexes = await db.collection("email_verifications").indexes(); assert.ok(indexes.some((index) => index.key.purgeAt === 1 && index.expireAfterSeconds === 0));
  } finally {
    await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to remove a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

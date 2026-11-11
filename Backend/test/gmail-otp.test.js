import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin, ensureInitialAdmin } from "../lib/passwords.js";
import { gmailIdentity } from "../lib/email-identity.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";

test("Gmail identity prevents case, dot, tag and googlemail duplicate aliases", () => {
  for (const email of ["First.Last@gmail.com", "firstlast+travel@gmail.com", "first.last@googlemail.com"]) assert.equal(gmailIdentity(email).gmailKey, "firstlast@gmail.com");
  for (const email of ["guest@example.com", "a@gmail.com.evil", "a..b@gmail.com", "bad email@gmail.com", { $ne: null }]) assert.equal(gmailIdentity(email), null);
});

test("real MongoDB/API registration bypasses OTP while verification remains available for other flows", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "otp-owner@eternal-india.local", technicalEmail: "", adminPassword: "OtpOwnerPassword9", smtp: {}, email: { provider: "smtp" } };
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
    await t.test("Admin and Technical registration create accounts without SMTP or OTP", async () => {
      const registrations = [
        ["/auth/register", "shared.registration@gmail.com", "admin", undefined],
        ["/admin/register", "admin.registration@gmail.com", "admin", "technical"],
        ["/technical/register", "technical.registration@gmail.com", "technical", "admin"],
      ];
      for (const [path, email, role, submittedRole] of registrations) {
        const response = await request(path, { email, password: "RegistrationPassword9", ...(submittedRole ? { role: submittedRole } : {}), emailVerified: true });
        assert.equal(response.status, 201, `${path} registers without an OTP`);
        const account = await db.collection("admins").findOne({ email });
        assert.deepEqual(account.roles, [path === "/auth/register" ? "admin" : role], "panel registration cannot select a different role");
        assert.equal(account.emailVerified, false, "OTP bypass does not falsely mark an address as verified");
        assert.equal(await db.collection("email_verifications").countDocuments({ email }), 0, "registration does not access the OTP collection");
        const panel = account.roles.includes("technical") ? "technical" : "admin";
        assert.equal((await request(`/${panel}/login`, { email, password: "RegistrationPassword9" })).status, 200, "new credentials authenticate in the selected panel");
      }
      assert.equal(await db.collection("admins").countDocuments(), 6);
      assert.equal((await request("/technical/register", { email: "invalid.password@gmail.com", password: "short" })).status, 400, "password validation remains active");
      assert.equal((await request("/auth/send-otp", { email: "not-gmail@example.com" })).status, 400);
      const unavailable = await request("/auth/send-otp", { email: "new.registration@gmail.com" }); assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json()).code, "EMAIL_NOT_CONFIGURED");
      assert.equal((await request("/auth/verify-otp", { email: "new.registration@gmail.com", otp: "invalid" })).status, 400);
      assert.equal((await request("/auth/send-otp", { email: "new.registration@gmail.com", purpose: "account-create" })).status, 401);
    });
    await t.test("duplicate Gmail aliases and unsafe account edits are rejected", async () => {
      assert.equal((await request("/auth/register", { email: "existingaccount+new@googlemail.com", password: "RegistrationPassword9" })).status, 409);
      const login = await request("/admin/login", { email: config.adminEmail, password: config.adminPassword }); assert.equal(login.status, 200); cookie = cookieHeader(login);
      const created = await request("/admin/accounts", { email: "managed.registration@gmail.com", password: "RegistrationPassword9", role: "technical" }, "POST", true);
      assert.equal(created.status, 201, "admin-managed account creation does not require OTP");
      assert.equal((await db.collection("admins").findOne({ email: "managed.registration@gmail.com" })).emailVerified, false);
      assert.equal((await request(`/admin/accounts/${existing._id}`, { email: "changed.account@gmail.com", role: "technical", version: 0 }, "PATCH", true)).status, 403);
      assert.equal((await db.collection("admins").findOne({ _id: existing._id })).email, existing.email);
      assert.equal((await request(`/admin/accounts/${owner._id}`, { email: "owner.change@gmail.com", role: "admin", version: 0 }, "PATCH", true)).status, 403, "even owner email changes require Gmail verification");
      assert.equal((await request(`/admin/accounts/${pending._id}/approve`, {}, "PATCH", true)).status, 403, "old unverified pending accounts cannot bypass verification through approval");
      const list = await (await request("/admin/accounts", undefined, "GET", true)).json();
      assert.ok(list.accounts.every((account) => !account.passwordHash && !account.passwordReset && !account.otpHash));
      const ownerAccount = list.accounts.find((account) => account._id === owner._id.toString());
      assert.equal(ownerAccount.editable, true); assert.equal(ownerAccount.deletable, true);
      assert.equal(ownerAccount.isOwner, true); assert.equal(ownerAccount.isCurrent, true);
      const managed = list.accounts.find((account) => account._id === existing._id.toString());
      assert.equal(managed.editable, true); assert.equal(managed.deletable, true); assert.equal(managed.managementRestriction, "");
      const ownerCookie = cookie;
      const managerLogin = await request("/admin/login", { email: existing.email, password: "ExistingPassword9" });
      assert.equal(managerLogin.status, 200); cookie = cookieHeader(managerLogin);
      const managerList = await (await request("/admin/accounts", undefined, "GET", true)).json();
      const signedIn = managerList.accounts.find((account) => account._id === existing._id.toString());
      assert.equal(signedIn.editable, true); assert.equal(signedIn.deletable, true); assert.equal(signedIn.isCurrent, true);
      cookie = ownerCookie;
      assert.equal((await request(`/admin/accounts/${existing._id}`, undefined, "DELETE", true)).status, 204);
      assert.equal(await db.collection("admins").findOne({ _id: existing._id }), null);
    });
    await t.test("owner credentials can be edited and deleted while retaining an active administrator", async () => {
      await ensureInitialAdmin(db, config);
      const blocked = await request(`/admin/accounts/${owner._id}`, undefined, "DELETE", true);
      assert.equal(blocked.status, 409); assert.ok((await blocked.json()).message.includes("last active administrator"));
      assert.equal((await request(`/admin/accounts/${owner._id}`, { email: owner.email, role: "technical", version: 0 }, "PATCH", true)).status, 409);
      const edited = await request(`/admin/accounts/${owner._id}`, { email: owner.email, role: "admin", password: "UpdatedOwnerPassword9", version: 0 }, "PATCH", true);
      assert.equal(edited.status, 200); assert.equal((await edited.json()).reauthenticate, true);
      assert.equal((await request("/admin/me", undefined, "GET", true)).status, 401);
      assert.equal((await request("/admin/login", { email: owner.email, password: config.adminPassword })).status, 401);
      const login = await request("/admin/login", { email: owner.email, password: "UpdatedOwnerPassword9" }); assert.equal(login.status, 200); cookie = cookieHeader(login);
      await ensureAdmin(db, { ...config, adminEmail: "backup.owner@gmail.com" });
      const deleted = await request(`/admin/accounts/${owner._id}`, undefined, "DELETE", true);
      assert.equal(deleted.status, 200); assert.equal((await deleted.json()).reauthenticate, true);
      assert.equal((await request("/admin/me", undefined, "GET", true)).status, 401);
      await ensureInitialAdmin(db, config);
      assert.equal(await db.collection("admins").findOne({ email: owner.email }), null, "restart does not recreate a deleted configured owner");
      const backupLogin = await request("/admin/login", { email: "backup.owner@gmail.com", password: config.adminPassword });
      assert.equal(backupLogin.status, 200); cookie = cookieHeader(backupLogin);
      assert.equal((await request("/admin/accounts", undefined, "GET", true)).status, 200);
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

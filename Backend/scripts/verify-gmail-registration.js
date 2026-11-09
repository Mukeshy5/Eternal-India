import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { gmailIdentity } from "../lib/email-identity.js";
import { createMailer } from "../lib/mailer.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";

const source = readConfig(), recipient = gmailIdentity(process.env.OTP_TEST_EMAIL);
if (!createMailer(source).gmailConfigured || !recipient) {
  console.error("Real Gmail verification cannot start. Set SMTP_USER, SMTP_PASSWORD (Google App Password), SMTP_HOST=smtp.gmail.com and OTP_TEST_EMAIL in Backend/.env. No email was sent and no account was created.");
  process.exitCode = 1;
} else {
  await createMailer(source).verify();
  const config = { ...source, databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "gmail-test-owner@eternal-india.local", technicalEmail: "", adminPassword: randomBytes(24).toString("hex") };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`, input = createInterface({ input: process.stdin, output: process.stdout });
  const publicJar = {}, ownerJar = {};
  async function request(path, body, jar = publicJar, method = "POST") {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: config.origins[0], ...(jar.cookie ? { Cookie: jar.cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(35000) });
    if (response.headers.get("set-cookie")) jar.cookie = cookieHeader(response, jar.cookie);
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  async function waitForResend(sent) {
    const until = Date.parse(sent.resendAvailableAt) + 100;
    if (Date.now() < until) console.log("Waiting for the real 60-second resend window...");
    while (Date.now() < until) await delay(Math.min(1000, until - Date.now()));
  }
  async function receivedCode(label) {
    for (;;) { const value = (await input.question(`${label}: enter the six-digit code received in Gmail: `)).trim(); if (/^\d{6}$/.test(value)) return value; console.log("Enter exactly six digits from the real email."); }
  }
  async function verifySent(sent, body, jar, label) {
    const otp = await receivedCode(label);
    const result = await request("/auth/verify-otp", { ...body, challengeId: sent.challengeId, otp }, jar);
    assert.equal(result.status, 200, result.data.message); return otp;
  }
  try {
    const first = await request("/auth/send-otp", { email: recipient.email }); assert.equal(first.status, 200, first.data.message);
    assert.equal(await db.collection("admins").countDocuments(), 1, "sending an OTP cannot create an account");
    const cooldown = await request("/auth/send-otp", { email: recipient.email }); assert.equal(cooldown.status, 429);
    const firstCode = await receivedCode("First email");
    const stored = await db.collection("email_verifications").findOne({ challengeId: first.data.challengeId });
    assert.match(stored.otpHash, /^[a-f\d]{64}$/); assert.notEqual(stored.otpHash, firstCode); assert.equal(stored.verified, false);
    assert.ok(stored.expiresAt - stored.createdAt === 5 * 60000);
    // Test the server's expiry check on the actual delivered challenge, without waiting five minutes.
    await db.collection("email_verifications").updateOne({ _id: stored._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await request("/auth/verify-otp", { email: recipient.email, challengeId: first.data.challengeId, otp: firstCode })).status, 400);
    await waitForResend(first.data);
    const resent = await request("/auth/send-otp", { email: recipient.email }); assert.equal(resent.status, 200, resent.data.message);
    await verifySent(resent.data, { email: recipient.email }, publicJar, "Resent email");
    const verified = await db.collection("email_verifications").findOne({ challengeId: resent.data.challengeId }); assert.equal(verified.verified, true); assert.equal(verified.otpHash, undefined);
    const password = randomBytes(20).toString("hex");
    const registration = await request("/auth/register", { email: recipient.email, password }); assert.equal(registration.status, 202, registration.data.message);
    let account = await db.collection("admins").findOne({ gmailKey: recipient.gmailKey }); assert.equal(account.emailVerified, true); assert.equal(account.status, "pending");
    assert.equal(await db.collection("email_verifications").countDocuments(), 0, "used verification proofs are removed");
    assert.equal((await request("/auth/register", { email: recipient.email, password })).status, 409);
    assert.equal((await request("/admin/login", { email: config.adminEmail, password: config.adminPassword }, ownerJar)).status, 200);
    assert.equal((await request(`/admin/accounts/${account._id}/approve`, {}, ownerJar, "PATCH")).status, 200);
    account = await db.collection("admins").findOne({ _id: account._id });
    const changedPassword = randomBytes(20).toString("hex");
    const edit = await request(`/admin/accounts/${account._id}`, { email: account.email, role: "technical", password: changedPassword, version: account.version }, ownerJar, "PATCH"); assert.equal(edit.status, 200, edit.data.message);
    assert.equal((await request("/technical/login", { email: account.email, password: changedPassword }, {})).status, 200);
    assert.equal((await request(`/admin/accounts/${account._id}`, undefined, ownerJar, "DELETE")).status, 204);
    assert.equal(await db.collection("admins").countDocuments({ gmailKey: recipient.gmailKey }), 0);
    await waitForResend(resent.data);
    const managed = await request("/auth/send-otp", { email: recipient.email, purpose: "account-create" }, ownerJar); assert.equal(managed.status, 200, managed.data.message);
    await verifySent(managed.data, { email: recipient.email, purpose: "account-create" }, ownerJar, "Admin account creation email");
    const created = await request("/admin/accounts", { email: recipient.email, password, role: "technical" }, ownerJar); assert.equal(created.status, 201, created.data.message);
    const tagEmail = `${recipient.gmailKey.split("@")[0]}+otp-edit@gmail.com`;
    await waitForResend(managed.data);
    const emailEdit = await request("/auth/send-otp", { email: tagEmail, purpose: "account-edit", accountId: created.data.account._id }, ownerJar); assert.equal(emailEdit.status, 200, emailEdit.data.message);
    await verifySent(emailEdit.data, { email: tagEmail, purpose: "account-edit", accountId: created.data.account._id }, ownerJar, "Account email change email");
    const changed = await request(`/admin/accounts/${created.data.account._id}`, { email: tagEmail, role: "technical", version: created.data.account.version }, ownerJar, "PATCH"); assert.equal(changed.status, 200, changed.data.message);
    assert.equal(changed.data.account.email, tagEmail);
    assert.equal((await request(`/admin/accounts/${created.data.account._id}`, undefined, ownerJar, "DELETE")).status, 204);
    console.log("PASS real Gmail SMTP delivery, secure MongoDB OTP records, expiry, resend cooldown, verified registration, duplicate prevention, approval, login, admin account creation, verified email editing and deletion.");
  } finally {
    input.close(); await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to delete a non-test database.");
    await db.dropDatabase(); await client.close();
  }
}

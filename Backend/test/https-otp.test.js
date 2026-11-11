import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";

test("HTTPS OTP delivery preserves verification gates and releases failed-delivery reservations", async () => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "https-otp-owner@example.com", technicalEmail: "", adminPassword: "HttpsOtpOwnerPassword9", smtp: {}, email: { provider: "resend", apiKey: "fixture-private-key", from: "otp@example.com" } };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const originalFetch = globalThis.fetch, messages = [];
  let providerFails = true, cookie = "";
  // Only the external provider is simulated; the API, hashing, session and MongoDB
  // flows below are real. No real email or API key is used by this test.
  globalThis.fetch = async (url, options) => {
    if (url !== "https://api.resend.com/emails") return originalFetch(url, options);
    messages.push(JSON.parse(options.body));
    return providerFails ? Response.json({ message: "fixture-private-key must never reach the browser" }, { status: 500 }) : Response.json({ id: randomUUID() });
  };
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const request = async (path, body) => {
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: config.origins[0], ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    if (response.headers.get("set-cookie")) cookie = cookieHeader(response, cookie);
    return { status: response.status, data: await response.json() };
  };
  try {
    const email = "https.otp.recipient@gmail.com", password = "HttpsOtpRecipientPassword9";
    const registration = await request("/technical/register", { email: "https.no.otp@gmail.com", password });
    assert.equal(registration.status, 403, "Technical self-registration is disabled independently of SMTP");
    assert.equal(await db.collection("admins").findOne({ email: "https.no.otp@gmail.com" }), null);
    const failed = await request("/auth/send-otp", { email });
    assert.equal(failed.status, 503); assert.equal(failed.data.code, "EMAIL_DELIVERY_FAILED");
    assert.ok(!JSON.stringify(failed.data).includes("fixture-private-key"));
    assert.equal(await db.collection("email_verifications").countDocuments(), 0);
    assert.ok((await db.collection("email_verification_limits").find({}).toArray()).every((record) => record.count === 0), "failed delivery does not consume a send slot or enforce the resend cooldown");

    providerFails = false;
    const sent = await request("/auth/send-otp", { email });
    assert.equal(sent.status, 200); assert.equal(messages.length, 2);
    const otp = messages[1].text.match(/verification code is (\d{6})/)[1];
    assert.ok(!JSON.stringify(sent.data).includes(otp), "the API never returns the OTP");
    const stored = await db.collection("email_verifications").findOne({ email });
    assert.equal(stored.state, "sent"); assert.equal(stored.verified, false); assert.notEqual(stored.otpHash, otp);
    assert.equal((await request("/auth/send-otp", { email })).status, 429, "successful delivery enforces the actual resend cooldown");
    const incorrect = otp === "000000" ? "111111" : "000000";
    assert.equal((await request("/auth/verify-otp", { email, challengeId: sent.data.challengeId, otp: incorrect })).status, 400);
    const verified = await request("/auth/verify-otp", { email, challengeId: sent.data.challengeId, otp });
    assert.equal(verified.status, 200, "OTP verification remains available outside registration");
    assert.equal((await db.collection("email_verifications").findOne({ email })).verified, true);
    assert.equal(await db.collection("admins").countDocuments({ email }), 0, "using OTP for another flow does not create an account");
  } finally {
    globalThis.fetch = originalFetch;
    await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to remove a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

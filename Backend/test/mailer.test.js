import test from "node:test";
import assert from "node:assert/strict";
import { createMailer } from "../lib/mailer.js";

const config = { companyName: "Eternal India", email: { provider: "resend", apiKey: "fixture-private-key", from: "otp@example.com" }, smtp: { host: "smtp.gmail.com", user: "sender@gmail.com", password: "smtp-fixture", port: 465, secure: true } };

test("OTP and recovery use HTTPS with no SMTP fallback or false delivery verification", async () => {
  const calls = [];
  const mailer = createMailer(config, { fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ id: "provider-message-id" }); } });
  assert.equal(mailer.configured, true); assert.equal(mailer.otpConfigured, true); assert.equal(mailer.gmailConfigured, false);
  assert.deepEqual(await mailer.verify(), { provider: "resend", configured: true, deliveryVerified: false });
  assert.equal(calls.length, 0, "configuration checking does not send a real message");
  await mailer.sendOtp("recipient@gmail.com", "123456");
  await mailer.sendPasswordReset({ email: "recipient@gmail.com", resetUrl: "https://frontend.example.com/admin/reset-password?token=fixture" });
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url, "https://api.resend.com/emails"); assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer fixture-private-key");
    assert.ok(options.headers["Idempotency-Key"]); assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body); assert.equal(body.from, "Eternal India <otp@example.com>"); assert.deepEqual(body.to, ["recipient@gmail.com"]);
  }
  assert.notEqual(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
  assert.ok(JSON.parse(calls[0].options.body).html.includes("123456"));
  assert.ok(JSON.parse(calls[1].options.body).text.includes("https://frontend.example.com/admin/reset-password?token=fixture"));
});

test("partial HTTPS configuration never falls back to SMTP or sends a request", async () => {
  for (const email of [{ provider: "resend", from: "otp@example.com" }, { provider: "resend", apiKey: "fixture-key" }]) {
    const mailer = createMailer({ ...config, email }, { fetchImpl: async () => assert.fail("incomplete configuration must not send") });
    assert.equal(mailer.configured, false); assert.equal(mailer.otpConfigured, false);
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_NOT_CONFIGURED" });
  }
});

test("Brevo HTTPS delivery uses api-key header and never echoes secrets", async () => {
  const calls = [];
  const brevoConfig = {
    companyName: "Eternal India",
    email: { provider: "brevo", brevoApiKey: "fixture-brevo-key", brevoSenderEmail: "otp@example.com", brevoSenderName: "Eternal India" },
    smtp: { host: "smtp.gmail.com", user: "sender@gmail.com", password: "smtp-fixture", port: 465, secure: true },
  };
  const mailer = createMailer(brevoConfig, { fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ messageId: "brevo-msg-123" }); } });
  assert.equal(mailer.configured, true); assert.equal(mailer.otpConfigured, true); assert.equal(mailer.gmailConfigured, false);
  assert.deepEqual(await mailer.verify(), { provider: "brevo", configured: true, deliveryVerified: false });
  assert.equal(calls.length, 0, "configuration checking does not send a real message");
  await mailer.sendOtp("recipient@gmail.com", "123456");
  await mailer.sendPasswordReset({ email: "recipient@gmail.com", resetUrl: "https://frontend.example.com/admin/reset-password?token=fixture" });
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url, "https://api.brevo.com/v3/smtp/email"); assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.headers["api-key"], "fixture-brevo-key"); assert.equal(options.headers["Content-Type"], "application/json");
    assert.ok(options.headers["accept"]); assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.sender.email, "otp@example.com"); assert.equal(body.sender.name, "Eternal India");
    assert.deepEqual(body.to, [{ email: "recipient@gmail.com" }]);
  }
  assert.ok(JSON.parse(calls[0].options.body).textContent.includes("123456"));
  assert.ok(JSON.parse(calls[1].options.body).textContent.includes("https://frontend.example.com/admin/reset-password?token=fixture"));
});

test("Brevo partial configuration is not configured and never sends", async () => {
  for (const email of [
    { provider: "brevo", brevoSenderEmail: "otp@example.com" },
    { provider: "brevo", brevoApiKey: "fixture-key" },
    { provider: "brevo" },
  ]) {
    const mailer = createMailer({ ...config, email }, { fetchImpl: async () => assert.fail("incomplete Brevo configuration must not send") });
    assert.equal(mailer.configured, false); assert.equal(mailer.otpConfigured, false);
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_NOT_CONFIGURED" });
  }
});

test("Brevo provider failures never echo keys, OTPs or raw provider messages", async () => {
  for (const [status, code] of [[401, "EMAIL_PROVIDER_REJECTED"], [403, "EMAIL_PROVIDER_REJECTED"], [422, "EMAIL_DELIVERY_FAILED"], [429, "EMAIL_RATE_LIMITED"], [500, "EMAIL_DELIVERY_FAILED"]]) {
    const mailer = createMailer({ ...config, email: { provider: "brevo", brevoApiKey: "fixture-brevo-key", brevoSenderEmail: "otp@example.com", brevoSenderName: "Eternal India" } }, { fetchImpl: async () => Response.json({ message: "fixture-private-key 123456 private provider details" }, { status, headers: { "retry-after": "30" } }) });
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), (error) => {
      assert.equal(error.code, code); assert.ok(!/fixture-brevo-key|123456|private provider details/.test(error.message));
      if (status === 429) assert.equal(error.retryAfter, 30);
      return true;
    });
  }
  const unreachable = createMailer({ ...config, email: { provider: "brevo", brevoApiKey: "fixture-brevo-key", brevoSenderEmail: "otp@example.com", brevoSenderName: "Eternal India" } }, { fetchImpl: async () => { throw new Error("fixture-private-key"); } });
  await assert.rejects(unreachable.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_CONNECTION_FAILED" });
  for (const response of [Response.json({}), new Response("not JSON", { status: 200 })]) {
    const mailer = createMailer({ ...config, email: { provider: "brevo", brevoApiKey: "fixture-brevo-key", brevoSenderEmail: "otp@example.com", brevoSenderName: "Eternal India" } }, { fetchImpl: async () => response });
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_DELIVERY_FAILED" });
  }
});

test("provider failures never echo keys, OTPs or raw provider messages", async () => {
  for (const [status, code] of [[401, "EMAIL_PROVIDER_REJECTED"], [403, "EMAIL_PROVIDER_REJECTED"], [422, "EMAIL_DELIVERY_FAILED"], [429, "EMAIL_RATE_LIMITED"], [500, "EMAIL_DELIVERY_FAILED"]]) {
    const mailer = createMailer(config, { fetchImpl: async () => Response.json({ message: "fixture-private-key 123456 private provider details" }, { status, headers: { "retry-after": "30" } }) });
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), (error) => {
      assert.equal(error.code, code); assert.ok(!/fixture-private-key|123456|private provider details/.test(error.message));
      if (status === 429) assert.equal(error.retryAfter, 30);
      return true;
    });
  }
  const unreachable = createMailer(config, { fetchImpl: async () => { throw new Error("fixture-private-key"); } });
  await assert.rejects(unreachable.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_CONNECTION_FAILED" });
  for (const response of [Response.json({}), new Response("not JSON", { status: 200 })]) {
    const mailer = createMailer(config, { fetchImpl: async () => response });
    await assert.rejects(mailer.sendOtp("recipient@gmail.com", "123456"), { code: "EMAIL_DELIVERY_FAILED" });
  }
});

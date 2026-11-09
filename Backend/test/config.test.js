import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../config/env.js";

const base = { SESSION_SECRET: "isolated-config-test-secret-at-least-32-characters" };
test("Render binds publicly even when copied development settings specify localhost", () => {
  for (const render of [{ RENDER: "true" }, { RENDER_SERVICE_ID: "srv-test" }, { RENDER_EXTERNAL_HOSTNAME: "example.onrender.com" }]) {
    const config = readConfig({ ...base, ...render, NODE_ENV: "development", HOST: "127.0.0.1", PORT: "10001" });
    assert.equal(config.host, "0.0.0.0"); assert.equal(config.port, 10001); assert.equal(config.production, true);
  }
  assert.equal(readConfig({ ...base, RENDER: "true" }).port, 10000);
});
test("local development keeps loopback while ordinary production supports explicit binding", () => {
  assert.equal(readConfig(base).host, "127.0.0.1"); assert.equal(readConfig(base).port, 5000);
  assert.equal(readConfig({ ...base, NODE_ENV: "production" }).host, "0.0.0.0");
  assert.equal(readConfig({ ...base, HOST: "192.0.2.1" }).host, "192.0.2.1");
  assert.throws(() => readConfig({ ...base, RENDER: "true", PORT: "invalid" }), /valid port/);
});
test("Gmail configuration rejects mailto links instead of attempting invalid SMTP authentication", () => {
  assert.throws(() => readConfig({ ...base, SMTP_HOST: "smtp.gmail.com", SMTP_USER: "mailto:sender@gmail.com" }), /SMTP_USER must be a Gmail address/);
});
test("Render allows the deployed Vercel frontend even with copied development origins", () => {
  const config = readConfig({ ...base, RENDER: "true", FRONTEND_ORIGIN: "http://localhost:5173/" });
  assert.equal(config.origins[0], "https://eternal-india-phi.vercel.app", "password recovery links use the live frontend rather than copied localhost settings");
  assert.ok(!config.origins.includes("*"));
  assert.deepEqual(readConfig(base).origins, ["http://localhost:5173"]);
  assert.deepEqual(readConfig({ ...base, NODE_ENV: "production" }).origins, ["https://eternal-india-phi.vercel.app"]);
});
test("HTTPS delivery takes precedence only when configured and SMTP remains explicitly selectable", () => {
  assert.equal(readConfig(base).email.provider, "smtp");
  const resend = readConfig({ ...base, RESEND_API_KEY: "fixture-key", EMAIL_FROM: "Eternal India <otp@example.com>" });
  assert.equal(resend.email.provider, "resend"); assert.equal(resend.email.from, "otp@example.com");
  const brevo = readConfig({ ...base, BREVO_API_KEY: "fixture-brevo-key", BREVO_SENDER_EMAIL: "otp@example.com", BREVO_SENDER_NAME: "Eternal India" });
  assert.equal(brevo.email.provider, "brevo"); assert.equal(brevo.email.brevoApiKey, "fixture-brevo-key"); assert.equal(brevo.email.brevoSenderEmail, "otp@example.com"); assert.equal(brevo.email.brevoSenderName, "Eternal India");
  assert.equal(readConfig({ ...base, BREVO_API_KEY: "fixture-key", EMAIL_PROVIDER: "smtp" }).email.provider, "smtp");
  assert.equal(readConfig({ ...base, EMAIL_PROVIDER: "resend" }).email.provider, "resend");
  assert.equal(readConfig({ ...base, EMAIL_PROVIDER: "brevo" }).email.provider, "brevo");
  assert.equal(readConfig({ ...base, RESEND_API_KEY: "fixture-key", BREVO_API_KEY: "fixture-brevo-key" }).email.provider, "brevo");
  assert.throws(() => readConfig({ ...base, EMAIL_PROVIDER: "invalid" }), /EMAIL_PROVIDER/);
  assert.throws(() => readConfig({ ...base, EMAIL_FROM: "not-an-address" }), /EMAIL_FROM/);
  assert.throws(() => readConfig({ ...base, BREVO_SENDER_EMAIL: "not-an-address" }), /BREVO_SENDER_EMAIL/);
});

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

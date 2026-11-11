import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { hashPassword } from "../lib/passwords.js";

test("the deployed server opens Render's public port with copied localhost settings and no SMTP", { timeout: 60000 }, async () => {
  const databaseName = `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const config = { ...readConfig(), databaseName };
  const { client, db } = await connectDatabase(config);
  const disabledAccount = { email: "disabled.startup@example.com", passwordHash: await hashPassword("DisabledStartupPassword9"), roles: ["technical"], status: "disabled", emailVerified: true, createdAt: new Date() };
  await db.collection("admins").insertOne(disabledAccount);
  const reservation = createServer().listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  let child, output = "";
  try {
    child = spawn(process.execPath, ["server.js"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true,
      env: { ...process.env, MONGO_DB: databaseName, RENDER: "true", NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(port), ADMIN_EMAIL: "render-startup@example.com", ADMIN_PASSWORD: "RenderStartupPassword9", FRONTEND_ORIGIN: "https://frontend.example.com", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_FROM: "", GMAIL_USER: "", GMAIL_APP_PASSWORD: "", EMAIL_PROVIDER: "smtp", RESEND_API_KEY: "", EMAIL_FROM: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const started = Date.now();
    while (!output.includes(`listening on 0.0.0.0:${port}`)) {
      if (child.exitCode !== null) assert.fail(`Server exited before opening HTTP: ${output}`);
      if (Date.now() - started > 30000) assert.fail(`Server did not bind Render's public port: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200); assert.equal((await health.json()).status, "ok");
    const disabledLogin = await fetch(`http://127.0.0.1:${port}/api/technical/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: disabledAccount.email, password: "DisabledStartupPassword9" }) });
    assert.equal(disabledLogin.status, 403, "email verification must not reactivate a disabled account on deployment");
    assert.equal((await db.collection("admins").findOne({ email: disabledAccount.email })).status, "disabled", "startup preserves the disabled status in MongoDB");
    const preflight = await fetch(`http://127.0.0.1:${port}/api/admin/login`, { method: "OPTIONS", headers: { Origin: "https://eternal-india-phi.vercel.app", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://eternal-india-phi.vercel.app");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: "https://untrusted.example.com" } })).status, 403);
    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://frontend.example.com", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ email: "render-startup@example.com", password: "RenderStartupPassword9" }) });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith("eternal_india.auth=")));
    assert.ok(cookies.some((cookie) => cookie.startsWith("eternal_india.sid=")), "Render HTTPS forwarding supports secure OTP session cookies");
    for (const cookie of cookies) { assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=None/); }
    assert.ok(output.includes("Email delivery is not configured"), "missing email setup does not prevent a healthy deployment");
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to delete a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

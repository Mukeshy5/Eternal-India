import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";

test("the deployed server opens Render's public port with copied localhost settings and no SMTP", { timeout: 60000 }, async () => {
  const databaseName = `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const config = { ...readConfig(), databaseName };
  const { client, db } = await connectDatabase(config);
  const reservation = createServer().listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  let child, output = "";
  try {
    child = spawn(process.execPath, ["server.js"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true,
      env: { ...process.env, MONGO_DB: databaseName, RENDER: "true", NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(port), ADMIN_EMAIL: "render-startup@example.com", ADMIN_PASSWORD: "RenderStartupPassword9", FRONTEND_ORIGIN: "https://frontend.example.com", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_FROM: "", GMAIL_USER: "", GMAIL_APP_PASSWORD: "" },
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
    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://frontend.example.com", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ email: "render-startup@example.com", password: "RenderStartupPassword9" }) });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith("eternal_india.auth=")));
    assert.ok(cookies.some((cookie) => cookie.startsWith("eternal_india.sid=")), "Render HTTPS forwarding supports secure OTP session cookies");
    for (const cookie of cookies) { assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=None/); }
    assert.ok(output.includes("SMTP is not configured"), "missing email setup does not prevent a healthy deployment");
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to delete a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

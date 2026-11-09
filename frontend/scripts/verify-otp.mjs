import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";

export async function verifyOtpGates(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "otp-ui-owner@eternal-india.local", technicalEmail: "", adminPassword: "OtpUiOwnerPassword9", smtp: {} };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const legacy = await ensureAdmin(db, { ...config, adminEmail: "existing.ui.account@gmail.com" });
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = new Window({ url: "http://localhost/admin/register" }), previous = new Map();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const originalFetch = globalThis.fetch; let cookie = "";
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const response = await originalFetch(base + url, { ...options, headers: { ...options.headers, Origin: config.origins[0], ...(cookie ? { Cookie: cookie } : {}) } });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0]; return response;
  };
  browser.confirm = () => true;
  const { createRoot } = await import("react-dom/client"), container = browser.document.createElement("div"); browser.document.body.append(container); const root = createRoot(container);
  const waitFor = async (check, label) => { for (let i = 0; i < 200; i++) { let result; await act(async () => { result = await check(); if (!result) await new Promise((resolve) => setTimeout(resolve, 20)); }); if (result) return; } assert.fail(`${label}: ${container.textContent.slice(-1400)}`); };
  const type = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new browser.Event("input", { bubbles: true })); input.dispatchEvent(new browser.Event("change", { bubbles: true })); };
  try {
    const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/admin/register"] }, createElement(Admin))));
    await waitFor(() => container.querySelector(".gmail-send"), "public Gmail verification form");
    await act(async () => { type("#admin-email", "new.ui.account@gmail.com"); type("#admin-password", "NewUiPassword9"); type("#admin-confirm-password", "NewUiPassword9"); });
    assert.equal(container.querySelector('.admin-login-form button[type="submit"]').disabled, true);
    await act(async () => container.querySelector(".gmail-send").click());
    await waitFor(() => container.querySelector('[role="alert"]')?.textContent.includes("not available"), "real SMTP configuration error shown without granting verification");
    assert.equal(container.querySelector('.admin-login-form button[type="submit"]').disabled, true);
    assert.equal(await db.collection("admins").countDocuments(), 2); assert.equal(await db.collection("email_verifications").countDocuments(), 0);
    await act(async () => root.render(null));
    const login = await globalThis.fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) }); assert.equal(login.status, 200);
    await act(async () => root.render(createElement(MemoryRouter, { key: "managed", initialEntries: ["/admin/accounts"] }, createElement(Admin))));
    await waitFor(() => container.querySelectorAll(".panel-record-row").length === 2, "real managed account list");
    await act(async () => { type('[name="accountEmail"]', "managed.ui.account@gmail.com"); type('[name="accountPassword"]', "ManagedUiPassword9"); });
    assert.equal(container.querySelector('.admin-tool-form button[type="submit"]').disabled, true);
    await act(async () => container.querySelector(".gmail-send").click());
    await waitFor(() => container.querySelector('[role="alert"]')?.textContent.includes("not available"), "managed accounts use the same real verification API");
    const row = [...container.querySelectorAll(".panel-record-row")].find((item) => item.textContent.includes(legacy.email));
    await act(async () => [...row.querySelectorAll("button")].find((button) => button.textContent === "Edit account").click());
    assert.equal(container.querySelector('[name="accountEmail"]').value, legacy.email);
    assert.equal(container.querySelector('.admin-tool-form button[type="submit"]').disabled, true, "legacy unverified Gmail must be verified before editing");
    await act(async () => [...row.querySelectorAll("button")].find((button) => button.textContent === "Delete account").click());
    await waitFor(async () => await db.collection("admins").findOne({ _id: legacy._id }) === null && container.querySelectorAll(".panel-record-row").length === 1, "account deletion updates MongoDB and UI");
    console.log("PASS real MongoDB/API public and managed Gmail gates, missing-delivery errors, protected account controls and permanent account deletion. Real Gmail delivery is tested separately with verify:gmail.");
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch; await browser.happyDOM.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to delete a non-test database.");
    await db.dropDatabase(); await client.close();
  }
}

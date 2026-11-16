import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";
import { cookieHeader } from "../../Backend/lib/cookies.js";
import { invoiceNotes, invoiceToday } from "../../shared/invoices.js";

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
const config = { ...readConfig(), databaseName: `eternal_india_test_spui_${randomUUID().replaceAll("-", "").slice(0, 8)}`, adminEmail: "staff-portal-ui@example.com", technicalEmail: "", adminPassword: "PortalUITestPassword9!" };
let client, db, system, server, testWindow, root;
const previous = new Map(), originalFetch = globalThis.fetch, originalCreateURL = URL.createObjectURL, originalRevokeURL = URL.revokeObjectURL;
try {
  ({ client, db } = await connectDatabase(config)); await ensureAdmin(db, config);
  system = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await system.decorationsReady;
  server = system.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  testWindow = new Window({ url: "http://localhost/staff/login" });
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, Event: testWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  let cookie = ""; const downloads = [];
  URL.createObjectURL = (blob) => { downloads.push(blob); return `blob:staff-portal-${downloads.length}`; }; URL.revokeObjectURL = () => {};
  testWindow.HTMLAnchorElement.prototype.click = () => {}; testWindow.confirm = () => true;
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const reply = await originalFetch(base + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    cookie = cookieHeader(reply, cookie); return reply;
  };
  const call = async (path, body, method = "POST") => { const reply = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); const result = reply.status === 204 ? null : await reply.json(); assert.ok(reply.ok, `${path}: ${reply.status} ${JSON.stringify(result)}`); return result; };
  await call("/technical/login", { email: config.adminEmail, password: config.adminPassword });
  const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64"), now = new Date();
  const employee = { employeeId: "EI-AABBCCDDEEFF", name: "Staff UI Employee", email: "staff-ui-person@example.com", phone: "+919876543219", department: "Operations", designation: "Tour coordinator", status: "active", photo, photoMime: "image/png", version: 1, createdAt: now, updatedAt: now, deletedAt: null };
  await db.collection("staff").insertOne(employee);
  const invoice = (await call("/technical/invoices", { requestId: randomUUID(), invoiceDate: invoiceToday(), clientName: "Staff UI Client", totalPerson: 2, perPersonAmount: "1500", recipientDetails: "Delhi", description: "Travel / Tour Services", notes: invoiceNotes, invoiceType: "invoice" })).invoice;
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); root = createRoot(container);
  const { default: AccountManager } = await vite.ssrLoadModule("/src/Common/staff-portal/StaffAccountManager.jsx");
  const { default: StaffPanel } = await vite.ssrLoadModule("/src/Common/staff-portal/StaffPanel.jsx");
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check, label) { for (let index = 0; index < 300; index++) { let result; await act(async () => { result = await check(); if (!result) await delay(30); }); if (result) return; } assert.fail(`Timed out: ${label}. UI: ${container.textContent.slice(-2500)}`); }
  const type = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); };
  async function click(label, scope = container) { const button = [...scope.querySelectorAll("button")].find((element) => element.textContent.trim() === label); assert.ok(button, label); assert.equal(button.disabled, false, label); await act(async () => button.click()); }
  const submit = async (selector) => act(async () => container.querySelector(selector).dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(AccountManager, { onUnauthorized: () => assert.fail("Unexpected technical logout") }))));
  await waitFor(() => container.textContent.includes("No staff accounts found"), "account list");
  await act(async () => type('[name="employeeId"]', employee.employeeId)); await click("Verify employee"); await waitFor(() => container.textContent.includes("Active employee verified"), "employee lookup");
  await click("Generate secure credentials"); await waitFor(() => container.querySelector('[name="password"]').value.length >= 12, "credential generation");
  await act(async () => { type('[name="username"]', "staff.ui"); type('[name="password"]', "UiAssignedStaff12!"); }); await submit(".staff-create-form");
  await waitFor(() => container.textContent.includes("Staff Login account created"), "account persisted");
  const saved = await db.collection("staff_accounts").findOne({ staffId: employee._id }); assert.ok(saved); assert.equal(saved.username, "staff.ui");
  await waitFor(() => container.textContent.includes("Manage access"), "account row"); await click("Manage access"); await waitFor(() => container.textContent.includes(invoice.invoiceNumber), "invoice access choices"); await click("Grant access"); await waitFor(() => container.textContent.includes("Revoke access"), "invoice grant");
  await act(async () => root.render(createElement(MemoryRouter, { key: "staff", initialEntries: ["/staff/login"] }, createElement(StaffPanel))));
  await waitFor(() => container.querySelector("#staff-username"), "staff login"); assert.equal([...container.querySelectorAll("a")].some((link) => /register/.test(link.href)), false);
  await act(async () => { type("#staff-username", "staff.ui"); type("#staff-password", "UiAssignedStaff12!"); }); await submit(".admin-login-form");
  await waitFor(() => container.querySelector(".staff-session-strip"), "staff session");
  const navigation = container.querySelector(".panel-navigation"); for (const label of ["All Enquiries", "Notifications", "Journey Voucher", "Journey History", "Download ID Card", "My Attendance History", "Billing / Invoice", "Change Password"]) assert.ok(navigation.textContent.includes(label), label);
  assert.equal(container.querySelector('a[href="/admin"]'), null); assert.equal(container.querySelector('a[href="/technical"]'), null);
  await click("Notifications", navigation); await waitFor(() => container.textContent.includes("Welcome to your Staff Panel"), "personal notifications");
  await click("My Attendance History", navigation); await waitFor(() => container.textContent.includes("No attendance has been recorded"), "personal attendance");
  await click("Download ID Card", navigation); await waitFor(() => container.querySelector(".staff-card-view img"), "ID card preview"); await click("Download printable PDF"); await waitFor(() => downloads.some((blob) => blob.type === "application/pdf"), "PDF download");
  await click("Billing / Invoice", navigation); await waitFor(() => container.textContent.includes(invoice.invoiceNumber), "authorized invoice"); await click("View invoice"); await waitFor(() => container.querySelector(".invoice-document"), "invoice preview");
  await click("Journey History", navigation); await waitFor(() => container.querySelector(".billing-history"), "journey history");
  await click("Journey Voucher", navigation); await waitFor(() => container.querySelector(".billing-editor-heading h2")?.textContent.startsWith("Invoice #"), "reused voucher editor and completed invoice reservation");
  await click("Change Password", navigation); await waitFor(() => container.querySelector(".staff-password-form"), "password form");
  const passwordInputs = container.querySelectorAll('.staff-password-form input');
  await act(async () => { for (const [index, value] of ["UiAssignedStaff12!", "NewUiAssignedStaff34!", "NewUiAssignedStaff34!"].entries()) { Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(passwordInputs[index], value); passwordInputs[index].dispatchEvent(new testWindow.Event("input", { bubbles: true })); } });
  await submit(".staff-password-form"); await waitFor(() => container.querySelector("#staff-username") && container.textContent.includes("Password changed"), "password rotation and return to login");
  console.log("PASS Staff Panel UI with real MongoDB: technical account creation, employee verification, credential generation, invoice grants, username login, all eight modules, ID-card download, invoice preview and password rotation");
} finally {
  if (root) await act(async () => root.unmount()); globalThis.fetch = originalFetch; URL.createObjectURL = originalCreateURL; URL.revokeObjectURL = originalRevokeURL;
  for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  await testWindow?.happyDOM.close(); system?.decorationScheduler.stop(); await system?.enquirySystem.stop(); await system?.drainSessions(); if (server) await new Promise((resolve) => server.close(resolve));
  if (db) { if (!config.databaseName.startsWith("eternal_india_test_spui_")) throw new Error("Unsafe test database cleanup"); await db.dropDatabase(); } await client?.close(); await vite.close();
}

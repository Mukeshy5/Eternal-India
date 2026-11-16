import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import { Window } from "happy-dom";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";
import { cookieHeader } from "./cookie-header.mjs";

const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "invoice-ui@example.com", technicalEmail: "", adminPassword: "InvoiceUITest9" };
const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening"); const origin = `http://127.0.0.1:${server.address().port}`;
const io = backend.enquirySystem.realtime.attach(server), vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom" });
const win = new Window({ url: `${origin}/admin/invoices` }), previous = new Map(), nativeFetch = globalThis.fetch;
const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL; let cookie = "", confirms = 0, invoiceEvents = 0; const downloads = [];
for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
win.confirm = () => { confirms++; return true; }; win.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
win.addEventListener("invoices-changed", () => invoiceEvents++);
URL.createObjectURL = () => "blob:invoice-ui-test"; URL.revokeObjectURL = () => {};
globalThis.fetch = async (url, options = {}) => {
  if (typeof url !== "string" || !url.startsWith("/api/")) return nativeFetch(url, options);
  const reply = await nativeFetch(origin + url, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) } });
  if (reply.headers.get("set-cookie")) cookie = cookieHeader(reply, cookie); return reply;
};
const { createRoot } = await import("react-dom/client"); const container = win.document.createElement("div"); win.document.body.append(container); const root = createRoot(container);
async function waitFor(check, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) { let result; await act(async () => { result = await check(); if (!result) await new Promise((done) => setTimeout(done, 80)); }); if (result) return; }
  assert.fail(`${label}: ${container.textContent.slice(-3000)}`);
}
const input = (name, value) => { const element = container.querySelector(`[name="${name}"]`); assert.ok(element, name); Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new win.Event("input", { bubbles: true })); };
async function click(label, scope = container) { const target = [...scope.querySelectorAll("button")].find((button) => button.textContent.trim() === label); assert.ok(target, label); assert.equal(target.disabled, false, label); await act(async () => target.click()); }
async function submit() { await act(async () => container.querySelector(".invoice-form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }))); }
try {
  const reply = await globalThis.fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) }); assert.equal(reply.status, 200);
  const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
  async function render(panel) { await act(async () => root.render(createElement(MemoryRouter, { key: panel, initialEntries: [`/${panel}/invoices`] }, createElement(Admin, { technical: panel === "technical" })))); await waitFor(() => container.querySelector(".invoice-history") && !container.querySelector(".invoice-history").getAttribute("aria-busy").includes("true"), `${panel} invoice route`); }
  await render("admin"); assert.ok([...container.querySelectorAll(".panel-navigation button")].some((button) => button.textContent.endsWith("Billing / Invoice")));
  await click("+ Create invoice");
  await act(async () => { input("clientName", "Invoice UI Client"); input("totalPerson", "4"); input("perPersonAmount", "15000"); input("recipientDetails", "Accounts\nNew Delhi"); });
  assert.ok(container.querySelector("output").textContent.includes("60,000.00"));
  assert.ok(container.querySelector(".invoice-document").textContent.includes("921020029366590")); assert.ok(container.querySelector(".invoice-qr img").src.includes("payment-QR.png")); assert.doesNotMatch(container.querySelector(".invoice-document").textContent, /For ETERNAL INDIA PVT\. LTD\./);
  await submit(); await waitFor(() => container.querySelector(".invoice-detail") && !container.querySelector(".invoice-detail button").disabled, "invoice saved through UI");
  let saved = await db.collection("billing_invoices").findOne(); assert.equal(saved.totalAmount, 60000); assert.equal(saved.recipientDetails, "Accounts\nNew Delhi");
  await click("Download PDF", container.querySelector(".invoice-detail")); await waitFor(() => downloads.length === 1 && !container.querySelector(".invoice-detail button").disabled, "PDF download"); assert.equal(downloads[0], `Invoice-${saved.invoiceNumber}.pdf`);
  await click("PDF preview"); await waitFor(() => win.document.querySelector('[role="dialog"] iframe'), "shared PDF print preview");
  await act(async () => win.document.querySelector('[role="dialog"] iframe').dispatchEvent(new win.Event("load")));
  assert.ok([...win.document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent === "Print invoice" && !button.disabled)); await click("Close preview", win.document);
  await render("technical"); assert.ok(container.querySelector(".invoice-table tbody").textContent.includes(saved.invoiceNumber));
  await waitFor(() => io.engine.clientsCount > 0, "authenticated live connection"); invoiceEvents = 0;
  const remote = await nativeFetch(`${origin}/api/admin/invoices/${saved._id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...saved, version: saved.version, clientName: "Remote panel client", totalPerson: 2, perPersonAmount: "100.10" }) }); assert.equal(remote.status, 200);
  await waitFor(() => invoiceEvents > 0 && container.querySelector(".invoice-table tbody").textContent.includes("Remote panel client"), "cross-panel Socket.IO refresh");
  await click("Edit", container.querySelector(".invoice-table tbody")); await waitFor(() => container.querySelector('[name="clientName"]')?.value === "Remote panel client" && !container.querySelector(".invoice-form fieldset").disabled, "fresh edit fields");
  await act(async () => { input("totalPerson", "3"); input("perPersonAmount", "0.10"); }); assert.ok(container.querySelector("output").textContent.includes("0.30")); await submit();
  await waitFor(async () => (await db.collection("billing_invoices").findOne()).version === 3 && container.querySelector(".invoice-detail") && !container.querySelector(".invoice-detail button").disabled, "edit saved");
  saved = await db.collection("billing_invoices").findOne(); assert.equal(saved.totalPaise, 30);
  await click("Back to invoices"); await waitFor(() => container.querySelector(".invoice-table tbody tr"), "invoice register");
  const search = container.querySelector('input[type="search"]'); await act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(search, "missing-client"); search.dispatchEvent(new win.Event("input", { bubbles: true })); });
  await waitFor(() => container.querySelector(".invoice-empty")?.textContent.includes("No invoices found"), "backend search"); await click("Clear filters"); await waitFor(() => container.querySelector(".invoice-table tbody tr"), "filters cleared");
  const before = confirms; await click("Delete", container.querySelector(".invoice-table tbody")); await waitFor(async () => await db.collection("billing_invoices").countDocuments() === 0 && !!container.querySelector(".invoice-empty"), "confirmed deletion"); assert.equal(confirms, before + 1);
  console.log("Invoice UI verified: both panel routes, live calculation, persistence, original QR, PDF download/preview, realtime cross-panel updates, editing, search and confirmed deletion.");
} finally {
  await act(async () => root.unmount()); await win.happyDOM.abort(); globalThis.fetch = nativeFetch; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
  for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  await vite.close(); await backend.enquirySystem.stop(); await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((done) => server.close(done)); assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
}

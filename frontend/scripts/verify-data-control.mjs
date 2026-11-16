import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
const browser = new Window({ url: "http://localhost/technical/data-control?view=enquiries" });
const previous = new Map(), calls = [];
const originals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
for (const [key, value] of Object.entries(originals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
const originalFetch = globalThis.fetch;
const record = { _id: "507f1f77bcf86cd799439011", reference: "UI-CLOSED", name: "UI Test Guest", status: "CLOSED", receivedAt: "2024-01-15T09:00:00.000Z", storageBytes: 512 };
const backup = { _id: "12345678-1234-1234-1234-123456789abc", section: "all", reason: "manual", status: "verified", bytes: 1024, records: 1, files: 0, createdAt: "2026-11-15T09:00:00Z" };
const fixturePolicy = { frequency: "daily", backupRetentionDays: 30, retentionDays: 90, cleanupEnabled: false, cleanupSections: ["enquiries", "notifications"], nextBackupAt: "2026-11-16T09:00:00Z" };
globalThis.fetch = async (input, options = {}) => {
  const path = new URL(String(input), "http://localhost").pathname, body = options.body ? JSON.parse(options.body) : null; calls.push({ path, method: options.method || "GET", body });
  let response;
  if (path.endsWith("/preview")) response = { id: "preview-test", action: "delete", count: 1, bytes: 512, from: "2024-01-01", to: "2024-01-31" };
  else if (path.endsWith("/records/execute")) response = { changed: 1, skipped: 0, backupId: backup._id };
  else if (path.includes("/records/")) response = { records: [record], total: 1, bytes: 512, pages: 1, page: 1, fields: ["reference", "name", "status", "receivedAt"], protected: false };
  else if (path.endsWith("/storage")) response = { capacityBytes: 524288000, usedBytes: 1048576, availableBytes: 523239424, databaseBytes: 1048576, databaseDocumentBytes: 512, databaseIndexBytes: 0, uploadedFilesBytes: 0, embeddedUploadBytes: 0, temporaryBytes: 0, backupBytes: 0, percent: .2, status: "green", warnings: [], measuredAt: "2026-11-15T09:00:00Z", persistentBackupDirectoryConfigured: true };
  else if (path.endsWith("/statistics")) response = { points: [] };
  else if (path.endsWith("/policy")) response = body || fixturePolicy;
  else if (path.endsWith("/backups")) response = { backups: [backup], total: 1, page: 1 };
  else if (path.endsWith("/audit") || path.endsWith("/reports")) response = { records: [], total: 0, page: 1 };
  else throw new Error(`Unexpected UI API request: ${path}`);
  return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
};
const { createRoot } = await import("react-dom/client"), container = browser.document.createElement("div"); browser.document.body.append(container); const root = createRoot(container);
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
const click = async text => { const button = [...container.querySelectorAll("button")].find(item => item.textContent.trim() === text); assert.ok(button, `Button exists: ${text}`); await act(async () => button.click()); await settle(); return button; };
try {
  const { default: DataControl } = await server.ssrLoadModule("/src/Common/data-control/DataControl.jsx");
  const { panelSections, panelSection } = await server.ssrLoadModule("/src/Common/panel/panelNavigation.js"); assert.ok(panelSections["data-control"].technical); assert.equal(panelSection("/technical/data-control", "/technical"), "data-control");
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/technical/data-control?view=enquiries"] }, createElement(DataControl)))); await settle();
  assert.match(container.textContent, /UI-CLOSED/); assert.equal(container.querySelectorAll('.dc-tabs button').length, 7);
  const checkbox = container.querySelector('input[aria-label="Select 507f1f77bcf86cd799439011"]'); await act(async () => checkbox.click());
  await click("Delete selected"); assert.ok(container.querySelector("dialog[open]")); assert.match(container.querySelector("dialog").textContent, /Records selected1/); assert.match(container.querySelector("dialog").textContent, /512 B/);
  assert.ok(!calls.some(call => call.path.endsWith("/records/execute")), "preview never executes deletion");
  await click("Cancel"); assert.equal(container.querySelector("dialog"), null);
  await click("Delete selected"); await click("Back up & delete"); assert.equal(calls.filter(call => call.path.endsWith("/records/execute")).length, 1); assert.equal(calls.find(call => call.path.endsWith("/records/execute")).body.confirm, true);
  await click("Storage & Backup Management"); assert.match(container.textContent, /Storage overview/); assert.match(container.textContent, /No historical values are fabricated/); assert.match(container.textContent, /Backup management/);
  const progress = container.querySelector('[role="progressbar"]'); assert.equal(progress.getAttribute("aria-valuenow"), "0.2");
  await click("Total"); assert.ok(container.querySelector(".dc-breakdown")); await click("Monthly");
  await click("Restore"); const dialog = container.querySelector("dialog"); assert.match(dialog.textContent, /Existing production records/); const restoreButton = [...dialog.querySelectorAll("button")].find(button => button.textContent.includes("Create safety backup")); assert.ok(restoreButton.disabled); assert.equal(dialog.querySelector("button").disabled, false, "restore can be cancelled before typing confirmation");
  await click("Cancel"); assert.ok(!calls.some(call => call.path.endsWith("/restore")), "cancelled restore never reaches server");
  console.log("Data Control UI passed: navigation, live measurement display, charts, selection, backup-gated confirmation, cancellation and restore warning.");
} finally {
  await act(async () => root.unmount()); globalThis.fetch = originalFetch; await server.close(); await browser.happyDOM.close();
  for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
}

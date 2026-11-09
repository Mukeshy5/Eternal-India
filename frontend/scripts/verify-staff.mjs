import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { browserFormData } from "./browser-form-data.mjs";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";

export async function verifyStaff(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "staff-ui@example.com", technicalEmail: "", adminPassword: "StaffUITestPassword9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const testWindow = new Window({ url: "http://localhost/technical/staff" });
  const previous = new Map(), originalFetch = globalThis.fetch, nativeCreateURL = URL.createObjectURL, nativeRevokeURL = URL.revokeObjectURL;
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, FormData: browserFormData(testWindow), IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  testWindow.EventSource = undefined;
  let cookie = "", stopped = 0; const downloads = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64");
  Object.defineProperty(testWindow.navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
  testWindow.HTMLMediaElement.prototype.play = async () => {};
  Object.defineProperty(testWindow.HTMLMediaElement.prototype, "srcObject", { configurable: true, get() { return this.qaStream; }, set(value) { this.qaStream = value; } });
  Object.defineProperty(testWindow.HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 480 });
  Object.defineProperty(testWindow.HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 640 });
  testWindow.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  testWindow.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob([png], { type: "image/png" }));
  URL.createObjectURL = (blob) => { downloads.push(blob); return `blob:staff-test-${downloads.length}`; }; URL.revokeObjectURL = () => {};
  testWindow.HTMLAnchorElement.prototype.click = () => {}; testWindow.confirm = () => true;
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const response = await originalFetch(base + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0]; return response;
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); const root = createRoot(container);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check, label) { for (let i = 0; i < 250; i++) { let found; await act(async () => { found = await check(); if (!found) await delay(25); }); if (found) return; } assert.fail(`Timed out: ${label}. UI: ${container.textContent.slice(-1800)}`); }
  const type = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); };
  const select = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); input.value = value; input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); };
  async function click(label, scope = container) { const target = [...scope.querySelectorAll("button")].find((button) => button.textContent.trim() === label); assert.ok(target, label); assert.equal(target.disabled, false); await act(async () => target.click()); }
  async function section(label) { const target = [...container.querySelectorAll(".panel-navigation button")].find((button) => button.textContent.endsWith(label)); assert.ok(target, label); await act(async () => target.click()); await waitFor(() => !container.querySelector('[role="status"]')?.textContent.includes("Loading"), label); }
  const submit = async (selector) => act(async () => container.querySelector(selector).dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
  try {
    const login = await globalThis.fetch("/api/technical/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) }); assert.equal(login.status, 200);
    const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
    const { printIdCard } = await vite.ssrLoadModule("/src/Common/staff/EmployeeIdCard.jsx");
    const realDocument = globalThis.document; let printed = 0, removed = false, afterPrint;
    const printFrame = { remove() { removed = true; }, contentDocument: { querySelector: () => ({ complete: true }) }, contentWindow: { addEventListener: (_event, callback) => { afterPrint = callback; }, focus() {}, print() { printed++; } } };
    try {
      globalThis.document = { createElement: () => printFrame, body: { append: () => queueMicrotask(() => printFrame.onload()) } };
      await printIdCard(new Blob([png], { type: "image/png" }), new AbortController().signal);
      assert.equal(printed, 1); assert.ok(printFrame.srcdoc.includes("@page{size:53.98mm 85.60mm;margin:0}")); afterPrint(); assert.equal(removed, true);
    } finally { globalThis.document = realDocument; }
    await act(async () => root.render(createElement(MemoryRouter, { key: "technical", initialEntries: ["/technical/staff"] }, createElement(Admin, { technical: true }))));
    await waitFor(() => container.querySelector(".staff-workspace") && container.textContent.includes("No staff found"), "direct staff route and real authenticated empty list");
    await click("+ Add staff"); await click("Open live camera"); await waitFor(() => container.querySelector("video"), "live camera"); await click("Capture photo");
    assert.equal(stopped, 1, "capturing stops the camera track");
    await act(async () => { for (const [key, value] of Object.entries({ name: "UI Staff Member", phone: "9876501234", email: "ui-staff@example.com", department: "Operations", designation: "Tour manager" })) type(`.staff-editor [name=${key}]`, value); });
    await submit(".staff-editor");
    await waitFor(async () => await db.collection("staff").countDocuments() === 1 && !!container.querySelector(".staff-person"), "camera photo and staff permanently saved through UI/API");
    let person = await db.collection("staff").findOne({ email: "ui-staff@example.com" }); assert.ok(person.photo); assert.match(person.employeeId, /^EI-/);
    assert.ok(container.querySelector('.staff-card-preview-details .staff-identity-card img').getAttribute("src").includes(`/staff/${person._id}/card-preview`));
    await section("Download ID Card"); await waitFor(() => container.querySelector(".staff-identity-card"), "staff card"); await click("Download PDF"); await waitFor(() => downloads.some((blob) => blob.type === "application/pdf"), "card PDF download");
    const beforePng = downloads.length; await click("Download PNG"); await waitFor(() => downloads.length > beforePng && downloads.at(-1).type === "image/png", "high quality card PNG download");
    assert.ok([...container.querySelectorAll("button")].some((button) => button.textContent === "Print ID Card"));
    await section("Staff Attendance");
    await waitFor(() => container.querySelector('.staff-attendance-submit input[type=date]'), "daily batch form");
    await act(async () => type('.staff-attendance-submit input[type=date]', "2026-01-01"));
    await waitFor(() => container.querySelector(".staff-attendance-table select"), "active staff daily attendance");
    const statusSelector = '.staff-attendance-table select';
    assert.deepEqual([...container.querySelector(statusSelector).options].map((option) => option.value), ["", "present", "absent", "leave", "half_day", "weekly_off"]);
    for (const next of ["present", "absent", "leave", "half_day", "weekly_off", "present"]) {
      await waitFor(() => !container.querySelector(statusSelector).disabled, "attendance form ready");
      await act(async () => select(statusSelector, next)); await click("Submit attendance");
      await waitFor(async () => (await db.collection("staff_attendance").findOne())?.status === next && !container.querySelector(statusSelector).disabled, next + " persisted");
      await waitFor(() => container.querySelector(".staff-attendance-submit button").disabled && container.querySelector(".staff-attendance-success")?.textContent.includes("submitted successfully"), "submission disables the button and shows success");
      assert.equal(await db.collection("staff_attendance").countDocuments(), 1);
      const label = { present: "Present", absent: "Absent", leave: "On Leave", half_day: "Half Days", weekly_off: "Weekly Offs" }[next];
      await waitFor(() => [...container.querySelectorAll(".staff-stats > div")].some((item) => item.querySelector("span")?.textContent === label && item.querySelector("strong")?.textContent === "1"), label + " dashboard count");
    }
    const submittedRevision = (await db.collection("staff_runtime").findOne({ _id: "revision" })).value;
    await act(async () => container.querySelector(".staff-attendance-submit button").click());
    assert.equal((await db.collection("staff_runtime").findOne({ _id: "revision" })).value, submittedRevision, "clicking the disabled submit button does not write again");
    await act(async () => type('.staff-attendance-submit input[type=date]', "2026-01-02"));
    await waitFor(() => container.querySelector(statusSelector)?.value === "" && !container.querySelector(".staff-attendance-submit button").disabled, "a new date does not reuse saved choices");
    await act(async () => type('.staff-attendance-submit input[type=date]', "2026-01-01"));
    await waitFor(() => container.querySelector(statusSelector)?.value === "present" && container.querySelector(".staff-attendance-submit button").disabled, "saved attendance stays disabled when revisiting its date");
    await click("UI Staff Member", container.querySelector(".staff-attendance-table"));
    await waitFor(() => container.querySelector(".staff-profile"), "individual profile"); await act(async () => type('input[type=month]', "2026-01"));
    await waitFor(() => container.querySelector(".staff-history tbody tr"), "month-filtered history"); assert.ok(container.textContent.includes("100%"));
    await click("Export Excel"); await waitFor(() => downloads.some((blob) => blob.type.includes("spreadsheetml")), "Excel download");
    await section("Attendance Reports"); await act(async () => type('input[type=month]', "2026-01")); await waitFor(() => container.querySelector(".staff-history tbody tr"), "monthly report");
    await click("Delete this month", container.querySelector(".attendance-period-delete"));
    await waitFor(async () => await db.collection("staff_attendance").countDocuments() === 0 && !container.querySelector(".staff-history tbody tr") && container.textContent.includes("1 attendance records permanently deleted"), "report deletion removes monthly attendance and refreshes totals");
    await act(async () => root.render(createElement(MemoryRouter, { key: "admin", initialEntries: ["/admin/staff"] }, createElement(Admin))));
    await waitFor(() => container.querySelector(".staff-person"), "same staff in Admin panel"); assert.ok(container.textContent.includes(person.employeeId));
    await click("Edit", container.querySelector(".staff-person")); await act(async () => type('.staff-editor [name=designation]', "Senior tour manager")); await submit(".staff-editor");
    await waitFor(async () => (await db.collection("staff").findOne({ _id: person._id }))?.designation === "Senior tour manager" && !container.querySelector(".staff-editor"), "Admin staff update persisted");
    await click("← Back to enquiries"); await waitFor(() => container.querySelector(".dashboard-table"), "existing dashboard preserved");
    for (const label of ["Staff Management", "Staff Attendance", "Download ID Card", "Attendance Reports"]) assert.ok(container.textContent.includes(label));
    await act(async () => root.render(null));
    const viewer = await ensureAdmin(db, { ...config, adminEmail: "staff-ui-viewer@example.com" });
    await db.collection("admins").updateOne({ _id: viewer._id }, { $set: { roles: ["technical"], staffPermissions: ["view"] } });
    await globalThis.fetch("/api/technical/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const viewerLogin = await globalThis.fetch("/api/technical/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: viewer.email, password: config.adminPassword }) }); assert.equal(viewerLogin.status, 200);
    await act(async () => root.render(createElement(MemoryRouter, { key: "viewer", initialEntries: ["/technical/staff"] }, createElement(Admin, { technical: true }))));
    await waitFor(() => container.querySelector(".staff-person"), "read-only staff view");
    assert.equal([...container.querySelectorAll("button")].some((button) => ["+ Add staff", "Edit", "Delete", "Download PDF", "Download PNG", "Print ID Card"].includes(button.textContent.trim())), false);
    assert.equal(container.querySelector(".panel-navigation").textContent.includes("Download ID Card"), false);
    await section("Staff Attendance"); await waitFor(() => container.querySelector(".staff-attendance-table"), "read-only attendance"); assert.equal(container.querySelector(".staff-attendance-select"), null);
    assert.equal(container.querySelector(".attendance-period-delete"), null, "read-only users cannot delete attendance periods");
    console.log("PASS both panels, direct staff route, live-camera capture/cleanup, MongoDB staff creation/edit, generated card PDF, active attendance, individual month filters, Excel export and existing dashboard navigation");
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch; URL.createObjectURL = nativeCreateURL; URL.revokeObjectURL = nativeRevokeURL;
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    await testWindow.happyDOM.close(); await backend.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve)); await backend.drainSessions(); await db.dropDatabase(); await client.close();
  }
}

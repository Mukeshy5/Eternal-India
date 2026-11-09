import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement, Fragment } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { Window } from "happy-dom";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";
import { browserFormData } from "./browser-form-data.mjs";

export async function verifyCalendar(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "calendar-ui@example.com", technicalEmail: "", adminPassword: "CalendarUITestPassword9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  const testWindow = new Window({ url: "http://localhost/technical/staff-attendance" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, FormData: browserFormData(testWindow), IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  testWindow.confirm = () => true; testWindow.EventSource = undefined;
  const originalFetch = globalThis.fetch; let cookie = "";
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const response = await originalFetch(base + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0]; return response;
  };
  const { createRoot } = await import("react-dom/client"); const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); const root = createRoot(container);
  const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));
  async function waitFor(check, label) { for (let attempt = 0; attempt < 250; attempt++) { let result; await act(async () => { result = await check(); if (!result) await delay(20); }); if (result) return; } assert.fail(`${label}: ${container.textContent.slice(-1800)}`); }
  async function click(label, scope = container) { let target; await waitFor(() => { target = [...scope.querySelectorAll("button")].find((button) => button.textContent.trim() === label); return target && !target.disabled; }, label); await act(async () => target.click()); }
  async function clickAria(label) { const target = [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label); assert.ok(target, label); await act(async () => target.click()); }
  const type = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); };
  const select = (selector, value) => { const input = container.querySelector(selector); assert.ok(input, selector); input.value = value; input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); };
  const json = (path, body) => globalThis.fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  function RouteObserver() { const location = useLocation(), navigate = useNavigate(); return createElement(Fragment, null, createElement("output", { id: "test-panel-route" }, location.pathname + location.search), createElement("button", { id: "test-history-back", onClick: () => navigate(-1) }, "Test history back")); }
  let instance = 0;
  async function render(path, technical = true) { const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx"); await act(async () => root.render(createElement(MemoryRouter, { key: ++instance, initialEntries: [path] }, createElement(Fragment, null, createElement(Admin, { technical }), createElement(RouteObserver))))); }
  try {
    assert.equal((await json("/technical/login", { email: config.adminEmail, password: config.adminPassword })).status, 200);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64");
    for (const [index, name] of ["Calendar Alice", "Calendar Bob"].entries()) {
      const form = new FormData(); for (const [key, value] of Object.entries({ name, phone: `987650100${index}`, email: `calendar-ui-${index}@example.com`, department: index ? "Technical" : "Operations", designation: "Coordinator", status: "active" })) form.append(key, value);
      form.append("photo", new Blob([png], { type: "image/png" }), "photo.png"); const result = await globalThis.fetch("/api/technical/staff", { method: "POST", body: form }); assert.equal(result.status, 201);
    }
    await render("/technical/staff-attendance"); await waitFor(() => container.querySelectorAll(".attendance-matrix tbody tr").length === 2, "database calendar rows");
    await act(async () => type('.attendance-calendar-filters input[type=month]', "2026-01"));
    await waitFor(() => container.querySelectorAll(".attendance-matrix thead th").length === 32 && container.querySelector('button[aria-label="Calendar Alice, 2026-01-05: Not marked"]'), "all January dates and missing cells");
    assert.equal(await db.collection("staff_attendance").countDocuments(), 0);
    assert.ok(container.querySelector(".attendance-matrix .staff-avatar").getAttribute("src").includes("/photo"));
    for (const [date, status] of [["2026-01-05", "present"], ["2026-01-06", "absent"], ["2026-01-07", "leave"], ["2026-01-04", "weekly_off"], ["2026-01-08", "half_day"]]) {
      await clickAria(`Calendar Alice, ${date}: Not marked${date === "2026-01-04" ? ", Sunday" : ""}`);
      await waitFor(() => container.querySelector(".attendance-calendar-dialog .staff-attendance-editor"), "cell editor");
      await act(async () => select('.attendance-calendar-dialog select[name=attendanceStatus]', status));
      if (["present", "half_day"].includes(status)) {
        const inputs = container.querySelectorAll('.attendance-calendar-dialog input[type=time]');
        await act(async () => { for (const [input, value] of [[inputs[0], "09:00"], [inputs[1], status === "half_day" ? "13:00" : "17:00"]]) { Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true })); } });
      } else assert.ok([...container.querySelectorAll('.attendance-calendar-dialog input[type=time]')].every((input) => input.disabled));
      await click("Save attendance", container.querySelector(".attendance-calendar-dialog"));
      await waitFor(async () => !container.querySelector(".attendance-calendar-dialog") && (await db.collection("staff_attendance").findOne({ date }))?.status === status && !!container.querySelector(`.attendance-cell.attendance-color-${status}`), `${status} saved and rendered`);
    }
    assert.equal(await db.collection("staff_attendance").countDocuments(), 5);
    await click("Daily", container.querySelector(".attendance-view-switch")); await waitFor(() => container.querySelectorAll(".attendance-matrix thead th").length === 2, "daily view");
    await click("Weekly", container.querySelector(".attendance-view-switch")); await waitFor(() => container.querySelectorAll(".attendance-matrix thead th").length === 8, "weekly view");
    await click("Monthly", container.querySelector(".attendance-view-switch")); await waitFor(() => container.querySelectorAll(".attendance-matrix thead th").length === 32, "monthly view");
    await act(async () => select('.attendance-calendar-filters select', "Operations")); await waitFor(() => container.querySelectorAll(".attendance-matrix tbody tr").length === 1, "department filter");
    await act(async () => select('.attendance-calendar-filters select', "")); await waitFor(() => container.querySelectorAll(".attendance-matrix tbody tr").length === 2, "department cleared");
    await act(async () => type('.attendance-calendar-filters input[type=search]', "Calendar Bob")); await waitFor(() => container.querySelectorAll(".attendance-matrix tbody tr").length === 1 && container.querySelector(".attendance-person").textContent.includes("Bob"), "debounced staff search");
    await act(async () => type('.attendance-calendar-filters input[type=search]', "")); await waitFor(() => container.querySelectorAll(".attendance-matrix tbody tr").length === 2, "search cleared");
    await act(async () => container.querySelector(".attendance-person").click()); await waitFor(() => container.querySelector(".staff-profile") && container.textContent.includes("50%"), "monthly staff summary");
    assert.ok(container.textContent.includes("Weekly Offs")); assert.ok(container.textContent.includes("Calendar Sundays")); assert.equal(container.querySelectorAll(".staff-history tbody tr").length, 5);
    await click("Add hotel", container.querySelector(".panel-navigation")); await waitFor(() => container.querySelector(".admin-tool-form"), "persistent operations navigation");
    assert.equal(container.querySelector("#test-panel-route").textContent, "/technical/hotels");
    testWindow.dispatchEvent(new testWindow.Event("pagehide")); await act(async () => assert.equal((await globalThis.fetch("/api/technical/me")).status, 200, "refresh/navigation does not destroy the shared session"));
    await render("/technical/hotels"); await waitFor(() => container.querySelector(".admin-tool-form"), "refresh preserves hotel route");
    await act(async () => { type('.admin-tool-form input[name=name]', "Calendar test hotel"); type('.admin-tool-form input[name=gst]', "12"); type('.admin-tool-form input[name=amount]', "5000"); });
    for (const input of container.querySelectorAll('.admin-tool-form input[type=number]')) input.step = "any";
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(async () => await db.collection("hotels").countDocuments() === 1 && container.querySelector(".admin-tool-table tbody tr"), "hotel creation updates saved inventory");
    await click("Edit", container.querySelector(".admin-tool-table"));
    await act(async () => type('.admin-tool-form input[name=amount]', "5250.50"));
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(async () => (await db.collection("hotels").findOne())?.amount === 5250.5 && container.querySelector(".admin-tool-table").textContent.includes("5,250.5") && container.textContent.includes("Hotel updated successfully."), "hotel update uses the saved API record");
    await click("Delete", container.querySelector(".admin-tool-table")); await waitFor(async () => await db.collection("hotels").countDocuments() === 0 && !container.querySelector(".admin-tool-table tbody tr"), "hotel deletion updates inventory");
    await click("Staff Management", container.querySelector(".panel-navigation")); await waitFor(() => container.querySelector(".staff-grid"), "staff route");
    await act(async () => container.querySelector("#test-history-back").click()); await waitFor(() => container.querySelector(".admin-tool-form"), "browser back restores tool");
    await act(async () => type('.admin-tool-form input[name=name]', "Unsaved hotel")); testWindow.confirm = () => false;
    await click("All enquiries", container.querySelector(".panel-navigation")); assert.ok(container.querySelector(".admin-tool-form"), "navigation cancellation preserves unsaved work");
    testWindow.confirm = () => true; await click("All enquiries", container.querySelector(".panel-navigation")); await waitFor(() => container.querySelector(".dashboard-table"), "navigation after confirming discard");
    await render("/technical/not-a-section"); await waitFor(() => container.textContent.includes("Section not found"), "unknown route recovery");
    await render("/technical/hotels"); await waitFor(() => container.querySelector(".admin-tool-form"), "hotel form before session expiry");
    await act(async () => { type('.admin-tool-form input[name=name]', "Expired session hotel"); type('.admin-tool-form input[name=gst]', "12"); type('.admin-tool-form input[name=amount]', "5000"); });
    await act(async () => { await json("/technical/logout", {}); });
    // Happy DOM uses floating-point remainder for decimal steps; browsers accept these values.
    for (const input of container.querySelectorAll('.admin-tool-form input[type=number]')) input.step = "any";
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".admin-login-form"), "expired tool session returns to sign-in"); assert.equal(await db.collection("hotels").countDocuments(), 0);
    await act(async () => { type("#admin-email", config.adminEmail); type("#admin-password", config.adminPassword); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".admin-tool-form") && container.querySelector(".admin-tool-table"), "sign-in returns to requested hotel page and completes its inventory request");
    console.log("PASS advanced monthly/daily/weekly calendar, five statuses, saved working times, department/search filters, monthly summary, stable panel URLs, session refresh, browser Back, unsaved work guard and expired-session recovery");
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; await testWindow.happyDOM.close(); await backend.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve)); await backend.drainSessions(); await db.dropDatabase(); await client.close(); }
}

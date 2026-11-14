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
import { cookieHeader } from "./cookie-header.mjs";

export async function verifyLetters(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "letter-ui@example.com", technicalEmail: "", adminPassword: "LettersUITest9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const testWindow = new Window({ url: "http://localhost/technical/joining-letters" });
  const previous = new Map(), originalFetch = globalThis.fetch, createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  let cookie = ""; const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:letter-ui-${blobs.length}`; }; URL.revokeObjectURL = () => {};
  testWindow.confirm = () => true; testWindow.HTMLAnchorElement.prototype.click = () => {}; testWindow.EventSource = undefined;
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const response = await originalFetch(origin + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    if (response.headers.get("set-cookie")) cookie = cookieHeader(response, cookie); return response;
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); const root = createRoot(container);
  async function waitFor(check, label) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) { let found; await act(async () => { found = await check(); if (!found) await new Promise((done) => setTimeout(done, 100)); }); if (found) return; }
    assert.fail(`Timed out: ${label}. UI: ${container.textContent.slice(-2500)}`);
  }
  const type = (name, value) => {
    const input = container.querySelector(`[name="${name}"]`); assert.ok(input, name);
    const prototype = input.tagName === "TEXTAREA" ? testWindow.HTMLTextAreaElement.prototype : testWindow.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  async function click(label, scope = container) {
    const button = [...scope.querySelectorAll("button")].find((entry) => entry.textContent.trim() === label); assert.ok(button, label); assert.equal(button.disabled, false, label); await act(async () => button.click());
  }
  const submit = () => act(async () => container.querySelector(".letter-editor").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
  try {
    const login = await globalThis.fetch("/api/technical/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) }); assert.equal(login.status, 200);
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Letter UI Employee", email: "letter-employee@example.com", phone: "9876543278", department: "Guest services", designation: "Travel executive", status: "active", joiningDate: "2025-01-01", salary: "45000.75" })) form.append(key, value);
    const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64");
    form.append("photo", new Blob([photo], { type: "image/png" }), "photo.png");
    const staffReply = await globalThis.fetch("/api/technical/staff", { method: "POST", body: form }); assert.equal(staffReply.status, 201);
    const person = (await staffReply.json()).staff;
    const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
    const render = (panel, type = "joining") => act(async () => root.render(createElement(MemoryRouter, { key: panel, initialEntries: [`/${panel}/${type}-letters`] }, createElement(Admin, { technical: panel === "technical" }))));
    await render("technical");
    await waitFor(() => container.textContent.includes("Your letter archive starts here"), "technical joining letter route");
    assert.ok([...container.querySelectorAll(".panel-navigation button")].some((item) => item.textContent.endsWith("Experience Letter")));
    await waitFor(() => ![...container.querySelectorAll("button")].find((item) => item.textContent === "+ Create joining letter")?.disabled, "company defaults loaded");
    await click("+ Create joining letter");
    await waitFor(() => container.querySelector(".letter-employee-results button"), "employee list from API");
    await act(async () => container.querySelector(".letter-employee-results button").click());
    await waitFor(() => container.querySelector('[name="salary"]').value === "45000.75", "employee salary and joining date dynamically fetched");
    assert.equal(container.querySelector('[name="joiningDate"]').value, "2025-01-01"); assert.ok(container.querySelector(".letter-paper").textContent.includes(person.employeeId));
    await act(async () => { type("terms", "UI agreed terms: 30 days notice."); type("content", "Dear Letter UI Employee,\n\nThis is the edited joining letter body."); });
    await click("Preview PDF");
    await waitFor(() => testWindow.document.querySelector(".letter-pdf-dialog iframe"), "backend draft PDF preview");
    assert.equal(await db.collection("employment_letters").countDocuments(), 0);
    await click("Close preview", testWindow.document.querySelector(".letter-pdf-dialog"));
    await submit();
    await waitFor(async () => await db.collection("employment_letters").countDocuments() === 1 && !!container.querySelector(".letter-detail"), "joining letter saved through API");
    let joining = await db.collection("employment_letters").findOne({ type: "joining" }); assert.equal(joining.content, "Dear Letter UI Employee,\n\nThis is the edited joining letter body."); assert.ok(joining.pdf);
    await click("Download PDF"); await waitFor(() => blobs.length >= 2, "stored PDF downloaded"); assert.equal(blobs.at(-1).type, "application/pdf");
    await click("Preview PDF & print"); await waitFor(() => testWindow.document.querySelector(".letter-pdf-dialog iframe"), "saved PDF preview");
    const iframe = testWindow.document.querySelector(".letter-pdf-dialog iframe"); let printed = 0;
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: { focus() {}, print() { printed++; } } });
    await act(async () => iframe.dispatchEvent(new testWindow.Event("load")));
    await click("Print", testWindow.document.querySelector(".letter-pdf-dialog")); assert.equal(printed, 1);
    await click("Close preview", testWindow.document.querySelector(".letter-pdf-dialog"));
    await click("Back to history"); await waitFor(() => container.querySelector(".letter-table"), "history saved record");
    const experienceNav = [...container.querySelectorAll(".panel-navigation button")].find((item) => item.textContent.endsWith("Experience Letter")); await act(async () => experienceNav.click());
    await waitFor(() => container.querySelector(".letter-hero h1")?.textContent === "Experience Letters", "separate experience section");
    await waitFor(() => ![...container.querySelectorAll("button")].find((item) => item.textContent === "+ Create experience letter")?.disabled, "experience defaults"); await click("+ Create experience letter");
    await waitFor(() => container.querySelector(".letter-employee-results button"), "experience employee selector"); await act(async () => container.querySelector(".letter-employee-results button").click());
    await waitFor(() => container.querySelector(".letter-selected-employee"), "experience employee auto-filled");
    await act(async () => { type("issueDate", "2026-11-14"); type("lastWorkingDate", "2026-10-31"); type("responsibilities", "Guest service and itinerary management."); type("performance", "Professional, dependable performance throughout employment."); });
    assert.ok(container.querySelector(".letter-paper").textContent.includes("1 year, 10 months")); await submit();
    await waitFor(async () => await db.collection("employment_letters").countDocuments() === 2 && !!container.querySelector(".letter-detail"), "experience letter saved");
    await render("admin"); await waitFor(() => container.querySelector(".letter-table")?.textContent.includes(joining.letterNumber), "Admin Panel shares Technical Panel letter history");
    await click("Edit"); await waitFor(() => container.querySelector(".letter-editor"), "load saved letter for editing");
    await act(async () => type("terms", "Updated in Admin Panel.")); await submit();
    await waitFor(async () => (await db.collection("employment_letters").findOne({ type: "joining" })).version === 2 && !!container.querySelector(".letter-detail"), "admin amendment persisted");
    const updated = await db.collection("employment_letters").findOne({ type: "joining" }); assert.equal(updated.letterNumber, joining.letterNumber); assert.notEqual(updated.pdfSha256, joining.pdfSha256); joining = updated;
    await click("Delete", container.querySelector(".letter-detail-toolbar")); await waitFor(async () => await db.collection("employment_letters").countDocuments({ type: "joining" }) === 0 && container.textContent.includes("Your letter archive starts here"), "letter and PDF permanently deleted");
    await render("technical", "experience"); await waitFor(() => container.querySelector(".letter-table"), "experience history survives navigation and panel changes");
    await act(async () => type("letterSearch", "no-such-person")); await waitFor(() => container.textContent.includes("No matching letters"), "server search");
    await click("Clear filters"); await waitFor(() => container.querySelector(".letter-table")?.textContent.includes("Letter UI Employee"), "history filters reset");
    console.log("PASS joining and experience letters: both panels, real employee autofill, editable generation, persisted history, PDF preview/download/print, amendments, search and deletion");
  } finally {
    await act(async () => root.unmount()); await backend.enquirySystem.stop(); await backend.decorationScheduler.stop(); await backend.drainSessions(); await new Promise((done) => server.close(done)); await db.dropDatabase(); await client.close();
    URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    await testWindow.happyDOM.close();
  }
}

if (import.meta.url === new URL(process.argv[1], "file:///").href || process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/verify-letters.mjs")) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try { await verifyLetters(vite); } finally { await vite.close(); }
}

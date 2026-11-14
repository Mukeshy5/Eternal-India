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

export async function verifyOfficeVouchers(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "office-ui@example.com", technicalEmail: "", adminPassword: "OfficeUITest9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`, io = backend.enquirySystem.realtime.attach(server);
  const win = new Window({ url: `${origin}/technical/office-addresses` }), previous = new Map(), nativeFetch = globalThis.fetch;
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  let cookie = "", optionEvents = 0; const downloads = [];
  win.confirm = () => true; win.EventSource = undefined; win.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  win.addEventListener("journey-voucher-options-changed", () => optionEvents++);
  URL.createObjectURL = () => "blob:office-voucher-test"; URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return nativeFetch(url, options);
    const reply = await nativeFetch(origin + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    if (reply.headers.get("set-cookie")) cookie = cookieHeader(reply, cookie); return reply;
  };
  async function request(path, method = "GET", body) {
    const reply = await globalThis.fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    assert.ok(reply.ok, `${path}: ${reply.status} ${await reply.clone().text()}`); return reply.status === 204 ? null : reply.json();
  }
  const { createRoot } = await import("react-dom/client");
  const container = win.document.createElement("div"); win.document.body.append(container); const root = createRoot(container);
  async function waitFor(check, label) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) { let result; await act(async () => { result = await check(); if (!result) await new Promise((done) => setTimeout(done, 100)); }); if (result) return; }
    assert.fail(`${label}: ${container.textContent.slice(-2800)}`);
  }
  const input = (name, value, scope = container) => {
    const element = scope.querySelector(`[name="${name}"]`); assert.ok(element, name);
    assert.ok(!element.closest("fieldset")?.disabled, `${name} is ready for user input`);
    if (element.tagName === "SELECT") element.value = value;
    else Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new win.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };
  async function click(label, scope = container) { const target = [...scope.querySelectorAll("button")].find((button) => button.textContent.trim() === label); assert.ok(target, label); assert.equal(target.disabled, false, label); await act(async () => target.click()); }
  async function submit(selector) { await act(async () => container.querySelector(selector).dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }))); }
  async function navigate(label) {
    const target = [...container.querySelectorAll(".panel-navigation button")].find((button) => button.textContent.endsWith(label)); assert.ok(target, label);
    await waitFor(() => !target.disabled && ![...container.querySelectorAll("fieldset")].some((fieldset) => fieldset.disabled), `current operation finishes before navigating to ${label}`);
    await act(async () => target.click());
  }
  try {
    await request("/technical/login", "POST", { email: config.adminEmail, password: config.adminPassword });
    const hotel = (await request("/technical/hotels", "POST", { name: "Office UI Hotel", address: "Hotel Lane, Jaipur", starRating: "4-Star (Upscale / Deluxe)", amount: 1250.25 })).hotel;
    const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
    async function render(panel, section) { await act(async () => root.render(createElement(MemoryRouter, { key: panel, initialEntries: [`/${panel}/${section}`] }, createElement(Admin, { technical: panel === "technical" })))); }
    await render("technical", "office-addresses");
    await waitFor(() => container.querySelector(".addresses-manager textarea[name=address]"), "Address Add navigation and route");
    assert.deepEqual([...container.querySelectorAll(".addresses-manager form input, .addresses-manager form textarea")].map((element) => element.name), ["address"]);
    assert.ok(!container.querySelector(".addresses-manager").textContent.includes("Office name")); assert.ok(!container.querySelector(".addresses-manager").textContent.includes("Office phone"));
    await act(async () => input("address", "12 Office Road, New Delhi 110001"));
    await submit(".addresses-manager form");
    await waitFor(async () => await db.collection("office_addresses").countDocuments() === 1 && !!container.querySelector(".addresses-manager tbody tr"), "office address persisted through the UI");
    let office = await db.collection("office_addresses").findOne();
    assert.equal(office.name, undefined); assert.equal(office.phone, undefined);
    await click("View", container.querySelector(".addresses-manager tbody")); assert.ok(container.querySelector('[aria-label="View office address"]').textContent.includes(office.address)); await click("Close details");
    await click("Edit", container.querySelector(".addresses-manager tbody")); await act(async () => input("address", "14 Office Road, New Delhi 110001")); await submit(".addresses-manager form");
    await waitFor(async () => (await db.collection("office_addresses").findOne()).version === 2 && container.textContent.includes("updated successfully"), "address amendment"); office = await db.collection("office_addresses").findOne();
    await render("admin", "gst"); await waitFor(() => container.querySelector(".gst-manager input[name=gstNumber]"), "Admin number-only GST section");
    const gstForm = container.querySelector(".gst-manager form"); assert.deepEqual([...gstForm.querySelectorAll("input")].map((element) => element.name), ["gstNumber"]);
    await act(async () => input("gstNumber", "07ABCDE1234F1Z5")); await submit(".gst-manager form");
    await waitFor(async () => await db.collection("gst_rates").countDocuments() === 1 && !!container.querySelector(".gst-manager tbody tr"), "number-only GST persisted");
    const gst = await db.collection("gst_rates").findOne(); assert.equal(gst.rate, undefined); assert.equal(gst.name, undefined);
    await navigate("Journey Voucher"); await waitFor(() => container.querySelector(`.billing-editor [name=officeAddressId] option[value="${office._id}"]`) && !container.querySelector(".billing-editor fieldset")?.disabled, "office address fetched and voucher form ready");
    await act(async () => {
      for (const [name, value] of Object.entries({ hotelId: hotel._id, gstId: gst._id.toString(), officeAddressId: office._id.toString(), mealPlan: "MAP", guestName: "Office UI Guest", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", departureDate: "2026-12-03", arrivalPlace: "Delhi airport", departurePlace: "Jaipur station", requirement: "Two rooms and airport transfers." })) input(name, value, container.querySelector(".billing-editor"));
    });
    await waitFor(() => container.textContent.includes("Price verified"), "server quote"); assert.ok(container.querySelector(".billing-price-total").textContent.includes("1,250.25"));
    assert.deepEqual([...container.querySelectorAll('[name=mealPlan] option')].map((element) => element.value), ["", "CP", "MAP", "AP"]);
    await waitFor(() => io.engine.clientsCount > 0 && optionEvents > 0, "authenticated realtime connection"); optionEvents = 0;
    let second;
    await act(async () => {
      await request(`/technical/office-addresses/${office._id}`, "PATCH", { address: "16 Office Road, New Delhi 110001", version: office.version });
      second = (await request("/technical/office-addresses", "POST", { address: "20 Marine Road, Mumbai 400001" })).address;
    });
    await waitFor(() => optionEvents > 0 && container.querySelector(`[name=officeAddressId] option[value="${second._id}"]`) && container.querySelector('[aria-label="Selected office address"]').textContent.includes("16 Office Road"), "office updates pushed over Socket.IO without replacing unsaved fields");
    assert.equal(container.querySelector('[name=guestName]').value, "Office UI Guest"); await waitFor(() => container.textContent.includes("Price verified"), "quote refreshed after office update");
    container.querySelector('[name=basePrice]').step = "any";
    await submit(".billing-editor"); await waitFor(async () => await db.collection(voucherCollectionName()).countDocuments() === 1 && !!container.querySelector(".billing-document"), "voucher saved with address and meal plan");
    let saved = await db.collection(voucherCollectionName()).findOne(); assert.equal(saved.mealPlan, "MAP"); assert.equal(saved.officeAddress.address, "16 Office Road, New Delhi 110001");
    assert.ok(container.querySelector(".billing-document").textContent.includes("MAP - Breakfast + Dinner")); await click("Download PDF", container.querySelector(".billing-detail")); await waitFor(() => downloads.length > 0, "voucher download");
    await render("technical", "voucher-history"); await waitFor(() => container.querySelector(".billing-table tbody tr")?.textContent.includes("MAP - Breakfast + Dinner"), "shared Technical history");
    await click("Edit", container.querySelector(".billing-table tbody")); await waitFor(() => container.querySelector(".billing-editor [name=mealPlan]")?.value === "MAP" && !container.querySelector(".billing-editor fieldset")?.disabled && container.querySelector(`.billing-editor [name=officeAddressId] option[value="${second._id}"]`), "edit prefilled meal plan and available office addresses");
    await act(async () => { input("mealPlan", "AP", container.querySelector(".billing-editor")); input("officeAddressId", second._id, container.querySelector(".billing-editor")); });
    await waitFor(() => container.textContent.includes("Price verified") && ![...container.querySelectorAll("button")].find((element) => element.textContent === "Save voucher changes")?.disabled, "updated quote verified"); container.querySelector('[name=basePrice]').step = "any";
    await submit(".billing-editor"); await waitFor(async () => (await db.collection(voucherCollectionName()).findOne()).revision === 2 && !!container.querySelector(".billing-document"), "edited voucher saved");
    const amended = await db.collection(voucherCollectionName()).findOne(); assert.equal(amended.invoiceNumber, saved.invoiceNumber); assert.equal(amended.mealPlan, "AP"); assert.equal(amended.officeAddress.address, second.address); saved = amended;
    await act(async () => input("mealPlanFilter", "CP")); await submit(".billing-filters"); await waitFor(() => container.textContent.includes("No vouchers found"), "meal plan history filter");
    await click("Clear filters"); await waitFor(() => container.querySelector(".billing-table tbody tr"), "history filter reset");
    await navigate("Address Add"); await waitFor(() => container.querySelector(".addresses-manager tbody"), "technical address management");
    const row = [...container.querySelectorAll(".addresses-manager tbody tr")].find((element) => element.textContent.includes(second.address)); await click("Delete", row);
    await waitFor(async () => await db.collection("office_addresses").countDocuments({ address: second.address }) === 0 && !container.querySelector(".addresses-manager tbody").textContent.includes(second.address), "office master deleted");
    await navigate("Journey Voucher History"); await waitFor(() => container.querySelector(".billing-table tbody tr"), "historical voucher retained"); await click("View", container.querySelector(".billing-table tbody"));
    await waitFor(() => container.querySelector(".billing-document")?.textContent.includes(second.address), "saved address and meal plan survive master deletion"); assert.ok(container.querySelector(".billing-document").textContent.includes("AP - Breakfast + Lunch + Dinner"));
    await click("Print", container.querySelector(".billing-detail")); await waitFor(() => win.document.querySelector('[role="dialog"] iframe'), "saved voucher PDF print preview");
    const frame = win.document.querySelector('[role="dialog"] iframe'); let printed = 0; Object.defineProperty(frame, "contentWindow", { configurable: true, value: { focus() {}, print() { printed++; } } });
    await act(async () => frame.dispatchEvent(new win.Event("load"))); await click("Print voucher", win.document.querySelector('[role="dialog"]')); assert.equal(printed, 1); await click("Close preview", win.document.querySelector('[role="dialog"]'));
    console.log("PASS real Admin/Technical address CRUD, number-only GST, Socket.IO office updates, voucher office/meal selection, save/edit/history/filter/download/print, and snapshot retention after address deletion");
  } finally {
    await act(async () => root.unmount()); await backend.enquirySystem.stop(); await backend.decorationScheduler.stop(); await backend.drainSessions();
    await new Promise((done) => server.close(done)); assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
    globalThis.fetch = nativeFetch; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; await win.happyDOM.close();
  }
}
const voucherCollectionName = () => "journey_billing_vouchers";

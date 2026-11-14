import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { calculateVoucherPrice } from "../../shared/voucherBilling.js";

export async function verifyVoucher(server) {
  const testWindow = new Window({ url: "http://localhost/admin/vouchers" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, Event: testWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const hotel = { _id: "000000000000000000000012", name: "Heritage Stay", address: "12 Heritage Road, Jaipur", amount: 5000.25 };
  const gst = { _id: "000000000000000000000013", gstNumber: "07ABCDE1234F1Z5", version: 1 };
  const office = { _id: "000000000000000000000017", name: "Delhi office", address: "12 Office Road, New Delhi 110001", phone: "+91 11 41715155", version: 1 };
  const rateOnly = { _id: "000000000000000000000014", name: "Rate without GSTIN", rate: 5 };
  let gstRates = [gst, rateOnly];
  let vouchers = [], creates = 0, updates = 0, prints = 0;
  const calls = [], downloads = [];
  let holdOptions = false;
  const heldOptions = [];
  testWindow.confirm = () => true;
  testWindow.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const body = options.body ? JSON.parse(options.body) : {};
    if (url === "/api/admin/vouchers/options") {
      const response = Response.json({ hotels: [hotel], gstRates, officeAddresses: [office], usedHotels: [], usedGst: [], usedOffices: [] });
      return holdOptions ? new Promise((resolve) => heldOptions.push(() => resolve(response))) : response;
    }
    if (url === "/api/admin/vouchers/invoice") return Response.json({ invoice: { reservationId: "000000000000000000000022", invoiceNumber: "10001" } });
    if (url === "/api/admin/vouchers/quote") return Response.json({ pricing: calculateVoucherPrice(body.basePrice, 0), gst, hotel, officeAddress: office });
    if (url === "/api/admin/vouchers" && options.method === "POST") {
      creates++; const voucher = { ...body, _id: "000000000000000000000022", invoiceNumber: "10001", hotel, gst, officeAddress: office, pricing: calculateVoucherPrice(body.basePrice, 0), revision: 1 };
      vouchers.push(voucher); return Response.json({ voucher }, { status: 201 });
    }
    if (url.startsWith("/api/admin/vouchers?")) {
      const params = new URL(url, "http://localhost").searchParams;
      const rows = vouchers.filter((v) => !params.get("search") || v.guestName.toLowerCase().includes(params.get("search").toLowerCase()) || v.invoiceNumber.includes(params.get("search")));
      return Response.json({ vouchers: rows, total: rows.length, page: 1, pages: 1, pageSize: 20, totalBillingPaise: rows.reduce((sum, v) => sum + v.pricing.totalPaise, 0) });
    }
    if (url.includes("/export?")) return new Response("export", { headers: { "Content-Type": url.includes("format=xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf" } });
    if (url.endsWith("/pdf")) return new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } });
    if (url.startsWith("/api/admin/vouchers/")) {
      if (options.method === "DELETE") { vouchers = []; return new Response(null, { status: 204 }); }
      if (options.method === "PATCH") { updates++; vouchers[0] = { ...vouchers[0], ...body, pricing: calculateVoucherPrice(body.basePrice, 0), revision: 2 }; }
      return Response.json({ voucher: vouchers[0] });
    }
    throw new Error(`Unexpected billing request: ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); const root = createRoot(container);
  const button = (label, scope = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent === label);
  async function waitFor(check) { for (let i = 0; i < 100; i++) { let found; await act(async () => { found = check(); if (!found) await new Promise((resolve) => setTimeout(resolve, 20)); }); if (found) return; } assert.fail(container.textContent.slice(-2000)); }
  const input = (name, value, scope = container.querySelector(".billing-editor")) => {
    const element = scope.querySelector(`[name="${name}"]`); assert.ok(element, name);
    if (element.tagName === "SELECT") element.value = value;
    else Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? testWindow.HTMLTextAreaElement.prototype : testWindow.HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new testWindow.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };
  try {
    const { default: JourneyVoucher } = await server.ssrLoadModule("/src/Common/JourneyVoucher.jsx");
    await act(async () => root.render(createElement(JourneyVoucher)));
    await waitFor(() => container.textContent.includes("Invoice #10001"));
    const css = readFileSync(new URL("../src/Common/JourneyBilling.css", import.meta.url), "utf8");
    for (const width of [1440, 768, 375]) {
      const sizeWindow = new Window({ settings: { disableCSSFileLoading: true } });
      try {
        sizeWindow.happyDOM.setViewport({ width, height: 900 });
        sizeWindow.document.body.innerHTML = container.outerHTML;
        const style = sizeWindow.document.createElement("style"); style.textContent = css; sizeWindow.document.head.append(style);
        const computed = (selector) => sizeWindow.getComputedStyle(sizeWindow.document.querySelector(selector));
        assert.equal(computed(".billing-form-columns").gridTemplateColumns.includes("310px"), width > 1150, `${width}: billing summary stacks at tablet widths`);
        assert.equal(computed(".billing-table-wrap").overflowX, "auto", "history has contained horizontal scrolling");
        if (width <= 650) assert.equal(computed('[name="guestName"]').fontSize, "16px", "mobile input avoids zoom");
      } finally { sizeWindow.close(); }
    }
    assert.ok(button("Create voucher").disabled);
    const gstOption = (id) => container.querySelector(`[name="gstId"] option[value="${id}"]`);
    assert.ok(gstOption(rateOnly._id)?.disabled, "rate-only records remain visible with a missing GSTIN explanation");
    assert.match(gstOption(rateOnly._id).textContent, /GST number not configured/);
    await act(async () => { input("hotelId", hotel._id); input("gstId", gst._id); input("officeAddressId", office._id); input("mealPlan", "MAP"); });
    await waitFor(() => container.textContent.includes("Price verified"));
    assert.equal(container.querySelector('[name="basePrice"]').value, "5000.25");
    assert.ok(container.querySelector(".billing-price-total").textContent.includes("5,000.25"));
    await act(async () => input("basePrice", "100.10"));
    assert.ok(container.querySelector(".billing-price-total").textContent.includes("100.10"), "price changes immediately without inventing a tax percentage");
    assert.ok(button("Create voucher").disabled, "waits for matching server quote");
    const liveGst = { _id: "000000000000000000000015", gstNumber: "29ABCDE1234F1Z5", version: 1 };
    await act(async () => {
      input("guestName", "Unsaved guest");
      gstRates = [...gstRates, liveGst];
      testWindow.dispatchEvent(new testWindow.Event("journey-voucher-options-changed"));
    });
    await waitFor(() => gstOption(liveGst._id));
    assert.equal(container.querySelector('[name="guestName"]').value, "Unsaved guest", "live GST updates preserve unsaved fields");
    assert.equal(container.querySelector('[name="gstId"]').value, gst._id, "live refresh preserves the chosen GST");
    assert.equal(container.querySelector('[name="basePrice"]').value, "100.10", "live refresh preserves manual prices");
    assert.equal(container.querySelector(".billing-editor fieldset").disabled, false, "background refresh keeps the form usable");
    await act(async () => { holdOptions = true; testWindow.dispatchEvent(new testWindow.Event("journey-voucher-options-changed")); });
    await waitFor(() => heldOptions.length === 2);
    const queuedGst = { ...liveGst, _id: "000000000000000000000016", name: "GST added during refresh" };
    await act(async () => {
      gstRates = [...gstRates, queuedGst];
      testWindow.dispatchEvent(new testWindow.Event("journey-voucher-options-changed"));
      holdOptions = false;
      heldOptions.splice(0).forEach((resolve) => resolve());
    });
    await waitFor(() => gstOption(queuedGst._id));
    await act(async () => { gst.gstNumber = "09ABCDE1234F1Z5"; gst.version++; testWindow.dispatchEvent(new testWindow.Event("journey-voucher-options-changed")); });
    await waitFor(() => gstOption(gst._id).textContent.includes("09ABCDE1234F1Z5"));
    assert.ok(container.querySelector(".billing-price-total").textContent.includes("100.10"));
    await waitFor(() => container.textContent.includes("Price verified"));
    await act(async () => { gst.gstNumber = "07ABCDE1234F1Z5"; gst.version++; gstRates = [gst, rateOnly]; testWindow.dispatchEvent(new testWindow.Event("journey-voucher-options-changed")); });
    await waitFor(() => !gstOption(liveGst._id) && !gstOption(queuedGst._id) && container.querySelector(".billing-price-total").textContent.includes("100.10"));
    assert.equal(calls.filter((call) => call.url === "/api/admin/vouchers/invoice").length, 1, "live GST refresh reuses the original invoice reservation");
    await act(async () => { for (const [key, value] of Object.entries({ guestName: "Billing Guest", requirement: "Two rooms and transfers.\nVegetarian meals.", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", departureDate: "2026-12-03", arrivalPlace: "Delhi airport", departurePlace: "Jaipur station" })) input(key, value); });
    await waitFor(() => !button("Create voucher").disabled);
    container.querySelector('[name="basePrice"]').step = "any"; // happy-dom has a floating-point stepMismatch bug; API tests enforce two decimals.
    assert.equal(container.querySelector(".billing-editor").checkValidity(), true, JSON.stringify([...container.querySelector(".billing-editor").elements].filter((e)=>e.willValidate && !e.checkValidity()).map((e)=>({name:e.name,value:e.value,reason:e.validationMessage}))));
    await act(async () => container.querySelector(".billing-editor").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".billing-document"));
    assert.equal(creates, 1);
    const document = container.querySelector(".billing-document");
    assert.doesNotMatch(document.textContent, /ETERNAL INDIA|JOURNEY VOUCHER|Base price|Total amount|118\.12|GST \(/, "guest document omits headings and internal pricing");
    assert.ok(document.querySelector(".billing-document-brand").textContent.includes(gst.gstNumber), "GST number appears in the centered company header");
    assert.equal(document.querySelector(".billing-document-hotel h2").textContent, hotel.name);
    assert.ok(document.querySelector(".billing-document-brand").textContent.includes(office.address));
    assert.ok(document.textContent.includes("MAP - Breakfast + Dinner"));
    assert.ok(document.querySelector(".billing-document-watermark[aria-hidden='true']"));
    assert.ok(document.textContent.includes("Authorized Signatory"));
    assert.equal(container.querySelectorAll(".billing-table tbody tr").length, 1);
    await act(async () => button("Edit").click());
    await waitFor(() => container.querySelector('[aria-label="Edit journey voucher"]'));
    await act(async () => { input("guestName", "Edited Guest"); input("basePrice", "200"); });
    await waitFor(() => !button("Save voucher changes").disabled && !container.querySelector(".billing-editor fieldset").disabled);
    container.querySelector('[name="basePrice"]').step = "any";
    assert.equal(container.querySelector(".billing-editor").checkValidity(), true, JSON.stringify([...container.querySelector(".billing-editor").elements].filter((e)=>e.willValidate && !e.checkValidity()).map((e)=>({name:e.name,value:e.value,reason:e.validationMessage}))));
    await act(async () => container.querySelector(".billing-editor").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".billing-document")?.textContent.includes("Edited Guest"));
    assert.equal(updates, 1); assert.equal(creates, 1); assert.equal(vouchers[0].invoiceNumber, "10001");
    await act(async () => button("Download PDF").click()); assert.ok(downloads.includes("journey-voucher-10001.pdf"));
    await act(async () => button("Print").click());
    const dialog = testWindow.document.querySelector('[role="dialog"]'); assert.ok(dialog); const frame = dialog.querySelector("iframe");
    Object.defineProperty(frame, "contentWindow", { configurable: true, value: { focus() {}, print() { prints++; } } }); // happy-dom has no blob PDF frame window.
    await act(async () => frame.dispatchEvent(new testWindow.Event("load")));
    await act(async () => button("Print voucher", dialog).click()); assert.equal(prints, 1, "prints isolated PDF frame");
    await act(async () => button("Close preview", dialog).click()); assert.equal(testWindow.document.querySelector('[role="dialog"]'), null);
    for (const label of ["Export Excel", "Export PDF"]) await act(async () => button(label).click());
    assert.ok(downloads.includes("journey-voucher-history.xlsx")); assert.ok(downloads.includes("journey-voucher-history.pdf"));
    await act(async () => input("search", "No match", container.querySelector(".billing-filters")));
    await act(async () => container.querySelector(".billing-filters").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.textContent.includes("No vouchers found"));
    assert.ok(calls.some((call) => call.url.includes("search=No+match")));
    await act(async () => button("Clear filters").click()); await waitFor(() => container.querySelectorAll(".billing-table tbody tr").length === 1);
    testWindow.confirm = () => false;
    await act(async () => button("Delete").click()); assert.equal(vouchers.length, 1, "cancel does not delete");
    testWindow.confirm = () => true;
    await act(async () => button("Delete").click()); await waitFor(() => container.textContent.includes("0 saved vouchers"));
    assert.equal(vouchers.length, 0); assert.equal(container.querySelector(".billing-document"), null);
    assert.equal(container.querySelector('[role="alert"]'), null);
    console.log("PASS billing form, backend invoice reservation, live pricing, CRUD, search, synchronization, PDF preview/printing, downloads and exports");
  } finally {
    await act(async () => root.unmount()); testWindow.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

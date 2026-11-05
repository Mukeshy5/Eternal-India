import assert from "node:assert/strict";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { journeyRoute, roadPoint } from "../src/Common/journeyRoute.js";

export async function verifyVoucher(server) {
  const route = journeyRoute("Delhi", "Airport", [{ name: "Jaipur", distanceKm: 300 }, { name: "Agra", distanceKm: 100 }]);
  assert.equal(route.total, 400);
  assert.equal(route.points[1].fraction, .75, "pin position follows cumulative leg distance");
  assert.equal(route.points[2].fraction, 1);
  assert.equal(route.points[1].cumulative, 300);
  assert.deepEqual({ x: route.points[1].x, y: route.points[1].y }, roadPoint(.75));
  const pending = journeyRoute("Delhi", "", [{ name: "Jaipur", distanceKm: "" }, { name: "Agra", distanceKm: 100 }]);
  assert.equal(pending.complete, false);
  assert.equal(pending.points[1].cumulative, null, "missing distances are not invented");
  const zero = journeyRoute("Delhi", "", [{ name: "Delhi", distanceKm: 0 }]);
  assert.equal(zero.total, 0);
  assert.ok(Number.isFinite(zero.points[1].x));
  assert.ok(journeyRoute("Delhi", "", Array.from({ length: 20 }, (_, index) => ({ name: `Stop ${index}`, distanceKm: index + 1 }))).points.every((point) => point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100));

  const testWindow = new Window({ url: "http://localhost/admin" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const hotel = { _id: "000000000000000000000012", name: "Heritage Stay", starRating: "4-Star (Upscale / Deluxe)", gst: 12, amount: 5000 };
  const saves = [];
  const errors = [];
  let prints = 0;
  let decoded = 0;
  testWindow.print = () => { prints += 1; };
  testWindow.HTMLImageElement.prototype.decode = async () => { decoded += 1; };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/admin/hotels") return Response.json({ hotels: [hotel] });
    if (url === "/api/admin/vouchers") {
      const body = JSON.parse(options.body);
      saves.push(body);
      return Response.json({ voucher: { ...body, voucherNumber: "EIV-TEST-123", createdAt: "2026-11-05T12:00:00Z", stops: body.stops.map((stop) => ({ ...stop, distanceKm: Number(stop.distanceKm), hotel })) } }, { status: 201 });
    }
    throw new Error(`Unexpected voucher request: ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  const input = (name, value) => {
    const element = container.querySelector(`[name="${name}"]`);
    if (element.tagName === "SELECT") element.value = value;
    else Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new testWindow.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };
  const button = (text) => [...container.querySelectorAll("button")].find((element) => element.textContent.includes(text));
  try {
    const { default: JourneyVoucher } = await server.ssrLoadModule("/src/Common/JourneyVoucher.jsx");
    await act(async () => root.render(createElement(JourneyVoucher, { onBack: () => {}, onError: (message) => { if (message) errors.push(message); } })));
    assert.ok(button("Print / Save PDF").disabled, "draft cannot be printed as a saved voucher");
    await act(async () => {
      for (const [name, value] of Object.entries({ guestName: "Family Guest", visitingCardNo: "REF-123", from: "Delhi", fromAddress: "Terminal 3, Delhi Airport", "stop-0-name": "Jaipur", "stop-0-distance": "300", "stop-0-address": "Heritage Stay, Jaipur", "stop-0-arrival": "2026-12-01", "stop-0-departure": "2026-12-03", "stop-0-duration": "2 nights", "stop-0-hotel": hotel._id })) input(name, value);
    });
    await act(async () => button("Add another stop").click());
    await act(async () => {
      for (const [name, value] of Object.entries({ "stop-1-name": "Agra", "stop-1-distance": "100", "stop-1-address": "Taj East Gate, Agra", "stop-1-arrival": "2026-12-03", "stop-1-departure": "2026-12-04", "stop-1-duration": "1 night", "stop-1-hotel": hotel._id })) input(name, value);
    });
    assert.ok(container.querySelector(".voucher-distance-total").textContent.includes("400 km"));
    const pins = container.querySelectorAll(".voucher-map-pin");
    assert.equal(pins.length, 3);
    assert.ok(pins[1].getAttribute("aria-label").includes("Heritage Stay, Jaipur"));
    await act(async () => pins[2].click());
    assert.ok(container.querySelector(".voucher-pin-detail").textContent.includes("Taj East Gate, Agra"));
    assert.equal(container.querySelector("form").checkValidity(), true, JSON.stringify([...container.querySelector("form").elements].filter((element) => element.willValidate && !element.checkValidity()).map((element) => ({ name: element.name, value: element.value, reason: element.validationMessage }))));
    await act(async () => container.querySelector("form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].journey.fromAddress, "Terminal 3, Delhi Airport");
    assert.equal(saves[0].stops[1].address, "Taj East Gate, Agra");
    assert.equal(saves[0].stops[0].key, undefined);
    assert.equal(button("Print / Save PDF").disabled, false);
    const printRoot = testWindow.document.querySelector("#journey-voucher-print-root");
    assert.equal(printRoot.parentElement, testWindow.document.body, "print document is outside the dashboard layout");
    assert.equal(printRoot.querySelectorAll(".vp-itinerary tbody tr").length, 2);
    assert.ok(printRoot.textContent.includes("Terminal 3, Delhi Airport"));
    assert.ok(printRoot.textContent.includes("Taj East Gate, Agra"));
    assert.ok(printRoot.textContent.includes("400 km"));
    assert.equal(printRoot.querySelectorAll("button, input, select, textarea").length, 0, "printout has no interactive form controls");
    assert.ok(container.querySelector(".journey-voucher-print").textContent.includes("EIV-TEST-123"));
    assert.ok(decodeURIComponent(container.querySelector(".voucher-asset").src).includes("Journey Voucher (2).png"));
    await act(async () => button("Print / Save PDF").click());
    assert.equal(prints, 1);
    assert.equal(decoded, 3, "print waits for logo, voucher artwork and route image");
    await act(async () => input("stop-0-distance", "200"));
    assert.equal(button("Print / Save PDF").disabled, true, "editing invalidates the previously saved voucher");
    assert.equal(testWindow.document.querySelector("#journey-voucher-print-root"), null, "editing removes stale printable data");
    assert.ok(container.querySelector(".voucher-distance-total").textContent.includes("300 km"));
    await act(async () => container.querySelector('[aria-label="Remove stop 1"]').click());
    assert.equal(container.querySelector('[name="stop-0-name"]').value, "Agra");
    assert.equal(container.querySelector('[name="stop-0-distance"]').value, "", "removal requires correcting the new leg distance");
    assert.equal(errors.length, 0);
    const { default: PrintDocument } = await server.ssrLoadModule("/src/Common/VoucherPrintDocument.jsx");
    const longVoucher = { ...saves[0], voucherNumber: "EIV-LONG-TEST", createdAt: "2026-11-05", stops: Array.from({ length: 20 }, (_, index) => ({ ...saves[0].stops[0], name: `Destination ${index + 1}`, address: `Complete stop ${index + 1} address, ${"Long address details ".repeat(12)}`, hotel })) };
    const sample = testWindow.document.createElement("div");
    sample.innerHTML = renderToStaticMarkup(createElement(PrintDocument, { voucher: longVoucher }));
    assert.equal(sample.querySelectorAll(".vp-itinerary tbody tr").length, 20, "long itineraries retain every stop in the paged table");
    assert.equal(sample.querySelectorAll(".vp-map-pin").length, 21);
    assert.ok(sample.querySelector("tbody tr:last-child").textContent.includes("Complete stop 20 address"));
    assert.equal(sample.querySelectorAll(".vp-itinerary thead tr th").length, 5);
    console.log("PASS voucher distance placement, live preview, saving, isolated A4 print document, full addresses, 20-stop itinerary, artwork-ready printing and edit consistency");
  } finally {
    await act(async () => root.unmount());
    testWindow.close();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

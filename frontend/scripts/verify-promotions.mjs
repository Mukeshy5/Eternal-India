import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { promotionTargets } from "../../shared/travelCatalog.js";

export async function verifyPromotions(server) {
  const testWindow = new Window({ url: "http://localhost/technical" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const calls = [];
  const saved = {};
  let failSave = false;
  let failLoad = false;
  const image = "/api/offer-images/000000000000000000000001";
  const response = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/technical/promotions" || url === "/api/promotions") {
      if (failLoad && url.includes("technical")) return response({ message: "Cannot load saved offers." }, 503);
      return response({ targets: promotionTargets, promotions: Object.values(saved) });
    }
    if (url === "/api/technical/offer-images") {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.headers["Content-Type"], undefined, "browser supplies the multipart boundary");
      return response({ image }, 201);
    }
    if (url.startsWith("/api/technical/promotions/")) {
      const targetId = decodeURIComponent(url.split("/").at(-1));
      if (options.method === "DELETE") { delete saved[targetId]; return response(null, 204); }
      if (failSave) return response({ message: "Unable to save this offer." }, 503);
      const promotion = { ...JSON.parse(options.body), targetId };
      saved[targetId] = promotion;
      return response({ promotion });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  testWindow.confirm = () => true;
  const type = (selector, value) => {
    const input = container.querySelector(selector);
    Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new testWindow.Event("input", { bubbles: true }));
    input.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  const submit = () => container.querySelector(".promotion-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true }));
  try {
    const { default: Manager } = await server.ssrLoadModule("/src/Common/PromotionManager.jsx");
    const { default: App } = await server.ssrLoadModule("/src/App.jsx");
    let unauthorized = false;
    const editor = () => createElement(MemoryRouter, null, createElement(Manager, { onBack() {}, onUnauthorized() { unauthorized = true; } }));
    await act(async () => root.render(editor()));
    assert.equal(container.querySelectorAll(".promotion-target").length, 35, "every tour, destination, region and featured journey is editable");
    await act(async () => type('input[type="search"]', "Kerala"));
    assert.equal(container.querySelectorAll(".promotion-target").length, 1);
    await act(async () => type('input[type="search"]', ""));
    await act(async () => { type('[name="amount"]', "25000"); type('[name="offerAmount"]', "20000"); type('[name="offerTitle"]', "Winter special"); container.querySelector('[name="offerEnabled"]').click(); });
    assert.ok(container.querySelector(".promotion-preview").textContent.includes("Winter special"));
    assert.ok(container.querySelector(".promotion-preview del").textContent.includes("25,000"));
    const file = container.querySelector('[name="offerImage"]');
    Object.defineProperty(file, "files", { configurable: true, value: [new File(["png"], "offer.png", { type: "image/png" })] });
    await act(async () => file.dispatchEvent(new testWindow.Event("change", { bubbles: true })));
    assert.equal(container.querySelector(".promotion-preview .promotion-mini-image").getAttribute("src"), image);
    // Happy DOM uses floating-point remainder for step validity (25000 % .01 !== 0).
    // Keep real browser constraints in the component; decimal validation is covered by API tests.
    for (const input of container.querySelectorAll('input[type="number"]')) {
      assert.equal(input.getAttribute("step"), "0.01"); input.step = "any";
    }
    assert.ok(container.querySelector(".promotion-form").reportValidity(), [...container.querySelectorAll(".promotion-form input")].filter((input) => !input.checkValidity()).map((input) => `${input.name}: ${input.value} ${input.validationMessage}`).join("; "));
    failSave = true;
    await act(async () => submit());
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("Unable to save"));
    assert.ok(container.querySelector(".promotion-save-hint").textContent.includes("Unsaved"), "failed save preserves the draft");
    failSave = false;
    await act(async () => submit());
    assert.equal(saved["package:golden-triangle"].offerImage, image);
    assert.equal(saved["package:golden-triangle"].offerAmount, 20000);
    assert.ok(container.querySelector('[role="status"]').textContent.includes("saved"));
    await act(async () => container.querySelector('[name="offerEnabled"]').click());
    assert.equal(container.querySelector(".promotion-preview .promotion-offer"), null, "disabled offer hides title and mini image");
    assert.equal(container.querySelector(".promotion-preview del"), null);
    assert.ok(container.querySelector(".promotion-preview .promotion-price").textContent.includes("25,000"));
    await act(async () => container.querySelector('[name="offerEnabled"]').click());
    await act(async () => submit());
    await act(async () => root.render(createElement(MemoryRouter, { key: "public", initialEntries: ["/tour-packages"] }, createElement(App))));
    const cards = container.querySelectorAll(".travel-card");
    assert.ok(cards[0].textContent.includes("Winter special"));
    assert.ok(cards[0].textContent.includes("20,000"));
    assert.equal(cards[0].querySelector(".promotion-mini-image").getAttribute("src"), image);
    assert.equal(cards[1].querySelector(".promotion-display"), null, "promotion only changes the selected package");
    await act(async () => root.render(createElement(MemoryRouter, { key: "detail", initialEntries: ["/tour-packages/golden-triangle"] }, createElement(App))));
    assert.ok(container.querySelector(".travel-hero-art .promotion-offer"));
    assert.ok(container.querySelector(".travel-gallery .promotion-offer"), "place images include the saved promotion");
    await act(async () => root.render(editor()));
    assert.equal(container.querySelector('[name="amount"]').value, "25000", "saved amount is restored when reopening the editor");
    assert.equal(container.querySelector('[name="offerTitle"]').value, "Winter special");
    const remove = [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove amount & offer");
    await act(async () => remove.click());
    assert.equal(saved["package:golden-triangle"], undefined);
    assert.equal(container.querySelector(".promotion-preview .promotion-display"), null);
    assert.equal(unauthorized, false);
    failLoad = true;
    await act(async () => root.render(createElement(MemoryRouter, { key: "failed-load" }, createElement(Manager, { onBack() {}, onUnauthorized() {} }))));
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("Cannot load"));
    assert.equal(container.querySelector('.promotion-form button[type="submit"]').disabled, true, "failed loading cannot overwrite existing saved offers");
    assert.ok(calls.some((call) => call.options.method === "DELETE"));
    console.log("PASS technical pricing editor, all 35 targets, upload, save failures, persistence, offer visibility, public cards/detail images, and removal");
  } finally {
    await act(async () => root.unmount());
    testWindow.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

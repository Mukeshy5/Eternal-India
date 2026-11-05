import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Window } from "happy-dom";

export async function verifyPaymentInteractions(server) {
  const testWindow = new Window({ url: "http://localhost/online-payment" });
  const previousGlobals = new Map();
  for (const [key, value] of Object.entries({
    window: testWindow,
    document: testWindow.document,
    navigator: testWindow.navigator,
    HTMLElement: testWindow.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  const intervals = new Map();
  let nextInterval = 0;
  testWindow.setInterval = (callback) => {
    const id = ++nextInterval;
    intervals.set(id, callback);
    return id;
  };
  testWindow.clearInterval = (id) => intervals.delete(id);
  let copiedText;
  Object.defineProperty(testWindow.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => { copiedText = text; } },
  });

  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  try {
    const { default: Payment } = await server.ssrLoadModule("/src/Common/OnlinePayment.jsx");
    await act(async () => root.render(createElement(Payment)));
    const generate = container.querySelector(".qr-generate-button");
    const display = container.querySelector("#payment-qr-display");
    assert.equal(display.hidden, true);
    assert.equal(container.querySelector(".actual-payment-qr"), null);

    await act(async () => generate.click());
    assert.equal(display.hidden, false);
    assert.ok(container.querySelector(".actual-payment-qr").src.includes("payment-QR"));
    assert.equal(container.querySelector('[role="timer"]').textContent, "10:00");
    assert.equal(generate.disabled, true);
    assert.equal(intervals.size, 1);

    await act(async () => {
      now += 599_001;
      for (const callback of intervals.values()) callback();
    });
    assert.equal(container.querySelector('[role="timer"]').textContent, "00:01");
    assert.equal(display.hidden, false);

    await act(async () => {
      now += 999;
      for (const callback of intervals.values()) callback();
    });
    assert.equal(display.hidden, true);
    assert.equal(container.querySelector(".actual-payment-qr"), null);
    assert.equal(generate.disabled, false);
    assert.equal(intervals.size, 0);

    await act(async () => generate.click());
    assert.equal(container.querySelector('[role="timer"]').textContent, "10:00");
    await act(async () => container.querySelector(".qr-hide-button").click());
    assert.equal(display.hidden, true);
    assert.equal(intervals.size, 0);

    await act(async () => generate.click());
    await act(async () => {
      now += 601_000;
      testWindow.document.dispatchEvent(new testWindow.Event("visibilitychange"));
    });
    assert.equal(display.hidden, true, "QR hides immediately on return from an expired background tab");
    assert.equal(intervals.size, 0);

    await act(async () => container.querySelector(".bank-copy-row button").click());
    for (const value of ["921020029366590", "AXISINBB1600", "UTIB0001600", "ETERNAL INDIA"]) {
      assert.ok(copiedText.includes(value));
    }
    assert.ok(container.textContent.includes("Bank details copied."));
    testWindow.navigator.clipboard.writeText = async () => { throw new Error("Clipboard unavailable"); };
    await act(async () => container.querySelector(".bank-copy-row button").click());
    assert.ok(container.textContent.includes("Please select and copy"));

    await act(async () => generate.click());
    await act(async () => root.unmount());
    assert.equal(intervals.size, 0, "unmount clears the QR timer");
    console.log("PASS QR button, countdown, automatic hiding, regeneration, background expiry, clipboard, and timer cleanup");
  } finally {
    await act(async () => root.unmount());
    testWindow.close();
    Date.now = originalNow;
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

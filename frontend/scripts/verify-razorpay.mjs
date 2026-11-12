import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Window } from "happy-dom";
import { pathToFileURL } from "node:url";

export async function verifyRazorpayInteractions(server) {
  const testWindow = new Window({ url: "http://localhost/online-payment" }), previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch, calls = [], checkouts = [], timers = new Map();
  let timerId = 0, releaseCreate, releaseVerify, createMode = "hold", verifyMode = "hold", status = "CREATED", createBodies = [];
  testWindow.setInterval = (fn) => { timers.set(++timerId, fn); return timerId; }; testWindow.clearInterval = (id) => timers.delete(id);
  class TestCheckout {
    constructor(options) { this.options = options; this.events = {}; this.opened = false; checkouts.push(this); }
    on(event, callback) { this.events[event] = callback; }
    open() { this.opened = true; }
    close() { if (this.opened) { this.opened = false; this.options.modal.ondismiss(); } }
  }
  testWindow.Razorpay = TestCheckout;
  const payment = () => ({ receipt: "EI-UI-TEST", amount: 125050, currency: "INR", status, razorpayOrderId: "order_UITest1", razorpayPaymentId: status === "PAID" ? "pay_UITest1" : null });
  const response = (data, code = 200) => new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json" } });
  const order = () => response({ keyId: "rzp_test_uitest", mode: "test", orderId: "order_UITest1", amount: 125050, currency: "INR", payment: payment() });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/payments/config") return response({ enabled: true, mode: "test", minAmount: 100, maxAmount: 50000000 });
    if (url === "/api/payments/create-order") {
      createBodies.push(JSON.parse(options.body));
      if (createMode === "hold") return new Promise((resolve) => { releaseCreate = () => resolve(order()); });
      if (createMode === "network") throw new Error("Connection lost");
      return order();
    }
    if (url === "/api/payments/verify") {
      if (verifyMode === "hold") return new Promise((resolve) => { releaseVerify = () => { status = "PAID"; resolve(response({ payment: payment() })); }; });
      if (verifyMode === "network") throw new Error("Connection lost");
      if (verifyMode === "invalid") return response({ message: "Payment signature is invalid." }, 400);
      status = "PAID"; return response({ payment: payment() });
    }
    if (url.startsWith("/api/payments/status/")) {
      assert.match(options.headers.Authorization, /^Bearer [a-f\d]{64}$/); return response({ payment: payment() });
    }
    throw new Error(`Unexpected payment API call: ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container); const root = createRoot(container);
  const type = (name, value) => {
    const element = container.querySelector(`[name="${name}"]`); Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new testWindow.Event("input", { bubbles: true })); element.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  const submit = () => container.querySelector("form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true }));
  const fill = async () => { for (const [name, value] of Object.entries({ customerName: "Payment UI Guest", email: "guest@example.com", phone: "+919876543210", amount: "1250.50" })) await act(async () => type(name, value)); };
  const reset = async () => { status = "CREATED"; await act(async () => container.querySelector(".checkout-result button").click()); await fill(); };
  try {
    const { default: Checkout } = await server.ssrLoadModule("/src/Common/RazorpayCheckout.jsx");
    await act(async () => root.render(createElement(Checkout)));
    assert.ok(container.textContent.includes("Test Mode"));
    assert.equal(container.querySelector('[name="bookingId"]'), null);
    assert.equal(container.querySelector('[name="description"]'), null);
    await act(async () => submit()); assert.equal(createBodies.length, 0); assert.ok(container.querySelectorAll('[aria-invalid="true"]').length >= 4);
    await fill();
    await act(async () => submit()); assert.equal(createBodies.length, 1); assert.equal(container.querySelector('button[type="submit"]').disabled, true);
    assert.equal(Object.hasOwn(createBodies[0], "bookingId"), false);
    assert.equal(Object.hasOwn(createBodies[0], "description"), false);
    await act(async () => submit()); assert.equal(createBodies.length, 1, "duplicate click does not send another request");
    await act(async () => releaseCreate());
    assert.equal(checkouts.length, 1); const first = checkouts[0]; assert.equal(first.options.amount, 125050); assert.equal(first.options.order_id, "order_UITest1"); assert.equal(first.options.prefill.email, "guest@example.com");
    assert.equal(testWindow.document.querySelector('script[src*="checkout.razorpay.com"]'), null, "existing official checkout is reused");
    let handled;
    await act(async () => { handled = first.options.handler({ razorpay_order_id: "order_UITest1", razorpay_payment_id: "pay_UITest1", razorpay_signature: "a".repeat(64) }); });
    assert.equal(container.querySelector(".checkout-success"), null, "checkout callback alone is never success");
    assert.ok(container.textContent.includes("Confirming your payment"));
    await act(async () => { releaseVerify(); await handled; }); assert.ok(container.querySelector(".checkout-success")); assert.ok(container.textContent.includes("pay_UITest1"));
    await reset(); createMode = "normal";
    await act(async () => submit()); const cancelled = checkouts.at(-1);
    await act(async () => cancelled.close()); assert.equal(container.querySelector(".checkout-success"), null);
    const cancellationRequest = createBodies.at(-1); await act(async () => submit());
    assert.equal(createBodies.at(-1).submissionId, cancellationRequest.submissionId); assert.equal(createBodies.at(-1).accessToken, cancellationRequest.accessToken, "cancellation retries keep the original owner and order request");
    const failed = checkouts.at(-1); await act(async () => failed.events["payment.failed"]()); assert.ok(container.textContent.includes("unsuccessful")); assert.equal(container.querySelector('button[type="submit"]').disabled, false);
    await act(async () => submit()); verifyMode = "network";
    await act(async () => checkouts.at(-1).options.handler({ razorpay_order_id: "order_UITest1", razorpay_payment_id: "pay_UITest1", razorpay_signature: "a".repeat(64) }));
    assert.equal(container.querySelector(".checkout-success"), null); assert.ok(container.textContent.includes("haven’t confirmed receipt")); assert.ok(container.querySelector(".secure-status-button"));
    status = "PAID"; await act(async () => container.querySelector(".secure-status-button").click()); assert.ok(container.querySelector(".checkout-success"), "webhook confirmation recovers a lost verification response");
    await reset(); createMode = "network";
    await act(async () => submit()); const interruptedRequest = createBodies.at(-1); assert.ok(container.textContent.includes("couldn't connect"));
    createMode = "normal"; await act(async () => submit()); assert.equal(createBodies.at(-1).submissionId, interruptedRequest.submissionId, "lost create responses reuse the original request");
    verifyMode = "invalid";
    await act(async () => checkouts.at(-1).options.handler({ razorpay_order_id: "order_UITest1", razorpay_payment_id: "pay_UITest1", razorpay_signature: "0".repeat(64) }));
    assert.ok(container.textContent.includes("signature is invalid")); assert.equal(container.querySelector(".checkout-success"), null);
    assert.equal(testWindow.localStorage.length, 0, "no payment or success flags are stored in localStorage");
    const { default: Management } = await server.ssrLoadModule("/src/Common/PaymentManagement.jsx");
    globalThis.fetch = async (url) => {
      if (url.startsWith("/api/admin/payments?")) { const params = new URL(url, "http://localhost").searchParams; return response({ payments: params.get("search") === "missing" ? [] : [{ ...payment(), _id: "000000000000000000000001", customerName: "Payment UI Guest", email: "guest@example.com", phone: "+919876543210", mode: "test", refundStatus: "PARTIAL", refundedAmount: 5000 }], total: 1, page: 1, pages: 1, stats: { successful: 1, pending: 0, failed: 0, collectedAmount: 125050, refundedAmount: 5000 } }); }
      if (url.startsWith("/api/admin/payments/")) return response({ payment: { ...payment(), customerName: "Payment UI Guest", history: [{ status: "PAID", source: "payment.captured", at: new Date().toISOString() }], refunds: [{ id: "rfnd_UITest", amount: 5000, status: "processed" }] } });
      throw new Error(`Unexpected admin payment call: ${url}`);
    };
    await act(async () => root.render(createElement(Management, { onUnauthorized: () => assert.fail("Unexpected unauthorized response") })));
    assert.ok(container.textContent.includes("guest@example.com")); assert.ok(container.textContent.includes("PARTIAL")); assert.ok(container.querySelectorAll(".payment-statistics article").length === 4);
    await act(async () => container.querySelector('[aria-label^="View transaction"]').click()); assert.ok(container.querySelector(".payment-admin-detail").textContent.includes("payment.captured")); assert.ok(container.textContent.includes("rfnd_UITest"));
    await act(async () => root.unmount()); assert.equal(timers.size, 0, "checkout and admin polling stop on unmount");
    console.log("PASS Razorpay form validation, double-click protection, server-only success, cancellation/retry, gateway failure, invalid signature, network recovery, ownership headers, admin details/refunds and timer cleanup (external gateway simulated)");
  } finally {
    await act(async () => root.unmount()); testWindow.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createServer } = await import("vite"); const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try { await verifyRazorpayInteractions(server); } finally { await server.close(); }
}

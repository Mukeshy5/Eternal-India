import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../app.js";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { validatePayment } from "../payments/validation.js";
import { validSignature } from "../payments/service.js";

const paymentConfig = { keyId: "rzp_test_integration", keySecret: "integration-signing-secret", webhookSecret: "integration-webhook-secret", mode: "test", minAmount: 100, maxAmount: 50000000 };
const input = (patch = {}) => ({ customerName: "Payment Integration", email: "payment@example.com", phone: "+919876543210", bookingId: "EI-INVOICE-42", description: "Booking deposit", amount: "1250.50", submissionId: randomUUID(), accessToken: randomBytes(32).toString("hex"), ...patch });
const signature = (orderId, paymentId) => createHmac("sha256", paymentConfig.keySecret).update(`${orderId}|${paymentId}`).digest("hex");

test("payment validation rejects unsafe amounts, malformed fields and invalid signatures", () => {
  assert.equal(validatePayment(input({ amount: "1.01" }), paymentConfig).amount, 101);
  const minimal = validatePayment(input({ bookingId: undefined, description: undefined }), paymentConfig);
  assert.equal(minimal.bookingId, "");
  assert.equal(minimal.description, "Eternal India payment");
  for (const patch of [{ amount: "0.99" }, { amount: "500000.01" }, { amount: "1.001" }, { amount: "1e3" }, { amount: -20 }, { amount: null }, { amount: {} }, { currency: "USD" }, { email: { $ne: "" } }, { phone: "000" }, { customerName: "<script>" }, { description: "bad\nvalue" }, { accessToken: "short" }, { submissionId: "invalid" }]) assert.throws(() => validatePayment(input(patch), paymentConfig), { status: 400 });
  assert.equal(validSignature("message", "0".repeat(64), "secret"), false);
  assert.equal(validSignature("message", "invalid", "secret"), false);
  assert.equal(validSignature("message", createHmac("sha256", "secret").update("message").digest("hex"), "secret"), true);
  const base = { SESSION_SECRET: "payment-config-test-secret-more-than-32-characters" };
  assert.equal(readConfig(base).payments.mode, "test");
  assert.throws(() => readConfig({ ...base, RAZORPAY_KEY_ID: "rzp_live_wrongmode" }), /match RAZORPAY_MODE/);
  assert.throws(() => readConfig({ ...base, PAYMENT_MIN_AMOUNT_INR: "10", PAYMENT_MAX_AMOUNT_INR: "1" }), /limits/);
  assert.ok(readConfig({ ...base, FRONTEND_URL: "https://payments.example.com" }).origins.includes("https://payments.example.com"));
});

test("payment API uses real MongoDB, ownership, atomic idempotency, gateway verification and signed raw webhooks", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "payment-owner@example.com", adminPassword: "PaymentOwnerTest9", technicalEmail: "", payments: paymentConfig };
  const { client, db } = await connectDatabase(config);
  await ensureAdmin(db, config);
  const orders = new Map(), snapshots = new Map(), refunds = new Map();
  let creates = 0, loseResponse = false, rejectNext = false, beforeResponse;
  // Only the external Razorpay boundary is simulated. The application always uses
  // the official SDK in production; HTTP, authentication and MongoDB are real here.
  const gateway = {
    orders: {
      async create(body) { creates++; if (rejectNext) { rejectNext = false; throw { statusCode: 400 }; } const order = { ...body, id: `order_Test${creates}`, status: "created" }; orders.set(order.id, order); if (beforeResponse) await beforeResponse(order); if (loseResponse) { loseResponse = false; throw new Error("Connection interrupted after create"); } return order; },
      async all({ receipt }) { return { items: [...orders.values()].filter((order) => order.receipt === receipt) }; },
      async fetch(id) { return orders.get(id); },
    },
    payments: { async fetch(id) { if (!snapshots.has(id)) throw new Error("Payment unavailable"); return { ...snapshots.get(id) }; } },
    refunds: { async fetch(id) { return refunds.get(id); } },
  };
  const instance = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 }, paymentGateway: gateway });
  await instance.decorationsReady;
  const server = instance.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = "GET", body, headers = {} } = {}) => fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const create = async (fields = input()) => { const response = await request("/payments/create-order", { method: "POST", body: fields }); assert.equal(response.status, 200, await response.clone().text()); return { fields, ...await response.json() }; };
  const snapshot = (order, patch = {}) => { const id = `pay_Test${order.orderId.slice(6)}`; const value = { id, order_id: order.orderId, amount: order.amount, currency: "INR", status: "captured", captured: true, method: "upi", amount_refunded: 0, created_at: 1794450000, ...patch }; snapshots.set(id, value); return value; };
  const verify = (order, payment, patch = {}) => request("/payments/verify", { method: "POST", body: { razorpay_order_id: order.orderId, razorpay_payment_id: payment.id, razorpay_signature: signature(order.orderId, payment.id), accessToken: order.fields.accessToken, ...patch } });
  const status = (order, token = order.fields.accessToken) => request(`/payments/status/${order.orderId}`, { headers: { Authorization: `Bearer ${token}` } });
  const webhook = (event, eventId = `evt_${randomUUID()}`, patch = {}) => { const raw = JSON.stringify(event, null, 2); return fetch(`${base}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Razorpay-Event-Id": eventId, "X-Razorpay-Signature": createHmac("sha256", paymentConfig.webhookSecret).update(raw).digest("hex"), ...patch }, body: raw }); };
  const paymentEvent = (payment, event = "payment.captured") => ({ event, payload: { payment: { entity: payment } } });
  let successful, adminCookie;
  try {
    await t.test("configuration contains no secrets; admin and guest transactions are protected", async () => {
      const response = await request("/payments/config"); const text = await response.text(); assert.equal(response.status, 200); assert.ok(!text.includes(paymentConfig.keySecret) && !text.includes(paymentConfig.webhookSecret));
      assert.equal((await request("/admin/payments")).status, 401);
      assert.equal((await request("/payments/status/order_Missing")).status, 404);
      assert.equal((await request("/technical/payments")).status, 404);
      assert.equal((await request("/payments/create-order", { method: "POST", body: input({ amount: "0.01" }) })).status, 400); assert.equal(creates, 0);
    });
    await t.test("duplicate and concurrent requests create one order and enforce immutable details and ownership", async () => {
      const fields = input(), previous = creates;
      const responses = await Promise.all([request("/payments/create-order", { method: "POST", body: fields }), request("/payments/create-order", { method: "POST", body: fields })]);
      for (const response of responses) assert.ok([200, 409].includes(response.status));
      successful = await create(fields); assert.equal(creates, previous + 1);
      assert.equal(await db.collection("payments").countDocuments({ submissionId: fields.submissionId }), 1);
      assert.equal((await request("/payments/create-order", { method: "POST", body: { ...fields, amount: "2000" } })).status, 409);
      assert.equal((await request("/payments/create-order", { method: "POST", body: { ...fields, accessToken: randomBytes(32).toString("hex") } })).status, 409);
      assert.equal((await status(successful, randomBytes(32).toString("hex"))).status, 404);
      const body = await (await status(successful)).json(); assert.equal(body.payment.status, "CREATED"); assert.ok(!JSON.stringify(body).includes(fields.email));
      const saved = await db.collection("payments").findOne({ submissionId: fields.submissionId }); assert.ok(saved.accessTokenHash && saved.accessTokenHash !== fields.accessToken); assert.equal(saved.accessToken, undefined);
    });
    await t.test("invalid signatures, wrong amounts, wrong currency, wrong order and unavailable gateway never mark paid", async () => {
      const payment = snapshot(successful);
      assert.equal((await verify(successful, payment, { razorpay_signature: "0".repeat(64) })).status, 400);
      assert.equal((await verify(successful, payment, { accessToken: randomBytes(32).toString("hex") })).status, 404);
      for (const patch of [{ amount: 1 }, { currency: "USD" }, { order_id: "order_Other" }, { captured: false }]) { snapshots.set(payment.id, { ...payment, ...patch }); assert.equal((await verify(successful, payment)).status, 409); }
      snapshots.delete(payment.id); assert.equal((await verify(successful, payment)).status, 503);
      assert.equal((await (await status(successful)).json()).payment.status, "CREATED");
      snapshots.set(payment.id, payment);
    });
    await t.test("verified raw webhook before callback marks captured payment paid exactly once", async () => {
      const payment = snapshots.get(`pay_Test${successful.orderId.slice(6)}`), event = paymentEvent(payment), eventId = "evt_capture_first";
      assert.equal((await webhook(event, eventId, { "X-Razorpay-Signature": "0".repeat(64) })).status, 400);
      assert.equal(await db.collection("payment_webhook_events").countDocuments(), 0);
      const replies = await Promise.all([webhook(event, eventId), webhook(event, eventId)]); for (const reply of replies) assert.equal(reply.status, 200, await reply.text());
      const saved = await db.collection("payments").findOne({ razorpayOrderId: successful.orderId });
      assert.equal(saved.status, "PAID"); assert.equal(saved.processedEventIds.length, 1); assert.equal(saved.history.filter((entry) => entry.status === "PAID").length, 1);
      const firstVerifiedAt = saved.verifiedAt.getTime(), revision = saved.revision;
      const callbacks = await Promise.all([verify(successful, payment), verify(successful, payment)]); for (const reply of callbacks) assert.equal((await reply.json()).payment.status, "PAID");
      const unchanged = await db.collection("payments").findOne({ _id: saved._id }); assert.equal(unchanged.verifiedAt.getTime(), firstVerifiedAt); assert.equal(unchanged.revision, revision);
      assert.equal((await webhook({ ...event, other: true }, eventId)).status, 409);
      assert.equal((await verify(successful, payment, { razorpay_signature: "0".repeat(64) })).status, 400, "paid orders still reject forged callbacks");
    });
    await t.test("authorized is not paid; failed attempts can retry; late failures do not downgrade paid", async () => {
      const order = await create(), payment = snapshot(order, { status: "authorized", captured: false });
      assert.equal((await (await verify(order, payment)).json()).payment.status, "AUTHORIZED");
      snapshots.set(payment.id, { ...payment, status: "captured", captured: true });
      const captured = snapshots.get(payment.id);
      assert.equal((await webhook({ event: "order.paid", payload: { payment: { entity: captured }, order: { entity: orders.get(order.orderId) } } })).status, 200);
      assert.equal((await (await status(order)).json()).payment.status, "PAID");
      snapshots.set(payment.id, { ...payment, status: "failed", error_description: "Declined" });
      assert.equal((await webhook(paymentEvent(snapshots.get(payment.id), "payment.failed"))).status, 200);
      assert.equal((await (await status(order)).json()).payment.status, "PAID");
      const failedOrder = await create(), declined = snapshot(failedOrder, { status: "failed", captured: false, error_description: "Payment declined" });
      assert.equal((await webhook(paymentEvent(declined, "payment.failed"))).status, 200);
      assert.equal((await (await status(failedOrder)).json()).payment.status, "FAILED");
      const previous = creates; await create(failedOrder.fields); assert.equal(creates, previous, "retry reuses Razorpay order");
      snapshots.set(declined.id, { ...declined, status: "captured", captured: true });
      assert.equal((await (await verify(failedOrder, declined)).json()).payment.status, "PAID");
    });
    await t.test("a lost create response is recovered by receipt without another gateway order", async () => {
      loseResponse = true; const fields = input(), previous = creates;
      assert.equal((await request("/payments/create-order", { method: "POST", body: fields })).status, 503);
      const recovered = await create(fields); assert.ok(recovered.orderId); assert.equal(creates, previous + 1);
      assert.equal(await db.collection("payments").countDocuments({ submissionId: fields.submissionId }), 1);
    });
    await t.test("a webhook interrupted after event reservation can retry and finish once", async () => {
      const order = await create(), payment = snapshot(order), event = paymentEvent(payment), eventId = "evt_retry_after_outage";
      snapshots.delete(payment.id);
      assert.equal((await webhook(event, eventId)).status, 503);
      assert.equal((await db.collection("payment_webhook_events").findOne({ _id: eventId })).status, "RECEIVED");
      assert.equal((await (await status(order)).json()).payment.status, "CREATED");
      snapshots.set(payment.id, payment);
      assert.equal((await webhook(event, eventId)).status, 200);
      assert.equal((await webhook(event, eventId)).status, 200);
      const saved = await db.collection("payments").findOne({ razorpayOrderId: order.orderId });
      assert.equal(saved.history.filter((entry) => entry.status === "PAID").length, 1);
      assert.equal((await db.collection("payment_webhook_events").findOne({ _id: eventId })).status, "PROCESSED");
    });
    await t.test("a definitive order rejection can retry once and clears the old failure reason", async () => {
      const fields = input(), previous = creates; rejectNext = true;
      assert.equal((await request("/payments/create-order", { method: "POST", body: fields })).status, 503);
      const rejected = await db.collection("payments").findOne({ submissionId: fields.submissionId }); assert.equal(rejected.status, "FAILED"); assert.equal(rejected.createState, "REJECTED");
      const recovered = await create(fields); assert.equal(recovered.payment.status, "CREATED"); assert.equal(recovered.payment.failureReason, null); assert.equal(creates, previous + 2);
      const saved = await db.collection("payments").findOne({ _id: rejected._id }); assert.ok(saved.history.some((entry) => entry.source === "order-retry"));
      await create(fields); assert.equal(creates, previous + 2);
    });
    await t.test("webhook arriving during order creation binds the saved pending transaction", async () => {
      beforeResponse = async (order) => {
        const payment = snapshot({ orderId: order.id, amount: order.amount });
        const response = await webhook(paymentEvent(payment)); assert.equal(response.status, 200, await response.text());
      };
      const order = await create(); beforeResponse = undefined;
      assert.equal(order.payment.status, "PAID"); assert.equal((await (await status(order)).json()).payment.status, "PAID");
    });
    await t.test("partial and full refund webhooks preserve history and ignore duplicates", async () => {
      const payment = snapshots.get(`pay_Test${successful.orderId.slice(6)}`), partial = { id: "rfnd_Partial", payment_id: payment.id, amount: 50000, status: "processed" };
      refunds.set(partial.id, partial); snapshots.set(payment.id, { ...payment, amount_refunded: 50000 });
      const event = { event: "refund.processed", payload: { refund: { entity: partial } } };
      assert.equal((await webhook(event, "evt_refund_partial")).status, 200); assert.equal((await webhook(event, "evt_refund_partial")).status, 200);
      let saved = await db.collection("payments").findOne({ razorpayOrderId: successful.orderId }); assert.equal(saved.status, "PAID"); assert.equal(saved.refundStatus, "PARTIAL"); assert.equal(saved.refunds.length, 1);
      const full = { ...partial, id: "rfnd_Remaining", amount: payment.amount - 50000 }; refunds.set(full.id, full); snapshots.set(payment.id, { ...payment, status: "refunded", amount_refunded: payment.amount });
      assert.equal((await webhook({ event: "refund.processed", payload: { refund: { entity: full } } })).status, 200);
      saved = await db.collection("payments").findOne({ _id: saved._id }); assert.equal(saved.status, "REFUNDED"); assert.equal(saved.refundedAmount, payment.amount); assert.equal(saved.refunds.length, 2);
      snapshots.set(payment.id, payment); assert.equal((await webhook(paymentEvent(payment), "evt_delayed_capture")).status, 200); assert.equal((await (await status(successful)).json()).payment.status, "REFUNDED");
    });
    await t.test("authorized admins can search, filter, paginate, view totals and transaction history without secrets", async () => {
      const login = await request("/admin/login", { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } }); assert.equal(login.status, 200); adminCookie = cookieHeader(login);
      const response = await request("/admin/payments?search=EI-INVOICE-42", { headers: { Cookie: adminCookie } }); assert.equal(response.status, 200);
      const result = await response.json(); assert.ok(result.total >= 5); assert.ok(result.stats.successful >= 4); assert.equal(result.stats.refundedAmount, successful.amount);
      const text = JSON.stringify(result); for (const secret of [paymentConfig.keySecret, paymentConfig.webhookSecret, successful.fields.accessToken, "accessTokenHash", "submissionId", "processedEventIds"]) assert.ok(!text.includes(secret));
      const entry = result.payments.find((item) => item.receipt === successful.payment.receipt);
      const detail = await request(`/admin/payments/${entry._id}`, { headers: { Cookie: adminCookie } }); assert.equal(detail.status, 200); assert.ok((await detail.json()).payment.history.length >= 4);
      const filtered = await (await request("/admin/payments?status=REFUNDED", { headers: { Cookie: adminCookie } })).json(); assert.equal(filtered.total, 1); assert.equal(filtered.payments[0].status, "REFUNDED");
      assert.equal((await request("/admin/payments?from=2026-02-30", { headers: { Cookie: adminCookie } })).status, 400);
      assert.equal((await request("/admin/payments?status=UNKNOWN", { headers: { Cookie: adminCookie } })).status, 400);
      const dates = await (await request("/admin/payments?from=2000-01-01&to=2000-01-01", { headers: { Cookie: adminCookie } })).json(); assert.equal(dates.total, 0);
      const technical = await ensureAdmin(db, { ...config, adminEmail: "payment-technical@example.com" });
      await db.collection("admins").updateOne({ _id: technical._id }, { $set: { roles: ["technical"] } });
      const technicalLogin = await request("/technical/login", { method: "POST", body: { email: technical.email, password: config.adminPassword } }); assert.equal(technicalLogin.status, 200);
      assert.equal((await request("/admin/payments", { headers: { Cookie: cookieHeader(technicalLogin) } })).status, 403, "technical-only credentials cannot access admin transactions");
    });
  } finally {
    await instance.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve)); await instance.drainSessions();
    if (!db.databaseName.startsWith("eternal_india_test_")) throw new Error("Refusing to remove a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});

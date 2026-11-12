import Razorpay from "razorpay";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { publicPayment } from "./model.js";
import { paymentError, validAccessToken, validOrderId, validPaymentId, validatePayment } from "./validation.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
export function validSignature(message, signature, secret) {
  if (!secret || typeof signature !== "string" || !/^[a-f\d]{64}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(message).digest(), Buffer.from(signature, "hex"));
}

export function createPaymentService({ db, config, gateway: injectedGateway }) {
  const settings = config.payments || { minAmount: 100, maxAmount: 50000000, mode: "test" };
  const payments = db.collection("payments");
  let gateway = injectedGateway;
  const enabled = () => !!(settings.keyId && settings.keySecret && settings.webhookSecret);
  function provider() {
    if (!enabled()) throw paymentError(503, "Online checkout is temporarily unavailable. Please contact Eternal India for assistance.");
    if (!gateway) {
      gateway = new Razorpay({ key_id: settings.keyId, key_secret: settings.keySecret });
      gateway.api.rq.defaults.timeout = 20000;
    }
    return gateway;
  }
  async function providerCall(action) {
    try { return await action(provider()); }
    catch (error) {
      if (error.publicMessage) throw error;
      throw paymentError(503, "Payment confirmation is temporarily unavailable. Check the transaction status before trying another payment.");
    }
  }
  const configuration = () => ({ enabled: enabled(), mode: settings.mode, currency: "INR", minAmount: settings.minAmount, maxAmount: settings.maxAmount });

  async function owned(orderId, accessToken) {
    if (!validOrderId(orderId) || !validAccessToken(accessToken)) throw paymentError(404, "Transaction not found.");
    const record = await payments.findOne({ razorpayOrderId: orderId, accessTokenHash: hash(accessToken) });
    if (!record) throw paymentError(404, "Transaction not found.");
    return record;
  }
  function assertOrder(record, order) {
    if (!validOrderId(order?.id) || order.amount !== record.amount || order.currency !== record.currency || order.receipt !== record.receipt || (record.razorpayOrderId && record.razorpayOrderId !== order.id)) throw paymentError(409, "The gateway order does not match this transaction.");
  }
  async function bindOrder(record, order) {
    assertOrder(record, order);
    await payments.updateOne({ _id: record._id, razorpayOrderId: { $exists: false } }, { $set: { razorpayOrderId: order.id, createState: "CREATED", status: "CREATED", failureReason: null, updatedAt: new Date() }, $inc: { revision: 1 }, $push: { history: { status: "CREATED", source: "create-order", at: new Date() } } });
    return payments.findOne({ _id: record._id });
  }
  function checkout(record) {
    return { keyId: settings.keyId, mode: settings.mode, orderId: record.razorpayOrderId, amount: record.amount, currency: record.currency, payment: publicPayment(record) };
  }
  async function createOrder(body) {
    provider();
    const fields = validatePayment(body, settings), requestHash = hash(JSON.stringify(fields)), accessTokenHash = hash(body.accessToken);
    const now = new Date(), id = new ObjectId();
    let record = { _id: id, ...fields, submissionId: body.submissionId, accessTokenHash, requestHash, receipt: `EI-${id}`, mode: settings.mode, keyId: settings.keyId, status: "PENDING", createState: "REQUESTED", revision: 0, refundedAmount: 0, refundStatus: "NONE", refunds: [], processedEventIds: [], history: [{ status: "PENDING", source: "create-order", at: now }], createdAt: now, updatedAt: now };
    let create = true;
    try { await payments.insertOne(record); }
    catch (error) {
      if (error.code !== 11000) throw error;
      record = await payments.findOne({ submissionId: body.submissionId, accessTokenHash });
      if (!record) throw paymentError(409, "This payment request cannot be reused.");
      if (record.requestHash !== requestHash) throw paymentError(409, "Payment details changed. Start a new payment request.");
      if (record.keyId !== settings.keyId) throw paymentError(409, "Payment configuration changed. Contact our team before paying again.");
      if (record.razorpayOrderId) return checkout(record);
      // Only a definitive gateway rejection permits another create call. A lost response
      // must be reconciled by its receipt, never by blindly creating another order.
      const reserved = record.createState === "REJECTED" && await payments.findOneAndUpdate({ _id: record._id, createState: "REJECTED" }, { $set: { createState: "REQUESTED", status: "PENDING", failureReason: null, updatedAt: now }, $inc: { revision: 1 }, $push: { history: { status: "PENDING", source: "order-retry", at: now } } }, { returnDocument: "after" });
      create = !!reserved;
      if (reserved) record = reserved;
      if (!create) {
        const result = await providerCall((client) => client.orders.all({ receipt: record.receipt, count: 100 }));
        const matches = (result.items || []).filter((order) => order.receipt === record.receipt);
        if (matches.length === 1) return checkout(await bindOrder(record, matches[0]));
        throw paymentError(409, "Your order is still being confirmed. Retry this request shortly; contact our team if it remains pending.", { code: "ORDER_PENDING", receipt: record.receipt });
      }
    }
    let order;
    try {
      order = await provider().orders.create({ amount: record.amount, currency: record.currency, receipt: record.receipt, partial_payment: false, notes: { paymentReference: record.receipt } });
    } catch (error) {
      if ([400, 401, 403, 422].includes(error.statusCode)) await payments.updateOne({ _id: record._id, razorpayOrderId: { $exists: false } }, { $set: { createState: "REJECTED", status: "FAILED", failureReason: "The gateway could not create this order.", updatedAt: new Date() }, $inc: { revision: 1 }, $push: { history: { status: "FAILED", source: "order-rejected", at: new Date() } } });
      throw paymentError(503, "We could not confirm your payment order. Retry the same request to check it safely.", { code: "ORDER_PENDING", receipt: record.receipt });
    }
    return checkout(await bindOrder(record, order));
  }

  async function applySnapshot(record, payment, { eventId, source, refund } = {}) {
    if (!validPaymentId(payment?.id) || payment.order_id !== record.razorpayOrderId || payment.amount !== record.amount || payment.currency !== record.currency) throw paymentError(409, "Payment amount, currency or order does not match the original transaction.");
    if (!['created', 'authorized', 'captured', 'failed', 'refunded'].includes(payment.status)) throw paymentError(409, "The gateway returned an unsupported payment status.");
    const captured = payment.status === "captured" && payment.captured === true;
    const refunded = payment.status === "refunded" && payment.amount_refunded === record.amount;
    if (payment.status === "captured" && !captured) throw paymentError(409, "Payment capture is not confirmed.");
    if (payment.status === "refunded" && !refunded) throw paymentError(409, "Refund details do not match this payment.");
    const refundedAmount = payment.amount_refunded ?? 0;
    if (!Number.isSafeInteger(refundedAmount) || refundedAmount < 0 || refundedAmount > record.amount || (refundedAmount > 0 && !captured && !refunded)) throw paymentError(409, "The gateway returned invalid refund details.");
    if (refund && (refund.payment_id !== payment.id || refund.status !== "processed" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > refundedAmount || typeof refund.id !== "string" || !/^rfnd_[A-Za-z0-9]+$/.test(refund.id))) throw paymentError(409, "Refund confirmation does not match the original payment.");
    for (let attempt = 0; attempt < 12; attempt++) {
      const current = await payments.findOne({ _id: record._id });
      if (eventId && current.processedEventIds.includes(eventId)) return current;
      // Terminal states cannot be downgraded by delayed failures or authorizations.
      const terminal = ["PAID", "REFUNDED"].includes(current.status);
      if (terminal && current.razorpayPaymentId !== payment.id && (captured || refunded)) throw paymentError(409, "This order already has a different captured payment.");
      let status = current.status;
      if (captured || refunded) status = Math.max(current.refundedAmount || 0, refundedAmount) === current.amount ? "REFUNDED" : "PAID";
      else if (!terminal && payment.status === "authorized") status = "AUTHORIZED";
      else if (!terminal && current.status !== "AUTHORIZED" && payment.status === "failed") status = "FAILED";
      const now = new Date(), changes = { status, updatedAt: now };
      if (captured || refunded || !terminal && status !== "AUTHORIZED" || payment.status === "authorized" && !terminal) {
        changes.razorpayPaymentId = payment.id;
        changes.paymentMethod = typeof payment.method === "string" ? payment.method.slice(0, 40) : null;
      }
      if (captured || refunded) {
        changes.verifiedAt = current.verifiedAt || now;
        changes.transactionDate = current.transactionDate || (Number.isSafeInteger(payment.created_at) && payment.created_at > 0 ? new Date(payment.created_at * 1000) : now);
        changes.failureReason = null;
        changes.refundedAmount = Math.max(current.refundedAmount || 0, refundedAmount);
        changes.refundStatus = changes.refundedAmount === current.amount ? "FULL" : changes.refundedAmount > 0 ? "PARTIAL" : "NONE";
      } else if (status === "FAILED" && !terminal) changes.failureReason = typeof payment.error_description === "string" ? payment.error_description.slice(0, 300) : "The payment attempt failed. You may retry securely.";
      const update = { $set: changes, $inc: { revision: 1 } };
      if (eventId) update.$addToSet = { processedEventIds: eventId };
      const changed = status !== current.status || changes.razorpayPaymentId && changes.razorpayPaymentId !== current.razorpayPaymentId || changes.refundedAmount > current.refundedAmount;
      const newRefund = refund && !current.refunds.some((item) => item.id === refund.id);
      if (!changed && !newRefund && !eventId) return current;
      if (changed) update.$push = { history: { status, source, paymentId: payment.id, refundedAmount: changes.refundedAmount ?? current.refundedAmount, at: now } };
      if (newRefund) update.$push = { ...update.$push, refunds: { id: refund.id, amount: refund.amount, status: refund.status, processedAt: now } };
      const saved = await payments.findOneAndUpdate({ _id: current._id, revision: current.revision }, update, { returnDocument: "after" });
      if (saved) return saved;
    }
    throw paymentError(503, "This transaction is being updated. Check its status shortly.");
  }

  async function verify(body) {
    const record = await owned(body?.razorpay_order_id, body?.accessToken);
    if (!validPaymentId(body?.razorpay_payment_id) || !validSignature(`${record.razorpayOrderId}|${body.razorpay_payment_id}`, body?.razorpay_signature, settings.keySecret)) throw paymentError(400, "Payment signature is invalid.");
    const payment = await providerCall((client) => client.payments.fetch(body.razorpay_payment_id));
    return publicPayment(await applySnapshot(record, payment, { source: "checkout-verification" }));
  }
  async function status(orderId, token) { return publicPayment(await owned(orderId, token)); }

  async function webhook(rawBody, signature, eventId) {
    if (!settings.webhookSecret) throw paymentError(503, "Payment webhooks are not configured.");
    if (!Buffer.isBuffer(rawBody) || !validSignature(rawBody, signature, settings.webhookSecret)) throw paymentError(400, "Webhook signature is invalid.");
    if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(eventId)) throw paymentError(400, "A valid Razorpay event ID is required.");
    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw paymentError(400, "Invalid webhook JSON."); }
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.event !== "string") throw paymentError(400, "Invalid webhook event.");
    const bodyHash = hash(rawBody), events = db.collection("payment_webhook_events");
    try { await events.insertOne({ _id: eventId, bodyHash, type: typeof event.event === "string" ? event.event.slice(0, 80) : "unknown", status: "RECEIVED", receivedAt: new Date() }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      const previous = await events.findOne({ _id: eventId });
      if (previous.bodyHash !== bodyHash) throw paymentError(409, "Webhook event ID was reused with different content.");
      if (previous.status === "PROCESSED") return { received: true, duplicate: true };
    }
    const supported = ["payment.captured", "payment.authorized", "payment.failed", "order.paid", "refund.processed"];
    if (!supported.includes(event.event)) { await events.updateOne({ _id: eventId }, { $set: { status: "PROCESSED", ignored: true, processedAt: new Date() } }); return { received: true }; }
    const entity = event.payload?.payment?.entity, refund = event.payload?.refund?.entity;
    const paymentId = event.event === "refund.processed" ? refund?.payment_id : entity?.id;
    if (!validPaymentId(paymentId)) throw paymentError(400, "Webhook payment is missing.");
    // Fetch the latest gateway snapshot: webhook retries and out-of-order events
    // cannot roll a captured/refunded transaction back to an earlier state.
    const payment = await providerCall((client) => client.payments.fetch(paymentId));
    if (!validOrderId(payment.order_id)) throw paymentError(400, "Webhook order is missing.");
    if (entity && (entity.id !== payment.id || entity.order_id !== payment.order_id || entity.amount !== payment.amount || entity.currency !== payment.currency)) throw paymentError(409, "Webhook payment details do not match the gateway.");
    if (event.event === "order.paid" && (event.payload?.order?.entity?.id !== payment.order_id || event.payload.order.entity.amount !== payment.amount || event.payload.order.entity.currency !== payment.currency)) throw paymentError(409, "Webhook order details do not match the gateway.");
    let record = await payments.findOne({ razorpayOrderId: payment.order_id });
    if (!record) {
      const order = await providerCall((client) => client.orders.fetch(payment.order_id));
      if (typeof order.receipt === "string") record = await payments.findOne({ receipt: order.receipt });
      if (!record) throw paymentError(503, "The original transaction is not available yet. Retry this webhook.");
      record = await bindOrder(record, order);
    }
    if (record.mode !== settings.mode || record.keyId !== settings.keyId) throw paymentError(409, "Payment environment does not match the transaction.");
    const confirmedRefund = event.event === "refund.processed" ? await providerCall((client) => client.refunds.fetch(refund.id)) : undefined;
    const saved = await applySnapshot(record, payment, { eventId, source: event.event, refund: confirmedRefund });
    await events.updateOne({ _id: eventId }, { $set: { status: "PROCESSED", paymentId: saved._id, processedAt: new Date() } });
    return { received: true };
  }
  return { configuration, createOrder, verify, status, webhook };
}

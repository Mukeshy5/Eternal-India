export const paymentStatuses = ["PENDING", "CREATED", "AUTHORIZED", "PAID", "FAILED", "REFUNDED"];

// Native MongoDB models follow the rest of this application. Money is integer paise.
// Payment, event and history records deliberately have no TTL or delete endpoint.
export async function ensurePaymentModels(db) {
  await Promise.all([
    db.collection("payments").createIndex({ submissionId: 1 }, { unique: true }),
    db.collection("payments").createIndex({ receipt: 1 }, { unique: true }),
    db.collection("payments").createIndex({ razorpayOrderId: 1 }, { unique: true, partialFilterExpression: { razorpayOrderId: { $type: "string" } } }),
    db.collection("payments").createIndex({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }),
    db.collection("payments").createIndex({ createdAt: -1, _id: -1 }),
    db.collection("payments").createIndex({ status: 1, createdAt: -1 }),
    db.collection("payment_webhook_events").createIndex({ receivedAt: -1 }),
  ]);
}

export function publicPayment(payment) {
  return Object.fromEntries(["receipt", "amount", "currency", "status", "razorpayOrderId", "razorpayPaymentId", "paymentMethod", "transactionDate", "verifiedAt", "failureReason", "refundedAmount", "refundStatus", "createdAt", "updatedAt"].map((key) => [key, payment[key] ?? null]));
}

export function adminPayment(payment) {
  return { _id: payment._id.toString(), ...publicPayment(payment), ...Object.fromEntries(["customerName", "email", "phone", "bookingId", "description", "mode", "refunds", "history"].map((key) => [key, payment[key]])) };
}

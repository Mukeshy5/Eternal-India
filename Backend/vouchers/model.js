export const voucherCollection = "journey_billing_vouchers";
export async function ensureVoucherModels(db) {
  await Promise.all([
    db.collection(voucherCollection).createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection(voucherCollection).createIndex({ voucherDate: -1, _id: -1 }),
    db.collection(voucherCollection).createIndex({ hotelId: 1, voucherDate: -1 }),
    db.collection(voucherCollection).createIndex({ gstId: 1, voucherDate: -1 }),
    db.collection("journey_invoice_reservations").createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection("journey_invoice_reservations").createIndex({ requestKey: 1 }, { unique: true }),
  ]);
  // Never reset this counter or expire reservations, including after voucher deletion.
  try { await db.collection("billing_counters").updateOne({ _id: "journey_invoice" }, { $setOnInsert: { sequence: 9999 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}

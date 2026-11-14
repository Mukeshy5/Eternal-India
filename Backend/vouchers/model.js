export const voucherCollection = "journey_billing_vouchers";
export async function ensureVoucherModels(db) {
  const text = { bsonType: "string" };
  const schema = { bsonType: "object", required: ["invoiceNumber", "guestName", "hotelId", "gstId", "hotel", "gst", "pricing", "revision", "createdAt", "updatedAt"], properties: {
    invoiceNumber: { ...text, pattern: "^[0-9]{5}$" }, guestName: { ...text, maxLength: 160 }, hotelId: text, gstId: text,
    officeAddressId: { ...text, pattern: "^(|[a-fA-F0-9]{24})$" }, mealPlan: { enum: ["", "CP", "MAP", "AP"] },
    officeAddress: { bsonType: "object", required: ["name", "address", "phone"], properties: { name: { ...text, maxLength: 100 }, address: { ...text, maxLength: 600 }, phone: { ...text, maxLength: 100 } } },
    pricingMode: { enum: ["amount_only", "legacy_tax"] }, hotel: { bsonType: "object" }, gst: { bsonType: "object", required: ["gstNumber"] }, pricing: { bsonType: "object" },
    revision: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
  }, anyOf: [{ required: ["schemaVersion"], properties: { schemaVersion: { enum: [1] } } }, { required: ["schemaVersion", "officeAddressId", "officeAddress", "mealPlan"], properties: { schemaVersion: { enum: [2] }, officeAddressId: { ...text, pattern: "^[a-fA-F0-9]{24}$" }, mealPlan: { enum: ["CP", "MAP", "AP"] } } }] };
  const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
  try { await db.createCollection(voucherCollection, options); }
  catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: voucherCollection, ...options }); }
  await Promise.all([
    db.collection(voucherCollection).createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection(voucherCollection).createIndex({ voucherDate: -1, _id: -1 }),
    db.collection(voucherCollection).createIndex({ hotelId: 1, voucherDate: -1 }),
    db.collection(voucherCollection).createIndex({ gstId: 1, voucherDate: -1 }),
    db.collection(voucherCollection).createIndex({ officeAddressId: 1, voucherDate: -1 }),
    db.collection(voucherCollection).createIndex({ mealPlan: 1, voucherDate: -1 }),
    db.collection("journey_invoice_reservations").createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection("journey_invoice_reservations").createIndex({ requestKey: 1 }, { unique: true }),
  ]);
  // Never reset this counter or expire reservations, including after voucher deletion.
  try { await db.collection("billing_counters").updateOne({ _id: "journey_invoice" }, { $setOnInsert: { sequence: 9999 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}

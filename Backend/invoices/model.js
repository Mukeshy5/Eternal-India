export const invoiceCollection = "billing_invoices";
export async function ensureInvoiceModels(db) {
  const string = { bsonType: "string" }, numeric = { bsonType: ["int", "long", "double", "decimal"] };
  const options = { validator: { $jsonSchema: {
    bsonType: "object", required: ["invoiceNumber", "invoiceDate", "clientName", "totalPerson", "perPersonAmount", "totalAmount", "totalPaise", "recipientDetails", "companyBankDetails", "paymentQrAsset", "notes", "createdBy", "updatedBy", "createdAt", "updatedAt", "version", "requestKey"],
    properties: {
      invoiceNumber: { ...string, pattern: "^EI-INV-[0-9]{6,}$" }, invoiceDate: { ...string, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
      clientName: { ...string, minLength: 1, maxLength: 160 }, totalPerson: { ...numeric, minimum: 1, maximum: 999999, multipleOf: 1 },
      perPersonAmount: { ...numeric, minimum: 0.01, maximum: 99999999.99 }, totalAmount: { ...numeric, minimum: 0.01 }, totalPaise: { ...numeric, minimum: 1, maximum: 999999999999, multipleOf: 1 },
      recipientDetails: { ...string, maxLength: 4000 }, notes: { ...string, maxLength: 6000 }, description: { ...string, maxLength: 300 },
      invoiceType: { enum: ["invoice", "tax_invoice"] }, companyBankDetails: { bsonType: "object", required: ["accountName", "accountNumber", "ifsc", "branch", "accountType", "gstin"] },
      paymentQrAsset: { enum: ["payment-QR"] }, createdBy: { bsonType: "object" }, updatedBy: { bsonType: "object" },
      createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" }, version: { ...numeric, minimum: 1, multipleOf: 1 }, requestKey: string,
    },
  } }, validationLevel: "strict", validationAction: "error" };
  try { await db.createCollection(invoiceCollection, options); }
  catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: invoiceCollection, ...options }); }
  await Promise.all([
    db.collection(invoiceCollection).createIndex({ invoiceNumber: 1 }, { unique: true }),
    db.collection(invoiceCollection).createIndex({ requestKey: 1 }, { unique: true }),
    db.collection(invoiceCollection).createIndex({ invoiceDate: -1, _id: -1 }),
    db.collection("invoice_requests").createIndex({ requestKey: 1 }, { unique: true }),
    db.collection("invoice_requests").createIndex({ invoiceNumber: 1 }, { unique: true }),
  ]);
  // This counter and the minimal request ledger never expire or reset on deletion.
  try { await db.collection("billing_counters").updateOne({ _id: "billing_invoice" }, { $setOnInsert: { sequence: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}

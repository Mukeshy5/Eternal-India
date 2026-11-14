export async function ensureGstModels(db) {
  // Legacy name/rate records stay readable until explicitly corrected by a user.
  const schema = { bsonType: "object", anyOf: [{ required: ["gstNumber"] }, { required: ["name"] }], properties: {
    gstNumber: { bsonType: "string", maxLength: 15 }, gstKey: { bsonType: "string", pattern: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$" },
    version: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
  } };
  const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
  try { await db.createCollection("gst_rates", options); }
  catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: "gst_rates", ...options }); }
  await db.collection("gst_rates").createIndex({ gstKey: 1 }, { unique: true, partialFilterExpression: { gstKey: { $type: "string" } } });
}

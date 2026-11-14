export const officeCollection = "office_addresses";

export async function ensureOfficeModels(db) {
  const schema = {
    bsonType: "object", required: ["name", "address", "phone", "addressKey", "version", "createdAt", "updatedAt", "createdBy", "updatedBy"],
    properties: {
      name: { bsonType: "string", minLength: 2, maxLength: 100 }, address: { bsonType: "string", minLength: 5, maxLength: 600 },
      phone: { bsonType: "string", maxLength: 100 }, addressKey: { bsonType: "string" },
      version: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
      createdBy: { bsonType: "objectId" }, updatedBy: { bsonType: "objectId" },
    },
  };
  const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
  try { await db.createCollection(officeCollection, options); }
  catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: officeCollection, ...options }); }
  await Promise.all([
    db.collection(officeCollection).createIndex({ addressKey: 1 }, { unique: true }),
    db.collection(officeCollection).createIndex({ name: 1, _id: 1 }),
  ]);
}

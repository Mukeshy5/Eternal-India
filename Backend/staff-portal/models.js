export async function ensureStaffPortalModels(db) {
  const schema = { bsonType: "object", required: ["staffId", "employeeId", "username", "usernameKey", "passwordHash", "status", "authVersion", "version", "createdAt", "updatedAt"], properties: {
    staffId: { bsonType: "objectId" }, employeeId: { bsonType: "string" }, username: { bsonType: "string", minLength: 3, maxLength: 32 }, usernameKey: { bsonType: "string" }, passwordHash: { bsonType: "string" }, status: { enum: ["active", "inactive"] }, canViewActivity: { bsonType: "bool" }, authVersion: { bsonType: ["int", "long", "double"], minimum: 1 }, version: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
  } };
  try { await db.createCollection("staff_accounts", { validator: { $jsonSchema: schema } }); }
  catch (error) { if (error.code !== 48) throw error; }
  await Promise.all([
    db.collection("staff_accounts").createIndex({ staffId: 1 }, { unique: true }),
    db.collection("staff_accounts").createIndex({ employeeId: 1 }, { unique: true }),
    db.collection("staff_accounts").createIndex({ usernameKey: 1 }, { unique: true }),
    db.collection("staff_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("staff_tokens").createIndex({ accountId: 1 }),
    db.collection("staff_notifications").createIndex({ staffId: 1, createdAt: -1 }),
    db.collection("panel_activity_history").createIndex({ "actor.type": 1, "actor.staffId": 1, createdAt: -1 }),
    db.collection("enquiries").createIndex({ "assignedTo.id": 1, updatedAt: -1 }),
    db.collection("journey_billing_vouchers").createIndex({ createdBy: 1, updatedAt: -1 }),
    db.collection("billing_invoices").createIndex({ authorizedStaffIds: 1, updatedAt: -1 }),
  ]);
}

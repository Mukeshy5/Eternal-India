const string = { bsonType: "string" };
const date = { bsonType: "date" };
const integer = { bsonType: ["int", "long", "double"], minimum: 0 };
export async function ensureStaffModels(db) {
  const schemas = {
    staff: {
      bsonType: "object", required: ["employeeId", "name", "phone", "email", "department", "designation", "status", "photo", "photoMime", "version", "createdAt", "updatedAt"],
      properties: { employeeId: { ...string, pattern: "^EI-[A-F0-9]{12}$" }, name: { ...string, minLength: 2, maxLength: 100 }, phone: { ...string, pattern: "^\\+[1-9][0-9]{7,14}$" }, email: { ...string, maxLength: 200 }, department: { ...string, maxLength: 80 }, designation: { ...string, maxLength: 80 }, status: { enum: ["active", "inactive"] }, photo: { bsonType: "binData" }, photoMime: { enum: ["image/jpeg", "image/png"] }, version: integer, createdAt: date, updatedAt: date, deletedAt: { bsonType: ["date", "null"] } },
    },
    staff_attendance: {
      bsonType: "object", required: ["staffId", "date", "status", "checkIn", "checkOut", "workingMinutes", "version", "createdAt", "updatedAt"],
      properties: { staffId: { bsonType: "objectId" }, date: { ...string, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, status: { enum: ["present", "absent", "half_day", "leave", "weekly_off"] }, checkIn: string, checkOut: string, workingMinutes: { ...integer, maximum: 1439 }, leaveType: { ...string, maxLength: 80 }, remarks: { ...string, maxLength: 300 }, version: integer, createdAt: date, updatedAt: date },
    },
  };
  for (const [name, schema] of Object.entries(schemas)) {
    try { await db.createCollection(name, { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" }); }
    catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: name, validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" }); }
  }
  await Promise.all([
    db.collection("staff").createIndex({ employeeId: 1 }, { unique: true }),
    db.collection("staff").createIndex({ email: 1 }, { unique: true }),
    db.collection("staff").createIndex({ phone: 1 }, { unique: true }),
    db.collection("staff").createIndex({ deletedAt: 1, status: 1, name: 1 }),
    db.collection("staff").createIndex({ deletedAt: 1, status: 1, department: 1, name: 1, _id: 1 }),
    db.collection("staff_attendance").createIndex({ staffId: 1, date: 1 }, { unique: true }),
    db.collection("staff_attendance").createIndex({ date: 1, status: 1 }),
  ]);
  await db.collection("staff_runtime").updateOne({ _id: "revision" }, { $setOnInsert: { value: 0, updatedAt: new Date() } }, { upsert: true });
}

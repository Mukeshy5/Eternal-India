export const letterCollection = "employment_letters";
export async function ensureLetterModels(db) {
  const text = { bsonType: "string" }, date = { bsonType: "date" };
  const company = { bsonType: "object", required: ["name", "address", "phone", "website", "signatory", "signatoryTitle"], properties: Object.fromEntries(["name", "address", "phone", "website", "signatory", "signatoryTitle"].map((key) => [key, { ...text, maxLength: key === "address" ? 600 : 200 }])) };
  const schemas = {
    [letterCollection]: {
      bsonType: "object", required: ["type", "staffId", "employee", "company", "joiningDate", "issueDate", "letterNumber", "content", "terms", "responsibilities", "performance", "pdf", "pdfSha256", "requestKey", "payloadHash", "version", "createdAt", "updatedAt", "createdBy", "updatedBy"],
      properties: {
        type: { enum: ["joining", "experience"] }, staffId: { bsonType: "objectId" },
        employee: { bsonType: "object", required: ["name", "employeeId", "designation", "department"], properties: Object.fromEntries(["name", "employeeId", "designation", "department"].map((key) => [key, { ...text, maxLength: 200 }])) },
        company, joiningDate: { ...text, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, lastWorkingDate: text, issueDate: text,
        salaryPaise: { bsonType: ["int", "long", "double"], minimum: 0, maximum: 9999999999 }, salaryPeriod: { enum: ["month", "year"] },
        letterNumber: { ...text, pattern: "^EI/(JL|EL)/[0-9]{4}/[0-9]{6,}$" },
        content: { ...text, maxLength: 16000 }, terms: { ...text, maxLength: 6000 }, responsibilities: { ...text, maxLength: 6000 }, performance: { ...text, maxLength: 4000 },
        pdf: { bsonType: "binData" }, pdfSha256: text, requestKey: text, payloadHash: text,
        version: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: date, updatedAt: date, createdBy: { bsonType: "objectId" }, updatedBy: { bsonType: "objectId" },
      },
    },
    employment_letter_settings: { bsonType: "object", required: ["company", "version", "updatedAt", "updatedBy"], properties: { company, version: { bsonType: ["int", "long", "double"], minimum: 1 }, updatedAt: date, updatedBy: { bsonType: "objectId" } } },
  };
  for (const [name, schema] of Object.entries(schemas)) {
    const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
    try { await db.createCollection(name, options); }
    catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: name, ...options }); }
  }
  await Promise.all([
    db.collection(letterCollection).createIndex({ letterNumber: 1 }, { unique: true }),
    db.collection(letterCollection).createIndex({ type: 1, staffId: 1, joiningDate: 1 }, { unique: true }),
    db.collection(letterCollection).createIndex({ requestKey: 1 }, { unique: true }),
    db.collection(letterCollection).createIndex({ type: 1, issueDate: -1, _id: -1 }),
    db.collection(letterCollection).createIndex({ staffId: 1, createdAt: -1 }),
  ]);
}

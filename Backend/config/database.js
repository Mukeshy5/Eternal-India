import { MongoClient } from "mongodb";
import { ensureStaffModels } from "../staff/models.js";

export async function connectDatabase(config) {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 10 });
  try {
    await client.connect();
    const db = client.db(config.databaseName);
    await Promise.all([
      db.collection("admins").createIndex({ email: 1 }, { unique: true }),
      db.collection("enquiries").createIndex({ submissionId: 1 }, { unique: true }),
      db.collection("enquiries").createIndex({ reference: 1 }, { unique: true }),
      db.collection("enquiries").createIndex({ createdAt: -1 }),
      db.collection("enquiries").createIndex({ status: 1, createdAt: -1 }),
    ]);
    await ensureStaffModels(db);
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

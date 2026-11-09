import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { cleanupDatabase } from "../lib/database-cleanup.js";

const { client, db } = await connectDatabase(readConfig());
try {
  const apply = process.argv.includes("--apply");
  console.log(JSON.stringify({ database: db.databaseName, mode: apply ? "cleaned" : "preview", counts: await cleanupDatabase(db, { apply }) }, null, 2));
} finally { await client.close(); }

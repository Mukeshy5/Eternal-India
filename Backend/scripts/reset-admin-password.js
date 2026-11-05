import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";

const config = readConfig();
const { client, db } = await connectDatabase(config);
try {
  await ensureAdmin(db, config, true);
  console.log("Admin password updated from Backend/.env. Previous login sessions have been removed.");
} finally {
  await client.close();
}

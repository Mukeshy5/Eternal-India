import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { staffPermissions } from "../../shared/staff.js";

const [emailValue, permissionValue] = process.argv.slice(2);
const email = (emailValue || "").trim().toLowerCase();
const permissions = permissionValue === "none" ? [] : (permissionValue || "").split(",");
if (!email || permissions.some((key) => !Object.hasOwn(staffPermissions, key)) || (permissions.length && !permissions.includes("view"))) throw new Error(`Use: npm run staff:access -- user@example.com view,create,edit,delete,attendance,export | none. Valid permissions: ${Object.keys(staffPermissions).join(", ")}. Include view for every enabled account.`);
const config = readConfig();
if ([config.adminEmail, config.technicalEmail].includes(email)) throw new Error("Configured owners always retain staff access.");
const { client, db } = await connectDatabase(config);
try {
  const result = await db.collection("admins").updateOne({ email }, { $set: { staffPermissions: [...new Set(permissions)] } });
  if (!result.matchedCount) throw new Error("Account not found. Use an existing authorized administrator or technical account.");
  console.log(`Updated staff permissions for ${email}.`);
} finally { await client.close(); }

import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { decorationPermissions } from "../../shared/decorationCatalog.js";

const [emailArgument, mode, permissionArgument] = process.argv.slice(2);
const email = (emailArgument || "").trim().toLowerCase();
if (!email || !["grant", "revoke"].includes(mode)) throw new Error("Use: npm run technical:access -- user@example.com grant [dashboard,effects,...] | revoke");
const permissions = permissionArgument ? permissionArgument.split(",") : Object.keys(decorationPermissions);
if (permissions.some((permission) => !Object.hasOwn(decorationPermissions, permission))) throw new Error(`Valid permissions: ${Object.keys(decorationPermissions).join(", ")}`);
const config = readConfig();
const { client, db } = await connectDatabase(config);
try {
  const account = await db.collection("admins").findOne({ email });
  if (!account) throw new Error("Account not found. Create the staff account using the existing administrator account setup first.");
  const roles = [...new Set([...(account.roles || ["admin"]).filter((role) => role !== "technical"), ...(mode === "grant" ? ["technical"] : [])])];
  const updated = { roles, technicalPermissions: mode === "grant" ? permissions : [] };
  await db.collection("admins").updateOne({ _id: account._id }, { $set: updated });
  await db.collection("decoration_activity").insertOne({ action: "technical_access_updated", decorationId: null, festivalName: "", performedBy: { id: "local-operator", email: "Local account operator", role: "system" }, performedByRole: "system", previousValues: { email, roles: account.roles || ["admin"], technicalPermissions: account.technicalPermissions || null }, newValues: { email, ...updated }, timestamp: new Date(), remarks: "Explicit local account-management command." });
  console.log(`Technical permissions ${mode === "grant" ? "granted" : "revoked"} for ${email}.`);
} finally { await client.close(); }

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, salt, value] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(value)) return false;
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(value, "hex"));
}
export async function ensureAdmin(db, config, reset = false) {
  const existing = await db.collection("admins").findOne({ email: config.adminEmail });
  if (existing && !reset) return existing;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail) || config.adminPassword.length < 8 || config.adminPassword.startsWith("replace-")) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters in Backend/.env.");
  }
  const passwordHash = await hashPassword(config.adminPassword);
  if (existing) {
    await db.collection("admins").updateOne({ _id: existing._id }, { $set: { passwordHash, passwordChangedAt: new Date() } });
    // Removing every session invalidates any session created with the old password.
    await db.collection("admin_sessions").deleteMany({});
    return { ...existing, passwordHash };
  }
  const admin = { email: config.adminEmail, passwordHash, createdAt: new Date() };
  const result = await db.collection("admins").insertOne(admin);
  return { ...admin, _id: result.insertedId };
}

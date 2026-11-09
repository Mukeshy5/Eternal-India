import bcrypt from "bcryptjs";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const bcryptRounds = 12;

export async function hashPassword(password) {
  const input = createHash("sha256").update(password, "utf8").digest("hex");
  return `bcrypt-sha256$${await bcrypt.hash(input, bcryptRounds)}`;
}

export function isBcryptPasswordHash(value) {
  const hash = String(value || "").replace(/^bcrypt-sha256\$/, "");
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

export async function verifyPassword(password, stored) {
  if (typeof password !== "string") return false;
  if (isBcryptPasswordHash(stored)) {
    const wrapped = stored.startsWith("bcrypt-sha256$");
    const hash = wrapped ? stored.slice("bcrypt-sha256$".length) : stored;
    const input = wrapped ? createHash("sha256").update(password, "utf8").digest("hex") : password;
    return bcrypt.compare(input, hash);
  }
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
    await Promise.all([db.collection("admin_sessions").deleteMany({}), db.collection("admin_tokens").deleteMany({})]);
    return { ...existing, passwordHash };
  }
  const admin = { email: config.adminEmail, passwordHash, createdAt: new Date() };
  const result = await db.collection("admins").insertOne(admin);
  return { ...admin, _id: result.insertedId };
}

// Bootstrap once per installation. Renaming/deleting the original administrator
// through account management must not recreate its old credentials on restart.
export async function ensureInitialAdmin(db, config) {
  const settings = db.collection("application_settings");
  if (await settings.findOne({ _id: "initial-admin" })) return;
  const existing = await db.collection("admins").findOne({ status: { $nin: ["pending", "disabled"] }, $or: [{ roles: "admin" }, { roles: { $exists: false } }] });
  if (!existing) await ensureAdmin(db, config);
  await settings.updateOne({ _id: "initial-admin" }, { $setOnInsert: { initializedAt: new Date() } }, { upsert: true });
}

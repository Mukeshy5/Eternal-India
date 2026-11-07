import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port number.");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith("replace-")) throw new Error("Set a random SESSION_SECRET of at least 32 characters in Backend/.env.");
  const origins = (env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map((origin) => new URL(origin.trim()).origin);
  return {
    port,
    host: env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
    production: env.NODE_ENV === "production",
    mongoUri: env.MONGO_URI || "mongodb://localhost:27017",
    databaseName: env.MONGO_DB || "eternal_india",
    sessionSecret: env.SESSION_SECRET,
    origins,
    adminEmail: (env.ADMIN_EMAIL || "").trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || "",
    technicalEmail: (env.TECHNICAL_EMAIL || "").trim().toLowerCase(),
  };
}

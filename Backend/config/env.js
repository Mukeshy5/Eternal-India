import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port number.");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith("replace-")) throw new Error("Set a random SESSION_SECRET of at least 32 characters in Backend/.env.");
  const mongoUri = (env.MONGO_URI || "mongodb://localhost:27017").trim();
  if (!/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(mongoUri) || /[<>]/.test(mongoUri)) throw new Error("Set MONGO_URI to a valid mongodb:// or mongodb+srv:// connection string in Backend/.env.");
  const origins = (env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map((origin) => new URL(origin.trim()).origin);
  const smtpUser = (env.SMTP_USER || env.GMAIL_USER || "").trim();
  const smtpHost = (env.SMTP_HOST || (smtpUser ? "smtp.gmail.com" : "")).trim();
  const smtpPort = Number(env.SMTP_PORT || (smtpHost === "smtp.gmail.com" ? 465 : 587));
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error("SMTP_PORT must be a valid port number.");
  if (env.OTP_HASH_SECRET && env.OTP_HASH_SECRET.length < 32) throw new Error("OTP_HASH_SECRET must contain at least 32 characters.");
  return {
    port,
    host: env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
    production: env.NODE_ENV === "production",
    mongoUri,
    databaseName: env.MONGO_DB || "eternal_india",
    sessionSecret: env.SESSION_SECRET,
    origins,
    adminEmail: (env.ADMIN_EMAIL || "").trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || "",
    technicalEmail: (env.TECHNICAL_EMAIL || "").trim().toLowerCase(),
    companyName: env.COMPANY_NAME || "Eternal India",
    otpSecret: env.OTP_HASH_SECRET || env.SESSION_SECRET,
    smtp: { host: smtpHost, port: smtpPort, secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : smtpPort === 465, user: smtpUser, password: smtpHost === "smtp.gmail.com" ? (env.SMTP_PASSWORD || env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "") : env.SMTP_PASSWORD || "", from: env.SMTP_FROM || smtpUser || env.ADMIN_EMAIL },
  };
}

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export function readConfig(env = process.env) {
  const onRender = env.RENDER === "true" || !!env.RENDER_SERVICE_ID || !!env.RENDER_EXTERNAL_HOSTNAME;
  const production = onRender || env.NODE_ENV === "production";
  const port = Number(env.PORT || (onRender ? 10000 : 5000));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port number.");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith("replace-")) throw new Error("Set a random SESSION_SECRET of at least 32 characters in Backend/.env.");
  if (env.AUTH_TOKEN_SECRET && env.AUTH_TOKEN_SECRET.length < 32) throw new Error("AUTH_TOKEN_SECRET must contain at least 32 characters.");
  const mongoUri = (env.MONGO_URI || "mongodb://localhost:27017").trim();
  if (!/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(mongoUri) || /[<>]/.test(mongoUri)) throw new Error("Set MONGO_URI to a valid mongodb:// or mongodb+srv:// connection string in Backend/.env.");
  const frontendOrigin = "https://eternal-india-phi.vercel.app";
  const origins = [...new Set([
    ...(onRender ? [frontendOrigin] : []),
    ...(env.FRONTEND_ORIGIN || (production ? frontendOrigin : "http://localhost:5173")).split(",").map((origin) => new URL(origin.trim()).origin),
  ])];
  const smtpUser = (env.SMTP_USER || env.GMAIL_USER || "").trim();
  const smtpHost = (env.SMTP_HOST || (smtpUser ? "smtp.gmail.com" : "")).trim().toLowerCase();
  const smtpPort = Number(env.SMTP_PORT || (smtpHost === "smtp.gmail.com" ? 465 : 587));
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error("SMTP_PORT must be a valid port number.");
  if (smtpUser && smtpHost === "smtp.gmail.com" && !/^[^\s<>:@]+@gmail\.com$/i.test(smtpUser)) throw new Error("SMTP_USER must be a Gmail address, not a mailto link or display name.");
  const configuredFrom = (env.SMTP_FROM || "").trim();
  const smtpFrom = configuredFrom.match(/<\s*([^<>]+)\s*>$/)?.[1]?.trim() || configuredFrom;
  if (configuredFrom && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(smtpFrom)) throw new Error("SMTP_FROM must be an email address or a display name followed by <email-address>.");
  const requestedEmailProvider = (env.EMAIL_PROVIDER || "auto").trim().toLowerCase();
  if (!["auto", "smtp", "resend"].includes(requestedEmailProvider)) throw new Error("EMAIL_PROVIDER must be auto, resend or smtp.");
  const resendApiKey = (env.RESEND_API_KEY || "").trim();
  const emailProvider = requestedEmailProvider === "auto" ? (resendApiKey ? "resend" : "smtp") : requestedEmailProvider;
  const emailFromValue = (env.EMAIL_FROM || "").trim();
  const emailFrom = emailFromValue.match(/<\s*([^<>]+)\s*>$/)?.[1]?.trim() || emailFromValue;
  if (emailFromValue && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(emailFrom)) throw new Error("EMAIL_FROM must be an email address or a display name followed by <email-address>.");
  if (env.OTP_HASH_SECRET && env.OTP_HASH_SECRET.length < 32) throw new Error("OTP_HASH_SECRET must contain at least 32 characters.");
  return {
    port,
    host: onRender ? "0.0.0.0" : env.HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    production,
    render: onRender,
    mongoUri,
    databaseName: env.MONGO_DB || "eternal_india",
    sessionSecret: env.SESSION_SECRET,
    authTokenSecret: env.AUTH_TOKEN_SECRET || env.SESSION_SECRET,
    origins,
    adminEmail: (env.ADMIN_EMAIL || "").trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || "",
    technicalEmail: (env.TECHNICAL_EMAIL || "").trim().toLowerCase(),
    companyName: env.COMPANY_NAME || "Eternal India",
    otpSecret: env.OTP_HASH_SECRET || env.SESSION_SECRET,
    email: { provider: emailProvider, apiKey: resendApiKey, from: emailFrom },
    smtp: { host: smtpHost, port: smtpPort, secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : smtpPort === 465, user: smtpUser, password: smtpHost === "smtp.gmail.com" ? (env.SMTP_PASSWORD || env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "") : env.SMTP_PASSWORD || "", from: smtpFrom || smtpUser || env.ADMIN_EMAIL },
  };
}

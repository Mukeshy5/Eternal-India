import { MongoClient } from "mongodb";
import { ensureStaffModels } from "../staff/models.js";
import { ensurePaymentModels } from "../payments/model.js";
import { ensureEnquiryModels } from "../enquiries/model.js";

const MAX_CONNECT_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Return a log-safe URI (scheme + host only, credentials redacted).
function sanitizeUri(uri) {
  if (!uri || typeof uri !== "string") return "<unset>";
  try {
    return uri.replace(/^((mongodb(?:\+srv)?:)\/\/)[^@]+@/, "$1<redacted>@");
  } catch {
    return "<redacted>";
  }
}

export async function connectDatabase(config) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt += 1) {
    const client = new MongoClient(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
    });
    try {
      await client.connect();
      const db = client.db(config.databaseName);
      await Promise.all([
        db.collection("admins").createIndex({ email: 1 }, { unique: true }),
        db.collection("admins").createIndex({ gmailKey: 1 }, { unique: true, partialFilterExpression: { gmailKey: { $type: "string" } } }),
        db.collection("admins").createIndex({ usernameKey: 1 }, { unique: true, partialFilterExpression: { usernameKey: { $type: "string" } } }),
        db.collection("admin_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("email_verifications").createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("email_verification_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("admins").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("offer_images").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("decoration_assets").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("enquiries").createIndex({ reference: 1 }, { unique: true }),
        db.collection("enquiries").createIndex({ createdAt: -1 }),
        db.collection("enquiries").createIndex({ status: 1, createdAt: -1 }),
      ]);
      await ensureStaffModels(db);
      await ensurePaymentModels(db);
      await ensureEnquiryModels(db);

      // Runtime connection monitoring (credentials never logged).
      client.on("close", () => {
        console.error("MongoDB connection closed. The backend cannot serve database requests until the connection is restored.");
      });
      client.on("error", (error) => {
        console.error(`MongoDB runtime error: ${error.name}`);
      });
      client.on("reconnected", () => {
        console.log("MongoDB connection restored.");
      });

      return { client, db };
    } catch (error) {
      try { await client.close(); } catch { /* ignore close errors during retry */ }
      lastError = error;

      // Authentication or URI parse errors are not transient; do not retry.
      if (
        error.name === "MongoAuthError"
        || error.name === "MongoParseError"
        || error.name === "MongoInvalidArgumentError"
      ) {
        break;
      }

      if (attempt === MAX_CONNECT_RETRIES) break;

      const delayMs = RETRY_BASE_DELAY_MS * attempt;
      console.error(
        `MongoDB connection attempt ${attempt}/${MAX_CONNECT_RETRIES} failed (${error.name}). Retrying in ${delayMs / 1000}s...`
      );
      await sleep(delayMs);
    }
  }

  // Credential-safe failure message.
  console.error("MongoDB connection failed after retries. The backend will not start without a valid, authenticated database connection.");
  console.error("Set MONGO_URI in Backend/.env to a valid mongodb:// or mongodb+srv:// connection string and confirm the database user and network access are correct.");
  console.error(`Last error: ${lastError?.name ?? "unknown"}. Connection string: ${sanitizeUri(config.mongoUri)}`);
  throw lastError;
}

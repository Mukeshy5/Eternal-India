import { readConfig } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { ensureAdmin } from "./lib/passwords.js";
import { createApp } from "./app.js";
import { cleanupDatabase } from "./lib/database-cleanup.js";
import { createMailer } from "./lib/mailer.js";

let connection;
let server;
let stopping = false;
let closing = false;

// --- Crash prevention: never silently ignore async failures ---
process.on("unhandledRejection", (error) => {
  console.error(`Unhandled promise rejection: ${error?.name ?? error?.message ?? String(error)}`);
});

process.on("uncaughtException", (error) => {
  console.error(`Uncaught exception: ${error?.name ?? error?.message ?? String(error)}`);
  try {
    connection?.client?.close().catch(() => {});
  } catch {}
  process.exitCode = 1;
  process.exit(1);
});

async function start() {
  const config = readConfig();

  // Connect to MongoDB (with retries) before starting the Express server.
  connection = await connectDatabase(config);
  await ensureAdmin(connection.db, config);

  // Activate existing email-verified accounts stuck in pending/disabled status
  // so they can log in immediately without requiring administrator approval.
  const activationResult = await connection.db
    .collection("admins")
    .updateMany(
      { status: { $in: ["pending", "disabled"] }, emailVerified: true },
      { $set: { status: "active" }, $unset: { expiresAt: "" } }
    );
  if (activationResult.modifiedCount > 0) {
    console.log(`Activated ${activationResult.modifiedCount} email-verified account(s) to active status.`);
  }

  await cleanupDatabase(connection.db, { apply: true });

  // Verify Gmail SMTP configuration at startup so OTP emails are confirmed working
  // before the server accepts requests. Credentials are never logged.
  const startupMailer = createMailer(config);
  if (startupMailer.gmailConfigured) {
    try {
      await startupMailer.verify();
      console.log("Gmail SMTP verified successfully. OTP emails are enabled.");
    } catch (smtpError) {
      // Log a clear, credential-safe error but do not crash — non-email flows still work.
      console.error(`Gmail SMTP startup verification failed: ${smtpError.code}. ${smtpError.message}`);
    }
  } else {
    console.error("Gmail SMTP is not configured. OTP emails will not be sent. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD (Gmail App Password) in Backend/.env.");
  }

  const { app, drainSessions, decorationScheduler, decorationsReady } = createApp({ ...connection, config });
  await decorationsReady;

  server = app.listen(config.port, config.host, () => {
    console.log(`Eternal India API: http://localhost:${config.port}\nAdmin panel: http://localhost:5173/admin/login\nTechnical panel: http://localhost:5173/technical/login`);
  });

  const closeDatabase = async () => {
    if (closing) return;
    closing = true;
    try {
      await connection.client.close();
    } catch (error) {
      console.error(`MongoDB connection could not close cleanly: ${error.message}`);
    }
  };

  server.on("error", async (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Stop the existing backend process or set another PORT in Backend/.env.`);
      process.exit(1);
    }
    console.error(`Server could not start: ${error.message}`);
    process.exit(1);
  });

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await decorationScheduler.stop();
    } catch {}
    server.close(async () => {
      try {
        await drainSessions();
      } catch {}
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

start().catch((error) => {
  const isMongoError =
    error?.name === "MongoServerSelectionError"
    || error?.name === "MongoConnectionError"
    || error?.name === "MongoAuthError"
    || error?.name === "MongoParseError";

  if (isMongoError) {
    // Clear, actionable message that never logs the connection string or database credentials.
    console.error("MongoDB connection failed. The backend will not start without a valid, authenticated database connection.");
    console.error("Set MONGO_URI in Backend/.env to a valid mongodb:// or mongodb+srv:// connection string and confirm the database user and network access are correct.");
    console.error(`Error type: ${error.name}`);
  } else {
    // Configuration or other errors (their messages contain no credentials).
    console.error(error?.message ?? String(error));
  }

  try {
    connection?.client?.close();
  } catch (closeError) {
    console.error(`MongoDB connection could not close cleanly: ${closeError.message}`);
  }
  process.exitCode = 1;
  process.exit(1);
});

import { readConfig } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { ensureAdmin } from "./lib/passwords.js";
import { createApp } from "./app.js";

let connection;
try {
  const config = readConfig();
  connection = await connectDatabase(config);
  await ensureAdmin(connection.db, config);
  const { app, decorationScheduler, decorationsReady } = createApp({ ...connection, config });
  await decorationsReady;
  const server = app.listen(config.port, config.host, () => console.log(`Eternal India API: http://localhost:${config.port}\nAdmin panel: http://localhost:5173/admin/login\nTechnical panel: http://localhost:5173/technical/login`));
  let closing = false;
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
    const message = error.code === "EADDRINUSE"
      ? `Port ${config.port} is already in use. Stop the existing backend process or set another PORT in Backend/.env.`
      : `Server could not start: ${error.message}`;
    console.error(message);
    process.exit(1);
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await decorationScheduler.stop();
    server.close(async () => { await closeDatabase(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(error.name === "MongoServerSelectionError" ? "MongoDB is unavailable. Start MongoDB on localhost:27017, then run npm run dev again." : error.message);
  try {
    await connection?.client.close();
  } catch (closeError) {
    console.error(`MongoDB connection could not close cleanly: ${closeError.message}`);
  }
  process.exitCode = 1;
}

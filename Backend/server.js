import { readConfig } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { ensureAdmin } from "./lib/passwords.js";
import { createApp } from "./app.js";

let connection;
try {
  const config = readConfig();
  connection = await connectDatabase(config);
  await ensureAdmin(connection.db, config);
  const { app } = createApp({ ...connection, config });
  const server = app.listen(config.port, config.host, () => console.log(`Eternal India API: http://localhost:${config.port}\nAdmin panel: http://localhost:5173/admin/login`));
  server.on("error", async (error) => { console.error(`Server could not start: ${error.code}`); await connection.client.close(); process.exitCode = 1; });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => { await connection.client.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(error.name === "MongoServerSelectionError" ? "MongoDB is unavailable. Start MongoDB on localhost:27017, then run npm run dev again." : error.message);
  await connection?.client.close();
  process.exitCode = 1;
}

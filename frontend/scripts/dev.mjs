import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const backend = fileURLToPath(new URL("../../Backend/", import.meta.url));
const envFile = `${backend}/.env`;
const backendEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
// Read the address only. Backend credentials stay out of Vite's environment.
const port = Number(process.env.PORT || backendEnv.PORT || 5000);
const host = process.env.HOST || backendEnv.HOST || "127.0.0.1";
const connectHost = ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
const target = `http://${connectHost.includes(":") ? `[${connectHost}]` : connectHost}:${port}`;
const children = new Set();
let stopping = false;
let exitCode = 0;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timeout = setTimeout(() => process.exit(code), 2000);
  timeout.unref();
  if (!children.size) process.exitCode = code;
}
function launch(args, cwd, env = process.env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
  children.add(child);
  child.once("error", (error) => { console.error(`Could not start development service: ${error.message}`); stop(1); });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 0);
    if (!children.size) process.exitCode = exitCode;
  });
  return child;
}
async function healthy() {
  try {
    const reply = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(1000) });
    const data = await reply.json();
    return reply.ok && data.status === "ok" && data.service === "eternal-india-api";
  } catch { return false; }
}
async function portInUse() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: connectHost, port });
    const finish = (inUse) => { socket.destroy(); resolve(inUse); };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Set a valid PORT in Backend/.env.");
  if (!await healthy()) {
    if (await portInUse()) throw new Error(`Port ${port} is in use, but the Eternal India API is not healthy. Check the backend terminal before retrying.`);
    if (!existsSync(`${backend}/node_modules/express/package.json`)) throw new Error("Install backend dependencies first: npm --prefix Backend install");
    if (!existsSync(envFile)) throw new Error("Create Backend/.env using Backend/.env.example before starting.");
    console.log("Starting the enquiry backend…");
    const child = launch([`${backend}/server.js`], backend);
    let ready = false;
    for (let attempt = 0; attempt < 40 && !stopping && child.exitCode === null; attempt += 1) {
      if (await healthy()) { ready = true; break; }
      await delay(250);
    }
    if (!ready) throw new Error("The enquiry backend did not become ready. Check MongoDB and Backend/.env, then run npm run dev again.");
  } else console.log("Using the running Eternal India enquiry backend.");
  if (!stopping) launch([`${frontend}/node_modules/vite/bin/vite.js`, ...process.argv.slice(2)], frontend, { ...process.env, ETERNAL_INDIA_API_TARGET: target });
} catch (error) {
  console.error(error.message);
  stop(1);
}

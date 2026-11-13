import { createServer } from "vite";
import { verifyVoucher } from "./verify-voucher.mjs";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try { await verifyVoucher(server); }
finally { await server.close(); }

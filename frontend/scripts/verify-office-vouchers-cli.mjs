import { createServer } from "vite";
import { verifyOfficeVouchers } from "./verify-office-vouchers.mjs";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try { await verifyOfficeVouchers(vite); } finally { await vite.close(); }

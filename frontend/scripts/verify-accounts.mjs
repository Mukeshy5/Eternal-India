import { createServer } from "vite";
import { verifyOtpGates } from "./verify-otp.mjs";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try { await verifyOtpGates(vite); }
finally { await vite.close(); }

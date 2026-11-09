import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { rateLimit } from "express-rate-limit";
import nodemailer from "nodemailer";
import { hashPassword } from "./passwords.js";

export const canManageAccounts = (account, config) => !["pending", "disabled"].includes(account.status) && (account.email === config.adminEmail || account.roles === undefined || Array.isArray(account.roles) && account.roles.includes("admin"));
const emailOf = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (value) => value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value) => typeof value === "string" && value.length >= 8 && value.length <= 256;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const safeAccount = ({ _id, email, roles, status, createdAt }) => ({ _id, email, roles: roles || ["admin"], status: status || "active", createdAt });
const sessionFilter = (id) => ({ $or: [{ "session.adminId": id.toString() }, { session: { $regex: `"adminId"\\s*:\\s*"${id}"` } }] });

export function registerAccounts({ management, db, requireAdmin, config, sendPasswordReset }) {
  const accounts = db.collection("admins");
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many account requests. Please try again in 15 minutes." } });
  const guard = [requireAdmin, (req, res, next) => canManageAccounts(req.admin, config) ? next() : res.status(403).json({ message: "Only an administrator can manage panel accounts." })];
  management.post("/register", limit, async (req, res) => {
    const email = emailOf(req.body?.email), password = req.body?.password;
    if (!validEmail(email) || !validPassword(password)) return res.status(400).json({ message: "Enter a valid email and a password of 8–256 characters." });
    try {
      await accounts.insertOne({ email, passwordHash: await hashPassword(password), roles: [], status: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) });
    } catch (error) { if (error.code !== 11000) throw error; }
    res.status(202).json({ message: "Account request received. An existing administrator must approve it before you can sign in. Unapproved requests expire after 7 days." });
  });
  management.get("/accounts", ...guard, async (_req, res) => {
    const records = await accounts.find({}, { projection: { email: 1, roles: 1, status: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(500).toArray();
    res.json({ accounts: records.map(safeAccount) });
  });
  management.post("/accounts", ...guard, async (req, res) => {
    const email = emailOf(req.body?.email), password = req.body?.password, role = req.body?.role;
    if (!validEmail(email) || !validPassword(password) || !["admin", "technical"].includes(role)) return res.status(400).json({ message: "Enter a valid login email, a password of 8–256 characters and an account type." });
    const record = { email, passwordHash: await hashPassword(password), roles: [role], status: "active", createdAt: new Date(), createdBy: req.admin._id };
    try { record._id = (await accounts.insertOne(record)).insertedId; }
    catch (error) { if (error.code === 11000) return res.status(409).json({ message: "This email already has an account or pending request." }); throw error; }
    res.status(201).json({ account: safeAccount(record) });
  });
  management.patch("/accounts/:id/approve", ...guard, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid account." });
    const account = await accounts.findOneAndUpdate({ _id: new ObjectId(req.params.id), status: "pending", expiresAt: { $gt: new Date() } }, { $set: { status: "active", roles: ["admin"], approvedBy: req.admin._id }, $unset: { expiresAt: "" } }, { returnDocument: "after" });
    if (!account) return res.status(404).json({ message: "This account request is no longer pending." });
    res.json({ account: safeAccount(account) });
  });
  management.delete("/accounts/:id", ...guard, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid account." });
    const account = await accounts.findOne({ _id: new ObjectId(req.params.id) });
    if (!account) return res.status(404).json({ message: "Account not found." });
    if (account._id.equals(req.admin._id) || account.email === config.adminEmail || account.email === config.technicalEmail) return res.status(409).json({ message: "The signed-in account and configured owner accounts cannot be deleted here." });
    await accounts.deleteOne({ _id: account._id });
    await db.collection("admin_sessions").deleteMany(sessionFilter(account._id));
    res.sendStatus(204);
  });
  management.post("/forgot-password", limit, async (req, res) => {
    const email = emailOf(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid account email." });
    if (!sendPasswordReset && !config.smtp?.host) return res.status(503).json({ message: "Password reset email is not available yet. Please contact the site administrator." });
    const account = await accounts.findOne({ email, status: { $nin: ["pending", "disabled"] } });
    if (account) {
      const token = randomBytes(32).toString("hex"), tokenHash = digest(token);
      const resetUrl = new URL(req.originalUrl.startsWith("/api/technical/") ? "/technical/reset-password" : "/admin/reset-password", config.origins[0]);
      resetUrl.searchParams.set("token", token);
      await accounts.updateOne({ _id: account._id }, { $set: { passwordReset: { hash: tokenHash, expiresAt: new Date(Date.now() + 30 * 60000) } } });
      try {
        if (sendPasswordReset) await sendPasswordReset({ email, resetUrl: resetUrl.href });
        else {
          const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.password } } : {}) });
          await transport.sendMail({ from: config.smtp.from, to: email, subject: "Reset your Eternal India password", text: `Reset your Eternal India password using this link:\n${resetUrl.href}\n\nThis link expires in 30 minutes and works once. If you did not request this, ignore this email.` });
        }
      } catch {
        await accounts.updateOne({ _id: account._id, "passwordReset.hash": tokenHash }, { $unset: { passwordReset: "" } });
        return res.status(503).json({ message: "The reset email could not be sent. Please try again later or contact the site owner." });
      }
    }
    res.json({ message: "If an active account uses this email, a password reset link has been sent. Check your inbox and spam folder." });
  });
  management.post("/reset-password", limit, async (req, res) => {
    const token = req.body?.token, password = req.body?.password;
    if (typeof token !== "string" || !/^[a-f\d]{64}$/.test(token) || !validPassword(password)) return res.status(400).json({ message: "Use a valid reset link and a password of 8–256 characters." });
    const now = new Date();
    const result = await accounts.findOneAndUpdate({ "passwordReset.hash": digest(token), "passwordReset.expiresAt": { $gt: now }, status: { $nin: ["pending", "disabled"] } }, { $set: { passwordHash: await hashPassword(password), passwordChangedAt: now }, $unset: { passwordReset: "" } }, { returnDocument: "after", projection: { _id: 1 } });
    if (!result) return res.status(400).json({ message: "This reset link has expired or was already used. Request a new link." });
    await db.collection("admin_sessions").deleteMany(sessionFilter(result._id));
    res.json({ message: "Password updated. Sign in with your new password." });
  });
}

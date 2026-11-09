import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { hashPassword } from "./passwords.js";
import { gmailAccountFilter, gmailIdentity } from "./email-identity.js";
import { createMailer } from "./mailer.js";
import { createEmailVerification } from "./email-verification.js";

export const canManageAccounts = (account, config) => !["pending", "disabled"].includes(account.status) && (account.email === config.adminEmail || account.roles === undefined || Array.isArray(account.roles) && account.roles.includes("admin"));
const emailOf = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (value) => value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value) => typeof value === "string" && value.length >= 8 && value.length <= 256;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const safeAccount = ({ _id, email, roles, status, createdAt, emailVerified, emailVerifiedAt, version }, manager, config) => {
  const protectedAccount = _id.equals(manager._id) || email === config.adminEmail || email === config.technicalEmail;
  return { _id, email, roles: roles || ["admin"], status: status || "active", createdAt, emailVerified: emailVerified === true, emailVerifiedAt, version: version || 0, editable: !protectedAccount, deletable: !protectedAccount };
};
const sessionFilter = (id) => ({ $or: [{ "session.adminId": id.toString() }, { session: { $regex: `"adminId"\\s*:\\s*"${id}"` } }] });

export function registerAccounts({ app, management, db, requireAdmin, config, sendPasswordReset }) {
  const accounts = db.collection("admins");
  const mailer = createMailer(config), verification = createEmailVerification({ db, config, mailer });
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many account requests. Please try again in 15 minutes." } });
  const guard = [requireAdmin, (req, res, next) => canManageAccounts(req.admin, config) ? next() : res.status(403).json({ message: "Only an administrator can manage panel accounts." })];
  const auth = Router();
  const sendLimit = rateLimit({ windowMs: 60 * 60000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many OTP email requests. Please try again later.", retryAfter: 3600 } });
  const verifyLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many OTP verification attempts. Please try again in 15 minutes.", retryAfter: 900 } });
  const verificationAccess = (req, res, next) => {
    if (!req.body?.purpose || req.body.purpose === "registration") return next();
    return requireAdmin(req, res, () => canManageAccounts(req.admin, config) ? next() : res.status(403).json({ message: "Only an administrator can verify an address for account management." }));
  };
  auth.post("/send-otp", sendLimit, verificationAccess, verification.send);
  auth.post("/verify-otp", verifyLimit, verificationAccess, verification.verify);
  async function createAccount(req, res, managed = false) {
    const identity = gmailIdentity(req.body?.email), password = req.body?.password, role = req.body?.role;
    if (!identity || !validPassword(password) || managed && !["admin", "technical"].includes(role)) return res.status(400).json({ message: "Enter a valid Gmail, a password of 8–256 characters and a valid panel type." });
    if (await accounts.findOne(gmailAccountFilter(identity), { projection: { _id: 1 } })) return res.status(409).json({ message: "This Gmail already has an account or pending request. Sign in or use Forgot password." });
    const passwordHash = await hashPassword(password);
    const proof = await verification.claim(req, identity.email, managed ? "account-create" : "registration");
    const record = { ...identity, passwordHash, roles: managed ? [role] : [], status: managed ? "active" : "pending", emailVerified: true, emailVerifiedAt: proof.verifiedAt, version: 1, createdAt: new Date(), ...(managed ? { createdBy: req.admin._id } : { expiresAt: new Date(Date.now() + 7 * 86400000) }) };
    try {
      record._id = (await accounts.insertOne(record)).insertedId;
      await verification.complete(proof);
    } catch (error) {
      await verification.release(proof);
      if (error.code === 11000) return res.status(409).json({ message: "This Gmail already has an account or pending request." });
      throw error;
    }
    if (managed) return res.status(201).json({ account: safeAccount(record, req.admin, config), message: "Verified account created successfully." });
    res.status(202).json({ message: "Gmail verified and account request received. An existing administrator must approve it before sign-in. Unapproved requests expire after 7 days." });
  }
  const register = (req, res) => createAccount(req, res);
  auth.post("/register", limit, register);
  app.use("/api/auth", auth);
  management.post("/register", limit, register);
  management.get("/accounts", ...guard, async (req, res) => {
    const records = await accounts.find({}, { projection: { email: 1, roles: 1, status: 1, createdAt: 1, emailVerified: 1, emailVerifiedAt: 1, version: 1 } }).sort({ createdAt: -1 }).limit(500).toArray();
    res.json({ accounts: records.map((account) => safeAccount(account, req.admin, config)) });
  });
  management.post("/accounts", ...guard, limit, (req, res) => createAccount(req, res, true));
  management.patch("/accounts/:id", ...guard, limit, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid account." });
    const current = await accounts.findOne({ _id: new ObjectId(req.params.id) });
    if (!current) return res.status(404).json({ message: "Account not found." });
    if (!safeAccount(current, req.admin, config).editable) return res.status(409).json({ message: "The signed-in account and configured owner accounts cannot be edited here. Use password recovery to change their password." });
    const email = emailOf(req.body?.email), role = req.body?.role, password = req.body?.password;
    const needsVerification = email !== current.email || current.emailVerified !== true;
    const identity = gmailIdentity(email);
    if (!validEmail(email) || needsVerification && !identity || !["admin", "technical"].includes(role) || password && !validPassword(password)) return res.status(400).json({ message: "Use a verified Gmail, a valid panel type and a password of at least 8 characters when changing it." });
    if (!Number.isInteger(req.body?.version) || req.body.version !== (current.version || 0)) return res.status(409).json({ message: "This account changed. Refresh before editing it." });
    const duplicate = await accounts.findOne(identity ? gmailAccountFilter(identity, current._id) : { email, _id: { $ne: current._id } }, { projection: { _id: 1 } });
    if (duplicate) return res.status(409).json({ message: "This Gmail belongs to another account." });
    const passwordHash = password ? await hashPassword(password) : null;
    const proof = needsVerification ? await verification.claim(req, email, "account-edit", current._id.toString()) : null;
    const changes = { email, ...(identity ? { gmailKey: identity.gmailKey } : {}), roles: role === current.roles?.[0] ? current.roles : [role], updatedAt: new Date(), updatedBy: req.admin._id, passwordChangedAt: new Date(), ...(passwordHash ? { passwordHash } : {}), ...(proof ? { emailVerified: true, emailVerifiedAt: proof.verifiedAt } : {}) };
    try {
      const account = await accounts.findOneAndUpdate({ _id: current._id, version: current.version === undefined ? { $exists: false } : current.version }, { $set: changes, $inc: { version: 1 }, $unset: { passwordReset: "" } }, { returnDocument: "after" });
      if (!account) { if (proof) await verification.release(proof); return res.status(409).json({ message: "This account changed while saving. Refresh and try again." }); }
      if (proof) await verification.complete(proof);
      await db.collection("admin_sessions").deleteMany(sessionFilter(current._id));
      res.json({ account: safeAccount(account, req.admin, config), message: "Account updated. The account holder must sign in again." });
    } catch (error) { if (proof) await verification.release(proof); if (error.code === 11000) return res.status(409).json({ message: "This Gmail belongs to another account." }); throw error; }
  });
  management.patch("/accounts/:id/approve", ...guard, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid account." });
    const pending = await accounts.findOne({ _id: new ObjectId(req.params.id), status: "pending" });
    if (pending && !pending.emailVerified) return res.status(403).json({ message: "Verify this account's Gmail using Edit account before approving it." });
    const account = await accounts.findOneAndUpdate({ _id: new ObjectId(req.params.id), status: "pending", emailVerified: true, expiresAt: { $gt: new Date() } }, { $set: { status: "active", roles: pending?.roles?.length ? pending.roles : ["admin"], approvedBy: req.admin._id }, $unset: { expiresAt: "" }, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!account) return res.status(404).json({ message: "This account request is no longer pending." });
    res.json({ account: safeAccount(account, req.admin, config) });
  });
  management.delete("/accounts/:id", ...guard, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid account." });
    const account = await accounts.findOne({ _id: new ObjectId(req.params.id) });
    if (!account) return res.status(404).json({ message: "Account not found." });
    if (account._id.equals(req.admin._id) || account.email === config.adminEmail || account.email === config.technicalEmail) return res.status(409).json({ message: "The signed-in account and configured owner accounts cannot be deleted here." });
    await accounts.deleteOne({ _id: account._id });
    await db.collection("email_verifications").deleteMany({ $or: [{ accountId: account._id.toString() }, ...(account.gmailKey ? [{ gmailKey: account.gmailKey }] : [{ email: account.email }])] });
    await db.collection("admin_sessions").deleteMany(sessionFilter(account._id));
    res.sendStatus(204);
  });
  management.post("/forgot-password", limit, async (req, res) => {
    const email = emailOf(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid account email." });
    if (!sendPasswordReset && !mailer.configured) return res.status(503).json({ message: "Password reset email is not available yet. Please contact the site administrator." });
    const identity = gmailIdentity(email);
    const account = await accounts.findOne({ ...(identity ? gmailAccountFilter(identity) : { email }), status: { $nin: ["pending", "disabled"] } });
    if (account) {
      const token = randomBytes(32).toString("hex"), tokenHash = digest(token);
      const resetUrl = new URL(req.originalUrl.startsWith("/api/technical/") ? "/technical/reset-password" : "/admin/reset-password", config.origins[0]);
      resetUrl.searchParams.set("token", token);
      await accounts.updateOne({ _id: account._id }, { $set: { passwordReset: { hash: tokenHash, expiresAt: new Date(Date.now() + 30 * 60000) } } });
      try {
        if (sendPasswordReset) await sendPasswordReset({ email, resetUrl: resetUrl.href });
        else await mailer.sendPasswordReset({ email: account.email, resetUrl: resetUrl.href });
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

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { gmailAccountFilter, gmailIdentity } from "./email-identity.js";

const purposes = ["registration", "account-create", "account-edit"];
const otpLifetime = 5 * 60000, proofLifetime = 10 * 60000, resendDelay = 60 * 1000;
const maxSends = 5, limitWindow = 15 * 60 * 1000;
const failure = (status, message, details = {}) => Object.assign(new Error(message), { status, details, publicMessage: true });

export function createEmailVerification({ db, config, mailer }) {
  const records = db.collection("email_verifications"), limits = db.collection("email_verification_limits");
  const hash = (value) => createHmac("sha256", config.otpSecret || config.sessionSecret).update(value).digest("hex");
  const context = (req, body = req.body) => {
    const identity = gmailIdentity(body?.email), purpose = body?.purpose || "registration";
    if (!identity) throw failure(400, "Enter a valid Gmail address, such as yourname@gmail.com.");
    if (!purposes.includes(purpose) || purpose === "account-edit" && !/^[a-f\d]{24}$/i.test(body?.accountId || "")) throw failure(400, "Choose a valid account verification request.");
    const accountId = purpose === "account-edit" ? body.accountId.toLowerCase() : "";
    const sessionKey = req.session?.otpBinding ? hash(req.session.otpBinding) : "";
    return { ...identity, purpose, accountId, sessionKey, contextId: sessionKey ? hash(`${sessionKey}:${purpose}:${accountId}`) : "" };
  };
  const reserve = async (key, now, reservation) => {
    await limits.updateOne({ _id: key, expiresAt: { $lte: now } }, { $set: { count: 0, nextSendAt: new Date(0), expiresAt: new Date(now.getTime() + limitWindow) } });
    let slot = await limits.findOneAndUpdate({ _id: key, count: { $lt: maxSends }, nextSendAt: { $lte: now } }, { $inc: { count: 1 }, $set: { nextSendAt: new Date(now.getTime() + resendDelay), reservation } }, { returnDocument: "after" });
    if (!slot) {
      try { slot = { _id: key, count: 1, nextSendAt: new Date(now.getTime() + resendDelay), expiresAt: new Date(now.getTime() + limitWindow), reservation }; await limits.insertOne(slot); }
      catch (error) {
        if (error.code !== 11000) throw error;
        const current = await limits.findOne({ _id: key });
        const retryAfter = Math.max(1, Math.ceil(((current?.count >= maxSends ? current.expiresAt : current?.nextSendAt) - now) / 1000) || 60);
        throw failure(429, `Please wait ${retryAfter} seconds before requesting another OTP.`, { retryAfter });
      }
    }
    return key;
  };
  const release = (keys, reservation) => Promise.all(keys.map((_id) => limits.updateOne({ _id, reservation, count: { $gt: 0 } }, { $inc: { count: -1 }, $set: { nextSendAt: new Date(0) }, $unset: { reservation: "" } })));
  async function send(req, res) {
    context(req);
    if (!mailer.gmailConfigured) throw failure(503, "Gmail verification email is not available yet. Please contact the site administrator.", { code: "EMAIL_NOT_CONFIGURED" });
    if (!req.session.otpBinding) { req.session.otpBinding = randomBytes(32).toString("hex"); await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve())); }
    const ctx = context(req);
    const target = ctx.accountId ? await db.collection("admins").findOne({ _id: new ObjectId(ctx.accountId) }) : null;
    if (ctx.accountId && !target) throw failure(404, "Account not found.");
    if (await db.collection("admins").findOne(gmailAccountFilter(ctx, target?._id), { projection: { _id: 1 } })) throw failure(409, "This Gmail address already has an account or pending request. Sign in or use Forgot password.");
    const now = new Date(), reservation = randomBytes(16).toString("hex"), slots = [];
  // Rate limit per email address and IP address. Only actual send attempts increment the counter;
  // validation failures, missing SMTP configuration and failed deliveries never increment it.
  const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
  const ipKey = `ip:${hash(String(ip))}`;
    try {
      slots.push(await reserve(`email:${hash(ctx.gmailKey)}`, now, reservation));
      slots.push(await reserve(ipKey, now, reservation));
    } catch (error) { await release(slots, reservation); throw error; }
    const challengeId = randomBytes(16).toString("hex"), code = randomInt(0, 1000000).toString().padStart(6, "0");
    const expiresAt = new Date(now.getTime() + otpLifetime);
    const record = { email: ctx.email, gmailKey: ctx.gmailKey, sessionKey: ctx.sessionKey, purpose: ctx.purpose, accountId: ctx.accountId, challengeId, otpHash: hash(`${challengeId}:${ctx.gmailKey}:${code}`), state: "sending", verified: false, consumed: false, attempts: 0, createdAt: now, expiresAt, purgeAt: expiresAt, resendAvailableAt: new Date(now.getTime() + resendDelay) };
    try {
      await records.replaceOne({ _id: ctx.contextId }, { _id: ctx.contextId, ...record }, { upsert: true });
      await mailer.sendOtp(ctx.email, code);
      const sent = await records.updateOne({ _id: ctx.contextId, challengeId, state: "sending" }, { $set: { state: "sent", deliveredAt: new Date() } });
      if (!sent.modifiedCount) throw failure(409, "A newer verification request replaced this code. Use the latest email.");
    } catch (error) {
      await records.deleteOne({ _id: ctx.contextId, challengeId }); await release(slots, reservation);
      if (error.status) throw error;
      // Pass through specific SMTP errors (auth, connection, rejection) with actionable messages.
      const smtpCodes = ["SMTP_AUTH_FAILED", "SMTP_CONNECTION_FAILED", "SMTP_REJECTED", "EMAIL_NOT_CONFIGURED", "SMTP_ERROR"];
      if (smtpCodes.includes(error.code)) {
        console.error(`Gmail SMTP delivery failed: ${error.code}`);
        throw failure(503, error.message, { code: error.code });
      }
      console.error(`Gmail OTP delivery failed: ${error.code || error.name}`);
      throw failure(503, "The verification email could not be sent. Please try again later.", { code: "EMAIL_DELIVERY_FAILED" });
    }
    res.json({ message: "OTP sent to your Gmail. Check your inbox and spam folder.", challengeId, expiresAt, resendAvailableAt: record.resendAvailableAt, serverTime: new Date(), expiresIn: Math.max(0, Math.floor((expiresAt - new Date()) / 1000)), retryAfter: Math.max(0, Math.ceil((record.resendAvailableAt - new Date()) / 1000)) });
  }
  async function verify(req, res) {
    const ctx = context(req), code = req.body?.otp, challengeId = req.body?.challengeId;
    if (!ctx.contextId || typeof code !== "string" || !/^\d{6}$/.test(code) || typeof challengeId !== "string" || !/^[a-f\d]{32}$/.test(challengeId)) throw failure(400, "Enter the 6-digit OTP from your latest verification email.");
    const now = new Date();
    const record = await records.findOneAndUpdate({ _id: ctx.contextId, gmailKey: ctx.gmailKey, challengeId, state: "sent", expiresAt: { $gt: now }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!record) throw failure(400, "This OTP expired, was replaced, or has reached its attempt limit. Request a new OTP.");
    const expected = hash(`${challengeId}:${ctx.gmailKey}:${code}`);
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(record.otpHash, "hex"))) {
      if (record.attempts >= 5) await records.updateOne({ _id: ctx.contextId, challengeId, state: "sent" }, { $set: { state: "locked" }, $unset: { otpHash: "" } });
      throw failure(400, record.attempts >= 5 ? "Too many incorrect OTP attempts. Request a new OTP." : `Incorrect OTP. ${5 - record.attempts} attempts remaining.`, { attemptsRemaining: 5 - record.attempts });
    }
    const verificationExpiresAt = new Date(now.getTime() + proofLifetime);
    const result = await records.updateOne({ _id: ctx.contextId, challengeId, state: "sent", expiresAt: { $gt: new Date() } }, { $set: { state: "verified", verified: true, verifiedAt: now, verificationExpiresAt, purgeAt: verificationExpiresAt }, $unset: { otpHash: "" } });
    if (!result.modifiedCount) throw failure(409, "This verification request changed. Request a new OTP.");
    res.json({ message: "Gmail verified successfully. You can now create the account.", verified: true, verificationExpiresAt, serverTime: new Date() });
  }
  async function claim(req, email, purpose, accountId = "") {
    const ctx = context(req, { email, purpose, accountId });
    if (!ctx.contextId) throw failure(403, "Verify this Gmail address with an OTP before creating or updating the account.", { code: "EMAIL_VERIFICATION_REQUIRED" });
    const record = await records.findOneAndUpdate({ _id: ctx.contextId, gmailKey: ctx.gmailKey, state: "verified", verified: true, consumed: false, verificationExpiresAt: { $gt: new Date() } }, { $set: { consumed: true } }, { returnDocument: "after" });
    if (!record) throw failure(403, "Gmail verification is missing, expired or already used. Request and verify a new OTP.", { code: "EMAIL_VERIFICATION_REQUIRED" });
    return record;
  }
  return { send, verify, claim, complete: (proof) => records.deleteOne({ _id: proof._id, challengeId: proof.challengeId }), release: (proof) => records.updateOne({ _id: proof._id, challengeId: proof.challengeId, consumed: true }, { $set: { consumed: false } }) };
}

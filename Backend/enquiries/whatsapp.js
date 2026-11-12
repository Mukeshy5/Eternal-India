import { createHmac, timingSafeEqual } from "node:crypto";
import { enquiryError, sha256 } from "./service.js";

export function whatsappMessages(payload, phoneNumberId) {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) throw enquiryError(400, "Invalid WhatsApp webhook payload.");
  const records = [];
  for (const entry of payload.entry) for (const change of entry.changes || []) {
    const value = change.value;
    if (change.field !== "messages" || value?.metadata?.phone_number_id !== phoneNumberId) continue;
    for (const message of value.messages || []) {
      if (typeof message.id !== "string" || message.id.length > 300 || !/^\d{7,15}$/.test(message.from || "")) throw enquiryError(400, "Invalid WhatsApp sender or message ID.");
      const timestamp = Number(message.timestamp) * 1000;
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) throw enquiryError(400, "Invalid WhatsApp message timestamp.");
      const contact = (value.contacts || []).find((item) => item.wa_id === message.from);
      const type = message.type;
      let text;
      if (type === "text") text = message.text?.body;
      else if (type === "button") text = message.button?.text;
      else if (type === "interactive") { const reply = message.interactive?.button_reply || message.interactive?.list_reply; text = [reply?.title, reply?.description].filter(Boolean).join("\n"); }
      else if (["image", "video", "document", "audio", "sticker"].includes(type)) text = [message[type]?.caption, `[${type} message${message[type]?.filename ? `: ${message[type].filename}` : ""}]`].filter(Boolean).join("\n");
      else text = JSON.stringify(message[type] || message);
      if (typeof text !== "string") throw enquiryError(400, "WhatsApp message content is missing.");
      const name = typeof contact?.profile?.name === "string" ? contact.profile.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 320) : "";
      records.push({ source: "WHATSAPP", externalMessageId: message.id, name: name || `+${message.from}`, email: "", phone: `+${message.from}`, subject: "WhatsApp enquiry", message: text, messageType: type, mediaId: message[type]?.id || null, receivedAt: new Date(timestamp), originalPayload: JSON.stringify(message) });
    }
  }
  return records;
}

export function createWhatsAppIntegration({ db, config, enquiries }) {
  const settings = config.enquiries?.whatsapp || {}, jobs = db.collection("enquiry_ingestion_jobs");
  const configured = () => !!(settings.appSecret && settings.verifyToken && settings.phoneNumberId);
  let running;
  async function processJobs() {
    if (running) return running;
    running = (async () => {
      for (let i = 0; i < 30; i++) {
        const now = new Date();
        const job = await jobs.findOneAndUpdate({ source: "WHATSAPP", state: { $ne: "DONE" }, nextAttemptAt: { $lte: now }, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }] }, { $set: { lockedUntil: new Date(now.getTime() + 60000) }, $inc: { attempts: 1 } }, { returnDocument: "after", sort: { receivedAt: 1 } });
        if (!job) break;
        try {
          await enquiries.create(job.fields);
          await jobs.updateOne({ _id: job._id }, { $set: { state: "DONE", completedAt: new Date() }, $unset: { lockedUntil: "", lastError: "", fields: "" } });
        } catch (error) {
          console.error("WhatsApp enquiry import failed:", error.name);
          await jobs.updateOne({ _id: job._id }, { $set: { state: "RETRY", lastError: "Message import failed; retry scheduled.", nextAttemptAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** Math.min(job.attempts, 8))) }, $unset: { lockedUntil: "" } });
          break;
        }
      }
    })().finally(() => { running = undefined; });
    return running;
  }
  function challenge(query) {
    if (!configured()) throw enquiryError(503, "WhatsApp integration is not configured.");
    const token = query["hub.verify_token"], challenge = query["hub.challenge"];
    if (query["hub.mode"] !== "subscribe" || typeof token !== "string" || typeof challenge !== "string" || challenge.length > 200 || !timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(sha256(settings.verifyToken)))) throw enquiryError(403, "WhatsApp webhook verification failed.");
    return challenge;
  }
  async function receive(raw, signature) {
    if (!configured()) throw enquiryError(503, "WhatsApp integration is not configured.");
    if (!Buffer.isBuffer(raw) || typeof signature !== "string" || !/^sha256=[a-f\d]{64}$/i.test(signature) || !timingSafeEqual(createHmac("sha256", settings.appSecret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"))) throw enquiryError(401, "WhatsApp webhook signature is invalid.");
    let payload;
    try { payload = JSON.parse(raw.toString("utf8")); } catch { throw enquiryError(400, "Invalid WhatsApp webhook JSON."); }
    const records = whatsappMessages(payload, settings.phoneNumberId);
    if (records.length) await jobs.bulkWrite(records.map((fields) => ({ updateOne: { filter: { _id: `WHATSAPP:${fields.externalMessageId}` }, update: { $setOnInsert: { source: "WHATSAPP", state: "PENDING", fields, attempts: 0, receivedAt: new Date(), nextAttemptAt: new Date() } }, upsert: true } })), { ordered: false });
    await processJobs();
    return { received: true, messages: records.length };
  }
  return { configured, challenge, receive, processJobs, async stop() { await running; } };
}

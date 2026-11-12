import { OAuth2Client } from "google-auth-library";
import { simpleParser } from "mailparser";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { enquiryError, sha256 } from "./service.js";

const scope = "https://www.googleapis.com/auth/gmail.readonly";
export function tokenVault(secret) {
  const key = createHash("sha256").update(`eternal-india:gmail-tokens:${secret}`).digest();
  return {
    encrypt(value) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); return { iv: iv.toString("base64"), data: Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64"), tag: cipher.getAuthTag().toString("base64") }; },
    decrypt(value) { const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64")); cipher.setAuthTag(Buffer.from(value.tag, "base64")); return Buffer.concat([cipher.update(Buffer.from(value.data, "base64")), cipher.final()]).toString("utf8"); },
  };
}

export async function parseGmailMessage(value, mailbox) {
  if (typeof value?.id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value.id) || typeof value.raw !== "string" || value.raw.length > 18 * 1024 * 1024) throw enquiryError(422, "Gmail message is missing or too large to import.");
  const parsed = await simpleParser(Buffer.from(value.raw, "base64url"), { skipImageLinks: true, skipTextToHtml: true });
  const sender = parsed.from?.value?.[0];
  if (typeof sender?.address !== "string" || sender.address.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender.address)) throw enquiryError(422, "Gmail message has no valid sender address.");
  const timestamp = Number(value.internalDate);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) throw enquiryError(422, "Gmail message has no valid received timestamp.");
  const subject = (parsed.subject || "(No subject)").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const message = parsed.text || "";
  if (subject.length > 2000 || Buffer.byteLength(message) > 8 * 1024 * 1024) throw enquiryError(422, "Gmail message content is too large to import.");
  const name = (sender.name || sender.address).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 320) || sender.address;
  return { source: "GMAIL", externalMessageId: value.id, mailbox, name, email: sender.address.toLowerCase(), phone: "", subject, message, receivedAt: new Date(timestamp), threadId: value.threadId || null, internetMessageId: parsed.messageId || null, attachments: (parsed.attachments || []).map((item) => ({ name: (item.filename || "Attachment").slice(0, 255), contentType: (item.contentType || "application/octet-stream").slice(0, 200), size: item.size })), originalPayload: JSON.stringify({ from: parsed.from?.text, subject, messageId: parsed.messageId }) };
}

export function createGmailIntegration({ db, config, enquiries, providerFactory }) {
  const settings = config.enquiries?.gmail || {}, credentials = db.collection("integration_credentials"), states = db.collection("enquiry_oauth_states");
  const vault = tokenVault(config.enquiries?.tokenSecret || config.sessionSecret);
  const configured = () => !!(settings.clientId && settings.clientSecret && settings.redirectUri && settings.email);
  const oauthClient = () => new OAuth2Client({ clientId: settings.clientId, clientSecret: settings.clientSecret, redirectUri: settings.redirectUri });
  let running, stopping = false;
  async function storedToken() {
    const saved = await credentials.findOne({ _id: "gmail" });
    if (saved && saved.email !== settings.email) throw enquiryError(409, "The connected Gmail inbox does not match GMAIL_INBOX_EMAIL. Reconnect the configured business inbox.");
    return saved?.refreshToken ? vault.decrypt(saved.refreshToken) : settings.refreshToken;
  }
  async function provider() {
    if (providerFactory) return providerFactory();
    if (!configured()) throw enquiryError(503, "Gmail OAuth is not configured.");
    const refreshToken = await storedToken();
    if (!refreshToken) throw enquiryError(503, "Connect the business Gmail inbox to begin syncing.");
    const client = oauthClient(); client.setCredentials({ refresh_token: refreshToken });
    return { async get(path, params = {}) {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
      for (const [key, value] of Object.entries(params)) if (value !== undefined) { if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item); else url.searchParams.set(key, String(value)); }
      try { const result = await client.request({ url: url.href, method: "GET", timeout: 20000, retry: true }); return result.data; }
      catch (error) { const code = error.response?.status || 503; throw Object.assign(enquiryError(code === 404 ? 404 : 503, [401, 403].includes(code) ? "Gmail authorization is unavailable. Reconnect the business inbox." : "Gmail sync is temporarily unavailable; it will retry."), { providerStatus: code }); }
    } };
  }
  async function beginOAuth(admin, authCookie) {
    if (!configured()) throw enquiryError(503, "Configure Gmail client ID, secret, callback URL and business inbox on the backend first.");
    const state = randomBytes(32).toString("hex"), client = oauthClient();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    await states.insertOne({ _id: sha256(state), adminId: admin._id.toString(), authHash: sha256(authCookie), verifier: vault.encrypt(codeVerifier), expiresAt: new Date(Date.now() + 10 * 60000) });
    return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [scope], state, code_challenge: codeChallenge, code_challenge_method: "S256", login_hint: settings.email, include_granted_scopes: true });
  }
  async function completeOAuth(query, admin, authCookie) {
    if (typeof query.state !== "string" || typeof query.code !== "string" || query.code.length > 4096) throw enquiryError(400, "Gmail connection was cancelled or the authorization response is invalid.");
    const state = await states.findOneAndDelete({ _id: sha256(query.state), adminId: admin._id.toString(), authHash: sha256(authCookie), expiresAt: { $gt: new Date() } });
    if (!state) throw enquiryError(400, "This Gmail connection request expired or was already used. Start again from your panel.");
    try {
      const client = oauthClient(), { tokens } = await client.getToken({ code: query.code, codeVerifier: vault.decrypt(state.verifier), redirect_uri: settings.redirectUri });
      if (!tokens.refresh_token || !(tokens.scope || "").split(" ").includes(scope)) throw new Error("Required offline Gmail access was not granted");
      client.setCredentials(tokens);
      const profile = await client.request({ url: "https://gmail.googleapis.com/gmail/v1/users/me/profile", timeout: 20000 });
      if (profile.data.emailAddress?.toLowerCase() !== settings.email) throw enquiryError(400, "Connect only the configured business Gmail inbox.");
      await credentials.updateOne({ _id: "gmail" }, { $set: { email: settings.email, refreshToken: vault.encrypt(tokens.refresh_token), connectedAt: new Date(), connectedBy: admin._id.toString() } }, { upsert: true });
    } catch (error) { if (error.publicMessage) throw error; console.error("Gmail OAuth connection failed:", error.name); throw enquiryError(503, "Gmail connection failed. Check the OAuth configuration and try connecting again."); }
  }
  async function sync() {
    if (stopping) throw enquiryError(503, "Gmail sync is stopping and will resume after restart.");
    if (running) return running;
    running = run().finally(() => { running = undefined; });
    return running;
  }
  async function run() {
    if (!settings.email) throw enquiryError(503, "Configure the business Gmail inbox first.");
    const stateId = `gmail:${settings.email}`, stateCollection = db.collection("enquiry_sync_state"), now = new Date(), owner = randomUUID();
    await stateCollection.updateOne({ _id: stateId }, { $setOnInsert: { createdAt: now, nextAttemptAt: now } }, { upsert: true });
    let state = await stateCollection.findOneAndUpdate({ _id: stateId, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }] }, { $set: { owner, lockedUntil: new Date(now.getTime() + 120000), lastStartedAt: now } }, { returnDocument: "after" });
    if (!state) return { busy: true };
    let imported = 0;
    try {
      const api = await provider(), profile = await api.get("profile");
      if (profile.emailAddress?.toLowerCase() !== settings.email) throw enquiryError(409, "The OAuth account does not match the configured business Gmail inbox.");
      if (typeof profile.historyId !== "string" || !/^\d+$/.test(profile.historyId)) throw enquiryError(503, "Gmail returned an invalid sync cursor; it will retry.");
      async function checkpoint(changes) {
        if (stopping) throw enquiryError(503, "Gmail sync interrupted by a server restart; retry scheduled.");
        const reply = await stateCollection.updateOne({ _id: stateId, owner }, { $set: { ...changes, lockedUntil: new Date(Date.now() + 120000) } });
        if (!reply.matchedCount) throw enquiryError(409, "Another worker took over this sync. It will resume safely.");
        Object.assign(state, changes);
      }
      async function importMessage(id) {
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw enquiryError(422, "Gmail returned an invalid message ID.");
        if (await db.collection("enquiries").findOne({ source: "GMAIL", externalMessageId: id }, { projection: { _id: 1 } })) return;
        let raw;
        try { raw = await api.get(`messages/${encodeURIComponent(id)}`, { format: "raw" }); } catch (error) { if (error.providerStatus === 404) return; throw error; }
        if (!raw.labelIds?.includes("INBOX") || raw.labelIds.includes("SENT") || raw.labelIds.includes("DRAFT")) return;
        const result = await enquiries.create(await parseGmailMessage(raw, settings.email)); if (result.created) imported++;
      }
      if (!state.historyId && !state.initialHistoryId) await checkpoint({ initialHistoryId: profile.historyId, initialPageToken: null });
      for (let page = 0; page < 10; page++) {
        if (!state.historyId) {
          let messages;
          try { messages = await api.get("messages", { labelIds: ["INBOX"], maxResults: 100, pageToken: state.initialPageToken || undefined }); }
          catch (error) { if (error.providerStatus !== 400 || !state.initialPageToken) throw error; await checkpoint({ initialPageToken: null, initialHistoryId: profile.historyId }); continue; }
          for (const message of messages.messages || []) { await checkpoint({}); await importMessage(message.id); }
          if (messages.nextPageToken) await checkpoint({ initialPageToken: messages.nextPageToken });
          else { await checkpoint({ historyId: state.initialHistoryId, initialHistoryId: null, initialPageToken: null }); break; }
        } else {
          let changes;
          try { changes = await api.get("history", { startHistoryId: state.historyId, historyTypes: ["messageAdded", "labelAdded"], maxResults: 100, pageToken: state.historyPageToken || undefined }); }
          catch (error) {
            if (error.providerStatus === 400 && state.historyPageToken) { await checkpoint({ historyPageToken: null }); continue; }
            if (error.providerStatus !== 404) throw error;
            await checkpoint({ historyId: null, historyPageToken: null, initialHistoryId: profile.historyId, initialPageToken: null }); continue;
          }
          const ids = new Set();
          for (const history of changes.history || []) {
            for (const item of history.messagesAdded || []) ids.add(item.message.id);
            for (const item of history.labelsAdded || []) if (item.labelIds?.includes("INBOX")) ids.add(item.message.id);
          }
          for (const id of ids) { await checkpoint({}); await importMessage(id); }
          if (changes.nextPageToken) await checkpoint({ historyPageToken: changes.nextPageToken });
          else { await checkpoint({ historyId: changes.historyId || state.historyId, historyPageToken: null }); break; }
        }
      }
      await stateCollection.updateOne({ _id: stateId, owner }, { $set: { lastSuccessAt: new Date(), lastError: null, failures: 0, nextAttemptAt: new Date(Date.now() + (settings.intervalMs || 30000)), importedLastRun: imported }, $unset: { owner: "", lockedUntil: "" } });
      return { imported };
    } catch (error) {
      console.error("Gmail enquiry sync failed:", error.name);
      const failures = (state.failures || 0) + 1;
      await stateCollection.updateOne({ _id: stateId, owner }, { $set: { lastError: error.publicMessage ? error.message : "Gmail sync failed; retry scheduled.", failures, nextAttemptAt: new Date(Date.now() + Math.min(900000, 30000 * 2 ** Math.min(failures - 1, 5))) }, $unset: { owner: "", lockedUntil: "" } });
      throw error.publicMessage ? error : enquiryError(503, "Gmail sync failed; retry scheduled.");
    }
  }
  async function status() {
    const saved = await credentials.findOne({ _id: "gmail" }, { projection: { email: 1, connectedAt: 1 } });
    const state = settings.email ? await db.collection("enquiry_sync_state").findOne({ _id: `gmail:${settings.email}` }) : null;
    return { configured: configured(), connected: !!(settings.email && (saved?.email === settings.email || settings.refreshToken)), email: settings.email || "", lastSuccessAt: state?.lastSuccessAt || null, lastError: state?.lastError || null, nextAttemptAt: state?.nextAttemptAt || null, syncing: !!(state?.lockedUntil > new Date()) };
  }
  return { configured, beginOAuth, completeOAuth, sync, status, async due() { const value = await status(); return value.connected && (!value.nextAttemptAt || new Date(value.nextAttemptAt) <= new Date()); }, async stop() { stopping = true; await running?.catch(() => {}); } };
}

# Unified enquiry inbox

For current notification behavior, repaired failure paths, per-user state, APIs and verification limits, see [Notification repairs](NOTIFICATION_REPAIR.md). This supersedes the older notification and status descriptions below.

The existing `enquiries` MongoDB collection now receives direct website submissions, signed WhatsApp Business Cloud API messages and Gmail API imports. Both `/admin` and `/technical` use the same protected endpoints and records. No second enquiry database or browser storage is used.

## Records and existing data

`Backend/enquiries/model.js` adds indexes and migrates existing records at database startup. Customer name is available as `customerName` and the existing `name` field. Records include email, phone, subject, complete text message, `source` (`WEBSITE`, `WHATSAPP`, `GMAIL`), canonical status, received time, assigned account, external message ID, created/updated timestamps and a reference. Existing destination, travellers, travel date and language data remain intact. Original WhatsApp message JSON and Gmail sender/message metadata remain on the backend; external message content is rendered as plain text, never executable HTML.

Status migration preserves the original value in `legacyStatus`:

| Previous value | Unified status |
| --- | --- |
| `new` | `NEW` |
| `pending`, `contacted` | `IN_PROGRESS` |
| `confirmed` | `RESOLVED` |
| `cancelled`, `closed` | `CLOSED` |

Old status values remain accepted by the API and normalize to the new values. Unique partial website submission indexes preserve existing UUID idempotency without blocking external messages that have no website UUID. A unique `(source, externalMessageId)` index prevents repeat imports. Each incoming WhatsApp message/email is its own enquiry; follow-up messages have separate external IDs. Submissions made through the website remain `WEBSITE`, including when the customer then chooses the existing WhatsApp/email handoff. Opening a `wa.me` or `mailto` link does not prove a message was sent and is not treated as a received external message.

Enquiries, history and deduplication records have no TTL. **Archive** hides a record from the active inbox while preserving the complete message and history. The Archive view in either panel can restore records to the shared inbox. **Delete permanently** requires confirmation and removes the enquiry and its history; a durable deletion marker prevents the same website submission or external message from being imported again. The existing `DELETE /enquiries/:id` API remains an archive operation for compatibility.

Inbox and Archive lists carry a bounded message preview. View Details loads the complete original text from the protected detail endpoint; a preview is not labelled as a complete message until that full record is loaded. Admins can filter by source/status, search name/email/phone/subject/message/reference, contact the sender, assign an existing active account and update status. A WhatsApp sender can have no email, and a Gmail sender can have no phone.

## Direct website enquiries

The existing Plan Your Trip form still saves to `POST /api/enquiries` before playing confirmation audio or opening an optional contact link. Server validation and UUID/request-hash duplicate protection remain. The server fixes the source as `WEBSITE`; customers cannot impersonate WhatsApp or Gmail sources through that endpoint. Destination, traveller count, travel date and full submitted message remain saved. A durable MongoDB outbox publishes the creation after the record is saved.

## WhatsApp Business setup

Use the official Meta WhatsApp Business Cloud API for the business phone number. Ordinary personal/Business app `wa.me` links cannot capture inbound messages.

Configure these values privately in Render Environment or the ignored local `Backend/.env`:

```dotenv
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

`WHATSAPP_APP_SECRET` is the app secret belonging to your Meta app, `WHATSAPP_VERIFY_TOKEN` is a strong token you choose for the verification challenge, and `WHATSAPP_PHONE_NUMBER_ID` is the exact business phone number ID, not the displayed phone number.

Register the production callback in the Meta app:

```text
https://eternal-india-1.onrender.com/api/integrations/whatsapp/webhook
```

Subscribe the WhatsApp Business Account/app to the `messages` webhook field for that business phone. The GET verification checks `hub.mode` and the verify token before returning `hub.challenge`. Every POST verifies `X-Hub-Signature-256` using HMAC-SHA256 over the exact raw request bytes with a constant-time comparison, before parsing or storing the message. The raw route is registered before `express.json()`, rejects oversized requests and applies per-IP rate limits to verification and delivery. Signed messages for another phone ID are ignored.

The parser preserves sender name/number, message ID, original timestamp and original text. Buttons, interactive replies, contacts and location messages retain their original payloads. Media messages retain type, caption, filename/media ID and the original JSON; audio/image documents are not fabricated into a transcription. The UI can contact the sender through WhatsApp. This implementation receives messages; it does not send replies automatically or store a WhatsApp outbound access token.

Validated inbound messages are durably queued in `enquiry_ingestion_jobs` before processing. A lease prevents concurrent processing, failures retry with capped exponential backoff, and a crash recovers after lease expiry. Successfully imported jobs retain their ID/state, without a redundant copy of the message body. An unavailable database cannot falsely acknowledge an unsaved job. Provider redelivery is safe because queue and enquiry IDs are unique.

## Gmail OAuth setup

Gmail ingestion is separate from existing Gmail SMTP/OTP or HTTPS email delivery. It uses Google's official `google-auth-library` for OAuth and the Gmail API to read the configured business inbox.

In your Google Cloud project, enable the Gmail API, configure the OAuth consent screen and create an OAuth **Web application** client. Grant the least required scope `https://www.googleapis.com/auth/gmail.readonly` and register this exact production redirect:

```text
https://eternal-india-phi.vercel.app/api/integrations/gmail/callback
```

The callback deliberately uses the Vercel frontend origin. Its existing `/api` rewrite forwards to Render while preserving the browser's HttpOnly admin JWT cookie. A direct Render callback will not receive a cookie originally issued on the Vercel host. For local Vite development use `http://localhost:5173/api/integrations/gmail/callback`. Update the registered redirect and backend environment together if the frontend hostname changes.

Set privately on the backend:

```dotenv
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_INBOX_EMAIL=
GMAIL_REDIRECT_URI=https://eternal-india-phi.vercel.app/api/integrations/gmail/callback
GMAIL_SYNC_INTERVAL_SECONDS=30
INTEGRATION_TOKEN_SECRET=
```

Use the actual business Gmail/Google Workspace address in `GMAIL_INBOX_EMAIL`. `INTEGRATION_TOKEN_SECRET` should be a dedicated random value of at least 32 characters. If blank, the existing backend session secret is used with a separate derivation domain. Keep the encryption secret stable; changing it requires reconnecting an inbox whose existing token was encrypted with the old value.

Sign in to the Admin Panel with an account permitted to manage accounts. Open **Inbox connections → Connect Gmail**, sign in as the configured business inbox and complete Google's consent. Technical-only users cannot connect a different mailbox. The flow uses offline access, PKCE S256, a one-time hashed state bound to the current admin/JWT, a ten-minute expiry and a callback recheck of the business email. Callback codes/states are not written to application logs. Refresh tokens are encrypted with AES-256-GCM in `integration_credentials`; access tokens stay in the backend client. Neither is sent to frontend code or API responses. A pre-authorized `GMAIL_REFRESH_TOKEN` can optionally be supplied privately instead of using the panel flow.

Google may require consent-screen publication, test-user registration or scope verification depending on the app's configuration. A test consent app can have expiring authorizations. Reconnect when the panel reports an authorization error; the integration does not fall back to password-based mailbox access.

Initial sync pages through the inbox, obtains complete MIME messages with Gmail `format=raw`, and parses encoded names, subjects, multipart text and HTML-only bodies with `mailparser`. Attachments are recorded as metadata, without executing or displaying embedded HTML. Complete text and the original Gmail ID/received time are saved. Oversized/unparseable messages produce a visible error and retain the cursor for retry, rather than silently truncating or discarding content. Messages deleted from Gmail before retrieval cannot be recovered; a provider 404 on an individual message is skipped.

Later sync uses Gmail history IDs. The initial history baseline is captured before scanning, so messages arriving during the scan are picked up next. Page tokens/checkpoints advance only after successful imports. Unique IDs make retries and full resyncs safe. Expired Gmail history (404) triggers a new full inbox sync. Distributed database leases prevent simultaneous workers; failures store a safe error, release the lease and back off. `Sync inbox now` starts background work with HTTP 202 so a large inbox does not depend on a browser request staying open. The panel displays connection state, last success and safe errors. Background polling runs only while the Render process is awake; use a continuously running service for continuous unattended Gmail polling. After a restart or host sleep the durable cursor catches up.

## Realtime and the supplied ring

The existing Socket.IO package is attached to the backend HTTP server. Its `/api/enquiries/socket.io` endpoint must be contacted directly at the backend origin; Vercel's `/api/*` HTTP rewrite does not proxy WebSocket upgrades and can return the SPA HTML instead. The frontend requests `POST /api/{admin,technical}/socket-ticket` through its authenticated API session and then connects to the configured backend origin (`VITE_SOCKET_URL`, falling back to `VITE_API_BASE_URL` or the production Render URL). The ticket is random, single-use, expires after one minute and is stored hashed in MongoDB. Socket connections are checked against the live admin session, role and panel permission; no frontend-readable session JWT is introduced. Connections join the `enquiries` and role-specific panel rooms. Website, signed WhatsApp and Gmail creation events (including source and ID) are emitted only after the durable MongoDB outbox/history records are saved. The client refreshes shared records without reloading. Existing status/archive mutations emit one event per revision and new records have stable event IDs. Periodic outbox reconciliation recovers crashes and cross-instance messages; a 120-second overlap prevents events with equal timestamps from being skipped. The outbox keeps the original event name/payload and is not TTL-deleted. Origins are allowlisted from configured frontend origins, and expired, disabled, pending or password-rotated accounts are disconnected every 15 seconds.

MongoDB `enquiry_events` is a permanent outbox. Enquiry writes atomically append pending events to the same enquiry document; replay-safe flushes publish an event/history entry under a stable ID. A worker reconciles interrupted writes. Local delivery is immediate; a short overlapping outbox poll relays events written by another backend instance. Reconnection replays recent events from the client's in-memory timestamp and refreshes counts/lists. Per-panel event IDs suppress repeated toasts and sounds. Lists and counts retain periodic/focus refresh if the live connection is interrupted. For multiple Render instances, use sticky sessions for polling or a deployment that provides routing affinity.

Vercel's existing API proxy is reused with Socket.IO HTTP polling, avoiding dependence on WebSocket upgrades through Vercel rewrites. Direct backend connections can still use the same configured API origin. The UI always refetches authoritative MongoDB data after events. NEW is the shared new/unread count; it changes when an operator updates status, not when another browser merely opens a notification.

The exact user-supplied asset `frontend/src/assets/Notification Ring/notification-ring.mp3` plays for new enquiries. There is one audio player per panel and no synthesized replacement. New enquiries show an in-page popup and play the sound according to that signed-in account's preferences. Open the bell menu and select **Enable notification sound** to grant the browser a user gesture for audio playback. Mute and popup preferences are saved on the authenticated MongoDB admin account and reused by both panels. Browser autoplay restrictions can require enabling audio again after a full page refresh. Notifications are in-page popups; the app does not request OS notification permission. If the socket disconnects, the panel indicates reconnecting and the inbox continues periodic refreshes; recent outbox events are replayed on reconnection. No localStorage or fake incoming messages are used.

## API routes

| Route | Access / behavior |
| --- | --- |
| `POST /api/enquiries` | Existing rate-limited public website submission |
| `GET /api/{admin,technical}/enquiries` | Authenticated shared list, `source`, `status`, `search`, `page` |
| `GET /api/{admin,technical}/enquiries/:id` | Full message/details |
| `GET /api/{admin,technical}/enquiries?archived=true` | Shared archived enquiry list |
| `PATCH /api/{admin,technical}/enquiries/:id` | Update status, `assignedTo`, or archive/restore with `archive: true/false` |
| `DELETE /api/{admin,technical}/enquiries/:id` | Archive while preserving the record |
| `DELETE /api/{admin,technical}/enquiries/:id/permanent` | Permanently delete with an idempotency marker |
| `GET /api/{admin,technical}/enquiry-summary` | Shared new/unread count |
| `GET,PATCH /api/{admin,technical}/enquiry-notification-settings` | Authenticated account's sound/popup preferences |
| `GET /api/{admin,technical}/notifications?limit=&cursor=` | Persisted, cursor-paginated panel notification history |
| `GET /api/{admin,technical}/notifications/unread-count` | Current account's unread count |
| `PATCH /api/{admin,technical}/notifications/:id/read` | Mark a notification read across its authorized panels |
| `PATCH /api/{admin,technical}/notifications/read-all` | Mark all visible notifications read |
| `DELETE /api/{admin,technical}/notifications/:id` | Delete a notification from both authorized panels |
| `DELETE /api/{admin,technical}/notifications` | Clear the panel's shared notification history |
| `GET /api/{admin,technical}/enquiry-assignees` | Active account choices |
| `GET /api/{admin,technical}/enquiry-integrations` | Safe connection/sync status; no credentials |
| `POST /api/{admin,technical}/enquiry-integrations/gmail/sync` | Authenticated, rate-limited background sync |
| `POST /api/admin/enquiry-integrations/gmail/connect` | Account managers only; OAuth authorization URL |
| `GET /api/integrations/gmail/callback` | One-time, authenticated OAuth callback |
| `GET,POST /api/integrations/whatsapp/webhook` | Verification challenge / signed raw webhook |

## Shared real-time notifications

Notifications reuse the durable `enquiry_events` collection and authenticated Socket.IO server. Enquiry creation (Website, WhatsApp and Gmail), new panel accounts and successful panel activities persist a deduplicated notification before delivery. Admin and Technical clients receive only notifications whose audience includes their panel. `notification:event` updates the dropdown and full Notifications section without a page reload; reconnects reload the persisted list/count, so missed socket delivery does not lose history or replay old sounds. The existing notification ring is enabled by default for accounts without a saved preference; a user's saved sound toggle takes precedence. The ring plays only for new unread events after the browser has received a user gesture.

Read/unread state is durable and shared across authorized panels. Reading or deleting a record broadcasts the change to its audience; marking all read or clearing history synchronizes both panels. Notification sound and popup preferences remain per account in MongoDB. A fresh unread notification alone can ring or show a toast; the existing MP3 is unlocked after the browser's first user interaction to comply with autoplay restrictions. These preferences and history do not use browser storage.

## Verification and deployment

Keep the repository root as Render's Root Directory: the backend imports `shared/`. Build with `npm --prefix Backend ci`, start with `npm --prefix Backend start`, and use `/api/health`. The existing Vercel build/API rewrites remain. `render.yaml` and `Backend/.env.example` include the new configuration without secrets. Missing integration settings leave website enquiries and other features working; the connections panel reports setup requirements instead of claiming a successful connection.

```powershell
npm --prefix Backend test
npm --prefix frontend run verify:enquiries
npm --prefix frontend run verify:responsive
npm --prefix frontend run verify
npm --prefix frontend run build
```

`Backend/test/unified-enquiries.test.js` uses real MongoDB, actual Express requests and two real authenticated Socket.IO client connections. Only external Meta/Gmail deliveries are simulated. Tests cover migration, source/UUID indexes, unauthorized access, signature/challenge rejection, website races, complete messages/sender timestamps, duplicate WhatsApp delivery, paginated/incremental Gmail import, provider failure/retry, expired-history recovery, identical panel records, source filters, assignment/status/unread updates, encrypted PKCE state, archive listing/restoration, permanent deletion and re-import prevention. Existing enquiry tests also verify legacy API status inputs, preserved history and all other panel tools.

`frontend/scripts/verify-unified-enquiries.mjs` checks the real React source/status views in both panels, WhatsApp contact details, complete message rendering, Socket.IO event handling, the supplied MP3 path/playback, persistent mute/popup settings, duplicate suppression and cleanup. Test fixtures exist only inside tests. The product does not contain fake message or success paths.

The quote form starts its MongoDB request and dispatches the encoded `mailto:` or WhatsApp link during the same submit gesture, without waiting for a database response. A save failure keeps the customer's details, idempotency key and app link available for retry. Opening a draft does not send an email: the customer reviews and sends it in their configured app. The confirmation voice and saved reference appear only after persistence succeeds. The mailto includes name, email, phone, destination, departure date, travellers and the complete trip message, with CRLF separators and encoded query values.

Both inboxes use shared dark source/status badges, icons and NEW-row highlighting. Existing canonical statuses remain NEW, IN_PROGRESS, RESOLVED and CLOSED; legacy aliases retain their existing mapping. The shared authenticated list API accepts `sort=newest|oldest|updated` (default newest) before pagination, with stable ID ordering. Search, source, status, archive and sort selections are preserved in the panel URL.

The public navbar contains one persistent Plan Your Trip link outside its navigation dropdown; the homepage does not show a separate floating Plan Your Trip shortcut. The LINE/WhatsApp links remain available. Mobile panel drawers isolate keyboard focus, lock background scrolling, close with Escape and restore focus. Shared responsive rules cover enquiry cards, payment transaction cards, account/staff forms, calendars, notification controls, reports, profile/security, festival editors and voucher layouts without changing print document measurements.

`verify-responsive.mjs` checks actual React markup and computed CSS at 1920, 1440, 1366, 1024, 768, 430, 390, 375 and 320 pixels, including badge text contrast of at least 4.5:1, visible trip links, contained table scrolling, mobile input/control sizes and both role-based drawers. These are DOM/CSS regression checks; they do not prove pixel layout, launch an installed mail application, or replace real desktop/mobile browser QA. The browser preview host was unavailable during this change, so visual device checks and the installed default mail app remain manual checks.

Real WhatsApp and Gmail credentials were absent locally during implementation. Real-provider delivery and deployed callbacks require the configured business accounts and should be checked after deploying:

1. Submit the website form and confirm one WEBSITE record, matching full text/reference/status in both panels.
2. Send an actual message to the Cloud API business phone. Confirm one WHATSAPP record with Meta's message ID, sender, original text and timestamp in both panels; redeliver the webhook and confirm no duplicate or second ring.
3. Email the connected business Gmail inbox. Confirm one GMAIL record with the complete decoded body/subject and Gmail ID in both panels; sync again and confirm no duplicate.
4. Enable Notification Ring in each browser, verify one popup/sound per new enquiry, then check mute/popup settings.
5. Change status/assignment in one panel and verify the other updates without reloading. Interrupt/reconnect networking and check counts and records recover.
6. Test a temporary Gmail/database outage, webhook retry and backend restart. Confirm saved jobs/cursors recover without duplicate records and all existing payment/staff/account features remain available.

Official references: [Gmail synchronization and expired history](https://developers.google.com/workspace/gmail/api/guides/sync), [Google web-server OAuth and offline access](https://developers.google.com/identity/protocols/oauth2/web-server), [Meta webhook verification](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/), [WhatsApp webhook payloads](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components), [Socket.IO client path/credentials/polling](https://socket.io/docs/v4/client-options/).

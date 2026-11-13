# Notification repairs and verification

This guide supersedes the shared-read/shared-delete and audio descriptions in the older unified enquiry guide.

## Diagnosed faults

- Local panels sent local socket tickets to Render by default, where their MongoDB authorization records do not exist. Local sockets now use the current origin through Vite's WebSocket proxy. The production Vercel frontend retains the direct Render connection, with explicit environment overrides supported.
- `POST /api/{admin,technical}/socket-ticket` created a workspace activity notification for every connection. Ticket requests are now excluded.
- Enquiry publication removed its retry marker before saving the notification. It now retains the marker until persistence succeeds. Long external customer names are bounded in notification summaries while original enquiry data remains intact.
- Cursor validation rejected valid generated cursors for long notification IDs. The maximum supported ID now round trips through pagination.
- Muted HTML audio priming did not reliably authorize audible playback. A centralized Web Audio handler resumes within a user gesture, uses the bundled MP3 and supplies a built-in bell if decoding/loading fails. Browser audio instructions are separate from API errors.
- Connection failures now retry with fresh tickets. Requests and listeners are cleaned up; list/count refreshes are coalesced; responses overtaken by live mutations are discarded. History and reconnect replay are silent, and live notification IDs are deduplicated before sound/popups.

These are reproduced code-level faults. The original authenticated production Network/console trace was unavailable: browser access was unavailable and the native helper stopped because it could not verify Chrome's URL. The original production incident cannot be attributed to a specific authenticated response without that trace.

## Existing APIs and persistence

Both `/api/admin` and `/api/technical` reuse existing authentication, MongoDB and `notification:event` delivery:

| Method | Panel-relative path | Behavior |
| --- | --- | --- |
| GET | `/notifications?limit=&cursor=` | History, pagination and authoritative unread count |
| GET | `/notifications/unread-count` | Current account's unread count |
| POST | `/notifications` | Account administrators only; validated title, message, source, role audience and optional existing enquiry ID; 201 |
| PATCH | `/notifications/:id/read` | Read for this account; 204 |
| PATCH | `/notifications/read-all` | Read visible records through the server timestamp |
| DELETE | `/notifications/:id` | Dismiss for this account; 204 |
| DELETE | `/notifications` | Existing clear-all convention, scoped to this account |
| GET/PATCH | `/notifications/settings` | Per-account boolean sound/popup preferences |
| GET/PATCH | `/enquiry-notification-settings` | Compatible settings alias with the same handlers |

Read/delete/clear/preferences synchronize across the current account's authorized panels and sessions. Other accounts retain their state. Previously saved shared-read flags remain respected. Dismissal updates MongoDB without destroying another user's notification or the outbox deduplication record. Persisted notification-change events recover cross-instance delivery. Registration stores a pending notification with the account, allowing the worker to retry interrupted publication. No notification data or preference uses browser storage.

## Inbox behavior

Both panels share a pastel light theme with soft blue, purple, mint, pink and grey surfaces across navigation, cards, forms, tables, notifications and workspace tools. Mobile cards, detail views, category/status badges, date filters and status sorting use readable dark text. Provider sources remain WEBSITE, WHATSAPP and GMAIL. Website categories distinguish direct, WhatsApp handoff, email handoff, contact and Plan Your Trip enquiries. The Contact page links to the existing validated form with a contact category.

Statuses include New, Pending, In Progress, Follow-up, Completed (RESOLVED), Cancelled and Closed, preserving legacy mappings. Search includes customer name/email/phone and enquiry reference. Date filters are inclusive calendar days in IST. Newest/oldest/status/updated sorting happens before pagination. URL filters, assignment, complete messages, archive/restore and enquiry deletion are preserved.

## Verification and remaining checks

Use an accessible MongoDB server. This overrides only the test process connection; `.env` stays unchanged. Tests create and remove only unique `eternal_india_test_*` databases.

```powershell
$env:MONGO_URI='mongodb://127.0.0.1:27017'
npm --prefix Backend test
npm --prefix frontend run verify:notifications
npm --prefix frontend run verify:enquiries
npm --prefix frontend run verify:responsive
npm --prefix frontend run verify
npm --prefix frontend run build
```

Backend tests use real HTTP, MongoDB and authenticated sockets for CRUD, 401/403/404, real MongoDB write rejection returning JSON 500, account isolation, pagination, durable retries, cross-instance changes and preferences after logout/login. Existing Meta/Gmail tests simulate external provider delivery.

`verify:notifications` mounts actual React components using real HTTP, MongoDB and Socket.IO. It covers five website categories, both panels, read/delete/count sync, saved mute, reconnect recovery, fresh-event playback calls and silent history. Audio hardware is instrumented; these checks do not prove browser permission or physical playback. Responsive DOM/computed CSS checks cover 1920/1440/1366/1024/768/430/390/375/320 pixels, with readable badges, contained scrolling and touch controls.

Read-only deployed checks on 2026-11-13 returned health JSON 200 and unauthenticated notification JSON 401 from both Vercel and Render. Those checks cover the currently deployed version, not these workspace changes. Authenticated production mutation/socket/sound checks and visual/audio testing in Chrome, Edge, Firefox, Android and iPhone remain outstanding because a verified browser session was unavailable. No production enquiry, account or notification was created or deleted.

After deploying both services, sign in to each panel, tap Enable sound and submit a new enquiry. Check one saved notification/ring, unread counts, per-user read/delete and silent refresh/reconnect. Repeat with configured business WhatsApp/Gmail accounts; real provider delivery requires their credentials.

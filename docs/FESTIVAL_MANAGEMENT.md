# Special Days & Festival Decoration Management

## Access and operation

Open `/technical/login`, sign in with the existing technical owner account, then select **Special Days & Festival Management**. The module has Decoration Dashboard, Effects Library, Festival Management, Schedule Management, Live Preview, Active Decorations, Decoration History, and Global Settings sections. It is not included in normal Admin Panel navigation.

Create a festival as a draft, choose one to six compatible effects, configure its animation and greeting, and preview it. Publish the decoration, then either activate it manually or add a schedule. **Publish & activate** in Live Preview performs these operations explicitly. Saving an edited published festival returns it to draft and immediately removes it from public eligibility until someone with publication permission republishes it.

The library contains 36 real effect definitions and independent reusable React components: all 35 requested effects plus Meteor Shower. General effects can be combined with one festival scene. Duplicate effects, multiple festival scenes, more than six effects, and combinations costing more than the animation budget are rejected by the backend. The library and initial global settings are initialized in MongoDB; festivals, schedules and activity statistics are never populated with sample business records.

No new dependencies were installed. The implementation uses existing React, Express, MongoDB driver, `dayjs` (UTC/timezone plugins), `multer` and `express-rate-limit` dependencies. `Backend/package.json` only adds the `technical:access` script.

## Authentication and permissions

The existing MongoDB-backed HttpOnly session and password authentication are retained. Every technical request reloads its account from MongoDB. Normal admin accounts receive HTTP 403 from technical routes, even if they have a valid admin session. Festival routes are mounted exclusively under `/api/technical`; no corresponding write routes exist under `/api/admin`.

The configured owner of the pre-existing Technical Panel remains authorized. `TECHNICAL_EMAIL` selects that existing account; when unset, the configured `ADMIN_EMAIL` remains the owner. Other accounts need `roles: ["technical"]` (or both `admin` and `technical`). Existing account roles are not automatically rewritten. If a technical account has a `technicalPermissions` array, only those permissions apply; otherwise technical accounts have the complete permission set.

| Permission key | Allowed action |
| --- | --- |
| `dashboard` | Read dashboard, festivals, schedules and active decorations |
| `effects` | Read effects library and use isolated previews |
| `createFestival` | Create festival drafts and upload assets |
| `editFestival` | Edit festivals as drafts and upload assets |
| `deleteFestival` | Delete festivals after removing their schedules |
| `createSchedule` | Create schedules |
| `editSchedule` | Update schedules |
| `deleteSchedule` | Delete schedules |
| `publish` | Publish/unpublish saved decorations |
| `activate` | Enable/disable festivals and manually activate/deactivate |
| `settings` | Manage global settings, master ON/OFF and library availability |
| `history` | Search/filter/paginate immutable activity history |

Grant or restrict an existing staff account using the explicit local account-management command:

```powershell
npm --prefix Backend run technical:access -- staff@example.com grant
npm --prefix Backend run technical:access -- editor@example.com grant "dashboard,effects,createFestival,editFestival,createSchedule,editSchedule,history"
npm --prefix Backend run technical:access -- staff@example.com revoke
```

The command records its changes in activity history. It does not create an account or change a password. Revoking the configured owner removes its festival permissions; choose another `TECHNICAL_EMAIL` to remove its reserved owner identity entirely. There are no browser controls for self-granting permissions.

## Scheduling and public delivery

Express runs a backend reconciliation loop every second, starting after the MongoDB definitions/indexes are ready. Reconciliation also runs before active-state reads and after control changes, so server restarts recover current eligibility without a visitor needing to open a page. MongoDB leases coordinate multiple backend instances; schedule/festival writes use a separate MongoDB lease to prevent concurrent conflict checks and deletions from creating orphan schedules.

Dates and times are interpreted in the configured IANA timezone, default `Asia/Kolkata`. Start is inclusive and end is exclusive. Yearly recurrences begin in the configured first year, preserve local date/time, support windows spanning New Year, and skip non-leap years for February 29. Nonexistent daylight-saving local times are rejected. Repeated daylight-saving times consistently select the earlier UTC occurrence. Lunar festivals such as Diwali, Dhanteras and Holi require dates entered by the Technical Team; the system does not guess annual dates.

Only one eligible festival is displayed at a time. Higher schedule priority wins; festival priority and a stable identifier resolve ordering. Equal-priority enabled overlapping schedules are rejected. Manual activation outranks scheduled activation. Manual activation during an existing scheduled window inherits its expiry; activation without a current schedule continues until manually stopped. Manual OFF suppresses the current scheduled occurrence until expiry, so the scheduler cannot immediately turn it back on. Future annual occurrences remain eligible. Master OFF hides all decorations without deleting designs or schedules.

`/api/public/festival-decorations/events` pushes configuration changes using Server-Sent Events, with heartbeat and disconnect cleanup. Public pages also refresh every 15 seconds and on focus as a fallback. Reverse proxies should allow SSE streaming and avoid buffering this endpoint. In a multi-instance deployment, local streams observe other instances' MongoDB changes on the next backend tick. Expired public payloads are also hidden locally if a connection is lost; browsers never decide when a festival activates.

Public data contains only enabled, published, currently active decoration configuration. Staff identity, unpublished configuration and activity logs are excluded. Full website and homepage decorations use a fixed overlay; header/footer decorations are portaled into the existing corresponding element. Decorative layers use `pointer-events: none`, with explicit pointer access only for visitor controls. Visitor Hide/Show is in memory and does not alter MongoDB settings.

Festival workspace code, the renderer and effect groups are loaded lazily. Animations use CSS transforms/opacity, shared particle budgets, a mobile cap and reduced-motion support. Hidden tabs pause animations/countdowns and music. Listeners, timers, SSE connections, audio and pending mutation requests are cleaned up when their components are removed. Music uses `preload="none"` and never autoplays; a visitor must click Play after both festival and global music settings have been enabled.

This backend must run continuously for scheduled activation and streaming. A static-only deployment cannot run this module. Existing MongoDB session/HTTPS/production-origin configuration still applies.

## MongoDB models

The project uses its existing native MongoDB connection rather than adding a second Mongoose connection. Model initialization/indexes live in `Backend/festivals/models.js`; whitelisted field validation lives in `validation.js`.

| Model / collection | Persisted fields |
| --- | --- |
| `FestivalDecoration` / `festival_decorations` | `name`, `effectId`, `category`, `description`, `selectedEffects`, `enabled`, `published`, `intensity`, `animationSpeed`, `particleDensity`, `opacity`, `backgroundColor`, `displayPosition`, `greetingEnabled`, `greetingMessage`, `greetingColor`, `musicEnabled`, `musicUrl`, `priority`, `bannerImage`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` |
| `FestivalSchedule` / `festival_schedules` | `festivalId`, `startDate`, `endDate`, `startTime`, `endTime`, `timezone`, `recurringYearly`, `enabled`, `priority`, derived `startAt`/`endAt`, creator/updater identities and timestamps |
| `DecorationActivityLog` / `decoration_activity` | `action`, `decorationId`, `festivalName`, `performedBy`, `performedByRole`, `previousValues`, `newValues`, `timestamp`, `remarks` |
| `DecorationEffect` / `decoration_effects` | Real effect definition, common defaults, enabled status, updater identity and timestamps |
| `GlobalDecorationSettings` / `decoration_settings` | Singleton `global`: master enabled, default intensity/speed/density, timezone, visitor hide, greeting/music switches, mobile optimization, reduced motion, updater and timestamps |
| `DecorationRuntime` / `decoration_runtime` | Scheduler lease, schedule-write lease, manual control/suppressed occurrences, current active state and last activation |
| `DecorationAsset` / `decoration_assets` | Validated image bytes, content type, creator and creation time |

Banner uploads accept one JPG, PNG, WebP or GIF up to 2 MB. File signatures are checked on the server; SVG and arbitrary remote banner URLs are rejected. Images remain in MongoDB across backend restarts.

## API endpoints

All technical endpoints require the existing authenticated session plus the corresponding technical permission. JSON bodies are required except multipart image upload. Invalid input returns 400, unauthorized access 401/403, missing records 404, and scheduling/publication conflicts 409.

| Method | Endpoint | Permission / behavior |
| --- | --- | --- |
| GET | `/api/technical/decoration-dashboard` | `dashboard`; real counts, active/next festival and recent changes |
| GET | `/api/technical/decoration-effects` | `effects` |
| PATCH | `/api/technical/decoration-effects/:id` | `settings`; `{enabled}` |
| GET | `/api/technical/festival-decorations` | `dashboard` |
| GET | `/api/technical/festival-decorations/active` | `dashboard` |
| GET | `/api/technical/festival-decorations/:id` | `dashboard` |
| POST | `/api/technical/festival-decorations` | `createFestival`; creates draft |
| PUT | `/api/technical/festival-decorations/:id` | `editFestival`; saves draft |
| PATCH | `/api/technical/festival-decorations/:id/toggle` | `activate`; `{enabled}` |
| PATCH | `/api/technical/festival-decorations/:id/publish` | `publish`; `{published}` |
| POST | `/api/technical/festival-decorations/:id/activate` | `activate`; requires published/enabled festival and master ON |
| POST | `/api/technical/festival-decorations/:id/deactivate` | `activate`; suppresses current scheduled occurrence |
| DELETE | `/api/technical/festival-decorations/:id` | `deleteFestival`; rejects festivals still referenced by schedules |
| GET / POST | `/api/technical/festivals` | Alias for the same festival collection and read/create permissions |
| GET / PUT / DELETE | `/api/technical/festivals/:id` | Alias for the same read/edit/delete operations |
| GET | `/api/technical/festival-schedules` | `dashboard` |
| POST | `/api/technical/festival-schedules` | `createSchedule` |
| PUT | `/api/technical/festival-schedules/:id` | `editSchedule` |
| DELETE | `/api/technical/festival-schedules/:id` | `deleteSchedule` |
| GET | `/api/technical/decoration-settings` | `dashboard` or `settings` |
| PUT | `/api/technical/decoration-settings` | `settings`; complete settings object |
| POST | `/api/technical/decoration-settings/restore-defaults` | `settings`; retains festivals/schedules |
| GET | `/api/technical/decoration-history` | `history`; `search`, `action`, `from`, `to`, `page` filters |
| POST | `/api/technical/festival-assets` | `createFestival` or `editFestival`; multipart `image` |
| GET | `/api/public/festival-decorations/active` | Public, active configuration only |
| GET | `/api/public/festival-decorations/events` | Public SSE stream of active configuration |
| GET | `/api/public/festival-assets/:id` | Public validated banner bytes |

History has no edit/delete endpoint. Normal admin users cannot activate or publish by changing a submitted `published` field: create/update handlers force drafts, and publication is a separate permission-checked operation.

## Files changed for this module

Modified:

- `Backend/.env.example`
- `Backend/app.js`
- `Backend/config/env.js`
- `Backend/package.json`
- `Backend/server.js`
- `Backend/test/app.test.js`
- `frontend/scripts/verify.mjs`
- `frontend/src/App.jsx`
- `frontend/src/Common/AdminDashboard.jsx`
- `frontend/src/Common/AdminDashboard.css`
- `frontend/src/Pages/Admin.jsx`
- `README.md`

Created:

- `shared/decorationCatalog.js`
- `Backend/festivals/models.js`
- `Backend/festivals/permissions.js`
- `Backend/festivals/validation.js`
- `Backend/festivals/scheduling.js`
- `Backend/festivals/scheduler.js`
- `Backend/festivals/routes.js`
- `Backend/scripts/technical-access.js`
- `Backend/test/festivals.test.js`
- `frontend/scripts/verify-festivals.mjs`
- `frontend/src/Common/festivals/FestivalManagement.jsx`
- `frontend/src/Common/festivals/FestivalManagement.css`
- `frontend/src/Common/festivals/FestivalFields.jsx`
- `frontend/src/Common/festivals/FestivalForms.jsx`
- `frontend/src/Common/festivals/FestivalPreview.jsx`
- `frontend/src/Common/festivals/DecorationRenderer.jsx`
- `frontend/src/Common/festivals/PublicDecorations.jsx`
- `frontend/src/Common/festivals/PublicDecorations.css`
- `frontend/src/Common/festivals/effects/ParticleField.jsx`
- `frontend/src/Common/festivals/effects/GeneralEffects.jsx`
- `frontend/src/Common/festivals/effects/IndianEffects.jsx`
- `frontend/src/Common/festivals/effects/OccasionEffects.jsx`
- `frontend/src/Common/festivals/effects/registry.js`
- `frontend/src/Common/festivals/effects/effects.css`
- `docs/FESTIVAL_MANAGEMENT.md`

## Verification and remaining checks

Run `npm --prefix Backend test`, `npm --prefix frontend run verify`, `npm --prefix frontend run build`, and `npm --prefix frontend run lint`.

The backend suite covers existing enquiry/admin/hotel/voucher behavior plus technical authorization, granular editor restrictions, all effect records, malformed inputs, festival/schedule CRUD, concurrent schedule conflicts, backend activation/expiry, priority overlaps, manual suppression, master OFF SSE delivery, assets, yearly recurrence/New Year/leap days/DST, append-only audit snapshots, and restart persistence.

The frontend integration suite mounts all 36 independent effect components, exercises all eight sections, and uses a real Express server and isolated MongoDB test database for login, festival creation, publishing, activation, scheduling, history and global settings. It checks isolated desktop/mobile previews, public rendering/scopes, visitor hide, music consent, reduced motion and hidden-tab pause. Tests clean up only their uniquely named `eternal_india_test_*` databases. Existing frontend verification continues to cover public routes/assets, trip enquiry, audio, payments, navigation, pricing/offers and vouchers.

Browser-based visual review could not run because the browser access host is unavailable in this environment. Automated DOM/responsiveness checks do not substitute for visual review on physical mobile/tablet/desktop devices. Production load profiling and verification behind the deployment host's reverse proxy remain deployment checks; the local implementation does not publish a separate website or create sample festivals in the application's live database.

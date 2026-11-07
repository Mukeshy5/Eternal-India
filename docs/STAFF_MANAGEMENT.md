# Staff management and attendance

Both existing authenticated workspaces share the same MongoDB staff and attendance collections. Entry points: `/admin/staff`, `/admin/staff-attendance`, `/admin/staff-cards`, `/admin/staff-reports`, and the equivalent `/technical/*` paths. No browser storage holds permanent records.

## Setup and permissions

Install backend dependencies with `npm --prefix Backend install`, build with `npm run build`, then restart the backend. The existing MongoDB connection, environment variables and session cookie are reused. Startup creates strict MongoDB JSON Schema validators and indexes before accepting connections. No sample staff are seeded.

Configured admin and technical owners have full staff access. Existing administrator accounts and accounts with the `technical` role have full access unless an explicit `staffPermissions` array limits them. Other roles have no access. Technical API routes additionally enforce the existing Technical Panel role. These permissions are independent of festival permissions. Staff records do not create login accounts.

Limit an existing account with:

```powershell
npm --prefix Backend run staff:access -- person@example.com view,attendance
npm --prefix Backend run staff:access -- person@example.com view
npm --prefix Backend run staff:access -- person@example.com none
```

Available permissions: `view`, `create`, `edit`, `delete`, `attendance`, `export`. Every enabled permission set must include `view`. The server enforces these permissions on all routes, photos, downloads and mutations; UI controls follow the same permissions. Configured owners retain access.

## Records and identity cards

Staff require name, email, normalized phone, department, designation, status and photo. A live camera on HTTPS/localhost or a JPEG/PNG upload supplies the photo (maximum 2 MB). Photos are stored as binary MongoDB data and are accessible only through authenticated APIs. Employee IDs use `EI-` plus 12 random hexadecimal characters and a unique index. Email and phone also have unique indexes, including deleted records. Indian local, `91` and `+91` mobile numbers normalize to the same contact key.

Cards are generated from saved staff records and appear immediately in Staff Management and **Download ID Card** in both panels. The white/navy design includes the existing Eternal India logo, red diagonal accents, a circular photo, name, designation, department, employee ID, phone, email and a real Code 128 barcode containing the employee ID. Previews and exports share one server-generated template and always use the latest MongoDB record. Editing staff updates the preview URL through the record version.

PDF page dimensions are exactly **53.98 × 85.60 mm**. PNG downloads are **1275 × 2022 pixels at 600 DPI**. Print ID Card opens an isolated print frame with CR80 page dimensions and zero CSS margins. Print at actual size / 100%, select the correct card paper size and disable browser headers/footers. Printer hardware must support the desired printable area.

ID card text uses Noto Sans Devanagari glyph outlines for Hindi and Latin details; the PDF embeds the matching high-resolution card image. Report PDFs embed the font. The font is bundled in `Backend/staff/fonts` with its SIL Open Font License. Photos support up to 4096 pixels on either side and 16 megapixels. Stored photos are normalized for orientation and circular cropping when generating a card.

Delete removes a member from current staff and attendance lists by setting `deletedAt` and inactive status. Historical attendance and its staff identity remain available in reports and individual profiles. This prevents orphaned history and reusing an existing employee identity. A deleted contact remains reserved; use inactive status when the person may return. Staff and attendance updates require the current `version`; stale changes return HTTP 409.

## Attendance policy

The attendance screen loads all active staff from MongoDB, left joined with that date's saved attendance. Unmarked is separate from Absent. Inactive/deleted staff cannot receive new attendance, but authorized users can correct existing historical attendance through reports.

Each attendance row has only a Present / Absent / Leave selector. The selected date and one Submit attendance button are shown below the list; all staff choices are saved together. Unmarked rows cannot be submitted.

- One record per staff/date is enforced by a compound unique index. POST duplicates return 409; PATCH updates the existing record with an optimistic version check.
- New attendance submissions use `present`, `absent` or `leave` and save no check-in, check-out or working-hour values. Leave and unmarked dates are excluded from attendance percentage. No work schedule or holiday calendar is inferred.
- Daily, Monday–Sunday weekly, monthly and custom inclusive date ranges are available. Custom ranges support up to 366 days. History is paginated at 50 rows, staff lists at 24. Totals cover the full filter, not only the current page. PDF/Excel downloads include all matching rows (up to 50,000; narrow the filter for larger exports). Historical reports include inactive and deleted staff.

## REST endpoints

All paths are mounted under both `/api/admin` and `/api/technical` and use the existing Mongo-backed authentication and origin checks.

| Route | Purpose |
| --- | --- |
| `GET /staff?search=&status=&page=` | Paginated staff and totals |
| `POST /staff` | Create staff using multipart fields and `photo` |
| `GET /staff/:id` | Staff details without binary photo |
| `PATCH /staff/:id` | JSON or multipart edit, including `version` |
| `DELETE /staff/:id` | Soft delete with JSON `{ version }` |
| `GET /staff/:id/photo` | Protected photo |
| `GET /staff/:id/card-preview` | Protected responsive SVG preview; requires view permission |
| `GET /staff/:id/card?format=pdf\|png` | Exact-size PDF (default) or 600 DPI PNG; requires export permission |
| `GET /staff-attendance?date=&search=&page=` | Active staff and daily counts |
| `POST /staff-attendance/bulk` | Save Present / Absent / Leave for all active staff on one date |
| `POST /staff-attendance` | Create a unique staff/date record |
| `PATCH /staff-attendance/:id` | Correct status/times using `version` |
| `GET /staff/:id/attendance` | Profile, totals, daily/monthly breakdown and history |
| `GET /staff-reports` | All-staff report with the same filters |

Report filters: `period=daily|weekly|monthly&date=YYYY-MM-DD`, `month=YYYY-MM`, or `from=YYYY-MM-DD&to=YYYY-MM-DD`; optional `search`, `page`, `format=pdf|xlsx`. Export permission is required for either format.

## Verification

`npm run test:backend` includes real MongoDB/HTTP tests for authorization, photo persistence, duplicate contacts, concurrent attendance submissions, conflicts, date/time validation, report calculations, card dimensions, PDF/Excel parsing, inactive/deleted history and persistence across application instances. `npm run verify` exercises both panels and the live API with an isolated MongoDB test database, including simulated camera hardware and real downloadable files. Test databases are separate from production data and removed on completion. Physical camera access still depends on the visitor's device and browser permission.

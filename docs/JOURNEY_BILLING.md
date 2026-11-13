# Journey Voucher billing rebuild

Both `/admin/vouchers` and `/technical/vouchers` open the new billing editor and register. The corresponding `/voucher-history` sections open the same register with the editor closed. All data comes from authenticated APIs and MongoDB. No voucher data, credentials or verification flags use localStorage.

## Setup and retained data

Use the existing **Hotel inventory** and **GST management** sections. Hotels supply the initial base amount; staff can enter the agreed voucher amount. A GST record must contain the company's actual 15-character GSTIN and a rate to be selected for billing. Existing numbers saved in the old GST name field are recognized automatically, without modifying those records. Rate-only records appear as disabled choices with a message to add the company number in GST management. No GST numbers or prices are seeded into the application.

The old itinerary editor, validation, route handlers, artwork, print components and voucher-specific styles were removed. The public travel pages retain their shared road illustration. Historic itinerary documents in `journey_vouchers` are retained untouched: they have no verifiable invoice price, company GSTIN or billing dates, so the new application does not fabricate billing records from them. The rebuilt register contains all new billing vouchers in `journey_billing_vouchers`. There is no automatic destructive migration and no new API exposing the legacy schema.

## Persistence and invoice guarantees

- `journey_billing_vouchers`: complete dates, requirements, status, hotel/GST snapshots, integer-paise pricing, creator/updater IDs, revision and timestamps. Unique invoice index; date, hotel and GST query indexes.
- `journey_invoice_reservations`: permanent, owner-bound invoice reservation and idempotency key. Reserved and deleted invoice numbers are never recycled.
- `billing_counters`: atomic, bounded `findOneAndUpdate` sequence. Numbers run from **10000 through 99999**. Allocation gaps are intentional for abandoned forms or concurrent retry races. After 90,000 allocations the API returns an explicit capacity error; it never wraps or silently reuses a number.

Creating a form reserves its invoice in the backend before saving. The editor keeps the reservation request key only in memory. Repeating that request returns its existing reservation. Saving the same reservation and original payload is idempotent. A unique `_id` and unique invoice index protect concurrent saves. Changes use revision-based compare-and-update; stale edits and deletes return 409. Deletion physically removes the billing voucher while retaining only its invoice tombstone. Startup never expires saved vouchers, invoice reservations or the counter. Back up all three collections together.

GST is rounded once to the nearest paise from the validated base price and the selected database rate. Submitted totals, snapshots and invoice numbers are ignored. Up to two decimal places are accepted; negative amounts, booleans, exponent strings and out-of-range values fail validation. Zero amounts and a configured zero rate are supported. The maximum base amount is INR 99,999,999.99. The editor updates immediately, verifies its quote with the server and requires the displayed GST rate to remain current at save time.

Reprints always use persisted snapshots and saved amounts. Hotel/GST changes do not retroactively change issued documents. On edit, current records are used and their price impact is displayed before saving. If a referenced hotel or GST record was deleted, the saved snapshot remains usable when editing that existing voucher.

## Shared authenticated API

All paths below are under `/api/admin` and `/api/technical`. The existing HttpOnly cookie/JWT/session and current account role checks remain in force. Only authorized Admin or Technical accounts can access these operations; reservation ownership is checked separately.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vouchers/options` | Current hotels, GST configurations and historical filter choices |
| POST | `/vouchers/invoice` | Reserve invoice using a `requestId` UUID (60 requests/minute/IP) |
| POST | `/vouchers/quote` | Validate a base price and calculate current GST/total |
| POST | `/vouchers` | Create using an owned `reservationId` |
| GET | `/vouchers` | Search, filters, pagination and matching totals |
| GET | `/vouchers/:id` | Full saved details |
| PATCH | `/vouchers/:id` | Update original record using its `revision` |
| DELETE | `/vouchers/:id?revision=N` | Confirmed permanent deletion with conflict protection |
| GET | `/vouchers/:id/print-data` | Saved printable data |
| GET | `/vouchers/:id/pdf` | Authenticated A4 PDF |
| GET | `/vouchers/export?format=xlsx` | Export every matching record to Excel |
| GET | `/vouchers/export?format=pdf` | Export matching history to a paged landscape PDF |

List and export filters: `search`, `invoiceNumber`, `guestName`, `hotelId`, `gstId`, `status`, `from`, `to`. Dates are inclusive voucher dates. Statuses: `draft`, `confirmed`, `cancelled`. `pageSize` is 10, 20 or 50; the server clamps pages after deletion. Total count and billing amount cover all matching records, including all matching statuses, rather than just the visible page. Exports apply the active filters and permit up to 5,000 records; narrow the filters for larger histories.

## Print and synchronization

PDFKit generates the portrait A4 voucher with the existing aspect-preserved logo, specified company details, all travel fields, saved pricing, signature space and footer. A normal voucher uses one A4 page. Long requirements continue onto additional pages without truncating guest instructions. The existing bundled Noto font supports Hindi and INR glyphs. The history PDF repeats table headers and page numbers; Excel includes all billing and travel fields and numeric amounts.

**Print** opens the generated PDF in an isolated browser viewer. Its **Print voucher** action prints that PDF frame, so the preview, downloaded PDF and printed content are identical and contain no dashboard navigation. Chrome's built-in PDF viewer also provides its own print control. Generated object URLs are revoked on close. The backend CSP permits the blob frame.

Successful create/update/delete operations immediately refresh the local register; navigation reloads data. Open registers also refresh on focus and every 15 seconds. GST create/update/delete events use the authenticated Socket.IO connection to refresh open voucher selectors and history filters across both panels immediately; the existing MongoDB event outbox also carries them between server instances. Reconnecting refreshes the current options. Options also refresh on focus, coming online, opening the GST selector and every 30 seconds as a fallback. Background refresh preserves unsaved voucher fields, selected GST and manually entered prices, keeps the form enabled and reuses its invoice reservation. Changes received during a request queue another refresh. Unsaved edits and in-flight operations participate in the existing panel navigation guard.

## Verification

`Backend/test/vouchers.test.js` uses real HTTP and isolated MongoDB databases, including concurrent reservations/creates, retry idempotency, authorization, validation, filtered totals/pagination, tax edits and immutable reprints, revision conflicts, deletions, exhausted invoice capacity, real PDF generation and reopening Excel exports. `frontend/scripts/verify-voucher.mjs` mounts the actual React workspace and exercises form entry, immediate and server-verified prices, create/edit/search/delete, canceled deletion, history synchronization, PDF frame printing and exports. The external browser PDF plugin is stubbed only in happy-dom; actual PDF bytes are exercised by backend tests.

Run with the configured MongoDB or set `MONGO_URI` in the current shell to a disposable local server (test code always chooses a unique `eternal_india_test_*` database and cleans only that database):

```powershell
npm --prefix Backend test
npm --prefix frontend run verify:vouchers
npm --prefix frontend run verify
npm --prefix frontend run build
```

Never point test cleanup at a production database name. No deployment or production-data migration is performed by these commands.

# Journey Voucher billing rebuild

Both `/admin/vouchers` and `/technical/vouchers` open the new billing editor and register. The corresponding `/voucher-history` sections open the same register with the editor closed. All data comes from authenticated APIs and MongoDB. No voucher data, credentials or verification flags use localStorage.

## Setup and retained data

Use **Hotel inventory**, **Add GST** and **Address Add** in either panel. Hotels supply the initial amount; staff can enter the agreed voucher amount. Add GST has one field: the company's 15-character GSTIN. GST names and percentages are no longer entered or returned by its API. Existing numbers saved in the old GST name field remain readable. Rate-only records appear as disabled choices until a valid GST number is supplied. No registration numbers, office addresses or prices are seeded.

**Address Add** supports viewing, searching, adding, editing and deleting office names, addresses and optional phone numbers. Addresses are shared across both panels. New vouchers require a saved office address and one meal plan: **CP - Breakfast Only**, **MAP - Breakfast + Dinner**, or **AP - Breakfast + Lunch + Dinner**. The address and meal plan are saved with the voucher and appear in details, history, exports and print. Duplicate addresses/GST numbers and stale updates return 409 rather than silently replacing another user's changes.

The old itinerary editor, validation, route handlers, artwork, print components and voucher-specific styles were removed. The public travel pages retain their shared road illustration. Historic itinerary documents in `journey_vouchers` are retained untouched: they have no verifiable invoice price, company GSTIN or billing dates, so the new application does not fabricate billing records from them. The rebuilt register contains all new billing vouchers in `journey_billing_vouchers`. There is no automatic destructive migration and no new API exposing the legacy schema.

## Persistence and invoice guarantees

- `journey_billing_vouchers`: complete dates, requirements, status, hotel/GST/office snapshots, meal plan, integer-paise pricing, creator/updater IDs, revision and timestamps. Unique invoice index; date, hotel, GST, office and meal plan query indexes. New records use schema version 2 and require an office and meal plan; schema version 1 vouchers remain editable without inventing missing meal plans.
- `office_addresses`: validated office details, normalized address key, version, creator/updater IDs and timestamps. Normalized addresses have a unique index.
- `gst_rates`: existing collection retained for compatibility; new records store GST numbers, unique keys, versions and audit timestamps. Updating an older entry removes its name and rate fields without changing issued voucher snapshots.
- `journey_invoice_reservations`: permanent, owner-bound invoice reservation and idempotency key. Reserved and deleted invoice numbers are never recycled.
- `billing_counters`: atomic, bounded `findOneAndUpdate` sequence. Numbers run from **10000 through 99999**. Allocation gaps are intentional for abandoned forms or concurrent retry races. After 90,000 allocations the API returns an explicit capacity error; it never wraps or silently reuses a number.

Creating a form reserves its invoice in the backend before saving. The editor keeps the reservation request key only in memory. Repeating that request returns its existing reservation. Saving the same reservation and original payload is idempotent. A unique `_id` and unique invoice index protect concurrent saves. Changes use revision-based compare-and-update; stale edits and deletes return 409. Deletion physically removes the billing voucher while retaining only its invoice tombstone. Startup never expires saved vouchers, invoice reservations or the counter. Back up all three collections together.

For new vouchers the entered amount is the final total; a GST registration number does not supply a tax percentage. Existing vouchers retain their saved tax rate when edited, including when changing the selected GST registration. Historical tax is rounded to the nearest paise. Submitted totals, snapshots and invoice numbers are ignored. Up to two decimal places are accepted; negative amounts, booleans, exponent strings and out-of-range values fail validation. The maximum amount is INR 99,999,999.99. The editor verifies prices and selected GST/office versions with the server before saving.

Reprints always use persisted snapshots and saved amounts. Changes to hotels, GST registrations and offices do not retroactively change issued documents. On edit, current records are shown for review. If a referenced hotel, GST registration or office was deleted, its saved snapshot remains usable when editing that existing voucher. Older vouchers retain their original company address and show “Not recorded” for missing meal plans.

## Shared authenticated API

All paths below are under `/api/admin` and `/api/technical`. The existing HttpOnly cookie/JWT/session and current account role checks remain in force. Only authorized Admin or Technical accounts can access these operations; reservation ownership is checked separately.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/office-addresses` | Shared saved offices |
| GET | `/office-addresses/:id` | One office's details |
| POST | `/office-addresses` | Add an office (`name`, `address`, optional `phone`) |
| PATCH / DELETE | `/office-addresses/:id` | Update/remove using the current `version` |
| GET / POST | `/gst` | List/add GST numbers (only `gstNumber` is entered) |
| PATCH / DELETE | `/gst/:id` | Update/remove a GST registration using its current `version` |
| GET | `/vouchers/options` | Current hotels, GST numbers, offices and historical filter choices |
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

List and export filters: `search`, `invoiceNumber`, `guestName`, `hotelId`, `gstId`, `officeAddressId`, `mealPlan`, `status`, `from`, `to`. Dates are inclusive voucher dates. Statuses: `draft`, `confirmed`, `cancelled`. `pageSize` is 10, 20 or 50; the server clamps pages after deletion. Total count and billing amount cover all matching records, including all matching statuses, rather than just the visible page. Exports apply the active filters and permit up to 5,000 records; narrow the filters for larger histories.

## Print and synchronization

PDFKit generates the portrait A4 voucher with the existing aspect-preserved logo, selected office name/address/contact, meal plan, travel fields, signature space and footer. A normal voucher uses one A4 page. Long requirements continue onto additional pages without truncating guest instructions. The existing bundled Noto font supports Hindi and INR glyphs. The history PDF repeats table headers and page numbers, including when a long office address spans pages; Excel includes office/meal details and numeric billing amounts.

**Print** opens the generated PDF in an isolated browser viewer. Its **Print voucher** action prints that PDF frame, so the preview, downloaded PDF and printed content are identical and contain no dashboard navigation. Chrome's built-in PDF viewer also provides its own print control. Generated object URLs are revoked on close. The backend CSP permits the blob frame.

Successful create/update/delete operations immediately refresh the local register; navigation reloads data. Open registers also refresh on focus and every 15 seconds. GST and office create/update/delete events use the authenticated Socket.IO connection to refresh open voucher selectors, master lists and history filters across both panels immediately; the existing MongoDB event outbox also carries them between server instances. Reconnecting refreshes the current options. Options also refresh on focus, coming online, opening the selectors and every 30 seconds as a fallback. Background refresh preserves unsaved fields, meal plan, valid selections and manually entered prices, keeps the form enabled and reuses its invoice reservation. Changes received during a request queue another refresh. Unsaved edits and in-flight operations participate in the existing panel navigation guard.

## Verification

`Backend/test/vouchers.test.js` uses real HTTP and isolated MongoDB databases, including concurrent reservations/creates, retry idempotency, authorization, validation, filtered totals/pagination, tax edits and immutable reprints, revision conflicts, deletions, exhausted invoice capacity, real PDF generation and reopening Excel exports. `frontend/scripts/verify-voucher.mjs` mounts the actual React workspace and exercises form entry, immediate and server-verified prices, create/edit/search/delete, canceled deletion, history synchronization, PDF frame printing and exports. The external browser PDF plugin is stubbed only in happy-dom; actual PDF bytes are exercised by backend tests.

Run with the configured MongoDB or set `MONGO_URI` in the current shell to a disposable local server (test code always chooses a unique `eternal_india_test_*` database and cleans only that database):

```powershell
npm --prefix Backend test
npm --prefix frontend run verify:vouchers
npm --prefix frontend run verify:office-vouchers
npm --prefix frontend run verify
npm --prefix frontend run build
```

Never point test cleanup at a production database name. No deployment or production-data migration is performed by these commands.

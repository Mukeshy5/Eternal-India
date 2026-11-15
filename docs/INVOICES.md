# Billing / Invoice

Both panels expose **Operations → Billing / Invoice** at `/admin/invoices` and `/technical/invoices`. This module is independent of Journey Vouchers. Existing Admin and Technical roles can view, create, edit, download, print and delete invoices; other roles, disabled accounts and unauthenticated callers cannot access it. Panel-specific endpoints also enforce access to the requested panel.

## Workflow

Create an invoice with its date (defaults to today in Asia/Kolkata), client name, positive whole number of persons, positive INR rate, optional recipient address, description and notes. The form calculates a live total. Saving assigns an immutable `EI-INV-000001` style number. The backend independently validates and calculates in integer paise, never accepting a submitted total, bank account, invoice number or actor identity.

The register includes global invoice count/amount and today's/month's invoice counts, plus the matching count and amount for the current filters. Search by number/client, exact date, date range, month, year, latest/oldest sorting and 10/20/50/100-row pagination are server-backed. Combined date filters intersect. Today/month use invoice dates and India time. Clear filters resets the register.

View shows saved details and audit identities. Edit preserves the number and bank/QR snapshot. Changes and deletions require the version last reviewed; a stale operation returns 409. Reopen the invoice to review changes and retry. Deletion asks for confirmation and permanently removes the invoice; allocated numbers are never reused. If a server stops during deletion, its claim can be retried after 60 seconds.

PDF preview, print and download use the same authenticated server-generated A4 PDF. The download name is `Invoice-[InvoiceNumber].pdf`. The original `frontend/src/assets/paymentpng/payment-QR.png` is imported by Vite for the screen document and embedded directly by the backend PDF generator, with its aspect ratio preserved. The existing logo is similarly embedded. Bank details are snapshotted from `shared/invoices.js`; no payment processor or new QR is created. Long recipient details and notes continue on subsequent pages with repeated headers/footers. The signature/stamp area is intentionally blank.

## API and storage

The canonical API is `/api/invoices`; equivalent endpoints are available under `/api/admin/invoices` and `/api/technical/invoices`. All use the existing HttpOnly JWT authentication and active MongoDB session records.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/invoices` | `invoices`, pagination, global `stats`, `filteredAmount` |
| POST | `/api/invoices` | Validated form plus UUID `requestId`; returns `{ invoice }` |
| GET | `/api/invoices/:id` | Returns `{ invoice }` |
| PUT | `/api/invoices/:id` | Complete form plus integer `version` |
| DELETE | `/api/invoices/:id` | JSON `{ version }`; returns 204 |
| GET | `/api/invoices/:id/pdf` | PDF attachment (`?inline=1` for inline disposition) |

List query fields: `search`, `invoiceNumber`, `clientName`, `date`, `from`, `to`, `month` (`YYYY-MM`), `year`, `sort` (`latest`/`oldest`), `page`, `pageSize`. Invalid filters, values and unknown keys return 400. IDs, dates, lengths, numeric bounds and pagination are checked server-side. Amounts have at most two decimal places and totals cannot exceed INR 9,999,999,999.99. The tax-invoice label is selectable; the requested quantity × rate formula does not add a separate tax calculation.

`billing_invoices` has a strict MongoDB validator, unique number/request indexes and a date index. It stores billing data, integer paise, bank/QR snapshot identifiers, audit identities/timestamps and version. A separate `billing_counters` document (`billing_invoice`) allocates numbers atomically. `invoice_requests` retains minimal issuance metadata, hashes and deletion tombstones for safe retries; no client address or notes are retained there. These collections have no TTL. Retries of the same account/request ID return the same invoice; changed payloads return 409 and retries of deleted invoices return 410. Failed or racing allocations can leave gaps; numbers are increasing and never reused. MongoDB transactions/replica sets are not required.

The existing authenticated Socket.IO service distributes `invoices:changed` through its persisted outbox, including across server instances and reconnects. The dashboard additionally reloads on focus, visibility changes and every 30 seconds as a fallback. Unsaved form input is preserved; version checks protect concurrent saves. No invoice data or authentication state is stored in localStorage.

## Deployment and verification

Deploy the repository root on the backend, retaining `shared/`, the font in `Backend/staff/fonts/`, and the original frontend logo/QR assets. The existing Render configuration includes these paths. Vite emits hashed image URLs for the frontend, so no manually copied QR or public asset route is needed. Collection validation and indexes initialize on startup. There are no new environment variables or dependencies.

```powershell
# Uses a unique eternal_india_test_* database and removes only that database.
node --test --test-concurrency=1 Backend/test/invoices.test.js
npm --prefix frontend run verify:invoices
npm run build
```

To use the local MongoDB service for tests without changing `.env`, set `$env:MONGO_URI = 'mongodb://127.0.0.1:27017'` in the test shell. Optional `INVOICE_QA_DIR` saves normal/multipage test PDFs for visual inspection. Test data is isolated and never inserted into the operational database.

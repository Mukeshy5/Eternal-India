# Website verification — 16 November 2026

## Fixes and verified behavior

- All enquiries provides Delete on desktop and mobile rows, plus permanent deletion in the details drawer. Cancellation and failed deletion preserve the enquiry. Successful deletion clears related alerts and closes details in both panels.
- Direct Website, Gmail and WhatsApp views classify website handoffs by their chosen contact channel while preserving the original ingestion source for deduplication. Filters, counts, search, archive and restore were exercised through both authenticated APIs.
- Notification refreshes coalesce related live events into one request. Recovery snapshots cannot consume a fresh event's alert. Existing history/reconnect replay stays silent; fresh unread notifications alert once.
- Mark all read and Clear all dismiss popups after a successful HTTP response even without a socket acknowledgement.
- Public offers and festival data reload immediately after an aborted Strict Mode mount. Hidden tabs skip offer polling, and festival streams use the configured API origin.
- Storage admission queues concurrent requests locally before taking the distributed lock. This fixes the reproduced failure of 51 concurrent attendance saves. Quota rejection, recovery after rejection and maintenance exclusion remain covered by integration tests.
- Verification entry points disable Vite's unused WebSocket listener, preventing test-port conflicts. The calendar stream test allows 30 seconds for authorization and two database writes; the original 12-second deadline failed under load, while the same assertions passed in isolation and with the revised deadline.

## Completed checks

| Check | Result |
| --- | --- |
| Vite production build | Passed, including the final frontend source |
| `npm --prefix frontend run verify` | Passed: public routes/assets, forms, navigation, responsive CSS/DOM, both panels, accounts, vouchers, festivals, staff, letters, office/GST and calendar workflows |
| `npm --prefix frontend run verify:notifications` | Passed with actual React, HTTP, MongoDB and Socket.IO; includes reconnect alerts and permanent enquiry deletion in both panels |
| `npm --prefix frontend run verify:invoices` | Passed: calculations, persistence, PDF, cross-panel updates, editing, search and deletion |
| `npm --prefix frontend run verify:staff-panel` | Passed: provisioning, username login, permissions, all eight modules, ID card and invoice preview |
| `npm --prefix frontend run verify:data-control` | Passed: navigation, selection, backup confirmation, cancellation and restore warning |
| Complete backend suite: `node --test --test-concurrency=2` from `Backend` | 165/165 passed; 0 failed, skipped or cancelled |
| Backend enquiry integration | 17/17 passed |
| Backend data-control and staff regression files after admission fix | 24/24 passed, including all 51 simultaneous saves and Hindi/Excel/PDF exports |
| Backend calendar regression file after timing fix | 8/8 passed |
| Frontend lint | 0 errors; 78 warnings remain |
| `git diff --check` | Passed |

## Limits

Browser visual verification was stopped because Computer Use could not identify Chrome's current URL reliably. Responsive checks use DOM/computed CSS, and notification audio hardware is instrumented. Actual browser sound, installed email-app handoff, real Gmail/Meta delivery and live payment-gateway transactions were not verified. External providers are simulated in the automated tests.

No production load or browser speed score was measured. Performance changes reduce redundant requests and resolve the reproduced concurrent-save failure. Changes are local; no deployment was performed.

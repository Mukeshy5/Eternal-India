# Eternal India online payments

Standard Checkout is mounted only on the existing `/online-payment` page reached from the navbar. The existing bank-transfer, QR display and cash arrangements remain available. They do not create or confirm Razorpay transactions. The backend already had the official `razorpay` SDK installed; there is one new payment system using that SDK and the application's existing native MongoDB architecture.

## Configuration and deployment

Begin in Test Mode. Set the following privately in the ignored `Backend/.env` for local development and in the existing Render service's Environment settings for deployment:

```dotenv
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENT_MIN_AMOUNT_INR=1
PAYMENT_MAX_AMOUNT_INR=500000
FRONTEND_URL=https://eternal-india-phi.vercel.app
```

Use the actual `rzp_test_…` Key ID and its matching secret from the Razorpay Test Mode dashboard. Choose a separate webhook signing secret when setting up the webhook. These are intentionally blank in versioned example files. Checkout stays unavailable until all three settings are present; the rest of the application continues to work. The backend refuses keys that do not match `RAZORPAY_MODE`, which defaults to `test` even in production. Configure the minimum and maximum amounts to the business's approved limits; defaults are ₹1–₹5,00,000. Limits accept at most two decimals.

Render must use the **repository root** (leave Root Directory blank), build command `npm --prefix Backend ci`, start command `npm --prefix Backend start`, and `/api/health` for health checks. The backend imports `../shared`; selecting `Backend` as Render's Root Directory would exclude those files at runtime. Preserve the existing MongoDB, authentication and email environment variables. `render.yaml` is an optional Blueprint description for the existing service, not an instruction to create another service. `FRONTEND_URL` supports the existing comma-separated origin format and takes precedence over `FRONTEND_ORIGIN`. See [Render monorepo root directory rules](https://render.com/docs/monorepo-support).

Vercel uses the `frontend` root, build command `npm run build`, output `dist`. Enable **Include source files outside of the Root Directory in the Build Step** for the existing shared catalog imports. The existing `frontend/vercel.json` proxies `/api/*` to `https://eternal-india-1.onrender.com/api/*` and preserves SPA routing. Update that destination if the backend hostname changes. Using the same-origin rewrite also retains existing admin cookie authentication. `VITE_API_BASE_URL` can instead point to the backend HTTPS origin without `/api`, with that frontend origin allowed by Render. For local development Vite proxies `/api` to port 5000.

`frontend/.env.example` includes `VITE_RAZORPAY_KEY_ID`. It is optional and public; when provided it must match the backend Key ID. The order response supplies the authoritative Key ID, amount and currency. No key secret or webhook secret belongs in a `VITE_*` variable, source file, log or frontend bundle.

In Razorpay **Test Mode**, create a webhook pointing directly to the backend:

```text
https://eternal-india-1.onrender.com/api/payments/webhook
```

Enable `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, and optionally `payment.authorized`. Save the same signing secret as `RAZORPAY_WEBHOOK_SECRET` in Render. Enable automatic payment capture in Razorpay's dashboard. An authorized payment stays `AUTHORIZED` until capture is independently confirmed; the app never silently captures it or treats authorization as money received. Use HTTPS for both deployed applications and the webhook endpoint.

## Routes and ownership

| Endpoint | Purpose / access |
| --- | --- |
| `GET /api/payments/config` | Public availability, Test/Live mode, INR and amount limits; no secrets |
| `POST /api/payments/create-order` | Validated customer details, decimal INR amount, UUID v4 `submissionId`, random 256-bit hex `accessToken` |
| `POST /api/payments/verify` | Original order ID, payment ID, signature and matching transaction access token |
| `GET /api/payments/status/:orderId` | Database status; requires `Authorization: Bearer <accessToken>` |
| `GET /api/payments/status?orderId=…` | Equivalent status lookup |
| `POST /api/payments/webhook` | Raw JSON authenticated with Razorpay HMAC and event ID |
| `GET /api/admin/payments` | Existing admin authentication, search/status/date filters and pagination |
| `GET /api/admin/payments/:id` | Existing admin authentication, full transaction/refund history |

The website has staff/admin accounts but no customer login or invoice ledger. Guest payment ownership therefore uses a cryptographically random, per-transaction access token. The browser generates it before submission, keeps it only in React memory, and reuses it with the submission UUID on retries. MongoDB stores only its SHA-256 hash. Status URLs never contain the token, email, phone or other customer details. Reading a different order or verifying it with a different token returns 404. Admin payment management is visible at `/admin/payments` for authorized admin accounts; a technical-only account cannot access it.

Keep the payment page open through confirmation. Refreshing or leaving the page discards the guest access token; the stored transaction and webhook processing remain intact, but guest lookup is no longer available in that tab. Contact the team with the receipt/payment ID for admin reconciliation. The app does not use localStorage, browser success flags or customer-provided status values. Guest receipts omit customer contact details. Only authorized admins can see those details.

The customer form asks only for full name, email, mobile number and payment amount. Booking/Invoice ID and payment purpose inputs have been removed. The backend accepts omitted references and uses “Eternal India payment” as the default description, while preserving optional metadata on older transactions. This is an open-amount payment form with strict server-side decimal validation and configured business limits. Customers enter the amount agreed with the team.

## Durable state and reconciliation

`Backend/payments/{routes,controller,service,model,validation}.js` separate HTTP routing, validation, gateway access, persistence and administration. `connectDatabase` installs unique submission, receipt, order and payment indexes plus status/date indexes. `payments` contains customer name/email/phone, optional reference, purpose, integer paise amount, currency, gateway IDs, method, mode, status, timestamps, verification date, failure reason, cumulative refund amount, processed refund records, webhook event IDs and permanent transaction history. There are no payment deletion endpoints or TTL indexes. No card number, CVV, UPI PIN, raw gateway credentials or raw payment instrument data is stored.

State transitions cover `PENDING`, `CREATED`, `AUTHORIZED`, `PAID`, `FAILED`, `REFUNDED`. Failed attempts can retry the same Razorpay order. Only a captured matching payment can become `PAID`. Partial refunds keep status `PAID` and show `PARTIAL`; a full refund becomes `REFUNDED`. Paid/refunded states and cumulative refunded amounts never move backwards because of delayed events.

Order creation reserves a unique MongoDB transaction **before** contacting Razorpay. Concurrent submissions share the same record. Changed details or owner tokens cannot reuse a submission. If a request loses its response, retry the unchanged request: the server retrieves the gateway order by its unique receipt instead of creating a second order. A definitive gateway rejection can retry creation, while an ambiguous request without a discoverable order stays pending. Do not start a different payment to work around that state. An operator should search the receipt in Razorpay and the admin view before arranging another payment. There is deliberately no unsafe automatic retry of an uncertain external order creation.

Verification computes HMAC-SHA256 using the original database order ID and backend key secret, compares signatures in constant time, and fetches the payment through Razorpay's SDK. Order, amount and INR currency must match; `captured` must be true. A browser callback is never sufficient evidence of payment. Repeated callbacks do not duplicate status history or change the original verification timestamp.

The webhook route consumes raw bytes before `express.json()`. Unsigned/bad signatures are rejected before recording an event. `payment_webhook_events` permanently stores unique event IDs, payload hashes and processing state, without raw payloads containing instrument data. Reusing an event ID with a changed payload is rejected. Each payment update atomically stores its event ID, status, refund and history changes using a MongoDB revision compare-and-swap. A crash after updating the payment but before completing the event is safe to retry. Failed processing returns a non-success response so Razorpay can retry. Do not rate-limit webhook deliveries using browser IP rules.

Every supported webhook fetches the latest gateway payment, validates the stored amount/currency/order, and verifies refunds through the Refunds API. A webhook arriving before order creation finishes can locate the reserved payment by the gateway order's receipt. No webhook or frontend callback can downgrade a paid/refunded transaction. Status polling reads MongoDB, never a frontend claim. If the API or database is interrupted, the UI displays pending/uncertain status and offers status checks rather than a false success.

Admin totals apply to the current filters. “Total collected” is gross captured amount including later refunds; refunded and net collected amounts are shown separately. Pending includes `PENDING`, `CREATED`, `AUTHORIZED`. Date filters cover complete days in Asia/Kolkata. Search covers customer, email, phone, booking/invoice reference, receipt, order ID and payment ID. The admin view refreshes every 30 seconds and includes transaction details, failure reason, verification time, permanent history and processed refunds. Refunds are initiated in Razorpay; the application tracks them, without adding an unrequested refund action.

## Verification

```powershell
npm --prefix Backend test
npm --prefix frontend run verify:payments
npm --prefix frontend run verify
npm --prefix frontend run build
```

`Backend/test/payments.test.js` uses actual Express HTTP, MongoDB indexes/atomic updates and admin authentication with an isolated `eternal_india_test_*` database. Only the external Razorpay boundary is simulated. It covers invalid input/amount/currency/signatures, wrong ownership, duplicate/concurrent creation and verification, gateway interruption, raw webhook HMAC, duplicate/conflicting event IDs, webhook-before-callback/creation-response, authorization/capture/failure state ordering, retries, partial/full refunds and admin search/filter/totals/details. The test database is removed afterward. `frontend/scripts/verify-razorpay.mjs` exercises actual React components with simulated external checkout/API responses to cover validation, duplicate clicks, cancellation, retry, failure, unconfirmed callbacks, invalid signature, network interruption/recovery, admin details and cleanup. This is test-only simulation; there are no fake gateway or success paths in the running application.

The existing frontend suite also checks the preserved bank/QR behavior, public routes and the other workspaces. Production build verifies asset resolution and bundling. Automated tests do **not** establish that a real Razorpay Test Mode payment, dashboard capture setting, payment method or deployed webhook delivery works.

Before enabling Live Mode, perform these checks with the actual configured Razorpay Test Mode account and deployed endpoints:

1. Pay a test order successfully; confirm captured status in Razorpay, the customer confirmation and the MongoDB/admin receipt.
2. Complete a failed payment and cancel checkout; confirm neither produces a successful receipt and retry reuses the order.
3. Disconnect networking after creating/paying an order; reconnect and use the same request/status checks. Confirm only one order and one capture.
4. Close the frontend before confirmation; verify the signed webhook still updates MongoDB and admin history.
5. Redeliver a webhook from the dashboard; confirm one processed event and one state/history transition. Test capture before callback and refund after capture, including partial refunds.
6. Review incorrect amounts, invalid signatures, ownership failures, webhook retry after temporary API/database interruption and admin date/status filters.

No Razorpay credentials were present in the local environment at implementation time. Actual Test Mode payment and deployed webhook validation require those privately configured credentials and dashboard access. Switch to `RAZORPAY_MODE=live` and matching live keys/webhook secret only after the above real-account checks pass. Changing an optional Vercel Key ID requires a rebuild. Existing Test Mode records remain permanently stored; do not retry an old test order using live credentials.

Official references: [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook validation and event idempotency](https://razorpay.com/docs/webhooks/validate-test/), [fetch orders by receipt](https://razorpay.com/docs/api/orders/fetch-all/).

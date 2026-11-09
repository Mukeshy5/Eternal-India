# Eternal India

React/Vite travel website with a Node/Express API, MongoDB enquiries and an administrator inbox.

## Run locally

Start your local MongoDB service at `mongodb://localhost:27017`.

Install dependencies once, then start the website and API together from this project directory:

```powershell
npm --prefix Backend install
npm --prefix frontend install
npm run dev
```

- Website and enquiry form: `http://localhost:5173/request-quote`
- Admin sign-in: `http://localhost:5173/admin/login`
- Technical panel: `http://localhost:5173/technical/login`
- API health: `http://localhost:5000/api/health`

`npm run dev` also works inside `frontend`. The launcher starts the backend, waits for its health check and then opens Vite; this prevents form submissions from reaching a missing API. If a healthy Eternal India backend is already running, it is reused. Stopping the launcher stops only the services it started. For backend source watching, start `npm run dev` inside `Backend` first; the frontend launcher will reuse it.

Vite forwards `/api` to the backend address in `Backend/.env` (port 5000 by default). Both localhost and 127.0.0.1 work in development. After `npm run build`, the backend can also serve the built website and admin panel from `http://localhost:5000`. A static-only host cannot run this MongoDB backend.

## Configuration and admin account

`Backend/config/env.js` loads `Backend/.env`; `Backend/config/database.js` connects MongoDB and creates indexes. `.env` is ignored by Git. A local `.env` has been created with `MONGO_URI=mongodb://localhost:27017`, database `eternal_india`, admin email `admin@eternal-india.local`, a unique admin password and a random session secret. Open that file to read the password; it is not included in the frontend.

On first startup the server creates the admin account from `.env`, storing a salted scrypt password hash. Editing `.env` alone does not replace an existing account password. To change it, update `ADMIN_PASSWORD` (minimum 8 characters) and run `npm run admin:password` from `Backend`. This invalidates existing admin sessions. To configure a new checkout, copy `.env.example` to `.env` and replace both placeholder secrets.

Sessions are stored in MongoDB with HttpOnly cookies. Login attempts and submissions are rate limited. Enquiry listing and updates require server authentication. For deployment use HTTPS, set `NODE_ENV=production`, `MONGO_URI` to a reachable MongoDB deployment such as MongoDB Atlas, and `FRONTEND_ORIGIN` to the exact Vercel origin. Production sessions use secure cross-site cookies because the frontend and API are separate deployments. The production server binds to `0.0.0.0` by default so Render can reach it; local development still binds to loopback.

## Panel accounts and password recovery

The admin login has **Create account** and **Forgot password** options. Both public registration and administrator-created credentials require Gmail OTP verification before any account is inserted. Public account requests still need approval in **Panel accounts**; pending requests expire after seven days. Administrators can create active Admin or Technical accounts, edit their Gmail/panel/password, and delete accounts. Changing an email or editing an older unverified account requires fresh Gmail verification. The signed-in account and configured owners are protected against edits/deletion here. Technical-only accounts cannot manage accounts. Existing logins remain valid without forcing legacy accounts through new registration.

### Gmail OTP setup and real delivery testing

Set these values privately in the ignored `Backend/.env` file:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sender@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM=your-sender@gmail.com
COMPANY_NAME=Eternal India
OTP_TEST_EMAIL=your-test-inbox@gmail.com
```

Enable Google 2-Step Verification and generate a Google App Password; never use the normal Gmail password. `GMAIL_USER` / `GMAIL_APP_PASSWORD` are supported as alternatives to `SMTP_USER` / `SMTP_PASSWORD`. `OTP_HASH_SECRET` can be a dedicated random secret of at least 32 characters; otherwise the backend session secret is used. No email secrets belong in frontend/Vite variables. Official setup: [Google App Passwords](https://support.google.com/accounts/answer/185833) and [Nodemailer Gmail](https://nodemailer.com/guides/using-gmail).

The existing registration handler is shared by `POST /api/auth/register` and the legacy panel registration routes. `POST /api/auth/send-otp` sends a real Gmail message; `POST /api/auth/verify-otp` verifies the latest challenge in the same HttpOnly browser session. Account management uses the same endpoints with a separately authorised creation/edit purpose. There are no frontend verification tokens, localStorage flags, returned OTPs, dummy codes or delivery fallbacks.

Six-digit codes use cryptographic randomness and keyed SHA-256 hashing. MongoDB stores challenge hashes, attempt counters, expiry and verification status. Codes expire after five minutes, resend is locked for 60 seconds, and a challenge permits five attempts. Persistent per-Gmail and per-browser limits permit five sends per hour; IP rate limits also protect send/verify endpoints. Verified session proofs expire after ten minutes and are atomically consumed once. Used proofs are removed; TTL indexes remove expired challenges and rate-limit records. Gmail case/dot/tag/googlemail aliases share one canonical registration identity.

After configuring the actual sender and a Gmail inbox you own, run:

```powershell
npm --prefix Backend run verify:gmail
```

This interactive integration runner uses actual Gmail SMTP, actual received codes and an isolated real MongoDB test database. It covers delivery, five-minute expiry enforcement, the real resend delay, public registration/approval/login, managed creation, verified email editing and deletion. It sends four real emails and asks for their received codes. It cleans only its own test database afterward. Without sender credentials and `OTP_TEST_EMAIL`, it stops without sending or creating an account. Automated API/UI security checks use real HTTP and MongoDB to verify that missing delivery configuration never grants verification; these checks do not replace the real Gmail delivery test.

Both panels support email password recovery. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `Backend/.env` using your email provider's credentials. Reset links expire after 30 minutes, work once and revoke the account's existing sessions. The API reports that email is unavailable until SMTP is configured. Reset tokens are hashed in MongoDB and removed after use or during cleanup after expiry.

**Journey Voucher History** is available in both panels, with search, pagination, itinerary previews, printing/PDF and permanent deletion.

## Permanent deletion and database maintenance

Deleting staff permanently removes their profile, photo and attendance records. Individual attendance records can be deleted from the calendar details. Deleting an offer removes its `tour_promotions` document and any image no other offer uses. Removing or replacing an offer image also deletes the unused image. `offer_images` contains uploaded image bytes, content type, upload time and uploader identity; it does not contain login passwords.

**Submit attendance** disables after a successful save and displays a success message next to the button. Changing a saved status enables submission again. The saved state survives refresh and is separate for each date and page. Attendance calendars and reports have **Delete this week/month** actions for their selected dates and staff filters, including matching records on other pages. These actions require delete permission, remove MongoDB records permanently and immediately notify connected panels; date boundaries and staff scope are shown before confirmation.

Deleting a festival also deletes its schedules, related activity and unused banner. **Activity History** in Festival Management allows authorised settings managers to delete individual records or clear history. Activity uses compact summaries and expires after 30 days. Unattached image uploads expire after 24 hours; saved images have no upload expiry.

Startup cleanup removes records already marked deleted, orphan attendance, activity for deleted festivals, unused images older than 24 hours, and expired reset tokens. It preserves active/inactive staff, saved vouchers and referenced images. To inspect or run the same cleanup manually:

```powershell
npm --prefix Backend run db:clean
npm --prefix Backend run db:clean -- --apply
```

## Enquiries and recordings

The form has a direct **Submit enquiry** button plus WhatsApp/email options. Every option first validates and saves to MongoDB. A reference is displayed and the selected Hindi or English recording plays only after the save succeeds. Retries of the same unchanged submission reuse an idempotency key to prevent duplicates. The admin inbox supports search, filters, pagination and New / Contacted / Closed statuses.

Recordings are in `frontend/src/assets/Plan your trip page Voice/`. Only the language selector is displayed; recordings play in the background without a player, welcome heading or replay controls. Welcome playback is attempted on page mount. If the browser blocks automatic sound, playback retries on the first pointer or keyboard interaction. Audio stops when leaving the page, and one hidden audio element prevents overlapping recordings.

## Technical panel and tour offers

Open `/technical/login` with an authorised technical account. This panel includes enquiry search, filters, pagination, details, status changes, deletion, hotel inventory, journey vouchers and voucher history with print/PDF. Administrators create Technical Panel credentials from **Panel accounts**.

Choose **Tour amounts & offers** under Tools. All 35 entries are available: 4 tour packages, 17 places, 6 India/beyond journeys, 5 regions and 3 featured journeys. Select an entry, enter its INR package amount, optionally enable an offer, add its title and discounted amount, then choose either a mini image upload or a text badge. JPG, PNG, WebP and GIF files up to 2 MB are supported. Click **Save changes** to show the saved details on the website. Uploading an image alone does not publish it. A card preview shows the draft before saving, and public cards reserve space at the bottom for the amount and offer.

Saved details appear on matching cards and detail-page hero/gallery images. Public pages fetch updated offers on navigation, focus and every 30 seconds. Leave the amount blank to hide it, disable an offer to keep it for later, remove its mini image separately, or use **Remove amount & offer** to clear both. Discounted amounts must be lower than the original price, which is shown crossed out.

The `/api/technical` API shares authenticated admin handlers and MongoDB sessions. Prices and offers are stored in `tour_promotions`, and uploaded images in `offer_images`. `GET /api/promotions` supplies public display data without staff or guest details. All edits and uploads require authentication. `shared/travelCatalog.js` keeps the frontend and backend target lists aligned.

## Verification

The Technical Panel also includes **Special Days & Festival Management** with 36 reusable effects, festival drafts/publication, backend scheduling, isolated preview, master ON/OFF and activity history. The Staff Workspace has a monthly interactive calendar: active staff can be searched and selected, dates can be inspected, corrected or deleted, Present/Absent/Leave/Half Day records show distinct indicators, Sundays and configurable weekly holidays are separate, and summary cards show the selected employee's totals. Access uses existing accounts with technical permissions. See [the implementation and operations guide](docs/FESTIVAL_MANAGEMENT.md) for models, API endpoints, permissions, file inventory and verification details; the permanent deletion policy above supersedes its historical retention descriptions.

```powershell
cd Backend
npm test
cd ../frontend
npm run verify
npm run build
```

Backend integration tests create a unique `eternal_india_test_*` database on the configured MongoDB server, test actual API/authentication/enquiry behaviour and remove only that test database afterwards.

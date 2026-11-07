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

## Enquiries and recordings

The form has a direct **Submit enquiry** button plus WhatsApp/email options. Every option first validates and saves to MongoDB. A reference is displayed and the selected Hindi or English recording plays only after the save succeeds. Retries of the same unchanged submission reuse an idempotency key to prevent duplicates. The admin inbox supports search, filters, pagination and New / Contacted / Closed statuses.

Recordings are in `frontend/src/assets/Plan your trip page Voice/`. Only the language selector is displayed; recordings play in the background without a player, welcome heading or replay controls. Welcome playback is attempted on page mount. If the browser blocks automatic sound, playback retries on the first pointer or keyboard interaction. Audio stops when leaving the page, and one hidden audio element prevents overlapping recordings.

## Technical panel and tour offers

Open `/technical/login` with the existing administrator account. This panel includes all admin features: enquiry search, filters, pagination, details, status changes, deletion, hotel inventory, and journey vouchers with print/PDF. The admin workspace links to the technical panel.

Choose **Tour amounts & offers** under Tools. All 35 entries are available: 4 tour packages, 17 places, 6 India/beyond journeys, 5 regions and 3 featured journeys. Select an entry, enter its INR package amount, optionally enable an offer, add its title and discounted amount, then choose either a mini image upload or a text badge. JPG, PNG, WebP and GIF files up to 2 MB are supported. Click **Save changes** to show the saved details on the website. Uploading an image alone does not publish it. A card preview shows the draft before saving, and public cards reserve space at the bottom for the amount and offer.

Saved details appear on matching cards and detail-page hero/gallery images. Public pages fetch updated offers on navigation, focus and every 30 seconds. Leave the amount blank to hide it, disable an offer to keep it for later, remove its mini image separately, or use **Remove amount & offer** to clear both. Discounted amounts must be lower than the original price, which is shown crossed out.

The `/api/technical` API shares authenticated admin handlers and MongoDB sessions. Prices and offers are stored in `tour_promotions`, and uploaded images in `offer_images`. `GET /api/promotions` supplies public display data without staff or guest details. All edits and uploads require authentication. `shared/travelCatalog.js` keeps the frontend and backend target lists aligned.

## Verification

The Technical Panel also includes **Special Days & Festival Management** with 36 reusable effects, festival drafts/publication, backend scheduling, isolated preview, master ON/OFF and append-only history. Staff Attendance reports include a monthly all-staff calendar: Sundays are marked red, Present is green, Absent is pink, and Leave is shown as `CROS`. Access uses existing accounts with technical permissions. See [the implementation and operations guide](docs/FESTIVAL_MANAGEMENT.md) for models, API endpoints, permissions, file inventory and verification details.

```powershell
cd Backend
npm test
cd ../frontend
npm run verify
npm run build
```

Backend integration tests create a unique `eternal_india_test_*` database on the configured MongoDB server, test actual API/authentication/enquiry behaviour and remove only that test database afterwards.

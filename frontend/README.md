# Eternal India

Responsive React and Vite travel website using Eternal India's supplied company and office information.

## Development

```sh
npm install
npm run dev
```

## Pages

- `/` — Home and travel inspiration
- `/about` — Vision, network, creativity, bookings, emergency assistance, commitments, and destinations
- `/tours` — Journey themes based on the supplied destinations
- `/contact` — All four office addresses, email and phone links, map searches, and direct support
- `/request-quote` — Trip enquiry form; destination can be supplied with `?destination=Varanasi`
- `/online-payment` — Bank details, QR payment with a 10-minute display timer, cash payment and New Delhi payment support
- `/tour-packages` — Package listing, with individual Golden Triangle, Rajasthan Tour, Varanasi Tour and Manali Volvo Package pages
- `/destinations-in-india` — All 17 requested state destinations, grouped under five regional collections
- `/destinations-in-india/regions/:region` — Regional listing pages; each state also has its own `/destinations-in-india/:state` page
- `/india` — Six India & beyond journeys: Uttarakhand, Jaipur, Kashmir, Andaman, Nepal–Kathmandu Tour and Sri Lanka 5D/4N
- `/india/:journey` — Individual pages for all six journeys, with photos, suggested places/itinerary, related journeys and a prefilled enquiry

The enquiry form validates required fields and saves every submission to the MongoDB backend in `../Backend` before playing the chosen Hindi/English confirmation. The main Submit enquiry button sends directly to the team; WhatsApp/email options also prepare a copy in the visitor's chosen app. There is no payment processing. See the root README for backend startup and administrator credentials.

`npm run dev` starts the MongoDB backend and waits for readiness before starting Vite, or reuses an already healthy backend. Vite proxies `/api` to its configured address. Install dependencies in `../Backend` first and keep MongoDB running. `npm run dev:frontend` is available when managing the backend yourself. `/admin/login` provides a session-protected administrator inbox at `/admin`, with enquiry details, search, status filtering, pagination and status updates. An authentication check runs on the server for every protected API request.

`src/Common/QuoteVoice.jsx` uses the three supplied MP3 recordings from `src/assets/Plan your trip page Voice`. Audio stays in the background with no visible player, headings, welcome status or replay button. Welcome playback is attempted on entry; blocked autoplay retries on a pointer/keyboard interaction. Submission audio plays only after a successful save. The language selector controls Hindi/English confirmation audio, and navigating away stops playback. `scripts/verify-enquiry.mjs` and `scripts/verify-admin.mjs` cover these interactions.

## Checks and build

```sh
npm run verify
npm run build
npm run preview
```

Verification renders the pages and checks internal routes, image assets, office contacts, enquiry prefill, validation attributes, and message encoding. Browser visual checks require an available browser automation connection.

Travel navigation and page content share `src/Common/travelCatalog.js`. Tour Package, India and Destinations in India each open on mouse hover and click/tap. Arrow Down focuses the first dropdown link; Escape closes the dropdown and restores trigger focus. Outside click and route selection close the menus. `scripts/verify-navigation.mjs` verifies these interactions and mobile selection. Region groupings follow the supplied brief, including Sikkim and Nagaland in East India. Package outlines are starting points for an enquiry; prices and inclusions are agreed with the team.

All travel pages and cards use supplied photos from `src/assets`, served as optimized WebP files in `public/images/travel`. The 41 source photos total 106.6 MiB; the two responsive versions (640px and 1280px) total 11.0 MiB. Hero images have priority loading; cards and galleries are lazy loaded. To regenerate with FFmpeg installed, run `node scripts/optimize-travel-images.mjs`. Generated paths are in `src/Common/travelImages.js`. Source photos for Goa, Maharashtra and Gujarat were not supplied; those pages clearly label the actual location of their inspiration photos.

Deploy `dist/` to a static host with SPA fallback to `index.html`. A `_redirects` file is included for compatible hosts, and `vercel.json` configures the same fallback on Vercel. When the API is deployed separately, set the Vercel build environment variable `VITE_API_BASE_URL` to the public backend origin (for example `https://eternal-india-api.onrender.com`). If Socket.IO is hosted at a different origin, set `VITE_SOCKET_URL`; otherwise it uses the API origin or the configured production Render backend. The authenticated socket connects directly to that backend because Vercel's HTTP rewrite does not proxy WebSocket upgrades.

Shared office and destination information is in `src/Common/SiteUI.jsx`; support links and enquiry preparation are in `src/Common/enquiries.js`. Styles are in `src/index.css`.

The navbar's `/online-payment` page now includes Razorpay Standard Checkout in a white, navy and gold layout. `src/Common/RazorpayCheckout.jsx` asks for customer name, email, mobile number and amount, and provides server-created orders, verification, cancellation, retry and status checks; `razorpay.js` loads the official checkout only when requested. Successful payment is displayed only after backend confirmation. Authorized admins manage transactions at `/admin/payments`. See [the payment deployment and testing guide](../docs/RAZORPAY_PAYMENTS.md) and run `npm run verify:payments` for the focused checkout checks.

Existing bank/QR details and timer helpers remain in `src/Common/payments.js`; legacy page styles are in `src/Common/PaymentPage.css`, with navy overrides in `RazorpayCheckout.css`. Original payment images and the animated GIF remain in `src/assets/paymentpng/`. Generate QR reveals the supplied static image for 10 minutes, including background-tab expiry. This timer controls image visibility only; bank/QR/cash payments remain separate arrangements with the team and are not automatically verified by the Razorpay integration. No payment controls were added to other public pages.

`src/Common/FloatingWhatsApp.jsx` adds a fixed WhatsApp shortcut on every page. It opens `https://wa.me/919319140846` directly in a new tab or WhatsApp app, with a contact popup on hover or keyboard focus. Its styles account for mobile safe areas. Shared typography uses fluid `rem`/viewport sizes in `src/index.css`, with readable payment text in `src/Common/PaymentPage.css`.

Travel photos are served locally in `public/images`, sourced from Unsplash: Varanasi by Srivatsan Balaji (`photo-1561359313-0639aad49ca6`), Jaipur (`photo-1599661046827-dacff0c0f09a`), and Kerala (`photo-1602216056096-3b40cc0c9944`). The logo is the existing project asset.

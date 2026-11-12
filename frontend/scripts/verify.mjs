import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { buildEnquiryUrl } from "../src/Common/enquiries.js";
import { bankDetails, QR_DISPLAY_MS, qrSecondsRemaining, formatQrTime } from "../src/Common/payments.js";
import { verifyPaymentInteractions } from "./verify-payment.mjs";
import { verifyRazorpayInteractions } from "./verify-razorpay.mjs";
import { verifyNavigation } from "./verify-navigation.mjs";
import { verifyEnquiryInteractions } from "./verify-enquiry.mjs";
import { verifyAdminInteractions } from "./verify-admin.mjs";
import { verifyPromotions } from "./verify-promotions.mjs";
import { verifyVoucher } from "./verify-voucher.mjs";
import { verifyFestivals } from "./verify-festivals.mjs";
import { verifyStaff } from "./verify-staff.mjs";
import { verifyCalendar } from "./verify-calendar.mjs";
import { verifyOtpGates } from "./verify-otp.mjs";
import { destinations, regions, tourPackages, indiaJourneys, destinationPath, regionPath, packagePath, indiaPath, travelPageTitles } from "../src/Common/travelCatalog.js";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const knownRoutes = new Set([
  "/",
  "/about",
  "/contact",
  "/tours",
  "/buddhist-tours-in-india",
  "/request-quote",
  "/online-payment",
  "/privacy-policy",
  "/terms-and-conditions",
  "/admin",
  "/admin/login",
  "/technical",
  "/technical/login",
  ...Object.keys(travelPageTitles),
]);
try {
  const { default: App } = await server.ssrLoadModule("/src/App.jsx");
  const pages = new Map();
  for (const route of [...knownRoutes, "/missing-page", "/destinations-in-india/not-a-state", "/tour-packages/not-a-package", "/india/not-a-journey"]) {
    const html = renderToString(
      React.createElement(
        StaticRouter,
        { location: route },
        React.createElement(App),
      ),
    );
    pages.set(route, html);
    assert.equal(
      (html.match(/<h1[ >]/g) || []).length,
      1,
      `${route}: one main heading`,
    );
    assert.ok(
      html.includes('id="main-content"'),
      `${route}: skip navigation target`,
    );
    assert.ok(
      !html.includes(">Navbar<") && !html.includes(">Contect<"),
      `${route}: no placeholders`,
    );
    for (const [, href] of html.matchAll(/<a[^>]*href="(\/[^"#]*)"/g)) {
      assert.ok(
        knownRoutes.has(
          new URL(href.replaceAll("&amp;", "&"), "https://example.com")
            .pathname,
        ),
        `${route}: broken internal route ${href}`,
      );
    }
    for (const [, src] of html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
      assert.ok(
        existsSync(resolve(src.startsWith("/src/") ? "." : "public", decodeURIComponent(src.slice(1)).split("?")[0])),
        `${route}: missing image ${src}`,
      );
    }
    for (const [, srcSet] of html.matchAll(/<img[^>]*srcSet="([^"]+)"/gi)) {
      for (const candidate of srcSet.split(",")) {
        const [src, width] = candidate.trim().split(/\s+/);
        assert.ok(["640w", "1280w"].includes(width), `${route}: responsive image width`);
        const asset = resolve("public", src.slice(1));
        assert.ok(existsSync(asset), `${route}: missing responsive image ${src}`);
        assert.ok(statSync(asset).size < 650_000, `${route}: image exceeds transfer budget ${src}`);
      }
    }
    console.log(`PASS ${route}: renders with working route and asset targets`);
  }
  const contact = pages.get("/contact");
  assert.equal(tourPackages.length, 4);
  assert.equal(destinations.length, 17);
  assert.equal(regions.length, 5);
  assert.equal(indiaJourneys.length, 6);
  for (const [items, path] of [[tourPackages, packagePath], [destinations, destinationPath], [indiaJourneys, indiaPath]]) {
    for (const item of items) {
      const html = pages.get(path(item));
      assert.ok(html.includes(item.title), `${item.title}: page heading`);
      assert.ok(html.includes(`/request-quote?destination=${encodeURIComponent(item.title)}`), `${item.title}: enquiry prefill`);
      for (const place of item.places) assert.ok(html.includes(place.replaceAll("&", "&amp;").replaceAll("'", "&#x27;")), `${item.title}: destination content`);
      assert.ok(item.image && html.includes(`src="${item.image}"`), `${item.title}: supplied destination photo`);
      assert.ok(html.includes('loading="lazy"') && html.includes('fetchPriority="high"'), `${item.title}: lazy secondary images and priority hero`);
      if (item.duration) assert.ok(html.includes(item.duration), `${item.title}: requested trip duration`);
    }
  }
  const goldenTriangle = pages.get(packagePath(tourPackages.find((item) => item.slug === "golden-triangle")));
  for (const value of ["Delhi", "Agra", "Jaipur", "Chiang Rai Province", "Sop Ruak", "Day 1", "Arrive in Delhi", "Day 2", "Delhi – Agra", "Day 3", "Agra – Jaipur", "Day 4", "Jaipur – Delhi – Departure", "Fatehpur Sikri", "Amber Fort"]) {
    assert.ok(goldenTriangle.includes(value), `Golden Triangle page: missing ${value}`);
  }
  assert.ok(goldenTriangle.includes("<summary>Itinerary"), "Golden Triangle itinerary is available as an expandable option");
  assert.ok(goldenTriangle.includes("Winding road illustration with numbered markers for each itinerary day"), "Tour itinerary includes the day-wise map artwork");
  assert.ok(goldenTriangle.includes("Day 4</span><h3>Jaipur – Delhi – Departure"), "Day map markers correspond to the numbered itinerary cards");
  const manaliPackage = pages.get(packagePath(tourPackages.find((item) => item.slug === "manali-volvo-package")));
  for (const value of ["Manali is a resort and tourist town", "Manali in the Beas River Valley", "Your 6-day journey.", "Delhi – Manali", "Hadimba Devi Temple", "Solang Valley", "Manikaran", "Arrival in Delhi – Tour ends"]) {
    assert.ok(manaliPackage.includes(value), `Manali Volvo package page: missing ${value}`);
  }
  assert.ok(manaliPackage.includes("<summary>Itinerary"), "Manali itinerary is available as an expandable option");
  for (const region of regions) {
    const html = pages.get(regionPath(region));
    for (const item of destinations.filter((entry) => entry.region === region.slug)) assert.ok(html.includes(`href="${destinationPath(item)}"`));
  }
  const buddhistTours = pages.get("/buddhist-tours-in-india");
  for (const value of ["Siddhartha Gautama's early life", "The four sights & the search for a way through suffering", "Awakening beneath the Bodhi tree", "The first teaching & the beginning of the Sangha", "Patronage & Buddhism's wider reach", "Parinirvana", "Bodh Gaya", "Kushinagar"]) {
    const escapedValue = value.replaceAll("&", "&amp;").replaceAll("'", "&#x27;");
    assert.ok(buddhistTours.includes(escapedValue), `Buddhist tours: missing ${value}`);
  }
  console.log("PASS 4 package pages, 17 state pages, 6 India journeys, 5 regions, responsive image targets/budgets, enquiry links, and invalid routes");
  const payment = pages.get("/online-payment");
  for (const { value } of bankDetails) assert.ok(payment.includes(value), `payment: missing ${value}`);
  for (const value of ["69/70 Block N-2 Gurudwara Road", "110059", 'href="tel:+911141715155"', 'href="tel:+919319140846"', "Generate QR", "local bank charges", "invoice amount"]) assert.ok(payment.includes(value), `payment: missing ${value}`);
  assert.ok(payment.includes('aria-controls="payment-qr-display" aria-expanded="false"'), "QR starts hidden");
  assert.ok(!payment.includes('class="actual-payment-qr"'), "payment QR is not rendered before requesting it");
  assert.ok(!pages.get("/").includes("Ready for your next chapter?") && !pages.get("/").includes("payment-banner"), "removed payment promotion is absent from home");
  assert.ok(pages.get("/privacy-policy").includes("Our Privacy Policy"), "privacy policy route renders");
  for (const value of ["Payment policy", "NEFT/ RTGS", "Remarks", "Rohtang pass", "Only the commitment’s/ communication exchanged through mail will be applicable.", "Cancellation policy", "There will be no refunds for no-shows."]) assert.ok(pages.get("/privacy-policy").includes(value), `privacy policy includes ${value}`);
  for (const value of ["Terms &amp; Conditions", "Using this website", "Reservations", "Current account number: 921020029366590", "Children policy", "Hotels policy", "Refunds", "Air ticket cancellation and layover policy", "Railway ticket cancellation", "Complaints", "Other conditions", "Within one week of departure: 100%."]) assert.ok(pages.get("/terms-and-conditions").toLowerCase().includes(value.toLowerCase()), `terms page includes ${value}`);
  for (const [route, html] of pages) {
    const floatingChat = html.match(/<a\b[^>]*class="whatsapp-float"[^>]*>/)?.[0];
    const lineChat = html.match(/<a\b[^>]*class="line-float"[^>]*>/)?.[0];
    if (!/^\/(admin|technical)(?:\/|$)/.test(route)) {
      assert.ok(floatingChat?.includes('href="https://wa.me/919319140846"') && floatingChat.includes('target="_blank"'), `${route}: direct WhatsApp shortcut`);
      assert.ok(lineChat?.includes('href="https://line.me/ti/p/V2uvq8z3q0"') && lineChat.includes('target="_blank"'), `${route}: direct LINE shortcut`);
    }
  }
  assert.ok(existsSync(resolve("src/assets/paymentpng/payment-QR.png")), "requested QR image exists");
  const start = 1_000_000;
  const deadline = start + QR_DISPLAY_MS;
  assert.equal(QR_DISPLAY_MS, 600_000);
  assert.equal(qrSecondsRemaining(deadline, start), 600);
  assert.equal(qrSecondsRemaining(deadline, deadline - 1001), 2);
  assert.equal(qrSecondsRemaining(deadline, deadline - 1), 1);
  assert.equal(qrSecondsRemaining(deadline, deadline), 0);
  assert.equal(qrSecondsRemaining(deadline, deadline + 300_000), 0, "expired after background-tab delays");
  assert.equal(formatQrTime(600), "10:00");
  assert.equal(formatQrTime(59), "00:59");
  assert.equal(formatQrTime(0), "00:00");
  console.log("PASS payment details, contact links, floating LINE and WhatsApp shortcuts, home banner removal, and QR expiry boundaries");
  for (const email of [
    "varanasi@eternal-india.com",
    "bodhgaya@eternal-india.com",
    "ayodhya@eternal-india.com",
    "operations@eternal-india.com",
    "info@eternal-india.com",
    "eternalindia5@gmail.com",
  ]) {
    assert.ok(
      contact.includes(`href="mailto:${email}"`),
      `contact: missing email link ${email}`,
    );
  }
  for (const postcode of ["221002", "824231", "224001", "802103"])
    assert.ok(contact.includes(postcode));
  assert.equal((contact.match(/class="office-card"/g) || []).length, 4);
  assert.equal((contact.match(/href="tel:\+917408469374"/g) || []).length, 2);
  assert.ok(contact.includes('href="https://wa.me/919319140846"'));
  const { default: Quote } = await server.ssrLoadModule(
    "/src/Pages/RequestQuote.jsx",
  );
  const quote = renderToString(
    React.createElement(
      StaticRouter,
      { location: "/request-quote?destination=Nepal%20%26%20Bhutan" },
      React.createElement(Quote),
    ),
  );
  assert.ok(
    quote.includes('value="Nepal &amp; Bhutan"'),
    "destination is passed to enquiry form",
  );
  assert.ok(
    quote.includes('type="email"') &&
      quote.includes('min="1"') &&
      quote.includes('type="date" min="'),
    "browser validation constraints",
  );
  const fields = {
    name: "  Anu & Family  ",
    email: "anu+travel@example.com",
    destination: "Nepal & Bhutan",
    travellers: "3",
    message: "Temples & nature\nA quiet stay, please.",
  };
  const whatsapp = new URL(buildEnquiryUrl(fields));
  assert.equal(
    whatsapp.origin + whatsapp.pathname,
    "https://wa.me/919319140846",
  );
  const message = whatsapp.searchParams.get("text");
  assert.ok(message.includes("Name: Anu & Family\n"));
  assert.ok(
    message.includes("anu+travel@example.com") &&
      message.includes(fields.message),
  );
  assert.ok(
    message.includes("Flexible / not decided") &&
      message.includes("Not provided"),
  );
  const email = new URL(buildEnquiryUrl(fields, "email"));
  assert.equal(email.protocol, "mailto:");
  assert.equal(email.pathname, "info@eternal-india.com");
  assert.equal(email.searchParams.get("body"), message);
  console.log(
    "PASS contact information, destination prefill, form constraints, and WhatsApp/email message encoding",
  );
  await verifyPaymentInteractions(server);
  await verifyRazorpayInteractions(server);
  await verifyNavigation(server);
  await verifyEnquiryInteractions(server);
  await verifyAdminInteractions(server);
  await verifyAdminInteractions(server, true);
  await verifyOtpGates(server);
  await verifyPromotions(server);
  await verifyVoucher(server);
  await verifyFestivals(server);
  await verifyStaff(server);
  await verifyCalendar(server);
} finally {
  await server.close();
}

import { useEffect, useLayoutEffect } from "react";
import { Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import Navbar from "./Comopents/Navbar";
import Footer from "./Comopents/Footer";
import Home from "./Comopents/Home";
import Contact from "./Pages/Contect";
import AboutUs from "./Pages/AboutUs";
import Journeys from "./Pages/Journeys";
import RequestQuote from "./Pages/RequestQuote";
import OnlinePayment from "./Common/OnlinePayment";
import FloatingWhatsApp from "./Common/FloatingWhatsApp";
import TourPackage from "./Comopents/TourPackage";
import DestinationsInIndia from "./Comopents/DestinationsInIndia";
import India from "./Comopents/India";
import Admin from "./Pages/Admin";
import TravelDetail from "./Pages/TravelDetail";
import { PromotionsProvider } from "./Common/Promotions";
import PublicDecorations from "./Common/festivals/PublicDecorations";
import { panelSection, panelSections } from "./Common/panel/panelNavigation";
import { destinations, regions, tourPackages, indiaJourneys, destinationPath, regionPath, packagePath, indiaPath, travelPageTitles } from "./Common/travelCatalog";

const titles = {
  ...travelPageTitles,
  "/": "Thoughtfully planned journeys",
  "/about": "About us",
  "/contact": "Contact us",
  "/tours": "Our journeys",
  "/request-quote": "Plan your trip",
  "/online-payment": "Online payment",
  "/admin": "Admin enquiries",
  "/admin/login": "Admin login",
  "/technical": "Technical panel",
  "/technical/login": "Technical login",
  "/admin/register": "Create admin account",
  "/admin/forgot-password": "Forgot password",
  "/admin/reset-password": "Reset password",
  "/technical/forgot-password": "Forgot password",
  "/technical/reset-password": "Reset password",
};
export default function App() {
  const { pathname, hash, search, key } = useLocation();
  const isAdmin = /^\/(admin|technical)(?:\/|$)/.test(pathname);
  useEffect(() => {
    const base = pathname.startsWith("/technical") ? "/technical" : "/admin";
    document.title = `${titles[pathname] || (isAdmin && panelSections[panelSection(pathname, base)]?.title) || "Page not found"} | Eternal India`;
  }, [pathname, isAdmin]);
  useLayoutEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [pathname, search, hash, key]);
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    const scrollToTopBeforeNavigation = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.hash) return;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    document.addEventListener("click", scrollToTopBeforeNavigation, true);
    return () => document.removeEventListener("click", scrollToTopBeforeNavigation, true);
  }, []);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!isAdmin && <Navbar />}
      <main id="main-content" tabIndex={-1}>
        <PromotionsProvider enabled={!isAdmin}><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/tours" element={<Journeys />} />
          <Route path="/products" element={<Navigate to="/tours" replace />} />
          <Route path="/request-quote" element={<RequestQuote />} />
          <Route path="/admin/*" element={<Admin key="admin" />} />
          <Route path="/technical/*" element={<Admin key="technical" technical />} />
          <Route path="/online-payment" element={<OnlinePayment />} />
          <Route path="/tour-packages" element={<TourPackage />} />
          <Route path="/tour-package" element={<Navigate to="/tour-packages" replace />} />
          <Route path="/india" element={<India />} />
          <Route path="/destinations-in-india" element={<DestinationsInIndia />} />
          {tourPackages.map((item) => <Route key={packagePath(item)} path={packagePath(item)} element={<TravelDetail item={item} type="package" />} />)}
          {regions.map((region) => <Route key={regionPath(region)} path={regionPath(region)} element={<DestinationsInIndia region={region} />} />)}
          {destinations.map((item) => <Route key={destinationPath(item)} path={destinationPath(item)} element={<TravelDetail item={item} />} />)}
          {indiaJourneys.map((item) => <Route key={indiaPath(item)} path={indiaPath(item)} element={<TravelDetail item={item} type="india" />} />)}
          <Route
            path="*"
            element={
              <section className="section container not-found">
                <p className="eyebrow">A little off the beaten path</p>
                <h1>Let's find your way back.</h1>
                <p>
                  This page couldn't be found. Your next journey is still
                  waiting.
                </p>
                <Link className="button" to="/">
                  Back to home
                </Link>
              </section>
            }
          />
        </Routes></PromotionsProvider>
      </main>
      {!isAdmin && <><Footer /><FloatingWhatsApp /></>}
      <PublicDecorations enabled={!isAdmin} />
    </>
  );
}

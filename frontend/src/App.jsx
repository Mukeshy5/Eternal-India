import { useEffect } from "react";
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
};
export default function App() {
  const { pathname, hash } = useLocation();
  const isAdmin = /^\/admin(?:\/|$)/.test(pathname);
  useEffect(() => {
    document.title = `${titles[pathname] || "Page not found"} | Eternal India`;
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else {
      window.scrollTo(0, 0);
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!isAdmin && <Navbar />}
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/tours" element={<Journeys />} />
          <Route path="/products" element={<Navigate to="/tours" replace />} />
          <Route path="/request-quote" element={<RequestQuote />} />
          <Route path="/admin/*" element={<Admin />} />
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
        </Routes>
      </main>
      {!isAdmin && <><Footer /><FloatingWhatsApp /></>}
    </>
  );
}

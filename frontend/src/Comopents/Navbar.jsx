import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../Common/SiteUI";
import { destinations, regions, tourPackages, indiaJourneys, destinationPath, regionPath, packagePath, indiaPath } from "../Common/travelCatalog";
import "./Navbar.css";
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const pinnedMenu = useRef(null);
  const header = useRef(null);
  const triggers = useRef({});
  const { pathname } = useLocation();
  const close = useCallback(() => {
    setOpen(false);
    setActiveMenu(null);
    pinnedMenu.current = null;
  }, []);

  useEffect(() => { close(); }, [pathname, close]);
  useEffect(() => {
    const outside = (event) => { if (!header.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [close]);

  function toggleMenu(id) {
    const shouldClose = pinnedMenu.current === id && activeMenu === id;
    pinnedMenu.current = shouldClose ? null : id;
    setActiveMenu(shouldClose ? null : id);
  }
  function interaction(id) {
    return {
      onPointerEnter: (event) => {
        if (event.pointerType !== "mouse") return;
        if (activeMenu !== id) pinnedMenu.current = null;
        setActiveMenu(id);
      },
      onPointerLeave: (event) => {
        if (event.pointerType !== "mouse" || pinnedMenu.current === id || event.currentTarget.contains(document.activeElement)) return;
        setActiveMenu((current) => current === id ? null : current);
      },
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          pinnedMenu.current = null;
          setActiveMenu((current) => current === id ? null : current);
        }
      },
      onKeyDown: (event) => {
        if (event.key !== "ArrowDown" || event.target !== triggers.current[id]) return;
        event.preventDefault();
        const group = event.currentTarget;
        pinnedMenu.current = id;
        setActiveMenu(id);
        window.requestAnimationFrame(() => group.querySelector(".nav-panel a")?.focus());
      },
    };
  }
  function handleKeys(event) {
    if (event.key !== "Escape") return;
    if (activeMenu) {
      const trigger = triggers.current[activeMenu];
      setActiveMenu(null);
      pinnedMenu.current = null;
      trigger?.focus();
    } else {
      close();
      header.current?.querySelector(".menu-button")?.focus();
    }
    event.preventDefault();
  }

  const chevron = <svg className="nav-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <span>India, Nepal & Bhutan. A journey to remember.</span>
          <a href="tel:+919319140846">
            <span className="availability-dot" />
            Here for you, 24/7 <span className="topbar-divider">|</span> +91
            93191 40846
          </a>
        </div>
      </div>
      <header className="site-header" ref={header} onKeyDown={handleKeys}>
        <div className="container nav-inner">
          <Link
            to="/"
            className="brand"
            onClick={close}
            aria-label="Eternal India home"
          >
            <img
              src="/logo.webp"
              alt="Eternal India — Mystic Journeys"
              width="240"
              height="76"
            />
          </Link>
          <button
            className="menu-button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => { if (open) close(); else setOpen(true); }}
          >
            <Icon name={open ? "close" : "menu"} size={25} />
          </button>
          <nav
            id="main-navigation"
            aria-label="Main navigation"
            className={open ? "navigation navigation-open" : "navigation"}
          >
            <NavLink to="/" end onClick={close}>
              Home
            </NavLink>
            <NavLink to="/about" onClick={close}>
              About us
            </NavLink>
            <div className="nav-group nav-group-packages" {...interaction("packages")}>
              <button className={`nav-trigger${pathname.startsWith("/tour-packages") ? " nav-trigger-active" : ""}`} type="button" ref={(element) => { triggers.current.packages = element; }} aria-expanded={activeMenu === "packages"} aria-controls="package-navigation" onClick={() => toggleMenu("packages")}>
                Tour package{chevron}
              </button>
              <div id="package-navigation" className="nav-panel package-nav-panel" hidden={activeMenu !== "packages"}>
                <span className="small-label">Find your next journey</span>
                <ul>{tourPackages.map((item) => <li key={item.slug}><NavLink to={packagePath(item)} onClick={close}>{item.title}<Icon name="diagonal" size={15} /></NavLink></li>)}</ul>
                <Link className="nav-panel-all" to="/tour-packages" onClick={close}>Explore all tour packages<Icon size={15} /></Link>
              </div>
            </div>
            <div className="nav-group nav-group-india" {...interaction("india")}>
              <button className={`nav-trigger${pathname.startsWith("/india") ? " nav-trigger-active" : ""}`} type="button" ref={(element) => { triggers.current.india = element; }} aria-expanded={activeMenu === "india"} aria-controls="india-navigation" onClick={() => toggleMenu("india")}>
                India{chevron}
              </button>
              <div id="india-navigation" className="nav-panel india-nav-panel" hidden={activeMenu !== "india"}>
                <span className="small-label">India & a little beyond</span>
                <ul>{indiaJourneys.map((item) => <li key={item.slug}><NavLink to={indiaPath(item)} onClick={close}>{item.menuTitle || item.title}<Icon name="diagonal" size={15} /></NavLink></li>)}</ul>
                <Link className="nav-panel-all" to="/india" onClick={close}>Explore all six journeys<Icon size={15} /></Link>
              </div>
            </div>
            <div className="nav-group nav-group-destinations" {...interaction("destinations")}>
              <button className={`nav-trigger${pathname.startsWith("/destinations-in-india") ? " nav-trigger-active" : ""}`} type="button" ref={(element) => { triggers.current.destinations = element; }} aria-expanded={activeMenu === "destinations"} aria-controls="destination-navigation" onClick={() => toggleMenu("destinations")}>
                Destinations in India{chevron}
              </button>
              <div id="destination-navigation" className="nav-panel destination-nav-panel" hidden={activeMenu !== "destinations"}>
                <div className="destination-menu-intro"><span className="small-label">One country. So many possibilities.</span><Link to="/destinations-in-india" onClick={close}>Explore all destinations<Icon size={15} /></Link></div>
                <div className="destination-menu-grid">
                  {regions.map((region) => <section key={region.slug}>
                    <h2><Link to={regionPath(region)} onClick={close}>{region.title}<Icon name="diagonal" size={13} /></Link></h2>
                    <ul>{destinations.filter((item) => item.region === region.slug).map((item) => <li key={item.slug}><NavLink to={destinationPath(item)} onClick={close}>{item.title}</NavLink></li>)}</ul>
                  </section>)}
                </div>
              </div>
            </div>
            <NavLink to="/buddhist-tours-in-india" onClick={close}>
              Buddhist Tours
            </NavLink>
            <NavLink to="/contact" onClick={close}>
              Contact us
            </NavLink>
            <NavLink to="/online-payment" onClick={close}>
              Online payment
            </NavLink>
            <Link
              to="/request-quote"
              className="button button-small"
              onClick={close}
            >
              Plan your trip <Icon size={17} />
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}

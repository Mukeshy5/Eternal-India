export const panelSections = {
  enquiries: { label: "All enquiries", title: "Enquiries", group: "Workspace", icon: "inbox" },
  staff: { label: "Staff Management", title: "Staff Management", group: "People", icon: "people", permission: "view" },
  "staff-attendance": { label: "Staff Attendance", title: "Attendance Calendar", group: "People", icon: "calendar", permission: "view" },
  "staff-cards": { label: "Download ID Card", title: "Employee ID Cards", group: "People", icon: "archive", permission: "export" },
  "staff-reports": { label: "Attendance Reports", title: "Attendance Reports", group: "People", icon: "clock", permission: "view" },
  hotels: { label: "Add hotel", title: "Hotel Inventory", group: "Operations", icon: "pin" },
  vouchers: { label: "Journey Voucher", title: "Journey Vouchers", group: "Operations", icon: "calendar" },
  "voucher-history": { label: "Journey Voucher History", title: "Journey Voucher History", group: "Operations", icon: "archive" },
  accounts: { label: "Panel accounts", title: "Panel Accounts", group: "Administration", icon: "people", adminOnly: true },
  security: { label: "Profile & security", title: "Profile & Security", group: "Account", icon: "people", technical: true },
  promotions: { label: "Tour amounts & offers", title: "Tour Pricing & Offers", group: "Website", icon: "spark", technical: true },
  festivals: { label: "Special Days & Festival Management", title: "Festival Management", group: "Website", icon: "spark", technical: true },
};
export function panelSection(pathname, base) {
  const path = pathname.replace(/\/+$/, "");
  if (path === base) return "enquiries";
  const key = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : "";
  return ["login", "register", "forgot-password", "reset-password"].includes(key) || Object.hasOwn(panelSections, key) ? key : "not-found";
}
export const sectionPath = (base, key) => key === "enquiries" ? base : `${base}/${key}`;
export function safePanelDestination(path, base) {
  if (typeof path !== "string" || !path.startsWith(`${base}/`) && path !== base && !path.startsWith(`${base}?`)) return base;
  const section = panelSection(path.split(/[?#]/)[0], base);
  return section !== "not-found" && !["login", "register", "forgot-password", "reset-password"].includes(section) ? path : base;
}

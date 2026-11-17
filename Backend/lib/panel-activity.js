export function panelActivity({ method, path, body }) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  if (/^\/(?:notifications(?:\/|$)|socket-ticket|enquiry-notification-settings|accounts(?:\/|$)|register(?:\/|$)|login(?:\/|$)|logout(?:\/|$))/.test(path)) return null;
  // Quotes, number reservations and PDF previews are preparation, not saved
  // business changes. Editors may request them repeatedly while typing.
  if (/^\/(?:vouchers\/(?:quote|invoice)|letters\/preview)\/?$/.test(path)) return null;
  if (/^\/data-control\/records\/[^/]+\/(?:export|preview)\/?$/.test(path)) return null;
  const label = path.includes("staff-attendance") || path.includes("staff-calendar") ? "staff attendance"
    : path.includes("/staff-accounts/") && path.includes("/invoices/") ? "access to an invoice"
      : path.includes("/staff-accounts") ? "Staff Login accounts"
        : path.includes("/staff") ? "staff records"
      : path.includes("/enquiries") ? "an enquiry"
        : path.includes("/invoices") ? "an invoice"
          : path.includes("festival") || path.includes("decoration") ? "festival settings"
            : path.startsWith("/data-control") ? "Data Control operation"
            : path.includes("promotion") || path.includes("offer-image") ? "tour pricing or offers"
              : path.includes("/letters") ? "employment letters"
                : path.includes("voucher") ? "a journey voucher"
                  : path.includes("hotel") ? "hotel details"
                    : path.includes("/gst") ? "GST numbers"
                      : path.includes("/office-addresses") ? "office addresses" : "workspace settings";
  const creating = method === "POST" && (/^\/(?:invoices|vouchers|hotels|gst|office-addresses|letters|staff|staff-accounts|festival-decorations|festival-schedules)\/?$/.test(path) || /^\/data-control\/backups\/?$/.test(path));
  let action = method === "DELETE" ? "deleted" : creating ? "created" : "updated";
  if (/^\/staff-accounts\/[a-f\d]{24}\/invoices\/[a-f\d]{24}$/i.test(path) && method === "PATCH") action = body?.authorized === true ? "granted" : "revoked";
  if (/^\/enquiries\/[a-f\d]{24}\/?$/i.test(path)) {
    if (method === "DELETE" || body?.archive === true) action = "archived";
    else if (body?.archive === false) action = "restored";
  }
  return { label, action };
}

import { apiUrl, ApiError } from "./api";
export { formatVoucherMoney as money, formatVoucherDate as date } from "../../../shared/voucherBilling.js";
export async function voucherFile(path, signal) {
  const response = await fetch(apiUrl(path), { credentials: "include", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.message || "The document could not be prepared. Please retry.", response.status); }
  return response.blob();
}
export function downloadVoucherFile(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const vouchersChanged = () => window.dispatchEvent(new window.Event("journey-vouchers-changed"));
export const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

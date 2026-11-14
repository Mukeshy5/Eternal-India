// Currency is calculated in integer paise in both the editor and the API.
export function moneyToPaise(value) {
  // Eight whole digits keep aggregate totals safe even across all 90,000 invoices.
  if (!["string", "number"].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function calculateVoucherPrice(basePrice, rate) {
  const basePaise = moneyToPaise(basePrice);
  if (basePaise === null || typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.round(rate * 100) / 100 !== rate) return null;
  const rateBasisPoints = Math.round(rate * 100);
  const gstPaise = Math.round(basePaise * rateBasisPoints / 10000);
  return { currency: "INR", basePaise, gstRate: rate, gstPaise, totalPaise: basePaise + gstPaise };
}

export const voucherCompany = {
  name: "ETERNAL INDIA",
  subtitle: "(A Unit of Joy Vacation Pvt. Ltd.)",
  address: "Block N2, Gurudwara Rd, Mohan Garden, Block F, N-89, Uttam Nagar, New Delhi, Delhi, 110059",
  phone: "+91 11 41715155 / 9319140846",
  website: "www.eternal-india.com",
  note: "N.B.: This Exchange Order is issued & valid Subject to Terms & Conditions given overleaf.",
};
export const voucherStatuses = ["draft", "confirmed", "cancelled"];
export const mealPlans = { CP: "Breakfast Only", MAP: "Breakfast + Dinner", AP: "Breakfast + Lunch + Dinner" };
export const mealPlanLabel = (value) => Object.hasOwn(mealPlans, value || "") ? `${value} – ${mealPlans[value]}` : "Not recorded";
export const voucherOffice = (voucher) => voucher?.officeAddress || { name: voucherCompany.name, address: voucherCompany.address, phone: voucherCompany.phone };
export const formatVoucherMoney = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);
export const formatVoucherDate = (date) => date ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${date.slice(0, 10)}T12:00:00+05:30`)) : "—";

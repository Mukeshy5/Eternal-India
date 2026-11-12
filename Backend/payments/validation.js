export function paymentError(status, message, details = {}) {
  return Object.assign(new Error(message), { status, publicMessage: true, details });
}

export const validOrderId = (id) => typeof id === "string" && /^order_[A-Za-z0-9]{1,80}$/.test(id);
export const validPaymentId = (id) => typeof id === "string" && /^pay_[A-Za-z0-9]{1,80}$/.test(id);
export const validAccessToken = (token) => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);

export function validatePayment(body, config) {
  const errors = {}, fields = {};
  for (const [key, max, required] of [["customerName", 120, true], ["email", 200, true], ["phone", 20, true], ["bookingId", 80, false], ["description", 240, false]]) {
    const value = typeof body?.[key] === "string" ? body[key].trim() : "";
    if ((required && !value) || value.length > max || /[\x00-\x1f\x7f<>]/.test(value)) errors[key] = `Enter a valid ${key === "customerName" ? "customer name" : key}.`;
    fields[key] = value;
  }
  fields.description ||= "Eternal India payment";
  fields.email = fields.email.toLowerCase();
  fields.phone = fields.phone.replace(/[\s()-]/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = "Enter a valid email address.";
  if (!/^\+?[1-9]\d{7,14}$/.test(fields.phone)) errors.phone = "Enter a valid mobile number, including country code if outside India.";
  // Parse decimal rupees without rounding arbitrary precision or using floating point money.
  const raw = typeof body?.amount === "number" || typeof body?.amount === "string" ? String(body.amount) : "";
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(raw);
  fields.amount = match ? Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0")) : NaN;
  if (!Number.isSafeInteger(fields.amount) || fields.amount < config.minAmount || fields.amount > config.maxAmount) errors.amount = `Enter an amount between INR ${config.minAmount / 100} and INR ${config.maxAmount / 100}, with up to two decimals.`;
  if (body?.currency !== undefined && body.currency !== "INR") errors.currency = "Only INR payments are supported.";
  if (typeof body?.submissionId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.submissionId)) errors.submissionId = "Refresh the payment form before submitting.";
  if (!validAccessToken(body?.accessToken)) errors.accessToken = "Refresh the payment form before submitting.";
  if (Object.keys(errors).length) throw paymentError(400, "Please check your payment details.", { errors });
  return { ...fields, currency: "INR" };
}

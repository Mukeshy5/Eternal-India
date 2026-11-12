export const enquiryStatuses = ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "new", "pending", "confirmed", "cancelled", "contacted", "closed"];
export function validateEnquiry(body) {
  const errors = {};
  const fields = {};
  const text = (key, maximum, required = false) => {
    const value = typeof body?.[key] === "string" ? body[key].trim() : "";
    if ((required && !value) || value.length > maximum || (body?.[key] != null && typeof body[key] !== "string")) errors[key] = `${key} must be ${required ? "provided and " : ""}at most ${maximum} characters.`;
    fields[key] = value;
  };
  text("name", 100, true);
  text("email", 200, true);
  text("phone", 30);
  text("destination", 200, true);
  text("message", 2000);
  text("date", 10);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = "Enter a valid email address.";
  const travellers = typeof body?.travellers === "string" || typeof body?.travellers === "number" ? Number(body.travellers) : NaN;
  if (!Number.isInteger(travellers) || travellers < 1 || travellers > 100) errors.travellers = "Choose between 1 and 100 travellers.";
  fields.travellers = travellers;
  if (fields.date && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || Number.isNaN(Date.parse(fields.date)) || new Date(fields.date).toISOString().slice(0, 10) !== fields.date)) errors.date = "Enter a valid travel date.";
  if (!["en", "hi"].includes(body?.voiceLanguage)) errors.voiceLanguage = "Choose English or Hindi.";
  fields.voiceLanguage = body?.voiceLanguage;
  if (typeof body?.submissionId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.submissionId)) errors.submissionId = "Refresh the page and submit again.";
  return { fields, errors, submissionId: body?.submissionId };
}

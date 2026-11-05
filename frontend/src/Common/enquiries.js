export const whatsappUrl = "https://wa.me/919319140846";
export const supportEmail = "info@eternal-india.com";

// The visitor reviews and sends the prepared message in their chosen app.
export function buildEnquiryUrl(fields, channel = "whatsapp") {
  const clean = (key) => String(fields[key] || "").trim();
  const message = [
    "Hello Eternal India, I'd like to plan a trip.",
    "",
    `Name: ${clean("name")}`,
    `Email: ${clean("email")}`,
    `Phone: ${clean("phone") || "Not provided"}`,
    `Destination: ${clean("destination")}`,
    `Travel date: ${clean("date") || "Flexible / not decided"}`,
    `Travellers: ${clean("travellers")}`,
    "",
    "My travel ideas:",
    clean("message") || "Please help me plan my itinerary.",
  ].join("\n");

  return channel === "email"
    ? `mailto:${supportEmail}?subject=${encodeURIComponent("Trip enquiry — Eternal India")}&body=${encodeURIComponent(message)}`
    : `${whatsappUrl}?text=${encodeURIComponent(message)}`;
}

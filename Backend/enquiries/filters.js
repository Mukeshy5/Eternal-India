// These predicates mirror enquirySection in shared/enquiries.js, including old
// website records without a contactChannel. Never change the ingestion source.
export function enquirySectionFilter(section) {
  if (section === "WEBSITE") return { source: "WEBSITE", contactChannel: { $nin: ["email", "whatsapp"] } };
  return { $or: [{ source: section }, { source: "WEBSITE", contactChannel: section === "GMAIL" ? "email" : "whatsapp" }] };
}

export const enquirySectionExpression = { $switch: {
  branches: [
    { case: { $in: ["$source", ["WHATSAPP", "GMAIL"]] }, then: "$source" },
    { case: { $eq: ["$contactChannel", "whatsapp"] }, then: "WHATSAPP" },
    { case: { $eq: ["$contactChannel", "email"] }, then: "GMAIL" },
  ],
  default: "WEBSITE",
} };

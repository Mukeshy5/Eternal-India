export const bankDetails = [
  { label: "Account name", value: "ETERNAL INDIA" },
  { label: "Bank", value: "AXIS BANK" },
  { label: "Current account no.", value: "921020029366590" },
  { label: "SWIFT code", value: "AXISINBB1600" },
  { label: "IFSC", value: "UTIB0001600" },
  { label: "Beneficiary", value: "ETERNAL INDIA" },
];

export const QR_DISPLAY_MS = 10 * 60 * 1000;

export function qrSecondsRemaining(expiresAt, now = Date.now()) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export function formatQrTime(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

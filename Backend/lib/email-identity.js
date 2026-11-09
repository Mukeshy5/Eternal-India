export const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

export function gmailIdentity(value) {
  const email = normalizeEmail(value);
  const match = email.length <= 200 && email.match(/^([a-z0-9]+(?:\.[a-z0-9]+)*)(?:\+[a-z0-9._-]+)?@(gmail|googlemail)\.com$/);
  if (!match || email.split("@")[0].length > 64) return null;
  return { email, gmailKey: `${match[1].replaceAll(".", "")}@gmail.com` };
}

// Include older accounts which predate the canonical Gmail key.
export function gmailAccountFilter(identity, excludeId) {
  const username = identity.gmailKey.split("@")[0];
  const aliases = `^${[...username].join("\\.*")}(?:\\+[^@]+)?@(gmail|googlemail)\\.com$`;
  return { ...(excludeId ? { _id: { $ne: excludeId } } : {}), $or: [{ gmailKey: identity.gmailKey }, { email: { $regex: aliases, $options: "i" } }] };
}

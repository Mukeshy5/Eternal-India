export function cookieHeader(response, current = "") {
  const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") || ""];
  const jar = new Map(current.split(/;\s*/).filter(Boolean).map((cookie) => {
    const separator = cookie.indexOf("=");
    return [cookie.slice(0, separator), cookie.slice(separator + 1)];
  }));
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0], separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator);
    if (/;\s*max-age=0(?:;|$)/i.test(cookie)) jar.delete(name);
    else jar.set(name, pair.slice(separator + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

import { apiUrl, ApiError } from "../api";

export async function letterFile(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...options.headers }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  } catch (error) { if (options.signal?.aborted) throw error; throw new ApiError("The letter could not be loaded. Check your connection and try again.", 0); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.message || "The letter could not be prepared.", response.status, data.errors, data); }
  if (!response.headers.get("Content-Type")?.includes("application/pdf")) throw new ApiError("The server did not return a PDF document. Please try again.", 500);
  return response.blob();
}

export function downloadLetter(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${filename.replaceAll("/", "-")}.pdf`; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export class ApiError extends Error {
  constructor(message, status, errors = {}, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.details = details;
  }
}

const apiOrigin = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const socketOrigin = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL || "").trim();

export function apiUrl(path) {
  return `${apiOrigin}/api${path}`;
}

export function socketServerUrl() {
  if (socketOrigin) return new URL(socketOrigin, window.location.href).origin;
  // Vite proxies local sockets; Vercel only proxies HTTP API requests.
  return window.location.hostname === "eternal-india-phi.vercel.app"
    ? "https://eternal-india-1.onrender.com" : window.location.origin;
}

export async function api(path, options = {}) {
  const { timeoutMs = 60000, ...requestOptions } = options;
  let response;
  try {
    response = await fetch(apiUrl(path), {
      ...requestOptions,
      credentials: "include",
      headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError("We couldn't connect. Please check your connection and try again.", 0);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || ({ 401: "Please sign in to continue.", 403: "Your account does not have permission for this action.", 404: "This item could not be found. Refresh the workspace and try again." }[response.status] || "The server is unavailable. Please try again shortly.");
    throw new ApiError(message, response.status, data?.errors, data || {});
  }
  if (!data) throw new ApiError("The server returned an unexpected response. Please try again.", response.status);
  return data;
}

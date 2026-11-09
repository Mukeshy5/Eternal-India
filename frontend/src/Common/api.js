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

export function apiUrl(path) {
  return `${apiOrigin}/api${path}`;
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
    const message = data?.message || (response.status === 404 ? "This item could not be found. Refresh the workspace and try again." : "The server is unavailable. Please try again shortly.");
    throw new ApiError(message, response.status, data?.errors, data || {});
  }
  if (!data) throw new ApiError("The server returned an unexpected response. Please try again.", response.status);
  return data;
}

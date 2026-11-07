export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError("We couldn't connect. Please check your connection and try again.", 0);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 404
      ? "This feature is not available on the running server. Restart the backend and try again."
      : data?.message || "The server is unavailable. Please try again shortly.";
    throw new ApiError(message, response.status, data?.errors);
  }
  if (!data) throw new ApiError("The server returned an unexpected response. Please try again.", response.status);
  return data;
}

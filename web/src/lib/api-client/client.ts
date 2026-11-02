import { buildApiError } from "./errors";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  /** Appended to the URL; null/undefined values are skipped. */
  query?: QueryParams;
  /** JSON-serialised unless it is FormData. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Do not call the onUnauthorized handler on 401 (e.g. optional "am I logged in?" probes). */
  skipUnauthorized?: boolean;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const SAFE_METHODS = new Set<string>(["GET", "HEAD", "OPTIONS"]);

let unauthorizedHandler: () => void = defaultUnauthorized;

function defaultUnauthorized() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.assign("/login");
}

/** Replace what happens on a 401 (pass nothing to restore the redirect to /login). */
export function setUnauthorizedHandler(handler?: () => void) {
  unauthorizedHandler = handler ?? defaultUnauthorized;
}

function readXsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="));
  return match ? decodeURIComponent(match.slice("XSRF-TOKEN=".length)) : null;
}

let csrfPromise: Promise<void> | null = null;

/** Fetches the Sanctum CSRF cookie once (memoised until it fails or is reset). */
export function ensureCsrfCookie(force = false): Promise<void> {
  if (!force && readXsrfCookie()) return Promise.resolve();
  if (!force && csrfPromise) return csrfPromise;
  csrfPromise = fetch(`${API_BASE_URL}/sanctum/csrf-cookie`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).then(
    (res) => {
      if (!res.ok) throw buildApiError(res.status, null, res.statusText);
    },
    (err) => {
      csrfPromise = null;
      throw err;
    },
  );
  csrfPromise.catch(() => {
    csrfPromise = null;
  });
  return csrfPromise;
}

/** Test helper: forget memoised CSRF state. */
export function resetApiClientState() {
  csrfPromise = null;
  unauthorizedHandler = defaultUnauthorized;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
}

async function send(method: Method, path: string, options: RequestOptions, isRetry = false): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...options.headers,
  };
  const init: RequestInit = { method, credentials: "include", headers, signal: options.signal };

  if (options.body !== undefined) {
    if (typeof FormData !== "undefined" && options.body instanceof FormData) {
      init.body = options.body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
  }

  if (!SAFE_METHODS.has(method)) {
    await ensureCsrfCookie();
    const token = readXsrfCookie();
    if (token) headers["X-XSRF-TOKEN"] = token;
  }

  const res = await fetch(buildUrl(path, options.query), init);
  // 419 = stale CSRF token: refresh the cookie and retry once.
  if (res.status === 419 && !isRetry && !SAFE_METHODS.has(method)) {
    await ensureCsrfCookie(true);
    return send(method, path, options, true);
  }
  return res;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(method, path, options);
  const body = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && !options.skipUnauthorized) unauthorizedHandler();
    throw buildApiError(res.status, body, res.statusText);
  }
  return body as T;
}

/**
 * Typed fetch wrapper for the Laravel API. Paths are absolute from the API root, e.g.
 * `/api/auth/me`. Returns parsed JSON (the full body, so `{data: ...}` envelopes are kept)
 * or null for 204. Throws ApiError on any non-2xx response.
 */
export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body">) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">) =>
    request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">) =>
    request<T>("PUT", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">) =>
    request<T>("PATCH", path, { ...options, body }),
  delete: <T = null>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};

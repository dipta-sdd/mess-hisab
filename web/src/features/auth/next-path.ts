const STORAGE_KEY = "mh.next";

const BASE = "http://mh.invalid";

/**
 * Only same-site absolute paths are allowed as post-login targets. Browsers drop tabs/newlines and treat
 * "\\" as "/" when parsing URLs, so "/\t/evil.com" would become "//evil.com": refuse control characters and
 * backslashes outright, then make sure the path resolves to our own origin.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return url.pathname + url.search + url.hash;
}

/** Google sign-in leaves the site and always returns to /auth/callback, so park the target. */
export function stashNext(next: string | null) {
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: fall back to the landing page */
  }
}

export function takeStashedNext(): string | null {
  try {
    const value = safeNext(sessionStorage.getItem(STORAGE_KEY));
    sessionStorage.removeItem(STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

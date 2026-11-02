const STORAGE_KEY = "mh.next";

/** Only same-site absolute paths ("/x", not "//host" or "/\\host") are allowed as post-login targets. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
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

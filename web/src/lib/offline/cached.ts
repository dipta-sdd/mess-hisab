import { isNetworkError } from "./sync";

/**
 * Reads the offline form needs (categories, who I am, the open month). Each success is copied to
 * localStorage; with no connection the last copy is returned instead, so Add expense still opens.
 */
export async function withOfflineCopy<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const storageKey = `offline:${key}`;
  try {
    const value = await fetcher();
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* storage full or blocked: the copy is a convenience */
    }
    return value;
  } catch (error) {
    if (isNetworkError(error)) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        /* fall through to the original error */
      }
    }
    throw error;
  }
}

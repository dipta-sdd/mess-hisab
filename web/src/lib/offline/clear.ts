/** Drops every saved offline copy; called on logout so the next person on a shared device never sees them. */
export function clearOfflineCopies(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("offline:")) localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked: nothing was saved */
  }
}

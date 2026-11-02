export type Theme = "light" | "dark";

/** localStorage key for an explicit choice; when absent the device setting is followed. */
export const THEME_STORAGE_KEY = "mh.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The saved choice, or null when the user never picked one (or storage is blocked). */
export function readStoredTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** HeroUI's dark tokens switch on `.dark` / `data-theme="dark"` on <html>. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / blocked storage: the choice lasts for this page only.
  }
}

/**
 * Runs in <head> before first paint so a dark-mode user never sees a white flash.
 * Kept self-contained (no imports) because it is inlined as a string.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light"}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.dataset.theme=t}catch(e){}})();`;

export { DARK_QUERY };

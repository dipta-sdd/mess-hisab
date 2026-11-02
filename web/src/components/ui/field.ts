/** Shared class names for native inputs, selects and textareas. One copy; do not redefine per feature. */
export const fieldClass =
  "w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-accent";

/** Same as {@link fieldClass} plus a danger border while `aria-invalid="true"` (used by the fixed-bills forms). */
export const fieldClassInvalid = `${fieldClass} aria-[invalid=true]:border-danger`;

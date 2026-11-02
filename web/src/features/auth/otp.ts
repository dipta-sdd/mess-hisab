import { isApiError } from "@/lib/api-client/errors";

export const OTP_ERROR_CODES = ["otp_invalid", "otp_expired", "otp_too_many", "sms_failed", "otp_resend_wait"] as const;
export type OtpErrorCode = (typeof OTP_ERROR_CODES)[number];

function known(value: unknown): OtpErrorCode | null {
  return typeof value === "string" && (OTP_ERROR_CODES as readonly string[]).includes(value) ? (value as OtpErrorCode) : null;
}

/** The API names the failure in `code`; tolerate it arriving as the message or a field message instead. */
export function otpErrorCode(error: unknown): OtpErrorCode | null {
  if (!isApiError(error)) return null;
  const direct = known(error.code) ?? known(error.message);
  if (direct) return direct;
  for (const messages of Object.values(error.fieldErrors)) {
    for (const message of messages) {
      const hit = known(message);
      if (hit) return hit;
    }
  }
  return null;
}

/** Seconds from a 429 `otp_resend_wait` body, if present. */
export function retryAfterSeconds(error: unknown): number | null {
  if (!isApiError(error) || !error.body || typeof error.body !== "object") return null;
  const value = (error.body as Record<string, unknown>).retry_after;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

const KEY = "mh.otpResendAt";

/** Remember when the next resend is allowed, across the register -> verify-phone navigation. */
export function stashResendAt(at: string | number) {
  try {
    sessionStorage.setItem(KEY, String(typeof at === "number" ? at : Date.parse(at)));
  } catch {
    /* storage unavailable: the resend button is simply enabled */
  }
}

export function readResendAt(): number | null {
  try {
    const n = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** A code was just sent by register; the API enforces a 60 s gap before a resend. */
export const RESEND_GAP_MS = 60_000;

/** Register already sent the first code, so the next resend opens RESEND_GAP_MS from now. */
export function stashResendFromNow() {
  stashResendAt(Date.now() + RESEND_GAP_MS);
}

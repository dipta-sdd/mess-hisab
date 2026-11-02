export type FieldErrors = Record<string, string[]>;

/** Error thrown by apiClient for every non-2xx response. */
export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly status: number,
    message: string,
    /** 409 domain code (snake_case), if the server sent one. */
    readonly code: string | null = null,
    /** 422 per-field messages, keyed by field name. */
    readonly fieldErrors: FieldErrors = {},
    readonly body: unknown = null,
  ) {
    super(message);
  }

  get isValidation() {
    return this.status === 422;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isUnauthorized() {
    return this.status === 401;
  }

  /** First message for a field, or undefined. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function buildApiError(status: number, body: unknown, statusText = ""): ApiError {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof obj.message === "string" && obj.message ? obj.message : statusText || `Request failed (${status})`;
  const code = typeof obj.code === "string" ? obj.code : null;
  const fieldErrors: FieldErrors = {};
  if (status === 422 && obj.errors && typeof obj.errors === "object") {
    for (const [field, messages] of Object.entries(obj.errors as Record<string, unknown>)) {
      fieldErrors[field] = Array.isArray(messages) ? messages.map(String) : [String(messages)];
    }
  }
  return new ApiError(status, message, code, fieldErrors, body);
}

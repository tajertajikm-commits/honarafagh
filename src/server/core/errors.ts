export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "INSUFFICIENT_STOCK"
  | "RATE_LIMITED"
  | "PAYMENT_ERROR"
  | "INTEGRATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
  PAYMENT_ERROR: 402,
  INTEGRATION_ERROR: 502,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
};

/** A failure that is safe to show to the caller. Messages are user-facing (Persian). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} پیدا نشد.`);
export const forbidden = (message = "شما مجوز انجام این کار را ندارید.") => new AppError("FORBIDDEN", message);
export const invalidState = (message: string, details?: unknown) => new AppError("INVALID_STATE", message, details);
export const validation = (message: string, details?: unknown) => new AppError("VALIDATION", message, details);
export const conflict = (message: string, details?: unknown) => new AppError("CONFLICT", message, details);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Postgres error helpers (pg driver exposes `code` and `constraint`). */
export function pgErrorInfo(err: unknown): { code?: string; constraint?: string } {
  let cur: unknown = err;
  // drizzle wraps driver errors in `cause`
  for (let i = 0; i < 3 && cur && typeof cur === "object"; i++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: typeof e.constraint === "string" ? e.constraint : undefined };
    }
    cur = e.cause;
  }
  return {};
}

export const isUniqueViolation = (err: unknown, constraint?: string) => {
  const info = pgErrorInfo(err);
  return info.code === "23505" && (!constraint || info.constraint === constraint);
};
export const isCheckViolation = (err: unknown, constraint?: string) => {
  const info = pgErrorInfo(err);
  return info.code === "23514" && (!constraint || info.constraint === constraint);
};

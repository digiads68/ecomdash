export class TikTokApiError extends Error {
  constructor(message: string, public readonly code: number, public readonly requestId?: string, public readonly httpStatus?: number) {
    super(`${message} (code ${code}${requestId ? `, request ${requestId}` : ""})`);
    this.name = this.constructor.name;
  }
}

/** Token expired or invalid and could not be refreshed — needs re-authorisation. */
export class TokenExpiredError extends TikTokApiError {}
/** App lacks a scope / permission for this resource. */
export class ScopeError extends TikTokApiError {}
/** Signature, missing cipher, bad parameters — a bug on our side; do not retry. */
export class SignatureError extends TikTokApiError {}
export class ValidationError extends TikTokApiError {}
/** Rate limited after all retries. */
export class RateLimitError extends TikTokApiError {}
/** Timeouts and 5xx after all retries. */
export class TransientError extends TikTokApiError {}
export class AuthMismatchError extends TikTokApiError {}

export type ErrorKind = "ok" | "token" | "scope" | "signature" | "validation" | "rate" | "transient" | "mismatch" | "other";

export function classifyShopCode(code: number): ErrorKind {
  if (code === 0) return "ok";
  if (code === 105002) return "token";
  if (code === 105005) return "scope";
  if (code === 101000) return "mismatch";
  if (code === 106001 || code === 106013) return "signature";
  if (code === 36009002) return "rate";
  if (code === 36009007) return "transient";
  if (code === 36009004 || code === 36009009 || code === 36009033) return "validation";
  return "other";
}

export function classifyAdsCode(code: number): ErrorKind {
  if (code === 0) return "ok";
  if (code === 40100) return "rate";
  if (code === 40102 || code === 40104 || code === 40105) return "token";
  if (code === 40001 || code === 40300) return "scope";
  if (code === 40002) return "validation";
  if (code >= 50000 && code < 52000) return "transient";
  return "other";
}

export function errorFor(kind: ErrorKind, message: string, code: number, requestId?: string, status?: number): TikTokApiError {
  switch (kind) {
    case "token": return new TokenExpiredError(message, code, requestId, status);
    case "scope": return new ScopeError(message, code, requestId, status);
    case "signature": return new SignatureError(message, code, requestId, status);
    case "validation": return new ValidationError(message, code, requestId, status);
    case "rate": return new RateLimitError(message, code, requestId, status);
    case "transient": return new TransientError(message, code, requestId, status);
    case "mismatch": return new AuthMismatchError(message, code, requestId, status);
    default: return new TikTokApiError(message, code, requestId, status);
  }
}

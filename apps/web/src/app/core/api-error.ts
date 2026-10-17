import { HttpErrorResponse } from '@angular/common/http';
import { DEFAULT_MESSAGES, type ApiErrorDetail, type ApiFailure } from '@milhas/contracts';

/** Erro normalizado: tudo que sai do ApiClient é uma ApiError. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: ApiErrorDetail[] = [],
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof HttpErrorResponse) return ApiError.fromHttp(error);
    if (error instanceof Error) {
      return new ApiError('INTERNAL_ERROR', error.message || DEFAULT_MESSAGES['INTERNAL_ERROR'], 0);
    }
    return new ApiError('INTERNAL_ERROR', DEFAULT_MESSAGES['INTERNAL_ERROR'], 0);
  }

  static fromHttp(err: HttpErrorResponse): ApiError {
    const retryAfter = parseRetryAfter(err.headers?.get('retry-after'));
    const body = err.error as Partial<ApiFailure> | null | undefined;
    if (body && typeof body === 'object' && body.success === false && body.error) {
      const code = body.error.code || codeForStatus(err.status);
      return new ApiError(code, body.error.message || defaultMessageFor(err.status, code), err.status, body.error.details ?? [], retryAfter);
    }
    if (err.status === 0) {
      return new ApiError('NETWORK_ERROR', DEFAULT_MESSAGES['NETWORK'], 0);
    }
    const code = codeForStatus(err.status);
    return new ApiError(code, defaultMessageFor(err.status, code), err.status, [], retryAfter);
  }

  get isSessionExpired(): boolean {
    return this.status === 401 || this.code === 'UNAUTHORIZED' || this.code === 'AUTH_SESSION_EXPIRED';
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === 'RATE_LIMIT_EXCEEDED' || this.code === 'TOO_MANY_REQUESTS';
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  /** Mensagem de um campo específico vinda de `details`. */
  fieldMessage(field: string): string | null {
    return this.details.find((d) => d.field === field)?.message ?? null;
  }
}

export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.max(1, Number(trimmed));
  const at = Date.parse(trimmed);
  if (Number.isFinite(at) && at > Date.now()) return Math.ceil((at - Date.now()) / 1000);
  return null;
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 502:
    case 503:
    case 504:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

function defaultMessageFor(status: number, code: string): string {
  if (code in DEFAULT_MESSAGES) return DEFAULT_MESSAGES[code];
  if (status === 401) return DEFAULT_MESSAGES['UNAUTHORIZED'];
  if (status === 429) return DEFAULT_MESSAGES['RATE_LIMIT_EXCEEDED'];
  if (status >= 500) return DEFAULT_MESSAGES['SERVICE_UNAVAILABLE'];
  return DEFAULT_MESSAGES['BAD_REQUEST'];
}

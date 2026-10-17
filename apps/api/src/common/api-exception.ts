import { HttpException } from '@nestjs/common';
import { ERROR_HTTP_STATUS, type ApiErrorDetail, type ErrorCode } from '@milhas/contracts';

/**
 * Exceção de domínio com código do protocolo. O filtro global converte para o
 * envelope `{ success:false, error:{ code, message, details } }`.
 */
export class ApiException extends HttpException {
  readonly code: ErrorCode | string;
  readonly details?: ApiErrorDetail[];
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode | string,
    message: string,
    options: { status?: number; details?: ApiErrorDetail[]; retryAfterSeconds?: number } = {},
  ) {
    const status = options.status ?? ERROR_HTTP_STATUS[code as ErrorCode] ?? 400;
    super({ code, message }, status);
    this.code = code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  static notFound(code: ErrorCode | string, message: string) {
    return new ApiException(code, message, { status: 404 });
  }
}

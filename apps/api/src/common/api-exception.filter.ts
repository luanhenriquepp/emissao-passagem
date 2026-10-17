import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { HEADERS, type ApiFailure } from '@milhas/contracts';
import { ApiException } from './api-exception.js';

/** Converte qualquer exceção no envelope de erro do protocolo. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers[HEADERS.requestId] as string | undefined) ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiFailure;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      body = {
        success: false,
        error: { code: exception.code, message: exception.message, details: exception.details, payload: { request_id: requestId } },
      };
      if (exception.retryAfterSeconds) res.setHeader(HEADERS.retryAfter, String(exception.retryAfterSeconds));
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      body = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: exception.issues[0]?.message ?? 'Dados inválidos. Revise e tente de novo.',
          details: exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          payload: { request_id: requestId },
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      const message = typeof resp === 'string' ? resp : ((resp as { message?: string | string[] }).message ?? exception.message);
      body = {
        success: false,
        error: {
          code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'BAD_REQUEST',
          message: Array.isArray(message) ? message.join('; ') : message,
          payload: { request_id: requestId },
        },
      };
    } else {
      this.logger.error(`Erro inesperado em ${req.method} ${req.url}`, (exception as Error)?.stack);
      body = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Algo deu errado por aqui. Tente novamente em alguns instantes.', payload: { request_id: requestId } },
      };
    }

    res.setHeader(HEADERS.requestId, requestId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(status).json(body);
  }
}

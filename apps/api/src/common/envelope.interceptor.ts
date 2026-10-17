import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { map, Observable } from 'rxjs';
import { HEADERS } from '@milhas/contracts';

export const BUILD_ID = process.env.BUILD_ID ?? 'dev';

/**
 * Handlers devolvem `{ data }` ou `{ data, message }` via `ok()`; qualquer outro
 * valor é embrulhado como `data`. Sempre sai `{ success:true, message, data }`.
 */
export interface Ok<T> {
  __ok: true;
  data: T;
  message?: string;
}

export function ok<T>(data: T, message?: string): Ok<T> {
  return { __ok: true, data, message };
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader(HEADERS.requestId, randomUUID());
    res.setHeader(HEADERS.build, BUILD_ID);
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-store');
    return next.handle().pipe(
      map((value) => {
        if (value && typeof value === 'object' && (value as Ok<unknown>).__ok) {
          const v = value as Ok<unknown>;
          return { success: true, message: v.message ?? 'OK', data: v.data };
        }
        return { success: true, message: 'OK', data: value ?? null };
      }),
    );
  }
}

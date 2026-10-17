import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { HEADERS, RETRYABLE_ERROR_CODES, type ApiFailure } from '@milhas/contracts';
import { catchError, retry, throwError, timer } from 'rxjs';
import { parseRetryAfter } from './api-error';
import { AuthState } from './auth-state';
import { clientContextHeader } from './device-context';

const BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_SECONDS = 15;

/** Endpoints cujo 401 é "normal" (sessão ausente) e não deve redirecionar. */
function isAuthEndpoint(url: string): boolean {
  return /\/v1\/auth\/(login|logout)$/.test(url) || /\/v1\/me$/.test(url);
}

function isTransient(error: HttpErrorResponse): boolean {
  if (error.status === 0) return true; // rede
  if (error.status >= 500) return true; // 5xx / 52x
  const body = error.error as Partial<ApiFailure> | null | undefined;
  const code = body && typeof body === 'object' && body.success === false ? body.error?.code : undefined;
  return !!code && RETRYABLE_ERROR_CODES.has(code);
}

/**
 * - withCredentials + Accept JSON em tudo
 * - X-Mp-Ctx em mutações
 * - retry com backoff (1s, 2s, 4s) para GET e para mutações com Idempotency-Key
 * - 429: respeita retry-after uma vez
 * - 401 fora de /voos e /login: redireciona para /login?redirect=
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) return next(req);

  const router = inject(Router);
  const authState = inject(AuthState);

  const isMutation = req.method !== 'GET' && req.method !== 'HEAD';
  let headers = req.headers.set('Accept', 'application/json');
  if (isMutation) headers = headers.set(HEADERS.clientContext, clientContextHeader(req.method, req.url));
  const prepared = req.clone({ headers, withCredentials: true });

  const retryable = !isMutation || req.headers.has(HEADERS.idempotencyKey);
  let usedRetryAfter = false;

  return next(prepared).pipe(
    retry({
      count: BACKOFF_MS.length + 1,
      delay: (error: unknown, retryCount: number) => {
        if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
        if (error.status === 429 && !usedRetryAfter) {
          const seconds = parseRetryAfter(error.headers.get('retry-after'));
          if (seconds !== null && seconds <= MAX_RETRY_AFTER_SECONDS) {
            usedRetryAfter = true;
            return timer(seconds * 1000);
          }
          return throwError(() => error);
        }
        if (retryable && isTransient(error) && retryCount <= BACKOFF_MS.length) {
          const base = BACKOFF_MS[retryCount - 1];
          return timer(Math.round(base * (0.7 + Math.random() * 0.6)));
        }
        return throwError(() => error);
      },
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint(req.url)) {
        authState.notifyUnauthorized();
        const current = router.url;
        if (!current.startsWith('/voos') && !current.startsWith('/login') && current !== '/') {
          void router.navigate(['/login'], { queryParams: { redirect: current } });
        }
      }
      return throwError(() => error);
    }),
  );
};

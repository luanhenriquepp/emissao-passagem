import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { DEFAULT_MESSAGES, HEADERS, type ApiEnvelope, type ApiFailure } from '@milhas/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  /** Presença do header torna a mutação elegível a retry no interceptor. */
  idempotencyKey?: string;
  params?: QueryParams;
}

/** Cliente HTTP tipado: desembrulha o envelope e converte qualquer falha em ApiError. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  readonly baseUrl = '/api/v1';

  get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>('GET', path, undefined, { params });
  }

  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body ?? {}, opts);
  }

  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body ?? {}, opts);
  }

  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body ?? {}, opts);
  }

  private async request<T>(method: string, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
    let headers = new HttpHeaders();
    if (opts.idempotencyKey) headers = headers.set(HEADERS.idempotencyKey, opts.idempotencyKey);
    let params = new HttpParams();
    for (const [key, value] of Object.entries(opts.params ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    try {
      const envelope = await firstValueFrom(
        this.http.request<ApiEnvelope<T>>(method, `${this.baseUrl}${path}`, { body, headers, params }),
      );
      if (envelope && envelope.success) return envelope.data;
      const failure = envelope as ApiFailure | null;
      throw new ApiError(
        failure?.error?.code ?? 'INTERNAL_ERROR',
        failure?.error?.message ?? DEFAULT_MESSAGES['INTERNAL_ERROR'],
        200,
        failure?.error?.details ?? [],
      );
    } catch (error) {
      throw ApiError.from(error);
    }
  }
}

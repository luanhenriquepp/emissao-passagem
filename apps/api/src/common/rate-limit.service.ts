import { Injectable } from '@nestjs/common';
import { ApiException } from './api-exception.js';

interface Bucket {
  count: number;
  windowStart: number;
}

/** Janela fixa em memória por (escopo, usuário). Suficiente para dev/single-instance. */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /** Lança RATE_LIMIT_EXCEEDED com retry-after quando `limit` chamadas/`windowSeconds` é ultrapassado. */
  hit(scope: string, userId: string, limit: number, windowSeconds: number, message: string): void {
    const key = `${scope}:${userId}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowSeconds * 1000) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return;
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.windowStart + windowSeconds * 1000 - now) / 1000);
      throw new ApiException('RATE_LIMIT_EXCEEDED', message, { retryAfterSeconds: Math.max(1, retryAfter) });
    }
  }
}

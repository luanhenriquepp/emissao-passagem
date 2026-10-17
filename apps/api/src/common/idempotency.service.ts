import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiException } from './api-exception.js';

interface Entry {
  bodyHash: string;
  resultId: string;
  createdAt: number;
}

const KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda `Idempotency-Key` → resultado por usuário e escopo. Mesmo key com body
 * diferente é recusado (ORDER_IDEMPOTENCY_BODY_DIVERGENT), como no produto original.
 */
@Injectable()
export class IdempotencyService {
  private readonly entries = new Map<string, Entry>();

  static hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
  }

  /** Retorna o id já criado para esta key, ou null se é a primeira vez. */
  lookup(scope: string, userId: string, key: string | undefined, body: unknown): string | null {
    if (!key) return null;
    if (!KEY_REGEX.test(key)) {
      throw new ApiException('ORDER_IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key inválida.');
    }
    this.sweep();
    const entry = this.entries.get(`${scope}:${userId}:${key}`);
    if (!entry) return null;
    if (entry.bodyHash !== IdempotencyService.hashBody(body)) {
      throw new ApiException('ORDER_IDEMPOTENCY_BODY_DIVERGENT', 'Idempotency-Key já usada com outro conteúdo.');
    }
    return entry.resultId;
  }

  remember(scope: string, userId: string, key: string | undefined, body: unknown, resultId: string): void {
    if (!key) return;
    this.entries.set(`${scope}:${userId}:${key}`, { bodyHash: IdempotencyService.hashBody(body), resultId, createdAt: Date.now() });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, e] of this.entries) if (now - e.createdAt > TTL_MS) this.entries.delete(k);
  }
}

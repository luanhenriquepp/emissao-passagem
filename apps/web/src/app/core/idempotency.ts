import { newUuid } from './device-context';

/** Uma chave por tentativa de criação (pedido, pagamento): o retry reutiliza a mesma. */
export function newIdempotencyKey(): string {
  return newUuid();
}

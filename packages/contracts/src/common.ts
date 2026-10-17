/**
 * Envelope e códigos de erro compartilhados entre API e front.
 *
 * Toda resposta da API segue um dos dois formatos:
 *   { success: true,  message?: string, data: T }
 *   { success: false, error: { code, message, details?, payload? } }
 */

export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: ApiErrorDetail[];
  payload?: Record<string, unknown> & { request_id?: string };
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/** Códigos de erro da API (`error.code` do envelope de falha). */
export const ERROR_CODES = [
  // genéricos / infra
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'AUTH_SESSION_EXPIRED',
  'SESSION_REFRESH_RATE_LIMITED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMIT_EXCEEDED',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'DATABASE_CONTENTION',
  'DATABASE_OVERLOADED',
  'INTERNAL_ERROR',
  // busca / cotação
  'SEARCH_NOT_FOUND',
  'SEARCH_EXPIRED',
  'OUTBOUND_NOT_SELECTED',
  'QUOTE_EXPIRED',
  'FLIGHT_QUOTE_FARE_EXPIRED',
  'FLIGHT_QUOTE_FARE_NOT_FOUND',
  'PRICE_CHANGED',
  // pedido
  'ORDER_NOT_FOUND',
  'ORDER_NOT_DRAFT',
  'ORDER_EXPIRED',
  'ORDER_HARD_TIMEOUT',
  'ORDER_DEPARTURE_TOO_SOON',
  'ORDER_QUOTE_INVALID',
  'ORDER_IDEMPOTENCY_KEY_INVALID',
  'ORDER_IDEMPOTENCY_BODY_DIVERGENT',
  'ORDER_PASSENGERS_INCOMPLETE',
  'ORDER_PASSENGER_TYPE_COUNT_MISMATCH',
  'ORDER_PASSENGERS_REPEATED',
  'ORDER_PASSENGER_NAME_REPEATED',
  'ORDER_PASSENGER_NAME_TOO_SHORT',
  'ORDER_PASSENGER_NAME_TOO_LONG',
  'ORDER_PASSENGER_PASSPORT_NUMBER_INVALID',
  'ORDER_PASSENGER_CPF_INVALID',
  'ORDER_PASSENGER_AGE_TOO_YOUNG',
  'ORDER_PASSENGER_AGE_TOO_OLD',
  'ORDER_DUPLICATE_PASSENGER_CPF',
  'ORDER_DUPLICATE_PASSENGER_PASSPORT',
  'ORDER_INVALID_TRANSITION',
  // pagamento
  'INSUFFICIENT_BALANCE',
  'PAYMENT_ALREADY_PROCESSED',
  'OFFER_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Status HTTP sugerido para cada código (usado pela API e pelo client ao decidir retry). */
export const ERROR_HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  AUTH_SESSION_EXPIRED: 401,
  SESSION_REFRESH_RATE_LIMITED: 429,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMIT_EXCEEDED: 429,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  DATABASE_CONTENTION: 409,
  DATABASE_OVERLOADED: 503,
  INTERNAL_ERROR: 500,
  SEARCH_NOT_FOUND: 404,
  SEARCH_EXPIRED: 410,
  OUTBOUND_NOT_SELECTED: 409,
  QUOTE_EXPIRED: 409,
  FLIGHT_QUOTE_FARE_EXPIRED: 409,
  FLIGHT_QUOTE_FARE_NOT_FOUND: 404,
  PRICE_CHANGED: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_DRAFT: 409,
  ORDER_EXPIRED: 410,
  ORDER_HARD_TIMEOUT: 410,
  ORDER_DEPARTURE_TOO_SOON: 422,
  ORDER_QUOTE_INVALID: 422,
  ORDER_IDEMPOTENCY_KEY_INVALID: 400,
  ORDER_IDEMPOTENCY_BODY_DIVERGENT: 422,
  ORDER_PASSENGERS_INCOMPLETE: 422,
  ORDER_PASSENGER_TYPE_COUNT_MISMATCH: 422,
  ORDER_PASSENGERS_REPEATED: 422,
  ORDER_PASSENGER_NAME_REPEATED: 422,
  ORDER_PASSENGER_NAME_TOO_SHORT: 422,
  ORDER_PASSENGER_NAME_TOO_LONG: 422,
  ORDER_PASSENGER_PASSPORT_NUMBER_INVALID: 422,
  ORDER_PASSENGER_CPF_INVALID: 422,
  ORDER_PASSENGER_AGE_TOO_YOUNG: 422,
  ORDER_PASSENGER_AGE_TOO_OLD: 422,
  ORDER_DUPLICATE_PASSENGER_CPF: 422,
  ORDER_DUPLICATE_PASSENGER_PASSPORT: 422,
  ORDER_INVALID_TRANSITION: 409,
  INSUFFICIENT_BALANCE: 402,
  PAYMENT_ALREADY_PROCESSED: 409,
  OFFER_NOT_FOUND: 404,
};

/** Códigos que o client pode tentar de novo automaticamente (GET e mutações idempotentes). */
export const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'SERVICE_UNAVAILABLE',
  'DATABASE_CONTENTION',
  'DATABASE_OVERLOADED',
]);

/** Nomes de headers usados pelo protocolo. */
export const HEADERS = {
  idempotencyKey: 'Idempotency-Key',
  clientContext: 'X-Mp-Ctx',
  requestId: 'x-request-id',
  session: 'x-mp-session',
  retryAfter: 'retry-after',
  build: 'x-mp-build',
} as const;

/** Mensagens padrão em pt-BR usadas pelo client quando a API não manda uma. */
export const DEFAULT_MESSAGES: Record<string, string> = {
  NETWORK: 'Sem conexão. Verifique sua internet e tente de novo.',
  TIMEOUT: 'O servidor demorou demais para responder.',
  SERVICE_UNAVAILABLE: 'Serviço indisponível no momento. Tente novamente em alguns instantes.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente.',
  RATE_LIMIT_EXCEEDED: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.',
  SEARCH_LIMIT: 'Você fez muitas buscas. Aguarde um pouco antes de buscar de novo.',
  INTERNAL_ERROR: 'Algo deu errado por aqui. Tente novamente em alguns instantes.',
  BAD_REQUEST: 'Dados inválidos. Revise e tente de novo.',
  OUTDATED_PAGE: 'Esta página foi atualizada. Recarregue a página para continuar.',
};

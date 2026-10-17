import { z } from 'zod';
import { FareDetailSchema, PaxSummaryLineSchema, PaxTypeSchema } from './flights.js';
import { isValidCpf, NAME_MAX, NAME_MIN, PASSPORT_REGEX } from './validation.js';

/* ------------------------------------------------------------------ */
/* Status e máquina de estados                                         */
/* ------------------------------------------------------------------ */

export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAID',
  'BOOKING',
  'BOOKED',
  'BOOKING_STUCK',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** Transições permitidas (quem dispara está no comentário). */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'], // confirm | timer | usuário
  PENDING_PAYMENT: ['PAID', 'EXPIRED', 'CANCELLED', 'DRAFT'], // payment | timer | usuário | editar pax
  PAID: ['BOOKING', 'CANCELLED'], // worker de emissão | estorno antes de emitir
  BOOKING: ['BOOKED', 'BOOKING_STUCK', 'FAILED'], // cia respondeu | timeout | recusa
  BOOKING_STUCK: ['BOOKED', 'FAILED'], // suporte
  BOOKED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Rótulo e tom de badge exibidos em "Minhas compras". */
export const ORDER_STATUS_LABELS: Record<OrderStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING_PAYMENT: { label: 'Aguardando pagamento', tone: 'warning' },
  PAID: { label: 'Pago', tone: 'info' },
  BOOKING: { label: 'Em emissão', tone: 'info' },
  BOOKED: { label: 'Emitida', tone: 'success' },
  BOOKING_STUCK: { label: 'Em emissão', tone: 'warning' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  EXPIRED: { label: 'Expirada', tone: 'neutral' },
};

/** Filtros de "Minhas compras" → status incluídos. */
export const PURCHASE_FILTERS: Record<string, { label: string; statuses: readonly OrderStatus[] }> = {
  all: { label: 'Todos', statuses: ORDER_STATUSES.filter((s) => s !== 'DRAFT') },
  issued: { label: 'Emitidas', statuses: ['BOOKED'] },
  in_emission: { label: 'Em emissão', statuses: ['PAID', 'BOOKING', 'BOOKING_STUCK'] },
  failed: { label: 'Falhadas', statuses: ['FAILED'] },
  cancelled: { label: 'Canceladas', statuses: ['CANCELLED'] },
  expired: { label: 'Expiradas', statuses: ['EXPIRED'] },
};

export const ORDER_DRAFT_TTL_MINUTES = 15;
export const ORDER_HARD_TIMEOUT_MINUTES = 60;
export const ORDER_MIN_HOURS_BEFORE_DEPARTURE = 3;

/* ------------------------------------------------------------------ */
/* Pedido                                                              */
/* ------------------------------------------------------------------ */

export const CreateOrderRequestSchema = z.object({
  outbound_fare_id: z.string().min(1),
  return_fare_id: z.string().min(1).nullable().optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const DOCUMENT_TYPES = ['CPF', 'PASSPORT'] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const OrderRequirementsSchema = z.object({
  international: z.boolean(),
  destination_scope: z.enum(['DOMESTIC', 'SOUTH_AMERICA', 'INTERNATIONAL']),
  document_types_allowed: z.array(DocumentTypeSchema),
  preferred_document_type: DocumentTypeSchema,
  warnings: z.array(z.string()),
});
export type OrderRequirements = z.infer<typeof OrderRequirementsSchema>;

export const BaggagePricingSchema = z.object({
  scope: z.enum(['DOMESTIC', 'INTERNATIONAL']),
  window_kind: z.enum(['ADVANCE', 'AIRPORT']),
  included_checked_count: z.number().int(),
  allow_extra_purchase: z.boolean(),
  max_extra_per_pax: z.number().int(),
  price_per_piece_brl: z.string(),
});
export type BaggagePricing = z.infer<typeof BaggagePricingSchema>;

export const PassengerInputSchema = z
  .object({
    nationality: z.string().length(2).default('BR'),
    document_type: DocumentTypeSchema,
    document_number: z.string().min(1),
    first_name: z.string().trim().min(NAME_MIN, 'Nome muito curto').max(NAME_MAX, 'Nome muito longo'),
    last_name: z.string().trim().min(NAME_MIN, 'Sobrenome muito curto').max(NAME_MAX, 'Sobrenome muito longo'),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
    gender: z.enum(['M', 'F']),
    save_as_favorite: z.boolean().optional().default(false),
    extra_baggage_outbound_qty: z.number().int().min(0).max(5).optional().default(0),
    extra_baggage_return_qty: z.number().int().min(0).max(5).optional().default(0),
  })
  .superRefine((p, ctx) => {
    if (p.document_type === 'CPF' && !isValidCpf(p.document_number)) {
      ctx.addIssue({ code: 'custom', message: 'CPF inválido', path: ['document_number'] });
    }
    if (p.document_type === 'PASSPORT' && !PASSPORT_REGEX.test(p.document_number.trim())) {
      ctx.addIssue({ code: 'custom', message: 'Passaporte inválido', path: ['document_number'] });
    }
  });
export type PassengerInput = z.infer<typeof PassengerInputSchema>;
export type PassengerInputRaw = z.input<typeof PassengerInputSchema>;

export const OrderPassengerSchema = z.object({
  position: z.number().int(),
  pax_type: PaxTypeSchema,
  nationality: z.string().nullable(),
  document_type: DocumentTypeSchema.nullable(),
  /** mascarado na leitura: 077.***.***-02 */
  document_number_masked: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  birth_date: z.string().nullable(),
  gender: z.enum(['M', 'F']).nullable(),
  extra_baggage_outbound_qty: z.number().int(),
  extra_baggage_return_qty: z.number().int(),
  is_complete: z.boolean(),
});
export type OrderPassenger = z.infer<typeof OrderPassengerSchema>;

export const ContactSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional(),
  ddi: z.string().regex(/^\+\d{1,3}$/).optional().default('+55'),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().min(6, 'Telefone inválido').max(15, 'Telefone inválido'))
    .nullable()
    .optional(),
});
export type ContactInput = z.input<typeof ContactSchema>;
export type Contact = z.infer<typeof ContactSchema>;

export const OrderSchema = z.object({
  order_id: z.string(),
  display_id: z.string(), // MP-PED-XXXXXXXX
  status: OrderStatusSchema,
  expires_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  fare_brl: z.string(),
  taxes_brl: z.string(),
  extras_brl: z.string(),
  service_fee_brl: z.string(),
  total_brl: z.string(),
  outbound: FareDetailSchema,
  return: FareDetailSchema.nullable(),
  summary: z.array(PaxSummaryLineSchema),
  baggage_pricing: z.object({ outbound: BaggagePricingSchema, return: BaggagePricingSchema.nullable() }),
  passengers_required: z.array(z.object({ type: PaxTypeSchema, count: z.number().int() })),
  passengers: z.array(OrderPassengerSchema),
  contact: z.object({ email: z.string().nullable(), phone: z.string().nullable(), ddi: z.string().nullable() }),
  requirements: OrderRequirementsSchema,
  notices: z.array(z.string()),
  record_locator: z.string().nullable(),
  tickets: z.array(z.object({ passenger_position: z.number().int(), eticket: z.string() })),
  payment: z
    .object({ method: z.literal('WALLET'), paid_at: z.string(), transaction_id: z.string() })
    .nullable(),
  failure_reason: z.string().nullable(),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderListItemSchema = z.object({
  order_id: z.string(),
  display_id: z.string(),
  status: OrderStatusSchema,
  status_label: z.string(),
  record_locator: z.string().nullable(),
  created_at: z.string(),
  outbound: z.object({
    airline_code: z.string(),
    origin_iata: z.string(),
    destination_iata: z.string(),
    departure_at: z.string(),
    arrival_at: z.string(),
  }),
  return: z
    .object({
      airline_code: z.string(),
      origin_iata: z.string(),
      destination_iata: z.string(),
      departure_at: z.string(),
      arrival_at: z.string(),
    })
    .nullable(),
  passengers_count: z.number().int(),
  passengers_summary: z.string(),
  fare_brl: z.string(),
  taxes_brl: z.string(),
  extras_brl: z.string(),
  service_fee_brl: z.string(),
  total_brl: z.string(),
});
export type OrderListItem = z.infer<typeof OrderListItemSchema>;

export const OrdersListResponseSchema = z.object({
  metrics: z.object({
    issued_count: z.number().int(),
    total_paid_brl: z.string(),
    in_emission_count: z.number().int(),
    period: z.literal('last_30_days'),
  }),
  items: z.array(OrderListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    per_page: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
  }),
});
export type OrdersListResponse = z.infer<typeof OrdersListResponseSchema>;

/* ------------------------------------------------------------------ */
/* Carteira (mínimo necessário ao checkout)                            */
/* ------------------------------------------------------------------ */

export const WalletSchema = z.object({
  balances: z.object({
    available: z.string(),
    reserved: z.string(),
    scheduled: z.string(),
    total: z.string(),
  }),
  deposit: z.object({ min: z.string(), max: z.string() }),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const WalletTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['DEPOSIT', 'ORDER_PAYMENT', 'ORDER_REFUND']),
  direction: z.enum(['credit', 'debit']),
  amount_brl: z.string(),
  description: z.string(),
  posted_at: z.string(),
  order_id: z.string().nullable(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

/* ------------------------------------------------------------------ */
/* Conta                                                               */
/* ------------------------------------------------------------------ */

export const MeSchema = z.object({
  full_name: z.string(),
  email: z.string(),
  balance: z.string(),
  subscription: z.object({
    plan_status: z.enum(['FREE', 'PRO', 'TRIAL']),
    is_active: z.boolean(),
    cancel_at_period_end: z.boolean(),
  }),
  password_change_required: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

export const FavoritePassengerSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  birth_date: z.string(),
  gender: z.enum(['M', 'F']),
  document_type: DocumentTypeSchema,
  document_number_masked: z.string(),
  nationality: z.string(),
});
export type FavoritePassenger = z.infer<typeof FavoritePassengerSchema>;

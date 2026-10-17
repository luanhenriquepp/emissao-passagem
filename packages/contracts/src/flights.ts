import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/** Cabine pedida na busca (a UI expõe Todas / Econômica / Executiva). */
export const SEARCH_CABINS = ['ALL', 'ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
export const SearchCabinSchema = z.enum(SEARCH_CABINS);
export type SearchCabin = z.infer<typeof SearchCabinSchema>;

/** Cabine efetiva da oferta devolvida pela fonte. */
export const OFFER_CABINS = ['ECONOMY', 'COMFORT', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
export const OfferCabinSchema = z.enum(OFFER_CABINS);
export type OfferCabin = z.infer<typeof OfferCabinSchema>;

export const SEAT_CLASSES = ['NONE', 'STANDARD', 'EXTRA_COMFORT'] as const;
export const SeatClassSchema = z.enum(SEAT_CLASSES);

export const PAX_TYPES = ['ADT', 'CHD', 'INF'] as const;
export const PaxTypeSchema = z.enum(PAX_TYPES);
export type PaxType = z.infer<typeof PaxTypeSchema>;

export const TRIP_TYPES = ['RT', 'OW'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

/** Origem interna da tarifa — nunca exposta à agência; usada só pelo motor. */
export const FARE_SOURCES = ['MILES', 'CONSOLIDATOR', 'AIRLINE_AGREEMENT', 'PUBLIC'] as const;
export type FareSource = (typeof FARE_SOURCES)[number];

/* ------------------------------------------------------------------ */
/* Request da busca                                                    */
/* ------------------------------------------------------------------ */

export const IATA_REGEX = /^[A-Z]{3}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Hoje (YYYY-MM-DD) no fuso de São Paulo — regra do produto. */
export function todayIsoSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Data máxima de ida: hoje + 13 meses ("máx 1 ano + 1 mês"). */
export function maxOutboundDateIso(now: Date = new Date()): string {
  const [y, m, d] = todayIsoSaoPaulo(now).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + 13, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export const PassengersSchema = z
  .object({
    adt: z.number().int().min(0).max(9),
    chd: z.number().int().min(0).max(9),
    inf: z.number().int().min(0).max(9),
  })
  .refine((p) => p.inf <= p.adt, {
    message: 'Quantidade de bebês não pode ser maior que adultos (cada bebê precisa de um adulto acompanhante).',
    path: ['inf'],
  })
  .refine((p) => p.adt + p.chd + p.inf >= 1 && p.adt + p.chd + p.inf <= 9, {
    message: 'Total de passageiros deve ser entre 1 e 9',
    path: ['adt'],
  });
export type Passengers = z.infer<typeof PassengersSchema>;

const iata = (label: string) =>
  z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(IATA_REGEX, `${label} inválido (use IATA de 3 letras)`));

export const FlightSearchRequestSchema = z
  .object({
    origin: iata('Origem'),
    destination: iata('Destino'),
    outbound_date: z
      .string()
      .regex(ISO_DATE_REGEX, 'Data de ida em formato inválido (YYYY-MM-DD)')
      .refine((d) => d >= todayIsoSaoPaulo(), 'Data de ida não pode ser no passado')
      .refine((d) => d <= maxOutboundDateIso(), 'Data de ida muito distante (máx 1 ano + 1 mês)'),
    return_date: z.string().regex(ISO_DATE_REGEX).nullable().optional(),
    passengers: PassengersSchema,
    cabin: SearchCabinSchema.default('ALL'),
  })
  .refine((r) => r.origin !== r.destination, {
    message: 'Origem e destino devem ser diferentes',
    path: ['destination'],
  })
  .refine((r) => !r.return_date || r.return_date >= r.outbound_date, {
    message: 'Data de volta não pode ser anterior à ida',
    path: ['return_date'],
  });
export type FlightSearchRequest = z.infer<typeof FlightSearchRequestSchema>;
export type FlightSearchRequestInput = z.input<typeof FlightSearchRequestSchema>;

export const SearchCreatedSchema = z.object({
  search_id: z.string().min(8),
  expires_at: z.string(),
  airlines_estimated: z.array(z.string()),
  progress_pct: z.number().int().min(0).max(100),
});
export type SearchCreated = z.infer<typeof SearchCreatedSchema>;

/* ------------------------------------------------------------------ */
/* Snapshot: voos e ofertas                                            */
/* ------------------------------------------------------------------ */

export const SegmentSchema = z.object({
  from: z.string(),
  to: z.string(),
  departure_at: z.string(), // local, sem fuso: 2026-11-12T21:05:00
  arrival_at: z.string(),
  duration_minutes: z.number().int().optional(),
  operating_airline: z.string(),
  flight_number: z.string(),
  aircraft_code: z.string().nullable().optional(),
  aircraft_name: z.string().nullable().optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const FlightSchema = z.object({
  flight_id: z.string().optional(),
  /** `{cia}-{numero}-{orig}-{dest}-{partida}-{chegada}-{hash}` */
  flight_key: z.string(),
  airline: z.string(),
  airline_name: z.string(),
  flight_number: z.string(),
  origin: z.string(),
  destination: z.string(),
  departure_at: z.string(),
  arrival_at: z.string(),
  duration_minutes: z.number().int(),
  stops_count: z.number().int(),
  requires_airport_change: z.boolean(),
  is_international: z.boolean(),
  aircraft_code: z.string().nullable().optional(),
  aircraft_name: z.string().nullable().optional(),
  segments: z.array(SegmentSchema).default([]),
});
export type Flight = z.infer<typeof FlightSchema>;

export const BaggageSchema = z.object({
  checked_kg: z.number().int().nullable().optional(),
  checked_count: z.number().int().nullable().optional(),
  carry_on_kg: z.number().int().nullable().optional(),
  carry_on_count: z.number().int().nullable().optional(),
});
export type Baggage = z.infer<typeof BaggageSchema>;

export const MoneySchema = z.object({
  /** decimal como string, ex.: "489.54" */
  total_brl: z.string(),
  currency: z.literal('BRL'),
});

export const OfferSchema = z.object({
  offer_id: z.string(),
  fare_group_key: z.string().optional(),
  outbound_flight_key: z.string(),
  return_flight_key: z.string().nullable().optional(),
  cabin: OfferCabinSchema,
  fare_family: z.string().nullable().optional(),
  fare_family_label: z.string().nullable().optional(),
  has_extra_seat: z.boolean().optional(),
  seat_assignment_included: z.boolean().optional(),
  seat_class: SeatClassSchema.optional(),
  change_fee_waived: z.boolean().optional(),
  baggage: BaggageSchema,
  refundable: z.boolean(),
  price: MoneySchema,
  taxes_brl: z.string().optional(),
  expires_at: z.string().optional(),
  /** "a partir de" para ida e volta com esta ida */
  round_trip_from_total_brl: z.string().optional(),
  pair_fixed: z.boolean().optional(),
  is_provisional: z.boolean(),
  replaces_offer_id: z.string().nullable().optional(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const CursorResponseSchema = z
  .object({
    shape: z.literal('normalized'),
    flights: z.record(z.string(), FlightSchema),
    offers: z.array(OfferSchema),
    cursor: z.string(),
    complete: z.boolean(),
    partial: z.boolean().default(false),
    progress_pct: z.number().int().min(0).max(100),
    snapshot_etag: z.union([z.string().regex(/^[0-9a-f]{32}$/), z.literal('')]).optional(),
    degraded: z.boolean().default(false),
    snapshot_unchanged: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.snapshot_unchanged && !s.snapshot_etag) {
      ctx.addIssue({ code: 'custom', message: 'Snapshot inalterado sem identificador', path: ['snapshot_etag'] });
    }
    for (const o of s.offers) {
      if (!s.flights[o.outbound_flight_key]) {
        ctx.addIssue({ code: 'custom', message: 'Oferta referencia voo ausente no snapshot', path: ['offers'] });
        break;
      }
    }
  });
export type CursorResponse = z.infer<typeof CursorResponseSchema>;

/* ------------------------------------------------------------------ */
/* Ida → volta                                                         */
/* ------------------------------------------------------------------ */

export const SelectOutboundRequestSchema = z.object({ outbound_fare_id: z.string().min(1) });
export type SelectOutboundRequest = z.infer<typeof SelectOutboundRequestSchema>;

export const SelectOutboundResponseSchema = z.object({
  phase: z.enum(['ready', 'fetching_return']),
  estimated_seconds: z.number().int().nonnegative(),
  bundle_id: z.string(),
});
export type SelectOutboundResponse = z.infer<typeof SelectOutboundResponseSchema>;

export const ReturnOptionsResponseSchema = z.object({
  search_id: z.string(),
  outbound_fare_id: z.string(),
  flights: z.record(z.string(), FlightSchema),
  offers: z.array(OfferSchema),
  next_cursor: z.string(),
  complete: z.boolean(),
});
export type ReturnOptionsResponse = z.infer<typeof ReturnOptionsResponseSchema>;

/* ------------------------------------------------------------------ */
/* Cotação                                                             */
/* ------------------------------------------------------------------ */

export const QuoteRequestSchema = z.object({
  outbound_fare_id: z.string().min(1),
  return_fare_id: z.string().min(1).nullable().optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const FareSegmentSchema = z.object({
  segment_no: z.number().int(),
  origin_iata: z.string(),
  destination_iata: z.string(),
  departure_at: z.string(),
  arrival_at: z.string(),
  duration_minutes: z.number().int(),
  marketing_carrier_code: z.string(),
  marketing_flight_number: z.string(),
  operating_carrier_code: z.string(),
  equipment_code: z.string().nullable().optional(),
  is_international: z.boolean(),
});

export const FareFlightSchema = z.object({
  flight_id: z.string(),
  airline_code: z.string(),
  flight_number: z.string(),
  origin_iata: z.string(),
  destination_iata: z.string(),
  departure_at: z.string(),
  arrival_at: z.string(),
  duration_minutes: z.number().int(),
  has_connection: z.boolean(),
  stops_count: z.number().int(),
  is_international: z.boolean(),
  requires_airport_change: z.boolean(),
  segments: z.array(FareSegmentSchema),
});

export const FareRulesSchema = z.object({
  refundable: z.boolean(),
  seat_assignment_included: z.boolean(),
  has_codeshare_warning: z.boolean(),
  seat_class: SeatClassSchema,
  change_fee_waived: z.boolean(),
});

export const FareDetailSchema = z.object({
  fare_id: z.string(),
  fare_group_key: z.string(),
  flight: FareFlightSchema,
  cabin: OfferCabinSchema,
  fare_family_label: z.string().nullable(),
  has_extra_seat: z.boolean(),
  baggage: z.object({
    carry_on_count: z.number().int(),
    carry_on_kg: z.number().int(),
    checked_count: z.number().int(),
    checked_kg: z.number().int(),
  }),
  fare_rules: FareRulesSchema,
  total_brl: z.string(),
  taxes_brl: z.string(),
  expires_at: z.string(),
  pair_fixed: z.boolean().optional(),
});
export type FareDetail = z.infer<typeof FareDetailSchema>;

export const PaxSummaryLineSchema = z.object({
  type: PaxTypeSchema,
  count: z.number().int(),
  total_per_pax_brl: z.string(),
  taxes_per_pax_brl: z.string(),
  total_brl: z.string(),
});
export type PaxSummaryLine = z.infer<typeof PaxSummaryLineSchema>;

export const QuoteResponseSchema = z.object({
  quote_id: z.string(),
  search_id: z.string(),
  is_round_trip: z.boolean(),
  outbound: FareDetailSchema,
  return: FareDetailSchema.nullable().optional(),
  summary: z.array(PaxSummaryLineSchema),
  taxes_total_brl: z.string(),
  service_fee_brl: z.string(),
  grand_total_brl: z.string(),
  expires_at: z.string(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

/* ------------------------------------------------------------------ */
/* Helpers de rota do front                                            */
/* ------------------------------------------------------------------ */

export interface SearchRouteParams {
  type: TripType;
  origin: string;
  destination: string;
  outbound_date: string;
  return_date?: string | null;
  passengers: Passengers;
  cabin: SearchCabin;
}

/** `/voos/{o}/{d}/{ida}[/{volta}]/{adt}/{chd}/{inf}/{cabin}` */
export function buildSearchPath(p: SearchRouteParams): string {
  const ret = p.type === 'RT' && p.return_date ? `/${p.return_date}` : '';
  return `/voos/${p.origin}/${p.destination}/${p.outbound_date}${ret}/${p.passengers.adt}/${p.passengers.chd}/${p.passengers.inf}/${p.cabin}`;
}

export function searchKey(p: SearchRouteParams): string {
  return `${p.type}|${p.origin}|${p.destination}|${p.outbound_date}|${p.return_date ?? ''}|${p.passengers.adt}-${p.passengers.chd}-${p.passengers.inf}|${p.cabin}`;
}

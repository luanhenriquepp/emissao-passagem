import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ORDER_DRAFT_TTL_MINUTES,
  ORDER_HARD_TIMEOUT_MINUTES,
  ORDER_MIN_HOURS_BEFORE_DEPARTURE,
  ORDER_STATUS_LABELS,
  PAX_AGE_RANGES,
  PURCHASE_FILTERS,
  ageAt,
  canTransition,
  countryOf,
  normalizeName,
  onlyDigits,
  type BaggagePricing,
  type Contact,
  type CreateOrderRequest,
  type FavoritePassenger,
  type Order,
  type OrderListItem,
  type OrderPassenger,
  type OrderRequirements,
  type OrderStatus,
  type OrdersListResponse,
  type PassengerInput,
  type PaxType,
} from '@milhas/contracts';
import { ApiException } from '../common/api-exception.js';
import { orderDisplayId, recordLocator, uuid } from '../common/ids.js';
import { cents, money, sum, times } from '../common/money.js';
import { hoursUntilLocal, nowIso, plusMinutesIso } from '../common/time.js';
import { SearchService } from '../flights/search.service.js';
import { WalletService } from '../wallet/wallet.service.js';

interface StoredPassenger extends OrderPassenger {
  document_number: string | null;
}

interface StoredOrder extends Omit<Order, 'passengers'> {
  userId: string;
  search_id: string;
  passengers: StoredPassenger[];
  paid_amount_brl: string | null;
}

type Outcome = 'booked' | 'stuck' | 'failed' | 'random';
const ISSUANCE_OUTCOME = (process.env.ISSUANCE_OUTCOME ?? 'random') as Outcome;
const ISSUANCE_DELAY_MS = Number(process.env.ISSUANCE_DELAY_MS ?? 4000);
const STUCK_RESOLVE_MS = Number(process.env.STUCK_RESOLVE_MS ?? 20000);
const EXTRA_BAG_PRICE: Record<'DOMESTIC' | 'INTERNATIONAL', string> = { DOMESTIC: '129.90', INTERNATIONAL: '389.00' };

/**
 * Pedido: nasce DRAFT a partir de tarifas da busca, recebe passageiros e contato,
 * é confirmado (PENDING_PAYMENT), pago com saldo (PAID) e emitido de forma
 * assíncrona (BOOKING → BOOKED | BOOKING_STUCK | FAILED). Expira em 15 min sem pagar.
 */
@Injectable()
export class OrdersService implements OnModuleDestroy {
  private readonly logger = new Logger('Orders');
  private readonly orders = new Map<string, StoredOrder>();
  private readonly favoritesByUser = new Map<string, FavoritePassenger[]>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly search: SearchService,
    private readonly wallet: WalletService,
  ) {}

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
  }

  /* ------------------------------------------------------------ */
  /* Criação                                                        */
  /* ------------------------------------------------------------ */

  create(userId: string, req: CreateOrderRequest): Order {
    const quote = this.search.quote(userId, { outbound_fare_id: req.outbound_fare_id, return_fare_id: req.return_fare_id ?? null });
    const outboundFlight = quote.outbound_ref.flight;
    if (hoursUntilLocal(outboundFlight.departure_at) < ORDER_MIN_HOURS_BEFORE_DEPARTURE) {
      throw new ApiException('ORDER_DEPARTURE_TOO_SOON', `O embarque precisa ser com pelo menos ${ORDER_MIN_HOURS_BEFORE_DEPARTURE} h de antecedência.`);
    }
    const pax = quote.passengers;
    const required: Array<{ type: PaxType; count: number }> = (['ADT', 'CHD', 'INF'] as PaxType[])
      .map((type) => ({ type, count: type === 'ADT' ? pax.adt : type === 'CHD' ? pax.chd : pax.inf }))
      .filter((r) => r.count > 0);
    const passengers: StoredPassenger[] = [];
    let position = 1;
    for (const r of required) {
      for (let i = 0; i < r.count; i++) {
        passengers.push({
          position: position++,
          pax_type: r.type,
          nationality: null,
          document_type: null,
          document_number: null,
          document_number_masked: null,
          first_name: null,
          last_name: null,
          birth_date: null,
          gender: null,
          extra_baggage_outbound_qty: 0,
          extra_baggage_return_qty: 0,
          is_complete: false,
        });
      }
    }
    const international = outboundFlight.is_international;
    const scope = this.scope(outboundFlight.origin, outboundFlight.destination);
    const requirements: OrderRequirements = {
      international,
      destination_scope: scope,
      document_types_allowed: international ? ['PASSPORT', 'CPF'] : ['CPF', 'PASSPORT'],
      preferred_document_type: international ? 'PASSPORT' : 'CPF',
      warnings: international ? ['Confira a validade do passaporte (mínimo 6 meses) e exigências de visto do destino.'] : [],
    };
    const bagPricing = (direction: 'outbound' | 'return'): BaggagePricing | null => {
      const detail = direction === 'outbound' ? quote.outbound : quote.return;
      if (!detail) return null;
      return {
        scope: international ? 'INTERNATIONAL' : 'DOMESTIC',
        window_kind: 'ADVANCE',
        included_checked_count: detail.baggage.checked_count,
        allow_extra_purchase: true,
        max_extra_per_pax: 3,
        price_per_piece_brl: EXTRA_BAG_PRICE[international ? 'INTERNATIONAL' : 'DOMESTIC'],
      };
    };
    const fare = sum(...quote.summary.map((l) => money(cents(l.total_brl) - cents(l.taxes_per_pax_brl) * l.count)));
    const taxes = quote.taxes_total_brl;
    const now = new Date();
    const order: StoredOrder = {
      userId,
      search_id: quote.search_id,
      order_id: uuid(),
      display_id: orderDisplayId(),
      status: 'DRAFT',
      expires_at: plusMinutesIso(ORDER_DRAFT_TTL_MINUTES, now),
      created_at: nowIso(),
      updated_at: nowIso(),
      fare_brl: fare,
      taxes_brl: taxes,
      extras_brl: '0.00',
      service_fee_brl: quote.service_fee_brl,
      total_brl: quote.grand_total_brl,
      outbound: quote.outbound,
      return: quote.return ?? null,
      summary: quote.summary,
      baggage_pricing: { outbound: bagPricing('outbound')!, return: bagPricing('return') },
      passengers_required: required,
      passengers,
      contact: { email: null, phone: null, ddi: null },
      requirements,
      notices: [],
      record_locator: null,
      tickets: [],
      payment: null,
      failure_reason: null,
      paid_amount_brl: null,
    };
    this.orders.set(order.order_id, order);
    this.schedule(() => this.expire(order.order_id), ORDER_DRAFT_TTL_MINUTES * 60_000 + 500);
    this.schedule(() => this.hardTimeout(order.order_id), ORDER_HARD_TIMEOUT_MINUTES * 60_000);
    return this.view(order);
  }

  private scope(origin: string, destination: string): OrderRequirements['destination_scope'] {
    const a = countryOf(origin) ?? 'BR';
    const b = countryOf(destination) ?? 'BR';
    if (a === 'BR' && b === 'BR') return 'DOMESTIC';
    const sa = new Set(['AR', 'CL', 'UY', 'PE', 'CO', 'PY', 'BO', 'EC', 'VE']);
    return sa.has(a === 'BR' ? b : a) ? 'SOUTH_AMERICA' : 'INTERNATIONAL';
  }

  /* ------------------------------------------------------------ */
  /* Leitura                                                        */
  /* ------------------------------------------------------------ */

  get(userId: string, orderId: string): Order {
    return this.view(this.require(userId, orderId));
  }

  private require(userId: string, orderId: string): StoredOrder {
    const order = this.orders.get(orderId);
    if (!order || order.userId !== userId) throw ApiException.notFound('ORDER_NOT_FOUND', 'Pedido não encontrado');
    this.checkExpiry(order);
    return order;
  }

  private checkExpiry(order: StoredOrder): void {
    if ((order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') && new Date(order.expires_at).getTime() <= Date.now()) {
      this.transition(order, 'EXPIRED');
    }
  }

  private view(order: StoredOrder): Order {
    const { userId: _u, search_id: _s, paid_amount_brl: _p, passengers, ...rest } = order;
    return {
      ...rest,
      passengers: passengers.map(({ document_number: _d, ...p }) => p),
    };
  }

  /* ------------------------------------------------------------ */
  /* Passageiros e contato                                          */
  /* ------------------------------------------------------------ */

  setPassenger(userId: string, orderId: string, position: number, input: PassengerInput): Order {
    const order = this.require(userId, orderId);
    this.assertEditable(order);
    const pax = order.passengers.find((p) => p.position === position);
    if (!pax) throw ApiException.notFound('NOT_FOUND', `Passageiro ${position} não existe neste pedido`);
    if (!order.requirements.document_types_allowed.includes(input.document_type)) {
      throw new ApiException('VALIDATION_ERROR', 'Tipo de documento não aceito para esta viagem.', { details: [{ field: 'document_type', message: 'Não permitido' }] });
    }
    const first = normalizeName(input.first_name);
    const last = normalizeName(input.last_name);
    const age = ageAt(input.birth_date, order.outbound.flight.departure_at.slice(0, 10));
    const range = PAX_AGE_RANGES[pax.pax_type];
    if (age < range.min) throw new ApiException('ORDER_PASSENGER_AGE_TOO_YOUNG', `Passageiro ${position} é novo demais para o tipo ${pax.pax_type} na data do voo.`);
    if (age > range.max) throw new ApiException('ORDER_PASSENGER_AGE_TOO_OLD', `Passageiro ${position} é velho demais para o tipo ${pax.pax_type} na data do voo.`);
    const doc = input.document_type === 'CPF' ? onlyDigits(input.document_number) : input.document_number.trim().toUpperCase();
    for (const other of order.passengers) {
      if (other.position === position || !other.is_complete) continue;
      if (other.document_type === input.document_type && other.document_number === doc) {
        throw new ApiException(input.document_type === 'CPF' ? 'ORDER_DUPLICATE_PASSENGER_CPF' : 'ORDER_DUPLICATE_PASSENGER_PASSPORT', 'Documento repetido entre passageiros.');
      }
      if (other.first_name?.toLowerCase() === first.toLowerCase() && other.last_name?.toLowerCase() === last.toLowerCase()) {
        throw new ApiException('ORDER_PASSENGER_NAME_REPEATED', 'Já existe um passageiro com este nome no pedido.');
      }
    }
    const maxBags = order.baggage_pricing.outbound.max_extra_per_pax;
    if (input.extra_baggage_outbound_qty > maxBags || input.extra_baggage_return_qty > maxBags) {
      throw new ApiException('VALIDATION_ERROR', `Máximo de ${maxBags} bagagens extras por passageiro.`);
    }
    Object.assign(pax, {
      nationality: input.nationality,
      document_type: input.document_type,
      document_number: doc,
      document_number_masked: this.maskDocument(input.document_type, doc),
      first_name: first,
      last_name: last,
      birth_date: input.birth_date,
      gender: input.gender,
      extra_baggage_outbound_qty: input.extra_baggage_outbound_qty,
      extra_baggage_return_qty: order.return ? input.extra_baggage_return_qty : 0,
      is_complete: true,
    });
    if (input.save_as_favorite) this.saveFavorite(userId, pax);
    this.recalculate(order);
    if (order.status === 'PENDING_PAYMENT') this.transition(order, 'DRAFT');
    order.updated_at = nowIso();
    return this.view(order);
  }

  setContact(userId: string, orderId: string, contact: Contact): Order {
    const order = this.require(userId, orderId);
    this.assertEditable(order);
    order.contact = { email: contact.email ?? null, phone: contact.phone ?? null, ddi: contact.phone ? (contact.ddi ?? '+55') : null };
    order.updated_at = nowIso();
    return this.view(order);
  }

  confirm(userId: string, orderId: string): Order {
    const order = this.require(userId, orderId);
    if (order.status === 'PENDING_PAYMENT') return this.view(order);
    this.assertEditable(order);
    const incomplete = order.passengers.filter((p) => !p.is_complete);
    if (incomplete.length) throw new ApiException('ORDER_PASSENGERS_INCOMPLETE', `Preencha todos os passageiros (${incomplete.length} pendente${incomplete.length > 1 ? 's' : ''}).`);
    const byType = new Map<PaxType, number>();
    for (const p of order.passengers) byType.set(p.pax_type, (byType.get(p.pax_type) ?? 0) + 1);
    for (const r of order.passengers_required) {
      if ((byType.get(r.type) ?? 0) !== r.count) throw new ApiException('ORDER_PASSENGER_TYPE_COUNT_MISMATCH', 'Quantidade de passageiros por tipo não confere com a busca.');
    }
    this.transition(order, 'PENDING_PAYMENT');
    return this.view(order);
  }

  cancel(userId: string, orderId: string): Order {
    const order = this.require(userId, orderId);
    if (!canTransition(order.status, 'CANCELLED')) throw new ApiException('ORDER_INVALID_TRANSITION', `Pedido em ${ORDER_STATUS_LABELS[order.status].label} não pode ser cancelado.`);
    if (order.status === 'PAID' && order.paid_amount_brl) {
      this.wallet.refund(userId, order.paid_amount_brl, order.order_id, `Estorno do pedido ${order.display_id} (cancelado antes da emissão)`);
    }
    this.transition(order, 'CANCELLED');
    return this.view(order);
  }

  /* ------------------------------------------------------------ */
  /* Pagamento e emissão                                            */
  /* ------------------------------------------------------------ */

  pay(userId: string, orderId: string): Order {
    const order = this.require(userId, orderId);
    if (order.status === 'PAID' || order.status === 'BOOKING' || order.status === 'BOOKED') {
      throw new ApiException('PAYMENT_ALREADY_PROCESSED', 'Este pedido já foi pago.');
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ApiException('ORDER_NOT_DRAFT', order.status === 'DRAFT' ? 'Confirme os dados dos passageiros antes de pagar.' : `Pedido em ${ORDER_STATUS_LABELS[order.status].label} não pode ser pago.`);
    }
    const tx = this.wallet.debit(userId, order.total_brl, order.order_id, `Pagamento do pedido ${order.display_id}`);
    order.paid_amount_brl = order.total_brl;
    order.payment = { method: 'WALLET', paid_at: tx.posted_at, transaction_id: tx.id };
    this.transition(order, 'PAID');
    this.transition(order, 'BOOKING');
    this.schedule(() => this.issue(order.order_id), ISSUANCE_DELAY_MS);
    return this.view(order);
  }

  /** Worker de emissão simulado: resolve o BOOKING conforme ISSUANCE_OUTCOME. */
  private issue(orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'BOOKING') return;
    const outcome = this.pickOutcome();
    if (outcome === 'booked') return this.book(order);
    if (outcome === 'stuck') {
      this.transition(order, 'BOOKING_STUCK');
      order.notices.push('A companhia demorou para confirmar. Nosso time está acompanhando a emissão.');
      this.schedule(() => {
        const o = this.orders.get(orderId);
        if (o && o.status === 'BOOKING_STUCK') this.book(o);
      }, STUCK_RESOLVE_MS);
      return;
    }
    this.fail(order, 'A companhia recusou a emissão (tarifa indisponível). O valor foi estornado para a carteira.');
  }

  private pickOutcome(): Exclude<Outcome, 'random'> {
    if (ISSUANCE_OUTCOME !== 'random') return ISSUANCE_OUTCOME;
    const r = Math.random();
    return r < 0.88 ? 'booked' : r < 0.96 ? 'stuck' : 'failed';
  }

  private book(order: StoredOrder): void {
    order.record_locator = recordLocator();
    order.tickets = order.passengers.map((p) => ({ passenger_position: p.position, eticket: `${order.outbound.flight.airline_code === 'G3' ? '127' : '957'}${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}` }));
    this.transition(order, 'BOOKED');
    this.logger.log(`Pedido ${order.display_id} emitido (${order.record_locator})`);
  }

  private fail(order: StoredOrder, reason: string): void {
    order.failure_reason = reason;
    if (order.paid_amount_brl) this.wallet.refund(order.userId, order.paid_amount_brl, order.order_id, `Estorno do pedido ${order.display_id} (falha na emissão)`);
    this.transition(order, 'FAILED');
  }

  private expire(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order && (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT')) this.transition(order, 'EXPIRED');
  }

  private hardTimeout(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order && (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT')) this.transition(order, 'EXPIRED');
  }

  /* ------------------------------------------------------------ */
  /* Listagem (Minhas compras)                                      */
  /* ------------------------------------------------------------ */

  list(userId: string, opts: { page: number; per_page: number; filter: string; q?: string }): OrdersListResponse {
    const all = [...this.orders.values()].filter((o) => o.userId === userId);
    for (const o of all) this.checkExpiry(o);
    const filter = PURCHASE_FILTERS[opts.filter] ?? PURCHASE_FILTERS.all;
    const q = opts.q?.trim().toLowerCase();
    const items = all
      .filter((o) => filter.statuses.includes(o.status))
      .filter((o) => !q || [o.display_id, o.record_locator ?? '', o.outbound.flight.origin_iata, o.outbound.flight.destination_iata, ...o.passengers.map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => this.listItem(o));
    const since = Date.now() - 30 * 86_400_000;
    const recent = all.filter((o) => new Date(o.created_at).getTime() >= since);
    const total = items.length;
    const start = (opts.page - 1) * opts.per_page;
    return {
      metrics: {
        issued_count: recent.filter((o) => o.status === 'BOOKED').length,
        total_paid_brl: sum(...recent.filter((o) => o.paid_amount_brl && o.status !== 'FAILED' && o.status !== 'CANCELLED').map((o) => o.paid_amount_brl!)),
        in_emission_count: all.filter((o) => o.status === 'PAID' || o.status === 'BOOKING' || o.status === 'BOOKING_STUCK').length,
        period: 'last_30_days',
      },
      items: items.slice(start, start + opts.per_page),
      pagination: { page: opts.page, per_page: opts.per_page, total, total_pages: Math.max(1, Math.ceil(total / opts.per_page)) },
    };
  }

  private listItem(o: StoredOrder): OrderListItem {
    const leg = (d: Order['outbound']) => ({ airline_code: d.flight.airline_code, origin_iata: d.flight.origin_iata, destination_iata: d.flight.destination_iata, departure_at: d.flight.departure_at, arrival_at: d.flight.arrival_at });
    const names = o.passengers.filter((p) => p.first_name).map((p) => `${p.first_name} ${p.last_name?.[0] ?? ''}.`);
    return {
      order_id: o.order_id,
      display_id: o.display_id,
      status: o.status,
      status_label: ORDER_STATUS_LABELS[o.status].label,
      record_locator: o.record_locator,
      created_at: o.created_at,
      outbound: leg(o.outbound),
      return: o.return ? leg(o.return) : null,
      passengers_count: o.passengers.length,
      passengers_summary: names.length ? (names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]) : `${o.passengers.length} passageiro${o.passengers.length > 1 ? 's' : ''}`,
      fare_brl: o.fare_brl,
      taxes_brl: o.taxes_brl,
      extras_brl: o.extras_brl,
      service_fee_brl: o.service_fee_brl,
      total_brl: o.total_brl,
    };
  }

  favorites(userId: string): FavoritePassenger[] {
    return this.favoritesByUser.get(userId) ?? [];
  }

  /* ------------------------------------------------------------ */
  /* Internos                                                       */
  /* ------------------------------------------------------------ */

  private assertEditable(order: StoredOrder): void {
    if (order.status !== 'DRAFT' && order.status !== 'PENDING_PAYMENT') {
      const code: Order['status'] = order.status;
      throw new ApiException(code === 'EXPIRED' ? 'ORDER_EXPIRED' : 'ORDER_NOT_DRAFT', code === 'EXPIRED' ? 'Este pedido expirou. Refaça a busca.' : `Pedido em ${ORDER_STATUS_LABELS[code].label} não pode ser alterado.`);
    }
  }

  private transition(order: StoredOrder, to: OrderStatus): void {
    if (!canTransition(order.status, to)) throw new ApiException('ORDER_INVALID_TRANSITION', `Transição ${order.status} → ${to} não permitida.`);
    order.status = to;
    order.updated_at = nowIso();
  }

  private recalculate(order: StoredOrder): void {
    const bags = order.passengers.reduce((acc, p) => acc + p.extra_baggage_outbound_qty * cents(order.baggage_pricing.outbound.price_per_piece_brl) + (order.baggage_pricing.return ? p.extra_baggage_return_qty * cents(order.baggage_pricing.return.price_per_piece_brl) : 0), 0);
    order.extras_brl = money(bags);
    order.total_brl = sum(order.fare_brl, order.taxes_brl, order.extras_brl, order.service_fee_brl);
  }

  private maskDocument(type: 'CPF' | 'PASSPORT', doc: string): string {
    if (type === 'CPF') return `${doc.slice(0, 3)}.***.***-${doc.slice(9)}`;
    return `${doc.slice(0, 2)}${'*'.repeat(Math.max(0, doc.length - 4))}${doc.slice(-2)}`;
  }

  private saveFavorite(userId: string, p: StoredPassenger): void {
    const list = this.favoritesByUser.get(userId) ?? [];
    const id = `fav_${p.document_type}_${p.document_number}`;
    const fav: FavoritePassenger = {
      id,
      first_name: p.first_name!,
      last_name: p.last_name!,
      birth_date: p.birth_date!,
      gender: p.gender!,
      document_type: p.document_type!,
      document_number_masked: p.document_number_masked!,
      nationality: p.nationality ?? 'BR',
    };
    const idx = list.findIndex((f) => f.id === id);
    if (idx >= 0) list[idx] = fav;
    else list.push(fav);
    this.favoritesByUser.set(userId, list);
  }

  private schedule(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn();
      } catch (err) {
        this.logger.error((err as Error).message);
      }
    }, ms);
    t.unref();
    this.timers.add(t);
  }

  /** Extras: preço unitário por bagagem para o front calcular antes do PUT. */
  static extraBagPrice(scope: 'DOMESTIC' | 'INTERNATIONAL'): string {
    return EXTRA_BAG_PRICE[scope];
  }

  /** Mantido para testes: quantas horas o pedido ainda tem. */
  minutesLeft(order: Order): number {
    return Math.max(0, Math.round((new Date(order.expires_at).getTime() - Date.now()) / 60000));
  }

  /** Usado só em testes para verificar valores. */
  static total(order: Order): string {
    return times(order.total_brl, 1);
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  expandLocation,
  searchKey,
  type CursorResponse,
  type FareDetail,
  type FareSource,
  type Flight,
  type FlightSearchRequest,
  type Offer,
  type PaxSummaryLine,
  type QuoteRequest,
  type QuoteResponse,
  type ReturnOptionsResponse,
  type SelectOutboundResponse,
} from '@milhas/contracts';
import { ApiException } from '../common/api-exception.js';
import { md5, nextCursor, uuid } from '../common/ids.js';
import { cents, money, sum, times } from '../common/money.js';
import { plusMinutesIso } from '../common/time.js';
import { DEFAULT_SOURCES, MockFareSource, type FareSourceAdapter, type SourceBatch, type SourceQuery } from './sources/mock-source.js';
import { SearchStore, type FareRef, type ReturnBundle, type SearchRecord, type SnapshotState } from './search.store.js';

export const SEARCH_TTL_MINUTES = 20;
export const QUOTE_TTL_MINUTES = 10;

export interface StoredQuote extends QuoteResponse {
  userId: string;
  outbound_ref: FareRef;
  return_ref: FareRef | null;
  passengers: FlightSearchRequest['passengers'];
}

/**
 * Motor de busca: cria a pesquisa, agrega as fontes em paralelo num snapshot
 * incremental (cursor + etag), resolve ida → volta e cota tarifas.
 */
@Injectable()
export class SearchService implements OnModuleDestroy {
  private readonly logger = new Logger('Search');
  private readonly store = new SearchStore();
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly sources: FareSourceAdapter[];
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    const names = (process.env.FARE_SOURCES?.split(',').map((s) => s.trim()).filter(Boolean) as FareSource[] | undefined) ?? DEFAULT_SOURCES;
    this.sources = names.map((n) => new MockFareSource(n));
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    for (const id of [...this.store.searches.keys()]) this.store.remove(id);
  }

  /* ------------------------------------------------------------ */
  /* Criação / dedup                                                */
  /* ------------------------------------------------------------ */

  create(userId: string, params: FlightSearchRequest): { search: SearchRecord; reused: boolean } {
    const origins = expandLocation(params.origin);
    const destinations = expandLocation(params.destination);
    if (!origins.length) throw new ApiException('VALIDATION_ERROR', 'Origem desconhecida', { details: [{ field: 'origin', message: 'Aeroporto não encontrado' }] });
    if (!destinations.length) throw new ApiException('VALIDATION_ERROR', 'Destino desconhecido', { details: [{ field: 'destination', message: 'Aeroporto não encontrado' }] });

    const key = searchKey({
      type: params.return_date ? 'RT' : 'OW',
      origin: params.origin,
      destination: params.destination,
      outbound_date: params.outbound_date,
      return_date: params.return_date ?? null,
      passengers: params.passengers,
      cabin: params.cabin,
    });
    const existingId = this.store.byKey.get(`${userId}|${key}`);
    const existing = existingId ? this.store.get(existingId) : undefined;
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) return { search: existing, reused: true };

    const expiresAt = plusMinutesIso(SEARCH_TTL_MINUTES);
    const search: SearchRecord = {
      id: uuid(),
      userId,
      key,
      params,
      origins,
      destinations,
      createdAt: Date.now(),
      expiresAt,
      airlinesEstimated: [],
      bundles: new Map(),
      ...this.emptySnapshot(this.sources.length),
    };
    this.store.searches.set(search.id, search);
    this.store.byKey.set(`${userId}|${key}`, search.id);
    this.runSources(search, search, { origins, destinations, date: params.outbound_date, cabin: params.cabin, roundTrip: !!params.return_date, expiresAt }, 'outbound');
    return { search, reused: false };
  }

  private emptySnapshot(sourcesTotal: number): SnapshotState {
    return { flights: new Map(), offers: new Map(), cursor: nextCursor(), etag: '', sourcesTotal, sourcesDone: 0, sourcesStarted: 0, sourcesFailed: [], complete: sourcesTotal === 0, abort: new AbortController() };
  }

  /** Roda todas as fontes em paralelo, aplicando cada lote ao snapshot. */
  private runSources(
    search: SearchRecord,
    target: SnapshotState,
    query: SourceQuery,
    direction: 'outbound' | 'return',
    bundleId?: string,
    pairedOutboundFlightKey?: string,
  ): void {
    const apply = (batch: SourceBatch) => {
      for (const f of batch.flights) target.flights.set(f.flight_key, f);
      for (const raw of batch.offers) {
        // As fontes sempre descrevem a oferta pelo voo que ela cobre (outbound_flight_key).
        // No bundle de volta, a oferta é pareada com a ida escolhida: o voo coberto vira
        // return_flight_key e outbound_flight_key passa a apontar para a ida.
        const flight = target.flights.get(raw.outbound_flight_key);
        const o: Offer =
          direction === 'return'
            ? { ...raw, outbound_flight_key: pairedOutboundFlightKey ?? raw.outbound_flight_key, return_flight_key: raw.outbound_flight_key, pair_fixed: true }
            : raw;
        target.offers.set(o.offer_id, o);
        if (flight) this.store.fares.set(o.offer_id, { searchId: search.id, direction, offer: o, flight, bundleId });
      }
      this.bump(target);
    };
    const finish = () => {
      target.sourcesDone += 1;
      if (target.sourcesDone >= target.sourcesTotal) {
        target.complete = true;
        this.bump(target);
      }
    };
    for (const source of this.sources) {
      let started = false;
      const applyCounting = (batch: SourceBatch) => {
        if (!started) {
          started = true;
          target.sourcesStarted += 1;
        }
        apply(batch);
      };
      source
        .search(query, applyCounting, target.abort.signal)
        .catch((err: Error) => {
          this.logger.warn(`Fonte ${source.name} falhou: ${err.message}`);
          target.sourcesFailed.push(source.name);
        })
        .finally(finish);
    }
    search.airlinesEstimated = [...new Set([...search.flights.values()].map((f) => f.airline))];
  }

  private bump(target: SnapshotState): void {
    target.cursor = nextCursor();
    const sig = [...target.offers.values()].map((o) => `${o.offer_id}:${o.price.total_brl}`).sort().join('|');
    target.etag = md5(`${sig}|${target.complete ? 1 : 0}`);
  }

  /* ------------------------------------------------------------ */
  /* Leitura do snapshot                                            */
  /* ------------------------------------------------------------ */

  private require(userId: string, id: string): SearchRecord {
    const search = this.store.get(id);
    if (!search || search.userId !== userId) throw ApiException.notFound('SEARCH_NOT_FOUND', 'Busca não encontrada');
    if (new Date(search.expiresAt).getTime() <= Date.now()) {
      this.store.remove(id);
      throw new ApiException('SEARCH_EXPIRED', 'Esta busca expirou. Faça uma nova busca.');
    }
    return search;
  }

  snapshot(userId: string, id: string, etag?: string): CursorResponse {
    const s = this.require(userId, id);
    const progress = this.progress(s);
    const unchanged = !!etag && etag === s.etag;
    return {
      shape: 'normalized',
      flights: unchanged ? {} : Object.fromEntries(s.flights),
      offers: unchanged ? [] : [...s.offers.values()],
      cursor: s.cursor,
      complete: s.complete,
      partial: !s.complete,
      progress_pct: progress,
      snapshot_etag: s.etag || '',
      degraded: s.sourcesFailed.length > 0,
      snapshot_unchanged: unchanged,
    };
  }

  private progress(state: SnapshotState): number {
    if (state.complete) return 100;
    const partial = Math.max(0, state.sourcesStarted - state.sourcesDone) * 0.5;
    return Math.min(99, Math.round(((state.sourcesDone + partial) / Math.max(1, state.sourcesTotal)) * 100));
  }

  created(search: SearchRecord) {
    return { search_id: search.id, expires_at: search.expiresAt, airlines_estimated: search.airlinesEstimated, progress_pct: this.progress(search) };
  }

  /* ------------------------------------------------------------ */
  /* Ida → volta                                                    */
  /* ------------------------------------------------------------ */

  selectOutbound(userId: string, id: string, outboundFareId: string): SelectOutboundResponse {
    const s = this.require(userId, id);
    const ref = this.store.fares.get(outboundFareId);
    if (!ref || ref.searchId !== id || ref.direction !== 'outbound') throw ApiException.notFound('FLIGHT_QUOTE_FARE_NOT_FOUND', 'Tarifa de ida não encontrada nesta busca');
    if (!s.params.return_date) return { phase: 'ready', estimated_seconds: 0, bundle_id: 'one-way' };
    let bundle = s.bundles.get(outboundFareId);
    if (!bundle) {
      bundle = {
        bundle_id: uuid(),
        outbound_fare_id: outboundFareId,
        airline: ref.flight.airline,
        ...this.emptySnapshot(this.sources.length),
      };
      s.bundles.set(outboundFareId, bundle);
      this.runSources(
        s,
        bundle,
        { origins: s.destinations, destinations: s.origins, date: s.params.return_date, cabin: s.params.cabin, airlines: [ref.flight.airline], roundTrip: false, expiresAt: s.expiresAt },
        'return',
        bundle.bundle_id,
        ref.flight.flight_key,
      );
    }
    return { phase: bundle.complete ? 'ready' : 'fetching_return', estimated_seconds: bundle.complete ? 0 : 4, bundle_id: bundle.bundle_id };
  }

  returnOptions(userId: string, id: string, outboundFareId: string): ReturnOptionsResponse {
    const s = this.require(userId, id);
    const bundle = s.bundles.get(outboundFareId);
    if (!bundle) throw new ApiException('OUTBOUND_NOT_SELECTED', 'Selecione o voo de ida antes de ver as opções de volta.');
    return {
      search_id: s.id,
      outbound_fare_id: outboundFareId,
      flights: Object.fromEntries(bundle.flights),
      offers: [...bundle.offers.values()],
      next_cursor: bundle.cursor,
      complete: bundle.complete,
    };
  }

  /* ------------------------------------------------------------ */
  /* Cotação                                                        */
  /* ------------------------------------------------------------ */

  fareRef(fareId: string): FareRef {
    const ref = this.store.fares.get(fareId);
    if (!ref) throw ApiException.notFound('FLIGHT_QUOTE_FARE_NOT_FOUND', 'Tarifa não encontrada ou busca expirada');
    const search = this.store.get(ref.searchId);
    if (!search || new Date(search.expiresAt).getTime() <= Date.now()) throw new ApiException('FLIGHT_QUOTE_FARE_EXPIRED', 'Esta tarifa expirou. Refaça a busca.');
    return ref;
  }

  quote(userId: string, req: QuoteRequest): StoredQuote {
    const outbound = this.fareRef(req.outbound_fare_id);
    const search = this.require(userId, outbound.searchId);
    let ret: FareRef | null = null;
    if (search.params.return_date) {
      if (!req.return_fare_id) throw new ApiException('VALIDATION_ERROR', 'Busca de ida e volta exige a tarifa de volta.', { details: [{ field: 'return_fare_id', message: 'Obrigatório' }] });
      ret = this.fareRef(req.return_fare_id);
      if (ret.searchId !== search.id || ret.direction !== 'return') throw new ApiException('FLIGHT_QUOTE_FARE_NOT_FOUND', 'Tarifa de volta não pertence a esta busca.');
      if (ret.flight.airline !== outbound.flight.airline) throw new ApiException('ORDER_QUOTE_INVALID', 'Ida e volta precisam ser da mesma companhia.');
    }
    const pax = search.params.passengers;
    const summary = this.summarize(outbound.offer, ret?.offer ?? null, pax);
    const grand = sum(...summary.map((l) => l.total_brl));
    const taxesTotal = sum(...summary.map((l) => times(l.taxes_per_pax_brl, l.count)));
    const quote: StoredQuote = {
      quote_id: `qt_${md5(uuid()).slice(0, 32)}`,
      search_id: search.id,
      is_round_trip: !!ret,
      outbound: this.fareDetail(outbound),
      return: ret ? this.fareDetail(ret) : null,
      summary,
      taxes_total_brl: taxesTotal,
      service_fee_brl: '0.00',
      grand_total_brl: grand,
      expires_at: plusMinutesIso(QUOTE_TTL_MINUTES),
      userId,
      outbound_ref: outbound,
      return_ref: ret,
      passengers: pax,
    };
    this.quotes.set(quote.quote_id, quote);
    return quote;
  }

  /** Linhas por tipo de passageiro: CHD paga 75% da tarifa + taxas; INF 10% da tarifa sem taxas. */
  summarize(outbound: Offer, ret: Offer | null, pax: FlightSearchRequest['passengers']): PaxSummaryLine[] {
    const fareOf = (o: Offer) => cents(o.price.total_brl) - cents(o.taxes_brl ?? '0');
    const taxOf = (o: Offer) => cents(o.taxes_brl ?? '0');
    const fare = fareOf(outbound) + (ret ? fareOf(ret) : 0);
    const tax = taxOf(outbound) + (ret ? taxOf(ret) : 0);
    const lines: PaxSummaryLine[] = [];
    const push = (type: PaxSummaryLine['type'], count: number, fareFactor: number, taxFactor: number) => {
      if (!count) return;
      const perPaxTax = Math.round(tax * taxFactor);
      const perPax = Math.round(fare * fareFactor) + perPaxTax;
      lines.push({ type, count, total_per_pax_brl: money(perPax), taxes_per_pax_brl: money(perPaxTax), total_brl: money(perPax * count) });
    };
    push('ADT', pax.adt, 1, 1);
    push('CHD', pax.chd, 0.75, 1);
    push('INF', pax.inf, 0.1, 0);
    return lines;
  }

  fareDetail(ref: FareRef): FareDetail {
    const { offer, flight } = ref;
    return {
      fare_id: offer.offer_id,
      fare_group_key: offer.fare_group_key ?? `grp_${offer.offer_id}`,
      flight: {
        flight_id: flight.flight_key,
        airline_code: flight.airline,
        flight_number: flight.flight_number,
        origin_iata: flight.origin,
        destination_iata: flight.destination,
        departure_at: flight.departure_at,
        arrival_at: flight.arrival_at,
        duration_minutes: flight.duration_minutes,
        has_connection: flight.stops_count > 0,
        stops_count: flight.stops_count,
        is_international: flight.is_international,
        requires_airport_change: flight.requires_airport_change,
        segments: flight.segments.map((s, i) => ({
          segment_no: i + 1,
          origin_iata: s.from,
          destination_iata: s.to,
          departure_at: s.departure_at,
          arrival_at: s.arrival_at,
          duration_minutes: s.duration_minutes ?? 0,
          marketing_carrier_code: flight.airline,
          marketing_flight_number: s.flight_number,
          operating_carrier_code: s.operating_airline,
          equipment_code: s.aircraft_code ?? null,
          is_international: flight.is_international,
        })),
      },
      cabin: offer.cabin,
      fare_family_label: offer.fare_family_label ?? null,
      has_extra_seat: offer.has_extra_seat ?? false,
      baggage: {
        carry_on_count: offer.baggage.carry_on_count ?? 1,
        carry_on_kg: offer.baggage.carry_on_kg ?? 10,
        checked_count: offer.baggage.checked_count ?? 0,
        checked_kg: offer.baggage.checked_kg ?? 0,
      },
      fare_rules: {
        refundable: offer.refundable,
        seat_assignment_included: offer.seat_assignment_included ?? false,
        has_codeshare_warning: false,
        seat_class: offer.seat_class ?? 'NONE',
        change_fee_waived: offer.change_fee_waived ?? false,
      },
      total_brl: offer.price.total_brl,
      taxes_brl: offer.taxes_brl ?? '0.00',
      expires_at: offer.expires_at ?? plusMinutesIso(QUOTE_TTL_MINUTES),
      pair_fixed: offer.pair_fixed ?? false,
    };
  }

  getQuote(quoteId: string): StoredQuote | undefined {
    return this.quotes.get(quoteId);
  }

  searchParamsOf(searchId: string): FlightSearchRequest | undefined {
    return this.store.get(searchId)?.params;
  }

  flightOf(fareId: string): Flight | undefined {
    return this.store.fares.get(fareId)?.flight;
  }

  private sweep(): void {
    const now = Date.now();
    for (const s of [...this.store.searches.values()]) if (new Date(s.expiresAt).getTime() <= now) this.store.remove(s.id);
    for (const [id, q] of this.quotes) if (new Date(q.expires_at).getTime() <= now) this.quotes.delete(id);
  }
}

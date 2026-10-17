import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  searchKey,
  type CursorResponse,
  type Flight,
  type FlightSearchRequestInput,
  type Offer,
  type Order,
  type QuoteResponse,
  type ReturnOptionsResponse,
  type SearchCreated,
  type SearchRouteParams,
  type SelectOutboundResponse,
} from '@milhas/contracts';
import { ApiClient } from '../../../core/api-client.service';
import { ApiError } from '../../../core/api-error';
import { newIdempotencyKey } from '../../../core/idempotency';

const POLL_MS = 1200;
const RETURN_POLL_MS = 1000;

export type Stage = 'outbound' | 'return' | 'summary';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Estado de uma busca: criação, polling incremental do snapshot, seleção
 * ida → volta, cotação e criação do pedido. Uma instância por página de resultados.
 */
@Injectable()
export class SearchStore implements OnDestroy {
  private readonly api = inject(ApiClient);

  // --- busca ---------------------------------------------------------------
  readonly params = signal<SearchRouteParams | null>(null);
  readonly searchId = signal<string | null>(null);
  readonly expiresAt = signal<string | null>(null);
  readonly airlinesEstimated = signal<string[]>([]);
  readonly flights = signal<Record<string, Flight>>({});
  readonly offers = signal<Offer[]>([]);
  readonly progress = signal(0);
  readonly complete = signal(false);
  readonly partial = signal(false);
  readonly degraded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  // --- ida → volta ----------------------------------------------------------
  readonly selectedOutboundFareId = signal<string | null>(null);
  readonly returnFlights = signal<Record<string, Flight>>({});
  readonly returnOffers = signal<Offer[]>([]);
  readonly returnLoading = signal(false);
  readonly returnComplete = signal(false);
  readonly returnError = signal<ApiError | null>(null);
  readonly selectedReturnFareId = signal<string | null>(null);

  // --- cotação / pedido -----------------------------------------------------
  readonly quote = signal<QuoteResponse | null>(null);
  readonly quoteLoading = signal(false);
  readonly quoteError = signal<ApiError | null>(null);
  readonly creatingOrder = signal(false);
  readonly orderError = signal<ApiError | null>(null);

  readonly isRoundTrip = computed(() => this.params()?.type === 'RT');
  readonly stage = computed<Stage>(() => {
    if (!this.selectedOutboundFareId()) return 'outbound';
    if (this.isRoundTrip() && !this.selectedReturnFareId()) return 'return';
    return 'summary';
  });
  readonly selectedOutbound = computed(() => this.offers().find((o) => o.offer_id === this.selectedOutboundFareId()) ?? null);
  readonly selectedReturn = computed(() => this.returnOffers().find((o) => o.offer_id === this.selectedReturnFareId()) ?? null);

  private runToken = 0;
  private returnToken = 0;
  private cursor = '0';
  private etag = '';
  private currentKey: string | null = null;
  private orderIdempotencyKey: string | null = null;

  /** Inicia (ou reinicia, se os parâmetros mudaram) a busca. */
  async start(params: SearchRouteParams, force = false): Promise<void> {
    const key = searchKey(params);
    if (!force && key === this.currentKey && !this.error()) return;
    this.currentKey = key;
    const token = ++this.runToken;
    this.resetAll();
    this.params.set(params);
    this.loading.set(true);

    const body: FlightSearchRequestInput = {
      origin: params.origin,
      destination: params.destination,
      outbound_date: params.outbound_date,
      return_date: params.type === 'RT' ? (params.return_date ?? null) : null,
      passengers: params.passengers,
      cabin: params.cabin,
    };
    try {
      const created = await this.api.post<SearchCreated>('/flights/search', body);
      if (token !== this.runToken) return;
      this.searchId.set(created.search_id);
      this.expiresAt.set(created.expires_at);
      this.airlinesEstimated.set(created.airlines_estimated ?? []);
      this.progress.set(created.progress_pct ?? 0);
      await this.pollLoop(token);
    } catch (e) {
      if (token !== this.runToken) return;
      this.error.set(ApiError.from(e));
      this.loading.set(false);
    }
  }

  retry(): void {
    const p = this.params();
    if (p) void this.start(p, true);
  }

  /** Seleciona a tarifa de ida; em RT busca as voltas pareadas, em OW já cota. */
  async selectOutbound(fareId: string): Promise<void> {
    this.selectedOutboundFareId.set(fareId);
    this.selectedReturnFareId.set(null);
    this.quote.set(null);
    this.quoteError.set(null);
    this.orderError.set(null);
    this.orderIdempotencyKey = null;
    if (!this.isRoundTrip()) {
      await this.requestQuote();
      return;
    }
    await this.loadReturnOptions(fareId);
  }

  changeOutbound(): void {
    ++this.returnToken;
    this.selectedOutboundFareId.set(null);
    this.selectedReturnFareId.set(null);
    this.returnFlights.set({});
    this.returnOffers.set([]);
    this.returnComplete.set(false);
    this.returnLoading.set(false);
    this.returnError.set(null);
    this.quote.set(null);
  }

  async selectReturn(fareId: string): Promise<void> {
    this.selectedReturnFareId.set(fareId);
    this.orderError.set(null);
    this.orderIdempotencyKey = null;
    await this.requestQuote();
  }

  changeReturn(): void {
    this.selectedReturnFareId.set(null);
    this.quote.set(null);
  }

  async requestQuote(): Promise<void> {
    const outbound = this.selectedOutboundFareId();
    if (!outbound) return;
    const returnId = this.isRoundTrip() ? this.selectedReturnFareId() : null;
    if (this.isRoundTrip() && !returnId) return;
    this.quoteLoading.set(true);
    this.quoteError.set(null);
    try {
      const quote = await this.api.post<QuoteResponse>('/flights/quote', { outbound_fare_id: outbound, return_fare_id: returnId ?? undefined });
      this.quote.set(quote);
    } catch (e) {
      this.quoteError.set(ApiError.from(e));
    } finally {
      this.quoteLoading.set(false);
    }
  }

  /** Cria o pedido DRAFT a partir das tarifas escolhidas (idempotente por tentativa). */
  async createOrder(): Promise<Order | null> {
    const outbound = this.selectedOutboundFareId();
    if (!outbound) return null;
    if (!this.orderIdempotencyKey) this.orderIdempotencyKey = newIdempotencyKey();
    this.creatingOrder.set(true);
    this.orderError.set(null);
    try {
      const order = await this.api.post<Order>(
        '/orders',
        { outbound_fare_id: outbound, return_fare_id: this.isRoundTrip() ? this.selectedReturnFareId() : undefined },
        { idempotencyKey: this.orderIdempotencyKey },
      );
      return order;
    } catch (e) {
      const err = ApiError.from(e);
      this.orderError.set(err);
      // Chave nova para a próxima tentativa quando o servidor recusou o corpo/chave.
      if (err.code.startsWith('ORDER_IDEMPOTENCY')) this.orderIdempotencyKey = null;
      return null;
    } finally {
      this.creatingOrder.set(false);
    }
  }

  stop(): void {
    ++this.runToken;
    ++this.returnToken;
    this.loading.set(false);
    this.returnLoading.set(false);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ------------------------------------------------------------------------

  private resetAll(): void {
    this.searchId.set(null);
    this.expiresAt.set(null);
    this.airlinesEstimated.set([]);
    this.flights.set({});
    this.offers.set([]);
    this.progress.set(0);
    this.complete.set(false);
    this.partial.set(false);
    this.degraded.set(false);
    this.error.set(null);
    this.cursor = '0';
    this.etag = '';
    this.changeOutbound();
    this.quoteError.set(null);
    this.orderError.set(null);
    this.orderIdempotencyKey = null;
  }

  private async pollLoop(token: number): Promise<void> {
    const id = this.searchId();
    if (!id) return;
    while (token === this.runToken) {
      let res: CursorResponse;
      try {
        res = await this.api.get<CursorResponse>(`/flights/search/${encodeURIComponent(id)}`, {
          cursor: this.cursor,
          shape: 'normalized',
          snapshot_etag: this.etag || undefined,
        });
      } catch (e) {
        if (token !== this.runToken) return;
        this.error.set(ApiError.from(e));
        this.loading.set(false);
        return;
      }
      if (token !== this.runToken) return;
      this.applySnapshot(res);
      if (res.complete) {
        this.loading.set(false);
        return;
      }
      await sleep(POLL_MS);
    }
  }

  private applySnapshot(res: CursorResponse): void {
    this.cursor = res.cursor || this.cursor;
    if (res.snapshot_etag) this.etag = res.snapshot_etag;
    this.progress.set(res.progress_pct);
    this.complete.set(res.complete);
    this.partial.set(res.partial);
    this.degraded.set(res.degraded);
    if (res.snapshot_unchanged) return; // mantém o snapshot anterior
    // Mescla por chave/offer_id: funciona tanto para snapshots completos quanto para deltas,
    // e aplica `replaces_offer_id` (oferta provisória substituída pela definitiva).
    this.flights.set(mergeFlights(this.flights(), res.flights));
    this.offers.set(mergeOffers(this.offers(), res.offers));
  }

  private async loadReturnOptions(outboundFareId: string): Promise<void> {
    const id = this.searchId();
    if (!id) return;
    const token = ++this.returnToken;
    this.returnFlights.set({});
    this.returnOffers.set([]);
    this.returnComplete.set(false);
    this.returnError.set(null);
    this.returnLoading.set(true);
    try {
      const sel = await this.api.post<SelectOutboundResponse>(`/flights/search/${encodeURIComponent(id)}/select-outbound`, {
        outbound_fare_id: outboundFareId,
      });
      if (token !== this.returnToken) return;
      let cursor = '0';
      const waitMs = sel.phase === 'fetching_return' ? Math.min(3000, Math.max(300, (sel.estimated_seconds ?? 1) * 250)) : 0;
      if (waitMs) await sleep(waitMs);
      while (token === this.returnToken) {
        const res = await this.api.get<ReturnOptionsResponse>(`/flights/search/${encodeURIComponent(id)}/return-options`, {
          outbound_fare_id: outboundFareId,
          cursor,
        });
        if (token !== this.returnToken) return;
        this.mergeReturn(res);
        cursor = res.next_cursor || cursor;
        if (res.complete) break;
        await sleep(RETURN_POLL_MS);
      }
      if (token === this.returnToken) {
        this.returnComplete.set(true);
        this.returnLoading.set(false);
      }
    } catch (e) {
      if (token !== this.returnToken) return;
      this.returnError.set(ApiError.from(e));
      this.returnLoading.set(false);
    }
  }

  private mergeReturn(res: ReturnOptionsResponse): void {
    this.returnFlights.set(mergeFlights(this.returnFlights(), res.flights));
    this.returnOffers.set(mergeOffers(this.returnOffers(), res.offers));
  }
}

function mergeFlights(current: Record<string, Flight>, incoming: Record<string, Flight>): Record<string, Flight> {
  if (Object.keys(incoming).length === 0) return current;
  return { ...current, ...incoming };
}

function mergeOffers(current: Offer[], incoming: Offer[]): Offer[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((o) => [o.offer_id, o]));
  for (const o of incoming) {
    if (o.replaces_offer_id) byId.delete(o.replaces_offer_id);
    byId.set(o.offer_id, o);
  }
  return [...byId.values()];
}

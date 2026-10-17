import type { FareSource, Flight, FlightSearchRequest, Offer } from '@milhas/contracts';

export interface SnapshotState {
  flights: Map<string, Flight>;
  offers: Map<string, Offer>;
  cursor: string;
  etag: string;
  sourcesTotal: number;
  sourcesDone: number;
  /** fontes que já entregaram pelo menos um lote (contam meio ponto no progresso) */
  sourcesStarted: number;
  sourcesFailed: FareSource[];
  complete: boolean;
  abort: AbortController;
}

export interface ReturnBundle extends SnapshotState {
  bundle_id: string;
  outbound_fare_id: string;
  airline: string;
}

export interface SearchRecord extends SnapshotState {
  id: string;
  userId: string;
  key: string;
  params: FlightSearchRequest;
  origins: string[];
  destinations: string[];
  createdAt: number;
  expiresAt: string;
  airlinesEstimated: string[];
  bundles: Map<string, ReturnBundle>;
}

export interface FareRef {
  searchId: string;
  direction: 'outbound' | 'return';
  offer: Offer;
  flight: Flight;
  bundleId?: string;
}

/** Guarda buscas, bundles de volta e um índice global de tarifas por id. */
export class SearchStore {
  readonly searches = new Map<string, SearchRecord>();
  readonly byKey = new Map<string, string>(); // `${userId}|${key}` → searchId
  readonly fares = new Map<string, FareRef>();

  get(id: string): SearchRecord | undefined {
    return this.searches.get(id);
  }

  remove(id: string): void {
    const s = this.searches.get(id);
    if (!s) return;
    s.abort.abort();
    for (const b of s.bundles.values()) b.abort.abort();
    for (const [fareId, ref] of this.fares) if (ref.searchId === id) this.fares.delete(fareId);
    this.byKey.delete(`${s.userId}|${s.key}`);
    this.searches.delete(id);
  }
}

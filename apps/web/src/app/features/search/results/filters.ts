import type { Flight, Offer } from '@milhas/contracts';
import { airlineName, hhmm } from '../../../shared/format';

/** Um voo com todas as suas ofertas (famílias tarifárias), ordenadas por preço. */
export interface FlightGroup {
  key: string;
  flight: Flight;
  offers: Offer[];
  minOffer: Offer;
  minPrice: number;
}

export type StopsFilter = 'all' | 'direct' | 'one' | 'two_plus';
export type Period = 'morning' | 'afternoon' | 'night';

export interface FilterState {
  stops: StopsFilter;
  airlines: string[];
  departure: Period[];
  arrival: Period[];
  maxPrice: number | null;
  maxDuration: number | null;
}

export type SortKey = 'price_asc' | 'value' | 'price_desc' | 'fastest' | 'dep_asc' | 'dep_desc' | 'arr_asc' | 'arr_desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'price_asc', label: 'Menor preço' },
  { key: 'value', label: 'Custo-benefício' },
  { key: 'price_desc', label: 'Maior preço' },
  { key: 'fastest', label: 'Mais rápido' },
  { key: 'dep_asc', label: 'Saída mais cedo' },
  { key: 'dep_desc', label: 'Saída mais tarde' },
  { key: 'arr_asc', label: 'Chegada mais cedo' },
  { key: 'arr_desc', label: 'Chegada mais tarde' },
];

export const PERIODS: { key: Period; label: string; hint: string }[] = [
  { key: 'morning', label: 'Manhã', hint: '06h–12h' },
  { key: 'afternoon', label: 'Tarde', hint: '12h–18h' },
  { key: 'night', label: 'Noite', hint: '18h–06h' },
];

export function defaultFilters(): FilterState {
  return { stops: 'all', airlines: [], departure: [], arrival: [], maxPrice: null, maxDuration: null };
}

export function priceOf(o: Offer): number {
  return Number(o.price.total_brl);
}

export function groupOffers(flights: Record<string, Flight>, offers: Offer[], flightKeyOf: (o: Offer) => string = (o) => o.outbound_flight_key): FlightGroup[] {
  const map = new Map<string, Offer[]>();
  for (const o of offers) {
    const key = flightKeyOf(o);
    if (!flights[key]) continue;
    const list = map.get(key);
    if (list) list.push(o);
    else map.set(key, [o]);
  }
  const groups: FlightGroup[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    groups.push({ key, flight: flights[key], offers: sorted, minOffer: sorted[0], minPrice: priceOf(sorted[0]) });
  }
  return groups;
}

export function periodOf(isoLocal: string): Period {
  const hour = Number(hhmm(isoLocal).slice(0, 2));
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

export function applyFilters(groups: FlightGroup[], f: FilterState, ignoreAirlines = false): FlightGroup[] {
  return groups.filter((g) => {
    const stops = g.flight.stops_count;
    if (f.stops === 'direct' && stops !== 0) return false;
    if (f.stops === 'one' && stops !== 1) return false;
    if (f.stops === 'two_plus' && stops < 2) return false;
    if (!ignoreAirlines && f.airlines.length > 0 && !f.airlines.includes(g.flight.airline)) return false;
    if (f.departure.length > 0 && !f.departure.includes(periodOf(g.flight.departure_at))) return false;
    if (f.arrival.length > 0 && !f.arrival.includes(periodOf(g.flight.arrival_at))) return false;
    if (f.maxPrice !== null && g.minPrice > f.maxPrice) return false;
    if (f.maxDuration !== null && g.flight.duration_minutes > f.maxDuration) return false;
    return true;
  });
}

/** Custo-benefício: preço ponderado por duração e paradas (heurística do front). */
export function valueScore(g: FlightGroup): number {
  return g.minPrice + g.flight.duration_minutes * 1.5 + g.flight.stops_count * 150;
}

export function sortGroups(groups: FlightGroup[], sort: SortKey): FlightGroup[] {
  const list = [...groups];
  const byDep = (a: FlightGroup, b: FlightGroup) => a.flight.departure_at.localeCompare(b.flight.departure_at);
  const byArr = (a: FlightGroup, b: FlightGroup) => a.flight.arrival_at.localeCompare(b.flight.arrival_at);
  switch (sort) {
    case 'price_asc':
      return list.sort((a, b) => a.minPrice - b.minPrice || byDep(a, b));
    case 'price_desc':
      return list.sort((a, b) => b.minPrice - a.minPrice || byDep(a, b));
    case 'value':
      return list.sort((a, b) => valueScore(a) - valueScore(b));
    case 'fastest':
      return list.sort((a, b) => a.flight.duration_minutes - b.flight.duration_minutes || a.minPrice - b.minPrice);
    case 'dep_asc':
      return list.sort(byDep);
    case 'dep_desc':
      return list.sort((a, b) => byDep(b, a));
    case 'arr_asc':
      return list.sort(byArr);
    case 'arr_desc':
      return list.sort((a, b) => byArr(b, a));
    default:
      return list;
  }
}

export interface SummaryCard {
  key: 'best' | 'direct' | 'one_stop' | 'fastest' | 'value';
  label: string;
  group: FlightGroup | null;
  detail: string;
}

export function summaryCards(groups: FlightGroup[]): SummaryCard[] {
  const min = (list: FlightGroup[], by: (g: FlightGroup) => number) =>
    list.reduce<FlightGroup | null>((best, g) => (best === null || by(g) < by(best) ? g : best), null);
  const best = min(groups, (g) => g.minPrice);
  const direct = min(
    groups.filter((g) => g.flight.stops_count === 0),
    (g) => g.minPrice,
  );
  const oneStop = min(
    groups.filter((g) => g.flight.stops_count === 1),
    (g) => g.minPrice,
  );
  const fastest = min(groups, (g) => g.flight.duration_minutes);
  const value = min(groups, valueScore);
  const name = (g: FlightGroup | null) => (g ? airlineName(g.flight.airline, g.flight.airline_name) : '');
  const stopsLabel = (g: FlightGroup | null) => (g ? (g.flight.stops_count === 0 ? 'Direto' : `${g.flight.stops_count} conexão${g.flight.stops_count > 1 ? 'ões' : ''}`) : '');
  return [
    { key: 'best', label: 'Melhor preço', group: best, detail: best ? `${name(best)} · ${stopsLabel(best)}` : 'Sem opções' },
    { key: 'direct', label: 'Direto', group: direct, detail: direct ? `${name(direct)} · Sem escala` : 'Sem voo direto' },
    { key: 'one_stop', label: '1 conexão', group: oneStop, detail: oneStop ? `${name(oneStop)} · 1 conexão` : 'Sem 1 conexão' },
    { key: 'fastest', label: 'Mais rápido', group: fastest, detail: fastest ? `${name(fastest)} · ${durationShort(fastest)}` : 'Sem opções' },
    { key: 'value', label: 'Custo-benefício', group: value, detail: value ? `${name(value)} · ${stopsLabel(value)}` : 'Sem opções' },
  ];
}

function durationShort(g: FlightGroup): string {
  const m = g.flight.duration_minutes;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
}

export interface AirlineCount {
  code: string;
  name: string;
  count: number;
}

export function airlineCounts(groups: FlightGroup[]): AirlineCount[] {
  const map = new Map<string, AirlineCount>();
  for (const g of groups) {
    const code = g.flight.airline;
    const entry = map.get(code);
    if (entry) entry.count += 1;
    else map.set(code, { code, name: airlineName(code, g.flight.airline_name), count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface Bounds {
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
}

export function bounds(groups: FlightGroup[]): Bounds {
  if (groups.length === 0) return { minPrice: 0, maxPrice: 0, minDuration: 0, maxDuration: 0 };
  let minPrice = Infinity;
  let maxPrice = 0;
  let minDuration = Infinity;
  let maxDuration = 0;
  for (const g of groups) {
    minPrice = Math.min(minPrice, g.minPrice);
    maxPrice = Math.max(maxPrice, g.minPrice);
    minDuration = Math.min(minDuration, g.flight.duration_minutes);
    maxDuration = Math.max(maxDuration, g.flight.duration_minutes);
  }
  return { minPrice: Math.floor(minPrice), maxPrice: Math.ceil(maxPrice), minDuration, maxDuration };
}

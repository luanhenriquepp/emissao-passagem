import { Injectable, signal } from '@angular/core';
import { buildSearchPath, locationLabel, searchKey, type Passengers, type SearchCabin, type SearchRouteParams, type TripType } from '@milhas/contracts';

/** Pesquisa recente salva em `localStorage` (`mp:recent-searches:v1`). */
export interface RecentSearch {
  type: TripType;
  origin: { iata: string; name: string };
  destination: { iata: string; name: string };
  ida: string;
  volta?: string;
  pax: Passengers;
  classe: SearchCabin;
  id: string;
  searchedAt: number;
}

const KEY = 'mp:recent-searches:v1';
const MAX = 6;

@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  readonly items = signal<RecentSearch[]>(this.read());

  add(params: SearchRouteParams): void {
    const entry: RecentSearch = {
      type: params.type,
      origin: { iata: params.origin, name: locationLabel(params.origin).city },
      destination: { iata: params.destination, name: locationLabel(params.destination).city },
      ida: params.outbound_date,
      volta: params.type === 'RT' && params.return_date ? params.return_date : undefined,
      pax: { ...params.passengers },
      classe: params.cabin,
      id: searchKey(params),
      searchedAt: Date.now(),
    };
    const next = [entry, ...this.items().filter((i) => i.id !== entry.id)].slice(0, MAX);
    this.items.set(next);
    this.write(next);
  }

  clear(): void {
    this.items.set([]);
    this.write([]);
  }

  pathOf(item: RecentSearch): string {
    return buildSearchPath(this.toParams(item));
  }

  toParams(item: RecentSearch): SearchRouteParams {
    return {
      type: item.type,
      origin: item.origin.iata,
      destination: item.destination.iata,
      outbound_date: item.ida,
      return_date: item.volta ?? null,
      passengers: item.pax,
      cabin: item.classe,
    };
  }

  private read(): RecentSearch[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as RecentSearch[]).filter((i) => i && i.origin && i.destination && i.ida) : [];
    } catch {
      return [];
    }
  }

  private write(items: RecentSearch[]): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage indisponível: ignora */
    }
  }
}

import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SEARCH_CABINS, isKnownLocation, locationLabel, searchKey, type SearchCabin, type SearchRouteParams } from '@milhas/contracts';
import { SessionStore } from '../../../core/session.store';
import { dateShort } from '../../../shared/format';
import { paxSummaryLabel } from '../../../shared/labels';
import { CABIN_OPTIONS, SearchForm } from '../search-form/search-form';
import {
  SORT_OPTIONS,
  airlineCounts,
  applyFilters,
  bounds,
  defaultFilters,
  groupOffers,
  sortGroups,
  summaryCards,
  type FilterState,
  type FlightGroup,
  type SortKey,
} from './filters';
import { FiltersPanel } from './filters-panel';
import { FlightCard } from './flight-card';
import { LoginModal } from './login-modal';
import { SearchStore } from './search.store';
import { SelectedStrip } from './selected-strip';
import { SummaryCards } from './summary-cards';
import { TripSummary } from './trip-summary';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((s) => s.key));

function parseInt09(value: string): number | null {
  if (!/^\d$/.test(value)) return null;
  return Number(value);
}

@Component({
  selector: 'app-results-page',
  imports: [RouterLink, SearchForm, FiltersPanel, SummaryCards, FlightCard, SelectedStrip, TripSummary, LoginModal],
  providers: [SearchStore],
  templateUrl: './results.page.html',
  styleUrl: './results.page.scss',
})
export class ResultsPage {
  // Parâmetros da rota (withComponentInputBinding) — sempre strings.
  readonly o = input.required<string>();
  readonly d = input.required<string>();
  readonly ida = input.required<string>();
  readonly volta = input<string>();
  readonly adt = input.required<string>();
  readonly chd = input.required<string>();
  readonly inf = input.required<string>();
  readonly cabin = input.required<string>();

  readonly store = inject(SearchStore);
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  readonly sortOptions = SORT_OPTIONS;
  readonly modifyOpen = signal(false);
  readonly filters = signal<FilterState>(defaultFilters());
  readonly sort = signal<SortKey>('price_asc');
  readonly expandedKey = signal<string | null>(null);
  private lastKey: string | null = null;

  /** Parâmetros validados; null quando a URL está malformada. */
  readonly params = computed<SearchRouteParams | null>(() => {
    const origin = this.o().toUpperCase();
    const destination = this.d().toUpperCase();
    if (!isKnownLocation(origin) || !isKnownLocation(destination) || origin === destination) return null;
    const ida = this.ida();
    const volta = this.volta() ?? null;
    if (!ISO_DATE.test(ida) || (volta && !ISO_DATE.test(volta))) return null;
    const adt = parseInt09(this.adt());
    const chd = parseInt09(this.chd());
    const inf = parseInt09(this.inf());
    if (adt === null || chd === null || inf === null || adt < 1 || adt + chd + inf > 9 || inf > adt) return null;
    const cabin = this.cabin().toUpperCase();
    if (!(SEARCH_CABINS as readonly string[]).includes(cabin)) return null;
    return {
      type: volta ? 'RT' : 'OW',
      origin,
      destination,
      outbound_date: ida,
      return_date: volta,
      passengers: { adt, chd, inf },
      cabin: cabin as SearchCabin,
    };
  });

  readonly headline = computed(() => {
    const p = this.params();
    if (!p) return '';
    return `${locationLabel(p.origin).city} (${p.origin}) → ${locationLabel(p.destination).city} (${p.destination})`;
  });
  readonly subline = computed(() => {
    const p = this.params();
    if (!p) return '';
    const dates = p.return_date ? `${dateShort(p.outbound_date, false)} – ${dateShort(p.return_date)}` : dateShort(p.outbound_date);
    const cabin = CABIN_OPTIONS.find((c) => c.value === p.cabin)?.label ?? p.cabin;
    return `${dates} · ${paxSummaryLabel(p.passengers)} · ${cabin}`;
  });

  readonly stage = this.store.stage;
  readonly stageTitle = computed(() => {
    const p = this.params();
    if (!p) return '';
    if (this.stage() === 'return') return `Escolha o voo de volta · ${dateShort(p.return_date, false)}`;
    return `Escolha o voo de ida · ${dateShort(p.outbound_date, false)}`;
  });

  readonly outboundGroups = computed(() => groupOffers(this.store.flights(), this.store.offers()));
  readonly returnGroups = computed(() => groupOffers(this.store.returnFlights(), this.store.returnOffers(), (o) => o.return_flight_key ?? ''));
  readonly currentGroups = computed(() => (this.stage() === 'return' ? this.returnGroups() : this.outboundGroups()));
  readonly filtered = computed(() => applyFilters(this.currentGroups(), this.filters()));
  readonly sorted = computed(() => sortGroups(this.filtered(), this.sort()));
  readonly cards = computed(() => summaryCards(this.currentGroups()));
  readonly airlines = computed(() => airlineCounts(applyFilters(this.currentGroups(), this.filters(), true)));
  readonly bounds = computed(() => bounds(this.currentGroups()));
  readonly badgeMap = computed(() => {
    const map = new Map<string, string[]>();
    for (const c of this.cards()) {
      if (!c.group || c.key === 'direct' || c.key === 'one_stop') continue;
      const list = map.get(c.group.key) ?? [];
      list.push(c.label);
      map.set(c.group.key, list);
    }
    return map;
  });

  readonly listLoading = computed(() => (this.stage() === 'return' ? this.store.returnLoading() : this.store.loading()));
  readonly listComplete = computed(() => (this.stage() === 'return' ? this.store.returnComplete() : this.store.complete()));
  readonly listError = computed(() => (this.stage() === 'return' ? this.store.returnError() : this.store.error()));
  readonly searchExpired = computed(() => {
    const e = this.store.error() ?? this.store.returnError() ?? this.store.quoteError() ?? this.store.orderError();
    return !!e && (e.code === 'SEARCH_EXPIRED' || e.code === 'SEARCH_NOT_FOUND');
  });
  readonly selectedOutboundFlight = computed(() => {
    const offer = this.store.selectedOutbound();
    return offer ? (this.store.flights()[offer.outbound_flight_key] ?? null) : null;
  });
  readonly selectedReturnFlight = computed(() => {
    const offer = this.store.selectedReturn();
    return offer?.return_flight_key ? (this.store.returnFlights()[offer.return_flight_key] ?? null) : null;
  });

  constructor() {
    effect(() => {
      const p = this.params();
      const status = this.session.status();
      if (!p || status !== 'authenticated') return;
      untracked(() => {
        const key = searchKey(p);
        if (key !== this.lastKey) {
          this.lastKey = key;
          this.resetView();
          this.modifyOpen.set(false);
        }
        void this.store.start(p);
      });
    });
  }

  badgesOf(group: FlightGroup): string[] {
    return this.badgeMap().get(group.key) ?? [];
  }

  setSort(value: string): void {
    if (SORT_KEYS.has(value)) this.sort.set(value as SortKey);
  }

  clearFilters(): void {
    this.filters.set(defaultFilters());
  }

  toggleGroup(key: string): void {
    this.expandedKey.set(this.expandedKey() === key ? null : key);
  }

  pickCard(group: FlightGroup): void {
    this.expandedKey.set(group.key);
    setTimeout(() => document.getElementById('flight-' + group.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  selectFare(offerId: string): void {
    if (this.stage() === 'return') void this.store.selectReturn(offerId);
    else void this.store.selectOutbound(offerId);
    this.resetView();
    this.scrollTop();
  }

  changeOutbound(): void {
    this.store.changeOutbound();
    this.resetView();
    this.scrollTop();
  }

  changeReturn(): void {
    this.store.changeReturn();
    this.resetView();
    this.scrollTop();
  }

  retryList(): void {
    if (this.stage() === 'return') {
      const id = this.store.selectedOutboundFareId();
      if (id) void this.store.selectOutbound(id);
      return;
    }
    this.store.retry();
  }

  redoSearch(): void {
    this.resetView();
    this.store.retry();
  }

  requote(): void {
    if (this.searchExpired()) this.redoSearch();
    else void this.store.requestQuote();
  }

  async goToPassengers(): Promise<void> {
    const order = await this.store.createOrder();
    if (order) await this.router.navigate(['/passageiros', order.order_id]);
  }

  private resetView(): void {
    this.filters.set(defaultFilters());
    this.expandedKey.set(null);
  }

  private scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

import { Component, computed, input, model, signal } from '@angular/core';
import { formatBrlCompact } from '../../../shared/format';
import { DurationPipe } from '../../../shared/pipes';
import { PERIODS, defaultFilters, type AirlineCount, type Bounds, type FilterState, type Period, type StopsFilter } from './filters';

const STOPS: { key: StopsFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'direct', label: 'Direto' },
  { key: 'one', label: '1 conexão' },
  { key: 'two_plus', label: '2+ conexões' },
];

@Component({
  selector: 'app-filters-panel',
  imports: [DurationPipe],
  templateUrl: './filters-panel.html',
  styleUrl: './filters-panel.scss',
})
export class FiltersPanel {
  readonly filters = model.required<FilterState>();
  readonly airlines = input<AirlineCount[]>([]);
  readonly bounds = input.required<Bounds>();
  readonly total = input(0);
  readonly shown = input(0);

  readonly stops = STOPS;
  readonly periods = PERIODS;
  readonly open = signal(false);

  readonly activeCount = computed(() => {
    const f = this.filters();
    let n = 0;
    if (f.stops !== 'all') n++;
    if (f.airlines.length) n++;
    if (f.departure.length) n++;
    if (f.arrival.length) n++;
    if (f.maxPrice !== null) n++;
    if (f.maxDuration !== null) n++;
    return n;
  });

  readonly priceValue = computed(() => this.filters().maxPrice ?? this.bounds().maxPrice);
  readonly durationValue = computed(() => this.filters().maxDuration ?? this.bounds().maxDuration);
  readonly priceLabel = computed(() => formatBrlCompact(this.priceValue()));

  setStops(key: StopsFilter): void {
    this.filters.update((f) => ({ ...f, stops: key }));
  }

  toggleAirline(code: string): void {
    this.filters.update((f) => ({
      ...f,
      airlines: f.airlines.includes(code) ? f.airlines.filter((c) => c !== code) : [...f.airlines, code],
    }));
  }

  togglePeriod(kind: 'departure' | 'arrival', p: Period): void {
    this.filters.update((f) => {
      const list = f[kind];
      return { ...f, [kind]: list.includes(p) ? list.filter((x) => x !== p) : [...list, p] };
    });
  }

  setMaxPrice(raw: string): void {
    const value = Number(raw);
    this.filters.update((f) => ({ ...f, maxPrice: value >= this.bounds().maxPrice ? null : value }));
  }

  setMaxDuration(raw: string): void {
    const value = Number(raw);
    this.filters.update((f) => ({ ...f, maxDuration: value >= this.bounds().maxDuration ? null : value }));
  }

  clear(): void {
    this.filters.set(defaultFilters());
  }
}

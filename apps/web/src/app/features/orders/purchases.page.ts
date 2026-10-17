import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PURCHASE_FILTERS, type OrderListItem, type OrdersListResponse } from '@milhas/contracts';
import { ApiClient } from '../../core/api-client.service';
import { ApiError } from '../../core/api-error';
import { copyToClipboard } from '../../shared/clipboard';
import { airlineName } from '../../shared/format';
import { BrlPipe, DateShortPipe } from '../../shared/pipes';
import { StatusBadge } from '../../shared/status-badge';

const PER_PAGE = 20;

@Component({
  selector: 'app-purchases-page',
  imports: [RouterLink, BrlPipe, DateShortPipe, StatusBadge],
  templateUrl: './purchases.page.html',
  styleUrl: './purchases.page.scss',
})
export class PurchasesPage {
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters = Object.entries(PURCHASE_FILTERS).map(([key, f]) => ({ key, label: f.label }));
  readonly filter = signal('all');
  readonly query = signal('');
  readonly page = signal(1);

  readonly data = signal<OrdersListResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly copiedId = signal<string | null>(null);

  readonly items = computed(() => this.data()?.items ?? []);
  readonly metrics = computed(() => this.data()?.metrics ?? null);
  readonly pagination = computed(() => this.data()?.pagination ?? null);
  readonly isFiltered = computed(() => this.filter() !== 'all' || this.query().trim() !== '');

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private requestToken = 0;

  constructor() {
    effect(() => {
      const params = { page: this.page(), filter: this.filter(), q: this.query().trim() };
      untracked(() => void this.load(params));
    });
    this.destroyRef.onDestroy(() => {
      if (this.debounce) clearTimeout(this.debounce);
    });
  }

  setFilter(key: string): void {
    this.filter.set(key);
    this.page.set(1);
  }

  onQueryInput(value: string): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.query.set(value);
      this.page.set(1);
    }, 350);
  }

  goTo(page: number): void {
    const p = this.pagination();
    if (!p || page < 1 || page > p.total_pages) return;
    this.page.set(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  reload(): void {
    void this.load({ page: this.page(), filter: this.filter(), q: this.query().trim() });
  }

  airline(code: string): string {
    return airlineName(code);
  }

  routeLabel(item: OrderListItem): string {
    return `${item.outbound.origin_iata} → ${item.outbound.destination_iata}${item.return ? ' → ' + item.return.destination_iata : ''}`;
  }

  async copyLocator(item: OrderListItem): Promise<void> {
    if (!item.record_locator) return;
    if (await copyToClipboard(item.record_locator)) {
      this.copiedId.set(item.order_id);
      setTimeout(() => this.copiedId.set(null), 2000);
    }
  }

  private async load(params: { page: number; filter: string; q: string }): Promise<void> {
    const token = ++this.requestToken;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.get<OrdersListResponse>('/me/orders', {
        page: params.page,
        per_page: PER_PAGE,
        filter: params.filter,
        q: params.q || undefined,
      });
      if (token !== this.requestToken) return;
      this.data.set(res);
    } catch (e) {
      if (token !== this.requestToken) return;
      this.error.set(ApiError.from(e));
    } finally {
      if (token === this.requestToken) this.loading.set(false);
    }
  }
}

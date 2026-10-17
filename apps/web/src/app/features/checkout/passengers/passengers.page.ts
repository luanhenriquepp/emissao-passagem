import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  buildSearchPath,
  onlyDigits,
  type FavoritePassenger,
  type Order,
  type OrderPassenger,
  type PassengerInputRaw,
  type Passengers,
} from '@milhas/contracts';
import { ApiClient } from '../../../core/api-client.service';
import { ApiError } from '../../../core/api-error';
import { SessionStore } from '../../../core/session.store';
import { datePart } from '../../../shared/format';
import { createCountdown } from '../countdown';
import { OrderSummary } from '../order-summary';
import { PassengerCard, type PassengerDraft } from './passenger-card';

interface StoredDraft {
  contact: { email: string; phone: string };
  passengers: Record<string, PassengerDraft>;
}

const PAID_OR_LATER = new Set(['PAID', 'BOOKING', 'BOOKED', 'BOOKING_STUCK', 'FAILED']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-passengers-page',
  imports: [RouterLink, OrderSummary, PassengerCard],
  templateUrl: './passengers.page.html',
  styleUrl: './passengers.page.scss',
})
export class PassengersPage {
  readonly orderId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly session = inject(SessionStore);

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly favorites = signal<FavoritePassenger[]>([]);
  readonly drafts = signal<Record<string, PassengerDraft>>({});

  readonly contactEmail = signal('');
  readonly contactPhone = signal('');
  readonly contactErrors = signal<{ email?: string; phone?: string }>({});

  readonly savingPosition = signal<number | null>(null);
  readonly saveErrors = signal<Record<string, ApiError>>({});
  readonly confirming = signal(false);
  readonly confirmError = signal<ApiError | null>(null);
  private readonly forcedExpired = signal(false);

  readonly countdown = createCountdown(computed(() => this.order()?.expires_at));
  readonly expired = computed(() => {
    const o = this.order();
    const status = o?.status;
    return this.forcedExpired() || status === 'EXPIRED' || status === 'CANCELLED' || (!!o && this.countdown.expired());
  });
  readonly lowTime = computed(() => {
    const r = this.countdown.remaining();
    return r !== null && r <= 120;
  });

  readonly slots = computed<OrderPassenger[]>(() => {
    const o = this.order();
    if (!o) return [];
    if (o.passengers.length > 0) return [...o.passengers].sort((a, b) => a.position - b.position);
    let position = 1;
    const out: OrderPassenger[] = [];
    for (const req of o.passengers_required) {
      for (let i = 0; i < req.count; i++) {
        out.push({
          position: position++,
          pax_type: req.type,
          nationality: null,
          document_type: null,
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
    return out;
  });
  readonly allComplete = computed(() => this.slots().length > 0 && this.slots().every((s) => s.is_complete));
  readonly completedCount = computed(() => this.slots().filter((s) => s.is_complete).length);
  readonly outboundDate = computed(() => datePart(this.order()?.outbound.flight.departure_at));

  /** Caminho para refazer a busca equivalente ao pedido (estado expirado). */
  readonly redoSearchPath = computed(() => {
    const o = this.order();
    if (!o) return '/';
    const passengers: Passengers = { adt: 0, chd: 0, inf: 0 };
    for (const r of o.passengers_required) {
      if (r.type === 'ADT') passengers.adt += r.count;
      else if (r.type === 'CHD') passengers.chd += r.count;
      else passengers.inf += r.count;
    }
    if (passengers.adt + passengers.chd + passengers.inf === 0) passengers.adt = 1;
    return buildSearchPath({
      type: o.return ? 'RT' : 'OW',
      origin: o.outbound.flight.origin_iata,
      destination: o.outbound.flight.destination_iata,
      outbound_date: datePart(o.outbound.flight.departure_at),
      return_date: o.return ? datePart(o.return.flight.departure_at) : null,
      passengers,
      cabin: 'ALL',
    });
  });

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
  }

  draftOf(position: number): PassengerDraft | null {
    return this.drafts()[String(position)] ?? null;
  }

  saveErrorOf(position: number): ApiError | null {
    return this.saveErrors()[String(position)] ?? null;
  }

  onDraftChanged(position: number, draft: PassengerDraft): void {
    this.drafts.update((d) => ({ ...d, [String(position)]: draft }));
    this.persistDraft();
  }

  useAccountData(): void {
    const me = this.session.user();
    if (!me) return;
    this.contactEmail.set(me.email);
    this.contactErrors.set({});
    this.persistDraft();
  }

  onEmailInput(value: string): void {
    this.contactEmail.set(value);
    this.contactErrors.update((e) => ({ ...e, email: undefined }));
    this.persistDraft();
  }

  onPhoneInput(value: string): void {
    const d = onlyDigits(value).slice(0, 11);
    let out = d;
    if (d.length > 6) out = `(${d.slice(0, 2)}) ${d.slice(2, d.length > 10 ? 7 : 6)}-${d.slice(d.length > 10 ? 7 : 6)}`;
    else if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    this.contactPhone.set(out);
    this.contactErrors.update((e) => ({ ...e, phone: undefined }));
    this.persistDraft();
  }

  async savePassenger(position: number, input: PassengerInputRaw): Promise<void> {
    const o = this.order();
    if (!o) return;
    this.savingPosition.set(position);
    this.saveErrors.update((errs) => {
      const next = { ...errs };
      delete next[String(position)];
      return next;
    });
    try {
      const updated = await this.api.put<Order>(`/orders/${encodeURIComponent(o.order_id)}/passengers/${position}`, input);
      this.order.set(updated);
      this.drafts.update((d) => {
        const next = { ...d };
        delete next[String(position)];
        return next;
      });
      this.persistDraft();
    } catch (e) {
      const err = ApiError.from(e);
      if (this.isExpiredError(err)) this.forcedExpired.set(true);
      this.saveErrors.update((errs) => ({ ...errs, [String(position)]: err }));
    } finally {
      this.savingPosition.set(null);
    }
  }

  async continueToPayment(): Promise<void> {
    const o = this.order();
    if (!o || !this.allComplete()) return;
    const email = this.contactEmail().trim().toLowerCase();
    const phone = onlyDigits(this.contactPhone());
    const errors: { email?: string; phone?: string } = {};
    if (!EMAIL_REGEX.test(email)) errors.email = 'Informe um e-mail válido';
    if (phone && (phone.length < 10 || phone.length > 11)) errors.phone = 'Informe DDD + número';
    this.contactErrors.set(errors);
    if (errors.email || errors.phone) return;

    this.confirming.set(true);
    this.confirmError.set(null);
    try {
      const contactBody = { email, ddi: '+55', phone: phone || null };
      let updated: Order;
      if (o.status === 'DRAFT') {
        await this.api.patch<Order>(`/orders/${encodeURIComponent(o.order_id)}/contact`, contactBody);
        updated = await this.api.post<Order>(`/orders/${encodeURIComponent(o.order_id)}/confirm`);
      } else {
        try {
          updated = await this.api.patch<Order>(`/orders/${encodeURIComponent(o.order_id)}/contact`, contactBody);
        } catch {
          updated = o;
        }
      }
      this.order.set(updated);
      this.clearDraft();
      await this.router.navigate(['/pagamento', o.order_id]);
    } catch (e) {
      const err = ApiError.from(e);
      if (this.isExpiredError(err)) this.forcedExpired.set(true);
      this.confirmError.set(err);
    } finally {
      this.confirming.set(false);
    }
  }

  reload(): void {
    void this.load(this.orderId());
  }

  // ------------------------------------------------------------------------

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.forcedExpired.set(false);
    try {
      const o = await this.api.get<Order>(`/orders/${encodeURIComponent(id)}`);
      if (PAID_OR_LATER.has(o.status)) {
        await this.router.navigate(['/pagamento', o.order_id], { replaceUrl: true });
        return;
      }
      this.order.set(o);
      this.restoreDraft(o);
      void this.loadFavorites();
    } catch (e) {
      this.error.set(ApiError.from(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFavorites(): Promise<void> {
    try {
      this.favorites.set(await this.api.get<FavoritePassenger[]>('/me/passengers'));
    } catch {
      this.favorites.set([]);
    }
  }

  private isExpiredError(err: ApiError): boolean {
    return err.code === 'ORDER_EXPIRED' || err.code === 'ORDER_HARD_TIMEOUT';
  }

  private draftKey(): string {
    return `pax-data:${this.order()?.order_id ?? this.orderId()}`;
  }

  private restoreDraft(o: Order): void {
    this.contactEmail.set(o.contact.email ?? '');
    this.contactPhone.set(o.contact.phone ? this.formatPhone(o.contact.phone) : '');
    try {
      const raw = localStorage.getItem(`pax-data:${o.order_id}`);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredDraft>;
      if (stored.contact) {
        if (!this.contactEmail() && stored.contact.email) this.contactEmail.set(stored.contact.email);
        if (!this.contactPhone() && stored.contact.phone) this.contactPhone.set(stored.contact.phone);
      }
      if (stored.passengers && typeof stored.passengers === 'object') this.drafts.set(stored.passengers);
    } catch {
      /* rascunho corrompido: ignora */
    }
  }

  private persistDraft(): void {
    try {
      const data: StoredDraft = {
        contact: { email: this.contactEmail(), phone: this.contactPhone() },
        passengers: this.drafts(),
      };
      localStorage.setItem(this.draftKey(), JSON.stringify(data));
    } catch {
      /* storage indisponível */
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(this.draftKey());
    } catch {
      /* ignore */
    }
  }

  private formatPhone(digits: string): string {
    const d = onlyDigits(digits).slice(-11);
    if (d.length < 10) return d;
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
}

import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toMoney, type Order, type Wallet } from '@milhas/contracts';
import { ApiClient } from '../../../core/api-client.service';
import { ApiError } from '../../../core/api-error';
import { newIdempotencyKey } from '../../../core/idempotency';
import { SessionStore } from '../../../core/session.store';
import { copyToClipboard } from '../../../shared/clipboard';
import { BrlPipe } from '../../../shared/pipes';
import { createCountdown } from '../countdown';
import { OrderSummary } from '../order-summary';

/** Resposta do depósito PIX (mock) — não faz parte dos contratos compartilhados. */
interface DepositResponse {
  deposit_id: string;
  pix_copy_paste: string;
  status: string;
  auto_confirm_seconds: number;
}

const ORDER_POLL_MS = 2000;
const WALLET_POLL_MS = 2000;
const WALLET_POLL_MAX_MS = 90_000;
const IN_EMISSION = new Set(['PAID', 'BOOKING']);

const cents = (v: string | number) => Math.round(Number(v) * 100);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Component({
  selector: 'app-payment-page',
  imports: [RouterLink, BrlPipe, OrderSummary],
  templateUrl: './payment.page.html',
  styleUrl: './payment.page.scss',
})
export class PaymentPage {
  readonly orderId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly order = signal<Order | null>(null);
  readonly wallet = signal<Wallet | null>(null);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);

  readonly paying = signal(false);
  readonly payError = signal<ApiError | null>(null);
  readonly showDeposit = signal(false);
  readonly depositAmount = signal('');
  readonly depositing = signal(false);
  readonly depositError = signal<string | null>(null);
  readonly deposit = signal<DepositResponse | null>(null);
  readonly waitingDeposit = signal(false);
  readonly copied = signal<'pix' | 'locator' | null>(null);
  private readonly forcedExpired = signal(false);
  private pollToken = 0;
  private alive = true;

  readonly countdown = createCountdown(computed(() => (this.order()?.status === 'PENDING_PAYMENT' ? this.order()?.expires_at : null)));
  readonly status = computed(() => this.order()?.status ?? null);
  readonly expired = computed(() => {
    const s = this.status();
    return this.forcedExpired() || s === 'EXPIRED' || s === 'CANCELLED' || (s === 'PENDING_PAYMENT' && this.countdown.expired());
  });
  readonly inEmission = computed(() => !!this.status() && IN_EMISSION.has(this.status() as string));

  readonly balance = computed(() => this.wallet()?.balances.available ?? '0.00');
  readonly total = computed(() => this.order()?.total_brl ?? '0.00');
  readonly missing = computed(() => toMoney(Math.max(0, cents(this.total()) - cents(this.balance())) / 100));
  readonly hasBalance = computed(() => cents(this.balance()) >= cents(this.total()));
  readonly suggestedDeposit = computed(() => {
    const w = this.wallet();
    let value = cents(this.missing());
    if (w) {
      value = Math.max(value, cents(w.deposit.min));
      value = Math.min(value, cents(w.deposit.max));
    }
    return toMoney(value / 100);
  });

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.pollToken++;
    });
  }

  async pay(): Promise<void> {
    const o = this.order();
    if (!o || this.paying()) return;
    this.paying.set(true);
    this.payError.set(null);
    try {
      const updated = await this.api.post<Order>(`/orders/${encodeURIComponent(o.order_id)}/payment`, {}, { idempotencyKey: newIdempotencyKey() });
      this.order.set(updated);
      this.showDeposit.set(false);
      void this.refreshWallet();
      void this.session.refresh();
      if (IN_EMISSION.has(updated.status)) void this.pollOrder();
    } catch (e) {
      const err = ApiError.from(e);
      if (err.code === 'INSUFFICIENT_BALANCE') {
        void this.refreshWallet();
        this.openDeposit();
      } else if (err.code === 'PAYMENT_ALREADY_PROCESSED') {
        await this.reloadOrder();
      } else if (err.code === 'ORDER_EXPIRED' || err.code === 'ORDER_HARD_TIMEOUT') {
        this.forcedExpired.set(true);
      } else {
        this.payError.set(err);
      }
    } finally {
      this.paying.set(false);
    }
  }

  openDeposit(): void {
    this.showDeposit.set(true);
    this.deposit.set(null);
    this.depositError.set(null);
    this.depositAmount.set(this.suggestedDeposit().replace('.', ','));
  }

  onDepositInput(value: string): void {
    this.depositAmount.set(value);
    this.depositError.set(null);
  }

  async createDeposit(): Promise<void> {
    const w = this.wallet();
    const normalized = this.depositAmount().replace(/\./g, '').replace(',', '.').trim();
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.depositError.set('Informe um valor válido');
      return;
    }
    if (w && (cents(amount) < cents(w.deposit.min) || cents(amount) > cents(w.deposit.max))) {
      this.depositError.set(`O depósito deve ficar entre R$ ${w.deposit.min.replace('.', ',')} e R$ ${w.deposit.max.replace('.', ',')}`);
      return;
    }
    this.depositing.set(true);
    this.depositError.set(null);
    try {
      const res = await this.api.post<DepositResponse>('/me/wallet/deposits', { amount_brl: toMoney(amount) }, { idempotencyKey: newIdempotencyKey() });
      this.deposit.set(res);
      void this.waitForDeposit(res);
    } catch (e) {
      this.depositError.set(ApiError.from(e).message);
    } finally {
      this.depositing.set(false);
    }
  }

  async copy(kind: 'pix' | 'locator'): Promise<void> {
    const text = kind === 'pix' ? this.deposit()?.pix_copy_paste : this.order()?.record_locator;
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      this.copied.set(kind);
      setTimeout(() => this.copied.set(null), 2000);
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
      const [o, w] = await Promise.all([this.api.get<Order>(`/orders/${encodeURIComponent(id)}`), this.api.get<Wallet>('/me/wallet').catch(() => null)]);
      if (o.status === 'DRAFT') {
        await this.router.navigate(['/passageiros', o.order_id], { replaceUrl: true });
        return;
      }
      this.order.set(o);
      this.wallet.set(w);
      if (IN_EMISSION.has(o.status)) void this.pollOrder();
    } catch (e) {
      this.error.set(ApiError.from(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async reloadOrder(): Promise<void> {
    const id = this.order()?.order_id ?? this.orderId();
    try {
      const o = await this.api.get<Order>(`/orders/${encodeURIComponent(id)}`);
      this.order.set(o);
      if (IN_EMISSION.has(o.status)) void this.pollOrder();
    } catch (e) {
      this.payError.set(ApiError.from(e));
    }
  }

  private async refreshWallet(): Promise<void> {
    try {
      this.wallet.set(await this.api.get<Wallet>('/me/wallet'));
    } catch {
      /* mantém o saldo anterior */
    }
  }

  /** Acompanha a emissão: GET /orders/{id} a cada 2 s enquanto PAID/BOOKING. */
  private async pollOrder(): Promise<void> {
    const token = ++this.pollToken;
    const id = this.order()?.order_id ?? this.orderId();
    while (this.alive && token === this.pollToken) {
      await sleep(ORDER_POLL_MS);
      if (!this.alive || token !== this.pollToken) return;
      try {
        const o = await this.api.get<Order>(`/orders/${encodeURIComponent(id)}`);
        if (token !== this.pollToken) return;
        this.order.set(o);
        if (!IN_EMISSION.has(o.status)) {
          void this.session.refresh();
          return;
        }
      } catch {
        /* erro transitório: tenta de novo no próximo ciclo */
      }
    }
  }

  /** O mock confirma o PIX sozinho: espera e refaz GET /me/wallet até o saldo subir. */
  private async waitForDeposit(dep: DepositResponse): Promise<void> {
    const before = cents(this.balance());
    this.waitingDeposit.set(true);
    const started = Date.now();
    await sleep(Math.max(500, (dep.auto_confirm_seconds ?? 0) * 1000));
    while (this.alive && Date.now() - started < WALLET_POLL_MAX_MS) {
      await this.refreshWallet();
      if (cents(this.balance()) > before) break;
      await sleep(WALLET_POLL_MS);
    }
    this.waitingDeposit.set(false);
    void this.session.refresh();
  }
}

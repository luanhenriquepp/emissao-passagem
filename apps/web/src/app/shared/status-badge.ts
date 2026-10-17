import { Component, computed, input } from '@angular/core';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@milhas/contracts';

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge badge--' + meta().tone">{{ label() || meta().label }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<OrderStatus>();
  /** Rótulo vindo da API (status_label); cai no padrão dos contratos se vazio. */
  readonly label = input<string | null>(null);
  readonly meta = computed(() => ORDER_STATUS_LABELS[this.status()] ?? { label: this.status(), tone: 'neutral' as const });
}

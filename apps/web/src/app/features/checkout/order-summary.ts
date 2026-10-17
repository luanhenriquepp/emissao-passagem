import { Component, computed, input } from '@angular/core';
import type { Order } from '@milhas/contracts';
import { FareLeg } from '../../shared/fare-leg';
import { paxTypeLabel } from '../../shared/labels';
import { BrlPipe } from '../../shared/pipes';

/** Lateral do checkout: trechos, passageiros e valores do pedido. */
@Component({
  selector: 'app-order-summary',
  imports: [BrlPipe, FareLeg],
  template: `
    <aside class="os card" aria-labelledby="os-title">
      <div class="row row--between">
        <h2 id="os-title">Seu pedido</h2>
        <span class="small muted">{{ order().display_id }}</span>
      </div>
      <div class="os__legs">
        <app-fare-leg kind="ida" [fare]="order().outbound" />
        @if (order().return; as ret) {
          <app-fare-leg kind="volta" [fare]="ret" />
        }
      </div>
      <dl class="os__lines">
        @for (line of order().summary; track line.type) {
          <div class="os__line">
            <dt>{{ paxLabel(line.type, line.count) }}</dt>
            <dd>{{ line.total_brl | brl }}</dd>
          </div>
        }
        @if (hasExtras()) {
          <div class="os__line">
            <dt>Bagagem extra</dt>
            <dd>{{ order().extras_brl | brl }}</dd>
          </div>
        }
        <div class="os__line muted">
          <dt>Taxas (incluídas)</dt>
          <dd>{{ order().taxes_brl | brl }}</dd>
        </div>
        <div class="os__line">
          <dt>Taxa de serviço</dt>
          <dd>{{ order().service_fee_brl | brl }}</dd>
        </div>
        <div class="os__line os__line--total">
          <dt>Total</dt>
          <dd>{{ order().total_brl | brl }}</dd>
        </div>
      </dl>
      @if (order().notices.length > 0) {
        <ul class="os__notices small muted">
          @for (n of order().notices; track n) {
            <li>{{ n }}</li>
          }
        </ul>
      }
    </aside>
  `,
  styles: `
    .os {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .os__legs {
      display: grid;
      gap: 12px;
    }
    .os__legs app-fare-leg + app-fare-leg {
      padding-top: 12px;
      border-top: 1px dashed var(--border);
    }
    .os__lines {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }
    .os__line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .os__line dt,
    .os__line dd {
      margin: 0;
    }
    .os__line dd {
      font-weight: 600;
      white-space: nowrap;
    }
    .os__line--total {
      border-top: 1px solid var(--border);
      padding-top: 8px;
      font-size: 1.1rem;
    }
    .os__line--total dd {
      font-weight: 800;
      color: var(--primary-dark);
    }
    .os__notices {
      margin: 0;
      padding-left: 18px;
    }
  `,
})
export class OrderSummary {
  readonly order = input.required<Order>();
  readonly hasExtras = computed(() => Number(this.order().extras_brl) > 0);

  paxLabel(type: 'ADT' | 'CHD' | 'INF', count: number): string {
    return paxTypeLabel(type, count);
  }
}

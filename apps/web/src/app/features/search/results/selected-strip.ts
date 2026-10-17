import { Component, computed, input, output } from '@angular/core';
import type { Flight, Offer } from '@milhas/contracts';
import { airlineName, dayOffset } from '../../../shared/format';
import { stopsLabel } from '../../../shared/labels';
import { BrlPipe, DateShortPipe, HhmmPipe } from '../../../shared/pipes';

/** Faixa "Voo de ida/volta selecionado" acima da lista. */
@Component({
  selector: 'app-selected-strip',
  imports: [BrlPipe, DateShortPipe, HhmmPipe],
  template: `
    <div class="ss" [class.ss--muted]="!changeable()">
      <div class="ss__info">
        <span class="badge badge--success">{{ kind() === 'ida' ? 'Voo de ida selecionado' : 'Voo de volta selecionado' }}</span>
        <strong>{{ airline() }}</strong>
        <span>{{ flight().departure_at | dateShort: false }} · {{ flight().origin }} {{ flight().departure_at | hhmm }} → {{ flight().destination }} {{ flight().arrival_at | hhmm }}@if (plusDays() > 0) {<sup> +{{ plusDays() }}</sup>}</span>
        <span class="muted">{{ stops() }}@if (offer().fare_family_label) { · {{ offer().fare_family_label }}}</span>
        <span class="ss__price">{{ offer().price.total_brl | brl }} <small class="muted">por pessoa</small></span>
      </div>
      @if (changeable()) {
        <button type="button" class="btn btn--sm" (click)="change.emit()">{{ kind() === 'ida' ? 'Trocar ida' : 'Trocar volta' }}</button>
      }
    </div>
  `,
  styles: `
    .ss {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      background: var(--success-soft);
      border: 1px solid #bfe6cc;
      border-radius: var(--radius);
      padding: 10px 14px;
    }
    .ss--muted {
      background: var(--surface);
      border-color: var(--border);
    }
    .ss__info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      line-height: 1.2;
    }
    .ss__price {
      font-weight: 800;
      color: var(--primary-dark);
    }
  `,
})
export class SelectedStrip {
  readonly kind = input.required<'ida' | 'volta'>();
  readonly offer = input.required<Offer>();
  readonly flight = input.required<Flight>();
  readonly changeable = input(true);
  readonly change = output<void>();

  readonly airline = computed(() => airlineName(this.flight().airline, this.flight().airline_name));
  readonly plusDays = computed(() => dayOffset(this.flight().departure_at, this.flight().arrival_at));
  readonly stops = computed(() => stopsLabel(this.flight().stops_count));
}

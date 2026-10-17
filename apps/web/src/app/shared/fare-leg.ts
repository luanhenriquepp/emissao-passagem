import { Component, computed, input } from '@angular/core';
import type { FareDetail } from '@milhas/contracts';
import { airlineName, dayOffset, weekdayOf } from './format';
import { baggageLabel, cabinLabel, stopsLabel } from './labels';
import { DateShortPipe, DurationPipe, HhmmPipe } from './pipes';

/** Resumo de um trecho (ida/volta) a partir do FareDetail da cotação/pedido. */
@Component({
  selector: 'app-fare-leg',
  imports: [DateShortPipe, DurationPipe, HhmmPipe],
  template: `
    <div class="fl">
      <div class="fl__head">
        <span class="badge badge--info">{{ kind() === 'ida' ? 'Ida' : 'Volta' }}</span>
        <strong>{{ weekday() }}, {{ fare().flight.departure_at | dateShort }}</strong>
      </div>
      <div class="fl__body">
        <span class="fl__logo" aria-hidden="true">{{ fare().flight.airline_code }}</span>
        <div class="fl__times">
          <strong>{{ fare().flight.departure_at | hhmm }}</strong>
          <span class="muted small">{{ fare().flight.origin_iata }}</span>
        </div>
        <div class="fl__mid">
          <span class="small muted">{{ fare().flight.duration_minutes | duration }}</span>
          <span class="fl__bar" aria-hidden="true"></span>
          <span class="small" [class.muted]="fare().flight.stops_count > 0">{{ stops() }}</span>
        </div>
        <div class="fl__times">
          <strong>{{ fare().flight.arrival_at | hhmm }}@if (plusDays() > 0) {<sup class="fl__plus">+{{ plusDays() }}</sup>}</strong>
          <span class="muted small">{{ fare().flight.destination_iata }}</span>
        </div>
      </div>
      <div class="fl__meta muted small">
        <span>{{ airline() }} {{ fare().flight.flight_number }}</span>
        <span>· {{ cabin() }}</span>
        @if (fare().fare_family_label) {
          <span>· {{ fare().fare_family_label }}</span>
        }
        <span>· {{ baggage() }}</span>
        <span>· {{ fare().fare_rules.refundable ? 'Reembolsável' : 'Não reembolsável' }}</span>
      </div>
      @if (fare().flight.requires_airport_change) {
        <div class="alert alert--warning small">Este itinerário exige troca de aeroporto na conexão.</div>
      }
    </div>
  `,
  styles: `
    .fl {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fl__head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .fl__body {
      display: grid;
      grid-template-columns: 40px auto 1fr auto;
      gap: 12px;
      align-items: center;
    }
    .fl__logo {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--primary-soft);
      color: var(--primary-dark);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.85rem;
    }
    .fl__times {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
    }
    .fl__times strong {
      font-size: 1.15rem;
    }
    .fl__mid {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .fl__bar {
      width: 100%;
      height: 2px;
      background: var(--border);
    }
    .fl__plus {
      font-size: 0.65rem;
      color: var(--warning);
    }
    .fl__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  `,
})
export class FareLeg {
  readonly kind = input.required<'ida' | 'volta'>();
  readonly fare = input.required<FareDetail>();

  readonly airline = computed(() => airlineName(this.fare().flight.airline_code));
  readonly weekday = computed(() => weekdayOf(this.fare().flight.departure_at, true));
  readonly plusDays = computed(() => dayOffset(this.fare().flight.departure_at, this.fare().flight.arrival_at));
  readonly stops = computed(() => stopsLabel(this.fare().flight.stops_count));
  readonly cabin = computed(() => cabinLabel(this.fare().cabin));
  readonly baggage = computed(() => baggageLabel(this.fare().baggage));
}

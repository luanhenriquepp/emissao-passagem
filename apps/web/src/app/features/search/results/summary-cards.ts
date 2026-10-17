import { Component, input, output } from '@angular/core';
import { BrlPipe } from '../../../shared/pipes';
import type { FlightGroup, SummaryCard } from './filters';

@Component({
  selector: 'app-summary-cards',
  imports: [BrlPipe],
  template: `
    <div class="sc" role="list" aria-label="Resumo das melhores opções">
      @for (c of cards(); track c.key) {
        <button type="button" class="sc__card" role="listitem" [disabled]="!c.group" [class.sc__card--active]="c.group?.key === activeKey()" (click)="c.group && pick.emit(c.group)">
          <span class="sc__label">{{ c.label }}@if (!complete()) {<span class="muted"> · até agora</span>}</span>
          <span class="sc__price">{{ c.group ? (c.group.minPrice | brl) : '—' }}</span>
          <span class="sc__detail muted small">{{ c.detail }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .sc {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .sc__card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: flex-start;
      text-align: left;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
      color: inherit;
      cursor: pointer;
      min-width: 0;
    }
    .sc__card:hover:not(:disabled) {
      border-color: var(--primary);
    }
    .sc__card:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .sc__card--active {
      border-color: var(--primary);
      background: var(--primary-soft);
    }
    .sc__label {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--muted);
    }
    .sc__label .muted {
      text-transform: none;
      font-weight: 500;
      letter-spacing: 0;
    }
    .sc__price {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--primary-dark);
    }
    .sc__detail {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    @media (max-width: 991px) {
      .sc {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    @media (max-width: 767px) {
      .sc {
        display: flex;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .sc__card {
        flex: 0 0 150px;
      }
    }
  `,
})
export class SummaryCards {
  readonly cards = input.required<SummaryCard[]>();
  readonly complete = input(true);
  readonly activeKey = input<string | null>(null);
  readonly pick = output<FlightGroup>();
}

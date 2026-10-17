import { Component, computed, input, output } from '@angular/core';
import type { PaxSummaryLine, QuoteResponse } from '@milhas/contracts';
import type { ApiError } from '../../../core/api-error';
import { FareLeg } from '../../../shared/fare-leg';
import { dateTimeBr } from '../../../shared/format';
import { paxTypeLabel } from '../../../shared/labels';
import { BrlPipe } from '../../../shared/pipes';

const REQUOTE_CODES = new Set(['QUOTE_EXPIRED', 'FLIGHT_QUOTE_FARE_EXPIRED', 'PRICE_CHANGED', 'FLIGHT_QUOTE_FARE_NOT_FOUND', 'OFFER_NOT_FOUND']);

@Component({
  selector: 'app-trip-summary',
  imports: [BrlPipe, FareLeg],
  templateUrl: './trip-summary.html',
  styleUrl: './trip-summary.scss',
})
export class TripSummary {
  readonly quote = input<QuoteResponse | null>(null);
  readonly loading = input(false);
  readonly error = input<ApiError | null>(null);
  readonly creating = input(false);
  readonly orderError = input<ApiError | null>(null);

  readonly requote = output<void>();
  readonly proceed = output<void>();

  readonly canRequote = computed(() => {
    const e = this.error();
    return !!e && REQUOTE_CODES.has(e.code);
  });
  readonly validUntil = computed(() => dateTimeBr(this.quote()?.expires_at));

  paxLine(line: PaxSummaryLine): string {
    return paxTypeLabel(line.type, line.count);
  }
}

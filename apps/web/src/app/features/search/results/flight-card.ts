import { Component, computed, input, output } from '@angular/core';
import type { Offer, Segment } from '@milhas/contracts';
import { airlineName, dayOffset, minutesBetween } from '../../../shared/format';
import { baggageLabel, cabinLabel, seatLabel, stopsLabel } from '../../../shared/labels';
import { BrlPipe, DurationPipe, HhmmPipe } from '../../../shared/pipes';
import type { FlightGroup } from './filters';

interface ItineraryRow {
  segment: Segment;
  plusDays: number;
  /** Espera até o próximo trecho (minutos), se houver. */
  waitMinutes: number | null;
}

@Component({
  selector: 'app-flight-card',
  imports: [BrlPipe, DurationPipe, HhmmPipe],
  templateUrl: './flight-card.html',
  styleUrl: './flight-card.scss',
})
export class FlightCard {
  readonly group = input.required<FlightGroup>();
  readonly expanded = input(false);
  readonly selectedFareId = input<string | null>(null);
  readonly badges = input<string[]>([]);
  /** Mostra "ida e volta a partir de" (etapa de ida numa busca RT). */
  readonly showRoundTripFrom = input(false);

  readonly toggle = output<void>();
  readonly selectFare = output<string>();

  readonly flight = computed(() => this.group().flight);
  readonly airline = computed(() => airlineName(this.flight().airline, this.flight().airline_name));
  readonly plusDays = computed(() => dayOffset(this.flight().departure_at, this.flight().arrival_at));
  readonly stops = computed(() => stopsLabel(this.flight().stops_count));
  readonly stopDots = computed(() => Array.from({ length: Math.max(0, this.flight().stops_count) }, (_, i) => i));
  readonly roundTripFrom = computed(() => (this.showRoundTripFrom() ? (this.group().minOffer.round_trip_from_total_brl ?? null) : null));
  readonly provisional = computed(() => this.group().offers.some((o) => o.is_provisional));

  readonly itinerary = computed<ItineraryRow[]>(() => {
    const segs = this.flight().segments ?? [];
    return segs.map((segment, i) => ({
      segment,
      plusDays: dayOffset(segment.departure_at, segment.arrival_at),
      waitMinutes: i < segs.length - 1 ? minutesBetween(segment.arrival_at, segs[i + 1].departure_at) : null,
    }));
  });

  cabin(o: Offer): string {
    return cabinLabel(o.cabin);
  }

  baggage(o: Offer): string {
    return baggageLabel(o.baggage);
  }

  seat(o: Offer): string {
    return seatLabel(o.seat_assignment_included, o.seat_class);
  }

  fareLabel(o: Offer, index: number): string {
    return o.fare_family_label || o.fare_family || `Tarifa ${index + 1}`;
  }

  segmentAirline(s: Segment): string {
    return airlineName(s.operating_airline);
  }
}

import { findAirport, type FareSource, type Flight, type Offer, type SearchCabin, type Segment } from '@milhas/contracts';
import { md5, nextCursor, seededRandom } from '../../common/ids.js';
import { money } from '../../common/money.js';
import { addMinutes, compact, localDateTime, minutesBetween } from '../../common/time.js';
import { AIRCRAFT, AIRLINES, AIRLINES_BY_ZONE, SOURCE_AIRLINES, SOURCE_DISCOUNT, ZONE_PROFILE, zoneFor, type Zone } from './market.js';

export interface SourceQuery {
  origins: string[];
  destinations: string[];
  date: string;
  cabin: SearchCabin;
  /** restringe às companhias (usado nas opções de volta) */
  airlines?: string[];
  roundTrip: boolean;
  expiresAt: string;
}

export interface SourceBatch {
  flights: Flight[];
  offers: Offer[];
}

export interface FareSourceAdapter {
  readonly name: FareSource;
  /** Emite lotes progressivamente; resolve quando a fonte terminou. */
  search(query: SourceQuery, emit: (batch: SourceBatch) => void, signal: AbortSignal): Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

/** Latência simulada por fonte (ms entre lotes) — milhas respondem rápido, consolidadora demora. */
const LATENCY: Record<FareSource, number[]> = {
  MILES: [350, 900],
  AIRLINE_AGREEMENT: [600],
  CONSOLIDATOR: [1100, 1400],
  PUBLIC: [800],
};

const FAILURE_RATE = Number(process.env.SOURCE_FAILURE_RATE ?? 0);

/**
 * Fonte mock determinística: a mesma rota/data/fonte gera sempre os mesmos voos
 * (seed), com preços diferentes por fonte. Substituir por adapters reais
 * (programa de milhas, consolidadora, GDS) mantendo a interface.
 */
export class MockFareSource implements FareSourceAdapter {
  constructor(readonly name: FareSource) {}

  async search(query: SourceQuery, emit: (batch: SourceBatch) => void, signal: AbortSignal): Promise<void> {
    const delays = LATENCY[this.name];
    const batches = this.generate(query);
    for (let i = 0; i < batches.length; i++) {
      await sleep(delays[Math.min(i, delays.length - 1)], signal);
      if (signal.aborted) return;
      if (FAILURE_RATE > 0 && Math.random() < FAILURE_RATE) throw new Error(`${this.name} indisponível`);
      emit(batches[i]);
    }
  }

  /** Gera todos os voos da fonte e divide em lotes (1 por lote de latência). */
  private generate(query: SourceQuery): SourceBatch[] {
    const flights: Flight[] = [];
    const offers: Offer[] = [];
    for (const origin of query.origins) {
      for (const destination of query.destinations) {
        const zone = zoneFor(origin, destination);
        const allowed = SOURCE_AIRLINES[this.name];
        let airlines = AIRLINES_BY_ZONE[zone].filter((a) => allowed === 'ALL' || allowed.includes(a));
        if (query.airlines) airlines = airlines.filter((a) => query.airlines!.includes(a));
        for (const airline of airlines) {
          const rng = seededRandom(`${this.name}|${airline}|${origin}|${destination}|${query.date}`);
          const generated = this.generateAirline(rng, airline, origin, destination, zone, query);
          flights.push(...generated.flights);
          offers.push(...generated.offers);
        }
      }
    }
    const nBatches = LATENCY[this.name].length;
    const size = Math.ceil(flights.length / nBatches) || 1;
    const out: SourceBatch[] = [];
    for (let i = 0; i < nBatches; i++) {
      const slice = flights.slice(i * size, (i + 1) * size);
      if (!slice.length && i > 0) continue;
      const keys = new Set(slice.map((f) => f.flight_key));
      out.push({ flights: slice, offers: offers.filter((o) => keys.has(o.outbound_flight_key)) });
    }
    return out;
  }

  private generateAirline(rng: () => number, airline: string, origin: string, destination: string, zone: Zone, query: SourceQuery): SourceBatch {
    const info = AIRLINES[airline];
    const profile = ZONE_PROFILE[zone];
    const flights: Flight[] = [];
    const offers: Offer[] = [];
    const isInternational = zone !== 'DOMESTIC';
    const directCount = zone === 'DOMESTIC' ? 2 + Math.floor(rng() * 2) : 1;
    const connCount = zone === 'DOMESTIC' ? 1 + Math.floor(rng() * 2) : 2;
    const aircraftPool = isInternational ? AIRCRAFT.wide : AIRCRAFT.narrow;
    const baseFare = profile.base[0] + rng() * (profile.base[1] - profile.base[0]);

    const makeFlight = (stops: number): Flight => {
      const depMin = 360 + Math.floor(rng() * 16) * 60 + Math.floor(rng() * 12) * 5; // 06:00–22:00
      const departure = localDateTime(query.date, depMin);
      const baseMinutes = Math.round(profile.minutes[0] + rng() * (profile.minutes[1] - profile.minutes[0]));
      const number = String(1000 + Math.floor(rng() * 3999));
      const [acCode, acName] = aircraftPool[Math.floor(rng() * aircraftPool.length)];
      const segments: Segment[] = [];
      let arrival: string;
      if (stops === 0) {
        arrival = addMinutes(departure, baseMinutes);
        segments.push({ from: origin, to: destination, departure_at: departure, arrival_at: arrival, duration_minutes: baseMinutes, operating_airline: airline, flight_number: number, aircraft_code: acCode, aircraft_name: acName });
      } else {
        const hubs = info.hubs.filter((h) => h !== origin && h !== destination && findAirport(h));
        const hub = hubs.length ? hubs[Math.floor(rng() * hubs.length)] : 'GRU';
        const leg1 = Math.round(baseMinutes * (0.35 + rng() * 0.25));
        const layover = 55 + Math.floor(rng() * 25) * 5;
        const leg2 = Math.round(baseMinutes * (0.55 + rng() * 0.3));
        const arr1 = addMinutes(departure, leg1);
        const dep2 = addMinutes(arr1, layover);
        arrival = addMinutes(dep2, leg2);
        const number2 = String(1000 + Math.floor(rng() * 3999));
        segments.push({ from: origin, to: hub, departure_at: departure, arrival_at: arr1, duration_minutes: leg1, operating_airline: airline, flight_number: number, aircraft_code: acCode, aircraft_name: acName });
        segments.push({ from: hub, to: destination, departure_at: dep2, arrival_at: arrival, duration_minutes: leg2, operating_airline: airline, flight_number: number2, aircraft_code: acCode, aircraft_name: acName });
      }
      const duration = minutesBetween(departure, arrival);
      const keyBase = `${airline}-${number}-${origin}-${destination}-${compact(departure)}-${compact(arrival)}`;
      return {
        flight_key: `${keyBase}-${md5(keyBase).slice(0, 8)}`,
        airline,
        airline_name: info.name,
        flight_number: number,
        origin,
        destination,
        departure_at: departure,
        arrival_at: arrival,
        duration_minutes: duration,
        stops_count: stops,
        requires_airport_change: false,
        is_international: isInternational,
        aircraft_code: acCode,
        aircraft_name: acName,
        segments,
      };
    };

    const plan = [...Array(directCount).fill(0), ...Array(connCount).fill(1)] as number[];
    for (const stops of plan) {
      const flight = makeFlight(stops);
      flights.push(flight);
      const jitter = 0.9 + rng() * 0.25;
      const connectionDiscount = stops ? 0.86 : 1;
      const light = baseFare * jitter * connectionDiscount * SOURCE_DISCOUNT[this.name];
      const wantsEconomy = query.cabin === 'ALL' || query.cabin === 'ECONOMY' || query.cabin === 'PREMIUM_ECONOMY';
      const wantsBusiness = query.cabin === 'ALL' || query.cabin === 'BUSINESS' || query.cabin === 'FIRST';
      if (wantsEconomy) {
        for (const family of info.families) {
          const fare = light * family.factor;
          const taxes = fare * profile.taxRate;
          offers.push(this.offer(flight, family.label, 'ECONOMY', fare, taxes, family, query));
        }
      }
      if (wantsBusiness && isInternational && info.businessFamily && this.name !== 'MILES') {
        const fare = light * profile.businessFactor;
        const taxes = fare * profile.taxRate;
        offers.push(this.offer(flight, info.businessFamily, 'BUSINESS', fare, taxes, { checkedBags: 2, refundable: true, seat: 'EXTRA_COMFORT', changeFeeWaived: true }, query));
      }
    }
    return { flights, offers };
  }

  private offer(flight: Flight, label: string, cabin: Offer['cabin'], fare: number, taxes: number, family: { checkedBags: number; refundable: boolean; seat: Offer['seat_class'] & string; changeFeeWaived: boolean }, query: SourceQuery): Offer {
    const total = money(Math.round((fare + taxes) * 100));
    return {
      offer_id: nextCursor(),
      fare_group_key: `grp_${md5(`${flight.flight_key}|${label}|${this.name}`).slice(0, 16)}`,
      outbound_flight_key: flight.flight_key,
      cabin,
      fare_family: label.toUpperCase().replace(/\s+/g, '_'),
      fare_family_label: label,
      has_extra_seat: false,
      seat_assignment_included: family.seat !== 'NONE',
      seat_class: family.seat,
      change_fee_waived: family.changeFeeWaived,
      baggage: { checked_kg: family.checkedBags ? 23 : 0, checked_count: family.checkedBags, carry_on_kg: 10, carry_on_count: 1 },
      refundable: family.refundable,
      price: { total_brl: total, currency: 'BRL' },
      taxes_brl: money(Math.round(taxes * 100)),
      expires_at: query.expiresAt,
      round_trip_from_total_brl: query.roundTrip ? money(Math.round((fare + taxes) * 1.85 * 100)) : undefined,
      pair_fixed: false,
      is_provisional: false,
      replaces_offer_id: null,
    };
  }
}

export const DEFAULT_SOURCES: FareSource[] = ['MILES', 'CONSOLIDATOR', 'PUBLIC'];

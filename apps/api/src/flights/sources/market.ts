import { countryOf, type FareSource, type OfferCabin } from '@milhas/contracts';

/** Zonas de mercado usadas para duração, preço-base e companhias dos mocks. */
export type Zone = 'DOMESTIC' | 'SOUTH_AMERICA' | 'NORTH_AMERICA' | 'EUROPE' | 'LONG_HAUL';

const SOUTH_AMERICA = new Set(['AR', 'CL', 'UY', 'PE', 'CO', 'PY', 'BO', 'EC', 'VE']);
const NORTH_AMERICA = new Set(['US', 'CA', 'MX', 'PA', 'DO', 'CU']);
const EUROPE = new Set(['PT', 'ES', 'FR', 'GB', 'NL', 'DE', 'IT', 'CH', 'TR', 'BE', 'AT', 'IE']);

export function zoneFor(origin: string, destination: string): Zone {
  const a = countryOf(origin) ?? 'BR';
  const b = countryOf(destination) ?? 'BR';
  if (a === 'BR' && b === 'BR') return 'DOMESTIC';
  const foreign = a === 'BR' ? b : a;
  if (SOUTH_AMERICA.has(foreign)) return 'SOUTH_AMERICA';
  if (NORTH_AMERICA.has(foreign)) return 'NORTH_AMERICA';
  if (EUROPE.has(foreign)) return 'EUROPE';
  return 'LONG_HAUL';
}

export interface AirlineInfo {
  code: string;
  name: string;
  hubs: string[];
  /** famílias tarifárias econômicas, da mais básica à mais flexível */
  families: FamilySpec[];
  businessFamily?: string;
}

export interface FamilySpec {
  label: string;
  checkedBags: number;
  refundable: boolean;
  seat: 'NONE' | 'STANDARD' | 'EXTRA_COMFORT';
  changeFeeWaived: boolean;
  /** multiplicador sobre a tarifa Light */
  factor: number;
}

const fam = (label: string, checkedBags: number, refundable: boolean, seat: FamilySpec['seat'], changeFeeWaived: boolean, factor: number): FamilySpec => ({
  label,
  checkedBags,
  refundable,
  seat,
  changeFeeWaived,
  factor,
});

export const AIRLINES: Record<string, AirlineInfo> = {
  G3: { code: 'G3', name: 'GOL', hubs: ['GRU', 'GIG', 'BSB', 'CNF'], families: [fam('Light', 0, false, 'NONE', false, 1), fam('Classic', 1, true, 'STANDARD', false, 1.14), fam('Flex', 1, true, 'EXTRA_COMFORT', true, 1.26)] },
  AD: { code: 'AD', name: 'Azul', hubs: ['VCP', 'CNF', 'REC'], families: [fam('Azul', 0, false, 'NONE', false, 1), fam('Mais Azul', 1, true, 'STANDARD', false, 1.15), fam('Flex', 1, true, 'EXTRA_COMFORT', true, 1.3)] },
  LA: { code: 'LA', name: 'LATAM', hubs: ['GRU', 'BSB', 'LIM', 'SCL'], families: [fam('Light', 0, false, 'NONE', false, 1), fam('Plus', 1, true, 'STANDARD', false, 1.16), fam('Top', 2, true, 'EXTRA_COMFORT', true, 1.34)], businessFamily: 'Premium Business' },
  AR: { code: 'AR', name: 'Aerolíneas Argentinas', hubs: ['EZE', 'AEP'], families: [fam('Base', 0, false, 'NONE', false, 1), fam('Flex', 1, true, 'STANDARD', true, 1.22)] },
  AA: { code: 'AA', name: 'American Airlines', hubs: ['MIA', 'DFW'], families: [fam('Basic Economy', 0, false, 'NONE', false, 1), fam('Main Cabin', 1, true, 'STANDARD', false, 1.12), fam('Flexible', 2, true, 'EXTRA_COMFORT', true, 1.4)], businessFamily: 'Flagship Business' },
  UA: { code: 'UA', name: 'United Airlines', hubs: ['EWR', 'IAH'], families: [fam('Basic', 0, false, 'NONE', false, 1), fam('Economy', 1, true, 'STANDARD', false, 1.13), fam('Economy Plus', 1, true, 'EXTRA_COMFORT', true, 1.3)], businessFamily: 'Polaris' },
  CM: { code: 'CM', name: 'Copa Airlines', hubs: ['PTY'], families: [fam('Basic', 0, false, 'NONE', false, 1), fam('Classic', 1, true, 'STANDARD', false, 1.1), fam('Full', 2, true, 'EXTRA_COMFORT', true, 1.28)], businessFamily: 'Business' },
  TP: { code: 'TP', name: 'TAP Portugal', hubs: ['LIS', 'OPO'], families: [fam('Discount', 0, false, 'NONE', false, 1), fam('Basic', 1, false, 'NONE', false, 1.08), fam('Classic', 1, true, 'STANDARD', false, 1.2), fam('Plus', 2, true, 'EXTRA_COMFORT', true, 1.38)], businessFamily: 'Executive' },
  AF: { code: 'AF', name: 'Air France', hubs: ['CDG'], families: [fam('Light', 0, false, 'NONE', false, 1), fam('Standard', 1, true, 'STANDARD', false, 1.15), fam('Flex', 2, true, 'EXTRA_COMFORT', true, 1.36)], businessFamily: 'Business' },
  KL: { code: 'KL', name: 'KLM', hubs: ['AMS'], families: [fam('Light', 0, false, 'NONE', false, 1), fam('Standard', 1, true, 'STANDARD', false, 1.15), fam('Flex', 2, true, 'EXTRA_COMFORT', true, 1.36)], businessFamily: 'Business' },
  IB: { code: 'IB', name: 'Iberia', hubs: ['MAD'], families: [fam('Basic', 0, false, 'NONE', false, 1), fam('Optima', 1, true, 'STANDARD', false, 1.14), fam('Flexible', 2, true, 'EXTRA_COMFORT', true, 1.33)], businessFamily: 'Business' },
  LH: { code: 'LH', name: 'Lufthansa', hubs: ['FRA', 'MUC'], families: [fam('Light', 0, false, 'NONE', false, 1), fam('Classic', 1, true, 'STANDARD', false, 1.15), fam('Flex', 2, true, 'EXTRA_COMFORT', true, 1.38)], businessFamily: 'Business' },
  EK: { code: 'EK', name: 'Emirates', hubs: ['DXB'], families: [fam('Saver', 1, false, 'STANDARD', false, 1), fam('Flex', 2, true, 'STANDARD', true, 1.2), fam('Flex Plus', 2, true, 'EXTRA_COMFORT', true, 1.4)], businessFamily: 'Business' },
  QR: { code: 'QR', name: 'Qatar Airways', hubs: ['DOH'], families: [fam('Classic', 1, false, 'STANDARD', false, 1), fam('Convenience', 2, true, 'STANDARD', false, 1.18), fam('Comfort', 2, true, 'EXTRA_COMFORT', true, 1.38)], businessFamily: 'Business' },
  TK: { code: 'TK', name: 'Turkish Airlines', hubs: ['IST'], families: [fam('Promotion', 1, false, 'NONE', false, 1), fam('Semi Flex', 1, true, 'STANDARD', false, 1.15), fam('Flex', 2, true, 'EXTRA_COMFORT', true, 1.35)], businessFamily: 'Business' },
};

export const AIRLINES_BY_ZONE: Record<Zone, string[]> = {
  DOMESTIC: ['G3', 'AD', 'LA'],
  SOUTH_AMERICA: ['LA', 'G3', 'AR', 'AD'],
  NORTH_AMERICA: ['LA', 'AA', 'UA', 'CM', 'AD'],
  EUROPE: ['LA', 'TP', 'AF', 'KL', 'IB', 'LH'],
  LONG_HAUL: ['EK', 'QR', 'TK', 'LA'],
};

/** Companhias que cada fonte consegue cotar. */
export const SOURCE_AIRLINES: Record<FareSource, string[] | 'ALL'> = {
  MILES: ['G3', 'AD', 'LA', 'TP', 'AA', 'IB', 'AF', 'KL'],
  CONSOLIDATOR: 'ALL',
  AIRLINE_AGREEMENT: ['AD', 'LA', 'G3'],
  PUBLIC: 'ALL',
};

/** Desconto da fonte sobre o preço público (é aqui que "milhas × dinheiro" vira margem). */
export const SOURCE_DISCOUNT: Record<FareSource, number> = {
  MILES: 0.8,
  AIRLINE_AGREEMENT: 0.88,
  CONSOLIDATOR: 0.93,
  PUBLIC: 1,
};

/** Duração direta aproximada (min) e tarifa Light base (R$) por zona. */
export const ZONE_PROFILE: Record<Zone, { minutes: [number, number]; base: [number, number]; taxRate: number; businessFactor: number }> = {
  DOMESTIC: { minutes: [65, 240], base: [330, 820], taxRate: 0.09, businessFactor: 2.6 },
  SOUTH_AMERICA: { minutes: [150, 330], base: [900, 1900], taxRate: 0.14, businessFactor: 2.8 },
  NORTH_AMERICA: { minutes: [480, 600], base: [2100, 4200], taxRate: 0.16, businessFactor: 3.2 },
  EUROPE: { minutes: [560, 720], base: [2200, 4800], taxRate: 0.18, businessFactor: 3.3 },
  LONG_HAUL: { minutes: [720, 900], base: [3400, 7200], taxRate: 0.17, businessFactor: 3.4 },
};

export const AIRCRAFT: Record<string, [string, string][]> = {
  narrow: [
    ['B738', 'Boeing 737-800'],
    ['B38M', 'Boeing 737 MAX 8'],
    ['A320', 'Airbus A320'],
    ['A321', 'Airbus A321neo'],
    ['E195', 'Embraer E195-E2'],
  ],
  wide: [
    ['B789', 'Boeing 787-9'],
    ['A359', 'Airbus A350-900'],
    ['B77W', 'Boeing 777-300ER'],
    ['A333', 'Airbus A330-300'],
  ],
};

export function cabinForFamily(isBusiness: boolean): OfferCabin {
  return isBusiness ? 'BUSINESS' : 'ECONOMY';
}

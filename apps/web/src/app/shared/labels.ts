import type { Baggage, OfferCabin, PaxType } from '@milhas/contracts';

export const CABIN_LABELS: Record<OfferCabin, string> = {
  ECONOMY: 'Econômica',
  COMFORT: 'Conforto',
  PREMIUM_ECONOMY: 'Econômica Premium',
  BUSINESS: 'Executiva',
  FIRST: 'Primeira classe',
};

export function cabinLabel(cabin: string | null | undefined): string {
  return (cabin && (CABIN_LABELS as Record<string, string>)[cabin]) || cabin || '';
}

export function stopsLabel(stops: number): string {
  if (stops <= 0) return 'Direto';
  return stops === 1 ? '1 conexão' : `${stops} conexões`;
}

/** Texto curto de bagagem a partir do objeto de bagagem da oferta/cotação. */
export function baggageLabel(b: Baggage | null | undefined): string {
  if (!b) return 'Bagagem não informada';
  const checked = b.checked_count ?? 0;
  if (checked > 0) {
    const kg = b.checked_kg ? ` de ${b.checked_kg}kg` : '';
    return `${checked} bagagem${checked > 1 ? 'ns' : ''} despachada${checked > 1 ? 's' : ''}${kg}`;
  }
  const carry = b.carry_on_kg ? `${b.carry_on_kg}kg` : '';
  return carry ? `Só bagagem de mão (${carry})` : 'Só bagagem de mão';
}

export function seatLabel(included: boolean | null | undefined, seatClass?: string | null): string {
  if (!included) return 'Assento marcado no check-in';
  return seatClass === 'EXTRA_COMFORT' ? 'Assento com mais espaço incluído' : 'Marcação de assento incluída';
}

export const PAX_TYPE_LABELS: Record<PaxType, { singular: string; plural: string }> = {
  ADT: { singular: 'adulto', plural: 'adultos' },
  CHD: { singular: 'criança', plural: 'crianças' },
  INF: { singular: 'bebê', plural: 'bebês' },
};

export function paxTypeLabel(type: PaxType, count: number): string {
  const l = PAX_TYPE_LABELS[type];
  return `${count} ${count === 1 ? l.singular : l.plural}`;
}

export function paxSummaryLabel(p: { adt: number; chd: number; inf: number }): string {
  const parts: string[] = [];
  if (p.adt) parts.push(paxTypeLabel('ADT', p.adt));
  if (p.chd) parts.push(paxTypeLabel('CHD', p.chd));
  if (p.inf) parts.push(paxTypeLabel('INF', p.inf));
  return parts.join(', ');
}

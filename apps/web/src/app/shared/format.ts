/**
 * Formatação de datas/horas "locais sem fuso" (strings ISO como `2026-11-12T21:05:00`).
 * Nunca converte para Date com fuso: a hora do voo é a hora do aeroporto.
 */
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function hhmm(isoLocal: string | null | undefined): string {
  if (!isoLocal || isoLocal.length < 16) return '--:--';
  return isoLocal.slice(11, 16);
}

export function datePart(isoLocal: string | null | undefined): string {
  return (isoLocal ?? '').slice(0, 10);
}

/** `2026-11-12` → `12 nov 2026` */
export function dateShort(iso: string | null | undefined, withYear = true): string {
  const d = datePart(iso);
  if (d.length !== 10) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[m - 1]}${withYear ? ' ' + y : ''}`;
}

/** `2026-11-12` → `12/11/2026` */
export function dateBr(iso: string | null | undefined): string {
  const d = datePart(iso);
  if (d.length !== 10) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** `2026-11-12` → `12 de novembro de 2026` */
export function dateLong(iso: string | null | undefined): string {
  const d = datePart(iso);
  if (d.length !== 10) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

export function weekdayOf(iso: string | null | undefined, short = false): string {
  const d = datePart(iso);
  if (d.length !== 10) return '';
  const [y, m, day] = d.split('-').map(Number);
  const idx = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return short ? WEEKDAYS_SHORT[idx] : WEEKDAYS[idx];
}

/** Dias entre duas datas locais (chegada − partida), para o "+1". */
export function dayOffset(fromIso: string, toIso: string): number {
  const a = Date.parse(datePart(fromIso) + 'T00:00:00Z');
  const b = Date.parse(datePart(toIso) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Minutos entre dois horários locais (assume o mesmo fuso). */
export function minutesBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + (fromIso.length === 16 ? ':00' : '') + 'Z');
  const b = Date.parse(toIso + (toIso.length === 16 ? ':00' : '') + 'Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60_000));
}

export function durationLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBrl(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

export function formatBrlCompact(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return 'R$ ' + Math.round(Number.isFinite(n) ? n : 0).toLocaleString('pt-BR');
}

/** Data/hora ISO (UTC) → `17/10/2026 14:31` no fuso do navegador. */
export function dateTimeBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const AIRLINE_NAMES: Record<string, string> = {
  G3: 'GOL',
  AD: 'Azul',
  LA: 'LATAM',
  TP: 'TAP',
  AA: 'American',
  AV: 'Avianca',
  AF: 'Air France',
  KL: 'KLM',
  IB: 'Iberia',
  UX: 'Air Europa',
  CM: 'Copa',
  LH: 'Lufthansa',
  BA: 'British',
  TK: 'Turkish',
  EK: 'Emirates',
  DL: 'Delta',
  UA: 'United',
  AR: 'Aerolíneas',
  JA: 'JetSMART',
};

export function airlineName(code: string, fallback?: string): string {
  return fallback || AIRLINE_NAMES[code] || code;
}

import type { PaxType } from './flights.js';

/** Remove tudo que não é dígito. */
export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Valida CPF pelos dígitos verificadores (rejeita sequências repetidas). */
export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** Passaporte: 6 a 12 caracteres alfanuméricos. */
export const PASSPORT_REGEX = /^[A-Z0-9]{6,12}$/i;

export const NAME_MIN = 2;
export const NAME_MAX = 40;

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Idade em anos completos na data de referência. */
export function ageAt(birthDateIso: string, referenceIso: string): number {
  const [by, bm, bd] = birthDateIso.split('-').map(Number);
  const [ry, rm, rd] = referenceIso.split('-').map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

/** Faixas etárias do produto: adulto 12+, criança 2–11, bebê < 2 (na data do voo). */
export const PAX_AGE_RANGES: Record<PaxType, { min: number; max: number }> = {
  ADT: { min: 12, max: 130 },
  CHD: { min: 2, max: 11 },
  INF: { min: 0, max: 1 },
};

export function paxTypeForAge(age: number): PaxType {
  if (age < 2) return 'INF';
  if (age < 12) return 'CHD';
  return 'ADT';
}

/** Converte DD/MM/AAAA (input brasileiro) em YYYY-MM-DD; retorna null se inválida. */
export function brDateToIso(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** Dinheiro: strings decimais com 2 casas, sem float no domínio. */
export function toMoney(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function addMoney(...values: Array<string | number>): string {
  const cents = values.reduce<number>((acc, v) => acc + Math.round(Number(v) * 100), 0);
  return (cents / 100).toFixed(2);
}

export function mulMoney(value: string | number, factor: number): string {
  return (Math.round(Number(value) * 100 * factor) / 100).toFixed(2);
}

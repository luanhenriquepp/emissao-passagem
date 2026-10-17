/** Aritmética em centavos para nunca somar float no domínio. */
export function cents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function money(centsValue: number): string {
  return (centsValue / 100).toFixed(2);
}

export function sum(...values: Array<string | number>): string {
  return money(values.reduce<number>((acc, v) => acc + cents(v), 0));
}

export function times(value: string | number, factor: number): string {
  return money(Math.round(cents(value) * factor));
}

export function gte(a: string | number, b: string | number): boolean {
  return cents(a) >= cents(b);
}

export function minus(a: string | number, b: string | number): string {
  return money(cents(a) - cents(b));
}

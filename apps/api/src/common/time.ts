/** Datas/horários locais sem fuso ("2026-11-12T21:05:00"), como a API original. */

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function localDateTime(dateIso: string, minutesFromMidnight: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  base.setUTCMinutes(base.getUTCMinutes() + minutesFromMidnight);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}T${pad(base.getUTCHours())}:${pad(base.getUTCMinutes())}:00`;
}

export function addMinutes(localIso: string, minutes: number): string {
  const d = new Date(`${localIso}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}Z`).getTime() - new Date(`${a}Z`).getTime()) / 60000);
}

export function compact(localIso: string): string {
  return localIso.replace(/[-:]/g, '').slice(0, 13); // 20261112T2105
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function plusMinutesIso(minutes: number, from: Date = new Date()): string {
  return new Date(from.getTime() + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Horas até um horário local tratado como fuso de São Paulo (-03:00). */
export function hoursUntilLocal(localIso: string, now: Date = new Date()): number {
  const t = new Date(`${localIso}-03:00`).getTime();
  return (t - now.getTime()) / 3_600_000;
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 para leitura fácil

export function shortCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += BASE32[bytes[i] % BASE32.length];
  return out;
}

/** Ex.: MP-PED-C1MYE68A */
export const orderDisplayId = (): string => `MP-PED-${shortCode(8)}`;

/** Localizador de 6 caracteres, como as cias. */
export const recordLocator = (): string => shortCode(6);

export const md5 = (input: string): string => createHash('md5').update(input).digest('hex');

/** Cursor monotônico: timestamp em ns-ish + sequência, como string (não cabe em number com precisão). */
let lastCursor = 0n;
export function nextCursor(): string {
  const now = BigInt(Date.now()) * 1_000_000n;
  lastCursor = now > lastCursor ? now : lastCursor + 1n;
  return lastCursor.toString();
}

/** PRNG determinístico (mulberry32) para fontes mock reproduzíveis. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

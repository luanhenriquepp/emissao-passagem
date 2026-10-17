import { describe, expect, it } from 'vitest';
import {
  FlightSearchRequestSchema,
  PassengerInputSchema,
  buildSearchPath,
  canTransition,
  expandLocation,
  isValidCpf,
  suggestLocations,
  todayIsoSaoPaulo,
} from './index.js';

describe('FlightSearchRequestSchema', () => {
  const today = todayIsoSaoPaulo();
  it('aceita busca válida e normaliza IATA', () => {
    const r = FlightSearchRequestSchema.parse({
      origin: 'bsb',
      destination: 'rio',
      outbound_date: today,
      passengers: { adt: 1, chd: 0, inf: 0 },
    });
    expect(r.origin).toBe('BSB');
    expect(r.cabin).toBe('ALL');
  });
  it('rejeita bebê sem adulto e origem = destino', () => {
    expect(() =>
      FlightSearchRequestSchema.parse({ origin: 'BSB', destination: 'BSB', outbound_date: today, passengers: { adt: 1, chd: 0, inf: 0 } }),
    ).toThrow();
    expect(() =>
      FlightSearchRequestSchema.parse({ origin: 'BSB', destination: 'RIO', outbound_date: today, passengers: { adt: 1, chd: 0, inf: 2 } }),
    ).toThrow();
  });
});

describe('validation', () => {
  it('valida CPF por dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });
  it('rejeita passageiro com CPF inválido', () => {
    const res = PassengerInputSchema.safeParse({
      document_type: 'CPF',
      document_number: '123.456.789-00',
      first_name: 'Ana',
      last_name: 'Silva',
      birth_date: '1990-01-01',
      gender: 'F',
    });
    expect(res.success).toBe(false);
  });
});

describe('orders state machine', () => {
  it('permite só transições válidas', () => {
    expect(canTransition('DRAFT', 'PENDING_PAYMENT')).toBe(true);
    expect(canTransition('DRAFT', 'PAID')).toBe(false);
    expect(canTransition('BOOKED', 'FAILED')).toBe(false);
  });
});

describe('airports', () => {
  it('expande grupos de cidade e sugere por prefixo', () => {
    expect(expandLocation('RIO')).toEqual(['GIG', 'SDU']);
    expect(suggestLocations('bras')[0].code).toBe('BSB');
    expect(buildSearchPath({ type: 'OW', origin: 'BSB', destination: 'RIO', outbound_date: '2026-11-12', passengers: { adt: 1, chd: 0, inf: 0 }, cabin: 'ALL' })).toBe(
      '/voos/BSB/RIO/2026-11-12/1/0/0/ALL',
    );
  });
});

import { describe, expect, it, beforeAll } from 'vitest';
import { SearchService } from '../flights/search.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { OrdersService } from './orders.service.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoPlusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe('fluxo busca → pedido → pagamento → emissão', () => {
  let search: SearchService;
  let wallet: WalletService;
  let orders: OrdersService;
  const user = 'usr_test';

  beforeAll(() => {
    process.env.ISSUANCE_OUTCOME = 'booked';
    search = new SearchService();
    wallet = new WalletService();
    orders = new OrdersService(search, wallet);
  });

  it('cria pedido DRAFT a partir de tarifas e o leva até BOOKED', async () => {
    const { search: s } = search.create(user, { origin: 'GRU', destination: 'SSA', outbound_date: isoPlusDays(20), return_date: null, passengers: { adt: 1, chd: 0, inf: 0 }, cabin: 'ALL' });
    for (let i = 0; i < 50 && !search.snapshot(user, s.id).complete; i++) await sleep(100);
    const snap = search.snapshot(user, s.id);
    expect(snap.complete).toBe(true);
    expect(snap.offers.length).toBeGreaterThan(0);
    const offer = snap.offers[0];

    const order = orders.create(user, { outbound_fare_id: offer.offer_id, return_fare_id: null });
    expect(order.status).toBe('DRAFT');
    expect(order.display_id).toMatch(/^MP-PED-[A-Z2-9]{8}$/);
    expect(order.requirements.preferred_document_type).toBe('CPF');

    expect(() => orders.confirm(user, order.order_id)).toThrow(/Preencha todos os passageiros/);
    orders.setPassenger(user, order.order_id, 1, {
      nationality: 'BR',
      document_type: 'CPF',
      document_number: '529.982.247-25',
      first_name: 'Ana',
      last_name: 'Souza',
      birth_date: '1985-03-10',
      gender: 'F',
      save_as_favorite: false,
      extra_baggage_outbound_qty: 0,
      extra_baggage_return_qty: 0,
    });
    const confirmed = orders.confirm(user, order.order_id);
    expect(confirmed.status).toBe('PENDING_PAYMENT');

    expect(() => orders.pay(user, order.order_id)).toThrow(/Saldo insuficiente/);
    wallet.refund(user, confirmed.total_brl, 'seed', 'saldo de teste');
    const paid = orders.pay(user, order.order_id);
    expect(paid.status).toBe('BOOKING');
    expect(wallet.balance(user)).toBe('0.00');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// Importa do build (tsc) e não de src/: o vitest transpila com esbuild, que não emite os
// metadados de decorators de que a injeção de dependências do Nest precisa.
import { AppModule } from './../dist/app.module.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoPlusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let cookie = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const keep = (res: request.Response) => {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    if (set?.length) cookie = set[0].split(';')[0];
    return res;
  };

  it('GET /api/health responde no envelope padrão', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ success: true, data: { ok: true, service: 'emissao-api' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('erros de validação vêm como VALIDATION_ERROR com details', async () => {
    const res = keep(await api().post('/api/v1/flights/search').send({ origin: 'BSB', destination: 'BSB' }).expect(400));
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('busca → snapshot → cotação → pedido → pagamento → BOOKED', async () => {
    const created = keep(
      await api()
        .post('/api/v1/flights/search')
        .set('Cookie', cookie)
        .send({ origin: 'GRU', destination: 'SSA', outbound_date: isoPlusDays(25), return_date: null, passengers: { adt: 1, chd: 0, inf: 0 }, cabin: 'ALL' })
        .expect(201),
    ).body.data;
    expect(created.search_id).toBeTruthy();

    let snap: any;
    for (let i = 0; i < 60; i++) {
      snap = (await api().get(`/api/v1/flights/search/${created.search_id}`).set('Cookie', cookie).query({ cursor: '0', shape: 'normalized' }).expect(200)).body.data;
      if (snap.complete) break;
      await sleep(100);
    }
    expect(snap.complete).toBe(true);
    expect(snap.offers.length).toBeGreaterThan(0);
    const offer = snap.offers[0];
    expect(snap.flights[offer.outbound_flight_key]).toBeTruthy();

    const quote = (await api().post('/api/v1/flights/quote').set('Cookie', cookie).send({ outbound_fare_id: offer.offer_id }).expect(201)).body.data;
    expect(quote.grand_total_brl).toBe(offer.price.total_brl);

    const key = `e2e-${Date.now()}`;
    const order = (await api().post('/api/v1/orders').set('Cookie', cookie).set('Idempotency-Key', key).send({ outbound_fare_id: offer.offer_id }).expect(201)).body.data;
    expect(order.status).toBe('DRAFT');
    const again = (await api().post('/api/v1/orders').set('Cookie', cookie).set('Idempotency-Key', key).send({ outbound_fare_id: offer.offer_id }).expect(201)).body.data;
    expect(again.order_id).toBe(order.order_id);

    await api()
      .put(`/api/v1/orders/${order.order_id}/passengers/1`)
      .set('Cookie', cookie)
      .send({ nationality: 'BR', document_type: 'CPF', document_number: '529.982.247-25', first_name: 'Ana', last_name: 'Souza', birth_date: '1985-03-10', gender: 'F', save_as_favorite: false, extra_baggage_outbound_qty: 0, extra_baggage_return_qty: 0 })
      .expect(200);
    await api().patch(`/api/v1/orders/${order.order_id}/contact`).set('Cookie', cookie).send({ email: 'ana@example.com', phone: '+5561999998888' }).expect(200);
    const confirmed = (await api().post(`/api/v1/orders/${order.order_id}/confirm`).set('Cookie', cookie).expect(201)).body.data;
    expect(confirmed.status).toBe('PENDING_PAYMENT');

    const noBalance = await api().post(`/api/v1/orders/${order.order_id}/payment`).set('Cookie', cookie).set('Idempotency-Key', `${key}-pay`).send({}).expect(402);
    expect(noBalance.body.error.code).toBe('INSUFFICIENT_BALANCE');

    await api().post('/api/v1/me/wallet/deposits').set('Cookie', cookie).send({ amount_brl: confirmed.total_brl }).expect(201);
    await sleep(50);
    const paid = (await api().post(`/api/v1/orders/${order.order_id}/payment`).set('Cookie', cookie).set('Idempotency-Key', `${key}-pay2`).send({}).expect(201)).body.data;
    expect(paid.status).toBe('BOOKING');

    let final: any;
    for (let i = 0; i < 50; i++) {
      final = (await api().get(`/api/v1/orders/${order.order_id}`).set('Cookie', cookie).expect(200)).body.data;
      if (final.status === 'BOOKED') break;
      await sleep(100);
    }
    expect(final.status).toBe('BOOKED');
    expect(final.record_locator).toMatch(/^[A-Z0-9]{6}$/);
    expect(final.tickets).toHaveLength(1);

    const list = (await api().get('/api/v1/me/orders').set('Cookie', cookie).expect(200)).body.data;
    expect(list.items.some((i: any) => i.order_id === order.order_id && i.status === 'BOOKED')).toBe(true);
  });
});

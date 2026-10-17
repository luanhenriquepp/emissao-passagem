#!/usr/bin/env node
/**
 * Smoke test ponta a ponta contra a API (precisa dela rodando em BASE, padrão http://localhost:3000).
 *   node scripts/smoke.mjs
 * Exercita: login → busca → polling → ida → volta → cotação → pedido → passageiros → contato → confirm → depósito → pagamento → emissão.
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:3000';
let cookie = '';
const log = (...a) => console.log('•', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const json = await res.json();
  if (!json.success) {
    const err = new Error(`${method} ${path} → ${res.status} ${json.error?.code}: ${json.error?.message}`);
    err.code = json.error?.code;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function isoPlusDays(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const me = await call('POST', '/v1/auth/login', { email: 'smoke@agencia.local', password: 'senha12345', full_name: 'Agência Smoke' });
log('login:', me.email, 'saldo', me.balance);

const ida = isoPlusDays(30);
const volta = isoPlusDays(37);
const created = await call('POST', '/v1/flights/search', { origin: 'BSB', destination: 'RIO', outbound_date: ida, return_date: volta, passengers: { adt: 1, chd: 1, inf: 0 }, cabin: 'ALL' });
log('busca criada:', created.search_id);

let etag = '';
let snap;
for (let i = 0; i < 40; i++) {
  snap = await call('GET', `/v1/flights/search/${created.search_id}?cursor=0&shape=normalized${etag ? `&snapshot_etag=${etag}` : ''}`);
  if (!snap.snapshot_unchanged) {
    etag = snap.snapshot_etag;
    log(`snapshot ${snap.progress_pct}% voos=${Object.keys(snap.flights).length} ofertas=${snap.offers.length} complete=${snap.complete}`);
  }
  if (snap.complete) break;
  await sleep(400);
}
if (!snap?.complete) throw new Error('busca não completou');
const full = await call('GET', `/v1/flights/search/${created.search_id}?cursor=0&shape=normalized`);
const cheapest = [...full.offers].sort((a, b) => Number(a.price.total_brl) - Number(b.price.total_brl))[0];
const flight = full.flights[cheapest.outbound_flight_key];
log('ida mais barata:', flight.airline, flight.flight_number, flight.departure_at, cheapest.fare_family_label, 'R$', cheapest.price.total_brl);

const sel = await call('POST', `/v1/flights/search/${created.search_id}/select-outbound`, { outbound_fare_id: cheapest.offer_id });
log('select-outbound:', sel.phase, 'est', sel.estimated_seconds, 's');
let ret;
for (let i = 0; i < 40; i++) {
  ret = await call('GET', `/v1/flights/search/${created.search_id}/return-options?outbound_fare_id=${cheapest.offer_id}&cursor=0`);
  if (ret.complete) break;
  await sleep(400);
}
if (!ret.offers.length) throw new Error('sem opções de volta');
const retOffer = [...ret.offers].sort((a, b) => Number(a.price.total_brl) - Number(b.price.total_brl))[0];
if (!retOffer.return_flight_key || retOffer.outbound_flight_key !== flight.flight_key || !retOffer.pair_fixed) throw new Error('oferta de volta deveria vir pareada com a ida (return_flight_key + pair_fixed)');
const retFlight = ret.flights[retOffer.return_flight_key];
log('volta mais barata:', retFlight.airline, retFlight.flight_number, retFlight.departure_at, 'R$', retOffer.price.total_brl, `(${ret.offers.length} ofertas, mesma cia: ${retFlight.airline === flight.airline})`);

const quote = await call('POST', '/v1/flights/quote', { outbound_fare_id: cheapest.offer_id, return_fare_id: retOffer.offer_id });
log('cotação:', quote.quote_id, 'total R$', quote.grand_total_brl, quote.summary.map((s) => `${s.type}×${s.count}=${s.total_brl}`).join(' '));

const idem = randomUUID();
const order = await call('POST', '/v1/orders', { outbound_fare_id: cheapest.offer_id, return_fare_id: retOffer.offer_id }, { 'Idempotency-Key': idem });
const again = await call('POST', '/v1/orders', { outbound_fare_id: cheapest.offer_id, return_fare_id: retOffer.offer_id }, { 'Idempotency-Key': idem });
if (again.order_id !== order.order_id) throw new Error('idempotência falhou');
log('pedido:', order.display_id, order.status, 'expira', order.expires_at, 'pax required', JSON.stringify(order.passengers_required));

try {
  await call('POST', `/v1/orders/${order.order_id}/confirm`);
  throw new Error('confirm deveria falhar sem passageiros');
} catch (e) {
  if (e.code !== 'ORDER_PASSENGERS_INCOMPLETE') throw e;
  log('confirm sem pax → ORDER_PASSENGERS_INCOMPLETE ok');
}

await call('PUT', `/v1/orders/${order.order_id}/passengers/1`, { document_type: 'CPF', document_number: '529.982.247-25', first_name: 'Mariana', last_name: 'Silva', birth_date: '1990-05-14', gender: 'F', save_as_favorite: true, extra_baggage_outbound_qty: 1 });
try {
  await call('PUT', `/v1/orders/${order.order_id}/passengers/2`, { document_type: 'CPF', document_number: '529.982.247-25', first_name: 'João', last_name: 'Silva', birth_date: '2018-02-01', gender: 'M' });
  throw new Error('CPF duplicado deveria falhar');
} catch (e) {
  if (e.code !== 'ORDER_DUPLICATE_PASSENGER_CPF') throw e;
  log('CPF duplicado → ORDER_DUPLICATE_PASSENGER_CPF ok');
}
try {
  await call('PUT', `/v1/orders/${order.order_id}/passengers/2`, { document_type: 'CPF', document_number: '111.444.777-35', first_name: 'João', last_name: 'Silva', birth_date: '2000-02-01', gender: 'M' });
  throw new Error('idade de criança deveria falhar');
} catch (e) {
  if (e.code !== 'ORDER_PASSENGER_AGE_TOO_OLD') throw e;
  log('adulto como CHD → ORDER_PASSENGER_AGE_TOO_OLD ok');
}
const withPax = await call('PUT', `/v1/orders/${order.order_id}/passengers/2`, { document_type: 'CPF', document_number: '111.444.777-35', first_name: 'João', last_name: 'Silva', birth_date: '2018-02-01', gender: 'M' });
log('passageiros completos:', withPax.passengers.every((p) => p.is_complete), 'extras R$', withPax.extras_brl, 'total R$', withPax.total_brl);

await call('PATCH', `/v1/orders/${order.order_id}/contact`, { email: 'cliente@exemplo.com', phone: '(61) 99999-0000' });
const confirmed = await call('POST', `/v1/orders/${order.order_id}/confirm`);
log('confirmado:', confirmed.status);

try {
  await call('POST', `/v1/orders/${order.order_id}/payment`, undefined, { 'Idempotency-Key': randomUUID() });
  throw new Error('pagamento sem saldo deveria falhar');
} catch (e) {
  if (e.code !== 'INSUFFICIENT_BALANCE') throw e;
  log('sem saldo → INSUFFICIENT_BALANCE ok');
}

const dep = await call('POST', '/v1/me/wallet/deposits', { amount_brl: confirmed.total_brl });
log('depósito PIX criado, confirma em', dep.auto_confirm_seconds, 's');
await sleep((dep.auto_confirm_seconds + 1) * 1000);
const wallet = await call('GET', '/v1/me/wallet');
log('saldo após depósito: R$', wallet.balances.available);

const payKey = randomUUID();
const paid = await call('POST', `/v1/orders/${order.order_id}/payment`, undefined, { 'Idempotency-Key': payKey });
const paidAgain = await call('POST', `/v1/orders/${order.order_id}/payment`, undefined, { 'Idempotency-Key': payKey });
log('pago:', paid.status, '(repetição idempotente:', paidAgain.status + ')');

let final;
for (let i = 0; i < 60; i++) {
  final = await call('GET', `/v1/orders/${order.order_id}`);
  if (!['PAID', 'BOOKING', 'BOOKING_STUCK'].includes(final.status)) break;
  await sleep(1000);
}
log('emissão:', final.status, 'localizador', final.record_locator, 'e-tickets', final.tickets.length);

const list = await call('GET', '/v1/me/orders?page=1&per_page=20&filter=all');
log('minhas compras:', list.items.length, 'item(ns);', 'emitidas', list.metrics.issued_count, 'gasto R$', list.metrics.total_paid_brl);
const favs = await call('GET', '/v1/me/passengers');
log('favoritos:', favs.length);

if (final.status !== 'BOOKED' && final.status !== 'FAILED') throw new Error(`status final inesperado: ${final.status}`);
console.log('\n✔ smoke OK');

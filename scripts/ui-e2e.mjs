// Robô de UI ponta a ponta: home → busca → ida → (volta) → resumo → passageiros → pagamento (PIX mock) → BOOKED → Minhas compras.
// Exige API (`npm run dev:api`) e web (`npm run dev:web`) rodando, e o Playwright instalado:
//   npm i -D playwright && npx playwright install chromium
// Uso: node scripts/ui-e2e.mjs            (ida e volta)
//      TRIP=OW node scripts/ui-e2e.mjs    (só ida)
// Screenshots de cada etapa ficam em SHOTS (padrão: ./e2e-shots).
import { mkdirSync } from 'node:fs';

const { chromium } = await import('playwright').catch(() => {
  console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
});

const BASE = process.env.BASE ?? 'http://localhost:4200';
const SHOTS = process.env.SHOTS ?? new URL('../e2e-shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const isoPlusDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
const apiCalls = [];
page.on('response', (r) => { if (r.url().includes('/api/')) apiCalls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });

let step = 0;
const shot = async (name) => { step++; await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, '0')}-${name}.png`, fullPage: true }); };
const fail = async (msg) => { await shot('FAIL'); console.error('✖', msg); console.error('API calls:\n' + apiCalls.slice(-25).join('\n')); console.error('console errors:', consoleErrors); await browser.close(); process.exit(1); };

try {
  // 1. Home
  await page.goto(BASE + '/');
  await page.waitForSelector('form.sf');
  await shot('home');

  // 2. Preenche a busca (RT, BSB → RIO, 1 ADT + 1 CHD)
  const pickLocation = async (inputId, text, code) => {
    const input = page.locator(`#${inputId}`);
    await input.click();
    await input.fill(text);
    const item = page.locator(`#${inputId}-list li`, { hasText: code }).first();
    await item.waitFor({ timeout: 5000 });
    await item.dispatchEvent('mousedown');
    await page.waitForTimeout(100);
    const value = await input.inputValue();
    log(`location ${inputId} →`, value);
  };
  await pickLocation('sf-origin', 'Bras', 'BSB');
  await pickLocation('sf-destination', 'Rio', 'RIO');
  const OW = process.env.TRIP === 'OW';
  const ida = isoPlusDays(30), volta = isoPlusDays(37);
  if (OW) await page.click('.sf__type button:has-text("Só ida")');
  await page.fill('#sf-ida', ida);
  if (!OW) await page.fill('#sf-volta', volta);
  await page.click('.sf__pax-btn');
  await page.click('button[aria-label="Mais crianças"]');
  await page.click('.sf__pax-done');
  await shot('form-filled');
  await page.click('form.sf button[type=submit]');
  await page.waitForURL(/\/voos\/BSB\/RIO\//, { timeout: 10000 });
  log('url', page.url());
  const expectedPath = OW ? `/voos/BSB/RIO/${ida}/1/1/0/ALL` : `/voos/BSB/RIO/${ida}/${volta}/1/1/0/ALL`;
  if (!page.url().endsWith(expectedPath)) await fail('URL inesperada: ' + page.url());

  // 3. Resultados ida: espera a lista
  await page.waitForSelector('app-flight-card', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.rp__progress'), null, { timeout: 60000 }).catch(() => log('progress bar ainda visível'));
  const outboundCards = await page.locator('app-flight-card').count();
  const summaryCards = await page.locator('app-summary-cards').count();
  log('cards ida:', outboundCards, 'summary-cards:', summaryCards);
  if (outboundCards === 0) await fail('sem cards de ida');
  await shot('results-outbound');

  // Verifica filtros e ordenação renderizados
  const hasFilters = await page.locator('app-filters-panel').count();
  log('filters panel:', hasFilters);

  // 4. Expande o primeiro card e seleciona a primeira tarifa
  await page.locator('app-flight-card .fc__main').first().click();
  await page.waitForSelector('.fc__fare', { timeout: 5000 });
  const fareCount = await page.locator('.fc__fare').count();
  log('tarifas no card:', fareCount);
  await shot('outbound-fares');
  await page.locator('.fc__fare button').first().click();

  // 5. Etapa volta (só em RT)
  await page.waitForSelector('app-selected-strip', { timeout: 15000 });
  if (!OW) {
  await page.waitForSelector('h2.rp__stage', { timeout: 15000 });
  const stageTitle = await page.locator('h2.rp__stage').innerText();
  log('stage:', stageTitle);
  await page.waitForSelector('app-flight-card', { timeout: 30000 });
  // espera a lista de volta ficar estável (sem "atualizando")
  await page.waitForFunction(() => !document.querySelector('.rp__mini-spinner'), null, { timeout: 30000 }).catch(() => log('ainda atualizando volta'));
  const returnCards = await page.locator('app-flight-card').count();
  log('cards volta:', returnCards);
  if (returnCards === 0) await fail('sem cards de volta');
  // Todos da mesma cia?
  const airlines = await page.locator('app-flight-card .fc__logo').allInnerTexts();
  log('cias volta:', [...new Set(airlines)]);
  await shot('results-return');
  await page.locator('app-flight-card .fc__main').first().click();
  await page.waitForSelector('.fc__fare', { timeout: 5000 });
  await page.locator('.fc__fare button').first().click();
  }

  // 6. Resumo
  await page.waitForSelector('app-trip-summary', { timeout: 15000 });
  await page.waitForSelector('.ts__breakdown', { timeout: 15000 });
  const total = await page.locator('.ts__line--total dd').innerText();
  const strips = await page.locator('app-selected-strip').count();
  log('total cotação:', total, 'strips:', strips);
  if (strips !== (OW ? 1 : 2)) await fail('faixas de seleção inesperadas: ' + strips);
  await shot('summary');
  await page.click('app-trip-summary button.btn--primary.btn--block');

  // 7. Passageiros
  await page.waitForURL(/\/passageiros\//, { timeout: 15000 });
  await page.waitForSelector('app-passenger-card', { timeout: 15000 });
  const slots = await page.locator('app-passenger-card').count();
  log('slots passageiros:', slots, 'url', page.url());
  if (slots !== 2) await fail('esperava 2 slots');
  const timer = await page.locator('.pp__timer strong').innerText();
  log('timer:', timer);
  await shot('passengers-empty');

  // contato
  await page.click('button:has-text("Usar os dados da minha conta")');
  await page.waitForFunction(() => (document.querySelector('.pp__contact input[type=email]')?.value ?? '') !== '', null, { timeout: 5000 });
  const email = await page.locator('.pp__contact input[type=email]').inputValue();
  log('email preenchido:', email);
  if (!email.includes('@')) await fail('e-mail da conta não preenchido');
  await page.fill('.pp__contact input[type=tel]', '61999998888');

  const fillPax = async (pos, { cpf, first, last, birth, gender, bagsOut = 0 }) => {
    const card = page.locator(`#pax-${pos}`);
    const form = card.locator('form');
    await form.waitFor({ timeout: 5000 });
    await form.locator('input[formcontrolname=document_number]').fill(cpf);
    await form.locator('input[formcontrolname=first_name]').fill(first);
    await form.locator('input[formcontrolname=last_name]').fill(last);
    await form.locator('input[formcontrolname=birth_date]').fill(birth);
    await form.locator(`label.chip:has(input[formcontrolname=gender][value=${gender}])`).click();
    for (let i = 0; i < bagsOut; i++) await form.locator('button[aria-label="Mais bagagem na ida"]').click();
    if (pos === 1) await form.locator('input[formcontrolname=save_as_favorite]').check();
    await form.locator('button[type=submit]').click();
    await card.locator('.badge--success', { hasText: 'Confirmado' }).waitFor({ timeout: 10000 });
    log(`pax ${pos} confirmado:`, (await card.locator('.pc__summary').innerText()).replace(/\s+/g, ' '));
  };

  // 7a. Erro de validação: criança com idade de adulto → erro do servidor exibido
  {
    const card = page.locator('#pax-2');
    const form = card.locator('form');
    await form.locator('input[formcontrolname=document_number]').fill('111.444.777-35');
    await form.locator('input[formcontrolname=first_name]').fill('Pedro');
    await form.locator('input[formcontrolname=last_name]').fill('Souza');
    await form.locator('input[formcontrolname=birth_date]').fill('10/03/1990');
    await form.locator('label.chip:has(input[formcontrolname=gender][value=M])').click();
    await form.locator('button[type=submit]').click();
    const err = form.locator('.field__error');
    await err.first().waitFor({ timeout: 10000 });
    log('erro esperado (idade, validado no cliente):', await err.first().innerText());
    if (apiCalls.some((c) => c.includes('/passengers/2'))) await fail('não deveria ter chamado a API com idade inválida');
    await shot('passenger-age-error');
  }

  await fillPax(1, { cpf: '529.982.247-25', first: 'Ana', last: 'Souza', birth: '10/03/1985', gender: 'F', bagsOut: 1 });
  const childBirth = (() => { const d = new Date(Date.now() - 6 * 365.25 * 86_400_000); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })();
  await fillPax(2, { cpf: '111.444.777-35', first: 'Pedro', last: 'Souza', birth: childBirth, gender: 'M' });
  await shot('passengers-done');

  const orderTotalBefore = await page.locator('app-order-summary').innerText();
  log('resumo pedido (trecho):', orderTotalBefore.replace(/\s+/g, ' ').slice(0, 300));

  await page.click('button:has-text("Continuar para pagamento")');

  // 8. Pagamento
  await page.waitForURL(/\/pagamento\//, { timeout: 15000 });
  await page.waitForSelector('.py__wallet', { timeout: 15000 });
  const balance = await page.locator('.py__amounts .py__big').first().innerText();
  const orderTotal = await page.locator('.py__amounts .py__big').nth(1).innerText();
  log('saldo:', balance, 'total:', orderTotal);
  await shot('payment-no-balance');
  const payBtn = page.locator('button:has-text("Pagar com saldo")');
  if (!(await payBtn.isDisabled())) await fail('botão pagar deveria estar desabilitado sem saldo');

  await page.click('button:has-text("Depositar via PIX")');
  await page.waitForSelector('.py__deposit', { timeout: 5000 });
  const suggested = await page.locator('.py__deposit .field__hint').innerText();
  log('depósito sugerido:', suggested);
  await page.click('button:has-text("Gerar código PIX")');
  await page.waitForSelector('.py__pix-code', { timeout: 10000 });
  log('pix:', (await page.locator('.py__pix-code').innerText()).slice(0, 40) + '…');
  await shot('payment-pix');
  await page.locator('.alert--success', { hasText: 'Saldo atualizado' }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('button.btn--primary:disabled'), null, { timeout: 10000 }).catch(() => {});
  const balanceAfter = await page.locator('.py__amounts .py__big').first().innerText();
  log('saldo após depósito:', balanceAfter);
  await shot('payment-funded');
  if (await payBtn.isDisabled()) await fail('botão pagar deveria estar habilitado após depósito');
  await payBtn.click();

  // 9. Em emissão → BOOKED
  await page.locator('.py__state', { hasText: 'Em emissão' }).waitFor({ timeout: 15000 });
  log('em emissão…');
  await shot('payment-booking');
  await page.locator('.py__state--ok').waitFor({ timeout: 30000 });
  const locator = await page.locator('.py__locator strong').innerText();
  const tickets = await page.locator('.py__tickets li').allInnerTexts();
  log('BOOKED localizador:', locator, 'tickets:', tickets);
  await shot('payment-booked');

  // 10. Minhas compras
  await page.click('a:has-text("Ver minhas compras")');
  await page.waitForURL(/\/compras/, { timeout: 10000 });
  await page.waitForSelector('.pu__item', { timeout: 15000 });
  const metrics = await page.locator('.pu__metric strong').allInnerTexts();
  const items = await page.locator('.pu__item').count();
  const firstItem = (await page.locator('.pu__item').first().innerText()).replace(/\s+/g, ' ');
  log('métricas:', metrics, 'itens:', items);
  log('item:', firstItem.slice(0, 200));
  if (!firstItem.includes(locator)) await fail('localizador não aparece na lista');
  // filtro "Emitidas"
  await page.click('.pu__filters button:has-text("Emitidas")');
  await page.waitForTimeout(800);
  log('itens filtro emitidas:', await page.locator('.pu__item').count());
  await page.fill('.pu__search input', locator);
  await page.waitForTimeout(800);
  log('itens busca localizador:', await page.locator('.pu__item').count());
  await shot('purchases');

  // 11. Pesquisas recentes na home + favorito aparece em nova compra
  await page.goto(BASE + '/');
  await page.waitForSelector('form.sf');
  const recent = await page.locator('.recent__card').count();
  log('pesquisas recentes:', recent);
  await shot('home-recent');

  log('console errors:', consoleErrors.length, consoleErrors.slice(0, 5));
  const bad = apiCalls.filter((c) => /^(5\d\d) /.test(c));
  if (bad.length) await fail('respostas 5xx: ' + bad.join(', '));
  const nonOk = apiCalls.filter((c) => /^(4\d\d) /.test(c));
  log('respostas 4xx (esperadas: age error, pagamento sem saldo?):', nonOk);
  log('total chamadas API:', apiCalls.length);
  console.log('✔ UI e2e OK');
  await browser.close();
} catch (e) {
  await fail(e.stack ?? String(e));
}

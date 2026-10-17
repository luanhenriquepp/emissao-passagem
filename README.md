# Emissão Aérea — módulo de emissão automática (milhas e dinheiro)

Monorepo do primeiro módulo da plataforma: busca multi-fonte de passagens, seleção ida/volta por família tarifária, cotação, pedido, passageiros, pagamento com saldo da carteira e emissão assíncrona.

```
milhas-emissao/
├── packages/contracts   # @milhas/contracts — schemas zod, tipos, enums, máquina de estados, aeroportos
├── apps/api             # NestJS 12 (ESM) — motor de busca, cotação, pedidos, carteira, sessão
├── apps/web             # Angular 21 standalone/zoneless — buscador, resultados, checkout, compras
└── scripts/smoke.mjs    # teste ponta a ponta contra a API
```

## Requisitos

- Node 22.12+ (o Angular CLI 21 pede ≥ 22.12; 24 também serve) e npm 10+
- Primeira instalação: `npm install --legacy-peer-deps` na raiz (workspaces)

## Rodando

```bash
npm install --legacy-peer-deps
npm run build:contracts          # gera packages/contracts/dist (API e web importam daqui)
npm run dev                      # API em :3000 e web em :4200 (proxy /api → :3000)
```

Ou separadamente: `npm run dev:api` e `npm run dev:web`. Health: <http://localhost:3000/api/health>.

Em dev a API abre uma sessão demo automaticamente (`AUTO_LOGIN=true`); a tela `/login` aceita qualquer e-mail + senha com 8+ caracteres. Variáveis em `apps/api/.env.example`.

### Fluxo de demonstração

1. Busque uma rota (ex.: BSB → RIO, ida e volta, 1 adulto). As três fontes mockadas (milhas, consolidadora, tarifa pública) respondem em tempos diferentes e o snapshot vai crescendo (`progress_pct`, "· até agora").
2. Escolha a ida (família tarifária) → a lista de volta é restrita à mesma companhia.
3. Resumo da viagem → "Ir para os passageiros" cria o pedido `MP-PED-…` (DRAFT, 15 min).
4. Preencha os passageiros (CPF válido, idade coerente com o tipo), confirme e vá ao pagamento.
5. Sem saldo, use o depósito PIX mock (confirma em 5 s) e pague. A emissão é simulada: BOOKING → BOOKED (ou BOOKING_STUCK / FAILED com `ISSUANCE_OUTCOME=random`).
6. Acompanhe em Minhas compras (localizador, badges, métricas).

## Testes

```bash
npm test                         # vitest em api e contracts
npm run test:e2e                 # API em processo (supertest): envelope, validação, busca → BOOKED
npm run smoke                    # ponta a ponta via HTTP (exige API rodando: npm run dev:api)
npm run e2e:ui                   # robô de UI com Playwright (exige API + web rodando)
TRIP=OW npm run e2e:ui           # mesma jornada, só ida
```

O robô de UI (`scripts/ui-e2e.mjs`) percorre home → busca → ida → volta → resumo → passageiros (incluindo erro de idade, bagagem extra e favorito) → depósito PIX → pagamento → emissão → Minhas compras, e salva um screenshot de cada etapa em `e2e-shots/`. Ele precisa do Playwright, que não vem nas dependências: `npm i -D playwright && npx playwright install chromium`.

## Contratos principais (`/api/v1`)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/flights/search` | cria a busca (dedup por parâmetros, rate limit por usuário) |
| GET | `/flights/search/{id}?cursor&shape=normalized&snapshot_etag` | snapshot incremental; `snapshot_unchanged` quando o etag bate |
| POST | `/flights/search/{id}/select-outbound` | escolhe a ida e dispara a busca da volta (mesma cia) |
| GET | `/flights/search/{id}/return-options?outbound_fare_id` | opções de volta, já pareadas com a ida (`return_flight_key`, `pair_fixed`) |
| POST | `/flights/quote` | cotação por tipo de passageiro |
| POST | `/orders` (`Idempotency-Key`) | pedido DRAFT a partir das tarifas |
| GET | `/orders/{id}` | pedido completo |
| PUT | `/orders/{id}/passengers/{pos}` · PATCH `/orders/{id}/contact` · POST `/orders/{id}/confirm` | checkout |
| POST | `/orders/{id}/payment` (`Idempotency-Key`) | debita a carteira e inicia a emissão |
| POST | `/orders/{id}/cancel` | cancela antes da emissão (estorna se pago) |
| GET | `/me`, `/me/orders`, `/me/passengers`, `/me/wallet`, `/me/wallet/transactions` | conta, compras, favoritos, carteira |
| POST | `/me/wallet/deposits` | depósito PIX mock |
| POST | `/auth/login`, `/auth/logout` | sessão por cookie httpOnly |

Envelope: `{ success:true, message, data }` ou `{ success:false, error:{ code, message, details } }`; códigos em `packages/contracts/src/common.ts`.

## Onde evoluir

- **Fontes reais**: implemente `FareSourceAdapter` (`apps/api/src/flights/sources`) para programa de milhas, consolidadora e GDS; o agregador, o snapshot e o pareamento ida/volta não mudam.
- **Persistência**: hoje tudo é em memória (buscas com TTL de 20 min, pedidos, carteira). Troque os `Map`s por repositórios (Postgres/Redis) mantendo as assinaturas dos services.
- **Emissão**: `OrdersService.issue()` é o ponto de integração com a emissão real (fila + webhook/polling da cia); `BOOKING_STUCK` já existe para o suporte.
- **Autenticação**: `SessionService` guarda sessões em memória com usuário demo; plugue o login real (Turnstile, senha, e-mail de confirmação) sem mexer no guard.

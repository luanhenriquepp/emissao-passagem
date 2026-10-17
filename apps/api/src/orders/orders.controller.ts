import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ContactSchema, CreateOrderRequestSchema, HEADERS, PassengerInputSchema, type Contact, type CreateOrderRequest, type PassengerInput } from '@milhas/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import type { User } from '../auth/session.service.js';
import { ok } from '../common/envelope.interceptor.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

@Controller('v1/orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  create(@CurrentUser() user: User, @Headers(HEADERS.idempotencyKey) key: string | undefined, @Body(new ZodValidationPipe(CreateOrderRequestSchema)) body: CreateOrderRequest) {
    const existing = this.idempotency.lookup('orders.create', user.id, key, body);
    if (existing) return ok(this.orders.get(user.id, existing), 'Pedido já criado');
    const order = this.orders.create(user.id, body);
    this.idempotency.remember('orders.create', user.id, key, body, order.order_id);
    return ok(order, 'Pedido criado com sucesso');
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return ok(this.orders.get(user.id, id));
  }

  @Put(':id/passengers/:position')
  passenger(@CurrentUser() user: User, @Param('id') id: string, @Param('position', ParseIntPipe) position: number, @Body(new ZodValidationPipe(PassengerInputSchema)) body: PassengerInput) {
    return ok(this.orders.setPassenger(user.id, id, position, body), 'Passageiro salvo');
  }

  @Patch(':id/contact')
  contact(@CurrentUser() user: User, @Param('id') id: string, @Body(new ZodValidationPipe(ContactSchema)) body: Contact) {
    return ok(this.orders.setContact(user.id, id, body), 'Contato salvo');
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: User, @Param('id') id: string) {
    return ok(this.orders.confirm(user.id, id), 'Passageiros confirmados');
  }

  @Post(':id/payment')
  pay(@CurrentUser() user: User, @Param('id') id: string, @Headers(HEADERS.idempotencyKey) key: string | undefined) {
    const existing = this.idempotency.lookup('orders.payment', user.id, key, { id });
    if (existing) return ok(this.orders.get(user.id, existing), 'Pagamento já processado');
    const order = this.orders.pay(user.id, id);
    this.idempotency.remember('orders.payment', user.id, key, { id }, order.order_id);
    return ok(order, 'Pagamento confirmado. Emissão em andamento.');
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return ok(this.orders.cancel(user.id, id), 'Pedido cancelado');
  }
}

import { Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import type { User } from '../auth/session.service.js';
import { ok } from '../common/envelope.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from '../orders/orders.service.js';
import { MeService } from './me.service.js';

const OrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(['all', 'issued', 'in_emission', 'failed', 'cancelled', 'expired']).default('all'),
  q: z.string().max(80).optional(),
});

@Controller('v1/me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  profile(@CurrentUser() user: User) {
    return ok(this.me.profile(user), 'Informações carregadas com sucesso');
  }

  @Patch('sessions/activity')
  activity() {
    return ok({ seen_at: new Date().toISOString() });
  }

  @Get('orders')
  orders_(@CurrentUser() user: User, @Query(new ZodValidationPipe(OrdersQuerySchema)) q: z.infer<typeof OrdersQuerySchema>) {
    return ok(this.orders.list(user.id, q));
  }

  @Get('passengers')
  passengers(@CurrentUser() user: User) {
    return ok(this.orders.favorites(user.id));
  }
}

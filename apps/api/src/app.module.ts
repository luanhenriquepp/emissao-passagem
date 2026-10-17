import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth/auth.controller.js';
import { SessionGuard } from './auth/session.guard.js';
import { SessionService } from './auth/session.service.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { EnvelopeInterceptor } from './common/envelope.interceptor.js';
import { IdempotencyService } from './common/idempotency.service.js';
import { RateLimitService } from './common/rate-limit.service.js';
import { FlightsController } from './flights/flights.controller.js';
import { SearchService } from './flights/search.service.js';
import { HealthController } from './health.controller.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { WalletController } from './wallet/wallet.controller.js';
import { WalletService } from './wallet/wallet.service.js';

@Module({
  controllers: [HealthController, AuthController, MeController, FlightsController, OrdersController, WalletController],
  providers: [
    SessionService,
    SessionGuard,
    IdempotencyService,
    RateLimitService,
    WalletService,
    MeService,
    SearchService,
    OrdersService,
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}

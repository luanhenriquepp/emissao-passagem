import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  DEFAULT_MESSAGES,
  FlightSearchRequestSchema,
  QuoteRequestSchema,
  SelectOutboundRequestSchema,
  type FlightSearchRequest,
  type QuoteRequest,
  type SelectOutboundRequest,
} from '@milhas/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import type { User } from '../auth/session.service.js';
import { ok } from '../common/envelope.interceptor.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SearchService } from './search.service.js';

const SnapshotQuerySchema = z.object({
  cursor: z.string().optional(),
  shape: z.literal('normalized').optional(),
  snapshot_etag: z.string().optional(),
});

const ReturnQuerySchema = z.object({
  outbound_fare_id: z.string().min(1),
  cursor: z.string().optional(),
});

/** Limite do plano Gratuito: 30 buscas novas por 10 minutos (buscas repetidas reaproveitam o id). */
const SEARCH_LIMIT = Number(process.env.SEARCH_LIMIT_PER_WINDOW ?? 30);
const SEARCH_WINDOW_SECONDS = Number(process.env.SEARCH_WINDOW_SECONDS ?? 600);

@Controller('v1/flights')
@UseGuards(SessionGuard)
export class FlightsController {
  constructor(
    private readonly search: SearchService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('search')
  create(@CurrentUser() user: User, @Body(new ZodValidationPipe(FlightSearchRequestSchema)) body: FlightSearchRequest) {
    const { search, reused } = this.search.create(user.id, body);
    if (!reused) this.rateLimit.hit('flights.search', user.id, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS, DEFAULT_MESSAGES.SEARCH_LIMIT);
    return ok(this.search.created(search), reused ? 'Busca reaproveitada' : 'Busca iniciada');
  }

  @Get('search/:id')
  snapshot(@CurrentUser() user: User, @Param('id') id: string, @Query(new ZodValidationPipe(SnapshotQuerySchema)) q: z.infer<typeof SnapshotQuerySchema>) {
    return ok(this.search.snapshot(user.id, id, q.snapshot_etag), 'Resultados');
  }

  @Post('search/:id/select-outbound')
  selectOutbound(@CurrentUser() user: User, @Param('id') id: string, @Body(new ZodValidationPipe(SelectOutboundRequestSchema)) body: SelectOutboundRequest) {
    return ok(this.search.selectOutbound(user.id, id, body.outbound_fare_id));
  }

  @Get('search/:id/return-options')
  returnOptions(@CurrentUser() user: User, @Param('id') id: string, @Query(new ZodValidationPipe(ReturnQuerySchema)) q: z.infer<typeof ReturnQuerySchema>) {
    return ok(this.search.returnOptions(user.id, id, q.outbound_fare_id), 'Opções de volta');
  }

  @Post('quote')
  quote(@CurrentUser() user: User, @Body(new ZodValidationPipe(QuoteRequestSchema)) body: QuoteRequest) {
    const { userId: _u, outbound_ref: _o, return_ref: _r, passengers: _p, ...publicQuote } = this.search.quote(user.id, body);
    return ok(publicQuote, 'Cotação gerada');
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ok } from '../common/envelope.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiException } from '../common/api-exception.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import type { User } from '../auth/session.service.js';
import { WalletService } from './wallet.service.js';

const DepositSchema = z.object({ amount_brl: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido') });
const PageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1/me/wallet')
@UseGuards(SessionGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return ok(this.wallet.wallet(user.id));
  }

  @Get('transactions')
  transactions(@CurrentUser() user: User, @Query(new ZodValidationPipe(PageSchema)) q: z.infer<typeof PageSchema>) {
    return ok(this.wallet.transactions(user.id, q.page, q.per_page));
  }

  @Post('deposits')
  deposit(@CurrentUser() user: User, @Body(new ZodValidationPipe(DepositSchema)) body: z.infer<typeof DepositSchema>) {
    return ok(this.wallet.createDeposit(user.id, Number(body.amount_brl).toFixed(2)), 'Depósito criado');
  }

  @Get('deposits/:id')
  getDeposit(@Param('id') id: string) {
    const dep = this.wallet.getDeposit(id);
    if (!dep) throw ApiException.notFound('NOT_FOUND', 'Depósito não encontrado');
    return ok(dep);
  }
}

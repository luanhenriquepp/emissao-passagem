import { Injectable } from '@nestjs/common';
import type { Me } from '@milhas/contracts';
import type { User } from '../auth/session.service.js';
import { WalletService } from '../wallet/wallet.service.js';

@Injectable()
export class MeService {
  constructor(private readonly wallet: WalletService) {}

  profile(user: User): Me {
    return {
      full_name: user.full_name,
      email: user.email,
      balance: this.wallet.balance(user.id),
      subscription: { plan_status: user.plan_status, is_active: user.plan_status !== 'FREE', cancel_at_period_end: false },
      password_change_required: false,
    };
  }
}

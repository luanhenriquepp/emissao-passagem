import { Injectable } from '@nestjs/common';
import type { Wallet, WalletTransaction } from '@milhas/contracts';
import { ApiException } from '../common/api-exception.js';
import { uuid } from '../common/ids.js';
import { gte, minus, money, sum } from '../common/money.js';
import { nowIso } from '../common/time.js';

interface Account {
  available: string;
  transactions: WalletTransaction[];
}

export interface Deposit {
  deposit_id: string;
  amount_brl: string;
  status: 'PENDING' | 'CONFIRMED';
  pix_copy_paste: string;
  created_at: string;
  auto_confirm_seconds: number;
}

const DEPOSIT_MIN = '0.01';
const DEPOSIT_MAX = '1000000.00';
const AUTO_CONFIRM_SECONDS = Number(process.env.DEPOSIT_AUTO_CONFIRM_SECONDS ?? 5);

/**
 * Carteira mínima para o checkout: saldo disponível, extrato e depósito PIX
 * mockado (confirma sozinho). Saque/chaves PIX ficam para o módulo de carteira.
 */
@Injectable()
export class WalletService {
  private readonly accounts = new Map<string, Account>();
  private readonly deposits = new Map<string, Deposit>();

  private account(userId: string): Account {
    let acc = this.accounts.get(userId);
    if (!acc) {
      acc = { available: money(Number(process.env.DEMO_INITIAL_BALANCE ?? 0) * 100), transactions: [] };
      this.accounts.set(userId, acc);
    }
    return acc;
  }

  balance(userId: string): string {
    return this.account(userId).available;
  }

  wallet(userId: string): Wallet {
    const acc = this.account(userId);
    return {
      balances: { available: acc.available, reserved: '0.00', scheduled: '0.00', total: acc.available },
      deposit: { min: DEPOSIT_MIN, max: DEPOSIT_MAX },
    };
  }

  transactions(userId: string, page = 1, perPage = 20) {
    const items = [...this.account(userId).transactions].reverse();
    const start = (page - 1) * perPage;
    return { items: items.slice(start, start + perPage), total: items.length, page, per_page: perPage, pages: Math.max(1, Math.ceil(items.length / perPage)) };
  }

  /** Debita o saldo para pagar um pedido; lança INSUFFICIENT_BALANCE. */
  debit(userId: string, amount: string, orderId: string, description: string): WalletTransaction {
    const acc = this.account(userId);
    if (!gte(acc.available, amount)) {
      throw new ApiException('INSUFFICIENT_BALANCE', `Saldo insuficiente. Faltam R$ ${minus(amount, acc.available)} para cobrir o pedido.`);
    }
    acc.available = minus(acc.available, amount);
    const tx: WalletTransaction = { id: uuid(), type: 'ORDER_PAYMENT', direction: 'debit', amount_brl: amount, description, posted_at: nowIso(), order_id: orderId };
    acc.transactions.push(tx);
    return tx;
  }

  refund(userId: string, amount: string, orderId: string, description: string): WalletTransaction {
    const acc = this.account(userId);
    acc.available = sum(acc.available, amount);
    const tx: WalletTransaction = { id: uuid(), type: 'ORDER_REFUND', direction: 'credit', amount_brl: amount, description, posted_at: nowIso(), order_id: orderId };
    acc.transactions.push(tx);
    return tx;
  }

  /** Mock de depósito PIX: devolve um "copia e cola" e credita após alguns segundos. */
  createDeposit(userId: string, amount: string): Deposit {
    if (!gte(amount, DEPOSIT_MIN) || !gte(DEPOSIT_MAX, amount)) {
      throw new ApiException('VALIDATION_ERROR', `Valor do depósito deve ficar entre R$ ${DEPOSIT_MIN} e R$ ${DEPOSIT_MAX}.`);
    }
    const deposit: Deposit = {
      deposit_id: uuid(),
      amount_brl: amount,
      status: 'PENDING',
      pix_copy_paste: `00020126580014br.gov.bcb.pix0136${uuid()}520400005303986540${amount}5802BR5913EMISSAO AEREA6009SAO PAULO62070503***6304MOCK`,
      created_at: nowIso(),
      auto_confirm_seconds: AUTO_CONFIRM_SECONDS,
    };
    this.deposits.set(deposit.deposit_id, deposit);
    setTimeout(() => this.confirmDeposit(userId, deposit.deposit_id), AUTO_CONFIRM_SECONDS * 1000).unref();
    return deposit;
  }

  getDeposit(id: string): Deposit | undefined {
    return this.deposits.get(id);
  }

  private confirmDeposit(userId: string, depositId: string): void {
    const dep = this.deposits.get(depositId);
    if (!dep || dep.status === 'CONFIRMED') return;
    dep.status = 'CONFIRMED';
    const acc = this.account(userId);
    acc.available = sum(acc.available, dep.amount_brl);
    acc.transactions.push({ id: uuid(), type: 'DEPOSIT', direction: 'credit', amount_brl: dep.amount_brl, description: 'Depósito via PIX confirmado', posted_at: nowIso(), order_id: null });
  }
}

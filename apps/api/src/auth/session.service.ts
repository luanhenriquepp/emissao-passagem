import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export interface User {
  id: string;
  full_name: string;
  email: string;
  plan_status: 'FREE' | 'PRO' | 'TRIAL';
}

export const SESSION_COOKIE = 'mp_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface Session {
  token: string;
  user: User;
  createdAt: number;
  lastSeenAt: number;
}

/**
 * Sessões em memória por cookie httpOnly. Em produção: store compartilhado
 * (Redis) + senha real; aqui qualquer e-mail/senha entra como usuário demo
 * para destravar o fluxo de busca → emissão.
 */
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  private readonly users = new Map<string, User>();

  readonly demoUser: User = {
    id: 'usr_demo',
    full_name: 'Agência Demo',
    email: 'demo@agencia.local',
    plan_status: 'FREE',
  };

  userFor(email: string, fullName?: string): User {
    const key = email.trim().toLowerCase();
    if (key === this.demoUser.email) return this.demoUser;
    let user = this.users.get(key);
    if (!user) {
      user = { id: `usr_${Buffer.from(key).toString('hex').slice(0, 12)}`, full_name: fullName ?? key.split('@')[0], email: key, plan_status: 'FREE' };
      this.users.set(key, user);
    }
    return user;
  }

  create(user: User): Session {
    const token = randomBytes(24).toString('base64url');
    const session: Session = { token, user, createdAt: Date.now(), lastSeenAt: Date.now() };
    this.sessions.set(token, session);
    return session;
  }

  get(token: string | undefined): Session | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (Date.now() - s.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(token);
      return null;
    }
    s.lastSeenAt = Date.now();
    return s;
  }

  destroy(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }
}

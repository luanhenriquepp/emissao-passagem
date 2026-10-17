import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from '../common/api-exception.js';
import { SESSION_COOKIE, SessionService, type User } from './session.service.js';

export const AUTO_LOGIN = (process.env.AUTO_LOGIN ?? 'true') === 'true';

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: 12 * 60 * 60 * 1000,
});

/**
 * Exige cookie de sessão. Com AUTO_LOGIN=true (padrão em dev) cria uma sessão
 * demo na primeira chamada para o fluxo poder ser testado sem tela de login.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: User; sessionToken?: string }>();
    const res = context.switchToHttp().getResponse<Response>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    let session = this.sessions.get(token);
    if (!session && AUTO_LOGIN) {
      session = this.sessions.create(this.sessions.demoUser);
      res.cookie(SESSION_COOKIE, session.token, cookieOptions());
    }
    if (!session) throw new ApiException('UNAUTHORIZED', 'Não autenticado');
    req.user = session.user;
    req.sessionToken = session.token;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest<Request & { user: User }>().user;
});

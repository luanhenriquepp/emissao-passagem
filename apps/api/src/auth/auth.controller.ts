import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../common/envelope.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MeService } from '../me/me.service.js';
import { cookieOptions } from './session.guard.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  full_name: z.string().trim().min(2).max(80).optional(),
});

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly me: MeService,
  ) {}

  /** Dev: qualquer e-mail/senha (≥ 8) cria/recupera o usuário e abre sessão. */
  @Post('login')
  login(@Body(new ZodValidationPipe(LoginSchema)) body: z.infer<typeof LoginSchema>, @Res({ passthrough: true }) res: Response) {
    const user = this.sessions.userFor(body.email, body.full_name);
    const session = this.sessions.create(user);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions());
    return ok(this.me.profile(user), 'Login realizado');
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    this.sessions.destroy(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return ok(null, 'Sessão encerrada');
  }
}

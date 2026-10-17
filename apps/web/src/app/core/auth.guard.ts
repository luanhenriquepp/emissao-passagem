import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

/** Rotas protegidas: sem sessão vai para /login?redirect=<rota pedida>. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (session.status() === 'unknown' || session.status() === 'loading') {
    await session.load();
  }
  if (session.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

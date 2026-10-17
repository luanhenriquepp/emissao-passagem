import { Injectable, signal } from '@angular/core';

/** Canal mínimo entre o interceptor HTTP e a SessionStore (sem dependência circular). */
@Injectable({ providedIn: 'root' })
export class AuthState {
  /** Timestamp do último 401 recebido fora dos endpoints de auth. */
  readonly unauthorizedAt = signal<number | null>(null);

  notifyUnauthorized(): void {
    this.unauthorizedAt.set(Date.now());
  }
}

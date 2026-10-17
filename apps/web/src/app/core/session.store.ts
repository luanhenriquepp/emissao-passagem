import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { Me } from '@milhas/contracts';
import { ApiClient } from './api-client.service';
import { AuthState } from './auth-state';

export type SessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiClient);
  private readonly authState = inject(AuthState);
  private loadPromise: Promise<void> | null = null;

  readonly user = signal<Me | null>(null);
  readonly status = signal<SessionStatus>('unknown');
  readonly isAuthenticated = computed(() => this.status() === 'authenticated');
  readonly initials = computed(() => {
    const name = this.user()?.full_name?.trim() ?? '';
    if (!name) return '';
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  constructor() {
    // Um 401 em qualquer chamada derruba a sessão local.
    effect(() => {
      const at = this.authState.unauthorizedAt();
      if (at && this.status() === 'authenticated') {
        this.user.set(null);
        this.status.set('anonymous');
      }
    });
  }

  /** Carrega /me uma vez (chamadas concorrentes compartilham a mesma promise). */
  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.fetchMe().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  async refresh(): Promise<void> {
    await this.fetchMe();
  }

  async login(email: string, password: string): Promise<Me> {
    const me = await this.api.post<Me>('/auth/login', { email, password });
    this.user.set(me);
    this.status.set('authenticated');
    return me;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } finally {
      this.user.set(null);
      this.status.set('anonymous');
    }
  }

  private async fetchMe(): Promise<void> {
    this.status.set('loading');
    try {
      const me = await this.api.get<Me>('/me');
      this.user.set(me);
      this.status.set('authenticated');
    } catch {
      this.user.set(null);
      this.status.set('anonymous');
    }
  }
}

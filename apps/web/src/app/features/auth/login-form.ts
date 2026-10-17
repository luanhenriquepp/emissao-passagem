import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../../core/api-error';
import { SessionStore } from '../../core/session.store';

@Component({
  selector: 'app-login-form',
  imports: [FormsModule],
  template: `
    <form class="stack" (ngSubmit)="submit()" novalidate aria-label="Formulário de login">
      <h2>{{ title() }}</h2>
      @if (subtitle(); as s) {
        <p class="muted">{{ s }}</p>
      }
      <div class="field">
        <label class="field__label" for="login-email">E-mail</label>
        <input id="login-email" class="field__input" type="email" name="email" autocomplete="username" required placeholder="seu@email.com" [(ngModel)]="email" />
      </div>
      <div class="field">
        <label class="field__label" for="login-password">Senha</label>
        <input id="login-password" class="field__input" type="password" name="password" autocomplete="current-password" required minlength="8" placeholder="Sua senha" [(ngModel)]="password" />
        <span class="field__hint">Ambiente de demonstração: qualquer e-mail válido com senha de 8+ caracteres.</span>
      </div>
      @if (error(); as err) {
        <div class="alert alert--error" role="alert">{{ err }}</div>
      }
      <button type="submit" class="btn btn--primary btn--block" [disabled]="loading()">
        @if (loading()) {
          <span class="spinner" aria-hidden="true"></span>
        }
        {{ submitLabel() }}
      </button>
    </form>
  `,
})
export class LoginForm {
  readonly title = input('Bem-vindo de volta');
  readonly subtitle = input<string | null>('Acesse sua conta para continuar');
  readonly submitLabel = input('Entrar');
  readonly loggedIn = output<void>();

  private readonly session = inject(SessionStore);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    const email = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error.set('E-mail inválido');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('Senha deve ter no mínimo 8 caracteres');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.session.login(email, this.password);
      this.loggedIn.emit();
    } catch (e) {
      const err = ApiError.from(e);
      this.error.set(err.status === 401 ? 'E-mail ou senha inválidos.' : err.message);
    } finally {
      this.loading.set(false);
    }
  }
}

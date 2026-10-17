import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginForm } from '../../auth/login-form';

/** Modal de login exibido em /voos para quem não está logado (sem redirecionar). */
@Component({
  selector: 'app-login-modal',
  imports: [LoginForm, RouterLink],
  template: `
    <div class="lm" role="dialog" aria-modal="true" aria-labelledby="lm-title">
      <div class="lm__card card">
        <p id="lm-title" class="visually-hidden">Entre para ver os voos</p>
        <app-login-form title="Entre para ver os voos" subtitle="Os resultados ficam disponíveis apenas para usuários logados. Sua busca continua daqui." submitLabel="Entrar e ver voos" />
        <a routerLink="/" class="btn btn--ghost btn--block">Voltar ao início</a>
      </div>
    </div>
  `,
  styles: `
    .lm {
      position: fixed;
      inset: 0;
      background: rgba(22, 32, 46, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 50;
    }
    .lm__card {
      width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--shadow);
    }
  `,
})
export class LoginModal {}

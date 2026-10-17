import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { LoginForm } from './login-form';

@Component({
  selector: 'app-login-page',
  imports: [LoginForm],
  template: `
    <div class="container login">
      <div class="card login__card">
        <app-login-form (loggedIn)="onLoggedIn()" />
      </div>
    </div>
  `,
  styles: `
    .login {
      display: flex;
      justify-content: center;
      padding-top: 24px;
    }
    .login__card {
      width: min(440px, 100%);
    }
  `,
})
export class LoginPage {
  /** Rota de retorno (`?redirect=`), ligada automaticamente pelo router. */
  readonly redirect = input<string>();
  private readonly router = inject(Router);

  onLoggedIn(): void {
    const target = this.redirect();
    void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/');
  }
}

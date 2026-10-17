import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from './core/session.store';
import { formatBrl } from './shared/format';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  balance(): string {
    return formatBrl(this.session.user()?.balance ?? '0');
  }

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl('/');
  }
}

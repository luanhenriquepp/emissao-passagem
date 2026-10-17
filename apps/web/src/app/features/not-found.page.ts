import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <div class="container">
      <div class="card empty">
        <h1>404</h1>
        <h3>Página não encontrada</h3>
        <p>A página que você procura não existe ou foi movida.</p>
        <a routerLink="/" class="btn btn--primary">Voltar ao início</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}

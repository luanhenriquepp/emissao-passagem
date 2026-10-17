import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Emissão Aérea — Passagens',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    title: 'Entrar — Emissão Aérea',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  // Ida e volta: /voos/{o}/{d}/{ida}/{volta}/{adt}/{chd}/{inf}/{cabin}
  {
    path: 'voos/:o/:d/:ida/:volta/:adt/:chd/:inf/:cabin',
    title: 'Resultados da busca — Emissão Aérea',
    loadComponent: () => import('./features/search/results/results.page').then((m) => m.ResultsPage),
  },
  // Só ida: /voos/{o}/{d}/{ida}/{adt}/{chd}/{inf}/{cabin}
  {
    path: 'voos/:o/:d/:ida/:adt/:chd/:inf/:cabin',
    title: 'Resultados da busca — Emissão Aérea',
    loadComponent: () => import('./features/search/results/results.page').then((m) => m.ResultsPage),
  },
  {
    path: 'passageiros/:orderId',
    title: 'Passageiros — Emissão Aérea',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/passengers/passengers.page').then((m) => m.PassengersPage),
  },
  {
    path: 'pagamento/:orderId',
    title: 'Pagamento — Emissão Aérea',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/payment/payment.page').then((m) => m.PaymentPage),
  },
  {
    path: 'compras',
    title: 'Minhas compras — Emissão Aérea',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/purchases.page').then((m) => m.PurchasesPage),
  },
  {
    path: '**',
    title: 'Página não encontrada — Emissão Aérea',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];

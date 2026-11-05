import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Cabeçalho enxuto das páginas públicas de gabarito (fora do app). */
@Component({
  selector: 'app-gabaritos-topo',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <a routerLink="/" aria-label="BoraMed, início" class="flex items-center gap-3">
          <img src="/brand/logo.webp" alt="BoraMed" class="h-7 w-auto" width="400" height="128" />
        </a>
        <nav class="flex items-center gap-2 text-sm font-semibold" aria-label="Conta">
          <a routerLink="/gabaritos" class="hidden rounded-lg px-3 py-2 text-slate-600 hover:text-blue-700 sm:inline">
            Gabaritos
          </a>
          @if (auth.isAuthenticated()) {
            <a routerLink="/dashboard" class="rounded-xl bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">
              Ir para o painel
            </a>
          } @else {
            <a routerLink="/login" class="rounded-lg px-3 py-2 text-slate-600 hover:text-blue-700">Entrar</a>
            <a routerLink="/cadastro" class="rounded-xl bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">
              Criar conta
            </a>
          }
        </nav>
      </div>
    </header>
  `,
})
export class GabaritosTopoComponent {
  protected readonly auth = inject(AuthService);
}

import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/services/supabase.service';
import { PrefetchService } from '../../core/services/prefetch.service';

const TIPOS_VALIDOS: readonly EmailOtpType[] = [
  'email',
  'signup',
  'recovery',
  'email_change',
  'magiclink',
  'invite',
];

// Confirmação por token_hash + verifyOtp: funciona em qualquer navegador/dispositivo,
// ao contrário do fluxo PKCE (/auth/callback?code=...), que exige o code_verifier
// salvo no navegador que iniciou o cadastro — a causa dos erros quando o usuário
// abre o link do email em outro dispositivo ou no navegador embutido do Gmail.
@Component({
  selector: 'app-confirmar-email',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <img src="brand/logo.webp" alt="BoraMed" class="h-9 w-auto" width="400" height="128" />
      @if (falhou()) {
        <div class="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 class="text-lg font-semibold text-gray-900">Link inválido ou expirado</h1>
          <p class="text-sm text-gray-500">
            Este link de confirmação já foi utilizado ou expirou. Faça login para
            receber um novo e-mail de confirmação.
          </p>
          <a
            routerLink="/login"
            class="mt-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ir para o login
          </a>
        </div>
      } @else {
        <div class="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
        <p class="text-sm text-gray-500">Confirmando…</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmarEmailComponent implements OnInit {
  private readonly supabase = inject(SupabaseService).client;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prefetch = inject(PrefetchService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly falhou = signal(false);

  async ngOnInit(): Promise<void> {
    // verifyOtp precisa de storage do navegador; no SSR renderiza só o spinner
    // e o ngOnInit roda de novo após a hidratação.
    if (!isPlatformBrowser(this.platformId)) return;

    const params = this.route.snapshot.queryParamMap;
    const tokenHash = params.get('token_hash');
    const next = params.get('next') ?? '/dashboard';
    const typeParam = params.get('type') as EmailOtpType | null;
    const type: EmailOtpType =
      typeParam && TIPOS_VALIDOS.includes(typeParam) ? typeParam : 'email';

    if (!tokenHash) {
      this.falhou.set(true);
      return;
    }

    const { error } = await this.supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      this.falhou.set(true);
      return;
    }

    if (type === 'recovery') {
      void this.router.navigateByUrl('/redefinir-senha', { replaceUrl: true });
      return;
    }

    this.prefetch.prefetchDashboardRoutes();
    // `//evil.com` passa em `startsWith('/')` (protocol-relative) → open redirect.
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    void this.router.navigateByUrl(safeNext, { replaceUrl: true });
  }
}

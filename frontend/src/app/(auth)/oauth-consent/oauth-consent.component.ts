import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

type ConsentDetails = {
  authorization_id: string;
  redirect_uri: string;
  scope: string;
  client: { name: string; description?: string; uri?: string };
};

@Component({
  selector: 'app-oauth-consent',
  standalone: true,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <img src="brand/logo.webp" alt="BoraMed" class="mb-8 h-8 w-auto" width="400" height="128" />
        @if (loading()) {
          <p class="text-sm text-slate-600">Verificando solicitação de acesso…</p>
        } @else if (error()) {
          <h1 class="text-xl font-semibold text-slate-900">Não foi possível autorizar</h1>
          <p class="mt-3 text-sm text-slate-600">{{ error() }}</p>
          @if (estaLogado()) {
            <button class="mt-5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" (click)="trocarConta()">Sair e entrar com a conta autorizada</button>
          }
        } @else if (details()) {
          <p class="text-xs font-semibold uppercase tracking-wider text-blue-700">Conexão segura</p>
          <h1 class="mt-2 text-2xl font-semibold text-slate-900">Conectar {{ details()!.client.name }} ao BoraMed</h1>
          <p class="mt-3 text-sm leading-6 text-slate-600">
            O aplicativo poderá consultar o acervo editorial e criar conteúdo. Alterações e exclusões ficam limitadas ao conteúdo criado por você por meio do BoraMed MCP.
          </p>
          <dl class="mt-6 space-y-4 rounded-xl bg-slate-50 p-4 text-sm">
            <div><dt class="font-medium text-slate-800">Conta</dt><dd class="mt-1 text-slate-600">{{ email() }}</dd></div>
            <div><dt class="font-medium text-slate-800">Aplicativo</dt><dd class="mt-1 text-slate-600">{{ details()!.client.name }}</dd></div>
            <div><dt class="font-medium text-slate-800">Permissões solicitadas</dt><dd class="mt-1 text-slate-600">{{ scopes() }}</dd></div>
            <div><dt class="font-medium text-slate-800">Retorno</dt><dd class="mt-1 break-all text-slate-600">{{ details()!.redirect_uri }}</dd></div>
          </dl>
          <p class="mt-5 text-xs leading-5 text-slate-500">Você pode revogar essa conexão depois nas configurações de segurança da sua conta.</p>
          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" [disabled]="busy()" (click)="decide(false)">Recusar</button>
            <button class="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50" [disabled]="busy()" (click)="decide(true)">{{ busy() ? 'Processando…' : 'Autorizar conexão' }}</button>
          </div>
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OauthConsentComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService).client;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly email = signal('');
  readonly details = signal<ConsentDetails | null>(null);
  readonly scopes = () => this.details()?.scope.split(' ').filter(Boolean).join(', ') || 'Acesso MCP ao conteúdo editorial';
  readonly estaLogado = this.auth.isAuthenticated;

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const authorizationId = this.route.snapshot.queryParamMap.get('authorization_id');
    if (!authorizationId || authorizationId.length > 200) {
      this.loading.set(false);
      this.error.set('O identificador de autorização está ausente ou inválido. Inicie a conexão novamente pelo aplicativo de IA.');
      return;
    }
    await this.auth.initialize();
    if (!this.auth.isAuthenticated()) {
      const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
      await this.router.navigate(['/login'], { queryParams: { next } });
      return;
    }
    const { data: userData, error: userError } = await this.supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user || user.email?.toLowerCase() !== 'arthurcoelho3524@gmail.com') {
      this.loading.set(false);
      this.error.set('A conexão MCP está disponível somente para a conta autorizada do BoraMed. Entre com arthurcoelho3524@gmail.com.');
      return;
    }
    const { data: profile } = await this.supabase.from('profiles').select('papel,banido').eq('id', user.id).maybeSingle();
    if (!profile || profile.banido || !['admin', 'super_admin'].includes(profile.papel)) {
      this.loading.set(false);
      this.error.set('Esta conta precisa estar ativa e ter papel de admin para usar o MCP.');
      return;
    }
    this.email.set(user.email);
    const { data, error } = await this.supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) {
      this.loading.set(false);
      this.error.set('A solicitação expirou ou não é mais válida. Feche esta página e inicie a conexão novamente.');
      return;
    }
    if (!('authorization_id' in data)) {
      window.location.replace(data.redirect_url);
      return;
    }
    if (data.user.id !== user.id || data.user.email.toLowerCase() !== user.email?.toLowerCase()) {
      this.loading.set(false);
      this.error.set('A solicitação de autorização não corresponde à sessão ativa. Entre novamente e tente conectar.');
      return;
    }
    this.details.set(data);
    this.loading.set(false);
  }

  async decide(approve: boolean): Promise<void> {
    const details = this.details();
    if (!details || this.busy()) return;
    this.busy.set(true);
    const decision = approve
      ? await this.supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
      : await this.supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
    if (decision.error) {
      this.busy.set(false);
      this.error.set('Não foi possível registrar sua decisão. Atualize a página e tente novamente.');
      this.details.set(null);
      return;
    }
    window.location.replace(decision.data.redirect_url);
  }

  async trocarConta(): Promise<void> {
    const authorizationId = this.route.snapshot.queryParamMap.get('authorization_id');
    await this.supabase.auth.signOut();
    const next = authorizationId
      ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
      : '/oauth/consent';
    await this.router.navigate(['/login'], { queryParams: { next }, replaceUrl: true });
  }
}

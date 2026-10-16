import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import type { OAuthGrant } from '@supabase/supabase-js';

const MCP_URL = 'https://gakvktwtdunljojghpff.supabase.co/functions/v1/boramed-mcp';

@Component({
  selector: 'app-admin-mcp',
  standalone: true,
  template: `
    <section class="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      @if (!autorizado()) {
        <div class="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Esta integração está disponível somente para arthurcoelho3524@gmail.com.</div>
      } @else {
        <header>
          <p class="text-sm font-medium text-blue-700">Integrações</p>
          <h1 class="mt-1 text-2xl font-semibold text-slate-900">BoraMed MCP para IAs</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Conecte um cliente compatível com MCP usando OAuth. A IA abrirá a página segura do BoraMed para entrar e autorizar a conexão.</p>
        </header>

        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 class="font-semibold text-slate-900">Endereço do servidor</h2>
          <p class="mt-1 text-sm text-slate-600">Use esta URL como servidor MCP remoto com transporte HTTP.</p>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row">
            <code class="min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-3 py-3 text-xs text-slate-800">{{ mcpUrl }}</code>
            <button class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" (click)="copiar()">{{ copiado() ? 'Copiado' : 'Copiar URL' }}</button>
          </div>
        </article>

        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 class="font-semibold text-slate-900">Como conectar</h2>
          <ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Cadastre a URL acima como integração MCP remota na IA desejada.</li>
            <li>Conclua a autenticação OAuth na página do BoraMed usando esta conta de admin.</li>
            <li>Confira o nome do aplicativo e as permissões antes de autorizar.</li>
          </ol>
          <div class="mt-5 rounded-xl bg-slate-50 p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Claude Code</p>
            <code class="mt-2 block break-all text-xs text-slate-800">claude mcp add --transport http boramed {{ mcpUrl }}</code>
          </div>
        </article>

        <article class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <h2 class="font-semibold">Acesso de conteúdo</h2>
          <p class="mt-1">A conexão permite ler questões, provas, materiais, flashcards e taxonomia do acervo. Criação é habilitada para questões, provas autorais, PDFs e decks de flashcards. Atualizar ou excluir exige que o registro esteja marcado como criado por você via MCP. Conteúdo original do BoraMed permanece intacto.</p>
        </article>

        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 class="font-semibold text-slate-900">Conexões autorizadas</h2>
          @if (grantsLoading()) {
            <p class="mt-3 text-sm text-slate-600">Carregando conexões…</p>
          } @else if (grants().length === 0) {
            <p class="mt-3 text-sm text-slate-600">Nenhuma IA está conectada.</p>
          } @else {
            <ul class="mt-3 divide-y divide-slate-100">
              @for (grant of grants(); track grant.client.id) {
                <li class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p class="text-sm font-medium text-slate-800">{{ grant.client.name }}</p><p class="mt-1 text-xs text-slate-500">{{ grant.scopes.join(', ') || 'Acesso MCP' }}</p></div>
                  <button class="self-start rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 sm:self-auto" [disabled]="revoking() === grant.client.id" (click)="revogar(grant.client.id)">{{ revoking() === grant.client.id ? 'Revogando…' : 'Revogar acesso' }}</button>
                </li>
              }
            </ul>
          }
          @if (grantError()) { <p class="mt-3 text-sm text-rose-700">{{ grantError() }}</p> }
        </article>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMcpComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService).client;
  protected readonly mcpUrl = MCP_URL;
  protected readonly copiado = signal(false);
  protected readonly grants = signal<OAuthGrant[]>([]);
  protected readonly grantsLoading = signal(true);
  protected readonly revoking = signal('');
  protected readonly grantError = signal('');
  protected readonly autorizado = () => this.auth.user()?.email?.toLowerCase() === 'arthurcoelho3524@gmail.com';

  async ngOnInit(): Promise<void> {
    if (!this.autorizado()) {
      this.grantsLoading.set(false);
      return;
    }
    const { data, error } = await this.supabase.auth.oauth.listGrants();
    if (error) this.grantError.set('Não foi possível carregar as conexões autorizadas.');
    else this.grants.set(data);
    this.grantsLoading.set(false);
  }

  async copiar(): Promise<void> {
    await navigator.clipboard.writeText(MCP_URL);
    this.copiado.set(true);
    window.setTimeout(() => this.copiado.set(false), 1800);
  }

  async revogar(clientId: string): Promise<void> {
    this.revoking.set(clientId);
    const { error } = await this.supabase.auth.oauth.revokeGrant({ clientId });
    if (error) this.grantError.set('Não foi possível revogar a conexão. Tente novamente.');
    else this.grants.update((grants) => grants.filter((grant) => grant.client.id !== clientId));
    this.revoking.set('');
  }
}

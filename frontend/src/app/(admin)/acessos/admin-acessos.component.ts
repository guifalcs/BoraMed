import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AdminService,
  AdminAcessoUsuario,
  AdminAcessosResumo,
  AdminAcessosUsuarioDetalhe,
  AdminRedesMulticonta,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiAvatarComponent } from '../../shared/components/ui/avatar/ui-avatar.component';

type Aba = 'contas' | 'redes';

const PERIODOS = [
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
] as const;

@Component({
  selector: 'app-admin-acessos',
  standalone: true,
  imports: [CommonModule, UiAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl px-4 py-6">
      <header class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Acessos</h1>
        <p class="text-sm text-gray-500">
          De onde cada conta é usada. Serve para identificar assinaturas compartilhadas —
          nada é bloqueado automaticamente.
        </p>
      </header>

      <!-- Filtros -->
      <div class="mb-5 flex flex-wrap items-center gap-2">
        @for (p of periodos; track p.dias) {
          <button
            type="button"
            (click)="mudarPeriodo(p.dias)"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
            [class]="dias() === p.dias
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'">
            {{ p.label }}
          </button>
        }
        <span class="mx-1 h-5 w-px bg-gray-200"></span>
        @for (a of abas; track a.key) {
          <button
            type="button"
            (click)="mudarAba(a.key)"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
            [class]="aba() === a.key
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'">
            {{ a.label }}
          </button>
        }
      </div>

      @if (isLoading()) {
        <p class="py-16 text-center text-gray-500">Carregando…</p>
      } @else if (detalhe(); as d) {
        <!-- ─── Detalhe de um usuário ─── -->
        <button
          type="button"
          (click)="fecharDetalhe()"
          class="mb-4 text-sm font-medium text-blue-600 hover:underline">
          ← Voltar para a lista
        </button>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="flex items-center gap-3">
            <app-ui-avatar [avatarUrl]="d.usuario?.avatar_url ?? null" [name]="d.usuario?.nome ?? '?'" size="md" />
            <div class="min-w-0">
              <p class="truncate font-semibold text-gray-900">{{ d.usuario?.nome }}</p>
              <p class="truncate text-sm text-gray-500">{{ d.usuario?.email }}</p>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            @for (t of totaisDetalhe(); track t.label) {
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">{{ t.label }}</p>
                <p class="text-lg font-bold text-gray-900">{{ t.valor }}</p>
              </div>
            }
          </div>
        </div>

        @if (d.sobreposicoes.length > 0) {
          <h2 class="mt-8 text-lg font-semibold text-gray-900">Uso simultâneo em redes diferentes</h2>
          <p class="mt-1 text-sm text-gray-500">
            Momentos em que a conta esteve ativa em duas redes distintas ao mesmo tempo, em
            dispositivos diferentes. É o indício mais forte de compartilhamento.
          </p>
          <div class="mt-3 overflow-x-auto rounded-xl border border-amber-200 bg-amber-50">
            <table class="w-full min-w-[720px] text-sm">
              <thead class="border-b border-amber-200 text-left text-xs uppercase tracking-wide text-amber-800">
                <tr>
                  <th class="px-4 py-3 font-medium">Acesso A</th>
                  <th class="px-4 py-3 font-medium">Período A</th>
                  <th class="px-4 py-3 font-medium">Acesso B</th>
                  <th class="px-4 py-3 font-medium">Período B</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-amber-100">
                @for (s of d.sobreposicoes; track $index) {
                  <tr>
                    <td class="px-4 py-3">
                      <span class="font-mono text-gray-900">{{ s.a_ip }}</span>
                      <span class="block text-xs text-gray-500">{{ s.a_disp }}</span>
                    </td>
                    <td class="px-4 py-3 text-gray-600">
                      {{ s.a_inicio | date: 'dd/MM HH:mm' }} — {{ s.a_fim | date: 'HH:mm' }}
                    </td>
                    <td class="px-4 py-3">
                      <span class="font-mono text-gray-900">{{ s.b_ip }}</span>
                      <span class="block text-xs text-gray-500">{{ s.b_disp }}</span>
                    </td>
                    <td class="px-4 py-3 text-gray-600">
                      {{ s.b_inicio | date: 'dd/MM HH:mm' }} — {{ s.b_fim | date: 'HH:mm' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <h2 class="mt-8 text-lg font-semibold text-gray-900">Por IP</h2>
        <div class="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full min-w-[760px] text-sm">
            <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th class="px-4 py-3 font-medium">IP</th>
                <th class="px-4 py-3 font-medium">Rede</th>
                <th class="px-4 py-3 font-medium">País</th>
                <th class="px-4 py-3 font-medium">Dispositivos</th>
                <th class="px-4 py-3 font-medium">Acessos</th>
                <th class="px-4 py-3 font-medium">Último</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (i of d.por_ip; track i.ip) {
                <tr>
                  <td class="px-4 py-3 font-mono text-gray-900">{{ i.ip }}</td>
                  <td class="px-4 py-3 font-mono text-xs text-gray-500">{{ i.rede }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ i.pais ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ (i.rotulos ?? []).join(', ') || '—' }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ i.eventos }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ i.ultimo_em | date: 'dd/MM/yy HH:mm' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <h2 class="mt-8 text-lg font-semibold text-gray-900">Histórico</h2>
        <div class="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full min-w-[820px] text-sm">
            <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th class="px-4 py-3 font-medium">Início</th>
                <th class="px-4 py-3 font-medium">Fim</th>
                <th class="px-4 py-3 font-medium">IP</th>
                <th class="px-4 py-3 font-medium">Dispositivo</th>
                <th class="px-4 py-3 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (a of d.acessos; track a.id) {
                <tr [class.opacity-50]="a.impersonado">
                  <td class="px-4 py-3 text-gray-600">{{ a.primeiro_em | date: 'dd/MM/yy HH:mm' }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ a.ultimo_em | date: 'dd/MM/yy HH:mm' }}</td>
                  <td class="px-4 py-3 font-mono text-gray-900">{{ a.ip ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-600">
                    {{ a.dispositivo ?? '—' }}
                    @if (a.device_id) {
                      <span class="block font-mono text-[11px] text-gray-400">{{ a.device_id.slice(0, 8) }}</span>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ a.origem }}</span>
                    @if (a.impersonado) {
                      <span class="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">suporte</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (aba() === 'contas') {
        <!-- ─── Ranking de contas ─── -->
        @if (resumo(); as r) {
          <div class="grid gap-4 sm:grid-cols-3">
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Contas com acesso</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ r.total_usuarios }}</p>
              <p class="mt-1 text-xs text-gray-500">no período</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Com uso simultâneo</p>
              <p class="mt-2 text-2xl font-bold" [class]="r.com_sobreposicao > 0 ? 'text-amber-600' : 'text-gray-900'">
                {{ r.com_sobreposicao }}
              </p>
              <p class="mt-1 text-xs text-gray-500">redes diferentes ao mesmo tempo</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Janelas registradas</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ r.total_janelas }}</p>
              <p class="mt-1 text-xs text-gray-500">atualizado {{ r.gerado_em | date: 'dd/MM HH:mm' }}</p>
            </div>
          </div>

          @if (r.usuarios.length === 0) {
            <p class="mt-6 rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">
              Nenhum acesso registrado no período. Os dados começam a aparecer conforme os usuários entram na plataforma.
            </p>
          } @else {
            <div class="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table class="w-full min-w-[880px] text-sm">
                <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th class="px-4 py-3 font-medium">Usuário</th>
                    <th class="px-4 py-3 font-medium">Plano</th>
                    <th class="px-4 py-3 font-medium">Indício</th>
                    <th class="px-4 py-3 font-medium" title="IPs agrupados por faixa /24">Redes</th>
                    <th class="px-4 py-3 font-medium">Dispositivos</th>
                    <th class="px-4 py-3 font-medium">Simultâneos</th>
                    <th class="px-4 py-3 font-medium">Último acesso</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (u of r.usuarios; track u.user_id) {
                    <tr class="cursor-pointer hover:bg-gray-50" (click)="abrirDetalhe(u)">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <app-ui-avatar [avatarUrl]="u.avatar_url" [name]="u.nome" size="sm" />
                          <div class="min-w-0">
                            <p class="truncate font-medium text-gray-900">{{ u.nome }}</p>
                            <p class="truncate text-xs text-gray-500">{{ u.email }}</p>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-gray-600">{{ u.plano ?? '—' }}</td>
                      <td class="px-4 py-3">
                        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="classeNivel(u.nivel)">
                          {{ rotuloNivel(u.nivel) }} · {{ u.score }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-600">{{ u.redes }}</td>
                      <td class="px-4 py-3 text-gray-600">{{ maxDispositivos(u) }}</td>
                      <td class="px-4 py-3" [class]="u.sobreposicoes > 0 ? 'font-semibold text-amber-600' : 'text-gray-600'">
                        {{ u.sobreposicoes }}
                      </td>
                      <td class="px-4 py-3 text-gray-600">{{ u.ultimo_em | date: 'dd/MM/yy HH:mm' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <p class="mt-3 text-xs text-gray-400">
              Trocar de wi-fi para 4G no mesmo aparelho não conta como uso simultâneo. Faixas de IP
              de faculdade e operadoras móveis inflam o número de redes — confira o detalhe antes de concluir.
            </p>
          }
        }
      } @else {
        <!-- ─── Redes com várias contas ─── -->
        @if (redes(); as rd) {
          @if (rd.redes.length === 0) {
            <p class="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">
              Nenhuma rede com mais de uma conta no período.
            </p>
          } @else {
            <div class="space-y-3">
              @for (rede of rd.redes; track rede.rede) {
                <div class="rounded-xl border border-gray-200 bg-white p-5">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-mono text-sm font-semibold text-gray-900">{{ rede.rede }}</span>
                    <span class="text-xs text-gray-500">
                      {{ rede.contas }} contas · {{ rede.ips }} IPs · último em
                      {{ rede.ultimo_em | date: 'dd/MM/yy HH:mm' }}
                    </span>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    @for (u of rede.usuarios; track u.user_id) {
                      <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                        {{ u.nome }} <span class="text-gray-400">· {{ u.email }}</span>
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
            <p class="mt-3 text-xs text-gray-400">
              Wi-fi de faculdade e CGNAT de operadora colocam dezenas de contas legítimas na mesma
              faixa. O sinal útil aqui é uma rede residencial com poucas contas recorrentes.
            </p>
          }
        }
      }
    </div>
  `,
})
export class AdminAcessosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly periodos = PERIODOS;
  protected readonly abas: { key: Aba; label: string }[] = [
    { key: 'contas', label: 'Contas' },
    { key: 'redes', label: 'Redes com várias contas' },
  ];

  protected readonly dias = signal<number>(30);
  protected readonly aba = signal<Aba>('contas');
  protected readonly isLoading = signal(true);
  protected readonly resumo = signal<AdminAcessosResumo | null>(null);
  protected readonly redes = signal<AdminRedesMulticonta | null>(null);
  protected readonly detalhe = signal<AdminAcessosUsuarioDetalhe | null>(null);

  protected readonly totaisDetalhe = computed(() => {
    const t = this.detalhe()?.totais;
    if (!t) return [];
    return [
      { label: 'IPs', valor: t.ips },
      { label: 'Redes', valor: t.redes },
      { label: 'Dispositivos', valor: t.dispositivos },
      { label: 'Navegadores', valor: t.navegadores },
      { label: 'Logins', valor: t.sessoes },
      { label: 'Países', valor: t.paises },
    ];
  });

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async mudarPeriodo(dias: number): Promise<void> {
    if (this.dias() === dias) return;
    this.dias.set(dias);
    this.detalhe.set(null);
    await this.carregar();
  }

  protected async mudarAba(aba: Aba): Promise<void> {
    if (this.aba() === aba) return;
    this.aba.set(aba);
    this.detalhe.set(null);
    await this.carregar();
  }

  protected async abrirDetalhe(u: AdminAcessoUsuario): Promise<void> {
    this.isLoading.set(true);
    const res = await this.adminService.getAcessosUsuario(u.user_id, this.dias());
    this.isLoading.set(false);
    if (!res.ok) {
      this.toast.error('Não foi possível carregar o detalhe de acessos.');
      return;
    }
    this.detalhe.set(res.data);
  }

  protected fecharDetalhe(): void {
    this.detalhe.set(null);
  }

  /**
   * Duas medidas de "quantos aparelhos": o id de dispositivo (mais preciso, mas
   * ausente em acessos capturados só pelo login) e o rótulo do user agent.
   * Mostra a maior para não subestimar.
   */
  protected maxDispositivos(u: AdminAcessoUsuario): number {
    return Math.max(u.dispositivos, u.navegadores);
  }

  protected classeNivel(nivel: AdminAcessoUsuario['nivel']): string {
    if (nivel === 'alto') return 'bg-red-100 text-red-700';
    if (nivel === 'medio') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  }

  protected rotuloNivel(nivel: AdminAcessoUsuario['nivel']): string {
    if (nivel === 'alto') return 'Alto';
    if (nivel === 'medio') return 'Médio';
    return 'Baixo';
  }

  private async carregar(): Promise<void> {
    this.isLoading.set(true);
    if (this.aba() === 'contas') {
      const res = await this.adminService.getAcessosResumo(this.dias());
      if (res.ok) this.resumo.set(res.data);
      else this.toast.error('Não foi possível carregar os acessos.');
    } else {
      const res = await this.adminService.getRedesMulticonta(this.dias());
      if (res.ok) this.redes.set(res.data);
      else this.toast.error('Não foi possível carregar as redes.');
    }
    this.isLoading.set(false);
  }
}

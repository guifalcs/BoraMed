import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Check, LogOut, ShieldCheck, Sparkles, X, type LucideIconData } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../../shared/components/ui/avatar/ui-avatar.component';
import { SuporteWidgetComponent } from '../../shared/components/suporte-widget/suporte-widget.component';
import {
  UiSegmentedToggleComponent,
  type SegmentedToggleOption,
} from '../../shared/components/ui/segmented-toggle/ui-segmented-toggle.component';
import type { Plano, PlanoTier } from '../../core/models/subscription.types';

type Ciclo = 'mensal' | 'semestral';

const ESSENCIAL_BENEFICIOS: readonly string[] = [
  'Treinos com provas nacionais (N1, N2 e Teste de Progresso)',
  'Correção das questões abertas pela Aurora (IA)',
  'Modo competitivo',
  'Histórico e estatísticas de desempenho',
  'Suporte',
];

const ESSENCIAL_NAO_INCLUSO: readonly string[] = [
  'Montar simulados personalizados',
  'Materiais de estudo',
  'Flashcards',
];

const AVANCADO_BENEFICIOS: readonly string[] = [
  ...ESSENCIAL_BENEFICIOS,
  'Simulados personalizados (processual e laboratório)',
  'Materiais de estudo',
  'Flashcards',
  'Impressão de simulados em PDF',
];

// Percentual de economia do plano semestral em relação ao mensal, usado no
// badge do toggle. Calculado a partir do tier Avançado (o mais representativo).
function calcularPercentualEconomia(mensal: Plano, semestral: Plano): number {
  const totalMensal = mensal.preco_centavos * semestral.frequency;
  const economia = totalMensal - semestral.preco_centavos;
  return Math.round((economia / totalMensal) * 100);
}

@Component({
  selector: 'app-planos',
  standalone: true,
  imports: [
    RouterLink,
    UiIconComponent,
    UiAvatarComponent,
    SuporteWidgetComponent,
    UiSegmentedToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-gray-50">
      <!-- Barra de topo -->
      <header class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <a routerLink="/" aria-label="Ir para a página inicial">
          <img src="brand/logo.webp" alt="BoraMed" class="h-8 w-auto" width="400" height="128" />
        </a>
        <div class="flex items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-2">
            <app-ui-avatar [name]="nomeExibicao()" [avatarUrl]="profile()?.avatar_url ?? null" size="sm" />
            <span class="hidden max-w-[180px] truncate text-sm text-gray-700 sm:block">{{ nomeExibicao() }}</span>
          </div>
          <button
            type="button"
            (click)="sair()"
            class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <app-ui-icon [icon]="logoutIcon" [size]="16" />
            Sair
          </button>
        </div>
      </header>

      <div class="flex-1 px-4 py-12">
        <div class="mx-auto max-w-5xl">
          <header class="mb-8 text-center">
            <h1 class="text-3xl font-bold text-gray-900">Escolha seu plano</h1>
            <p class="mt-2 text-gray-600">Dois planos, um objetivo: te levar aprovado na prova nacional.</p>
          </header>

          @if (assinaturaPausada()) {
            <div class="mx-auto mb-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p class="text-sm text-amber-800">
                Sua assinatura está <span class="font-semibold">pausada</span>. Reative sem assinar de
                novo e retome o acesso na hora.
              </p>
              <a
                routerLink="/dashboard/assinatura"
                class="mt-3 inline-block whitespace-nowrap rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 sm:mt-0"
              >
                Reativar assinatura
              </a>
            </div>
          }

          @if (loading()) {
            <div class="py-20 text-center text-gray-500">Carregando planos…</div>
          } @else {
            <!-- Toggle de ciclo de pagamento -->
            <div class="mx-auto mb-10 max-w-xs">
              <app-ui-segmented-toggle
                [options]="cicloOptions()"
                [value]="ciclo()"
                ariaLabel="Ciclo de pagamento"
                (valueChange)="onCicloChange($event)"
              />
            </div>

            @if (planoEssencial(); as pe) {
              @if (planoAvancado(); as pa) {
                <div class="grid items-start gap-6 md:grid-cols-2">
                  <!-- Card Essencial -->
                  <div class="order-2 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm md:order-1">
                    <h2 class="text-xl font-bold text-gray-900">{{ pe.nome }}</h2>
                    <p class="mt-1 text-sm text-gray-500">{{ pe.descricao }}</p>

                    @if (anchorTotal(pe)) {
                      <p class="mt-4 text-xs text-gray-400">
                        <s>{{ anchorTotal(pe) }}</s>
                        preço de {{ pe.frequency }} meses no plano mensal
                      </p>
                    }

                    @if (porMes(pe)) {
                      <div class="mt-2 flex flex-wrap items-end justify-between gap-2">
                        <div class="flex items-baseline gap-1">
                          <span class="text-4xl font-extrabold text-gray-900">{{ porMes(pe) }}</span>
                          <span class="text-sm text-gray-500">/mês</span>
                        </div>
                        @if (economia(pe)) {
                          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                            <app-ui-icon [icon]="sparklesIcon" [size]="13" class="shrink-0" />
                            Economize {{ economia(pe) }}
                          </span>
                        }
                      </div>
                      <p class="mt-1 text-sm text-gray-500">
                        {{ preco(pe) }} {{ periodoExtenso(pe) }}
                      </p>
                      <p class="mt-1 text-xs text-gray-500">em até 6x sem juros de {{ porMes(pe) }}</p>
                    } @else {
                      <div class="mt-6 flex items-baseline gap-1">
                        <span class="text-4xl font-extrabold text-gray-900">{{ preco(pe) }}</span>
                        <span class="text-sm text-gray-500">{{ periodo(pe) }}</span>
                      </div>
                      <p class="mt-1 text-xs text-gray-500">pagamento único — não renova automaticamente</p>
                    }

                    <ul class="mt-6 space-y-2.5 border-t border-gray-100 pt-6">
                      @for (b of essencialBeneficios; track b) {
                        <li class="flex items-start gap-2 text-sm text-gray-700">
                          <app-ui-icon [icon]="checkIcon" [size]="16" class="mt-0.5 shrink-0 text-emerald-600" />
                          <span>{{ b }}</span>
                        </li>
                      }
                      @for (n of essencialNaoIncluso; track n) {
                        <li class="flex items-start gap-2 text-sm text-gray-400">
                          <app-ui-icon [icon]="xIcon" [size]="16" class="mt-0.5 shrink-0 text-gray-300" />
                          <span>{{ n }}</span>
                        </li>
                      }
                    </ul>

                    <button
                      type="button"
                      (click)="assinar(pe)"
                      class="mt-8 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
                    >
                      Assinar Essencial
                    </button>
                  </div>

                  <!-- Card Avançado (destaque) -->
                  <div
                    class="relative order-1 overflow-hidden rounded-2xl border border-transparent p-8 text-white shadow-sm md:order-2"
                    [style.background]="gradiente"
                  >
                    <div class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white opacity-5"></div>
                    <div class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white opacity-5"></div>
                    <span class="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                      Recomendado
                    </span>

                    <h2 class="text-xl font-bold">{{ pa.nome }}</h2>
                    <p class="mt-1 text-sm text-white/70">{{ pa.descricao }}</p>

                    @if (anchorTotal(pa)) {
                      <p class="mt-4 text-xs text-white/60">
                        <s>{{ anchorTotal(pa) }}</s>
                        preço de {{ pa.frequency }} meses no plano mensal
                      </p>
                    }

                    @if (porMes(pa)) {
                      <div class="mt-2 flex flex-wrap items-end justify-between gap-2">
                        <div class="flex items-baseline gap-1">
                          <span class="text-4xl font-extrabold">{{ porMes(pa) }}</span>
                          <span class="text-sm text-white/70">/mês</span>
                        </div>
                        @if (economia(pa)) {
                          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2.5 py-1 text-xs font-bold text-emerald-950 shadow-sm ring-1 ring-emerald-300/50">
                            <app-ui-icon [icon]="sparklesIcon" [size]="13" class="shrink-0" />
                            Economize {{ economia(pa) }}
                          </span>
                        }
                      </div>
                      <p class="mt-1 text-sm text-white/80">
                        {{ preco(pa) }} {{ periodoExtenso(pa) }}
                      </p>
                      <p class="mt-1 text-xs text-white/80">em até 6x sem juros de {{ porMes(pa) }}</p>
                    } @else {
                      <div class="mt-6 flex items-baseline gap-1">
                        <span class="text-4xl font-extrabold">{{ preco(pa) }}</span>
                        <span class="text-sm text-white/70">{{ periodo(pa) }}</span>
                      </div>
                      <p class="mt-1 text-xs text-white/80">pagamento único — não renova automaticamente</p>
                    }

                    <ul class="mt-6 space-y-2.5 border-t border-white/20 pt-6">
                      @for (b of avancadoBeneficios; track b) {
                        <li class="flex items-start gap-2 text-sm text-white/90">
                          <app-ui-icon [icon]="checkIcon" [size]="16" class="mt-0.5 shrink-0 text-white" />
                          <span>{{ b }}</span>
                        </li>
                      }
                    </ul>

                    <button
                      type="button"
                      (click)="assinar(pa)"
                      class="mt-8 w-full rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 transition hover:bg-gray-100"
                    >
                      Assinar Avançado
                    </button>
                  </div>
                </div>
              }
            } @else {
              <p class="mt-6 text-center text-sm text-red-600">
                {{ erro() ?? 'Não foi possível carregar os planos no momento.' }}
              </p>
            }
          }
        </div>
      </div>

      <!-- Rodapé -->
      <footer class="border-t border-gray-200 bg-white px-6 py-8 lg:px-10">
        <div
          class="mx-auto flex max-w-7xl flex-col items-center gap-5 md:flex-row md:items-start md:justify-between md:gap-10"
        >
          <div class="flex max-w-xl flex-col items-center gap-2 md:flex-row md:items-start md:gap-2.5">
            <app-ui-icon [icon]="shieldIcon" [size]="16" class="shrink-0 text-gray-400 md:mt-0.5" />
            <p class="text-center text-xs leading-relaxed text-gray-400 md:text-left">
              Pague sem sair da plataforma. Os dados do seu cartão são digitados em campos
              seguros do <span class="font-medium text-gray-500">Mercado&nbsp;Pago</span> e nunca
              passam pelos servidores do BoraMed.
            </p>
          </div>
          <div
            class="flex shrink-0 flex-col items-center gap-2 text-xs text-gray-400 sm:flex-row sm:gap-5"
          >
            <a routerLink="/termos-de-uso" class="whitespace-nowrap hover:text-gray-600">Termos de uso</a>
            <a routerLink="/politica-de-privacidade" class="whitespace-nowrap hover:text-gray-600">Política de privacidade</a>
            <span class="whitespace-nowrap text-gray-300">© {{ ano }} BoraMed</span>
          </div>
        </div>
      </footer>

      <app-suporte-widget />
    </div>
  `,
})
export class PlanosComponent implements OnInit {
  private readonly subscription = inject(SubscriptionService);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  readonly profile = this.profileService.profile;

  readonly gradiente =
    'radial-gradient(circle at 82% 22%, rgba(255,255,255,0.18), transparent 26%),' +
    'radial-gradient(circle at 20% 85%, rgba(13,148,136,0.22), transparent 28%),' +
    'linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)';

  readonly checkIcon: LucideIconData = Check;
  readonly xIcon: LucideIconData = X;
  readonly logoutIcon: LucideIconData = LogOut;
  readonly shieldIcon: LucideIconData = ShieldCheck;
  readonly sparklesIcon: LucideIconData = Sparkles;
  readonly ano = new Date().getFullYear();

  readonly essencialBeneficios = ESSENCIAL_BENEFICIOS;
  readonly essencialNaoIncluso = ESSENCIAL_NAO_INCLUSO;
  readonly avancadoBeneficios = AVANCADO_BENEFICIOS;

  readonly planos = signal<readonly Plano[]>([]);

  readonly loading = signal(true);
  readonly erro = signal<string | null>(null);

  /** Semestral é o ciclo padrão — melhor custo-benefício e maior conversão. */
  readonly ciclo = signal<Ciclo>('semestral');

  readonly cicloOptions = computed<SegmentedToggleOption[]>(() => [
    { value: 'mensal', label: 'Mensal' },
    {
      value: 'semestral',
      label: 'Semestral',
      badge: `Economize até ${this.percentualEconomiaMax()}%`,
    },
  ]);

  readonly planoEssencial = computed<Plano | null>(() => this.planoPorTier('essencial'));
  readonly planoAvancado = computed<Plano | null>(() => this.planoPorTier('avancado'));

  async ngOnInit(): Promise<void> {
    if (!this.profile()) void this.profileService.loadProfile();
    try {
      await this.subscription.carregarAssinatura();
    } catch {
      // Falha ao carregar a assinatura não deve bloquear a exibição dos planos.
    }
    try {
      const planos = await this.subscription.listarPlanos();
      this.planos.set(planos);
      if (planos.length === 0) {
        this.erro.set('Não foi possível carregar os planos no momento. Tente novamente em instantes.');
      }
    } catch {
      this.erro.set('Não foi possível carregar os planos no momento. Tente novamente em instantes.');
    }
    this.loading.set(false);
  }

  /** Usuário chega aqui pausado (paywall) — oferece atalho para reativar. */
  assinaturaPausada(): boolean {
    return this.subscription.assinatura()?.status === 'paused';
  }

  nomeExibicao(): string {
    return this.profile()?.nome_completo || this.auth.user()?.email || 'Usuário';
  }

  onCicloChange(value: string): void {
    this.ciclo.set(value === 'mensal' ? 'mensal' : 'semestral');
  }

  preco(plano: Plano): string {
    return this.brl(plano.preco_centavos, plano.moeda);
  }

  porMes(plano: Plano): string | null {
    if (plano.frequency_type === 'months' && plano.frequency > 1) {
      return this.brl(Math.round(plano.preco_centavos / plano.frequency), plano.moeda);
    }
    return null;
  }

  economia(plano: Plano): string | null {
    if (!(plano.frequency_type === 'months' && plano.frequency > 1)) return null;
    const mensal = this.planos().find((p) => p.tier === plano.tier && p.frequency === 1);
    if (!mensal) return null;
    const eco = mensal.preco_centavos * plano.frequency - plano.preco_centavos;
    return eco > 0 ? this.brl(eco, plano.moeda) : null;
  }

  /** Preço cheio do mesmo tier no plano mensal, multiplicado pelos meses — usado como âncora riscada. */
  anchorTotal(plano: Plano): string | null {
    if (!(plano.frequency_type === 'months' && plano.frequency > 1)) return null;
    const mensal = this.planos().find((p) => p.tier === plano.tier && p.frequency === 1);
    if (!mensal) return null;
    return this.brl(mensal.preco_centavos * plano.frequency, plano.moeda);
  }

  periodo(plano: Plano): string {
    if (plano.frequency_type === 'months') {
      if (plano.frequency === 1) return '/mês';
      if (plano.frequency === 6) return '/semestre';
      if (plano.frequency === 12) return '/ano';
      return `/${plano.frequency} meses`;
    }
    return `/${plano.frequency} dias`;
  }

  // Valor cheio por extenso, usado como linha secundária quando o foco é o preço por mês.
  periodoExtenso(plano: Plano): string {
    if (plano.frequency_type === 'months') {
      if (plano.frequency === 6) return 'à vista no semestre';
      if (plano.frequency === 12) return 'à vista no ano';
      return `por ${plano.frequency} meses`;
    }
    return `por ${plano.frequency} dias`;
  }

  assinar(plano: Plano): void {
    // Checkout embutido: o pagamento acontece dentro da plataforma.
    this.router.navigate(['/checkout', plano.slug]);
  }

  async sair(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }

  private planoPorTier(tier: PlanoTier): Plano | null {
    const frequency = this.ciclo() === 'mensal' ? 1 : 6;
    return this.planos().find((p) => p.tier === tier && p.frequency === frequency) ?? null;
  }

  private percentualEconomiaMax(): number {
    const mensal = this.planos().find((p) => p.tier === 'avancado' && p.frequency === 1);
    const semestral = this.planos().find((p) => p.tier === 'avancado' && p.frequency === 6);
    if (!mensal || !semestral) return 0;
    return calcularPercentualEconomia(mensal, semestral);
  }

  private brl(centavos: number, moeda: string): string {
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: moeda || 'BRL',
    });
  }
}

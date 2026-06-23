import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Check, LogOut, ShieldCheck, Sparkles, type LucideIconData } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../../shared/components/ui/avatar/ui-avatar.component';
import type { Plano } from '../../core/models/subscription.types';

@Component({
  selector: 'app-planos',
  standalone: true,
  imports: [CommonModule, RouterLink, UiIconComponent, UiAvatarComponent],
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
        <div class="mx-auto max-w-4xl">
          <header class="mb-10 text-center">
            <h1 class="text-3xl font-bold text-gray-900">Escolha seu plano</h1>
            <p class="mt-2 text-gray-600">Acesso completo aos simulados do BoraMed.</p>
          </header>

          @if (loading()) {
            <div class="py-20 text-center text-gray-500">Carregando planos…</div>
          } @else if (planos().length === 0) {
            <div class="py-20 text-center text-gray-500">Nenhum plano disponível no momento.</div>
          } @else {
            <div class="grid items-start gap-6 md:grid-cols-2">
              @for (plano of planos(); track plano.id) {
                <div
                  class="relative overflow-hidden rounded-2xl border p-8 shadow-sm"
                  [ngClass]="
                    destaque(plano)
                      ? 'border-transparent text-white'
                      : 'border-gray-200 bg-white text-gray-900'
                  "
                  [style.background]="destaque(plano) ? gradiente : null"
                >
                  @if (destaque(plano)) {
                    <div class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white opacity-5"></div>
                    <div class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white opacity-5"></div>
                    <span class="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                      Melhor valor
                    </span>
                  }

                  <h2 class="text-xl font-bold">{{ plano.nome }}</h2>
                  <p class="mt-1 text-sm" [ngClass]="destaque(plano) ? 'text-white/70' : 'text-gray-500'">
                    {{ tagline(plano) }}
                  </p>

                  @if (porMes(plano)) {
                    <!-- Planos de múltiplos meses: foco no valor por mês; valor cheio em menos destaque -->
                    <div class="mt-6 flex flex-wrap items-end justify-between gap-2">
                      <div class="flex items-baseline gap-1">
                        <span class="text-4xl font-extrabold">{{ porMes(plano) }}</span>
                        <span class="text-sm" [ngClass]="destaque(plano) ? 'text-white/70' : 'text-gray-500'">
                          /mês
                        </span>
                      </div>
                      @if (economia(plano)) {
                        <span
                          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ring-1"
                          [ngClass]="
                            destaque(plano)
                              ? 'bg-emerald-400 text-emerald-950 ring-emerald-300/50'
                              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          "
                        >
                          <app-ui-icon [icon]="sparklesIcon" [size]="13" class="shrink-0" />
                          Economize {{ economia(plano) }}
                        </span>
                      }
                    </div>
                    <p class="mt-1 text-sm" [ngClass]="destaque(plano) ? 'text-white/80' : 'text-gray-500'">
                      {{ preco(plano) }} {{ periodoExtenso(plano) }}
                    </p>
                    @if (!plano.recorrente) {
                      <p class="mt-1 text-xs" [ngClass]="destaque(plano) ? 'text-white/80' : 'text-gray-500'">
                        em até 6x sem juros de {{ porMes(plano) }}
                      </p>
                    } @else {
                      <p class="mt-1 text-xs" [ngClass]="destaque(plano) ? 'text-white/80' : 'text-gray-500'">
                        renova automaticamente
                      </p>
                    }
                  } @else {
                    <!-- Plano mensal: valor cheio em destaque -->
                    <div class="mt-6 flex items-baseline gap-1">
                      <span class="text-4xl font-extrabold">{{ preco(plano) }}</span>
                      <span class="text-sm" [ngClass]="destaque(plano) ? 'text-white/70' : 'text-gray-500'">
                        {{ periodo(plano) }}
                      </span>
                    </div>
                    @if (plano.recorrente) {
                      <p class="mt-1 text-xs" [ngClass]="destaque(plano) ? 'text-white/80' : 'text-gray-500'">
                        renova automaticamente
                      </p>
                    }
                  }

                  <!-- Benefícios -->
                  <ul class="mt-6 space-y-2.5 border-t pt-6" [ngClass]="destaque(plano) ? 'border-white/20' : 'border-gray-100'">
                    <li class="flex items-start gap-2 text-sm font-semibold">
                      <app-ui-icon
                        [icon]="checkIcon"
                        [size]="16"
                        class="mt-0.5 shrink-0"
                        [ngClass]="destaque(plano) ? 'text-white' : 'text-emerald-600'"
                      />
                      <span [ngClass]="destaque(plano) ? 'text-white' : 'text-gray-900'">{{ beneficioDestaque(plano) }}</span>
                    </li>
                    @for (b of beneficios; track b) {
                      <li class="flex items-start gap-2 text-sm">
                        <app-ui-icon
                          [icon]="checkIcon"
                          [size]="16"
                          class="mt-0.5 shrink-0"
                          [ngClass]="destaque(plano) ? 'text-white' : 'text-emerald-600'"
                        />
                        <span [ngClass]="destaque(plano) ? 'text-white/90' : 'text-gray-700'">{{ b }}</span>
                      </li>
                    }
                  </ul>

                  <button
                    type="button"
                    (click)="assinar(plano)"
                    [disabled]="processando() === plano.slug"
                    class="mt-8 w-full rounded-xl px-4 py-3 font-semibold transition disabled:opacity-60"
                    [ngClass]="
                      destaque(plano)
                        ? 'bg-white text-blue-700 hover:bg-gray-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    "
                  >
                    {{ processando() === plano.slug ? 'Redirecionando…' : 'Assinar' }}
                  </button>
                </div>
              }
            </div>
          }

          @if (erro()) {
            <p class="mt-6 text-center text-sm text-red-600">{{ erro() }}</p>
          }
        </div>
      </div>

      <!-- Rodapé -->
      <footer class="border-t border-gray-200 bg-white px-6 py-8 lg:px-10">
        <div
          class="mx-auto flex max-w-7xl flex-col items-center gap-4 text-xs text-gray-400 md:flex-row md:justify-between md:gap-8"
        >
          <p class="flex items-center gap-1.5 text-center md:text-left">
            <app-ui-icon [icon]="shieldIcon" [size]="14" class="shrink-0 text-gray-400" />
            Pagamentos processados com segurança pelo
            <span class="font-medium text-gray-500">Mercado Pago</span>. O BoraMed não armazena os dados do seu cartão.
          </p>
          <div class="flex items-center gap-4">
            <a routerLink="/termos-de-uso" class="hover:text-gray-600">Termos de uso</a>
            <a routerLink="/politica-de-privacidade" class="hover:text-gray-600">Política de privacidade</a>
            <span class="text-gray-300">© {{ ano }} BoraMed</span>
          </div>
        </div>
      </footer>
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
  readonly logoutIcon: LucideIconData = LogOut;
  readonly shieldIcon: LucideIconData = ShieldCheck;
  readonly sparklesIcon: LucideIconData = Sparkles;
  readonly ano = new Date().getFullYear();

  // Acesso é o mesmo nos dois planos (paywall total); a diferença é preço/compromisso.
  readonly beneficios: string[] = [
    'Todos os simulados: nacionais, processuais e laboratório',
    'Banco completo de questões autorais',
    'Histórico e estatísticas de desempenho',
    'Ranking competitivo, XP e conquistas',
    'Revisão comentada das questões',
  ];

  readonly planos = signal<Plano[]>([]);
  readonly loading = signal(true);
  readonly processando = signal<string | null>(null);
  readonly erro = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.profile()) void this.profileService.loadProfile();
    this.planos.set(await this.subscription.listarPlanos());
    this.loading.set(false);
  }

  nomeExibicao(): string {
    return this.profile()?.nome_completo || this.auth.user()?.email || 'Usuário';
  }

  destaque(plano: Plano): boolean {
    return plano.slug === 'semestral';
  }

  tagline(plano: Plano): string {
    return plano.recorrente
      ? 'Flexível — cancele quando quiser'
      : 'Melhor custo-benefício — pague em até 6x';
  }

  beneficioDestaque(plano: Plano): string {
    return plano.recorrente
      ? 'Cancele quando quiser, sem multa'
      : 'Maior economia do plano, com parcelamento em até 6x sem juros';
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
    const mensal = this.planos().find((p) => p.slug === 'mensal');
    if (!mensal) return null;
    const eco = mensal.preco_centavos * plano.frequency - plano.preco_centavos;
    return eco > 0 ? this.brl(eco, plano.moeda) : null;
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
      if (plano.frequency === 6) return 'no semestre';
      if (plano.frequency === 12) return 'no ano';
      return `por ${plano.frequency} meses`;
    }
    return `por ${plano.frequency} dias`;
  }

  async assinar(plano: Plano): Promise<void> {
    this.erro.set(null);
    this.processando.set(plano.slug);
    const res = await this.subscription.iniciarCheckout(plano.slug);
    if (res.ok) {
      window.location.href = res.initPoint;
    } else {
      this.erro.set(res.error);
      this.processando.set(null);
    }
  }

  async sair(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }

  private brl(centavos: number, moeda: string): string {
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: moeda || 'BRL',
    });
  }
}

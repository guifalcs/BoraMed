import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
  Flame,
  Trophy,
  Swords,
  CircleCheckBig,
} from 'lucide-angular';
import { TentativaService } from '../../core/services/tentativa.service';
import type { LucideIconData } from 'lucide-angular';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import type { GamificacaoStats, MinhaPosicaoRanking, StreakEstudoV2, DesafioDiario } from '../../core/models/gamificacao';
import type { TentativaHistoricoItem, HistoricoKpis } from '../../core/models/historico';
import type { InicioResolvedData } from '../../core/resolvers/inicio.resolver';
import { GreetingHeroComponent } from '../../shared/components/greeting-hero/greeting-hero.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { TentativaRecenteItemComponent } from '../../shared/components/tentativa-recente-item/tentativa-recente-item.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { RankingStatusBarComponent } from '../../shared/components/ranking-status-bar/ranking-status-bar.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { ProfileService } from '../../core/services/profile.service';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string | null;
  icone: LucideIconData;
  variante: KpiVariante;
  sparkline?: number[];
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    RouterLink,
    GreetingHeroComponent,
    KpiCardComponent,
    TentativaRecenteItemComponent,
    EmptyStateComponent,
    RankingStatusBarComponent,
    UiIconComponent,
  ],
  templateUrl: './inicio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {
  private readonly tentativaService = inject(TentativaService);
  private readonly router = inject(Router);

  protected readonly profile = inject(ProfileService).profile;
  protected readonly isLoadingKpis = signal(true);
  protected readonly isLoadingRecentes = signal(true);
  protected readonly kpis = signal<KpiData[]>([]);
  protected readonly tentativasRecentes = signal<TentativaHistoricoItem[]>([]);
  protected readonly streak = signal<StreakEstudoV2 | null>(null);
  protected readonly gamificacao = signal<GamificacaoStats | null>(null);
  protected readonly rankingPosicao = signal<MinhaPosicaoRanking | null>(null);
  protected readonly desafio = signal<DesafioDiario | null>(null);
  protected readonly temaRecomendado = signal<{ nome: string; taxa: number | null } | null>(null);
  private allTentativas: TentativaHistoricoItem[] = [];

  protected readonly streakIcon = Flame;
  protected readonly desafioPendenteIcon = Swords;
  protected readonly desafioFeitoIcon = CircleCheckBig;

  protected readonly provasRoute = computed<string[]>(() => {
    const t = this.tentativaService.tentativaAtiva();
    if (t && t.status !== 'finalizada' && t.modo !== 'visualizar') {
      return ['/dashboard/simulados', t.prova_id, 'tentativa', t.id];
    }
    return ['/dashboard/simulados'];
  });

  protected readonly temTentativaAtiva = computed(() => {
    const t = this.tentativaService.tentativaAtiva();
    return !!(t && t.status !== 'finalizada' && t.modo !== 'visualizar');
  });

  constructor() {
    const resolved = inject(ActivatedRoute).snapshot.data['inicioData'] as InicioResolvedData | undefined;

    if (resolved?.tentativasResult.ok) {
      this.allTentativas = resolved.tentativasResult.data;
      this.tentativasRecentes.set(this.allTentativas.slice(0, 3));
    }
    this.isLoadingRecentes.set(false);

    if (resolved?.kpisResult.ok) {
      if (resolved.kpisResult.data.tema_mais_fraco) {
        this.temaRecomendado.set({
          nome: resolved.kpisResult.data.tema_mais_fraco,
          taxa: resolved.kpisResult.data.taxa_tema_fraco,
        });
      }
      const gamificacao = resolved.gamificacaoResult.ok ? resolved.gamificacaoResult.data : null;
      this.gamificacao.set(gamificacao);
      this.kpis.set(this.buildKpis(
        resolved.kpisResult.data,
        gamificacao,
      ));
    }
    this.isLoadingKpis.set(false);

    if (resolved?.streakResult?.ok) {
      this.streak.set(resolved.streakResult.data);
    }
    if (resolved?.rankingPosicaoResult?.ok) {
      this.rankingPosicao.set(resolved.rankingPosicaoResult.data);
    }
    if (resolved?.desafioResult?.ok) {
      this.desafio.set(resolved.desafioResult.data);
    }
  }

  private buildKpis(k: HistoricoKpis, gamificacao: GamificacaoStats | null): KpiData[] {
    const taxaVariante = (): KpiVariante => {
      if (k.taxa_acerto === null) return 'default';
      if (k.taxa_acerto >= 70) return 'success';
      if (k.taxa_acerto >= 50) return 'warning';
      return 'danger';
    };
    const ultimaVariante = (): KpiVariante => {
      if (k.ultima_nota === null) return 'default';
      if (k.ultima_nota >= 70) return 'success';
      if (k.ultima_nota >= 50) return 'warning';
      return 'danger';
    };

    // Sparkline: notas das últimas tentativas em ordem cronológica (mais antiga → mais recente)
    const notasSparkline = this.allTentativas
      .filter((t) => t.nota !== null)
      .map((t) => t.nota as number)
      .reverse();

    return [
      {
        label: '% Acerto Geral',
        valor: k.taxa_acerto !== null ? `${k.taxa_acerto}%` : '—',
        sublabel: 'todas as tentativas',
        icone: TrendingUp,
        variante: taxaVariante(),
      },
      {
        label: 'Simulados Concluídos',
        valor: String(k.total_finalizadas),
        sublabel: k.total_finalizadas > 0 ? 'total finalizado' : 'nenhum ainda',
        icone: CheckCircle2,
        variante: k.total_finalizadas > 0 ? 'success' : 'default',
      },
      {
        label: 'Tema Mais Fraco',
        valor: k.taxa_tema_fraco !== null ? `${k.taxa_tema_fraco}%` : '—',
        sublabel: k.tema_mais_fraco ?? 'dados insuficientes',
        icone: AlertTriangle,
        variante: k.tema_mais_fraco ? 'danger' : 'default',
      },
      {
        label: 'Última Nota',
        valor: k.ultima_nota !== null ? `${k.ultima_nota}%` : '—',
        sublabel: null,
        icone: Award,
        variante: ultimaVariante(),
        sparkline: notasSparkline,
      },
      {
        label: 'XP da Semana',
        valor: formatNumber(gamificacao?.xp_semana_atual ?? 0),
        sublabel: `nível ${gamificacao?.nivel ?? 0} · ${formatNumber(gamificacao?.xp_total ?? 0)} XP total`,
        icone: Trophy,
        variante: (gamificacao?.xp_semana_atual ?? 0) > 0 ? 'success' : 'default',
      },
    ];
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

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
  Award,
  Flame,
  Trophy,
  Swords,
  CircleCheckBig,
  Target,
  Sparkles,
  ChevronRight,
} from 'lucide-angular';
import { TentativaService } from '../../core/services/tentativa.service';
import type { GamificacaoStats, MinhaPosicaoRanking, StreakEstudoV2, DesafioDiario } from '../../core/models/gamificacao';
import type { TentativaHistoricoItem, HistoricoKpis } from '../../core/models/historico';
import type { InicioResolvedData } from '../../core/resolvers/inicio.resolver';
import { GreetingHeroComponent } from '../../shared/components/greeting-hero/greeting-hero.component';
import { TentativaRecenteItemComponent } from '../../shared/components/tentativa-recente-item/tentativa-recente-item.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { ProfileService } from '../../core/services/profile.service';

type Variante = 'success' | 'warning' | 'danger' | 'neutral';

interface BarraEvolucao {
  nota: number;
  altura: number;
  variante: Variante;
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    RouterLink,
    GreetingHeroComponent,
    TentativaRecenteItemComponent,
    EmptyStateComponent,
    UiIconComponent,
  ],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {
  private readonly tentativaService = inject(TentativaService);
  private readonly router = inject(Router);

  protected readonly profile = inject(ProfileService).profile;

  // ── Dados crus do resolver ────────────────────────────
  protected readonly kpisData = signal<HistoricoKpis | null>(null);
  protected readonly gamificacao = signal<GamificacaoStats | null>(null);
  protected readonly streak = signal<StreakEstudoV2 | null>(null);
  protected readonly rankingPosicao = signal<MinhaPosicaoRanking | null>(null);
  protected readonly desafio = signal<DesafioDiario | null>(null);
  protected readonly historicoTentativas = signal<TentativaHistoricoItem[]>([]);
  protected readonly temaRecomendado = signal<{ nome: string; taxa: number | null } | null>(null);

  // ── Ícones ────────────────────────────────────────────
  protected readonly trendingIcon = TrendingUp;
  protected readonly concluidosIcon = CheckCircle2;
  protected readonly notaIcon = Award;
  protected readonly streakIcon = Flame;
  protected readonly trophyIcon = Trophy;
  protected readonly desafioPendenteIcon = Swords;
  protected readonly desafioFeitoIcon = CircleCheckBig;
  protected readonly temaIcon = Target;
  protected readonly xpIcon = Sparkles;
  protected readonly chevronIcon = ChevronRight;

  // ── Anel SVG (gauge) ──────────────────────────────────
  protected readonly GAUGE_CIRC = 2 * Math.PI * 40; // r = 40 no viewBox 0 0 100 100

  // ── Derivados ─────────────────────────────────────────
  protected readonly tentativasRecentes = computed(() =>
    this.historicoTentativas().slice(0, 4),
  );

  protected readonly nivelInfo = computed(() => {
    const g = this.gamificacao();
    const xp = g?.xp_total ?? 0;
    // nivel = floor(sqrt(xp / 100)); nível N abrange (2N+1)*100 de XP.
    const nivel = g?.nivel ?? Math.floor(Math.sqrt(xp / 100));
    const base = nivel * nivel * 100;
    const span = (2 * nivel + 1) * 100;
    const dentro = Math.max(0, xp - base);
    const pct = span > 0 ? Math.min(100, Math.round((dentro / span) * 100)) : 0;
    const faltam = Math.max(0, span - dentro);
    return { nivel, xp, pct, faltam };
  });

  protected readonly evolucao = computed(() => {
    const notas = this.historicoTentativas()
      .filter((t) => t.nota !== null)
      .slice(0, 8)
      .map((t) => t.nota as number)
      .reverse(); // ordem cronológica (mais antiga → mais recente)
    if (notas.length === 0) {
      return { bars: [] as BarraEvolucao[], media: null as number | null, count: 0 };
    }
    const media = Math.round(notas.reduce((a, b) => a + b, 0) / notas.length);
    const bars: BarraEvolucao[] = notas.map((nota) => ({
      nota,
      altura: Math.max(6, nota),
      variante: this.varianteNota(nota),
    }));
    return { bars, media, count: notas.length };
  });

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

  protected readonly resumoTentativaAtiva = computed(() => {
    const tentativa = this.tentativaService.tentativaAtiva();
    if (!tentativa || tentativa.status === 'finalizada' || tentativa.modo === 'visualizar') {
      return null;
    }
    const status = tentativa.status === 'pausada' ? 'pausado' : 'em andamento';
    return `${tentativa.total_respondidas} de ${tentativa.total_questoes} questões respondidas · ${status}`;
  });

  constructor() {
    const resolved = inject(ActivatedRoute).snapshot.data['inicioData'] as InicioResolvedData | undefined;

    if (resolved?.tentativasResult.ok) {
      this.historicoTentativas.set(resolved.tentativasResult.data);
    }
    if (resolved?.kpisResult.ok) {
      this.kpisData.set(resolved.kpisResult.data);
      if (resolved.kpisResult.data.tema_mais_fraco) {
        this.temaRecomendado.set({
          nome: resolved.kpisResult.data.tema_mais_fraco,
          taxa: resolved.kpisResult.data.taxa_tema_fraco,
        });
      }
    }
    if (resolved?.gamificacaoResult.ok) {
      this.gamificacao.set(resolved.gamificacaoResult.data);
    }
    if (resolved?.streakResult.ok) {
      this.streak.set(resolved.streakResult.data);
    }
    if (resolved?.rankingPosicaoResult.ok) {
      this.rankingPosicao.set(resolved.rankingPosicaoResult.data);
    }
    if (resolved?.desafioResult.ok) {
      this.desafio.set(resolved.desafioResult.data);
    }
  }

  // ── Helpers de cor (thresholds centralizados) ─────────
  protected varianteNota(valor: number | null): Variante {
    if (valor === null) return 'neutral';
    if (valor >= 70) return 'success';
    if (valor >= 50) return 'warning';
    return 'danger';
  }

  protected gaugeOffset(pct: number): number {
    return this.GAUGE_CIRC * (1 - Math.max(0, Math.min(100, pct)) / 100);
  }

  protected gradId(variante: Variante): string {
    switch (variante) {
      case 'success': return 'grad-success';
      case 'warning': return 'grad-warning';
      case 'danger':  return 'grad-danger';
      default:        return 'grad-brand';
    }
  }

  protected corVariante(variante: Variante): string {
    switch (variante) {
      case 'success': return 'text-emerald-600';
      case 'warning': return 'text-amber-600';
      case 'danger':  return 'text-red-600';
      default:        return 'text-[var(--color-primary)]';
    }
  }

  protected barBg(variante: Variante): string {
    switch (variante) {
      case 'success': return 'bg-gradient-to-t from-emerald-500 to-emerald-300';
      case 'warning': return 'bg-gradient-to-t from-amber-500 to-amber-300';
      case 'danger':  return 'bg-gradient-to-t from-red-500 to-red-300';
      default:        return 'bg-gradient-to-t from-blue-600 to-violet-400';
    }
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }

  protected readonly formatNumber = (value: number): string => NUMBER_FMT.format(value);
}

const NUMBER_FMT = new Intl.NumberFormat('pt-BR');

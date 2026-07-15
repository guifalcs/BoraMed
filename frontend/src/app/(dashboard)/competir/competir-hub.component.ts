import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CalendarCheck2,
  CircleCheck,
  CircleX,
  LucideIconData,
  Medal,
  Shield,
  Trophy,
} from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { QuestaoExplicacaoComponent } from '../../shared/components/questao-explicacao/questao-explicacao.component';
import { GamificacaoService } from '../../core/services/gamificacao.service';
import { RankingService } from '../../core/services/ranking.service';
import { DesafioService } from '../../core/services/desafio.service';
import { NotificationService } from '../../core/services/notification.service';
import { ImageViewerService } from '../../core/services/image-viewer.service';
import type { DesafioAlternativa, RankingItem } from '../../core/models/gamificacao';
import { currentWeekRange } from '../../shared/utils/current-week-range';

interface CompetirMetric {
  label: string;
  value: string;
  detail: string;
  icon: LucideIconData;
  tone: 'blue' | 'emerald' | 'amber';
}

type RankingTab = 'global' | 'semana';

@Component({
  selector: 'app-competir-hub',
  standalone: true,
  imports: [RouterLink, UiIconComponent, QuestaoExplicacaoComponent],
  templateUrl: './competir-hub.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompetirHubComponent {
  private readonly gamificacaoService = inject(GamificacaoService);
  private readonly rankingService = inject(RankingService);
  private readonly desafioService = inject(DesafioService);
  private readonly toast = inject(NotificationService);
  private readonly imageViewer = inject(ImageViewerService);

  protected readonly trophyIcon = Trophy;
  protected readonly calendarIcon = CalendarCheck2;
  protected readonly checkCircleIcon = CircleCheck;
  protected readonly xCircleIcon = CircleX;

  protected readonly isLoadingStats = signal(true);
  protected readonly isLoadingRanking = signal(true);
  protected readonly isLoadingDesafio = signal(true);
  protected readonly isSubmittingDesafio = signal(false);
  protected readonly alternativaSelecionada = signal<string | null>(null);
  protected readonly rankingTab = signal<RankingTab>('global');

  protected readonly stats = this.gamificacaoService.stats;
  protected readonly minhaPosicao = this.rankingService.minhaPosicao;
  protected readonly desafio = this.desafioService.desafio;

  protected readonly rankingAtual = computed<RankingItem[]>(() =>
    this.rankingTab() === 'global'
      ? this.rankingService.rankingGlobal()
      : this.rankingService.rankingSemana(),
  );

  protected readonly minhaPosicaoAtual = computed<number | null>(() => {
    const posicao = this.minhaPosicao();
    if (!posicao) return null;
    return this.rankingTab() === 'global' ? posicao.posicao_global : posicao.posicao_semana;
  });

  protected readonly rankingComGap = computed(() => {
    const items = this.rankingAtual();
    return items.map((item, i) => ({
      item,
      showGap: i > 0 && item.posicao > items[i - 1].posicao + 1,
    }));
  });

  protected readonly desafioEstado = computed<
    'loading' | 'unavailable' | 'pending' | 'submitting' | 'answered'
  >(() => {
    if (this.isLoadingDesafio()) return 'loading';
    const d = this.desafio();
    if (!d || !d.disponivel) return 'unavailable';
    if (d.minha_resposta !== null) return 'answered';
    if (this.isSubmittingDesafio()) return 'submitting';
    return 'pending';
  });

  protected readonly metrics = computed<CompetirMetric[]>(() => {
    const stats = this.stats();
    return [
      {
        label: 'XP total',
        value: formatNumber(stats.xp_total),
        detail: `nível ${stats.nivel}`,
        icon: Medal,
        tone: 'blue',
      },
      {
        label: 'XP da semana',
        value: formatNumber(stats.xp_semana_atual),
        detail: currentWeekRange(),
        icon: Trophy,
        tone: 'emerald',
      },
      {
        label: 'Sequência',
        value: `${stats.streak_atual} dia${stats.streak_atual === 1 ? '' : 's'}`,
        detail: `${stats.freezes_disponiveis} protetor${stats.freezes_disponiveis === 1 ? '' : 'es'} disponível${stats.freezes_disponiveis === 1 ? '' : 'eis'}`,
        icon: Shield,
        tone: 'amber',
      },
    ];
  });

  constructor() {
    void this.loadStats();
    void this.loadRanking();
    void this.loadDesafio();
  }

  private async loadStats(): Promise<void> {
    await this.gamificacaoService.getMeuXp();
    this.isLoadingStats.set(false);
  }

  private async loadRanking(): Promise<void> {
    await Promise.all([
      this.rankingService.carregarRankingGlobal(10),
      this.rankingService.carregarRankingSemana(10),
      this.rankingService.carregarMinhaPosicao(),
    ]);
    this.isLoadingRanking.set(false);
  }

  private async loadDesafio(): Promise<void> {
    await this.desafioService.carregarDesafio();
    this.isLoadingDesafio.set(false);
  }

  protected setRankingTab(tab: RankingTab): void {
    this.rankingTab.set(tab);
  }

  protected rankingXp(item: RankingItem): string {
    const value = this.rankingTab() === 'global' ? item.xp_total : item.xp_semana_atual;
    return `${formatNumber(value)} XP`;
  }

  protected metricToneClass(tone: CompetirMetric['tone']): string {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-600';
      case 'amber':
        return 'bg-amber-50 text-amber-600';
      case 'blue':
        return 'bg-blue-50 text-blue-600';
    }
  }

  protected avatarBgClass(nome: string): string {
    if (nome === 'Anônimo') return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
    const palette = [
      'bg-blue-100 text-blue-700',
      'bg-emerald-100 text-emerald-700',
      'bg-amber-100 text-amber-700',
      'bg-purple-100 text-purple-700',
      'bg-rose-100 text-rose-700',
      'bg-cyan-100 text-cyan-700',
    ];
    return palette[nome.charCodeAt(0) % palette.length];
  }

  /** Clique na imagem só amplia (lightbox) — não seleciona a alternativa. */
  protected ampliarImagemAlternativa(event: Event, url: string | null | undefined): void {
    event.stopPropagation();
    if (url) this.imageViewer.abrir(url);
  }

  protected async handleResponder(alternativaId: string): Promise<void> {
    if (this.desafioEstado() !== 'pending' || this.isSubmittingDesafio()) return;
    this.alternativaSelecionada.set(alternativaId);
    this.isSubmittingDesafio.set(true);
    const result = await this.desafioService.responderDesafio(alternativaId);
    this.isSubmittingDesafio.set(false);
    if (result.ok) {
      const xp = result.data.xp_ganho;
      if (xp > 0) this.toast.success(`+${xp} XP pelo desafio diário!`);
      for (const c of result.data.novas_conquistas) {
        this.toast.success(`Conquista desbloqueada: ${c.nome}!`);
      }
    } else {
      this.toast.error(result.error);
      this.alternativaSelecionada.set(null);
    }
  }

  /** Letras corretas do desafio, para o componente de explicação pintar o verde pelo gabarito. */
  protected letrasCorretas(alts: DesafioAlternativa[]): string[] {
    return alts.filter((a) => a.correta === true).map((a) => a.letra);
  }

  protected alternativaClass(alt: DesafioAlternativa): string {
    const estado = this.desafioEstado();
    const selecionada = this.alternativaSelecionada();
    const resposta = this.desafio()?.minha_resposta;

    if (estado === 'answered' && resposta) {
      if (alt.correta === true) {
        return 'border-emerald-400 bg-emerald-50 text-emerald-700';
      }
      if (alt.id === resposta.alternativa_id && !resposta.correta) {
        return 'border-red-400 bg-red-50 text-red-600';
      }
      return 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] opacity-60';
    }

    if (estado === 'pending' || estado === 'submitting') {
      if (alt.id === selecionada) {
        return 'border-blue-400 bg-blue-50 text-blue-700';
      }
      return 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-soft)]';
    }

    return 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]';
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

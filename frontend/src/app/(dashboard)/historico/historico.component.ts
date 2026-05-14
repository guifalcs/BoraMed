import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
} from 'lucide-angular';
import { HistoricoService } from '../../core/services/historico.service';
import type { HistoricoKpis, DesempenhoTema, TentativaHistoricoItem } from '../../core/models/historico';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import type { LucideIconData } from 'lucide-angular';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { DesempenhoTemaChartComponent } from '../../shared/components/desempenho-tema-chart/desempenho-tema-chart.component';
import { TentativaRecenteItemComponent } from '../../shared/components/tentativa-recente-item/tentativa-recente-item.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string | null;
  icone: LucideIconData;
  variante: KpiVariante;
}

@Component({
  selector: 'app-historico',
  standalone: true,
  imports: [KpiCardComponent, DesempenhoTemaChartComponent, TentativaRecenteItemComponent, EmptyStateComponent],
  templateUrl: './historico.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricoComponent implements OnInit {
  private readonly historicoService = inject(HistoricoService);
  private readonly router = inject(Router);

  protected readonly isLoadingKpis = signal(true);
  protected readonly isLoadingTemas = signal(true);
  protected readonly isLoadingTentativas = signal(true);

  protected readonly kpis = signal<KpiData[]>([]);
  protected readonly temas = signal<DesempenhoTema[]>([]);
  protected readonly tentativas = signal<TentativaHistoricoItem[]>([]);

  async ngOnInit(): Promise<void> {
    const [kpisResult, temasResult, tentativasResult] = await Promise.all([
      this.historicoService.getKpis(),
      this.historicoService.getDesempenhoTemas(),
      this.historicoService.listarTentativas(),
    ]);

    if (kpisResult.ok) {
      this.kpis.set(this.buildKpis(kpisResult.data));
    }
    this.isLoadingKpis.set(false);

    if (temasResult.ok) {
      this.temas.set(temasResult.data);
    }
    this.isLoadingTemas.set(false);

    if (tentativasResult.ok) {
      this.tentativas.set(tentativasResult.data);
    }
    this.isLoadingTentativas.set(false);
  }

  private buildKpis(k: HistoricoKpis): KpiData[] {
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
        sublabel: k.ultima_nota_data ? this.dataRelativa(k.ultima_nota_data) : null,
        icone: Award,
        variante: ultimaVariante(),
      },
    ];
  }

  private dataRelativa(isoDate: string): string {
    const d = new Date(isoDate);
    const diffDias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDias === 0) return 'hoje';
    if (diffDias === 1) return 'ontem';
    if (diffDias < 7) return `há ${diffDias} dias`;
    const semanas = Math.floor(diffDias / 7);
    if (diffDias < 30) return `há ${semanas} semana${semanas > 1 ? 's' : ''}`;
    const meses = Math.floor(diffDias / 30);
    return `há ${meses} mês${meses > 1 ? 'es' : ''}`;
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
} from 'lucide-angular';
import { ProfileService } from '../../core/services/profile.service';
import { TentativaService } from '../../core/services/tentativa.service';
import { HistoricoService } from '../../core/services/historico.service';
import type { LucideIconData } from 'lucide-angular';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import type { TentativaHistoricoItem, HistoricoKpis } from '../../core/models/historico';
import { GreetingHeroComponent } from '../../shared/components/greeting-hero/greeting-hero.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
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
  selector: 'app-inicio',
  standalone: true,
  imports: [
    RouterLink,
    GreetingHeroComponent,
    KpiCardComponent,
    TentativaRecenteItemComponent,
    EmptyStateComponent,
  ],
  templateUrl: './inicio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly tentativaService = inject(TentativaService);
  private readonly historicoService = inject(HistoricoService);
  private readonly router = inject(Router);

  protected readonly profile = this.profileService.profile;
  protected readonly isLoadingKpis = signal(true);
  protected readonly isLoadingRecentes = signal(true);

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

  protected readonly kpis = signal<KpiData[]>([]);
  protected readonly tentativasRecentes = signal<TentativaHistoricoItem[]>([]);

  async ngOnInit(): Promise<void> {
    const [kpisResult, tentativasResult] = await Promise.all([
      this.historicoService.getKpis(),
      this.historicoService.listarTentativas(3),
    ]);

    if (kpisResult.ok) {
      this.kpis.set(this.buildKpis(kpisResult.data));
    }
    this.isLoadingKpis.set(false);

    if (tentativasResult.ok) {
      this.tentativasRecentes.set(tentativasResult.data);
    }
    this.isLoadingRecentes.set(false);
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
        sublabel: null,
        icone: Award,
        variante: ultimaVariante(),
      },
    ];
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }
}

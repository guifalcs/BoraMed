import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
} from 'lucide-angular';
import { ProfileService } from '../../core/services/profile.service';
import { TentativaService } from '../../core/services/tentativa.service';
import type { LucideIconData } from 'lucide-angular';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import { GreetingHeroComponent } from '../../shared/components/greeting-hero/greeting-hero.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { TentativaRecenteItemComponent } from '../../shared/components/tentativa-recente-item/tentativa-recente-item.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string;
  icone: LucideIconData;
  variante: KpiVariante;
}

interface TentativaRecenteMock {
  nomeProva: string;
  dataIso: string;
  nota: number | null;
  tentativaId: string;
  provaId: string;
}

// TODO: substituir por TentativaService.getKpisDesempenho() quando implementado
const USANDO_MOCK = true;

const diasAtras = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    GreetingHeroComponent,
    KpiCardComponent,
    TentativaRecenteItemComponent,
    EmptyStateComponent,
  ],
  templateUrl: './inicio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {
  private readonly profileService = inject(ProfileService);
  private readonly tentativaService = inject(TentativaService);
  private readonly router = inject(Router);

  protected readonly profile = this.profileService.profile;

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

  // TODO(USANDO_MOCK): substituir por TentativaService.getKpisDesempenho()
  protected readonly kpis: KpiData[] = [
    {
      label: '% Acerto Geral',
      valor: '72%',
      sublabel: 'todas as tentativas',
      icone: TrendingUp,
      variante: 'warning',
    },
    {
      label: 'Simulados Concluídos',
      valor: '14',
      sublabel: '+2 nesta semana',
      icone: CheckCircle2,
      variante: 'success',
    },
    {
      label: 'Tema Mais Fraco',
      valor: 'Bioquímica',
      sublabel: '38% de acerto',
      icone: AlertTriangle,
      variante: 'danger',
    },
    {
      label: 'Última Nota',
      valor: '85%',
      sublabel: 'há 2 dias',
      icone: Award,
      variante: 'success',
    },
  ];

  // TODO(USANDO_MOCK): substituir por TentativaService.listarTentativasRecentes(3)
  protected readonly tentativasRecentes: TentativaRecenteMock[] = [
    {
      nomeProva: 'N1 – 2024/1',
      dataIso: diasAtras(2),
      nota: 85,
      tentativaId: 'mock-t1',
      provaId: 'mock-1',
    },
    {
      nomeProva: 'Simulado Personalizado',
      dataIso: diasAtras(5),
      nota: 60,
      tentativaId: 'mock-t2',
      provaId: 'mock-2',
    },
    {
      nomeProva: 'N2 – 2023/2',
      dataIso: diasAtras(12),
      nota: 45,
      tentativaId: 'mock-t3',
      provaId: 'mock-3',
    },
  ];

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }
}

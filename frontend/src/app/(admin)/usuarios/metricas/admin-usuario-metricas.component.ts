import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Clock,
  ClipboardList,
  Flame,
  Target,
  Trophy,
  Zap,
} from 'lucide-angular';
import {
  AdminService,
  AdminMetricasUsuario,
} from '../../../core/services/admin.service';
import {
  AdminUserSearchComponent,
  UsuarioBusca,
} from '../../../shared/components/admin-user-search/admin-user-search.component';
import {
  PeriodoFilterComponent,
  PeriodoSelecionado,
} from '../../../shared/components/periodo-filter/periodo-filter.component';
import {
  SerieDiariaChartComponent,
  PontoSerieDiaria,
} from '../../../shared/components/serie-diaria-chart/serie-diaria-chart.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';

const MODO_LABELS: Record<string, string> = {
  simulado: 'Simulado',
  estudo: 'Estudo',
  visualizar: 'Visualização',
};

const PAGAMENTO_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  authorized: 'Autorizado',
  in_process: 'Processando',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
  charged_back: 'Estornado',
};

const ASSINATURA_STATUS_LABELS: Record<string, string> = {
  authorized: 'Ativa',
  pending: 'Pendente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

@Component({
  selector: 'app-admin-usuario-metricas',
  standalone: true,
  imports: [
    DatePipe,
    AdminUserSearchComponent,
    PeriodoFilterComponent,
    SerieDiariaChartComponent,
    KpiCardComponent,
  ],
  templateUrl: './admin-usuario-metricas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsuarioMetricasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly metricas = signal<AdminMetricasUsuario | null>(null);
  protected readonly usuarioSelecionado = signal<UsuarioBusca | null>(null);
  protected readonly periodo = signal<PeriodoSelecionado | null>(null);

  protected readonly iconTentativas = ClipboardList;
  protected readonly iconTaxa = Target;
  protected readonly iconTempo = Clock;
  protected readonly iconXp = Zap;
  protected readonly iconNivel = Trophy;
  protected readonly iconStreak = Flame;

  protected readonly serieTentativas = computed<PontoSerieDiaria[]>(() =>
    (this.metricas()?.serie_tentativas_por_dia ?? []).map((p) => ({
      dia: p.dia,
      valor: p.quantidade,
    })),
  );

  protected readonly serieXp = computed<PontoSerieDiaria[]>(() =>
    (this.metricas()?.serie_xp_por_dia ?? []).map((p) => ({
      dia: p.dia,
      valor: p.xp,
    })),
  );

  protected readonly porModo = computed(() => {
    const modos = this.metricas()?.tentativas.por_modo ?? {};
    return Object.entries(modos).map(([modo, qtd]) => ({
      label: MODO_LABELS[modo] ?? modo,
      qtd,
    }));
  });

  protected readonly porFormato = computed(() => {
    const formatos = this.metricas()?.tentativas.por_formato ?? {};
    return Object.entries(formatos).map(([formato, qtd]) => ({
      label: formato === 'outro' ? 'Outro' : formato,
      qtd,
    }));
  });

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('id');
    if (userId) {
      // Deep-link: o nome/email vem junto com as métricas (campo perfil).
      this.usuarioSelecionado.set({ id: userId, email: '', nome_completo: null });
      void this.carregar();
    }
  }

  protected onUsuarioSelecionado(usuario: UsuarioBusca | null): void {
    this.usuarioSelecionado.set(usuario);
    this.metricas.set(null);
    this.erro.set(null);
    // Mantém a URL compartilhável refletindo o usuário em análise.
    void this.router.navigate(
      usuario ? ['/admin/usuarios', usuario.id, 'metricas'] : ['/admin/usuarios/metricas'],
      { replaceUrl: true },
    );
    if (usuario) void this.carregar();
  }

  protected onPeriodoChange(periodo: PeriodoSelecionado): void {
    this.periodo.set(periodo);
    if (this.usuarioSelecionado()) void this.carregar();
  }

  protected async carregar(): Promise<void> {
    const usuario = this.usuarioSelecionado();
    if (!usuario) return;

    this.isLoading.set(true);
    this.erro.set(null);

    const periodo = this.periodo();
    const result = await this.adminService.getMetricasUsuario(
      usuario.id,
      periodo?.desde ?? null,
      periodo?.ate ?? null,
    );

    if (result.ok) {
      this.metricas.set(result.data);
      // Deep-link: completa o nome/email no seletor a partir do perfil.
      if (!usuario.email) {
        this.usuarioSelecionado.set({
          id: result.data.perfil.id,
          email: result.data.perfil.email,
          nome_completo: result.data.perfil.nome_completo,
        });
      }
    } else {
      this.metricas.set(null);
      this.erro.set(
        result.error.includes('user_not_found')
          ? 'Usuário não encontrado.'
          : 'Não foi possível carregar as métricas. Tente novamente.',
      );
    }
    this.isLoading.set(false);
  }

  // ---- Formatação ----

  protected formatarTempo(segundos: number): string {
    if (segundos < 60) return `${segundos}s`;
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    if (h === 0) return `${m}min`;
    return `${h}h ${m}min`;
  }

  protected formatarCentavos(centavos: number | null): string {
    if (centavos === null) return '—';
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  protected periodicidadeLabel(
    frequency: number | null,
    frequencyType: 'days' | 'months' | null,
  ): string {
    if (!frequency || !frequencyType) return '—';
    if (frequencyType === 'months') {
      if (frequency === 1) return 'Mensal';
      if (frequency === 12) return 'Anual';
      return `A cada ${frequency} meses`;
    }
    return frequency === 1 ? 'Diária' : `A cada ${frequency} dias`;
  }

  protected assinaturaStatusLabel(status: string): string {
    return ASSINATURA_STATUS_LABELS[status] ?? status;
  }

  protected pagamentoStatusLabel(status: string): string {
    return PAGAMENTO_STATUS_LABELS[status] ?? status;
  }

  protected papelLabel(papel: string): string {
    if (papel === 'super_admin') return 'Super Admin';
    if (papel === 'admin') return 'Admin';
    return 'Aluno';
  }

  protected tipoUsuarioLabel(tipo: string | null): string {
    const labels: Record<string, string> = {
      estudante_medicina: 'Estudante de Medicina',
      medico: 'Médico',
      residente: 'Residente',
      cursinho: 'Cursinho',
      ensino_medio: 'Ensino Médio',
      outro: 'Outro',
    };
    return tipo ? (labels[tipo] ?? tipo) : '—';
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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
import {
  assinaturaStatusLabel,
  formatarCentavos,
  pagamentoStatusLabel,
  papelLabel,
  tipoUsuarioLabel,
} from '../../../shared/utils/admin-labels.util';

const MODO_LABELS: Record<string, string> = {
  simulado: 'Simulado',
  estudo: 'Estudo',
  visualizar: 'Visualização',
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
  private readonly location = inject(Location);

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
    // Mantém a URL compartilhável sem navegação de rota: trocar de config de
    // rota recriaria o componente e dispararia um segundo fetch no ngOnInit.
    this.location.replaceState(
      usuario ? `/admin/usuarios/${usuario.id}/metricas` : '/admin/usuarios/metricas',
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

    // Descarta respostas obsoletas: o admin pode ter trocado de usuário
    // enquanto a requisição estava em voo.
    if (this.usuarioSelecionado()?.id !== usuario.id) return;

    if (result.ok) {
      this.metricas.set(result.data);
      // Sincroniza o seletor com o perfil retornado (preenche nome/email no
      // deep-link; no fluxo de busca os valores já são iguais e nada muda).
      this.usuarioSelecionado.set({
        id: result.data.perfil.id,
        email: result.data.perfil.email,
        nome_completo: result.data.perfil.nome_completo,
      });
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

  protected readonly formatarCentavos = formatarCentavos;
  protected readonly assinaturaStatusLabel = assinaturaStatusLabel;
  protected readonly pagamentoStatusLabel = pagamentoStatusLabel;
  protected readonly papelLabel = papelLabel;
  protected readonly tipoUsuarioLabel = tipoUsuarioLabel;

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
}

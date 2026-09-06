import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  AdminService,
  AdminDespesa,
  AdminDespesaInput,
  AdminResultadoFinanceiro,
  DESPESA_CATEGORIAS,
  DESPESA_RECORRENCIAS,
  type DespesaCategoria,
  type DespesaRecorrencia,
} from '../../../core/services/admin.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AdminPaginationComponent } from '../../../shared/components/admin-pagination/admin-pagination.component';
import { UiConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { formatarCentavos } from '../../../shared/utils/admin-labels.util';

const PAGE_SIZE = 20;

/** Data de hoje em 'YYYY-MM-DD' no fuso local — `toISOString` devolveria UTC e
 * jogaria o lançamento para o dia anterior à noite no Brasil. */
function hojeLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-admin-despesas',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminPaginationComponent, UiConfirmDialogComponent],
  templateUrl: './admin-despesas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDespesasComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly categorias = DESPESA_CATEGORIAS;
  protected readonly recorrencias = DESPESA_RECORRENCIAS;
  protected readonly PAGE_SIZE = PAGE_SIZE;

  protected readonly despesas = signal<AdminDespesa[]>([]);
  protected readonly resultado = signal<AdminResultadoFinanceiro | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly salvando = signal(false);

  // ---- Formulário (criação e edição usam os mesmos campos) ----
  protected readonly editando = signal<AdminDespesa | null>(null);
  protected readonly fDescricao = signal('');
  protected readonly fValor = signal<number | null>(null);
  protected readonly fCategoria = signal<DespesaCategoria>('infraestrutura');
  protected readonly fCompetencia = signal(hojeLocal());
  protected readonly fRecorrencia = signal<DespesaRecorrencia>('unica');
  protected readonly fFornecedor = signal('');
  protected readonly fObservacao = signal('');

  protected readonly formValido = computed(() => {
    const valor = this.fValor();
    return (
      this.fDescricao().trim().length > 0 &&
      valor !== null &&
      valor > 0 &&
      this.fCompetencia().length === 10
    );
  });

  // ---- Filtros e paginação ----
  protected readonly filtroMes = signal('');
  protected readonly filtroCategoria = signal<DespesaCategoria | ''>('');
  protected readonly pagina = signal(0);

  protected readonly despesaParaDeletar = signal<AdminDespesa | null>(null);

  /** Meses que aparecem no filtro: os que têm lançamento, do mais recente. */
  protected readonly mesesDisponiveis = computed(() => {
    const meses = new Set(this.despesas().map((d) => d.competencia.slice(0, 7)));
    return [...meses].sort((a, b) => b.localeCompare(a));
  });

  protected readonly despesasFiltradas = computed(() => {
    const mes = this.filtroMes();
    const categoria = this.filtroCategoria();
    return this.despesas().filter(
      (d) =>
        (!mes || d.competencia.startsWith(mes)) && (!categoria || d.categoria === categoria),
    );
  });

  protected readonly despesasPagina = computed(() => {
    const inicio = this.pagina() * PAGE_SIZE;
    return this.despesasFiltradas().slice(inicio, inicio + PAGE_SIZE);
  });

  protected readonly totalFiltrado = computed(() =>
    this.despesasFiltradas().reduce((soma, d) => soma + d.valor_centavos, 0),
  );

  protected readonly porCategoria = computed(() =>
    [...(this.resultado()?.por_categoria ?? [])].sort(
      (a, b) => b.total_centavos - a.total_centavos,
    ),
  );

  /** Só os meses com receita ou despesa — sem isso a tabela nasce com 12 zeros. */
  protected readonly mesesComMovimento = computed(() =>
    (this.resultado()?.por_mes ?? [])
      .filter((m) => m.receita_liquida_centavos > 0 || m.despesas_centavos > 0)
      .reverse(),
  );

  protected readonly margemMes = computed(() => {
    const r = this.resultado();
    if (!r || r.receita_liquida_mes_centavos <= 0) return '—';
    const pct = (r.lucro_mes_centavos / r.receita_liquida_mes_centavos) * 100;
    return `${pct.toFixed(0)}%`;
  });

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  private async carregar(): Promise<void> {
    this.isLoading.set(true);
    const [lista, resultado] = await Promise.all([
      this.admin.listarDespesas(),
      this.admin.getResultadoFinanceiro(),
    ]);
    if (lista.ok) this.despesas.set(lista.data);
    else this.toast.error('Erro ao carregar despesas.');
    if (resultado.ok) this.resultado.set(resultado.data);
    else this.toast.error('Erro ao carregar o resultado financeiro.');
    this.pagina.set(0);
    this.isLoading.set(false);
  }

  /** Recarrega só os agregados — a lista já foi atualizada em memória. */
  private async recarregarResultado(): Promise<void> {
    const resultado = await this.admin.getResultadoFinanceiro();
    if (resultado.ok) this.resultado.set(resultado.data);
  }

  private payload(): AdminDespesaInput {
    return {
      descricao: this.fDescricao().trim(),
      categoria: this.fCategoria(),
      fornecedor: this.fFornecedor().trim() || null,
      // Reais → centavos: `Math.round` porque 19.12 * 100 é 1911.9999… em float.
      valor_centavos: Math.round((this.fValor() ?? 0) * 100),
      competencia: this.fCompetencia(),
      recorrencia: this.fRecorrencia(),
      observacao: this.fObservacao().trim() || null,
    };
  }

  protected async salvar(): Promise<void> {
    if (!this.formValido() || this.salvando()) return;
    this.salvando.set(true);

    const emEdicao = this.editando();
    const result = emEdicao
      ? await this.admin.atualizarDespesa(emEdicao.id, this.payload())
      : await this.admin.criarDespesa(this.payload());

    if (result.ok) {
      const salva = result.data;
      this.despesas.update((lista) =>
        emEdicao
          ? lista.map((d) => (d.id === salva.id ? salva : d))
          : [salva, ...lista].sort((a, b) => b.competencia.localeCompare(a.competencia)),
      );
      this.limparFormulario();
      this.toast.success(emEdicao ? 'Despesa atualizada.' : 'Despesa lançada.');
      await this.recarregarResultado();
    } else {
      this.toast.error('Erro ao salvar a despesa.');
    }
    this.salvando.set(false);
  }

  protected editar(despesa: AdminDespesa): void {
    this.editando.set(despesa);
    this.fDescricao.set(despesa.descricao);
    this.fValor.set(despesa.valor_centavos / 100);
    this.fCategoria.set(despesa.categoria);
    this.fCompetencia.set(despesa.competencia);
    this.fRecorrencia.set(despesa.recorrencia);
    this.fFornecedor.set(despesa.fornecedor ?? '');
    this.fObservacao.set(despesa.observacao ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected cancelarEdicao(): void {
    this.limparFormulario();
  }

  private limparFormulario(): void {
    this.editando.set(null);
    this.fDescricao.set('');
    this.fValor.set(null);
    this.fCategoria.set('infraestrutura');
    this.fCompetencia.set(hojeLocal());
    this.fRecorrencia.set('unica');
    this.fFornecedor.set('');
    this.fObservacao.set('');
  }

  protected solicitarDelete(despesa: AdminDespesa): void {
    this.despesaParaDeletar.set(despesa);
  }

  protected cancelarDelete(): void {
    this.despesaParaDeletar.set(null);
  }

  protected async confirmarDelete(): Promise<void> {
    const despesa = this.despesaParaDeletar();
    if (!despesa) return;
    this.despesaParaDeletar.set(null);

    const result = await this.admin.deletarDespesa(despesa.id);
    if (result.ok) {
      this.despesas.update((lista) => lista.filter((d) => d.id !== despesa.id));
      if (this.editando()?.id === despesa.id) this.limparFormulario();
      this.toast.success('Despesa removida.');
      await this.recarregarResultado();
    } else {
      this.toast.error('Erro ao remover a despesa.');
    }
  }

  protected mudarPagina(pagina: number): void {
    const totalPaginas = Math.max(1, Math.ceil(this.despesasFiltradas().length / PAGE_SIZE));
    this.pagina.set(Math.max(0, Math.min(pagina, totalPaginas - 1)));
  }

  protected categoriaLabel(valor: DespesaCategoria): string {
    return DESPESA_CATEGORIAS.find((c) => c.valor === valor)?.label ?? valor;
  }

  protected recorrenciaLabel(valor: DespesaRecorrencia): string {
    return DESPESA_RECORRENCIAS.find((r) => r.valor === valor)?.label ?? valor;
  }

  /** 'YYYY-MM' → 'set/2026'. */
  protected mesLabel(mes: string): string {
    const [ano, m] = mes.split('-');
    return new Date(Number(ano), Number(m) - 1, 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  }

  /** 'YYYY-MM-DD' → '06/09/2026'. Sem `new Date(iso)`: string ISO sem hora é
   * lida como UTC e volta um dia atrás em fuso negativo. */
  protected dataLabel(iso: string): string {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  protected brl(centavos: number): string {
    return formatarCentavos(centavos, 'BRL');
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChevronLeft, Printer } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { AnotacaoQuestaoService } from '../../../core/services/anotacao-questao.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { ProvaVisualizarResolvedData } from '../../../core/resolvers/prova-visualizar.resolver';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';
import { QuestaoAnotacaoComponent } from '../../../shared/components/questao-anotacao/questao-anotacao.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-prova-visualizar',
  standalone: true,
  imports: [RouterLink, QuestaoCardComponent, QuestaoAnotacaoComponent, UiIconComponent, EmptyStateComponent],
  templateUrl: './prova-visualizar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaVisualizarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);
  private readonly anotacaoService = inject(AnotacaoQuestaoService);

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly printerIcon = Printer;

  protected readonly provaId = signal('');
  protected readonly tentativaId = signal('');
  protected readonly provaNome = signal('');
  protected readonly questoes = signal<QuestaoComAlternativas[]>([]);
  protected readonly respostasMap = signal<Map<string, string>>(new Map());
  protected readonly respostasCorretasMap = signal<Map<string, boolean>>(new Map());
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly filtro = signal<'todas' | 'erros'>('todas');
  protected readonly anotacoesErro = signal<string | null>(null);

  protected readonly backRoute = computed(() =>
    this.tentativaId()
      ? ['/dashboard/simulados', this.provaId(), 'tentativa', this.tentativaId(), 'resultado']
      : ['/dashboard/simulados', this.provaId()],
  );

  protected readonly mostrarAnotacoes = computed(() => !!this.tentativaId());

  protected readonly questoesFiltradas = computed(() => {
    if (this.filtro() !== 'erros') {
      return this.questoes();
    }

    return this.questoes().filter((questao) => this.respostasCorretasMap().get(questao.id) === false);
  });

  protected readonly tituloPagina = computed(() =>
    this.provaNome()
      ? this.filtro() === 'erros'
        ? `${this.provaNome()} · revisão dos erros`
        : this.provaNome()
      : '',
  );

  protected readonly descricaoFiltro = computed(() => {
    if (this.filtro() !== 'erros') return null;
    return `Mostrando ${this.questoesFiltradas().length} questão${this.questoesFiltradas().length === 1 ? '' : 'ões'} com erro nesta tentativa.`;
  });

  constructor() {
    const resolved = this.route.snapshot.data['provaVisualizarData'] as ProvaVisualizarResolvedData | undefined;
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    const filtroParam = this.route.snapshot.queryParamMap.get('filtro');
    this.provaId.set(id);
    if (filtroParam === 'erros') {
      this.filtro.set('erros');
    }

    if (resolved?.provaResult.ok) {
      this.provaNome.set(resolved.provaResult.data.nome);
    }

    if (resolved?.questoesResult.ok) {
      this.questoes.set(resolved.questoesResult.data);
    } else if (resolved && !resolved.questoesResult.ok) {
      this.erro.set(resolved.questoesResult.error);
    }

    this.isLoading.set(false);

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const lastResultado = this.tentativaService.lastResultado();
      const navState = history.state as { fromResultado?: boolean } | null;

      if (lastResultado?.tentativa.prova_id === id && navState?.fromResultado) {
        this.tentativaId.set(lastResultado.tentativa.id);
        const map = new Map<string, string>();
        const corretas = new Map<string, boolean>();
        for (const r of lastResultado.respostas) {
          if (r.alternativa_id) {
            map.set(r.questao_id, r.alternativa_id);
          }
          if (r.correta !== null) {
            corretas.set(r.questao_id, r.correta);
          }
        }
        this.respostasMap.set(map);
        this.respostasCorretasMap.set(corretas);

        void this.anotacaoService.carregarPorTentativa(lastResultado.tentativa.id).then((result) => {
          if (!result.ok) {
            this.anotacoesErro.set(result.error);
          }
        });
      }
    }
  }

  protected anotacaoConteudo(questaoId: string): string | null {
    return this.anotacaoService.anotacoes().get(questaoId)?.conteudo ?? null;
  }

  protected salvandoAnotacao(questaoId: string): boolean {
    return this.anotacaoService.salvandoQuestoes().has(questaoId);
  }

  protected erroAnotacao(questaoId: string): string | null {
    return this.anotacaoService.errosQuestoes().get(questaoId) ?? null;
  }

  protected async onSalvarAnotacao(questaoId: string, conteudo: string): Promise<void> {
    const tentativaId = this.tentativaId();
    if (!tentativaId) return;
    await this.anotacaoService.salvar(tentativaId, questaoId, conteudo);
  }

  protected async onExcluirAnotacao(questaoId: string): Promise<void> {
    const tentativaId = this.tentativaId();
    if (!tentativaId) return;
    await this.anotacaoService.excluir(tentativaId, questaoId);
  }
}

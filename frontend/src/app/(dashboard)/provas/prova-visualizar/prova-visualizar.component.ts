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
import { ProvaService } from '../../../core/services/prova.service';
import { NavigationProgressService } from '../../../core/services/navigation-progress.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { PaywallService } from '../../../core/services/paywall.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { TentativaResposta } from '../../../core/models/tentativa';
import type { RespostaCorrecao } from '../../../core/models/correcao';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';
import { QuestaoAnotacaoComponent } from '../../../shared/components/questao-anotacao/questao-anotacao.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UpgradeBadgeComponent } from '../../../shared/components/upgrade-badge/upgrade-badge.component';
@Component({
  selector: 'app-prova-visualizar',
  standalone: true,
  imports: [RouterLink, QuestaoCardComponent, QuestaoAnotacaoComponent, UiIconComponent, EmptyStateComponent, UpgradeBadgeComponent],
  templateUrl: './prova-visualizar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaVisualizarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);
  private readonly anotacaoService = inject(AnotacaoQuestaoService);
  private readonly provaService = inject(ProvaService);
  private readonly nav = inject(NavigationProgressService);
  private readonly subscription = inject(SubscriptionService);
  private readonly paywall = inject(PaywallService);

  /**
   * Impressão é benefício de assinante. `false` enquanto o nível é desconhecido
   * — nada de cadeado piscando na tela de quem paga.
   */
  protected readonly gratuito = this.subscription.isGratuito;

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly printerIcon = Printer;

  protected readonly provaId = signal('');
  protected readonly tentativaId = signal('');
  protected readonly provaNome = signal('');
  protected readonly questoes = signal<QuestaoComAlternativas[]>([]);
  protected readonly respostasMap = signal<Map<string, string>>(new Map());
  protected readonly respostasCorretasMap = signal<Map<string, boolean>>(new Map());
  // ---- Discursivas ----
  protected readonly respostasTextoMap = signal<Map<string, string>>(new Map());
  protected readonly enviadas = signal<Set<string>>(new Set());
  protected readonly correcoesMap = signal<Map<string, RespostaCorrecao>>(new Map());
  /** Questões anuladas pelo aluno nesta tentativa (só leitura na revisão). */
  protected readonly anuladasSet = signal<Set<string>>(new Set());
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
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    const routeTentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';
    const filtroParam = this.route.snapshot.queryParamMap.get('filtro');
    this.provaId.set(id);
    if (filtroParam === 'erros') {
      this.filtro.set('erros');
    }

    // Navega instantaneamente; prova + questões são buscadas aqui, sem bloquear
    // a rota (skeleton enquanto carrega).
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.nav.track(this.carregar(id, routeTentativaId || null));
      this.hidratarRespostas(id);
      // Fora do caminho crítico: só decide se o botão de imprimir aparece
      // bloqueado (RPC cacheada em SubscriptionService).
      void this.subscription.statusAcessoServidor();
    }
  }

  protected abrirPaywallImpressao(): void {
    this.paywall.abrir('impressao');
  }

  private async carregar(provaId: string, tentativaId: string | null): Promise<void> {
    this.isLoading.set(true);
    this.erro.set(null);
    const [provaResult, questoesResult] = await Promise.all([
      this.provaService.buscarProva(provaId),
      this.provaService.getQuestoesRevisao(provaId, tentativaId),
    ]);

    if (provaResult.ok) {
      this.provaNome.set(provaResult.data.nome);
    }
    if (questoesResult.ok) {
      this.questoes.set(questoesResult.data.questoes);
      this.aplicarRespostas(questoesResult.data.respostas);
    } else {
      this.erro.set(questoesResult.error);
    }
    this.isLoading.set(false);
  }

  /** Hidrata respostas (objetivas e discursivas) vindas da RPC de revisão. */
  private aplicarRespostas(respostas: TentativaResposta[]): void {
    if (respostas.length === 0) return;
    const map = new Map<string, string>();
    const corretas = new Map<string, boolean>();
    const textos = new Map<string, string>();
    const enviadas = new Set<string>();
    const correcoes = new Map<string, RespostaCorrecao>();
    const anuladas = new Set<string>();

    for (const r of respostas) {
      if (r.alternativa_id) map.set(r.questao_id, r.alternativa_id);
      if (r.correta !== null) {
        corretas.set(r.questao_id, r.correta);
      } else if (r.pontos != null) {
        // Discursiva corrigida: "errada" abaixo do threshold 70 (filtro de erros)
        corretas.set(r.questao_id, r.pontos >= 70);
      }
      if (r.resposta_texto) textos.set(r.questao_id, r.resposta_texto);
      if (r.enviada_em) enviadas.add(r.questao_id);
      if (r.correcao) correcoes.set(r.questao_id, r.correcao);
      if (r.anulada_usuario) anuladas.add(r.questao_id);
    }

    this.respostasMap.set(map);
    this.respostasCorretasMap.set(corretas);
    this.respostasTextoMap.set(textos);
    this.enviadas.set(enviadas);
    this.correcoesMap.set(correcoes);
    this.anuladasSet.set(anuladas);
  }

  /**
   * Quando a navegação vem da tela de resultado, hidrata as respostas e
   * anotações a partir do último resultado em memória (sem novo round-trip).
   */
  private hidratarRespostas(provaId: string): void {
    const lastResultado = this.tentativaService.lastResultado();
    const navState = history.state as { fromResultado?: boolean } | null;

    if (lastResultado?.tentativa.prova_id === provaId && navState?.fromResultado) {
      this.tentativaId.set(lastResultado.tentativa.id);
      const map = new Map<string, string>();
      const corretas = new Map<string, boolean>();
      const anuladas = new Set<string>();
      for (const r of lastResultado.respostas) {
        if (r.alternativa_id) {
          map.set(r.questao_id, r.alternativa_id);
        }
        if (r.correta !== null) {
          corretas.set(r.questao_id, r.correta);
        }
        if (r.anulada_usuario) {
          anuladas.add(r.questao_id);
        }
      }
      this.respostasMap.set(map);
      this.respostasCorretasMap.set(corretas);
      this.anuladasSet.set(anuladas);

      void this.anotacaoService.carregarPorTentativa(lastResultado.tentativa.id).then((result) => {
        if (!result.ok) {
          this.anotacoesErro.set(result.error);
        }
      });
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

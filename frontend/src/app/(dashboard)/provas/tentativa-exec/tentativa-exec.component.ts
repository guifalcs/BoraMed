import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Bookmark, ChevronDown, ChevronUp, FileX } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import { TimerService } from '../../../core/services/timer.service';
import { NotificationService } from '../../../core/services/notification.service';
import { FocoModoService } from '../../../core/services/foco-modo.service';
import { CorrecaoIaService } from '../../../core/services/correcao-ia.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { Tentativa, ModoProva } from '../../../core/models/tentativa';
import type { RespostaCorrecao } from '../../../core/models/correcao';
import type { EstadoRespostaAberta } from '../../../shared/components/resposta-aberta-input/resposta-aberta-input.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { ProvaHeaderComponent } from '../../../shared/components/prova-header/prova-header.component';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { GradeItemComponent } from '../../../shared/components/grade-item/grade-item.component';
import { QuestaoComentariosComponent } from '../../../shared/components/questao-comentarios/questao-comentarios.component';

@Component({
  selector: 'app-tentativa-exec',
  standalone: true,
  imports: [ProvaHeaderComponent, QuestaoCardComponent, UiIconComponent, UiConfirmDialogComponent, EmptyStateComponent, GradeItemComponent, QuestaoComentariosComponent],
  providers: [TimerService],
  templateUrl: './tentativa-exec.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaExecComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tentativaService = inject(TentativaService);
  private readonly provaService = inject(ProvaService);
  private readonly timer = inject(TimerService);
  private readonly notifications = inject(NotificationService);
  private readonly correcaoIa = inject(CorrecaoIaService);
  protected readonly focoMode = inject(FocoModoService);

  protected readonly tentativa = signal<Tentativa | null>(null);
  protected readonly questoes = signal<QuestaoComAlternativas[]>([]);
  protected readonly questaoAtualIdx = signal(0);
  protected readonly respostas = signal<Map<string, string>>(new Map());
  protected readonly respostasCorretas = signal<Map<string, string>>(new Map());
  // ---- Questões discursivas ----
  /** Rascunho/texto por questão aberta. */
  protected readonly respostasTexto = signal<Map<string, string>>(new Map());
  /** Questões abertas já enviadas definitivamente. */
  protected readonly enviadas = signal<Set<string>>(new Set());
  /** Envio em andamento (questão atual). */
  protected readonly enviandoAberta = signal<Set<string>>(new Set());
  /** Correção por IA por questão aberta enviada. */
  protected readonly correcoes = signal<Map<string, RespostaCorrecao>>(new Map());
  protected readonly isLoading = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly isPaused = signal(false);
  protected readonly mostrarGrade = signal(false);
  protected readonly mostrarConfirmacao = signal(false);
  protected readonly marcadas = signal<Set<string>>(new Set());

  protected readonly chevronDownIcon = ChevronDown;
  protected readonly chevronUpIcon = ChevronUp;
  protected readonly bookmarkIcon = Bookmark;
  protected readonly fileXIcon = FileX;

  private _finalizado = false;

  /** Debounce da persistência de rascunho no servidor, isolado por questão. */
  private readonly rascunhoTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly RASCUNHO_DEBOUNCE_MS = 1000;

  protected readonly timerSeconds = this.timer.seconds;
  protected readonly provaNome = this.tentativaService.provaNome;

  protected readonly questaoAtual = computed(() => {
    const q = this.questoes();
    const idx = this.questaoAtualIdx();
    return q[idx] ?? null;
  });

  protected readonly modo = computed<ModoProva>(() => this.tentativa()?.modo ?? 'simulado');

  /** Respondidas = alternativas selecionadas + abertas enviadas. */
  protected readonly totalRespondidas = computed(
    () => this.respostas().size + this.enviadas().size,
  );

  protected readonly questaoAtualDiscursiva = computed(
    () => this.questaoAtual()?.formato === 'resposta_aberta_curta',
  );

  protected readonly respostaTextoAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return '';
    return this.respostasTexto().get(q.id) ?? '';
  });

  protected readonly estadoAbertaAtual = computed<EstadoRespostaAberta>(() => {
    const q = this.questaoAtual();
    if (!q) return 'rascunho';
    if (this.enviadas().has(q.id)) return 'enviada';
    if (this.enviandoAberta().has(q.id)) return 'enviando';
    return 'rascunho';
  });

  protected readonly correcaoAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return null;
    return this.correcoes().get(q.id) ?? null;
  });

  protected readonly questaoAtualMarcada = computed(() => {
    const q = this.questaoAtual();
    return q ? this.marcadas().has(q.id) : false;
  });

  protected readonly totalMarcadas = computed(() => this.marcadas().size);

  protected readonly respostaSelecionadaAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return null;
    return this.respostas().get(q.id) ?? null;
  });

  protected readonly alternativaCorretaAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return null;
    return this.respostasCorretas().get(q.id) ?? null;
  });

  protected errou(questaoId: string): boolean {
    const correta = this.respostasCorretas().get(questaoId);
    if (!correta) return false;
    return this.respostas().get(questaoId) !== correta;
  }

  async ngOnInit(): Promise<void> {
    const tentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';

    const tentativaAtiva = this.tentativaService.tentativaAtiva();
    const questoesAtivas = this.tentativaService.questoes();

    if (tentativaAtiva?.id === tentativaId && questoesAtivas.length > 0) {
      await this.carregarDeMemoria(tentativaAtiva.prova_id);
    } else {
      // Fallback: F5 ou navegação direta por URL — tenta retomar do servidor
      const result = await this.tentativaService.retomar(tentativaId);
      if (result.ok) {
        await this.carregarDeMemoria(result.data.tentativa.prova_id);
      } else {
        this.erro.set(result.error);
        this.isLoading.set(false);
      }
    }
  }

  private async carregarDeMemoria(provaId: string | null): Promise<void> {
    const tentativaAtiva = this.tentativaService.tentativaAtiva()!;
    this.tentativa.set(tentativaAtiva);
    this.questoes.set(this.tentativaService.questoes());

    const respostasMap = new Map<string, string>();
    const textosMap = new Map<string, string>();
    const enviadasSet = new Set<string>();
    for (const r of this.tentativaService.respostas()) {
      if (r.alternativa_id) {
        respostasMap.set(r.questao_id, r.alternativa_id);
      }
      if (r.resposta_texto) {
        textosMap.set(r.questao_id, r.resposta_texto);
      }
      if (r.enviada_em) {
        enviadasSet.add(r.questao_id);
      }
    }
    this.respostas.set(respostasMap);
    this.respostasTexto.set(textosMap);
    this.enviadas.set(enviadasSet);

    // Restaura correções das abertas já enviadas (pós-F5)
    if (enviadasSet.size > 0) {
      const respostasEnviadas = this.tentativaService
        .respostas()
        .filter((r) => r.enviada_em);
      const idPorResposta = new Map(respostasEnviadas.map((r) => [r.id, r.questao_id]));
      const correcoesResult = await this.tentativaService.listarCorrecoes(
        respostasEnviadas.map((r) => r.id),
      );
      if (correcoesResult.ok) {
        const correcoesMap = new Map<string, RespostaCorrecao>();
        for (const c of correcoesResult.data) {
          const questaoId = idPorResposta.get(c.tentativa_resposta_id);
          if (questaoId) correcoesMap.set(questaoId, c);
        }
        this.correcoes.set(correcoesMap);
      }
    }

    if (tentativaAtiva.modo === 'estudo') {
      const corretasMap = new Map<string, string>();
      for (const q of this.questoes()) {
        if (respostasMap.has(q.id)) {
          const altCorreta = q.alternativas.find((a) => a.correta)?.id;
          if (altCorreta) {
            corretasMap.set(q.id, altCorreta);
          }
        }
      }
      this.respostasCorretas.set(corretasMap);
    }

    this.timer.start(tentativaAtiva.tempo_acumulado_segundos);

    if (!this.tentativaService.provaNome() && provaId) {
      const provaResult = await this.provaService.buscarProva(provaId);
      if (provaResult.ok) {
        this.tentativaService.setProvaNome(provaResult.data.nome);
      }
    }

    this.isLoading.set(false);
  }

  ngOnDestroy(): void {
    const segundos = this.timer.seconds();
    this.timer.stop();
    this.focoMode.desativar();
    const tentativa = this.tentativa();

    // Flush de rascunhos ainda em debounce, para não perder o que foi digitado.
    if (tentativa) {
      for (const [questaoId, timer] of this.rascunhoTimers) {
        clearTimeout(timer);
        if (this.enviadas().has(questaoId)) continue;
        const texto = this.respostasTexto().get(questaoId);
        if (texto !== undefined) {
          void this.tentativaService.salvarRespostaTexto(tentativa.id, questaoId, texto);
        }
      }
    }
    this.rascunhoTimers.clear();

    if (!this._finalizado && tentativa) {
      void this.tentativaService.pausar(tentativa.id, segundos);
    }
  }

  protected async onResponder(alternativaId: string): Promise<void> {
    const tentativa = this.tentativa();
    const questao = this.questaoAtual();
    if (!tentativa || !questao) return;

    if (this.modo() === 'estudo' && this.respostasCorretas().has(questao.id)) return;

    const anteriorResposta = this.respostas().get(questao.id);
    if (anteriorResposta === alternativaId) return;

    this.respostas.update((m) => {
      const next = new Map(m);
      next.set(questao.id, alternativaId);
      return next;
    });

    const result = await this.tentativaService.salvarResposta(
      tentativa.id,
      questao.id,
      alternativaId,
    );

    if (!result.ok) {
      // Rollback da seleção otimista
      this.respostas.update((m) => {
        const next = new Map(m);
        if (anteriorResposta !== undefined) {
          next.set(questao.id, anteriorResposta);
        } else {
          next.delete(questao.id);
        }
        return next;
      });
      this.notifications.error('Não foi possível salvar a resposta. Tente novamente.');
      return;
    }

    if (this.modo() === 'estudo') {
      const altCorreta = questao.alternativas.find((a) => a.correta)?.id ?? null;
      if (altCorreta) {
        this.respostasCorretas.update((m) => {
          const next = new Map(m);
          next.set(questao.id, altCorreta);
          return next;
        });
      }
    }
  }

  // ---- Questões discursivas ----

  protected onSalvarRascunho(texto: string): void {
    const tentativa = this.tentativa();
    const questao = this.questaoAtual();
    if (!tentativa || !questao || this.enviadas().has(questao.id)) return;

    // Estado local imediato, sempre na questão correta.
    this.respostasTexto.update((m) => {
      const next = new Map(m);
      next.set(questao.id, texto);
      return next;
    });

    // Debounce da persistência, isolado por questão. O id é capturado agora —
    // navegar antes do disparo não muda o destino do rascunho. Autosave
    // silencioso: erro não interrompe a digitação.
    const tentativaId = tentativa.id;
    const questaoId = questao.id;
    const timerAtual = this.rascunhoTimers.get(questaoId);
    if (timerAtual) clearTimeout(timerAtual);
    this.rascunhoTimers.set(
      questaoId,
      setTimeout(() => {
        this.rascunhoTimers.delete(questaoId);
        void this.tentativaService.salvarRespostaTexto(tentativaId, questaoId, texto);
      }, this.RASCUNHO_DEBOUNCE_MS),
    );
  }

  protected async onEnviarTexto(texto: string): Promise<void> {
    const tentativa = this.tentativa();
    const questao = this.questaoAtual();
    if (!tentativa || !questao || this.enviadas().has(questao.id)) return;

    // Cancela autosave pendente: o envio já persiste o texto definitivo.
    const timerRascunho = this.rascunhoTimers.get(questao.id);
    if (timerRascunho) {
      clearTimeout(timerRascunho);
      this.rascunhoTimers.delete(questao.id);
    }

    this.enviandoAberta.update((s) => new Set(s).add(questao.id));
    this.respostasTexto.update((m) => {
      const next = new Map(m);
      next.set(questao.id, texto);
      return next;
    });

    const result = await this.tentativaService.enviarRespostaAberta(tentativa.id, questao.id, texto);

    if (!result.ok) {
      this.enviandoAberta.update((s) => {
        const next = new Set(s);
        next.delete(questao.id);
        return next;
      });
      this.notifications.error(result.error);
      return;
    }

    this.enviadas.update((s) => new Set(s).add(questao.id));
    this.correcoes.update((m) => {
      const next = new Map(m);
      next.set(questao.id, result.data.correcao);
      return next;
    });

    if (this.modo() === 'estudo') {
      // Estudo: aguarda a correção para exibir o feedback inline.
      await this.corrigirQuestao(questao.id, result.data.resposta.id);
    } else {
      // Simulado: dispara em background; o resultado re-tenta se falhar.
      void this.corrigirQuestao(questao.id, result.data.resposta.id, { silencioso: true });
    }

    this.enviandoAberta.update((s) => {
      const next = new Set(s);
      next.delete(questao.id);
      return next;
    });
  }

  protected async onTentarCorrecaoNovamente(): Promise<void> {
    const questao = this.questaoAtual();
    const tentativaRespostaId = this.correcaoAtual()?.tentativa_resposta_id;
    if (!questao || !tentativaRespostaId) return;
    this.correcoes.update((m) => {
      const atual = m.get(questao.id);
      if (!atual) return m;
      const next = new Map(m);
      next.set(questao.id, { ...atual, status: 'corrigindo' });
      return next;
    });
    await this.corrigirQuestao(questao.id, tentativaRespostaId);
  }

  private async corrigirQuestao(
    questaoId: string,
    tentativaRespostaId: string,
    opts: { silencioso?: boolean } = {},
  ): Promise<void> {
    const result = await this.correcaoIa.corrigir(tentativaRespostaId);
    if (result.ok) {
      this.correcoes.update((m) => {
        const next = new Map(m);
        next.set(questaoId, result.data);
        return next;
      });
    } else if (!opts.silencioso) {
      // Marca como erro para exibir o botão "tentar de novo".
      this.correcoes.update((m) => {
        const atual = m.get(questaoId);
        if (!atual) return m;
        const next = new Map(m);
        next.set(questaoId, { ...atual, status: 'erro' });
        return next;
      });
      this.notifications.error(result.error);
    }
  }

  protected toggleMarcar(): void {
    const q = this.questaoAtual();
    if (!q) return;
    this.marcadas.update((s) => {
      const next = new Set(s);
      if (next.has(q.id)) {
        next.delete(q.id);
      } else {
        next.add(q.id);
      }
      return next;
    });
  }

  protected irParaQuestao(idx: number): void {
    this.questaoAtualIdx.set(idx);
  }

  protected proximaQuestao(): void {
    if (this.questaoAtualIdx() < this.questoes().length - 1) {
      this.questaoAtualIdx.update((i) => i + 1);
    }
  }

  protected questaoAnterior(): void {
    if (this.questaoAtualIdx() > 0) {
      this.questaoAtualIdx.update((i) => i - 1);
    }
  }

  protected voltarParaSimulados(): void {
    void this.router.navigate(['/dashboard/simulados']);
  }

  protected onSair(): void {
    const tentativa = this.tentativa();
    if (tentativa) {
      // Simulados personalizados não possuem página de detalhe útil
      void this.router.navigate(['/dashboard/simulados']);
    }
  }

  protected onTogglePausar(): void {
    if (this.isPaused()) {
      this.timer.resume();
      this.isPaused.set(false);
    } else {
      this.timer.pause();
      this.isPaused.set(true);
    }
  }

  protected readonly questoesNaoRespondidas = computed(() =>
    this.questoes().length - this.totalRespondidas(),
  );

  /** Abertas com rascunho digitado mas nunca enviadas — perdem o texto na finalização. */
  protected readonly abertasNaoEnviadas = computed(() =>
    this.questoes().filter(
      (q) =>
        q.formato === 'resposta_aberta_curta' &&
        !this.enviadas().has(q.id) &&
        (this.respostasTexto().get(q.id) ?? '').trim().length > 0,
    ).length,
  );

  protected readonly mensagemFinalizacao = computed(() => {
    const naoResp = this.questoesNaoRespondidas();
    const marc = this.totalMarcadas();
    const abertas = this.abertasNaoEnviadas();
    const parts: string[] = [];

    if (abertas > 0) {
      parts.push(
        `${abertas} ${abertas === 1 ? 'resposta discursiva escrita mas não enviada (não será corrigida)' : 'respostas discursivas escritas mas não enviadas (não serão corrigidas)'}`,
      );
    }
    if (naoResp > 0) {
      parts.push(`${naoResp} ${naoResp === 1 ? 'questão sem resposta' : 'questões sem resposta'}`);
    }
    if (marc > 0) {
      parts.push(`${marc} ${marc === 1 ? 'questão marcada para revisão' : 'questões marcadas para revisão'}`);
    }

    if (parts.length > 0) {
      return `Você ainda tem ${parts.join(' e ')}. Deseja finalizar mesmo assim?`;
    }
    return 'Todas as questões foram respondidas. Deseja finalizar a prova?';
  });

  protected onFinalizar(): void {
    this.mostrarConfirmacao.set(true);
  }

  protected cancelarFinalizacao(): void {
    this.mostrarConfirmacao.set(false);
  }

  protected async confirmarFinalizacao(): Promise<void> {
    this.mostrarConfirmacao.set(false);
    const tentativa = this.tentativa();
    if (!tentativa) return;

    this.salvando.set(true);
    this.timer.pause();

    const result = await this.tentativaService.finalizar(tentativa.id, this.timer.seconds());

    this.salvando.set(false);

    if (result.ok) {
      this._finalizado = true;
      this.tentativaService.setLastResultado(result.data);
      void this.router.navigate([
        '/dashboard/simulados',
        tentativa.prova_id ?? 'removida',
        'tentativa',
        tentativa.id,
        'resultado',
      ]);
    } else {
      this.timer.resume();
      this.notifications.error('Não foi possível finalizar a prova. Tente novamente.');
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.isLoading() || this.isPaused() || this.salvando() || this._finalizado || this.mostrarConfirmacao()) return;

    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.questaoAnterior();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.proximaQuestao();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.toggleMarcar();
        break;
      default: {
        const alternativas = this.questaoAtual()?.alternativas;
        if (!alternativas?.length) return;

        const letraMap: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4 };
        const numMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };

        const idx = letraMap[event.key.toLowerCase()] ?? numMap[event.key] ?? -1;
        if (idx >= 0 && idx < alternativas.length) {
          event.preventDefault();
          const sorted = [...alternativas].sort((a, b) => a.ordem - b.ordem);
          const alt = sorted[idx];
          if (alt) {
            void this.onResponder(alt.id);
          }
        }
        break;
      }
    }
  }
}

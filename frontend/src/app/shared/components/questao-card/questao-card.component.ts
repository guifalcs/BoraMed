import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { ModoProva } from '../../../core/models/tentativa';
import type { RespostaCorrecao } from '../../../core/models/correcao';
import type { EstadoAlternativa } from '../alternativa-item/alternativa-item.component';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import { AlternativaItemComponent } from '../alternativa-item/alternativa-item.component';
import { QuestaoExplicacaoComponent } from '../questao-explicacao/questao-explicacao.component';
import {
  RespostaAbertaInputComponent,
  type EstadoRespostaAberta,
} from '../resposta-aberta-input/resposta-aberta-input.component';
import { CorrecaoFeedbackComponent } from '../correcao-feedback/correcao-feedback.component';
import { RespostaPadraoComponent } from '../resposta-padrao/resposta-padrao.component';
import { QuestaoRecursoComponent } from '../questao-recurso/questao-recurso.component';
import { FormatarEnunciadoPipe } from '../../pipes/formatar-enunciado.pipe';

@Component({
  selector: 'app-questao-card',
  standalone: true,
  imports: [
    MarkdownComponent,
    FormatarEnunciadoPipe,
    AlternativaItemComponent,
    QuestaoExplicacaoComponent,
    RespostaAbertaInputComponent,
    CorrecaoFeedbackComponent,
    RespostaPadraoComponent,
    QuestaoRecursoComponent,
  ],
  templateUrl: './questao-card.component.html',
  providers: [provideMarkdown()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoCardComponent {
  questao = input.required<QuestaoComAlternativas>();
  numero = input.required<number>();
  modo = input.required<ModoProva>();
  respostaSelecionada = input<string | null>(null);
  alternativaCorreta = input<string | null>(null);
  gabaritioVisivel = input<boolean>(false);

  // ---- Questão discursiva ----
  /** Rascunho/texto da resposta aberta (restaurado do servidor). */
  respostaTexto = input<string>('');
  estadoRespostaAberta = input<EstadoRespostaAberta>('rascunho');
  correcao = input<RespostaCorrecao | null>(null);

  // ---- Recurso e anulação ----
  /** Aluno anulou esta questão na tentativa (fora das métricas). */
  anuladaUsuario = input<boolean>(false);
  /** Exibe o botão discreto de anular/desanular (tentativa ativa, sem recurso). */
  podeAnular = input<boolean>(false);
  /** Requisição de anulação em andamento (trava o botão). */
  anulandoQuestao = input<boolean>(false);

  responder = output<string>();
  salvarRascunho = output<string>();
  enviarTexto = output<string>();
  tentarCorrecaoNovamente = output<void>();
  /** Emite o novo estado de anulação: true = anular, false = desanular. */
  toggleAnular = output<boolean>();

  protected readonly imgCarregada = signal(false);
  protected readonly imgErro = signal(false);

  constructor() {
    // O card é reutilizado entre questões (input muda no mesmo componente).
    // Sem reset, o estado de imagem de uma questão vaza para a próxima.
    effect(
      () => {
        this.questao().imagem_url;
        this.imgCarregada.set(false);
        this.imgErro.set(false);
      },
      { allowSignalWrites: true },
    );
  }

  protected readonly ehDiscursiva = computed(
    () => this.questao().formato === 'resposta_aberta_curta',
  );

  /** Resposta padrão/correção aparecem quando a resposta foi enviada (estudo)
   * ou o gabarito está liberado (visualizar/revisão). Em simulado o gabarito
   * chega mascarado do servidor, então nada vaza mesmo se renderizar. */
  protected readonly exibirGabaritoAberto = computed(() => {
    if (!this.ehDiscursiva()) return false;
    const modo = this.modo();
    if (modo === 'visualizar' || this.gabaritioVisivel()) return true;
    return modo === 'estudo' && this.estadoRespostaAberta() === 'enviada';
  });

  protected readonly exibirExplicacao = computed(() => {
    if (this.ehDiscursiva()) {
      return !!this.questao().explicacao && this.exibirGabaritoAberto();
    }
    return this.exibirExplicacaoMc();
  });

  private readonly exibirExplicacaoMc = computed(() => {
    if (!this.questao().explicacao) return false;
    const modo = this.modo();
    if (modo === 'visualizar') return true;
    if (modo === 'estudo') {
      return this.respostaSelecionada() !== null && this.alternativaCorreta() !== null;
    }
    return false;
  });

  protected readonly naoRespondida = computed(() => {
    if (!this.gabaritioVisivel()) return false;
    if (this.ehDiscursiva()) return this.estadoRespostaAberta() !== 'enviada';
    return this.respostaSelecionada() === null;
  });

  protected readonly alternativasMap = computed(
    () => new Map(this.questao().alternativas.map((a) => [a.id, a])),
  );

  /** Letras das alternativas corretas, para o componente de explicação pintar o verde pelo gabarito. */
  protected readonly letrasCorretas = computed(() =>
    this.questao().alternativas.filter((a) => a.correta).map((a) => a.letra),
  );

  protected estadoAlternativa(altId: string): EstadoAlternativa {
    const selecionada = this.respostaSelecionada();
    const corretaId = this.alternativaCorreta();
    const gabarito = this.gabaritioVisivel();
    const modo = this.modo();

    if (modo === 'visualizar' || gabarito) {
      const alt = this.alternativasMap().get(altId);
      if (alt?.correta) return 'correta';
      if (altId === selecionada) return 'errada';
      return 'desabilitada';
    }

    if (modo === 'estudo' && corretaId !== null) {
      const alt = this.alternativasMap().get(altId);
      if (alt?.correta) return 'correta';
      if (altId === selecionada) return 'errada';
      return 'desabilitada';
    }

    if (altId === selecionada) return 'selecionada';
    return 'idle';
  }

  protected onImgLoad(): void {
    this.imgCarregada.set(true);
    this.imgErro.set(false);
  }

  protected onImgError(): void {
    this.imgErro.set(true);
    this.imgCarregada.set(false);
  }
}

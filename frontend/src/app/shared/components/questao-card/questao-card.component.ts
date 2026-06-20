import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { ModoProva } from '../../../core/models/tentativa';
import type { EstadoAlternativa } from '../alternativa-item/alternativa-item.component';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import { AlternativaItemComponent } from '../alternativa-item/alternativa-item.component';
import { QuestaoExplicacaoComponent } from '../questao-explicacao/questao-explicacao.component';

@Component({
  selector: 'app-questao-card',
  standalone: true,
  imports: [MarkdownComponent, AlternativaItemComponent, QuestaoExplicacaoComponent],
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

  responder = output<string>();

  protected readonly imgCarregada = signal(false);

  protected readonly exibirExplicacao = computed(() => {
    if (!this.questao().explicacao) return false;
    const modo = this.modo();
    if (modo === 'visualizar') return true;
    if (modo === 'estudo') {
      return this.respostaSelecionada() !== null && this.alternativaCorreta() !== null;
    }
    return false;
  });

  protected readonly naoRespondida = computed(
    () => this.gabaritioVisivel() && this.respostaSelecionada() === null,
  );

  protected readonly alternativasMap = computed(
    () => new Map(this.questao().alternativas.map((a) => [a.id, a])),
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
  }
}

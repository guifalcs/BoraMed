import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';
import type { QuestaoComAlternativas } from '../core/models/questao';
import { FormatarEnunciadoPipe } from '../shared/pipes/formatar-enunciado.pipe';

@Component({
  selector: 'app-questao-impressao',
  standalone: true,
  imports: [MarkdownComponent, FormatarEnunciadoPipe],
  templateUrl: './questao-impressao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoImpressaoComponent {
  questao = input.required<QuestaoComAlternativas>();
  numero = input.required<number>();
  marcacao = input(true);
  mostrarImagem = input(true);
  mostrarTema = input(true);
  comGabarito = input(false);

  imagemCarregada = output<void>();

  protected readonly disciplinaTag = computed(() => {
    const q = this.questao();
    const tema = q.temas?.[0]?.nome;
    return tema ?? q.disciplina ?? null;
  });

  protected readonly temImagem = computed(
    () => this.mostrarImagem() && !!this.questao().imagem_url,
  );

  protected readonly ehDiscursiva = computed(
    () => this.questao().formato === 'resposta_aberta_curta',
  );

  /** Linhas em branco para resposta manuscrita na impressão. */
  protected readonly linhasResposta = [1, 2, 3, 4, 5];

  protected ehCorreta(correta: boolean | null): boolean {
    return this.comGabarito() && correta === true;
  }

  protected onImgLoad(): void {
    this.imagemCarregada.emit();
  }
}

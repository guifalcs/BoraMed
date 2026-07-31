import { Pipe, PipeTransform } from '@angular/core';
import { formatarExplicacao } from '../utils/formatar-explicacao';

/**
 * Aplica {@link formatarExplicacao} para exibição: insere quebras de parágrafo
 * antes de rótulos de seção e do comentário de cada alternativa, deixando o
 * Markdown com espaçamento agradável sem alterar o conteúdo.
 */
@Pipe({
  name: 'formatarExplicacao',
  standalone: true,
  pure: true,
})
export class FormatarExplicacaoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatarExplicacao(value);
  }
}

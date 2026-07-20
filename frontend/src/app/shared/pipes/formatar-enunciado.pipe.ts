import { Pipe, PipeTransform } from '@angular/core';
import { formatarEnunciado } from '../utils/formatar-enunciado';

/**
 * Aplica {@link formatarEnunciado} para exibição: insere quebras de parágrafo
 * antes de itens de assertivas (I., II., …) e de blocos de asserção/razão,
 * deixando o Markdown com espaçamento agradável sem alterar o conteúdo.
 */
@Pipe({
  name: 'formatarEnunciado',
  standalone: true,
  pure: true,
})
export class FormatarEnunciadoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatarEnunciado(value);
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Aviso fixo de independência + natureza extraoficial. Aparece em toda página
 * de gabarito: o conteúdo cita provas da rede pelo nome (uso nominativo), então
 * o disclaimer é obrigatório (ver CLAUDE.md, "Referência à Afya").
 */
@Component({
  selector: 'app-gabaritos-aviso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
      <strong>Gabarito extraoficial.</strong> Elaborado pela equipe BoraMed logo após a prova, antes da
      divulgação oficial, e pode conter divergências. O gabarito que vale é sempre o oficial da sua instituição.
      O BoraMed é uma plataforma independente, sem vínculo com a Afya ou qualquer instituição de ensino.
    </p>
  `,
})
export class GabaritosAvisoComponent {}

import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Cada instância precisa do próprio id de gradiente: podem coexistir no mesmo DOM. */
let instancia = 0;

/**
 * Manto real que aparece atrás do avatar do 1º colocado.
 *
 * Desenhado para um avatar de 32px cujo centro cai em (22, 19) do viewBox — a borda
 * superior some atrás do círculo e só as pontas retas aparecem, saindo 4px de cada
 * lado. Fica em z-index abaixo do avatar.
 */
@Component({
  selector: 'app-ui-manto-rei',
  standalone: true,
  template: `
    <svg width="44" height="46" viewBox="0 0 44 46" fill="none" aria-hidden="true" class="block">
      <defs>
        <linearGradient [attr.id]="gradienteId" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stop-color="#e02424" />
          <stop offset="0.55" stop-color="#b91c1c" />
          <stop offset="1" stop-color="#7f1d1d" />
        </linearGradient>
      </defs>

      <!-- Capa: arestas retas dos ombros até a barra, com bico no centro -->
      <path
        d="M7 17 L2 42 L22 37 L42 42 L37 17 Z"
        [attr.fill]="preenchimento"
        stroke="#7f1d1d"
        stroke-width="1"
        stroke-linejoin="round"
      />

      <!-- Orla de arminho -->
      <g stroke="#fafafa" stroke-width="2.2" stroke-linecap="round" fill="none">
        <path d="M6.6 19 L3 37" />
        <path d="M37.4 19 L41 37" />
      </g>
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMantoReiComponent {
  protected readonly gradienteId = `manto-rei-${++instancia}`;
  protected readonly preenchimento = `url(#${this.gradienteId})`;
}

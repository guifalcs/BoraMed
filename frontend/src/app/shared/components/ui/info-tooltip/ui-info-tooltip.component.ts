import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Info } from 'lucide-angular';
import { UiIconComponent } from '../icon/ui-icon.component';

/**
 * Ícone de informação discreto com tooltip no hover/foco.
 *
 * Sem estado/JS: visibilidade por CSS (`group-hover` + `group-focus-within`),
 * então funciona com mouse e teclado. O gatilho é um `button` focável com
 * `aria-label`; o balão tem `role="tooltip"`. Posiciona abaixo do ícone e
 * limita a largura para não estourar em telas pequenas.
 */
@Component({
  selector: 'app-ui-info-tooltip',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <span class="group relative inline-flex align-middle">
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)]"
        [attr.aria-label]="ariaLabel()"
      >
        <app-ui-icon [icon]="infoIcon" [size]="size()" />
      </button>
      <span
        role="tooltip"
        class="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {{ text() }}
      </span>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiInfoTooltipComponent {
  /** Texto exibido no balão. */
  text = input.required<string>();
  /** Rótulo acessível do gatilho (o texto do balão não é lido por padrão). */
  ariaLabel = input<string>('Mais informações');
  /** Tamanho do ícone. */
  size = input<number>(14);

  protected readonly infoIcon = Info;
}

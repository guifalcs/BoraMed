import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, Sparkles } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

export type UpgradeCardVariante = 'inline' | 'compacto';

/**
 * Bloco de upsell com o gradiente institucional. `inline` é o card de página;
 * `compacto` cabe no rodapé da sidebar, onde fica sempre visível.
 */
@Component({
  selector: 'app-upgrade-card',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './upgrade-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeCardComponent {
  titulo = input('Desbloqueie o BoraMed inteiro');
  descricao = input<string | null>(
    'Simulados sem limite, materiais de estudo e flashcards.',
  );
  cta = input('Ver planos');
  variante = input<UpgradeCardVariante>('inline');
  /** Contexto propagado para /planos ajustar a copy da chegada. */
  origem = input<string | null>(null);

  protected readonly sparklesIcon = Sparkles;
  protected readonly arrowRightIcon = ArrowRight;

  protected readonly GRADIENTE =
    'linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)';
  protected readonly HIGHLIGHTS =
    'radial-gradient(circle at 82% 22%, rgba(255,255,255,0.18), transparent 26%), radial-gradient(circle at 20% 85%, rgba(13,148,136,0.22), transparent 28%)';
}

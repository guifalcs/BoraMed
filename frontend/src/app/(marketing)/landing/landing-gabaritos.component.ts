import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, Bell, Check, Target } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { GabaritoProvaService } from '../../core/services/gabarito-prova.service';
import { nomeGabarito } from '../../core/utils/gabarito-prova.util';
import type { GabaritoProvaResumo } from '../../core/models/gabarito-prova';

/**
 * Seção "Gabaritos extraoficiais" (#gabaritos) da landing: recurso gratuito,
 * mediante conta (as respostas exigem login). O visual é fixo (a landing é prerenderizada no build); os
 * gabaritos mais recentes entram só no browser, depois do primeiro render,
 * para nunca ficarem congelados no HTML do build.
 */
@Component({
  selector: 'app-landing-gabaritos',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './landing-gabaritos.component.html',
  styleUrls: ['./landing-shared.css', './landing-gabaritos.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingGabaritosComponent {
  private readonly service = inject(GabaritoProvaService);

  protected readonly recentes = signal<GabaritoProvaResumo[]>([]);
  protected readonly nome = nomeGabarito;

  /** Grade de exemplo: 0–4 = A–E; -1 = anulada. */
  protected readonly exemplo = [2, 0, 3, 1, 4, 0, 2, 3, -1, 1, 0, 4, 2, 1, 3] as const;
  protected readonly letras = ['A', 'B', 'C', 'D', 'E'] as const;

  protected readonly iconArrow = ArrowRight;
  protected readonly iconBell = Bell;
  protected readonly iconCheck = Check;
  protected readonly iconTarget = Target;

  constructor() {
    afterNextRender(() => {
      void this.service.listar().then((r) => {
        if (r.ok) this.recentes.set(r.data.slice(0, 3));
      });
    });
  }
}

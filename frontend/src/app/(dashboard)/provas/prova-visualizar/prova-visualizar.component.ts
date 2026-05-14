import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChevronLeft } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { ProvaVisualizarResolvedData } from '../../../core/resolvers/prova-visualizar.resolver';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-prova-visualizar',
  standalone: true,
  imports: [RouterLink, QuestaoCardComponent, UiIconComponent, EmptyStateComponent],
  templateUrl: './prova-visualizar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaVisualizarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);

  protected readonly chevronLeftIcon = ChevronLeft;

  protected readonly provaId = signal('');
  protected readonly tentativaId = signal('');
  protected readonly provaNome = signal('');
  protected readonly questoes = signal<QuestaoComAlternativas[]>([]);
  protected readonly respostasMap = signal<Map<string, string>>(new Map());
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly backRoute = computed(() =>
    this.tentativaId()
      ? ['/dashboard/simulados', this.provaId(), 'tentativa', this.tentativaId(), 'resultado']
      : ['/dashboard/simulados', this.provaId()],
  );

  constructor() {
    const resolved = this.route.snapshot.data['provaVisualizarData'] as ProvaVisualizarResolvedData | undefined;
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    this.provaId.set(id);

    if (resolved?.provaResult.ok) {
      this.provaNome.set(resolved.provaResult.data.nome);
    }

    if (resolved?.questoesResult.ok) {
      this.questoes.set(resolved.questoesResult.data);
    } else if (resolved && !resolved.questoesResult.ok) {
      this.erro.set(resolved.questoesResult.error);
    }

    this.isLoading.set(false);

    // Lê respostas anteriores do lastResultado (browser only — depende de history.state)
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const lastResultado = this.tentativaService.lastResultado();
      const navState = history.state as { fromResultado?: boolean } | null;

      if (lastResultado?.tentativa.prova_id === id && navState?.fromResultado) {
        this.tentativaId.set(lastResultado.tentativa.id);
        const map = new Map<string, string>();
        for (const r of lastResultado.respostas) {
          if (r.alternativa_id) {
            map.set(r.questao_id, r.alternativa_id);
          }
        }
        this.respostasMap.set(map);
      }
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChevronLeft } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
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
export class ProvaVisualizarComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);
  private readonly provaService = inject(ProvaService);

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
      ? ['/dashboard/provas', this.provaId(), 'tentativa', this.tentativaId(), 'resultado']
      : ['/dashboard/provas', this.provaId()],
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    this.provaId.set(id);

    const lastResultado = this.tentativaService.lastResultado();
    if (lastResultado?.tentativa.prova_id === id) {
      this.tentativaId.set(lastResultado.tentativa.id);
      const map = new Map<string, string>();
      for (const r of lastResultado.respostas) {
        if (r.alternativa_id) {
          map.set(r.questao_id, r.alternativa_id);
        }
      }
      this.respostasMap.set(map);
    }

    const [questoesResult, provaResult] = await Promise.all([
      this.tentativaService.prepararVisualizacao(id),
      this.provaService.buscarProva(id),
    ]);

    if (provaResult.ok) {
      this.provaNome.set(provaResult.data.nome);
    }

    if (questoesResult.ok) {
      this.questoes.set(questoesResult.data.questoes);
    } else {
      this.erro.set(questoesResult.error);
    }

    this.isLoading.set(false);
  }
}

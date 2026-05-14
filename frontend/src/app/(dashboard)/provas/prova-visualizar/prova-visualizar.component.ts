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
      ? ['/dashboard/simulados', this.provaId(), 'tentativa', this.tentativaId(), 'resultado']
      : ['/dashboard/simulados', this.provaId()],
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    this.provaId.set(id);

    // Show previous answers only if lastResultado exists for this prova
    // AND the navigation state indicates coming from resultado
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

    const provaResult = await this.provaService.buscarProva(id);

    if (provaResult.ok) {
      this.provaNome.set(provaResult.data.nome);

      // Simulados personalizados: questões não pertencem à prova
      const isPersonalizado = provaResult.data.tipo === 'processual' && provaResult.data.edicao < 0;
      const loadResult = isPersonalizado
        ? await this.tentativaService.prepararVisualizacaoPersonalizado(id)
        : await this.tentativaService.prepararVisualizacao(id);

      if (loadResult.ok) {
        this.questoes.set(loadResult.data.questoes);
      } else {
        this.erro.set(loadResult.error);
      }
    } else {
      this.erro.set('Não foi possível carregar a prova.');
    }

    this.isLoading.set(false);
  }
}

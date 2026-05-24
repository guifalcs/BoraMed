import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookOpen, PlayCircle, Shuffle } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-provas-home',
  standalone: true,
  imports: [RouterLink, UiIconComponent, PageHeaderComponent],
  templateUrl: './provas-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasHomeComponent {
  private readonly tentativaService = inject(TentativaService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados' },
  ];

  protected readonly bookOpenIcon = BookOpen;
  protected readonly shuffleIcon = Shuffle;
  protected readonly playCircleIcon = PlayCircle;

  protected readonly tentativaAtiva = this.tentativaService.tentativaAtiva;

  protected readonly rotaTentativaAtiva = computed(() => {
    const tentativa = this.tentativaAtiva();
    if (!tentativa || tentativa.status === 'finalizada' || tentativa.modo === 'visualizar') {
      return ['/dashboard/simulados'];
    }
    return ['/dashboard/simulados', tentativa.prova_id, 'tentativa', tentativa.id];
  });

  protected readonly resumoTentativaAtiva = computed(() => {
    const tentativa = this.tentativaAtiva();
    if (!tentativa || tentativa.status === 'finalizada' || tentativa.modo === 'visualizar') {
      return null;
    }

    const respondidas = tentativa.total_respondidas;
    const total = tentativa.total_questoes;
    const status = tentativa.status === 'pausada' ? 'pausado' : 'em andamento';
    return `${respondidas} de ${total} questões respondidas · ${status}`;
  });
}

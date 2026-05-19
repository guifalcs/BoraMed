import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Stethoscope, Zap, Building2, ChevronLeft } from 'lucide-angular';
import { EmBreveBannerComponent } from '../../../shared/components/em-breve-banner/em-breve-banner.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import type { LucideIconData } from 'lucide-angular';

interface ConteudoEmBreve {
  titulo: string;
  descricao: string;
  icone: LucideIconData | null;
}

@Component({
  selector: 'app-em-breve-page',
  standalone: true,
  imports: [EmBreveBannerComponent, UiIconComponent],
  templateUrl: './em-breve-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmBrevePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly chevronLeftIcon = ChevronLeft;

  protected readonly conteudo = computed<ConteudoEmBreve>(() => {
    const tipo = this.route.snapshot.queryParamMap.get('tipo');
    const modo = this.route.snapshot.queryParamMap.get('modo');

    if (tipo === 'processual') {
      return {
        titulo: 'Treinos Processuais',
        descricao: 'Estamos preparando questões autorais no modelo das avaliações processuais. Disponível em breve.',
        icone: Stethoscope,
      };
    }
    if (tipo === 'outras') {
      return {
        titulo: 'Outras Faculdades',
        descricao: 'Em breve você poderá treinar com modelos de outras instituições de ensino médico.',
        icone: Building2,
      };
    }
    if (modo === 'simulado-temas') {
      return {
        titulo: 'Simulado por Temas',
        descricao: 'Monte simulados personalizados filtrando questões pelos temas que você precisa revisar.',
        icone: Zap,
      };
    }
    return {
      titulo: 'Em breve',
      descricao: 'Esta funcionalidade estará disponível em breve.',
      icone: null,
    };
  });

  protected voltar(): void {
    this.location.back();
  }
}

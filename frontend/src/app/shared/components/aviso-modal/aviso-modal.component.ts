import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
} from '@angular/core';
import { X } from 'lucide-angular';
import { AvisoService } from '../../../core/services/aviso.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-aviso-modal',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './aviso-modal.component.html',
  styleUrl: './aviso-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvisoModalComponent {
  private readonly avisoService = inject(AvisoService);

  protected readonly aviso = this.avisoService.avisoAtual;
  protected readonly visivel = computed(() => this.avisoService.temAvisos());
  protected readonly iconX = X;

  protected async fechar(): Promise<void> {
    const atual = this.aviso();
    if (atual) {
      await this.avisoService.marcarVisto(atual.id);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    void this.fechar();
  }
}

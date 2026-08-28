import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ProfileService } from '../../../core/services/profile.service';
import { updateFaculdadeUnidadeSchema } from '../../../core/models/profile.schemas';
import { FACULDADE_UNIDADE_OPTIONS, type FaculdadeUnidade } from '../../../core/models/faculdade-unidade';
import { UiSelectComponent } from '../ui/select/ui-select.component';
import { UiButtonComponent } from '../ui/button/ui-button.component';

// Gate obrigatório: sem botão de fechar, sem Esc, sem clique no backdrop.
// Some sozinho quando o perfil (novo ou legado) ganha faculdade_unidade.
@Component({
  selector: 'app-faculdade-unidade-modal',
  standalone: true,
  imports: [UiSelectComponent, UiButtonComponent],
  templateUrl: './faculdade-unidade-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaculdadeUnidadeModalComponent {
  private readonly profileService = inject(ProfileService);
  private readonly elRef = inject(ElementRef<HTMLElement>);

  protected readonly faculdadeUnidadeOptions = FACULDADE_UNIDADE_OPTIONS;

  protected readonly visivel = this.profileService.precisaFaculdadeUnidade;

  constructor() {
    // Sem backdrop/Esc pra fechar: garante que o Tab também não escapa do
    // modal e cai na navegação do dashboard atrás dele.
    effect(() => {
      if (this.visivel()) {
        queueMicrotask(() => this.getFocusable()[0]?.focus());
      }
    });
  }

  private getFocusable(): HTMLElement[] {
    return Array.from(
      (this.elRef.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.visivel() || event.key !== 'Tab') return;

    const focusable = this.getFocusable();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const insideModal = !!active && this.elRef.nativeElement.contains(active);

    if (event.shiftKey ? active === first || !insideModal : active === last || !insideModal) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  protected readonly valor = signal<FaculdadeUnidade | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected handleValorChange(value: string | number | null): void {
    this.valor.set(typeof value === 'string' ? (value as FaculdadeUnidade) : null);
  }

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const parsed = updateFaculdadeUnidadeSchema.safeParse({ faculdade_unidade: this.valor() });
    if (!parsed.success) {
      this.erro.set(parsed.error.issues[0]?.message ?? 'Selecione sua unidade Afya');
      return;
    }

    this.erro.set(null);
    this.salvando.set(true);
    const result = await this.profileService.updateFaculdadeUnidade(parsed.data.faculdade_unidade);
    this.salvando.set(false);

    if (!result.ok) {
      this.erro.set(result.error);
    }
  }
}

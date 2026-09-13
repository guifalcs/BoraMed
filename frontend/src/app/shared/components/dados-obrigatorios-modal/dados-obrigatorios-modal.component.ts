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
import { updateFaculdadeUnidadeSchema, updatePeriodoSchema } from '../../../core/models/profile.schemas';
import { FACULDADE_UNIDADE_OPTIONS, type FaculdadeUnidade } from '../../../core/models/faculdade-unidade';
import { PERIODO_OPTIONS } from '../../../core/models/periodo';
import { UiSelectComponent } from '../ui/select/ui-select.component';
import { UiButtonComponent } from '../ui/button/ui-button.component';

// Gate obrigatório: sem botão de fechar, sem Esc, sem clique no backdrop.
// Cobra só o que falta no perfil (unidade Afya e/ou período) e some sozinho
// quando o perfil (novo ou legado) fica completo.
@Component({
  selector: 'app-dados-obrigatorios-modal',
  standalone: true,
  imports: [UiSelectComponent, UiButtonComponent],
  templateUrl: './dados-obrigatorios-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DadosObrigatoriosModalComponent {
  private readonly profileService = inject(ProfileService);
  private readonly elRef = inject(ElementRef<HTMLElement>);

  protected readonly faculdadeUnidadeOptions = FACULDADE_UNIDADE_OPTIONS;
  protected readonly periodoOptions = PERIODO_OPTIONS;

  protected readonly visivel = this.profileService.precisaDadosObrigatorios;
  protected readonly pedeFaculdadeUnidade = this.profileService.faltaFaculdadeUnidade;
  protected readonly pedePeriodo = this.profileService.faltaPeriodo;

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

  protected readonly faculdadeUnidade = signal<FaculdadeUnidade | null>(null);
  protected readonly periodo = signal<number | null>(null);
  protected readonly erroFaculdadeUnidade = signal<string | null>(null);
  protected readonly erroPeriodo = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected handleFaculdadeUnidadeChange(value: string | number | null): void {
    this.faculdadeUnidade.set(typeof value === 'string' ? (value as FaculdadeUnidade) : null);
  }

  protected handlePeriodoChange(value: string | number | null): void {
    this.periodo.set(typeof value === 'number' ? value : null);
  }

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    this.erroFaculdadeUnidade.set(null);
    this.erroPeriodo.set(null);

    const payload: { faculdade_unidade?: FaculdadeUnidade; periodo?: number } = {};

    if (this.pedeFaculdadeUnidade()) {
      const parsed = updateFaculdadeUnidadeSchema.safeParse({ faculdade_unidade: this.faculdadeUnidade() });
      if (!parsed.success) {
        this.erroFaculdadeUnidade.set(parsed.error.issues[0]?.message ?? 'Selecione sua unidade Afya');
      } else {
        payload.faculdade_unidade = parsed.data.faculdade_unidade;
      }
    }

    if (this.pedePeriodo()) {
      const parsed = updatePeriodoSchema.safeParse({ periodo: this.periodo() });
      if (!parsed.success) {
        this.erroPeriodo.set(parsed.error.issues[0]?.message ?? 'Selecione seu período');
      } else {
        payload.periodo = parsed.data.periodo;
      }
    }

    if (this.erroFaculdadeUnidade() || this.erroPeriodo()) return;

    this.salvando.set(true);
    const result = await this.profileService.updateDadosObrigatorios(payload);
    this.salvando.set(false);

    if (!result.ok) {
      // Erro de rede/servidor: sem campo específico, mostra no primeiro campo
      // visível para não perder a mensagem.
      if (this.pedeFaculdadeUnidade()) this.erroFaculdadeUnidade.set(result.error);
      else this.erroPeriodo.set(result.error);
    }
  }
}

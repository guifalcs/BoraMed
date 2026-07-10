import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export type PeriodoPreset = '7d' | '30d' | '90d' | 'custom';

export interface PeriodoSelecionado {
  preset: PeriodoPreset;
  /** ISO timestamps (inclusive) já resolvidos, prontos para enviar ao backend. */
  desde: string;
  ate: string;
}

const PRESET_DIAS: Record<Exclude<PeriodoPreset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * Seletor de período para telas de métricas do admin: presets (7/30/90 dias)
 * ou intervalo custom com validação. Emite o intervalo resolvido em ISO.
 */
@Component({
  selector: 'app-periodo-filter',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './periodo-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodoFilterComponent {
  presetInicial = input<PeriodoPreset>('30d');

  periodoChange = output<PeriodoSelecionado>();

  protected readonly preset = signal<PeriodoPreset | null>(null);
  protected readonly customDesde = signal('');
  protected readonly customAte = signal('');

  protected readonly presetAtivo = computed(() => this.preset() ?? this.presetInicial());

  protected readonly presets: { value: PeriodoPreset; label: string }[] = [
    { value: '7d', label: '7 dias' },
    { value: '30d', label: '30 dias' },
    { value: '90d', label: '90 dias' },
    { value: 'custom', label: 'Personalizado' },
  ];

  protected readonly erroCustom = computed(() => {
    if (this.presetAtivo() !== 'custom') return null;
    const desde = this.customDesde();
    const ate = this.customAte();
    if (!desde || !ate) return null;
    if (new Date(desde) > new Date(ate)) {
      return 'A data final deve ser posterior à inicial.';
    }
    return null;
  });

  protected readonly customValido = computed(
    () =>
      this.presetAtivo() === 'custom' &&
      !!this.customDesde() &&
      !!this.customAte() &&
      !this.erroCustom(),
  );

  protected selecionarPreset(preset: PeriodoPreset): void {
    this.preset.set(preset);
    if (preset !== 'custom') {
      this.periodoChange.emit(this.resolverPreset(preset));
    }
  }

  protected aplicarCustom(): void {
    if (!this.customValido()) return;
    // Intervalo inclusivo: início do dia inicial até o fim do dia final (hora local).
    const desde = new Date(`${this.customDesde()}T00:00:00`);
    const ate = new Date(`${this.customAte()}T23:59:59.999`);
    this.periodoChange.emit({
      preset: 'custom',
      desde: desde.toISOString(),
      ate: ate.toISOString(),
    });
  }

  /** Resolve um preset para o intervalo ISO correspondente (últimos N dias). */
  resolverPreset(preset: Exclude<PeriodoPreset, 'custom'>): PeriodoSelecionado {
    const ate = new Date();
    const desde = new Date(ate.getTime() - PRESET_DIAS[preset] * 24 * 60 * 60 * 1000);
    return { preset, desde: desde.toISOString(), ate: ate.toISOString() };
  }
}

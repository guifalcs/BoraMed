import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ModoProva } from '../../../core/models/tentativa';

interface ModoOpcao {
  value: ModoProva;
  label: string;
  descricao: string;
}

@Component({
  selector: 'app-modo-selector',
  standalone: true,
  templateUrl: './modo-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModoSelectorComponent {
  modo = input.required<ModoProva>();

  modoChange = output<ModoProva>();

  protected readonly opcoes: ModoOpcao[] = [
    {
      value: 'simulado',
      label: 'Simulado',
      descricao: 'Cronometrado. Gabarito somente no fim.',
    },
    {
      value: 'estudo',
      label: 'Estudo',
      descricao: 'Questão por questão. Gabarito imediato após cada resposta.',
    },
    {
      value: 'visualizar',
      label: 'Visualizar',
      descricao: 'Scroll livre com gabarito visível.',
    },
  ];

  protected readonly btnClass = computed(() => (opcao: ModoOpcao) => {
    const ativo = this.modo() === opcao.value;
    return ativo
      ? 'border-[var(--color-primary)] bg-blue-50 ring-2 ring-[var(--color-primary)] ring-offset-1'
      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-primary-light)]';
  });

  protected selecionar(modo: ModoProva): void {
    this.modoChange.emit(modo);
  }
}

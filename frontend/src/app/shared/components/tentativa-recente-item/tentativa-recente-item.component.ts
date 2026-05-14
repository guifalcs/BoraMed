import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ModoProva } from '../../../core/models/tentativa';

@Component({
  selector: 'app-tentativa-recente-item',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tentativa-recente-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaRecenteItemComponent {
  nomeProva = input.required<string>();
  dataIso = input.required<string>();
  nota = input<number | null>(null);
  tentativaId = input.required<string>();
  provaId = input.required<string>();
  modo = input<ModoProva | null>(null);

  protected readonly dataRelativa = computed(() => {
    const d = new Date(this.dataIso());
    const diffDias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDias === 0) return 'hoje';
    if (diffDias === 1) return 'ontem';
    if (diffDias < 7) return `há ${diffDias} dias`;
    const semanas = Math.floor(diffDias / 7);
    if (diffDias < 30) return `há ${semanas} semana${semanas > 1 ? 's' : ''}`;
    const meses = Math.floor(diffDias / 30);
    return `há ${meses} mês${meses > 1 ? 'es' : ''}`;
  });

  protected readonly notaBadgeClass = computed(() => {
    const n = this.nota();
    if (n === null) return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
    if (n >= 70) return 'bg-emerald-50 text-emerald-700';
    if (n >= 50) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  });

  protected readonly notaLabel = computed(() => {
    const n = this.nota();
    return n === null ? 'Em andamento' : `${n}%`;
  });

  protected readonly modoBadgeClass = computed(() => {
    switch (this.modo()) {
      case 'estudo':   return 'bg-purple-50 text-purple-700';
      case 'simulado': return 'bg-blue-50 text-blue-700';
      default:         return '';
    }
  });

  protected readonly modoLabel = computed(() => {
    switch (this.modo()) {
      case 'estudo':   return 'Estudo';
      case 'simulado': return 'Simulado';
      default:         return null;
    }
  });
}

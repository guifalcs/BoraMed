import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FACULDADE_UNIDADE_LABELS, type FaculdadeUnidade } from '../../../core/models/faculdade-unidade';

@Component({
  selector: 'app-greeting-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './greeting-hero.component.html',
  styleUrl: './greeting-hero.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GreetingHeroComponent {
  nomeCompleto = input<string | null>(null);
  periodo = input<number | null>(null);
  faculdadeUnidade = input<string | null>(null);
  temTentativaAtiva = input(false);
  rotaCta = input<string[]>(['/dashboard/simulados']);

  protected readonly saudacao = computed(() => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  });

  protected readonly primeiroNome = computed(() => {
    const nome = this.nomeCompleto();
    if (!nome?.trim()) return 'Estudante';
    return nome.trim().split(' ')[0];
  });

  protected readonly labelCta = computed(() =>
    this.temTentativaAtiva() ? 'Continuar simulado' : 'Novo simulado',
  );

  protected readonly contexto = computed(() => {
    const p = this.periodo();
    const f = this.faculdadeUnidade();
    const facLabel = f ? (FACULDADE_UNIDADE_LABELS[f as FaculdadeUnidade] ?? null) : null;
    if (p && facLabel) return `${p}º período · ${facLabel}`;
    if (p) return `${p}º período`;
    if (facLabel) return facLabel;
    return null;
  });
}

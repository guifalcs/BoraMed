import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertTriangle, Sparkles, Zap } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

type Tom = 'neutro' | 'atencao' | 'critico';

/**
 * Contador persistente das tentativas do plano gratuito. O tom escala conforme
 * o saldo cai, para o limite virar visível antes de ser atingido: o upgrade
 * converte no momento da limitação, não quando ela já bloqueou o aluno.
 */
@Component({
  selector: 'app-limite-tentativas-banner',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './limite-tentativas-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimiteTentativasBannerComponent {
  restantes = input.required<number>();
  limite = input(3);
  /** Some com o CTA quando o banner já vive dentro de um bloco de upsell. */
  comCta = input(true);

  protected readonly sparklesIcon = Sparkles;
  protected readonly zapIcon = Zap;
  protected readonly alertIcon = AlertTriangle;

  protected readonly usadas = computed(() =>
    Math.min(this.limite(), Math.max(0, this.limite() - this.restantes())),
  );

  protected readonly percentual = computed(() => {
    const limite = this.limite();
    if (limite <= 0) return 100;
    return Math.round((this.usadas() / limite) * 100);
  });

  protected readonly tom = computed<Tom>(() => {
    const restantes = this.restantes();
    if (restantes <= 0) return 'critico';
    if (restantes === 1) return 'atencao';
    return 'neutro';
  });

  protected readonly icone = computed(() => {
    switch (this.tom()) {
      case 'critico':
        return this.alertIcon;
      case 'atencao':
        return this.zapIcon;
      default:
        return this.sparklesIcon;
    }
  });

  protected readonly titulo = computed(() => {
    const restantes = this.restantes();
    if (restantes <= 0) return 'Seus simulados grátis acabaram';
    if (restantes === 1) return 'Resta 1 simulado grátis';
    return `Restam ${restantes} de ${this.limite()} simulados grátis`;
  });

  protected readonly descricao = computed(() => {
    const restantes = this.restantes();
    if (restantes <= 0) {
      return 'Seu histórico continua salvo. Assine para retomar de onde parou.';
    }
    if (restantes === 1) {
      return 'Depois dele, o acesso aos treinos fica só para assinantes.';
    }
    return 'No plano gratuito você faz até ' + this.limite() + ' treinos nacionais.';
  });

  protected readonly cta = computed(() =>
    this.restantes() <= 0 ? 'Assinar agora' : 'Ver planos',
  );

  protected readonly classes = computed(() => {
    const base =
      'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 sm:flex-nowrap';
    switch (this.tom()) {
      case 'critico':
        return `${base} border-red-200 bg-red-50 text-red-900`;
      case 'atencao':
        return `${base} border-amber-200 bg-amber-50 text-amber-900`;
      default:
        return `${base} border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]`;
    }
  });

  protected readonly classesIcone = computed(() => {
    const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg';
    switch (this.tom()) {
      case 'critico':
        return `${base} bg-white text-red-600`;
      case 'atencao':
        return `${base} bg-white text-amber-600`;
      default:
        return `${base} bg-[var(--color-surface-2)] text-[var(--color-action)]`;
    }
  });

  protected readonly classesBarra = computed(() => {
    switch (this.tom()) {
      case 'critico':
        return 'h-full rounded-full bg-red-500 transition-all';
      case 'atencao':
        return 'h-full rounded-full bg-amber-500 transition-all';
      default:
        return 'h-full rounded-full bg-[var(--color-action)] transition-all';
    }
  });

  protected readonly classesCta = computed(() => {
    const base =
      'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors';
    switch (this.tom()) {
      case 'critico':
        return `${base} bg-red-600 text-white hover:bg-red-700`;
      case 'atencao':
        return `${base} bg-amber-600 text-white hover:bg-amber-700`;
      default:
        return `${base} bg-[var(--color-action)] text-white hover:brightness-110`;
    }
  });

  protected readonly descricaoAcessivel = computed(
    () => `${this.usadas()} de ${this.limite()} simulados gratuitos usados`,
  );
}

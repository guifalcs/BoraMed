import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PodioMetal = 'ouro' | 'prata' | 'bronze';

interface PaletaMetal {
  claro: string;
  medio: string;
  escuro: string;
  borda: string;
  rotulo: string;
}

const PALETA: Record<PodioMetal, PaletaMetal> = {
  ouro: {
    claro: '#fef3c7',
    medio: '#fbbf24',
    escuro: '#d97706',
    borda: '#92400e',
    rotulo: '1º lugar',
  },
  prata: {
    claro: '#f8fafc',
    medio: '#cbd5e1',
    escuro: '#94a3b8',
    borda: '#64748b',
    rotulo: '2º lugar',
  },
  bronze: {
    claro: '#f5d0b0',
    medio: '#c2803f',
    escuro: '#8f5423',
    borda: '#6b3b14',
    rotulo: '3º lugar',
  },
};

/** Cada instância precisa do próprio id de gradiente: várias coroas convivem no mesmo DOM. */
let instancia = 0;

@Component({
  selector: 'app-ui-coroa-podio',
  standalone: true,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      [attr.aria-label]="paleta().rotulo"
      class="block drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
    >
      <defs>
        <linearGradient
          [attr.id]="gradienteId"
          x1="12"
          y1="2"
          x2="12"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" [attr.stop-color]="paleta().claro" />
          <stop offset="0.55" [attr.stop-color]="paleta().medio" />
          <stop offset="1" [attr.stop-color]="paleta().escuro" />
        </linearGradient>
      </defs>

      <!-- Corpo: três pontas com vales entre elas -->
      <path
        d="M2.9 6.4 L7.6 11.9 L12 3.3 L16.4 11.9 L21.1 6.4 L19.7 17.1 H4.3 Z"
        [attr.fill]="preenchimento()"
        [attr.stroke]="paleta().borda"
        stroke-width="1.1"
        stroke-linejoin="round"
      />

      <!-- Aro da base -->
      <rect
        x="4"
        y="17.5"
        width="16"
        height="3.2"
        rx="1.1"
        [attr.fill]="preenchimento()"
        [attr.stroke]="paleta().borda"
        stroke-width="1.1"
      />

      <!-- Gemas nas pontas -->
      <circle
        cx="12"
        cy="3.3"
        r="1.7"
        [attr.fill]="paleta().claro"
        [attr.stroke]="paleta().borda"
        stroke-width="0.9"
      />
      <circle
        cx="2.9"
        cy="6.4"
        r="1.5"
        [attr.fill]="paleta().claro"
        [attr.stroke]="paleta().borda"
        stroke-width="0.9"
      />
      <circle
        cx="21.1"
        cy="6.4"
        r="1.5"
        [attr.fill]="paleta().claro"
        [attr.stroke]="paleta().borda"
        stroke-width="0.9"
      />
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCoroaPodioComponent {
  /** 1, 2 ou 3 — qualquer outro valor cai em bronze. */
  readonly posicao = input.required<number>();
  readonly size = input<number>(18);

  protected readonly gradienteId = `coroa-podio-${++instancia}`;

  protected readonly paleta = computed<PaletaMetal>(() => {
    switch (this.posicao()) {
      case 1:
        return PALETA.ouro;
      case 2:
        return PALETA.prata;
      default:
        return PALETA.bronze;
    }
  });

  protected readonly preenchimento = computed(() => `url(#${this.gradienteId})`);
}

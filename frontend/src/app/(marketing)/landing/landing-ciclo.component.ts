import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { ChevronDown, NotebookPen, Play, TrendingUp } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

type EtapaId = 'treinar' | 'revisar' | 'acompanhar';

interface Etapa {
  readonly id: EtapaId;
  readonly titulo: string;
  readonly resumo: string;
}

/**
 * "Como funciona" (#como-funciona): as três etapas do ciclo de estudo em
 * abas verticais, cada uma com uma tela montada do app (configurar treino,
 * resultado + Caderno de Erros, evolução). As telas usam rótulos reais do
 * produto (modos Simulado/Estudo, Caderno de Erros, sequência, ranking).
 */
@Component({
  selector: 'app-landing-ciclo',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './landing-ciclo.component.html',
  styleUrls: ['./landing-shared.css', './landing-ciclo.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingCicloComponent {
  protected readonly chevronIcon = ChevronDown;
  protected readonly playIcon = Play;
  protected readonly cadernoIcon = NotebookPen;
  protected readonly trendIcon = TrendingUp;

  protected readonly etapas: readonly Etapa[] = [
    {
      id: 'treinar',
      titulo: 'Treinar',
      resumo:
        'Simulado cronometrado, como no dia da prova, ou modo estudo, com gabarito a cada questão. Parou no meio? Retome de onde estava.',
    },
    {
      id: 'revisar',
      titulo: 'Revisar',
      resumo:
        'Nota e temas críticos na hora. Cada erro vai para o Caderno de Erros, e as discursivas voltam corrigidas pela Aurora.',
    },
    {
      id: 'acompanhar',
      titulo: 'Acompanhar',
      resumo:
        'Histórico de cada tentativa, evolução da nota e sua sequência de estudo, com ranking entre estudantes.',
    },
  ];

  protected readonly ativa = signal<EtapaId>('treinar');
  protected readonly etapaAtiva = computed(
    () => this.etapas.find((etapa) => etapa.id === this.ativa()) ?? this.etapas[0],
  );

  // Revisar: temas do pior para o melhor aproveitamento.
  protected readonly temasRevisao = [
    { nome: 'Anatomia', pct: 43 },
    { nome: 'Cardiovascular', pct: 58 },
    { nome: 'Farmacologia', pct: 71 },
  ] as const;

  // Acompanhar: nota (%) das últimas tentativas e os últimos 14 dias de estudo.
  protected readonly notas = [52, 58, 55, 63, 61, 68, 72, 78] as const;
  protected readonly diasEstudados = [
    true, true, false, true, true, true, false,
    true, true, true, true, true, true, true,
  ] as const;

  // Linha do gráfico de evolução num viewBox de 320×120 (y invertido: nota
  // maior fica mais alta). Faixa vertical de 40% a 90%.
  protected readonly linhaEvolucao = this.notas
    .map((nota, i) => {
      const x = (i / (this.notas.length - 1)) * 300 + 10;
      const y = 110 - ((nota - 40) / 50) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  protected readonly areaEvolucao = `10,110 ${this.linhaEvolucao} 310,110`;

  protected readonly ultimaNota = this.notas[this.notas.length - 1];
  protected readonly ganhoTotal = this.ultimaNota - this.notas[0];

  /** Dias seguidos estudados, contando de hoje para trás. */
  protected readonly sequenciaAtual = (() => {
    let dias = 0;
    for (let i = this.diasEstudados.length - 1; i >= 0 && this.diasEstudados[i]; i--) dias++;
    return dias;
  })();

  protected readonly ultimoPonto = {
    x: 310,
    y: 110 - ((this.notas[this.notas.length - 1] - 40) / 50) * 100,
  };

  protected selecionar(id: EtapaId): void {
    this.ativa.set(id);
  }

  /** Setas, Home e End entre as abas (padrão WAI-ARIA de tabs). */
  protected onKeydown(event: KeyboardEvent, index: number): void {
    const total = this.etapas.length;
    let proximo: number;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        proximo = (index + 1) % total;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        proximo = (index - 1 + total) % total;
        break;
      case 'Home':
        proximo = 0;
        break;
      case 'End':
        proximo = total - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.ativa.set(this.etapas[proximo].id);
    const abas = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    );
    abas?.[proximo]?.focus();
  }
}

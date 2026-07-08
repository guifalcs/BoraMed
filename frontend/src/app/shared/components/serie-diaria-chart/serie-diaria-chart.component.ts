import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';

export interface PontoSerieDiaria {
  /** Data ISO 'YYYY-MM-DD'. */
  dia: string;
  valor: number;
}

/**
 * Gráfico de barras genérico para séries diárias (tentativas/dia, XP/dia…).
 * Recebe a série já agregada por dia e o rótulo da métrica.
 */
@Component({
  selector: 'app-serie-diaria-chart',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './serie-diaria-chart.component.html',
  providers: [provideCharts(withDefaultRegisterables())],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerieDiariaChartComponent {
  pontos = input.required<PontoSerieDiaria[]>();
  label = input.required<string>();
  cor = input('#6366f1');
  mensagemVazia = input('Sem dados no período selecionado.');

  protected readonly temDados = computed(() =>
    this.pontos().some((p) => p.valor > 0),
  );

  protected readonly chartData = computed<ChartData<'bar'>>(() => {
    const sorted = [...this.pontos()].sort((a, b) => a.dia.localeCompare(b.dia));

    const labels = sorted.map((p) => {
      const [, mes, dia] = p.dia.split('-');
      return `${dia}/${mes}`;
    });

    return {
      labels,
      datasets: [
        {
          data: sorted.map((p) => p.valor),
          label: this.label(),
          backgroundColor: `${this.cor()}cc`,
          hoverBackgroundColor: this.cor(),
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: '#9ca3af',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(0,0,0,0.06)',
        },
        border: { display: false },
      },
      x: {
        ticks: {
          color: '#9ca3af',
          font: { size: 11 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 14,
        },
        grid: { display: false },
        border: { display: false },
      },
    },
  };
}

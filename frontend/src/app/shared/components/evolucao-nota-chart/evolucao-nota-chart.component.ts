import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';

export interface PontoEvolucao {
  data: string;
  nota: number;
}

@Component({
  selector: 'app-evolucao-nota-chart',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './evolucao-nota-chart.component.html',
  providers: [provideCharts(withDefaultRegisterables())],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvolucaoNotaChartComponent {
  pontos = input.required<PontoEvolucao[]>();

  protected readonly temDados = computed(() => this.pontos().length > 0);

  protected readonly chartData = computed<ChartData<'line'>>(() => {
    const sorted = [...this.pontos()].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
    );

    const labels = sorted.map((p) => {
      const d = new Date(p.data);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const cores = sorted.map((p) =>
      p.nota >= 70 ? '#10b981' : p.nota >= 50 ? '#f59e0b' : '#ef4444',
    );

    return {
      labels,
      datasets: [
        {
          data: sorted.map((p) => p.nota),
          label: 'Nota',
          fill: true,
          tension: 0.35,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          pointBackgroundColor: cores,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartOptions<'line'> = {
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
        callbacks: {
          label: (ctx) => `Nota: ${ctx.parsed.y}%`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 25,
          callback: (v) => `${v}%`,
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
        },
        grid: { display: false },
        border: { display: false },
      },
    },
  };
}

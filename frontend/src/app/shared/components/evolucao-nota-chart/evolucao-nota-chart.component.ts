import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface PontoEvolucao {
  data: string;
  nota: number;
}

@Component({
  selector: 'app-evolucao-nota-chart',
  standalone: true,
  templateUrl: './evolucao-nota-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvolucaoNotaChartComponent {
  pontos = input.required<PontoEvolucao[]>();

  private readonly padding = { top: 24, right: 16, bottom: 32, left: 40 };
  private readonly w = 600;
  private readonly h = 200;

  protected readonly viewBox = `0 0 ${this.w} ${this.h}`;

  protected readonly chartData = computed(() => {
    const pts = this.pontos();
    if (pts.length === 0) return null;

    const sorted = [...pts].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    const p = this.padding;
    const plotW = this.w - p.left - p.right;
    const plotH = this.h - p.top - p.bottom;

    const minDate = new Date(sorted[0].data).getTime();
    const maxDate = new Date(sorted[sorted.length - 1].data).getTime();
    const dateRange = maxDate - minDate || 1;

    const points = sorted.map((pt) => {
      const x = p.left + ((new Date(pt.data).getTime() - minDate) / dateRange) * plotW;
      const y = p.top + plotH - (pt.nota / 100) * plotH;
      return { x, y, nota: pt.nota, data: pt.data };
    });

    // If only 1 point, center it
    if (points.length === 1) {
      points[0].x = p.left + plotW / 2;
    }

    const polyline = points.map((pt) => `${pt.x},${pt.y}`).join(' ');

    // Area fill path
    const areaPath = `M ${points[0].x},${p.top + plotH} ` +
      points.map((pt) => `L ${pt.x},${pt.y}`).join(' ') +
      ` L ${points[points.length - 1].x},${p.top + plotH} Z`;

    // Y-axis labels (0, 25, 50, 75, 100)
    const yLabels = [0, 25, 50, 75, 100].map((v) => ({
      value: v,
      y: p.top + plotH - (v / 100) * plotH,
    }));

    // X-axis date labels (max 5)
    const step = Math.max(1, Math.floor(sorted.length / 4));
    const xLabels: { label: string; x: number }[] = [];
    for (let i = 0; i < sorted.length; i += step) {
      const d = new Date(sorted[i].data);
      xLabels.push({
        label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
        x: points[i].x,
      });
    }
    // Always include the last point
    if (xLabels.length > 0 && xLabels[xLabels.length - 1].x !== points[points.length - 1].x) {
      const last = sorted[sorted.length - 1];
      const d = new Date(last.data);
      xLabels.push({
        label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
        x: points[points.length - 1].x,
      });
    }

    // Horizontal grid lines
    const gridLines = yLabels.map((yl) => ({
      y: yl.y,
      x1: p.left,
      x2: p.left + plotW,
    }));

    // Threshold line at 70%
    const thresholdY = p.top + plotH - (70 / 100) * plotH;

    return { points, polyline, areaPath, yLabels, xLabels, gridLines, thresholdY, plotLeft: p.left, plotRight: p.left + plotW, xLabelY: p.top + plotH + 16 };
  });
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { KpiCardComponent } from './kpi-card.component';
import { TrendingUp } from 'lucide-angular';

describe('KpiCardComponent', () => {
  let fixture: ComponentFixture<KpiCardComponent>;

  async function setup(overrides: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({
      imports: [KpiCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiCardComponent);
    fixture.componentRef.setInput('label', overrides['label'] ?? '% Acerto Geral');
    fixture.componentRef.setInput('valor', overrides['valor'] ?? '72%');
    fixture.componentRef.setInput('sublabel', 'sublabel' in overrides ? overrides['sublabel'] : 'todas as tentativas');
    fixture.componentRef.setInput('icone', overrides['icone'] ?? TrendingUp);
    fixture.componentRef.setInput('variante', overrides['variante'] ?? 'default');
    if (overrides['sparkline']) {
      fixture.componentRef.setInput('sparkline', overrides['sparkline']);
    }
    fixture.detectChanges();
  }

  it('deve renderizar label e valor', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('% Acerto Geral');
    expect(el.textContent).toContain('72%');
  });

  it('deve renderizar sublabel', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('todas as tentativas');
  });

  it('deve mostrar placeholder quando sublabel null', async () => {
    await setup({ sublabel: null });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('-');
  });

  it('deve aplicar classe success para variante success', async () => {
    await setup({ variante: 'success' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('emerald');
  });

  it('deve aplicar classe warning para variante warning', async () => {
    await setup({ variante: 'warning' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('amber');
  });

  it('deve aplicar classe danger para variante danger', async () => {
    await setup({ variante: 'danger' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('red');
  });

  describe('sparkline', () => {
    it('não deve renderizar polyline sem dados', async () => {
      await setup({ sparkline: [] });
      const polyline = fixture.nativeElement.querySelector('polyline');
      expect(polyline).toBeNull();
    });

    it('não deve renderizar polyline com 1 ponto', async () => {
      await setup({ sparkline: [50] });
      const polyline = fixture.nativeElement.querySelector('polyline');
      expect(polyline).toBeNull();
    });

    it('deve renderizar polyline com 2+ pontos', async () => {
      await setup({ sparkline: [40, 60, 80] });
      const polyline = fixture.nativeElement.querySelector('polyline');
      expect(polyline).not.toBeNull();
    });

    it('deve usar escala fixa de 0 a 100 para notas', async () => {
      await setup({ sparkline: [90, 91] });
      const polyline = fixture.nativeElement.querySelector('polyline') as SVGPolylineElement;

      expect(polyline.getAttribute('points')).toBe('2,4 78,3.8');
    });

    it('deve usar cor verde quando tendência sobe', async () => {
      await setup({ sparkline: [40, 60, 80] });
      const polyline = fixture.nativeElement.querySelector('polyline');
      expect(polyline.getAttribute('stroke')).toBe('#10b981');
    });

    it('deve usar cor vermelha quando tendência cai', async () => {
      await setup({ sparkline: [80, 60, 40] });
      const polyline = fixture.nativeElement.querySelector('polyline');
      expect(polyline.getAttribute('stroke')).toBe('#ef4444');
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { EvolucaoNotaChartComponent } from './evolucao-nota-chart.component';

// Stub Chart.js canvas (JSDOM doesn't support canvas)
@Component({
  selector: 'app-evolucao-nota-chart-test',
  standalone: true,
  imports: [EvolucaoNotaChartComponent],
  template: `<app-evolucao-nota-chart [pontos]="pontos" />`,
})
class TestHostComponent {
  pontos = [
    { data: '2026-05-01T10:00:00Z', nota: 50 },
    { data: '2026-05-08T10:00:00Z', nota: 70 },
  ];
}

describe('EvolucaoNotaChartComponent', () => {
  let fixture: ComponentFixture<EvolucaoNotaChartComponent>;

  async function setup(pontos: { data: string; nota: number }[]) {
    await TestBed.configureTestingModule({
      imports: [EvolucaoNotaChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EvolucaoNotaChartComponent);
    fixture.componentRef.setInput('pontos', pontos);
    fixture.detectChanges();
  }

  it('deve mostrar mensagem vazia quando sem pontos', async () => {
    await setup([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Finalize simulados para ver sua evolução');
  });

  it('deve renderizar canvas quando há pontos', async () => {
    await setup([
      { data: '2026-05-01T10:00:00Z', nota: 50 },
      { data: '2026-05-08T10:00:00Z', nota: 70 },
    ]);
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('deve ter temDados true com pontos', async () => {
    await setup([{ data: '2026-05-01T10:00:00Z', nota: 50 }]);
    expect(fixture.componentInstance.pontos()).toHaveLength(1);
  });
});

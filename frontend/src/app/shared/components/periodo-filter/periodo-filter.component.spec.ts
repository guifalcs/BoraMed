import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PeriodoFilterComponent, PeriodoSelecionado } from './periodo-filter.component';

describe('PeriodoFilterComponent', () => {
  let fixture: ComponentFixture<PeriodoFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodoFilterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PeriodoFilterComponent);
    fixture.detectChanges();
  });

  function botoes(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.periodo-btn'));
  }

  it('deve renderizar os presets 7/30/90 dias e personalizado', () => {
    const labels = botoes().map((b) => b.textContent?.trim());
    expect(labels).toEqual(['7 dias', '30 dias', '90 dias', 'Personalizado']);
  });

  it('deve iniciar com o preset de 30 dias ativo', () => {
    const ativo = fixture.nativeElement.querySelector('.periodo-btn--ativo');
    expect(ativo?.textContent?.trim()).toBe('30 dias');
  });

  it('deve emitir intervalo de 7 dias ao clicar no preset', () => {
    let emitido: PeriodoSelecionado | undefined;
    fixture.componentInstance.periodoChange.subscribe((p) => (emitido = p));

    botoes()[0].click();
    fixture.detectChanges();

    expect(emitido).toBeDefined();
    expect(emitido!.preset).toBe('7d');
    const diffDias =
      (new Date(emitido!.ate).getTime() - new Date(emitido!.desde).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(diffDias).toBeCloseTo(7, 1);
  });

  it('não deve emitir ao selecionar personalizado sem datas', () => {
    let emitiu = false;
    fixture.componentInstance.periodoChange.subscribe(() => (emitiu = true));

    botoes()[3].click();
    fixture.detectChanges();

    expect(emitiu).toBe(false);
    expect(fixture.nativeElement.querySelector('.periodo-custom')).not.toBeNull();
  });

  it('deve mostrar erro quando a data final é anterior à inicial', async () => {
    botoes()[3].click();
    fixture.detectChanges();

    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.periodo-custom-input'),
    );
    inputs[0].value = '2026-07-10';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '2026-07-01';
    inputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.periodo-erro')?.textContent).toContain(
      'A data final deve ser posterior à inicial',
    );
    const aplicar: HTMLButtonElement = fixture.nativeElement.querySelector('.periodo-aplicar');
    expect(aplicar.disabled).toBe(true);
  });

  it('deve emitir intervalo custom válido ao aplicar', async () => {
    let emitido: PeriodoSelecionado | undefined;
    fixture.componentInstance.periodoChange.subscribe((p) => (emitido = p));

    botoes()[3].click();
    fixture.detectChanges();

    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.periodo-custom-input'),
    );
    inputs[0].value = '2026-07-01';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '2026-07-05';
    inputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const aplicar: HTMLButtonElement = fixture.nativeElement.querySelector('.periodo-aplicar');
    expect(aplicar.disabled).toBe(false);
    aplicar.click();

    expect(emitido).toBeDefined();
    expect(emitido!.preset).toBe('custom');
    expect(new Date(emitido!.desde) <= new Date(emitido!.ate)).toBe(true);
  });
});

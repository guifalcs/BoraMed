import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProvaCardComponent } from './prova-card.component';
import type { Prova } from '../../../core/models/prova';

// ─── Helpers ────────────────────────────────────────────────────────────────

function provaFactory(overrides: Partial<Prova> = {}): Prova {
  return {
    id: 'prova-1',
    faculdade_id: 'fac-1',
    nome: 'Prova N1 2024 — 1º Período',
    periodo: 1,
    ano: 2024,
    semestre: 1,
    tipo: 'nacional',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    tempo_sugerido_minutos: 60,
    criado_em: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

async function createComponent(
  prova: Prova,
  variant: 'card' | 'row' = 'card',
): Promise<ComponentFixture<ProvaCardComponent>> {
  await TestBed.configureTestingModule({
    imports: [ProvaCardComponent],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProvaCardComponent);
  fixture.componentRef.setInput('prova', prova);
  fixture.componentRef.setInput('variant', variant);
  fixture.detectChanges();
  return fixture;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProvaCardComponent', () => {
  // ── Variante row ─────────────────────────────────────────────────────────

  describe('variante "row"', () => {
    let fixture: ComponentFixture<ProvaCardComponent>;
    let el: HTMLElement;

    beforeEach(async () => {
      fixture = await createComponent(provaFactory(), 'row');
      el = fixture.nativeElement as HTMLElement;
    });

    it('renderiza o nome da prova', () => {
      expect(el.textContent).toContain('Prova N1 2024 — 1º Período');
    });

    it('renderiza o período', () => {
      expect(el.textContent).toContain('1º período');
    });

    it('renderiza o ano', () => {
      expect(el.textContent).toContain('2024');
    });

    it('renderiza a quantidade de questões', () => {
      expect(el.textContent).toContain('30 questões');
    });

    it('não renderiza o bloco da variante "card"', () => {
      // The card variant wraps content in a rounded-xl element
      const cardButton = el.querySelector('button.rounded-xl');
      expect(cardButton).toBeNull();
    });
  });

  // ── Variante card ─────────────────────────────────────────────────────────

  describe('variante "card"', () => {
    let fixture: ComponentFixture<ProvaCardComponent>;
    let el: HTMLElement;

    beforeEach(async () => {
      fixture = await createComponent(provaFactory(), 'card');
      el = fixture.nativeElement as HTMLElement;
    });

    it('renderiza o nome da prova', () => {
      expect(el.textContent).toContain('Prova N1 2024 — 1º Período');
    });

    it('renderiza o badge de subtipo', () => {
      // The badge should display the short label "N1"
      const badge = el.querySelector('span.rounded-md');
      expect(badge).not.toBeNull();
      expect(badge?.textContent?.trim()).toBe('N1');
    });
  });

  // ── Cores dos badges ──────────────────────────────────────────────────────

  describe('cores dos badges por subtipo', () => {
    it('badge N1 tem classes bg-blue-100 e text-blue-700', async () => {
      const fixture = await createComponent(provaFactory({ subtipo_nacional: 'N1' }), 'card');
      const badge = (fixture.nativeElement as HTMLElement).querySelector('span.rounded-md');
      expect(badge?.className).toContain('bg-blue-100');
      expect(badge?.className).toContain('text-blue-700');
    });

    it('badge teste_progresso (TP) tem classes bg-violet-100 e text-violet-700', async () => {
      const fixture = await createComponent(
        provaFactory({ subtipo_nacional: 'teste_progresso', nome: 'Teste de Progresso 2024' }),
        'card',
      );
      const badge = (fixture.nativeElement as HTMLElement).querySelector('span.rounded-md');
      expect(badge?.className).toContain('bg-violet-100');
      expect(badge?.className).toContain('text-violet-700');
    });

    it('badge N2 tem classes bg-teal-100 e text-teal-700', async () => {
      const fixture = await createComponent(
        provaFactory({ subtipo_nacional: 'N2', nome: 'Prova N2 2024' }),
        'card',
      );
      const badge = (fixture.nativeElement as HTMLElement).querySelector('span.rounded-md');
      expect(badge?.className).toContain('bg-teal-100');
      expect(badge?.className).toContain('text-teal-700');
    });

    it('badge TP exibe o texto "TP"', async () => {
      const fixture = await createComponent(
        provaFactory({ subtipo_nacional: 'teste_progresso', nome: 'Teste de Progresso 2024' }),
        'card',
      );
      const badge = (fixture.nativeElement as HTMLElement).querySelector('span.rounded-md');
      expect(badge?.textContent?.trim()).toBe('TP');
    });
  });

  // ── Evento abrirProva ─────────────────────────────────────────────────────

  describe('evento abrirProva', () => {
    it('emite o id correto ao clicar na variante "card"', async () => {
      const fixture = await createComponent(provaFactory({ id: 'prova-xyz' }), 'card');
      const component = fixture.componentInstance;

      const emitSpy = vi.spyOn(component.abrirProva, 'emit');

      const button = (fixture.nativeElement as HTMLElement).querySelector('button');
      button?.click();
      fixture.detectChanges();

      expect(emitSpy).toHaveBeenCalledWith('prova-xyz');
    });

    it('emite o id correto ao clicar na variante "row"', async () => {
      const fixture = await createComponent(provaFactory({ id: 'prova-abc' }), 'row');
      const component = fixture.componentInstance;

      const emitSpy = vi.spyOn(component.abrirProva, 'emit');

      const button = (fixture.nativeElement as HTMLElement).querySelector('button');
      button?.click();
      fixture.detectChanges();

      expect(emitSpy).toHaveBeenCalledWith('prova-abc');
    });
  });

  // ── Subtipo null ──────────────────────────────────────────────────────────

  describe('prova sem subtipo_nacional', () => {
    it('não renderiza badge na variante "card" quando subtipo é null', async () => {
      const fixture = await createComponent(
        provaFactory({ subtipo_nacional: null }),
        'card',
      );
      const badge = (fixture.nativeElement as HTMLElement).querySelector('span.rounded-md');
      expect(badge).toBeNull();
    });
  });
});

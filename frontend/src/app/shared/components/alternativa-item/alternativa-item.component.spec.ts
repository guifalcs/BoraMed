import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlternativaItemComponent } from './alternativa-item.component';
import type { Alternativa } from '../../../core/models/alternativa';

const altMock: Alternativa = {
  id: 'alt-1',
  questao_id: 'q-1',
  letra: 'A',
  texto: 'Resposta A',
  correta: false,
  ordem: 1,
  imagem_url: null,
};

describe('AlternativaItemComponent', () => {
  let fixture: ComponentFixture<AlternativaItemComponent>;
  let component: AlternativaItemComponent;

  async function setup(estado: 'idle' | 'selecionada' | 'correta' | 'errada' | 'desabilitada') {
    await TestBed.configureTestingModule({
      imports: [AlternativaItemComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AlternativaItemComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('alternativa', altMock);
    fixture.componentRef.setInput('estado', estado);
    fixture.detectChanges();
  }

  it('deve renderizar a letra e o texto', async () => {
    await setup('idle');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('A');
    expect(el.textContent).toContain('Resposta A');
  });

  it('deve emitir selecionar ao clicar em estado idle', async () => {
    await setup('idle');
    let emitted: string | null = null;
    component.selecionar.subscribe((v: string) => (emitted = v));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toBe('alt-1');
  });

  it('deve emitir selecionar ao clicar em estado selecionada', async () => {
    await setup('selecionada');
    let emitted: string | null = null;
    component.selecionar.subscribe((v: string) => (emitted = v));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toBe('alt-1');
  });

  it('não deve emitir ao clicar em estado correta', async () => {
    await setup('correta');
    let emitted = false;
    component.selecionar.subscribe(() => (emitted = true));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toBe(false);
  });

  it('não deve emitir ao clicar em estado errada', async () => {
    await setup('errada');
    let emitted = false;
    component.selecionar.subscribe(() => (emitted = true));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toBe(false);
  });

  it('deve desabilitar botão em estado desabilitada', async () => {
    await setup('desabilitada');
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('deve ter role="radio"', async () => {
    await setup('idle');
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('role')).toBe('radio');
  });

  it('deve ter aria-checked correto', async () => {
    await setup('selecionada');
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-checked')).toBe('true');
  });

  it('deve mostrar ✓ quando correta', async () => {
    await setup('correta');
    expect(fixture.nativeElement.textContent).toContain('✓');
  });

  it('deve mostrar ✗ quando errada', async () => {
    await setup('errada');
    expect(fixture.nativeElement.textContent).toContain('✗');
  });

  it('deve aplicar classes de selecionada', async () => {
    await setup('selecionada');
    const wrapper = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('color-primary');
  });

  it('não deve renderizar imagem quando imagem_url é null', async () => {
    await setup('idle');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('deve renderizar a imagem da alternativa quando imagem_url existe', async () => {
    await setup('idle');
    fixture.componentRef.setInput('alternativa', {
      ...altMock,
      imagem_url: 'https://exemplo.com/alt-a.webp',
    });
    fixture.detectChanges();
    // O src passa por `| imagemProtegida | async` (bucket privado): a URL só
    // aparece depois que a promessa resolve.
    await fixture.whenStable();
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('alt-a.webp');
  });

  it('não deve exibir o botão de eliminar sem podeEliminar', async () => {
    await setup('idle');
    expect(fixture.nativeElement.querySelector('button[aria-label^="Eliminar"]')).toBeNull();
  });

  it('deve emitir toggleEliminar ao riscar', async () => {
    await setup('idle');
    fixture.componentRef.setInput('podeEliminar', true);
    fixture.detectChanges();
    let emitted: boolean | null = null;
    component.toggleEliminar.subscribe((v: boolean) => (emitted = v));
    (
      fixture.nativeElement.querySelector('button[aria-label^="Eliminar"]') as HTMLButtonElement
    ).click();
    expect(emitted).toBe(true);
  });

  it('riscar não deve selecionar a alternativa', async () => {
    await setup('idle');
    fixture.componentRef.setInput('podeEliminar', true);
    fixture.detectChanges();
    let emitted = false;
    component.selecionar.subscribe(() => (emitted = true));
    (
      fixture.nativeElement.querySelector('button[aria-label^="Eliminar"]') as HTMLButtonElement
    ).click();
    expect(emitted).toBe(false);
  });

  it('eliminada deve desabilitar a seleção e mostrar o traço', async () => {
    await setup('idle');
    fixture.componentRef.setInput('podeEliminar', true);
    fixture.componentRef.setInput('eliminada', true);
    fixture.detectChanges();
    let emitted = false;
    component.selecionar.subscribe(() => (emitted = true));
    const radio = fixture.nativeElement.querySelector('button[role="radio"]') as HTMLButtonElement;
    radio.click();
    expect(emitted).toBe(false);
    expect(radio.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="risca"]')).not.toBeNull();
  });

  it('eliminada deve oferecer restaurar', async () => {
    await setup('idle');
    fixture.componentRef.setInput('podeEliminar', true);
    fixture.componentRef.setInput('eliminada', true);
    fixture.detectChanges();
    let emitted: boolean | null = null;
    component.toggleEliminar.subscribe((v: boolean) => (emitted = v));
    const btn = fixture.nativeElement.querySelector(
      'button[aria-label^="Restaurar"]',
    ) as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(emitted).toBe(false);
  });

  it('com gabarito na tela a risca não é aplicada', async () => {
    await setup('errada');
    fixture.componentRef.setInput('eliminada', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="risca"]')).toBeNull();
  });

  // ── Long press (toque) ──────────────────────────────────────────────────

  describe('long press no toque', () => {
    function ponteiro(tipo: string, x = 0, y = 0): PointerEvent {
      return { pointerType: tipo, clientX: x, clientY: y } as PointerEvent;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function setupTouch() {
      await setup('idle');
      fixture.componentRef.setInput('podeEliminar', true);
      fixture.detectChanges();
    }

    it('segurar risca a alternativa', async () => {
      await setupTouch();
      let emitted: boolean | null = null;
      component.toggleEliminar.subscribe((v: boolean) => (emitted = v));

      component['onPointerDown'](ponteiro('touch'));
      vi.advanceTimersByTime(500);

      expect(emitted).toBe(true);
    });

    it('o clique que fecha o long press não seleciona', async () => {
      await setupTouch();
      let selecionou = false;
      component.selecionar.subscribe(() => (selecionou = true));

      component['onPointerDown'](ponteiro('touch'));
      vi.advanceTimersByTime(500);
      component['cancelarLongPress']();
      component['handleClick']();

      expect(selecionou).toBe(false);
    });

    it('toque curto continua marcando a alternativa', async () => {
      await setupTouch();
      let selecionou = false;
      component.selecionar.subscribe(() => (selecionou = true));

      component['onPointerDown'](ponteiro('touch'));
      vi.advanceTimersByTime(200);
      component['cancelarLongPress']();
      component['handleClick']();

      expect(selecionou).toBe(true);
    });

    it('rolar a página cancela o long press', async () => {
      await setupTouch();
      let emitted = false;
      component.toggleEliminar.subscribe(() => (emitted = true));

      component['onPointerDown'](ponteiro('touch', 100, 100));
      component['onPointerMove'](ponteiro('touch', 100, 140));
      vi.advanceTimersByTime(500);

      expect(emitted).toBe(false);
    });

    it('mouse não dispara long press — lá existe o botão', async () => {
      await setupTouch();
      let emitted = false;
      component.toggleEliminar.subscribe(() => (emitted = true));

      component['onPointerDown'](ponteiro('mouse'));
      vi.advanceTimersByTime(500);

      expect(emitted).toBe(false);
    });

    it('sem podeEliminar o gesto não faz nada', async () => {
      await setup('idle');
      let emitted = false;
      component.toggleEliminar.subscribe(() => (emitted = true));

      component['onPointerDown'](ponteiro('touch'));
      vi.advanceTimersByTime(500);

      expect(emitted).toBe(false);
    });
  });

  it('clicar na imagem não deve selecionar a alternativa', async () => {
    await setup('idle');
    fixture.componentRef.setInput('alternativa', {
      ...altMock,
      imagem_url: 'https://exemplo.com/alt-a.webp',
    });
    fixture.detectChanges();
    let emitted = false;
    component.selecionar.subscribe(() => (emitted = true));
    const botaoImagem = fixture.nativeElement.querySelector(
      'button[aria-label^="Ampliar"]',
    ) as HTMLButtonElement;
    botaoImagem.click();
    expect(emitted).toBe(false);
  });
});

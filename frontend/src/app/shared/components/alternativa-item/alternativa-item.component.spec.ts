import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
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

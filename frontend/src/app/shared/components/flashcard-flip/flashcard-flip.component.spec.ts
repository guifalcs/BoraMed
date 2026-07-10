import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlashcardFlipComponent } from './flashcard-flip.component';

async function createComponent(
  overrides: { frente?: string; verso?: string; virado?: boolean } = {},
): Promise<ComponentFixture<FlashcardFlipComponent>> {
  await TestBed.configureTestingModule({ imports: [FlashcardFlipComponent] }).compileComponents();
  const fixture = TestBed.createComponent(FlashcardFlipComponent);
  fixture.componentRef.setInput('frente', overrides.frente ?? 'Pergunta');
  fixture.componentRef.setInput('verso', overrides.verso ?? 'Resposta');
  if (overrides.virado !== undefined) fixture.componentRef.setInput('virado', overrides.virado);
  fixture.detectChanges();
  return fixture;
}

describe('FlashcardFlipComponent', () => {
  it('renderiza frente e verso', async () => {
    const fixture = await createComponent({ frente: 'Pergunta X', verso: 'Resposta Y' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pergunta X');
    expect(el.textContent).toContain('Resposta Y');
  });

  it('não aplica classe de virado por padrão', async () => {
    const fixture = await createComponent();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.classList.contains('flip-card--virado')).toBe(false);
  });

  it('aplica classe de virado quando virado=true', async () => {
    const fixture = await createComponent({ virado: true });
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.classList.contains('flip-card--virado')).toBe(true);
  });

  it('emite flipChange com o valor invertido ao clicar', async () => {
    const fixture = await createComponent({ virado: false });
    const spy = vi.spyOn(fixture.componentInstance.flipChange, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('emite flipChange(false) ao clicar já virado', async () => {
    const fixture = await createComponent({ virado: true });
    const spy = vi.spyOn(fixture.componentInstance.flipChange, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('renderiza imagens de frente e verso quando fornecidas', async () => {
    await TestBed.configureTestingModule({ imports: [FlashcardFlipComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FlashcardFlipComponent);
    fixture.componentRef.setInput('frente', 'F');
    fixture.componentRef.setInput('verso', 'V');
    fixture.componentRef.setInput('frenteImagemUrl', 'https://example.com/frente.png');
    fixture.componentRef.setInput('versoImagemUrl', 'https://example.com/verso.png');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const imgs = el.querySelectorAll('img');
    expect(imgs.length).toBe(2);
  });
});

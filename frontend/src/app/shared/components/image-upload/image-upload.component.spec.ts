import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ImageUploadComponent } from './image-upload.component';

describe('ImageUploadComponent', () => {
  let fixture: ComponentFixture<ImageUploadComponent>;
  let component: ImageUploadComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageUploadComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: {} },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageUploadComponent);
    component = fixture.componentInstance;
  });

  it('usa "questao-imagens" como bucket padrão', () => {
    fixture.detectChanges();
    expect(component.bucket()).toBe('questao-imagens');
  });

  it('usa "questoes" como pathPrefix padrão', () => {
    fixture.detectChanges();
    expect(component.pathPrefix()).toBe('questoes');
  });

  it('permite sobrescrever bucket e pathPrefix via input', () => {
    fixture.componentRef.setInput('bucket', 'flashcards-imagens');
    fixture.componentRef.setInput('pathPrefix', 'flashcards');
    fixture.detectChanges();

    expect(component.bucket()).toBe('flashcards-imagens');
    expect(component.pathPrefix()).toBe('flashcards');
  });

  function previewImg(): HTMLImageElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.img-preview__img');
  }

  // O src do preview passa por `| imagemProtegida | async` (o bucket
  // questao-imagens virou privado), então a URL só chega ao DOM depois que a
  // promessa resolve.
  async function estabilizar(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Regressão: no carrossel do editor de decks o componente é reutilizado entre
  // cards; o estado local da sessão anterior vazava para o card seguinte.
  it('descarta o estado local quando o pai troca a currentUrl (troca de card no carrossel)', async () => {
    fixture.componentRef.setInput('currentUrl', 'https://x/card1.png');
    fixture.detectChanges();
    await estabilizar();
    expect(previewImg()?.src).toContain('card1.png');

    // Simula "Remover"; o pai ecoa o urlChange de volta no currentUrl,
    // como todos os usos reais fazem.
    await component['remover']();
    fixture.componentRef.setInput('currentUrl', null);
    fixture.detectChanges();
    expect(previewImg()).toBeNull();

    // O pai navega para outro card: currentUrl muda → o estado local do card
    // anterior é descartado. Sem o effect, o "null" da remoção acima venceria
    // e o card 2 apareceria sem a sua imagem.
    fixture.componentRef.setInput('currentUrl', 'https://x/card2.png');
    fixture.detectChanges();
    await estabilizar();
    expect(previewImg()?.src).toContain('card2.png');
  });
});

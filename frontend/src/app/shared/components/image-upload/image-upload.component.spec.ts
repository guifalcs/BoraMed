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
});

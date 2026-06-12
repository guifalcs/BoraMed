import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Tentativa } from '../../../core/models/tentativa';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvasHomeComponent } from './provas-home.component';

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tentativa-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'em_andamento',
    total_questoes: 20,
    total_respondidas: 7,
    acertos: 5,
    nota: null,
    iniciada_em: '2026-05-16T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 900,
    finalizada_em: null,
    criado_em: '2026-05-16T10:00:00Z',
    ...overrides,
  };
}

describe('ProvasHomeComponent', () => {
  let fixture: ComponentFixture<ProvasHomeComponent>;
  let el: HTMLElement;
  const tentativaAtiva = signal<Tentativa | null>(null);

  beforeEach(async () => {
    tentativaAtiva.set(null);

    await TestBed.configureTestingModule({
      imports: [ProvasHomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: TentativaService,
          useValue: {
            tentativaAtiva,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvasHomeComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  it('não exibe card de continuidade sem tentativa ativa', () => {
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Retome seu simulado');
  });

  it('exibe as duas opções principais de simulado', () => {
    fixture.detectChanges();

    expect(el.textContent).toContain('Treinos nacionais');
    expect(el.textContent).toContain('Montar simulado');
    expect(el.textContent).toContain('Ou ajuste o simulado ao que precisa revisar agora');
  });

  it('exibe card de continuidade com progresso da tentativa ativa', () => {
    tentativaAtiva.set(tentativaFactory({ status: 'pausada', total_respondidas: 12, total_questoes: 20 }));

    fixture.detectChanges();

    expect(el.textContent).toContain('Retome seu simulado');
    expect(el.textContent).toContain('12 de 20 questões respondidas · pausado');
    expect(el.textContent).toContain('Continuar');
  });
});

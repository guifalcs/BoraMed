import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingDemoQuizComponent } from './landing-demo-quiz.component';
import { LandingDemoResult } from './landing-demo-result';

describe('LandingDemoQuizComponent → LandingDemoResult', () => {
  let resultado: LandingDemoResult;
  let pagina: HTMLElement;
  let detectar: () => void;

  /** Marca a alternativa `indice` da questão atual e avança. */
  const responder = (indice: number): void => {
    pagina.querySelectorAll<HTMLButtonElement>('.quiz-option')[indice].click();
    detectar();
    pagina.querySelector<HTMLButtonElement>('.quiz-next')?.click();
    detectar();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingDemoQuizComponent],
      providers: [provideRouter([]), LandingDemoResult],
    }).compileComponents();

    const fixture = TestBed.createComponent(LandingDemoQuizComponent);
    resultado = TestBed.inject(LandingDemoResult);
    pagina = fixture.nativeElement as HTMLElement;
    detectar = () => fixture.detectChanges();
    detectar();
  });

  it('publica as três questões sem resposta ao iniciar', () => {
    expect(resultado.questoes()).toEqual([
      { tema: 'Cardiologia', certa: null },
      { tema: 'Pneumologia', certa: null },
      { tema: 'Imunologia', certa: null },
    ]);
    expect(resultado.respondidas()).toBe(0);
    expect(resultado.concluido()).toBe(false);
  });

  it('leva acertos e erros para o fechamento conforme o visitante responde', () => {
    responder(0); // Cardiologia: correta é A
    expect(resultado.questoes()).toEqual([
      { tema: 'Cardiologia', certa: true },
      { tema: 'Pneumologia', certa: null },
      { tema: 'Imunologia', certa: null },
    ]);
    expect(resultado.concluido()).toBe(false);

    responder(0); // Pneumologia: correta é C
    responder(3); // Imunologia: correta é D

    expect(resultado.questoes()).toEqual([
      { tema: 'Cardiologia', certa: true },
      { tema: 'Pneumologia', certa: false },
      { tema: 'Imunologia', certa: true },
    ]);
    expect(resultado.concluido()).toBe(true);
    expect(resultado.acertos()).toBe(2);
    expect(resultado.temasParaRevisar()).toEqual(['Pneumologia']);
  });

  it('zera o resultado publicado ao refazer as questões', () => {
    responder(0);
    responder(2);
    responder(3);
    expect(resultado.concluido()).toBe(true);

    pagina.querySelector<HTMLButtonElement>('.quiz-restart')?.click();
    detectar();

    expect(resultado.respondidas()).toBe(0);
    expect(resultado.concluido()).toBe(false);
    expect(resultado.questoes().every((questao) => questao.certa === null)).toBe(true);
  });
});

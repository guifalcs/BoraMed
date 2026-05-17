import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ResultadoSummaryComponent } from './resultado-summary.component';
import type { ResultadoTentativa, Tentativa, DistribuicaoTema } from '../../../core/models/tentativa';
import type { Tema } from '../../../core/models/tema';

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tent-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'finalizada',
    total_questoes: 10,
    total_respondidas: 10,
    acertos: 7,
    nota: 70,
    iniciada_em: '2024-01-01T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 600,
    finalizada_em: '2024-01-01T10:10:00Z',
    criado_em: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

function resultadoFactory(overrides: Partial<ResultadoTentativa> = {}): ResultadoTentativa {
  return {
    tentativa: tentativaFactory(),
    questoes: [],
    respostas: [],
    distribuicao_temas: [],
    ...overrides,
  };
}

function temaFactory(id: string, nome: string): Tema {
  return {
    id,
    nome,
    disciplina: null,
    periodo: 1,
    parent_id: null,
    criado_em: '2024-01-01T00:00:00Z',
  };
}

function distribuicaoFactory(
  temaId: string,
  nome: string,
  acertos: number,
  total: number,
): DistribuicaoTema {
  return {
    tema: temaFactory(temaId, nome),
    acertos,
    total,
  };
}

describe('ResultadoSummaryComponent', () => {
  let fixture: ComponentFixture<ResultadoSummaryComponent>;
  let component: ResultadoSummaryComponent;

  async function setup(
    resultado: ResultadoTentativa = resultadoFactory(),
    notaAnterior: number | null = null,
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ResultadoSummaryComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ResultadoSummaryComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resultado', resultado);
    fixture.componentRef.setInput('notaAnterior', notaAnterior);
    fixture.detectChanges();
  }

  // ── 3.1: Comparativo com tentativa anterior ────────────────────────────

  describe('comparativo com tentativa anterior (deltaNota)', () => {
    it('deve retornar null quando não há nota anterior', async () => {
      await setup(resultadoFactory(), null);
      expect(component['deltaNota']()).toBeNull();
    });

    it('deve calcular delta positivo quando nota subiu', async () => {
      await setup(resultadoFactory({ tentativa: tentativaFactory({ nota: 80 }) }), 65);
      expect(component['deltaNota']()).toBe(15);
    });

    it('deve calcular delta negativo quando nota caiu', async () => {
      await setup(resultadoFactory({ tentativa: tentativaFactory({ nota: 50 }) }), 70);
      expect(component['deltaNota']()).toBe(-20);
    });

    it('deve retornar zero quando notas são iguais', async () => {
      await setup(resultadoFactory({ tentativa: tentativaFactory({ nota: 70 }) }), 70);
      expect(component['deltaNota']()).toBe(0);
    });

    it('deve exibir texto de melhoria no template quando delta positivo', async () => {
      await setup(resultadoFactory({ tentativa: tentativaFactory({ nota: 85 }) }), 70);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('em relação à tentativa anterior');
      expect(el.textContent).toContain('15');
    });

    it('deve exibir texto de queda no template quando delta negativo', async () => {
      await setup(resultadoFactory({ tentativa: tentativaFactory({ nota: 40 }) }), 60);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('em relação à tentativa anterior');
      expect(el.textContent).toContain('20');
    });

    it('não deve exibir delta quando notaAnterior é null', async () => {
      await setup(resultadoFactory(), null);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('em relação à tentativa anterior');
    });
  });

  // ── 3.2: Tempo médio por questão ───────────────────────────────────────

  describe('tempo médio por questão', () => {
    it('deve calcular tempo médio corretamente', async () => {
      await setup(resultadoFactory({
        tentativa: tentativaFactory({ tempo_acumulado_segundos: 300, total_questoes: 10 }),
      }));
      expect(component['tempoMedioPorQuestao']()).toBe('30s');
    });

    it('deve formatar com minutos quando média >= 60s', async () => {
      await setup(resultadoFactory({
        tentativa: tentativaFactory({ tempo_acumulado_segundos: 900, total_questoes: 10 }),
      }));
      expect(component['tempoMedioPorQuestao']()).toBe('1min 30s');
    });

    it('deve retornar null quando tempo é zero', async () => {
      await setup(resultadoFactory({
        tentativa: tentativaFactory({ tempo_acumulado_segundos: 0, total_questoes: 10 }),
      }));
      expect(component['tempoMedioPorQuestao']()).toBeNull();
    });

    it('deve retornar null quando total de questões é zero', async () => {
      await setup(resultadoFactory({
        tentativa: tentativaFactory({ tempo_acumulado_segundos: 600, total_questoes: 0 }),
      }));
      expect(component['tempoMedioPorQuestao']()).toBeNull();
    });

    it('deve exibir tempo médio no template', async () => {
      await setup(resultadoFactory({
        tentativa: tentativaFactory({ tempo_acumulado_segundos: 600, total_questoes: 10 }),
      }));
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Média por questão');
      expect(el.textContent).toContain('1min 0s');
    });
  });

  describe('próximo treino recomendado', () => {
    it('deve selecionar o tema com menor aproveitamento', async () => {
      await setup(resultadoFactory({
        distribuicao_temas: [
          distribuicaoFactory('tema-1', 'Cardiologia', 8, 10),
          distribuicaoFactory('tema-2', 'Pediatria', 3, 10),
        ],
      }));

      expect(component['temaPrioritario']()).toEqual({
        id: 'tema-2',
        nome: 'Pediatria',
        taxa: 30,
      });
    });

    it('deve exibir CTA para treinar o tema prioritário', async () => {
      await setup(resultadoFactory({
        distribuicao_temas: [
          distribuicaoFactory('tema-1', 'Cardiologia', 8, 10),
          distribuicaoFactory('tema-2', 'Pediatria', 3, 10),
        ],
      }));

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Revisar tema crítico');
      expect(el.textContent).toContain('Pediatria');
    });

    it('não deve eleger um único tema quando houver empate no menor aproveitamento', async () => {
      await setup(resultadoFactory({
        distribuicao_temas: [
          distribuicaoFactory('tema-1', 'Cardiologia', 0, 4),
          distribuicaoFactory('tema-2', 'Pediatria', 0, 4),
          distribuicaoFactory('tema-3', 'Neurologia', 2, 4),
        ],
      }));

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Revisar temas críticos');
      expect(el.textContent).toContain('2 temas com menor aproveitamento');
      expect(el.textContent).toContain('Menor aproveitamento nesta tentativa: 0%');
      expect(el.textContent).not.toContain('Reforce Cardiologia agora');
      expect(component['temEmpateEntreTemasPrioritarios']()).toBe(true);
    });
  });

  describe('ações pós-resultado', () => {
    it('exibe CTA para revisar erros quando houver respostas incorretas', async () => {
      await setup(resultadoFactory({
        respostas: [
          {
            id: 'resp-1',
            tentativa_id: 'tent-1',
            questao_id: 'q1',
            alternativa_id: 'a1',
            resposta_texto: null,
            correta: false,
            tempo_gasto_segundos: 10,
            ordem_na_tentativa: 1,
            respondida_em: '2024-01-01T10:01:00Z',
          },
        ],
      }));

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Revisar erros');
      expect(el.textContent).toContain('Revise diretamente a questão em que você errou');
    });

    it('exibe CTA de refazer em modo estudo para prova regular', async () => {
      await setup(resultadoFactory());

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Refazer em modo estudo');
    });

    it('exibe CTA de montar treino em estudo para simulado personalizado', async () => {
      await TestBed.configureTestingModule({
        imports: [ResultadoSummaryComponent],
        providers: [provideRouter([])],
      }).compileComponents();

      fixture = TestBed.createComponent(ResultadoSummaryComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('resultado', resultadoFactory());
      fixture.componentRef.setInput('isPersonalizado', true);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Montar treino no modo estudo');
    });
  });
});

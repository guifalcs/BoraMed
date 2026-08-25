import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { TentativaExecComponent } from './tentativa-exec.component';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import { TimerService } from '../../../core/services/timer.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { GemeaDisponivel, QuestaoComAlternativas } from '../../../core/models/questao';
import type { Tentativa, TentativaResposta } from '../../../core/models/tentativa';

/**
 * Troca de formato (questão gêmea) na execução da prova.
 *
 * O ponto crítico não é a chamada da RPC: é que TODO o estado local do
 * componente é indexado por `questao.id` e o id MUDA na troca. Sem a migração
 * de chaves, marcação/rascunho/gêmea ficam órfãos e a questão nova aparece
 * como se nunca tivesse sido tocada — ou pior, no lugar errado da prova.
 */

function questaoFactory(overrides: Partial<QuestaoComAlternativas> = {}): QuestaoComAlternativas {
  return {
    id: 'q-fechada',
    codigo_externo: null,
    enunciado_apoio: null,
    enunciado: 'Qual é a resposta?',
    imagem_url: null,
    imagem_legenda: null,
    formato: 'multipla_escolha',
    tipo_questao: 'laboratorio',
    resposta_correta_texto: null,
    respostas_aceitas: null,
    explicacao: null,
    explicacao_alternativas: null,
    referencia: null,
    disciplina: null,
    periodo: null,
    prova_id: 'prova-1',
    ordem_na_prova: 1,
    fonte: null,
    vezes_respondida: 0,
    vezes_acertada: 0,
    taxa_acerto: null,
    status: 'ativa',
    revisado: false,
    autor_id: null,
    revisor_id: null,
    aprovada_em: null,
    publicada_em: null,
    origem_geracao: 'manual',
    nivel_bloom: null,
    formato_prova: null,
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
    temas: [],
    alternativas: [],
    ...overrides,
  };
}

const questaoFechada = questaoFactory({ id: 'q-fechada', ordem_na_prova: 1 });
const questaoOutra = questaoFactory({ id: 'q-outra', ordem_na_prova: 2 });
const questaoDiscursiva = questaoFactory({
  id: 'q-discursiva',
  formato: 'resposta_aberta_curta',
  enunciado: 'Descreva o achado.',
  alternativas: [],
  ordem_na_prova: 1,
});

const gemeaDaFechada: GemeaDisponivel = {
  questao_id: 'q-fechada',
  gemea_id: 'q-discursiva',
  formato_atual: 'multipla_escolha',
  formato_gemea: 'resposta_aberta_curta',
};

/** Mapa invertido devolvido pela RPC: dá para voltar ao formato anterior. */
const gemeaInvertida: GemeaDisponivel = {
  questao_id: 'q-discursiva',
  gemea_id: 'q-fechada',
  formato_atual: 'resposta_aberta_curta',
  formato_gemea: 'multipla_escolha',
};

const respostaTrocada = {
  id: 'tr-1',
  tentativa_id: 'tent-1',
  questao_id: 'q-discursiva',
  alternativa_id: null,
  resposta_texto: null,
  correta: null,
  respondida_em: null,
  enviada_em: null,
  ordem_na_tentativa: 1,
} as unknown as TentativaResposta;

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tent-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'em_andamento',
    total_questoes: 2,
    total_respondidas: 0,
    acertos: 0,
    nota: null,
    iniciada_em: '2024-01-01T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 0,
    finalizada_em: null,
    criado_em: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('TentativaExecComponent — troca de formato (questão gêmea)', () => {
  let fixture: ComponentFixture<TentativaExecComponent>;
  let component: TentativaExecComponent;

  const tentativa = tentativaFactory();

  const mockTentativaService = {
    tentativaAtiva: signal(tentativa),
    questoes: signal<QuestaoComAlternativas[]>([questaoFechada, questaoOutra]),
    respostas: signal<TentativaResposta[]>([]),
    provaNome: signal('Prova Teste'),
    lastResultado: signal(null),
    salvarResposta: vi.fn().mockResolvedValue({ ok: true, data: null }),
    salvarRespostaTexto: vi.fn().mockResolvedValue({ ok: true, data: null }),
    pausar: vi.fn().mockResolvedValue({ ok: true }),
    retomar: vi.fn(),
    setProvaNome: vi.fn(),
    setLastResultado: vi.fn(),
    finalizar: vi.fn(),
    listarCorrecoes: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listarGemeas: vi.fn(),
    trocarFormatoQuestao: vi.fn(),
  };

  const mockProvaService = { buscarProva: vi.fn() };
  const mockNotificationService = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
  const mockActivatedRoute = { snapshot: { paramMap: { get: () => 'tent-1' } } };
  const mockTimerService = {
    seconds: signal(0),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TentativaExecComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: TentativaService, useValue: mockTentativaService },
        { provide: ProvaService, useValue: mockProvaService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: TimerService, useValue: mockTimerService },
      ],
    })
      .overrideComponent(TentativaExecComponent, {
        set: { template: '<div></div>', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TentativaExecComponent);
    component = fixture.componentInstance;

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await component.ngOnInit();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTentativaService.tentativaAtiva.set(tentativa);
    mockTentativaService.questoes.set([questaoFechada, questaoOutra]);
    mockTentativaService.respostas.set([]);
    mockTentativaService.salvarRespostaTexto.mockResolvedValue({ ok: true, data: null });
    mockTentativaService.pausar.mockResolvedValue({ ok: true });
    mockTentativaService.listarCorrecoes.mockResolvedValue({ ok: true, data: [] });
    mockTentativaService.listarGemeas.mockResolvedValue({ ok: true, data: [gemeaDaFechada] });
    mockTentativaService.trocarFormatoQuestao.mockResolvedValue({
      ok: true,
      data: {
        questao: questaoDiscursiva,
        resposta: respostaTrocada,
        gemea: gemeaInvertida,
      },
    });
    await setup();
  });

  describe('oferta do botão', () => {
    it('oferece a gêmea na questão que tem par', () => {
      expect(component['formatoGemeaAtual']()).toBe('resposta_aberta_curta');
    });

    it('não oferece em questão sem par', () => {
      component['questaoAtualIdx'].set(1);
      expect(component['formatoGemeaAtual']()).toBeNull();
    });

    it('não oferece depois de responder (o servidor recusaria)', () => {
      component['respostas'].set(new Map([['q-fechada', 'alt-1']]));
      expect(component['formatoGemeaAtual']()).toBeNull();
    });

    it('não oferece depois de enviar a discursiva', () => {
      component['enviadas'].set(new Set(['q-fechada']));
      expect(component['formatoGemeaAtual']()).toBeNull();
    });

    it('não oferece em questão anulada pelo aluno', () => {
      component['anuladas'].set(new Set(['q-fechada']));
      expect(component['formatoGemeaAtual']()).toBeNull();
    });

    it('não oferece quando a lista de gêmeas falhou ao carregar', async () => {
      mockTentativaService.listarGemeas.mockResolvedValue({ ok: false, error: 'falhou' });
      TestBed.resetTestingModule();
      await setup();
      expect(component['formatoGemeaAtual']()).toBeNull();
    });
  });

  describe('troca', () => {
    it('substitui a questão na mesma posição da prova', async () => {
      await component['onTrocarFormato']();

      expect(mockTentativaService.trocarFormatoQuestao).toHaveBeenCalledWith(
        'tent-1',
        'q-fechada',
      );
      expect(component['questoes']().map((q) => q.id)).toEqual(['q-discursiva', 'q-outra']);
      expect(component['questaoAtualIdx']()).toBe(0);
    });

    it('migra a marcação de revisão para o novo id', async () => {
      component['marcadas'].set(new Set(['q-fechada']));

      await component['onTrocarFormato']();

      expect(component['marcadas']().has('q-fechada')).toBe(false);
      expect(component['marcadas']().has('q-discursiva')).toBe(true);
    });

    it('inverte o mapa de gêmeas para permitir voltar ao formato anterior', async () => {
      await component['onTrocarFormato']();

      expect(component['gemeas']().has('q-fechada')).toBe(false);
      expect(component['formatoGemeaAtual']()).toBe('multipla_escolha');
    });

    it('descarta o rascunho da questão antiga', async () => {
      component['respostasTexto'].set(new Map([['q-fechada', 'texto antigo']]));

      component['onTrocarFormato']();
      component['confirmarTroca']();
      await Promise.resolve();
      await Promise.resolve();

      expect(component['respostasTexto']().has('q-fechada')).toBe(false);
      expect(component['respostaTextoAtual']()).toBe('');
    });

    it('mantém a questão e avisa quando a troca falha', async () => {
      mockTentativaService.trocarFormatoQuestao.mockResolvedValue({
        ok: false,
        error: 'Só dá para trocar o formato antes de responder.',
      });

      await component['onTrocarFormato']();

      expect(component['questoes']().map((q) => q.id)).toEqual(['q-fechada', 'q-outra']);
      expect(mockNotificationService.error).toHaveBeenCalledWith(
        'Só dá para trocar o formato antes de responder.',
      );
    });
  });

  describe('confirmação de descarte', () => {
    it('pede confirmação quando há rascunho digitado', () => {
      component['respostasTexto'].set(new Map([['q-fechada', 'rascunho']]));

      component['onTrocarFormato']();

      expect(component['mostrarConfirmacaoTroca']()).toBe(true);
      expect(mockTentativaService.trocarFormatoQuestao).not.toHaveBeenCalled();
    });

    it('não pede confirmação quando o rascunho é só espaço em branco', async () => {
      component['respostasTexto'].set(new Map([['q-fechada', '   ']]));

      await component['onTrocarFormato']();

      expect(component['mostrarConfirmacaoTroca']()).toBe(false);
      expect(mockTentativaService.trocarFormatoQuestao).toHaveBeenCalled();
    });

    it('cancelar mantém o rascunho e a questão', () => {
      component['respostasTexto'].set(new Map([['q-fechada', 'rascunho']]));

      component['onTrocarFormato']();
      component['cancelarTroca']();

      expect(component['mostrarConfirmacaoTroca']()).toBe(false);
      expect(mockTentativaService.trocarFormatoQuestao).not.toHaveBeenCalled();
      expect(component['respostasTexto']().get('q-fechada')).toBe('rascunho');
    });
  });
});

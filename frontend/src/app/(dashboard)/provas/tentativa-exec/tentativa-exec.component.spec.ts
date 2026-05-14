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
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { Alternativa } from '../../../core/models/alternativa';
import type { Tentativa } from '../../../core/models/tentativa';

function alternativaFactory(
  overrides: Partial<Alternativa> & { letra: Alternativa['letra']; ordem: number },
): Alternativa {
  return {
    id: `alt-${overrides.letra}`,
    questao_id: 'q-1',
    texto: `Alternativa ${overrides.letra}`,
    correta: false,
    imagem_url: null,
    ...overrides,
  };
}

function questaoFactory(overrides: Partial<QuestaoComAlternativas> = {}): QuestaoComAlternativas {
  return {
    id: 'q-1',
    codigo_externo: null,
    enunciado_apoio: null,
    enunciado: 'Qual é a resposta?',
    imagem_url: null,
    imagem_legenda: null,
    formato: 'multipla_escolha',
    resposta_correta_texto: null,
    respostas_aceitas: null,
    explicacao: null,
    explicacao_alternativas: null,
    referencia: null,
    dificuldade: null,
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
    alternativas: [
      alternativaFactory({ letra: 'A', ordem: 1 }),
      alternativaFactory({ letra: 'B', ordem: 2 }),
      alternativaFactory({ letra: 'C', ordem: 3, correta: true }),
      alternativaFactory({ letra: 'D', ordem: 4 }),
      alternativaFactory({ letra: 'E', ordem: 5 }),
    ],
    ...overrides,
  };
}

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tent-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'em_andamento',
    total_questoes: 3,
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

describe('TentativaExecComponent — navegação por teclado', () => {
  let fixture: ComponentFixture<TentativaExecComponent>;
  let component: TentativaExecComponent;

  const questoes = [
    questaoFactory({ id: 'q-1' }),
    questaoFactory({ id: 'q-2' }),
    questaoFactory({ id: 'q-3' }),
  ];

  const tentativa = tentativaFactory();

  const mockTentativaService = {
    tentativaAtiva: signal(tentativa),
    questoes: signal(questoes),
    respostas: signal([]),
    provaNome: signal('Prova Teste'),
    lastResultado: signal(null),
    salvarResposta: vi.fn().mockResolvedValue({ ok: true, data: null }),
    pausar: vi.fn().mockResolvedValue({ ok: true }),
    retomar: vi.fn(),
    setProvaNome: vi.fn(),
    setLastResultado: vi.fn(),
    finalizar: vi.fn(),
  };

  const mockProvaService = {
    buscarProva: vi.fn(),
  };

  const mockNotificationService = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  };

  const mockActivatedRoute = {
    snapshot: { paramMap: { get: () => 'tent-1' } },
  };

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

    // Stub router.navigate to prevent unhandled rejections
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    // Trigger ngOnInit to load data from memory
    await component.ngOnInit();
    fixture.detectChanges();
  }

  function dispatchKey(key: string, target?: HTMLElement): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    if (target) {
      Object.defineProperty(event, 'target', { value: target });
    }
    document.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTentativaService.salvarResposta.mockResolvedValue({ ok: true, data: null });
    mockTentativaService.tentativaAtiva.set(tentativa);
    mockTentativaService.questoes.set(questoes);
    mockTentativaService.respostas.set([]);
    mockTentativaService.provaNome.set('Prova Teste');
    await setup();
  });

  // ── ArrowRight / ArrowLeft ──────────────────────────────────────────────

  describe('navegação entre questões com setas', () => {
    it('deve avançar para próxima questão com ArrowRight', () => {
      expect(component['questaoAtualIdx']()).toBe(0);

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(1);
    });

    it('deve voltar para questão anterior com ArrowLeft', () => {
      component['questaoAtualIdx'].set(2);
      fixture.detectChanges();

      dispatchKey('ArrowLeft');
      expect(component['questaoAtualIdx']()).toBe(1);
    });

    it('não deve retroceder antes da primeira questão', () => {
      expect(component['questaoAtualIdx']()).toBe(0);

      dispatchKey('ArrowLeft');
      expect(component['questaoAtualIdx']()).toBe(0);
    });

    it('não deve avançar além da última questão', () => {
      component['questaoAtualIdx'].set(2);
      fixture.detectChanges();

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(2);
    });

    it('deve navegar sequencialmente com múltiplos ArrowRight', () => {
      dispatchKey('ArrowRight');
      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(2);
    });
  });

  // ── Seleção de alternativa por tecla ────────────────────────────────────

  describe('seleção de alternativa por tecla', () => {
    it('deve selecionar alternativa A ao pressionar "a"', () => {
      dispatchKey('a');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-A',
      );
    });

    it('deve selecionar alternativa C ao pressionar "C" (maiúscula)', () => {
      dispatchKey('C');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-C',
      );
    });

    it('deve selecionar alternativa B ao pressionar "2"', () => {
      dispatchKey('2');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-B',
      );
    });

    it('deve selecionar alternativa E ao pressionar "5"', () => {
      dispatchKey('5');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-E',
      );
    });

    it('deve selecionar alternativa D ao pressionar "d"', () => {
      dispatchKey('d');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-D',
      );
    });

    it('não deve selecionar alternativa para tecla inválida', () => {
      dispatchKey('x');
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();
    });

    it('não deve selecionar alternativa para número fora do range', () => {
      dispatchKey('6');
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();
    });

    it('não deve selecionar alternativa para "0"', () => {
      dispatchKey('0');
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();
    });
  });

  // ── Guards: estados que bloqueiam atalhos ───────────────────────────────

  describe('guards — estados que bloqueiam atalhos', () => {
    it('não deve navegar quando isLoading é true', () => {
      component['isLoading'].set(true);
      fixture.detectChanges();

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(0);
    });

    it('não deve navegar quando isPaused é true', () => {
      component['isPaused'].set(true);
      fixture.detectChanges();

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(0);
    });

    it('não deve navegar quando salvando é true', () => {
      component['salvando'].set(true);
      fixture.detectChanges();

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(0);
    });

    it('não deve selecionar alternativa quando isPaused é true', () => {
      component['isPaused'].set(true);
      fixture.detectChanges();

      dispatchKey('a');
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();
    });

    it('não deve responder atalhos quando foco está em input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      dispatchKey('ArrowRight', input);
      expect(component['questaoAtualIdx']()).toBe(0);

      dispatchKey('a', input);
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('não deve responder atalhos quando foco está em textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      dispatchKey('ArrowRight', textarea);
      expect(component['questaoAtualIdx']()).toBe(0);

      document.body.removeChild(textarea);
    });
  });

  // ── Alternativas com ordem não sequencial ──────────────────────────────

  describe('alternativas com ordem diferente', () => {
    it('deve respeitar a ordem das alternativas ao selecionar por número', async () => {
      const alternativasDesordenadas = [
        alternativaFactory({ id: 'alt-E-first', letra: 'E', ordem: 1 }),
        alternativaFactory({ id: 'alt-A-second', letra: 'A', ordem: 2 }),
        alternativaFactory({ id: 'alt-C-third', letra: 'C', ordem: 3 }),
      ];
      const questaoCustom = questaoFactory({
        id: 'q-custom',
        alternativas: alternativasDesordenadas,
      });

      mockTentativaService.questoes.set([questaoCustom]);
      component['questoes'].set([questaoCustom]);
      component['questaoAtualIdx'].set(0);
      fixture.detectChanges();

      dispatchKey('1');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-custom',
        'alt-E-first',
      );
    });
  });

  // ── Combinação de navegação + seleção ──────────────────────────────────

  describe('fluxo combinado navegação + seleção', () => {
    it('deve navegar para próxima questão e selecionar alternativa', () => {
      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(1);

      dispatchKey('b');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-2',
        'alt-B',
      );
    });

    it('deve navegar para trás e selecionar alternativa', () => {
      component['questaoAtualIdx'].set(2);
      fixture.detectChanges();

      dispatchKey('ArrowLeft');
      dispatchKey('ArrowLeft');
      expect(component['questaoAtualIdx']()).toBe(0);

      dispatchKey('e');
      expect(mockTentativaService.salvarResposta).toHaveBeenCalledWith(
        'tent-1',
        'q-1',
        'alt-E',
      );
    });
  });

  // ── Confirmação antes de finalizar ─────────────────────────────────────

  describe('confirmação antes de finalizar', () => {
    it('deve exibir modal de confirmação ao chamar onFinalizar', () => {
      expect(component['mostrarConfirmacao']()).toBe(false);

      component['onFinalizar']();
      expect(component['mostrarConfirmacao']()).toBe(true);
    });

    it('não deve chamar finalizar do service ao abrir modal', () => {
      component['onFinalizar']();
      expect(mockTentativaService.finalizar).not.toHaveBeenCalled();
    });

    it('deve fechar modal ao cancelar', () => {
      component['onFinalizar']();
      expect(component['mostrarConfirmacao']()).toBe(true);

      component['cancelarFinalizacao']();
      expect(component['mostrarConfirmacao']()).toBe(false);
    });

    it('deve chamar finalizar do service ao confirmar', async () => {
      mockTentativaService.finalizar.mockResolvedValue({
        ok: true,
        data: { nota: 80, acertos: 24, total: 30 },
      });

      component['onFinalizar']();
      await component['confirmarFinalizacao']();

      expect(mockTentativaService.finalizar).toHaveBeenCalledWith('tent-1', 0);
    });

    it('deve calcular questões não respondidas corretamente', () => {
      expect(component['questoesNaoRespondidas']()).toBe(3);

      component['respostas'].set(new Map([['q-1', 'alt-A'], ['q-2', 'alt-B']]));
      expect(component['questoesNaoRespondidas']()).toBe(1);
    });

    it('deve bloquear atalhos de teclado enquanto modal está aberto', () => {
      component['onFinalizar']();
      expect(component['mostrarConfirmacao']()).toBe(true);

      dispatchKey('ArrowRight');
      expect(component['questaoAtualIdx']()).toBe(0);

      dispatchKey('a');
      expect(mockTentativaService.salvarResposta).not.toHaveBeenCalled();
    });
  });

  // ── Marcação para revisão ──────────────────────────────────────────────

  describe('marcação para revisão', () => {
    it('deve marcar questão atual ao chamar toggleMarcar', () => {
      expect(component['questaoAtualMarcada']()).toBe(false);

      component['toggleMarcar']();
      expect(component['questaoAtualMarcada']()).toBe(true);
      expect(component['marcadas']().has('q-1')).toBe(true);
    });

    it('deve desmarcar questão ao chamar toggleMarcar novamente', () => {
      component['toggleMarcar']();
      expect(component['questaoAtualMarcada']()).toBe(true);

      component['toggleMarcar']();
      expect(component['questaoAtualMarcada']()).toBe(false);
      expect(component['marcadas']().has('q-1')).toBe(false);
    });

    it('deve marcar questão ao pressionar tecla "m"', () => {
      dispatchKey('m');
      expect(component['marcadas']().has('q-1')).toBe(true);
    });

    it('deve marcar questão ao pressionar tecla "M" (maiúscula)', () => {
      dispatchKey('M');
      expect(component['marcadas']().has('q-1')).toBe(true);
    });

    it('deve desmarcar questão ao pressionar "m" duas vezes', () => {
      dispatchKey('m');
      expect(component['marcadas']().has('q-1')).toBe(true);

      dispatchKey('m');
      expect(component['marcadas']().has('q-1')).toBe(false);
    });

    it('deve manter marcações independentes por questão', () => {
      dispatchKey('m');
      expect(component['marcadas']().has('q-1')).toBe(true);

      dispatchKey('ArrowRight');
      dispatchKey('m');
      expect(component['marcadas']().has('q-1')).toBe(true);
      expect(component['marcadas']().has('q-2')).toBe(true);
      expect(component['totalMarcadas']()).toBe(2);
    });

    it('deve refletir corretamente questaoAtualMarcada ao navegar', () => {
      dispatchKey('m');
      expect(component['questaoAtualMarcada']()).toBe(true);

      dispatchKey('ArrowRight');
      expect(component['questaoAtualMarcada']()).toBe(false);

      dispatchKey('ArrowLeft');
      expect(component['questaoAtualMarcada']()).toBe(true);
    });

    it('deve incluir marcações na mensagem de finalização', () => {
      component['respostas'].set(new Map([['q-1', 'alt-A'], ['q-2', 'alt-B'], ['q-3', 'alt-C']]));
      dispatchKey('m');

      const msg = component['mensagemFinalizacao']();
      expect(msg).toContain('1 questão marcada para revisão');
    });

    it('deve combinar não respondidas e marcadas na mensagem', () => {
      dispatchKey('m');

      const msg = component['mensagemFinalizacao']();
      expect(msg).toContain('questões sem resposta');
      expect(msg).toContain('questão marcada para revisão');
    });
  });
});

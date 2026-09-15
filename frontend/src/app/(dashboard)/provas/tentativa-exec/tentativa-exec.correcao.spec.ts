import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { TentativaExecComponent } from './tentativa-exec.component';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import { TimerService } from '../../../core/services/timer.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CorrecaoIaService } from '../../../core/services/correcao-ia.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { Tentativa, ModoProva } from '../../../core/models/tentativa';
import type { RespostaCorrecao, StatusCorrecao } from '../../../core/models/correcao';

/**
 * A correção da Aurora é assíncrona: a edge function pode devolver um estado
 * não-terminal (202 de claim concorrente, ou claim órfão de uma chamada que
 * morreu). Sem poll + teto de espera o aluno fica preso no
 * "Aurora está corrigindo sua resposta…" para sempre — é o bug destes testes.
 */

const QUESTAO_ABERTA = {
  id: 'q-1',
  codigo_externo: null,
  enunciado_apoio: null,
  enunciado: 'Descreva a produção e circulação do LCS.',
  imagem_url: null,
  imagem_legenda: null,
  formato: 'resposta_aberta_curta',
  tipo_questao: 'nacional',
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
  resposta_modelo: 'Plexos corioideos…',
  pontos_chave: ['Cita plexos corioideos'],
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
  temas: [],
  alternativas: [],
} as unknown as QuestaoComAlternativas;

function tentativaFactory(modo: ModoProva): Tentativa {
  return {
    id: 'tent-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo,
    status: 'em_andamento',
    total_questoes: 1,
    total_respondidas: 0,
    acertos: 0,
    nota: null,
    iniciada_em: '2024-01-01T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 0,
    finalizada_em: null,
    criado_em: '2024-01-01T10:00:00Z',
  };
}

function correcaoFactory(status: StatusCorrecao): RespostaCorrecao {
  return {
    id: 'rc-1',
    tentativa_resposta_id: 'tr-1',
    status,
    pontos: status === 'corrigida' ? 80 : null,
    feedback: status === 'corrigida' ? 'Boa resposta.' : null,
    pontos_atendidos: null,
    pontos_faltantes: null,
    erros: null,
    provider: null,
    modelo: null,
    num_tentativas: 1,
    criado_em: '2024-01-01T10:00:00Z',
    atualizado_em: '2024-01-01T10:00:00Z',
  };
}

describe('TentativaExecComponent — correção da Aurora', () => {
  let fixture: ComponentFixture<TentativaExecComponent>;
  let component: TentativaExecComponent;

  const mockTentativaService = {
    tentativaAtiva: signal(tentativaFactory('estudo')),
    questoes: signal([QUESTAO_ABERTA]),
    respostas: signal<unknown[]>([]),
    provaNome: signal('Prova Teste'),
    lastResultado: signal(null),
    salvarResposta: vi.fn().mockResolvedValue({ ok: true, data: null }),
    salvarRespostaTexto: vi.fn().mockResolvedValue({ ok: true, data: null }),
    enviarRespostaAberta: vi.fn(),
    listarCorrecoes: vi.fn(),
    pausar: vi.fn().mockResolvedValue({ ok: true }),
    retomar: vi.fn(),
    setProvaNome: vi.fn(),
    setLastResultado: vi.fn(),
    finalizar: vi.fn(),
    listarGemeas: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  };

  const mockCorrecaoIa = { corrigir: vi.fn() };
  const mockNotificationService = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
  const mockProvaService = { buscarProva: vi.fn() };
  const mockActivatedRoute = { snapshot: { paramMap: { get: () => 'tent-1' } } };
  const mockTimerService = {
    seconds: signal(0),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };

  async function setup(modo: ModoProva = 'estudo'): Promise<void> {
    mockTentativaService.tentativaAtiva.set(tentativaFactory(modo));

    await TestBed.configureTestingModule({
      imports: [TentativaExecComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: TentativaService, useValue: mockTentativaService },
        { provide: ProvaService, useValue: mockProvaService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: TimerService, useValue: mockTimerService },
        { provide: CorrecaoIaService, useValue: mockCorrecaoIa },
      ],
    })
      .overrideComponent(TentativaExecComponent, {
        set: { template: '<div></div>', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TentativaExecComponent);
    component = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await component.ngOnInit();
  }

  /** Status da correção da questão atual, como o feedback da Aurora o lê. */
  function statusAtual(): StatusCorrecao | undefined {
    return component['correcoes']().get('q-1')?.status;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();
    mockTentativaService.respostas.set([]);
    mockTentativaService.listarGemeas.mockResolvedValue({ ok: true, data: [] });
    mockTentativaService.salvarRespostaTexto.mockResolvedValue({ ok: true, data: null });
    mockTentativaService.enviarRespostaAberta.mockResolvedValue({
      ok: true,
      data: { resposta: { id: 'tr-1', questao_id: 'q-1' }, correcao: correcaoFactory('pendente') },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('faz poll até a correção fechar quando a função devolve estado não-terminal', async () => {
    mockCorrecaoIa.corrigir.mockResolvedValue({ ok: true, data: correcaoFactory('corrigindo') });
    mockTentativaService.listarCorrecoes
      .mockResolvedValueOnce({ ok: true, data: [correcaoFactory('corrigindo')] })
      .mockResolvedValueOnce({ ok: true, data: [correcaoFactory('corrigida')] });

    await setup('estudo');
    await component['onEnviarTexto']('minha resposta');
    await vi.advanceTimersByTimeAsync(0);
    expect(statusAtual()).toBe('corrigindo');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(statusAtual()).toBe('corrigindo');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(statusAtual()).toBe('corrigida');
    expect(component['correcoes']().get('q-1')?.pontos).toBe(80);

    // Estado terminal encerra o poll.
    const chamadas = mockTentativaService.listarCorrecoes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockTentativaService.listarCorrecoes.mock.calls.length).toBe(chamadas);
  });

  it('cai em erro (com retry) se a correção nunca fecha, em vez de girar para sempre', async () => {
    mockCorrecaoIa.corrigir.mockResolvedValue({ ok: true, data: correcaoFactory('corrigindo') });
    mockTentativaService.listarCorrecoes.mockResolvedValue({
      ok: true,
      data: [correcaoFactory('corrigindo')],
    });

    await setup('estudo');
    await component['onEnviarTexto']('minha resposta');
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(statusAtual()).toBe('corrigindo');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(statusAtual()).toBe('erro');

    // Depois do erro o poll para: o aluno decide pelo "tentar de novo".
    const chamadas = mockTentativaService.listarCorrecoes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockTentativaService.listarCorrecoes.mock.calls.length).toBe(chamadas);
  });

  it('não trava o botão de envio esperando a correção', async () => {
    mockCorrecaoIa.corrigir.mockResolvedValue({ ok: true, data: correcaoFactory('corrigindo') });
    mockTentativaService.listarCorrecoes.mockResolvedValue({
      ok: true,
      data: [correcaoFactory('corrigindo')],
    });

    await setup('estudo');
    await component['onEnviarTexto']('minha resposta');

    expect(component['enviandoAberta']().has('q-1')).toBe(false);
    expect(component['enviadas']().has('q-1')).toBe(true);
  });

  it('retoma a correção presa ao recarregar a prova (pós-F5)', async () => {
    mockTentativaService.respostas.set([
      {
        id: 'tr-1',
        questao_id: 'q-1',
        alternativa_id: null,
        resposta_texto: 'minha resposta',
        enviada_em: '2024-01-01T10:05:00Z',
        anulada_usuario: false,
      },
    ]);
    mockTentativaService.listarCorrecoes.mockResolvedValue({
      ok: true,
      data: [correcaoFactory('corrigindo')],
    });
    mockCorrecaoIa.corrigir.mockResolvedValue({ ok: true, data: correcaoFactory('corrigida') });

    await setup('estudo');
    await vi.advanceTimersByTimeAsync(0);

    expect(mockCorrecaoIa.corrigir).toHaveBeenCalledWith('tr-1');
    expect(statusAtual()).toBe('corrigida');
  });

  it('em simulado não expõe erro de correção na tela da prova', async () => {
    mockCorrecaoIa.corrigir.mockResolvedValue({ ok: false, error: 'falhou' });

    await setup('simulado');
    await component['onEnviarTexto']('minha resposta');
    await vi.advanceTimersByTimeAsync(0);

    expect(statusAtual()).toBe('pendente');
    expect(mockNotificationService.error).not.toHaveBeenCalled();
  });
});

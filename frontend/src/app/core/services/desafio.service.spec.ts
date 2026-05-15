import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DesafioService } from './desafio.service';
import { SupabaseService } from './supabase.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRpcStub(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

function makeSupabaseMock(rpcResult: { data: unknown; error: unknown }) {
  const client = makeRpcStub(rpcResult);
  return { provide: SupabaseService, useValue: { client } };
}

const questaoRaw = {
  id: 'q-1',
  enunciado: 'Qual é a capital do Brasil?',
  enunciado_apoio: null,
  imagem_url: null,
  dificuldade: 2,
  disciplina: 'Geografia',
};

const altRaw = (id: string, letra: string, correta?: boolean) => ({
  id,
  letra,
  texto: `Alternativa ${letra}`,
  ordem: letra.charCodeAt(0) - 65,
  ...(correta !== undefined ? { correta } : {}),
});

const estatisticaRaw = { total_responderam: 10, percentual_acerto: 70 };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DesafioService', () => {
  describe('carregarDesafio — disponivel: false', () => {
    let service: DesafioService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          DesafioService,
          makeSupabaseMock({ data: { disponivel: false }, error: null }),
        ],
      });
      service = TestBed.inject(DesafioService);
    });

    it('seta desafio com disponivel=false', async () => {
      await service.carregarDesafio();
      expect(service.desafio()?.disponivel).toBe(false);
    });

    it('retorna ok=true mesmo quando indisponível', async () => {
      const result = await service.carregarDesafio();
      expect(result.ok).toBe(true);
    });

    it('alternativas fica vazia', async () => {
      await service.carregarDesafio();
      expect(service.desafio()?.alternativas).toHaveLength(0);
    });
  });

  describe('carregarDesafio — pendente (sem minha_resposta)', () => {
    let service: DesafioService;

    const rpcData = {
      disponivel: true,
      data: '2026-05-15',
      questao: questaoRaw,
      alternativas: [altRaw('a1', 'A'), altRaw('a2', 'B'), altRaw('a3', 'C')],
      minha_resposta: null,
      estatistica: estatisticaRaw,
    };

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [DesafioService, makeSupabaseMock({ data: rpcData, error: null })],
      });
      service = TestBed.inject(DesafioService);
    });

    it('seta disponivel=true', async () => {
      await service.carregarDesafio();
      expect(service.desafio()?.disponivel).toBe(true);
    });

    it('parseia questao corretamente', async () => {
      await service.carregarDesafio();
      const q = service.desafio()?.questao;
      expect(q?.id).toBe('q-1');
      expect(q?.enunciado).toBe('Qual é a capital do Brasil?');
      expect(q?.disciplina).toBe('Geografia');
    });

    it('parseia 3 alternativas sem campo correta', async () => {
      await service.carregarDesafio();
      const alts = service.desafio()?.alternativas ?? [];
      expect(alts).toHaveLength(3);
      expect(alts.every((a) => a.correta === undefined)).toBe(true);
    });

    it('minha_resposta é null', async () => {
      await service.carregarDesafio();
      expect(service.desafio()?.minha_resposta).toBeNull();
    });

    it('parseia estatistica', async () => {
      await service.carregarDesafio();
      const e = service.desafio()?.estatistica;
      expect(e?.total_responderam).toBe(10);
      expect(e?.percentual_acerto).toBe(70);
    });
  });

  describe('carregarDesafio — já respondida (minha_resposta presente)', () => {
    let service: DesafioService;

    const minhaRespostaRaw = {
      alternativa_id: 'a2',
      correta: false,
      xp_ganho: 10,
      respondido_em: '2026-05-15T10:00:00Z',
    };

    const rpcData = {
      disponivel: true,
      data: '2026-05-15',
      questao: { ...questaoRaw, explicacao: 'Brasília é a capital.' },
      alternativas: [
        altRaw('a1', 'A', true),
        altRaw('a2', 'B', false),
        altRaw('a3', 'C', false),
      ],
      minha_resposta: minhaRespostaRaw,
      estatistica: estatisticaRaw,
    };

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [DesafioService, makeSupabaseMock({ data: rpcData, error: null })],
      });
      service = TestBed.inject(DesafioService);
    });

    it('parseia alternativas com campo correta', async () => {
      await service.carregarDesafio();
      const alts = service.desafio()?.alternativas ?? [];
      expect(alts[0].correta).toBe(true);
      expect(alts[1].correta).toBe(false);
    });

    it('parseia minha_resposta', async () => {
      await service.carregarDesafio();
      const mr = service.desafio()?.minha_resposta;
      expect(mr?.alternativa_id).toBe('a2');
      expect(mr?.correta).toBe(false);
      expect(mr?.xp_ganho).toBe(10);
    });

    it('parseia explicacao na questao', async () => {
      await service.carregarDesafio();
      expect(service.desafio()?.questao?.explicacao).toBe('Brasília é a capital.');
    });
  });

  describe('carregarDesafio — erro no Supabase', () => {
    let service: DesafioService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          DesafioService,
          makeSupabaseMock({ data: null, error: new Error('Network error') }),
        ],
      });
      service = TestBed.inject(DesafioService);
    });

    it('retorna ok=false com mensagem de erro', async () => {
      const result = await service.carregarDesafio();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Não foi possível');
      }
    });

    it('mantém desafio como null', async () => {
      await service.carregarDesafio();
      expect(service.desafio()).toBeNull();
    });
  });

  describe('responderDesafio — resposta correta', () => {
    let service: DesafioService;
    let rpcMock: ReturnType<typeof makeRpcStub>;

    const desafioInicial = {
      disponivel: true,
      data: '2026-05-15',
      questao: questaoRaw,
      alternativas: [altRaw('a1', 'A'), altRaw('a2', 'B'), altRaw('a3', 'C')],
      minha_resposta: null,
      estatistica: { total_responderam: 5, percentual_acerto: 60 },
    };

    const responderResult = {
      ja_respondeu: false,
      correta: true,
      xp_ganho: 50,
      novas_conquistas: [],
      stats: {
        xp_total: 550,
        xp_semana_atual: 150,
        semana_iso: '2026-W20',
        nivel: 3,
        streak_atual: 5,
        streak_recorde: 10,
        freezes_disponiveis: 1,
        competir_publico: true,
      },
      estatistica: { total_responderam: 6, percentual_acerto: 67 },
    };

    // Desafio com estado respondido (retornado após refetch)
    const desafioRespondido = {
      disponivel: true,
      data: '2026-05-15',
      questao: questaoRaw,
      alternativas: [altRaw('a1', 'A', true), altRaw('a2', 'B', false), altRaw('a3', 'C', false)],
      minha_resposta: {
        alternativa_id: 'a1',
        correta: true,
        xp_ganho: 50,
        respondido_em: '2026-05-15T10:00:00Z',
      },
      estatistica: { total_responderam: 6, percentual_acerto: 67 },
    };

    beforeEach(async () => {
      rpcMock = makeRpcStub({ data: desafioInicial, error: null });
      TestBed.configureTestingModule({
        providers: [DesafioService, { provide: SupabaseService, useValue: { client: rpcMock } }],
      });
      service = TestBed.inject(DesafioService);
      // Carrega estado inicial
      await service.carregarDesafio();
      // Responder retorna o resultado; refetch retorna o desafio respondido
      rpcMock.rpc
        .mockResolvedValueOnce({ data: responderResult, error: null })
        .mockResolvedValueOnce({ data: desafioRespondido, error: null });
    });

    it('retorna ok=true com dados corretos', async () => {
      const result = await service.responderDesafio('a1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.correta).toBe(true);
        expect(result.data.xp_ganho).toBe(50);
      }
    });

    it('signal reflete estado respondido (minha_resposta + correta nas alts)', async () => {
      await service.responderDesafio('a1');
      const d = service.desafio();
      expect(d?.minha_resposta?.correta).toBe(true);
      expect(d?.minha_resposta?.alternativa_id).toBe('a1');
      expect(d?.alternativas.find((a) => a.id === 'a1')?.correta).toBe(true);
    });

    it('atualiza estatistica no signal após refetch', async () => {
      await service.responderDesafio('a1');
      expect(service.desafio()?.estatistica.total_responderam).toBe(6);
    });
  });
});

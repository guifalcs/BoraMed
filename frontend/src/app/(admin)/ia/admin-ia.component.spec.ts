import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminIaComponent } from './admin-ia.component';
import {
  AdminService,
  AdminIaAgente,
  AdminIaRanking,
  AdminIaRankingUsuario,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

/** Template blanqueado — exercitamos só a lógica da classe (signals/computed). */

const AURORA: AdminIaAgente = {
  id: 'ia-1',
  slug: 'aurora',
  nome: 'Aurora',
  ativo: true,
  temperatura: 0,
  limite_diario: 200,
  max_resposta_chars: 3000,
  persona: 'Corretor rigoroso.',
  tom: 'Direto.',
  tamanho_feedback: 'Curto.',
  regras_correcao: null,
  regras_extras: null,
  atualizado_em: '2026-07-09T12:00:00Z',
};

function usuarioRanking(over: Partial<AdminIaRankingUsuario>): AdminIaRankingUsuario {
  return {
    user_id: 'u-1',
    nome: 'Aluno',
    email: 'aluno@ex.com',
    avatar_url: null,
    tipo_usuario: 'aluno',
    correcoes: 0,
    erros: 0,
    sem_ia: 0,
    tokens_prompt: 0,
    tokens_resposta: 0,
    tokens_total: 0,
    custo_usd: 0,
    correcoes_hoje: 0,
    primeira_em: null,
    ultima_em: null,
    ...over,
  };
}

const RANKING: AdminIaRanking = {
  dias: 30,
  total_usuarios: 2,
  total_correcoes: 30,
  total_tokens: 3000,
  total_custo_usd: 0.3,
  usuarios: [
    usuarioRanking({ user_id: 'u-1', nome: 'Ana', correcoes: 10, tokens_total: 2000, custo_usd: 0.1, correcoes_hoje: 200 }),
    usuarioRanking({ user_id: 'u-2', nome: 'Bruno', correcoes: 20, tokens_total: 1000, custo_usd: 0.2, correcoes_hoje: 3 }),
  ],
};

interface CompApi {
  ngOnInit(): Promise<void>;
  form(): {
    ativo: boolean;
    temperatura: number;
    limite_diario: number;
    max_resposta_chars: number;
  } | null;
  erros(): string[];
  sujo(): boolean;
  marcarSujo(): void;
  salvar(): Promise<void>;
  selecionadoId(): string | null;
  ranking(): AdminIaRanking | null;
  rankingOrdenado(): AdminIaRankingUsuario[];
  rankingDias(): number;
  ordenarPor(chave: 'custo' | 'correcoes' | 'tokens'): void;
  mudarJanela(dias: number): Promise<void>;
  atingiuLimite(u: AdminIaRankingUsuario): boolean;
  erroRanking(): string | null;
}

async function setup(agente: AdminIaAgente = AURORA) {
  const admin = {
    listarIaAgentes: vi.fn().mockResolvedValue({ ok: true, data: [agente] }),
    salvarIaAgente: vi.fn().mockResolvedValue({ ok: true, data: { ...agente, limite_diario: 150 } }),
    getRankingIaUsuarios: vi.fn().mockResolvedValue({ ok: true, data: RANKING }),
  };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [AdminIaComponent],
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: NotificationService, useValue: toast },
    ],
  })
    .overrideComponent(AdminIaComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(AdminIaComponent);
  const comp = fixture.componentInstance as unknown as CompApi;
  return { comp, admin, toast };
}

describe('AdminIaComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('carrega os agentes e popula o form com o primeiro (aurora)', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();

    expect(comp.selecionadoId()).toBe('ia-1');
    expect(comp.form()?.limite_diario).toBe(200);
    expect(comp.erros()).toHaveLength(0);
    expect(comp.sujo()).toBe(false);
  });

  it('validação: temperatura fora de 0–2 e limite fora de 1–1000 geram erros', async () => {
    const { comp } = await setup({ ...AURORA, temperatura: 5, limite_diario: 5000 });
    await comp.ngOnInit();

    const erros = comp.erros();
    expect(erros.some((e) => e.includes('Temperatura'))).toBe(true);
    expect(erros.some((e) => e.includes('Limite diário'))).toBe(true);
  });

  it('salvar envia o patch e marca o form como limpo', async () => {
    const { comp, admin, toast } = await setup();
    await comp.ngOnInit();

    comp.marcarSujo();
    expect(comp.sujo()).toBe(true);

    await comp.salvar();

    expect(admin.salvarIaAgente).toHaveBeenCalledTimes(1);
    const [id, patch] = admin.salvarIaAgente.mock.calls[0];
    expect(id).toBe('ia-1');
    expect(patch).toMatchObject({ ativo: true, limite_diario: 200 });
    expect(toast.success).toHaveBeenCalled();
    expect(comp.sujo()).toBe(false);
  });

  it('não salva quando há erros de validação', async () => {
    const { comp, admin } = await setup({ ...AURORA, temperatura: 9 });
    await comp.ngOnInit();
    comp.marcarSujo();

    await comp.salvar();

    expect(admin.salvarIaAgente).not.toHaveBeenCalled();
  });

  it('carrega o ranking de consumo por aluno em 30 dias e ordena por custo', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    expect(admin.getRankingIaUsuarios).toHaveBeenCalledWith(30, 50);
    expect(comp.ranking()?.total_usuarios).toBe(2);
    expect(comp.rankingOrdenado().map((u) => u.user_id)).toEqual(['u-2', 'u-1']);
  });

  it('ordenação alternativa por correções e por tokens', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();

    comp.ordenarPor('correcoes');
    expect(comp.rankingOrdenado()[0].user_id).toBe('u-2');

    comp.ordenarPor('tokens');
    expect(comp.rankingOrdenado()[0].user_id).toBe('u-1');
  });

  it('troca de janela refaz a consulta com os dias novos', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    await comp.mudarJanela(0);

    expect(comp.rankingDias()).toBe(0);
    expect(admin.getRankingIaUsuarios).toHaveBeenLastCalledWith(0, 50);
  });

  it('marca quem bateu o limite diário do agente', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();

    const [ana, bruno] = RANKING.usuarios;
    expect(comp.atingiuLimite(ana)).toBe(true);
    expect(comp.atingiuLimite(bruno)).toBe(false);
  });

  it('falha no ranking não derruba a tela de configuração', async () => {
    const { comp, admin } = await setup();
    admin.getRankingIaUsuarios.mockResolvedValueOnce({ ok: false, error: 'permission_denied' });
    await comp.ngOnInit();

    expect(comp.erroRanking()).toContain('consumo');
    expect(comp.form()?.limite_diario).toBe(200);
  });
});

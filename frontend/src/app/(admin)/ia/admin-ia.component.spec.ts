import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminIaComponent } from './admin-ia.component';
import { AdminService, AdminIaAgente } from '../../core/services/admin.service';
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
}

async function setup(agente: AdminIaAgente = AURORA) {
  const admin = {
    listarIaAgentes: vi.fn().mockResolvedValue({ ok: true, data: [agente] }),
    salvarIaAgente: vi.fn().mockResolvedValue({ ok: true, data: { ...agente, limite_diario: 150 } }),
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
});

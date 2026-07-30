import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCampanhasComponent } from './admin-campanhas.component';
import {
  AdminCampanhaEmail,
  AdminService,
  SegmentoCampanha,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

/** Template blanqueado — exercitamos só a lógica da classe (signals/computed). */

const CAMPANHA: AdminCampanhaEmail = {
  id: 'camp-1',
  criado_em: '2026-07-30T12:00:00Z',
  nome: 'Reativação julho',
  assunto: 'Sua conta está te esperando',
  segmento: 'sem_assinatura_ativa',
  status: 'parcial',
  total_destinatarios: 300,
  total_enviados: 200,
  total_falhas: 0,
  total_cancelados: 0,
  erro: 'disparo interrompido — use "Retomar" para enviar o restante',
  criado_por_email: 'admin@boramed.com.br',
};

interface CompApi {
  ngOnInit(): Promise<void>;
  nome: { set(v: string): void };
  assunto: { set(v: string): void };
  html: { set(v: string): void };
  segmento(): SegmentoCampanha;
  totalPublico(): number | null;
  historico(): AdminCampanhaEmail[];
  confirmandoDisparo(): boolean;
  formularioValido(): boolean;
  onSegmentoChange(valor: string): Promise<void>;
  pedirConfirmacao(): void;
  dispararAgora(): Promise<void>;
  enviarTeste(): Promise<void>;
  retomar(c: AdminCampanhaEmail): Promise<void>;
}

async function setup(overrides: Record<string, unknown> = {}) {
  const admin = {
    contarPublicoCampanha: vi.fn().mockResolvedValue({ ok: true, data: 42 }),
    listarCampanhasEmail: vi.fn().mockResolvedValue({ ok: true, data: [CAMPANHA] }),
    enviarCampanhaTeste: vi.fn().mockResolvedValue({ ok: true, data: { enviados: 1, destino: 'eu@x.com' } }),
    dispararCampanhaEmail: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { campanha_id: 'camp-2', enviados: 42, falhas: 0, pendentes: 0 } }),
    retomarCampanhaEmail: vi.fn().mockResolvedValue({ ok: true, data: { enviados: 100 } }),
    ...overrides,
  };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [AdminCampanhasComponent],
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: NotificationService, useValue: toast },
    ],
  })
    .overrideComponent(AdminCampanhasComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(AdminCampanhasComponent);
  const comp = fixture.componentInstance as unknown as CompApi;
  return { comp, admin, toast };
}

function preencher(comp: CompApi): void {
  comp.nome.set('Reativação julho');
  comp.assunto.set('Sua conta está te esperando');
  comp.html.set('<p>Oi</p>');
}

describe('AdminCampanhasComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('carrega contagem do público e histórico no ngOnInit', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    expect(admin.contarPublicoCampanha).toHaveBeenCalledWith('sem_assinatura_ativa');
    expect(comp.totalPublico()).toBe(42);
    expect(comp.historico()).toEqual([CAMPANHA]);
  });

  it('trocar de segmento recontabiliza o público', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    await comp.onSegmentoChange('ex_assinantes');

    expect(comp.segmento()).toBe('ex_assinantes');
    expect(admin.contarPublicoCampanha).toHaveBeenLastCalledWith('ex_assinantes');
  });

  it('não dispara direto: exige confirmação explícita', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();
    preencher(comp);

    comp.pedirConfirmacao();

    expect(comp.confirmandoDisparo()).toBe(true);
    expect(admin.dispararCampanhaEmail).not.toHaveBeenCalled();
  });

  it('bloqueia a confirmação quando o segmento está vazio', async () => {
    const { comp, toast } = await setup({
      contarPublicoCampanha: vi.fn().mockResolvedValue({ ok: true, data: 0 }),
    });
    await comp.ngOnInit();
    preencher(comp);

    comp.pedirConfirmacao();

    expect(comp.confirmandoDisparo()).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Nenhum destinatário nesse segmento.');
  });

  it('bloqueia a confirmação com formulário incompleto', async () => {
    const { comp, toast } = await setup();
    await comp.ngOnInit();
    comp.assunto.set('só o assunto');

    expect(comp.formularioValido()).toBe(false);
    comp.pedirConfirmacao();

    expect(comp.confirmandoDisparo()).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('dispara com os dados do formulário e recarrega o histórico', async () => {
    const { comp, admin, toast } = await setup();
    await comp.ngOnInit();
    preencher(comp);
    comp.pedirConfirmacao();

    await comp.dispararAgora();

    expect(admin.dispararCampanhaEmail).toHaveBeenCalledWith(
      'Reativação julho',
      'Sua conta está te esperando',
      '<p>Oi</p>',
      'sem_assinatura_ativa',
    );
    expect(comp.confirmandoDisparo()).toBe(false);
    expect(admin.listarCampanhasEmail).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Campanha enviada para 42 pessoas.');
  });

  it('avisa sobre pendentes quando o disparo volta parcial', async () => {
    const { comp, toast } = await setup({
      dispararCampanhaEmail: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { enviados: 200, falhas: 0, pendentes: 100 } }),
    });
    await comp.ngOnInit();
    preencher(comp);

    await comp.dispararAgora();

    expect(toast.success).toHaveBeenCalledWith(
      '200 enviados. 100 ficaram pendentes — use "Retomar" no histórico.',
    );
  });

  it('sinaliza erro quando a campanha volta com status "falhou"', async () => {
    const { comp, toast } = await setup({
      dispararCampanhaEmail: vi.fn().mockResolvedValue({
        ok: true,
        data: { campanha_id: 'camp-3', status: 'falhou', enviados: 0, falhas: 42, pendentes: 0 },
      }),
    });
    await comp.ngOnInit();
    preencher(comp);

    await comp.dispararAgora();

    expect(toast.error).toHaveBeenCalledWith(
      'Nenhum e-mail saiu — confira a chave do Resend e o domínio do remetente.',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('propaga o erro da edge function para o toast', async () => {
    const { comp, toast } = await setup({
      dispararCampanhaEmail: vi.fn().mockResolvedValue({ ok: false, error: 'remetente inválido' }),
    });
    await comp.ngOnInit();
    preencher(comp);

    await comp.dispararAgora();

    expect(toast.error).toHaveBeenCalledWith('remetente inválido');
  });

  it('teste exige assunto e corpo preenchidos', async () => {
    const { comp, admin, toast } = await setup();
    await comp.ngOnInit();

    comp.assunto.set('');
    await comp.enviarTeste();

    expect(admin.enviarCampanhaTeste).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Preencha assunto e corpo antes de testar.');
  });

  it('retomar chama a function com o id da campanha e recarrega', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    await comp.retomar(CAMPANHA);

    expect(admin.retomarCampanhaEmail).toHaveBeenCalledWith('camp-1');
    expect(admin.listarCampanhasEmail).toHaveBeenCalledTimes(2);
  });
});

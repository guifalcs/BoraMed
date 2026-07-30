import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCampanhasComponent } from './admin-campanhas.component';
import {
  AdminCampanhaEmail,
  AdminService,
  PreviaCampanhaEmail,
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

const PREVIA: PreviaCampanhaEmail = {
  remetente: 'BoraMed <contato@boramedoficial.com.br>',
  destino: 'admin@boramed.com.br',
  assunto: 'Maria, sua conta está te esperando',
  html: '<p style="color:#0f172a">Oi, Maria!</p>',
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
  previa(): PreviaCampanhaEmail | null;
  erroPrevia(): string | null;
  carregandoPrevia(): boolean;
  mostrarPrevia(): boolean;
  alternarPrevia(): void;
  recarregarPrevia(): Promise<void>;
  modoPrevia: { set(v: 'desktop' | 'mobile'): void };
  larguraPrevia(): number;
  previaSrcdoc(): unknown;
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
    previaCampanhaEmail: vi.fn().mockResolvedValue({ ok: true, data: PREVIA }),
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

/**
 * Igual ao `setup`, mas com o template REAL. Serve para exercitar o binding do
 * `<iframe [srcdoc]>`: o Angular só valida atributo de iframe em tempo de
 * execução, então template blanqueado não pegaria um NG0910 nem o HTML sumindo
 * no sanitizer.
 */
async function setupComTemplate() {
  const admin = {
    contarPublicoCampanha: vi.fn().mockResolvedValue({ ok: true, data: 42 }),
    listarCampanhasEmail: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    previaCampanhaEmail: vi.fn().mockResolvedValue({ ok: true, data: PREVIA }),
  };

  await TestBed.configureTestingModule({
    imports: [AdminCampanhasComponent],
    providers: [
      { provide: AdminService, useValue: admin },
      {
        provide: NotificationService,
        useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminCampanhasComponent);
  const comp = fixture.componentInstance as unknown as CompApi;
  return { fixture, comp, admin };
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

  it('prévia usa a renderização da edge function, sem montar HTML no cliente', async () => {
    const { comp, admin } = await setup();
    comp.assunto.set('{{primeiro_nome}}, sua conta está te esperando');
    comp.html.set('<p>Oi, {{primeiro_nome}}!</p>');

    await comp.recarregarPrevia();

    expect(admin.previaCampanhaEmail).toHaveBeenCalledWith(
      '{{primeiro_nome}}, sua conta está te esperando',
      '<p>Oi, {{primeiro_nome}}!</p>',
    );
    expect(comp.previa()).toEqual(PREVIA);
    expect(comp.carregandoPrevia()).toBe(false);
  });

  it('não pede prévia com o corpo vazio', async () => {
    const { comp, admin } = await setup();
    comp.html.set('   ');

    await comp.recarregarPrevia();

    expect(admin.previaCampanhaEmail).not.toHaveBeenCalled();
  });

  it('descarta resposta de prévia que chega fora de ordem', async () => {
    const pendentes: ((v: unknown) => void)[] = [];
    const { comp } = await setup({
      previaCampanhaEmail: vi.fn(() => new Promise((resolve) => pendentes.push(resolve))),
    });

    comp.html.set('<p>antiga</p>');
    const antiga = comp.recarregarPrevia();
    comp.html.set('<p>nova</p>');
    const nova = comp.recarregarPrevia();

    // A nova resolve primeiro; a antiga chega depois e não pode sobrescrever.
    pendentes[1]({ ok: true, data: { ...PREVIA, html: '<p>nova</p>' } });
    pendentes[0]({ ok: true, data: { ...PREVIA, html: '<p>antiga</p>' } });
    await Promise.all([antiga, nova]);

    expect(comp.previa()?.html).toBe('<p>nova</p>');
  });

  it('erro de prévia fica na própria seção, sem virar toast', async () => {
    const { comp, toast } = await setup({
      previaCampanhaEmail: vi.fn().mockResolvedValue({ ok: false, error: 'corpo inválido' }),
    });
    comp.html.set('<p>x</p>');

    await comp.recarregarPrevia();

    expect(comp.erroPrevia()).toBe('corpo inválido');
    expect(comp.previa()).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('alterna a visibilidade e a largura simulada da prévia', async () => {
    const { comp } = await setup();

    expect(comp.mostrarPrevia()).toBe(true);
    expect(comp.larguraPrevia()).toBe(640);

    comp.modoPrevia.set('mobile');
    expect(comp.larguraPrevia()).toBe(375);

    comp.alternarPrevia();
    expect(comp.mostrarPrevia()).toBe(false);
  });

  it('renderiza a prévia num iframe sandbox, preservando os style inline', async () => {
    const { fixture, comp } = await setupComTemplate();
    comp.html.set('<p style="color:#111">Oi, {{primeiro_nome}}!</p>');

    await comp.recarregarPrevia();
    fixture.detectChanges();

    const iframe: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe.preview-frame');
    expect(iframe).toBeTruthy();
    // sandbox vazio = sem scripts e sem same-origin.
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toContain('Oi, Maria!');
    // O sanitizer do Angular comeria o style= e o e-mail perderia o layout.
    expect(iframe.getAttribute('srcdoc')).toContain('style="color:#0f172a"');
    expect(fixture.nativeElement.textContent).toContain(PREVIA.assunto);

    fixture.destroy(); // encerra o debounce pendente do effect
  });

  it('retomar chama a function com o id da campanha e recarrega', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    await comp.retomar(CAMPANHA);

    expect(admin.retomarCampanhaEmail).toHaveBeenCalledWith('camp-1');
    expect(admin.listarCampanhasEmail).toHaveBeenCalledTimes(2);
  });
});

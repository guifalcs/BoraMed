import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminQuestoesComponent } from './admin-questoes.component';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/**
 * Valida a linkagem de grupo de equivalência ao criar uma cópia discursiva
 * (gêmea) a partir de uma questão fechada. Se isso quebra, nenhum grupo é
 * criado e a deduplicação/rodízio do sorteio deixa de ter efeito prático.
 *
 * Template é blanqueado (overrideComponent) — só exercitamos a lógica da classe.
 */

function questaoFechadaMock(grupo: string | null) {
  return {
    ok: true as const,
    data: {
      id: 'orig-1',
      enunciado: 'Qual a tríade de Charcot?',
      enunciado_apoio: null,
      imagem_url: null,
      imagem_legenda: null,
      formato: 'multipla_escolha',
      tipo_questao: 'processual',
      formato_prova: null,
      status: 'ativa',
      disciplina_id: 'disc-1',
      prova_id: null,
      ordem_na_prova: null,
      explicacao: 'Febre, icterícia e dor.',
      explicacao_alternativas: null,
      referencia: null,
      fonte: null,
      resposta_correta_texto: null,
      respostas_aceitas: null,
      resposta_modelo: null,
      pontos_chave: [],
      criterios_correcao: null,
      revisado: true,
      apto_desafio_diario: true,
      vezes_respondida: 0,
      vezes_acertada: 0,
      taxa_acerto: null,
      autor_id: 'admin-1',
      revisor_id: null,
      aprovada_em: null,
      publicada_em: null,
      origem_geracao: 'manual',
      nivel_bloom: null,
      grupo_equivalencia_id: grupo,
      revisao_conversao: null,
      criado_em: '2026-01-01T00:00:00Z',
      atualizado_em: '2026-01-01T00:00:00Z',
      alternativas: [
        { letra: 'A', texto: 'Febre, icterícia e dor em HCD', correta: true, ordem: 1 },
        { letra: 'B', texto: 'Alternativa errada', correta: false, ordem: 2 },
      ],
      temas: [],
    },
  };
}

function makeAdminMock(grupoOriginal: string | null) {
  return {
    buscarQuestaoCompleta: vi.fn().mockResolvedValue(questaoFechadaMock(grupoOriginal)),
    criarQuestaoCompleta: vi.fn().mockResolvedValue({ ok: true, data: 'new-id' }),
    atualizarQuestao: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    // Chamados por carregar()/contadores no fim do save() de sucesso.
    listarQuestoes: vi.fn().mockResolvedValue({ ok: true, data: { questoes: [], total: 0 } }),
    contarQuestoesPorFormato: vi.fn().mockResolvedValue({
      ok: true,
      data: { total: 0, fechadas: 0, abertas: 0, pendentesRevisao: 0 },
    }),
    deletarArquivoStorage: vi.fn(),
  };
}

async function setup(grupoOriginal: string | null) {
  const admin = makeAdminMock(grupoOriginal);
  const auth = { user: () => ({ id: 'admin-1' }) };
  const toast = { success: vi.fn(), error: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [AdminQuestoesComponent],
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: AuthService, useValue: auth },
      { provide: NotificationService, useValue: toast },
    ],
  })
    .overrideComponent(AdminQuestoesComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(AdminQuestoesComponent);
  // Não chamamos detectChanges() de propósito: evita disparar ngOnInit.
  const comp = fixture.componentInstance as unknown as {
    modoDrawer: () => string;
    abrirEditar: (q: unknown) => Promise<void>;
    criarCopiaDiscursiva: () => void;
    salvar: () => Promise<void>;
    abrirCriar: () => void;
  };
  return { comp, admin, toast };
}

describe('AdminQuestoesComponent — cópia discursiva vincula grupo de equivalência', () => {
  beforeEach(() => vi.clearAllMocks());

  it('original SEM grupo: cria um grupo novo, carimba a original e usa o mesmo na gêmea', async () => {
    const { comp, admin } = await setup(null);

    await comp.abrirEditar({ id: 'orig-1', formato: 'multipla_escolha' });
    expect(comp.modoDrawer()).toBe('editar');

    comp.criarCopiaDiscursiva();
    expect(comp.modoDrawer()).toBe('criar');

    await comp.salvar();

    // A original foi vinculada a um grupo novo…
    expect(admin.atualizarQuestao).toHaveBeenCalledTimes(1);
    const [origemId, patch] = admin.atualizarQuestao.mock.calls[0];
    expect(origemId).toBe('orig-1');
    const grupo = (patch as { grupo_equivalencia_id: string }).grupo_equivalencia_id;
    expect(grupo).toEqual(expect.any(String));

    // …e a gêmea criada compartilha exatamente esse grupo, como discursiva.
    expect(admin.criarQuestaoCompleta).toHaveBeenCalledTimes(1);
    const payload = admin.criarQuestaoCompleta.mock.calls[0][0] as {
      grupo_equivalencia_id?: string;
      formato: string;
    };
    expect(payload.grupo_equivalencia_id).toBe(grupo);
    expect(payload.formato).toBe('resposta_aberta_curta');
  });

  it('original JÁ com grupo: reutiliza o grupo e NÃO re-carimba a original', async () => {
    const { comp, admin } = await setup('grupo-existente');

    await comp.abrirEditar({ id: 'orig-1', formato: 'multipla_escolha' });
    comp.criarCopiaDiscursiva();
    await comp.salvar();

    expect(admin.atualizarQuestao).not.toHaveBeenCalled();
    const payload = admin.criarQuestaoCompleta.mock.calls[0][0] as { grupo_equivalencia_id?: string };
    expect(payload.grupo_equivalencia_id).toBe('grupo-existente');
  });

  it('questão nova comum (sem conversão): não recebe grupo de equivalência', async () => {
    const { comp, admin } = await setup(null);

    comp.abrirCriar();
    // preenche o mínimo para o save de uma discursiva avulsa (signals via .set)
    (comp as unknown as { fEnunciado: { set: (v: string) => void } }).fEnunciado.set('Enunciado avulso');
    (comp as unknown as { fFormato: { set: (v: string) => void } }).fFormato.set('resposta_aberta_curta');
    (comp as unknown as { fRespostaModelo: { set: (v: string) => void } }).fRespostaModelo.set('Resposta modelo');

    await comp.salvar();

    expect(admin.atualizarQuestao).not.toHaveBeenCalled();
    const payload = admin.criarQuestaoCompleta.mock.calls[0][0] as { grupo_equivalencia_id?: string };
    expect(payload.grupo_equivalencia_id).toBeUndefined();
  });
});

import { Injectable, PLATFORM_ID, PendingTasks, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { lerErroFunction, type ServiceResult } from './admin.service';
import type {
  AdminGabaritoProva,
  GabaritoProva,
  GabaritoProvaPayload,
  GabaritoProvaResumo,
  GabaritoProvaVitrine,
  GabaritoEmailPrevia,
  GabaritoEmailResultado,
  GabaritoPublicacaoResultado,
} from '../models/gabarito-prova';

/** Mensagens amigáveis para os códigos levantados pelas RPCs. */
const ERROS: Record<string, string> = {
  tipo_prova_obrigatorio: 'Informe o tipo da prova.',
  periodo_invalido: 'Escolha um período entre 1º e 12º.',
  semestre_invalido: 'Semestre no formato 2026.2.',
  qtd_alternativas_invalida: 'Quantidade de alternativas inválida.',
  quantidade_questoes_invalida: 'O gabarito precisa ter de 1 a 200 questões.',
  numeracao_invalida: 'Numeração das questões inconsistente.',
  resposta_fora_das_alternativas: 'Há letra fora das alternativas da prova.',
  gabarito_vazio: 'Preencha ao menos uma questão antes de publicar.',
  gabarito_nao_encontrado: 'Gabarito não encontrado.',
  permission_denied: 'Sem permissão.',
};

function mensagemErro(message: string): string {
  return ERROS[message] ?? message;
}

/**
 * Gabaritos extraoficiais de provas: leitura pública (anon) e gestão do admin.
 *
 * As leituras públicas rodam no SSR (/gabaritos é renderizado no servidor para
 * o preview do link no WhatsApp e para SEO). Por isso elas: (1) registram a
 * requisição em `PendingTasks`, senão o SSR zoneless serializa a página antes
 * do Supabase responder; (2) passam o resultado por `TransferState`, para a
 * hidratação não refazer a chamada nem piscar o estado de carregamento.
 */
@Injectable({ providedIn: 'root' })
export class GabaritoProvaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async listar(periodo: number | null = null): Promise<ServiceResult<GabaritoProvaResumo[]>> {
    return this.comTransferencia(`gabaritos:lista:${periodo ?? 'todos'}`, async () => {
      const { data, error } = await this.supabase.rpc('listar_gabaritos_provas', { p_periodo: periodo });
      if (error) return { ok: false, error: mensagemErro(error.message) };
      return { ok: true, data: (data ?? []) as GabaritoProvaResumo[] };
    });
  }

  /** Vitrine pública (sem respostas). `data: null` = não existe ou não está publicado. */
  async obterVitrine(slug: string): Promise<ServiceResult<GabaritoProvaVitrine | null>> {
    return this.comTransferencia(`gabaritos:vitrine:${slug}`, async () => {
      const { data, error } = await this.supabase.rpc('get_gabarito_prova_vitrine', { p_slug: slug });
      if (error) return { ok: false, error: mensagemErro(error.message) };
      return { ok: true, data: (data ?? null) as GabaritoProvaVitrine | null };
    });
  }

  /**
   * Gabarito completo, com as respostas: exige conta (a RPC não executa para
   * anon). `data: null` = não existe ou não está publicado (para não-admin).
   */
  async obter(slug: string): Promise<ServiceResult<GabaritoProva | null>> {
    return this.comTransferencia(`gabaritos:item:${slug}`, async () => {
      const { data, error } = await this.supabase.rpc('get_gabarito_prova', { p_slug: slug });
      if (error) return { ok: false, error: mensagemErro(error.message) };
      return { ok: true, data: (data ?? null) as GabaritoProva | null };
    });
  }

  /**
   * Só no browser (o SSR não pode contar crawler nem preview de link) e uma vez
   * por gabarito por sessão da aba: F5 e ir/voltar não inflam o número. Não é
   * à prova de script (a RPC é pública), por isso a UI chama de
   * "visualizações", não de pessoas.
   */
  async registrarVisualizacao(slug: string): Promise<void> {
    if (!this.isBrowser) return;
    const chave = `bm-gabarito-visto:${slug}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, '1');
    } catch {
      /* storage bloqueado: conta normalmente */
    }
    await this.supabase.rpc('registrar_visualizacao_gabarito_prova', { p_slug: slug });
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminListar(): Promise<ServiceResult<AdminGabaritoProva[]>> {
    const { data, error } = await this.supabase.rpc('admin_listar_gabaritos_provas');
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: (data ?? []) as AdminGabaritoProva[] };
  }

  /** Lê o gabarito para edição (o get público devolve rascunho para admin). */
  async adminObter(slug: string): Promise<ServiceResult<GabaritoProva | null>> {
    const { data, error } = await this.supabase.rpc('get_gabarito_prova', { p_slug: slug });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: (data ?? null) as GabaritoProva | null };
  }

  async adminSalvar(payload: GabaritoProvaPayload): Promise<ServiceResult<{ id: string; slug: string }>> {
    const { data, error } = await this.supabase.rpc('admin_salvar_gabarito_prova', { p_payload: payload });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as { id: string; slug: string } };
  }

  async adminPublicar(
    id: string,
    publicar: boolean,
    notificar: boolean,
  ): Promise<ServiceResult<GabaritoPublicacaoResultado>> {
    const { data, error } = await this.supabase.rpc('admin_publicar_gabarito_prova', {
      p_id: id,
      p_publicar: publicar,
      p_notificar: notificar,
    });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as GabaritoPublicacaoResultado };
  }

  /**
   * Aviso por e-mail: até 50 alunos do período, fora de Ipatinga primeiro.
   * Idempotente no servidor (uma campanha por gabarito). Sai pela mesma edge
   * function das campanhas, então aparece no histórico de /admin/campanhas.
   */
  async adminEnviarEmail(id: string): Promise<ServiceResult<GabaritoEmailResultado>> {
    return this.invocarEmail<GabaritoEmailResultado>({ modo: 'gabarito', gabarito_id: id });
  }

  async adminPreviaEmail(id: string): Promise<ServiceResult<GabaritoEmailPrevia>> {
    return this.invocarEmail<GabaritoEmailPrevia>({ modo: 'gabarito', gabarito_id: id, somente_previa: true });
  }

  /** Publicação mais recente, para o selo de novidade da sidebar. */
  async ultimoPublicadoEm(): Promise<string | null> {
    const { data, error } = await this.supabase.rpc('ultimo_gabarito_publicado_em');
    return error ? null : ((data as string | null) ?? null);
  }

  private async invocarEmail<T>(body: Record<string, unknown>): Promise<ServiceResult<T>> {
    const { data, error } = await this.supabase.functions.invoke('enviar-campanha-email', { body });
    if (error) return { ok: false, error: (await lerErroFunction(error)) ?? 'Falha ao chamar o envio de e-mail.' };
    return { ok: true, data: data as T };
  }

  async adminExcluir(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.rpc('admin_excluir_gabarito_prova', { p_id: id });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: undefined };
  }

  private async comTransferencia<T>(
    chave: string,
    carregar: () => Promise<ServiceResult<T>>,
  ): Promise<ServiceResult<T>> {
    const key = makeStateKey<T>(chave);
    if (this.isBrowser && this.transferState.hasKey(key)) {
      const data = this.transferState.get(key, null as T);
      // Consome uma vez: navegação posterior (filtro, voltar) busca fresco.
      this.transferState.remove(key);
      return { ok: true, data };
    }
    const concluir = this.pendingTasks.add();
    try {
      const resultado = await carregar();
      if (!this.isBrowser && resultado.ok) this.transferState.set(key, resultado.data);
      return resultado;
    } finally {
      concluir();
    }
  }
}

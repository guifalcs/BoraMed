import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Faculdade } from '../models/faculdade';
import type { Disciplina } from '../models/disciplina';
import type {
  FormatoProva,
  Prova,
  ProvaComFaculdade,
  ListarProvasParams,
  ProvasPaginadas,
} from '../models/prova';
import type { QuestaoComAlternativas } from '../models/questao';
import type { TentativaResposta } from '../models/tentativa';

export type ProvaResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVA_COLUMNS =
  'id, faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo, subtipo_nacional, qtd_questoes, publicada, arquivada, criado_em';

const FACULDADE_COLUMNS = 'id, nome, sigla, rede, ativa, logo_url, criado_em';

const DISCIPLINA_COLUMNS = 'id, sigla, nome, periodo';

const PROVAS_POR_PAGINA_PADRAO = 15;

@Injectable({ providedIn: 'root' })
export class ProvaService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _provas = signal<Prova[]>([]);
  private readonly _isLoading = signal(false);

  readonly provas = this._provas.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  async listarFaculdades(): Promise<ProvaResult<Faculdade[]>> {
    try {
      const { data, error } = await this.supabase
        .from('faculdade')
        .select(FACULDADE_COLUMNS)
        .eq('ativa', true)
        .order('nome');

      if (error) throw error;
      return { ok: true, data: (data ?? []) as Faculdade[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as faculdades.' };
    }
  }

  async listarDisciplinas(): Promise<ProvaResult<Disciplina[]>> {
    try {
      const { data, error } = await this.supabase
        .from('disciplina')
        .select(DISCIPLINA_COLUMNS)
        .eq('ativa', true)
        .order('periodo')
        .order('sigla');

      if (error) throw error;
      return { ok: true, data: (data ?? []) as Disciplina[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as matérias.' };
    }
  }

  async listarProvasNacionais(params: ListarProvasParams): Promise<ProvaResult<ProvasPaginadas>> {
    return this.listarProvasPorFormato('nacional', params);
  }

  async listarProvasPorFormato(
    formato: FormatoProva,
    params: ListarProvasParams = {},
  ): Promise<ProvaResult<ProvasPaginadas>> {
    this._isLoading.set(true);
    const pagina = Math.max(0, params.pagina ?? 0);
    const porPagina = params.porPagina ?? PROVAS_POR_PAGINA_PADRAO;
    try {
      let query = this.supabase
        .from('prova')
        .select(PROVA_COLUMNS, { count: 'exact' })
        .eq('formato', formato)
        .eq('arquivada', false)
        .order('criado_em', { ascending: false })
        .order('subtipo', { ascending: true })
        .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

      if (params.rede) {
        query = query.eq('rede', params.rede);
      }

      // Reproduz a semântica de `subtipo ?? subtipo_nacional`: casa quando o
      // subtipo está preenchido, ou (só então) recai no subtipo_nacional.
      if (params.subtipos && params.subtipos.length > 0) {
        const vals = params.subtipos.join(',');
        query = query.or(
          `subtipo.in.(${vals}),and(subtipo.is.null,subtipo_nacional.in.(${vals}))`,
        );
      }
      if (params.periodos && params.periodos.length > 0) {
        query = query.in('periodo', params.periodos);
      }
      if (params.disciplinaIds && params.disciplinaIds.length > 0) {
        query = query.in('disciplina_id', params.disciplinaIds);
      }
      const busca = params.busca?.trim();
      if (busca) {
        // Escapa curingas do LIKE para tratar o termo como texto literal.
        const termo = busca.replace(/[\\%_]/g, '\\$&');
        query = query.ilike('nome', `%${termo}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const provas = (data ?? []) as Prova[];
      this._provas.set(provas);
      return { ok: true, data: { provas, total: count ?? 0 } };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os simulados.' };
    } finally {
      this._isLoading.set(false);
    }
  }

  async buscarProva(id: string): Promise<ProvaResult<ProvaComFaculdade>> {
    try {
      const { data, error } = await this.supabase
        .from('prova')
        .select(`${PROVA_COLUMNS}, faculdade(nome, sigla)`)
        .eq('id', id)
        .single();

      if (error) throw error;
      return { ok: true, data: data as unknown as ProvaComFaculdade };
    } catch {
      return { ok: false, error: 'Simulado não encontrado.' };
    }
  }

  /**
   * Questões da revisão de uma prova (ou de uma tentativa específica), via RPC.
   * Disponível apenas após a tentativa/prova ser finalizada.
   */
  async getQuestoesRevisao(
    provaId: string,
    tentativaId: string | null,
  ): Promise<ProvaResult<{ questoes: QuestaoComAlternativas[]; respostas: TentativaResposta[] }>> {
    try {
      if (tentativaId) {
        const { data, error } = await this.supabase.rpc('get_revisao_tentativa', {
          p_tentativa_id: tentativaId,
        });
        if (error) throw error;
        const payload = data as { questoes: unknown; respostas?: unknown } | null;
        return {
          ok: true,
          data: {
            questoes: (payload?.questoes ?? []) as QuestaoComAlternativas[],
            respostas: (payload?.respostas ?? []) as TentativaResposta[],
          },
        };
      }

      const { data, error } = await this.supabase.rpc('get_revisao_prova', {
        p_prova_id: provaId,
      });
      if (error) throw error;
      const questoes = ((data as { questoes: unknown } | null)?.questoes ?? []) as QuestaoComAlternativas[];
      return { ok: true, data: { questoes, respostas: [] } };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('Revisao disponivel apenas apos finalizar')) {
        return { ok: false, error: 'A revisao fica disponivel apos voce finalizar a prova.' };
      }
      if (message.includes('Tentativa nao encontrada') || message.includes('sem permissao')) {
        return { ok: false, error: 'Tentativa nao encontrada ou sem permissao para acesso.' };
      }
      return { ok: false, error: 'Nao foi possivel carregar as questoes.' };
    }
  }
}

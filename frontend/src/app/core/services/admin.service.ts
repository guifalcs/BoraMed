import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { compressImage } from '../utils/image-compress.util';
import type { Profile } from '../models/auth.types';
import type { AssinaturaStatus } from '../models/subscription.types';

export interface AdminDisciplina {
  id: string;
  sigla: string;
  nome: string | null;
  periodo: number;
  ativa: boolean;
  criado_em: string;
}

export interface AdminStats {
  total_usuarios: number;
  usuarios_hoje: number;
  total_questoes: number;
  questoes_ativas: number;
  questoes_rascunho: number;
  total_provas: number;
  total_tentativas: number;
  tentativas_hoje: number;
  total_temas: number;
}

export interface AdminUsoPonto {
  /** Para a série diária: data ISO 'YYYY-MM-DD'. */
  dia?: string;
  /** Para a série por hora do dia: 0–23. */
  hora?: number;
  usuarios_ativos: number;
  interacoes: number;
}

export interface AdminUsoPlataforma {
  por_dia: (AdminUsoPonto & { dia: string })[];
  por_hora: (AdminUsoPonto & { hora: number })[];
  usuarios_ativos_14d: number;
  interacoes_14d: number;
}

export interface AdminFinanceiroPlano {
  slug: string;
  nome: string;
  ativas: number;
}

export interface AdminFinanceiro {
  assinaturas_ativas: number;
  cortesias_ativas: number;
  assinaturas_canceladas: number;
  novas_no_mes: number;
  cancelamentos_no_mes: number;
  mrr_centavos: number;
  previsao_30d_centavos: number;
  receita_total_centavos: number;
  receita_mes_centavos: number;
  receita_liquida_total_centavos: number;
  receita_liquida_mes_centavos: number;
  pagamentos_aprovados: number;
  pagamentos_recusados: number;
  por_plano: AdminFinanceiroPlano[];
}

export interface AdminIaJanela {
  correcoes: number;
  tokens_prompt: number;
  tokens_resposta: number;
  tokens_total: number;
  custo_usd: number;
}

export interface AdminIaSerieDia {
  dia: string;
  correcoes: number;
  tokens_total: number;
  custo_usd: number;
}

export interface AdminIaModelo {
  modelo: string;
  correcoes: number;
  tokens_total: number;
  custo_usd: number;
}

export interface AdminMetricasIa {
  janelas: { hoje: AdminIaJanela; d7: AdminIaJanela; d30: AdminIaJanela; total: AdminIaJanela };
  serie_diaria: AdminIaSerieDia[];
  por_modelo: AdminIaModelo[];
  falhas: { erro: number; sem_ia: number };
}

export interface AdminPagamento {
  id: string;
  criado_em: string;
  processado_em: string | null;
  user_email: string | null;
  plano_slug: string | null;
  plano_nome: string | null;
  valor_centavos: number | null;
  liquido_centavos: number | null;
  moeda: string;
  status: string;
  metodo_pagamento: string | null;
}

export interface AdminQuestao {
  id: string;
  enunciado: string;
  formato: string;
  tipo_questao: 'nacional' | 'processual' | 'laboratorio';
  formato_prova: string | null;
  status: string;
  disciplina_id: string | null;
  taxa_acerto: number | null;
  vezes_respondida: number;
  criado_em: string;
  autor_id: string | null;
  prova?: { nome: string } | null;
}

export interface AdminAlternativa {
  id?: string;
  questao_id?: string;
  letra: string;
  texto: string;
  correta: boolean;
  ordem: number;
}

export interface AdminQuestaoCompleta {
  id: string;
  codigo_externo: string | null;
  enunciado: string;
  enunciado_apoio: string | null;
  imagem_url: string | null;
  imagem_legenda: string | null;
  formato: string;
  tipo_questao: 'nacional' | 'processual' | 'laboratorio';
  formato_prova: string | null;
  status: string;
  disciplina_id: string | null;
  prova_id: string | null;
  ordem_na_prova: number | null;
  explicacao: string | null;
  explicacao_alternativas: Record<string, string> | null;
  referencia: string | null;
  fonte: string | null;
  resposta_correta_texto: string | null;
  respostas_aceitas: string[] | null;
  resposta_modelo: string | null;
  pontos_chave: string[];
  criterios_correcao: string | null;
  revisado: boolean;
  apto_desafio_diario: boolean;
  vezes_respondida: number;
  vezes_acertada: number;
  taxa_acerto: number | null;
  autor_id: string | null;
  revisor_id: string | null;
  aprovada_em: string | null;
  publicada_em: string | null;
  origem_geracao: 'manual' | 'ia_assistida';
  nivel_bloom: number | null;
  criado_em: string;
  atualizado_em: string;
  alternativas: AdminAlternativa[];
  temas: string[];
  prova?: { nome: string } | null;
}

export interface QuestaoPayload {
  enunciado: string;
  enunciado_apoio?: string | null;
  imagem_url?: string | null;
  imagem_legenda?: string | null;
  formato: string;
  tipo_questao?: 'nacional' | 'processual' | 'laboratorio';
  status: string;
  disciplina_id?: string | null;
  prova_id?: string | null;
  ordem_na_prova?: number | null;
  explicacao?: string | null;
  referencia?: string | null;
  fonte?: string | null;
  resposta_correta_texto?: string | null;
  resposta_modelo?: string | null;
  pontos_chave?: string[];
  criterios_correcao?: string | null;
  revisado?: boolean;
  apto_desafio_diario?: boolean;
  formato_prova?: string | null;
  autor_id?: string | null;
  origem_geracao?: 'manual' | 'ia_assistida';
}

export type AlternativaPayload = Omit<AdminAlternativa, 'id' | 'questao_id'>;

export interface DeletarProvaResultado {
  tentativas_preservadas: number;
}

export interface DeletarQuestaoResultado {
  modo: 'soft' | 'hard';
  respostas_preservadas: number;
  provas_afetadas: number;
}

export interface DeletarDisciplinaResultado {
  questoes_desvinculadas: number;
  temas_desvinculados: number;
}

export interface DeletarTemaResultado {
  questoes_desvinculadas: number;
  subtemas_realocados: number;
}

export interface AdminProva {
  id: string;
  nome: string;
  tipo: string;
  origem: string;
  formato: string | null;
  rede: string | null;
  subtipo: string | null;
  publicada: boolean;
  arquivada: boolean;
  periodo: number;
  qtd_questoes: number;
  criado_em: string;
  faculdade?: { nome: string; sigla: string } | null;
}

export interface AdminProvaDetalhe extends AdminProva {
  faculdade_id: string | null;
  subtipo_nacional: string | null;
}

export interface AdminFaculdade {
  id: string;
  nome: string;
  sigla: string;
  rede: string;
  ativa: boolean;
}

export interface ProvaInput {
  nome: string;
  tipo: string;
  origem?: string;
  formato?: string | null;
  rede?: string | null;
  subtipo?: string | null;
  publicada?: boolean;
  arquivada?: boolean;
  faculdade_id: string;
  periodo: number;
  subtipo_nacional?: string | null;
}

export interface AdminQuestaoSimples {
  id: string;
  enunciado: string;
  formato: string;
  tipo_questao: 'nacional' | 'processual' | 'laboratorio';
  status: string;
  disciplina_id: string | null;
  criado_em: string;
}

export interface AdminTema {
  id: string;
  nome: string;
  disciplina_id: string | null;
  parent_id: string | null;
  /** Tipos de prova aos quais o tema se aplica. null = todas as provas. */
  tipos_prova: string[] | null;
  criado_em: string;
}

export interface AdminAviso {
  id: string;
  titulo: string | null;
  mensagem: string | null;
  imagem_url: string;
  ativo: boolean;
  criado_em: string;
}

export interface AdminNotificacao {
  id: string;
  user_id: string;
  user_email: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  criado_em: string;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AdminMaterialCategoria {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  icone: string;
  gradiente: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface AdminMaterialArquivo {
  id: string;
  categoria_id: string;
  topico_id: string | null;
  titulo: string;
  descricao: string | null;
  storage_path: string;
  mime_type: string;
  tamanho_bytes: number | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface ImpersonacaoResult {
  token_hash: string;
  target_user_id: string;
  target_email: string;
  target_name: string | null;
}

export interface UsuarioAdminAssinatura {
  status: AssinaturaStatus;
  proxima_cobranca: string | null;
  plano_nome: string | null;
  plano_slug: string | null;
  /** true quando a assinatura dá acesso ativo no momento (espelha tem_assinatura_ativa). */
  ativa: boolean;
  /** true = acesso de cortesia (liberado de graça, fora das métricas financeiras). */
  cortesia: boolean;
}

export interface UsuarioAdmin extends Profile {
  assinatura: UsuarioAdminAssinatura | null;
}

export interface ListarUsuariosResult {
  usuarios: UsuarioAdmin[];
  total: number;
}

interface AssinaturaEmbed {
  status: AssinaturaStatus;
  proxima_cobranca: string | null;
  criado_em: string;
  cortesia: boolean;
  plano: { nome: string | null; slug: string | null } | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SupabaseService).client;

  async getStats(): Promise<ServiceResult<AdminStats>> {
    const { data, error } = await this.supabase.rpc('admin_get_stats');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminStats };
  }

  async getUsoPlataforma(): Promise<ServiceResult<AdminUsoPlataforma>> {
    const { data, error } = await this.supabase.rpc('admin_get_uso_plataforma');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminUsoPlataforma };
  }

  // ---- Financeiro ----

  async getFinanceiro(): Promise<ServiceResult<AdminFinanceiro>> {
    const { data, error } = await this.supabase.rpc('admin_get_financeiro');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminFinanceiro };
  }

  async listarPagamentos(limit = 100): Promise<ServiceResult<AdminPagamento[]>> {
    const { data, error } = await this.supabase.rpc('admin_listar_pagamentos', { p_limit: limit });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminPagamento[] };
  }

  async getMetricasIa(): Promise<ServiceResult<AdminMetricasIa>> {
    const { data, error } = await this.supabase.rpc('admin_get_metricas_ia');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminMetricasIa };
  }

  // ---- Usuários ----

  async listarUsuarios(
    busca = '',
    pagina = 0,
    porPagina = 50,
  ): Promise<ServiceResult<ListarUsuariosResult>> {
    let query = this.supabase
      .from('profiles')
      .select(
        '*, assinaturas:assinatura(status,proxima_cobranca,criado_em,cortesia,plano:plano_id(nome,slug))',
        { count: 'exact' },
      )
      .order('criado_em', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    const termoBusca = this.normalizarBuscaPostgrest(busca);
    if (termoBusca) {
      query = query.or(`nome_completo.ilike.%${termoBusca}%,email.ilike.%${termoBusca}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };

    const usuarios = (data ?? []).map((row) => {
      const { assinaturas, ...profile } = row as Profile & { assinaturas: AssinaturaEmbed[] | null };
      return {
        ...profile,
        assinatura: this.resumirAssinatura(assinaturas ?? []),
      } as UsuarioAdmin;
    });

    return {
      ok: true,
      data: {
        usuarios,
        total: count ?? 0,
      },
    };
  }

  /**
   * Escolhe, entre as assinaturas do usuário, a mais relevante para exibir no admin:
   * prioriza a que dá acesso ativo (authorized com próxima cobrança futura/nula ou
   * cancelled ainda em carência), espelhando `tem_assinatura_ativa`. Sem nenhuma
   * ativa, cai na mais recente por criado_em.
   */
  private resumirAssinatura(rows: AssinaturaEmbed[]): UsuarioAdminAssinatura | null {
    if (rows.length === 0) return null;
    const now = Date.now();
    const estaAtiva = (a: AssinaturaEmbed): boolean => {
      const prox = a.proxima_cobranca ? new Date(a.proxima_cobranca).getTime() : null;
      if (a.status === 'authorized') return prox === null || prox > now;
      if (a.status === 'cancelled') return prox !== null && prox > now;
      return false;
    };
    const ordenadas = [...rows].sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    );
    const escolhida = ordenadas.find(estaAtiva) ?? ordenadas[0];
    return {
      status: escolhida.status,
      proxima_cobranca: escolhida.proxima_cobranca,
      plano_nome: escolhida.plano?.nome ?? null,
      plano_slug: escolhida.plano?.slug ?? null,
      ativa: estaAtiva(escolhida),
      cortesia: escolhida.cortesia ?? false,
    };
  }

  private normalizarBuscaPostgrest(busca: string): string {
    return busca
      .trim()
      .replace(/[%(),]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  async alterarPapelUsuario(
    userId: string,
    papel: 'aluno' | 'admin',
  ): Promise<ServiceResult<Profile>> {
    const { data, error } = await this.supabase.rpc('alterar_papel_usuario', {
      p_user_id: userId,
      p_papel: papel,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Profile };
  }

  async banirUsuario(userId: string, motivo: string): Promise<ServiceResult<Profile>> {
    const { data, error } = await this.supabase.rpc('admin_banir_usuario', {
      p_user_id: userId,
      p_motivo: motivo.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Profile };
  }

  async desbanirUsuario(userId: string): Promise<ServiceResult<Profile>> {
    const { data, error } = await this.supabase.rpc('admin_desbanir_usuario', {
      p_user_id: userId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Profile };
  }

  /** Libera acesso de cortesia (grátis) por N meses, sem cobrança. */
  async liberarAcessoGratuito(
    userId: string,
    meses: number,
  ): Promise<ServiceResult<{ assinatura_id: string; proxima_cobranca: string }>> {
    const { data, error } = await this.supabase.rpc('admin_liberar_acesso_gratuito', {
      p_user_id: userId,
      p_meses: meses,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as { assinatura_id: string; proxima_cobranca: string } };
  }

  /** Revoga o acesso de cortesia ativo do usuário (não afeta assinaturas pagas). */
  async revogarAcessoGratuito(userId: string): Promise<ServiceResult<{ canceladas: number }>> {
    const { data, error } = await this.supabase.rpc('admin_revogar_acesso_gratuito', {
      p_user_id: userId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as { canceladas: number } };
  }

  async gerarTokenImpersonacao(targetUserId: string): Promise<ServiceResult<ImpersonacaoResult>> {
    const { data, error } = await this.supabase.functions.invoke('admin-impersonate', {
      body: { target_user_id: targetUserId },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as ImpersonacaoResult };
  }

  // ---- Questões ----

  async listarQuestoes(
    pagina = 0,
    porPagina = 50,
    filtros: {
      status?: string;
      busca?: string;
      tipoQuestao?: string;
      formato?: string;
      disciplinaId?: string;
      autorId?: string;
      dataDe?: string;
      dataAte?: string;
    } = {},
  ): Promise<ServiceResult<{ questoes: AdminQuestao[]; total: number }>> {
    let query = this.supabase
      .from('questao')
      .select('id,enunciado,formato,tipo_questao,status,disciplina_id,taxa_acerto,vezes_respondida,criado_em,autor_id,prova!questao_prova_id_fkey(nome)', {
        count: 'exact',
      })
      .neq('status', 'deletada')
      .order('criado_em', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (filtros.status) query = query.eq('status', filtros.status);
    if (filtros.busca?.trim()) query = query.ilike('enunciado', `%${filtros.busca}%`);
    if (filtros.tipoQuestao) query = query.eq('tipo_questao', filtros.tipoQuestao);
    if (filtros.formato) query = query.eq('formato', filtros.formato);
    if (filtros.disciplinaId) query = query.eq('disciplina_id', filtros.disciplinaId);
    if (filtros.autorId) query = query.eq('autor_id', filtros.autorId);
    if (filtros.dataDe) query = query.gte('criado_em', filtros.dataDe);
    // criado_em é timestamp; comparar com a data pura excluiria o próprio dia final.
    if (filtros.dataAte) query = query.lte('criado_em', `${filtros.dataAte}T23:59:59.999`);

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { questoes: (data ?? []) as unknown as AdminQuestao[], total: count ?? 0 } };
  }

  /** Autores possíveis de questões: admins e super admins (usado no filtro). */
  async listarAutores(): Promise<ServiceResult<{ id: string; nome_completo: string | null; email: string | null }[]>> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id,nome_completo,email')
      .in('papel', ['admin', 'super_admin'])
      .order('nome_completo', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as { id: string; nome_completo: string | null; email: string | null }[] };
  }

  async buscarQuestaoCompleta(id: string): Promise<ServiceResult<AdminQuestaoCompleta>> {
    // As colunas de resposta foram revogadas das tabelas; o editor lê a questão
    // completa (com gabarito) via RPC SECURITY DEFINER que valida is_admin().
    const { data, error } = await this.supabase.rpc('admin_get_questao', { p_id: id });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminQuestaoCompleta };
  }

  async criarQuestaoCompleta(
    questao: QuestaoPayload,
    alternativas: AlternativaPayload[],
    temaIds: string[],
  ): Promise<ServiceResult<string>> {
    const { data, error } = await this.supabase
      .from('questao')
      .insert(questao)
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    const id = (data as { id: string }).id;

    if (alternativas.length > 0) {
      const { error: ae } = await this.supabase
        .from('alternativa')
        .insert(alternativas.map((a, i) => ({ ...a, questao_id: id, ordem: i + 1 })));
      if (ae) {
        await this.supabase.from('questao').delete().eq('id', id);
        return { ok: false, error: ae.message };
      }
    }

    if (temaIds.length > 0) {
      const { error: te } = await this.supabase
        .from('questao_tema')
        .insert(temaIds.map((tema_id) => ({ questao_id: id, tema_id })));
      if (te) return { ok: false, error: te.message };
    }

    return { ok: true, data: id };
  }

  async atualizarQuestaoCompleta(
    id: string,
    questao: Partial<QuestaoPayload>,
    alternativas: AlternativaPayload[],
    temaIds: string[],
  ): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('questao').update(questao).eq('id', id);
    if (error) return { ok: false, error: error.message };

    // Discursiva não usa alternativas, mas as existentes são preservadas no
    // banco (conversão fechada→aberta reversível) — só não mexemos nelas.
    if (questao.formato !== 'resposta_aberta_curta') {
      await this.supabase.from('alternativa').delete().eq('questao_id', id);
      if (alternativas.length > 0) {
        const { error: ae } = await this.supabase
          .from('alternativa')
          .insert(alternativas.map((a, i) => ({ ...a, questao_id: id, ordem: i + 1 })));
        if (ae) return { ok: false, error: ae.message };
      }
    }

    await this.supabase.from('questao_tema').delete().eq('questao_id', id);
    if (temaIds.length > 0) {
      const { error: te } = await this.supabase
        .from('questao_tema')
        .insert(temaIds.map((tema_id) => ({ questao_id: id, tema_id })));
      if (te) return { ok: false, error: te.message };
    }

    return { ok: true, data: undefined };
  }

  async criarQuestao(input: Partial<AdminQuestao>): Promise<ServiceResult<AdminQuestao>> {
    const { data, error } = await this.supabase
      .from('questao')
      .insert(input)
      .select('id,enunciado,formato,tipo_questao,formato_prova,status,disciplina_id,taxa_acerto,vezes_respondida,criado_em')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminQuestao };
  }

  async atualizarQuestao(
    id: string,
    input: Partial<AdminQuestao>,
  ): Promise<ServiceResult<AdminQuestao>> {
    const { data, error } = await this.supabase
      .from('questao')
      .update(input)
      .eq('id', id)
      .select('id,enunciado,formato,tipo_questao,formato_prova,status,disciplina_id,taxa_acerto,vezes_respondida,criado_em')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminQuestao };
  }

  async deletarQuestao(id: string): Promise<ServiceResult<DeletarQuestaoResultado>> {
    const { data, error } = await this.supabase.rpc('admin_deletar_questao', { p_questao_id: id });
    if (error) return { ok: false, error: 'Não foi possível deletar a questão. Tente novamente.' };
    return { ok: true, data: data as DeletarQuestaoResultado };
  }

  // ---- Provas ----

  async listarProvas(
    pagina = 0,
    porPagina = 50,
    filtros: { formato?: string; busca?: string } = {},
  ): Promise<ServiceResult<{ provas: AdminProva[]; total: number }>> {
    let query = this.supabase
      .from('prova')
      .select('id,nome,tipo,origem,formato,rede,subtipo,publicada,arquivada,periodo,qtd_questoes,criado_em,faculdade(nome,sigla)', {
        count: 'exact',
      })
      .gt('periodo', 0)
      .order('criado_em', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (filtros.formato) query = query.eq('formato', filtros.formato);
    if (filtros.busca?.trim()) query = query.ilike('nome', `%${filtros.busca}%`);

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { provas: (data ?? []) as unknown as AdminProva[], total: count ?? 0 } };
  }

  async listarProvasSimples(): Promise<ServiceResult<{ id: string; nome: string }[]>> {
    const { data, error } = await this.supabase
      .from('prova')
      .select('id,nome')
      .gt('periodo', 0)
      .order('nome', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as { id: string; nome: string }[] };
  }

  async deletarProva(id: string): Promise<ServiceResult<DeletarProvaResultado>> {
    const { data, error } = await this.supabase.rpc('admin_deletar_prova', { p_prova_id: id });
    if (error) return { ok: false, error: 'Não foi possível deletar a prova. Tente novamente.' };
    return { ok: true, data: data as DeletarProvaResultado };
  }

  async listarFaculdades(): Promise<ServiceResult<AdminFaculdade[]>> {
    const { data, error } = await this.supabase
      .from('faculdade')
      .select('id,nome,sigla,rede,ativa')
      .eq('ativa', true)
      .order('nome');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminFaculdade[] };
  }

  async criarProva(input: ProvaInput): Promise<ServiceResult<AdminProva>> {
    const payload: Record<string, unknown> = { qtd_questoes: 0 };
    for (const [k, v] of Object.entries(input)) {
      if (v !== null && v !== undefined) payload[k] = v;
    }
    const { data, error } = await this.supabase
      .from('prova')
      .insert(payload)
      .select('id,nome,tipo,origem,formato,rede,subtipo,publicada,arquivada,periodo,qtd_questoes,criado_em,faculdade(nome,sigla)')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminProva };
  }

  async buscarProvaParaEdicao(id: string): Promise<ServiceResult<AdminProvaDetalhe>> {
    const { data, error } = await this.supabase
      .from('prova')
      .select('id,nome,tipo,origem,formato,rede,subtipo,subtipo_nacional,publicada,arquivada,periodo,qtd_questoes,faculdade_id,criado_em,faculdade(nome,sigla)')
      .eq('id', id)
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminProvaDetalhe };
  }

  async atualizarProva(id: string, input: Partial<ProvaInput>): Promise<ServiceResult<AdminProva>> {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) payload[k] = v;
    }
    const { data, error } = await this.supabase
      .from('prova')
      .update(payload)
      .eq('id', id)
      .select('id,nome,tipo,origem,formato,rede,subtipo,publicada,arquivada,periodo,qtd_questoes,criado_em,faculdade(nome,sigla)')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminProva };
  }

  async vincularQuestoesAProva(
    prova_id: string,
    questoes: { questao_id: string; ordem: number }[],
  ): Promise<ServiceResult<void>> {
    if (questoes.length === 0) return { ok: true, data: undefined };
    const { error } = await this.supabase
      .from('prova_questao')
      .insert(questoes.map((q) => ({ prova_id, questao_id: q.questao_id, ordem: q.ordem })));
    if (error) return { ok: false, error: error.message };
    const { count } = await this.supabase
      .from('prova_questao')
      .select('questao_id', { count: 'exact', head: true })
      .eq('prova_id', prova_id);
    await this.supabase
      .from('prova')
      .update({ qtd_questoes: count ?? questoes.length })
      .eq('id', prova_id);
    return { ok: true, data: undefined };
  }

  async listarIdsQuestoesVinculadas(prova_id: string): Promise<ServiceResult<string[]>> {
    const { data, error } = await this.supabase
      .from('prova_questao')
      .select('questao_id')
      .eq('prova_id', prova_id)
      .order('ordem');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []).map((r: { questao_id: string }) => r.questao_id) };
  }

  async sincronizarQuestoesProva(
    prova_id: string,
    questoes: { questao_id: string; ordem: number }[],
  ): Promise<ServiceResult<void>> {
    const { error: de } = await this.supabase.from('prova_questao').delete().eq('prova_id', prova_id);
    if (de) return { ok: false, error: de.message };
    if (questoes.length > 0) {
      const { error } = await this.supabase
        .from('prova_questao')
        .insert(questoes.map((q) => ({ prova_id, questao_id: q.questao_id, ordem: q.ordem })));
      if (error) return { ok: false, error: error.message };
    }
    await this.supabase.from('prova').update({ qtd_questoes: questoes.length }).eq('id', prova_id);
    return { ok: true, data: undefined };
  }

  async listarQuestoesParaVincular(
    pagina = 0,
    porPagina = 30,
    filtros: { busca?: string; status?: string; tipo_questao?: 'nacional' | 'processual' | 'laboratorio' } = {},
  ): Promise<ServiceResult<{ questoes: AdminQuestaoSimples[]; total: number }>> {
    let query = this.supabase
      .from('questao')
      .select('id,enunciado,formato,tipo_questao,status,disciplina_id,criado_em', { count: 'exact' })
      .neq('status', 'deletada')
      .order('criado_em', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);
    if (filtros.status) query = query.eq('status', filtros.status);
    if (filtros.tipo_questao) query = query.eq('tipo_questao', filtros.tipo_questao);
    if (filtros.busca?.trim()) query = query.ilike('enunciado', `%${filtros.busca}%`);
    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { questoes: (data ?? []) as AdminQuestaoSimples[], total: count ?? 0 } };
  }

  // ---- Temas ----

  async listarTemas(): Promise<ServiceResult<AdminTema[]>> {
    const { data, error } = await this.supabase
      .from('tema')
      .select('id,nome,disciplina_id,parent_id,tipos_prova,criado_em')
      .order('nome');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as unknown as AdminTema[] };
  }

  async criarTema(
    input: Pick<AdminTema, 'nome' | 'disciplina_id' | 'parent_id' | 'tipos_prova'>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .insert({
        nome: input.nome,
        disciplina_id: input.disciplina_id,
        parent_id: input.parent_id,
        tipos_prova: input.tipos_prova,
      })
      .select('id,nome,disciplina_id,parent_id,tipos_prova,criado_em')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminTema };
  }

  async atualizarTema(
    id: string,
    input: Partial<Pick<AdminTema, 'nome' | 'disciplina_id' | 'tipos_prova'>>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .update(input)
      .eq('id', id)
      .select('id,nome,disciplina_id,parent_id,tipos_prova,criado_em')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminTema };
  }

  // ---- Disciplinas ----

  async listarDisciplinas(): Promise<ServiceResult<AdminDisciplina[]>> {
    const { data, error } = await this.supabase
      .from('disciplina')
      .select('*')
      .order('periodo')
      .order('sigla');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminDisciplina[] };
  }

  async criarDisciplina(
    input: Pick<AdminDisciplina, 'sigla' | 'nome' | 'periodo'>,
  ): Promise<ServiceResult<AdminDisciplina>> {
    const { data, error } = await this.supabase
      .from('disciplina')
      .insert(input)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminDisciplina };
  }

  async atualizarDisciplina(
    id: string,
    input: Partial<Pick<AdminDisciplina, 'sigla' | 'nome' | 'periodo' | 'ativa'>>,
  ): Promise<ServiceResult<AdminDisciplina>> {
    const { data, error } = await this.supabase
      .from('disciplina')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminDisciplina };
  }

  async deletarDisciplina(id: string): Promise<ServiceResult<DeletarDisciplinaResultado>> {
    const { data, error } = await this.supabase.rpc('admin_deletar_disciplina', { p_disciplina_id: id });
    if (error) return { ok: false, error: 'Não foi possível deletar a disciplina. Tente novamente.' };
    return { ok: true, data: data as DeletarDisciplinaResultado };
  }

  async deletarTema(id: string): Promise<ServiceResult<DeletarTemaResultado>> {
    const { data, error } = await this.supabase.rpc('admin_deletar_tema', { p_tema_id: id });
    if (error) return { ok: false, error: 'Não foi possível deletar o tema. Tente novamente.' };
    return { ok: true, data: data as DeletarTemaResultado };
  }

  async deletarArquivoStorage(url: string, bucket = 'questao-imagens'): Promise<void> {
    const marker = `/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.substring(idx + marker.length);
    await this.supabase.storage.from(bucket).remove([path]);
  }

  // ---- Avisos ----

  async listarAvisos(): Promise<ServiceResult<AdminAviso[]>> {
    const { data, error } = await this.supabase.rpc('admin_listar_avisos');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminAviso[] };
  }

  async criarAviso(
    input: Pick<AdminAviso, 'titulo' | 'mensagem' | 'imagem_url'>,
  ): Promise<ServiceResult<AdminAviso>> {
    const { data, error } = await this.supabase
      .from('avisos')
      .insert(input)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminAviso };
  }

  async toggleAtivoAviso(id: string, ativo: boolean): Promise<ServiceResult<AdminAviso>> {
    const { data, error } = await this.supabase
      .from('avisos')
      .update({ ativo })
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminAviso };
  }

  async deletarAviso(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('avisos').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  async uploadImagemAviso(file: File): Promise<ServiceResult<string>> {
    let processedFile: File;
    try {
      processedFile = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
    } catch {
      processedFile = file;
    }

    const path = `${crypto.randomUUID()}.webp`;
    const { error } = await this.supabase.storage.from('avisos').upload(path, processedFile, {
      contentType: processedFile.type,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };
    const { data } = this.supabase.storage.from('avisos').getPublicUrl(path);
    return { ok: true, data: data.publicUrl };
  }

  // ---- Notificações in-app ----

  async enviarNotificacao(
    tipo: string,
    titulo: string,
    mensagem: string | null,
    userId: string | null,
  ): Promise<ServiceResult<number>> {
    const { data, error } = await this.supabase.rpc('admin_enviar_notificacao', {
      p_tipo: tipo,
      p_titulo: titulo,
      p_mensagem: mensagem,
      p_user_id: userId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as number };
  }

  async listarNotificacoesEnviadas(limit = 100): Promise<ServiceResult<AdminNotificacao[]>> {
    const { data, error } = await this.supabase.rpc('admin_listar_notificacoes', {
      p_limit: limit,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminNotificacao[] };
  }

  // ---- Materiais de Estudo ----

  async listarMateriaisCategorias(): Promise<ServiceResult<AdminMaterialCategoria[]>> {
    const { data, error } = await this.supabase
      .from('material_categoria')
      .select('*')
      .order('ordem')
      .order('criado_em');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminMaterialCategoria[] };
  }

  async criarMaterialCategoria(
    input: Pick<AdminMaterialCategoria, 'slug' | 'titulo' | 'descricao' | 'ordem'>,
  ): Promise<ServiceResult<AdminMaterialCategoria>> {
    const { data, error } = await this.supabase
      .from('material_categoria')
      .insert(input)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminMaterialCategoria };
  }

  async atualizarMaterialCategoria(
    id: string,
    input: Partial<AdminMaterialCategoria>,
  ): Promise<ServiceResult<AdminMaterialCategoria>> {
    const { data, error } = await this.supabase
      .from('material_categoria')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminMaterialCategoria };
  }

  async deletarMaterialCategoria(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('material_categoria').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  async listarMateriaisArquivos(categoriaId: string): Promise<ServiceResult<AdminMaterialArquivo[]>> {
    const { data, error } = await this.supabase
      .from('material_arquivo')
      .select('*')
      .eq('categoria_id', categoriaId)
      .order('ordem')
      .order('criado_em');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminMaterialArquivo[] };
  }

  async criarMaterialArquivo(
    input: Pick<AdminMaterialArquivo, 'categoria_id' | 'titulo' | 'descricao' | 'storage_path' | 'mime_type' | 'tamanho_bytes'>,
  ): Promise<ServiceResult<AdminMaterialArquivo>> {
    const { data, error } = await this.supabase
      .from('material_arquivo')
      .insert(input)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminMaterialArquivo };
  }

  async atualizarMaterialArquivo(
    id: string,
    input: Partial<Pick<AdminMaterialArquivo, 'titulo' | 'descricao' | 'ordem' | 'ativo'>>,
  ): Promise<ServiceResult<AdminMaterialArquivo>> {
    const { data, error } = await this.supabase
      .from('material_arquivo')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminMaterialArquivo };
  }

  async deletarMaterialArquivo(id: string, storagePath: string): Promise<ServiceResult<void>> {
    await this.supabase.storage.from('materiais').remove([storagePath]);
    const { error } = await this.supabase.from('material_arquivo').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }
}

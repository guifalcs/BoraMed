import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Profile } from '../models/auth.types';

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
  revisado?: boolean;
  apto_desafio_diario?: boolean;
  formato_prova?: string | null;
  autor_id?: string | null;
}

export type AlternativaPayload = Omit<AdminAlternativa, 'id' | 'questao_id'>;

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

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ImpersonacaoResult {
  token_hash: string;
  target_user_id: string;
  target_email: string;
  target_name: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SupabaseService).client;

  async getStats(): Promise<ServiceResult<AdminStats>> {
    const { data, error } = await this.supabase.rpc('admin_get_stats');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminStats };
  }

  // ---- Usuários ----

  async listarUsuarios(busca = ''): Promise<ServiceResult<Profile[]>> {
    let query = this.supabase
      .from('profiles')
      .select('*')
      .order('criado_em', { ascending: false });

    if (busca.trim()) {
      query = query.or(
        `nome_completo.ilike.%${busca}%,email.ilike.%${busca}%`,
      );
    }

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as Profile[] };
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
    filtros: { status?: string; busca?: string } = {},
  ): Promise<ServiceResult<{ questoes: AdminQuestao[]; total: number }>> {
    let query = this.supabase
      .from('questao')
      .select('id,enunciado,formato,tipo_questao,status,disciplina_id,taxa_acerto,vezes_respondida,criado_em,prova!questao_prova_id_fkey(nome)', {
        count: 'exact',
      })
      .order('criado_em', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (filtros.status) query = query.eq('status', filtros.status);
    if (filtros.busca?.trim()) query = query.ilike('enunciado', `%${filtros.busca}%`);

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { questoes: (data ?? []) as unknown as AdminQuestao[], total: count ?? 0 } };
  }

  async buscarQuestaoCompleta(id: string): Promise<ServiceResult<AdminQuestaoCompleta>> {
    const [q, alts, temas] = await Promise.all([
      this.supabase.from('questao').select('*,prova!questao_prova_id_fkey(nome)').eq('id', id).single(),
      this.supabase.from('alternativa').select('id,letra,texto,correta,ordem').eq('questao_id', id).order('ordem'),
      this.supabase.from('questao_tema').select('tema_id').eq('questao_id', id),
    ]);
    if (q.error) return { ok: false, error: q.error.message };
    return {
      ok: true,
      data: {
        ...(q.data as AdminQuestaoCompleta),
        alternativas: (alts.data ?? []) as AdminAlternativa[],
        temas: ((temas.data ?? []) as { tema_id: string }[]).map((t) => t.tema_id),
      },
    };
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

    await this.supabase.from('alternativa').delete().eq('questao_id', id);
    if (alternativas.length > 0) {
      const { error: ae } = await this.supabase
        .from('alternativa')
        .insert(alternativas.map((a, i) => ({ ...a, questao_id: id, ordem: i + 1 })));
      if (ae) return { ok: false, error: ae.message };
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
      .select()
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
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminQuestao };
  }

  async deletarQuestao(id: string): Promise<ServiceResult<void>> {
    const [
      respostas,
      desafios,
      provas,
    ] = await Promise.all([
      this.supabase
        .from('tentativa_resposta')
        .select('id', { count: 'exact', head: true })
        .eq('questao_id', id),
      this.supabase
        .from('desafio_diario')
        .select('data', { count: 'exact', head: true })
        .eq('questao_id', id),
      this.supabase
        .from('prova_questao')
        .select('prova_id', { count: 'exact', head: true })
        .eq('questao_id', id),
    ]);

    if ((respostas.count ?? 0) > 0) {
      return { ok: false, error: 'Esta questao ja possui respostas em tentativas e nao pode ser deletada.' };
    }
    if ((desafios.count ?? 0) > 0) {
      return { ok: false, error: 'Esta questao ja foi usada em desafio diario e nao pode ser deletada.' };
    }
    if ((provas.count ?? 0) > 0) {
      return { ok: false, error: 'Esta questao esta vinculada a uma prova. Remova o vinculo antes de deletar.' };
    }

    const { error } = await this.supabase.from('questao').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
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

  async deletarProva(id: string): Promise<ServiceResult<void>> {
    const { count: tentativas } = await this.supabase
      .from('tentativa')
      .select('id', { count: 'exact', head: true })
      .eq('prova_id', id);

    if ((tentativas ?? 0) > 0) {
      return { ok: false, error: 'Esta prova possui tentativas vinculadas e nao pode ser deletada.' };
    }

    const { error } = await this.supabase.from('prova').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
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
      .select('id,nome,disciplina_id,parent_id,criado_em')
      .order('nome');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as unknown as AdminTema[] };
  }

  async criarTema(
    input: Pick<AdminTema, 'nome' | 'disciplina_id' | 'parent_id'>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .insert({ nome: input.nome, disciplina_id: input.disciplina_id, parent_id: input.parent_id })
      .select('id,nome,disciplina_id,parent_id,criado_em')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as unknown as AdminTema };
  }

  async atualizarTema(
    id: string,
    input: Partial<Pick<AdminTema, 'nome' | 'disciplina_id'>>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .update(input)
      .eq('id', id)
      .select('id,nome,disciplina_id,parent_id,criado_em')
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

  async deletarDisciplina(id: string): Promise<ServiceResult<void>> {
    const [questoes, temas] = await Promise.all([
      this.supabase
        .from('questao')
        .select('id', { count: 'exact', head: true })
        .eq('disciplina_id', id),
      this.supabase
        .from('tema')
        .select('id', { count: 'exact', head: true })
        .eq('disciplina_id', id),
    ]);

    if ((questoes.count ?? 0) > 0 || (temas.count ?? 0) > 0) {
      return { ok: false, error: 'Esta disciplina possui temas ou questoes vinculadas. Desative-a ou remova os vinculos antes de deletar.' };
    }

    const { error } = await this.supabase.from('disciplina').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  async deletarTema(id: string): Promise<ServiceResult<void>> {
    const [questoes, filhos] = await Promise.all([
      this.supabase
        .from('questao_tema')
        .select('questao_id', { count: 'exact', head: true })
        .eq('tema_id', id),
      this.supabase
        .from('tema')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id),
    ]);

    if ((questoes.count ?? 0) > 0) {
      return { ok: false, error: 'Este tema possui questoes vinculadas e nao pode ser deletado.' };
    }
    if ((filhos.count ?? 0) > 0) {
      return { ok: false, error: 'Este tema possui subtemas e nao pode ser deletado.' };
    }

    const { error } = await this.supabase.from('tema').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
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
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await this.supabase.storage.from('avisos').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };
    const { data } = this.supabase.storage.from('avisos').getPublicUrl(path);
    return { ok: true, data: data.publicUrl };
  }
}

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
  status: string;
  dificuldade: number | null;
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
  enunciado: string;
  enunciado_apoio: string | null;
  formato: string;
  status: string;
  dificuldade: number | null;
  disciplina_id: string | null;
  prova_id: string | null;
  ordem_na_prova: number | null;
  explicacao: string | null;
  referencia: string | null;
  fonte: string | null;
  resposta_correta_texto: string | null;
  revisado: boolean;
  apto_desafio_diario: boolean;
  criado_em: string;
  alternativas: AdminAlternativa[];
  temas: string[];
  prova?: { nome: string } | null;
}

export interface QuestaoPayload {
  enunciado: string;
  enunciado_apoio?: string | null;
  formato: string;
  status: string;
  dificuldade?: number | null;
  disciplina_id?: string | null;
  prova_id?: string | null;
  ordem_na_prova?: number | null;
  explicacao?: string | null;
  referencia?: string | null;
  fonte?: string | null;
  resposta_correta_texto?: string | null;
  revisado?: boolean;
  apto_desafio_diario?: boolean;
  autor_id?: string | null;
}

export type AlternativaPayload = Omit<AdminAlternativa, 'id' | 'questao_id'>;

export interface AdminProva {
  id: string;
  nome: string;
  tipo: string;
  ano: number;
  semestre: number;
  periodo: number;
  qtd_questoes: number;
  criado_em: string;
  faculdade?: { nome: string; sigla: string } | null;
}

export interface AdminTema {
  id: string;
  nome: string;
  disciplina_id: string | null;
  parent_id: string | null;
  criado_em: string;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
  ): Promise<ServiceResult<void>> {
    const { error } = await this.supabase
      .from('profiles')
      .update({ papel })
      .eq('id', userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  // ---- Questões ----

  async listarQuestoes(
    pagina = 0,
    porPagina = 50,
    filtros: { status?: string; busca?: string } = {},
  ): Promise<ServiceResult<{ questoes: AdminQuestao[]; total: number }>> {
    let query = this.supabase
      .from('questao')
      .select('id,enunciado,formato,status,dificuldade,disciplina_id,taxa_acerto,vezes_respondida,criado_em,prova(nome)', {
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
      this.supabase.from('questao').select('*,prova(nome)').eq('id', id).single(),
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
    const { error } = await this.supabase.from('questao').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  // ---- Provas ----

  async listarProvas(
    pagina = 0,
    porPagina = 50,
    filtros: { tipo?: string; busca?: string } = {},
  ): Promise<ServiceResult<{ provas: AdminProva[]; total: number }>> {
    let query = this.supabase
      .from('prova')
      .select('id,nome,tipo,ano,semestre,periodo,qtd_questoes,criado_em,faculdade(nome,sigla)', {
        count: 'exact',
      })
      .gt('periodo', 0)
      .order('ano', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.busca?.trim()) query = query.ilike('nome', `%${filtros.busca}%`);

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { provas: (data ?? []) as unknown as AdminProva[], total: count ?? 0 } };
  }

  async listarProvasSimples(): Promise<ServiceResult<{ id: string; nome: string; ano: number }[]>> {
    const { data, error } = await this.supabase
      .from('prova')
      .select('id,nome,ano')
      .gt('periodo', 0)
      .order('ano', { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as { id: string; nome: string; ano: number }[] };
  }

  async deletarProva(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('prova').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
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
    const { error } = await this.supabase.from('disciplina').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }

  async deletarTema(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('tema').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }
}

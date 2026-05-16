import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Profile } from '../models/auth.types';

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
  disciplina: string | null;
  taxa_acerto: number | null;
  vezes_respondida: number;
  criado_em: string;
  prova?: { nome: string } | null;
}

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
  disciplina: string | null;
  periodo: number | null;
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
      .select('id,enunciado,formato,status,dificuldade,disciplina,taxa_acerto,vezes_respondida,criado_em,prova(nome)', {
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
      .order('ano', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.busca?.trim()) query = query.ilike('nome', `%${filtros.busca}%`);

    const { data, error, count } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { provas: (data ?? []) as unknown as AdminProva[], total: count ?? 0 } };
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
      .select('*')
      .order('nome');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AdminTema[] };
  }

  async criarTema(
    input: Pick<AdminTema, 'nome' | 'disciplina' | 'periodo' | 'parent_id'>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .insert(input)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminTema };
  }

  async atualizarTema(
    id: string,
    input: Partial<Pick<AdminTema, 'nome' | 'disciplina' | 'periodo'>>,
  ): Promise<ServiceResult<AdminTema>> {
    const { data, error } = await this.supabase
      .from('tema')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as AdminTema };
  }

  async deletarTema(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.from('tema').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  }
}

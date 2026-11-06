import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { ServiceResult } from './admin.service';
import type {
  AdminNotasRegulamento,
  AdminNotasRegulamentoResumo,
  MinhasNotas,
  NotaLancamento,
  NotasPublicacaoResultado,
  NotasRegulamentoPayload,
  NotasSalvoResultado,
} from '../models/notas';

/** Mensagens amigáveis para os códigos levantados pelas RPCs. */
const ERROS: Record<string, string> = {
  permission_denied: 'Sem permissão.',
  item_nao_encontrado: 'Essa avaliação não existe mais. Recarregue a página.',
  item_tem_subitens: 'Lance a nota em cada parte desta avaliação.',
  regulamento_indisponivel: 'As dimensões do seu período mudaram. Recarregue a página.',
  nota_fora_do_intervalo: 'A nota passa do peso desta avaliação.',
  periodo_invalido: 'Escolha um período entre 1º e 12º.',
  semestre_invalido: 'Semestre no formato 2026.2.',
  notas_minimas_invalidas: 'Notas mínimas inválidas: o piso do exame não pode passar da nota de aprovação.',
  frequencia_invalida: 'Frequência mínima entre 0% e 100%.',
  quantidade_eixos_invalida: 'Cadastre de 1 a 15 eixos.',
  eixo_invalido: 'Todo eixo precisa de sigla (até 20 caracteres) e nome.',
  quantidade_dimensoes_invalida: 'Cada eixo tem de 1 a 3 dimensões.',
  tipos_dimensao_invalidos: 'Dimensões repetidas no mesmo eixo, ou "única" junto de outra.',
  dimensao_invalida: 'Nome de dimensão muito longo.',
  quantidade_itens_invalida: 'Cada dimensão precisa de 1 a 30 itens.',
  item_invalido: 'Todo item precisa de nome e de pontos entre 0 e 100.',
  quantidade_subitens_invalida: 'Um item dividido precisa de 2 a 12 partes.',
  subitens_nao_somam: 'As partes de um item precisam somar os pontos dele.',
  estrutura_invalida: 'A estrutura mudou em outra aba. Recarregue a página.',
  regulamento_nao_encontrado: 'Regulamento não encontrado.',
  regulamento_vazio: 'Cadastre ao menos um item antes de publicar.',
  regulamento_publicado: 'Tire do ar antes de excluir: os alunos do período estão usando.',
};

function mensagemErro(message: string): string {
  return ERROS[message] ?? message;
}

/**
 * Minhas notas: leitura do regulamento do período + lançamentos do aluno, e a
 * gestão dos regulamentos no admin. Tudo por RPC (ver migration
 * 20261106120000_notas_dimensoes_periodo.sql).
 */
@Injectable({ providedIn: 'root' })
export class NotasService {
  private readonly supabase = inject(SupabaseService).client;

  // ─── Aluno ────────────────────────────────────────────────────────────────

  async minhasNotas(): Promise<ServiceResult<MinhasNotas>> {
    const { data, error } = await this.supabase.rpc('get_minhas_notas');
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as MinhasNotas };
  }

  /** `nota: null` apaga o lançamento. */
  async salvarNota(itemId: string, nota: number | null): Promise<ServiceResult<NotaLancamento | null>> {
    const { data, error } = await this.supabase.rpc('salvar_nota_lancamento', { p_item_id: itemId, p_nota: nota });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    const salvo = data as { item_id: string; nota: number | null; atualizado_em: string | null };
    return {
      ok: true,
      data: salvo.nota === null ? null : { item_id: salvo.item_id, nota: Number(salvo.nota), atualizado_em: salvo.atualizado_em ?? '' },
    };
  }

  async limparMinhasNotas(regulamentoId: string): Promise<ServiceResult<number>> {
    const { data, error } = await this.supabase.rpc('limpar_minhas_notas', { p_regulamento_id: regulamentoId });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: Number(data ?? 0) };
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminListar(): Promise<ServiceResult<AdminNotasRegulamentoResumo[]>> {
    const { data, error } = await this.supabase.rpc('admin_listar_notas_regulamentos');
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: (data ?? []) as AdminNotasRegulamentoResumo[] };
  }

  async adminObter(id: string): Promise<ServiceResult<AdminNotasRegulamento>> {
    const { data, error } = await this.supabase.rpc('admin_get_notas_regulamento', { p_id: id });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as AdminNotasRegulamento };
  }

  async adminSalvar(payload: NotasRegulamentoPayload): Promise<ServiceResult<NotasSalvoResultado>> {
    const { data, error } = await this.supabase.rpc('admin_salvar_notas_regulamento', { p_payload: payload });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as NotasSalvoResultado };
  }

  async adminPublicar(id: string, publicar: boolean, notificar = false): Promise<ServiceResult<NotasPublicacaoResultado>> {
    const { data, error } = await this.supabase.rpc('admin_publicar_notas_regulamento', {
      p_id: id,
      p_publicar: publicar,
      p_notificar: notificar,
    });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: data as NotasPublicacaoResultado };
  }

  async adminExcluir(id: string): Promise<ServiceResult<void>> {
    const { error } = await this.supabase.rpc('admin_excluir_notas_regulamento', { p_id: id });
    if (error) return { ok: false, error: mensagemErro(error.message) };
    return { ok: true, data: undefined };
  }
}

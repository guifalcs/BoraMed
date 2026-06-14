import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  ComentarioQuestao,
  ListarComentariosResult,
  OrdenacaoComentario,
  VotoResult,
} from '../models/comentario';

export type ComentarioResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

@Injectable()
export class ComentarioQuestaoService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _comentarios = signal<ComentarioQuestao[]>([]);
  private readonly _total = signal(0);
  private readonly _ordenacao = signal<OrdenacaoComentario>('relevante');
  private readonly _isLoading = signal(false);
  private readonly _erro = signal<string | null>(null);
  private readonly _erroCode = signal<string | null>(null);
  private readonly _enviando = signal(false);

  readonly comentarios = this._comentarios.asReadonly();
  readonly total = this._total.asReadonly();
  readonly ordenacao = this._ordenacao.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly erro = this._erro.asReadonly();
  readonly erroCode = this._erroCode.asReadonly();
  readonly enviando = this._enviando.asReadonly();

  async carregar(questaoId: string, ordenacao?: OrdenacaoComentario): Promise<ComentarioResult<ListarComentariosResult>> {
    if (ordenacao) this._ordenacao.set(ordenacao);

    this._isLoading.set(true);
    this._erro.set(null);
    this._erroCode.set(null);

    try {
      const { data, error } = await this.supabase.rpc('listar_comentarios_questao', {
        p_questao_id: questaoId,
        p_ordenacao: this._ordenacao(),
      });

      if (error) throw error;

      const result = data as ListarComentariosResult;
      this._comentarios.set(result?.comentarios ?? []);
      this._total.set(result?.total ?? 0);

      return { ok: true, data: result };
    } catch (err) {
      const msg = 'Não foi possível carregar os comentários.';
      this._erro.set(msg);
      return { ok: false, error: msg };
    } finally {
      this._isLoading.set(false);
    }
  }

  async criar(
    questaoId: string,
    conteudo: string,
    parentId?: string,
  ): Promise<ComentarioResult<ComentarioQuestao>> {
    this._enviando.set(true);

    try {
      const { data, error } = await this.supabase.rpc('criar_comentario_questao', {
        p_questao_id: questaoId,
        p_conteudo: conteudo,
        p_parent_id: parentId ?? null,
      });

      if (error) {
        const code = (error as { code?: string }).code ?? '';
        return { ok: false, error: error.message, code };
      }

      const novo = data as ComentarioQuestao;

      if (parentId) {
        // Adicionar reply ao comentário pai
        this._comentarios.update((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, respostas: [...c.respostas, novo] }
              : c,
          ),
        );
      } else {
        // Novo comentário raiz: adicionar ao início (mais recente)
        this._comentarios.update((prev) => [novo, ...prev]);
        this._total.update((t) => t + 1);
      }

      return { ok: true, data: novo };
    } catch (err) {
      return { ok: false, error: 'Não foi possível enviar o comentário.' };
    } finally {
      this._enviando.set(false);
    }
  }

  async editar(comentarioId: string, conteudo: string): Promise<ComentarioResult<ComentarioQuestao>> {
    try {
      const { data, error } = await this.supabase.rpc('editar_comentario_questao', {
        p_comentario_id: comentarioId,
        p_conteudo: conteudo,
      });

      if (error) {
        const code = (error as { code?: string }).code ?? '';
        return { ok: false, error: error.message, code };
      }

      const editado = data as ComentarioQuestao;

      this._comentarios.update((prev) =>
        prev.map((c) => {
          if (c.id === comentarioId) return { ...c, conteudo: editado.conteudo, editado: true };
          return {
            ...c,
            respostas: c.respostas.map((r) =>
              r.id === comentarioId ? { ...r, conteudo: editado.conteudo, editado: true } : r,
            ),
          };
        }),
      );

      return { ok: true, data: editado };
    } catch (err) {
      return { ok: false, error: 'Não foi possível editar o comentário.' };
    }
  }

  async excluir(comentarioId: string): Promise<ComentarioResult<void>> {
    try {
      const { error } = await this.supabase.rpc('excluir_comentario_questao', {
        p_comentario_id: comentarioId,
      });

      if (error) return { ok: false, error: error.message };

      this._comentarios.update((prev) => {
        const raiz = prev.find((c) => c.id === comentarioId);
        if (raiz) {
          this._total.update((t) => Math.max(0, t - 1));
          const temRespostasAtivas = raiz.respostas.some((r) => r.status === 'ativo');
          if (temRespostasAtivas) {
            // Soft delete: mantém visível com status removido para não quebrar a thread
            return prev.map((c) =>
              c.id === comentarioId ? { ...c, status: 'removido' as const, conteudo: null } : c,
            );
          }
          // Hard delete: sem replies, remove da lista
          return prev.filter((c) => c.id !== comentarioId);
        }
        // É uma reply: remover da lista de respostas do pai
        return prev.map((c) => ({
          ...c,
          respostas: c.respostas.filter((r) => r.id !== comentarioId),
        }));
      });

      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: 'Não foi possível excluir o comentário.' };
    }
  }

  async votar(comentarioId: string, valor: -1 | 1): Promise<ComentarioResult<VotoResult>> {
    // Encontrar estado atual para rollback
    const estadoAnterior = this._encontrarComentario(comentarioId);
    if (!estadoAnterior) return { ok: false, error: 'Comentário não encontrado.' };

    // Update otimista
    const novoMeuVoto: -1 | 0 | 1 = estadoAnterior.meu_voto === valor ? 0 : valor;
    this._aplicarVoto(comentarioId, estadoAnterior, novoMeuVoto);

    try {
      const { data, error } = await this.supabase.rpc('votar_comentario_questao', {
        p_comentario_id: comentarioId,
        p_valor: valor,
      });

      if (error) {
        // Rollback
        this._aplicarVoto(comentarioId, estadoAnterior, estadoAnterior.meu_voto);
        return { ok: false, error: error.message };
      }

      const result = data as VotoResult;

      // Sincronizar com valores reais do servidor
      this._comentarios.update((prev) =>
        prev.map((c) => {
          if (c.id === comentarioId)
            return { ...c, likes: result.likes, dislikes: result.dislikes, meu_voto: result.meu_voto };
          return {
            ...c,
            respostas: c.respostas.map((r) =>
              r.id === comentarioId
                ? { ...r, likes: result.likes, dislikes: result.dislikes, meu_voto: result.meu_voto }
                : r,
            ),
          };
        }),
      );

      return { ok: true, data: result };
    } catch (err) {
      this._aplicarVoto(comentarioId, estadoAnterior, estadoAnterior.meu_voto);
      return { ok: false, error: 'Não foi possível registrar o voto.' };
    }
  }

  async denunciar(comentarioId: string, motivo?: string): Promise<ComentarioResult<void>> {
    try {
      const { error } = await this.supabase.rpc('denunciar_comentario_questao', {
        p_comentario_id: comentarioId,
        p_motivo: motivo ?? null,
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: 'Não foi possível enviar a denúncia.' };
    }
  }

  limpar(): void {
    this._comentarios.set([]);
    this._total.set(0);
    this._ordenacao.set('relevante');
    this._isLoading.set(false);
    this._erro.set(null);
    this._erroCode.set(null);
    this._enviando.set(false);
  }

  private _encontrarComentario(id: string): ComentarioQuestao | null {
    for (const c of this._comentarios()) {
      if (c.id === id) return c;
      for (const r of c.respostas) {
        if (r.id === id) return r;
      }
    }
    return null;
  }

  private _aplicarVoto(
    comentarioId: string,
    base: ComentarioQuestao,
    meuVoto: -1 | 0 | 1,
  ): void {
    const likesOtimistas =
      base.likes +
      (meuVoto === 1 ? 1 : 0) -
      (base.meu_voto === 1 ? 1 : 0);
    const dislikesOtimistas =
      base.dislikes +
      (meuVoto === -1 ? 1 : 0) -
      (base.meu_voto === -1 ? 1 : 0);

    this._comentarios.update((prev) =>
      prev.map((c) => {
        if (c.id === comentarioId)
          return {
            ...c,
            likes: Math.max(0, likesOtimistas),
            dislikes: Math.max(0, dislikesOtimistas),
            meu_voto: meuVoto,
          };
        return {
          ...c,
          respostas: c.respostas.map((r) =>
            r.id === comentarioId
              ? {
                  ...r,
                  likes: Math.max(0, likesOtimistas),
                  dislikes: Math.max(0, dislikesOtimistas),
                  meu_voto: meuVoto,
                }
              : r,
          ),
        };
      }),
    );
  }
}

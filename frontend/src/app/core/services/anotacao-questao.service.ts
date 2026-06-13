import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { QuestaoAnotacao } from '../models/tentativa';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class AnotacaoQuestaoService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _anotacoes = signal<Map<string, QuestaoAnotacao>>(new Map());
  private readonly _salvandoQuestoes = signal<Set<string>>(new Set());
  private readonly _errosQuestoes = signal<Map<string, string>>(new Map());

  readonly anotacoes = this._anotacoes.asReadonly();
  readonly salvandoQuestoes = this._salvandoQuestoes.asReadonly();
  readonly errosQuestoes = this._errosQuestoes.asReadonly();

  async carregarPorTentativa(tentativaId: string): Promise<ProvaResult<QuestaoAnotacao[]>> {
    try {
      const { data, error } = await this.supabase.rpc('listar_anotacoes_tentativa', {
        p_tentativa_id: tentativaId,
      });

      if (error) throw error;

      const anotacoes = (data ?? []) as QuestaoAnotacao[];
      this._anotacoes.set(new Map(anotacoes.map((anotacao) => [anotacao.questao_id, anotacao])));
      this._errosQuestoes.set(new Map());

      return { ok: true, data: anotacoes };
    } catch {
      return { ok: false, error: 'Não foi possível carregar suas anotações.' };
    }
  }

  async salvar(
    tentativaId: string,
    questaoId: string,
    conteudo: string,
  ): Promise<ProvaResult<QuestaoAnotacao | null>> {
    this.marcarSalvando(questaoId, true);
    this.limparErro(questaoId);

    try {
      const { data, error } = await this.supabase.rpc('salvar_anotacao_questao', {
        p_tentativa_id: tentativaId,
        p_questao_id: questaoId,
        p_conteudo: conteudo,
      });

      if (error) throw error;

      const anotacao = data as QuestaoAnotacao | null;
      this._anotacoes.update((prev) => {
        const next = new Map(prev);
        if (anotacao) {
          next.set(questaoId, anotacao);
        } else {
          next.delete(questaoId);
        }
        return next;
      });

      return { ok: true, data: anotacao };
    } catch {
      const message = 'Não foi possível salvar a anotação.';
      this.definirErro(questaoId, message);
      return { ok: false, error: message };
    } finally {
      this.marcarSalvando(questaoId, false);
    }
  }

  async excluir(tentativaId: string, questaoId: string): Promise<ProvaResult<void>> {
    this.marcarSalvando(questaoId, true);
    this.limparErro(questaoId);

    try {
      const { error } = await this.supabase.rpc('excluir_anotacao_questao', {
        p_tentativa_id: tentativaId,
        p_questao_id: questaoId,
      });

      if (error) throw error;

      this._anotacoes.update((prev) => {
        const next = new Map(prev);
        next.delete(questaoId);
        return next;
      });

      return { ok: true, data: undefined };
    } catch {
      const message = 'Não foi possível excluir a anotação.';
      this.definirErro(questaoId, message);
      return { ok: false, error: message };
    } finally {
      this.marcarSalvando(questaoId, false);
    }
  }

  limpar(): void {
    this._anotacoes.set(new Map());
    this._salvandoQuestoes.set(new Set());
    this._errosQuestoes.set(new Map());
  }

  private marcarSalvando(questaoId: string, salvando: boolean): void {
    this._salvandoQuestoes.update((prev) => {
      const next = new Set(prev);
      if (salvando) {
        next.add(questaoId);
      } else {
        next.delete(questaoId);
      }
      return next;
    });
  }

  private definirErro(questaoId: string, message: string): void {
    this._errosQuestoes.update((prev) => {
      const next = new Map(prev);
      next.set(questaoId, message);
      return next;
    });
  }

  private limparErro(questaoId: string): void {
    this._errosQuestoes.update((prev) => {
      const next = new Map(prev);
      next.delete(questaoId);
      return next;
    });
  }
}

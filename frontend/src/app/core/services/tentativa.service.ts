import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Tentativa, TentativaResposta, ResultadoTentativa, ModoProva } from '../models/tentativa';
import type { QuestaoComAlternativas } from '../models/questao';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class TentativaService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _tentativaAtiva = signal<Tentativa | null>(null);
  private readonly _questoes = signal<QuestaoComAlternativas[]>([]);
  private readonly _respostas = signal<TentativaResposta[]>([]);

  readonly tentativaAtiva = this._tentativaAtiva.asReadonly();
  readonly questoes = this._questoes.asReadonly();
  readonly respostas = this._respostas.asReadonly();

  async buscarTentativaAtiva(provaId: string): Promise<ProvaResult<Tentativa | null>> {
    try {
      const { data, error } = await this.supabase
        .from('tentativa')
        .select('*')
        .eq('prova_id', provaId)
        .in('status', ['em_andamento', 'pausada'])
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { ok: true, data: (data as Tentativa | null) };
    } catch {
      return { ok: false, error: 'Não foi possível verificar tentativas ativas.' };
    }
  }

  async iniciar(
    provaId: string,
    modo: ModoProva,
  ): Promise<ProvaResult<{ tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    try {
      const { data, error } = await this.supabase.rpc('iniciar_tentativa', {
        p_prova_id: provaId,
        p_modo: modo,
      });

      if (error) throw error;

      const result = data as { tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);
      this._respostas.set([]);

      return { ok: true, data: result };
    } catch {
      return { ok: false, error: 'Não foi possível iniciar a tentativa.' };
    }
  }

  async retomar(
    tentativaId: string,
  ): Promise<ProvaResult<{ tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    try {
      const { data, error } = await this.supabase.rpc('retomar_tentativa', {
        p_tentativa_id: tentativaId,
      });

      if (error) throw error;

      const result = data as { tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);

      const { data: respostasData, error: respostasError } = await this.supabase
        .from('tentativa_resposta')
        .select('*')
        .eq('tentativa_id', tentativaId);

      if (!respostasError) {
        this._respostas.set((respostasData ?? []) as TentativaResposta[]);
      }

      return { ok: true, data: result };
    } catch {
      return { ok: false, error: 'Não foi possível retomar a tentativa.' };
    }
  }

  async salvarResposta(
    tentativaId: string,
    questaoId: string,
    alternativaId: string,
  ): Promise<ProvaResult<TentativaResposta>> {
    try {
      const { data, error } = await this.supabase
        .from('tentativa_resposta')
        .update({ alternativa_id: alternativaId, respondida_em: new Date().toISOString() })
        .eq('tentativa_id', tentativaId)
        .eq('questao_id', questaoId)
        .select()
        .single();

      if (error) throw error;

      const resposta = data as TentativaResposta;
      this._respostas.update((prev) => {
        const idx = prev.findIndex((r) => r.questao_id === questaoId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = resposta;
          return next;
        }
        return [...prev, resposta];
      });

      return { ok: true, data: resposta };
    } catch {
      return { ok: false, error: 'Não foi possível salvar a resposta.' };
    }
  }

  async pausar(tentativaId: string): Promise<ProvaResult<void>> {
    try {
      const { error } = await this.supabase.rpc('pausar_tentativa', {
        p_tentativa_id: tentativaId,
      });

      if (error) throw error;

      this._tentativaAtiva.update((t) =>
        t ? { ...t, status: 'pausada', pausada_em: new Date().toISOString() } : t,
      );

      return { ok: true, data: undefined };
    } catch {
      return { ok: false, error: 'Não foi possível pausar a tentativa.' };
    }
  }

  async finalizar(tentativaId: string): Promise<ProvaResult<ResultadoTentativa>> {
    try {
      const { data, error } = await this.supabase.rpc('finalizar_tentativa', {
        p_tentativa_id: tentativaId,
      });

      if (error) throw error;

      const resultado = data as ResultadoTentativa;
      this._tentativaAtiva.update((t) =>
        t ? { ...t, status: 'finalizada', finalizada_em: new Date().toISOString() } : t,
      );

      return { ok: true, data: resultado };
    } catch {
      return { ok: false, error: 'Não foi possível finalizar a tentativa.' };
    }
  }
}

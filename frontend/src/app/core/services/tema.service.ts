import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { TemaComContagem } from '../models/tema';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly supabase = inject(SupabaseService).client;

  async listarTemasComContagem(tipoQuestao?: 'geral' | 'laboratorio'): Promise<ProvaResult<TemaComContagem[]>> {
    try {
      const { data, error } = await this.supabase.rpc('listar_temas_com_contagem', {
        p_tipo_questao: tipoQuestao ?? null,
      });

      if (error) throw error;
      return { ok: true, data: (data ?? []) as TemaComContagem[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os temas.' };
    }
  }
}

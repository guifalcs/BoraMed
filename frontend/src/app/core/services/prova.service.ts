import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Faculdade } from '../models/faculdade';
import type { FormatoProva, Prova, ProvaComFaculdade, FiltrosProvas } from '../models/prova';

export type ProvaResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVA_COLUMNS =
  'id, faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo, subtipo_nacional, qtd_questoes, publicada, arquivada, criado_em';

const FACULDADE_COLUMNS = 'id, nome, sigla, rede, ativa, logo_url, criado_em';

const MAX_PROVAS_LISTA = 200;

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

  async listarProvasNacionais(filtros: FiltrosProvas): Promise<ProvaResult<Prova[]>> {
    return this.listarProvasPorFormato('nacional', filtros);
  }

  async listarProvasPorFormato(
    formato: FormatoProva,
    filtros: FiltrosProvas = { subtipo: null, periodo: null },
  ): Promise<ProvaResult<Prova[]>> {
    this._isLoading.set(true);
    try {
      let query = this.supabase
        .from('prova')
        .select(PROVA_COLUMNS)
        .eq('formato', formato)
        .eq('arquivada', false)
        .order('criado_em', { ascending: false })
        .order('subtipo', { ascending: true })
        .limit(MAX_PROVAS_LISTA);

      if (filtros.rede) {
        query = query.eq('rede', filtros.rede);
      }

      if (filtros.subtipo) {
        query = query.eq('subtipo', filtros.subtipo);
      }
      if (filtros.periodo) {
        query = query.eq('periodo', filtros.periodo);
      }

      const { data, error } = await query;
      if (error) throw error;

      const provas = (data ?? []) as Prova[];
      this._provas.set(provas);
      return { ok: true, data: provas };
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
}

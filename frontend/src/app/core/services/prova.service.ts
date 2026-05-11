import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Faculdade } from '../models/faculdade';
import type { Prova, ProvaComFaculdade, FiltrosProvas } from '../models/prova';

export type ProvaResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
        .select('*')
        .eq('ativa', true)
        .order('nome');

      if (error) throw error;
      return { ok: true, data: (data ?? []) as Faculdade[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as faculdades.' };
    }
  }

  async listarProvasNacionais(filtros: FiltrosProvas): Promise<ProvaResult<Prova[]>> {
    this._isLoading.set(true);
    try {
      let query = this.supabase
        .from('prova')
        .select('*')
        .eq('tipo', 'nacional')
        .order('ano', { ascending: false })
        .order('subtipo_nacional', { ascending: true });

      if (filtros.subtipo) {
        query = query.eq('subtipo_nacional', filtros.subtipo);
      }
      if (filtros.periodo) {
        query = query.eq('periodo', filtros.periodo);
      }
      if (filtros.ano) {
        query = query.eq('ano', filtros.ano);
      }

      const { data, error } = await query;
      if (error) throw error;

      const provas = (data ?? []) as Prova[];
      this._provas.set(provas);
      return { ok: true, data: provas };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as provas.' };
    } finally {
      this._isLoading.set(false);
    }
  }

  async buscarProva(id: string): Promise<ProvaResult<ProvaComFaculdade>> {
    try {
      const { data, error } = await this.supabase
        .from('prova')
        .select('*, faculdade(nome, sigla)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return { ok: true, data: data as ProvaComFaculdade };
    } catch {
      return { ok: false, error: 'Prova não encontrada.' };
    }
  }
}

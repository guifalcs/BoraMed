import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { MaterialArquivo, MaterialCategoria } from '../models/material';

export type MaterialResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SIGNED_URL_TTL = 14400;

@Injectable({ providedIn: 'root' })
export class MaterialService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _categorias = signal<MaterialCategoria[]>([]);
  private readonly _isLoading = signal(false);

  readonly categorias = this._categorias.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  async listarCategorias(): Promise<MaterialResult<MaterialCategoria[]>> {
    this._isLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('material_categoria')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
        .order('criado_em');

      if (error) throw error;
      const categorias = (data ?? []) as MaterialCategoria[];
      this._categorias.set(categorias);
      return { ok: true, data: categorias };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os materiais.' };
    } finally {
      this._isLoading.set(false);
    }
  }

  async buscarCategoriaPorSlug(slug: string): Promise<MaterialResult<MaterialCategoria>> {
    try {
      const { data, error } = await this.supabase
        .from('material_categoria')
        .select('*')
        .eq('slug', slug)
        .eq('ativo', true)
        .single();

      if (error) throw error;
      return { ok: true, data: data as MaterialCategoria };
    } catch {
      return { ok: false, error: 'Categoria não encontrada.' };
    }
  }

  async listarArquivos(categoriaId: string): Promise<MaterialResult<MaterialArquivo[]>> {
    try {
      const { data, error } = await this.supabase
        .from('material_arquivo')
        .select('*')
        .eq('categoria_id', categoriaId)
        .eq('ativo', true)
        .order('ordem')
        .order('criado_em');

      if (error) throw error;
      return { ok: true, data: (data ?? []) as MaterialArquivo[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os arquivos.' };
    }
  }

  async getSignedUrl(storagePath: string): Promise<MaterialResult<string>> {
    try {
      const { data, error } = await this.supabase.storage
        .from('materiais')
        .createSignedUrl(storagePath, SIGNED_URL_TTL);

      if (error) throw error;
      return { ok: true, data: data.signedUrl };
    } catch {
      return { ok: false, error: 'Não foi possível abrir o arquivo.' };
    }
  }
}

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { extrairPathDoBucket } from '../utils/storage-imagens.util';

/** Bucket privado das imagens de questão/alternativa (migration 20260724130000). */
export const BUCKET_QUESTAO_IMAGENS = 'questao-imagens';

/** Validade pedida ao Storage para cada URL assinada. */
const TTL_SEGUNDOS = 60 * 60;

/**
 * Margem de segurança: reutilizamos a URL do cache só enquanto faltar mais que
 * isso para expirar, evitando entregar uma URL que morre no meio do render de
 * uma prova longa.
 */
const MARGEM_MS = 5 * 60 * 1000;

/**
 * Resolve URLs de imagens que vivem em bucket PRIVADO.
 *
 * O banco guarda a URL antiga (forma `/object/public/...`) como identificador do
 * objeto; aqui extraímos o path e trocamos por uma URL assinada de TTL curto,
 * emitida só para quem tem sessão (a policy `questao_imagens_select` é avaliada
 * na assinatura). Isso é o que impede que uma URL vazada valha para sempre.
 *
 * Cache em memória por path: uma prova costuma repetir a mesma imagem em
 * enunciado e revisão, e a impressão renderiza dezenas de itens de uma vez.
 * Chamadas concorrentes para o mesmo path compartilham a mesma promessa, para
 * não disparar N requisições idênticas.
 */
@Injectable({ providedIn: 'root' })
export class ImagemProtegidaService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly cache = new Map<string, { url: string; expiraEm: number }>();
  private readonly emVoo = new Map<string, Promise<string | null>>();

  /**
   * Devolve uma URL exibível para `urlArmazenada`.
   *
   * Retorna a própria entrada quando ela não pertence ao bucket protegido
   * (ex.: imagens de aviso, que seguem em bucket público) e `null` quando a
   * entrada é nula — assim o chamador pode usar o resultado direto no `src`.
   */
  async resolver(
    urlArmazenada: string | null | undefined,
    bucket = BUCKET_QUESTAO_IMAGENS,
  ): Promise<string | null> {
    if (!urlArmazenada) return null;

    const path = extrairPathDoBucket(urlArmazenada, bucket);
    // Não é deste bucket: repassa sem tocar (não quebra URLs externas/públicas).
    if (!path) return urlArmazenada;

    const chave = `${bucket}/${path}`;
    const agora = Date.now();

    const cacheado = this.cache.get(chave);
    if (cacheado && cacheado.expiraEm - MARGEM_MS > agora) return cacheado.url;

    const jaEmVoo = this.emVoo.get(chave);
    if (jaEmVoo) return jaEmVoo;

    const promessa = this.assinar(bucket, path, chave, urlArmazenada);
    this.emVoo.set(chave, promessa);
    try {
      return await promessa;
    } finally {
      this.emVoo.delete(chave);
    }
  }

  private async assinar(
    bucket: string,
    path: string,
    chave: string,
    fallback: string,
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, TTL_SEGUNDOS);

      if (error || !data?.signedUrl) {
        // Sem sessão (ex.: render no servidor) ou sem permissão. Devolver a URL
        // original mantém o comportamento anterior no cliente, que re-resolve
        // após a hidratação — melhor do que renderizar um buraco.
        return fallback;
      }

      this.cache.set(chave, {
        url: data.signedUrl,
        expiraEm: Date.now() + TTL_SEGUNDOS * 1000,
      });
      return data.signedUrl;
    } catch {
      return fallback;
    }
  }

  /** Descarta o cache (usado no logout, para não vazar URLs entre sessões). */
  limpar(): void {
    this.cache.clear();
    this.emVoo.clear();
  }
}

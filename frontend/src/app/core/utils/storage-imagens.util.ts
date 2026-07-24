import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Extrai o path do objeto a partir da URL do bucket.
 *
 * Aceita as três formas que o Storage produz, porque `questao-imagens` deixou
 * de ser público (migration 20260724130000) mas as URLs JÁ GRAVADAS no banco
 * continuam na forma `/object/public/...` — elas passaram a ser apenas um
 * identificador do objeto:
 *   /storage/v1/object/public/<bucket>/<path>
 *   /storage/v1/object/sign/<bucket>/<path>?token=...
 *   /storage/v1/object/<bucket>/<path>
 */
export function extrairPathDoBucket(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  for (const marker of [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ]) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      // Descarta querystring (o token da URL assinada) e fragmento.
      return url.substring(idx + marker.length).split(/[?#]/)[0];
    }
  }
  return null;
}

const BUCKET_FLASHCARDS = 'flashcard-imagens';

/**
 * URLs de imagem (frente/verso) dos cards de um deck. Best-effort: em erro
 * retorna lista vazia — a limpeza de storage nunca bloqueia a operação principal.
 */
export async function listarImagensDeckFlashcards(
  client: SupabaseClient,
  deckId: string,
): Promise<string[]> {
  try {
    const { data } = await client
      .from('flashcard_cards')
      .select('frente_imagem_url, verso_imagem_url')
      .eq('deck_id', deckId);
    return ((data ?? []) as { frente_imagem_url: string | null; verso_imagem_url: string | null }[])
      .flatMap((c) => [c.frente_imagem_url, c.verso_imagem_url])
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

/**
 * Remove do bucket flashcard-imagens os objetos das URLs informadas.
 * Best-effort: falha aqui deixa um órfão para trás, mas não propaga erro.
 */
export async function removerImagensFlashcards(
  client: SupabaseClient,
  urls: (string | null | undefined)[],
): Promise<void> {
  const paths = urls
    .map((u) => extrairPathDoBucket(u, BUCKET_FLASHCARDS))
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  try {
    await client.storage.from(BUCKET_FLASHCARDS).remove(paths);
  } catch {
    // órfão fica para trás; aceitável para uma limpeza best-effort
  }
}

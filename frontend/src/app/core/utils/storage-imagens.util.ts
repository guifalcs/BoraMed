import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Extrai o path do objeto a partir da URL pública do bucket.
 * Retorna null se a URL não pertence ao bucket informado.
 */
export function extrairPathDoBucket(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
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

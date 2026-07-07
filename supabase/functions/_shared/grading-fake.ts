// Provider fake determinístico: correção por cobertura literal dos
// pontos-chave (substring case-insensitive). Sem rede. Usado em dev local,
// testes Deno e e2e Playwright (AI_GRADING_PROVIDER=fake) — e materializa a
// regra "o app não depende de IA".

import type { GradingInput, GradingProvider, GradingResult } from './grading-provider.ts';

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function fakeProvider(): GradingProvider {
  return {
    nome: 'fake',
    corrigir(input: GradingInput): Promise<GradingResult> {
      const resposta = normalizar(input.resposta_aluno);
      const atendidos: string[] = [];
      const faltantes: string[] = [];

      for (const ponto of input.pontos_chave) {
        // Considera o ponto coberto se alguma palavra "significativa" dele
        // (>= 4 letras) aparece na resposta.
        const palavras = normalizar(ponto).split(/\W+/).filter((w) => w.length >= 4);
        const coberto = palavras.length > 0 && palavras.some((w) => resposta.includes(w));
        (coberto ? atendidos : faltantes).push(ponto);
      }

      let pontos: number;
      if (!resposta.trim()) {
        pontos = 0;
      } else if (input.pontos_chave.length === 0) {
        // Sem checklist: heurística neutra e estável.
        pontos = 70;
      } else {
        pontos = Math.round((atendidos.length / input.pontos_chave.length) * 100);
      }

      return Promise.resolve({
        pontos,
        feedback: `[correção automática de teste] Sua resposta cobriu ${atendidos.length} de ${input.pontos_chave.length} pontos-chave.`,
        pontos_atendidos: atendidos,
        pontos_faltantes: faltantes,
        erros: [],
        provider: 'fake',
        modelo: 'fake-v1',
        tokens_prompt: null,
        tokens_resposta: null,
      });
    },
  };
}

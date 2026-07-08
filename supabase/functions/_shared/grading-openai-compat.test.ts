import { assertEquals } from 'jsr:@std/assert';
import { openAiCompatProvider } from './grading-openai-compat.ts';
import type { GradingInput } from './grading-provider.ts';

const input: GradingInput = {
  enunciado: 'Descreva a tríade de Charcot.',
  enunciado_apoio: null,
  resposta_modelo: 'Febre, icterícia e dor em HD; sugere colangite.',
  pontos_chave: ['Cita febre'],
  criterios_correcao: null,
  resposta_aluno: 'Febre, icterícia e dor.',
};

function fakeFetch(capture: { body?: Record<string, unknown> }): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) => {
    capture.body = JSON.parse(String(init?.body));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ pontos: 90, feedback: 'ok' }) } }],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
}

Deno.test('injeta provider.order quando providerOrder está setado', async () => {
  const cap: { body?: Record<string, unknown> } = {};
  const provider = openAiCompatProvider({
    baseUrl: 'https://openrouter.ai/api/v1',
    modelo: 'deepseek/deepseek-v4-flash',
    apiKey: 'k',
    fetch: fakeFetch(cap),
    providerOrder: ['DeepInfra'],
  });
  await provider.corrigir(input);
  assertEquals(cap.body?.provider, { order: ['DeepInfra'], allow_fallbacks: true });
});

Deno.test('omite provider quando providerOrder vazio/ausente', async () => {
  const cap: { body?: Record<string, unknown> } = {};
  const provider = openAiCompatProvider({
    baseUrl: 'https://api.openai.com/v1',
    modelo: 'gpt-4o-mini',
    apiKey: 'k',
    fetch: fakeFetch(cap),
    providerOrder: [],
  });
  await provider.corrigir(input);
  assertEquals('provider' in (cap.body ?? {}), false);
});

import { assertEquals } from '@std/assert';
import { gradingProviderFromConfig, type IaConfig } from './ia-config.ts';

const rejectFetch = (() => Promise.reject(new Error('no fetch'))) as typeof fetch;

function config(over: Partial<IaConfig> = {}): IaConfig {
  return {
    slug: 'aurora',
    nome: 'Aurora',
    ativo: true,
    temperatura: 0,
    limite_diario: 200,
    max_resposta_chars: 3000,
    persona: null,
    tom: null,
    tamanho_feedback: null,
    regras_correcao: null,
    regras_extras: null,
    ...over,
  };
}

/** Env de conexão openai-compat (o que o dev configura via secrets). */
const OPENAI_ENV: Record<string, string> = {
  AI_GRADING_PROVIDER: 'openai-compat',
  AI_GRADING_BASE_URL: 'https://openrouter.fake/api/v1',
  AI_GRADING_MODEL: 'test-model',
  AI_GRADING_API_KEY: 'sk-test',
};
const envFrom = (m: Record<string, string>) => (k: string) => m[k];

Deno.test('config null → provider null (sem_ia)', () => {
  assertEquals(gradingProviderFromConfig(null, envFrom(OPENAI_ENV), rejectFetch), null);
});

Deno.test('agente desligado (ativo=false) → null, mesmo com conexão no env', () => {
  assertEquals(
    gradingProviderFromConfig(config({ ativo: false }), envFrom(OPENAI_ENV), rejectFetch),
    null,
  );
});

Deno.test('sem AI_GRADING_PROVIDER no env → null', () => {
  assertEquals(gradingProviderFromConfig(config(), envFrom({}), rejectFetch), null);
});

Deno.test('openai-compat sem base_url/modelo/chave no env → null', () => {
  const { AI_GRADING_API_KEY: _k, ...semChave } = OPENAI_ENV;
  assertEquals(gradingProviderFromConfig(config(), envFrom(semChave), rejectFetch), null);
});

Deno.test('openai-compat completo (env) + agente ativo → provider openai-compat', () => {
  const p = gradingProviderFromConfig(config(), envFrom(OPENAI_ENV), rejectFetch);
  assertEquals(p?.nome, 'openai-compat');
});

Deno.test('env AI_GRADING_PROVIDER=fake + agente ativo → fake', () => {
  const p = gradingProviderFromConfig(config(), envFrom({ AI_GRADING_PROVIDER: 'fake' }), rejectFetch);
  assertEquals(p?.nome, 'fake');
});

Deno.test('on/off é soberano: agente desligado → null mesmo com env fake', () => {
  const p = gradingProviderFromConfig(
    config({ ativo: false }),
    envFrom({ AI_GRADING_PROVIDER: 'fake' }),
    rejectFetch,
  );
  assertEquals(p, null);
});

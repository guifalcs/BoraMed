import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { conteudoEmailGabarito, linkGabarito, nomeGabarito } from './gabarito-email.ts';
import { montarEmail } from './campanha-email.ts';

const G = {
  slug: 'n2-3-periodo-2026-2',
  titulo: null,
  tipo_prova: 'N2',
  periodo: 3,
  semestre: '2026.2',
  total_questoes: 40,
};

Deno.test('nomeGabarito usa título próprio ou o padrão', () => {
  assertEquals(nomeGabarito(G), 'N2 · 3º período');
  assertEquals(nomeGabarito({ ...G, titulo: '  N2 Manhã ' }), 'N2 Manhã');
});

Deno.test('linkGabarito aponta para a página pública, sem barra dupla', () => {
  assertEquals(linkGabarito('https://www.boramedoficial.com.br/', G.slug), 'https://www.boramedoficial.com.br/gabaritos/n2-3-periodo-2026-2');
});

Deno.test('conteúdo traz assunto, link público, disclaimer e tokens das campanhas', () => {
  const c = conteudoEmailGabarito(G, 'https://www.boramedoficial.com.br');
  assertEquals(c.assunto, 'Saiu o gabarito da N2 · 3º período 👀');
  assertEquals(c.nome, 'Gabarito · N2 · 3º período · 2026.2');
  assertStringIncludes(c.html, 'href="https://www.boramedoficial.com.br/gabaritos/n2-3-periodo-2026-2"');
  assertStringIncludes(c.html, 'sem vínculo com a Afya');
  assertStringIncludes(c.html, '{{primeiro_nome}}');
  assertStringIncludes(c.html, '{{link_descadastro}}');
  assertStringIncludes(c.html, '40 questões');
});

Deno.test('título com HTML é escapado', () => {
  const c = conteudoEmailGabarito({ ...G, titulo: '<b>N2</b>' }, 'https://x.test');
  assert(!c.html.includes('<b>N2</b>'));
  assertStringIncludes(c.html, '&lt;b&gt;N2&lt;/b&gt;');
});

Deno.test('passa pelo montarEmail das campanhas: tokens resolvidos e descadastro', () => {
  const c = conteudoEmailGabarito(G, 'https://www.boramedoficial.com.br');
  const email = montarEmail(
    { user_id: 'u1', email: 'maria@exemplo.com', nome_completo: 'maria clara', email_token: 'tok-1' },
    { remetente: 'BoraMed <contato@boramedoficial.com.br>', assunto: c.assunto, htmlBase: c.html, appUrl: 'https://www.boramedoficial.com.br', assetsUrl: '' },
  );
  assertStringIncludes(email.html, 'Oi, Maria.');
  assert(!email.html.includes('{{link_descadastro}}'));
  assertStringIncludes(email.html, 'descadastrar?token=tok-1');
});

Deno.test('com vários cadernos o e-mail lista os nomes (escapados); com um só, nada muda', () => {
  const um = conteudoEmailGabarito({ ...G, cadernos: ['Caderno único'] }, 'https://x.test');
  assert(!um.html.includes('cadernos'));
  const varios = conteudoEmailGabarito({ ...G, cadernos: ['Azul', 'Verde', '<i>Rosa</i>'] }, 'https://x.test');
  assertStringIncludes(varios.html, '3 cadernos');
  assertStringIncludes(varios.html, 'Azul, Verde, &lt;i&gt;Rosa&lt;/i&gt;');
  assertStringIncludes(varios.html, 'cada um tem o seu gabarito');
  assert(!varios.html.includes('<i>Rosa</i>'));
  assertStringIncludes(varios.html, '40 questões');
});

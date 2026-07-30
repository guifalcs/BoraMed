import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import {
  dividirEmLotes,
  escaparHtml,
  garantirRodapeDescadastro,
  isSegmento,
  linkDescadastro,
  montarEmail,
  personalizar,
  primeiroNome,
  remetenteValido,
  TAMANHO_LOTE,
} from './campanha-email.ts';

const DADOS = {
  nomeCompleto: 'Maria Clara de Souza',
  email: 'maria@exemplo.com',
  urlDescadastro: 'https://boramed.com.br/descadastrar?token=abc',
};

Deno.test('escaparHtml: neutraliza tags no nome vindo do cadastro', () => {
  assertEquals(escaparHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assertEquals(escaparHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

Deno.test('primeiroNome: primeiro token, com fallback para nome vazio', () => {
  assertEquals(primeiroNome('Maria Clara de Souza'), 'Maria');
  assertEquals(primeiroNome('  '), 'Tudo bem');
  assertEquals(primeiroNome(null), 'Tudo bem');
});

Deno.test('personalizar: substitui os tokens conhecidos', () => {
  const html = personalizar(
    '<p>Oi {{primeiro_nome}} ({{email}})</p><a href="{{link_descadastro}}">sair</a>',
    DADOS,
  );
  assertStringIncludes(html, 'Oi Maria (maria@exemplo.com)');
  assertStringIncludes(html, 'href="https://boramed.com.br/descadastrar?token=abc"');
});

Deno.test('personalizar: token desconhecido fica intacto (não vira "undefined")', () => {
  assertEquals(personalizar('Oi {{sobrenome}}', DADOS), 'Oi {{sobrenome}}');
});

Deno.test('personalizar: tolera espaços dentro das chaves', () => {
  assertEquals(personalizar('Oi {{ primeiro_nome }}', DADOS), 'Oi Maria');
});

Deno.test('personalizar: escapa no corpo HTML mas não no assunto', () => {
  const dados = { ...DADOS, nomeCompleto: 'Tom & Jerry' };
  assertEquals(personalizar('{{nome}}', dados), 'Tom &amp; Jerry');
  assertEquals(personalizar('{{nome}}', dados, false), 'Tom & Jerry');
});

Deno.test('garantirRodapeDescadastro: anexa rodapé quando o autor esqueceu o link', () => {
  const html = garantirRodapeDescadastro('<p>oi</p>');
  assertStringIncludes(html, '{{link_descadastro}}');
  assertStringIncludes(html, 'Não quero mais receber');
});

Deno.test('garantirRodapeDescadastro: não duplica quando o link já existe', () => {
  const original = '<p>oi</p><a href="{{link_descadastro}}">sair</a>';
  assertEquals(garantirRodapeDescadastro(original), original);
});

Deno.test('linkDescadastro: normaliza barra final e codifica o token', () => {
  assertEquals(
    linkDescadastro('https://boramed.com.br/', 'a b'),
    'https://boramed.com.br/descadastrar?token=a%20b',
  );
});

Deno.test('dividirEmLotes: respeita o limite de 100 do Resend', () => {
  const itens = Array.from({ length: 250 }, (_, i) => i);
  const lotes = dividirEmLotes(itens, TAMANHO_LOTE);
  assertEquals(lotes.length, 3);
  assertEquals(lotes[0].length, 100);
  assertEquals(lotes[2].length, 50);
  assertEquals(dividirEmLotes([], TAMANHO_LOTE).length, 0);
});

Deno.test('remetenteValido: aceita os dois formatos do Resend e rejeita lixo', () => {
  assert(remetenteValido('BoraMed <contato@boramed.com.br>'));
  assert(remetenteValido('contato@boramed.com.br'));
  assert(!remetenteValido('contato@localhost'));
  assert(!remetenteValido('BoraMed'));
  assert(!remetenteValido(''));
});

Deno.test('isSegmento: só aceita os segmentos do CHECK da migration', () => {
  assert(isSegmento('sem_assinatura_ativa'));
  assert(!isSegmento('inventado'));
  assert(!isSegmento(null));
});

Deno.test('montarEmail: um destinatário por envio, com List-Unsubscribe', () => {
  const email = montarEmail(
    {
      user_id: 'u1',
      email: 'maria@exemplo.com',
      nome_completo: 'Maria Clara de Souza',
      email_token: 'tok-1',
    },
    {
      remetente: 'BoraMed <contato@boramed.com.br>',
      assunto: '{{primeiro_nome}}, sua conta está parada',
      htmlBase: '<p>Oi {{primeiro_nome}}</p>',
      appUrl: 'https://boramed.com.br',
    },
  );

  // Um endereço por objeto: nunca expor a lista inteira no campo `to`.
  assertEquals(email.to, ['maria@exemplo.com']);
  assertEquals(email.subject, 'Maria, sua conta está parada');
  assertStringIncludes(email.html, 'Oi Maria');
  // Rodapé anexado automaticamente e já com a URL resolvida.
  assertStringIncludes(email.html, 'https://boramed.com.br/descadastrar?token=tok-1');
  assertEquals(
    email.headers['List-Unsubscribe'],
    '<https://boramed.com.br/descadastrar?token=tok-1>',
  );
});

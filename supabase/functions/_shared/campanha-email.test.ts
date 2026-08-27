import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import {
  dividirEmLotes,
  envelopeCampanha,
  escaparHtml,
  isSegmento,
  linkDescadastro,
  montarEmail,
  normalizarNome,
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

Deno.test('primeiroNome: corrige caixa toda-minuscula e toda-MAIUSCULA', () => {
  // Casos reais da base: o primeiro nome abre o assunto do e-mail.
  assertEquals(primeiroNome('barbara'), 'Barbara');
  assertEquals(primeiroNome('layla souza'), 'Layla');
  assertEquals(primeiroNome('LAIZ'), 'Laiz');
  assertEquals(primeiroNome('JOÃO PEDRO'), 'João');
  // Acento perdido no cadastro NÃO é inventado de volta.
  assertEquals(primeiroNome('barbara'), 'Barbara');
});

Deno.test('primeiroNome: caixa mista fica intacta (nome grafado de propósito)', () => {
  for (const nome of ['McCarthy', "d'Ávila", 'DiCaprio', 'MacGyver Silva']) {
    assertEquals(primeiroNome(nome), nome.split(' ')[0]);
  }
});

Deno.test('normalizarNome: token a token, com partícula minúscula no meio', () => {
  assertEquals(normalizarNome('MARIA DA SILVA'), 'Maria da Silva');
  assertEquals(normalizarNome('joão de souza e lima'), 'João de Souza e Lima');
  assertEquals(normalizarNome('MARIA  DA   SILVA'), 'Maria da Silva'); // espaço repetido
  // Partícula no COMEÇO do nome é nome, não partícula.
  assertEquals(normalizarNome('DE LUCCA'), 'De Lucca');
  // Já bem grafado passa incólume.
  assertEquals(normalizarNome('Maria Clara de Souza'), 'Maria Clara de Souza');
  assertEquals(normalizarNome('Ana McCarthy do Vale'), 'Ana McCarthy do Vale');
  assertEquals(normalizarNome(''), '');
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

Deno.test('envelopeCampanha: embrulha o conteúdo no layout da marca', () => {
  const html = envelopeCampanha('<p>Oi!</p>', 'https://boramed.com.br');

  assertStringIncludes(html, '<!DOCTYPE html>');
  assertStringIncludes(html, '<p>Oi!</p>');
  // Logo do mesmo asset dos templates de auth, resolvida pela APP_URL.
  assertStringIncludes(html, 'src="https://boramed.com.br/brand/logo-branca-email.png"');
  // Gradiente do header + fallback VML para o Outlook desktop.
  assertStringIncludes(html, 'linear-gradient(135deg,#1e40af 0%,#2451d8 52%,#6427d9 100%)');
  assertStringIncludes(html, '<v:fill type="gradient"');
  // Rodapé SEM link de descadastro (decisão do produto): o opt-out vive no
  // header List-Unsubscribe e na página pública. Trava para o link não voltar
  // ao corpo por acidente.
  assert(!html.includes('{{link_descadastro}}'));
  assert(!html.includes('Não quero mais receber'));
});

Deno.test('envelopeCampanha: normaliza a barra final da APP_URL', () => {
  const html = envelopeCampanha('<p>x</p>', 'https://boramed.com.br/');
  assertStringIncludes(html, 'src="https://boramed.com.br/brand/logo-branca-email.png"');
});

Deno.test('envelopeCampanha: assetsUrl tira a logo do localhost sem mexer nos links', () => {
  // Cenário de desenvolvimento: link de descadastro local (para poder clicar),
  // logo num host público (o proxy de imagem do Gmail não alcança localhost).
  const html = envelopeCampanha('<p>x</p>', 'http://localhost:4200', 'https://www.exemplo.com/');
  assertStringIncludes(html, 'src="https://www.exemplo.com/brand/logo-branca-email.png"');
  assert(!html.includes('localhost:4200/brand'));

  // Vazio ou só espaço não deve virar "/brand/..." sem host.
  for (const vazio of [undefined, '', '   ']) {
    const comFallback = envelopeCampanha('<p>x</p>', 'https://boramed.com.br', vazio);
    assertStringIncludes(comFallback, 'src="https://boramed.com.br/brand/logo-branca-email.png"');
  }
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
  assert(isSegmento('nunca_assinou'));
  assert(isSegmento('ex_assinantes'));
  assert(isSegmento('todos'));
  assert(isSegmento('mais_ativos'));
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
  // Envelope da marca aplicado no envio: o htmlBase é só o conteúdo do card.
  assertStringIncludes(email.html, '<!DOCTYPE html>');
  assertStringIncludes(email.html, '/brand/logo-branca-email.png');
  // Sem link de descadastro no corpo: o autor da campanha não pediu.
  assert(!email.html.includes('/descadastrar?token=tok-1'));
  // O {{email}} do rodapé continua resolvido.
  assertStringIncludes(email.html, 'maria@exemplo.com');
  assertEquals(
    email.headers['List-Unsubscribe'],
    '<https://boramed.com.br/descadastrar?token=tok-1>',
  );
  // NÃO declaramos um-clique: a URL é uma página do SPA e um POST nela não
  // grava o opt-out. Prometer e não cumprir gera "descadastrei e continuo
  // recebendo" — e a próxima ação da pessoa é marcar spam.
  assertEquals(email.headers['List-Unsubscribe-Post'], undefined);
});

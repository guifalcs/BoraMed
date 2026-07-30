# Campanhas de e-mail (Resend)

Disparo de e-mails personalizados para segmentos de alunos — reativação de quem
criou conta e não assinou, avisos de lançamento, etc.

Não confundir com os e-mails **transacionais** do Supabase Auth (confirmação de
cadastro, recuperação de senha), que continuam saindo pelo SMTP do Supabase e
não passam por aqui.

Decisões de arquitetura: `docs/architecture.md`, ADR-033.

---

## 1. Setup no Resend (uma vez)

1. Criar conta em <https://resend.com>. O plano gratuito cobre 3.000 e-mails/mês
   e 100/dia — suficiente para as primeiras campanhas; acima disso o disparo
   volta com 429 e a campanha fica `parcial` (é só retomar no dia seguinte).
2. **Domains → Add Domain** → `boramedoficial.com.br` (é o domínio do app;
   `boramed.com.br` não resolve).
3. Publicar no DNS os registros que o Resend mostrar. São três:
   - **MX** e **TXT (SPF)** num subdomínio de envio (`send.boramedoficial.com.br`);
   - **TXT (DKIM)** em `resend._domainkey`;
   - opcionalmente **TXT (DMARC)** em `_dmarc` — recomendado:
     `v=DMARC1; p=none; rua=mailto:dmarc@boramedoficial.com.br`.
4. Esperar o status virar **Verified** (minutos a algumas horas, conforme a
   propagação). Sem isso, todo envio falha com erro de domínio.
5. **API Keys → Create API Key**, permissão *Sending access*. A chave aparece
   uma única vez.

> Enquanto o domínio não estiver verificado, dá para testar usando o remetente
> de sandbox `onboarding@resend.dev`, que só entrega para o e-mail dono da conta
> Resend. Serve para conferir layout, não para disparar campanha.

## 2. Secrets das edge functions

```bash
npx supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxxxxxxxxx \
  RESEND_FROM="BoraMed <contato@boramedoficial.com.br>" \
  --project-ref <PROJECT_REF>
```

`APP_URL` já é usada por outras functions e não precisa ser redefinida — é ela
que monta o link de descadastro (`{APP_URL}/descadastrar?token=…`) e, por
padrão, também a URL da logo do envelope.

### `EMAIL_ASSETS_URL` (só em desenvolvimento)

Gmail e Outlook não baixam a imagem direto: passam por um **proxy na nuvem**.
Com `APP_URL=http://localhost:4200`, esse proxy não alcança a sua máquina e a
logo chega quebrada na caixa de entrada — o link de descadastro, que é clicado
por você, precisa continuar local. Por isso o host da logo é separado:

```bash
# supabase/functions/.env.local (só no ambiente local)
EMAIL_ASSETS_URL=https://www.boramedoficial.com.br
```

Em produção pode ficar de fora: a `APP_URL` já é pública. Use o host **final**
(com `www.` se o domínio redireciona), para o proxy não depender do 308.

O remetente precisa estar **no domínio verificado**. Formato aceito:
`Nome <email@dominio>` ou só `email@dominio`.

## 3. Deploy

```bash
# 1) migrations (SÃO DUAS: tabelas/RPCs + grants). Revise o diff antes.
npx supabase db push --project-ref <PROJECT_REF>
# 2) a function
npx supabase functions deploy enviar-campanha-email --project-ref <PROJECT_REF>
```

O frontend sobe junto com o deploy normal da Vercel.

A ordem importa: a function sem as migrations falha com
`permission denied for table email_campanha` (ou com coluna inexistente). E a
migration `20260730180000` não é opcional — em produção o default privileges
concede escrita para `anon`/`authenticated`, e é ela que fecha isso.

## 4. Uso — `/admin/campanhas`

1. **Nome interno**: só aparece no histórico do admin.
2. **Público**: a contagem ao lado do seletor é o número real de destinatários.
3. **Assunto** e **Conteúdo (HTML)** — veja "O envelope da marca" abaixo.
4. **Prévia do e-mail** — atualiza sozinha ~0,7 s depois da última tecla,
   mostrando "De / Para / Assunto" e o corpo renderizado. Os botões de
   desktop/celular trocam a largura simulada (640 px / 375 px).
5. **Enviar teste** — sempre antes do disparo. Vai para o seu e-mail (ou outro
   que você digitar) com a personalização resolvida.
6. **Disparar campanha** → confirmação explícita → envio.

### O envelope da marca

O campo de HTML é **o conteúdo do card, não o e-mail inteiro**. No envio, a
função `envelopeCampanha()` (`_shared/campanha-email.ts`) embrulha o que você
escreveu em:

- header com gradiente e a logo branca
  (`{EMAIL_ASSETS_URL ou APP_URL}/brand/logo-branca-email.png`);
- card branco de 560px sobre fundo cinza;
- rodapé com "enviado para {{email}}" e o copyright — **sem** link de descadastro
  (ver "Onde está o descadastro" abaixo).

É o mesmo layout de `supabase/email-templates/confirm-signup.html` e
`reset-password.html` — a diferença é que ali o template é um arquivo lido pelo
GoTrue e aqui ele vive em código, porque o admin edita só o miolo.

Consequências práticas:

- **não cole um documento HTML completo** no campo (`<html>`, `<body>`): ele
  entraria aninhado dentro do card. Escreva `<h2>`, `<p>`, tabelas de botão;
- o layout não quebra por edição do corpo — no máximo o conteúdo do card fica
  torto;
- para mudar o layout de TODAS as campanhas, mexa em `envelopeCampanha()` — e
  lembre que os dois templates de auth são cópias independentes do mesmo desenho.

Regras de HTML de e-mail que o envelope respeita (e que valem para o conteúdo
também): layout em `<table>`, `style` inline, sem `<style>` em `<head>`
(Gmail descarta), sem flex/grid, e gradiente com fallback VML para o Outlook
desktop.

### A prévia é o mesmo caminho do envio

O HTML da prévia sai do `montarEmail()` da edge function (modo `previa`), o
mesmo que monta o payload do Resend — envelope aplicado, tokens substituídos,
rodapé de descadastro incluído. Nada é remontado no frontend, então o preview
não divirge do que é enviado.

A prévia não chama o Resend: funciona antes de o domínio estar verificado e sem
`RESEND_API_KEY` configurada. Duas coisas que ela **não** garante:

- o link de descadastro do rodapé usa um token zerado (não descadastra ninguém);
- cada cliente de e-mail (Gmail, Outlook, Apple Mail) aplica as próprias regras
  de CSS. Para layout, o **Enviar teste** continua sendo a palavra final.

O corpo é renderizado num `<iframe sandbox>` sem `allow-scripts` nem
`allow-same-origin`: o HTML da campanha não executa nada nem alcança a sessão do
admin.

### Segmentos

| Segmento | Quem entra |
| --- | --- |
| `sem_assinatura_ativa` | Criou conta e **não tem acesso ativo hoje** (nunca assinou + ex-assinantes). É o padrão da tela. |
| `nunca_assinou` | Nunca chegou a ter assinatura efetivada. Checkout aberto e abandonado (`pending`) conta aqui. |
| `ex_assinantes` | Já assinou e hoje não tem acesso. |
| `todos` | Todos os alunos elegíveis. |

Fora de qualquer segmento, sempre: admins e super_admins, contas banidas, quem
pediu descadastro e **contas com e-mail não confirmado** (endereço provavelmente
inválido; hard bounce derruba a reputação do domínio).

### Variáveis de personalização

| Token | Vira |
| --- | --- |
| `{{primeiro_nome}}` | `Maria` |
| `{{nome}}` | `Maria Clara de Souza` |
| `{{email}}` | `maria@exemplo.com` |
| `{{link_descadastro}}` | URL de opt-out do destinatário |

A caixa é normalizada quando o nome vem inteiro minúsculo ou inteiro maiúsculo
(`barbara` → `Barbara`, `LAIZ SOUZA` → `Laiz Souza`, partícula do meio fica
minúscula). Nome com maiúscula no meio fica intacto — é o que preserva
`McCarthy` e `d'Ávila`; um title-case genérico os "consertaria" errado. Acento
perdido no cadastro **não** é recuperado (`barbara` nunca vira `Bárbara`): para
isso, corrija o `nome_completo` do perfil.

Sem `nome_completo` no perfil, `{{nome}}` e `{{primeiro_nome}}` viram
`Tudo bem` — escreva o assunto de forma que "Tudo bem, sua conta…" ainda faça
sentido.

`{{email}}` aparece no rodapé do envelope. `{{link_descadastro}}` **não** — ele
só entra no e-mail se você escrever o token no conteúdo da campanha.

### Onde está o descadastro

Decisão de produto (2026-07-30): o link de descadastro **não vai no corpo** do
e-mail. Os caminhos que restam:

- header `List-Unsubscribe` em todo envio — Gmail e Outlook mostram "Cancelar
  inscrição" no topo da mensagem, e o clique abre a página no browser;
- página pública `/descadastrar?token=…`, que continua funcionando;
- `{{link_descadastro}}` no conteúdo, se o autor da campanha quiser.

Não há mais rodapé de opt-out anexado automaticamente — a função que fazia isso
(`garantirRodapeDescadastro`) foi removida, senão ela reanexaria o link.

O risco assumido: sem link visível no corpo, quem usa um cliente de e-mail que
não honra o `List-Unsubscribe` não tem saída óbvia e tende a clicar em **spam**.
Complaint pesa mais na reputação do domínio do que descadastro, e o Resend exige
mecanismo de opt-out em e-mail de marketing. Se a taxa de spam subir no painel do
Resend, o primeiro ajuste a fazer é devolver o link ao rodapé.

## 5. Campanha `parcial` e retomada

O disparo é síncrono e para sozinho por volta dos 100 segundos, fechando a
campanha como `parcial`. Isso é esperado em listas grandes (~9 mil e-mails por
execução).

O botão **Retomar** no histórico reprocessa os destinatários `pendente` (nunca
tentados) **e** `falhou` (o Resend recusou) — nunca `enviado`, então não duplica
quem já recebeu. Incluir `falhou` é o que torna a retomada útil no caso real:
estourar a cota diária do Resend marca as linhas como `falhou`, e sem isso elas
nunca seriam tentadas de novo.

Como o status sai dos totais do log:

| Situação | Status |
| --- | --- |
| Sobrou `pendente` ou o orçamento de tempo estourou | `parcial` |
| Só falhas, nada entregue | `falhou` |
| Parte entregue, parte falhou | `parcial` (as falhas são retomáveis) |
| Tudo entregue (ou cancelado por opt-out) | `enviada` |

`enviada` é terminal: `concluida_em` é preenchido e a retomada passa a recusar
com "campanha já concluída".

### Quem recebeu — botão "Destinatários"

Cada linha do histórico abre um modal com a lista por destinatário: e-mail, nome,
status, quando saiu e o erro do Resend quando houve. Filtros por status
(enviados, falhas, descadastrados, pendentes) e paginação de 200 em 200.

A ordem é **problema primeiro** (falhou → pendente → cancelado → enviado): quem
abre essa lista quase sempre está investigando o que não chegou.

Sai da RPC `admin_listar_destinatarios_campanha` (`SECURITY DEFINER`, grant para
`authenticated`, `is_admin()` checado dentro) — as tabelas não têm grant para o
cliente. O teto por chamada é 500 linhas; o `total` vem junto de cada linha via
`count(*) OVER ()`, para a tela mostrar "mostrando 200 de 1.234" sem uma segunda
consulta. São e-mails de pessoas reais: a lista é descartada da memória ao fechar
o modal.

`falhou` sem nenhum envio geralmente é chave inválida, domínio não verificado ou
remetente fora do domínio. A resposta literal do Resend fica em
`email_campanha.erro` e, por destinatário, em
`email_campanha_destinatario.erro` — dá para diagnosticar pelo histórico, sem
abrir o log da function.

### "falha ao registrar a campanha"

É erro de **grant**, não de Resend: o `service_role` não tem INSERT em
`email_campanha`. O log da function mostra
`permission denied for table email_campanha`. Sintoma característico: o
**Enviar teste funciona** (não toca nas tabelas) e só o disparo falha.

Neste projeto o `ALTER DEFAULT PRIVILEGES` do schema `public` já não concede DML
para `anon`/`authenticated`/`service_role` — toda tabela nova nasce sem
select/insert/update e precisa de GRANT explícito na migration. Foi o que
`20260730180000_campanhas_email_grants.sql` corrigiu. Para conferir o default do
projeto:

```sql
select defaclacl from pg_default_acl
 where defaclnamespace = 'public'::regnamespace and defaclrole = 'postgres'::regrole;
```

## 6. Boas práticas de entregabilidade

- **Aquecer o domínio**: as primeiras campanhas de um domínio novo devem ir para
  algumas centenas de pessoas, não para a base toda. Volume alto de saída num
  domínio sem histórico é o gatilho clássico de filtro de spam.
- Evitar palavra de gatilho no assunto (GRÁTIS, URGENTE, excesso de `!`) e
  e-mail só-imagem.
- Acompanhar bounce e complaint no painel do Resend depois de cada campanha. O
  `resend_id` gravado em `email_campanha_destinatario` permite cruzar um evento
  do painel com o destinatário.
- Respeitar o descadastro: nunca reimportar manualmente quem saiu.
- O e-mail leva o header `List-Unsubscribe` (o Gmail mostra "Cancelar inscrição"
  no topo da mensagem, e o clique abre a página de opt-out no browser). **Não**
  levamos `List-Unsubscribe-Post`: aquele header declara que a URL processa um
  POST de um-clique, e a nossa é uma página do SPA — um POST devolve 200 sem
  gravar nada. O provedor diria à pessoa que ela saiu da lista enquanto o
  opt-out não seria registrado, e ela marcaria a campanha seguinte como spam.
  Para ter o um-clique de verdade é preciso um endpoint que aceite POST.

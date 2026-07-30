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
2. **Domains → Add Domain** → `boramed.com.br`.
3. Publicar no DNS os registros que o Resend mostrar. São três:
   - **MX** e **TXT (SPF)** num subdomínio de envio (`send.boramed.com.br`);
   - **TXT (DKIM)** em `resend._domainkey`;
   - opcionalmente **TXT (DMARC)** em `_dmarc` — recomendado:
     `v=DMARC1; p=none; rua=mailto:dmarc@boramed.com.br`.
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
  RESEND_FROM="BoraMed <contato@boramed.com.br>" \
  --project-ref <PROJECT_REF>
```

`APP_URL` já é usada por outras functions e não precisa ser redefinida — é ela
que monta o link de descadastro (`{APP_URL}/descadastrar?token=…`).

O remetente precisa estar **no domínio verificado**. Formato aceito:
`Nome <email@dominio>` ou só `email@dominio`.

## 3. Deploy

```bash
npx supabase db push --project-ref <PROJECT_REF>        # migration das tabelas/RPCs
npx supabase functions deploy enviar-campanha-email --project-ref <PROJECT_REF>
```

O frontend sobe junto com o deploy normal da Vercel.

## 4. Uso — `/admin/campanhas`

1. **Nome interno**: só aparece no histórico do admin.
2. **Público**: a contagem ao lado do seletor é o número real de destinatários.
3. **Assunto** e **Corpo (HTML)**.
4. **Enviar teste** — sempre antes do disparo. Vai para o seu e-mail (ou outro
   que você digitar) com a personalização resolvida.
5. **Disparar campanha** → confirmação explícita → envio.

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

Sem `nome_completo` no perfil, `{{nome}}` e `{{primeiro_nome}}` viram
`Tudo bem` — escreva o assunto de forma que "Tudo bem, sua conta…" ainda faça
sentido.

Se o corpo não contiver `{{link_descadastro}}`, um rodapé com o link é anexado
automaticamente. Não há como enviar campanha sem saída.

## 5. Campanha `parcial` e retomada

O disparo é síncrono e para sozinho por volta dos 100 segundos, fechando a
campanha como `parcial`. Isso é esperado em listas grandes (~9 mil e-mails por
execução). O botão **Retomar** no histórico reenvia apenas os destinatários que
ficaram `pendente` — nunca duplica quem já recebeu.

`falhou` sem nenhum envio geralmente é chave inválida, domínio não verificado ou
remetente fora do domínio. A causa fica em `email_campanha.erro` e, por
destinatário, em `email_campanha_destinatario.erro`.

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

# Conteúdos de campanha prontos

Cada arquivo `.html` aqui é o **conteúdo do card** de uma campanha de e-mail —
exatamente o que se cola no campo "Conteúdo (HTML)" de `/admin/campanhas`. O
header com a logo, o card branco e o rodapé vêm do envelope da marca, aplicado
no envio (`supabase/functions/_shared/campanha-email.ts`). Não colar documento
HTML completo. Mecânica, segmentos e tokens: `docs/campanhas-email.md`.

---

## `2026-08-n1-treinos-nacionais.html`

Conversão de quem criou conta e não assinou, usando a proximidade da N1 como
gancho. Vende o plano Essencial (treinos nacionais até o 8º período).

- **Público:** `sem_assinatura_ativa` (padrão da tela). Pega quem nunca assinou
  e ex-assinantes — os dois grupos estão sem acesso agora e a copy serve para
  ambos.
- **Nome interno sugerido:** `2026-08 · N1 · treinos nacionais`

### Assunto

Principal:

```
{{primeiro_nome}}, a N1 está chegando
```

Alternativas para teste A/B (o token vem primeiro de propósito: sem
`nome_completo` no perfil ele vira "Tudo bem", e "Tudo bem, a N1 está chegando"
continua fazendo sentido — "a N1 vem aí, Tudo bem" não):

```
{{primeiro_nome}}, quantas questões você já fez para a N1?
{{primeiro_nome}}, dá tempo de treinar antes da N1
```

Sem caixa alta, sem "GRÁTIS/URGENTE", sem excesso de `!` — palavra de gatilho no
assunto derruba entregabilidade (ver seção 6 de `docs/campanhas-email.md`).

### Preços citados (produção, conferidos em 2026-08-26)

| Plano | Mensal | Semestral |
| --- | --- | --- |
| Essencial | R$ 23,90/mês | R$ 13,90/mês (R$ 83,40, até 6x) |
| Avançado | R$ 69,90/mês | R$ 49,90/mês (R$ 299,40, até 6x) |

O e-mail cita só o "a partir de R$ 13,90/mês" (Essencial semestral). **Reconferir antes de disparar** —
o preço vive no banco (`plano.preco_centavos`) e já divergiu do que estava no
código uma vez (commit `e458fe8`).

### Antes de disparar

1. Colar o HTML, conferir a prévia no desktop e no celular.
2. **Enviar teste** para si mesmo — a prévia não é palavra final de layout.
3. Conferir a contagem do público ao lado do seletor.
4. Se a base for grande e o domínio ainda estiver novo no Resend, disparar em
   ondas (cota do plano gratuito: 100/dia, 3.000/mês).

### Decisões da copy

- **Curto de propósito.** ~70 palavras: gancho, uma frase de valor, preço e
  botão. Vender o app inteiro por e-mail é trabalho da landing e do app — aqui
  o objetivo é só o clique.
- **Nada de escassez falsa.** A urgência é a data da prova, que é real. Desconto
  que "expira em 24h" queima a lista e o mesmo gancho volta a servir na N2.
- **Sem mencionar os 3 simulados gratuitos.** O segmento inclui quem já gastou
  os três; prometer o que a pessoa não tem mais custa mais que o CTA ganha.
- **CTA para `https://www.boramedoficial.com.br/planos`**, que serve aos dois
  estados de sessão: quem está logado cai na tela de planos do app, quem não
  está vai para `/#planos`, a seção de planos da landing. Quem decide é o
  `planosPublicoGuard` (ver `docs/auth-root-routing.md`). Antes desse guard o
  deslogado parava no `/login` e terminava no dashboard, sem ver a oferta.
- **Link de descadastro no rodapé do conteúdo.** O envelope não anexa mais um
  automaticamente (só o header `List-Unsubscribe`), e campanha de conversão para
  base fria é justamente o caso em que a falta do link visível vira clique em
  spam.
- **Sem citar a Afya no corpo.** Sem a referência, não é preciso carregar o
  disclaimer de independência num e-mail que precisa ser curto. Se voltar a
  falar em "modelo das avaliações da Afya", o disclaimer volta junto (regra do
  `CLAUDE.MD`).

---

## `2026-08-parabens-mais-ativos.html`

Reconhecimento de quem usa muito a plataforma. Não vende nada — o público pode
(e neste disparo é) assinante ativo. O objetivo real é duplo: reforçar o hábito
de quem já voltou sozinho, e abrir um canal de resposta com a pessoa que mais
tem o que dizer sobre o produto.

- **Público:** `mais_ativos` (segmento criado em
  `20260827120000_campanha_segmento_mais_ativos.sql`): ≥20 interações e ≥3 dias
  distintos nos últimos 14 dias.
- **Nome interno sugerido:** `2026-08 · parabéns · mais ativos`

### Assunto

Principal:

```
{{primeiro_nome}}, você foi quem mais treinou por aqui
```

Alternativas:

```
{{primeiro_nome}}, 82 questões em duas semanas
{{primeiro_nome}}, passando só para te dar os parabéns
```

### ⚠️ Números fixos no corpo

Os números do texto (7 simulados, 82 questões, 84,9%, o 100% em Anatomia) são da
**Eduarda Cristhine**, apurados em 27/08/2026, e estão **escritos no HTML** — o
envelope só personaliza `{{nome}}`, `{{primeiro_nome}}`, `{{email}}` e
`{{link_descadastro}}`; não existe token de estatística.

Na apuração de 27/08 o segmento tinha **exatamente 1 pessoa**, o que torna isso
seguro. **Se a contagem do público na tela vier > 1, não dispare este conteúdo
como está** — os números de uma pessoa sairiam para todas. Reescreva sem números
ou dispare individualmente.

### Antes de disparar

1. **Reconferir a contagem do público na tela.** A janela de `mais_ativos` é
   móvel: o público de hoje não é o de ontem.
2. **Reconferir os números do corpo** se tiver passado tempo desde 27/08 — eles
   envelhecem junto com a janela de 14 dias.
3. O corpo diz "com um 100% cravado em Anatomia e Histologia Cardíaca". Confirme
   que esse resultado ainda está na janela antes de disparar.
4. Enviar teste para si mesmo — a prévia não é palavra final de layout.

### Decisões da copy

- **Zero venda.** A destinatária é assinante do Avançado Semestral. Qualquer CTA
  de plano num e-mail de parabéns transforma o elogio em pretexto e queima os
  dois.
- **Pedido de resposta como CTA real.** O botão leva ao `/dashboard`, mas o que
  mais vale é o "responde esse e-mail": é feedback da usuária mais engajada, e
  resposta a e-mail de marca também ajuda entregabilidade no Gmail.
- **Sem dizer que ninguém chegou perto.** "Você foi quem mais treinou" é elogio;
  "nenhum outro aluno chegou perto" entrega que a base é pequena.
- **Assinado "Guilherme — BoraMed"**, não "Equipe BoraMed". Para um e-mail que
  pede resposta pessoal, assinatura institucional é contraditória.
- **Nada de gênero gramatical.** "Foi o maior volume de treino da plataforma",
  não "a aluna mais ativa" — o perfil guarda nome, não gênero, e o segmento é
  reutilizável.
- **Link de descadastro no rodapé.** Mesmo em e-mail bem recebido: o envelope só
  manda o header `List-Unsubscribe`, e o custo de deixar visível é zero.

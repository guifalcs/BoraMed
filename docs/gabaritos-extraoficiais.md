# Gabaritos extraoficiais

Recurso **gratuito e público** (a gratuidade é destacada só na landing; as telas
de gabarito não mostram selo "Grátis"): logo depois de uma prova (N1, N2, Integradora…),
a equipe publica o gabarito extraoficial do período antes do oficial sair. O link
circula livre, mas **ver as respostas exige conta**: quem chega sem login cai numa
página-convite e, depois de criar a conta ou entrar, vai direto para o gabarito.
A conta é grátis, a mesma do plano gratuito.

## Para o Arthur: como publicar em 2 minutos

1. **Admin → Conteúdo → Gabaritos → Novo gabarito** (`/admin/gabaritos/novo`).
2. **Qual prova?** Toque no tipo (N1, N2, P1, P2, Integradora, TPI, SOI, HAM ou
   *Outra…*), no período (1º–12º), confira o semestre e, se quiser, a data. Escolha
   A–D ou A–E e o nº de questões (atalhos 20/30/40/50/60/80/100).
3. **Cadernos** (só se a prova teve versões diferentes). Por padrão a prova tem um
   caderno só e nada muda. Se teve vários (Azul e Verde, caderno A e B…), toque em
   **Adicionar caderno** e dê a cada um o **nome que está na capa**. Os atalhos
   *Próximo caderno*, *Azul*, *Verde*, *Amarelo*… ou um nome digitado servem para
   isso; vale até 12. As questões são as mesmas e só a ordem muda, então **cada
   caderno tem a sua própria folha de respostas**, e o nº de questões e A–D/A–E são
   iguais para todos (mudar um muda todos). Ao passar de 1 para 2 cadernos, o primeiro
   vira "Caderno A" e o novo "Caderno B", ambos renomeáveis. Excluir um caderno
   (lixeira) leva as respostas dele e pede confirmação. Nomes vazios ou repetidos
   bloqueiam o salvar.
4. **Marque as respostas** (de cada caderno: as abas acima do cartão trocam de
   caderno e mostram o progresso de cada um), do jeito que for mais rápido:
   * **Digitando:** clique na questão 1 e digite as letras em sequência. O cursor
     desce sozinho. `X` anula, `Espaço` deixa "em análise", `⌫` apaga, `↑ ↓` navegam.
   * **Colando:** *Colar gabarito* (aplica no caderno aberto) aceita "ABCDA…", "1-A 2-B", "1) C", uma por
     linha, "Questão 3: anulada"… A prévia mostra o que foi reconhecido antes de aplicar.
   * **Clicando:** toque nas bolinhas, como no cartão-resposta.
5. Opcional por questão (ícone de balão): **área** (ex.: Anatomia, que vira filtro
   para o aluno) e **comentário da equipe** ("cabe recurso", "pegadinha"…).
6. **Publicar.** Com *Avisar alunos do Xº período* marcado, o aviso sai por dois canais:
   * **No app:** notificação com link direto para **todos** os alunos do período.
   * **Por e-mail:** para **até 50** alunos do período. Quem é de fora de Ipatinga vem
     primeiro, porque em Ipatinga a notícia já corre nos grupos. Dentro de cada grupo,
     quem entrou no app por último vem antes. Quem passa de 50 não recebe e-mail, só a
     notificação no app. Ficam de fora quem pediu descadastro, contas banidas e e-mails
     não confirmados, como nas campanhas.

   Cada canal sai **uma vez só** por gabarito, e só conta como enviado se alguém
   recebeu. Se publicou sem avisar, ou não havia aluno do período ainda, o editor
   mostra **Avisar alunos agora**. *Ver o e-mail que os alunos recebem* abre a prévia.
   O e-mail entra no histórico de `/admin/campanhas` ("Gabarito publicado
   (automático)"). Se o Resend falhar, é ali que se usa o **Retomar**.

   Depois aparecem **Copiar link** e **WhatsApp**. O link é o **público**
   (`/gabaritos/<slug>`). Quem já está logado vai direto ao gabarito dentro do app.
   Quem não está logado vê a **vitrine**: nome da prova, semestre, há quanto tempo
   saiu, nº de questões, **os nomes dos cadernos** e as visualizações, um cartão com as respostas **borradas e
   com cadeado** e os botões **Criar conta e ver o gabarito** / **Já tenho conta ·
   Entrar**. Depois do cadastro (inclusive passando pela confirmação de e-mail) ou do
   login, a pessoa cai direto no gabarito que foi buscar.
7. Saiu o oficial e bateu? Edite e marque **Conferido com o oficial**: o selo muda
   de "Extraoficial" para "Bate com o oficial".

Sair do editor com alterações não salvas (link, menu, F5) pede confirmação. Reduzir
o nº de questões avisa se alguma das cortadas tinha resposta, área ou comentário.

Publicar com algum caderno ainda **sem nenhuma resposta** pede confirmação: o aluno
desse caderno veria só "em análise". Dá para publicar com questões **em análise** (sem letra): elas aparecem com "?" e
ficam fora da nota do aluno até você fechar a letra. A lateral mostra o progresso e
a **distribuição das letras**, para bater o olho se alguma ficou estranha.

**Tirar do ar** devolve para rascunho (o link para de funcionar para o público, mas o
slug não muda e volta a valer ao republicar). **Excluir** é definitivo.

## O que o aluno vê

* `/gabaritos` (público): lista por semestre, filtro por período, selos *Novo* (até 3
  dias), *Extraoficial* / *Bate com o oficial* e contador de visualizações. Provas com
  vários cadernos mostram os nomes no card. O card mostra um cadeado e abre a vitrine. Logado, a página leva a `/dashboard/gabaritos`.
* `/gabaritos/:slug` (público): a **vitrine** descrita acima. As letras borradas
  são de mentira, porque as reais nem chegam ao navegador de quem não tem conta.
* `/dashboard/gabaritos/:slug` (com conta). Se a prova tem **vários cadernos**, a
  primeira coisa é **"Qual é o seu caderno?"**: o aluno escolhe o da capa da prova e
  **nenhuma resposta aparece antes disso** (a ordem das questões muda de um caderno
  para outro, então chutar um daria nota errada). Depois, a faixa **Seu caderno** troca
  entre eles a qualquer momento, e a escolha é lembrada na volta (só no aparelho). Cada
  caderno tem a sua grade, a sua conferência e as suas marcações. Aba **Ver gabarito**: grade numerada; anulada (listrada),
  em análise (?), ponto azul = tem comentário (toque para ler); filtro por área.
* Aba **Conferir minha nota**: o aluno marca o que respondeu (ou cola a sequência).
  As respostas certas ficam escondidas até tocar em **Ver minha nota**. Resultado
  com anel de nota, acertos/erros, linha a linha "Era C" e botão de compartilhar.
  As marcações ficam só no aparelho (`localStorage`), uma por caderno. Prova de um
  caderno só segue com a chave antiga, então o que já foi marcado continua valendo; se um
  gabarito ganhar cadernos depois, as marcações antigas valem para o 1º.
* **Compartilhar** (no topo e no resultado): no celular abre a folha de
  compartilhamento do sistema (WhatsApp, grupo da turma, Instagram, Telegram…). Sem
  esse recurso (desktop), abre o WhatsApp com a mensagem e o link prontos, e o aluno
  só escolhe a conversa ou o grupo. O link é sempre o público.
* Logado, o mesmo conteúdo fica dentro do app em `/dashboard/gabaritos`. O item
  **Gabaritos** do menu ganha o selo azul **NOVO**, no formato do selo PRO, quando há
  gabarito publicado nas últimas 24h. No mobile, Gabaritos fica no menu do perfil:
  o selo aparece no item e um ponto no avatar indica que há algo novo ali dentro.

### Regra da nota

`nota = (acertos + anuladas) / (total − em análise)`. Anulada conta ponto para todo
mundo (prática usual); questão em análise fica fora da conta. A conferência roda
no cliente: o gabarito publicado já é público, não há segredo a proteger.

## Posicionamento (obrigatório)

Toda tela traz o aviso: gabarito **extraoficial**, elaborado pela equipe BoraMed,
pode ter divergência, o oficial é o da instituição, e **sem vínculo com a Afya**.
Guardamos só número → letra (+ comentário autoral); **o enunciado da prova não é
publicado**.

## Técnico

* Migration `20261105120000_gabaritos_provas.sql`: tabelas `gabarito_prova` e
  `gabarito_prova_questao`, RLS admin-only (+ `banidos_bloqueados`), **sem grant
  para `anon`** e sem INSERT/UPDATE para `authenticated`.
* Leitura só por RPC `SECURITY DEFINER` que filtra `status = 'publicado'`:
  * públicas (anon): `listar_gabaritos_provas(p_periodo)`,
    `get_gabarito_prova_vitrine(p_slug)` (prova + contagens, **nenhuma letra nem
    comentário**) e `registrar_visualizacao_gabarito_prova`;
  * **com conta**: `get_gabarito_prova(p_slug)`, com as respostas. Não executa
    para anon (`42501`); o rascunho só aparece para admin, na pré-visualização.
* Destino pós-cadastro (`core/utils/destino-pos-login.util.ts`): a vitrine guarda
  `/dashboard/gabaritos/<slug>` no `localStorage` (24h, só caminhos de gabarito) e
  manda `?next=` para cadastro e login. O login devolve pelo `next`. O template de
  confirmação de e-mail sempre leva a `/dashboard`, e o shell do dashboard consome
  o destino na primeira entrada. Cadastro e login mostram o aviso "Falta pouco para
  ver o gabarito" quando o `next` é de gabarito.
* Escrita (inclusive exclusão) só por RPC; `authenticated` tem apenas SELECT, que o RLS filtra para admin.
  `admin_salvar_gabarito_prova(jsonb)` (cabeçalho + folha inteira na mesma
  transação; valida numeração 1..N e letra dentro de A–D/A–E; gera o slug na criação
  e **nunca o reescreve**, porque o link já circulou) e
  `admin_publicar_gabarito_prova(id, publicar, notificar)` (`notificado_em` só é gravado
  se `notificados > 0`) e `admin_excluir_gabarito_prova(id)`. A notificação grava
  `dados.link = /dashboard/gabaritos/<slug>`, e o sino passa a navegar para links internos.
  `publicado_em` não renova ao republicar.
* SSR: `/gabaritos` e `/gabaritos/:slug` usam `RenderMode.Server` (gabarito novo
  sem rebuild; título/OG da prova no preview do link). O service usa `PendingTasks`
  (SSR zoneless espera a RPC) + `TransferState` (a hidratação não refaz a chamada). A
  visualização só é contada no browser e uma vez por gabarito por sessão da aba.
  O contador não é à prova de script (a RPC é pública), por isso o rótulo é
  "visualizações", não "pessoas". Slug inexistente ou rascunho para não-admin
  responde **404**; a pré-visualização de rascunho sai com `Cache-Control: private, no-store`.
* **Cadernos** (migration `20261105190000_gabaritos_cadernos.sql`):
  * Tabela `gabarito_prova_caderno` (`id`, `gabarito_id`, `slug`, `nome`, `ordem`), com a
    mesma RLS admin-only e sem grant para `anon`. `gabarito_prova_questao` passa a ter
    `caderno_id` e PK `(caderno_id, numero)`, e uma FK composta
    `(gabarito_id, caderno_id)` garante que questão e caderno são do mesmo gabarito.
  * Os gabaritos já existentes viram 1 caderno "Caderno único" (slug `unico`), sem mudar
    link, respostas nem notificações. A UI esconde o nome quando há um só.
  * `admin_salvar_gabarito_prova` recebe `cadernos: [{ id?, nome, questoes }]` e devolve
    `{ id, slug, cadernos: [{ id, slug, nome, ordem }] }`. O editor manda **todos** os
    cadernos: o que não vier (por `id`) é excluído com a folha, e a ordem do array é a
    ordem de exibição. Valida 1–12 cadernos, nomes obrigatórios e únicos (sem caixa/espaços),
    mesmo nº de questões em todos, numeração 1..N e letras dentro de A–D/A–E.
    Renomear **preserva `id` e `slug`** do caderno, como o slug do gabarito. O payload antigo
    (`questoes` na raiz) continua valendo quando só há um caderno.
  * `get_gabarito_prova` devolve `cadernos[]` (cada um com `questoes`) e ainda `questoes`
    na raiz (= 1º caderno), **só por compatibilidade durante o deploy** (banco antes do
    front); remover quando o front novo estiver no ar. A vitrine e a lista públicas trazem
    só `cadernos[{ id, slug, nome, ordem }]`, **sem letras**. Lá, `total_questoes` é por
    caderno; na lista do admin é a soma, para a barra de progresso.
  * O e-mail de aviso cita os cadernos quando há mais de um (o público e o teto de 50 não mudam).
  * MCP: `criar_gabarito` aceita `cadernos` (nome + `respostas`/`questoes` de cada um);
    `atualizar_gabarito` troca a folha de um caderno com `caderno` (nome) ou redefine a
    lista com `cadernos` (casa por nome, preservando o link de quem já existe).
  * O link compartilhado é sempre o do gabarito, sem `?caderno=`: o destino pós-cadastro só
    guarda caminhos de gabarito, e o aluno escolhe o caderno com um toque.
* Colagem: com numeração no texto ("1-A 2-B"), o número define a posição e palavras
  soltas ("da", "e") são ignoradas; sem numeração, vale a sequência corrida. Teto de
  200 questões.
* Landing: seção `#gabaritos` (`landing-gabaritos.component`), selo no hero,
  item no menu, no plano Grátis, no FAQ e no rodapé. Os gabaritos recentes carregam
  só no browser, porque a landing é prerenderizada.
* E-mail: modo `gabarito` da edge function `enviar-campanha-email`. O texto fixo
  está em `_shared/gabarito-email.ts` e o público vem de
  `email_publico_gabarito(id, 50)`, só `service_role`. A trava é de uma campanha
  por gabarito (índice único em `email_campanha.gabarito_id`, segmento
  `gabarito`): chamar de novo devolve `ja_enviado`. Com `somente_previa` o modo
  só renderiza.
* Selo de novidade: `ultimo_gabarito_publicado_em()`, chamado no shell do dashboard.
* MCP: CRUD completo em `boramed-mcp` (ver `docs/mcp-conteudo.md`).
* Testes: `supabase/tests/gabaritos_provas_test.sql` (anon sem respostas, vitrine sem letras) (no CI, job `db-security`),
  `core/utils/gabarito-prova.util.spec.ts` e `tests/e2e/gabaritos.spec.ts` (contra o
  stack local com seed).
* Seed local: 5 publicados + rascunho `n2-6-periodo-2026-2` (36/40) para testar
  publicar com aviso. `n1-3-periodo-2026-2` (N1 · 3º período 2026.2) tem **3 cadernos**
  (Azul, Verde, Amarelo), cada um com folha própria, a anulada em posição diferente em
  cada um e uma questão em análise no Amarelo: é a prova para testar cadernos. Os alunos do seed são do 6º período.
* **E-mail no ambiente local:** os e-mails do seed (`@boramed.com`) não existem, e
  enviá-los com a chave real do Resend geraria bounce e mancharia o domínio. Para
  testar, sirva as functions com `RESEND_API_KEY` vazia: a prévia funciona e o
  envio responde "RESEND_API_KEY não configurada" sem criar campanha. O envio real
  se testa em produção ou com destinatários reais.

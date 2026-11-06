# MCP de conteúdo BoraMed

O endpoint remoto de conteúdo é `https://gakvktwtdunljojghpff.supabase.co/functions/v1/boramed-mcp`. Ele usa MCP Streamable HTTP e OAuth 2.1 com PKCE pelo Supabase Auth. A tela de consentimento fica em `https://www.boramedoficial.com.br/oauth/consent`.

## Acesso e autoria

- O servidor aceita tokens apenas da conta `arthurcoelho3524@gmail.com`, que também precisa manter papel `admin` ou `super_admin` e não estar suspensa.
- Leitura cobre questões, alternativas, temas, provas completas com questões na ordem, materiais PDF, categorias/tópicos e flashcards do acervo.
- Criação cobre questões, provas autorais, PDFs no bucket privado `materiais` e decks de flashcards.
- Atualização e exclusão verificam `mcp_created_content`, tabela com RLS e sem grants para `anon`/`authenticated`. Só a Edge Function usa a service role para consultar/gravar essa autoria.
- Provas podem vincular questões existentes, mas excluir a prova não exclui questões. Atualizar ou excluir questões existentes que não foram criadas pelo MCP é recusado.
- O PDF é enviado em base64 pelo cliente MCP e limitado a 12 MiB por chamada.
- `enviar_imagem` recebe PNG, JPEG ou WEBP em base64 ou por URL https (o servidor baixa) e devolve a URL para usar no card ou na questão. Flashcard: bucket `flashcard-imagens`, até 2 MiB, em `user/<id>/mcp/` (exigência de `flashcards_imagem_url_valida`). Questão: bucket privado `questao-imagens`, até 5 MiB, em `mcp/<id>/`. O tipo é validado pelos bytes do arquivo. Excluir um deck criado pelo MCP remove as imagens dele enviadas pelo MCP.
- **Gabaritos extraoficiais têm CRUD completo**, sem a trava de autoria: o MCP lista, lê, cria, atualiza, publica/tira do ar e exclui **qualquer** gabarito. As ferramentas usam o token do próprio usuário nas RPCs de admin (`admin_salvar_gabarito_prova`, `admin_publicar_gabarito_prova`, `admin_excluir_gabarito_prova`), então `is_admin()` continua sendo a autorização. Prova com vários cadernos (Azul, Verde, A, B…): `criar_gabarito` recebe `cadernos` (cada um com `nome` e a sua folha), e `atualizar_gabarito` troca a folha de um caderno com `caderno` (nome) ou redefine a lista com `cadernos` (casa por nome e preserva o link de quem já existe; o que não vier é excluído). Gabarito de um caderno só continua usando `respostas`/`questoes` direto. A folha aceita `respostas` como texto (`"ABCDX?E"` ou `"1-A 2-B"`; X = anulada, ? = em análise) ou `questoes` detalhadas, com área e comentário. `avisar_alunos` dispara a notificação no app para todos do período e o e-mail para até 50 (ver `docs/gabaritos-extraoficiais.md`).
- **Dimensões de nota (Minhas notas) têm CRUD completo**, também sem a trava de autoria: `listar_dimensoes_nota`, `obter_dimensoes_nota` (por `id` ou `periodo`), `criar_dimensoes_nota` (cabeçalho + `eixos` → `dimensoes` (`cognitiva`/`habilidades`/`unica`) → `itens` com `pontos` e `subitens` opcionais que somam o item; `publicar` e `avisar_alunos`), `atualizar_dimensoes_nota`, `publicar_dimensoes_nota` e `excluir_dimensoes_nota`. Com `eixos`, `atualizar_dimensoes_nota` substitui a árvore, mas herda os ids casando eixo pela sigla, dimensão pelo tipo e item/parte pelo nome, para não apagar as notas já lançadas pelos alunos. A resposta traz `avisos` quando uma dimensão não soma 100. Regras e telas em `docs/minhas-notas.md`.
- `obter_material_pdf` gera um link assinado que expira em 15 minutos para o cliente baixar o arquivo privado.

## Ferramentas

`boramed_quickstart`, `listar_dimensoes_nota`, `obter_dimensoes_nota`, `criar_dimensoes_nota`, `atualizar_dimensoes_nota`, `publicar_dimensoes_nota`, `excluir_dimensoes_nota`, `listar_gabaritos`, `obter_gabarito`, `criar_gabarito`, `atualizar_gabarito`, `publicar_gabarito`, `excluir_gabarito`, `buscar_questoes`, `obter_questao`, `criar_questao`, `atualizar_questao`, `excluir_questao`, `listar_provas`, `obter_prova`, `criar_prova`, `atualizar_prova`, `excluir_prova`, `listar_materiais`, `obter_material_pdf`, `criar_material_pdf`, `atualizar_material`, `excluir_material`, `enviar_imagem`, `listar_flashcards`, `criar_deck_flashcards`, `atualizar_deck_flashcards`, `excluir_deck_flashcards` e `listar_taxonomia`.

## Conectar uma IA

Cadastre a URL do endpoint como integração MCP remota com transporte HTTP. Para Claude Code:

```bash
claude mcp add --transport http boramed https://gakvktwtdunljojghpff.supabase.co/functions/v1/boramed-mcp
```

Clientes MCP compatíveis descobrem o servidor OAuth e o registro dinâmico de clientes. No navegador, entre com a conta autorizada e aprove o nome do cliente e as permissões exibidas. As conexões podem ser revogadas na seção MCP do admin.

## Operação

- A Edge Function fica em `supabase/functions/boramed-mcp` e precisa de `verify_jwt = false` no gateway para publicar o desafio OAuth; a função valida o token no middleware antes de servir as ferramentas.
- Configuração Auth do projeto: `auth.site_url = https://www.boramedoficial.com.br`, OAuth server habilitado, autorização em `/oauth/consent` e registro dinâmico habilitado. O Site URL precisa ser o host final servido pela Vercel (o apex redireciona 308 para `www`): o Auth recusa com `400 unauthorized request origin` a leitura da autorização vinda de outra origem.
- Deploy da função: `npx supabase functions deploy boramed-mcp --project-ref gakvktwtdunljojghpff`. As ferramentas de gabarito dependem das migrations `20261105120000_gabaritos_provas` e `20261105190000_gabaritos_cadernos` e, para o aviso por e-mail, do deploy de `enviar-campanha-email`.

As ferramentas de dimensões de nota dependem das migrations `20261106120000_notas_dimensoes_periodo` e `20261106120100_notas_regulamentos_1_2_periodo`.

Exemplo de pedido ao Arthur no cliente de IA: *"Cadastra as dimensões de nota do 3º período 2027.1 a partir deste PDF e publica avisando os alunos."* ou *"Cria o gabarito da N2 do 3º período 2026.2, 40 questões A–E: ABCDA BCDEX … e publica avisando os alunos."*
- A migration `mcp_content_ownership` cria o registro privado de autoria. Aplicar conforme o fluxo de migration do projeto antes de ativar escrita.
- O projeto já usa assinatura JWT assimétrica ES256, necessária para validação dos tokens OAuth no middleware MCP.

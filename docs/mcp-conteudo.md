# MCP de conteúdo BoraMed

O endpoint remoto de conteúdo é `https://gakvktwtdunljojghpff.supabase.co/functions/v1/boramed-mcp`. Ele usa MCP Streamable HTTP e OAuth 2.1 com PKCE pelo Supabase Auth. A tela de consentimento fica em `https://boramedoficial.com.br/oauth/consent`.

## Acesso e autoria

- O servidor aceita tokens apenas da conta `arthurcoelho3524@gmail.com`, que também precisa manter papel `admin` ou `super_admin` e não estar suspensa.
- Leitura cobre questões, alternativas, temas, provas completas com questões na ordem, materiais PDF, categorias/tópicos e flashcards do acervo.
- Criação cobre questões, provas autorais, PDFs no bucket privado `materiais` e decks de flashcards.
- Atualização e exclusão verificam `mcp_created_content`, tabela com RLS e sem grants para `anon`/`authenticated`. Só a Edge Function usa a service role para consultar/gravar essa autoria.
- Provas podem vincular questões existentes, mas excluir a prova não exclui questões. Atualizar ou excluir questões existentes que não foram criadas pelo MCP é recusado.
- O PDF é enviado em base64 pelo cliente MCP e limitado a 12 MiB por chamada. Imagens de questão e flashcard podem usar URLs já disponíveis no sistema.
- `obter_material_pdf` gera um link assinado que expira em 15 minutos para o cliente baixar o arquivo privado.

## Ferramentas

`boramed_quickstart`, `buscar_questoes`, `obter_questao`, `criar_questao`, `atualizar_questao`, `excluir_questao`, `listar_provas`, `obter_prova`, `criar_prova`, `atualizar_prova`, `excluir_prova`, `listar_materiais`, `obter_material_pdf`, `criar_material_pdf`, `atualizar_material`, `excluir_material`, `listar_flashcards`, `criar_deck_flashcards`, `atualizar_deck_flashcards`, `excluir_deck_flashcards` e `listar_taxonomia`.

## Conectar uma IA

Cadastre a URL do endpoint como integração MCP remota com transporte HTTP. Para Claude Code:

```bash
claude mcp add --transport http boramed https://gakvktwtdunljojghpff.supabase.co/functions/v1/boramed-mcp
```

Clientes MCP compatíveis descobrem o servidor OAuth e o registro dinâmico de clientes. No navegador, entre com a conta autorizada e aprove o nome do cliente e as permissões exibidas. As conexões podem ser revogadas na seção MCP do admin.

## Operação

- A Edge Function fica em `supabase/functions/boramed-mcp` e precisa de `verify_jwt = false` no gateway para publicar o desafio OAuth; a função valida o token no middleware antes de servir as ferramentas.
- Configuração Auth do projeto: `auth.site_url = https://boramedoficial.com.br`, OAuth server habilitado, autorização em `/oauth/consent` e registro dinâmico habilitado.
- Deploy da função: `npx supabase functions deploy boramed-mcp --project-ref gakvktwtdunljojghpff`.
- A migration `mcp_content_ownership` cria o registro privado de autoria. Aplicar conforme o fluxo de migration do projeto antes de ativar escrita.
- O projeto já usa assinatura JWT assimétrica ES256, necessária para validação dos tokens OAuth no middleware MCP.

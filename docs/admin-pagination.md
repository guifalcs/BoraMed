# Paginacao das tabelas administrativas

As tabelas de listagem do painel `/admin` exibem uma quantidade limitada de
linhas por pagina (20 nas listas locais, 50 nas listas server-side e 200 no
modal de destinatarios), com os controles `Anterior`, pagina atual e
`Proxima`. O controle compartilhado fica em
`frontend/src/app/shared/components/admin-pagination` e usa pagina zero-based
internamente.

## Como os dados sao paginados

- Listas grandes e filtraveis, como usuarios, questoes e provas, usam paginação
  server-side e recebem `count: exact` do Supabase.
- Listas administrativas que ja sao carregadas de uma vez usam um `computed`
  para recortar somente a pagina visivel. Isso preserva o conjunto completo e
  evita alterar contratos de RPC existentes.
- O modal de destinatarios de campanhas consulta a pagina atual pela RPC com
  `limit` e `offset`; ao trocar o filtro, a pagina volta para a primeira.
- Previews da importacao tambem sao paginados, mas a lista completa continua
  preservada para validacao e importacao do lote.

Ao criar uma nova tabela administrativa, mantenha a ordenacao deterministica,
resete a pagina ao trocar filtros/conjunto de dados e limite a pagina ao ultimo
indice valido depois de excluir itens. Tabelas internas do HTML de e-mail sao
conteudo do e-mail e nao fazem parte da interface administrativa.

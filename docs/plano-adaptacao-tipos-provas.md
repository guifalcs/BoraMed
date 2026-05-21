# Plano de adaptacao para tipos de provas

## Objetivo

Preparar o BoraMed para cadastrar, organizar, publicar e executar os 3 tipos de provas do foco inicial Afya:

- Nacional
- Processual
- Laboratorio

O desenho deve continuar compativel com expansao futura para:

- novos formatos da propria Afya;
- outras redes/faculdades;
- provas autorais sem faculdade especifica;
- simulados personalizados por tema e filtros.

Este plano evita modelar `prova.tipo` como uma lista fechada de negocio da Afya. A recomendacao e separar:

- origem/contexto da prova: autoral, faculdade, rede, personalizado;
- formato pedagogico: nacional, processual, laboratorio, multiestacoes etc.;
- instituicao/rede alvo: Afya, outra rede, faculdade especifica ou nenhuma.

## Estado atual resumido

O app ja possui:

- area admin protegida;
- cadastro de questoes;
- upload de imagem em questoes;
- cadastro de disciplinas e temas;
- importacao em lote de questoes, disciplinas e temas;
- tabela `prova_questao` como vinculo canonico entre provas regulares e questoes;
- RPC server-side para gerar simulado personalizado por temas.

Mas ainda nao esta consistente para operar os 3 tipos:

- `prova.tipo` foi simplificado para `autoral`/`faculdade`, enquanto trechos do app e RPCs ainda usam `nacional`/`processual`/`multiestacoes`;
- laboratorio nao existe como tipo operacional consolidado;
- o admin de provas nao permite escolher Nacional, Processual e Laboratorio como formatos;
- questoes de laboratorio nao tem regra obrigatoria de imagem no banco/app;
- o fluxo do aluno ainda trata processual e multiestacoes como "em breve";
- `prova_questao` precisa de grants explicitos para escrita administrativa;
- o campo legado `questao.prova_id` ainda aparece no formulario de questoes e pode confundir com o vinculo real via `prova_questao`.

## Principios de modelagem

1. `prova.tipo` nao deve misturar formato pedagogico com origem.

   Exemplo ruim: `tipo = 'processual'` para simulado personalizado e tambem para prova processual cadastrada.

2. O formato da prova deve ser extensivel.

   Hoje: `nacional`, `processual`, `laboratorio`.
   Futuro: `multiestacoes`, `osce`, `pratica`, `integrada`, ou formatos especificos por faculdade.

3. A instituicao deve ser uma dimensao separada.

   Uma prova pode ser inspirada no modelo Afya, especifica de uma faculdade, autoral sem faculdade ou futuramente associada a outra rede.

4. Conteudo continua autoral.

   Nenhuma tela ou campo deve sugerir parceria, vinculo oficial ou acervo de provas/questoes da Afya.

5. Sorteio continua server-side.

   Qualquer geracao aleatoria deve continuar em RPC ou Edge Function.

6. Prova regular e simulado personalizado sao entidades diferentes.

   Prova regular: cadastrada pelo admin, usa `prova_questao`.
   Simulado personalizado: gerado sob demanda, usa `tentativa_resposta.ordem_na_tentativa`.

## Modelo de dados recomendado

### Opcao preferida

Criar colunas separadas em `prova`:

- `origem`: `autoral` | `faculdade` | `personalizado`
- `formato`: `nacional` | `processual` | `laboratorio` | `multiestacoes`
- `rede`: texto opcional, inicialmente `afya`
- `faculdade_id`: opcional
- `subtipo`: texto opcional, para `N1`, `N2`, `P1`, `P2`, `teste_progresso` etc.
- `publicada`: boolean, default `false`
- `arquivada`: boolean, default `false`

Manter `prova.tipo` temporariamente por compatibilidade, mas planejar migracao para deixar de usa-lo no frontend.

Mapeamento inicial:

| Caso | origem | formato | rede | subtipo |
| --- | --- | --- | --- | --- |
| Prova Nacional modelo Afya | `faculdade` ou `autoral` | `nacional` | `afya` | `N1`, `N2`, `teste_progresso` se aplicavel |
| Processual Afya | `autoral` | `processual` | `afya` | `N1` ou `N2` |
| Laboratorio Afya | `autoral` | `laboratorio` | `afya` | `P1` ou `P2` |
| Simulado personalizado por temas | `personalizado` | `processual` ou valor informado | null | null |
| Futura faculdade X | `faculdade` | qualquer formato | rede/faculdade correspondente | subtipo local |

### Alternativa mais normalizada

Criar tabela `prova_formato`:

- `id`
- `codigo`
- `nome`
- `descricao`
- `exige_imagem`
- `ativo`
- `ordem`

E em `prova` salvar `formato_id`.

Esta alternativa e melhor para crescimento, mas aumenta trabalho agora. Pode ficar para uma segunda etapa se o MVP precisar de velocidade.

## Migrations planejadas

### Migration 1: ajustar schema de prova

Adicionar:

- `origem text not null default 'autoral'`
- `formato text`
- `rede text`
- `subtipo text`
- `publicada boolean not null default false`
- `arquivada boolean not null default false`

Criar checks iniciais:

- `origem in ('autoral', 'faculdade', 'personalizado')`
- `formato in ('nacional', 'processual', 'laboratorio', 'multiestacoes')`

Popular dados existentes:

- se `tipo = 'faculdade'`, definir `origem = 'faculdade'`;
- se `tipo = 'autoral'`, definir `origem = 'autoral'`;
- se `subtipo_nacional` existir, avaliar migrar para `subtipo`;
- provas nacionais existentes devem receber `formato = 'nacional'`;
- provas personalizadas antigas com `periodo = 0` e `edicao < 0` devem receber `origem = 'personalizado'`.

Depois disso, atualizar gradualmente o app para usar `origem` e `formato`.

### Migration 2: grants e RLS

Garantir grants para escrita admin:

- `GRANT INSERT, UPDATE, DELETE ON public.prova_questao TO authenticated;`

Revisar policies:

- admin pode inserir/alterar/deletar `prova`, `questao`, `alternativa`, `questao_tema`, `prova_questao`;
- aluno autenticado pode ler apenas provas publicadas e nao arquivadas;
- manter leitura de questoes suficiente para execucao, mas preferir acesso via RPC para fluxos sensiveis.

### Migration 3: regra de laboratorio

Opcoes:

1. Regra no banco por trigger: se uma questao estiver vinculada a uma prova com `formato = 'laboratorio'`, exigir `imagem_url`.
2. Regra por campo em questao: adicionar `tipo_questao` ou `exige_imagem`; se `tipo_questao = 'laboratorio'`, exigir `imagem_url`.

Recomendacao: adicionar em `questao`:

- `tipo_questao text not null default 'geral'`
- check: `tipo_questao in ('geral', 'laboratorio')`
- check: `tipo_questao <> 'laboratorio' OR imagem_url IS NOT NULL`

Isso permite que questoes de laboratorio sejam usadas em simulados personalizados sem depender de uma prova regular.

### Migration 4: storage de imagens

Formalizar bucket e policies em migration:

- bucket `questao-imagens`;
- upload/update/delete apenas para admin;
- leitura para authenticated ou publica, conforme decisao de produto;
- limites de arquivo documentados no app: PNG, JPG, WebP, 5 MB.

## Adaptacoes no frontend admin

### Admin de questoes

Alterar formulario:

- adicionar campo `Tipo da questao`: Geral | Laboratorio;
- se Laboratorio, tornar imagem obrigatoria;
- remover ou esconder o campo legado `Prova` que grava `questao.prova_id`;
- criar area separada "Vinculos com provas" baseada em `prova_questao`, ou deixar o vinculo exclusivamente na tela de provas;
- mostrar tags de disciplina, temas e tipo da questao na tabela.

Validacoes:

- enunciado obrigatorio;
- pelo menos 2 alternativas hoje, mas revisar regra para exatamente 5 se isso for requisito definitivo;
- uma alternativa correta;
- laboratorio exige imagem antes de salvar.

### Admin de provas

Alterar formulario de criacao:

- Origem: Autoral | Modelo de faculdade/rede
- Rede: Afya inicialmente, extensivel
- Faculdade: opcional, filtrada por rede quando houver
- Formato: Nacional | Processual | Laboratorio | Multiestacoes
- Subtipo: depende do formato
  - Nacional: N1, N2, Teste de Progresso, Outro
  - Processual: N1, N2, Outro
  - Laboratorio: P1, P2, Outro
- Periodo
- Ano/semestre opcionais
- Tempo sugerido
- Publicada: sim/nao

Na etapa de selecionar questoes:

- filtrar questoes por `tipo_questao` conforme formato;
- para Laboratorio, listar apenas questoes com imagem;
- permitir ordenar questoes vinculadas antes de publicar;
- validar que prova publicada tenha pelo menos 1 questao ativa.

Na listagem:

- colunas: Nome, Formato, Subtipo, Origem, Rede/Faculdade, Periodo, Questoes, Status;
- filtros por formato, subtipo, origem, rede/faculdade, periodo e status.

### Admin de importacao

Atualizar prompt de questoes:

- incluir campo opcional `TIPO_QUESTAO: geral|laboratorio`;
- para laboratorio, exigir referencia a imagem a ser anexada manualmente no admin ou importar depois como rascunho;
- manter disciplina e temas opcionais, mas validados contra cadastros reais.

Fluxo recomendado:

- importacao textual cria questoes como rascunho;
- admin revisa, adiciona imagens se necessario e publica.

## Adaptacoes no frontend aluno

### Home de simulados

Separar cards operacionais:

- Nacional no modelo Afya
- Processual
- Laboratorio
- Montar simulado por temas

Evitar texto que sugira acervo oficial:

- usar "questoes autorais no modelo das avaliacoes";
- manter disclaimer de plataforma independente.

### Listagem de provas

Criar rota/listagem generica:

- `/dashboard/simulados/provas`

Query params:

- `rede=afya`
- `formato=nacional|processual|laboratorio`
- `periodo=1`
- `subtipo=N1|N2|P1|P2`

Evitar componentes fixos em "provas-afya" para tudo. O nome pode continuar no primeiro momento, mas a arquitetura deve caminhar para uma listagem por filtros.

### Montar simulado personalizado

Adicionar filtro de formato/tipo de questao:

- Geral/processual
- Laboratorio

RPC deve receber:

- `p_tipo_questao`
- `p_tema_ids`
- `p_qtd`
- `p_modo`

Para laboratorio:

- sortear apenas questoes com `tipo_questao = 'laboratorio'`;
- banco deve garantir `imagem_url` nao nula.

## Adaptacoes nas RPCs

### `gerar_simulado_personalizado`

Alterar insert de prova sintetica:

- `origem = 'personalizado'`
- `formato = p_formato` ou formato derivado do tipo de questao
- nao usar `tipo = 'processual'` se o check atual nao aceitar

Adicionar parametros:

- `p_tipo_questao text default 'geral'`
- opcionalmente `p_formato text default 'processual'`

Filtro:

- questoes ativas;
- tipo de questao conforme parametro;
- temas se informados;
- para laboratorio, imagem obrigatoria por schema.

### `iniciar_tentativa`, `retomar_tentativa`, `finalizar_tentativa`

Manter:

- provas regulares: questoes via `prova_questao`;
- tentativas: ordem via `tentativa_resposta.ordem_na_tentativa`.

Revisar retorno:

- incluir `tipo_questao`;
- incluir `imagem_url` e `imagem_legenda`;
- nao depender de `questao.prova_id`.

## Compatibilidade e migracao gradual

Para reduzir risco:

1. Adicionar novas colunas sem remover `tipo` nem `subtipo_nacional`.
2. Atualizar services e componentes para ler novas colunas com fallback.
3. Migrar admin para gravar novas colunas.
4. Corrigir RPCs para parar de inserir valores invalidos em `tipo`.
5. Validar dados existentes.
6. Somente depois considerar remover `tipo` legado ou transforma-lo em alias.

## Testes e verificacoes

### Banco

- criar prova nacional, processual e laboratorio via admin;
- vincular questoes a cada tipo;
- tentar publicar laboratorio com questao sem imagem deve falhar;
- gerar simulado personalizado geral;
- gerar simulado personalizado laboratorio;
- iniciar, pausar, retomar e finalizar tentativa de cada formato.

### Frontend

- `npm run build`
- testes unitarios dos services afetados;
- e2e para:
  - admin cria questao geral;
  - admin cria questao laboratorio com imagem;
  - admin cria prova processual e vincula questoes;
  - admin cria prova laboratorio e vincula questoes com imagem;
  - aluno executa prova nacional;
  - aluno executa prova processual;
  - aluno executa laboratorio;
  - aluno gera simulado personalizado por tema.

### Seguranca

- confirmar que service role nao aparece no frontend;
- confirmar RLS em tabelas novas/alteradas;
- confirmar grants explicitos para tabelas escritas pelo admin;
- confirmar policies de storage para `questao-imagens`;
- confirmar que aluno nao consegue escrever tabelas administrativas.

## Ordem de execucao sugerida

### Fase 1: destravar consistencia minima

1. Adicionar `origem`, `formato`, `rede`, `subtipo`, `publicada`, `arquivada` em `prova`.
2. Corrigir `gerar_simulado_personalizado` para usar `origem = 'personalizado'` e valor aceito pelo schema legado.
3. Adicionar grants de `prova_questao`.
4. Atualizar `Prova`/`AdminProva`/services para novas colunas.
5. Build e teste manual de gerar simulado personalizado.

### Fase 2: admin dos 3 formatos

1. Atualizar tela Admin > Provas com Formato/Subtipo/Origem/Rede.
2. Atualizar listagem e filtros.
3. Validar publicacao apenas com questoes ativas.
4. Remover dependencia visual de `questao.prova_id`.

### Fase 3: laboratorio

1. Adicionar `tipo_questao` em `questao`.
2. Criar regra de imagem obrigatoria para laboratorio.
3. Formalizar bucket/policies `questao-imagens`.
4. Atualizar Admin > Questoes para tipo laboratorio e imagem obrigatoria.
5. Atualizar importacao para criar laboratorio como rascunho quando necessario.

### Fase 4: experiencia do aluno

1. Trocar "em breve" por cards reais para Processual e Laboratorio.
2. Criar listagem generica de provas por formato/rede.
3. Adicionar filtros por periodo, subtipo e formato.
4. Atualizar Montar Simulado para filtrar tipo de questao.
5. Atualizar historico/resultados para exibir formato corretamente.

### Fase 5: limpeza e documentacao

1. Atualizar `docs/business-rules.md`.
2. Atualizar `docs/architecture.md` com ADR de modelagem extensivel de provas.
3. Atualizar changelog da implementacao.
4. Revisar labels para manter posicionamento independente.
5. Avaliar remocao futura de `prova.tipo` e `subtipo_nacional`.

## Criterios de pronto

Considerar a adaptacao pronta quando:

- admin consegue cadastrar Nacional, Processual e Laboratorio;
- cada prova pode ser publicada/despublicada;
- laboratorio nao permite questao sem imagem;
- aluno consegue encontrar e executar os 3 formatos;
- simulado personalizado continua funcionando;
- filtros por tema continuam funcionando;
- historico e resultado exibem formato correto;
- build passa;
- e2e principal passa;
- RLS/grants/storage foram verificados.


# Minhas notas: dimensões de nota por período

A partir de 2026.2 cada período tem um regulamento que divide a nota de cada eixo (SOI, HAM, IESC, MCM, PIEPE…) em **dimensões independentes**, cada uma com as suas avaliações e pesos. O BoraMed traz essa composição para o aluno: ele lança as notas que já saíram e vê, por dimensão, quanto falta para os 70 e qual é a meta da próxima avaliação.

Posicionamento: **calculadora independente**, montada a partir do regulamento divulgado aos alunos. Nenhum vínculo com a Afya. A nota oficial é sempre a do portal da faculdade, e a tela diz isso no rodapé.

## Para o aluno (`/dashboard/notas`)

Gratuito para todos os níveis de acesso. Item **Minhas notas** no menu (no mobile, na seção "Módulos" do menu do perfil), sem selo de novidade.

O aluno vê **só o regulamento publicado do período cadastrado no perfil** (`profiles.periodo`).

| Situação | O que a tela mostra |
|---|---|
| Sem período no perfil | "Em que período você está?" com o seletor ali mesmo; salvar recarrega a tela. (Na prática o modal de dados obrigatórios já cobra o período; esta é a rede para quem escapou dele, como na impersonação.) |
| Período sem regulamento publicado | Ilustração do mascote (`public/illustrations/periodo-em-breve.webp`, gerada com o Codex no estilo das demais), "O Nº período ainda não chegou", os períodos já disponíveis e o link para atualizar o perfil. Sem card. |
| Período com regulamento | A tela completa, abaixo. |

### Tela completa

Enxuta de propósito (06/11: a primeira versão foi considerada carregada demais).

1. **Cabeçalho**: "Minhas notas" e o período/semestre.
2. **Aviso de foco** (uma linha, só quando algo pede atenção, risco ou exame): "HAM I · Teoria: Precisa de 84% no que falta". Clicar abre o eixo e rola até a dimensão.
3. **Abas por eixo**: sigla com um ponto de status (garantido, em andamento, exame, abaixo). Abre no eixo que mais pede atenção. O nome completo fica no `title`.
4. **Um cartão por dimensão** ("Teoria", "Prática" ou "Nota única"): placar, barra com o risco do mínimo, **uma frase** do que fazer (`linhaDimensao`) com no máximo um detalhe, e os campos de nota. Itens divididos mostram o nome do item e uma linha por parte. Aceita vírgula ou ponto; salva ao sair do campo ou com Enter; Esc desfaz; vazio apaga; acima do peso mostra "Máximo N" e não salva.
5. **Como funciona a aprovação**, recolhido, em três linhas.
6. Rodapé: "Calculadora independente. A nota oficial é a do portal da sua faculdade." e o link **Apagar minhas notas** (com confirmação).

Frases da dimensão (`linhaDimensao`):

| Situação | Frase | Detalhe |
|---|---|---|
| Sem notas | Lance suas notas | Para passar: 70 de 100 |
| Falta uma avaliação | Tire 11,5 na Prova N3 | de 15 possíveis |
| Faltam várias | Precisa de 84% no que falta | Próxima: Prova N2, mire em 29,4 de 35 |
| Já bateu a meta | 70 garantido | O que vier agora é lucro |
| 70 impossível, exame ao alcance | Mire nos 40 do exame especial | Faltam 10 pts |
| Abaixo, sem saída | Os 70 ficaram fora de alcance | Converse com a coordenação |

### Regras de cálculo (`core/utils/notas-calculo.util.ts`)

- Total da dimensão = soma dos itens (normalmente 100). Meta = total × `nota_minima`% (70). Piso do exame = total × `nota_minima_exame`% (40), só na **cognitiva de eixo com exame especial**.
- A nota vai sempre na **folha**: no item sem partes ou em cada parte.
- Situação da dimensão:
  - `sem_notas`: nada lançado. A mensagem diz que é preciso 70% em média.
  - `garantida`: obtido ≥ meta (mesmo com avaliações pendentes: "O que vier agora é lucro").
  - Concluída abaixo da meta, ou sem como chegar nela (máximo possível < meta): `exame` se for cognitiva com exame e o valor ficar ≥ piso; senão `abaixo`.
  - Em andamento: pela média exigida no que falta (`falta ÷ restante`): até 50% `confortavel`, até 70% `no_caminho`, até 85% `atencao`, acima `risco`.
- Mensagem principal:
  - **falta uma avaliação**: "Tire 11,5 na Prova N3" (nota exata, arredondada para cima em 1 casa);
  - **faltam várias**: "Média de 68% no que falta" + meta da próxima pendente na ordem do regulamento ("Próxima: TPI. Mire em 20,3 de 30");
  - **ritmo**: compara o aproveitamento atual com a média exigida e projeta a nota final mantendo o ritmo;
  - **70 fora de alcance com exame**: mira nos 40 do exame especial, lembrando que a prática precisa fechar com 70.
- Situação do eixo: todas garantidas = garantido; alguma `abaixo` = abaixo de 70; cognitiva em `exame` = rumo ao exame; senão em andamento. Não há compensação entre dimensões.
- A frequência não entra na conta (a plataforma não sabe); aparece nas regras e nas mensagens de aprovação.

## Para o admin (`/admin/notas`)

Menu **Conteúdo → Dimensões de nota**.

- **Lista** agrupada por período: semestre, status (No ar / Rascunho / Arquivado), siglas dos eixos e adesão ("X de Y alunos do período" lançaram nota). Ações: editar, publicar/tirar do ar, **avisar alunos** (sino; aparece em regulamento no ar que ainda não avisou ninguém, como os que entraram por migration), **duplicar** (abre o editor com a cópia, para o próximo semestre ou outro período) e excluir.
- **Editor**: cabeçalho (período, semestre, título opcional, nota mínima, piso do exame, frequência, fonte e observação) e a árvore de eixos. Cada eixo tem sigla, nome, estrutura **Teoria + prática** ou **Dimensão única** (alternar guarda a outra estrutura até salvar) e "Cognitiva tem exame especial". Cada dimensão lista os itens com pontos, detalhe opcional, ordem, remoção e **Dividir em partes**. A lateral **Conferência** aponta problemas (graves bloqueiam salvar; "soma ≠ 100" é só aviso) e mostra o total de cada eixo.
- Remover item, parte ou eixo, **dividir** um item ou trocar a estrutura do eixo pede confirmação quando há notas de alunos ("Há N notas lançadas aqui"). Item dividido deixa de receber nota: a dele sai e as partes começam vazias. Reduzir os pontos de um item apaga as notas acima do novo peso. O toast do save informa quantas notas saíram. Itens que continuam mantêm o id, e as notas dos alunos ficam.
- O formulário fica travado enquanto salva (o save recarrega o rascunho do servidor com os ids novos).
- **Publicar** arquiva o regulamento publicado anterior do mesmo período (só um no ar por período) e avisa os alunos do período no sino, uma vez só por regulamento. "Tirar do ar" (com confirmação) volta para rascunho; as notas ficam guardadas. Só dá para **excluir** o que não está no ar (o banco recusa com `regulamento_publicado`).

## MCP

Ferramentas com CRUD completo (ver `docs/mcp-conteudo.md`): `listar_dimensoes_nota`, `obter_dimensoes_nota`, `criar_dimensoes_nota`, `atualizar_dimensoes_nota`, `publicar_dimensoes_nota`, `excluir_dimensoes_nota`. `atualizar_dimensoes_nota` com `eixos` substitui a árvore, mas herda os ids casando eixo pela sigla, dimensão pelo tipo e item/parte pelo nome (sem diferenciar maiúsculas e acentos). Assim as notas dos alunos nos itens que continuam não se perdem. Cada id é herdado uma vez só (nomes repetidos nascem novos), e `exame_especial` omitido mantém o valor atual. Por `periodo`, as ferramentas de escrita (`atualizar`, `publicar`) exigem o `id` quando o período tem mais de um regulamento não arquivado (ex.: o publicado e um rascunho do semestre seguinte), para não mexer no que os alunos estão vendo por engano.

Exemplo de pedido: *"Cadastra as dimensões de nota do 3º período 2027.1 a partir deste PDF e publica avisando os alunos."*

## Banco

Migrations `20261106120000_notas_dimensoes_periodo` (estrutura, RLS e RPCs) e `20261106120100_notas_regulamentos_1_2_periodo` (1º e 2º período 2026.2, já publicados; idempotente).

| Tabela | Conteúdo |
|---|---|
| `notas_regulamento` | período, semestre, título, fonte, `nota_minima`, `nota_minima_exame`, `frequencia_minima`, observação, status, `publicado_em`, `notificado_em`. Índice único parcial: um `publicado` por período. |
| `notas_eixo` | sigla, nome, `exame_especial`, ordem |
| `notas_dimensao` | `tipo` (`cognitiva`/`habilidades`/`unica`), nome, ordem. Único `(eixo_id, tipo)`, deferido. |
| `notas_item` | nome, pontos, descrição, ordem, `pai_id` (parte de um item; um nível só) |
| `notas_lancamento` | `(user_id, item_id)` → nota |

Acesso:

- Estrutura com RLS admin-only e sem grant para `anon`. O aluno lê por `get_minhas_notas()` (`SECURITY DEFINER`): período do perfil, regulamento publicado do período (ou `null`), lançamentos dele e `periodos_disponiveis`.
- Lançamento só por `salvar_nota_lancamento(item, nota)`: item-folha, regulamento **publicado do período do aluno**, 0 ≤ nota ≤ pontos (2 casas); `NULL` apaga. `limpar_minhas_notas(regulamento)` apaga só as do próprio aluno. O aluno lê os próprios lançamentos (RLS), nunca os de outro.
- Admin: `admin_listar_notas_regulamentos`, `admin_get_notas_regulamento` (com `lancamentos_por_item`), `admin_salvar_notas_regulamento` (árvore inteira; com `id` atualiza, sem `id` cria, o que sumir é excluído e devolve `lancamentos_removidos`), `admin_publicar_notas_regulamento(id, publicar, notificar)` e `admin_excluir_notas_regulamento`.
- Teste: `supabase/tests/notas_dimensoes_test.sql` (roda no CI).

Seed local: `aluno-notas@boramed.com` (1º período, meio de semestre, com dimensões garantida, apertada e rumo ao exame) , `aluno-notas-2p@boramed.com` (2º período, sem notas) e `aluno-notas-9p@boramed.com` (9º, período sem regulamento). Senha `Teste123!`.

## Limites conhecidos

- O regulamento é **por período, não por unidade**. O de 2026.2 veio da unidade Ipatinga, e a observação diz isso. Se outra unidade tiver composição diferente, a solução é acrescentar unidade ao regulamento.
- Ao publicar o regulamento do semestre seguinte, o anterior é arquivado: o aluno passa a ver o novo, e as notas do semestre anterior deixam de aparecer na tela (continuam no banco).

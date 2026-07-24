# Backups — Questões e entidades relacionadas

Esta pasta guarda snapshots manuais do banco de dados do Supabase (projeto
`BoraMed`, ref `gakvktwtdunljojghpff`), focados nas **questões e tudo que está
relacionado a elas**.

## ⚠️ NUNCA COMITAR UM BACKUP

Estes arquivos contêm **o acervo inteiro com o gabarito** — `alternativa.correta`,
`questao.explicacao`, `resposta_correta_texto`, `respostas_aceitas` e
`explicacao_alternativas`. Um backup no git entrega o produto inteiro, com as
respostas, a qualquer pessoa com acesso de leitura ao repositório: não é preciso
furar RLS nem burlar o paywall, basta `git clone`.

O `.gitignore` ignora `supabase/backups/**` (exceto este README), mas **isso não
protege um arquivo que já foi adicionado ao índice** — o ignore só vale para
arquivos ainda não rastreados. Antes de commitar, confira:

```bash
git ls-files supabase/backups/   # deve listar SOMENTE o README.md
```

Guarde os snapshots fora do versionamento (bucket privado de backup, storage
local, cofre de segredos). Um backup foi removido do rastreamento em 2026-07-24
por este motivo — ele **permanece no histórico do git**; ver
`docs/auditoria-seguranca-performance-2026-07-24.md` (item C1).

## Arquivos

| Arquivo | Data | Conteúdo |
|---------|------|----------|
| `backup-questoes-2026-06-22.json` | 2026-06-22 | Questões + entidades relacionadas |

## O que está incluído

Cada backup é um único JSON com a forma:

```json
{
  "_meta": { "projeto", "project_ref", "gerado_em", "ordem_restauracao", "total_registros" },
  "tables": { "<nome_da_tabela>": [ ...registros... ] }
}
```

Tabelas exportadas (na ordem de restauração — pais antes dos filhos):

1. `disciplina`
2. `tema`
3. `faculdade`
4. `prova`
5. `questao`
6. `alternativa`
7. `questao_tema`
8. `prova_questao`
9. `desafio_diario`
10. `questao_comentario`
11. `questao_comentario_voto`
12. `questao_comentario_denuncia`

> Tabelas de dados de usuário (tentativas, gamificação, perfis, pagamentos)
> **não** fazem parte deste backup, pois não são conteúdo da questão em si.

## Como restaurar

O JSON preserva todas as colunas com os mesmos nomes do banco. Para restaurar,
percorra `_meta.ordem_restauracao` e faça `upsert` por `id` (ou pela PK
composta, no caso das tabelas de ligação) em cada tabela, por exemplo via
`supabase-js` com a service role key, ou gerando `INSERT ... ON CONFLICT`.

## Como gerar um novo backup

Os dados foram extraídos via MCP do Supabase (`execute_sql`) agregando cada
tabela com `jsonb_agg(to_jsonb(t))`. Para refazer, basta rodar a mesma extração
por tabela e montar o JSON no mesmo formato (veja `_meta`).

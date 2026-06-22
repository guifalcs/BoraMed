# Backups — Questões e entidades relacionadas

Esta pasta guarda snapshots manuais do banco de dados do Supabase (projeto
`BoraMed`, ref `gakvktwtdunljojghpff`), focados nas **questões e tudo que está
relacionado a elas**.

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

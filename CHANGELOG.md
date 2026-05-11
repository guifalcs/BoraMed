# Changelog

> Registro de todas as alterações do projeto.
> Atualizado automaticamente ao final de cada feature, fix ou tweak.

<!-- Formato:
## YYYY-MM-DD | Tipo | hash_commit
Descrição do que foi feito.
-->

## 2026-05-11 | Feature | 72146cb

**Módulo de Provas — BoraMed (Rede Afya)**

Implementação completa do módulo central da plataforma: alunos acessam provas antigas da rede Afya para treinar.

### Frontend
- Página `/dashboard/provas` com cards por instituição
- Página `/dashboard/provas/afya` com listagem de provas nacionais, filtros por tipo, período e ano (selects com truncamento)
- Página `/dashboard/provas/:id` (detalhe da prova) com contagem de questões e botão de iniciar
- Página `/dashboard/provas/:id/tentativa` (execução) com navegação entre questões, timer e pausa
- Página `/dashboard/provas/:id/resultado` com resumo de acertos, nota e distribuição por tema
- Componentes compartilhados: `ProvaCardComponent`, `QuestaoCardComponent`, `AlternativaItemComponent`, `ResultadoSummaryComponent`, `TentativaHeaderComponent`
- Componentes UI: `UiSelectComponent` com label, validação e dropdown acessível

### Backend (Supabase)
- 8 tabelas: `faculdade`, `prova`, `tema`, `questao`, `alternativa`, `questao_tema`, `tentativa`, `tentativa_resposta`
- RLS em todas as tabelas; tabelas de conteúdo apenas leitura para `authenticated`, sem acesso para `anon`
- 4 RPCs SECURITY DEFINER: `iniciar_tentativa`, `retomar_tentativa`, `pausar_tentativa`, `finalizar_tentativa`
- `finalizar_tentativa` idempotente: retorna resultado existente se já finalizada
- Seeds de demonstração: 1 faculdade, 3 temas, 3 provas, 5 questões com alternativas
- Todos os advisors de segurança resolvidos (auth_rls_initplan, missing index, bucket policy)

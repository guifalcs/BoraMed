```
# Rebuild — Documentação da Arquitetura Agêntica

> Este documento descreve a arquitetura completa do template de desenvolvimento AI-first da Rebuild.
> Ele serve como guia para entender, manter e adaptar o template a diferentes projetos.
> Se você é uma IA lendo este documento para adaptar o template, leia-o inteiro antes de fazer qualquer alteração.

---

## 1. Visão Geral

Este template estrutura um ambiente de desenvolvimento orientado a agentes de IA. O desenvolvimento é feito majoritariamente por IAs (Claude Code, GitHub Copilot, OpenAI Codex), com o humano atuando como direcionador de regras de negócio, validador de entregas e aprovador de deploys.

O template foi projetado para o stack Angular + Supabase + TypeScript, mas sua estrutura é adaptável a qualquer stack. O princípio fundamental é: separar o que a IA precisa saber sempre (regras globais) do que ela precisa saber sob demanda (skills, docs específicos), e garantir que existam guardrails determinísticos (hooks) para prevenir erros críticos.

### Ferramentas e seus papéis

| Ferramenta | Papel | Arquivo de configuração |
|------------|-------|------------------------|
| Claude Code | Motor principal de desenvolvimento — features, refatorações, testes | `CLAUDE.md` + `.claude/` |
| GitHub Copilot | Assistente de editor — autocomplete, ajustes rápidos, chat contextual | `.github/copilot-instructions.md` + `.github/instructions/` |
| OpenAI Codex | Revisor e automações — code review, scripts, auditorias | `AGENTS.md` |

As três ferramentas compartilham convenções de código via `AGENTS.md` (que Codex e Copilot leem nativamente) e `CLAUDE.md` (que o Claude Code lê nativamente). O conteúdo entre eles é coerente mas não duplicado — cada arquivo foca no que é relevante para sua ferramenta.

---

## 2. Mapa Completo de Arquivos

```

rebuild-template/
│
├── CLAUDE.md                                    [A]
├── AGENTS.md                                    [B]
├── CHANGELOG.md                                 [C]
│
├── .claude/
│   ├── settings.json                            [D]
│   ├── agents/
│   │   ├── architect.md                         [E1]
│   │   ├── implementer.md                       [E2]
│   │   ├── tester.md                            [E3]
│   │   └── reviewer.md                          [E4]
│   ├── commands/
│   │   ├── implement-feature.md                 [F1]
│   │   ├── implement.md                         [F2]
│   │   ├── fix-bug.md                           [F3]
│   │   └── tweak.md                             [F4]
│   └── skills/
│       ├── supabase-migrations/SKILL.md         [G1]
│       ├── edge-functions/SKILL.md              [G2]
│       ├── angular-components/SKILL.md          [G3]
│       └── e2e-testing/SKILL.md                 [G4]
│
├── .github/
│   ├── copilot-instructions.md                  [H]
│   ├── instructions/
│   │   ├── angular.instructions.md              [I1]
│   │   ├── supabase.instructions.md             [I2]
│   │   └── tests.instructions.md                [I3]
│   └── workflows/
│       ├── ci.yml                               [J1]
│       └── deploy.yml                           [J2]
│
├── docs/
│   ├── business-rules.md                        [K1]
│   ├── architecture.md                          [K2]
│   ├── design-system.md                         [K3]
│   └── feature-workflow.md                      [K4]
│
├── frontend/
│   └── CLAUDE.md                                [L1]
│
└── supabase/
    └── CLAUDE.md                                [L2]

```

---

## 3. Descrição Detalhada de Cada Arquivo

### [A] CLAUDE.md (raiz)

**Propósito:** Arquivo principal que o Claude Code carrega em TODA sessão. Contém as regras globais do projeto.

**Conteúdo:** Visão geral do projeto, stack, estrutura de pastas, comandos essenciais (build, test, lint, serve), regras de código (TypeScript, Angular, Supabase), convenções de commit, regras de componentes e design system, definição dos ambientes (local, staging, produção), e referências para docs mais detalhados.

**Princípio de design:** Deve ter no máximo 100-150 linhas. LLMs seguem bem até ~150 instruções; acima disso a aderência cai uniformemente. Se precisar de mais detalhes, referenciar documentos em `docs/` que o Claude lê sob demanda.

**Placeholders:** `{{PROJECT_NAME}}`, `{{CLIENT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{SUPABASE_DEV_REF}}`, `{{SUPABASE_PROD_REF}}`

### [B] AGENTS.md (raiz)

**Propósito:** Arquivo compartilhado que o Codex e o Copilot leem nativamente. Contém um subconjunto das regras que se aplicam a todas as IAs.

**Conteúdo:** Stack, comandos principais, convenções de código, estrutura de pastas, regras importantes. É uma versão mais enxuta do CLAUDE.md focada no que é universal.

**Relação com CLAUDE.md:** Não duplica — o CLAUDE.md é mais completo (tem referências a skills, subagentes, ambientes). O AGENTS.md tem o essencial que qualquer IA precisa para trabalhar no projeto.

### [C] CHANGELOG.md

**Propósito:** Registro cronológico de todas as alterações do projeto (features, fixes, tweaks).

**Como é atualizado:** Os slash commands instruem o Claude a adicionar uma entrada ao final de cada entrega, com data, tipo, resumo e hash do commit.

**Formato:** `## YYYY-MM-DD | Tipo | hash_commit` seguido de descrição.

### [D] .claude/settings.json

**Propósito:** Configuração de hooks e permissões do Claude Code. Hooks são scripts determinísticos que rodam automaticamente em pontos específicos do ciclo de vida do Claude — diferente das instruções em CLAUDE.md que são "advisory", hooks são garantidos.

**Hooks configurados:**

| Hook | Tipo | Momento | O que faz |
|------|------|---------|-----------|
| Bloqueio de produção | PreToolUse | Antes de rodar Bash | Impede `supabase db push` para o project ref de produção |
| Proteção de migrations | PreToolUse | Antes de editar arquivo | Impede edição de migrations já aplicadas |
| Auto-format | PostToolUse | Após editar arquivo | Roda Prettier em arquivos .ts, .html, .scss, .css |

**Permissões:** Lista de comandos permitidos (ng, supabase, git, npm, npx, playwright) e comandos bloqueados (rm -rf, DROP TABLE, --force).

**Placeholder:** `{{SUPABASE_PROD_REF}}` no hook de bloqueio de produção.

### [E1-E4] .claude/agents/ (Subagentes)

**Propósito:** Subagentes são assistentes especializados que rodam em contexto isolado. Cada um tem um papel, ferramentas limitadas e prompt otimizado para sua função. O isolamento de contexto é o principal benefício — o trabalho pesado de um subagente não polui o contexto do próximo.

| Agente | Papel | Ferramentas | Modelo | Quando é usado |
|--------|-------|-------------|--------|----------------|
| **architect** | Planeja sem codar | Read, Grep, Glob | Sonnet | Início de features — analisa codebase e produz plano |
| **implementer** | Escreve código | Read, Write, Edit, Bash, Glob, Grep | Sonnet | Implementação de features, componentes, migrations |
| **tester** | Escreve e roda testes | Read, Write, Edit, Bash, Glob, Grep | Sonnet | Após implementação — testes unitários e E2E |
| **reviewer** | Analisa sem modificar | Read, Grep, Glob | Haiku | Revisão final — qualidade, segurança, aderência |

**Detalhe importante:** O reviewer roda no Haiku (modelo mais barato e rápido) porque sua tarefa é leitura e análise, não geração complexa. Isso economiza tokens significativamente.

**O architect NUNCA escreve código** — apenas lê e planeja. Isso garante que o plano é validado pelo humano antes de qualquer linha ser escrita.

**O implementer para nos checkpoints** — sua instrução principal é NUNCA prosseguir sem aprovação explícita do usuário. Isso garante validação humana entre cada camada (frontend → backend → integração).

### [F1-F4] .claude/commands/ (Slash Commands)

**Propósito:** Workflows pré-definidos invocados com `/nome-do-comando` no terminal. Cada arquivo .md contém o prompt completo que o Claude Code segue. A variável `$ARGUMENTS` captura o que o usuário escreveu após o comando.

| Comando | Quando usar | Fluxo |
|---------|-------------|-------|
| `/implement-feature` | Feature completa ponta a ponta | 7 etapas com checkpoints: plan → front → back → integração → testes → review → PR |
| `/implement` | Entrega parcial (só front, só back, um componente) | Analisa → implementa → testa → valida → commit |
| `/fix-bug` | Correção de bugs | Investiga causa raiz → corrige → testa → valida → commit |
| `/tweak` | Ajustes visuais/textuais sem lógica | Localiza → aplica → valida → commit |

**Princípio de escala:** Quanto menor a tarefa, menor o comando. `/implement-feature` é o mais pesado (múltiplos subagentes, múltiplos checkpoints). `/tweak` é o mais leve (edição direta, sem testes). Usar o comando proporcional à tarefa economiza tokens.

**Todos os comandos:** Param para validação do usuário antes de commitar, atualizam o CHANGELOG.md ao final, e fazem commits em português no formato `tipo(escopo): descrição`.

### [G1-G4] .claude/skills/ (Skills)

**Propósito:** Conhecimento especializado que o Claude carrega sob demanda. Na inicialização, apenas o nome e descrição de cada skill são carregados (~50-100 tokens cada). O conteúdo completo só é lido quando a tarefa é relevante.

| Skill | Quando ativa | Conteúdo |
|-------|-------------|----------|
| **supabase-migrations** | Criar/modificar migrations | Template SQL, regras de naming, workflow local→staging→prod |
| **edge-functions** | Criar/modificar Edge Functions | Template TypeScript, CORS, auth, error handling |
| **angular-components** | Criar/modificar componentes | Estrutura de componente, signals, template de Storybook story |
| **e2e-testing** | Escrever testes E2E | Page Object pattern, template de teste, seletores, fixtures |

**Progressive disclosure:** Skills existem para não poluir o CLAUDE.md com detalhes que só são necessários em contextos específicos. Se tudo estivesse no CLAUDE.md, ele teria 500+ linhas e o Claude ignoraria a maioria.

### [H] .github/copilot-instructions.md

**Propósito:** Instruções globais para o GitHub Copilot. Carrega em toda interação no VS Code — chat, autocomplete, agent mode.

**Conteúdo:** Stack, convenções de código, formato de commits. Versão compacta das regras — o Copilot é usado para tarefas menores e autocomplete, não precisa de todo o detalhe que o Claude Code precisa.

### [I1-I3] .github/instructions/ (Instructions por path)

**Propósito:** Instruções do Copilot que se aplicam apenas a determinados tipos de arquivo, definidas pelo `applyTo` no frontmatter YAML.

| Arquivo | Aplica a | Conteúdo |
|---------|----------|----------|
| `angular.instructions.md` | `frontend/src/**/*.ts,*.html,*.scss` | Regras Angular, signals, componentes |
| `supabase.instructions.md` | `supabase/**` | Regras de migrations, RLS, Edge Functions |
| `tests.instructions.md` | `**/*.spec.ts, tests/e2e/**` | Padrões de teste, arrange-act-assert |

**Vantagem:** Quando o Copilot está autocompletando num `.spec.ts`, ele carrega automaticamente as regras de teste. Quando está num componente Angular, carrega as regras de Angular. Sem poluição cruzada.

### [J1-J2] .github/workflows/ (GitHub Actions)

**Propósito:** Pipelines de CI/CD automatizados.

| Workflow | Gatilho | O que faz |
|----------|---------|-----------|
| `ci.yml` | Pull Request para main | Lint → Testes unitários → Build → Testes E2E |
| `deploy.yml` | Push na main (merge) | Aplica migrations Supabase prod → Deploy Edge Functions → Build e deploy Vercel |

**Detalhe crítico do deploy.yml:** O job `deploy-frontend` depende de `deploy-supabase` (via `needs`). Se a migration falhar, o frontend não é deployado. Isso evita deploy de frontend que depende de schema que não existe ainda.

**Secrets necessários:** `SUPABASE_PROD_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_DB_PASSWORD`, `SUPABASE_PROD_URL`, `SUPABASE_PROD_ANON_KEY`, `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### [K1-K4] docs/ (Documentação)

| Arquivo | Propósito | Quem atualiza |
|---------|-----------|---------------|
| `business-rules.md` | Regras de negócio do cliente | Humano (com apoio do Claude) |
| `architecture.md` | Decisões arquiteturais (ADRs) | Humano + Claude (append-only) |
| `design-system.md` | Cores, tipografia, componentes, espaçamento | Humano na criação, Claude consulta |
| `feature-workflow.md` | Documentação do processo de desenvolvimento | Referência humana — descreve o que os commands automatizam |

**business-rules.md** é o arquivo mais importante para customização por projeto. Ele contém toda a lógica de domínio que o Claude consulta antes de implementar features. Template com seções para entidades, fluxos, perfis de usuário, regras de prazo e notificações.

**architecture.md** usa o padrão ADR (Architecture Decision Record). Decisões são append-only — nunca editar uma decisão anterior, apenas adicionar novas. O template já vem com 6 ADRs base do stack Rebuild.

**design-system.md** é a referência visual. O Claude consulta antes de criar componentes para usar as cores, tipografia e espaçamento corretos. Template com placeholders para cores e fonte.

### [L1-L2] CLAUDE.md de subdiretórios

**Propósito:** Instruções específicas que o Claude Code carrega automaticamente quando trabalha com arquivos dentro daquele diretório. Complementam o CLAUDE.md raiz sem poluí-lo.

| Arquivo | Conteúdo |
|---------|----------|
| `frontend/CLAUDE.md` | Comandos Angular, regras de componentes, signals, Storybook |
| `supabase/CLAUDE.md` | Comandos Supabase, regras de migrations, verificação do Docker |

---

## 4. Fluxo de Dados entre Arquivos

```

Usuário digita /implement-feature "criar tarefas"
       │
       ▼
[.claude/commands/implement-feature.md] → Carrega o workflow
       │
       ▼
[CLAUDE.md raiz] → Regras globais sempre presentes
       │
       ▼
[.claude/agents/architect.md] → Subagente planeja
       │ lê ─→ [docs/business-rules.md] → Regras de negócio
       │ lê ─→ [docs/architecture.md] → Decisões existentes
       │
       ▼
[.claude/agents/implementer.md] → Subagente implementa
       │ lê ─→ [frontend/CLAUDE.md] → Regras do frontend (se tocou frontend)
       │ lê ─→ [supabase/CLAUDE.md] → Regras do backend (se tocou backend)
       │ lê ─→ [.claude/skills/angular-components/] → Se criou componente
       │ lê ─→ [.claude/skills/supabase-migrations/] → Se criou migration
       │
       ▼
[.claude/settings.json] → Hooks rodam a cada ação
       │ executa ─→ Auto-format após edição
       │ bloqueia ─→ Push para prod / edição de migration aplicada
       │
       ▼
[.claude/agents/tester.md] → Subagente testa
       │ lê ─→ [.claude/skills/e2e-testing/] → Padrão de testes
       │
       ▼
[.claude/agents/reviewer.md] → Subagente revisa
       │
       ▼
[CHANGELOG.md] → Entrada adicionada
[git] → Commit + PR

```

---

## 5. Guia de Adaptação

### 5.1 Trocar área de negócio (novo cliente, outro setor)

**Arquivos a alterar:**
- `docs/business-rules.md` → Reescrever completamente com as regras do novo cliente
- `docs/design-system.md` → Novas cores, tipografia, componentes específicos
- `CLAUDE.md` raiz → Substituir placeholders `{{PROJECT_NAME}}`, `{{CLIENT_NAME}}`, `{{PROJECT_DESCRIPTION}}`
- `AGENTS.md` → Substituir placeholder `{{PROJECT_NAME}}`
- `.github/copilot-instructions.md` → Substituir placeholder

**Arquivos que NÃO mudam:** Subagentes, slash commands, hooks, skills, GitHub Actions, instructions por path, CLAUDE.md dos subdiretórios. Esses são agnósticos ao negócio.

### 5.2 Trocar o Supabase por outro backend

**Se trocar por Firebase, PocketBase, ou outro BaaS:**

- `CLAUDE.md` raiz → Trocar referências a Supabase no stack, comandos e regras
- `AGENTS.md` → Trocar stack e comandos
- `supabase/CLAUDE.md` → Substituir pelo CLAUDE.md do novo backend (ex: `firebase/CLAUDE.md`)
- `.claude/skills/supabase-migrations/` → Substituir por skill do novo backend (ex: `firebase-rules/`)
- `.claude/skills/edge-functions/` → Substituir por skill das functions do novo backend (ex: `cloud-functions/`)
- `.github/instructions/supabase.instructions.md` → Reescrever para o novo backend
- `.github/workflows/deploy.yml` → Trocar os steps de deploy do Supabase pelos do novo backend
- `.claude/settings.json` → Atualizar hooks — o bloqueio de produção precisa apontar para o novo serviço
- `docs/architecture.md` → Adicionar ADR explicando a troca

**Se trocar por backend próprio (Node.js, Python, etc):**

Tudo acima + criar novas skills para o padrão do backend (ex: `skill-api-routes/`, `skill-database-migrations/`). Os subagentes (architect, implementer, tester, reviewer) funcionam com qualquer backend — eles seguem as instruções das skills, não têm lógica de backend hardcoded.

### 5.3 Trocar o Angular por outro framework frontend

**Se trocar por React, Vue, Svelte, Next.js:**

- `CLAUDE.md` raiz → Trocar referências a Angular no stack, comandos, regras de código e estrutura de pastas
- `AGENTS.md` → Trocar stack e convenções
- `frontend/CLAUDE.md` → Reescrever completamente para o novo framework
- `.claude/skills/angular-components/` → Substituir por skill do novo framework (ex: `react-components/`)
- `.github/instructions/angular.instructions.md` → Reescrever para o novo framework (ex: `react.instructions.md`, com `applyTo` ajustado para `.tsx, .jsx`)
- `.github/copilot-instructions.md` → Trocar convenções do Angular pelas do novo framework
- `.claude/settings.json` → Ajustar hooks de auto-format para as extensões corretas
- `docs/architecture.md` → Adicionar ADR explicando a troca

**Os subagentes NÃO mudam** — eles referenciam as skills e o CLAUDE.md, que são a fonte de verdade. Ao trocar a skill e o CLAUDE.md, os subagentes automaticamente passam a seguir o novo padrão.

**Os slash commands NÃO mudam** — o workflow (planejar → implementar → testar → revisar) é agnóstico ao framework.

### 5.4 Trocar o padrão de desenvolvimento

**Mudar o workflow de slash commands:**

Os comandos estão em `.claude/commands/`. Cada arquivo .md é o prompt completo do workflow. Para alterar:
- Adicionar/remover etapas → Editar o arquivo .md do comando
- Adicionar novo comando → Criar novo arquivo .md em `.claude/commands/`
- Mudar checkpoints → Editar onde aparece "PARE e peça ao usuário para validar"
- Mudar padrão de commit → Editar a linha de commit em cada comando

**Mudar os subagentes:**

- Adicionar novo subagente → Criar novo .md em `.claude/agents/` com frontmatter (name, description, tools, model)
- Mudar ferramentas de um subagente → Alterar o campo `tools` no frontmatter
- Mudar modelo → Alterar o campo `model` (sonnet, haiku, opus)
- Tornar um subagente mais/menos restritivo → Editar o prompt do subagente

**Mudar os hooks:**

- Adicionar proteção → Adicionar novo hook em `.claude/settings.json` no array do evento correspondente (PreToolUse ou PostToolUse)
- Remover proteção → Remover o hook do array
- Hooks disponíveis: PreToolUse (antes de uma ação, pode bloquear), PostToolUse (após ação, pode validar/formatar), SessionStart (início de sessão), Stop (fim de sessão)

**Mudar o CI/CD:**

- Adicionar etapa → Editar `.github/workflows/ci.yml` ou `deploy.yml`
- Mudar provedor de hospedagem → Editar o step de deploy em `deploy.yml`
- Adicionar ambiente (ex: staging deploy automático) → Criar novo workflow

### 5.5 Adicionar nova ferramenta (ex: trocar Storybook, trocar Playwright)

**Trocar Storybook por outro (Ladle, Histoire):**
- `CLAUDE.md` raiz → Trocar referências
- `frontend/CLAUDE.md` → Trocar comando de storybook
- `.claude/skills/angular-components/` → Trocar template de story
- `.claude/agents/implementer.md` → Trocar referência a Storybook
- Os comandos mencionam "criar story" — trocar pela nomenclatura da nova ferramenta

**Trocar Playwright por outro (Cypress, WebdriverIO):**
- `.claude/skills/e2e-testing/` → Reescrever completamente
- `.github/workflows/ci.yml` → Trocar steps de E2E
- `CLAUDE.md` raiz → Trocar no stack e comandos

### 5.6 Adicionar nova skill

Criar pasta em `.claude/skills/nome-da-skill/` com arquivo `SKILL.md`. O frontmatter YAML deve conter:

```yaml
---
name: nome-da-skill
description: Descrição clara de QUANDO usar esta skill. Ser específico nos gatilhos.
---
```

O corpo do SKILL.md contém as instruções, templates e regras. Manter abaixo de 500 linhas. Se precisar de mais, usar arquivos auxiliares em subpastas que o SKILL.md referencia.

---

## 6. Princípios Fundamentais

Se estiver em dúvida sobre como adaptar, siga estes princípios:

1. **CLAUDE.md deve ser enxuto** — máximo 150 linhas. Tudo que é específico vai para skills ou docs.
2. **Hooks para o que DEVE acontecer sempre** — instruções em .md são advisory; hooks são determinísticos.
3. **Skills para conhecimento sob demanda** — só carrega quando relevante, economiza tokens.
4. **Subagentes para isolamento de contexto** — cada papel num contexto limpo.
5. **Slash commands para workflows repetíveis** — o processo é o mesmo independente da feature.
6. **Docs para conhecimento de domínio** — regras de negócio, arquitetura e design system mudam por projeto; a estrutura de desenvolvimento não muda.
7. **Commits e changelog para rastreabilidade** — todo trabalho documentado automaticamente.
8. **Humano nos pontos de decisão** — a IA implementa, o humano valida e aprova deploys.

```

```

rebuild-template/
│
├── CLAUDE.md                                    [A]
├── AGENTS.md                                    [B]
├── CHANGELOG.md                                 [C]
│
├── .claude/
│   ├── settings.json                            [D]
│   ├── agents/
│   │   ├── architect.md                         [E1]
│   │   ├── implementer.md                       [E2]
│   │   ├── tester.md                            [E3]
│   │   └── reviewer.md                          [E4]
│   ├── commands/
│   │   ├── implement-feature.md                 [F1]
│   │   ├── implement.md                         [F2]
│   │   ├── fix-bug.md                           [F3]
│   │   └── tweak.md                             [F4]
│   └── skills/
│       ├── supabase-migrations/SKILL.md         [G1]
│       ├── edge-functions/SKILL.md              [G2]
│       ├── angular-components/SKILL.md          [G3]
│       └── e2e-testing/SKILL.md                 [G4]
│
├── .github/
│   ├── copilot-instructions.md                  [H]
│   ├── instructions/
│   │   ├── angular.instructions.md              [I1]
│   │   ├── supabase.instructions.md             [I2]
│   │   └── tests.instructions.md                [I3]
│   └── workflows/
│       ├── ci.yml                               [J1]
│       └── deploy.yml                           [J2]
│
├── docs/
│   ├── business-rules.md                        [K1]
│   ├── architecture.md                          [K2]
│   ├── design-system.md                         [K3]
│   └── feature-workflow.md                      [K4]
│
├── frontend/
│   └── CLAUDE.md                                [L1]
│
└── supabase/
    └── CLAUDE.md                                [L2]

```

---

## 3. Descrição Detalhada de Cada Arquivo

### [A] CLAUDE.md (raiz)

**Propósito:** Arquivo principal que o Claude Code carrega em TODA sessão. Contém as regras globais do projeto.

**Conteúdo:** Visão geral do projeto, stack, estrutura de pastas, comandos essenciais (build, test, lint, serve), regras de código (TypeScript, Angular, Supabase), convenções de commit, regras de componentes e design system, definição dos ambientes (local, staging, produção), e referências para docs mais detalhados.

**Princípio de design:** Deve ter no máximo 100-150 linhas. LLMs seguem bem até ~150 instruções; acima disso a aderência cai uniformemente. Se precisar de mais detalhes, referenciar documentos em `docs/` que o Claude lê sob demanda.

**Placeholders:** `{{PROJECT_NAME}}`, `{{CLIENT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{SUPABASE_DEV_REF}}`, `{{SUPABASE_PROD_REF}}`

### [B] AGENTS.md (raiz)

**Propósito:** Arquivo compartilhado que o Codex e o Copilot leem nativamente. Contém um subconjunto das regras que se aplicam a todas as IAs.

**Conteúdo:** Stack, comandos principais, convenções de código, estrutura de pastas, regras importantes. É uma versão mais enxuta do CLAUDE.md focada no que é universal.

**Relação com CLAUDE.md:** Não duplica — o CLAUDE.md é mais completo (tem referências a skills, subagentes, ambientes). O AGENTS.md tem o essencial que qualquer IA precisa para trabalhar no projeto.

### [C] CHANGELOG.md

**Propósito:** Registro cronológico de todas as alterações do projeto (features, fixes, tweaks).

**Como é atualizado:** Os slash commands instruem o Claude a adicionar uma entrada ao final de cada entrega, com data, tipo, resumo e hash do commit.

**Formato:** `## YYYY-MM-DD | Tipo | hash_commit` seguido de descrição.

### [D] .claude/settings.json

**Propósito:** Configuração de hooks e permissões do Claude Code. Hooks são scripts determinísticos que rodam automaticamente em pontos específicos do ciclo de vida do Claude — diferente das instruções em CLAUDE.md que são "advisory", hooks são garantidos.

**Hooks configurados:**

| Hook | Tipo | Momento | O que faz |
|------|------|---------|-----------|
| Bloqueio de produção | PreToolUse | Antes de rodar Bash | Impede `supabase db push` para o project ref de produção |
| Proteção de migrations | PreToolUse | Antes de editar arquivo | Impede edição de migrations já aplicadas |
| Auto-format | PostToolUse | Após editar arquivo | Roda Prettier em arquivos .ts, .html, .scss, .css |

**Permissões:** Lista de comandos permitidos (ng, supabase, git, npm, npx, playwright) e comandos bloqueados (rm -rf, DROP TABLE, --force).

**Placeholder:** `{{SUPABASE_PROD_REF}}` no hook de bloqueio de produção.

### [E1-E4] .claude/agents/ (Subagentes)

**Propósito:** Subagentes são assistentes especializados que rodam em contexto isolado. Cada um tem um papel, ferramentas limitadas e prompt otimizado para sua função. O isolamento de contexto é o principal benefício — o trabalho pesado de um subagente não polui o contexto do próximo.

| Agente | Papel | Ferramentas | Modelo | Quando é usado |
|--------|-------|-------------|--------|----------------|
| **architect** | Planeja sem codar | Read, Grep, Glob | Sonnet | Início de features — analisa codebase e produz plano |
| **implementer** | Escreve código | Read, Write, Edit, Bash, Glob, Grep | Sonnet | Implementação de features, componentes, migrations |
| **tester** | Escreve e roda testes | Read, Write, Edit, Bash, Glob, Grep | Sonnet | Após implementação — testes unitários e E2E |
| **reviewer** | Analisa sem modificar | Read, Grep, Glob | Haiku | Revisão final — qualidade, segurança, aderência |

**Detalhe importante:** O reviewer roda no Haiku (modelo mais barato e rápido) porque sua tarefa é leitura e análise, não geração complexa. Isso economiza tokens significativamente.

**O architect NUNCA escreve código** — apenas lê e planeja. Isso garante que o plano é validado pelo humano antes de qualquer linha ser escrita.

**O implementer para nos checkpoints** — sua instrução principal é NUNCA prosseguir sem aprovação explícita do usuário. Isso garante validação humana entre cada camada (frontend → backend → integração).

### [F1-F4] .claude/commands/ (Slash Commands)

**Propósito:** Workflows pré-definidos invocados com `/nome-do-comando` no terminal. Cada arquivo .md contém o prompt completo que o Claude Code segue. A variável `$ARGUMENTS` captura o que o usuário escreveu após o comando.

| Comando | Quando usar | Fluxo |
|---------|-------------|-------|
| `/implement-feature` | Feature completa ponta a ponta | 7 etapas com checkpoints: plan → front → back → integração → testes → review → PR |
| `/implement` | Entrega parcial (só front, só back, um componente) | Analisa → implementa → testa → valida → commit |
| `/fix-bug` | Correção de bugs | Investiga causa raiz → corrige → testa → valida → commit |
| `/tweak` | Ajustes visuais/textuais sem lógica | Localiza → aplica → valida → commit |

**Princípio de escala:** Quanto menor a tarefa, menor o comando. `/implement-feature` é o mais pesado (múltiplos subagentes, múltiplos checkpoints). `/tweak` é o mais leve (edição direta, sem testes). Usar o comando proporcional à tarefa economiza tokens.

**Todos os comandos:** Param para validação do usuário antes de commitar, atualizam o CHANGELOG.md ao final, e fazem commits em português no formato `tipo(escopo): descrição`.

### [G1-G4] .claude/skills/ (Skills)

**Propósito:** Conhecimento especializado que o Claude carrega sob demanda. Na inicialização, apenas o nome e descrição de cada skill são carregados (~50-100 tokens cada). O conteúdo completo só é lido quando a tarefa é relevante.

| Skill | Quando ativa | Conteúdo |
|-------|-------------|----------|
| **supabase-migrations** | Criar/modificar migrations | Template SQL, regras de naming, workflow local→staging→prod |
| **edge-functions** | Criar/modificar Edge Functions | Template TypeScript, CORS, auth, error handling |
| **angular-components** | Criar/modificar componentes | Estrutura de componente, signals, template de Storybook story |
| **e2e-testing** | Escrever testes E2E | Page Object pattern, template de teste, seletores, fixtures |

**Progressive disclosure:** Skills existem para não poluir o CLAUDE.md com detalhes que só são necessários em contextos específicos. Se tudo estivesse no CLAUDE.md, ele teria 500+ linhas e o Claude ignoraria a maioria.

### [H] .github/copilot-instructions.md

**Propósito:** Instruções globais para o GitHub Copilot. Carrega em toda interação no VS Code — chat, autocomplete, agent mode.

**Conteúdo:** Stack, convenções de código, formato de commits. Versão compacta das regras — o Copilot é usado para tarefas menores e autocomplete, não precisa de todo o detalhe que o Claude Code precisa.

### [I1-I3] .github/instructions/ (Instructions por path)

**Propósito:** Instruções do Copilot que se aplicam apenas a determinados tipos de arquivo, definidas pelo `applyTo` no frontmatter YAML.

| Arquivo | Aplica a | Conteúdo |
|---------|----------|----------|
| `angular.instructions.md` | `frontend/src/**/*.ts,*.html,*.scss` | Regras Angular, signals, componentes |
| `supabase.instructions.md` | `supabase/**` | Regras de migrations, RLS, Edge Functions |
| `tests.instructions.md` | `**/*.spec.ts, tests/e2e/**` | Padrões de teste, arrange-act-assert |

**Vantagem:** Quando o Copilot está autocompletando num `.spec.ts`, ele carrega automaticamente as regras de teste. Quando está num componente Angular, carrega as regras de Angular. Sem poluição cruzada.

### [J1-J2] .github/workflows/ (GitHub Actions)

**Propósito:** Pipelines de CI/CD automatizados.

| Workflow | Gatilho | O que faz |
|----------|---------|-----------|
| `ci.yml` | Pull Request para main | Lint → Testes unitários → Build → Testes E2E |
| `deploy.yml` | Push na main (merge) | Aplica migrations Supabase prod → Deploy Edge Functions → Build e deploy Vercel |

**Detalhe crítico do deploy.yml:** O job `deploy-frontend` depende de `deploy-supabase` (via `needs`). Se a migration falhar, o frontend não é deployado. Isso evita deploy de frontend que depende de schema que não existe ainda.

**Secrets necessários:** `SUPABASE_PROD_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_DB_PASSWORD`, `SUPABASE_PROD_URL`, `SUPABASE_PROD_ANON_KEY`, `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### [K1-K4] docs/ (Documentação)

| Arquivo | Propósito | Quem atualiza |
|---------|-----------|---------------|
| `business-rules.md` | Regras de negócio do cliente | Humano (com apoio do Claude) |
| `architecture.md` | Decisões arquiteturais (ADRs) | Humano + Claude (append-only) |
| `design-system.md` | Cores, tipografia, componentes, espaçamento | Humano na criação, Claude consulta |
| `feature-workflow.md` | Documentação do processo de desenvolvimento | Referência humana — descreve o que os commands automatizam |

**business-rules.md** é o arquivo mais importante para customização por projeto. Ele contém toda a lógica de domínio que o Claude consulta antes de implementar features. Template com seções para entidades, fluxos, perfis de usuário, regras de prazo e notificações.

**architecture.md** usa o padrão ADR (Architecture Decision Record). Decisões são append-only — nunca editar uma decisão anterior, apenas adicionar novas. O template já vem com 6 ADRs base do stack Rebuild.

**design-system.md** é a referência visual. O Claude consulta antes de criar componentes para usar as cores, tipografia e espaçamento corretos. Template com placeholders para cores e fonte.

### [L1-L2] CLAUDE.md de subdiretórios

**Propósito:** Instruções específicas que o Claude Code carrega automaticamente quando trabalha com arquivos dentro daquele diretório. Complementam o CLAUDE.md raiz sem poluí-lo.

| Arquivo | Conteúdo |
|---------|----------|
| `frontend/CLAUDE.md` | Comandos Angular, regras de componentes, signals, Storybook |
| `supabase/CLAUDE.md` | Comandos Supabase, regras de migrations, verificação do Docker |

---

## 4. Fluxo de Dados entre Arquivos

```

Usuário digita /implement-feature "criar tarefas"
       │
       ▼
[.claude/commands/implement-feature.md] → Carrega o workflow
       │
       ▼
[CLAUDE.md raiz] → Regras globais sempre presentes
       │
       ▼
[.claude/agents/architect.md] → Subagente planeja
       │ lê ─→ [docs/business-rules.md] → Regras de negócio
       │ lê ─→ [docs/architecture.md] → Decisões existentes
       │
       ▼
[.claude/agents/implementer.md] → Subagente implementa
       │ lê ─→ [frontend/CLAUDE.md] → Regras do frontend (se tocou frontend)
       │ lê ─→ [supabase/CLAUDE.md] → Regras do backend (se tocou backend)
       │ lê ─→ [.claude/skills/angular-components/] → Se criou componente
       │ lê ─→ [.claude/skills/supabase-migrations/] → Se criou migration
       │
       ▼
[.claude/settings.json] → Hooks rodam a cada ação
       │ executa ─→ Auto-format após edição
       │ bloqueia ─→ Push para prod / edição de migration aplicada
       │
       ▼
[.claude/agents/tester.md] → Subagente testa
       │ lê ─→ [.claude/skills/e2e-testing/] → Padrão de testes
       │
       ▼
[.claude/agents/reviewer.md] → Subagente revisa
       │
       ▼
[CHANGELOG.md] → Entrada adicionada
[git] → Commit + PR

```

---

## 5. Guia de Adaptação

### 5.1 Trocar área de negócio (novo cliente, outro setor)

**Arquivos a alterar:**
- `docs/business-rules.md` → Reescrever completamente com as regras do novo cliente
- `docs/design-system.md` → Novas cores, tipografia, componentes específicos
- `CLAUDE.md` raiz → Substituir placeholders `{{PROJECT_NAME}}`, `{{CLIENT_NAME}}`, `{{PROJECT_DESCRIPTION}}`
- `AGENTS.md` → Substituir placeholder `{{PROJECT_NAME}}`
- `.github/copilot-instructions.md` → Substituir placeholder

**Arquivos que NÃO mudam:** Subagentes, slash commands, hooks, skills, GitHub Actions, instructions por path, CLAUDE.md dos subdiretórios. Esses são agnósticos ao negócio.

### 5.2 Trocar o Supabase por outro backend

**Se trocar por Firebase, PocketBase, ou outro BaaS:**

- `CLAUDE.md` raiz → Trocar referências a Supabase no stack, comandos e regras
- `AGENTS.md` → Trocar stack e comandos
- `supabase/CLAUDE.md` → Substituir pelo CLAUDE.md do novo backend (ex: `firebase/CLAUDE.md`)
- `.claude/skills/supabase-migrations/` → Substituir por skill do novo backend (ex: `firebase-rules/`)
- `.claude/skills/edge-functions/` → Substituir por skill das functions do novo backend (ex: `cloud-functions/`)
- `.github/instructions/supabase.instructions.md` → Reescrever para o novo backend
- `.github/workflows/deploy.yml` → Trocar os steps de deploy do Supabase pelos do novo backend
- `.claude/settings.json` → Atualizar hooks — o bloqueio de produção precisa apontar para o novo serviço
- `docs/architecture.md` → Adicionar ADR explicando a troca

**Se trocar por backend próprio (Node.js, Python, etc):**

Tudo acima + criar novas skills para o padrão do backend (ex: `skill-api-routes/`, `skill-database-migrations/`). Os subagentes (architect, implementer, tester, reviewer) funcionam com qualquer backend — eles seguem as instruções das skills, não têm lógica de backend hardcoded.

### 5.3 Trocar o Angular por outro framework frontend

**Se trocar por React, Vue, Svelte, Next.js:**

- `CLAUDE.md` raiz → Trocar referências a Angular no stack, comandos, regras de código e estrutura de pastas
- `AGENTS.md` → Trocar stack e convenções
- `frontend/CLAUDE.md` → Reescrever completamente para o novo framework
- `.claude/skills/angular-components/` → Substituir por skill do novo framework (ex: `react-components/`)
- `.github/instructions/angular.instructions.md` → Reescrever para o novo framework (ex: `react.instructions.md`, com `applyTo` ajustado para `.tsx, .jsx`)
- `.github/copilot-instructions.md` → Trocar convenções do Angular pelas do novo framework
- `.claude/settings.json` → Ajustar hooks de auto-format para as extensões corretas
- `docs/architecture.md` → Adicionar ADR explicando a troca

**Os subagentes NÃO mudam** — eles referenciam as skills e o CLAUDE.md, que são a fonte de verdade. Ao trocar a skill e o CLAUDE.md, os subagentes automaticamente passam a seguir o novo padrão.

**Os slash commands NÃO mudam** — o workflow (planejar → implementar → testar → revisar) é agnóstico ao framework.

### 5.4 Trocar o padrão de desenvolvimento

**Mudar o workflow de slash commands:**

Os comandos estão em `.claude/commands/`. Cada arquivo .md é o prompt completo do workflow. Para alterar:
- Adicionar/remover etapas → Editar o arquivo .md do comando
- Adicionar novo comando → Criar novo arquivo .md em `.claude/commands/`
- Mudar checkpoints → Editar onde aparece "PARE e peça ao usuário para validar"
- Mudar padrão de commit → Editar a linha de commit em cada comando

**Mudar os subagentes:**

- Adicionar novo subagente → Criar novo .md em `.claude/agents/` com frontmatter (name, description, tools, model)
- Mudar ferramentas de um subagente → Alterar o campo `tools` no frontmatter
- Mudar modelo → Alterar o campo `model` (sonnet, haiku, opus)
- Tornar um subagente mais/menos restritivo → Editar o prompt do subagente

**Mudar os hooks:**

- Adicionar proteção → Adicionar novo hook em `.claude/settings.json` no array do evento correspondente (PreToolUse ou PostToolUse)
- Remover proteção → Remover o hook do array
- Hooks disponíveis: PreToolUse (antes de uma ação, pode bloquear), PostToolUse (após ação, pode validar/formatar), SessionStart (início de sessão), Stop (fim de sessão)

**Mudar o CI/CD:**

- Adicionar etapa → Editar `.github/workflows/ci.yml` ou `deploy.yml`
- Mudar provedor de hospedagem → Editar o step de deploy em `deploy.yml`
- Adicionar ambiente (ex: staging deploy automático) → Criar novo workflow

### 5.5 Adicionar nova ferramenta (ex: trocar Storybook, trocar Playwright)

**Trocar Storybook por outro (Ladle, Histoire):**
- `CLAUDE.md` raiz → Trocar referências
- `frontend/CLAUDE.md` → Trocar comando de storybook
- `.claude/skills/angular-components/` → Trocar template de story
- `.claude/agents/implementer.md` → Trocar referência a Storybook
- Os comandos mencionam "criar story" — trocar pela nomenclatura da nova ferramenta

**Trocar Playwright por outro (Cypress, WebdriverIO):**
- `.claude/skills/e2e-testing/` → Reescrever completamente
- `.github/workflows/ci.yml` → Trocar steps de E2E
- `CLAUDE.md` raiz → Trocar no stack e comandos

### 5.6 Adicionar nova skill

Criar pasta em `.claude/skills/nome-da-skill/` com arquivo `SKILL.md`. O frontmatter YAML deve conter:

```yaml
---
name: nome-da-skill
description: Descrição clara de QUANDO usar esta skill. Ser específico nos gatilhos.
---
```

O corpo do SKILL.md contém as instruções, templates e regras. Manter abaixo de 500 linhas. Se precisar de mais, usar arquivos auxiliares em subpastas que o SKILL.md referencia.

---

## 6. Princípios Fundamentais

Se estiver em dúvida sobre como adaptar, siga estes princípios:

1. **CLAUDE.md deve ser enxuto** — máximo 150 linhas. Tudo que é específico vai para skills ou docs.
2. **Hooks para o que DEVE acontecer sempre** — instruções em .md são advisory; hooks são determinísticos.
3. **Skills para conhecimento sob demanda** — só carrega quando relevante, economiza tokens.
4. **Subagentes para isolamento de contexto** — cada papel num contexto limpo.
5. **Slash commands para workflows repetíveis** — o processo é o mesmo independente da feature.
6. **Docs para conhecimento de domínio** — regras de negócio, arquitetura e design system mudam por projeto; a estrutura de desenvolvimento não muda.
7. **Commits e changelog para rastreabilidade** — todo trabalho documentado automaticamente.
8. **Humano nos pontos de decisão** — a IA implementa, o humano valida e aprova deploys.

```

```

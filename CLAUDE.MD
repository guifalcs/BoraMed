# Projeto Med — CLAUDE.md

## Visão Geral

Plataforma de simulados para estudantes de medicina da rede Afya.

* **Arthur Barata** : sócio, estudante Afya — fonte de verdade sobre conteúdo médico e calendário Afya.
* **Guilherme** : sócio, dev/produto — decisor técnico.

## Stack

* **Frontend** : Angular 18+ (standalone components, signals) + Tailwind CSS + TypeScript
* **Backend/DB** : Supabase (Postgres + Auth + Storage)
* **Deploy** : Vercel (frontend) + Supabase (backend)
* **Testes E2E** : Playwright
* **Storybook** : para desenvolvimento isolado de componentes

## Comandos

```bash
ng serve                    # dev em localhost:4200
ng build                    # build de produção
ng lint                     # lint
ng test                     # testes unitários (Karma/Jasmine)
npm run storybook           # Storybook em localhost:6006
npx supabase start          # iniciar supabase local (Docker)
npx supabase db push        # aplicar migrations (DEV apenas)
npx playwright test         # testes e2e
```

## Estrutura de Pastas

```
projeto-med/
├── frontend/        # Angular app
├── supabase/        # migrations, edge functions, seed
├── docs/            # regras de negócio, arquitetura, design
├── .claude/         # agentes, commands, skills
└── .github/         # CI/CD, copilot instructions
```

## Regras de Código

* TypeScript strict. Sem `any`.
* Standalone components (sem NgModule).
* Signals para estado reativo. Evitar RxJS para estado simples.
* `ChangeDetectionStrategy.OnPush` em todos os componentes.
* Nomes de arquivo: kebab-case. Componentes: PascalCase.
* Commits: `tipo(escopo): descrição` em português.
* Toda migration: prefixo timestamp + nome descritivo.

## Módulos MVP

1. **Provas Nacionais** — provas antigas Afya, exibição e gabarito.
2. **Simulados Processuais** — filtro por tema + qtd, geração aleatória.
3. **Simulados de Laboratório** — questões com imagens de lâminas/peças.

## Banco de Questões — Estrutura

Entidades principais: `questao`, `alternativa`, `tema`, `prova`, `simulado`, `resultado`.
Campos chave em `questao`: `tipo` (nacional|processual|laboratorio), `periodo`, `tema_id`, `imagem_url`, `faculdade_afya`.

## Regras Críticas

* NUNCA rodar `supabase db push` contra o project ref de produção diretamente.
* NUNCA editar migrations já aplicadas — apenas criar novas.
* Questões de laboratório sempre têm `imagem_url` obrigatório.
* Auth: login/senha simples (Supabase Auth email/password).
* Lógica de sorteio de questões: server-side via Supabase (RPC ou Edge Function).
  Sempre que criar uma funcionalidade, atualizar docs necessárias do sistema para refletir o estado atual

## Como Responder

* Frases curtas. Sem gentilezas. Entrega direta.
* Código: apenas diff/linhas alteradas. Nunca reescrever arquivo inteiro salvo solicitação explícita.
* Decisões de produto: opinião direta, sem "depende".
* Dado faltando: assumir default mais provável, sinalizar em uma linha, seguir.
* Arthur = fonte de verdade em conteúdo médico e calendário Afya.
* Guilherme = decisor técnico/produto.

## Referências

* Regras de negócio: `docs/business-rules.md`
* Arquitetura: `docs/architecture.md`
* Design system: `docs/design-system.md`
* Skills: `.claude/skills/`

# Projeto Med

## Visão Geral

Plataforma de simulados para estudantes de medicina da rede Afya.

* **Arthur Barata** : sócio, estudante Afya — fonte de verdade sobre conteúdo médico e calendário Afya.
* **Guilherme** : sócio, dev/produto — decisor técnico.

## Stack

* **Frontend** : Next.js 14 (App Router) + Tailwind CSS + TypeScript
* **Backend/DB** : Supabase (Postgres + Auth + Storage)
* **Deploy** : Vercel (frontend) + Supabase (backend)
* **Testes E2E** : Playwright

## Comandos

```bash
npm run dev          # dev local
npm run build        # build
npm run lint         # lint
npx supabase start   # iniciar supabase local (Docker)
npx supabase db push # aplicar migrations (DEV apenas)
npx playwright test  # testes e2e
```

## Estrutura de Pastas

```
projeto-med/
├── frontend/        # Next.js app
├── supabase/        # migrations, edge functions, seed
├── docs/            # regras de negócio, arquitetura, design
├── .claude/         # agentes, commands, skills
└── .github/         # CI/CD, copilot instructions
```

## Regras de Código

* TypeScript strict. Sem `any`.
* Server Components por padrão; `use client` só quando necessário.
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

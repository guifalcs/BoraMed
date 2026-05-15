# Plano — Identidade Visual + Animação + Gamificação Sutil

Status: proposta (aguardando decisões do Arthur e Guilherme)
Data: 2026-05-14

## 1. Objetivo

Dar ao BoraMed uma identidade visual própria e uma experiência mais "premium", com:

1. **Ilustrações características** (estáticas e animadas) — um mascote/elenco que só existe no BoraMed.
2. **Animações com propósito** — leve, empolgante, levemente gamificado.

A tensão central do brief: **"leve mas não infantil"**. O público é estudante de medicina adulto, sob estresse de prova. A referência de produção é o Duolingo, mas o tom NÃO pode ser o do Duolingo (app que também atende crianças). O alvo de tom são produtos adultos que são charmosos sem serem lúdicos: Linear, Things 3, Headspace, Notion.

O plano resiste ao teste: "isto poderia ser qualquer app de estudo?" — não, porque a identidade é ancorada em **ilustração médica com função mnemônica** (precedente: Sketchy Medical, Picmonic), não em decoração genérica.

## 2. Referências

| Referência | O que pegar |
|---|---|
| [Duolingo — Shape Language](https://blog.duolingo.com/shape-language-duolingos-art-style/) | Vetor, formas arredondadas, mínimo de detalhe, silhueta legível, exagero controlado, produção rápida. |
| [Duolingo — Brand: Characters](https://design.duolingo.com/illustration/characters) | Elenco de personagens secundários para não saturar com um único mascote. |
| [Sketchy Medical / Picmonic](https://www.picmonic.com/) | **Diferencial do BoraMed**: ilustração como ferramenta mnemônica (dual-coding theory). Imagem ajuda a fixar conteúdo, não só decora. |
| Linear, Things 3, Headspace, Notion | Tom adulto: animação discreta, microinteração precisa, "calmo e confiante" — resolve o "leve mas não infantil". |
| [Duolingo-style mascot em Rive](https://dev.to/uianimation/building-a-duolingo-style-interactive-mascot-in-rive-step-by-step-guide-2d5c) | Referência técnica de mascote interativo (avaliar no futuro, ver Seção 6). |

## 3. Restrições — "leve mas empolgante para adulto"

Tratar como regras concretas, não como tom geral:

- **Mascote = colega de estudo, não professor animado.** Postura calma e confiante. Aparece em momentos pontuais (onboarding, vazio, resultado), não em toda tela.
- **Comemoração contida.** Acerto de simulado ≥70% → confete discreto + checkmark com draw-on. Nunca "party mode", nunca tela inteira tomada.
- **Streak sem clichê.** Indicador de constância sem chama-pegando-fogo. Pode ser um anel/calendário sóbrio.
- **Animação serve à leitura.** Em telas operacionais (execução de simulado, leitura de questão) animação é mínima — só feedback de estado. Expressividade fica nas telas institucionais (auth, onboarding, resultado, vazios).
- **Paleta da marca.** Tudo dentro do gradiente azul→violeta + neutros do `docs/design-system.md`. Sem cores novas para "alegrar".
- **`prefers-reduced-motion` obrigatório.** Toda animação respeita a media query. `canvas-confetti` tem `disableForReducedMotion`. Estudante cansado/ansioso é exatamente o público que precisa disso.
- **SSR-safe.** O app é Angular SSR com hidratação. Ver Seção 5.3.
- **Custo zero como default.** Qualquer item pago é marcado como upgrade opcional condicionado a orçamento.

## 4. Pilar 1 — Sistema de Ilustração + Mascote

### 4.1 Fase 0 — Exploração de conceito do mascote (NÃO PULAR)

Mascote errado = semanas perdidas redesenhando assets. Antes de produzir qualquer asset final, gerar **3 direções de conceito** e o **Arthur decide** (CLAUDE.md: Arthur é fonte de verdade em conteúdo médico e identidade Afya).

Três territórios a explorar (1 board de referência cada, ~6 imagens):

- **A — Personagem-estudante:** um(a) colega de medicina estilizado(a). Empático, "estuda junto". Risco: genérico.
- **B — Objeto médico personificado:** estetoscópio / jaleco / prancheta com personalidade. Memorável, "ownable". Risco: cair no fofo.
- **C — Elenco anatômico mnemônico:** mini-personagens temáticos (coração, neurônio, etc.) no espírito Sketchy/Picmonic, usados por módulo/tema. Mais trabalho, mais diferencial pedagógico.

Entregável da Fase 0: 3 boards + recomendação. Decisão trava o resto.

### 4.2 Character DNA — documento de consistência

Depois da decisão, escrever um **DNA template** do personagem (vira `docs/mascote.md`): nome, idade/porte, paleta exata (hex da marca), formas-assinatura, traços fixos (acessório, expressão padrão), o que nunca muda. É o "arquivo-fonte" que mantém a geração por IA consistente.

### 4.3 Pipeline de produção gratuito

Gerar um mascote **consistente** com ferramentas grátis é genuinamente difícil — vai ter iteração. Escada recomendada:

1. **Gerar base (IA):** Google Gemini / "Nano Banana" (free tier generoso, boa consistência) ou Microsoft Designer (DALL·E 3, grátis). GPT Image (ChatGPT Plus) se já houver assinatura — melhor controle por referência. Sempre enviar a imagem de referência + DNA template e mudar **uma variável por vez** (pose, expressão).
2. **Vetorizar:** SVGcode (grátis, open-source) ou Recraft (vetorização com free tier). Objetivo: sair de PNG para SVG limpo e escalável.
3. **Limpar/padronizar:** Figma (grátis) ou Inkscape (grátis). Ajustar nós, normalizar paleta, exportar em tamanhos do design system.
4. **Organizar:** assets em `frontend/src/assets/illustrations/` com nomenclatura kebab-case.

Alternativa de baixo esforço para telas não-mascote (ex.: ilustrações de apoio genéricas): bibliotecas open-source ([unDraw](https://undraw.co/) MIT, [Storyset](https://storyset.com/), [Open Doodles](https://www.opendoodles.com/) CC0). **Regra:** usar no máximo **uma** biblioteca, e recolorir para a paleta da marca. Mascote e momentos de marca são sempre custom.

### 4.4 Shape language (regras de estilo)

Do estudo do Duolingo, adaptado ao tom adulto do BoraMed:

- Vetor, formas arredondadas, **mínimo de detalhe** necessário para legibilidade.
- Silhueta legível primeiro — testar a ilustração em 375px (mobile-first do projeto).
- Exagero controlado, **sem caricatura** (aqui divergimos do Duolingo: o tom é adulto).
- Paleta restrita à marca; branco como espaço negativo.
- Produção rápida e escalável (por isso vetor).

## 5. Pilar 2 — Animação

### 5.1 Decisão Lottie vs Rive — CRAVADA

**Default: Lottie.** Motivo: o constraint do brief é "de graça". O **editor do Rive é grátis, mas exportar `.riv` para produção custa US$ 9/mês** (plano Cadet). Lottie é 100% gratuito ponta a ponta.

Rive fica como **upgrade futuro** (Seção 6), justificado só se quisermos mascote *interativo* de verdade (state machine reagindo a input). Para ilustração animada passiva (onboarding, vazios, celebração), Lottie entrega.

### 5.2 Stack de animação (tudo grátis, commercial-use)

| Ferramenta | Uso | Por quê |
|---|---|---|
| **Angular Animations API** (nativo) | Transições de rota, enter/leave de listas, estados de UI | Já vem no Angular, SSR-aware. |
| **GSAP** | Animações de narrativa de marca, draw-on de SVG, timelines (auth, resultado) | Agora 100% grátis incluindo todos os plugins (SplitText, MorphSVG, DrawSVG). Framework-agnostic. |
| **canvas-confetti** | Recompensa pontual (resultado ≥70%, conclusão de meta) | <10KB, web worker, tem `disableForReducedMotion`. |
| **ngx-lottie** + lottie-web | Ilustrações animadas autorais (mascote em onboarding, vazios) | Wrapper Angular oficial para Lottie. |
| **Tailwind** (`animate-pulse` etc.) | Skeletons, microestados já previstos no design system | Já no projeto. |

Criação dos arquivos Lottie sem After Effects (que é pago): **LottieLab** ou **Jitter** (free tiers) exportam Lottie; ou animar o SVG direto com GSAP (100% dev, zero custo de ferramenta). Recomendação: começar animando SVG com GSAP/Angular e só adotar Lottie autoral quando houver volume que justifique.

### 5.3 Restrições técnicas de SSR (entram no plano, não são polimento)

- ngx-lottie e GSAP manipulam DOM → inicializar só no browser via `afterNextRender()` (preferir sobre `isPlatformBrowser` + `@if`, que causa layout shift na hidratação — recomendação oficial do Angular).
- Componente que renderiza animação de terceiros que quebra hidratação: usar `ngSkipHydration` no componente.
- Reservar espaço (aspect-ratio / dimensão fixa) para o asset antes de animar, evitando CLS.
- Toda animação atrás de checagem de `prefers-reduced-motion`.

## 6. Pilar 3 — Gamificação Sutil _(DEFERIDO — fora deste ciclo)_

Princípio (do estudo de gamificação para apps profissionais): **adicionar elementos de jogo, não virar um jogo.** Recompensa precisa ser significativa, usuário no controle, transparente. Referência de tom: LinkedIn (certificado = badge, "quem viu seu perfil" = quest) — sutil, adulto.

### 6.1 O que fazer

- **Constância (streak):** dias seguidos estudando. Visual sóbrio (anel/mini-calendário), sem chama.
- **Progresso por tema:** o `resultado-summary` já tem barra por tema — evoluir para "domínio do tema" (ex.: anel que enche). Recompensa **significativa** = reflete competência real.
- **Pontos de estudo (XP-like):** acumulam por questão respondida/simulado concluído. Nome alinhado ao contexto médico, não "XP".
- **Badges de marco:** "primeiro simulado nacional", "tema X dominado", "10 simulados de laboratório". Significativos, não decorativos.
- **Reações do mascote:** aparece no resultado e em marcos, com expressão coerente (calmo no apoio, satisfeito no acerto). Nunca eufórico.
- **Nível por desempenho** (opcional, fase futura): mapear faixas de acerto a um indicador discreto de evolução.

### 6.2 O que NÃO fazer

- Sem ranking competitivo público (estresse a mais num público ansioso).
- Sem badge vazio (decoração sem conquista real).
- Sem pop-up de recompensa interrompendo leitura de questão.
- Sem moeda/loja/streak-freeze comprável.
- Gamificação é **opt-out**: dá pra desligar nas configurações.

## 7. Inventário de Assets

Lista concreta do que precisa de ilustração/animação (base: estrutura atual do `frontend/src/app`). Sem isso o plano é abstrato e estoura de escopo.

| Tela / estado | Ilustração | Animação | Prioridade |
|---|---|---|---|
| BrandPanel auth (login, cadastro, recuperar/redefinir senha) | Hero com mascote | GSAP draw-on / entrada suave | P0 |
| Callback de auth | — | Loader de marca | P1 |
| Onboarding (futuro) | Mascote em 2–3 cenas | Lottie/SVG sequencial | P1 |
| `empty-state` (componente compartilhado) | Ilustração por contexto | Entrada leve | P0 |
| `em-breve-banner` / `em-breve-page` (provas) | Mascote "em construção" | Sutil | P1 |
| Histórico vazio | Ilustração | — | P1 |
| Desempenho (dashboard) | Ícones/ilustração de dados | Contagem de números, barras enchendo | P1 |
| `resultado-summary` ≥70% | Mascote satisfeito | canvas-confetti discreto + checkmark draw-on | P0 |
| `resultado-summary` 50–69% | Mascote neutro/encorajador | Entrada suave | P0 |
| `resultado-summary` <50% | Mascote de apoio (não derrota) | Entrada suave | P0 |
| `questao-explicacao` | — | Reveal de gabarito (slide/fade) | P1 |
| `timer` (warning <5min / danger <1min) | — | Pulso já previsto; refinar | P2 |
| Simulado lab — loading de imagem de lâmina | Skeleton temático | `animate-pulse` (já previsto) | P2 |
| Alternativa correta/errada | — | Microfeedback de seleção | P1 |
| Streak / pontos / badges | Ícones de gamificação custom | Anel enchendo, badge "pop" discreto | P1 |
| 404 / erro genérico | Mascote "perdido" | — | P2 |

P0 = primeira leva. P1 = segunda. P2 = polimento.

## 8. Roadmap por fases

| Fase | Escopo | Entregável |
|---|---|---|
| **0 — Conceito** | 3 direções de mascote (Seção 4.1). Arthur decide. | Boards + decisão + `docs/mascote.md` (DNA) |
| **1 — Fundação** | Pipeline de assets validado. Instalar GSAP + canvas-confetti. Padrão SSR-safe para animação (helper/diretiva). `prefers-reduced-motion` global. | 1 ilustração P0 (BrandPanel) + microinteração funcionando + story no Storybook |
| **2 — Assets P0** | Todas as ilustrações P0 (auth, empty-state, 3 estados de resultado). Confete no resultado ≥70%. | Assets em `assets/illustrations/` + componentes atualizados + stories |
| **3 — Gamificação base** | Streak, pontos de estudo, progresso por tema, badges de marco. Reações do mascote no resultado. Opt-out nas configs. | Componentes de gamificação + stories + migration se precisar persistir |
| **4 — Animação autoral** | Avaliar Lottie autoral para onboarding/vazios (LottieLab/Jitter). Assets P1. | Lotties + ngx-lottie integrado |
| **5 — Polimento** | Assets P2, refino de timing, auditoria de performance/CLS, revisão de acessibilidade. | — |
| **Futuro (condicional)** | Rive (US$9/mês) para mascote interativo de verdade. Só se houver orçamento e demanda clara. | — |

Cada fase: atualizar `docs/design-system.md` + changelog (regra do CLAUDE.md). Todo componente compartilhado novo tem `.stories.ts` obrigatório.

## 9. Ferramentas e custos

| Categoria | Ferramenta | Custo |
|---|---|---|
| Geração de imagem (IA) | Gemini/Nano Banana, MS Designer (DALL·E 3), Leonardo.ai | Grátis (free tier) |
| Geração de imagem (IA) | GPT Image | Incluso no ChatGPT Plus, se já houver |
| Vetorização | SVGcode, Recraft | Grátis / free tier |
| Edição vetorial | Figma, Inkscape | Grátis |
| Ilustração pronta (apoio) | unDraw, Storyset, Open Doodles | Grátis, commercial-use |
| Animação (libs) | Angular Animations, GSAP, canvas-confetti, ngx-lottie | Grátis (GSAP agora 100% free) |
| Criação de Lottie | LottieLab, Jitter (free tier) | Grátis |
| Animação interativa avançada | Rive | **US$ 9/mês** — upgrade futuro opcional |

Custo do plano em modo default: **R$ 0**.

## 10. Riscos

- **Consistência do mascote via IA grátis** — risco real. Mitigar com DNA template rígido, geração por referência, uma variável por vez. Orçar iteração.
- **SSR/hidratação** — animações de terceiros quebram hidratação. Mitigar com `afterNextRender` + `ngSkipHydration` + padrão único reutilizável definido na Fase 1.
- **Escopo de assets** — o inventário (Seção 7) tem ~16 itens. Respeitar prioridades P0→P2; não produzir tudo de uma vez.
- **Tom escorregando para infantil** — revisar cada asset contra a Seção 3. Arthur valida tom.
- **Performance/CLS** — reservar espaço para assets, lazy-load, auditar na Fase 5.

## 11. Decisões pendentes

1. **Direção do mascote** (A/B/C da Seção 4.1) — decisão do Arthur, após Fase 0.
2. **Nome do mascote/elenco** — Arthur.
3. ~~**Gamificação persiste no banco?**~~ **DECIDIDO:** Gamificação cortada deste ciclo. Foco em ilustração + animação.
4. **Orçar Rive (US$9/mês) no futuro?** — Guilherme, decisão de produto, não bloqueia nada agora.
5. **Onboarding existe no roadmap?** Várias telas P1 dependem disso — confirmar.

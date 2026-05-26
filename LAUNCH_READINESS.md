# Relatório de Prontidão para Launch — BoraMed

**Data:** 26/05/2026 | **Revisor:** Claude Code

---

## TL;DR

O app está **tecnicamente funcional** em todas as suas principais telas. O que bloqueia o launch não é código, é **conteúdo e infraestrutura comercial**. Com o banco de questões atual (≈13 questões), usuários reais entrariam numa plataforma vazia.

---

## O Que Está Pronto

| Área | Status |
|---|---|
| Auth (email/senha + Google OAuth) | ✅ Completo |
| Cadastro, login, recuperação de senha | ✅ Completo |
| Onboarding de novos usuários (7 etapas) | ✅ Completo |
| Landing page com SEO + structured data | ✅ Completo |
| Dashboard com KPIs, streak, desafio diário | ✅ Completo |
| Treinos nacionais (lista + filtro por subtipo/período) | ✅ Completo |
| Simulado personalizado (montar por tipo/tema/qtd) | ✅ Completo |
| Execução de tentativa (timer, pausa, retomada, grade) | ✅ Completo |
| Modo estudo (gabarito visível em tempo real) | ✅ Completo |
| Tela de resultado com próximos passos | ✅ Completo |
| Revisão de erros (filtro `erros` no visualizar) | ✅ Completo |
| Sugestão de treino pelo tema mais fraco | ✅ Completo |
| Histórico + gráficos de desempenho | ✅ Completo |
| XP, streak v2, conquistas (50 no catálogo) | ✅ Completo |
| Ranking global e semanal | ✅ Completo |
| Perfil com opção de privacidade competitiva | ✅ Completo |
| Suporte via WhatsApp | ✅ Completo |
| Admin: CRUD completo (questões, provas, temas, disciplinas) | ✅ Completo |
| Admin: importação com prompt de IA | ✅ Completo |
| Admin: avisos broadcast + notificações in-app | ✅ Completo |
| Admin: impersonação de usuário com auditoria | ✅ Completo |
| Segurança: RLS em todas as tabelas, FKs com RESTRICT | ✅ Completo |
| Error pages (403, 404, 500) | ✅ Completo |
| Deploy: Vercel + Supabase Cloud | ✅ Configurado |

---

## O Que Bloqueia o Launch

### 1. Banco de Questões Vazio — CRÍTICO

**O maior problema.** Existem ~13 questões seedadas (SOI 2025, Q1–Q13). A landing page promete "+2.400 questões autorais". Usuários que entram encontram uma plataforma sem conteúdo para treinar.

**O que precisa existir antes do launch mínimo:**
- Questões suficientes para pelo menos 3–5 simulados nacionais reais por período
- Temas populados e vinculados às questões para o simulado personalizado funcionar
- Arthur precisa fornecer e validar esse conteúdo

**Impacto:** Sem questões, não existe produto.

---

### 2. `og-image.png` Ausente — CRÍTICO para marketing

A landing page referencia `/og-image.png` no Open Graph (WhatsApp, LinkedIn, Twitter). O arquivo **não existe** no `/public/`. Todo compartilhamento da plataforma vai aparecer sem preview.

**Fix:** Criar e colocar `frontend/public/og-image.png` (1200×630px).

---

### 3. Imagens das Questões de Laboratório — CRÍTICO (se o módulo for ativar)

O schema exige `imagem_url` obrigatório para questões do tipo `laboratorio`. O Supabase Storage precisa ter as imagens de lâminas/peças reais carregadas e as URLs populadas nas questões. Sem isso, o módulo de laboratório não tem conteúdo funcional.

**Decisão necessária:** Se laboratório não vai ao ar no launch, remover o card da landing e deixar como "em breve". Se vai, as imagens precisam estar no Storage.

---

### 4. Sem Política de Privacidade e Termos de Uso — CRÍTICO legal

Qualquer plataforma que coleta email, dados pessoais e histórico de estudo precisa ter:
- Política de Privacidade
- Termos de Uso

Não há nenhuma dessas páginas no app nem links no cadastro/landing. Além do risco legal, muitos usuários não se cadastram sem essas páginas.

---

### 5. Domínio e Email de Contato — CRÍTICO para credibilidade

- A URL canônica no SEO é `bora-med.vercel.app`. Para um launch real, precisa de domínio próprio.
- O structured data referencia `contato@boramed.com.br` como email da organização. Esse endereço precisa existir e receber mensagens.

---

### 6. Monetização Completamente Ausente — BLOQUEADOR se quiser cobrar

O `business-rules.md` define freemium (R$19–39/mês), mas **não há nenhuma implementação** de:
- Planos de assinatura (free vs. pago)
- Gateway de pagamento (Stripe ou similar)
- Controle de acesso por plano
- Flow de upgrade/checkout

**Se o launch for 100% gratuito:** não é bloqueador imediato.  
**Se quiser cobrar desde o dia 1:** é um bloqueador completo — precisaria de semanas de implementação.

---

## O Que Prejudica a Experiência mas Não Bloqueia

### 7. Sem Analytics de Produto

Não há Google Analytics, Plausible, PostHog ou similar. Não é possível saber de onde vêm os usuários, o que usam, onde abandonam. Lançar sem analytics é operar no escuro.

**Recomendação:** Adicionar Plausible ou GA4 na landing + dashboard antes do launch.

---

### 8. Sem Monitoramento de Erros

Nenhum Sentry ou equivalente. Bugs em produção só serão descobertos quando usuários reclamarem no WhatsApp. Com usuários reais, é essencial.

**Recomendação:** Sentry free tier cobre o MVP facilmente.

---

### 9. Landing Page com Estatísticas Fictícias

A landing exibe `+2.400 questões autorais` e `3 módulos de treino` como stats estáticos. Se o banco estiver com 13 questões e laboratório indisponível no launch, isso é falsa propaganda para os primeiros usuários.

**Fix:** Ajustar as stats para refletir o estado real no momento do launch. Exemplo: "100+ questões autorais" se for esse o volume inicial.

---

### 10. Confirmação de Email no Cadastro

O código do cadastro trata o caso `needsConfirmation: true` mostrando uma mensagem de "verifique seu e-mail". Se o Supabase estiver configurado para exigir confirmação, novos usuários ficam travados nessa etapa, o que aumenta abandono no onboarding.

**Verificar:** Configuração do Supabase Auth — se confirmação de email está ativa ou não. Para MVP inicial com usuários conhecidos, desabilitar a confirmação é mais simples.

---

### 11. Sem Email Transacional

Não há emails automáticos configurados:
- Boas-vindas após cadastro
- Notificações de conquista
- Recap semanal de desempenho

O Supabase tem integração nativa com Resend. Não é bloqueador de launch, mas impacta retenção.

---

### 12. Desafio Diário Sem Reset Automático Confirmado

A lógica de reset do desafio diário parece ocorrer no lado cliente (via timestamp), mas não há cron job visível no Supabase. Em produção, precisaria garantir que o desafio muda a meia-noite para todos os usuários.

---

### 13. Ranking Semanal Sem Reset Automático

A migration cria o campo `xp_semana_atual` mas não há cron visível para resetar o XP semanal toda segunda-feira. O ranking semanal acumularia indefinidamente.

---

## Resumo Priorizado

| # | Item | Prioridade | Esforço |
|---|---|---|---|
| 1 | Banco de questões (conteúdo real) | 🔴 Bloqueador | Arthur + semanas |
| 2 | `og-image.png` | 🔴 Bloqueador | 1h |
| 3 | Política de Privacidade + Termos | 🔴 Bloqueador | 1–2 dias |
| 4 | Domínio próprio | 🔴 Bloqueador | < 1 dia (registrar) |
| 5 | Email contato@boramed.com.br | 🔴 Bloqueador | < 1h |
| 6 | Imagens de laboratório no Storage | 🔴 Bloqueador se módulo ativo | depende do conteúdo |
| 7 | Monetização (Stripe + planos) | 🟠 Importante se cobrar | 1–2 semanas |
| 8 | Analytics (Plausible/GA4) | 🟠 Importante | meio dia |
| 9 | Sentry para monitoramento | 🟠 Importante | meio dia |
| 10 | Stats da landing corrigidos | 🟡 Desejável | 1h |
| 11 | Confirmação de email (verificar config) | 🟡 Desejável | 1h |
| 12 | Cron reset ranking semanal | 🟡 Desejável | 2h |
| 13 | Email transacional (boas-vindas etc.) | 🟢 Pós-launch | 1–2 dias |

---

## Caminho Mais Curto para o Launch

1. Arthur popula o banco de questões — bloqueador real, insubstituível
2. Criar `og-image.png` e ajustar stats da landing para o volume real
3. Registrar domínio + configurar email de contato
4. Escrever Política de Privacidade e Termos de Uso (pode ser simples no MVP)
5. Decidir: laboratório ativo ou "em breve"? Imagens prontas ou não?
6. Adicionar Plausible + Sentry (meio dia de trabalho)
7. Verificar config de confirmação de email no Supabase
8. Corrigir cron de reset de ranking semanal (2h)

**Com esses 8 itens resolvidos, o app está pronto para receber usuários reais.**

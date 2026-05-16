# Onboarding — BoraMed

## Objetivo

Guiar o aluno novo até o primeiro momento de valor: entender onde escolher um treino, onde acompanhar evolução e onde ajustar privacidade/suporte.

O onboarding não é um tutorial longo. É uma camada curta de ativação dentro do dashboard.

## Fluxo MVP

Fluxo ativo: `dashboard_intro` v1.

Passos:

1. Welcome institucional com Poloca e CTA para conhecer o BoraMed.
2. Início: panorama do dia, progresso, recomendações e desafio diário.
3. Simulados: entrada principal para provas e treinos personalizados.
4. Competitivo: XP, ranking, desafio diário e privacidade.
5. Histórico: revisão de tentativas, notas e temas fracos.
6. Perfil/Suporte: dados pessoais, privacidade competitiva e ajuda.
7. Final: CTA para o início do módulo de simulados, onde o aluno escolhe o caminho.

## Regras de Produto

- Deve aparecer somente para usuário autenticado sem onboarding concluído ou pulado.
- Deve ser pulável a qualquer momento.
- Deve persistir estado por usuário, chave de fluxo e versão.
- Não concede XP, conquista ou qualquer recompensa competitiva.
- Não bloqueia o uso da plataforma se o Supabase falhar; nesse caso o dashboard continua normal.
- No desktop usa spotlight/popover quando o alvo esta visivel.
- No mobile usa bottom sheet para evitar popovers apertados.
- Se o alvo não existir na rota atual, usa fallback central.

## Dados

Tabela: `public.user_onboarding_state`.

Campos principais:

- `user_id`
- `flow_key`
- `flow_version`
- `status`: `not_started`, `started`, `completed`, `skipped`
- `current_step`
- `started_at`, `completed_at`, `skipped_at`
- `metadata`

Chave primária: `(user_id, flow_key, flow_version)`.

RLS: usuário autenticado só lê, insere e atualiza o próprio estado. `anon` sem acesso.

## UX

- Poloca aparece apenas no welcome e no final.
- Coachmarks usam texto curto e orientado à ação.
- O CTA final leva para `/dashboard/simulados`.
- O fluxo deve manter no máximo 7 passos na v1.

## Evolução Futura

- Reabrir onboarding pelo Perfil ou Suporte.
- Checklist de ativação: completar perfil, fazer primeiro simulado, revisar resultado, treinar tema fraco.
- Segmentação por período, faculdade/rede e tipo de usuário.
- Analytics de funil por etapa.
- Fluxos editáveis via Admin quando houver necessidade real de operação no-code.

# Onboarding — BoraMed

## Objetivo

Guiar o aluno novo ate o primeiro momento de valor: entender onde escolher um treino, onde acompanhar evolucao e onde ajustar privacidade/suporte.

O onboarding nao e um tutorial longo. E uma camada curta de ativacao dentro do dashboard.

## Fluxo MVP

Fluxo ativo: `dashboard_intro` v1.

Passos:

1. Welcome institucional com Poloca e CTA para conhecer o BoraMed.
2. Inicio: panorama do dia, progresso, recomendacoes e desafio diario.
3. Simulados: entrada principal para provas e treinos personalizados.
4. Competitivo: XP, ranking, desafio diario e privacidade.
5. Historico: revisao de tentativas, notas e temas fracos.
6. Perfil/Suporte: dados pessoais, privacidade competitiva e ajuda.
7. Final: CTA para o inicio do modulo de simulados, onde o aluno escolhe o caminho.

## Regras de Produto

- Deve aparecer somente para usuario autenticado sem onboarding concluido ou pulado.
- Deve ser pulavel a qualquer momento.
- Deve persistir estado por usuario, chave de fluxo e versao.
- Nao concede XP, conquista ou qualquer recompensa competitiva.
- Nao bloqueia o uso da plataforma se o Supabase falhar; nesse caso o dashboard continua normal.
- No desktop usa spotlight/popover quando o alvo esta visivel.
- No mobile usa bottom sheet para evitar popovers apertados.
- Se o alvo nao existir na rota atual, usa fallback central.

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

Chave primaria: `(user_id, flow_key, flow_version)`.

RLS: usuario autenticado so le, insere e atualiza o proprio estado. `anon` sem acesso.

## UX

- Poloca aparece apenas no welcome e no final.
- Coachmarks usam texto curto e orientado a acao.
- O CTA final leva para `/dashboard/simulados`.
- O fluxo deve manter no maximo 7 passos na v1.

## Evolucao Futura

- Reabrir onboarding pelo Perfil ou Suporte.
- Checklist de ativacao: completar perfil, fazer primeiro simulado, revisar resultado, treinar tema fraco.
- Segmentacao por periodo, faculdade/rede e tipo de usuario.
- Analytics de funil por etapa.
- Fluxos editaveis via Admin quando houver necessidade real de operacao no-code.

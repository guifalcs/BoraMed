-- Fuso horário do Brasil (America/Sao_Paulo) nas respostas da API.
--
-- Todas as colunas timestamptz (criado_em, atualizado_em, etc.) continuam
-- armazenadas em UTC no banco. Esta configuração altera apenas a APRESENTAÇÃO:
-- o PostgREST passa a renderizar qualquer timestamptz com offset -03:00,
-- ou seja, a hora exata do Brasil, sem alterar o instante real.
--
-- Aplicado por papel para cobrir todos os caminhos de acesso da API:
--   authenticator -> papel de conexão do PostgREST (login).
--   anon / authenticated -> papéis impersonados nas requisições.
--   service_role -> acesso server-side / edge functions.
--
-- Brasil não adota horário de verão desde 2019, então o offset é fixo (-03:00).

alter role authenticator set timezone to 'America/Sao_Paulo';
alter role anon set timezone to 'America/Sao_Paulo';
alter role authenticated set timezone to 'America/Sao_Paulo';
alter role service_role set timezone to 'America/Sao_Paulo';

-- Recarrega a configuração do PostgREST para aplicar de imediato.
notify pgrst, 'reload config';

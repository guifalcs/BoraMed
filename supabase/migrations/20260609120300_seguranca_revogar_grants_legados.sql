-- Segurança BAIXO/endurecimento — remover grants legados de "GRANT ALL" que
-- violam o menor-privilégio (não exploráveis via PostgREST, mas desnecessários).
--
-- TRUNCATE/TRIGGER/REFERENCES nunca são usados por clientes PostgREST.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- anon não deve escrever em profiles/notificacoes (criação de profile é via
-- trigger SECURITY DEFINER no signup; notificações são server-side/RPC).
REVOKE INSERT, UPDATE, DELETE ON public.profiles    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.notificacoes FROM anon;

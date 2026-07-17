-- pg_net estava registrada no schema public (lint extension_in_public).
-- A extensão não é relocável, então é drop + recreate. Os objetos dela vivem
-- no schema "net" (net.http_post etc.), portanto o cron job
-- mp-reconciliar-assinaturas continua funcionando sem alteração; a tabela
-- transitória net._http_response é descartada (TTL curto, sem valor).
drop extension pg_net;
create extension pg_net schema extensions;

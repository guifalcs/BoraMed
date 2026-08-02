# Entrada pela rota raiz

## Comportamento

A rota `/` mantém a landing page para visitantes, mas redireciona usuários
autenticados para `/dashboard`. O guard de OAuth continua sendo executado antes
da decisão para que callbacks com `?code=` sejam tratados em `/auth/callback`.

Em acesso direto ao domínio, o SSR aplica a mesma decisão nos cookies e devolve
um redirect HTTP para o dashboard antes de renderizar a landing. Navegações
internas continuam protegidas pelo guard Angular.

Sessões de recuperação de senha são encaminhadas para `/redefinir-senha`.

Como fallback para hidratacao SSR, a propria landing executa uma checagem lazy
apenas quando a URL ainda e `/`. Isso cobre navegadores que reaproveitam o HTML
pre-renderizado antes de reexecutar os guards.

## Performance

A decisão usa `AuthService.initialize()`, que é idempotente e lê a sessão local
com `getSession()`. Não é feita uma consulta extra ao usuário no Supabase e não
é montada uma tela de loading intermediária. O guard é carregado de forma lazy,
preservando o bundle inicial da landing para visitantes.

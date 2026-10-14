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

## Entrada por `/planos`

`/planos` atende aos dois estados de sessão a partir de um único link, para que
campanha de e-mail, bio do Instagram e anúncio usem sempre a mesma URL:

| Estado | Destino |
| --- | --- |
| Com sessão | tela de planos do app, já logado |
| Sem sessão | `/#planos`, a seção de planos da landing (pública) |

Quem decide é o `planosPublicoGuard`, declarado **antes** do `authGuard` no
`canActivate` da rota. Quando devolve `true`, o `authGuard` segue com o que
sempre fez (sessão de recovery, conta suspensa, vínculo pendente de assinatura).

Sem esse guard o deslogado ia parar em `/login`, e como o `authGuard` não guarda
a rota de destino, terminava no `/dashboard` depois de entrar: nunca via a
oferta que o fez clicar.

O desvio usa `location.replace`, não o `Router`. São dois motivos: a âncora só
rola até a seção num carregamento de página (o router não está com
`anchorScrolling` ligado) e o `replace` mantém `/planos` fora do histórico, senão
o botão "voltar" cairia no mesmo desvio. Fora do browser (SSR) o guard devolve um
`UrlTree` para a landing; hoje `/planos` é `RenderMode.Client`, então esse
caminho é só rede de segurança.

## Performance

A decisão usa `AuthService.initialize()`, que é idempotente e lê a sessão local
com `getSession()`. Não é feita uma consulta extra ao usuário no Supabase e não
é montada uma tela de loading intermediária. O guard é carregado de forma lazy,
preservando o bundle inicial da landing para visitantes.

## Relógio do aparelho fora de hora

O supabase-js decide se o access token venceu comparando o `expires_at` do servidor com o relógio local (margem de 90 s). Aparelho adiantado perto da validade do token faz todo token nascer "vencido": cada request força um refresh, o `/token` responde 429 (limite por IP) e o auth-js emite `SIGNED_OUT`.

- `core/utils/relogio-dispositivo.util.ts` mede o desvio pelo `iat` de token recém emitido (`login()` e evento `TOKEN_REFRESHED`; nunca a sessão lida do storage, cujo `iat` é antigo).
- Desvio crítico (`desvio >= validade - 90 s - 60 s`): `AuthService` encerra só a sessão local (`signOut({ scope: 'local' })`) e vai para `/login`; o login com senha devolve `CLOCK_SKEW`. A tela de login mostra o alerta lendo `auth.relogioDesajustado()`.
- Desvio de 5 min ou mais, mas não crítico: login segue e mostra um toast de aviso.

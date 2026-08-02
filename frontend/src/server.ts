import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { parse, serialize } from 'cookie';
import { createServerClient } from '@supabase/ssr';
import { environment } from './environments/environment';
import type { Request, Response } from 'express';
import type { CookieOptionsWithName } from '@supabase/ssr';
import type { CookieSerializeOptions } from 'cookie';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Redireciona a entrada direta para o dashboard antes de renderizar a landing
 * quando já existe uma sessão nos cookies. O callback OAuth precisa passar
 * pelo Angular para trocar o `code` antes dessa decisão.
 */
app.get('/', async (req: Request, res: Response, next) => {
  if (req.query['code'] || req.query['error']) {
    next();
    return;
  }

  const cookiesToSet: { name: string; value: string; options: CookieOptionsWithName }[] = [];
  const supabase = createServerClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    cookies: {
      getAll: () => {
        const parsed = parse(req.headers.cookie ?? '');
        return Object.entries(parsed).map(([name, value]) => ({ name, value }));
      },
      setAll: (cookies) => {
        cookiesToSet.push(...cookies);
      },
    },
  });

  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      next();
      return;
    }

    const cookieHeaders = cookiesToSet.map(({ name, value, options }) => {
      const { name: _n, ...serializeOpts } = options ?? {};
      return serialize(name, value, serializeOpts as CookieSerializeOptions);
    });
    if (cookieHeaders.length > 0) {
      res.setHeader('Set-Cookie', cookieHeaders);
    }

    res.redirect(302, jwtHasRecoveryAMR(session.access_token) ? '/redefinir-senha' : '/dashboard');
  } catch {
    // A falha na leitura da sessão não deve impedir a landing pública.
    next();
  }
});

/**
 * Auth callback — troca o PKCE code por sessão e seta cookie.
 * Intercepta antes do Angular SSR para que o redirect seja limpo.
 */
app.get('/auth/callback', async (req: Request, res: Response) => {
  const code = req.query['code'] as string | undefined;
  const next = req.query['next'] as string | undefined;

  if (!code) {
    res.redirect(302, '/erro');
    return;
  }

  const cookiesToSet: { name: string; value: string; options: CookieOptionsWithName }[] = [];

  const supabase = createServerClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    cookies: {
      getAll: () => {
        const parsed = parse(req.headers.cookie ?? '');
        return Object.entries(parsed).map(([name, value]) => ({ name, value }));
      },
      setAll: (cookies) => {
        cookiesToSet.push(...cookies);
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  const cookieHeaders = cookiesToSet.map(({ name, value, options }) => {
    const { name: _n, ...serializeOpts } = options ?? {};
    return serialize(name, value, serializeOpts as CookieSerializeOptions);
  });
  if (cookieHeaders.length > 0) {
    res.setHeader('Set-Cookie', cookieHeaders);
  }

  if (error) {
    console.error('[auth/callback] error:', error.message);

    // Code já foi consumido (clique duplo no link do e-mail). Se o usuário
    // ainda possui uma sessão válida nos cookies, redireciona para o destino
    // correto em vez de mostrar a página de erro genérica.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: sessionData } = await supabase.auth.getSession();
      const existingToken = sessionData.session?.access_token;
      const destination = jwtHasRecoveryAMR(existingToken) ? '/redefinir-senha' : '/dashboard';
      res.redirect(302, destination);
      return;
    }

    res.redirect(302, '/erro');
    return;
  }

  // Detecta sessão de recuperação de senha via claim AMR no JWT,
  // para garantir o redirecionamento correto mesmo quando o parâmetro
  // `next` não está presente na URL (ex.: site_url usado como fallback pelo Supabase).
  const defaultNext = jwtHasRecoveryAMR(data.session?.access_token) ? '/redefinir-senha' : '/dashboard';
  const resolvedNext = next ?? defaultNext;

  // Garante que next seja uma rota relativa segura.
  // `startsWith('/')` sozinho deixa passar `//evil.com` (protocol-relative),
  // que é um open redirect — por isso bloqueamos também o prefixo `//`.
  const safePath = resolvedNext.startsWith('/') && !resolvedNext.startsWith('//') ? resolvedNext : defaultNext;
  res.redirect(302, safePath);
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

function jwtHasRecoveryAMR(accessToken: string | undefined): boolean {
  if (!accessToken) return false;
  try {
    const payloadB64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8')) as {
      amr?: { method: string }[];
    };
    return Array.isArray(claims.amr) && claims.amr.some((m) => m.method === 'recovery');
  } catch {
    return false;
  }
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

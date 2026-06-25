import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parse, serialize } from 'cookie';
import { createServerClient } from '@supabase/ssr';
import { environment } from './environments/environment';
import type { Request, Response, NextFunction } from 'express';
import type { CookieOptionsWithName } from '@supabase/ssr';
import type { CookieSerializeOptions } from 'cookie';

const browserDistFolder = join(import.meta.dirname, '../browser');

// Placeholder presente no index.html (atributo ngCspNonce do <app-root>). O Angular
// replica esse valor nos <script> inline de hidratação/event-replay durante o SSR; o
// middleware abaixo o substitui pelo nonce real de cada requisição, alinhando o HTML
// ao cabeçalho Content-Security-Policy.
const NONCE_PLACEHOLDER = '__CSP_NONCE__';

/**
 * Content-Security-Policy. O `script-src` usa um nonce por requisição (gerado no
 * middleware) em vez de 'unsafe-inline', mantendo a hidratação do Angular funcionando
 * sem abrir brecha de XSS. As demais origens refletem os recursos externos legítimos
 * (Google Fonts, Supabase, Sentry). Mercado Pago é redirect de página inteira, então
 * não precisa de diretiva.
 */
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: https://gakvktwtdunljojghpff.supabase.co`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self' https://gakvktwtdunljojghpff.supabase.co wss://gakvktwtdunljojghpff.supabase.co https://o4511458808561664.ingest.us.sentry.io`,
    `media-src 'self'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');
}

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Gera um nonce por requisição e aplica o cabeçalho Content-Security-Policy a todas as
 * respostas (HTML renderizado e arquivos estáticos). Deve rodar antes de qualquer
 * handler que produza resposta.
 */
app.use((_req: Request, res: Response, next: NextFunction) => {
  const nonce = randomBytes(16).toString('base64');
  res.locals['nonce'] = nonce;
  res.setHeader('Content-Security-Policy', buildCsp(nonce));
  next();
});

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
 * Auth callback — troca o PKCE code por sessão e seta cookie.
 * Intercepta antes do Angular SSR para que o redirect seja limpo.
 */
app.get('/auth/callback', async (req: Request, res: Response) => {
  const code = req.query['code'] as string | undefined;
  const next = (req.query['next'] as string | undefined) ?? '/dashboard';

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  const cookieHeaders = cookiesToSet.map(({ name, value, options }) => {
    const { name: _n, ...serializeOpts } = options ?? {};
    return serialize(name, value, serializeOpts as CookieSerializeOptions);
  });
  if (cookieHeaders.length > 0) {
    res.setHeader('Set-Cookie', cookieHeaders);
  }

  if (error) {
    console.error('[auth/callback] error:', error.message);
    res.redirect(302, '/erro');
    return;
  }

  // Garante que next seja uma rota relativa segura.
  // `startsWith('/')` sozinho deixa passar `//evil.com` (protocol-relative),
  // que é um open redirect — por isso bloqueamos também o prefixo `//`.
  const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  res.redirect(302, safePath);
});

/**
 * Handle all other requests by rendering the Angular application.
 *
 * O HTML renderizado contém o placeholder de nonce (vindo do ngCspNonce no index.html
 * e replicado pelo Angular nos <script> inline). Substituímos pelo nonce real desta
 * requisição — o mesmo já presente no cabeçalho Content-Security-Policy — antes de
 * enviar. Respostas sem corpo HTML (redirects, etc.) seguem o caminho padrão.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) {
        next();
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        await writeResponseToNodeResponse(response, res);
        return;
      }

      const nonce = res.locals['nonce'] as string;
      const html = (await response.text()).split(NONCE_PLACEHOLDER).join(nonce);

      response.headers.forEach((value, key) => {
        // Content-Length será recalculado pelo Express a partir do corpo transformado.
        if (key.toLowerCase() !== 'content-length') {
          res.setHeader(key, value);
        }
      });
      res.status(response.status).send(html);
    })
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

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

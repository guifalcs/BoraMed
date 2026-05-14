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

  cookiesToSet.forEach(({ name, value, options }) => {
    const { name: _n, ...serializeOpts } = options ?? {};
    res.setHeader('Set-Cookie', serialize(name, value, serializeOpts as CookieSerializeOptions));
  });

  if (error) {
    console.error('[auth/callback] error:', error.message);
    res.redirect(302, '/erro');
    return;
  }

  // Garante que next seja uma rota relativa segura
  const safePath = next.startsWith('/') ? next : '/dashboard';
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

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

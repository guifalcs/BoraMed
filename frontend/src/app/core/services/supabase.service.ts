import { Injectable, PLATFORM_ID, REQUEST, RESPONSE_INIT, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { parse, serialize } from 'cookie';
import { environment } from '../../../environments/environment';
import type { CookieSerializeOptions } from 'cookie';
import type { CookieOptionsWithName } from '@supabase/ssr';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly request = inject(REQUEST, { optional: true });
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly client = this.isBrowser
    ? createBrowserClient(environment.supabaseUrl, environment.supabaseAnonKey)
    : createServerClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        cookies: {
          getAll: () => {
            const cookieHeader = this.request?.headers.get('cookie') ?? '';
            const parsed = parse(cookieHeader);
            return Object.entries(parsed).map(([name, value]) => ({ name, value }));
          },
          setAll: (cookiesToSet: { name: string; value: string; options: CookieOptionsWithName }[]) => {
            if (!this.responseInit) return;
            const existing = this.responseInit.headers;
            const headers = existing instanceof Headers
              ? existing
              : new Headers(existing as HeadersInit | undefined);
            cookiesToSet.forEach(({ name, value, options }) => {
              const { name: _n, ...serializeOpts } = options ?? {};
              headers.append('set-cookie', serialize(name, value, serializeOpts as CookieSerializeOptions));
            });
            this.responseInit.headers = headers;
          },
        },
      });
}

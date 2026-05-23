import { Injectable, PLATFORM_ID, REQUEST, RESPONSE_INIT, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { environment } from '../../../environments/environment';
import type { CookieOptionsWithName } from '@supabase/ssr';

type ServerCookie = {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptionsWithName;
};

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
            return parseCookieHeader(cookieHeader);
          },
          setAll: (cookiesToSet: ServerCookie[]) => {
            if (!this.responseInit) return;
            const existing = this.responseInit.headers;
            const headers = existing instanceof Headers
              ? existing
              : new Headers(existing as HeadersInit | undefined);
            cookiesToSet.forEach(({ name, value, options }) => {
              headers.append('set-cookie', serializeCookieHeader(name, value, options));
            });
            this.responseInit.headers = headers;
          },
        },
      });
}

function parseCookieHeader(header: string): { name: string; value: string }[] {
  if (!header) return [];

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawName, ...rawValue] = part.split('=');
      return {
        name: decodeCookiePart(rawName),
        value: decodeCookiePart(rawValue.join('=')),
      };
    })
    .filter((cookie) => cookie.name.length > 0);
}

function serializeCookieHeader(
  name: string,
  value: string,
  options: CookieOptionsWithName,
): string {
  const parts = [`${encodeCookiePart(name)}=${encodeCookiePart(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.trunc(options.maxAge)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.partitioned) parts.push('Partitioned');
  if (options.priority) parts.push(`Priority=${capitalizeCookieValue(options.priority)}`);
  if (options.sameSite) {
    parts.push(
      `SameSite=${options.sameSite === true ? 'Strict' : capitalizeCookieValue(options.sameSite)}`,
    );
  }

  return parts.join('; ');
}

function encodeCookiePart(value: string): string {
  return encodeURIComponent(value);
}

function decodeCookiePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function capitalizeCookieValue(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { PrefetchService } from '../../core/services/prefetch.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <img src="brand/logo.webp" alt="BoraMed" class="h-9 w-auto" width="400" height="128" />
      <div class="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
      <p class="text-sm text-gray-500">Entrando…</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent implements OnInit {
  private readonly supabase = inject(SupabaseService).client;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prefetch = inject(PrefetchService);

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const next = this.route.snapshot.queryParamMap.get('next') ?? '/dashboard';

    if (code) {
      const { error } = await this.supabase.auth.exchangeCodeForSession(code);
      if (error) {
        void this.router.navigateByUrl('/erro', { replaceUrl: true });
        return;
      }
    }

    this.prefetch.prefetchDashboardRoutes();
    // `//evil.com` passa em `startsWith('/')` (protocol-relative) → open redirect.
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    void this.router.navigateByUrl(safeNext, { replaceUrl: true });
  }
}

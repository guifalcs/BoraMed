import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { PrefetchService } from '../../core/services/prefetch.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<p style="padding:2rem;font-family:sans-serif">Autenticando…</p>`,
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
    void this.router.navigateByUrl(next.startsWith('/') ? next : '/dashboard', { replaceUrl: true });
  }
}

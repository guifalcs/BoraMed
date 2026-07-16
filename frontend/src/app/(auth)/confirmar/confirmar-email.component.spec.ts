import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfirmarEmailComponent } from './confirmar-email.component';
import { SupabaseService } from '../../core/services/supabase.service';
import { PrefetchService } from '../../core/services/prefetch.service';

const mockVerifyOtp = vi.fn();
const mockSupabase = { client: { auth: { verifyOtp: mockVerifyOtp } } };
const mockPrefetch = { prefetchDashboardRoutes: vi.fn() };
const mockRouter = { navigateByUrl: vi.fn() };

function mockRoute(params: Record<string, string>) {
  return { snapshot: { queryParamMap: convertToParamMap(params) } };
}

async function createComponent(params: Record<string, string>): Promise<ConfirmarEmailComponent> {
  await TestBed.configureTestingModule({
    imports: [ConfirmarEmailComponent],
    providers: [
      { provide: SupabaseService, useValue: mockSupabase },
      { provide: PrefetchService, useValue: mockPrefetch },
      { provide: Router, useValue: mockRouter },
      { provide: ActivatedRoute, useValue: mockRoute(params) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConfirmarEmailComponent);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  return component;
}

describe('ConfirmarEmailComponent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyOtp.mockResolvedValue({ error: null });
  });

  it('confirma via verifyOtp e navega para next em caso de sucesso', async () => {
    await createComponent({ token_hash: 'abc123', type: 'email', next: '/dashboard' });

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'email' });
    expect(mockPrefetch.prefetchDashboardRoutes).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
  });

  it('usa type email como fallback para type desconhecido', async () => {
    await createComponent({ token_hash: 'abc123', type: 'invalido' });

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'email' });
  });

  it('navega para /redefinir-senha quando type é recovery', async () => {
    await createComponent({ token_hash: 'abc123', type: 'recovery', next: '/redefinir-senha' });

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/redefinir-senha', { replaceUrl: true });
  });

  it('sanitiza next protocol-relative para /dashboard', async () => {
    await createComponent({ token_hash: 'abc123', next: '//evil.com' });

    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
  });

  it('exibe erro quando token_hash está ausente', async () => {
    const component = await createComponent({});

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    expect((component as any).falhou()).toBe(true);
  });

  it('exibe erro quando verifyOtp falha (link expirado/usado)', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const component = await createComponent({ token_hash: 'abc123', type: 'email' });

    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    expect((component as any).falhou()).toBe(true);
  });
});

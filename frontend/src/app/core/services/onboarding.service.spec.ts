import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { OnboardingService } from './onboarding.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { Tables } from '../types/database.types';

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

function fakeRow(overrides: Partial<Tables<'user_onboarding_state'>> = {}): Tables<'user_onboarding_state'> {
  return {
    user_id: 'user-123',
    flow_key: 'dashboard_intro',
    flow_version: 1,
    status: 'not_started',
    current_step: 'welcome',
    started_at: null,
    completed_at: null,
    skipped_at: null,
    metadata: {},
    criado_em: '2026-05-16T12:00:00.000Z',
    atualizado_em: '2026-05-16T12:00:00.000Z',
    ...overrides,
  };
}

function makeSelectBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const key of ['select', 'eq']) {
    builder[key] = vi.fn().mockReturnValue(builder);
  }
  builder['maybeSingle'] = vi.fn().mockResolvedValue(result);
  return builder;
}

function makeUpsertBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const key of ['upsert', 'select']) {
    builder[key] = vi.fn().mockReturnValue(builder);
  }
  builder['single'] = vi.fn().mockResolvedValue(result);
  return builder;
}

describe('OnboardingService', () => {
  let service: OnboardingService;
  const userSignal = signal<User | null>(null);
  const mockFrom = vi.fn();
  const mockSupabaseClient = { from: mockFrom };

  beforeEach(() => {
    vi.clearAllMocks();
    userSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        OnboardingService,
        { provide: AuthService, useValue: { user: userSignal.asReadonly() } },
        { provide: SupabaseService, useValue: { client: mockSupabaseClient } },
      ],
    });

    service = TestBed.inject(OnboardingService);
  });

  it('nao chama Supabase quando nao ha usuario autenticado', async () => {
    await service.load();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(service.isVisible()).toBe(false);
  });

  it('exibe o onboarding no welcome quando nao ha estado salvo', async () => {
    userSignal.set(fakeUser());
    mockFrom.mockReturnValue(makeSelectBuilder({ data: null, error: null }));

    await service.load();

    expect(mockFrom).toHaveBeenCalledWith('user_onboarding_state');
    expect(service.isVisible()).toBe(true);
    expect(service.activeStep()?.id).toBe('welcome');
    expect(service.state()?.status).toBe('not_started');
  });

  it('nao exibe quando o estado salvo esta completed', async () => {
    userSignal.set(fakeUser());
    mockFrom.mockReturnValue(makeSelectBuilder({
      data: fakeRow({ status: 'completed', current_step: 'final', completed_at: '2026-05-16T12:10:00.000Z' }),
      error: null,
    }));

    await service.load();

    expect(service.isVisible()).toBe(false);
    expect(service.state()?.status).toBe('completed');
  });

  it('start salva status started no primeiro passo contextual', async () => {
    userSignal.set(fakeUser());
    mockFrom
      .mockReturnValueOnce(makeSelectBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeUpsertBuilder({ data: fakeRow({ status: 'started', current_step: 'inicio' }), error: null }));

    await service.load();
    await service.start();

    expect(service.state()?.status).toBe('started');
    expect(service.activeStep()?.id).toBe('inicio');
  });

  it('skip salva status skipped e oculta o tour', async () => {
    userSignal.set(fakeUser());
    mockFrom
      .mockReturnValueOnce(makeSelectBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeUpsertBuilder({ data: fakeRow({ status: 'skipped', skipped_at: '2026-05-16T12:10:00.000Z' }), error: null }));

    await service.load();
    await service.skip();

    expect(service.state()?.status).toBe('skipped');
    expect(service.isVisible()).toBe(false);
  });

  it('next completa o onboarding quando esta no ultimo passo', async () => {
    userSignal.set(fakeUser());
    mockFrom
      .mockReturnValueOnce(makeSelectBuilder({ data: fakeRow({ status: 'started', current_step: 'final' }), error: null }))
      .mockReturnValueOnce(makeUpsertBuilder({
        data: fakeRow({ status: 'completed', current_step: 'final', completed_at: '2026-05-16T12:15:00.000Z' }),
        error: null,
      }));

    await service.load();
    await service.next();

    expect(service.state()?.status).toBe('completed');
    expect(service.isVisible()).toBe(false);
  });
});

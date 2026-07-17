import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanosComponent } from './planos.component';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import type { Plano } from '../../core/models/subscription.types';

const PLANO_MOCKS: Plano[] = [
  {
    id: 'plano-essencial-mensal',
    slug: 'essencial-mensal',
    nome: 'Essencial Mensal',
    descricao: 'Acesso aos treinos nacionais por 1 mês.',
    preco_centavos: 2490,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 0,
    tier: 'essencial',
  },
  {
    id: 'plano-essencial-semestral',
    slug: 'essencial-semestral',
    nome: 'Essencial Semestral',
    descricao: 'Acesso aos treinos nacionais por 6 meses.',
    preco_centavos: 11940,
    moeda: 'BRL',
    frequency: 6,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 1,
    tier: 'essencial',
  },
  {
    id: 'plano-avancado-mensal',
    slug: 'mensal',
    nome: 'Avançado Mensal',
    descricao: 'Acesso completo por 1 mês.',
    preco_centavos: 5990,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 2,
    tier: 'avancado',
  },
  {
    id: 'plano-avancado-semestral',
    slug: 'semestral',
    nome: 'Avançado Semestral',
    descricao: 'Melhor custo-benefício por 6 meses.',
    preco_centavos: 24000,
    moeda: 'BRL',
    frequency: 6,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 3,
    tier: 'avancado',
  },
];

describe('PlanosComponent', () => {
  let fixture: ComponentFixture<PlanosComponent>;
  let component: PlanosComponent;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanosComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'user-1', email: 'aluno@boramed.com' }),
            signOut: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ProfileService,
          useValue: {
            profile: signal(null),
            loadProfile: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            assinatura: signal(null),
            carregarAssinatura: vi.fn().mockResolvedValue(undefined),
            listarPlanos: vi.fn().mockResolvedValue(PLANO_MOCKS),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanosComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await component.ngOnInit();
    fixture.detectChanges();
  });

  it('define semestral como ciclo padrão', () => {
    expect(component.ciclo()).toBe('semestral');
  });

  it('agrupa os planos por tier respeitando o ciclo selecionado (semestral)', () => {
    expect(component.planoEssencial()?.slug).toBe('essencial-semestral');
    expect(component.planoAvancado()?.slug).toBe('semestral');
  });

  it('agrupa os planos por tier ao trocar o ciclo para mensal', () => {
    component.onCicloChange('mensal');

    expect(component.ciclo()).toBe('mensal');
    expect(component.planoEssencial()?.slug).toBe('essencial-mensal');
    expect(component.planoAvancado()?.slug).toBe('mensal');
  });

  it('onCicloChange trata qualquer valor diferente de "mensal" como semestral', () => {
    component.onCicloChange('mensal');
    expect(component.ciclo()).toBe('mensal');

    component.onCicloChange('valor-desconhecido');
    expect(component.ciclo()).toBe('semestral');
  });

  it('assinar() navega para /checkout/<slug> do plano escolhido (Essencial semestral)', () => {
    const essencial = component.planoEssencial();
    expect(essencial).not.toBeNull();

    component.assinar(essencial!);

    expect(router.navigate).toHaveBeenCalledWith(['/checkout', 'essencial-semestral']);
  });

  it('assinar() navega para /checkout/<slug> do plano Avançado mensal', () => {
    component.onCicloChange('mensal');
    const avancado = component.planoAvancado();
    expect(avancado).not.toBeNull();

    component.assinar(avancado!);

    expect(router.navigate).toHaveBeenCalledWith(['/checkout', 'mensal']);
  });

  it('exibe erro quando a lista de planos vem vazia', async () => {
    const subscription = TestBed.inject(SubscriptionService);
    vi.spyOn(subscription, 'listarPlanos').mockResolvedValue([]);

    const emptyFixture = TestBed.createComponent(PlanosComponent);
    await emptyFixture.componentInstance.ngOnInit();

    expect(emptyFixture.componentInstance.planoEssencial()).toBeNull();
    expect(emptyFixture.componentInstance.erro()).toContain('Não foi possível carregar os planos');
  });
});

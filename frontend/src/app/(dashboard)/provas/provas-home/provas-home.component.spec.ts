import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Tentativa } from '../../../core/models/tentativa';
import type { StatusAcesso } from '../../../core/models/subscription.types';
import { TentativaService } from '../../../core/services/tentativa.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ProvasHomeComponent } from './provas-home.component';

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tentativa-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'em_andamento',
    total_questoes: 20,
    total_respondidas: 7,
    acertos: 5,
    nota: null,
    iniciada_em: '2026-05-16T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 900,
    finalizada_em: null,
    criado_em: '2026-05-16T10:00:00Z',
    ...overrides,
  };
}

function statusFactory(overrides: Partial<StatusAcesso> = {}): StatusAcesso {
  return {
    nivel: 'avancado',
    tentativasLimite: 3,
    tentativasRestantes: null,
    tentativasUsadas: null,
    nacionalLimite: 2,
    nacionalRestantes: null,
    montadoLimite: 1,
    montadoRestantes: null,
    ...overrides,
  };
}

/** Status do gratuito que ainda não gastou nada: 2 nacionais + 1 montado. */
const STATUS_GRATUITO_INTEIRO = statusFactory({
  nivel: 'gratuito',
  tentativasRestantes: 3,
  tentativasUsadas: 0,
  nacionalRestantes: 2,
  montadoRestantes: 1,
});

describe('ProvasHomeComponent', () => {
  let fixture: ComponentFixture<ProvasHomeComponent>;
  let el: HTMLElement;
  const tentativaAtiva = signal<Tentativa | null>(null);
  let status: StatusAcesso;

  /** Roda o ngOnInit assíncrono e só então renderiza. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    tentativaAtiva.set(null);
    status = statusFactory();

    await TestBed.configureTestingModule({
      imports: [ProvasHomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: TentativaService,
          useValue: {
            tentativaAtiva,
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            statusAcessoServidor: () => Promise.resolve(status),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvasHomeComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  it('não exibe card de continuidade sem tentativa ativa', () => {
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Retome seu simulado');
  });

  it('exibe as duas opções principais de simulado', () => {
    fixture.detectChanges();

    expect(el.textContent).toContain('Treinos nacionais');
    expect(el.textContent).toContain('Montar simulado');
    expect(el.textContent).toContain('Escolha temas, quantidade e modo');
  });

  it('exibe card de continuidade com progresso da tentativa ativa', () => {
    tentativaAtiva.set(tentativaFactory({ status: 'pausada', total_respondidas: 12, total_questoes: 20 }));

    fixture.detectChanges();

    expect(el.textContent).toContain('Retome seu simulado');
    expect(el.textContent).toContain('12 de 20 questões respondidas · pausado');
    expect(el.textContent).toContain('Continuar');
  });

  it('libera montar simulado para o gratuito, com o saldo do crédito único', async () => {
    status = STATUS_GRATUITO_INTEIRO;

    await render();

    const card = cardMontar(el);
    expect(card.getAttribute('href')).toBe('/dashboard/simulados/montar');
    expect(card.textContent).toContain('1 grátis');
    expect(el.textContent).not.toContain('Disponível no plano Avançado');
  });

  it('manda o gratuito sem crédito para os planos, sem esconder o card', async () => {
    status = statusFactory({
      nivel: 'gratuito',
      tentativasRestantes: 2,
      tentativasUsadas: 1,
      nacionalRestantes: 2,
      montadoRestantes: 0,
    });

    await render();

    const card = cardMontar(el);
    expect(card.getAttribute('href')).toContain('/planos');
    expect(card.getAttribute('href')).toContain('origem=limite-tentativas');
    expect(card.textContent).toContain('Você já montou seu simulado grátis');
  });

  it('mantém montar simulado bloqueado no Essencial', async () => {
    status = statusFactory({ nivel: 'essencial' });

    await render();

    const card = cardMontar(el);
    expect(card.getAttribute('href')).toContain('/planos');
    expect(card.getAttribute('href')).toContain('origem=simulado-personalizado');
    expect(card.textContent).toContain('Disponível no plano Avançado');
  });

  it('mostra a quebra do saldo por balde no banner do gratuito', async () => {
    status = STATUS_GRATUITO_INTEIRO;

    await render();

    expect(el.textContent).toContain('Ainda dá para fazer 2 treinos nacionais e 1 simulado montado por você.');
  });
});

/** O card de montar é o segundo link de simulado do hub. */
function cardMontar(el: HTMLElement): HTMLAnchorElement {
  const card = Array.from(el.querySelectorAll('a')).find((a) =>
    a.textContent?.includes('Montar simulado'),
  );
  if (!card) throw new Error('card "Montar simulado" não encontrado');
  return card;
}

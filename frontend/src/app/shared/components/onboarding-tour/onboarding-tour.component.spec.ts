import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { OnboardingTourComponent } from './onboarding-tour.component';
import type { IOnboardingFlow } from '../../../core/models/onboarding.types';

const flow: IOnboardingFlow = {
  key: 'dashboard_intro',
  version: 1,
  titulo: 'Conheça o BoraMed',
  subtitulo: 'Um giro rápido.',
  steps: [
    {
      id: 'welcome',
      titulo: 'Bem-vindo',
      descricao: 'Conheça a plataforma.',
      target: null,
      placement: 'center',
      ctaLabel: 'Começar',
    },
    {
      id: 'final',
      titulo: 'Pronto',
      descricao: 'Agora escolha um treino.',
      target: null,
      ctaLabel: 'Escolher treino',
    },
  ],
};

describe('OnboardingTourComponent', () => {
  let fixture: ComponentFixture<OnboardingTourComponent>;
  let component: OnboardingTourComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingTourComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingTourComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('flow', flow);
    fixture.componentRef.setInput('activeStep', flow.steps[0]);
    fixture.componentRef.setInput('progressLabel', '1 de 2');
    fixture.componentRef.setInput('isVisible', true);
    fixture.detectChanges();
  });

  it('renderiza titulo, descricao e progresso do passo ativo', () => {
    expect(el.textContent).toContain('Bem-vindo');
    expect(el.textContent).toContain('Conheça a plataforma.');
    expect(el.textContent).toContain('1 de 2');
  });

  it('nao renderiza quando isVisible e false', () => {
    fixture.componentRef.setInput('isVisible', false);
    fixture.detectChanges();

    expect(el.querySelector('.onboarding-card')).toBeNull();
  });

  it('emite avancar ao clicar na acao primaria de passo comum', () => {
    const emitSpy = vi.spyOn(component.avancar, 'emit');

    el.querySelector<HTMLButtonElement>('.onboarding-primary')?.click();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('emite finalizar ao clicar na acao primaria do ultimo passo', () => {
    const emitSpy = vi.spyOn(component.finalizar, 'emit');
    fixture.componentRef.setInput('activeStep', flow.steps[1]);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.onboarding-primary')?.click();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('emite pular pelo botao secundario', () => {
    const emitSpy = vi.spyOn(component.pular, 'emit');

    el.querySelector<HTMLButtonElement>('.onboarding-link')?.click();

    expect(emitSpy).toHaveBeenCalled();
  });
});

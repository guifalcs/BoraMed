import type { Json } from '../types/database.types';

export type OnboardingStatus = 'not_started' | 'started' | 'completed' | 'skipped';
export type OnboardingPlacement = 'center' | 'sidebar' | 'bottom' | 'content';

export interface IOnboardingStep {
  id: string;
  titulo: string;
  descricao: string;
  target: string | null;
  placement: OnboardingPlacement;
  ctaLabel?: string;
  route?: string;
}

export interface IOnboardingFlow {
  key: string;
  version: number;
  titulo: string;
  subtitulo: string;
  steps: readonly IOnboardingStep[];
}

export interface IOnboardingState {
  userId: string;
  flowKey: string;
  flowVersion: number;
  status: OnboardingStatus;
  currentStep: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  metadata: Json;
  criadoEm: string;
  atualizadoEm: string;
}

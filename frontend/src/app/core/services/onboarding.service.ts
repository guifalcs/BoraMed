import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { IOnboardingFlow, IOnboardingState, IOnboardingStep, OnboardingStatus } from '../models/onboarding.types';
import type { Tables, TablesInsert } from '../types/database.types';

type OnboardingStateRow = Tables<'user_onboarding_state'>;

const DASHBOARD_ONBOARDING_FLOW: IOnboardingFlow = {
  key: 'dashboard_intro',
  version: 1,
  titulo: 'Conheça o BoraMed',
  subtitulo: 'Um giro rápido para você achar o melhor treino sem perder tempo.',
  steps: [
    {
      id: 'welcome',
      titulo: 'Seu treino no modelo Afya em um só lugar',
      descricao: 'Em menos de um minuto você entende onde começar, como acompanhar sua evolução e onde ajustar sua privacidade.',
      target: null,
      placement: 'center',
      ctaLabel: 'Conhecer o BoraMed',
    },
    {
      id: 'inicio',
      titulo: 'Comece pelo panorama do dia',
      descricao: 'O Início concentra progresso, recomendações, streak, desafio diário e sinais rápidos do que estudar agora.',
      target: 'inicio-hero',
      placement: 'content',
    },
    {
      id: 'simulados',
      titulo: 'Monte o treino principal',
      descricao: 'Em Simulados você acessa treinos nacionais autorais e cria práticas por tema, período e quantidade de questões.',
      target: 'nav-simulados',
      placement: 'sidebar',
    },
    {
      id: 'competitivo',
      titulo: 'Use competição como constância',
      descricao: 'O Competitivo mostra XP, ranking e desafio diário sem expor seu desempenho privado. A privacidade fica no Perfil.',
      target: 'nav-competitivo',
      placement: 'sidebar',
    },
    {
      id: 'historico',
      titulo: 'Revise pelo que os dados mostram',
      descricao: 'Histórico mostra notas, tentativas e temas fracos para transformar resultado em próximo treino.',
      target: 'nav-historico',
      placement: 'sidebar',
    },
    {
      id: 'perfil',
      titulo: 'Ajustes, privacidade e suporte',
      descricao: 'No menu do perfil ficam dados pessoais, privacidade competitiva, suporte e saída da conta.',
      target: 'profile-menu',
      placement: 'sidebar',
    },
    {
      id: 'final',
      titulo: 'Agora escolha seu primeiro treino',
      descricao: 'Abra Simulados e escolha o caminho que faz mais sentido: modelo nacional, personalizado por temas ou formatos em breve.',
      target: null,
      placement: 'center',
      ctaLabel: 'Escolher treino',
      route: '/dashboard/simulados',
    },
  ],
};

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _state = signal<IOnboardingState | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _isVisible = signal(false);
  private readonly _activeStepId = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);
  private loadedForUserId: string | null = null;

  readonly flow = DASHBOARD_ONBOARDING_FLOW;
  readonly state = this._state.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isVisible = this._isVisible.asReadonly();
  readonly error = this._error.asReadonly();

  readonly activeStep = computed(() => {
    const activeStepId = this._activeStepId();
    return this.flow.steps.find((step) => step.id === activeStepId) ?? null;
  });

  readonly activeIndex = computed(() => {
    const activeStep = this.activeStep();
    return activeStep ? this.flow.steps.findIndex((step) => step.id === activeStep.id) : -1;
  });

  readonly canGoBack = computed(() => this.activeIndex() > 0);
  readonly progressLabel = computed(() => {
    const index = this.activeIndex();
    return index >= 0 ? `${index + 1} de ${this.flow.steps.length}` : '';
  });

  async load(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    if (this.loadedForUserId === user.id && this._state()) return;

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase
        .from('user_onboarding_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('flow_key', this.flow.key)
        .eq('flow_version', this.flow.version)
        .maybeSingle();

      if (error) throw error;

      const state = data ? this.mapRowToState(data as OnboardingStateRow) : this.buildDefaultState(user.id);
      this.loadedForUserId = user.id;
      this.applyState(state);
    } catch {
      this._error.set('Não foi possível carregar o onboarding.');
      this._isVisible.set(false);
    } finally {
      this._isLoading.set(false);
    }
  }

  async start(): Promise<void> {
    await this.persist('started', this.stepAfter('welcome')?.id ?? this.flow.steps[0].id);
  }

  async skip(): Promise<void> {
    await this.persist('skipped', this.activeStep()?.id ?? null);
  }

  async complete(): Promise<void> {
    await this.persist('completed', this.activeStep()?.id ?? 'final');
  }

  async next(): Promise<void> {
    const current = this.activeStep();
    if (!current) return;

    if (current.id === 'welcome') {
      await this.start();
      return;
    }

    const nextStep = this.stepAfter(current.id);
    if (!nextStep) {
      await this.complete();
      return;
    }

    await this.persist('started', nextStep.id);
  }

  async previous(): Promise<void> {
    const current = this.activeStep();
    if (!current) return;

    const previousStep = this.stepBefore(current.id);
    if (!previousStep) return;

    await this.persist('started', previousStep.id);
  }

  open(): void {
    const state = this._state();
    if (!state || state.status === 'completed' || state.status === 'skipped') return;
    this._isVisible.set(true);
    this._activeStepId.set(state.currentStep ?? this.flow.steps[0].id);
  }

  async restart(): Promise<void> {
    const firstStep = this.flow.steps[0];
    await this.persist('started', firstStep.id, { resetTerminalDates: true });
  }

  private async persist(
    status: OnboardingStatus,
    currentStep: string | null,
    options: { resetTerminalDates?: boolean } = {},
  ): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const nextState = this.buildNextState(user.id, status, currentStep, options.resetTerminalDates ?? false);
    this.applyState(nextState);

    try {
      const { data, error } = await this.supabase
        .from('user_onboarding_state')
        .upsert(this.mapStateToPayload(nextState), { onConflict: 'user_id,flow_key,flow_version' })
        .select('*')
        .single();

      if (error) throw error;
      this.applyState(this.mapRowToState(data as OnboardingStateRow));
    } catch {
      this._error.set('Não foi possível salvar o onboarding.');
    }
  }

  private applyState(state: IOnboardingState): void {
    this._state.set(state);
    this._activeStepId.set(state.currentStep ?? this.flow.steps[0].id);
    this._isVisible.set(state.status !== 'completed' && state.status !== 'skipped');
  }

  private buildDefaultState(userId: string): IOnboardingState {
    const now = new Date().toISOString();
    return {
      userId,
      flowKey: this.flow.key,
      flowVersion: this.flow.version,
      status: 'not_started',
      currentStep: this.flow.steps[0].id,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      metadata: {},
      criadoEm: now,
      atualizadoEm: now,
    };
  }

  private buildNextState(
    userId: string,
    status: OnboardingStatus,
    currentStep: string | null,
    resetTerminalDates: boolean,
  ): IOnboardingState {
    const current = this._state() ?? this.buildDefaultState(userId);
    const now = new Date().toISOString();

    return {
      ...current,
      status,
      currentStep,
      startedAt: current.startedAt ?? (status === 'started' ? now : null),
      completedAt: status === 'completed' ? now : resetTerminalDates ? null : current.completedAt,
      skippedAt: status === 'skipped' ? now : resetTerminalDates ? null : current.skippedAt,
      atualizadoEm: now,
    };
  }

  private mapRowToState(row: OnboardingStateRow): IOnboardingState {
    return {
      userId: row.user_id,
      flowKey: row.flow_key,
      flowVersion: row.flow_version,
      status: row.status as OnboardingStatus,
      currentStep: row.current_step,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      skippedAt: row.skipped_at,
      metadata: row.metadata,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    };
  }

  private mapStateToPayload(state: IOnboardingState): TablesInsert<'user_onboarding_state'> {
    return {
      user_id: state.userId,
      flow_key: state.flowKey,
      flow_version: state.flowVersion,
      status: state.status,
      current_step: state.currentStep,
      started_at: state.startedAt,
      completed_at: state.completedAt,
      skipped_at: state.skippedAt,
      metadata: state.metadata,
    };
  }

  private stepAfter(stepId: string): OnboardingStepOrNull {
    const index = this.flow.steps.findIndex((step) => step.id === stepId);
    return index >= 0 ? this.flow.steps[index + 1] ?? null : null;
  }

  private stepBefore(stepId: string): OnboardingStepOrNull {
    const index = this.flow.steps.findIndex((step) => step.id === stepId);
    return index > 0 ? this.flow.steps[index - 1] ?? null : null;
  }
}

type OnboardingStepOrNull = IOnboardingStep | null;

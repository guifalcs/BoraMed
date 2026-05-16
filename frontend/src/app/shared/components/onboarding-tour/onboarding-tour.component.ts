import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser, NgStyle } from '@angular/common';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { IOnboardingFlow, IOnboardingStep } from '../../../core/models/onboarding.types';

interface IOverlayBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ICardPosition {
  top: number | null;
  left: number | null;
}

@Component({
  selector: 'app-onboarding-tour',
  standalone: true,
  imports: [NgStyle, UiIconComponent],
  templateUrl: './onboarding-tour.component.html',
  styleUrl: './onboarding-tour.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingTourComponent {
  flow = input.required<IOnboardingFlow>();
  activeStep = input<IOnboardingStep | null>(null);
  progressLabel = input('');
  canGoBack = input(false);
  isVisible = input(false);

  avancar = output<void>();
  voltar = output<void>();
  pular = output<void>();
  finalizar = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly targetBox = signal<IOverlayBox | null>(null);
  protected readonly isMobile = signal(false);

  protected readonly closeIcon = X;
  protected readonly backIcon = ArrowLeft;
  protected readonly nextIcon = ArrowRight;
  protected readonly doneIcon = CheckCircle2;
  protected readonly sparklesIcon = Sparkles;

  protected readonly isCenterStep = computed(() => this.activeStep()?.target === null);
  protected readonly hasTarget = computed(() => this.targetBox() !== null && !this.isCenterStep());
  protected readonly primaryLabel = computed(() => {
    const step = this.activeStep();
    if (!step) return 'Avançar';
    if (step.ctaLabel) return step.ctaLabel;
    return 'Avançar';
  });

  protected readonly cardPosition = computed<ICardPosition>(() => {
    const box = this.targetBox();
    const step = this.activeStep();
    if (!this.isBrowser || this.isMobile() || !box || !step?.target) {
      return { top: null, left: null };
    }

    const cardWidth = 392;
    const gutter = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredLeft = step.placement === 'sidebar'
      ? box.left + box.width + gutter
      : box.left;
    const left = Math.min(Math.max(gutter, preferredLeft), viewportWidth - cardWidth - gutter);
    const top = Math.min(Math.max(gutter, box.top + box.height / 2 - 132), viewportHeight - 280);

    return { top, left };
  });

  protected readonly cardStyle = computed(() => {
    const position = this.cardPosition();
    if (position.top === null || position.left === null) return {};
    return {
      top: `${position.top}px`,
      left: `${position.left}px`,
    };
  });

  protected readonly spotlightStyle = computed(() => {
    const box = this.targetBox();
    if (!box) return {};
    return {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    };
  });

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => this.updateLayout());
      effect(() => {
        this.isVisible();
        this.activeStep();
        window.requestAnimationFrame(() => this.updateLayout());
      });
    }
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.updateLayout();
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    this.updateLayout();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isVisible()) this.pular.emit();
  }

  @HostListener('document:keydown.arrowright')
  protected onArrowRight(): void {
    if (this.isVisible()) this.handlePrimaryAction();
  }

  @HostListener('document:keydown.arrowleft')
  protected onArrowLeft(): void {
    if (this.isVisible() && this.canGoBack()) this.voltar.emit();
  }

  protected handlePrimaryAction(): void {
    const step = this.activeStep();
    if (step?.id === 'final') {
      this.finalizar.emit();
      return;
    }
    this.avancar.emit();
  }

  private updateLayout(): void {
    if (!this.isBrowser) return;

    this.isMobile.set(window.innerWidth < 768);
    const step = this.activeStep();
    if (!this.isVisible() || !step?.target) {
      this.targetBox.set(null);
      return;
    }

    const targets = Array.from(
      this.document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${step.target}"]`),
    );
    const target = targets.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null;
    if (!target) {
      this.targetBox.set(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    this.targetBox.set({
      top: Math.max(8, rect.top - 6),
      left: Math.max(8, rect.left - 6),
      width: rect.width + 12,
      height: rect.height + 12,
    });
  }
}

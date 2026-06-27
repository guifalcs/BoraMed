import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  BookOpen,
  Brain,
  FileText,
  FlaskConical,
  Heart,
  Microscope,
  LucideIconData,
  ArrowRight,
} from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { MaterialCategoria } from '../../../core/models/material';

const ICON_MAP: Record<string, LucideIconData> = {
  BookOpen,
  Brain,
  FileText,
  FlaskConical,
  Heart,
  Microscope,
};

const RADIAL_HIGHLIGHTS =
  'radial-gradient(circle at 82% 22%, rgba(255,255,255,0.18), transparent 26%), radial-gradient(circle at 18% 80%, rgba(13,148,136,0.20), transparent 28%)';

@Component({
  selector: 'app-material-card',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="group relative w-full overflow-hidden rounded-2xl p-6 text-left shadow-md transition-all hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
      [style.background]="categoria().gradiente"
      (click)="abrir.emit(categoria())"
    >
      <div
        class="pointer-events-none absolute inset-0"
        [style.background]="radialHighlights"
      ></div>

      <div class="relative flex flex-col gap-4">
        <div class="flex items-start justify-between">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm">
            <app-ui-icon [icon]="icone()" [size]="24" />
          </div>
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm transition-transform group-hover:translate-x-1">
            <app-ui-icon [icon]="arrowIcon" [size]="18" />
          </span>
        </div>

        <div class="min-w-0">
          <h3 class="text-lg font-bold leading-tight text-white">{{ categoria().titulo }}</h3>
          @if (categoria().descricao) {
            <p class="mt-1 text-sm leading-relaxed text-white/75">{{ categoria().descricao }}</p>
          }
        </div>
      </div>
    </button>
  `,
})
export class MaterialCardComponent {
  categoria = input.required<MaterialCategoria>();
  abrir = output<MaterialCategoria>();

  protected readonly arrowIcon = ArrowRight;
  protected readonly radialHighlights = RADIAL_HIGHLIGHTS;

  protected readonly icone = computed(
    () => ICON_MAP[this.categoria().icone] ?? BookOpen,
  );
}

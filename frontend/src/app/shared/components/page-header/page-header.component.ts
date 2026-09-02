import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChevronRight, LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

export interface Breadcrumb {
  label: string;
  route?: string;
}

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  template: `
    <div class="page-header">
      @if (breadcrumbs().length > 0) {
        <nav class="breadcrumbs" aria-label="Navegação de contexto">
          @for (crumb of breadcrumbs(); track crumb.label; let last = $last) {
            @if (crumb.route) {
              <a [routerLink]="crumb.route" class="breadcrumb-link">{{ crumb.label }}</a>
            } @else {
              <span class="breadcrumb-current" [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
            }
            @if (!last) {
              <app-ui-icon [icon]="chevronIcon" [size]="14" class="breadcrumb-separator" />
            }
          }
        </nav>
      }
      <div class="page-header-title-row">
        <h1 class="page-title">{{ titulo() }}</h1>
        @if (subtitulo()) {
          <p class="page-subtitle">{{ subtitulo() }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      margin-bottom: 1.5rem;
    }
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.375rem;
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }
    .breadcrumb-link {
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.13s;
    }
    .breadcrumb-link:hover {
      color: var(--color-primary-dark);
      text-decoration: underline;
    }
    .breadcrumb-current {
      color: var(--color-text-muted);
      font-weight: 500;
    }
    .breadcrumb-separator {
      color: var(--color-text-muted);
      opacity: 0.5;
    }
    .page-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      line-height: 1.3;
    }
    .page-subtitle {
      margin-top: 0.25rem;
      font-size: 0.875rem;
      color: var(--color-text-muted);
      line-height: 1.4;
    }
    /* No mobile o título + breadcrumb já dão o contexto: o subtítulo só empurra
       o conteúdo para baixo. Sai do fluxo visual, mas segue no leitor de tela. */
    @media (max-width: 639px) {
      .page-subtitle {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string | null>(null);
  readonly breadcrumbs = input<Breadcrumb[]>([]);
  protected readonly chevronIcon: LucideIconData = ChevronRight;
}

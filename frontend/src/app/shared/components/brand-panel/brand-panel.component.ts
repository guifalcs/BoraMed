import {
  ChangeDetectionStrategy, Component, ElementRef,
  afterNextRender, input, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';

@Component({
  selector: 'app-brand-panel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './brand-panel.component.html',
  styleUrls: ['./brand-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandPanelComponent {
  kicker = input.required<string>();
  titulo = input.required<string>();
  descricao = input.required<string>();
  showMetrics = input(false);

  private polocaRef = viewChild<ElementRef<HTMLElement>>('poloca');

  constructor() {
    afterNextRender(() => {
      const el = this.polocaRef()?.nativeElement;
      if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.fromTo(el,
        { opacity: 0, y: 32, scale: 0.88 },
        { opacity: 1, y: 0, scale: 1, duration: 1, ease: 'power3.out', delay: 0.4 },
      );
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

export type UiAvatarSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-ui-avatar',
  standalone: true,
  templateUrl: './ui-avatar.component.html',
  styleUrl: './ui-avatar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiAvatarComponent {
  avatarUrl = input<string | null>(null);
  name = input.required<string>();
  size = input<UiAvatarSize>('md');

  protected readonly imageError = signal(false);

  protected readonly initials = computed(() => {
    const tokens = this.name()
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    return tokens
      .slice(0, 2)
      .map((t) => t[0].toUpperCase())
      .join('');
  });

  protected readonly showImage = computed(() => {
    return this.avatarUrl() !== null && !this.imageError();
  });

  constructor() {
    effect(() => {
      // Reset error state whenever avatarUrl changes
      const _url = this.avatarUrl();
      void _url;
      this.imageError.set(false);
    });
  }

  protected handleImageError(): void {
    this.imageError.set(true);
  }
}

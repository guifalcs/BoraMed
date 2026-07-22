import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { Check, ChevronDown, LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../icon/ui-icon.component';

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  /** Cabeçalho de agrupamento no dropdown (ex: "1º período"). Opções consecutivas com o mesmo grupo ficam sob o mesmo cabeçalho. */
  group?: string;
}

@Component({
  selector: 'app-ui-select',
  standalone: true,
  imports: [UiIconComponent, NgStyle],
  templateUrl: './ui-select.component.html',
  styleUrl: './ui-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSelectComponent {
  label = input.required<string>();
  name = input.required<string>();
  options = input.required<SelectOption[]>();
  value = input<string | number | null>(null);
  placeholder = input('Selecione...');
  error = input<string | null>(null);
  helperText = input<string | null>(null);
  required = input(false);
  disabled = input(false);

  valueChange = output<string | number | null>();

  protected readonly chevronDownIcon: LucideIconData = ChevronDown;
  protected readonly checkIcon: LucideIconData = Check;
  protected readonly isOpen = signal(false);
  protected readonly dropdownStyles = signal<Record<string, string>>({});

  protected readonly selectedLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? null,
  );

  constructor(private readonly el: ElementRef) {}

  @HostListener('window:scroll')
  @HostListener('window:resize')
  protected onViewportChange(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (!this.isOpen()) {
      const trigger = (this.el.nativeElement as HTMLElement).querySelector(
        '.ui-select__trigger',
      ) as HTMLElement;
      const rect = trigger.getBoundingClientRect();
      this.dropdownStyles.set({
        position: 'fixed',
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        right: 'auto',
      });
    }
    this.isOpen.update((v) => !v);
  }

  protected select(option: SelectOption): void {
    this.valueChange.emit(option.value);
    this.isOpen.set(false);
  }

  protected handleKeydown(event: KeyboardEvent): void {
    const opts = this.options();
    const idx = opts.findIndex((o) => o.value === this.value());

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.isOpen.update((v) => !v);
        break;
      case 'Escape':
        event.preventDefault();
        this.isOpen.set(false);
        break;
      case 'ArrowDown': {
        event.preventDefault();
        if (!this.isOpen()) { this.isOpen.set(true); return; }
        const next = opts[(idx + 1) % opts.length];
        if (next) this.valueChange.emit(next.value);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.isOpen()) { this.isOpen.set(true); return; }
        const prev = opts[(idx - 1 + opts.length) % opts.length];
        if (prev) this.valueChange.emit(prev.value);
        break;
      }
    }
  }
}

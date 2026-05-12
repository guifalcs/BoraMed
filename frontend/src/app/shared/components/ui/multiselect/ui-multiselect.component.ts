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
import type { SelectOption } from '../select/ui-select.component';

@Component({
  selector: 'app-ui-multiselect',
  standalone: true,
  imports: [UiIconComponent, NgStyle],
  templateUrl: './ui-multiselect.component.html',
  styleUrl: './ui-multiselect.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMultiselectComponent {
  label = input.required<string>();
  name = input.required<string>();
  options = input.required<SelectOption[]>();
  values = input<(string | number)[]>([]);
  placeholder = input('Todos');
  error = input<string | null>(null);
  disabled = input(false);

  valuesChange = output<(string | number)[]>();

  protected readonly chevronDownIcon: LucideIconData = ChevronDown;
  protected readonly checkIcon: LucideIconData = Check;
  protected readonly isOpen = signal(false);
  protected readonly dropdownStyles = signal<Record<string, string>>({});

  protected readonly triggerLabel = computed(() => {
    const selected = this.values();
    if (selected.length === 0) return null;
    if (selected.length === 1) {
      return this.options().find((o) => o.value === selected[0])?.label ?? null;
    }
    return `${selected.length} selecionados`;
  });

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

  protected isSelected(value: string | number): boolean {
    return this.values().includes(value);
  }

  protected toggleOption(value: string | number): void {
    const current = this.values();
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.valuesChange.emit(next);
  }

  protected handleKeydown(event: KeyboardEvent): void {
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
    }
  }
}

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
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.handleTypeahead(event.key);
        }
    }
  }

  // Busca por teclado (como o <select> nativo): digitar "i" pula pra primeira
  // opção que começa com "i"; repetir a mesma tecla cicla entre as opções
  // daquela letra; digitar letras diferentes em sequência refina a busca.
  private typeaheadQuery = '';
  private typeaheadResetTimer: ReturnType<typeof setTimeout> | null = null;

  private static normalizeForSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private matchesFor(searchTerm: string): SelectOption[] {
    return this.options().filter((o) => UiSelectComponent.normalizeForSearch(o.label).startsWith(searchTerm));
  }

  private handleTypeahead(key: string): void {
    if (this.typeaheadResetTimer) clearTimeout(this.typeaheadResetTimer);
    this.typeaheadResetTimer = setTimeout(() => { this.typeaheadQuery = ''; }, 700);

    const lowerKey = key.toLowerCase();
    this.typeaheadQuery += lowerKey;

    // Se todas as teclas digitadas até agora forem iguais (ex.: "iii"), o
    // usuário está ciclando pelas opções daquela letra — como no <select>
    // nativo — em vez de refinar uma busca por várias letras.
    const isSingleRepeatedChar = [...this.typeaheadQuery].every((c) => c === this.typeaheadQuery[0]);
    let searchTerm = UiSelectComponent.normalizeForSearch(isSingleRepeatedChar ? this.typeaheadQuery[0] : this.typeaheadQuery);
    let matches = this.matchesFor(searchTerm);

    // Nenhuma opção bate com o buffer acumulado (ex.: "sa" seguido de "l" já
    // funcionava, mas "sax"): recomeça a busca só com a tecla atual.
    if (matches.length === 0) {
      this.typeaheadQuery = lowerKey;
      searchTerm = UiSelectComponent.normalizeForSearch(lowerKey);
      matches = this.matchesFor(searchTerm);
      if (matches.length === 0) return;
    }

    if (isSingleRepeatedChar) {
      const currentIdx = matches.findIndex((o) => o.value === this.value());
      this.valueChange.emit(matches[(currentIdx + 1) % matches.length].value);
    } else {
      this.valueChange.emit(matches[0].value);
    }
  }
}

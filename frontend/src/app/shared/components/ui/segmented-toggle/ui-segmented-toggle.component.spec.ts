import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { UiSegmentedToggleComponent, SegmentedToggleOption } from './ui-segmented-toggle.component';

const OPTIONS: SegmentedToggleOption[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'semestral', label: 'Semestral', badge: '-33%' },
];

function getOptions(el: HTMLElement): NodeListOf<HTMLButtonElement> {
  return el.querySelectorAll('.ui-segmented__option');
}

describe('UiSegmentedToggleComponent', () => {
  let fixture: ComponentFixture<UiSegmentedToggleComponent>;
  let component: UiSegmentedToggleComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSegmentedToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSegmentedToggleComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;

    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('value', 'mensal');
    fixture.detectChanges();
  });

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  it('renderiza um botão por opção', () => {
    expect(getOptions(el).length).toBe(2);
  });

  it('marca a opção selecionada com aria-checked', () => {
    const opts = getOptions(el);
    expect(opts[0].getAttribute('aria-checked')).toBe('true');
    expect(opts[1].getAttribute('aria-checked')).toBe('false');
  });

  it('emite valueChange ao clicar em outra opção', () => {
    let emitted: string | null = null;
    component.valueChange.subscribe((v) => (emitted = v));

    getOptions(el)[1].click();
    fixture.detectChanges();

    expect(emitted).toBe('semestral');
  });

  it('não emite ao clicar na opção já selecionada', () => {
    let emitted: string | null = null;
    component.valueChange.subscribe((v) => (emitted = v));

    getOptions(el)[0].click();
    fixture.detectChanges();

    expect(emitted).toBeNull();
  });

  it('não emite quando disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    let emitted: string | null = null;
    component.valueChange.subscribe((v) => (emitted = v));

    getOptions(el)[1].click();
    fixture.detectChanges();

    expect(emitted).toBeNull();
  });

  it('exibe o badge da opção quando informado', () => {
    expect(getOptions(el)[1].querySelector('.ui-segmented__badge')?.textContent).toContain('-33%');
  });
});

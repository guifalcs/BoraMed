import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { UiSelectComponent, SelectOption } from './ui-select.component';

const OPTIONS: SelectOption[] = [
  { value: 'a', label: 'Opção A' },
  { value: 'b', label: 'Opção B' },
  { value: 'c', label: 'Opção C' },
];

function getTrigger(el: HTMLElement): HTMLButtonElement {
  return el.querySelector('.ui-select__trigger')!;
}

function getDropdown(el: HTMLElement): HTMLElement | null {
  return el.querySelector('.ui-select__dropdown');
}

function getOptions(el: HTMLElement): NodeListOf<HTMLElement> {
  return el.querySelectorAll('.ui-select__option');
}

describe('UiSelectComponent', () => {
  let fixture: ComponentFixture<UiSelectComponent>;
  let component: UiSelectComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSelectComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSelectComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;

    fixture.componentRef.setInput('label', 'Tipo');
    fixture.componentRef.setInput('name', 'tipo');
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.detectChanges();
  });

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  it('começa com dropdown fechado', () => {
    expect(getDropdown(el)).toBeNull();
  });

  it('abre o dropdown ao clicar no trigger', () => {
    getTrigger(el).click();
    fixture.detectChanges();
    expect(getDropdown(el)).toBeTruthy();
  });

  it('fecha o dropdown ao clicar novamente no trigger', () => {
    getTrigger(el).click();
    fixture.detectChanges();
    getTrigger(el).click();
    fixture.detectChanges();
    expect(getDropdown(el)).toBeNull();
  });

  it('fecha o dropdown e emite o valor ao selecionar uma opção', () => {
    getTrigger(el).click();
    fixture.detectChanges();

    let emitted: string | number | null = null;
    component.valueChange.subscribe((v) => (emitted = v));

    getOptions(el)[1].click(); // Opção B
    fixture.detectChanges();

    expect(emitted).toBe('b');
    expect(getDropdown(el)).toBeNull();
  });

  it('exibe o placeholder quando nenhum valor está selecionado', () => {
    fixture.componentRef.setInput('placeholder', 'Selecione um tipo');
    fixture.detectChanges();
    expect(getTrigger(el).textContent).toContain('Selecione um tipo');
  });

  it('exibe o label da opção selecionada', () => {
    fixture.componentRef.setInput('value', 'c');
    fixture.detectChanges();
    expect(getTrigger(el).textContent).toContain('Opção C');
  });

  it('mostra o asterisco quando required é true', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(el.querySelector('.ui-field__required')).toBeTruthy();
  });

  it('não mostra o asterisco quando required é false', () => {
    expect(el.querySelector('.ui-field__required')).toBeNull();
  });

  it('exibe a mensagem de erro quando error está preenchido', () => {
    fixture.componentRef.setInput('error', 'Campo obrigatório');
    fixture.detectChanges();
    expect(el.querySelector('.ui-field__error')?.textContent).toContain('Campo obrigatório');
  });

  it('não abre o dropdown quando disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    getTrigger(el).click();
    fixture.detectChanges();
    expect(getDropdown(el)).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UiSelectComponent, SelectOption } from './ui-select.component';

const OPTIONS: SelectOption[] = [
  { value: 'a', label: 'Opção A' },
  { value: 'b', label: 'Opção B' },
  { value: 'c', label: 'Opção C' },
];

const CIDADES: SelectOption[] = [
  { value: 'itabuna_ba', label: 'Itabuna (BA)' },
  { value: 'itajuba_mg', label: 'Itajubá (MG)' },
  { value: 'itacoatiara_am', label: 'Itacoatiara (AM)' },
  { value: 'salvador_ba', label: 'Salvador (BA)' },
];

function keydown(el: HTMLElement, key: string): void {
  const trigger = el.querySelector('.ui-select__trigger')!;
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

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

  describe('busca por teclado (typeahead)', () => {
    let emitted: (string | number | null)[];

    beforeEach(() => {
      fixture.componentRef.setInput('options', CIDADES);
      fixture.detectChanges();
      emitted = [];
      component.valueChange.subscribe((v) => emitted.push(v));
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('pula pra primeira opção que começa com a letra digitada', () => {
      keydown(el, 'i');
      expect(emitted).toEqual(['itabuna_ba']);
    });

    it('ignora acentos ao comparar', () => {
      keydown(el, 's');
      expect(emitted).toEqual(['salvador_ba']);
    });

    it('repetir a mesma tecla cicla entre as opções daquela letra', () => {
      keydown(el, 'i');
      fixture.componentRef.setInput('value', emitted[0]);
      fixture.detectChanges();
      keydown(el, 'i');
      fixture.componentRef.setInput('value', emitted[1]);
      fixture.detectChanges();
      keydown(el, 'i');

      expect(emitted).toEqual(['itabuna_ba', 'itajuba_mg', 'itacoatiara_am']);
    });

    it('digitar letras diferentes em sequência refina a busca', () => {
      keydown(el, 'i');
      keydown(el, 't');
      keydown(el, 'a');

      expect(emitted).toEqual(['itabuna_ba', 'itabuna_ba', 'itabuna_ba']);
    });

    it('não faz nada quando nenhuma opção bate com a busca', () => {
      keydown(el, 'z');
      expect(emitted).toEqual([]);
    });

    it('reseta a busca após o timeout de inatividade', () => {
      keydown(el, 'i');
      vi.advanceTimersByTime(701);
      keydown(el, 's');

      expect(emitted).toEqual(['itabuna_ba', 'salvador_ba']);
    });
  });
});

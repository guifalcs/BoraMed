import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BoraMedTitleStrategy, DEFAULT_TITLE } from './title.strategy';

@Component({ template: '' })
class VaziaComponent {}

/** Imita uma página pública: define o próprio título via SeoService. */
@Component({ template: '' })
class SeoProprioComponent {
  constructor() {
    inject(Title).setTitle('Entrar | BoraMed');
  }
}

describe('BoraMedTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', data: { seoTitle: true }, component: SeoProprioComponent },
          { path: 'dashboard', title: 'Início', component: VaziaComponent },
          { path: 'sem-titulo', component: VaziaComponent },
          { path: 'com-marca', title: 'BoraMed é grátis', component: VaziaComponent },
        ]),
        { provide: TitleStrategy, useClass: BoraMedTitleStrategy },
      ],
    });
  });

  it('aplica o sufixo da marca ao título da rota', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');

    expect(TestBed.inject(Title).getTitle()).toBe('Início | BoraMed');
  });

  it('troca o título ao sair de uma página com SEO próprio', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    expect(TestBed.inject(Title).getTitle()).toBe('Entrar | BoraMed');

    await harness.navigateByUrl('/dashboard');
    expect(TestBed.inject(Title).getTitle()).toBe('Início | BoraMed');
  });

  it('preserva o título definido pelas páginas com SEO próprio', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');
    await harness.navigateByUrl('/login');

    expect(TestBed.inject(Title).getTitle()).toBe('Entrar | BoraMed');
  });

  it('cai no título institucional quando a rota não declara título', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');
    await harness.navigateByUrl('/sem-titulo');

    expect(TestBed.inject(Title).getTitle()).toBe(DEFAULT_TITLE);
  });

  it('não duplica a marca em títulos que já a contêm', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/com-marca');

    expect(TestBed.inject(Title).getTitle()).toBe('BoraMed é grátis');
  });
});

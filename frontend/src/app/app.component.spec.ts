import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    // `detectChanges()` em vez de `whenStable()`: o <router-outlet> é estático
    // no template, então basta uma passada de change detection. Aguardar
    // estabilidade prendia o teste no carregamento assíncrono do Vercel
    // Analytics (afterNextRender → rede), estourando o timeout de 5s no CI.
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});

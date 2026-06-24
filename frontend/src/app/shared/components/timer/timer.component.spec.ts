import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TimerComponent } from './timer.component';

describe('TimerComponent', () => {
  let fixture: ComponentFixture<TimerComponent>;

  async function setup(seconds: number, warnAt = 300, dangerAt = 60, countdown = true) {
    await TestBed.configureTestingModule({
      imports: [TimerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TimerComponent);
    fixture.componentRef.setInput('seconds', seconds);
    fixture.componentRef.setInput('countdown', countdown);
    fixture.componentRef.setInput('warnAt', warnAt);
    fixture.componentRef.setInput('dangerAt', dangerAt);
    fixture.detectChanges();
  }

  it('deve formatar segundos como mm:ss', async () => {
    await setup(125);
    expect(fixture.nativeElement.textContent).toContain('02:05');
  });

  it('deve formatar com horas quando >= 3600', async () => {
    await setup(3661);
    expect(fixture.nativeElement.textContent).toContain('1:01:01');
  });

  it('deve aplicar classe de danger quando abaixo do limiar', async () => {
    await setup(30, 300, 60);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('color-danger');
  });

  it('deve aplicar classe de warning quando abaixo de warnAt', async () => {
    await setup(200, 300, 60);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('color-warning');
  });

  it('deve aplicar classe neutra quando acima dos limiares', async () => {
    await setup(500, 300, 60);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('color-text-muted');
  });

  it('deve ser sempre neutro em contagem crescente (countdown=false)', async () => {
    await setup(30, 300, 60, false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('color-text-muted');
    expect(el.innerHTML).not.toContain('color-danger');
    expect(el.innerHTML).not.toContain('animate-pulse');
  });
});

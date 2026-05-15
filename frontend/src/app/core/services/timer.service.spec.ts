import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TimerService } from './timer.service';

describe('TimerService', () => {
  let service: TimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [TimerService],
    });
    service = TestBed.inject(TimerService);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('deve iniciar com 0 segundos', () => {
    expect(service.seconds()).toBe(0);
  });

  it('deve iniciar com valor personalizado', () => {
    service.start(120);
    expect(service.seconds()).toBe(120);
  });

  it('deve incrementar a cada segundo', () => {
    service.start(0);
    vi.advanceTimersByTime(3000);
    expect(service.seconds()).toBe(3);
  });

  it('deve pausar o timer', () => {
    service.start(0);
    vi.advanceTimersByTime(2000);
    service.pause();
    vi.advanceTimersByTime(3000);
    expect(service.seconds()).toBe(2);
  });

  it('deve retomar o timer após pausar', () => {
    service.start(0);
    vi.advanceTimersByTime(2000);
    service.pause();
    vi.advanceTimersByTime(5000);
    service.resume();
    vi.advanceTimersByTime(3000);
    expect(service.seconds()).toBe(5);
  });

  it('deve parar e resetar para 0', () => {
    service.start(50);
    vi.advanceTimersByTime(5000);
    service.stop();
    expect(service.seconds()).toBe(0);
  });

  it('resume não deve duplicar o interval', () => {
    service.start(0);
    service.resume();
    vi.advanceTimersByTime(2000);
    expect(service.seconds()).toBe(2);
  });

  describe('formatted', () => {
    it('deve formatar minutos e segundos', () => {
      service.start(65);
      expect(service.formatted()).toBe('01:05');
    });

    it('deve formatar com horas quando >= 3600', () => {
      service.start(3661);
      expect(service.formatted()).toBe('1:01:01');
    });

    it('deve formatar zero como 00:00', () => {
      expect(service.formatted()).toBe('00:00');
    });
  });
});

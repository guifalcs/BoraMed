import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new NotificationService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve iniciar sem notificações', () => {
    expect(service.notifications()).toEqual([]);
  });

  it('deve adicionar notificação de sucesso', () => {
    service.success('Salvo com sucesso');
    expect(service.notifications()).toHaveLength(1);
    expect(service.notifications()[0].type).toBe('success');
    expect(service.notifications()[0].message).toBe('Salvo com sucesso');
  });

  it('deve adicionar notificação de warning', () => {
    service.warning('Atenção');
    expect(service.notifications()[0].type).toBe('warning');
  });

  it('deve adicionar notificação de erro', () => {
    service.error('Falha ao salvar');
    expect(service.notifications()[0].type).toBe('error');
  });

  it('deve remover notificação por id', () => {
    service.success('Teste');
    const id = service.notifications()[0].id;
    service.dismiss(id);
    expect(service.notifications()).toHaveLength(0);
  });

  it('deve auto-remover após 4500ms', () => {
    service.success('Temporária');
    expect(service.notifications()).toHaveLength(1);
    vi.advanceTimersByTime(4500);
    expect(service.notifications()).toHaveLength(0);
  });

  it('deve suportar múltiplas notificações simultâneas', () => {
    service.success('A');
    service.error('B');
    service.warning('C');
    expect(service.notifications()).toHaveLength(3);
  });

  it('deve gerar ids únicos', () => {
    service.success('A');
    service.success('B');
    const ids = service.notifications().map((n) => n.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

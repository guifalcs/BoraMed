import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { sairSemSalvarGuard, type SaidaProtegida } from './sair-sem-salvar.guard';

describe('sairSemSalvarGuard', () => {
  const rota = {} as ActivatedRouteSnapshot;
  const estado = {} as RouterStateSnapshot;

  it('delega a decisão para o componente', () => {
    const bloqueia: SaidaProtegida = { podeSair: () => false };
    const libera: SaidaProtegida = { podeSair: () => true };
    expect(sairSemSalvarGuard(bloqueia, rota, estado, estado)).toBe(false);
    expect(sairSemSalvarGuard(libera, rota, estado, estado)).toBe(true);
  });

  it('libera quando não há componente (rota ainda não montada)', () => {
    expect(sairSemSalvarGuard(null as unknown as SaidaProtegida, rota, estado, estado)).toBe(true);
  });
});

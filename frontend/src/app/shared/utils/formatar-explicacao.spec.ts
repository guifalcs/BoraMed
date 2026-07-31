import { formatarExplicacao } from './formatar-explicacao';

describe('formatarExplicacao', () => {
  it('retorna string vazia para valores nulos/vazios', () => {
    expect(formatarExplicacao(null)).toBe('');
    expect(formatarExplicacao(undefined)).toBe('');
    expect(formatarExplicacao('')).toBe('');
  });

  it('separa o rótulo "Distratores:" do texto que vem antes e depois', () => {
    const entrada =
      'A laparotomia exploradora é a intervenção indicada. ' +
      'Distratores: A reavaliação clínica em 24 horas pode ser apropriada em casos leves.';
    const saida = formatarExplicacao(entrada);

    expect(saida).toContain('indicada.\n\nDistratores:\n\n');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('separa o comentário de cada alternativa pela letra', () => {
    const entrada =
      'A alternativa D está incorreta pois não considera a via de administração. ' +
      'A alternativa C está correta porque respeita a diretiva do paciente.';
    const saida = formatarExplicacao(entrada);

    expect(saida).toContain('\n\nA alternativa C está correta');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('separa o prefixo "incorreta -"/"correta -" de cada distrator', () => {
    const entrada =
      'incorreta - Leucemia Mieloide Aguda (LMA) - geralmente acomete adultos. ' +
      'incorreta - Leucemia Mieloide Crônica (LMC) - é mais comum em adultos.';
    const saida = formatarExplicacao(entrada);

    expect(saida).toContain('\n\nincorreta - Leucemia Mieloide Crônica');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('quebra uma enumeração romana de assertivas (I/II/III/IV)', () => {
    const entrada =
      'Analise as assertivas: I. Incorreta, a fase inicial tem neutrófilos. II. Correta, os mediadores atuam nas fases iniciais. ' +
      'III. Incorreta, predominam macrófagos. IV. Correta, os fibroblastos atuam no reparo.';
    const saida = formatarExplicacao(entrada);

    expect(saida).toContain('\n\nI. Incorreta');
    expect(saida).toContain('\n\nII. Correta');
    expect(saida).toContain('\n\nIII. Incorreta');
    expect(saida).toContain('\n\nIV. Correta');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('não altera nenhum conteúdo textual, apenas o espaçamento', () => {
    const entrada =
      'Resposta correta: fundamento A. Distratores: fundamento B fundamento C.';
    const saida = formatarExplicacao(entrada);
    const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(semEspacos(saida)).toBe(semEspacos(entrada));
  });

  it('deixa texto de prosa livre sem marcador reconhecível intacto', () => {
    const entrada =
      'O diagnóstico mais provável é insuficiência adrenal primária, dado o quadro de hiperpigmentação e hipotensão.';
    expect(formatarExplicacao(entrada)).toBe(entrada);
  });
});

import { formatarEnunciado } from './formatar-enunciado';

describe('formatarEnunciado', () => {
  it('retorna string vazia para valores nulos/vazios', () => {
    expect(formatarEnunciado(null)).toBe('');
    expect(formatarEnunciado(undefined)).toBe('');
    expect(formatarEnunciado('')).toBe('');
  });

  it('quebra uma enumeração de assertivas romanas em parágrafos', () => {
    const entrada =
      'apenas as assertivas: I. Grupo focal é uma técnica. II. Entrevista observa. III. Observação participante interage. IV. Observação não participante pergunta.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI. Grupo focal');
    expect(saida).toContain('\n\nII. Entrevista');
    expect(saida).toContain('\n\nIII. Observação participante');
    expect(saida).toContain('\n\nIV. Observação não participante');
    // Nenhuma linha com 3+ quebras.
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('não altera nenhum conteúdo textual, apenas o espaçamento', () => {
    const entrada =
      'avalie: I. Primeira. II. Segunda. III. Terceira. IV. Quarta.';
    const saida = formatarEnunciado(entrada);
    // Removendo espaços em branco, o texto deve ser idêntico.
    const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(semEspacos(saida)).toBe(semEspacos(entrada));
  });

  it('não quebra numerais romanos soltos em prosa (sem enumeração)', () => {
    const entrada =
      'No século XX. Depois disso, o tipo IV. de reação foi descrito.';
    expect(formatarEnunciado(entrada)).toBe(entrada);
  });

  it('separa blocos de asserção/razão em parágrafos', () => {
    const entrada =
      'avalie as asserções a seguir. Asserção 1: "Esse estudo é etnográfico." Porque Asserção 2: "A etnografia se baseia na imersão." A respeito dessas asserções, assinale a opção correta.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nAsserção 1:');
    expect(saida).toContain('\n\nPorque\n\n');
    expect(saida).toContain('\n\nAsserção 2:');
    expect(saida).toContain('\n\nA respeito dessas asserções');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('isola o comando final da última assertiva (caso ribeirinhas)', () => {
    const entrada =
      'São sentenças que apresentam somente objetivos de pesquisa apenas: I. Descrever o perfil. II. Realizar rodas de conversa. III. Mapear as barreiras. IV. Desenvolver material educativo. É correto o que se afirma em:';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI. Descrever');
    expect(saida).toContain('\n\nIV. Desenvolver material educativo.');
    // O comando final não pode ficar grudado no item IV.
    expect(saida).toContain('\n\nÉ correto o que se afirma em:');
    expect(saida).not.toMatch(/educativo\.[ \t]+É correto/);
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('isola comandos comuns em questões com enumeração', () => {
    const casos = [
      ['I. Um. II. Dois. III. Três. Assinale a alternativa correta.', 'Assinale a alternativa correta.'],
      ['I. Um. II. Dois. III. Três. Estão corretas apenas as afirmativas I e II.', 'Estão corretas apenas'],
    ];
    for (const [entrada, comando] of casos) {
      const saida = formatarEnunciado(entrada);
      expect(saida).toContain(`\n\n${comando}`);
    }
  });

  it('não isola comando em questões simples (sem enumeração/asserção)', () => {
    const entrada =
      'Um paciente chega ao pronto-socorro com dor torácica. Assinale a alternativa correta.';
    // Sem enumeração, o texto permanece intacto (não vira parágrafo separado).
    expect(formatarEnunciado(entrada)).toBe(entrada);
  });

  it('é estável ao ser aplicado duas vezes (idempotente)', () => {
    const entrada =
      'apenas as assertivas: I. Um. II. Dois. III. Três. IV. Quatro.';
    const uma = formatarEnunciado(entrada);
    const duas = formatarEnunciado(uma);
    expect(duas).toBe(uma);
  });
});

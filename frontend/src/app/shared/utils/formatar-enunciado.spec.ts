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

  it('quebra assertivas com marcador de hífen (I- II- III- IV-)', () => {
    const entrada =
      'Analise as assertivas e selecione as corretas: I- Para esse paciente 88bpm seria normal. II- A frequência cardíaca deve ser aferida em 15 segundos. III- A frequência respiratória contada em 30 segundos. IV- A frequência respiratória varia com a idade.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI- Para esse paciente');
    expect(saida).toContain('\n\nII- A frequência cardíaca');
    expect(saida).toContain('\n\nIII- A frequência respiratória');
    expect(saida).toContain('\n\nIV- A frequência respiratória varia');
    // Preserva o separador de hífen (não vira ponto).
    expect(saida).not.toContain('I. Para esse paciente');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('quebra assertivas com espaço antes do separador (I - II - III-)', () => {
    // Caso real da questão 15 (N1 SOI III 2024.2): itens separados por uma
    // única quebra de linha, com espaço antes do hífen em I/II e colado em III.
    const entrada =
      'Considerando o caso, avalie as asserções a seguir.\n' +
      'I - O paciente apresenta sintomas clássicos de infarto.\n' +
      'II - O tratamento inicial usa um antagonista de receptor AT1 de angiotensina II.\n' +
      'III- A administração oral de aspirina é possível.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI - O paciente');
    expect(saida).toContain('\n\nII - O tratamento');
    expect(saida).toContain('\n\nIII- A administração');
    // O "II" no fim do texto do item II (angiotensina II) não é um marcador:
    // não pode ganhar quebra de parágrafo.
    expect(saida).toContain('angiotensina II.');
    expect(saida).not.toContain('angiotensina\n\nII');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('não trata numeral romano no meio da frase como item (angiotensina II)', () => {
    const entrada =
      'O diagnóstico foi diabetes tipo II. Depois disso, o quadro evoluiu.';
    // Não há enumeração — apenas um numeral em prosa. Texto permanece intacto.
    expect(formatarEnunciado(entrada)).toBe(entrada);
  });

  it('quebra itens iniciados por minúscula quando começam a linha', () => {
    const entrada =
      'Sobre as neoplasias linfoide e mieloide:\n' +
      'I - aspecto comum é a origem nas células progenitoras.\n' +
      'II - a maioria apresenta comprometimento medular.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI - aspecto');
    expect(saida).toContain('\n\nII - a maioria');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('quebra assertivas com marcador de parêntese (I) II) …)', () => {
    const entrada = 'Avalie: I) Primeira afirmativa. II) Segunda afirmativa. III) Terceira afirmativa.';
    const saida = formatarEnunciado(entrada);
    expect(saida).toContain('\n\nI) Primeira');
    expect(saida).toContain('\n\nII) Segunda');
    expect(saida).toContain('\n\nIII) Terceira');
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

  it('isola o conector "Porque" em asserção/razão com itens romanos I/II', () => {
    const entrada =
      'A partir da situação, avalie as asserções a seguir e a relação entre elas:\n' +
      'I. A concentração de TSH ocorre pelo aumento de TRH.\n' +
      'Porque\n' +
      'II. a retroalimentação negativa atua sobre o eixo.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI. A concentração');
    expect(saida).toContain('\n\nPorque\n\n');
    expect(saida).toContain('\n\nII. a retroalimentação');
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

  it('isola a pergunta final em enunciado de prosa (caso miocárdio)', () => {
    const entrada =
      'Em uma discussão sobre a irrigação arterial do miocárdio, um professor explica que a perfusão coronária possui características únicas. Uma dessas peculiaridades é o momento do ciclo cardíaco em que ocorre a maior parte da perfusão miocárdica. Considerando a fisiologia da circulação coronária normal, em qual fase do ciclo cardíaco ocorre predominantemente a perfusão do miocárdio ventricular esquerdo e por quê?';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nConsiderando a fisiologia');
    expect(saida.trimEnd().endsWith('e por quê?')).toBe(true);
    // O parágrafo do cenário permanece antes da pergunta.
    expect(saida.startsWith('Em uma discussão')).toBe(true);
    expect(saida).not.toMatch(/\n{3,}/);
    // Nenhum conteúdo perdido.
    const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(semEspacos(saida)).toBe(semEspacos(entrada));
  });

  it('não quebra pergunta única nem enunciado que não termina em "?"', () => {
    expect(formatarEnunciado('Qual é o diagnóstico mais provável?')).toBe(
      'Qual é o diagnóstico mais provável?',
    );
    expect(
      formatarEnunciado('Um caso clínico qualquer descrito em uma frase só.'),
    ).toBe('Um caso clínico qualquer descrito em uma frase só.');
  });

  it('é estável ao ser aplicado duas vezes (idempotente)', () => {
    const entrada =
      'apenas as assertivas: I. Um. II. Dois. III. Três. IV. Quatro.';
    const uma = formatarEnunciado(entrada);
    const duas = formatarEnunciado(uma);
    expect(duas).toBe(uma);
  });
});

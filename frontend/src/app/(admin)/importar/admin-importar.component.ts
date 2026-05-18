import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, ChevronDown, Paperclip, X,
} from 'lucide-angular';
import {
  AdminService,
  AdminDisciplina,
  AdminTema,
  QuestaoPayload,
  AlternativaPayload,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

// ──── Questões ────

interface AlternativaParseada {
  letra: string;
  texto: string;
  correta: boolean;
}

interface QuestaoParseada {
  enunciado: string;
  alternativas: AlternativaParseada[];
  formato: 'multipla_escolha' | 'verdadeiro_falso';
  disciplina_id: string | null;
  disciplinaDisplay: string;
  explicacao: string | null;
  fonte: string | null;
  valida: boolean;
  erros: string[];
}

// ──── Disciplinas ────

interface DisciplinaParseada {
  sigla: string;
  nome: string | null;
  periodo: number | null;
  duplicada: boolean;
  valida: boolean;
  erros: string[];
}

// ──── Temas ────

interface TemaParseado {
  nome: string;
  disciplina_id: string | null;
  disciplinaDisplay: string;
  parentNome: string | null;
  parent_id: string | null;
  parentDisplay: string;
  parentNaoEncontrado: boolean;
  valida: boolean;
  erros: string[];
}

type TipoImportacao = 'questoes' | 'disciplinas' | 'temas';

// ──── Prompts ────

export const PROMPT_QUESTOES = `Você vai converter questões médicas de um arquivo para um formato de importação na plataforma BoraMed. Siga o template exatamente — o sistema lê esse formato automaticamente.

FORMATO — separe cada questão com ---

---
ENUNCIADO
[texto completo da questão, exatamente como está no original]

ALTERNATIVAS
A) [texto da alternativa A]
B) [texto da alternativa B]
C) [texto da alternativa C]
D) [texto da alternativa D]
E) [texto da alternativa E]

GABARITO: [letra correta, ex: B]
DISCIPLINA: [SOI I | HAM I | IESC I | MCM I — omita se não souber]
EXPLICACAO: [explicação do gabarito, se disponível no documento]
FONTE: [ex: Afya P1 2024.1 — omita se não souber]
---

REGRAS:
• Copie o enunciado exatamente, sem resumir ou alterar
• GABARITO deve ser apenas a letra (A, B, C, D ou E)
• Questões de verdadeiro/falso: use A) Verdadeiro e B) Falso como alternativas
• DISCIPLINA, EXPLICACAO e FONTE são campos opcionais
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;

export const PROMPT_DISCIPLINAS = `Você vai converter uma lista de disciplinas para importação na plataforma BoraMed. Siga o template exatamente.

FORMATO — separe cada disciplina com ---

---
SIGLA: [sigla curta, ex: SOI I]
NOME: [nome completo, ex: Saúde, Ontogênese e Integração I — opcional]
PERIODO: [número do período, ex: 1]
---

REGRAS:
• SIGLA é obrigatório (texto curto e único, ex: HAM II, IESC III)
• NOME é opcional mas recomendado
• PERIODO é obrigatório — número inteiro entre 1 e 12
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;

export const PROMPT_TEMAS = `Você vai converter uma lista de temas para importação na plataforma BoraMed. Siga o template exatamente.

FORMATO — separe cada tema com ---

---
NOME: [nome do tema]
DISCIPLINA: [sigla da disciplina, ex: SOI I — omita se não souber]
PARENT: [nome exato do tema pai, para subtemas — omita se for tema raiz]
---

REGRAS:
• NOME é obrigatório
• DISCIPLINA deve ser uma sigla já cadastrada no sistema
• PARENT é opcional — para subtemas, use o nome exato do tema pai cadastrado
• Ordene temas pais antes dos filhos para importação correta em lote
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;

// ──── Parsers ────

function parseBlocos(markdown: string, disciplinas: AdminDisciplina[]): QuestaoParseada[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseQuestaoBloco(b, disciplinas));
}

function parseQuestaoBloco(bloco: string, disciplinas: AdminDisciplina[]): QuestaoParseada {
  const erros: string[] = [];
  const linhas = bloco.split('\n');

  type Secao = 'nenhuma' | 'enunciado' | 'alternativas' | 'explicacao';
  let secao: Secao = 'nenhuma';

  const enunciadoLinhas: string[] = [];
  const alternativaLinhas: string[] = [];
  let gabaritoLetra: string | null = null;
  let disciplinaSigla: string | null = null;
  const explicacaoLinhas: string[] = [];
  let fonte: string | null = null;

  for (const linha of linhas) {
    const t = linha.trim();

    if (t.toUpperCase() === 'ENUNCIADO') { secao = 'enunciado'; continue; }
    if (t.toUpperCase() === 'ALTERNATIVAS') { secao = 'alternativas'; continue; }

    const mGabarito = t.match(/^GABARITO:\s*([A-Ea-e])/i);
    if (mGabarito) { gabaritoLetra = mGabarito[1].toUpperCase(); secao = 'nenhuma'; continue; }

    const mDisciplina = t.match(/^DISCIPLINA:\s*(.+)/i);
    if (mDisciplina) { disciplinaSigla = mDisciplina[1].trim(); secao = 'nenhuma'; continue; }

    const mFonte = t.match(/^FONTE:\s*(.+)/i);
    if (mFonte) { fonte = mFonte[1].trim(); secao = 'nenhuma'; continue; }

    const mExplicacao = t.match(/^EXPLICACAO:\s*(.*)/i);
    if (mExplicacao) {
      secao = 'explicacao';
      if (mExplicacao[1].trim()) explicacaoLinhas.push(mExplicacao[1]);
      continue;
    }

    if (secao === 'enunciado') { enunciadoLinhas.push(linha); continue; }
    if (secao === 'alternativas') { alternativaLinhas.push(linha); continue; }
    if (secao === 'explicacao' && t) { explicacaoLinhas.push(linha); }
  }

  const enunciado = enunciadoLinhas.join('\n').trim();
  if (!enunciado) erros.push('Enunciado ausente');

  const alternativas: AlternativaParseada[] = [];
  for (const linha of alternativaLinhas) {
    const m = linha.match(/^([A-Ea-e])\)\s*(.*)/);
    if (m) {
      const texto = m[2].replace('✓', '').trim();
      alternativas.push({ letra: m[1].toUpperCase(), texto, correta: m[2].includes('✓') });
    }
  }

  if (gabaritoLetra) {
    alternativas.forEach((a) => (a.correta = a.letra === gabaritoLetra));
  }

  if (alternativas.length < 2) erros.push('Mínimo de 2 alternativas');
  else if (!alternativas.some((a) => a.correta)) erros.push('Gabarito não identificado');

  const isVF =
    alternativas.length === 2 &&
    alternativas.some((a) => /^verdadeiro$/i.test(a.texto)) &&
    alternativas.some((a) => /^falso$/i.test(a.texto));

  const disciplinaObj = disciplinaSigla
    ? (disciplinas.find((d) => d.sigla.toLowerCase() === disciplinaSigla!.toLowerCase()) ?? null)
    : null;

  if (disciplinaSigla && !disciplinaObj) {
    erros.push(`Disciplina "${disciplinaSigla}" não encontrada`);
  }

  return {
    enunciado,
    alternativas,
    formato: isVF ? 'verdadeiro_falso' : 'multipla_escolha',
    disciplina_id: disciplinaObj?.id ?? null,
    disciplinaDisplay: disciplinaObj?.sigla ?? disciplinaSigla ?? '—',
    explicacao: explicacaoLinhas.join('\n').trim() || null,
    fonte,
    valida: erros.length === 0,
    erros,
  };
}

function parseDisciplinasBlocos(markdown: string, existentes: AdminDisciplina[]): DisciplinaParseada[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseDisciplinaBloco(b, existentes));
}

function parseDisciplinaBloco(bloco: string, existentes: AdminDisciplina[]): DisciplinaParseada {
  const erros: string[] = [];
  let sigla = '';
  let nome: string | null = null;
  let periodo: number | null = null;

  for (const linha of bloco.split('\n')) {
    const t = linha.trim();
    const mSigla = t.match(/^SIGLA:\s*(.+)/i);
    if (mSigla) { sigla = mSigla[1].trim(); continue; }
    const mNome = t.match(/^NOME:\s*(.+)/i);
    if (mNome) { nome = mNome[1].trim(); continue; }
    const mPeriodo = t.match(/^PERIODO:\s*(\d+)/i);
    if (mPeriodo) { periodo = parseInt(mPeriodo[1], 10); continue; }
  }

  if (!sigla) erros.push('SIGLA ausente');
  if (periodo === null) erros.push('PERIODO ausente');
  else if (periodo < 1 || periodo > 12) erros.push('PERIODO inválido (1–12)');

  const duplicada = sigla
    ? existentes.some((d) => d.sigla.toLowerCase() === sigla.toLowerCase())
    : false;

  return { sigla, nome, periodo, duplicada, valida: erros.length === 0, erros };
}

function parseTemasBlocos(
  markdown: string,
  disciplinas: AdminDisciplina[],
  temasExistentes: AdminTema[],
): TemaParseado[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseTemaBloco(b, disciplinas, temasExistentes));
}

function parseTemaBloco(
  bloco: string,
  disciplinas: AdminDisciplina[],
  temasExistentes: AdminTema[],
): TemaParseado {
  const erros: string[] = [];
  let nome = '';
  let disciplinaSigla: string | null = null;
  let parentNome: string | null = null;

  for (const linha of bloco.split('\n')) {
    const t = linha.trim();
    const mNome = t.match(/^NOME:\s*(.+)/i);
    if (mNome) { nome = mNome[1].trim(); continue; }
    const mDisc = t.match(/^DISCIPLINA:\s*(.+)/i);
    if (mDisc) { disciplinaSigla = mDisc[1].trim(); continue; }
    const mParent = t.match(/^PARENT:\s*(.+)/i);
    if (mParent) { parentNome = mParent[1].trim(); continue; }
  }

  if (!nome) erros.push('NOME ausente');

  const disciplinaObj = disciplinaSigla
    ? (disciplinas.find((d) => d.sigla.toLowerCase() === disciplinaSigla!.toLowerCase()) ?? null)
    : null;

  if (disciplinaSigla && !disciplinaObj) erros.push(`Disciplina "${disciplinaSigla}" não encontrada`);

  const parentObj = parentNome
    ? (temasExistentes.find((t) => t.nome.toLowerCase() === parentNome!.toLowerCase()) ?? null)
    : null;

  const parentNaoEncontrado = Boolean(parentNome && !parentObj);

  return {
    nome,
    disciplina_id: disciplinaObj?.id ?? null,
    disciplinaDisplay: disciplinaObj?.sigla ?? disciplinaSigla ?? '—',
    parentNome,
    parent_id: parentObj?.id ?? null,
    parentDisplay: parentObj?.nome ?? parentNome ?? '—',
    parentNaoEncontrado,
    valida: erros.length === 0,
    erros,
  };
}

@Component({
  selector: 'app-admin-importar',
  standalone: true,
  imports: [FormsModule, UiIconComponent],
  templateUrl: './admin-importar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminImportarComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly iconBot = Bot;
  protected readonly iconPaperclip = Paperclip;
  protected readonly iconArrowRight = ArrowRight;
  protected readonly iconArrowLeft = ArrowLeft;
  protected readonly iconChevronDown = ChevronDown;
  protected readonly iconCheck = Check;
  protected readonly iconX = X;
  protected readonly iconAlertTriangle = AlertTriangle;

  protected readonly etapa = signal<'input' | 'preview' | 'importando' | 'concluido'>('input');
  protected readonly texto = signal('');
  protected readonly tipoImportacao = signal<TipoImportacao>('questoes');

  protected readonly questoes = signal<QuestaoParseada[]>([]);
  protected readonly disciplinasParseadas = signal<DisciplinaParseada[]>([]);
  protected readonly temasParseados = signal<TemaParseado[]>([]);

  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly temasExistentes = signal<AdminTema[]>([]);

  protected readonly promptCopiado = signal(false);
  protected readonly promptAberto = signal(false);
  protected readonly expandido = signal<number | null>(null);

  protected readonly progresso = signal(0);
  protected readonly totalImportar = signal(0);
  protected readonly importados = signal(0);
  protected readonly errosImport = signal(0);

  protected readonly itensParseados = computed<{ valida: boolean }[]>(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return this.questoes();
      case 'disciplinas': return this.disciplinasParseadas();
      case 'temas': return this.temasParseados();
    }
  });

  protected readonly validas = computed(() => this.itensParseados().filter((i) => i.valida).length);
  protected readonly invalidas = computed(() => this.itensParseados().filter((i) => !i.valida).length);

  protected readonly progressoPct = computed(() =>
    this.totalImportar() > 0 ? Math.round((this.progresso() / this.totalImportar()) * 100) : 0,
  );

  protected readonly promptAtual = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return PROMPT_QUESTOES;
      case 'disciplinas': return PROMPT_DISCIPLINAS;
      case 'temas': return PROMPT_TEMAS;
    }
  });

  protected readonly promptTitulo = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'Prompt para converter PDF com IA';
      case 'disciplinas': return 'Prompt para listar disciplinas com IA';
      case 'temas': return 'Prompt para listar temas com IA';
    }
  });

  protected readonly promptSub = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'Cole esse prompt no ChatGPT ou Claude, anexe o PDF e cole o resultado abaixo';
      case 'disciplinas': return 'Cole esse prompt no ChatGPT ou Claude, informe as disciplinas e cole o resultado abaixo';
      case 'temas': return 'Cole esse prompt no ChatGPT ou Claude, informe os temas e cole o resultado abaixo';
    }
  });

  protected readonly placeholderTexto = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return `Cole aqui o markdown gerado pela IA...

---
ENUNCIADO
Paciente de 45 anos apresenta dor torácica em repouso...

ALTERNATIVAS
A) Angina estável
B) Infarto agudo do miocárdio ✓
C) Pericardite
D) Dissecção aórtica
E) TEP

GABARITO: B
DISCIPLINA: SOI I
EXPLICACAO: O infarto agudo se caracteriza por...
---`;
      case 'disciplinas': return `Cole aqui o markdown gerado pela IA...

---
SIGLA: SOI I
NOME: Saúde, Ontogênese e Integração I
PERIODO: 1
---
---
SIGLA: HAM II
NOME: Habilidades e Atitudes Médicas II
PERIODO: 2
---`;
      case 'temas': return `Cole aqui o markdown gerado pela IA...

---
NOME: Semiologia Cardiovascular
DISCIPLINA: SOI I
---
---
NOME: Ausculta Cardíaca
DISCIPLINA: SOI I
PARENT: Semiologia Cardiovascular
---`;
    }
  });

  protected readonly labelImportar = computed(() => {
    const n = this.validas();
    switch (this.tipoImportacao()) {
      case 'questoes': return `Importar ${n} questão${n !== 1 ? 'ões' : ''}`;
      case 'disciplinas': return `Importar ${n} disciplina${n !== 1 ? 's' : ''}`;
      case 'temas': return `Importar ${n} tema${n !== 1 ? 's' : ''}`;
    }
  });

  protected readonly doneHint = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'As questões foram criadas com status Rascunho. Revise e publique em /admin/questoes.';
      case 'disciplinas': return 'As disciplinas foram criadas e já estão disponíveis para uso nas questões e temas.';
      case 'temas': return 'Os temas foram criados e já estão disponíveis para uso nas questões.';
    }
  });

  async ngOnInit(): Promise<void> {
    const [disciplinasRes, temasRes] = await Promise.all([
      this.adminService.listarDisciplinas(),
      this.adminService.listarTemas(),
    ]);
    if (disciplinasRes.ok) this.disciplinas.set(disciplinasRes.data);
    if (temasRes.ok) this.temasExistentes.set(temasRes.data);
  }

  protected setTipo(tipo: TipoImportacao): void {
    if (this.tipoImportacao() === tipo) return;
    this.tipoImportacao.set(tipo);
    this.texto.set('');
    this.questoes.set([]);
    this.disciplinasParseadas.set([]);
    this.temasParseados.set([]);
    this.etapa.set('input');
    this.expandido.set(null);
    this.promptAberto.set(false);
  }

  protected processar(): void {
    const t = this.texto().trim();
    if (!t) { this.toast.error('Cole o conteúdo ou carregue um arquivo.'); return; }

    switch (this.tipoImportacao()) {
      case 'questoes': {
        const parsed = parseBlocos(t, this.disciplinas());
        if (parsed.length === 0) { this.toast.error('Nenhuma questão encontrada. Verifique o formato.'); return; }
        this.questoes.set(parsed);
        break;
      }
      case 'disciplinas': {
        const parsed = parseDisciplinasBlocos(t, this.disciplinas());
        if (parsed.length === 0) { this.toast.error('Nenhuma disciplina encontrada. Verifique o formato.'); return; }
        this.disciplinasParseadas.set(parsed);
        break;
      }
      case 'temas': {
        const parsed = parseTemasBlocos(t, this.disciplinas(), this.temasExistentes());
        if (parsed.length === 0) { this.toast.error('Nenhum tema encontrado. Verifique o formato.'); return; }
        this.temasParseados.set(parsed);
        break;
      }
    }

    this.etapa.set('preview');
  }

  protected onArquivo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.texto.set((e.target?.result as string) ?? '');
    reader.readAsText(file, 'UTF-8');
  }

  protected toggleExpand(i: number): void {
    this.expandido.update((v) => (v === i ? null : i));
  }

  protected voltar(): void {
    this.etapa.set('input');
    this.expandido.set(null);
  }

  protected async importar(): Promise<void> {
    switch (this.tipoImportacao()) {
      case 'questoes': return this.importarQuestoes();
      case 'disciplinas': return this.importarDisciplinas();
      case 'temas': return this.importarTemas();
    }
  }

  private async importarQuestoes(): Promise<void> {
    const validas = this.questoes().filter((q) => q.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const q of validas) {
      const payload: QuestaoPayload = {
        enunciado: q.enunciado,
        formato: q.formato,
        status: 'rascunho',
        disciplina_id: q.disciplina_id,
        explicacao: q.explicacao,
        fonte: q.fonte,
      };
      const alternativas: AlternativaPayload[] = q.alternativas.map((a, i) => ({
        letra: a.letra,
        texto: a.texto,
        correta: a.correta,
        ordem: i + 1,
      }));

      const res = await this.adminService.criarQuestaoCompleta(payload, alternativas, []);
      if (res.ok) this.importados.update((n) => n + 1);
      else this.errosImport.update((n) => n + 1);
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  private async importarDisciplinas(): Promise<void> {
    const validas = this.disciplinasParseadas().filter((d) => d.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const d of validas) {
      const res = await this.adminService.criarDisciplina({
        sigla: d.sigla,
        nome: d.nome,
        periodo: d.periodo!,
      });
      if (res.ok) {
        this.importados.update((n) => n + 1);
        this.disciplinas.update((list) => [...list, res.data]);
      } else {
        this.errosImport.update((n) => n + 1);
      }
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  private async importarTemas(): Promise<void> {
    const validas = this.temasParseados().filter((t) => t.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const t of validas) {
      // Re-resolve parent at import time to support parent-in-same-batch
      let parentId = t.parent_id;
      if (t.parentNome && !parentId) {
        const found = this.temasExistentes().find(
          (e) => e.nome.toLowerCase() === t.parentNome!.toLowerCase(),
        );
        if (found) parentId = found.id;
      }

      const res = await this.adminService.criarTema({
        nome: t.nome,
        disciplina_id: t.disciplina_id,
        parent_id: parentId,
      });
      if (res.ok) {
        this.importados.update((n) => n + 1);
        this.temasExistentes.update((list) => [...list, res.data]);
      } else {
        this.errosImport.update((n) => n + 1);
      }
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  protected novaImportacao(): void {
    this.texto.set('');
    this.questoes.set([]);
    this.disciplinasParseadas.set([]);
    this.temasParseados.set([]);
    this.expandido.set(null);
    this.etapa.set('input');
  }

  protected async copiarPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.promptAtual());
    this.promptCopiado.set(true);
    setTimeout(() => this.promptCopiado.set(false), 2000);
  }

  protected enunciadoCurto(texto: string): string {
    return texto.length > 120 ? texto.slice(0, 120) + '…' : texto;
  }

  protected gabaritoLabel(q: QuestaoParseada): string {
    return q.alternativas.find((a) => a.correta)?.letra ?? '—';
  }
}

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
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, ChevronDown, Image, Paperclip, X,
} from 'lucide-angular';
import {
  AdminService,
  AdminDisciplina,
  QuestaoPayload,
  AlternativaPayload,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

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

export const PROMPT_IA = `Você vai converter questões médicas de um arquivo para um formato de importação na plataforma BoraMed. Siga o template exatamente — o sistema lê esse formato automaticamente.

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

function parseBlocos(markdown: string, disciplinas: AdminDisciplina[]): QuestaoParseada[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseBloco(b, disciplinas));
}

function parseBloco(bloco: string, disciplinas: AdminDisciplina[]): QuestaoParseada {
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
  protected readonly questoes = signal<QuestaoParseada[]>([]);
  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly promptCopiado = signal(false);
  protected readonly promptAberto = signal(false);
  protected readonly expandido = signal<number | null>(null);

  protected readonly progresso = signal(0);
  protected readonly totalImportar = signal(0);
  protected readonly importados = signal(0);
  protected readonly errosImport = signal(0);

  protected readonly validas = computed(() => this.questoes().filter((q) => q.valida).length);
  protected readonly invalidas = computed(() => this.questoes().filter((q) => !q.valida).length);
  protected readonly progressoPct = computed(() =>
    this.totalImportar() > 0 ? Math.round((this.progresso() / this.totalImportar()) * 100) : 0,
  );

  protected readonly prompt = PROMPT_IA;

  async ngOnInit(): Promise<void> {
    const res = await this.adminService.listarDisciplinas();
    if (res.ok) this.disciplinas.set(res.data);
  }

  protected processar(): void {
    const t = this.texto().trim();
    if (!t) { this.toast.error('Cole o conteúdo ou carregue um arquivo.'); return; }
    const parsed = parseBlocos(t, this.disciplinas());
    if (parsed.length === 0) { this.toast.error('Nenhuma questão encontrada. Verifique o formato.'); return; }
    this.questoes.set(parsed);
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

  protected novaImportacao(): void {
    this.texto.set('');
    this.questoes.set([]);
    this.expandido.set(null);
    this.etapa.set('input');
  }

  protected async copiarPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.prompt);
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

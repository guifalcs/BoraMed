
# Design System — Projeto Med

Inspirado em plataformas educacionais modernas (Descomplica, Medway, Notion).
Clean, fácil leitura, foco no conteúdo.

## Cores

```css
/* Primária — azul profundo, transmite seriedade/medicina */
--color-primary: #1E40AF;
--color-primary-light: #3B82F6;
--color-primary-dark: #1E3A8A;

/* Feedback */
--color-success: #059669;   /* acerto */
--color-danger: #DC2626;    /* erro */
--color-warning: #D97706;   /* timer baixo, atenção */

/* Neutros */
--color-bg: #F8FAFC;        /* fundo da página */
--color-surface: #FFFFFF;   /* cards, modais */
--color-surface-2: #F1F5F9; /* fundo de alternativas, hover */
--color-border: #E2E8F0;
--color-text: #0F172A;
--color-text-muted: #64748B;
--color-text-inverse: #FFFFFF;
```

## Tipografia

* **Fonte principal** : Inter (Google Fonts)
* **Fonte de enunciado** : Inter, weight 400 — legível em textos longos
* **Hierarquia** :

```
text-2xl / font-bold    — título de página (ex: "Simulado Processual")
text-xl  / font-semibold — título de seção
text-base / font-medium  — enunciado de questão
text-sm  / font-normal   — alternativas, labels
text-xs  / font-normal   — badges, timestamps, metadados
```

## Espaçamento

Seguir escala Tailwind padrão. Padrões recorrentes:

* Padding de card: `p-6`
* Gap entre questões: `gap-6`
* Gap entre alternativas: `gap-2`
* Max-width do conteúdo: `max-w-3xl mx-auto`

## Breakpoints

* Mobile first. Breakpoint principal: `md` (768px)
* Abaixo de md: 1 coluna, padding reduzido (`px-4`)
* Acima de md: layout com sidebar ou 2 colunas onde aplicável

## Componentes Base

### QuestaoCard

```
border border-[--color-border]
rounded-xl bg-[--color-surface]
p-6 shadow-sm
```

* Número da questão: badge cinza canto superior esquerdo
* Enunciado: `text-base font-medium text-[--color-text]`
* Imagem (laboratório): acima do enunciado, `rounded-lg max-w-lg w-full mx-auto mb-4`
* Alternativas: lista vertical, `gap-2`

### Alternativa

```
border border-[--color-border] rounded-lg p-4
text-sm cursor-pointer
hover: bg-[--color-surface-2] border-[--color-primary-light]
selected: bg-blue-50 border-[--color-primary]
correct: bg-green-50 border-[--color-success] text-[--color-success]
wrong: bg-red-50 border-[--color-danger] text-[--color-danger]
```

### SimuladoHeader (fixo no topo)

```
sticky top-0 z-10
bg-[--color-surface] border-b border-[--color-border]
px-6 py-3 flex items-center justify-between
```

* Esquerda: progresso (ex: "8 / 20")
* Centro: nome do simulado
* Direita: timer + botão "Finalizar"

### Timer

* Normal: `text-[--color-text-muted]`
* Abaixo de 5 min: `text-[--color-warning] font-semibold`
* Abaixo de 1 min: `text-[--color-danger] font-bold animate-pulse`

### ResultadoSummary

* Nota em destaque: número grande centralizado com cor contextual
  * ≥ 70%: `--color-success`
  * 50–69%: `--color-warning`
  * < 50%: `--color-danger`
* Barra de progresso por tema
* Lista de questões com ícone de acerto/erro e link para revisão

### Button

```
primary:   bg-[--color-primary] text-white rounded-lg px-4 py-2 font-medium hover:bg-[--color-primary-dark]
secondary: border border-[--color-border] bg-white text-[--color-text] rounded-lg px-4 py-2
danger:    bg-[--color-danger] text-white rounded-lg px-4 py-2
```

### Badge / Tipo de Prova

```
Nacional:    bg-blue-100   text-blue-800
Processual:  bg-purple-100 text-purple-800
Laboratório: bg-teal-100   text-teal-800
```

## Navegação (sidebar — desktop)

```
w-64 bg-[--color-surface] border-r border-[--color-border] h-screen sticky top-0
```

Itens:

* Provas Nacionais
* Simulados Processuais
* Simulados de Laboratório
* Histórico
* (futuro) Desempenho

Mobile: bottom navigation bar com ícones.

## Estados de Loading

* Skeleton: `animate-pulse bg-[--color-surface-2] rounded`
* Imagens de laboratório: skeleton retangular `aspect-video` enquanto carrega
* Lista de questões: 3 skeletons empilhados

## Ícones

Lucide React. Consistência: tamanho padrão `w-5 h-5`.

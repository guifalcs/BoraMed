# Design System — BoraMed

Direção visual: plataforma educacional médica com aparência institucional, limpa e confiante. A base deve combinar uma experiência de estudo objetiva com momentos de marca mais fortes, usando azul médico/institucional como cor principal e acentos violetas apenas em gradientes de marca.

## Cores

```css
/* Primária */
--color-primary: #1E40AF;
--color-primary-light: #3B82F6;
--color-primary-dark: #1E3A8A;
--color-action: #2554DC;

/* Gradiente institucional */
--gradient-brand: linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%);
--gradient-brand-highlight: radial-gradient(circle at 82% 22%, rgba(255, 255, 255, 0.18), transparent 26%);
--gradient-brand-accent: radial-gradient(circle at 20% 85%, rgba(13, 148, 136, 0.22), transparent 28%);

/* Feedback */
--color-success: #059669;
--color-danger: #DC2626;
--color-warning: #D97706;

/* Neutros */
--color-bg: #F8FAFC;
--color-bg-soft: #FBFBFC;
--color-surface: #FFFFFF;
--color-surface-2: #F1F5F9;
--color-border: #E2E8F0;
--color-text: #0F172A;
--color-text-muted: #64748B;
--color-text-inverse: #FFFFFF;
```

Uso:

* `--color-primary` para navegação, estados ativos e elementos estruturais.
* `--color-action` para botões primários de ação.
* `--gradient-brand` para painéis institucionais, onboarding e autenticação.
* `--color-surface` para formulários, cards e áreas de leitura.
* Evitar telas inteiras em roxo. O violeta só entra como fim do gradiente institucional.

## Tipografia

Fontes:

* **Texto e UI**: Inter.
* **Display institucional**: Inter em peso 800, reutilizando a mesma familia externa do produto.
* **Enunciados e alternativas**: Inter, peso 400–500 para leitura longa.

Hierarquia:

```text
Display brand: 2.875rem / 800 / Inter / line-height 1.02
Título de página: 2rem / 800 / Inter
Título de seção: 1.25rem / 700 / Inter
Texto de apoio: 1rem / 400 / Inter
Label: 0.8125rem / 700 / Inter
Texto auxiliar: 0.8125rem / 400-600 / Inter
```

Regras:

* Não usar letter spacing negativo.
* Em telas operacionais, priorizar densidade e leitura. Em telas institucionais, permitir títulos maiores e mais expressivos.
* Textos longos de prova devem permanecer em Inter.

## Layout

Mobile-first:

* Abaixo de `md`: uma coluna, padding lateral de `1rem`.
* Desktop: usar duas colunas quando houver narrativa institucional + formulário.
* Conteúdo de formulários: `max-width: 400px`.
* Conteúdo de estudo: `max-w-3xl mx-auto`.

### Densidade De Texto No Mobile

Abaixo de `sm` (640px) o texto de apoio some; o de decisão fica. A regra é a
altura acima da dobra, não a economia de palavras.

* **Sai:** subtítulo de `page-header`, terceira linha de card de KPI, parágrafo
  descritivo cujo título/chip/CTA ao lado já comunica a mesma coisa, legenda de
  opção cujo label se explica sozinho.
* **Fica:** qualquer texto que seja a única forma de entender o estado —
  bloqueio de plano, erro, aviso e o texto de `empty-state` (ali a frase *é* o
  valor; corte o `py-16`, não a explicação).
* **Como:** CSS puro — `hidden sm:block`, ou swap `sm:hidden` + `hidden sm:inline`
  para versão curta/longa. Nunca detectar largura em JS: o app é SSR e o servidor
  não sabe o viewport.
* **Acessibilidade:** `hidden` tira do leitor de tela. Quando o texto oculto é o
  único descritor do elemento, usar `sr-only` (é o que o `page-header` faz) em vez
  de escondê-lo de vez.
* O Perfil corta em 768px, não 640px, porque o `perfil.component.css` já tinha um
  `@media (max-width: 767px)`. Ao mexer lá, seguir o breakpoint do arquivo.

Autenticação:

```css
.auth-page {
  min-height: 100vh;
  display: grid;
}

@media (min-width: 900px) {
  .auth-page {
    grid-template-columns: minmax(420px, 44vw) 1fr;
  }
}
```

## Padrão De Marca

### BrandPanel

Usado em login, cadastro, recuperação de senha e futuras telas de onboarding.

```css
color: var(--color-text-inverse);
background:
  var(--gradient-brand-highlight),
  var(--gradient-brand);
```

Elementos:

* Logo/monograma no topo, `48px`, `border-radius: 12px`, fundo branco com 14% de opacidade.
* Nome `BoraMed` em Inter 800.
* Headline em Inter 800, com destaque por peso, escala e contraste.
* Métricas em cards translúcidos com borda branca em 18% de opacidade.

Exemplo de tom:

```text
Treine com questões autorais no modelo da sua prova.
```

## Componentes Base

### Button

```css
primary:
  min-height: 3rem;
  border-radius: 0.5rem;
  background: var(--color-action);
  color: var(--color-text-inverse);
  font-weight: 700;
  box-shadow: 0 10px 20px rgba(37, 84, 220, 0.18);

secondary:
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 0.5rem;

danger:
  background: var(--color-danger);
  color: var(--color-text-inverse);
```

Botões de formulário devem ocupar largura total quando forem ação primária da tela.

### Input

```css
min-height: 3rem;
border: 1px solid var(--color-border);
border-radius: 0.5rem;
padding: 0.75rem 1rem;
background: var(--color-surface);
```

Estados:

* Foco: borda `--color-primary-light` e halo `rgba(59, 130, 246, 0.12)`.
* Erro: borda `--color-danger` e texto inline abaixo do campo.
* Erros nunca devem aparecer em alert/modal para formulários.

### Checkbox

Checkboxes usam o componente standalone `app-ui-checkbox`, com input nativo preservado para acessibilidade e visual próprio alinhado ao azul institucional.

Estados:

* Marcado: preenchimento `--color-action`, check branco e halo azul suave.
* Foco: outline `--color-primary-light` no controle visual.
* Variante `card`: usada em listas selecionáveis e opções administrativas, com borda, hover e estado selecionado.
* Variante compacta: usada em grades densas de filtros e temas.

### Ações Em Tabelas

Tabelas administrativas devem usar botões quadrados com ícones para ações repetidas de linha.

* Visualizar: ícone `Eye`.
* Editar: ícone `Pencil`.
* Deletar: ícone `Trash2`, mantendo a cor de perigo.
* Sempre manter `aria-label` para preservar acessibilidade sem exibir texto visual.
* Usar texto apenas em ações de fluxo ou comandos pouco óbvios, como salvar, cancelar, filtrar e iniciar processos.

### AuthTabs

```css
display: inline-grid;
grid-auto-flow: column;
gap: 0.25rem;
border-radius: 0.5rem;
padding: 0.25rem;
background: var(--color-surface-2);
```

Tab ativa:

```css
background: var(--color-surface);
color: var(--color-text);
box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
```

### Feedback Inline

```css
.error {
  color: var(--color-danger);
  font-size: 0.8125rem;
}

.success {
  border: 1px solid rgba(5, 150, 105, 0.24);
  color: var(--color-success);
  background: #ECFDF5;
}
```

### InfoTooltip (`app-ui-info-tooltip`)

Ícone de informação discreto (lucide `Info`, muted) com balão no hover/foco. Sem
JS: visibilidade por CSS (`group-hover` + `group-focus-within`) — funciona com
mouse e teclado. Gatilho é um `button` focável com `aria-label`; balão tem
`role="tooltip"`, largura limitada (`max-w-[calc(100vw-3rem)]`) para não estourar
em telas pequenas. Props: `text` (obrigatório), `ariaLabel`, `size` (default 14).
Uso atual: disclaimer da correção da IA (Aurora) — deixa claro que é apoio ao
estudo, não a correção oficial, e reforça a independência em relação à Afya.

## Componentes De Simulado

### QuestaoCard

```css
border: 1px solid var(--color-border);
border-radius: 0.75rem;
background: var(--color-surface);
padding: 1.5rem;
box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
```

* N?mero da quest?o: badge cinza no canto superior esquerdo.
* Enunciado: `text-base font-medium text-[--color-text]`.
* Imagem de laborat?rio: acima do enunciado, `rounded-lg max-w-lg w-full mx-auto mb-4`.
* Alternativas: lista vertical com `gap-2`.

### QuestaoAnotacao

Usado apenas na revis?o de uma tentativa finalizada, abaixo do `QuestaoCard`.

Padr?es:

* Painel colaps?vel por quest?o, nunca aberto em massa por padr?o.
* Superf?cie azul muito suave (`bg-blue-50`) com borda discreta (`border-blue-100`), separada do card da quest?o por `gap-3`.
* Header compacto com ?cone Lucide `StickyNote`, estado "Adicionar anota??o" quando vazio e "Anota??o salva" com preview de uma linha quando preenchido.
* Editor em `textarea` com altura m?nima confort?vel, autosave silencioso e contador `0/5000`.
* Estados inline pequenos: `Salvando...`, `Salvo` e erro em vermelho; n?o usar modal/toast para falhas de autosave.
* Bot?o de excluir usa ?cone `Trash2`, s? aparece quando h? conte?do e mant?m `aria-label`.
* A execu??o do simulado n?o renderiza o painel para evitar distra??o durante prova cronometrada.

### Alternativa

```css
border: 1px solid var(--color-border);
border-radius: 0.5rem;
padding: 1rem;
font-size: 0.875rem;
cursor: pointer;
```

Estados:

* Hover: `background: var(--color-surface-2)`, borda `--color-primary-light`.
* Selecionada: `background: #EFF6FF`, borda `--color-primary`.
* Correta: `background: #ECFDF5`, borda `--color-success`, texto `--color-success`.
* Errada: `background: #FEF2F2`, borda `--color-danger`, texto `--color-danger`.
* Riscada (eliminada pelo aluno): `background: var(--color-surface-2)`, texto `--color-text-muted` com `line-through`, letra em círculo vazado com `ring` na cor da borda. Imagem de alternativa riscada fica em `grayscale` com 40% de opacidade.

Ação de riscar:

* Botão fantasma de 28px no canto direito da alternativa, ícone `X` (riscar) ou `Undo2` (restaurar).
* O `X` só aparece no hover ou no foco de teclado da alternativa — em repouso a lista fica idêntica ao que era antes da feature.
* Riscada, o botão de restaurar fica 100% visível: é o único caminho de volta.
* **Toque:** sem hover o `X` nunca apareceria, então o gesto é segurar a alternativa por 500ms (risca e restaura). Toque curto continua marcando. Arrastar mais de 10px cancela — senão rolar a página riscaria sem querer. `select-none` no container evita a alça de seleção de texto do sistema durante o gesto; `navigator.vibrate(10)` confirma a ação onde existe. Dica visível só abaixo de `sm`: "Segure uma alternativa para eliminá-la".
* Tooltip escuro abaixo do botão, no mesmo padrão do "Anular questão", com o rótulo e o atalho: `Eliminar alternativa A (Shift + A)`. Usa `group` nomeado (`group/risca`) para não acender junto com o hover da alternativa inteira.
* Atalho equivalente: `Shift` + `A`–`E` (ou `Shift` + `1`–`5`).

### SimuladoHeader

```css
position: sticky;
top: 0;
z-index: 10;
background: var(--color-surface);
border-bottom: 1px solid var(--color-border);
padding: 0.75rem 1.5rem;
display: flex;
align-items: center;
justify-content: space-between;
```

* Esquerda: progresso, exemplo `8 / 20`.
* Centro: nome do simulado.
* Direita: timer + botão `Finalizar`.

### Timer

* Normal: `--color-text-muted`.
* Abaixo de 5 min: `--color-warning`, `font-semibold`.
* Abaixo de 1 min: `--color-danger`, `font-bold`, `animate-pulse`.

### ResultadoSummary

* Nota em destaque com cor contextual.
* `>= 70%`: `--color-success`.
* `50-69%`: `--color-warning`.
* `< 50%`: `--color-danger`.
* Incluir barra de progresso por tema e lista de questões com link para revisão.
* A linha final de ações deve manter `Imprimir com gabarito` como botão secundário à esquerda e `Revisar e anotar` como botão primário à direita em telas `sm+`; em mobile, empilhar nessa mesma ordem.

### Hub De Simulados

O hub `/dashboard/simulados` usa cards de ação em largura total, empilhados verticalmente, para reduzir vazio visual e deixar a escolha mais explícita.

Padrões:

* Cada opção é um card clicável com `border-radius: 8px`, borda esquerda de acento e ícone Lucide em bloco fixo.
* O card de treinos nacionais mantém o gradiente institucional com texto claro, por ser o caminho pronto e principal.
* O card de montar simulado permanece em superfície branca, sem gradiente, com acento verde discreto.
* Conteúdo principal: título, badge de estado, descrição curta, blocos informativos e uma linha final de atributos objetivos.
* Cards devem ter altura mínima suficiente para ocupar a área útil apenas em desktop largo (`lg+`, `min-height` aproximado de 16rem). Em mobile e tablet, usar chips compactos e ocultar os blocos informativos maiores.
* Ação lateral em desktop com rótulo curto e botão quadrado com `ArrowRight`; abaixo de `lg`, a área de ação ocupa a largura inteira como rodapé do card.
* Separador textual entre opções quando houver caminhos com intenção diferente, como treino pronto vs. montagem personalizada.
* Evitar círculos/orbes decorativos nessa tela operacional; usar densidade, gradiente institucional e chips para ocupar espaço.

## Badges

```css
Nacional:    background #DBEAFE; color #1E40AF;
Processual:  background #EDE9FE; color #5B21B6;
Laboratório: background #CCFBF1; color #0F766E;
```

## Upsell (plano gratuito e essencial)

Quatro componentes compartilhados, todos usando o gradiente institucional
(`--gradient-brand` + highlights radiais) quando precisam de destaque.

* **`app-upgrade-badge`** — selo "PRO" com cadeado. Variantes `suave` (âmbar,
  padrão), `solido` (sobre superfície clara) e `contorno` (sobre gradiente).
* **`app-upgrade-card`** — bloco de upsell com gradiente. `inline` para o corpo
  da página, `compacto` para o rodapé da sidebar. Aceita `origem`, propagada
  para `/planos` como query param.
* **`app-limite-tentativas-banner`** — contador com barra de progresso. O tom
  escala com o saldo: **neutro** (2+ restantes) → **âmbar** (1) → **vermelho**
  (0). O limite precisa ficar visível antes de bloquear.
* **`app-paywall-modal`** — modal contextual, disparado pelo `PaywallService`
  e montado uma única vez no shell do dashboard. Cabeçalho em gradiente, lista
  de benefícios com check verde, fechamento em caixa neutra e CTA primário.

Ordem dos benefícios no modal segue **efeito de posição serial**: o mais forte
primeiro, o utilitário no meio, o fechamento por perda logo acima do CTA.

**Regra de navegação**: recurso pago aparece **bloqueado**, nunca escondido.
Item de menu vira `<button>` com `opacity` reduzida, ícone original preservado
e selo PRO à direita; o clique abre o paywall no contexto daquele recurso.
Esconder o item esconde junto o motivo para assinar.

## Navegação

Desktop:

```css
width: 16rem;
background: var(--color-surface);
border-right: 1px solid var(--color-border);
height: 100vh;
position: sticky;
top: 0;
```

Logo: `height: 2.25rem`, alinhada a esquerda no topo com recuo discreto, mantendo proporcao original e espaco compacto antes da lista.

Itens:

* Provas Nacionais
* Simulados Processuais
* Simulados de Laboratório
* Histórico
* Desempenho

Mobile: bottom navigation com ícones.

## Estados De Loading

* Botões: manter largura fixa, trocar texto por gerúndio (`Entrando...`, `Criando conta...`) e aplicar `opacity: 0.78`.
* Skeleton: `animate-pulse`, `background: var(--color-surface-2)`, `border-radius: 0.5rem`.
* Imagens de laboratório: skeleton `aspect-video`.
* Lista de questões: 3 skeletons empilhados.

## Ícones

Usar Lucide quando biblioteca de ícones estiver instalada. Tamanho padrão: `20px`.

Enquanto a biblioteca não estiver instalada, ícones simples podem ser CSS-only ou texto, desde que mantenham o mesmo espaço visual e acessibilidade com `aria-label`.

## Onboarding

O onboarding usa uma camada curta de ativação, não uma tela de marketing.

Padrões:

* Welcome e final podem usar Poloca com o gradiente institucional.
* Coachmarks desktop usam spotlight sobre alvos com `data-onboarding-target` e card de até `392px`.
* Mobile usa bottom sheet; não usar popover pequeno preso ao bottom nav.
* Fallback central obrigatório quando o alvo não existe na rota atual.
* Card com `border-radius: 8px`, borda `--color-border`, superfície branca e sombra forte o bastante para separar do scrim.
* Header usa `--gradient-brand-highlight` + `--gradient-brand`.
* Texto deve ser curto: título de uma linha quando possível, descrição de até duas linhas em desktop.
* Sempre oferecer ação secundária para pular.
* Respeitar `prefers-reduced-motion`; animações devem ser sutis e removíveis.

## Admin Analytics

O dashboard administrativo usa `ng2-charts`/Chart.js, já instalados no frontend, para visualizações operacionais sem adicionar nova dependência.

Padrões:

* Sparklines de notas em cards devem usar escala percentual fixa de 0 a 100, com padding interno, para não exagerar pequenas variações.
* KPIs em cards compactos com ícones Lucide, `border-radius: 8px` e acentos por categoria.
* Gráfico de barras para volume total da plataforma.
* Doughnut para composição do banco de questões por status.
* Barras menores para movimento do dia.
* Sinais operacionais derivados das estatísticas existentes, sem buscar dados sensíveis adicionais no cliente.

## Admin Mobile

O admin deve permanecer utilizável em viewport mobile sem expor navegação desktop fixa.

Padrões:

* Abaixo de `900px`, a sidebar vira drawer lateral acionado pelo botão de menu no topbar.
* O drawer usa backdrop e botão de fechar; links de navegação fecham o menu após toque.
* Conteúdo principal usa padding de aproximadamente `1rem` no mobile.
* Toolbars e formulários administrativos empilham campos e botões em largura total abaixo de `640px`.
* Tabelas administrativas mantêm rolagem horizontal com largura mínima por contexto, evitando colunas ilegíveis.
* Telas administrativas com padrão master-detail, como Suporte, colapsam antes do mobile quando a área útil fica estreita; abaixo desse ponto, lista e detalhe alternam entre si com ação explícita de voltar.
* Drawers de criação/edição ocupam a viewport no mobile, com footer de ações empilhado.

## Dashboard Inicial (Bento)

A tela inicial do usuário logado (`InicioComponent`) usa um layout *bento*: blocos grandes e chamativos numa grade de 12 colunas no desktop (`lg:grid-cols-12`) e empilhados em coluna única no mobile.

Composição desktop:

```text
linha 1: hero (col-span-8)            | nível & XP (col-span-4)
linha 2: evolução das notas (col-8)   | desafio do dia (col-4)
linha 3: acerto geral | última nota | simulados | ranking  (4× col-3)
linha 4: trajetória recente (col-8)   | reforçar tema + streak (col-4)
```

Padrões visuais:

* **Card base**: `border-radius: 1rem`, borda `--color-border`, superfície branca, sombra suave; hover com leve elevação (`-translate-y-0.5` + sombra maior) nos cards clicáveis.
* **Faixa de acento** (`.accent-strip`): barra de `4px` no topo do card, com gradiente por contexto (marca, sucesso, atenção, perigo).
* **Anéis (gauges)**: SVG `viewBox 0 0 100 100`, círculo `r=40`, `stroke-width 9`, `stroke-linecap round`, girados `-90deg` para começar no topo. Trilho em `--color-surface-2`, arco preenchido com gradiente (`grad-brand`/`grad-success`/`grad-warning`/`grad-danger` definidos uma única vez por página). Valor no centro.
* **Gráfico de evolução**: barras com gradiente vertical, topo arredondado, altura proporcional à nota (mínimo de 6% para visibilidade), cor pelo desempenho. Sempre rotular honestamente ("últimas N notas").
* **Hero do desafio pendente**: único bloco, além do hero, que pode usar gradiente cheio (violeta→azul institucional) para chamar a ação; estado concluído volta a card branco com acento verde.

Cores por desempenho (thresholds centralizados em `varianteNota()`): `≥70` sucesso, `≥50` atenção, `<50` perigo, sem dado = neutro (azul institucional). Os mesmos thresholds valem para anéis, barras e badges.

Progresso de nível: derivado da fórmula do backend `nivel = floor(sqrt(xp/100))`; o nível `N` abrange `(2N+1)·100` de XP. Nunca inventar curva de XP no cliente.

Animações (todas removíveis via `prefers-reduced-motion`):

* `bento-rise`: entrada escalonada dos blocos via `animation-delay: var(--d)`.
* `gauge-draw`: desenho do arco do anel (com fallback estático no `stroke-dashoffset`).
* `bar-grow`: crescimento das barras a partir da base.

## Imagens

* Formato padrão: **WebP** para todas as imagens estáticas e uploads.
* Ilustrações de estado (erro, onboarding): max 600px de largura.
* Imagens de landing page: max 800px de largura.
* Logo: max 400px, servida em WebP (`brand/logo.webp`, `brand/logo-branca.webp`).
* Logo para email: PNG separado (`brand/logo-branca-email.png`) por compatibilidade.
* Uploads do usuário/admin: comprimidos automaticamente no cliente para WebP (max 1200px, qualidade 82%) via `core/utils/image-compress.util.ts`.
* Avatares: max 512px, WebP, qualidade 80%.

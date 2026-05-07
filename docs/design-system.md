# Design System — Projeto Med

Direção visual: plataforma educacional médica com aparência institucional, limpa e confiante. A base deve combinar uma experiência de estudo objetiva com momentos de marca mais fortes, usando azul Afya/medicina como cor principal e acentos violetas apenas em gradientes de marca.

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
* **Display institucional**: Playfair Display, usada apenas em painéis de marca, onboarding e chamadas editoriais.
* **Enunciados e alternativas**: Inter, peso 400–500 para leitura longa.

Hierarquia:

```text
Display brand: 2.875rem / 600 / Playfair Display / line-height 0.98
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
* Nome `Projeto Med` em Inter 800.
* Headline em Playfair Display, com `em` itálico para a palavra de destaque.
* Métricas em cards translúcidos com borda branca em 18% de opacidade.

Exemplo de tom:

```text
Treine com questões feitas pra sua prova.
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

## Componentes De Simulado

### QuestaoCard

```css
border: 1px solid var(--color-border);
border-radius: 0.75rem;
background: var(--color-surface);
padding: 1.5rem;
box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
```

* Número da questão: badge cinza no canto superior esquerdo.
* Enunciado: `text-base font-medium text-[--color-text]`.
* Imagem de laboratório: acima do enunciado, `rounded-lg max-w-lg w-full mx-auto mb-4`.
* Alternativas: lista vertical com `gap-2`.

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

## Badges

```css
Nacional:    background #DBEAFE; color #1E40AF;
Processual:  background #EDE9FE; color #5B21B6;
Laboratório: background #CCFBF1; color #0F766E;
```

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

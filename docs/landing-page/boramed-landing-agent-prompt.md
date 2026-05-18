# Prompt para agente IA - Landing BoraMed inspirada na Salte

Crie uma landing page responsiva para o BoraMed, usando a landing de `https://salte.app/` apenas como referencia de arquitetura de pagina e ritmo visual. Nao copie textos, marca, assets, codigo, ilustracoes ou identidade visual da Salte. A pagina deve parecer uma versao original do BoraMed, com padrao institucional medico-educacional.

## Contexto do produto

BoraMed e uma plataforma independente de treino medico com questoes autorais no modelo das avaliacoes nacionais. O foco inicial inclui alunos da rede Afya, mas e proibido sugerir parceria, vinculo oficial, endosso ou uso de acervo/provas/questoes oficiais da Afya.

Use estas ideias: questoes autorais no modelo das avaliacoes, plataforma independente de estudo medico, treinos nacionais, simulados por tema, laboratorio, revisao guiada e historico de desempenho.

Evite: "oficial", "parceria", "acervo Afya", "questoes Afya", "provas reais", promessas absolutas de aprovacao e visual infantil.

## Objetivo da pagina

Gerar cadastro ou lista de espera para estudantes de medicina. A primeira tela deve vender o produto de forma clara e ja mostrar uma composicao visual de interface do BoraMed.

## Stack e padroes

- Angular 18+ com standalone components.
- TypeScript strict, sem `any`.
- `ChangeDetectionStrategy.OnPush`.
- Tailwind.
- Signals para estado simples.
- SEO forte: title, meta description, canonical, Open Graph, Twitter card, JSON-LD SoftwareApplication e FAQPage.
- Acessibilidade: HTML semantico, headings em ordem, labels em formularios, contraste AA, accordions acessiveis, foco visivel.
- Responsivo mobile-first.
- Respeitar `prefers-reduced-motion`.

## Design system BoraMed

Use Inter em toda a landing, incluindo a hero. Nao usar Playfair Display na LP. Paleta: `#1E40AF`, `#3B82F6`, `#1E3A8A`, `#2554DC`, `#F8FAFC`, `#FFFFFF`, `#F1F5F9`, `#E2E8F0`, `#0F172A`, `#64748B`. Gradiente: `linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)`.

Cards com raio de 8px, paineis grandes ate 16px, botoes/inputs com 8px. Evite tela inteira dominada por roxo, orbs, bokeh, blobs e cards dentro de cards. O produto e a marca precisam aparecer no primeiro viewport, e a hero deve deixar uma pista da proxima secao visivel.

## Estrutura da pagina

### 1. Header sticky

Logo BoraMed, links `Inicio`, `Treinos`, `Simulados`, `Laboratorio`, `FAQ`, CTA secundario `Entrar` e CTA principal `Comecar agora`. Mobile com menu compacto acessivel. Fundo branco com leve transparencia, blur e borda inferior.

### 2. Hero

Eyebrow: `Simulados medicos autorais`

Headline: `Treine para a prova. Revise com direcao.`

Subheadline: `O BoraMed organiza treinos nacionais, simulados por tema e questoes de laboratorio para estudantes de medicina que precisam estudar com foco.`

CTA: botao principal `Comecar agora`, botao secundario `Conhecer os modulos`, nota `Plataforma independente. Questoes autorais no modelo das avaliacoes.`

Visual: frame estilo janela do macOS contendo a imagem `/landing-page/heroImage.png` ocupando a area interna da janela. A imagem deve ficar dentro da moldura, responsiva, com `object-fit: cover` e foco no topo.

Ticker discreto: Treinos nacionais, Simulados por tema, Questoes autorais, Revisao guiada, Historico, Laboratorio, Streak de estudo.

### 3. Publicos/modos de treino

Titulo: `Do treino nacional a revisao por tema.`

Descricao: `Monte uma rotina de estudo com simulados que respeitam seu objetivo, seu tempo e seu historico.`

Cards:

- Treinos Nacionais: `Simulados autorais no modelo das avaliacoes nacionais, com foco inicial em alunos da rede Afya.` Visual inline com icone medico/abstrato, sem foto de estudante.
- Simulados Processuais: `Escolha temas e quantidade de questoes. A montagem aleatoria acontece no servidor.` Placeholder `/landing/placeholders/hero-dashboard.webp`.
- Laboratorio: `Questoes autorais com imagem de laminas ou pecas para treinar reconhecimento e raciocinio visual.` Placeholder `/landing/placeholders/lab-slide.webp`.

### 4. Solucao com tabs

Titulo: `Um sistema de estudo para simulado, revisao e evolucao.`

Descricao: `Tudo que voce precisa para transformar tentativa em diagnostico e diagnostico em proximo treino.`

Tabs com signals:

- Treinar: `Simulados com montagem inteligente`; features: Questoes autorais, Sorteio server-side, Timer e progresso, Modo estudo, Retomar tentativa.
- Revisar: `Erros viram rota de revisao`; features: Resumo da nota, Temas criticos, Revisao de erros, Explicacao por questao, Refazer em modo estudo.
- Acompanhar: `Historico para medir consistencia`; features: Historico, Evolucao da nota, Desempenho por tema, Conquistas discretas, Ranking controlado.

### 5. Passo a passo

Titulo: `Comece pequeno, revise melhor e aumente a dificuldade.`

Cards: Hoje/Crie sua conta, Primeiro treino/Monte um simulado, Depois/Revise pelo diagnostico. Desktop horizontal, mobile vertical.

### 6. Bloco institucional em gradiente

Titulo: `A plataforma transforma desempenho em proximo passo.`

Descricao: `Use dados do simulado para entender prioridade de revisao, progresso por tema e pontos de atencao antes da proxima tentativa.`

Visual com cards transluidos: score summary, barras por tema, painel de recomendacao e placeholder `/landing/placeholders/boramed-illustration.webp`. Nao fazer alegacoes de IA clinica autonoma ou acesso a prova oficial.

### 7. Modulos

Titulo: `Tres frentes para treinar melhor.`

- Nacional: `Treinos autorais organizados para simular ritmo, extensao e cobranca das avaliacoes.`
- Processual: `Monte baterias focadas para revisar conteudos especificos antes ou depois das provas.`
- Laboratorio: `Pratique leitura visual com questoes que reservam espaco obrigatorio para imagem.`

Badges: Nacional `#DBEAFE/#1E40AF`, Processual `#EDE9FE/#5B21B6`, Laboratorio `#CCFBF1/#0F766E`.

### 8. Capacidades

Titulo: `Menos tentativa solta. Mais rotina de estudo.`

- Diagnosticar: `Veja aproveitamento por tema, historico e padroes de erro.`
- Direcionar: `Volte direto para revisao de erros e temas com menor aproveitamento.`
- Treinar: `Gere novas tentativas com regras consistentes e montagem no servidor.`

### 9. FAQ

Accordion acessivel com:

1. `O BoraMed tem vinculo oficial com alguma instituicao?` Resposta: `Nao. O BoraMed e uma plataforma independente com questoes autorais no modelo das avaliacoes.`
2. `As questoes sao oficiais?` Resposta: `Nao. As questoes sao autorais e criadas para treinar raciocinio e formato de prova sem usar acervo oficial.`
3. `Como os simulados sao montados?` Resposta: `A montagem e o sorteio das questoes acontecem no servidor, preservando regras consistentes e evitando logica sensivel no cliente.`
4. `Existe simulado de laboratorio?` Resposta: `Sim. Questoes de laboratorio usam imagem como parte obrigatoria do enunciado.`
5. `Consigo revisar meus erros?` Resposta: `Sim. Apos finalizar, voce pode revisar erros, temas criticos e refazer em modo estudo.`

Adicionar FAQPage JSON-LD.

### 10. CTA final e footer

Headline: `Estude com simulados autorais e revise com direcao.`

Descricao: `Entre na lista ou crie sua conta para acompanhar os proximos modulos do BoraMed.`

CTAs: `Comecar agora`, `Conhecer os modulos`.

Footer: Termos, Privacidade, Contato, texto legal `BoraMed. Plataforma independente de estudo medico.`

## Placeholders de imagem

Reserve espacos e use paths genericos:

- `/landing/placeholders/lab-slide.webp`
- `/landing/placeholders/boramed-illustration.webp`
- `/landing-page/heroImage.png` para a imagem principal da hero

Cada imagem deve ter `alt` descritivo, `width`/`height` ou `aspect-ratio`, e lazy loading quando estiver abaixo da dobra.

## Validacao antes de finalizar

- Desktop, tablet e mobile.
- Nenhum texto estoura o container.
- Header mobile funciona.
- Tabs e FAQ sao acessiveis por teclado.
- `prefers-reduced-motion` reduz animacoes.
- Hero mostra o produto no primeiro viewport.
- A pagina deixa a proxima secao aparecer no primeiro viewport.
- Build/lint sem erros.

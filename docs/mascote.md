# Poloca — DNA do Mascote BoraMed

Poloca é o polvo mascote do BoraMed. Este documento é o arquivo-fonte de identidade visual — qualquer asset gerado (via IA, vetor ou animação) deve respeitá-lo. Se algo mudar aqui, atualizar todos os assets existentes.

---

## Identidade

- **Nome:** Poloca
- **Espécie:** Polvo (octopus)
- **Personalidade:** calmo, curioso, inteligente. O colega de estudo que parece não estar se estressando — mas está dentro de tudo. Nunca eufórico, nunca desesperado.
- **Voz de marca (copy):** "O Poloca ficou te esperando." / "O Poloca te parabeniza." / "Bora estudar com o Poloca."

---

## Traços Fixos (nunca mudam)

Estes elementos identificam o Poloca em qualquer pose, tamanho ou animação:

1. **Corpo oval compacto** — levemente mais largo que alto. Não muda de forma base.
2. **Cor do corpo: gradiente institucional da marca** — `linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)`. Direção sempre diagonal (145deg). Em SVG: `<linearGradient>` com os 3 stops. Não usar azul flat.
3. **Profundidade:** área mais escura/saturada na base do corpo (`#1E3A8A` a 30%) + highlight radial branco no topo direito (18%). Dá volume sem sair do flat.
4. **6–8 tentáculos visíveis** — simplificados, com curvaturas suaves. Ventosas como pequenos círculos `#FFFFFF` com 40% de opacidade.
5. **Olhos: 2 círculos brancos grandes** com pupila oval preta levemente droopada. Tamanho: ~30% da largura do corpo cada.
6. **Sobrancelhas: 2 formas ovais/retangulares arredondadas, azul escuro (`#1E3A8A`)**, posicionadas acima dos olhos. Ângulo e posição variam por expressão — são o principal vetor de emoção. (Branco não funciona contra o gradiente — escuro tem mais contraste e leitura.)
7. **Boca: linha curva simples, branca**, fechada sempre. Posição varia por expressão. Sem dentes, sem boca aberta.
8. **Contorno:** linha de 2px em `#1E3A8A` ao redor do corpo. Tentáculos sem contorno separado.

---

## Paleta

| Elemento                        | Cor                      | Hex                                                                                                                  |
| ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Corpo                           | Gradiente institucional  | `#1E40AF` → `#2451D8` → `#6427D9` (145deg)                                                                   |
| Contorno                        | Azul escuro              | `#1E3A8A`                                                                                                          |
| Highlight do corpo              | Branco translúcido      | `rgba(255,255,255,0.18)` — radial no canto superior direito (espelha o `--gradient-brand-highlight` do sistema) |
| Sombra de profundidade          | Azul escuro translúcido | `rgba(30,58,138,0.30)` — base do corpo                                                                            |
| Tentáculos                     | Mesma lógica do corpo   | Gradiente mais escuro ou `#1E40AF` flat                                                                            |
| Olhos (esclera)                 | Branco                   | `#FFFFFF`                                                                                                          |
| Pupila                          | Preto suave              | `#0F172A`                                                                                                          |
| Sobrancelhas                    | Azul escuro              | `#1E3A8A` — mais legível contra o gradiente do corpo                                                              |
| Boca                            | Azul escuro              | `#1E3A8A`                                                                                                          |
| Ventosas                        | Branco translúcido      | `rgba(255,255,255,0.40)`                                                                                           |
| Estetoscópio (quando presente) | Branco                   | `#FFFFFF` — contrasta com o corpo colorido                                                                        |
| Acento ocasional                | Teal da marca            | `rgba(13,148,136,0.22)` — só em badges/celebração, espelhando `--gradient-brand-accent`                      |

Sem cores fora desta paleta.

---

## Expressões

Apenas 3 expressões. Não criar variações fora destas.

| Expressão                      | Quando usar                        | Olhos                                      | Sobrancelhas                                                                    | Boca                                               | Tentáculos             |
| ------------------------------- | ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| **Concentrado** (default) | Auth, loading, estudo              | Levemente semicerrados, pupilas centradas  | Retas, levemente baixas — seriedade calma                                      | Linha reta ou levíssima curva para baixo          | 2 para baixo/lado       |
| **Satisfeito**            | Resultado ≥70%, conclusão        | Semicerrados, pupilas curvadas para cima   | Levantadas e arqueadas — contentamento                                         | Curva suave para cima (sorriso fechado e discreto) | 1 levantado             |
| **Encorajador**           | Resultado <70%, erro, empty states | Abertos normais, pupilas levemente de lado | Uma levemente arqueada, outra mais reta — expressão assimétrica de "vai lá" | Linha levemente de lado, neutra                    | 1 apontando para frente |

Nunca: boca aberta, dentes aparecendo, olhos arregalados de susto, sobrancelhas em V de raiva, postura caída de derrota.

---

## Acessórios (opcionais por contexto)

- **Estetoscópio:** enrolado em um tentáculo. Aparece em telas institucionais (auth, onboarding). Cor `#2554DC`.
- **Nenhum acessório:** em celebrações e resultados — o Poloca celebra puro, sem objetos.
- **Jamais:** jaleco, chapéu, óculos, outros acessórios não listados aqui. Qualquer novo acessório requer atualização deste documento.

---

## Proporções e Tamanhos

| Uso                    | Tamanho    | Notas                                     |
| ---------------------- | ---------- | ----------------------------------------- |
| Hero (auth/onboarding) | 200–280px | Com estetoscópio                         |
| Card de resultado      | 120–160px | Sem acessório                            |
| Empty state            | 80–120px  | Concentrado ou encorajador                |
| Ícone / badge         | 32–48px   | Só corpo + olhos, sem tentáculos extras |
| Favicon                | 16–32px   | Só silhueta oval + olhos                 |

Silhueta legível em 32px = teste mínimo antes de aprovar qualquer variação.

---

## O que o Poloca nunca faz

- Não pula, não dança, não agita tentáculos em festa.
- Não aparece em toda tela — só em momentos pontuais (auth, vazios, resultado, onboarding).
- Não tem cores fora da paleta acima.
- Não tem expressão de derrota (triste, chorando) — encorajador é o limite inferior.
- Não tem menos de 6 tentáculos visíveis — parece incompleto.
- Não abre a boca, não mostra dentes.
- Sobrancelhas nunca em V de raiva ou arco exagerado de surpresa.

---

## Prompt base para geração com IA

Curto e referencial — deixar a IA interpretar o estilo, não descrever cada pixel.

**Prompt base:**

```
Duolingo-style mascot but an octopus. Body gradient from deep blue (#1E40AF) 
to violet (#6427D9). Expressive face with eyebrows and a small closed mouth. 
Flat vector illustration, white background.
```

**Variações por expressão** (adicionar ao final do prompt base):

```
focused / studying expression    →  + "focused, calm, slightly serious expression"
satisfied / celebrating          →  + "happy, satisfied expression, one tentacle raised"
encouraging / supportive         →  + "gentle encouraging expression, one tentacle pointing forward"
```

**Com acessório médico:**

```
+ "wearing a white stethoscope around its neck"
```

**Se o resultado ficar muito infantil:**

```
+ "adult tone, not too cute, restrained and confident"
```

Mudar **uma coisa por vez** entre gerações. Sempre salvar o prompt que gerou o resultado aprovado.

---

## Arquivos

```
frontend/public/illustrations/
  funny.png                     # onboarding MVP, raster com estetoscópio

frontend/src/assets/illustrations/
  poloca-concentrado.svg        # expressão default
  poloca-satisfeito.svg         # resultado ≥70%
  poloca-encorajador.svg        # resultado <70%
  poloca-auth.svg               # com estetoscópio, para BrandPanel
  poloca-icon.svg               # versão 32px (só corpo + olhos)
```

Nomenclatura ideal: sempre `poloca-[contexto].svg`. Exceção documentada: onboarding MVP usa `funny.png` raster porque a versão vetorial ficou abaixo do padrão visual esperado.

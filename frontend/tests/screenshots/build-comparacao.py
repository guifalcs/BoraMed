#!/usr/bin/env python3
"""Monta uma página única (HTML autocontido) com o antes/depois de cada ponto
da auditoria de texto no mobile. Imagens embutidas em base64 para o arquivo ser
portátil — pode mover, anexar ou abrir de qualquer lugar."""
import base64, json, pathlib, struct

BASE = pathlib.Path(__file__).parent
OUT = BASE / 'out'

PONTOS = [
    ("p1-page-header-simulados", "1. Subtítulo do page-header — Simulados",
     "Some em 7 telas de uma vez (1 arquivo). O título + breadcrumb já dão o contexto. "
     "Continua legível por leitor de tela (sr-only), não foi deletado.",
     "“Comece por um treino nacional pronto ou monte uma prática personalizada.”"),
    ("p1-page-header-historico", "1. Subtítulo do page-header — Histórico",
     "Mesma mudança, outra tela. Ganha uma linha inteira acima da dobra.",
     "“Acompanhe sua evolução e desempenho nos simulados.”"),
    ("p2-kpis-inicio", "2. Terceira linha dos KPIs do Início",
     "Os 4 cards ficam meia-largura no mobile, com 3 linhas cada. A 3ª é redundante com o número.",
     "“todas as tentativas” · “simulado mais recente” · “em 12 simulados” · “460 XP na semana”"),
    ("p3a-faixa-continuar", "3a. Faixa “continuar simulado”",
     "Texto curto no mobile; o chip “Continuar →” à direita já comunica a ação.",
     "“Você tem um simulado para continuar” → “Continuar simulado”"),
    ("p3b-desafio-do-dia", "3b. Card Desafio do dia",
     "O CTA “Fazer agora →” já diz o que fazer.",
     "“Responda a questão de hoje e ganhe XP.”"),
    ("p3c-card-comunidade", "3c. Card da Comunidade",
     "Tinha 3 linhas para um card cuja ação é um botão “Entrar”. Sobra o nome.",
     "“COMUNIDADE” (eyebrow) e “Networking e troca de conteúdo”"),
    ("p3d-evolucao-notas", "3d. Contador do gráfico de evolução",
     "O chip “média 67%” à direita já qualifica o recorte.",
     "“últimas 6 notas”"),
    ("p4a-formatos", "4a. Descrições dos formatos (Montar simulado)",
     "6 cards em coluna única, cada um com legenda que quebrava em 2–3 linhas. Os labels se explicam.",
     "“Múltipla escolha e verdadeiro/falso”, “Questões aplicadas em contexto clínico e raciocínio "
     "diagnóstico”, “Questões com imagens de lâminas e peças anatômicas” etc."),
    ("p4b-temas-dica", "4b. Dica do filtro de temas",
     "O “(opcional)” no próprio título já diz a mesma coisa.",
     "“Deixe vazio para sortear de todos os temas disponíveis.”"),
    ("p5-cards-simulados", "5. Os dois cards do hub de Simulados",
     "Os chips carregam a informação; o parágrafo era o ruído. O aviso “Disponível no plano Avançado” "
     "continua visível quando o card está bloqueado.",
     "2 parágrafos de 2 linhas + chip “Laboratório com imagem” → “Laboratório”"),
    ("p6a-proximos-passos", "6. “Próximos passos” do resultado",
     "3 cards em coluna única = 6 linhas de texto logo abaixo da nota. Os títulos bastam.",
     "“Revise diretamente as 6 questões em que você errou.”, “Refaça com gabarito visível e foco em "
     "fixação.”, descrição do treino prioritário"),
    ("p7a-header", "7a. Cabeçalho do Competitivo",
     "Parágrafo de apresentação que não ajuda quem já está dentro. Recomendo remover em todos os "
     "breakpoints — aqui está só oculto no mobile, para ficar dentro do escopo.",
     "“Progresso competitivo do BoraMed, começando por XP, sequência e conquistas ligadas aos simulados.”"),
    ("p7b-desafio-hoje", "7b. Seção “Desafio de hoje”",
     "O título já basta; a regra aparece ao responder.",
     "“Uma questão por dia, compartilhada com todos os usuários.”"),
    ("p7c-ranking", "7c. Seção Ranking",
     "A opção de anonimato é configurada no Perfil, não aqui.",
     "“Classificação por XP de estudo, com opção de aparecer como anônimo no perfil.”"),
    ("p8a-nivel-e-privacidade", "8a. Perfil — nível e privacidade no ranking",
     "O switch “Público/Anônimo” já mostra o estado. Label do XP encurtado.",
     "parágrafo de privacidade + “XP para o próximo nível” → “XP p/ próximo”"),
    ("p8b-cards-competitivo", "8b. Perfil — cards do competitivo",
     "Terceira linha dos 3 cards. Inclui um texto de roadmap que estava vazando para produção "
     "(“Streak Freeze entra na próxima etapa.”) — vale apagar do código, não só ocultar.",
     "intervalo da semana, “Recorde: 11 dias”, “Streak Freeze entra na próxima etapa.”"),
    ("p8c-email-helper", "8c. Perfil — helper do e-mail",
     "O campo já é readonly; o texto explicava o óbvio.",
     "“O e-mail não pode ser alterado aqui.”"),
    ("p9-kpis-historico", "9. Sublabel dos KPIs do Histórico",
     "Era o ponto de risco da auditoria (mexe na altura do card). O min-height absorveu — confira "
     "se o ritmo da grade ficou bom para você.",
     "“todas as tentativas”, “há 3 dias” etc."),
]


def png_size(path):
    with open(path, 'rb') as f:
        return struct.unpack('>II', f.read(24)[16:24])


def b64(path):
    return base64.b64encode(path.read_bytes()).decode()


blocos = []
for slug, titulo, nota, removido in PONTOS:
    a, d = OUT / 'antes' / f'{slug}.png', OUT / 'depois' / f'{slug}.png'
    if not (a.exists() and d.exists()):
        continue
    ha, hd = png_size(a)[1] // 2, png_size(d)[1] // 2
    delta = ha - hd
    selo = (f'<span class="delta ganho">−{delta}px de altura</span>' if delta > 0
            else '<span class="delta neutro">mesma altura</span>')
    blocos.append(f"""
  <section class="ponto">
    <h2>{titulo} {selo}</h2>
    <p class="nota">{nota}</p>
    <p class="removido"><strong>Texto que sai no mobile:</strong> {removido}</p>
    <div class="par">
      <figure><figcaption>ANTES · {ha}px</figcaption><img src="data:image/png;base64,{b64(a)}" alt="antes"></figure>
      <figure><figcaption class="ok">DEPOIS · {hd}px</figcaption><img src="data:image/png;base64,{b64(d)}" alt="depois"></figure>
    </div>
  </section>""")

html = f"""<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<title>BoraMed — auditoria de texto no mobile (antes/depois)</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:2rem 1.25rem 4rem; background:#f6f7f9; color:#111827;
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
  .wrap {{ max-width: 1120px; margin: 0 auto; }}
  header.topo {{ margin-bottom: 2rem; }}
  h1 {{ font-size:1.6rem; margin:0 0 .4rem; }}
  .sub {{ color:#6b7280; margin:0; }}
  .ponto {{ background:#fff; border:1px solid #e5e7eb; border-radius:14px;
            padding:1.25rem 1.25rem 1.5rem; margin-bottom:1.25rem; }}
  .ponto h2 {{ font-size:1.02rem; margin:0 0 .5rem; display:flex; gap:.6rem;
               align-items:center; flex-wrap:wrap; }}
  .nota {{ margin:0 0 .5rem; color:#4b5563; font-size:.9rem; }}
  .removido {{ margin:0 0 1rem; color:#6b7280; font-size:.82rem;
               background:#f9fafb; border-left:3px solid #d1d5db;
               padding:.5rem .7rem; border-radius:0 6px 6px 0; }}
  .removido strong {{ color:#374151; }}
  .delta {{ font-size:.72rem; font-weight:700; padding:.15rem .5rem;
            border-radius:999px; letter-spacing:.01em; }}
  .ganho {{ background:#ecfdf5; color:#047857; }}
  .neutro {{ background:#f3f4f6; color:#6b7280; }}
  .par {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; align-items:start; }}
  figure {{ margin:0; }}
  figcaption {{ font-size:.7rem; font-weight:700; letter-spacing:.06em;
                color:#9ca3af; margin-bottom:.4rem; }}
  figcaption.ok {{ color:#047857; }}
  img {{ width:100%; height:auto; display:block; border:1px solid #e5e7eb;
         border-radius:10px; background:#fff; }}
  @media (max-width: 760px) {{ .par {{ grid-template-columns:1fr; }} }}
</style>
<div class="wrap">
  <header class="topo">
    <h1>Redução de texto no mobile — antes / depois</h1>
    <p class="sub">Chromium 390×844 (iPhone 12), dados mockados, recortes reais da aplicação.
       Nada foi deletado do desktop: tudo volta a partir de 640px (o Perfil usa o breakpoint de
       768px que o arquivo já tinha).</p>
  </header>
{''.join(blocos)}
</div>
</html>"""

destino = BASE / 'comparacao-mobile.html'
destino.write_text(html, encoding='utf-8')
print(f'{destino} — {len(blocos)} pontos, {destino.stat().st_size/1024/1024:.1f} MB')

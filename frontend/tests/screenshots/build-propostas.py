#!/usr/bin/env python3
"""Página antes/depois das propostas que ficaram abertas após a auditoria de
texto. Cada proposta mostra mobile e desktop, para provar que a correção do
mobile não mexe no que já funcionava."""
import base64, pathlib, struct

BASE = pathlib.Path(__file__).parent
OUT = BASE / 'out' / 'propostas'

PROPOSTAS = [
    {
        "titulo": "Q1. Cards do hub de Simulados quebrando em 390px",
        "problema":
            "O card é um <code>flex items-center</code> de três colunas: ícone (56px) · conteúdo · "
            "seta (44px). Em 390px, depois do padding da página (32px), do <code>p-7</code> do card "
            "(56px), do ícone, da seta e dos dois <code>gap-6</code> (48px), sobram <strong>154px</strong> "
            "para o texto. Daí o título quebrar em duas linhas e os chips empilharem um por linha. "
            "Isso é anterior à auditoria de texto — reduzir o parágrafo aliviou, não resolveu.",
        "correcao":
            "<code>flex-col sm:flex-row</code> nos dois cards (empilha só no mobile) e a seta "
            "<code>hidden sm:flex</code>. A seta sai porque, empilhada, ela virava um elemento solto no "
            "canto inferior esquerdo — e no toque não existe hover para ela sinalizar; o card inteiro "
            "já é o link. Padding <code>p-6</code> no mobile, <code>sm:p-7</code> daí para cima.",
        "shots": [("q1-hub-cards", "mobile", "390px"), ("q1-hub-cards", "desktop", "1280px")],
    },
    {
        "titulo": "Q1b. Caso de risco: card bloqueado (plano gratuito)",
        "problema":
            "No plano gratuito o card de Montar simulado troca a seta por um botão de texto "
            "<strong>“Fazer upgrade”</strong> e mostra “Disponível no plano Avançado.”. Como a mudança "
            "acima empilha o card e esconde a seta, precisa provar que esse CTA não sumiu nem "
            "desalinhou — é a conversão da tela.",
        "correcao":
            "O <code>hidden sm:flex</code> foi aplicado só na seta. O botão “Fazer upgrade” e o texto de "
            "bloqueio continuam intactos no mobile, agora empilhados abaixo do título.",
        "shots": [("q3-hub-bloqueado", "mobile", "390px")],
    },
    {
        "titulo": "Q2. Parágrafo de apresentação do Competitivo",
        "problema":
            "“Progresso competitivo do BoraMed, começando por XP, sequência e conquistas ligadas aos "
            "simulados.” — descreve o que a própria tela mostra logo abaixo (XP total, XP da semana, "
            "sequência). Quem abriu a página já sabe do que ela trata. Na auditoria eu só ocultei no "
            "mobile; <strong>no desktop a frase continua lá</strong>, e é isso que falta decidir.",
        "correcao":
            "Remover as 3 linhas do <code>competir-hub.component.html</code>. O mobile não muda (já "
            "estava oculto); o desktop perde a frase e o cabeçalho encosta nos números.",
        "shots": [("q2-competitivo-header", "desktop", "1280px")],
    },
]


def altura(path):
    with open(path, 'rb') as f:
        return struct.unpack('>II', f.read(24)[16:24])[1] // 2


def b64(path):
    return base64.b64encode(path.read_bytes()).decode()


blocos = []
for prop in PROPOSTAS:
    pares = []
    for slug, vp, rotulo in prop["shots"]:
        a, d = OUT / vp / 'antes' / f'{slug}.png', OUT / vp / 'depois' / f'{slug}.png'
        if not (a.exists() and d.exists()):
            continue
        ha, hd = altura(a), altura(d)
        delta = ha - hd
        if delta > 0:
            selo = f'<span class="delta ganho">−{delta}px</span>'
        elif delta < 0:
            selo = f'<span class="delta atencao">+{-delta}px</span>'
        else:
            selo = '<span class="delta neutro">sem mudança de altura</span>'
        pares.append(f"""
      <div class="vp">
        <h3>{vp.upper()} · {rotulo} {selo}</h3>
        <div class="par">
          <figure><figcaption>ANTES · {ha}px</figcaption><img src="data:image/png;base64,{b64(a)}" alt="antes"></figure>
          <figure><figcaption class="ok">DEPOIS · {hd}px</figcaption><img src="data:image/png;base64,{b64(d)}" alt="depois"></figure>
        </div>
      </div>""")

    blocos.append(f"""
  <section class="ponto">
    <h2>{prop['titulo']}</h2>
    <div class="cx">
      <p class="rot">O problema</p>
      <p>{prop['problema']}</p>
    </div>
    <div class="cx cx--fix">
      <p class="rot">A correção proposta</p>
      <p>{prop['correcao']}</p>
    </div>
{''.join(pares)}
  </section>""")

html = f"""<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<title>BoraMed — propostas abertas (antes/depois)</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:2rem 1.25rem 4rem; background:#f6f7f9; color:#111827;
         font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
  .wrap {{ max-width: 1180px; margin: 0 auto; }}
  h1 {{ font-size:1.6rem; margin:0 0 .4rem; }}
  .sub {{ color:#6b7280; margin:0 0 2rem; }}
  .ponto {{ background:#fff; border:1px solid #e5e7eb; border-radius:14px;
            padding:1.4rem; margin-bottom:1.5rem; }}
  .ponto h2 {{ font-size:1.1rem; margin:0 0 1rem; }}
  .cx {{ background:#f9fafb; border-left:3px solid #d1d5db; border-radius:0 8px 8px 0;
         padding:.75rem .95rem; margin-bottom:.75rem; }}
  .cx--fix {{ background:#f0fdf4; border-left-color:#34d399; margin-bottom:1.5rem; }}
  .cx p {{ margin:0; font-size:.9rem; color:#374151; }}
  .rot {{ font-size:.68rem !important; font-weight:800; letter-spacing:.08em;
          text-transform:uppercase; color:#6b7280 !important; margin-bottom:.35rem !important; }}
  .cx--fix .rot {{ color:#047857 !important; }}
  code {{ background:#eef2f7; padding:.08em .35em; border-radius:4px;
          font-size:.86em; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }}
  .cx--fix code {{ background:#d9f5e6; }}
  .vp {{ margin-top:1.5rem; padding-top:1.25rem; border-top:1px dashed #e5e7eb; }}
  .vp:first-of-type {{ border-top:0; padding-top:0; margin-top:0; }}
  .vp h3 {{ font-size:.72rem; font-weight:800; letter-spacing:.07em; color:#374151;
            margin:0 0 .7rem; display:flex; gap:.55rem; align-items:center; flex-wrap:wrap; }}
  .delta {{ font-size:.7rem; font-weight:700; padding:.12rem .5rem; border-radius:999px;
            letter-spacing:0; text-transform:none; }}
  .ganho {{ background:#ecfdf5; color:#047857; }}
  .atencao {{ background:#fffbeb; color:#b45309; }}
  .neutro {{ background:#f3f4f6; color:#6b7280; }}
  .par {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; align-items:start; }}
  figure {{ margin:0; }}
  figcaption {{ font-size:.68rem; font-weight:700; letter-spacing:.06em; color:#9ca3af;
                margin-bottom:.4rem; }}
  figcaption.ok {{ color:#047857; }}
  img {{ width:100%; height:auto; display:block; border:1px solid #e5e7eb;
         border-radius:10px; background:#fff; }}
  @media (max-width: 820px) {{ .par {{ grid-template-columns:1fr; }} }}
</style>
<div class="wrap">
  <h1>Propostas abertas — antes / depois</h1>
  <p class="sub">Os dois pontos que sobraram da auditoria de texto, com print do problema e da
     correção. Mobile 390×844 e desktop 1280×900, Chromium, dados mockados.
     <strong>Não commitado</strong> — é proposta.</p>
{''.join(blocos)}
</div>
</html>"""

destino = BASE / 'comparacao-propostas.html'
destino.write_text(html, encoding='utf-8')
print(f'{destino} — {destino.stat().st_size/1024/1024:.1f} MB')

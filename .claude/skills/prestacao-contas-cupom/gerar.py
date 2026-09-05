#!/usr/bin/env python3
"""Gera o PDF de prestação de contas por cupom com a estética BoraMed.

Uso: python3 gerar.py dados.json saida.pdf
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))

CHROME_CANDIDATOS = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    shutil.which("chromium"),
    shutil.which("chromium-browser"),
    shutil.which("google-chrome"),
]


def chrome() -> str:
    for c in CHROME_CANDIDATOS:
        if c and os.path.exists(c):
            return c
    # glob para outras versões do browser do Playwright
    import glob
    for c in glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"):
        return c
    sys.exit("Chromium não encontrado — instale o chromium ou ajuste CHROME_CANDIDATOS.")


def brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def html(d: dict) -> str:
    logo = base64.b64encode(open(os.path.join(AQUI, "logo-branca.webp"), "rb").read()).decode()
    vendas = d["vendas"]
    total_base = sum(v["base"] for v in vendas)
    total_com = sum(v["comissao"] for v in vendas)
    base_label = d.get("base_label", "Valor pago")

    linhas = "".join(
        f'<tr><td>{v["data"]}</td><td>{v["assinante"]}</td><td>{v.get("plano","—")}</td>'
        f'<td>{v.get("unidade","—")}</td><td class="num">{brl(v["base"])}</td>'
        f'<td class="num">{v["percentual"]:g}%</td><td class="num">{brl(v["comissao"])}</td></tr>'
        for v in vendas
    )
    notas = "".join(f"<li>{n}</li>" for n in d.get("notas", []))

    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prestação de contas</title>
<style>
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#0f172a; background:#fff; }}
.page {{ width:210mm; min-height:297mm; padding:0 0 18mm; }}
header {{ background:linear-gradient(145deg,#1e40af 0%,#2451d8 48%,#6427d9 100%); color:#fff; padding:16mm 16mm 12mm; }}
header img {{ height:11mm; display:block; margin-bottom:7mm; }}
h1 {{ font-size:20pt; margin:0 0 2mm; font-weight:700; letter-spacing:-.2px; }}
.sub {{ font-size:10pt; opacity:.85; margin:0; }}
main {{ padding:10mm 16mm 0; }}
.meta {{ display:flex; gap:6mm; margin-bottom:8mm; }}
.meta div {{ flex:1; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:4mm 5mm; }}
.meta span {{ display:block; font-size:8pt; text-transform:uppercase; letter-spacing:.6px; color:#64748b; margin-bottom:1.5mm; }}
.meta strong {{ font-size:11pt; font-weight:600; }}
h2 {{ font-size:11pt; margin:0 0 3mm; color:#1e3a8a; text-transform:uppercase; letter-spacing:.8px; }}
table {{ width:100%; border-collapse:collapse; font-size:9.5pt; margin-bottom:8mm; }}
th {{ text-align:left; background:#f1f5f9; color:#334155; font-size:8pt; text-transform:uppercase; letter-spacing:.5px; padding:3mm; border-bottom:1px solid #e2e8f0; }}
td {{ padding:3mm; border-bottom:1px solid #e2e8f0; }}
td.num, th.num {{ text-align:right; white-space:nowrap; }}
tfoot td {{ font-weight:700; background:#f8fafc; border-bottom:none; }}
.total {{ background:linear-gradient(145deg,#1e40af 0%,#2451d8 48%,#6427d9 100%); color:#fff; border-radius:12px; padding:6mm 7mm; display:flex; justify-content:space-between; align-items:center; margin-bottom:8mm; }}
.total span {{ font-size:10pt; opacity:.9; }}
.total strong {{ font-size:20pt; }}
ul {{ margin:0; padding-left:5mm; font-size:9pt; color:#475569; line-height:1.6; }}
footer {{ margin-top:10mm; padding-top:4mm; border-top:1px solid #e2e8f0; font-size:8pt; color:#64748b; text-align:center; }}
</style></head><body><div class="page">
<header>
  <img src="data:image/webp;base64,{logo}" alt="BoraMed">
  <h1>Prestação de contas &middot; Cupom {d["cupom"]}</h1>
  <p class="sub">{d["afiliado"]} &middot; Período: {d["periodo"]} &middot; Emitido em {d["emitido_em"]}</p>
</header>
<main>
  <div class="meta">
    <div><span>Cupom</span><strong>{d["cupom"]}{(" (" + d["cupom_desconto"] + ")") if d.get("cupom_desconto") else ""}</strong></div>
    <div><span>Vendas aprovadas</span><strong>{len(vendas)}</strong></div>
    <div><span>Comissão</span><strong>{d.get("regra_resumo","—")}</strong></div>
  </div>

  <h2>Vendas confirmadas</h2>
  <table>
    <thead><tr><th>Data</th><th>Assinante</th><th>Plano</th><th>Unidade</th><th class="num">{base_label}</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
    <tbody>{linhas}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="num">{brl(total_base)}</td><td class="num"></td><td class="num">{brl(total_com)}</td></tr></tfoot>
  </table>

  <div class="total"><span>Valor a receber</span><strong>{brl(total_com)}</strong></div>

  {"<h2>Como foi calculado</h2><ul>" + notas + "</ul>" if notas else ""}

  <footer>BoraMed &middot; Documento gerado a partir dos pagamentos aprovados registrados na plataforma.</footer>
</main>
</div></body></html>"""


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("uso: gerar.py dados.json saida.pdf")
    dados = json.load(open(sys.argv[1], encoding="utf-8"))
    saida = os.path.abspath(sys.argv[2])
    with tempfile.TemporaryDirectory() as tmp:
        pagina = os.path.join(tmp, "prestacao.html")
        with open(pagina, "w", encoding="utf-8") as f:
            f.write(html(dados))
        subprocess.run(
            [chrome(), "--headless", "--disable-gpu", "--no-sandbox",
             "--no-pdf-header-footer", f"--print-to-pdf={saida}", pagina],
            check=True, capture_output=True,
        )
    print(saida)


if __name__ == "__main__":
    main()

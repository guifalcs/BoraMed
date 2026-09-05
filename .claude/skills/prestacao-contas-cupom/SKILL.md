---
name: prestacao-contas-cupom
description: Use ao calcular comissão de afiliado/embaixador por cupom de desconto e gerar o PDF de prestação de contas com a estética BoraMed. Ativa ao mencionar "quanto pagar de comissão", "prestação de contas", "comissão do cupom X", "quanto vendi com o cupom", ou ao citar um código de cupom junto de percentual de comissão.
---

# Prestação de contas por cupom

Calcula a comissão de um cupom num período e emite o PDF de repasse.

## 1. Colete os inputs

Obrigatórios. Pergunte só o que faltar:

- **Cupom** — código, ex. `YAS20`.
- **Período** — intervalo de datas a apurar. Aceite formatos livres ("agosto", "01/08 a 05/09", "últimos 30 dias") e converta para `data_inicio`/`data_fim` (fim inclusivo). Sem período informado, **pergunte** — nunca assuma "tudo".
- **Regras de comissão** — percentual por unidade. Ex.: 30% Afya Ipatinga, 40% demais unidades. Se só houver um percentual, aplique a todas.
- **Nome do afiliado** — para o cabeçalho do PDF.

Opcional: base de cálculo. Padrão = **valor bruto pago** (`valor_centavos`, já com o desconto do cupom). Se o usuário pedir "sobre o líquido", use `liquido_centavos` (descontada a taxa do Mercado Pago) e diga isso no PDF.

## 2. Puxe as vendas

Projeto Supabase: `gakvktwtdunljojghpff`. Via `mcp__Supabase__execute_sql`.

O cupom não vive em `pagamento`: o snapshot fica em `pagamento_intencao.cupom_id` e o pagamento aponta pela `intencao_id`.

```sql
select pg.criado_em::date as data, pg.status,
       pg.valor_centavos, pg.liquido_centavos, pi.desconto_centavos,
       pr.email, pr.faculdade_unidade, pl.nome as plano
from pagamento pg
join pagamento_intencao pi on pi.id = pg.intencao_id
join cupom c on c.id = pi.cupom_id
left join profiles pr on pr.id = pg.user_id
left join assinatura a on a.id = pg.assinatura_id
left join plano pl on pl.id = a.plano_id
where c.codigo = 'YAS20'
  and pg.status = 'approved'
  and pg.criado_em >= '2026-08-01'
  and pg.criado_em < '2026-09-06'   -- fim exclusivo: dia seguinte ao fim do período
order by pg.criado_em;
```

Regras:
- Só `status = 'approved'`. Pix pendente, recusa e checkout abandonado não geram comissão.
- `faculdade_unidade` **null** = unidade não informada no perfil. Não chute: mostre a venda e **pergunte ao usuário** de qual unidade é antes de fechar a conta.
- Zero linhas → informe que não houve venda no período e não gere PDF.

## 3. Calcule

Por venda: `comissao = base × percentual da unidade`. Some. Arredonde só na exibição (2 casas).

Confira o total com o usuário antes de gerar o PDF quando houver qualquer ambiguidade (unidade nula, percentual não informado, dúvida sobre base).

## 4. Gere o PDF

Monte um JSON e rode o script:

```bash
cd .claude/skills/prestacao-contas-cupom
python3 gerar.py dados.json /caminho/saida.pdf
```

Formato do `dados.json`:

```json
{
  "afiliado": "Yasmin",
  "cupom": "YAS20",
  "cupom_desconto": "20% off",
  "periodo": "agosto e setembro de 2026",
  "emitido_em": "05/09/2026",
  "regra_resumo": "30% Afya Ipatinga",
  "base_label": "Valor pago",
  "vendas": [
    { "data": "28/08/2026", "assinante": "joicy.p***@gmail.com", "plano": "Essencial mensal",
      "unidade": "Afya Ipatinga", "base": 19.12, "percentual": 30, "comissao": 5.74 }
  ],
  "notas": [
    "Base: valor efetivamente pago pelo assinante, já com o desconto do cupom aplicado.",
    "Só entram pagamentos aprovados."
  ]
}
```

O script soma totais sozinho. `percentual` vira a coluna "Comissão X%".

Convenções do PDF:
- **Mascare o e-mail** do assinante (primeiros caracteres + `***@dominio`). Nunca exponha e-mail completo.
- Entregue o arquivo com `SendUserFile`.
- Salve o PDF fora do repo (scratchpad) a menos que o usuário peça para versionar.

-- Normaliza a formatação de exibição das questões do acervo.
--
-- Motivação: boa parte das questões importadas guardava tópicos em parágrafo
-- corrido (marcadores "•", travessão ou hífen no meio da frase), rótulos de
-- seção grudados no texto anterior ("Mecanismo cobrado:", "Exame físico:") e
-- parágrafos de 700–4000 caracteres. Como enunciado, enunciado de apoio e
-- explicação são renderizados como Markdown, nada disso aparecia como tópico e
-- o aluno lia blocos de texto de 10+ linhas.
--
-- Esta migration:
--   1. guarda um backup integral dos três campos de texto (questao_backup_formatacao);
--   2. corrige enunciados que dizem que a imagem está "abaixo" — no BoraMed a
--      imagem é sempre renderizada ANTES do enunciado;
--   3. reescreve os três campos com um normalizador determinístico.
--
-- Garantia verificada antes de aplicar: a projeção alfanumérica de cada campo
-- (texto sem espaços nem pontuação) é idêntica antes e depois — a normalização
-- mexe só em espaçamento e marcadores, nunca no conteúdo.

-- ---------------------------------------------------------------- 1. backup

create table if not exists public.questao_backup_formatacao (
  id               uuid primary key,
  enunciado        text,
  enunciado_apoio  text,
  explicacao       text,
  salvo_em         timestamptz not null default now()
);

alter table public.questao_backup_formatacao enable row level security;

comment on table public.questao_backup_formatacao is
  'Snapshot dos campos de texto de questao antes da normalização de formatação (migration 20260818120000). Sem policies: acessível apenas via service role.';

insert into public.questao_backup_formatacao (id, enunciado, enunciado_apoio, explicacao)
select id, enunciado, enunciado_apoio, explicacao from public.questao
on conflict (id) do nothing;

-- ------------------------------------------- 2. funções auxiliares (temporárias)

create schema if not exists fmt_fix;

-- Quebra um parágrafo em frases, sem cortar em abreviações, iniciais ou numerais.
create or replace function fmt_fix.frases(p text) returns text[] as $fn$
declare
  partes text[];
  saida  text[] := '{}';
  buf    text := '';
  i      int;
  n      int;
begin
  partes := regexp_split_to_array(p, '(?<=[.!?])[ \t]+(?=["“(]?[A-ZÀ-Ý0-9])');
  n := coalesce(array_length(partes, 1), 0);
  for i in 1 .. n loop
    buf := case when buf = '' then partes[i] else buf || ' ' || partes[i] end;
    if i < n and buf ~ '(?:\y(?:ex|Ex|etc|Dr|Dra|Sr|Sra|Prof|Profa|cf|vs|fig|Fig|aprox|obs|Obs|art|no|pág|ed|Ed|Rev|vol|cap|Cap|séc|Séc|jan|fev|mar|abr|jun|jul|ago|set|out|nov|dez|al)|\y[A-ZÀ-Ý]|\y[IVXLCDM]{1,7}|\y\d{1,2})\.$' then
      continue;
    end if;
    saida := saida || buf;
    buf := '';
  end loop;
  if buf <> '' then saida := saida || buf; end if;
  return saida;
end;
$fn$ language plpgsql immutable;

-- Divide um parágrafo longo em blocos equilibrados, cortando só em fim de frase.
create or replace function fmt_fix.quebrar(p text, limite int default 420) returns text as $fn$
declare
  fs      text[];
  blocos  text[] := '{}';
  buf     text := '';
  f       text;
  alvo    int;
  nblocos int;
  ult     int;
begin
  if p is null or length(p) <= limite then return p; end if;
  fs := fmt_fix.frases(p);
  if coalesce(array_length(fs, 1), 0) < 2 then return p; end if;

  nblocos := ceil(length(p)::numeric / limite);
  alvo    := ceil(length(p)::numeric / nblocos);

  foreach f in array fs loop
    if buf = '' then
      buf := f;
    elsif length(buf) < alvo and length(buf) + 1 + length(f) <= limite then
      buf := buf || ' ' || f;
    else
      blocos := blocos || buf;
      buf := f;
    end if;
  end loop;

  if buf <> '' then
    ult := coalesce(array_length(blocos, 1), 0);
    if ult >= 1 and length(buf) < 120 and length(blocos[ult]) + 1 + length(buf) <= limite then
      blocos[ult] := blocos[ult] || ' ' || buf;
    else
      blocos := blocos || buf;
    end if;
  end if;

  return array_to_string(blocos, E'\n\n');
end;
$fn$ language plpgsql immutable;

-- "Rótulo: valor. Rótulo: valor. …" (dados de exame) vira lista markdown.
create or replace function fmt_fix.listar_dados(p text) returns text as $fn$
declare
  qtd int;
begin
  qtd := (select count(*) from regexp_matches(p, '(?:^|(?<=[.;])[ \t])[A-ZÀ-Ý][^.:;\n]{2,45}:[ \t]', 'g'));
  if qtd < 3 then return p; end if;
  if length(p) / qtd > 160 then return p; end if;
  p := regexp_replace(p, '(?<=[.;])[ \t]+(?=[A-ZÀ-Ý][^.:;\n]{2,45}:[ \t])', E'\n- ', 'g');
  if p !~ '^-[ \t]' then p := '- ' || p; end if;
  return p;
end;
$fn$ language plpgsql immutable;

-- "intro: item; item; item." vira intro + lista markdown (só em bloco longo demais).
create or replace function fmt_fix.listar_ponto_virgula(p text, limite int default 420) returns text as $fn$
declare
  pos_pv int;
  cabeca text;
  k      int;
  pos_dp int;
  intro  text;
  resto  text;
  itens  text[];
  limpos text[] := '{}';
  it     text;
  i      int;
begin
  if p is null or length(p) <= limite then return p; end if;
  if (select count(*) from regexp_matches(p, ';[ \t]', 'g')) < 2 then return p; end if;

  pos_pv := position(';' in p);
  cabeca := substring(p from 1 for pos_pv);
  k := position(' :' in reverse(cabeca));
  if k = 0 then return p; end if;
  pos_dp := length(cabeca) - k;
  if pos_dp < 15 then return p; end if;

  intro := btrim(substring(p from 1 for pos_dp));
  resto := btrim(substring(p from pos_dp + 1));
  itens := regexp_split_to_array(resto, ';[ \t]*');
  if coalesce(array_length(itens, 1), 0) < 3 then return p; end if;
  if length(resto) / array_length(itens, 1) > 300 then return p; end if;

  for i in 1 .. array_length(itens, 1) loop
    it := btrim(itens[i]);
    if it <> '' then limpos := limpos || it; end if;
  end loop;
  if coalesce(array_length(limpos, 1), 0) < 3 then return p; end if;

  return intro || E'\n\n- ' || array_to_string(limpos, E'\n- ');
end;
$fn$ language plpgsql immutable;

-- Bloco que já é lista/item enumerado não pode ser quebrado por tamanho.
create or replace function fmt_fix.eh_lista(p text) returns boolean as $fn$
begin
  return p ~ '^[ \t]*(?:[-*+][ \t]|\d{1,2}[.)][ \t]|[IVXLCDM]{1,7}[ \t]*[.)\-–][ \t])'
      or p ~ '\n[ \t]*(?:[-*+][ \t]|\d{1,2}[.)][ \t]|[IVXLCDM]{1,7}[ \t]*[.)\-–][ \t])';
end;
$fn$ language plpgsql immutable;

-- Reaplica a conversão em ponto-e-vírgula nos blocos já quebrados.
create or replace function fmt_fix.pos_quebra(t text, limite int default 420) returns text as $fn$
declare
  blocos text[];
  saida  text[] := '{}';
  b      text;
begin
  blocos := regexp_split_to_array(t, E'\n[ \t]*\n');
  foreach b in array blocos loop
    if b ~ '^[ \t]*(?:[-*+][ \t]|\d{1,2}[.)][ \t]|[IVXLCDM]{1,7}[ \t]*[.)\-–][ \t])' or b ~ '\n[ \t]*[-*+][ \t]' then
      saida := saida || b;
    else
      saida := saida || fmt_fix.listar_ponto_virgula(b, limite);
    end if;
  end loop;
  return array_to_string(saida, E'\n\n');
end;
$fn$ language plpgsql immutable;

-- Linha em branco antes do primeiro item e depois do último item de cada lista.
create or replace function fmt_fix.ajustar_listas(t text) returns text as $fn$
declare
  linhas    text[];
  saida     text[] := '{}';
  l         text;
  i         int;
  eh_item   boolean;
  ant_item  boolean := false;
  ant_vazia boolean := true;
begin
  linhas := regexp_split_to_array(t, E'\n');
  for i in 1 .. coalesce(array_length(linhas, 1), 0) loop
    l := linhas[i];
    eh_item := l ~ '^[ \t]*(?:[-*+][ \t]|\d{1,2}[.)][ \t])';
    if eh_item and not ant_item and not ant_vazia then
      saida := saida || ''::text;
    elsif not eh_item and btrim(l) <> '' and ant_item then
      saida := saida || ''::text;
    end if;
    saida := saida || l;
    ant_item := eh_item;
    ant_vazia := (btrim(l) = '');
  end loop;
  return array_to_string(saida, E'\n');
end;
$fn$ language plpgsql immutable;

-- Normalizador principal. modo: 'enunciado' | 'apoio' | 'explicacao'.
create or replace function fmt_fix.normalizar(txt text, modo text default 'explicacao', limite int default 420)
returns text as $fn$
declare
  t        text;
  paras    text[];
  saida    text[] := '{}';
  p        text;
  n_marc   int;
  n_romano int;
begin
  if txt is null or btrim(txt) = '' then return txt; end if;

  t := replace(replace(txt, E'\r\n', E'\n'), E'\r', E'\n');
  t := replace(t, U&'\00A0', ' ');
  t := regexp_replace(t, '[ \t]+\n', E'\n', 'g');

  -- marcadores unicode viram itens de lista markdown
  t := regexp_replace(t, '[ \t]*[•●▪▫◦‣]+[ \t]*', E'\n- ', 'g');

  -- travessão/hífen usados como marcador de lista (só com 2+ ocorrências,
  -- para não confundir com travessão de aposto ou intervalo numérico)
  n_marc := (select count(*) from regexp_matches(t, '(?<=[:.;])[ \t]+[–—-][ \t]+(?=[A-ZÀ-Ýa-zà-ÿ])', 'g'));
  if n_marc >= 2 then
    t := regexp_replace(t, '(?<=[:.;])[ \t]+[–—-][ \t]+(?=[A-ZÀ-Ýa-zà-ÿ])', E'\n- ', 'g');
  end if;

  -- rótulos de seção começam sempre um novo parágrafo (só em início de frase)
  t := regexp_replace(
         t,
         '([.!?;:]|^|\n)[ \t]*\y((?:(?:Explica[çc][ãa]o|An[áa]lise)[ \t]+d[oae]s?[ \t]+)?(?:Mecanismo[^:\n]{0,40}cobrado|Justificativas?|Distratores?|Alternativas?[ \t]+(?:correta|incorreta)s?|Resposta[ \t]+correta|Resposta[ \t]+comentada|Coment[áa]rios?|Incorretas|Corretas|Exames?[ \t]+laboratoriais|Exames?[ \t]+complementares|(?:Ao[ \t]+)?Exame[ \t]+f[íi]sico|Sinais[ \t]+vitais|Refer[êe]ncias?[ \t]+bibliogr[áa]ficas?)[ \t]*:)',
         E'\\1\n\n\\2', 'gi');

  -- itens em numeral romano já dispostos em linha ganham parágrafo próprio
  n_romano := (select count(*) from regexp_matches(t, '(?:^|\n)[ \t]*[IVXLCDM]{1,7}[ \t]*[.)\-–][ \t]+', 'g'));
  if n_romano >= 2 then
    t := regexp_replace(t, '(?:^|\n)[ \t]*([IVXLCDM]{1,7}[ \t]*[.)\-–])[ \t]+', E'\n\n\\1 ', 'g');
  end if;

  -- subitens "a) …" / "b) …" das questões discursivas
  if modo = 'enunciado' and t ~ '\ya\)[ \t]' and t ~ '\yb\)[ \t]' then
    t := regexp_replace(t, '\s*\y([a-e])\)[ \t]+(?=[A-ZÀ-Ý])', E'\n\n\\1) ', 'g');
  end if;

  -- quebra de linha simples entre frases é ignorada pelo Markdown: vira parágrafo
  t := regexp_replace(t, '(?<=[.!?:])\n(?![ \t]*(?:[-*+][ \t]|\d{1,2}[.)][ \t]|[IVXLCDM]{1,7}[ \t]*[.)\-–][ \t]|\n))(?=[ \t]*["“(]?[A-ZÀ-Ý0-9])', E'\n\n', 'g');

  -- item de lista sem conteúdo
  t := regexp_replace(t, '(^|\n)[ \t]*[-*+][ \t]*(?=\n|$)', E'\\1', 'g');

  t := fmt_fix.ajustar_listas(t);
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  t := btrim(t, E' \n\t');

  paras := regexp_split_to_array(t, E'\n[ \t]*\n');
  foreach p in array paras loop
    p := btrim(p, E' \n\t');
    if p = '' then continue; end if;
    if p ~ '\|[^\n]*\|' then          -- tabela markdown: não mexe
      saida := saida || p;
      continue;
    end if;
    if not fmt_fix.eh_lista(p) then
      p := fmt_fix.listar_dados(p);
      if not fmt_fix.eh_lista(p) then
        p := fmt_fix.pos_quebra(fmt_fix.quebrar(p, limite), limite);
      end if;
    end if;
    saida := saida || p;
  end loop;

  t := array_to_string(saida, E'\n\n');
  t := fmt_fix.ajustar_listas(t);
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  return btrim(t, E' \n\t');
end;
$fn$ language plpgsql immutable;

-- ------------------------------------- 3. "imagem abaixo" -> "imagem acima"
--
-- A imagem da questão é renderizada ANTES do enunciado (questao-card).
-- Enunciados herdados de provas em PDF diziam "abaixo". Cada caso abaixo foi
-- conferido individualmente: só entram aqui as ocorrências em que o termo se
-- refere à imagem, nunca às alternativas/assertivas que vêm no texto.

update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'tra[çc]ado abaixo', 'traçado acima', 'gi')
  where id = 'ca551c3d-0ba1-479e-a3a5-534fd187f146';
update public.questao set enunciado = regexp_replace(enunciado, 'os quadros abaixo', 'os quadros acima', 'gi')
  where id = 'f25c0346-b811-4337-b686-3e62b8b37b8e';
update public.questao set enunciado = regexp_replace(enunciado, 'as imagens abaixo', 'as imagens acima', 'gi')
  where id = '4fa8b171-170f-48b9-b82d-5eeeeef290cb';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'As imagens abaixo', 'As imagens acima', 'g')
  where id = '163100d9-0960-4783-855a-fb70296387cd';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'A estrutura abaixo', 'A estrutura acima', 'g')
  where id = '854e2e52-fe94-44ee-8eba-2d0bf79129ea';
update public.questao set enunciado = regexp_replace(enunciado, 'o genograma abaixo', 'o genograma acima', 'gi')
  where id in ('c535a9a4-ab20-4a28-af55-b78fb81df0c2', 'd5e7228b-0f50-41d3-ba42-129d00183da4');
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'o quadro abaixo', 'o quadro acima', 'gi')
  where id = '05c2ebc6-4074-4a4f-a050-94f5345d7d52';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'O genograma abaixo', 'O genograma acima', 'g')
  where id = '8443efed-aaac-4459-9a74-2cc570c357a1';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'mostrado abaixo', 'mostrado acima', 'gi')
  where id = 'f978ab1e-c70c-45d7-9ee5-b335e37bc1ba';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'o partograma abaixo', 'o partograma acima', 'gi')
  where id = '35cb3c85-5ccc-48f0-8904-7456ca3675a1';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'partograma representado abaixo', 'partograma representado acima', 'gi')
  where id = '3a2ac6fa-970a-4193-8aa7-5e23e8388ce1';
update public.questao set enunciado_apoio = regexp_replace(enunciado_apoio, 'foram expostos abaixo', 'foram expostos acima', 'gi')
  where id = '6ede0888-4300-46e7-b877-07e2449b569f';

-- erros de digitação na referência à imagem
update public.questao set enunciado_apoio = replace(enunciado_apoio, 'imagem a acima', 'imagem acima')
  where id = '07bff38b-3e4b-45f8-b868-a88f70546674';
update public.questao set enunciado_apoio = replace(enunciado_apoio, 'acimarepresentado', 'acima representado')
  where id = '4401fb07-6487-431c-b276-414776415e32';

-- ----------------------------------------------- 4. normalização do acervo

with novo as (
  select id,
         fmt_fix.normalizar(enunciado, 'enunciado')       as e,
         fmt_fix.normalizar(enunciado_apoio, 'apoio')     as a,
         fmt_fix.normalizar(explicacao, 'explicacao')     as x
  from public.questao
)
update public.questao q
set enunciado       = n.e,
    enunciado_apoio = n.a,
    explicacao      = n.x
from novo n
where q.id = n.id
  and (q.enunciado       is distinct from n.e
    or q.enunciado_apoio is distinct from n.a
    or q.explicacao      is distinct from n.x);

-- --------------------------------------------- 5. defeitos pontuais de origem

-- Marcador de item sozinho na linha, com o texto do item na linha seguinte
-- ("1.\n\nConfusão mental nova…"): junta marcador e texto.
update public.questao set
  enunciado       = regexp_replace(enunciado,       '(^|\n)([ \t]*(?:\d{1,2}[.)]|[IVXLCDM]{1,7}[.)]|[A-Ea-e]\)))[ \t]*\n+[ \t]*(?=\S)', E'\\1\\2 ', 'g'),
  enunciado_apoio = regexp_replace(enunciado_apoio, '(^|\n)([ \t]*(?:\d{1,2}[.)]|[IVXLCDM]{1,7}[.)]|[A-Ea-e]\)))[ \t]*\n+[ \t]*(?=\S)', E'\\1\\2 ', 'g'),
  explicacao      = regexp_replace(explicacao,      '(^|\n)([ \t]*(?:\d{1,2}[.)]|[IVXLCDM]{1,7}[.)]|[A-Ea-e]\)))[ \t]*\n+[ \t]*(?=\S)', E'\\1\\2 ', 'g')
where coalesce(enunciado,'')||coalesce(enunciado_apoio,'')||coalesce(explicacao,'')
      ~ '(^|\n)[ \t]*(?:\d{1,2}[.)]|[IVXLCDM]{1,7}[.)]|[A-Ea-e]\))[ \t]*\n';

-- Tabela do escore CRB-65 desenhada com espaços: o Markdown colapsa espaço e
-- embaralhava as colunas. Vira tabela Markdown (a linha de cabeçalho vinha
-- duplicada no meio dos dados, resíduo da paginação do PDF de origem).
update public.questao
set explicacao = replace(
  explicacao,
  E'Pontuação                  Risco de mortalidade              Conduta recomendada\n0                           Baixo.                     Tratamento ambulatorial.\n\nPontuação                  Risco de mortalidade              Conduta recomendada\n1-2                         Moderado.                  Considerar hospitalização.\n\n3-4                         Alto.                      Hospitalização urgente, considerar UTI.',
  E'| Pontuação | Risco de mortalidade | Conduta recomendada |\n| --- | --- | --- |\n| 0 | Baixo | Tratamento ambulatorial |\n| 1-2 | Moderado | Considerar hospitalização |\n| 3-4 | Alto | Hospitalização urgente, considerar UTI |')
where id = '12507046-667b-433e-be4a-7f3d95bcae04';

-- Espaços repetidos no meio da frase (resíduo de extração de PDF).
update public.questao set explicacao = regexp_replace(explicacao, '[ \t][ \t]+', ' ', 'g')
where id = '9dd6953f-dc92-4526-a501-cc376450c1f8';

-- Fora de alcance desta migration (exigem decisão de conteúdo, não de formato):
--   781fd5c8-71ec-4262-bffb-f63d3d98f74d e 0417f7fc-030c-4696-adf1-1cfdb009ba9d
--     texto intercalado por extração de PDF em duas colunas — não é reconstituível
--     com regra determinística;
--   120d068e-7019-40b2-a11a-37e222fb2a9c cita "ver imagem a seguir" duas vezes
--     mas não tem imagem_url — falta a imagem, não é erro de direção.

-- ------------------------------------------------------------- 6. limpeza

drop schema fmt_fix cascade;

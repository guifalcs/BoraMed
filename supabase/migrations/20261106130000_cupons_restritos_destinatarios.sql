-- ════════════════════════════════════════════════════════════════════════════
-- Cupons restritos a e-mails / usuários específicos
--
-- Um cupom pode ser marcado como `restrito`: nesse caso só quem estiver na lista
-- de destinatários (`cupom_destinatario`) consegue usá-lo. Cada destinatário é
-- OU um usuário da plataforma (`user_id`) OU um e-mail (`email`) — o e-mail serve
-- para liberar quem ainda não tem conta: quando a pessoa se cadastrar e confirmar
-- o e-mail, o cupom passa a valer sem ninguém mexer na lista.
--
-- Decisões:
--  * `restrito` é flag explícita (e não "tem linha em cupom_destinatario"):
--    esvaziar a lista NUNCA pode transformar um cupom exclusivo em público. Cupom
--    restrito com lista vazia não é aceito pelo admin e, se existir, não vale
--    para ninguém.
--  * Match por e-mail usa `auth.users.email` com e-mail CONFIRMADO — não o e-mail
--    digitado no checkout (payer.email) nem profiles.email sem confirmação.
--  * Quem não é destinatário recebe o mesmo retorno de cupom inexistente
--    ('invalido'): não dá para descobrir que um código restrito existe.
--  * `validar_cupom` passa a ignorar `p_user_id` quando há `auth.uid()` — antes
--    qualquer autenticado podia passar o id de outra pessoa; com cupom restrito
--    isso permitiria "emprestar" a elegibilidade na prévia de preço. A edge usa
--    service_role (sem auth.uid()) e continua passando o id do JWT.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Flag + tabela de destinatários ──────────────────────────────────────
alter table public.cupom
  add column if not exists restrito boolean not null default false;

comment on column public.cupom.restrito is
  'true = só destinatários (cupom_destinatario) podem usar; lista vazia = ninguém.';

create table if not exists public.cupom_destinatario (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  cupom_id uuid not null references public.cupom(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  email text,
  constraint cupom_destinatario_um_alvo check ((user_id is null) <> (email is null)),
  constraint cupom_destinatario_email_normalizado
    check (email is null or email = lower(btrim(email)))
);

comment on table public.cupom_destinatario is
  'Destinatários de cupom restrito: um usuário (user_id) OU um e-mail (email).';

create unique index if not exists cupom_destinatario_cupom_user_uq
  on public.cupom_destinatario (cupom_id, user_id) where user_id is not null;
create unique index if not exists cupom_destinatario_cupom_email_uq
  on public.cupom_destinatario (cupom_id, email) where email is not null;
-- FK user_id → cascade ao apagar perfil: índice evita seq scan.
create index if not exists idx_cupom_destinatario_user
  on public.cupom_destinatario (user_id) where user_id is not null;

alter table public.cupom_destinatario enable row level security;

drop policy if exists cupom_destinatario_select_admin on public.cupom_destinatario;
create policy cupom_destinatario_select_admin on public.cupom_destinatario
  for select to authenticated
  using (public.is_admin());

-- Escrita só via RPC admin (security definer) / service_role. Os default
-- privileges do Supabase concedem tudo a anon/authenticated: revoga explícito.
revoke all on public.cupom_destinatario from anon, authenticated;
grant select on public.cupom_destinatario to authenticated;
grant all on public.cupom_destinatario to service_role;

-- ─── 2. validar_cupom: checagem de destinatário ─────────────────────────────
create or replace function public.validar_cupom(
  p_codigo text,
  p_plano_slug text,
  p_user_id uuid default null
)
returns table (
  valido boolean,
  motivo text,
  cupom_id uuid,
  valor_original_centavos integer,
  desconto_centavos integer,
  valor_final_centavos integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupom%rowtype;
  v_plano public.plano%rowtype;
  -- Autenticado: sempre o próprio. p_user_id só vale para service_role (edge).
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_qtd integer;
  v_desc integer;
begin
  select * into v_plano from public.plano where slug = p_plano_slug and ativo = true;
  if not found then
    return query select false, 'plano_invalido', null::uuid, null::integer, null::integer, null::integer;
    return;
  end if;

  select * into v_cupom from public.cupom where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or not v_cupom.ativo then
    return query select false, 'invalido', null::uuid, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  -- Cupom restrito: não-destinatário recebe o MESMO retorno de cupom inexistente
  -- (antes de expirado/plano/esgotado, para não vazar que o código existe).
  if v_cupom.restrito and (
    v_user is null
    or not exists (
      select 1 from public.cupom_destinatario d
      where d.cupom_id = v_cupom.id
        and (
          d.user_id = v_user
          or (d.email is not null and exists (
            select 1 from auth.users u
            where u.id = v_user
              and u.email_confirmed_at is not null
              and lower(btrim(u.email)) = d.email
          ))
        )
    )
  ) then
    return query select false, 'invalido', null::uuid, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  if v_cupom.expira_em is not null and v_cupom.expira_em < now() then
    return query select false, 'expirado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  if v_cupom.plano_id is not null and v_cupom.plano_id <> v_plano.id then
    return query select false, 'nao_aplicavel', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  -- Uso "consumido" = pagamento APROVADO (concluído). Intenção pendente/processando
  -- (checkout não finalizado, Pix/boleto não pago) NÃO gasta o cupom.
  if v_cupom.max_usos is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.status = 'aprovada';
    if v_qtd >= v_cupom.max_usos then
      return query select false, 'esgotado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
      return;
    end if;
  end if;

  if v_cupom.max_por_usuario is not null and v_user is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.user_id = v_user
        and pi.status = 'aprovada';
    if v_qtd >= v_cupom.max_por_usuario then
      return query select false, 'ja_usado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
      return;
    end if;
  end if;

  if v_cupom.tipo = 'percentual' then
    v_desc := round(v_plano.preco_centavos * v_cupom.valor / 100.0);
  else
    v_desc := v_cupom.valor;
  end if;
  if v_desc < 0 then v_desc := 0; end if;
  if v_desc > v_plano.preco_centavos then v_desc := v_plano.preco_centavos; end if;

  return query select true, 'ok', v_cupom.id,
    v_plano.preco_centavos, v_desc, v_plano.preco_centavos - v_desc;
end;
$$;

revoke all on function public.validar_cupom(text, text, uuid) from public, anon;
grant execute on function public.validar_cupom(text, text, uuid) to authenticated, service_role;

-- ─── 3. admin_listar_cupons: + restrito e destinatários ─────────────────────
create or replace function public.admin_listar_cupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'codigo'), '[]'::jsonb)
    into v_out
  from (
    select jsonb_build_object(
      'id', c.id,
      'codigo', c.codigo,
      'descricao', c.descricao,
      'tipo', c.tipo,
      'valor', c.valor,
      'plano_id', c.plano_id,
      'plano_nome', pl.nome,
      'plano_slug', pl.slug,
      'ativo', c.ativo,
      'expira_em', c.expira_em,
      'max_usos', c.max_usos,
      'max_por_usuario', c.max_por_usuario,
      'responsavel_user_id', c.responsavel_user_id,
      'responsavel_user_nome', pr.nome_completo,
      'responsavel_user_email', pr.email,
      'responsavel_nome', c.responsavel_nome,
      'comissao_ativa', c.comissao_ativa,
      'comissao_pct_ipatinga', c.comissao_pct_ipatinga,
      'comissao_pct_fora', c.comissao_pct_fora,
      'comissao_planos_avancado', c.comissao_planos_avancado,
      'comissao_planos_essencial', c.comissao_planos_essencial,
      'criado_em', c.criado_em,
      'usos', coalesce(u.usos, 0),
      'receita_centavos', coalesce(u.receita, 0),
      'expirado', c.expira_em is not null and c.expira_em < now(),
      'restrito', c.restrito,
      'destinatarios', coalesce(dest.lista, '[]'::jsonb)
    ) as linha
    from public.cupom c
    left join public.plano pl on pl.id = c.plano_id
    left join public.profiles pr on pr.id = c.responsavel_user_id
    left join lateral (
      select count(*)::int as usos, coalesce(sum(pg.valor_centavos), 0)::int as receita
      from public.pagamento pg
      join public.pagamento_intencao pi on pi.id = pg.intencao_id
      where pi.cupom_id = c.id and pg.status = 'approved'
    ) u on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'user_id', d.user_id,
          'email', coalesce(d.email, du.email),
          'nome', du.nome_completo
        )
        order by coalesce(d.email, du.email)
      ) as lista
      from public.cupom_destinatario d
      left join public.profiles du on du.id = d.user_id
      where d.cupom_id = c.id
    ) dest on true
  ) s;

  return v_out;
end;
$$;

revoke all on function public.admin_listar_cupons() from public, anon;
grant execute on function public.admin_listar_cupons() to authenticated;

-- ─── 4. admin_salvar_cupom: + restrito e destinatários (atômico) ────────────
-- Assinatura nova (2 params com default no fim). A antiga é removida para não
-- virar overload ambíguo no PostgREST.
--   p_restrito      null = mantém (update) / false (insert)
--   p_destinatarios null = mantém a lista; jsonb array = SUBSTITUI a lista.
--                   Cada item: {"user_id": uuid} OU {"email": text}.
drop function if exists public.admin_salvar_cupom(
  uuid, text, text, text, integer, uuid, boolean, timestamptz, integer, integer,
  uuid, text, boolean, numeric, numeric, boolean, boolean
);

create or replace function public.admin_salvar_cupom(
  p_id uuid,
  p_codigo text,
  p_descricao text,
  p_tipo text,
  p_valor integer,
  p_plano_id uuid,
  p_ativo boolean,
  p_expira_em timestamptz,
  p_max_usos integer,
  p_max_por_usuario integer,
  p_responsavel_user_id uuid,
  p_responsavel_nome text,
  p_comissao_ativa boolean,
  p_comissao_pct_ipatinga numeric,
  p_comissao_pct_fora numeric,
  p_comissao_planos_avancado boolean,
  p_comissao_planos_essencial boolean,
  p_restrito boolean default null,
  p_destinatarios jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_id uuid;
  v_item jsonb;
  v_email text;
  v_user uuid;
  v_restrito boolean;
  v_total integer;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  if v_codigo = '' then
    raise exception 'codigo_obrigatorio' using errcode = 'P0001';
  end if;
  if p_tipo not in ('percentual', 'fixo') then
    raise exception 'tipo_invalido' using errcode = 'P0001';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'valor_invalido' using errcode = 'P0001';
  end if;
  if p_tipo = 'percentual' and p_valor > 100 then
    raise exception 'percentual_acima_de_100' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cupom c
    where c.codigo = v_codigo and (p_id is null or c.id <> p_id)
  ) then
    raise exception 'codigo_duplicado' using errcode = 'P0001';
  end if;
  if p_destinatarios is not null then
    if jsonb_typeof(p_destinatarios) <> 'array' then
      raise exception 'destinatarios_invalidos' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_destinatarios) > 1000 then
      raise exception 'destinatarios_demais' using errcode = 'P0001';
    end if;
  end if;

  if p_id is null then
    insert into public.cupom (
      codigo, descricao, tipo, valor, plano_id, ativo, expira_em,
      max_usos, max_por_usuario, responsavel_user_id, responsavel_nome,
      comissao_ativa, comissao_pct_ipatinga, comissao_pct_fora,
      comissao_planos_avancado, comissao_planos_essencial, restrito
    ) values (
      v_codigo, nullif(btrim(coalesce(p_descricao, '')), ''), p_tipo, p_valor,
      p_plano_id, coalesce(p_ativo, true), p_expira_em,
      p_max_usos, p_max_por_usuario, p_responsavel_user_id,
      nullif(btrim(coalesce(p_responsavel_nome, '')), ''),
      coalesce(p_comissao_ativa, false),
      coalesce(p_comissao_pct_ipatinga, 0), coalesce(p_comissao_pct_fora, 0),
      coalesce(p_comissao_planos_avancado, true),
      coalesce(p_comissao_planos_essencial, true),
      coalesce(p_restrito, false)
    )
    returning id, restrito into v_id, v_restrito;
  else
    update public.cupom set
      codigo = v_codigo,
      descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
      tipo = p_tipo,
      valor = p_valor,
      plano_id = p_plano_id,
      ativo = coalesce(p_ativo, true),
      expira_em = p_expira_em,
      max_usos = p_max_usos,
      max_por_usuario = p_max_por_usuario,
      responsavel_user_id = p_responsavel_user_id,
      responsavel_nome = nullif(btrim(coalesce(p_responsavel_nome, '')), ''),
      comissao_ativa = coalesce(p_comissao_ativa, false),
      comissao_pct_ipatinga = coalesce(p_comissao_pct_ipatinga, 0),
      comissao_pct_fora = coalesce(p_comissao_pct_fora, 0),
      comissao_planos_avancado = coalesce(p_comissao_planos_avancado, true),
      comissao_planos_essencial = coalesce(p_comissao_planos_essencial, true),
      restrito = coalesce(p_restrito, restrito)
    where id = p_id
    returning id, restrito into v_id, v_restrito;

    if v_id is null then
      raise exception 'cupom_nao_encontrado' using errcode = 'P0001';
    end if;
  end if;

  -- Substitui a lista de destinatários (quando informada).
  if p_destinatarios is not null then
    delete from public.cupom_destinatario where cupom_id = v_id;

    for v_item in select * from jsonb_array_elements(p_destinatarios) loop
      v_email := nullif(lower(btrim(coalesce(v_item->>'email', ''))), '');
      -- user_id malformado vira erro de negócio (não 22P02 cru para o admin).
      if coalesce(v_item->>'user_id', '') !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$' then
        raise exception 'destinatario_invalido' using errcode = 'P0001';
      end if;
      v_user := nullif(v_item->>'user_id', '')::uuid;

      if (v_email is null) = (v_user is null) then
        raise exception 'destinatario_invalido' using errcode = 'P0001';
      end if;

      if v_email is not null then
        if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
          raise exception 'email_invalido' using errcode = 'P0001';
        end if;
        insert into public.cupom_destinatario (cupom_id, email)
        values (v_id, v_email)
        on conflict do nothing;
      else
        if not exists (select 1 from public.profiles p where p.id = v_user) then
          raise exception 'usuario_nao_encontrado' using errcode = 'P0001';
        end if;
        insert into public.cupom_destinatario (cupom_id, user_id)
        values (v_id, v_user)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- Restrito sem ninguém na lista não faz sentido (ninguém poderia usar o cupom).
  -- O raise desfaz a função inteira (inclusive o update acima). Só confere quando
  -- a restrição/lista foi mexida nesta chamada: desativar um cupom (que não envia
  -- nem um nem outro) nunca pode ser barrado por isso.
  if v_restrito and (p_restrito is not null or p_destinatarios is not null) then
    select count(*)::int into v_total
    from public.cupom_destinatario where cupom_id = v_id;
    if v_total = 0 then
      raise exception 'restrito_sem_destinatarios' using errcode = 'P0001';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_salvar_cupom(
  uuid, text, text, text, integer, uuid, boolean, timestamptz, integer, integer,
  uuid, text, boolean, numeric, numeric, boolean, boolean, boolean, jsonb
) from public, anon;
grant execute on function public.admin_salvar_cupom(
  uuid, text, text, text, integer, uuid, boolean, timestamptz, integer, integer,
  uuid, text, boolean, numeric, numeric, boolean, boolean, boolean, jsonb
) to authenticated;

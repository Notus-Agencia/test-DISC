-- =============================================================================
-- Teste DISC — Pesquisa de Clima da Equipe · Gestão sem Caos (versão 1, itens v0).
-- Roda DEPOIS de 20261005120000_disc.sql … 20261016120000_envios_email.sql (13ª migração).
-- Idempotente e seguro sobre dados reais: só cria tabelas, funções, gatilhos e políticas novas; amplia as regras de
-- public.relatorios para o modelo 'clima' e recria versao_banco. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Especificação: docs/painel-cientifico/decisao.md (3.1, 5 e 6). Mesma regra em JavaScript: js/clima.js (prévia e testes;
-- tests/supabase/clima.test.js confere que o SQL e o JS dão o MESMO resultado).
--
--   * public.clima_rodadas   rodada por empresa (aberta | encerrada; complemento NR-1; canal de escuta; retenção em dias;
--                            resultado = agregados CONGELADOS no encerramento, já com a supressão aplicada).
--                            No máximo 1 rodada aberta por empresa.
--   * public.clima_equipes   equipes da rodada (fotografia do organograma na criação: líder, nome "Equipe de Fulano X.",
--                            área, ordem, convidados) + token do link coletivo da equipe e token do link do líder.
--                            Fica imutável depois do encerramento (agrupamento congelado).
--   * public.clima_respostas resposta ANÔNIMA: só rodada, equipe, papel (membro | lider), versão dos itens, itens, comentário
--                            (H2) e duração. SEM pessoa_id, nome, telefone, e-mail, IP ou horário. Ninguém lê pela API
--                            (nem o painel): só as funções do banco.
--   * public.clima_recebidos controle de reenvio (hash da chave aleatória de cada envio), separado das respostas e sem
--                            ligação com elas.
--   * Funções públicas (anon): clima_publica(token) e clima_enviar(token, respostas) — com limites contra abuso
--     (respostas por equipe = convidados; 1 resposta de líder por equipe; 300 envios/10 min por rodada; 2.000/10 min no total).
--   * Funções do painel (só admin): clima_criar_rodada, clima_listar, clima_encerrar, clima_resultado, clima_comentarios,
--     clima_gerar_relatorio, clima_excluir_rodada, clima_apagar_brutas.
--   * Toda a agregação e a supressão ficam aqui (disc_interno.clima_calcular): k >= 5 para faixa e escore, k >= 10 para
--     distribuição, comentários e complemento N, N4 só no total da empresa, supressão complementar entre empresa, área,
--     equipe e "Outras equipes", nada enquanto a rodada está aberta, nunca lista de quem respondeu.
--   * relatorios: modelo novo 'clima' (empresa_id + clima_rodada_id). O snapshot "dados" do relatório de clima só é
--     montado por clima_gerar_relatorio, a partir do resultado congelado (o painel só publica ou despublica).
--   * Retenção: clima_apagar_brutas() apaga as respostas brutas (e os comentários) das rodadas vencidas
--     (retencao_dias depois da entrega; padrão 90) e tira do resultado a visão individual do líder. Nada é agendado aqui.
--   * versao_banco() passa a conhecer esta migração (versão 20261017120000).
-- ATENÇÃO: não rode de novo as migrações anteriores depois desta sem rodar esta em seguida (a 20261007 recria a regra
-- relatorios_modelo_dono sem o modelo 'clima').
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.clima_rodadas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  nome                text not null check (char_length(btrim(nome)) between 1 and 120 and char_length(nome) <= 120),
  status              text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  complemento         boolean not null default false,
  canal_texto         text not null default '' check (char_length(canal_texto) <= 200),
  canal_url           text not null default '' check (canal_url = '' or (char_length(canal_url) <= 300
                                                       and canal_url ~ '^(https://|mailto:|tel:)[^[:space:]<>"]+$')),
  contato_dados       text not null default '' check (char_length(contato_dados) <= 200),
  versao_itens        text not null default 'v0' check (versao_itens ~ '^v[0-9]{1,3}$'),
  retencao_dias       int not null default 90 check (retencao_dias between 30 and 365),
  aberta_em           timestamptz not null default now(),
  encerrada_em        timestamptz,
  entregue_em         timestamptz,
  brutas_apagadas_em  timestamptz,
  resultado           jsonb,
  criado_em           timestamptz not null default now(),
  constraint clima_rodadas_status_datas check ((status = 'aberta') = (encerrada_em is null)),
  constraint clima_rodadas_resultado_so_encerrada check (status = 'encerrada' or resultado is null)
);
create unique index if not exists clima_rodadas_uma_aberta on public.clima_rodadas (empresa_id) where status = 'aberta';
create index if not exists clima_rodadas_empresa_idx on public.clima_rodadas (empresa_id, aberta_em desc);

create table if not exists public.clima_equipes (
  id               uuid primary key default gen_random_uuid(),
  rodada_id        uuid not null references public.clima_rodadas (id) on delete cascade,
  lider_pessoa_id  uuid,   -- fotografia do organograma (sem chave estrangeira: a rodada não depende do cadastro)
  nome             text not null check (char_length(nome) between 1 and 160),
  area             text not null default '' check (char_length(area) <= 120),
  ordem            int not null check (ordem >= 0),
  convidados       int not null check (convidados between 1 and 500),
  token_equipe     text not null unique check (token_equipe ~ '^[0-9a-f]{64}$'),
  token_lider      text not null unique check (token_lider ~ '^[0-9a-f]{64}$'),
  constraint clima_equipes_ordem_unica unique (rodada_id, ordem)
);
create index if not exists clima_equipes_rodada_idx on public.clima_equipes (rodada_id);

create table if not exists public.clima_respostas (
  id            uuid primary key default gen_random_uuid(),
  rodada_id     uuid not null references public.clima_rodadas (id) on delete cascade,
  equipe_id     uuid not null references public.clima_equipes (id) on delete cascade,
  papel         text not null check (papel in ('membro', 'lider')),
  versao_itens  text not null check (versao_itens ~ '^v[0-9]{1,3}$'),
  itens         jsonb not null default '{}'::jsonb check (jsonb_typeof(itens) = 'object'),
  comentario    text not null default '' check (char_length(comentario) <= 1000),
  segundos      int check (segundos between 0 and 86400)
);
create index if not exists clima_respostas_rodada_idx on public.clima_respostas (rodada_id);
create index if not exists clima_respostas_equipe_idx on public.clima_respostas (equipe_id, papel);
create unique index if not exists clima_respostas_um_lider on public.clima_respostas (equipe_id) where papel = 'lider';

create table if not exists public.clima_recebidos (
  rodada_id  uuid not null references public.clima_rodadas (id) on delete cascade,
  chave      text not null check (chave ~ '^[0-9a-f]{64}$'),
  primary key (rodada_id, chave)
);

-- relatorios: modelo 'clima' (empresa + rodada). Recria as regras do modelo incluindo o novo.
alter table public.relatorios add column if not exists clima_rodada_id uuid references public.clima_rodadas (id) on delete cascade;
create unique index if not exists relatorios_clima_rodada_idx on public.relatorios (clima_rodada_id) where clima_rodada_id is not null;
do $$
declare
  c record;
begin
  -- a regra antiga da coluna modelo (nome automático relatorios_modelo_check) sai; entra a com 'clima'
  for c in select conname from pg_catalog.pg_constraint
            where conrelid = 'public.relatorios'::regclass and contype = 'c' and conname <> 'relatorios_modelo_dono'
              and pg_catalog.pg_get_constraintdef(oid) like '%modelo%' and pg_catalog.pg_get_constraintdef(oid) like '%lideranca%'
  loop
    execute format('alter table public.relatorios drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.relatorios add constraint relatorios_modelo_check
  check (modelo in ('processo', 'equipe', 'lideranca', 'pessoa', 'clima'));
alter table public.relatorios drop constraint if exists relatorios_modelo_dono;
alter table public.relatorios add constraint relatorios_modelo_dono check (
  (modelo = 'processo' and processo_id is not null)
  or (modelo = 'equipe' and empresa_id is not null)
  or (modelo in ('lideranca', 'pessoa') and pessoa_id is not null)
  or (modelo = 'clima' and empresa_id is not null and clima_rodada_id is not null));

-- -----------------------------------------------------------------------------
-- Itens v0 e auxiliares de cálculo (iguais a js/clima.js)
-- -----------------------------------------------------------------------------

-- bloco: A–G (dimensões), FL (autopercepção do líder, no lugar de F), H (H1), N (complemento).
create or replace function disc_interno.clima_itens()
returns table (item text, bloco text, invertido boolean, ordem int)
language sql immutable set search_path = '' as $$
  select * from (values
    ('A1', 'A', false, 1), ('A2', 'A', false, 2), ('A3', 'A', true, 3), ('A4', 'A', false, 4), ('A5', 'A', false, 5),
    ('B1', 'B', false, 6), ('B2', 'B', false, 7), ('B3', 'B', false, 8), ('B4', 'B', true, 9),
    ('C1', 'C', false, 10), ('C2', 'C', false, 11), ('C3', 'C', false, 12),
    ('D1', 'D', true, 13), ('D2', 'D', true, 14), ('D3', 'D', false, 15),
    ('E1', 'E', false, 16), ('E2', 'E', false, 17), ('E3', 'E', false, 18),
    ('F1', 'F', false, 19), ('F2', 'F', false, 20), ('F3', 'F', false, 21),
    ('FL1', 'FL', false, 22), ('FL2', 'FL', false, 23), ('FL3', 'FL', false, 24),
    ('G1', 'G', false, 25), ('G2', 'G', false, 26), ('G3', 'G', true, 27),
    ('H1', 'H', false, 28),
    ('N1', 'N', false, 29), ('N2', 'N', false, 30), ('N3', 'N', false, 31), ('N4', 'N', false, 32), ('N5', 'N', false, 33)
  ) as t(item, bloco, invertido, ordem);
$$;

-- Dimensões e o mínimo de itens respondidos (metade do bloco, arredondando para cima).
create or replace function disc_interno.clima_dimensoes()
returns table (dim text, minimo int, ordem int)
language sql immutable set search_path = '' as $$
  select * from (values ('A', 3, 1), ('B', 2, 2), ('C', 2, 3), ('D', 2, 4), ('E', 2, 5), ('F', 2, 6), ('G', 2, 7)) as t(dim, minimo, ordem);
$$;

-- Inteiro de um valor JSON (número sem casas, entre lo e hi) ou null.
create or replace function disc_interno.clima_int(v jsonb, lo int, hi int)
returns int language plpgsql immutable set search_path = '' as $$
declare
  x numeric;
begin
  if v is null or jsonb_typeof(v) <> 'number' then return null; end if;
  x := (v #>> '{}')::numeric;
  if x <> trunc(x) or x < lo or x > hi then return null; end if;
  return x::int;
end;
$$;

-- Arredondamentos (iguais ao JS): inteiro = piso(x + 0,5 + 1e-9); 2 casas pela mesma regra.
create or replace function disc_interno.clima_arred(x numeric)
returns int language sql immutable set search_path = '' as $$
  select floor(x + 0.5 + 0.000000001)::int;
$$;
create or replace function disc_interno.clima_arred2(x numeric)
returns numeric language sql immutable set search_path = '' as $$
  select (floor(x * 100 + 0.5 + 0.000000001) / 100)::numeric(5, 2);
$$;
create or replace function disc_interno.clima_faixa(e int)
returns text language sql immutable set search_path = '' as $$
  select case when e >= 75 then 'favoravel' when e >= 50 then 'intermediario' else 'atencao' end;
$$;
create or replace function disc_interno.clima_pct(c int, n int)
returns int language sql immutable set search_path = '' as $$
  select case when coalesce(n, 0) = 0 then 0 else disc_interno.clima_arred(100.0 * c / n) end;
$$;

-- Escores 0–100 de uma pessoa: {A..G: número|null, H1: número|null}. F do líder = FL1–FL3. Sem arredondar.
create or replace function disc_interno.clima_escores(p_itens jsonb, p_papel text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  d record;
  it record;
  v int;
  soma int;
  c int;
  r jsonb := '{}'::jsonb;
begin
  for d in select * from disc_interno.clima_dimensoes() order by ordem loop
    soma := 0; c := 0;
    for it in select * from disc_interno.clima_itens() i
               where i.bloco = case when d.dim = 'F' and p_papel = 'lider' then 'FL' else d.dim end loop
      v := disc_interno.clima_int(p_itens -> it.item, 1, 5);
      if v is not null then
        if it.invertido then v := 6 - v; end if;
        soma := soma + v; c := c + 1;
      end if;
    end loop;
    r := r || jsonb_build_object(d.dim, case when c >= d.minimo then 25 * (soma - c)::numeric / c else null end);
  end loop;
  v := disc_interno.clima_int(p_itens -> 'H1', 1, 5);
  return r || jsonb_build_object('H1', case when v is null then null else (v - 1) * 25 end);
end;
$$;

-- Estatística de uma dimensão num conjunto de respostas [{i: itens, s: escores}]: {n, escore, faixa, rwg, alinhamento, ad,
-- distribuicao} ou {n: 0}. rwg(j) com σ² = 2 sobre os itens com 2+ respostas; AD = desvio médio (conferência interna).
create or replace function disc_interno.clima_estat_dim(p_resps jsonb, p_dim text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_n int;
  v_soma numeric;
  v_escore int;
  it record;
  v_cnt int;
  v_var numeric;
  v_ad numeric;
  v_vars numeric[] := array[]::numeric[];
  v_ads numeric[] := array[]::numeric[];
  v_j int;
  v_s2 numeric;
  v_razao numeric;
  v_rwg numeric;
  v_rwg2 numeric;
  v_rot text;
  v_fav int; v_int int; v_at int;
begin
  select count(*), sum((r -> 's' ->> p_dim)::numeric) into v_n, v_soma
    from jsonb_array_elements(p_resps) r where jsonb_typeof(r -> 's' -> p_dim) = 'number';
  if v_n = 0 then return jsonb_build_object('n', 0); end if;
  v_escore := disc_interno.clima_arred(v_soma / v_n);
  for it in select * from disc_interno.clima_itens() i where i.bloco = p_dim order by i.ordem loop
    with x as (
      select case when it.invertido then 6 - q.v else q.v end as x
        from jsonb_array_elements(p_resps) r
        cross join lateral (select disc_interno.clima_int(r -> 'i' -> it.item, 1, 5) as v) q
       where jsonb_typeof(r -> 's' -> p_dim) = 'number' and q.v is not null
    ), m as (select avg(x::numeric) as media from x)
    select count(*), var_samp(x::numeric), avg(abs(x::numeric - m.media)) into v_cnt, v_var, v_ad from x cross join m group by m.media;
    if coalesce(v_cnt, 0) >= 2 then
      v_vars := v_vars || v_var;
      v_ads := v_ads || v_ad;
    end if;
    v_cnt := null;
  end loop;
  v_j := coalesce(array_length(v_vars, 1), 0);
  if v_j > 0 then
    select avg(x) into v_s2 from unnest(v_vars) x;
    v_razao := v_s2 / 2;
    v_rwg := case when v_razao >= 1 then 0 else (v_j * (1 - v_razao)) / (v_j * (1 - v_razao) + v_razao) end;
    v_rwg := greatest(0, least(1, v_rwg));
    v_rwg2 := disc_interno.clima_arred2(v_rwg);
    v_rot := case when round(v_rwg2 * 100) >= 70 then 'alinhada' when round(v_rwg2 * 100) >= 50 then 'variadas' else 'divididas' end;
    select disc_interno.clima_arred2(avg(x)) into v_ad from unnest(v_ads) x;
  else
    v_rwg2 := null; v_rot := null; v_ad := null;
  end if;
  select count(*) filter (where (r -> 's' ->> p_dim)::numeric >= 75),
         count(*) filter (where (r -> 's' ->> p_dim)::numeric >= 50 and (r -> 's' ->> p_dim)::numeric < 75),
         count(*) filter (where (r -> 's' ->> p_dim)::numeric < 50)
    into v_fav, v_int, v_at
    from jsonb_array_elements(p_resps) r where jsonb_typeof(r -> 's' -> p_dim) = 'number';
  return jsonb_build_object('n', v_n, 'escore', v_escore, 'faixa', disc_interno.clima_faixa(v_escore),
    'rwg', v_rwg2, 'alinhamento', v_rot, 'ad', v_ad,
    'distribuicao', jsonb_build_object('favoravel', disc_interno.clima_pct(v_fav, v_n),
      'intermediario', disc_interno.clima_pct(v_int, v_n), 'atencao', disc_interno.clima_pct(v_at, v_n)));
end;
$$;

-- Indicador de 1 pergunta (H1, N1–N3, N5): {n, escore, faixa} ou {n: 0}.
create or replace function disc_interno.clima_estat_item(p_resps jsonb, p_item text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_n int;
  v_s numeric;
  v_e int;
begin
  select count(*), sum((q.v - 1) * 25) into v_n, v_s
    from jsonb_array_elements(p_resps) r
    cross join lateral (select disc_interno.clima_int(r -> 'i' -> p_item, 1, 5) as v) q
   where q.v is not null;
  if v_n = 0 then return jsonb_build_object('n', 0); end if;
  v_e := disc_interno.clima_arred(v_s / v_n);
  return jsonb_build_object('n', v_n, 'escore', v_e, 'faixa', disc_interno.clima_faixa(v_e));
end;
$$;

-- Supressão complementar numa árvore (mesma regra de DISC_CLIMA.suprimir):
--   p_nos [{id, pai ('' na raiz), ordem}] · p_n {id: contagem} · p_base {id: pode aparecer} · p_k mínimo -> {id: aparece}.
-- Aparece com n >= k; de baixo para cima, em cada nó que aparece, o resto (n − soma dos filhos que aparecem) precisa ser 0
-- ou >= k; senão some o filho menor (empate: o de maior ordem; depois o de maior id) com tudo abaixo dele.
create or replace function disc_interno.clima_suprimir(p_nos jsonb, p_n jsonb, p_base jsonb, p_k int)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_mostrar jsonb := '{}'::jsonb;
  v_raiz text;
  x record;
  v_soma int;
  v_vis int;
  v_resto int;
  v_menor text;
  v_esconder jsonb;
begin
  select coalesce(jsonb_object_agg(e ->> 'id', coalesce((p_base ->> (e ->> 'id'))::boolean, false)
                                    and coalesce((p_n ->> (e ->> 'id'))::int, 0) >= p_k), '{}'::jsonb)
    into v_mostrar from jsonb_array_elements(p_nos) e;
  select e ->> 'id' into v_raiz from jsonb_array_elements(p_nos) e where coalesce(e ->> 'pai', '') = '' limit 1;
  if v_raiz is null or not coalesce((v_mostrar ->> v_raiz)::boolean, false) then
    select coalesce(jsonb_object_agg(e ->> 'id', false), '{}'::jsonb) into v_mostrar from jsonb_array_elements(p_nos) e;
    return v_mostrar;
  end if;
  for x in
    with recursive p(id, prof) as (
      select e ->> 'id', 0 from jsonb_array_elements(p_nos) e where coalesce(e ->> 'pai', '') = ''
      union all
      select e ->> 'id', p.prof + 1 from jsonb_array_elements(p_nos) e join p on e ->> 'pai' = p.id
    )
    select e ->> 'id' as id, p.prof, (e ->> 'ordem')::numeric as ordem
      from jsonb_array_elements(p_nos) e join p on p.id = e ->> 'id'
     where exists (select 1 from jsonb_array_elements(p_nos) f where f ->> 'pai' = e ->> 'id')
     order by p.prof desc, (e ->> 'ordem')::numeric, (e ->> 'id') collate "C"
  loop
    if not coalesce((v_mostrar ->> x.id)::boolean, false) then continue; end if;
    loop
      select count(*), coalesce(sum(coalesce((p_n ->> (f ->> 'id'))::int, 0)), 0) into v_vis, v_soma
        from jsonb_array_elements(p_nos) f
       where f ->> 'pai' = x.id and coalesce((v_mostrar ->> (f ->> 'id'))::boolean, false);
      v_resto := coalesce((p_n ->> x.id)::int, 0) - v_soma;
      exit when v_vis = 0 or v_resto = 0 or v_resto >= p_k;
      select f ->> 'id' into v_menor
        from jsonb_array_elements(p_nos) f
       where f ->> 'pai' = x.id and coalesce((v_mostrar ->> (f ->> 'id'))::boolean, false)
       order by coalesce((p_n ->> (f ->> 'id'))::int, 0), (f ->> 'ordem')::numeric desc, (f ->> 'id') collate "C" desc
       limit 1;
      with recursive d(id) as (
        select v_menor
        union all
        select f ->> 'id' from jsonb_array_elements(p_nos) f join d on f ->> 'pai' = d.id
      )
      select jsonb_object_agg(d.id, false) into v_esconder from d;
      v_mostrar := v_mostrar || v_esconder;
    end loop;
  end loop;
  return v_mostrar;
end;
$$;

-- Nome curto "Primeiro nome + inicial" (como DISC_CLIMA.nomeCurto).
create or replace function disc_interno.clima_nome_curto(p_nome text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  partes text[];
  i int;
  primeiro text;
begin
  partes := regexp_split_to_array(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), ' ');
  if coalesce(partes[1], '') = '' then return 'Sem nome'; end if;
  primeiro := upper(left(partes[1], 1)) || substr(partes[1], 2);
  for i in 2 .. coalesce(array_length(partes, 1), 1) loop
    if lower(partes[i]) not in ('de', 'da', 'do', 'das', 'dos', 'e') then
      return primeiro || ' ' || upper(left(partes[i], 1)) || '.';
    end if;
  end loop;
  return primeiro;
end;
$$;

/*
 * Cálculo completo de uma rodada (mesma entrada e saída de DISC_CLIMA.calcular, js/clima.js):
 *   p_equipes   [{id, nome, area, ordem, convidados}]
 *   p_respostas [{equipeId, papel: 'membro'|'lider', itens, comentario, segundos}]
 *   p_compl     complemento NR-1 ligado · p_n4  N4 ligado (canal de escuta informado)
 * Devolve o resultado com a supressão aplicada (formato no topo de js/clima.js).
 */
create or replace function disc_interno.clima_calcular(p_equipes jsonb, p_respostas jsonb, p_compl boolean, p_n4 boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  k constant int := 5;
  kd constant int := 10;
  v_eq jsonb;
  v_todas jsonb;
  v_memb jsonb;
  v_conv int;
  v_nm int;
  v_n4 boolean := coalesce(p_compl, false) and coalesce(p_n4, false);
  v_res jsonb;
  v_areas jsonb;
  v_nos jsonb;
  v_n jsonb;
  v_base jsonb;
  v_mostra jsonb;
  v_exib jsonb := '[]'::jsonb;
  f record;
  t record;
  v_vis int;
  v_cob text[];
  v_resto text[];
  v_nresto int;
  v_resp jsonb;
  v_grupos jsonb := '[]'::jsonb;
  g record;
  d record;
  v_est jsonb;
  v_nd jsonb;
  v_basex jsonb;
  v_m jsonb;
  v_md jsonb;
  v_dims jsonb;
  v_estat jsonb;
  v_equipes_saida jsonb := '[]'::jsonb;
  e record;
  v_situ jsonb;
  v_outras text;
  v_acima text;
  v_nosn jsonb;
  v_gruposn jsonb;
  it text;
  v_est_n jsonb;
  v_r4 int;
  v_rel4 int;
  v_rap int := 0;
  v_reta int := 0;
  r record;
  v_lideres jsonb := '[]'::jsonb;
  v_lid jsonb;
  v_ldims jsonb;
begin
  -- equipes em ordem; respostas com escores; membros só de equipes conhecidas
  select coalesce(jsonb_agg(jsonb_build_object('id', x ->> 'id', 'nome', coalesce(x ->> 'nome', ''),
           'area', btrim(coalesce(x ->> 'area', '')), 'ordem', (x ->> 'ordem')::numeric,
           'convidados', coalesce((x ->> 'convidados')::int, 0))
           order by (x ->> 'ordem')::numeric, (x ->> 'id') collate "C"), '[]'::jsonb)
    into v_eq from jsonb_array_elements(coalesce(p_equipes, '[]'::jsonb)) x;
  select coalesce(jsonb_agg(jsonb_build_object('e', x ->> 'equipeId',
           'p', case when x ->> 'papel' = 'lider' then 'lider' else 'membro' end,
           'i', case when jsonb_typeof(x -> 'itens') = 'object' then x -> 'itens' else '{}'::jsonb end,
           'c', case when jsonb_typeof(x -> 'comentario') = 'string' then x ->> 'comentario' else '' end,
           'seg', disc_interno.clima_int(x -> 'segundos', 0, 2147483647),
           's', disc_interno.clima_escores(case when jsonb_typeof(x -> 'itens') = 'object' then x -> 'itens' else '{}'::jsonb end,
                  case when x ->> 'papel' = 'lider' then 'lider' else 'membro' end)) order by o), '[]'::jsonb)
    into v_todas
    from jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb)) with ordinality as a(x, o)
   where exists (select 1 from jsonb_array_elements(v_eq) q where q ->> 'id' = x ->> 'equipeId');
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_memb from jsonb_array_elements(v_todas) x where x ->> 'p' = 'membro';
  v_nm := jsonb_array_length(v_memb);
  select coalesce(sum((x ->> 'convidados')::int), 0) into v_conv from jsonb_array_elements(v_eq) x;

  v_res := jsonb_build_object('versao', 1, 'versaoItens', 'v0', 'k', k, 'kDetalhe', kd,
    'convidados', v_conv, 'respondentes', v_nm,
    'taxa', case when v_conv > 0 then least(100, disc_interno.clima_pct(v_nm, v_conv)) else 0 end,
    'suprimido', v_nm < k);

  -- 1) árvore dos recortes: empresa > áreas > equipes. Área = rótulo com 2+ equipes e menos que todas.
  select coalesce(jsonb_object_agg(a.area, case when a.qtd >= 2 and a.qtd < jsonb_array_length(v_eq) then 2 else 1 end), '{}'::jsonb)
    into v_areas
    from (select x ->> 'area' as area, count(*) as qtd from jsonb_array_elements(v_eq) x where x ->> 'area' <> '' group by 1) a;
  v_nos := jsonb_build_array(jsonb_build_object('id', 'empresa', 'pai', '', 'ordem', 0, 'tipo', 'empresa', 'nome', 'Toda a empresa',
    'equipes', (select coalesce(jsonb_agg(x ->> 'id' order by o), '[]'::jsonb) from jsonb_array_elements(v_eq) with ordinality q(x, o))));
  v_nos := v_nos || coalesce((
    select jsonb_agg(jsonb_build_object('id', 'area:' || a.area, 'pai', 'empresa', 'ordem', a.ordem, 'tipo', 'area', 'nome', a.area,
             'equipes', a.equipes) order by a.ordem)
      from (select x ->> 'area' as area, min((x ->> 'ordem')::numeric) as ordem,
                   jsonb_agg(x ->> 'id' order by (x ->> 'ordem')::numeric, (x ->> 'id') collate "C") as equipes
              from jsonb_array_elements(v_eq) x
             where x ->> 'area' <> '' and (v_areas ->> (x ->> 'area'))::int >= 2 group by 1) a), '[]'::jsonb);
  v_nos := v_nos || coalesce((
    select jsonb_agg(jsonb_build_object('id', x ->> 'id',
             'pai', case when x ->> 'area' <> '' and (v_areas ->> (x ->> 'area'))::int >= 2 then 'area:' || (x ->> 'area') else 'empresa' end,
             'ordem', (x ->> 'ordem')::numeric, 'tipo', 'equipe', 'nome', x ->> 'nome', 'area', x ->> 'area',
             'equipes', jsonb_build_array(x ->> 'id')) order by o)
      from jsonb_array_elements(v_eq) with ordinality q(x, o)), '[]'::jsonb);
  select jsonb_object_agg(no ->> 'id', (select count(*) from jsonb_array_elements(v_memb) m
                                         where m ->> 'e' in (select jsonb_array_elements_text(no -> 'equipes')))),
         jsonb_object_agg(no ->> 'id', true)
    into v_n, v_base from jsonb_array_elements(v_nos) no;
  v_mostra := disc_interno.clima_suprimir(v_nos, v_n, v_base, k);

  -- 2) árvore exibida: o que aparece + "Outras equipes" (resto de cada nó com filhos aparecendo). Profundidade máx. 2.
  if coalesce((v_mostra ->> 'empresa')::boolean, false) then
    v_exib := jsonb_build_array(jsonb_build_object('id', 'empresa', 'pai', '', 'ordem', 0, 'tipo', 'empresa', 'nome', 'Toda a empresa',
      'nivel', 0, 'equipes', v_nos -> 0 -> 'equipes'));
    v_vis := 0; v_cob := array[]::text[];
    for f in select x from jsonb_array_elements(v_nos) x
              where x ->> 'pai' = 'empresa' and coalesce((v_mostra ->> (x ->> 'id'))::boolean, false)
              order by (x ->> 'ordem')::numeric, (x ->> 'id') collate "C" loop
      v_vis := v_vis + 1;
      v_cob := v_cob || array(select jsonb_array_elements_text(f.x -> 'equipes'));
      v_exib := v_exib || jsonb_build_array(f.x || jsonb_build_object('pai', 'empresa', 'nivel', 1));
      if f.x ->> 'tipo' = 'area' then
        declare
          v_vis2 int := 0;
          v_cob2 text[] := array[]::text[];
        begin
          for t in select x from jsonb_array_elements(v_nos) x
                    where x ->> 'pai' = f.x ->> 'id' and coalesce((v_mostra ->> (x ->> 'id'))::boolean, false)
                    order by (x ->> 'ordem')::numeric, (x ->> 'id') collate "C" loop
            v_vis2 := v_vis2 + 1;
            v_cob2 := v_cob2 || (t.x ->> 'id');
            v_exib := v_exib || jsonb_build_array(t.x || jsonb_build_object('pai', f.x ->> 'id', 'nivel', 2));
          end loop;
          if v_vis2 > 0 then
            v_resto := array(select y from jsonb_array_elements_text(f.x -> 'equipes') with ordinality q(y, o)
                              where not (y = any(v_cob2)) order by o);
            select count(*) into v_nresto from jsonb_array_elements(v_memb) m where m ->> 'e' = any(v_resto);
            if v_nresto > 0 then
              v_exib := v_exib || jsonb_build_array(jsonb_build_object('id', 'outras:' || (f.x ->> 'id'), 'pai', f.x ->> 'id',
                'ordem', 1000000, 'tipo', 'outras', 'nome', 'Outras equipes', 'nivel', 2, 'equipes', to_jsonb(v_resto)));
            end if;
          end if;
        end;
      end if;
    end loop;
    if v_vis > 0 then
      v_resto := array(select y from jsonb_array_elements_text(v_nos -> 0 -> 'equipes') with ordinality q(y, o)
                        where not (y = any(v_cob)) order by o);
      select count(*) into v_nresto from jsonb_array_elements(v_memb) m where m ->> 'e' = any(v_resto);
      if v_nresto > 0 then
        v_exib := v_exib || jsonb_build_array(jsonb_build_object('id', 'outras:empresa', 'pai', 'empresa', 'ordem', 1000000,
          'tipo', 'outras', 'nome', 'Outras equipes', 'nivel', 1, 'equipes', to_jsonb(v_resto)));
      end if;
    end if;
  end if;

  -- respostas de cada nó exibido
  select coalesce(jsonb_object_agg(x ->> 'id', (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements(v_memb) m
                                                 where m ->> 'e' in (select jsonb_array_elements_text(x -> 'equipes')))), '{}'::jsonb),
         coalesce(jsonb_object_agg(x ->> 'id', true), '{}'::jsonb)
    into v_resp, v_basex from jsonb_array_elements(v_exib) x;

  -- 3) supressão por estatística (cada dimensão e H1) e da distribuição (k >= 10) na árvore exibida
  v_dims := '{}'::jsonb;
  for d in select * from disc_interno.clima_dimensoes() order by ordem loop
    select coalesce(jsonb_object_agg(x ->> 'id', disc_interno.clima_estat_dim(v_resp -> (x ->> 'id'), d.dim)), '{}'::jsonb)
      into v_est from jsonb_array_elements(v_exib) x;
    select coalesce(jsonb_object_agg(kk, (vv ->> 'n')::int), '{}'::jsonb) into v_nd from jsonb_each(v_est) as w(kk, vv);
    v_m := disc_interno.clima_suprimir(v_exib, v_nd, v_basex, k);
    v_md := disc_interno.clima_suprimir(v_exib, v_nd, v_m, kd);
    v_dims := v_dims || jsonb_build_object(d.dim, (
      select coalesce(jsonb_object_agg(x ->> 'id',
               case when coalesce((v_m ->> (x ->> 'id'))::boolean, false) then
                 jsonb_build_object('n', v_est -> (x ->> 'id') -> 'n', 'escore', v_est -> (x ->> 'id') -> 'escore',
                   'faixa', v_est -> (x ->> 'id') -> 'faixa', 'rwg', v_est -> (x ->> 'id') -> 'rwg',
                   'alinhamento', v_est -> (x ->> 'id') -> 'alinhamento', 'ad', v_est -> (x ->> 'id') -> 'ad',
                   'distribuicao', case when coalesce((v_md ->> (x ->> 'id'))::boolean, false)
                                        then v_est -> (x ->> 'id') -> 'distribuicao' else 'null'::jsonb end)
               else 'null'::jsonb end), '{}'::jsonb)
        from jsonb_array_elements(v_exib) x));
  end loop;
  select coalesce(jsonb_object_agg(x ->> 'id', disc_interno.clima_estat_item(v_resp -> (x ->> 'id'), 'H1')), '{}'::jsonb)
    into v_est from jsonb_array_elements(v_exib) x;
  select coalesce(jsonb_object_agg(kk, (vv ->> 'n')::int), '{}'::jsonb) into v_nd from jsonb_each(v_est) as w(kk, vv);
  v_m := disc_interno.clima_suprimir(v_exib, v_nd, v_basex, k);

  for g in select x, o from jsonb_array_elements(v_exib) with ordinality q(x, o) order by o loop
    declare
      v_g jsonb;
      v_conv_g int;
      v_dg jsonb := '{}'::jsonb;
    begin
      v_g := jsonb_build_object('id', g.x ->> 'id', 'tipo', g.x ->> 'tipo', 'nome', g.x ->> 'nome', 'pai', g.x ->> 'pai',
        'nivel', (g.x ->> 'nivel')::int, 'ordem', (g.x ->> 'ordem')::numeric, 'n', jsonb_array_length(v_resp -> (g.x ->> 'id')));
      for d in select * from disc_interno.clima_dimensoes() order by ordem loop
        v_dg := v_dg || jsonb_build_object(d.dim, v_dims -> d.dim -> (g.x ->> 'id'));
      end loop;
      v_g := v_g || jsonb_build_object('dimensoes', v_dg, 'h1',
        case when coalesce((v_m ->> (g.x ->> 'id'))::boolean, false) then v_est -> (g.x ->> 'id') else 'null'::jsonb end);
      if g.x ->> 'tipo' in ('area', 'outras') then
        v_g := v_g || jsonb_build_object('equipes', (select coalesce(jsonb_agg(q.x ->> 'nome' order by o2), '[]'::jsonb)
          from jsonb_array_elements_text(g.x -> 'equipes') with ordinality w(y, o2) join jsonb_array_elements(v_eq) q(x) on q.x ->> 'id' = w.y));
      end if;
      if g.x ->> 'tipo' <> 'outras' then
        select coalesce(sum((q.x ->> 'convidados')::int), 0) into v_conv_g
          from jsonb_array_elements(v_eq) q(x) where q.x ->> 'id' in (select jsonb_array_elements_text(g.x -> 'equipes'));
        v_g := v_g || jsonb_build_object('convidados', v_conv_g, 'taxa',
          case when v_conv_g > 0 then least(100, disc_interno.clima_pct(jsonb_array_length(v_resp -> (g.x ->> 'id')), v_conv_g)) else 0 end);
      end if;
      v_grupos := v_grupos || jsonb_build_array(v_g);
    end;
  end loop;
  v_res := v_res || jsonb_build_object('grupos', v_grupos);

  -- 4) situação de cada equipe
  for e in select x, o from jsonb_array_elements(v_eq) with ordinality q(x, o) order by o loop
    declare
      v_ne int;
    begin
      select count(*) into v_ne from jsonb_array_elements(v_memb) m where m ->> 'e' = e.x ->> 'id';
      v_situ := jsonb_build_object('id', e.x ->> 'id', 'nome', e.x ->> 'nome', 'area', e.x ->> 'area', 'ordem', (e.x ->> 'ordem')::numeric,
        'convidados', (e.x ->> 'convidados')::int, 'respondentes', v_ne,
        'taxa', case when (e.x ->> 'convidados')::int > 0 then least(100, disc_interno.clima_pct(v_ne, (e.x ->> 'convidados')::int)) else 0 end,
        'situacao', 'nao_aparece', 'motivo', '', 'grupo', '');
      if exists (select 1 from jsonb_array_elements(v_exib) x where x ->> 'id' = e.x ->> 'id') then
        v_situ := v_situ || jsonb_build_object('situacao', 'aparece', 'grupo', e.x ->> 'id');
      elsif v_ne = 0 then
        v_situ := v_situ || jsonb_build_object('motivo', 'sem_respostas');
      elsif not coalesce((v_mostra ->> 'empresa')::boolean, false) then
        v_situ := v_situ || jsonb_build_object('motivo', 'empresa');
      else
        v_situ := v_situ || jsonb_build_object('motivo', case when v_ne < k then 'minimo' else 'complemento' end);
        select x ->> 'id' into v_outras from jsonb_array_elements(v_exib) x
         where x ->> 'tipo' = 'outras' and (x -> 'equipes') ? (e.x ->> 'id') limit 1;
        if v_outras is not null then
          v_situ := v_situ || jsonb_build_object('situacao', 'outras', 'grupo', v_outras);
        else
          select no ->> 'pai' into v_acima from jsonb_array_elements(v_nos) no where no ->> 'id' = e.x ->> 'id';
          while v_acima is not null and v_acima <> ''
                and not exists (select 1 from jsonb_array_elements(v_exib) x where x ->> 'id' = v_acima) loop
            select no ->> 'pai' into v_acima from jsonb_array_elements(v_nos) no where no ->> 'id' = v_acima;
          end loop;
          v_situ := v_situ || jsonb_build_object('grupo', coalesce(v_acima, ''));
        end if;
        v_outras := null;
      end if;
      v_equipes_saida := v_equipes_saida || jsonb_build_array(v_situ);
    end;
  end loop;
  v_res := v_res || jsonb_build_object('equipes', v_equipes_saida);

  -- 5) complemento N (k >= 10): N1–N3 e N5 na empresa e nas áreas exibidas; N4 só na empresa
  v_gruposn := '[]'::jsonb;
  if coalesce(p_compl, false) and coalesce((v_mostra ->> 'empresa')::boolean, false) then
    select coalesce(jsonb_agg(jsonb_build_object('id', x ->> 'id', 'pai', x ->> 'pai', 'ordem', (x ->> 'ordem')::numeric) order by o), '[]'::jsonb)
      into v_nosn from jsonb_array_elements(v_exib) with ordinality q(x, o) where x ->> 'tipo' in ('empresa', 'area');
    select coalesce(jsonb_agg(jsonb_build_object('id', x ->> 'id', 'nome', x ->> 'nome', 'itens', '{}'::jsonb) order by o), '[]'::jsonb)
      into v_gruposn from jsonb_array_elements(v_exib) with ordinality q(x, o) where x ->> 'tipo' in ('empresa', 'area');
    foreach it in array array['N1', 'N2', 'N3', 'N5'] loop
      select coalesce(jsonb_object_agg(x ->> 'id', disc_interno.clima_estat_item(v_resp -> (x ->> 'id'), it)), '{}'::jsonb)
        into v_est_n from jsonb_array_elements(v_nosn) x;
      select coalesce(jsonb_object_agg(kk, (vv ->> 'n')::int), '{}'::jsonb) into v_nd from jsonb_each(v_est_n) as w(kk, vv);
      select coalesce(jsonb_object_agg(x ->> 'id', true), '{}'::jsonb) into v_basex from jsonb_array_elements(v_nosn) x;
      v_m := disc_interno.clima_suprimir(v_nosn, v_nd, v_basex, kd);
      select coalesce(jsonb_agg(gn || jsonb_build_object('itens', (gn -> 'itens') || jsonb_build_object(it,
               case when coalesce((v_m ->> (gn ->> 'id'))::boolean, false) then v_est_n -> (gn ->> 'id') else 'null'::jsonb end)) order by o), '[]'::jsonb)
        into v_gruposn from jsonb_array_elements(v_gruposn) with ordinality q(gn, o);
    end loop;
  end if;
  v_res := v_res || jsonb_build_object('complemento', jsonb_build_object('ligado', coalesce(p_compl, false), 'n4Ligado', v_n4,
    'grupos', v_gruposn, 'n4', 'null'::jsonb));
  if v_n4 and coalesce((v_mostra ->> 'empresa')::boolean, false) then
    select count(*), count(*) filter (where q.v >= 2) into v_r4, v_rel4
      from jsonb_array_elements(v_memb) m cross join lateral (select disc_interno.clima_int(m -> 'i' -> 'N4', 1, 3) as v) q
     where q.v is not null;
    if v_r4 >= kd then
      v_res := jsonb_set(v_res, '{complemento,n4}', jsonb_build_object('n', v_r4, 'pct', disc_interno.clima_pct(v_rel4, v_r4)));
    end if;
  end if;

  -- 6) comentários (só a quantidade), qualidade e visão do líder (só consultor)
  v_res := v_res || jsonb_build_object('comentarios', jsonb_build_object(
    'quantidade', (select count(*) from jsonb_array_elements(v_memb) m where btrim(m ->> 'c') <> ''),
    'disponivel', v_nm >= kd));
  for r in select x from jsonb_array_elements(v_todas) x loop
    declare
      v_resp_k text[];
      v_lik text[];
    begin
      v_resp_k := array(select kk from jsonb_object_keys(r.x -> 'i') kk
                         where disc_interno.clima_int(r.x -> 'i' -> kk, case when kk = 'N4' then 1 else 1 end, case when kk = 'N4' then 3 else 5 end) is not null);
      if (r.x ->> 'seg') is not null and coalesce(array_length(v_resp_k, 1), 0) > 0
         and (r.x ->> 'seg')::int < 2 * array_length(v_resp_k, 1) then
        v_rap := v_rap + 1;
      end if;
      v_lik := array(select y from unnest(v_resp_k) y where y <> 'N4');
      if coalesce(array_length(v_lik, 1), 0) >= 6
         and exists (select 1 from disc_interno.clima_itens() i where i.item = any(v_lik) and i.invertido)
         and (select count(distinct (r.x -> 'i' ->> y)) from unnest(v_lik) y) = 1 then
        v_reta := v_reta + 1;
      end if;
    end;
  end loop;
  v_res := v_res || jsonb_build_object('qualidade', jsonb_build_object('rapidas', v_rap, 'linhaReta', v_reta));
  for e in select x, o from jsonb_array_elements(v_eq) with ordinality q(x, o) order by o loop
    if not exists (select 1 from jsonb_array_elements(v_exib) x where x ->> 'id' = e.x ->> 'id') then continue; end if;
    select x into v_lid from jsonb_array_elements(v_todas) x where x ->> 'p' = 'lider' and x ->> 'e' = e.x ->> 'id' limit 1;
    if v_lid is null then continue; end if;
    v_ldims := '{}'::jsonb;
    for d in select * from disc_interno.clima_dimensoes() order by ordem loop
      v_ldims := v_ldims || jsonb_build_object(d.dim, case when d.dim = 'G' or jsonb_typeof(v_lid -> 's' -> d.dim) <> 'number' then null
        else disc_interno.clima_arred((v_lid -> 's' ->> d.dim)::numeric) end);
    end loop;
    v_lideres := v_lideres || jsonb_build_array(jsonb_build_object('equipeId', e.x ->> 'id', 'dimensoes', v_ldims,
      'h1', case when jsonb_typeof(v_lid -> 's' -> 'H1') <> 'number' then null else disc_interno.clima_arred((v_lid -> 's' ->> 'H1')::numeric) end));
    v_lid := null;
  end loop;
  return v_res || jsonb_build_object('lideres', v_lideres);
end;
$$;

-- O que vai para o relatório do cliente: sem a visão do líder, sem qualidade, sem AD e sem contagens das equipes que não
-- aparecem (como DISC_CLIMA.visaoCliente).
create or replace function disc_interno.clima_visao_cliente(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select (coalesce(p, '{}'::jsonb) - 'lideres' - 'qualidade' - 'lideresApagados')
    || jsonb_build_object(
      'grupos', (select coalesce(jsonb_agg(g || jsonb_build_object('dimensoes',
                   (select coalesce(jsonb_object_agg(kk, case when jsonb_typeof(vv) = 'object' then vv - 'ad' else vv end), '{}'::jsonb)
                      from jsonb_each(coalesce(g -> 'dimensoes', '{}'::jsonb)) as w(kk, vv))) order by o), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) with ordinality q(g, o)),
      'equipes', (select coalesce(jsonb_agg(jsonb_build_object('id', e -> 'id', 'nome', e -> 'nome', 'area', e -> 'area', 'ordem', e -> 'ordem',
                   'situacao', e -> 'situacao', 'motivo', e -> 'motivo', 'grupo', e -> 'grupo')
                   || case when e ->> 'situacao' = 'aparece'
                        then jsonb_build_object('convidados', e -> 'convidados', 'respondentes', e -> 'respondentes', 'taxa', e -> 'taxa')
                        else '{}'::jsonb end order by o), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(p -> 'equipes', '[]'::jsonb)) with ordinality q(e, o)));
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos
-- -----------------------------------------------------------------------------

-- Equipes ficam congeladas depois do encerramento (nada de reagrupar uma rodada já publicada).
create or replace function disc_interno.clima_equipes_congeladas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    return old; -- apagar a rodada leva as equipes junto
  end if;
  select r.status into v_status from public.clima_rodadas r where r.id = new.rodada_id;
  if v_status = 'encerrada' and tg_op = 'INSERT' then
    raise exception 'A pesquisa já foi encerrada: as equipes não mudam mais.';
  end if;
  if tg_op = 'UPDATE' and (v_status = 'encerrada' or old.rodada_id <> new.rodada_id) then
    raise exception 'A pesquisa já foi encerrada: as equipes não mudam mais.';
  end if;
  return new;
end;
$$;
drop trigger if exists clima_equipes_congeladas on public.clima_equipes;
create trigger clima_equipes_congeladas before insert or update on public.clima_equipes
  for each row execute function disc_interno.clima_equipes_congeladas();

-- Rodada encerrada não volta a abrir; o resultado congelado só muda pela retenção (que tira a visão do líder).
create or replace function disc_interno.clima_rodadas_antes_gravar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nome := btrim(coalesce(new.nome, ''));
  if tg_op = 'UPDATE' then
    if old.status = 'encerrada' and new.status <> 'encerrada' then
      raise exception 'A pesquisa já foi encerrada e não pode ser reaberta.';
    end if;
    if old.status = 'encerrada' and (new.empresa_id <> old.empresa_id or new.complemento <> old.complemento
       or new.canal_texto <> old.canal_texto or new.versao_itens <> old.versao_itens) then
      raise exception 'A pesquisa já foi encerrada: a configuração não muda mais.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists clima_rodadas_antes_gravar on public.clima_rodadas;
create trigger clima_rodadas_antes_gravar before insert or update on public.clima_rodadas
  for each row execute function disc_interno.clima_rodadas_antes_gravar();

-- Respostas só entram com a rodada aberta (defesa extra além de clima_enviar).
create or replace function disc_interno.clima_respostas_antes_inserir()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clima_rodadas r where r.id = new.rodada_id and r.status = 'aberta') then
    raise exception 'Esta pesquisa já foi encerrada.';
  end if;
  if not exists (select 1 from public.clima_equipes e where e.id = new.equipe_id and e.rodada_id = new.rodada_id) then
    raise exception 'Equipe de outra pesquisa.';
  end if;
  return new;
end;
$$;
drop trigger if exists clima_respostas_antes_inserir on public.clima_respostas;
create trigger clima_respostas_antes_inserir before insert on public.clima_respostas
  for each row execute function disc_interno.clima_respostas_antes_inserir();

-- Relatório de clima: o snapshot (dados) só é montado por clima_gerar_relatorio, a partir do resultado congelado.
-- O painel pode publicar/despublicar (só o status muda) e excluir.
create or replace function disc_interno.relatorios_clima_protegido()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.modelo <> 'clima' and new.clima_rodada_id is not null then
    raise exception 'Só o relatório de clima se liga a uma pesquisa de clima.';
  end if;
  if new.modelo = 'clima' or (tg_op = 'UPDATE' and old.modelo = 'clima') then
    if tg_op = 'UPDATE' and new.modelo = old.modelo and new.dados is not distinct from old.dados
       and new.empresa_id is not distinct from old.empresa_id and new.clima_rodada_id is not distinct from old.clima_rodada_id then
      return new;
    end if;
    if coalesce(current_setting('disc.clima_snapshot', true), '') <> '1' then
      raise exception 'O relatório de clima só é montado pelo servidor (gere de novo pela Pesquisa de clima).';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists relatorios_clima_protegido on public.relatorios;
create trigger relatorios_clima_protegido before insert or update on public.relatorios
  for each row execute function disc_interno.relatorios_clima_protegido();

-- -----------------------------------------------------------------------------
-- Funções auxiliares do painel
-- -----------------------------------------------------------------------------

create or replace function disc_interno.clima_rodada_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'empresaId', r.empresa_id, 'nome', r.nome, 'status', r.status,
    'complemento', r.complemento, 'n4', r.complemento and r.canal_texto <> '', 'canalTexto', r.canal_texto, 'canalUrl', r.canal_url,
    'contatoDados', r.contato_dados, 'versaoItens', r.versao_itens, 'retencaoDias', r.retencao_dias,
    'abertaEm', disc_interno.iso(r.aberta_em), 'encerradaEm', disc_interno.iso(r.encerrada_em),
    'entregueEm', disc_interno.iso(r.entregue_em), 'brutasApagadasEm', disc_interno.iso(r.brutas_apagadas_em),
    'convidados', (select coalesce(sum(e.convidados), 0) from public.clima_equipes e where e.rodada_id = r.id),
    'respondentes', case when r.brutas_apagadas_em is not null then coalesce((r.resultado ->> 'respondentes')::int, 0)
                         else (select count(*) from public.clima_respostas x where x.rodada_id = r.id and x.papel = 'membro') end,
    'equipes', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'area', e.area, 'ordem', e.ordem,
                  'convidados', e.convidados,
                  'respondentes', case when r.brutas_apagadas_em is not null
                                       then coalesce((select (q ->> 'respondentes')::int from jsonb_array_elements(r.resultado -> 'equipes') q
                                                       where q ->> 'id' = e.id::text), 0)
                                       else (select count(*) from public.clima_respostas x where x.equipe_id = e.id and x.papel = 'membro') end,
                  'tokenEquipe', e.token_equipe, 'tokenLider', e.token_lider) order by e.ordem), '[]'::jsonb)
                from public.clima_equipes e where e.rodada_id = r.id),
    'relatorio', (select jsonb_build_object('id', rel.id, 'token', rel.token, 'status', rel.status,
                    'publicadoEm', disc_interno.iso(rel.publicado_em), 'atualizadoEm', disc_interno.iso(rel.atualizado_em),
                    'temas', case when jsonb_typeof(rel.dados -> 'temas') = 'array' then rel.dados -> 'temas' else '[]'::jsonb end)
                    from public.relatorios rel where rel.clima_rodada_id = r.id limit 1))
  from public.clima_rodadas r where r.id = p_id;
$$;

-- -----------------------------------------------------------------------------
-- Funções públicas (anon): dados do link e envio
-- -----------------------------------------------------------------------------

create or replace function public.clima_publica(p_token text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  e public.clima_equipes%rowtype;
  r public.clima_rodadas%rowtype;
  v_papel text;
  v_emp text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return disc_interno.erro('Link inválido ou pesquisa encerrada. Fale com quem enviou o link.');
  end if;
  select * into e from public.clima_equipes where token_equipe = p_token;
  if found then v_papel := 'membro';
  else
    select * into e from public.clima_equipes where token_lider = p_token;
    if found then v_papel := 'lider'; end if;
  end if;
  if v_papel is null then
    return disc_interno.erro('Link inválido ou pesquisa encerrada. Fale com quem enviou o link.');
  end if;
  select * into r from public.clima_rodadas where id = e.rodada_id;
  if r.status <> 'aberta' then
    return json_build_object('ok', false, 'erro', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!', 'encerrada', true);
  end if;
  select nome into v_emp from public.empresas where id = r.empresa_id;
  return json_build_object('ok', true, 'papel', v_papel, 'empresaNome', coalesce(v_emp, ''), 'equipeNome', e.nome,
    'complemento', r.complemento, 'n4', r.complemento and r.canal_texto <> '', 'canalTexto', r.canal_texto, 'canalUrl', r.canal_url,
    'contatoDados', r.contato_dados, 'retencaoDias', r.retencao_dias, 'versaoItens', r.versao_itens);
end;
$$;

-- Envio anônimo: p_respostas = {itens: {A1: 1..5, …, N4: 0..3}, comentario, segundos, chave (32 hex aleatórios do aparelho)}.
-- Mesmas regras e mensagens de DISC_CLIMA.validarEnvio. Reenvio com a mesma chave = {ok, duplicado: true}.
create or replace function public.clima_enviar(p_token text, p_respostas jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  MSG_FORMATO constant text := 'Respostas em formato inválido.';
  e public.clima_equipes%rowtype;
  r public.clima_rodadas%rowtype;
  v_papel text;
  v_permitidos text[];
  v_itens jsonb := '{}'::jsonb;
  kk text;
  vv jsonb;
  v_int int;
  v_com text := '';
  v_seg int;
  v_chave text;
  v_hash text;
  v_qtd int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return disc_interno.erro('Link inválido ou pesquisa encerrada. Fale com quem enviou o link.');
  end if;
  select * into e from public.clima_equipes where token_equipe = p_token for update;
  if found then v_papel := 'membro';
  else
    select * into e from public.clima_equipes where token_lider = p_token for update;
    if found then v_papel := 'lider'; end if;
  end if;
  if v_papel is null then
    return disc_interno.erro('Link inválido ou pesquisa encerrada. Fale com quem enviou o link.');
  end if;
  select * into r from public.clima_rodadas where id = e.rodada_id;
  if r.status <> 'aberta' then
    return json_build_object('ok', false, 'erro', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!', 'encerrada', true);
  end if;
  if disc_interno.contar_tentativa('clima_envio', r.id::text, interval '10 minutes') > 300
     or disc_interno.contar_tentativa('clima_global', '', interval '10 minutes') > 2000 then
    return disc_interno.erro('Muitas respostas em pouco tempo. Tente de novo em alguns minutos.');
  end if;

  -- validação (igual a DISC_CLIMA.validarEnvio)
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then return disc_interno.erro(MSG_FORMATO); end if;
  if v_papel = 'lider' then
    v_permitidos := array['A1','A2','A3','A4','A5','B1','B2','B3','B4','C1','C2','C3','D1','D2','D3','E1','E2','E3','FL1','FL2','FL3','H1'];
  else
    v_permitidos := array['A1','A2','A3','A4','A5','B1','B2','B3','B4','C1','C2','C3','D1','D2','D3','E1','E2','E3','F1','F2','F3',
                          'G1','G2','G3','H1'];
    if r.complemento then
      v_permitidos := v_permitidos || array['N1','N2','N3','N5'];
      if r.canal_texto <> '' then v_permitidos := v_permitidos || array['N4']; end if;
    end if;
  end if;
  if p_respostas ? 'itens' and jsonb_typeof(p_respostas -> 'itens') <> 'null' then
    if jsonb_typeof(p_respostas -> 'itens') <> 'object' then return disc_interno.erro(MSG_FORMATO); end if;
    for kk, vv in select * from jsonb_each(p_respostas -> 'itens') loop
      if not (kk = any(v_permitidos)) then return disc_interno.erro(MSG_FORMATO); end if;
      if jsonb_typeof(vv) = 'null' then continue; end if;
      v_int := disc_interno.clima_int(vv, case when kk = 'N4' then 0 else 1 end, case when kk = 'N4' then 3 else 5 end);
      if v_int is null then return disc_interno.erro(MSG_FORMATO); end if;
      v_itens := v_itens || jsonb_build_object(kk, v_int);
    end loop;
  end if;
  if p_respostas ? 'comentario' and jsonb_typeof(p_respostas -> 'comentario') not in ('string', 'null') then
    return disc_interno.erro(MSG_FORMATO);
  end if;
  if v_papel = 'membro' and jsonb_typeof(p_respostas -> 'comentario') = 'string' then
    v_com := regexp_replace(p_respostas ->> 'comentario', E'\r\n?', E'\n', 'g');
    v_com := regexp_replace(v_com, E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', ' ', 'g');
    v_com := regexp_replace(v_com, E'[ \t]+', ' ', 'g');
    v_com := regexp_replace(v_com, E' *\n *', E'\n', 'g');
    v_com := regexp_replace(v_com, E'\n{3,}', E'\n\n', 'g');
    v_com := btrim(v_com, E' \n');
    if char_length(v_com) > 1000 then v_com := btrim(left(v_com, 1000), E' \n'); end if;
  end if;
  if p_respostas ? 'segundos' and jsonb_typeof(p_respostas -> 'segundos') <> 'null' then
    v_seg := disc_interno.clima_int(p_respostas -> 'segundos', 0, 2147483647);
    if v_seg is null then return disc_interno.erro(MSG_FORMATO); end if;
    v_seg := least(v_seg, 86400);
  end if;
  v_chave := case when jsonb_typeof(p_respostas -> 'chave') = 'string' then p_respostas ->> 'chave' else '' end;
  if v_chave !~ '^[0-9a-f]{32}$' then return disc_interno.erro(MSG_FORMATO); end if;
  if v_itens = '{}'::jsonb and v_com = '' then
    return disc_interno.erro('Responda pelo menos uma pergunta antes de enviar.');
  end if;

  -- reenvio do mesmo aparelho (mesma chave): já gravado
  v_hash := encode(pg_catalog.sha256(convert_to(r.id::text || ':' || v_chave, 'UTF8')), 'hex');
  if exists (select 1 from public.clima_recebidos x where x.rodada_id = r.id and x.chave = v_hash) then
    return json_build_object('ok', true, 'duplicado', true);
  end if;
  if v_papel = 'lider' then
    if exists (select 1 from public.clima_respostas x where x.equipe_id = e.id and x.papel = 'lider') then
      return disc_interno.erro('A resposta da liderança desta equipe já foi registrada.');
    end if;
  else
    select count(*) into v_qtd from public.clima_respostas x where x.equipe_id = e.id and x.papel = 'membro';
    if v_qtd >= e.convidados then
      return disc_interno.erro('Esta equipe já recebeu todas as respostas esperadas. Se você ainda não respondeu, fale com quem enviou o link.');
    end if;
  end if;
  insert into public.clima_respostas (rodada_id, equipe_id, papel, versao_itens, itens, comentario, segundos)
    values (r.id, e.id, v_papel, r.versao_itens, v_itens, v_com, v_seg);
  insert into public.clima_recebidos (rodada_id, chave) values (r.id, v_hash);
  return json_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções do painel (authenticated; só admin)
-- -----------------------------------------------------------------------------

-- p_dados: {empresaId, nome, complemento, canalTexto, canalUrl, contatoDados, retencaoDias,
--           equipes: [{liderId (pessoa que lidera no organograma), convidados?}]} na ordem do organograma.
-- Convidados = liderados diretos ativos (pode aumentar para quem ainda não está no cadastro; nunca diminuir).
create or replace function public.clima_criar_rodada(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_nome text;
  v_compl boolean;
  v_canal text;
  v_url text;
  v_contato text;
  v_ret int;
  v_id uuid;
  x jsonb;
  v_lider uuid;
  v_vinc public.vinculos%rowtype;
  v_pnome text;
  v_diretos int;
  v_conv int;
  v_total int := 0;
  v_ordem int := 0;
  v_vistos uuid[] := array[]::uuid[];
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then return disc_interno.erro('Dados da pesquisa ausentes.'); end if;
  v_emp := disc_interno.uuid_ou_nulo(p_dados -> 'empresaId');
  if v_emp is null or not exists (select 1 from public.empresas where id = v_emp) then return disc_interno.erro('Empresa não encontrada.'); end if;
  if exists (select 1 from public.clima_rodadas where empresa_id = v_emp and status = 'aberta') then
    return disc_interno.erro('Já existe uma pesquisa de clima aberta nesta empresa. Encerre-a antes de criar outra.');
  end if;
  v_nome := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'nome'), '\s+', ' ', 'g')), 120);
  if v_nome = '' then v_nome := 'Pesquisa de clima · ' || to_char(now() at time zone 'America/Sao_Paulo', 'MM/YYYY'); end if;
  v_compl := coalesce(p_dados -> 'complemento' = 'true'::jsonb, false);
  v_canal := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'canalTexto'), '\s+', ' ', 'g')), 200);
  v_url := btrim(disc_interno.texto(p_dados -> 'canalUrl'));
  if v_url <> '' and (char_length(v_url) > 300 or v_url !~ '^(https://|mailto:|tel:)[^[:space:]<>"]+$') then
    return disc_interno.erro('Link do canal de escuta inválido: use um endereço https://, mailto: ou tel:.');
  end if;
  if v_url <> '' and v_canal = '' then return disc_interno.erro('Diga também o nome do canal de escuta.'); end if;
  v_contato := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'contatoDados'), '\s+', ' ', 'g')), 200);
  v_ret := coalesce(disc_interno.clima_int(p_dados -> 'retencaoDias', 30, 365), 90);
  if p_dados ? 'retencaoDias' and jsonb_typeof(p_dados -> 'retencaoDias') <> 'null'
     and disc_interno.clima_int(p_dados -> 'retencaoDias', 30, 365) is null then
    return disc_interno.erro('Prazo de retenção inválido: de 30 a 365 dias.');
  end if;
  if jsonb_typeof(p_dados -> 'equipes') <> 'array' or jsonb_array_length(p_dados -> 'equipes') = 0 then
    return disc_interno.erro('Escolha pelo menos uma equipe do organograma.');
  end if;
  if jsonb_array_length(p_dados -> 'equipes') > 60 then return disc_interno.erro('Equipes demais numa pesquisa (máximo 60).'); end if;

  insert into public.clima_rodadas (empresa_id, nome, complemento, canal_texto, canal_url, contato_dados, retencao_dias)
    values (v_emp, v_nome, v_compl, case when v_compl then v_canal else '' end, case when v_compl then v_url else '' end, v_contato, v_ret)
    returning id into v_id;
  for x in select * from jsonb_array_elements(p_dados -> 'equipes') loop
    v_lider := disc_interno.uuid_ou_nulo(x -> 'liderId');
    if v_lider is null or v_lider = any(v_vistos) then
      raise exception 'Equipe inválida ou repetida.';
    end if;
    v_vistos := v_vistos || v_lider;
    select * into v_vinc from public.vinculos v where v.pessoa_id = v_lider and v.empresa_id = v_emp and v.status = 'ativo';
    if not found then raise exception 'Quem lidera a equipe precisa ser colaborador(a) ativo(a) desta empresa.'; end if;
    select count(*) into v_diretos from public.relacoes rl
      join public.vinculos vv on vv.pessoa_id = rl.para_pessoa and vv.empresa_id = v_emp and vv.status = 'ativo'
     where rl.empresa_id = v_emp and rl.de_pessoa = v_lider and rl.tipo = 'lidera';
    if v_diretos = 0 then raise exception 'Uma das pessoas escolhidas não lidera ninguém no organograma.'; end if;
    v_conv := v_diretos;
    if x ? 'convidados' and jsonb_typeof(x -> 'convidados') <> 'null' then
      v_conv := disc_interno.clima_int(x -> 'convidados', v_diretos, 500);
      if v_conv is null then
        raise exception 'Convidados de uma equipe: de % (liderados no organograma) a 500.', v_diretos;
      end if;
    end if;
    select nome into v_pnome from public.pessoas where id = v_lider;
    insert into public.clima_equipes (rodada_id, lider_pessoa_id, nome, area, ordem, convidados, token_equipe, token_lider)
      values (v_id, v_lider, 'Equipe de ' || disc_interno.clima_nome_curto(v_pnome), left(btrim(v_vinc.area), 120), v_ordem, v_conv,
              disc_interno.token_aleatorio(), disc_interno.token_aleatorio());
    v_ordem := v_ordem + 1;
    v_total := v_total + v_conv;
  end loop;
  if v_total < 5 then
    raise exception 'Com menos de 5 pessoas convidadas a pesquisa não pode ser aplicada: ninguém teria anonimato. Ofereça uma conversa facilitada pela consultoria.';
  end if;
  return json_build_object('ok', true, 'rodada', disc_interno.clima_rodada_json(v_id));
exception
  when raise_exception then
    return disc_interno.erro(sqlerrm);
end;
$$;

create or replace function public.clima_listar(p_empresa uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  return json_build_object('ok', true, 'rodadas', (select coalesce(jsonb_agg(disc_interno.clima_rodada_json(r.id) order by r.aberta_em desc, r.id), '[]'::jsonb)
    from public.clima_rodadas r where r.empresa_id = p_empresa));
end;
$$;

-- Encerra a rodada e CONGELA o resultado (agregados já suprimidos). Respostas novas passam a ser recusadas.
create or replace function public.clima_encerrar(p_rodada uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
  v_res jsonb;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada for update;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  if r.status = 'encerrada' then return disc_interno.erro('Esta pesquisa já foi encerrada.'); end if;
  -- trava as equipes (nenhum envio no meio do cálculo)
  perform 1 from public.clima_equipes e where e.rodada_id = r.id for update;
  v_res := disc_interno.clima_calcular(
    (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'area', e.area, 'ordem', e.ordem, 'convidados', e.convidados)), '[]'::jsonb)
       from public.clima_equipes e where e.rodada_id = r.id),
    (select coalesce(jsonb_agg(jsonb_build_object('equipeId', x.equipe_id, 'papel', x.papel, 'itens', x.itens, 'comentario', x.comentario,
               'segundos', x.segundos)), '[]'::jsonb)
       from public.clima_respostas x where x.rodada_id = r.id),
    r.complemento, r.complemento and r.canal_texto <> '');
  update public.clima_rodadas set status = 'encerrada', encerrada_em = now(), resultado = v_res where id = r.id;
  return json_build_object('ok', true, 'rodada', disc_interno.clima_rodada_json(r.id), 'resultado', v_res);
end;
$$;

-- Resultado congelado (visão do consultor: inclui a visão do líder e a contagem de respostas de qualidade duvidosa).
create or replace function public.clima_resultado(p_rodada uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  if r.status <> 'encerrada' or r.resultado is null then
    return disc_interno.erro('Os resultados só aparecem depois que a pesquisa é encerrada.');
  end if;
  return json_build_object('ok', true, 'rodada', disc_interno.clima_rodada_json(r.id), 'resultado', r.resultado);
end;
$$;

-- Comentários (H2) para o consultor escrever os temas: só com a rodada encerrada, 10+ respostas no total, em ordem aleatória,
-- sem equipe e sem horário. Nunca vão para o cliente (o relatório só leva os temas escritos pelo consultor).
create or replace function public.clima_comentarios(p_rodada uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  if r.status <> 'encerrada' then return disc_interno.erro('Os comentários só aparecem depois que a pesquisa é encerrada.'); end if;
  if r.brutas_apagadas_em is not null then
    return json_build_object('ok', true, 'disponivel', false, 'apagados', true, 'comentarios', '[]'::json);
  end if;
  if coalesce((r.resultado ->> 'respondentes')::int, 0) < 10 then
    return json_build_object('ok', true, 'disponivel', false, 'apagados', false, 'comentarios', '[]'::json);
  end if;
  return json_build_object('ok', true, 'disponivel', true, 'apagados', false, 'comentarios',
    (select coalesce(json_agg(c.comentario), '[]'::json) from (
      select x.comentario from public.clima_respostas x
       where x.rodada_id = r.id and x.papel = 'membro' and btrim(x.comentario) <> '' order by random()) c));
end;
$$;

-- Monta (ou refaz) o relatório de clima da rodada a partir do resultado congelado, só com o que o cliente pode ver.
-- p_opcoes: {publicar?: true|false (ausente = mantém), consultor?: texto, temas?: [até 6 textos de até 300 caracteres]}.
-- Temas só entram com 10+ respostas. Primeira publicação marca a entrega (conta o prazo de retenção).
create or replace function public.clima_gerar_relatorio(p_rodada uuid, p_opcoes jsonb default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
  v_emp public.empresas%rowtype;
  v_temas jsonb := '[]'::jsonb;
  v_dados jsonb;
  v_rel public.relatorios%rowtype;
  v_status text;
  v_op jsonb := coalesce(p_opcoes, '{}'::jsonb);
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada for update;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  if r.status <> 'encerrada' or r.resultado is null then
    return disc_interno.erro('Encerre a pesquisa antes de gerar o relatório.');
  end if;
  if jsonb_typeof(v_op) <> 'object' then return disc_interno.erro('Opções do relatório inválidas.'); end if;
  select * into v_emp from public.empresas where id = r.empresa_id;
  if coalesce((r.resultado -> 'comentarios' ->> 'disponivel')::boolean, false) and jsonb_typeof(v_op -> 'temas') = 'array' then
    select coalesce(jsonb_agg(t order by o), '[]'::jsonb) into v_temas from (
      select left(btrim(regexp_replace(x #>> '{}', '\s+', ' ', 'g')), 300) as t, o
        from jsonb_array_elements(v_op -> 'temas') with ordinality q(x, o)
       where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> '' order by o limit 6) s;
  end if;
  v_dados := jsonb_build_object('modelo', 'clima', 'versao', 1,
    'titulo', 'Pesquisa de clima · ' || coalesce(v_emp.nome, ''),
    'geradoEm', disc_interno.iso(now()),
    'empresa', jsonb_build_object('nome', coalesce(v_emp.nome, ''), 'cidade', coalesce(v_emp.cidade, '')),
    'consultor', left(btrim(regexp_replace(disc_interno.texto(v_op -> 'consultor'), '\s+', ' ', 'g')), 80),
    'rodada', jsonb_build_object('nome', r.nome, 'abertaEm', disc_interno.iso(r.aberta_em), 'encerradaEm', disc_interno.iso(r.encerrada_em),
      'complemento', r.complemento, 'n4Ligado', r.complemento and r.canal_texto <> '', 'canalTexto', r.canal_texto, 'canalUrl', r.canal_url,
      'versaoItens', r.versao_itens),
    'resultado', disc_interno.clima_visao_cliente(r.resultado),
    'temas', v_temas);
  perform set_config('disc.clima_snapshot', '1', true);
  select * into v_rel from public.relatorios where clima_rodada_id = r.id;
  if found then
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado'
                     when v_op -> 'publicar' = 'false'::jsonb then 'rascunho' else v_rel.status end;
    update public.relatorios set dados = v_dados, status = v_status where token = v_rel.token returning * into v_rel;
  else
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado' else 'rascunho' end;
    insert into public.relatorios (modelo, empresa_id, clima_rodada_id, dados, status)
      values ('clima', r.empresa_id, r.id, v_dados, v_status) returning * into v_rel;
  end if;
  perform set_config('disc.clima_snapshot', '', true);
  if v_rel.status = 'publicado' and r.entregue_em is null then
    update public.clima_rodadas set entregue_em = now() where id = r.id;
  end if;
  return json_build_object('ok', true, 'relatorio', json_build_object('id', v_rel.id, 'token', v_rel.token, 'status', v_rel.status,
    'modelo', 'clima', 'publicadoEm', disc_interno.iso(v_rel.publicado_em)));
end;
$$;

create or replace function public.clima_excluir_rodada(p_rodada uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  delete from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  return json_build_object('ok', true, 'id', p_rodada);
end;
$$;

-- Retenção: apaga as respostas brutas (itens e comentários) e o controle de reenvio das rodadas encerradas cujo prazo
-- venceu (retencao_dias depois da entrega; sem entrega, depois do encerramento) e tira do resultado a visão individual do
-- líder. Fica só o resultado agregado (grupos com k >= 5). Com p_rodada e p_agora = true apaga já aquela rodada encerrada.
-- Não é agendada aqui: o painel chama, ou o dono agenda (docs/SUPABASE.md).
create or replace function public.clima_apagar_brutas(p_rodada uuid default null, p_agora boolean default false)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_resp int;
  v_papel text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  -- admin pelo painel; service_role (Edge Function); ou conexão direta ao banco (SQL Editor, agendamento do dono)
  if not public.e_admin() and v_papel not in ('service_role', 'none') then
    return disc_interno.erro('Sem permissão.');
  end if;
  v_ids := array(select r.id from public.clima_rodadas r
                  where r.status = 'encerrada' and r.brutas_apagadas_em is null
                    and (p_rodada is null or r.id = p_rodada)
                    and ((p_agora and p_rodada is not null)
                         or now() >= coalesce(r.entregue_em, r.encerrada_em) + make_interval(days => r.retencao_dias)));
  delete from public.clima_respostas x where x.rodada_id = any(v_ids);
  get diagnostics v_resp = row_count;
  delete from public.clima_recebidos x where x.rodada_id = any(v_ids);
  update public.clima_rodadas r set brutas_apagadas_em = now(),
    resultado = (r.resultado - 'lideres') || jsonb_build_object('lideres', '[]'::jsonb, 'lideresApagados', true)
   where r.id = any(v_ids);
  return json_build_object('ok', true, 'rodadas', coalesce(array_length(v_ids, 1), 0), 'respostas', v_resp);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões: só administradores leem rodadas e equipes; respostas e controle de reenvio, ninguém pela API
-- -----------------------------------------------------------------------------

alter table public.clima_rodadas enable row level security;
alter table public.clima_equipes enable row level security;
alter table public.clima_respostas enable row level security;
alter table public.clima_recebidos enable row level security;

drop policy if exists clima_rodadas_admin_le on public.clima_rodadas;
create policy clima_rodadas_admin_le on public.clima_rodadas for select to authenticated using (public.e_admin());
drop policy if exists clima_equipes_admin_le on public.clima_equipes;
create policy clima_equipes_admin_le on public.clima_equipes for select to authenticated using (public.e_admin());
-- clima_respostas e clima_recebidos: nenhuma política (só as funções do banco).

revoke all on public.clima_rodadas, public.clima_equipes, public.clima_respostas, public.clima_recebidos from public;
revoke all on function disc_interno.clima_itens(), disc_interno.clima_dimensoes(), disc_interno.clima_int(jsonb, int, int),
  disc_interno.clima_arred(numeric), disc_interno.clima_arred2(numeric), disc_interno.clima_faixa(int), disc_interno.clima_pct(int, int),
  disc_interno.clima_escores(jsonb, text), disc_interno.clima_estat_dim(jsonb, text), disc_interno.clima_estat_item(jsonb, text),
  disc_interno.clima_suprimir(jsonb, jsonb, jsonb, int), disc_interno.clima_nome_curto(text),
  disc_interno.clima_calcular(jsonb, jsonb, boolean, boolean), disc_interno.clima_visao_cliente(jsonb),
  disc_interno.clima_equipes_congeladas(), disc_interno.clima_rodadas_antes_gravar(), disc_interno.clima_respostas_antes_inserir(),
  disc_interno.relatorios_clima_protegido(), disc_interno.clima_rodada_json(uuid) from public;
revoke all on function public.clima_publica(text), public.clima_enviar(text, jsonb), public.clima_criar_rodada(jsonb),
  public.clima_listar(uuid), public.clima_encerrar(uuid), public.clima_resultado(uuid), public.clima_comentarios(uuid),
  public.clima_gerar_relatorio(uuid, jsonb), public.clima_excluir_rodada(uuid), public.clima_apagar_brutas(uuid, boolean) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.clima_rodadas, public.clima_equipes, public.clima_respostas, public.clima_recebidos from %I', papel);
      execute format('revoke all on function public.clima_criar_rodada(jsonb), public.clima_listar(uuid), public.clima_encerrar(uuid), '
        || 'public.clima_resultado(uuid), public.clima_comentarios(uuid), public.clima_gerar_relatorio(uuid, jsonb), '
        || 'public.clima_excluir_rodada(uuid), public.clima_apagar_brutas(uuid, boolean) from %I', papel);
      execute format('revoke all on function disc_interno.clima_itens(), disc_interno.clima_dimensoes(), disc_interno.clima_int(jsonb, int, int), '
        || 'disc_interno.clima_arred(numeric), disc_interno.clima_arred2(numeric), disc_interno.clima_faixa(int), disc_interno.clima_pct(int, int), '
        || 'disc_interno.clima_escores(jsonb, text), disc_interno.clima_estat_dim(jsonb, text), disc_interno.clima_estat_item(jsonb, text), '
        || 'disc_interno.clima_suprimir(jsonb, jsonb, jsonb, int), disc_interno.clima_nome_curto(text), '
        || 'disc_interno.clima_calcular(jsonb, jsonb, boolean, boolean), disc_interno.clima_visao_cliente(jsonb), '
        || 'disc_interno.clima_rodada_json(uuid) from %I', papel);
      execute format('grant execute on function public.clima_publica(text), public.clima_enviar(text, jsonb) to %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.clima_rodadas, public.clima_equipes to authenticated;
    grant execute on function public.clima_criar_rodada(jsonb), public.clima_listar(uuid), public.clima_encerrar(uuid),
      public.clima_resultado(uuid), public.clima_comentarios(uuid), public.clima_gerar_relatorio(uuid, jsonb),
      public.clima_excluir_rodada(uuid), public.clima_apagar_brutas(uuid, boolean) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, delete on public.clima_rodadas, public.clima_equipes, public.clima_respostas, public.clima_recebidos to service_role;
    grant update on public.clima_rodadas to service_role;
    grant execute on function public.clima_apagar_brutas(uuid, boolean) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261017120000_clima
-- -----------------------------------------------------------------------------

create or replace function public.versao_banco()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aplicadas text[] := array['20261005120000_disc'];
  faltando text[] := array[]::text[];
  m record;
begin
  for m in
    select * from (values
      (1, '20261006120000_pessoas_formulario', to_regclass('public.pessoas') is not null),
      (2, '20261007120000_empresas_equipes', to_regclass('public.empresas') is not null
                                              and to_regclass('public.vinculos') is not null
                                              and to_regclass('public.relacoes') is not null),
      (3, '20261008120000_parte2', exists (select 1 from pg_catalog.pg_attribute a
                                            where a.attrelid = to_regclass('public.respostas') and a.attname = 'exigido'
                                              and not a.attisdropped)),
      (4, '20261009120000_fotos', exists (select 1 from pg_catalog.pg_attribute a
                                           where a.attrelid = to_regclass('public.respostas') and a.attname = 'foto'
                                             and not a.attisdropped)),
      (5, '20261010120000_mover_versao', exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.respostas')
                                                    and a.attname = 'historico_processos' and not a.attisdropped)
                                         and exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.empresas')
                                                    and a.attname = 'organograma' and not a.attisdropped)),
      (6, '20261011120000_vendas', to_regclass('public.pedidos') is not null
                                   and to_regclass('public.cupons') is not null
                                   and to_regclass('public.pacotes') is not null
                                   and exists (select 1 from pg_catalog.pg_attribute a
                                                where a.attrelid = to_regclass('public.respostas')
                                                  and a.attname = 'origem' and not a.attisdropped)),
      (7, '20261012120000_infinitepay', exists (select 1 from pg_catalog.pg_attribute a
                                                 where a.attrelid = to_regclass('public.pedidos')
                                                   and a.attname = 'provedor_dados' and not a.attisdropped)),
      (8, '20261013120000_conexoes', exists (select 1 from pg_catalog.pg_attribute a
                                              where a.attrelid = to_regclass('public.pedidos')
                                                and a.attname = 'teste' and not a.attisdropped)),
      (9, '20261014120000_stripe', exists (select 1 from pg_catalog.pg_constraint c
                                            where c.conrelid = to_regclass('public.pedidos')
                                              and c.conname = 'pedidos_provedor_valido'
                                              and pg_catalog.pg_get_constraintdef(c.oid) like '%stripe%')),
      (10, '20261015120000_minimo_cobranca', to_regprocedure('disc_interno.cupons_minimo_cobranca()') is not null),
      (11, '20261016120000_envios_email', to_regclass('public.envios_email') is not null),
      (12, '20261017120000_clima', to_regclass('public.clima_respostas') is not null
                                   and to_regprocedure('public.clima_enviar(text, jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261017120000, 'migracoes', to_jsonb(aplicadas),
    'faltando', to_jsonb(faltando));
end;
$$;

revoke all on function public.versao_banco() from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('grant execute on function public.versao_banco() to %I', papel);
    end if;
  end loop;
end $$;

-- O PostgREST relê o esquema.
notify pgrst, 'reload schema';

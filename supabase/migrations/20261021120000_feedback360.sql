-- =============================================================================
-- Teste DISC — Feedback 360 da Liderança · Gestão sem Caos (versão 1, itens v0).
-- Roda DEPOIS de 20261005120000_disc.sql … 20261017120000_clima.sql. Não depende das migrações 20261018, 20261019 e
-- 20261020 (frentes paralelas): só acrescenta o modelo 'feedback360' às regras de public.relatorios mantendo os modelos
-- que já existirem.
-- Idempotente e seguro sobre dados reais: só cria tabelas, funções, gatilhos e políticas novas; amplia as regras de
-- public.relatorios e recria versao_banco. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Especificação: docs/painel-cientifico/360/decisao.md (3.1, 4 e 5). Mesma regra em JavaScript: js/feedback360.js
-- (prévia e testes; tests/supabase/feedback360.test.js confere que o SQL e o JS dão o MESMO resultado).
--
--   * public.f360_ciclos      ciclo por empresa (aberto | encerrado; data prevista de encerramento; canal de denúncia da
--                             empresa; contato para dados; contato do protocolo de relatos; retenção 30–90 dias depois da
--                             devolutiva; manter a lista de convidados até o pulso só com aval do advogado). 1 aberto por empresa.
--   * public.f360_avaliados   quem é avaliado (fotografia do organograma: pessoa, nome curto, ordem, topo = sem chefia, quantas
--                             chefias e convidados por fonte) + resultado CONGELADO no encerramento (só agregados suprimidos)
--                             + devolutiva (temas dos comentários, foco, observação do líder, plano, aceite do DISC).
--   * public.f360_convites    lista de convidados: um link INDIVIDUAL (64 hex) por avaliador × avaliado × fonte
--                             (auto | chefia | colegas | equipe | outros). Apagada no encerramento (ou guardada até o pulso).
--   * public.f360_respostas   resposta SEM pessoa, nome, telefone, e-mail, IP ou horário: ciclo, avaliado, fonte, versão,
--                             itens (DIR1..COE3: 0 = "não tive como observar", 1–5; GLB1: 1–5) e duração.
--   * public.f360_comentarios AB1/AB2 guardados para MODERAÇÃO (pendente | mantido | editado | descartado), com a fonte (para a
--                             elegibilidade: só de grupos exibidos; chefia à parte). Nunca vão crus ao líder.
--   * public.f360_vinculos    ligação link → resposta (para trocar ou apagar a própria resposta e não responder duas vezes).
--                             APAGADA no encerramento: depois disso nem a Gestão sem Caos sabe quem respondeu o quê.
--   * Funções públicas (anon): f360_publica(token), f360_enviar(token, respostas), f360_apagar_resposta(token).
--   * Funções do painel (só admin): f360_criar_ciclo, f360_listar, f360_encerrar, f360_recalcular, f360_comentarios,
--     f360_moderar, f360_salvar_devolutiva, f360_gerar_relatorio, f360_gerar_consolidado, f360_excluir_ciclo, f360_apagar_brutas.
--   * Toda a agregação e a supressão ficam aqui (disc_interno.f360_calcular): tema ≥ 3 por grupo anônimo, frase ≥ 5, fusão de
--     grupos pequenos, supressão complementar em "Outras pessoas (sem a chefia)", chefia à parte, nada com o ciclo aberto,
--     nenhum relatório com menos de 3 respostas anônimas válidas.
--   * relatorios: modelo novo 'feedback360' (empresa + f360_ciclo_id + f360_visao 'lider' | 'chefia' | 'empresa'; lider e
--     chefia com f360_avaliado_id). O snapshot "dados" só é montado pelas funções do banco (o painel só publica/despublica).
--   * Retenção: f360_apagar_brutas() apaga respostas, comentários e a lista de convidados vencidos (retencao_dias depois da
--     devolutiva; sem devolutiva, do encerramento) e os relatórios do 360 com mais de 24 meses. Nada é agendado aqui.
--   * versao_banco() passa a conhecer esta migração (versão 20261021120000).
-- ATENÇÃO: rodar de novo uma migração anterior que recrie relatorios_modelo_check (20261007 ou 20261017) sem rodar esta em
-- seguida tira o modelo 'feedback360' da regra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.f360_ciclos (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas (id) on delete cascade,
  nome                   text not null check (char_length(btrim(nome)) between 1 and 120 and char_length(nome) <= 120),
  status                 text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  versao_itens           text not null default 'v0' check (versao_itens ~ '^v[0-9]{1,3}$'),
  encerramento_previsto  date not null,
  canal_texto            text not null default '' check (char_length(canal_texto) <= 200),
  canal_url              text not null default '' check (canal_url = '' or (char_length(canal_url) <= 300
                                                         and canal_url ~ '^(https://|mailto:|tel:)[^[:space:]<>"]+$')),
  contato_dados          text not null default '' check (char_length(contato_dados) <= 200),
  contato_relatos        text not null default '' check (char_length(contato_relatos) <= 200),
  retencao_dias          int not null default 90 check (retencao_dias between 30 and 90),
  manter_lista           boolean not null default false,
  relatos_registrados    int not null default 0 check (relatos_registrados >= 0),
  aberto_em              timestamptz not null default now(),
  encerrado_em           timestamptz,
  lista_apagada_em       timestamptz,
  criado_em              timestamptz not null default now(),
  constraint f360_ciclos_status_datas check ((status = 'aberto') = (encerrado_em is null))
);
create unique index if not exists f360_ciclos_um_aberto on public.f360_ciclos (empresa_id) where status = 'aberto';
create index if not exists f360_ciclos_empresa_idx on public.f360_ciclos (empresa_id, aberto_em desc);

create table if not exists public.f360_avaliados (
  id                  uuid primary key default gen_random_uuid(),
  ciclo_id            uuid not null references public.f360_ciclos (id) on delete cascade,
  pessoa_id           uuid,   -- fotografia do organograma (sem chave estrangeira: o ciclo não depende do cadastro)
  nome                text not null check (char_length(nome) between 1 and 120),
  ordem               int not null check (ordem >= 0),
  topo                boolean not null default false,
  chefias             int not null default 0 check (chefias between 0 and 2),
  convidados          jsonb not null default '{}'::jsonb check (jsonb_typeof(convidados) = 'object'),
  resultado           jsonb,
  excluir             text[] not null default '{}'::text[],
  temas               jsonb not null default '[]'::jsonb check (jsonb_typeof(temas) = 'array'),
  foco                text not null default '' check (char_length(foco) <= 300),
  observacao          text not null default '' check (char_length(observacao) <= 600),
  plano               jsonb check (plano is null or jsonb_typeof(plano) = 'object'),
  disc_aceito         boolean not null default false,
  devolutiva_em       timestamptz,
  brutas_apagadas_em  timestamptz,
  constraint f360_avaliados_ordem_unica unique (ciclo_id, ordem),
  constraint f360_avaliados_pessoa_unica unique (ciclo_id, pessoa_id)
);
create index if not exists f360_avaliados_ciclo_idx on public.f360_avaliados (ciclo_id);

create table if not exists public.f360_convites (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references public.f360_ciclos (id) on delete cascade,
  avaliado_id  uuid not null references public.f360_avaliados (id) on delete cascade,
  fonte        text not null check (fonte in ('auto', 'chefia', 'colegas', 'equipe', 'outros')),
  pessoa_id    uuid not null,   -- fotografia (sem chave estrangeira)
  token        text not null unique check (token ~ '^[0-9a-f]{64}$'),
  constraint f360_convites_um_por_pessoa unique (avaliado_id, pessoa_id)
);
create index if not exists f360_convites_ciclo_idx on public.f360_convites (ciclo_id);

create table if not exists public.f360_respostas (
  id            uuid primary key default gen_random_uuid(),
  ciclo_id      uuid not null references public.f360_ciclos (id) on delete cascade,
  avaliado_id   uuid not null references public.f360_avaliados (id) on delete cascade,
  fonte         text not null check (fonte in ('auto', 'chefia', 'colegas', 'equipe', 'outros')),
  versao_itens  text not null check (versao_itens ~ '^v[0-9]{1,3}$'),
  itens         jsonb not null default '{}'::jsonb check (jsonb_typeof(itens) = 'object'),
  segundos      int check (segundos between 0 and 86400)
);
create index if not exists f360_respostas_avaliado_idx on public.f360_respostas (avaliado_id, fonte);

create table if not exists public.f360_comentarios (
  id              uuid primary key default gen_random_uuid(),
  ciclo_id        uuid not null references public.f360_ciclos (id) on delete cascade,
  avaliado_id     uuid not null references public.f360_avaliados (id) on delete cascade,
  fonte           text not null check (fonte in ('chefia', 'colegas', 'equipe', 'outros')),
  pergunta        text not null check (pergunta in ('AB1', 'AB2')),
  texto           text not null check (char_length(texto) between 1 and 1000),
  texto_moderado  text not null default '' check (char_length(texto_moderado) <= 1000),
  status          text not null default 'pendente' check (status in ('pendente', 'mantido', 'editado', 'descartado')),
  motivo          text not null default '' check (motivo in ('', 'identifica', 'ofensa', 'sensivel', 'relato', 'fora')),
  elegivel        boolean not null default false,
  sorteio         double precision not null default random()
);
create index if not exists f360_comentarios_avaliado_idx on public.f360_comentarios (avaliado_id);

create table if not exists public.f360_vinculos (
  convite_id   uuid primary key references public.f360_convites (id) on delete cascade,
  resposta_id  uuid not null references public.f360_respostas (id) on delete cascade,
  comentarios  uuid[] not null default '{}'::uuid[]
);

-- relatorios: modelo 'feedback360' (empresa + ciclo + visão). Acrescenta o modelo às regras que já existem (inclusive as
-- de outras migrações), sem tirar nenhum.
alter table public.relatorios add column if not exists f360_ciclo_id uuid references public.f360_ciclos (id) on delete cascade;
alter table public.relatorios add column if not exists f360_avaliado_id uuid references public.f360_avaliados (id) on delete cascade;
alter table public.relatorios add column if not exists f360_visao text;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.relatorios'::regclass and conname = 'relatorios_f360_visao') then
    alter table public.relatorios add constraint relatorios_f360_visao check (f360_visao is null or f360_visao in ('lider', 'chefia', 'empresa'));
  end if;
end $$;
create unique index if not exists relatorios_f360_avaliado_visao on public.relatorios (f360_avaliado_id, f360_visao) where f360_avaliado_id is not null;
create unique index if not exists relatorios_f360_empresa on public.relatorios (f360_ciclo_id) where f360_visao = 'empresa';
do $$
declare
  v_def text;
  v_modelos text[];
  v_expr text;
begin
  select pg_catalog.pg_get_constraintdef(oid) into v_def from pg_catalog.pg_constraint
   where conrelid = 'public.relatorios'::regclass and conname = 'relatorios_modelo_check';
  if v_def is null or v_def not like '%feedback360%' then
    -- modelos já aceitos: no formato ARRAY['a'::text, …] e, por tolerância, '{a,b}'::text[]
    v_modelos := array(select m[1] from regexp_matches(coalesce(v_def, ''), '''([a-z0-9_]+)''', 'g') as m)
      || array(select x from regexp_matches(coalesce(v_def, ''), '''\{([a-z0-9_,]+)\}''', 'g') as m, unnest(string_to_array(m[1], ',')) x);
    v_modelos := array(select distinct x from unnest(v_modelos || array['processo', 'equipe', 'lideranca', 'pessoa', 'clima', 'feedback360']) x order by 1);
    if v_def is not null then execute 'alter table public.relatorios drop constraint relatorios_modelo_check'; end if;
    execute 'alter table public.relatorios add constraint relatorios_modelo_check check (modelo in ('
      || (select string_agg(quote_literal(x), ', ' order by x) from unnest(v_modelos) x) || '))';
  end if;
  select pg_catalog.pg_get_constraintdef(oid) into v_def from pg_catalog.pg_constraint
   where conrelid = 'public.relatorios'::regclass and conname = 'relatorios_modelo_dono';
  if v_def is null or v_def not like '%feedback360%' then
    v_expr := '(modelo = ''feedback360'' and empresa_id is not null and f360_ciclo_id is not null and f360_visao is not null '
      || 'and ((f360_visao = ''empresa'') = (f360_avaliado_id is null)))';
    if v_def is not null then
      v_expr := '(' || substring(v_def from '^CHECK \((.*)\)$') || ') or ' || v_expr;
      execute 'alter table public.relatorios drop constraint relatorios_modelo_dono';
    end if;
    execute 'alter table public.relatorios add constraint relatorios_modelo_dono check (' || v_expr || ')';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Itens v0 e auxiliares de cálculo (iguais a js/feedback360.js)
-- -----------------------------------------------------------------------------

create or replace function disc_interno.f360_itens()
returns table (item text, tema text, ordem int)
language sql immutable set search_path = '' as $$
  select * from (values
    ('DIR1', 'DIR', 1), ('DIR2', 'DIR', 2), ('DIR3', 'DIR', 3), ('FBK1', 'FBK', 4), ('FBK2', 'FBK', 5), ('FBK3', 'FBK', 6),
    ('APO1', 'APO', 7), ('APO2', 'APO', 8), ('APO3', 'APO', 9), ('AUT1', 'AUT', 10), ('AUT2', 'AUT', 11), ('AUT3', 'AUT', 12),
    ('RES1', 'RES', 13), ('RES2', 'RES', 14), ('RES3', 'RES', 15), ('COE1', 'COE', 16), ('COE2', 'COE', 17), ('COE3', 'COE', 18)
  ) as t(item, tema, ordem);
$$;

create or replace function disc_interno.f360_temas()
returns table (tema text, ordem int)
language sql immutable set search_path = '' as $$
  select * from (values ('DIR', 1), ('FBK', 2), ('APO', 3), ('AUT', 4), ('RES', 5), ('COE', 6)) as t(tema, ordem);
$$;

-- Média com 1 casa (igual ao JS): piso(x × 10 + 0,5 + 1e-9) / 10.
create or replace function disc_interno.f360_arred1(x numeric)
returns numeric language sql immutable set search_path = '' as $$
  select (floor(x * 10 + 0.5 + 0.000000001) / 10)::numeric(4, 1);
$$;

-- Uma resposta normalizada: {f: fonte, i: itens válidos (0–5), t: {tema: média|null} (2 de 3 frases), v: tem tema válido,
-- s: sinalizada (menos de 2 s por frase respondida ou a mesma resposta nas 18)}.
create or replace function disc_interno.f360_normalizar(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_itens jsonb;
  v_temas jsonb := '{}'::jsonb;
  t record;
  v_s int;
  v_c int;
  v_valida boolean := false;
  v_resp int;
  v_seg int;
  v_reta boolean;
begin
  select coalesce(jsonb_object_agg(i.item, q.v), '{}'::jsonb) into v_itens
    from disc_interno.f360_itens() i
    cross join lateral (select disc_interno.clima_int(case when jsonb_typeof(p -> 'itens') = 'object' then p -> 'itens' -> i.item else null end, 0, 5) as v) q
   where q.v is not null;
  select count(*) into v_resp from jsonb_object_keys(v_itens);
  for t in select * from disc_interno.f360_temas() order by ordem loop
    select coalesce(sum((v_itens ->> i.item)::int), 0), count(*) into v_s, v_c
      from disc_interno.f360_itens() i where i.tema = t.tema and (v_itens ->> i.item)::int between 1 and 5;
    v_temas := v_temas || jsonb_build_object(t.tema, case when v_c >= 2 then v_s::numeric / v_c else null end);
    if v_c >= 2 then v_valida := true; end if;
  end loop;
  v_seg := disc_interno.clima_int(p -> 'segundos', 0, 2147483647);
  select count(*) = 18 and count(distinct (v_itens ->> i.item)) = 1 into v_reta
    from disc_interno.f360_itens() i where (v_itens ->> i.item)::int between 1 and 5;
  return jsonb_build_object('f', p ->> 'fonte', 'i', v_itens, 't', v_temas, 'v', v_valida,
    's', (v_seg is not null and v_resp > 0 and v_seg < 2 * v_resp) or v_reta);
end;
$$;

-- Tema num conjunto de respostas: {n, media, variadas} (variadas só com n ≥ 5: rwg(j), σ² = 2, < 0,50) ou {n: 0}.
create or replace function disc_interno.f360_estat_tema(p_membros jsonb, p_tema text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_n int;
  v_soma numeric;
  it record;
  v_cnt int;
  v_var numeric;
  v_vars numeric[] := array[]::numeric[];
  v_j int;
  v_s2 numeric;
  v_razao numeric;
  v_rwg numeric;
  v_variadas boolean := null;
begin
  select count(*), sum((m -> 't' ->> p_tema)::numeric) into v_n, v_soma
    from jsonb_array_elements(p_membros) m where jsonb_typeof(m -> 't' -> p_tema) = 'number';
  if v_n = 0 then return jsonb_build_object('n', 0); end if;
  if v_n >= 5 then
    for it in select * from disc_interno.f360_itens() i where i.tema = p_tema order by i.ordem loop
      select count(*), var_samp(x) into v_cnt, v_var from (
        select (m -> 'i' ->> it.item)::numeric as x from jsonb_array_elements(p_membros) m
         where jsonb_typeof(m -> 't' -> p_tema) = 'number' and (m -> 'i' ->> it.item)::int between 1 and 5) q;
      if v_cnt >= 2 then v_vars := v_vars || v_var; end if;
    end loop;
    v_j := coalesce(array_length(v_vars, 1), 0);
    if v_j > 0 then
      select avg(x) into v_s2 from unnest(v_vars) x;
      v_razao := v_s2 / 2;
      v_rwg := case when v_razao >= 1 then 0 else (v_j * (1 - v_razao)) / (v_j * (1 - v_razao) + v_razao) end;
      v_variadas := disc_interno.clima_arred2(greatest(0, least(1, v_rwg))) < 0.5;
    end if;
  end if;
  return jsonb_build_object('n', v_n, 'media', disc_interno.f360_arred1(v_soma / v_n), 'variadas', v_variadas);
end;
$$;

-- Frase num conjunto de respostas: {n (1–5), media|null, nao (0 = não observou), r (avaliadores), dist [c1..c5]}.
create or replace function disc_interno.f360_estat_item(p_membros jsonb, p_item text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('n', count(*) filter (where v between 1 and 5),
    'media', case when count(*) filter (where v between 1 and 5) > 0
                  then disc_interno.f360_arred1(sum(v) filter (where v between 1 and 5)::numeric / count(*) filter (where v between 1 and 5)) end,
    'nao', count(*) filter (where v = 0), 'r', count(*),
    'dist', jsonb_build_array(count(*) filter (where v = 1), count(*) filter (where v = 2), count(*) filter (where v = 3),
                              count(*) filter (where v = 4), count(*) filter (where v = 5)))
    from (select (m -> 'i' ->> p_item)::int as v from jsonb_array_elements(coalesce(p_membros, '[]'::jsonb)) m) q;
$$;

-- "Colegas", "Colegas e equipe", "Colegas, equipe e outros" (o primeiro com maiúscula).
create or replace function disc_interno.f360_nome_grupo(p_fontes text[])
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_nomes text[];
  v_n int;
begin
  v_nomes := array(select case when o = 1 then initcap(f) else f end from unnest(p_fontes) with ordinality u(f, o) order by o);
  v_n := coalesce(array_length(v_nomes, 1), 0);
  if v_n <= 1 then return coalesce(v_nomes[1], ''); end if;
  return array_to_string(v_nomes[1:v_n - 1], ', ') || ' e ' || v_nomes[v_n];
end;
$$;

/*
 * Cálculo completo de uma pessoa avaliada (mesma entrada e saída de DISC_F360.calcular, js/feedback360.js):
 *   p_respostas  [{fonte, itens, segundos}] · p_convidados {fonte: n} · p_excluir [fontes anônimas: tirar as sinalizadas]
 * Devolve o resultado com a supressão aplicada (formato no topo de js/feedback360.js).
 */
create or replace function disc_interno.f360_calcular(p_respostas jsonb, p_convidados jsonb, p_excluir jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  k constant int := 3;
  ki constant int := 5;
  v_fontes constant text[] := array['auto', 'chefia', 'colegas', 'equipe', 'outros'];
  v_anon constant text[] := array['colegas', 'equipe', 'outros'];
  v_conv jsonb;
  v_excl text[];
  v_todas jsonb;
  v_usadas jsonb;
  v_sin jsonb;
  v_exc jsonb;
  v_resp jsonb;
  v_val jsonb;
  v_res jsonb;
  v_auto jsonb;
  v_nc int; v_ne int; v_no int; v_ncol int;
  v_outros_sep boolean;
  v_col_outros boolean;
  v_defs jsonb := '[]'::jsonb;
  v_exib jsonb := '[]'::jsonb;
  d jsonb;
  g record;
  v_fs text[];
  v_n int;
  v_nexib int := 0;
  v_stats jsonb := '[]'::jsonb;
  t record;
  it record;
  v_temas_g jsonb;
  v_itens_g jsonb;
  v_grupos jsonb := '[]'::jsonb;
  v_comp jsonb := '{}'::jsonb;
  v_outras_t jsonb := '{}'::jsonb;
  v_outras_i jsonb := '{}'::jsonb;
  v_nh int;
  v_tirar boolean;
  v_mem jsonb;
  v_e jsonb;
  v_ch jsonb;
  v_ct jsonb;
  v_ci jsonb;
  v_exibidas text[];
  v_nao_t int;
  v_r_t int;
begin
  select jsonb_object_agg(f, coalesce(disc_interno.clima_int(case when jsonb_typeof(p_convidados) = 'object' then p_convidados -> f end, 1, 2147483647), 0))
    into v_conv from unnest(v_fontes) f;
  v_excl := array(select f from unnest(v_anon) with ordinality u(f, o) where jsonb_typeof(p_excluir) = 'array' and p_excluir ? f order by o);
  select coalesce(jsonb_agg(disc_interno.f360_normalizar(x) order by o), '[]'::jsonb) into v_todas
    from jsonb_array_elements(case when jsonb_typeof(p_respostas) = 'array' then p_respostas else '[]'::jsonb end) with ordinality a(x, o)
   where jsonb_typeof(x) = 'object' and (x ->> 'fonte') = any(v_fontes);
  select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into v_usadas
    from jsonb_array_elements(v_todas) with ordinality a(x, o)
   where not ((x ->> 's')::boolean and (x ->> 'f') = any(v_excl));
  select jsonb_object_agg(f, (select count(*) from jsonb_array_elements(v_todas) x where x ->> 'f' = f and (x ->> 's')::boolean)),
         jsonb_object_agg(f, (select count(*) from jsonb_array_elements(v_todas) x where x ->> 'f' = f and (x ->> 's')::boolean and f = any(v_excl))),
         jsonb_object_agg(f, (select count(*) from jsonb_array_elements(v_usadas) x where x ->> 'f' = f)),
         jsonb_object_agg(f, (select count(*) from jsonb_array_elements(v_usadas) x where x ->> 'f' = f and (x ->> 'v')::boolean))
    into v_sin, v_exc, v_resp, v_val from unnest(v_fontes) f;
  v_res := jsonb_build_object('versao', 1, 'versaoItens', 'v0', 'kTema', k, 'kItem', ki, 'convidados', v_conv, 'respondentes', v_resp,
    'validas', v_val, 'sinalizadas', v_sin, 'excluidas', v_exc, 'excluir', to_jsonb(v_excl), 'liberado', false, 'suprimidas', 0,
    'fontesExibidas', '[]'::jsonb, 'grupos', '[]'::jsonb, 'outras', 'null'::jsonb, 'chefia', 'null'::jsonb, 'auto', 'null'::jsonb);

  -- autoavaliação (nunca entra em média): a primeira
  select x into v_auto from jsonb_array_elements(v_usadas) with ordinality a(x, o) where x ->> 'f' = 'auto' order by o limit 1;
  if v_auto is not null then
    v_res := v_res || jsonb_build_object('auto', jsonb_build_object(
      'temas', (select jsonb_object_agg(t2.tema, case when jsonb_typeof(v_auto -> 't' -> t2.tema) = 'number'
                                                     then to_jsonb(disc_interno.f360_arred1((v_auto -> 't' ->> t2.tema)::numeric)) else 'null'::jsonb end)
                  from disc_interno.f360_temas() t2),
      'itens', (select jsonb_object_agg(i.item, case when (v_auto -> 'i' ->> i.item)::int between 1 and 5 then v_auto -> 'i' -> i.item
                                                    when (v_auto -> 'i' ->> i.item)::int = 0 then to_jsonb('nao'::text) else 'null'::jsonb end)
                  from disc_interno.f360_itens() i)));
  end if;

  -- fusão de grupos pequenos (pelas respostas válidas)
  v_nc := (v_val ->> 'colegas')::int; v_ne := (v_val ->> 'equipe')::int; v_no := (v_val ->> 'outros')::int;
  v_outros_sep := v_no >= k;
  v_col_outros := v_no > 0 and not v_outros_sep;
  v_ncol := v_nc + case when v_col_outros then v_no else 0 end;
  if (v_ncol > 0 and v_ncol < k) or (v_ne > 0 and v_ne < k) then
    v_fs := array(select f from unnest(v_anon) with ordinality u(f, o) where (v_val ->> f)::int > 0 order by o);
    if coalesce(array_length(v_fs, 1), 0) > 0 then v_defs := jsonb_build_array(to_jsonb(v_fs)); end if;
  else
    if v_ncol > 0 then
      v_fs := array(select f from unnest(case when v_col_outros then array['colegas', 'outros'] else array['colegas'] end) with ordinality u(f, o)
                     where (v_val ->> f)::int > 0 order by o);
      v_defs := v_defs || jsonb_build_array(to_jsonb(v_fs));
    end if;
    if v_ne > 0 then v_defs := v_defs || jsonb_build_array(jsonb_build_array('equipe')); end if;
    if v_outros_sep then v_defs := v_defs || jsonb_build_array(jsonb_build_array('outros')); end if;
  end if;
  for d in select x from jsonb_array_elements(v_defs) with ordinality a(x, o) order by o loop
    v_fs := array(select jsonb_array_elements_text(d));
    select coalesce(sum((v_val ->> f)::int), 0) into v_n from unnest(v_fs) f;
    if v_n < k then continue; end if;
    v_exib := v_exib || jsonb_build_array(jsonb_build_object('id', array_to_string(v_fs, '+'), 'nome', disc_interno.f360_nome_grupo(v_fs),
      'fontes', to_jsonb(v_fs), 'n', v_n, 'respondentes', (select coalesce(sum((v_resp ->> f)::int), 0) from unnest(v_fs) f),
      'composicao', (select jsonb_object_agg(f, (v_val ->> f)::int) from unnest(v_fs) f),
      'membros', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(v_usadas) with ordinality a(x, o)
                   where (x ->> 'f') = any(v_fs))));
    v_nexib := v_nexib + v_n;
  end loop;
  v_res := v_res || jsonb_build_object('suprimidas', v_nc + v_ne + v_no - v_nexib, 'liberado', jsonb_array_length(v_exib) > 0);
  if jsonb_array_length(v_exib) = 0 then return v_res; end if;
  v_exibidas := array(select f from unnest(v_anon) with ordinality u(f, o)
                       where exists (select 1 from jsonb_array_elements(v_exib) g2 where (g2 -> 'fontes') ? f) order by o);
  v_res := v_res || jsonb_build_object('fontesExibidas', to_jsonb(v_exibidas));

  -- estatísticas de cada grupo exibido (por tema e por frase)
  for g in select x, o from jsonb_array_elements(v_exib) with ordinality a(x, o) order by o loop
    v_temas_g := '{}'::jsonb; v_itens_g := '{}'::jsonb;
    for t in select * from disc_interno.f360_temas() order by ordem loop
      v_temas_g := v_temas_g || jsonb_build_object(t.tema, disc_interno.f360_estat_tema(g.x -> 'membros', t.tema));
    end loop;
    for it in select * from disc_interno.f360_itens() order by ordem loop
      v_itens_g := v_itens_g || jsonb_build_object(it.item, disc_interno.f360_estat_item(g.x -> 'membros', it.item));
    end loop;
    v_stats := v_stats || jsonb_build_array(jsonb_build_object('temas', v_temas_g, 'itens', v_itens_g));
    select v_comp || coalesce(g.x -> 'composicao', '{}'::jsonb) into v_comp;
    v_grupos := v_grupos || jsonb_build_array(jsonb_build_object('id', g.x -> 'id', 'nome', g.x -> 'nome', 'fontes', g.x -> 'fontes',
      'n', g.x -> 'n', 'respondentes', g.x -> 'respondentes', 'composicao', g.x -> 'composicao',
      'temas', (select jsonb_object_agg(t2.tema, case when (v_temas_g -> t2.tema ->> 'n')::int >= k
                  then jsonb_build_object('n', v_temas_g -> t2.tema -> 'n', 'media', v_temas_g -> t2.tema -> 'media', 'variadas', v_temas_g -> t2.tema -> 'variadas')
                  else 'null'::jsonb end) from disc_interno.f360_temas() t2),
      'itens', (select jsonb_object_agg(i.item, case
                  when (v_itens_g -> i.item ->> 'nao')::int * 2 > (v_itens_g -> i.item ->> 'r')::int then jsonb_build_object('pouco', true)
                  when (v_itens_g -> i.item ->> 'n')::int >= ki
                    then jsonb_build_object('n', v_itens_g -> i.item -> 'n', 'media', v_itens_g -> i.item -> 'media', 'dist', v_itens_g -> i.item -> 'dist')
                  else 'null'::jsonb end) from disc_interno.f360_itens() i)));
  end loop;

  -- "Outras pessoas (sem a chefia)" com a supressão complementar: células escondidas que somam de 1 a k−1 saem.
  for t in select * from disc_interno.f360_temas() order by ordem loop
    select coalesce(sum((s -> 'temas' -> t.tema ->> 'n')::int) filter (where (s -> 'temas' -> t.tema ->> 'n')::int < k), 0)
      into v_nh from jsonb_array_elements(v_stats) s;
    v_tirar := v_nh > 0 and v_nh < k;
    select coalesce(jsonb_agg(m order by a.o, b.o2), '[]'::jsonb) into v_mem
      from jsonb_array_elements(v_exib) with ordinality a(x, o)
      cross join lateral jsonb_array_elements(a.x -> 'membros') with ordinality b(m, o2)
     where (v_stats -> (a.o::int - 1) -> 'temas' -> t.tema ->> 'n')::int >= k
        or (not v_tirar and (v_stats -> (a.o::int - 1) -> 'temas' -> t.tema ->> 'n')::int > 0);
    v_e := disc_interno.f360_estat_tema(v_mem, t.tema);
    v_outras_t := v_outras_t || jsonb_build_object(t.tema, case when (v_e ->> 'n')::int >= k
      then jsonb_build_object('n', v_e -> 'n', 'media', v_e -> 'media', 'variadas', v_e -> 'variadas') else 'null'::jsonb end);
  end loop;
  for it in select * from disc_interno.f360_itens() order by ordem loop
    select coalesce(sum((s -> 'itens' -> it.item ->> 'n')::int) filter (where not (
             (s -> 'itens' -> it.item ->> 'nao')::int * 2 <= (s -> 'itens' -> it.item ->> 'r')::int and (s -> 'itens' -> it.item ->> 'n')::int >= ki)), 0)
      into v_nh from jsonb_array_elements(v_stats) s;
    v_tirar := v_nh > 0 and v_nh < ki;
    select coalesce(jsonb_agg(m order by a.o, b.o2), '[]'::jsonb) into v_mem
      from jsonb_array_elements(v_exib) with ordinality a(x, o)
      cross join lateral jsonb_array_elements(a.x -> 'membros') with ordinality b(m, o2)
     where ((v_stats -> (a.o::int - 1) -> 'itens' -> it.item ->> 'nao')::int * 2 <= (v_stats -> (a.o::int - 1) -> 'itens' -> it.item ->> 'r')::int
            and (v_stats -> (a.o::int - 1) -> 'itens' -> it.item ->> 'n')::int >= ki)
        or (not v_tirar and (v_stats -> (a.o::int - 1) -> 'itens' -> it.item ->> 'n')::int > 0);
    v_e := disc_interno.f360_estat_item(v_mem, it.item);
    -- "pouco observada" em "Outras pessoas": proporção de todos os grupos exibidos (sem média)
    select coalesce(sum((s -> 'itens' -> it.item ->> 'nao')::int), 0), coalesce(sum((s -> 'itens' -> it.item ->> 'r')::int), 0)
      into v_nao_t, v_r_t from jsonb_array_elements(v_stats) s;
    v_outras_i := v_outras_i || jsonb_build_object(it.item, case
      when v_nao_t * 2 > v_r_t then jsonb_build_object('pouco', true)
      when (v_e ->> 'n')::int >= ki then jsonb_build_object('n', v_e -> 'n', 'media', v_e -> 'media', 'dist', v_e -> 'dist')
      else 'null'::jsonb end);
  end loop;
  v_res := v_res || jsonb_build_object('grupos', v_grupos,
    'outras', jsonb_build_object('n', v_nexib, 'composicao', v_comp, 'temas', v_outras_t, 'itens', v_outras_i));

  -- chefia (à parte, identificada): média das chefias por tema e por frase
  select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into v_ch from jsonb_array_elements(v_usadas) with ordinality a(x, o) where x ->> 'f' = 'chefia';
  if jsonb_array_length(v_ch) > 0 then
    select jsonb_object_agg(t2.tema, (select case when count(*) > 0 then to_jsonb(disc_interno.f360_arred1(sum((c -> 't' ->> t2.tema)::numeric) / count(*))) else 'null'::jsonb end
                                        from jsonb_array_elements(v_ch) c where jsonb_typeof(c -> 't' -> t2.tema) = 'number'))
      into v_ct from disc_interno.f360_temas() t2;
    select jsonb_object_agg(i.item, (select case
               when count(*) filter (where (c -> 'i' ->> i.item)::int between 1 and 5) > 0
                 then to_jsonb(disc_interno.f360_arred1(sum((c -> 'i' ->> i.item)::numeric) filter (where (c -> 'i' ->> i.item)::int between 1 and 5)
                        / count(*) filter (where (c -> 'i' ->> i.item)::int between 1 and 5)))
               when count(*) filter (where (c -> 'i' ->> i.item)::int = 0) > 0 then to_jsonb('nao'::text)
               else 'null'::jsonb end from jsonb_array_elements(v_ch) c))
      into v_ci from disc_interno.f360_itens() i;
    v_res := v_res || jsonb_build_object('chefia', jsonb_build_object('n', jsonb_array_length(v_ch), 'temas', v_ct, 'itens', v_ci));
  end if;
  return v_res;
end;
$$;

-- O que vai para o relatório do líder (como DISC_F360.visaoLider): sem distribuição por alternativa, sem contagens por fonte
-- e sem sinalizadas por fonte (só o total dos grupos exibidos); sem grupos, "Outras pessoas" e chefia quando não liberado.
create or replace function disc_interno.f360_visao_lider(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_exib text[];
  v_lib boolean;
begin
  p := coalesce(p, '{}'::jsonb);
  v_exib := array(select jsonb_array_elements_text(coalesce(p -> 'fontesExibidas', '[]'::jsonb)));
  v_lib := coalesce((p ->> 'liberado')::boolean, false);
  return jsonb_build_object('versao', p -> 'versao', 'versaoItens', p -> 'versaoItens', 'kTema', p -> 'kTema', 'kItem', p -> 'kItem',
    'liberado', v_lib, 'fontesExibidas', to_jsonb(v_exib),
    'convidados', (select coalesce(jsonb_object_agg(f, coalesce((p -> 'convidados' ->> f)::int, 0)), '{}'::jsonb) from unnest(v_exib) f),
    'chefiasConvidadas', coalesce((p -> 'convidados' ->> 'chefia')::int, 0),
    'qualidade', jsonb_build_object(
      'sinalizadas', (select coalesce(sum(coalesce((p -> 'sinalizadas' ->> f)::int, 0)), 0) from unnest(v_exib) f),
      'excluidas', (select coalesce(sum(coalesce((p -> 'excluidas' ->> f)::int, 0)), 0) from unnest(v_exib) f)),
    'grupos', case when not v_lib then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', g -> 'id', 'nome', g -> 'nome',
                'fontes', g -> 'fontes', 'n', g -> 'n', 'composicao', g -> 'composicao', 'temas', g -> 'temas',
                'itens', (select coalesce(jsonb_object_agg(kk, case when jsonb_typeof(vv) = 'object' and vv ? 'dist' then vv - 'dist' else vv end), '{}'::jsonb)
                            from jsonb_each(coalesce(g -> 'itens', '{}'::jsonb)) w(kk, vv))) order by o), '[]'::jsonb)
                from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) with ordinality q(g, o)) end,
    'outras', case when not v_lib or jsonb_typeof(p -> 'outras') <> 'object' then 'null'::jsonb else jsonb_build_object(
                'n', p -> 'outras' -> 'n', 'composicao', p -> 'outras' -> 'composicao', 'temas', p -> 'outras' -> 'temas',
                'itens', (select coalesce(jsonb_object_agg(kk, case when jsonb_typeof(vv) = 'object' and vv ? 'dist' then vv - 'dist' else vv end), '{}'::jsonb)
                            from jsonb_each(coalesce(p -> 'outras' -> 'itens', '{}'::jsonb)) w(kk, vv))) end,
    'chefia', case when v_lib then coalesce(p -> 'chefia', 'null'::jsonb) else 'null'::jsonb end,
    'auto', coalesce(p -> 'auto', 'null'::jsonb));
end;
$$;

-- Consolidado da liderança (como DISC_F360.consolidar): ≥ 5 líderes liberados; média por tema de "Outras pessoas" com peso
-- 1 por líder, só com ≥ 5 líderes no tema; temas de foco (contagem por tema) só com ≥ 5 planos.
create or replace function disc_interno.f360_consolidar(p_lideres jsonb, p_focos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_ls jsonb;
  v_n int;
  v_out jsonb;
  v_fs jsonb;
begin
  select coalesce(jsonb_agg(r order by o), '[]'::jsonb) into v_ls
    from jsonb_array_elements(coalesce(p_lideres, '[]'::jsonb)) with ordinality a(r, o)
   where coalesce((r ->> 'liberado')::boolean, false) and jsonb_typeof(r -> 'outras') = 'object';
  v_n := jsonb_array_length(v_ls);
  v_out := jsonb_build_object('lideres', v_n, 'disponivel', v_n >= 5, 'temas', '{}'::jsonb, 'focos', 'null'::jsonb);
  if v_n < 5 then return v_out; end if;
  v_out := v_out || jsonb_build_object('temas', (select jsonb_object_agg(t.tema, (
      select case when count(*) >= 5 then jsonb_build_object('lideres', count(*), 'media', disc_interno.f360_arred1(sum((r -> 'outras' -> 'temas' -> t.tema ->> 'media')::numeric) / count(*)))
                  else 'null'::jsonb end
        from jsonb_array_elements(v_ls) r where jsonb_typeof(r -> 'outras' -> 'temas' -> t.tema) = 'object')) from disc_interno.f360_temas() t));
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fs from jsonb_array_elements(coalesce(p_focos, '[]'::jsonb)) f
   where jsonb_typeof(f) = 'array' and jsonb_array_length(f) > 0;
  if jsonb_array_length(v_fs) >= 5 then
    v_out := v_out || jsonb_build_object('focos', (select jsonb_object_agg(t.tema, (
        select count(*) from jsonb_array_elements(v_fs) f
         where exists (select 1 from jsonb_array_elements_text(f) x join disc_interno.f360_itens() i on i.item = x where i.tema = t.tema)))
      from disc_interno.f360_temas() t));
  end if;
  return v_out;
end;
$$;

-- Plano da devolutiva (como DISC_F360.validarPlano): {ok, plano} ou {ok:false, erro}.
create or replace function disc_interno.f360_texto_plano(v jsonb)
returns text language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(disc_interno.texto(v), '[\x01-\x1F\x7F]', ' ', 'g'), '\s+', ' ', 'g')), 300);
$$;
create or replace function disc_interno.f360_data_plano(v jsonb)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return ''; end if;
  perform (v #>> '{}')::date;
  return v #>> '{}';
exception when others then
  return '';
end;
$$;
create or replace function disc_interno.f360_validar_plano(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_comp jsonb := '[]'::jsonb;
  x jsonb;
  v_vistos text[] := array[]::text[];
  v_acoes jsonb;
  v_datas jsonb := '{}'::jsonb;
  m text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return jsonb_build_object('ok', true, 'plano', 'null'::jsonb); end if;
  if jsonb_typeof(p) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'Plano em formato inválido.'); end if;
  if jsonb_typeof(p -> 'comportamentos') <> 'array' or jsonb_array_length(p -> 'comportamentos') not between 1 and 2 then
    return jsonb_build_object('ok', false, 'erro', 'Escolha 1 ou 2 comportamentos para o plano.');
  end if;
  for x in select e from jsonb_array_elements(p -> 'comportamentos') e loop
    if jsonb_typeof(x) <> 'object' or not exists (select 1 from disc_interno.f360_itens() i where i.item = x ->> 'item')
       or (x ->> 'item') = any(v_vistos) then
      return jsonb_build_object('ok', false, 'erro', 'Escolha os comportamentos entre as 18 frases (sem repetir).');
    end if;
    v_vistos := v_vistos || (x ->> 'item');
    v_comp := v_comp || jsonb_build_array(jsonb_build_object('item', x ->> 'item', 'acao', disc_interno.f360_texto_plano(x -> 'acao')));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('texto', disc_interno.f360_texto_plano(case when jsonb_typeof(a) = 'object' then a -> 'texto' end),
           'prazo', disc_interno.f360_data_plano(case when jsonb_typeof(a) = 'object' then a -> 'prazo' end)) order by o), '[]'::jsonb)
    into v_acoes
    from jsonb_array_elements(case when jsonb_typeof(p -> 'acoes') = 'array' then p -> 'acoes' else '[]'::jsonb end) with ordinality q(a, o)
   where disc_interno.f360_texto_plano(case when jsonb_typeof(a) = 'object' then a -> 'texto' end) <> '';
  if jsonb_array_length(v_acoes) > 3 then return jsonb_build_object('ok', false, 'erro', 'No máximo 3 ações no plano.'); end if;
  foreach m in array array['conversaEquipe', 'conversaChefia', 'checkin', 'retornos', 'pulso', 'reaplicacao'] loop
    v_datas := v_datas || jsonb_build_object(m, disc_interno.f360_data_plano(case when jsonb_typeof(p -> 'datas') = 'object' then p -> 'datas' -> m end));
  end loop;
  return jsonb_build_object('ok', true, 'plano', jsonb_build_object('comportamentos', v_comp, 'acoes', v_acoes,
    'contar', disc_interno.f360_texto_plano(p -> 'contar'), 'apoio', disc_interno.f360_texto_plano(p -> 'apoio'),
    'indicador', disc_interno.f360_texto_plano(p -> 'indicador'), 'datas', v_datas, 'andamento', disc_interno.f360_texto_plano(p -> 'andamento')));
end;
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos
-- -----------------------------------------------------------------------------

-- Ciclo encerrado não reabre e a configuração congela.
create or replace function disc_interno.f360_ciclos_antes_gravar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nome := btrim(coalesce(new.nome, ''));
  if tg_op = 'UPDATE' then
    if old.status = 'encerrado' and new.status <> 'encerrado' then
      raise exception 'O ciclo já foi encerrado e não pode ser reaberto.';
    end if;
    if old.status = 'encerrado' and (new.empresa_id <> old.empresa_id or new.versao_itens <> old.versao_itens) then
      raise exception 'O ciclo já foi encerrado: a configuração não muda mais.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists f360_ciclos_antes_gravar on public.f360_ciclos;
create trigger f360_ciclos_antes_gravar before insert or update on public.f360_ciclos
  for each row execute function disc_interno.f360_ciclos_antes_gravar();

-- Convites e respostas só entram com o ciclo aberto (defesa extra além das funções).
create or replace function disc_interno.f360_so_aberto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.f360_ciclos c where c.id = new.ciclo_id and c.status = 'aberto') then
    raise exception 'Este Feedback 360 já foi encerrado.';
  end if;
  if not exists (select 1 from public.f360_avaliados a where a.id = new.avaliado_id and a.ciclo_id = new.ciclo_id) then
    raise exception 'Pessoa avaliada de outro ciclo.';
  end if;
  return new;
end;
$$;
drop trigger if exists f360_respostas_so_aberto on public.f360_respostas;
create trigger f360_respostas_so_aberto before insert on public.f360_respostas
  for each row execute function disc_interno.f360_so_aberto();
drop trigger if exists f360_convites_so_aberto on public.f360_convites;
create trigger f360_convites_so_aberto before insert on public.f360_convites
  for each row execute function disc_interno.f360_so_aberto();
drop trigger if exists f360_comentarios_so_aberto on public.f360_comentarios;
create trigger f360_comentarios_so_aberto before insert on public.f360_comentarios
  for each row execute function disc_interno.f360_so_aberto();

-- Relatório do 360: o snapshot (dados) só é montado pelas funções do banco. O painel pode publicar/despublicar e excluir.
create or replace function disc_interno.relatorios_f360_protegido()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.modelo <> 'feedback360' and (new.f360_ciclo_id is not null or new.f360_avaliado_id is not null or new.f360_visao is not null) then
    raise exception 'Só o relatório do Feedback 360 se liga a um ciclo do Feedback 360.';
  end if;
  if new.modelo = 'feedback360' or (tg_op = 'UPDATE' and old.modelo = 'feedback360') then
    if tg_op = 'UPDATE' and new.modelo = old.modelo and new.dados is not distinct from old.dados
       and new.empresa_id is not distinct from old.empresa_id and new.f360_ciclo_id is not distinct from old.f360_ciclo_id
       and new.f360_avaliado_id is not distinct from old.f360_avaliado_id and new.f360_visao is not distinct from old.f360_visao then
      return new;
    end if;
    if coalesce(current_setting('disc.f360_snapshot', true), '') <> '1' then
      raise exception 'O relatório do Feedback 360 só é montado pelo servidor (gere de novo pelo Feedback 360).';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists relatorios_f360_protegido on public.relatorios;
create trigger relatorios_f360_protegido before insert or update on public.relatorios
  for each row execute function disc_interno.relatorios_f360_protegido();

-- -----------------------------------------------------------------------------
-- Funções auxiliares do painel
-- -----------------------------------------------------------------------------

create or replace function disc_interno.f360_rel_json(p_avaliado uuid, p_visao text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', rel.id, 'token', rel.token, 'status', rel.status, 'publicadoEm', disc_interno.iso(rel.publicado_em),
    'atualizadoEm', disc_interno.iso(rel.atualizado_em))
    from public.relatorios rel where rel.f360_avaliado_id = p_avaliado and rel.f360_visao = p_visao limit 1;
$$;

-- Ciclo no formato do painel: só contagens agregadas enquanto aberto (respostas por fonte); depois, o resultado congelado
-- (agregados já suprimidos, visão do consultor). Nunca quem respondeu. Convites (links) só com o ciclo aberto.
create or replace function disc_interno.f360_ciclo_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'empresaId', c.empresa_id, 'nome', c.nome, 'status', c.status, 'versaoItens', c.versao_itens,
    'encerramentoPrevisto', to_char(c.encerramento_previsto, 'YYYY-MM-DD'), 'canalTexto', c.canal_texto, 'canalUrl', c.canal_url,
    'contatoDados', c.contato_dados, 'contatoRelatos', c.contato_relatos, 'retencaoDias', c.retencao_dias, 'manterLista', c.manter_lista,
    'relatosRegistrados', c.relatos_registrados, 'abertoEm', disc_interno.iso(c.aberto_em), 'encerradoEm', disc_interno.iso(c.encerrado_em),
    'listaApagadaEm', disc_interno.iso(c.lista_apagada_em),
    'avaliados', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'pessoaId', a.pessoa_id, 'nome', a.nome, 'ordem', a.ordem, 'topo', a.topo,
        'chefias', a.chefias, 'convidados', a.convidados,
        'respondentes', case when c.status = 'aberto' then (select jsonb_object_agg(f, (select count(*) from public.f360_respostas r where r.avaliado_id = a.id and r.fonte = f))
                                                               from unnest(array['auto', 'chefia', 'colegas', 'equipe', 'outros']) f)
                             else coalesce(a.resultado -> 'respondentes', '{}'::jsonb) end,
        'resultado', a.resultado, 'excluir', to_jsonb(a.excluir), 'temas', a.temas, 'foco', a.foco, 'observacao', a.observacao, 'plano', a.plano,
        'discAceito', a.disc_aceito, 'devolutivaEm', disc_interno.iso(a.devolutiva_em), 'brutasApagadasEm', disc_interno.iso(a.brutas_apagadas_em),
        'comentarios', (select jsonb_build_object('total', count(*), 'elegiveis', count(*) filter (where cm.elegivel),
            'pendentes', count(*) filter (where cm.elegivel and cm.status = 'pendente'),
            'liberados', count(*) filter (where cm.elegivel and cm.status in ('mantido', 'editado')),
            'descartados', count(*) filter (where cm.status = 'descartado'))
          from public.f360_comentarios cm where cm.avaliado_id = a.id and c.status = 'encerrado'),
        'relatorios', jsonb_build_object('lider', disc_interno.f360_rel_json(a.id, 'lider'), 'chefia', disc_interno.f360_rel_json(a.id, 'chefia')))
        order by a.ordem), '[]'::jsonb) from public.f360_avaliados a where a.ciclo_id = c.id),
    'convites', case when c.status = 'aberto' then (select coalesce(jsonb_agg(jsonb_build_object('pessoaId', cv.pessoa_id, 'nome', coalesce(p.nome, ''),
        'avaliadoId', cv.avaliado_id, 'fonte', cv.fonte, 'token', cv.token) order by a.ordem, cv.fonte, p.nome), '[]'::jsonb)
        from public.f360_convites cv join public.f360_avaliados a on a.id = cv.avaliado_id left join public.pessoas p on p.id = cv.pessoa_id
       where cv.ciclo_id = c.id) else '[]'::jsonb end,
    'consolidado', (select jsonb_build_object('id', rel.id, 'token', rel.token, 'status', rel.status, 'publicadoEm', disc_interno.iso(rel.publicado_em))
                      from public.relatorios rel where rel.f360_ciclo_id = c.id and rel.f360_visao = 'empresa' limit 1))
  from public.f360_ciclos c where c.id = p_id;
$$;

-- Convite a partir do token do link (com o ciclo e a pessoa avaliada).
create or replace function disc_interno.f360_convite(p_token text)
returns table (convite_id uuid, ciclo_id uuid, avaliado_id uuid, fonte text, status text)
language sql stable security definer set search_path = '' as $$
  select cv.id, cv.ciclo_id, cv.avaliado_id, cv.fonte, c.status
    from public.f360_convites cv join public.f360_ciclos c on c.id = cv.ciclo_id
   where p_token ~ '^[0-9a-f]{64}$' and cv.token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Funções públicas (anon): dados do link, envio e "apagar a minha resposta"
-- -----------------------------------------------------------------------------

create or replace function public.f360_publica(p_token text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  x record;
  c public.f360_ciclos%rowtype;
  a public.f360_avaliados%rowtype;
  v_emp text;
begin
  select * into x from disc_interno.f360_convite(coalesce(p_token, ''));
  if x.convite_id is null then
    return disc_interno.erro('Link inválido ou Feedback 360 encerrado. Fale com quem enviou o link.');
  end if;
  if x.status <> 'aberto' then
    return json_build_object('ok', false, 'erro', 'Este Feedback 360 já foi encerrado. Obrigado!', 'encerrado', true);
  end if;
  select * into c from public.f360_ciclos where id = x.ciclo_id;
  select * into a from public.f360_avaliados where id = x.avaliado_id;
  select nome into v_emp from public.empresas where id = c.empresa_id;
  return json_build_object('ok', true, 'fonte', x.fonte, 'empresaNome', coalesce(v_emp, ''), 'avaliadoNome', a.nome,
    'duasChefias', a.chefias = 2, 'encerramentoPrevisto', to_char(c.encerramento_previsto, 'YYYY-MM-DD'), 'retencaoDias', c.retencao_dias,
    'contatoDados', c.contato_dados, 'canalTexto', c.canal_texto, 'canalUrl', c.canal_url, 'versaoItens', c.versao_itens,
    'respondido', exists (select 1 from public.f360_vinculos v where v.convite_id = x.convite_id));
end;
$$;

-- Envio pelo link individual: p_respostas = {itens: {DIR1: 0..5, …, GLB1: 1..5}, comentarios: {AB1, AB2}, segundos}.
-- Mesmas regras e mensagens de DISC_F360.validarEnvio. Uma resposta por link: enviar de novo SUBSTITUI a anterior.
create or replace function public.f360_enviar(p_token text, p_respostas jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  MSG_FORMATO constant text := 'Respostas em formato inválido.';
  x record;
  c public.f360_ciclos%rowtype;
  v_itens jsonb := '{}'::jsonb;
  kk text;
  vv jsonb;
  v_int int;
  v_com jsonb := '{}'::jsonb;
  v_txt text;
  v_seg int;
  v_vinc public.f360_vinculos%rowtype;
  v_resp uuid;
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_subst boolean := false;
begin
  select * into x from disc_interno.f360_convite(coalesce(p_token, ''));
  if x.convite_id is null then
    return disc_interno.erro('Link inválido ou Feedback 360 encerrado. Fale com quem enviou o link.');
  end if;
  select * into c from public.f360_ciclos where id = x.ciclo_id for share;
  if c.status <> 'aberto' then
    return json_build_object('ok', false, 'erro', 'Este Feedback 360 já foi encerrado. Obrigado!', 'encerrado', true);
  end if;
  -- Limites só por ciclo e no total (nunca pelo link: a hora de envio de um link diria quem respondeu).
  if disc_interno.contar_tentativa('feedback_envio', c.id::text, interval '10 minutes') > 300
     or disc_interno.contar_tentativa('feedback_global', '', interval '10 minutes') > 2000 then
    return disc_interno.erro('Muitos envios em pouco tempo. Tente de novo em alguns minutos.');
  end if;

  -- validação (igual a DISC_F360.validarEnvio)
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then return disc_interno.erro(MSG_FORMATO); end if;
  if p_respostas ? 'itens' and jsonb_typeof(p_respostas -> 'itens') <> 'null' then
    if jsonb_typeof(p_respostas -> 'itens') <> 'object' then return disc_interno.erro(MSG_FORMATO); end if;
    for kk, vv in select * from jsonb_each(p_respostas -> 'itens') loop
      if kk <> 'GLB1' and not exists (select 1 from disc_interno.f360_itens() i where i.item = kk) then return disc_interno.erro(MSG_FORMATO); end if;
      if jsonb_typeof(vv) = 'null' then continue; end if;
      v_int := disc_interno.clima_int(vv, case when kk = 'GLB1' then 1 else 0 end, 5);
      if v_int is null then return disc_interno.erro(MSG_FORMATO); end if;
      v_itens := v_itens || jsonb_build_object(kk, v_int);
    end loop;
  end if;
  if p_respostas ? 'comentarios' and jsonb_typeof(p_respostas -> 'comentarios') <> 'null' then
    if jsonb_typeof(p_respostas -> 'comentarios') <> 'object' then return disc_interno.erro(MSG_FORMATO); end if;
    for kk, vv in select * from jsonb_each(p_respostas -> 'comentarios') loop
      if kk not in ('AB1', 'AB2') or jsonb_typeof(vv) not in ('string', 'null') then return disc_interno.erro(MSG_FORMATO); end if;
      if x.fonte = 'auto' or jsonb_typeof(vv) = 'null' then continue; end if;
      v_txt := regexp_replace(vv #>> '{}', E'\r\n?', E'\n', 'g');
      v_txt := regexp_replace(v_txt, E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', ' ', 'g');
      v_txt := regexp_replace(v_txt, E'[ \t]+', ' ', 'g');
      v_txt := regexp_replace(v_txt, E' *\n *', E'\n', 'g');
      v_txt := regexp_replace(v_txt, E'\n{3,}', E'\n\n', 'g');
      v_txt := btrim(v_txt, E' \n');
      if char_length(v_txt) > 1000 then v_txt := btrim(left(v_txt, 1000), E' \n'); end if;
      if v_txt <> '' then v_com := v_com || jsonb_build_object(kk, v_txt); end if;
    end loop;
  end if;
  if p_respostas ? 'segundos' and jsonb_typeof(p_respostas -> 'segundos') <> 'null' then
    v_seg := disc_interno.clima_int(p_respostas -> 'segundos', 0, 2147483647);
    if v_seg is null then return disc_interno.erro(MSG_FORMATO); end if;
    v_seg := least(v_seg, 86400);
  end if;
  if v_itens = '{}'::jsonb and v_com = '{}'::jsonb then
    return disc_interno.erro('Responda pelo menos uma pergunta antes de enviar.');
  end if;

  -- uma resposta por link: a nova substitui a anterior (ligação link → resposta guardada só até o encerramento)
  select * into v_vinc from public.f360_vinculos where convite_id = x.convite_id for update;
  if found then
    delete from public.f360_comentarios where id = any(v_vinc.comentarios);
    delete from public.f360_respostas where id = v_vinc.resposta_id;
    delete from public.f360_vinculos where convite_id = x.convite_id;
    v_subst := true;
  end if;
  insert into public.f360_respostas (ciclo_id, avaliado_id, fonte, versao_itens, itens, segundos)
    values (x.ciclo_id, x.avaliado_id, x.fonte, c.versao_itens, v_itens, v_seg) returning id into v_resp;
  for kk in select k2 from unnest(array['AB1', 'AB2']) k2 loop
    if v_com ? kk then
      insert into public.f360_comentarios (ciclo_id, avaliado_id, fonte, pergunta, texto)
        values (x.ciclo_id, x.avaliado_id, x.fonte, kk, v_com ->> kk) returning id into v_id;
      v_ids := v_ids || v_id;
    end if;
  end loop;
  insert into public.f360_vinculos (convite_id, resposta_id, comentarios) values (x.convite_id, v_resp, v_ids);
  if v_subst then return json_build_object('ok', true, 'substituida', true); end if;
  return json_build_object('ok', true);
end;
$$;

-- "Apagar a minha resposta" pelo próprio link, até o encerramento (aviso 5.1-b).
create or replace function public.f360_apagar_resposta(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  x record;
  v_vinc public.f360_vinculos%rowtype;
begin
  select * into x from disc_interno.f360_convite(coalesce(p_token, ''));
  if x.convite_id is null then
    return disc_interno.erro('Link inválido ou Feedback 360 encerrado. Fale com quem enviou o link.');
  end if;
  if x.status <> 'aberto' then
    return json_build_object('ok', false, 'erro', 'Este Feedback 360 já foi encerrado: a resposta não está mais ligada ao link.', 'encerrado', true);
  end if;
  select * into v_vinc from public.f360_vinculos where convite_id = x.convite_id for update;
  if not found then return json_build_object('ok', true, 'apagada', false); end if;
  delete from public.f360_comentarios where id = any(v_vinc.comentarios);
  delete from public.f360_respostas where id = v_vinc.resposta_id;
  delete from public.f360_vinculos where convite_id = x.convite_id;
  return json_build_object('ok', true, 'apagada', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções do painel (authenticated; só admin)
-- -----------------------------------------------------------------------------

/*
 * p_dados: {empresaId, nome?, encerramentoPrevisto? ('AAAA-MM-DD'; padrão hoje + 14), canalTexto?, canalUrl?, contatoDados?,
 *           contatoRelatos (obrigatório), retencaoDias? (30–90; padrão 90), manterLista?,
 *           avaliados: [{pessoaId, chefia:[ids], equipe:[ids], colegas:[ids], outros:[ids]}]} na ordem do organograma.
 * Mesmas regras e mensagens de DISC_F360.validarDesenho (teto de 4 formulários sobre outras pessoas, sem contar quem a
 * pessoa lidera e a própria chefia; mínimo de 3 convidados anônimos; chefia = quem lidera no organograma).
 */
create or replace function public.f360_criar_ciclo(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_nome text;
  v_fim date;
  v_hoje date := disc_interno.hoje_brasil();
  v_canal text;
  v_url text;
  v_contato text;
  v_relatos text;
  v_ret int;
  v_id uuid;
  x jsonb;
  v_pes uuid;
  v_vistos uuid[] := array[]::uuid[];
  v_ch uuid[]; v_eq uuid[]; v_co uuid[]; v_ou uuid[]; v_todos uuid[];
  v_nm text;
  v_ordem int := 0;
  v_av uuid;
  v_carga jsonb := '{}'::jsonb;
  p uuid;
  f text;
  v_ob int; v_op int;
  v_lista jsonb;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then return disc_interno.erro('Dados do ciclo ausentes.'); end if;
  v_emp := disc_interno.uuid_ou_nulo(p_dados -> 'empresaId');
  if v_emp is null or not exists (select 1 from public.empresas where id = v_emp) then return disc_interno.erro('Empresa não encontrada.'); end if;
  if exists (select 1 from public.f360_ciclos where empresa_id = v_emp and status = 'aberto') then
    return disc_interno.erro('Já existe um Feedback 360 aberto nesta empresa. Encerre-o antes de criar outro.');
  end if;
  if exists (select 1 from public.clima_rodadas where empresa_id = v_emp and status = 'aberta') then
    return disc_interno.erro('Há uma pesquisa de clima aberta nesta empresa. Encerre-a e espere pelo menos 4 semanas antes do Feedback 360 (nunca os dois no mesmo mês para as mesmas pessoas).');
  end if;
  v_nome := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'nome'), '\s+', ' ', 'g')), 120);
  if v_nome = '' then v_nome := 'Feedback 360 · ' || to_char(now() at time zone 'America/Sao_Paulo', 'MM/YYYY'); end if;
  if p_dados ? 'encerramentoPrevisto' and jsonb_typeof(p_dados -> 'encerramentoPrevisto') not in ('null') then
    if disc_interno.f360_data_plano(p_dados -> 'encerramentoPrevisto') = '' then
      return disc_interno.erro('Data prevista de encerramento inválida: de hoje até 60 dias.');
    end if;
    v_fim := (p_dados ->> 'encerramentoPrevisto')::date;
    if v_fim < v_hoje or v_fim > v_hoje + 60 then return disc_interno.erro('Data prevista de encerramento inválida: de hoje até 60 dias.'); end if;
  else
    v_fim := v_hoje + 14;
  end if;
  v_canal := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'canalTexto'), '\s+', ' ', 'g')), 200);
  v_url := btrim(disc_interno.texto(p_dados -> 'canalUrl'));
  if v_url <> '' and (char_length(v_url) > 300 or v_url !~ '^(https://|mailto:|tel:)[^[:space:]<>"]+$') then
    return disc_interno.erro('Link do canal de denúncia inválido: use um endereço https://, mailto: ou tel:.');
  end if;
  if v_url <> '' and v_canal = '' then return disc_interno.erro('Diga também o nome do canal de denúncia.'); end if;
  v_contato := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'contatoDados'), '\s+', ' ', 'g')), 200);
  v_relatos := left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'contatoRelatos'), '\s+', ' ', 'g')), 200);
  if v_relatos = '' then
    return disc_interno.erro('Informe quem recebe os avisos do protocolo de relatos (contato definido no contrato; não pode ser líder avaliado).');
  end if;
  v_ret := 90;
  if p_dados ? 'retencaoDias' and jsonb_typeof(p_dados -> 'retencaoDias') <> 'null' then
    v_ret := disc_interno.clima_int(p_dados -> 'retencaoDias', 30, 90);
    if v_ret is null then return disc_interno.erro('Prazo de retenção inválido: de 30 a 90 dias depois da devolutiva.'); end if;
  end if;

  -- desenho: quem avalia quem (mesmas mensagens de DISC_F360.validarDesenho)
  v_lista := case when jsonb_typeof(p_dados -> 'avaliados') = 'array' then p_dados -> 'avaliados' else '[]'::jsonb end;
  if jsonb_array_length(v_lista) = 0 then return disc_interno.erro('Escolha pelo menos uma pessoa para ser avaliada.'); end if;
  if jsonb_array_length(v_lista) > 60 then return disc_interno.erro('Pessoas avaliadas demais num ciclo (máximo 60).'); end if;
  for x in select e from jsonb_array_elements(v_lista) with ordinality q(e, o) order by o loop
    v_pes := case when jsonb_typeof(x) = 'object' then disc_interno.uuid_ou_nulo(x -> 'pessoaId') end;
    if v_pes is null or not exists (select 1 from public.vinculos v where v.pessoa_id = v_pes and v.empresa_id = v_emp and v.status = 'ativo')
       or not exists (select 1 from public.relacoes r join public.vinculos v on v.pessoa_id = r.para_pessoa and v.empresa_id = v_emp and v.status = 'ativo'
                       where r.empresa_id = v_emp and r.de_pessoa = v_pes and r.tipo = 'lidera') then
      return disc_interno.erro('Quem é avaliado precisa ser colaborador(a) ativo(a) desta empresa e liderar alguém no organograma.');
    end if;
    if v_pes = any(v_vistos) then return disc_interno.erro('Pessoa avaliada repetida.'); end if;
    v_vistos := v_vistos || v_pes;
    select disc_interno.clima_nome_curto(nome) into v_nm from public.pessoas where id = v_pes;
    v_ch := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'chefia') = 'array' then x -> 'chefia' else '[]'::jsonb end) e);
    v_eq := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'equipe') = 'array' then x -> 'equipe' else '[]'::jsonb end) e);
    v_co := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'colegas') = 'array' then x -> 'colegas' else '[]'::jsonb end) e);
    v_ou := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'outros') = 'array' then x -> 'outros' else '[]'::jsonb end) e);
    v_todos := v_ch || v_eq || v_co || v_ou;
    if (select count(*) from unnest(v_todos) u) <> (select count(distinct u) from unnest(v_todos) u) then
      return disc_interno.erro(v_nm || ': a mesma pessoa aparece duas vezes na lista de quem avalia.');
    end if;
    if coalesce(array_length(v_ch, 1), 0) > 2 or exists (select 1 from unnest(v_ch) u where u is null or not exists (
         select 1 from public.relacoes r where r.empresa_id = v_emp and r.de_pessoa = u and r.para_pessoa = v_pes and r.tipo = 'lidera')) then
      return disc_interno.erro('A chefia de ' || v_nm || ' precisa ser quem lidera essa pessoa no organograma (no máximo 2).');
    end if;
    if exists (select 1 from unnest(v_eq) u where u is null or not exists (
         select 1 from public.relacoes r join public.vinculos v on v.pessoa_id = r.para_pessoa and v.empresa_id = v_emp and v.status = 'ativo'
          where r.empresa_id = v_emp and r.de_pessoa = v_pes and r.para_pessoa = u and r.tipo = 'lidera')) then
      return disc_interno.erro('A equipe de ' || v_nm || ' só pode ter pessoas que ela lidera no organograma.');
    end if;
    if exists (select 1 from unnest(v_co || v_ou) u where u is null or u = v_pes
                 or not exists (select 1 from public.vinculos v where v.pessoa_id = u and v.empresa_id = v_emp and v.status = 'ativo'))
       or v_pes = any(v_todos) then
      return disc_interno.erro('Colegas e outros convidados de ' || v_nm || ' precisam ser colaboradores ativos desta empresa (e não a própria pessoa).');
    end if;
    if coalesce(array_length(v_co, 1), 0) > 6 or coalesce(array_length(v_ou, 1), 0) > 4 then
      return disc_interno.erro(v_nm || ': no máximo 6 colegas e 4 outros convidados.');
    end if;
    if coalesce(array_length(v_eq, 1), 0) + coalesce(array_length(v_co, 1), 0) + coalesce(array_length(v_ou, 1), 0) < 3 then
      return disc_interno.erro(v_nm || ' precisa de pelo menos 3 pessoas convidadas além da chefia (equipe, colegas ou outros). Com menos, não haveria relatório.');
    end if;
    foreach p in array v_eq || v_ch loop
      v_carga := v_carga || jsonb_build_object(p::text, jsonb_build_object('ob', coalesce((v_carga -> p::text ->> 'ob')::int, 0) + 1,
        'op', coalesce((v_carga -> p::text ->> 'op')::int, 0)));
    end loop;
    foreach p in array v_co || v_ou loop
      v_carga := v_carga || jsonb_build_object(p::text, jsonb_build_object('ob', coalesce((v_carga -> p::text ->> 'ob')::int, 0),
        'op', coalesce((v_carga -> p::text ->> 'op')::int, 0) + 1));
    end loop;
  end loop;
  for f in select kk from jsonb_object_keys(v_carga) kk loop
    v_ob := (v_carga -> f ->> 'ob')::int; v_op := (v_carga -> f ->> 'op')::int;
    if v_op > greatest(0, 4 - v_ob) then
      select disc_interno.clima_nome_curto(nome) into v_nm from public.pessoas where id = f::uuid;
      return disc_interno.erro(v_nm || ' passaria do limite de 4 formulários por pessoa: tire essa pessoa de alguma lista de colegas ou de outros convidados.');
    end if;
  end loop;

  insert into public.f360_ciclos (empresa_id, nome, encerramento_previsto, canal_texto, canal_url, contato_dados, contato_relatos, retencao_dias, manter_lista)
    values (v_emp, v_nome, v_fim, v_canal, v_url, v_contato, v_relatos, v_ret, coalesce(p_dados -> 'manterLista' = 'true'::jsonb, false))
    returning id into v_id;
  for x in select e from jsonb_array_elements(v_lista) with ordinality q(e, o) order by o loop
    v_pes := disc_interno.uuid_ou_nulo(x -> 'pessoaId');
    v_ch := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'chefia') = 'array' then x -> 'chefia' else '[]'::jsonb end) e);
    v_eq := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'equipe') = 'array' then x -> 'equipe' else '[]'::jsonb end) e);
    v_co := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'colegas') = 'array' then x -> 'colegas' else '[]'::jsonb end) e);
    v_ou := array(select disc_interno.uuid_ou_nulo(e) from jsonb_array_elements(case when jsonb_typeof(x -> 'outros') = 'array' then x -> 'outros' else '[]'::jsonb end) e);
    insert into public.f360_avaliados (ciclo_id, pessoa_id, nome, ordem, topo, chefias, convidados)
      values (v_id, v_pes, (select disc_interno.clima_nome_curto(nome) from public.pessoas where id = v_pes), v_ordem,
              not exists (select 1 from public.relacoes r join public.vinculos v on v.pessoa_id = r.de_pessoa and v.empresa_id = v_emp and v.status = 'ativo'
                           where r.empresa_id = v_emp and r.para_pessoa = v_pes and r.tipo = 'lidera'),
              coalesce(array_length(v_ch, 1), 0),
              jsonb_build_object('auto', 1, 'chefia', coalesce(array_length(v_ch, 1), 0), 'colegas', coalesce(array_length(v_co, 1), 0),
                'equipe', coalesce(array_length(v_eq, 1), 0), 'outros', coalesce(array_length(v_ou, 1), 0)))
      returning id into v_av;
    insert into public.f360_convites (ciclo_id, avaliado_id, fonte, pessoa_id, token) values (v_id, v_av, 'auto', v_pes, disc_interno.token_aleatorio());
    insert into public.f360_convites (ciclo_id, avaliado_id, fonte, pessoa_id, token)
      select v_id, v_av, 'chefia', u, disc_interno.token_aleatorio() from unnest(v_ch) u
      union all select v_id, v_av, 'equipe', u, disc_interno.token_aleatorio() from unnest(v_eq) u
      union all select v_id, v_av, 'colegas', u, disc_interno.token_aleatorio() from unnest(v_co) u
      union all select v_id, v_av, 'outros', u, disc_interno.token_aleatorio() from unnest(v_ou) u;
    v_ordem := v_ordem + 1;
  end loop;
  return json_build_object('ok', true, 'ciclo', disc_interno.f360_ciclo_json(v_id));
end;
$$;

create or replace function public.f360_listar(p_empresa uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  return json_build_object('ok', true, 'ciclos', (select coalesce(jsonb_agg(disc_interno.f360_ciclo_json(c.id) order by c.aberto_em desc, c.id), '[]'::jsonb)
    from public.f360_ciclos c where c.empresa_id = p_empresa));
end;
$$;

-- Recalcula o resultado de uma pessoa avaliada a partir das respostas guardadas (encerramento e decisão do consultor sobre as
-- respostas sinalizadas) e marca os comentários elegíveis (só de grupos exibidos; a chefia à parte).
create or replace function disc_interno.f360_congelar(p_avaliado uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.f360_avaliados%rowtype;
  v_res jsonb;
begin
  select * into a from public.f360_avaliados where id = p_avaliado;
  v_res := disc_interno.f360_calcular(
    (select coalesce(jsonb_agg(jsonb_build_object('fonte', r.fonte, 'itens', r.itens, 'segundos', r.segundos)), '[]'::jsonb)
       from public.f360_respostas r where r.avaliado_id = a.id),
    a.convidados, to_jsonb(a.excluir));
  update public.f360_avaliados set resultado = v_res where id = a.id;
  update public.f360_comentarios cm set elegivel = coalesce((v_res ->> 'liberado')::boolean, false)
      and (cm.fonte = 'chefia' or (v_res -> 'fontesExibidas') ? cm.fonte)
   where cm.avaliado_id = a.id;
  return v_res;
end;
$$;

-- Encerra o ciclo: congela o resultado de cada pessoa avaliada, APAGA a ligação link → resposta e a lista de convidados
-- (a lista fica até o pulso só com manter_lista, que depende do aval do advogado). Respostas novas passam a ser recusadas.
create or replace function public.f360_encerrar(p_ciclo uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.f360_ciclos%rowtype;
  a record;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into c from public.f360_ciclos where id = p_ciclo for update;
  if not found then return disc_interno.erro('Ciclo não encontrado.'); end if;
  if c.status = 'encerrado' then return disc_interno.erro('Este Feedback 360 já foi encerrado.'); end if;
  perform 1 from public.f360_convites cv where cv.ciclo_id = c.id for update;
  for a in select id from public.f360_avaliados where ciclo_id = c.id order by ordem loop
    perform disc_interno.f360_congelar(a.id);
  end loop;
  delete from public.f360_vinculos v using public.f360_convites cv where cv.id = v.convite_id and cv.ciclo_id = c.id;
  if not c.manter_lista then
    delete from public.f360_convites where ciclo_id = c.id;
  end if;
  update public.f360_ciclos set status = 'encerrado', encerrado_em = now(),
    lista_apagada_em = case when c.manter_lista then null else now() end where id = c.id;
  return json_build_object('ok', true, 'ciclo', disc_interno.f360_ciclo_json(c.id));
end;
$$;

-- Decisão do consultor sobre respostas sinalizadas (regra 16): p_excluir = fontes anônimas cujas sinalizadas saem.
create or replace function public.f360_recalcular(p_avaliado uuid, p_excluir jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.f360_avaliados%rowtype;
  c public.f360_ciclos%rowtype;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into a from public.f360_avaliados where id = p_avaliado for update;
  if not found then return disc_interno.erro('Pessoa avaliada não encontrada.'); end if;
  select * into c from public.f360_ciclos where id = a.ciclo_id;
  if c.status <> 'encerrado' then return disc_interno.erro('Os resultados só aparecem depois que o ciclo é encerrado.'); end if;
  if a.brutas_apagadas_em is not null then return disc_interno.erro('As respostas já foram apagadas (retenção): o resultado não muda mais.'); end if;
  update public.f360_avaliados set excluir = array(select f from unnest(array['colegas', 'equipe', 'outros']) with ordinality u(f, o)
      where jsonb_typeof(p_excluir) = 'array' and p_excluir ? f order by o) where id = a.id;
  perform disc_interno.f360_congelar(a.id);
  return json_build_object('ok', true, 'ciclo', disc_interno.f360_ciclo_json(c.id));
end;
$$;

-- Comentários para moderação (só consultor, ciclo encerrado, dentro da retenção): os anônimos em ordem aleatória e sem o
-- grupo de origem; os da chefia à parte. Os de grupos que não aparecem vêm marcados (não vão para o relatório; o consultor
-- lê só para o protocolo de relatos).
create or replace function public.f360_comentarios(p_avaliado uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  a public.f360_avaliados%rowtype;
  c public.f360_ciclos%rowtype;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into a from public.f360_avaliados where id = p_avaliado;
  if not found then return disc_interno.erro('Pessoa avaliada não encontrada.'); end if;
  select * into c from public.f360_ciclos where id = a.ciclo_id;
  if c.status <> 'encerrado' then return disc_interno.erro('Os comentários só aparecem depois que o ciclo é encerrado.'); end if;
  if a.brutas_apagadas_em is not null then return json_build_object('ok', true, 'apagados', true, 'comentarios', '[]'::json); end if;
  return json_build_object('ok', true, 'apagados', false, 'comentarios', (select coalesce(json_agg(json_build_object('id', cm.id,
      'pergunta', cm.pergunta, 'chefia', cm.fonte = 'chefia', 'elegivel', cm.elegivel, 'texto', cm.texto, 'textoModerado', cm.texto_moderado,
      'status', cm.status, 'motivo', cm.motivo) order by (cm.fonte = 'chefia') desc, cm.sorteio), '[]'::json)
    from public.f360_comentarios cm where cm.avaliado_id = a.id));
end;
$$;

-- Moderação com roteiro: p_dados = {status: 'pendente'|'mantido'|'editado'|'descartado', texto? (editado), motivo? (descartado)}.
-- Descartar com o motivo 'relato' conta um relato no ciclo (protocolo 5.1-f).
create or replace function public.f360_moderar(p_comentario uuid, p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  cm public.f360_comentarios%rowtype;
  a public.f360_avaliados%rowtype;
  c public.f360_ciclos%rowtype;
  v_status text;
  v_texto text := '';
  v_motivo text := '';
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into cm from public.f360_comentarios where id = p_comentario for update;
  if not found then return disc_interno.erro('Comentário não encontrado.'); end if;
  select * into a from public.f360_avaliados where id = cm.avaliado_id;
  select * into c from public.f360_ciclos where id = cm.ciclo_id for update;
  if c.status <> 'encerrado' then return disc_interno.erro('Os comentários só aparecem depois que o ciclo é encerrado.'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then return disc_interno.erro('Moderação inválida.'); end if;
  v_status := disc_interno.texto(p_dados -> 'status');
  if v_status not in ('pendente', 'mantido', 'editado', 'descartado') then return disc_interno.erro('Moderação inválida.'); end if;
  if v_status in ('mantido', 'editado') and not cm.elegivel then
    return disc_interno.erro('Este comentário é de um grupo que não aparece no relatório: ele não pode ir para o líder.');
  end if;
  if v_status = 'mantido' then v_texto := cm.texto; end if;
  if v_status = 'editado' then
    v_texto := btrim(regexp_replace(regexp_replace(disc_interno.texto(p_dados -> 'texto'), E'\r\n?', E'\n', 'g'), E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', ' ', 'g'));
    if v_texto = '' then return disc_interno.erro('Escreva o texto editado (ou descarte o comentário).'); end if;
    if char_length(v_texto) > 1000 then v_texto := btrim(left(v_texto, 1000)); end if;
  end if;
  if v_status = 'descartado' then
    v_motivo := disc_interno.texto(p_dados -> 'motivo');
    if v_motivo not in ('identifica', 'ofensa', 'sensivel', 'relato', 'fora') then return disc_interno.erro('Escolha o motivo do descarte.'); end if;
  end if;
  update public.f360_ciclos set relatos_registrados = greatest(0, relatos_registrados
      + case when v_motivo = 'relato' then 1 else 0 end - case when cm.motivo = 'relato' then 1 else 0 end) where id = c.id;
  update public.f360_comentarios set status = v_status, texto_moderado = v_texto, motivo = v_motivo where id = cm.id;
  return json_build_object('ok', true, 'id', cm.id, 'status', v_status, 'relatosRegistrados',
    (select relatos_registrados from public.f360_ciclos where id = c.id));
end;
$$;

-- Devolutiva: p_dados = {temas?: [até 6 textos de até 300], foco?, observacao?, plano?, discAceito?, devolutivaFeita?: true}.
-- O plano segue DISC_F360.validarPlano. "Devolutiva feita" libera a geração do relatório do líder e da visão da chefia.
create or replace function public.f360_salvar_devolutiva(p_avaliado uuid, p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.f360_avaliados%rowtype;
  c public.f360_ciclos%rowtype;
  v_plano jsonb;
  v_temas jsonb;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into a from public.f360_avaliados where id = p_avaliado for update;
  if not found then return disc_interno.erro('Pessoa avaliada não encontrada.'); end if;
  select * into c from public.f360_ciclos where id = a.ciclo_id;
  if c.status <> 'encerrado' then return disc_interno.erro('A devolutiva só acontece depois que o ciclo é encerrado.'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then return disc_interno.erro('Dados da devolutiva ausentes.'); end if;
  if p_dados ? 'plano' then
    v_plano := disc_interno.f360_validar_plano(p_dados -> 'plano');
    if not (v_plano ->> 'ok')::boolean then return disc_interno.erro(v_plano ->> 'erro'); end if;
    update public.f360_avaliados set plano = case when jsonb_typeof(v_plano -> 'plano') = 'object' then v_plano -> 'plano' end where id = a.id;
  end if;
  if jsonb_typeof(p_dados -> 'temas') = 'array' then
    select coalesce(jsonb_agg(t order by o), '[]'::jsonb) into v_temas from (
      select left(btrim(regexp_replace(x #>> '{}', '\s+', ' ', 'g')), 300) as t, o
        from jsonb_array_elements(p_dados -> 'temas') with ordinality q(x, o)
       where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> '' order by o limit 6) s;
    update public.f360_avaliados set temas = v_temas where id = a.id;
  end if;
  if p_dados ? 'foco' then update public.f360_avaliados set foco = disc_interno.f360_texto_plano(p_dados -> 'foco') where id = a.id; end if;
  if p_dados ? 'observacao' then
    update public.f360_avaliados set observacao = left(btrim(regexp_replace(disc_interno.texto(p_dados -> 'observacao'), '\s+', ' ', 'g')), 600) where id = a.id;
  end if;
  if p_dados ? 'discAceito' then update public.f360_avaliados set disc_aceito = coalesce(p_dados -> 'discAceito' = 'true'::jsonb, false) where id = a.id; end if;
  if p_dados -> 'devolutivaFeita' = 'true'::jsonb and a.devolutiva_em is null then
    update public.f360_avaliados set devolutiva_em = now() where id = a.id;
  end if;
  return json_build_object('ok', true, 'ciclo', disc_interno.f360_ciclo_json(c.id));
end;
$$;

-- Monta (ou refaz) o relatório de uma pessoa avaliada: p_opcoes = {visao: 'lider'|'chefia', publicar?: true|false, consultor?}.
--   lider: exige devolutiva feita, resultado liberado (≥ 3 respostas anônimas válidas) e nenhum comentário elegível pendente;
--          leva a visão do líder do resultado, os temas, os comentários moderados (anônimos embaralhados, sem grupo; os da
--          chefia à parte), foco, observação, plano, o perfil DISC só com o aceite e os "Como liderar" publicados da equipe.
--   chefia: exige devolutiva feita e plano registrado; leva SÓ o plano (nunca notas nem comentários).
create or replace function public.f360_gerar_relatorio(p_avaliado uuid, p_opcoes jsonb default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.f360_avaliados%rowtype;
  c public.f360_ciclos%rowtype;
  v_emp public.empresas%rowtype;
  v_op jsonb := coalesce(p_opcoes, '{}'::jsonb);
  v_visao text;
  v_dados jsonb;
  v_rel public.relatorios%rowtype;
  v_status text;
  v_disc text;
  v_consultor text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into a from public.f360_avaliados where id = p_avaliado for update;
  if not found then return disc_interno.erro('Pessoa avaliada não encontrada.'); end if;
  select * into c from public.f360_ciclos where id = a.ciclo_id;
  if c.status <> 'encerrado' or a.resultado is null then return disc_interno.erro('Encerre o ciclo antes de gerar o relatório.'); end if;
  if jsonb_typeof(v_op) <> 'object' then return disc_interno.erro('Opções do relatório inválidas.'); end if;
  v_visao := disc_interno.texto(v_op -> 'visao');
  if v_visao not in ('lider', 'chefia') then return disc_interno.erro('Escolha a visão do relatório: líder ou chefia.'); end if;
  if a.devolutiva_em is null then
    return disc_interno.erro('Marque a devolutiva como feita antes: ninguém recebe o relatório sem a conversa com o consultor.');
  end if;
  select * into v_emp from public.empresas where id = c.empresa_id;
  v_consultor := left(btrim(regexp_replace(disc_interno.texto(v_op -> 'consultor'), '\s+', ' ', 'g')), 80);
  if v_visao = 'chefia' then
    if a.plano is null then return disc_interno.erro('Registre o plano de desenvolvimento antes: a chefia vê só o plano.'); end if;
    v_dados := jsonb_build_object('modelo', 'feedback360', 'visao', 'chefia', 'versao', 1,
      'titulo', 'Plano de desenvolvimento · ' || a.nome, 'geradoEm', disc_interno.iso(now()),
      'empresa', jsonb_build_object('nome', coalesce(v_emp.nome, '')), 'consultor', v_consultor,
      'ciclo', jsonb_build_object('nome', c.nome, 'encerradoEm', disc_interno.iso(c.encerrado_em)),
      'avaliado', jsonb_build_object('nome', a.nome), 'devolutivaEm', disc_interno.iso(a.devolutiva_em), 'plano', a.plano);
  else
    if not coalesce((a.resultado ->> 'liberado')::boolean, false) then
      return disc_interno.erro('Sem relatório: menos de 3 respostas de colegas, equipe e outros convidados, mesmo juntando grupos.');
    end if;
    if a.brutas_apagadas_em is not null then
      return disc_interno.erro('As respostas e os comentários já foram apagados (retenção): o relatório publicado continua valendo e não pode ser refeito.');
    end if;
    if exists (select 1 from public.f360_comentarios cm where cm.avaliado_id = a.id and cm.elegivel and cm.status = 'pendente') then
      return disc_interno.erro('Modere todos os comentários antes de gerar o relatório do líder.');
    end if;
    if a.disc_aceito and a.pessoa_id is not null then
      select r.perfil into v_disc from public.respostas r where r.pessoa_id = a.pessoa_id and r.perfil ~ '^[DISC]{1,2}$'
       order by r.recebido_em desc limit 1;
    end if;
    v_dados := jsonb_build_object('modelo', 'feedback360', 'visao', 'lider', 'versao', 1,
      'titulo', 'Feedback 360 da Liderança · ' || a.nome, 'geradoEm', disc_interno.iso(now()),
      'empresa', jsonb_build_object('nome', coalesce(v_emp.nome, '')), 'consultor', v_consultor,
      'ciclo', jsonb_build_object('nome', c.nome, 'abertoEm', disc_interno.iso(c.aberto_em), 'encerradoEm', disc_interno.iso(c.encerrado_em),
        'versaoItens', c.versao_itens),
      'avaliado', jsonb_build_object('nome', a.nome, 'topo', a.topo), 'devolutivaEm', disc_interno.iso(a.devolutiva_em),
      'resultado', disc_interno.f360_visao_lider(a.resultado), 'temas', a.temas,
      'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('pergunta', cm.pergunta, 'texto', cm.texto_moderado) order by random()), '[]'::jsonb)
                        from public.f360_comentarios cm where cm.avaliado_id = a.id and cm.elegivel and cm.fonte <> 'chefia' and cm.status in ('mantido', 'editado')),
      'comentariosChefia', (select coalesce(jsonb_agg(jsonb_build_object('pergunta', cm.pergunta, 'texto', cm.texto_moderado) order by cm.pergunta), '[]'::jsonb)
                        from public.f360_comentarios cm where cm.avaliado_id = a.id and cm.elegivel and cm.fonte = 'chefia' and cm.status in ('mantido', 'editado')),
      'foco', a.foco, 'observacao', a.observacao, 'plano', coalesce(a.plano, 'null'::jsonb),
      'disc', case when v_disc is not null then jsonb_build_object('codigo', v_disc) else 'null'::jsonb end,
      'guias', (select coalesce(jsonb_agg(jsonb_build_object('nome', disc_interno.clima_nome_curto(p.nome), 'token', rel.token) order by p.nome), '[]'::jsonb)
                  from public.relatorios rel join public.pessoas p on p.id = rel.pessoa_id
                 where rel.modelo = 'lideranca' and rel.status = 'publicado' and a.pessoa_id is not null
                   and exists (select 1 from public.relacoes r join public.vinculos v on v.pessoa_id = r.para_pessoa and v.empresa_id = c.empresa_id and v.status = 'ativo'
                                where r.empresa_id = c.empresa_id and r.de_pessoa = a.pessoa_id and r.para_pessoa = rel.pessoa_id and r.tipo = 'lidera')));
  end if;
  perform set_config('disc.f360_snapshot', '1', true);
  select * into v_rel from public.relatorios where f360_avaliado_id = a.id and f360_visao = v_visao;
  if found then
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado' when v_op -> 'publicar' = 'false'::jsonb then 'rascunho' else v_rel.status end;
    update public.relatorios set dados = v_dados, status = v_status where token = v_rel.token returning * into v_rel;
  else
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado' else 'rascunho' end;
    insert into public.relatorios (modelo, empresa_id, f360_ciclo_id, f360_avaliado_id, f360_visao, dados, status)
      values ('feedback360', c.empresa_id, c.id, a.id, v_visao, v_dados, v_status) returning * into v_rel;
  end if;
  perform set_config('disc.f360_snapshot', '', true);
  return json_build_object('ok', true, 'relatorio', json_build_object('id', v_rel.id, 'token', v_rel.token, 'status', v_rel.status,
    'modelo', 'feedback360', 'visao', v_visao, 'publicadoEm', disc_interno.iso(v_rel.publicado_em)));
end;
$$;

-- Consolidado da liderança (dono e consultor): só com 5 ou mais líderes com relatório liberado e devolutiva feita; só o total
-- da empresa, média por tema na ordem fixa, sem nomes; temas de foco (contagem) só com 5 ou mais planos.
create or replace function public.f360_gerar_consolidado(p_ciclo uuid, p_opcoes jsonb default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.f360_ciclos%rowtype;
  v_emp public.empresas%rowtype;
  v_op jsonb := coalesce(p_opcoes, '{}'::jsonb);
  v_cons jsonb;
  v_dados jsonb;
  v_rel public.relatorios%rowtype;
  v_status text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into c from public.f360_ciclos where id = p_ciclo for update;
  if not found then return disc_interno.erro('Ciclo não encontrado.'); end if;
  if c.status <> 'encerrado' then return disc_interno.erro('Encerre o ciclo antes de gerar o consolidado.'); end if;
  if jsonb_typeof(v_op) <> 'object' then return disc_interno.erro('Opções do relatório inválidas.'); end if;
  v_cons := disc_interno.f360_consolidar(
    (select coalesce(jsonb_agg(disc_interno.f360_visao_lider(a.resultado) order by a.ordem), '[]'::jsonb)
       from public.f360_avaliados a where a.ciclo_id = c.id and a.devolutiva_em is not null and a.resultado is not null),
    (select coalesce(jsonb_agg((select coalesce(jsonb_agg(x -> 'item'), '[]'::jsonb) from jsonb_array_elements(a.plano -> 'comportamentos') x) order by a.ordem), '[]'::jsonb)
       from public.f360_avaliados a where a.ciclo_id = c.id and a.devolutiva_em is not null and jsonb_typeof(a.plano) = 'object'));
  if not (v_cons ->> 'disponivel')::boolean then
    return disc_interno.erro('O consolidado da liderança só aparece com 5 ou mais líderes com relatório liberado e devolutiva feita.');
  end if;
  select * into v_emp from public.empresas where id = c.empresa_id;
  v_dados := jsonb_build_object('modelo', 'feedback360', 'visao', 'empresa', 'versao', 1,
    'titulo', 'Feedback 360 da Liderança · consolidado · ' || coalesce(v_emp.nome, ''), 'geradoEm', disc_interno.iso(now()),
    'empresa', jsonb_build_object('nome', coalesce(v_emp.nome, '')),
    'consultor', left(btrim(regexp_replace(disc_interno.texto(v_op -> 'consultor'), '\s+', ' ', 'g')), 80),
    'ciclo', jsonb_build_object('nome', c.nome, 'encerradoEm', disc_interno.iso(c.encerrado_em), 'versaoItens', c.versao_itens),
    'consolidado', v_cons);
  perform set_config('disc.f360_snapshot', '1', true);
  select * into v_rel from public.relatorios where f360_ciclo_id = c.id and f360_visao = 'empresa';
  if found then
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado' when v_op -> 'publicar' = 'false'::jsonb then 'rascunho' else v_rel.status end;
    update public.relatorios set dados = v_dados, status = v_status where token = v_rel.token returning * into v_rel;
  else
    v_status := case when v_op -> 'publicar' = 'true'::jsonb then 'publicado' else 'rascunho' end;
    insert into public.relatorios (modelo, empresa_id, f360_ciclo_id, f360_visao, dados, status)
      values ('feedback360', c.empresa_id, c.id, 'empresa', v_dados, v_status) returning * into v_rel;
  end if;
  perform set_config('disc.f360_snapshot', '', true);
  return json_build_object('ok', true, 'relatorio', json_build_object('id', v_rel.id, 'token', v_rel.token, 'status', v_rel.status,
    'modelo', 'feedback360', 'visao', 'empresa', 'publicadoEm', disc_interno.iso(v_rel.publicado_em)));
end;
$$;

create or replace function public.f360_excluir_ciclo(p_ciclo uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  delete from public.f360_ciclos where id = p_ciclo;
  if not found then return disc_interno.erro('Ciclo não encontrado.'); end if;
  return json_build_object('ok', true, 'id', p_ciclo);
end;
$$;

-- Retenção (3.1.10): apaga respostas, comentários (originais e moderados; o relatório publicado guarda os moderados) e a
-- lista de convidados das pessoas avaliadas cujo prazo venceu (retencao_dias depois da devolutiva; sem devolutiva, do
-- encerramento) e os relatórios do 360 com mais de 24 meses. Fica o resultado agregado. Com p_ciclo e p_agora = true apaga
-- já as respostas daquele ciclo encerrado. Não é agendada aqui: o painel chama, ou o dono agenda (docs/SUPABASE.md).
create or replace function public.f360_apagar_brutas(p_ciclo uuid default null, p_agora boolean default false)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_resp int;
  v_rels int;
  v_papel text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if not public.e_admin() and v_papel not in ('service_role', 'none') then
    return disc_interno.erro('Sem permissão.');
  end if;
  v_ids := array(select a.id from public.f360_avaliados a join public.f360_ciclos c on c.id = a.ciclo_id
                  where c.status = 'encerrado' and a.brutas_apagadas_em is null and (p_ciclo is null or c.id = p_ciclo)
                    and ((p_agora and p_ciclo is not null)
                         or now() >= coalesce(a.devolutiva_em, c.encerrado_em) + make_interval(days => c.retencao_dias)));
  delete from public.f360_respostas r where r.avaliado_id = any(v_ids);
  get diagnostics v_resp = row_count;
  delete from public.f360_comentarios cm where cm.avaliado_id = any(v_ids);
  delete from public.f360_convites cv where cv.avaliado_id = any(v_ids);
  update public.f360_avaliados set brutas_apagadas_em = now() where id = any(v_ids);
  update public.f360_ciclos c set lista_apagada_em = coalesce(c.lista_apagada_em, now())
   where c.status = 'encerrado' and not exists (select 1 from public.f360_convites cv where cv.ciclo_id = c.id);
  delete from public.relatorios rel where rel.modelo = 'feedback360' and rel.criado_em < now() - interval '24 months';
  get diagnostics v_rels = row_count;
  return json_build_object('ok', true, 'avaliados', coalesce(array_length(v_ids, 1), 0), 'respostas', v_resp, 'relatorios', v_rels);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões: só administradores leem ciclos e pessoas avaliadas (agregados); convites, respostas, comentários e a
-- ligação link → resposta, ninguém pela API (nem o painel): só as funções do banco.
-- -----------------------------------------------------------------------------

alter table public.f360_ciclos enable row level security;
alter table public.f360_avaliados enable row level security;
alter table public.f360_convites enable row level security;
alter table public.f360_respostas enable row level security;
alter table public.f360_comentarios enable row level security;
alter table public.f360_vinculos enable row level security;

drop policy if exists f360_ciclos_admin_le on public.f360_ciclos;
create policy f360_ciclos_admin_le on public.f360_ciclos for select to authenticated using (public.e_admin());
drop policy if exists f360_avaliados_admin_le on public.f360_avaliados;
create policy f360_avaliados_admin_le on public.f360_avaliados for select to authenticated using (public.e_admin());
-- f360_convites, f360_respostas, f360_comentarios e f360_vinculos: nenhuma política (só as funções do banco).

revoke all on public.f360_ciclos, public.f360_avaliados, public.f360_convites, public.f360_respostas, public.f360_comentarios,
  public.f360_vinculos from public;
revoke all on function disc_interno.f360_itens(), disc_interno.f360_temas(), disc_interno.f360_arred1(numeric),
  disc_interno.f360_normalizar(jsonb), disc_interno.f360_estat_tema(jsonb, text), disc_interno.f360_estat_item(jsonb, text),
  disc_interno.f360_nome_grupo(text[]), disc_interno.f360_calcular(jsonb, jsonb, jsonb), disc_interno.f360_visao_lider(jsonb),
  disc_interno.f360_consolidar(jsonb, jsonb), disc_interno.f360_texto_plano(jsonb), disc_interno.f360_data_plano(jsonb),
  disc_interno.f360_validar_plano(jsonb), disc_interno.f360_ciclos_antes_gravar(), disc_interno.f360_so_aberto(),
  disc_interno.relatorios_f360_protegido(), disc_interno.f360_rel_json(uuid, text), disc_interno.f360_ciclo_json(uuid),
  disc_interno.f360_convite(text), disc_interno.f360_congelar(uuid) from public;
revoke all on function public.f360_publica(text), public.f360_enviar(text, jsonb), public.f360_apagar_resposta(text),
  public.f360_criar_ciclo(jsonb), public.f360_listar(uuid), public.f360_encerrar(uuid), public.f360_recalcular(uuid, jsonb),
  public.f360_comentarios(uuid), public.f360_moderar(uuid, jsonb), public.f360_salvar_devolutiva(uuid, jsonb),
  public.f360_gerar_relatorio(uuid, jsonb), public.f360_gerar_consolidado(uuid, jsonb), public.f360_excluir_ciclo(uuid),
  public.f360_apagar_brutas(uuid, boolean) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.f360_ciclos, public.f360_avaliados, public.f360_convites, public.f360_respostas, '
        || 'public.f360_comentarios, public.f360_vinculos from %I', papel);
      execute format('revoke all on function public.f360_criar_ciclo(jsonb), public.f360_listar(uuid), public.f360_encerrar(uuid), '
        || 'public.f360_recalcular(uuid, jsonb), public.f360_comentarios(uuid), public.f360_moderar(uuid, jsonb), '
        || 'public.f360_salvar_devolutiva(uuid, jsonb), public.f360_gerar_relatorio(uuid, jsonb), public.f360_gerar_consolidado(uuid, jsonb), '
        || 'public.f360_excluir_ciclo(uuid), public.f360_apagar_brutas(uuid, boolean) from %I', papel);
      execute format('revoke all on function disc_interno.f360_itens(), disc_interno.f360_temas(), disc_interno.f360_arred1(numeric), '
        || 'disc_interno.f360_normalizar(jsonb), disc_interno.f360_estat_tema(jsonb, text), disc_interno.f360_estat_item(jsonb, text), '
        || 'disc_interno.f360_nome_grupo(text[]), disc_interno.f360_calcular(jsonb, jsonb, jsonb), disc_interno.f360_visao_lider(jsonb), '
        || 'disc_interno.f360_consolidar(jsonb, jsonb), disc_interno.f360_texto_plano(jsonb), disc_interno.f360_data_plano(jsonb), '
        || 'disc_interno.f360_validar_plano(jsonb), disc_interno.f360_rel_json(uuid, text), disc_interno.f360_ciclo_json(uuid), '
        || 'disc_interno.f360_convite(text), disc_interno.f360_congelar(uuid) from %I', papel);
      execute format('grant execute on function public.f360_publica(text), public.f360_enviar(text, jsonb), public.f360_apagar_resposta(text) to %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.f360_ciclos, public.f360_avaliados to authenticated;
    grant execute on function public.f360_criar_ciclo(jsonb), public.f360_listar(uuid), public.f360_encerrar(uuid),
      public.f360_recalcular(uuid, jsonb), public.f360_comentarios(uuid), public.f360_moderar(uuid, jsonb),
      public.f360_salvar_devolutiva(uuid, jsonb), public.f360_gerar_relatorio(uuid, jsonb), public.f360_gerar_consolidado(uuid, jsonb),
      public.f360_excluir_ciclo(uuid), public.f360_apagar_brutas(uuid, boolean) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, delete on public.f360_ciclos, public.f360_avaliados, public.f360_convites, public.f360_respostas,
      public.f360_comentarios, public.f360_vinculos to service_role;
    grant update on public.f360_ciclos, public.f360_avaliados to service_role;
    grant execute on function public.f360_apagar_brutas(uuid, boolean) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261021120000_feedback360
-- (na integração com as frentes 20261018, 20261019 e 20261020, as linhas delas entram antes desta)
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
                                   and to_regprocedure('public.clima_enviar(text, jsonb)') is not null),
      (13, '20261021120000_feedback360', to_regclass('public.f360_respostas') is not null
                                         and to_regclass('public.f360_vinculos') is not null
                                         and to_regprocedure('public.f360_enviar(text, jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261021120000, 'migracoes', to_jsonb(aplicadas),
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

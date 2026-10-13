-- =============================================================================
-- Teste DISC — versão técnica dos relatórios de equipe e "Como liderar" (leitura por psicólogo(a), com nome e CRP).
-- Roda DEPOIS de 20261005120000_disc.sql … 20261017120000_clima.sql.
-- Idempotente e seguro sobre dados reais: só acrescenta colunas, uma tabela, funções, um gatilho e políticas; recria
-- relatorio_publico, relatorios_antes_gravar e versao_banco. Nada é apagado (os snapshots gravados ficam como estão).
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Decisão: docs/painel-cientifico/decisao.md, seção 4, linha 12 (combinada com o dono). A distância entre o estilo natural
-- e o que o cargo pede (Parte 2) é a parte que mais se aproxima de avaliação psicológica:
--   * link de sempre (relatorios.token) = VERSÃO DO DONO/GESTOR: relatorio_publico entrega o snapshot SEM esse conteúdo
--     (disc_interno.relatorio_versao_dono; mesma regra de js/versao-tecnica.js, conferida em
--     tests/supabase/versao_tecnica.test.js) e com "restrito": true; a página escreve no lugar
--     "Este capítulo é liberado só para leitura por psicólogo(a).".
--     Relatórios JÁ publicados continuam no ar pelo mesmo link e passam a abrir nesta versão (o conteúdo segue no banco;
--     a versão completa só sai pelo link técnico, depois que alguém informar nome e CRP).
--   * relatorios.token_tecnico = VERSÃO TÉCNICA (outro link): o snapshot completo + leituraTecnica {nome, crp} (impressos
--     em todas as páginas). Só existe depois de public.gerar_relatorio_tecnico(id, nome, crp) (só admin; CRP "RR/NNNNN":
--     região 01–99 + número de 3 a 6 dígitos; validação de formato, sem consulta externa). Gerar de novo troca o token (o
--     link anterior para de abrir). public.despublicar_relatorio_tecnico(id) desliga só o link técnico; despublicar o do
--     dono (status) não mexe no técnico. As colunas tecnico_* só mudam por essas funções (gatilho recusa o resto).
--   * public.leituras_tecnicas: histórico — quem gerou (nome do admin na hora + id), quando, nome e CRP informados, ação
--     (gerada | despublicada) e o modelo. Só admin LÊ (RLS); só as funções acima gravam; ninguém altera nem apaga pela
--     API. Fica mesmo se o relatório for excluído (relatorio_id vira nulo; nada da pessoa avaliada é guardado aqui).
--   * public.relatorio_tecnico(id): o painel lê o link técnico e o histórico (só admin).
--   * versao_banco() passa a conhecer esta migração (versão 20261019120000).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas do link técnico em public.relatorios
-- -----------------------------------------------------------------------------

alter table public.relatorios add column if not exists token_tecnico text;
alter table public.relatorios add column if not exists tecnico_status text;
alter table public.relatorios add column if not exists tecnico_nome text;
alter table public.relatorios add column if not exists tecnico_crp text;
alter table public.relatorios add column if not exists tecnico_publicado_em timestamptz;
create unique index if not exists relatorios_token_tecnico_idx on public.relatorios (token_tecnico) where token_tecnico is not null;

alter table public.relatorios drop constraint if exists relatorios_tecnico_valido;
alter table public.relatorios add constraint relatorios_tecnico_valido check (
  (token_tecnico is null and tecnico_status is null and tecnico_nome is null and tecnico_crp is null and tecnico_publicado_em is null)
  or (token_tecnico ~ '^[0-9a-f]{64}$' and modelo in ('equipe', 'lideranca')
      and tecnico_status in ('publicado', 'despublicado')
      and char_length(tecnico_nome) between 5 and 120
      and tecnico_crp ~ '^(0[1-9]|[1-9][0-9])/[0-9]{3,6}$'
      and tecnico_publicado_em is not null));

-- -----------------------------------------------------------------------------
-- Histórico
-- -----------------------------------------------------------------------------

create table if not exists public.leituras_tecnicas (
  id             uuid primary key default gen_random_uuid(),
  relatorio_id   uuid references public.relatorios (id) on delete set null,
  modelo         text not null,
  acao           text not null,
  leitor_nome    text not null,
  leitor_crp     text not null,
  gerado_por     text not null,
  gerado_por_id  uuid,
  em             timestamptz not null default now(),
  constraint leituras_tecnicas_modelo_valido check (modelo in ('equipe', 'lideranca')),
  constraint leituras_tecnicas_acao_valida check (acao in ('gerada', 'despublicada')),
  constraint leituras_tecnicas_nome_valido check (char_length(leitor_nome) between 5 and 120),
  constraint leituras_tecnicas_crp_valido check (leitor_crp ~ '^(0[1-9]|[1-9][0-9])/[0-9]{3,6}$'),
  constraint leituras_tecnicas_quem_valido check (char_length(gerado_por) between 1 and 120)
);
create index if not exists leituras_tecnicas_relatorio_idx on public.leituras_tecnicas (relatorio_id, em desc);

-- -----------------------------------------------------------------------------
-- Auxiliares (iguais a js/versao-tecnica.js)
-- -----------------------------------------------------------------------------

-- "CRP 06/12345", "crp-06/12345", " 06 - 12345 " -> '06/12345'; inválido -> null. Região 01–99; número de 3 a 6 dígitos.
create or replace function disc_interno.crp_normalizado(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  m text[];
begin
  s := regexp_replace(s, '^crp\s*[-:]?\s*', '', 'i');
  m := regexp_match(s, '^([0-9]{2}) ?[/-] ?([0-9]{3,6})$');
  if m is null or m[1] = '00' or m[2] ~ '^0+$' then return null; end if;
  return m[1] || '/' || m[2];
end;
$$;

-- Nome de quem vai ler: espaços colapsados; 5–120 caracteres; letras (com acento), espaço, ponto, hífen e apóstrofo;
-- pelo menos duas palavras com 2+ letras. Inválido -> null.
create or replace function disc_interno.nome_leitor(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if char_length(s) < 5 or char_length(s) > 120 then return null; end if;
  if s !~ '^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ''’. -]*$' then return null; end if;
  if (select count(*) from regexp_split_to_table(s, ' ') w where w ~ '[A-Za-zÀ-ÖØ-öø-ÿ]{2,}') < 2 then return null; end if;
  return s;
end;
$$;

-- Itens de texto que remetem à seção restrita saem (o plano dos 60 dias: 'veja "Esforço de adaptação ao cargo"').
create or replace function disc_interno.itens_sem_restrito(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    from jsonb_array_elements(p) with ordinality as t(e, n)
   where not (jsonb_typeof(e) = 'string' and (e #>> '{}') ~* 'esfor[çÇ]o de adapta[çÇ][ãÃ]o ao cargo');
$$;

-- Lista de objetos sem a chave "exigido" (o resto como está, na mesma ordem).
create or replace function disc_interno.lista_sem_exigido(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'exigido' else e end order by n), '[]'::jsonb)
    from jsonb_array_elements(p) with ordinality as t(e, n);
$$;
create or replace function disc_interno.lista_tem_exigido(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(p) e
                  where jsonb_typeof(e) = 'object' and e ? 'exigido' and jsonb_typeof(e -> 'exigido') <> 'null');
$$;

-- Versão do DONO de um snapshot (mesma regra de versaoDono em js/versao-tecnica.js):
--   todos os modelos: sem leituraTecnica e sem restrito (vêm só do banco);
--   equipe e lideranca: sem mapa.pontos[].exigido;
--   equipe:    sem pressao (capítulo "Distância…" e barras por pessoa do guia por líder) e sem colaboradores[].exigido;
--   lideranca: sem exigido, sem a seção da Parte 2 (id/chave com estic|exig|adapta|esforc) e sem os itens que citam
--              "Esforço de adaptação ao cargo" (itens e etapas[].itens das outras seções).
-- Havia algo disso: + "restrito": true (a página escreve "Este capítulo é liberado só para leitura por psicólogo(a).").
create or replace function disc_interno.relatorio_versao_dono(p_dados jsonb, p_modelo text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  d jsonb := p_dados;
  tinha boolean := false;
  secs jsonb;
begin
  if d is null or jsonb_typeof(d) <> 'object' then return d; end if;
  d := d - 'leituraTecnica' - 'restrito';
  if coalesce(p_modelo, '') not in ('equipe', 'lideranca') then return d; end if;

  if jsonb_typeof(d -> 'mapa') = 'object' and jsonb_typeof(d #> '{mapa,pontos}') = 'array' then
    if disc_interno.lista_tem_exigido(d #> '{mapa,pontos}') then tinha := true; end if;
    d := jsonb_set(d, '{mapa,pontos}', disc_interno.lista_sem_exigido(d #> '{mapa,pontos}'));
  end if;

  if p_modelo = 'equipe' then
    if d ? 'pressao' then
      if jsonb_typeof(d -> 'pressao') <> 'null' then tinha := true; end if;
      d := d - 'pressao';
    end if;
    if jsonb_typeof(d -> 'colaboradores') = 'array' then
      if disc_interno.lista_tem_exigido(d -> 'colaboradores') then tinha := true; end if;
      d := jsonb_set(d, '{colaboradores}', disc_interno.lista_sem_exigido(d -> 'colaboradores'));
    end if;
  else
    if d ? 'exigido' then
      if jsonb_typeof(d -> 'exigido') <> 'null' then tinha := true; end if;
      d := d - 'exigido';
    end if;
    if jsonb_typeof(d -> 'secoes') = 'array' then
      -- seções da Parte 2 saem
      if exists (select 1 from jsonb_array_elements(d -> 'secoes') s
                  where jsonb_typeof(s) = 'object'
                    and (case when jsonb_typeof(s -> 'id') = 'string' and s ->> 'id' <> '' then s ->> 'id'
                              when jsonb_typeof(s -> 'chave') in ('string', 'number', 'boolean') then s ->> 'chave'
                              else '' end) ~* '(estic|exig|adapta|esforc)') then
        tinha := true;
      end if;
      select coalesce(jsonb_agg(
               case when jsonb_typeof(s) <> 'object' then s
                    else s
                      || case when jsonb_typeof(s -> 'itens') = 'array'
                              then jsonb_build_object('itens', disc_interno.itens_sem_restrito(s -> 'itens')) else '{}'::jsonb end
                      || case when jsonb_typeof(s -> 'etapas') = 'array'
                              then jsonb_build_object('etapas', (
                                     select coalesce(jsonb_agg(
                                              case when jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'itens') = 'array'
                                                   then e || jsonb_build_object('itens', disc_interno.itens_sem_restrito(e -> 'itens'))
                                                   else e end order by k), '[]'::jsonb)
                                       from jsonb_array_elements(s -> 'etapas') with ordinality as te(e, k)))
                              else '{}'::jsonb end
               end order by n), '[]'::jsonb)
        into secs
        from jsonb_array_elements(d -> 'secoes') with ordinality as ts(s, n)
       where not (jsonb_typeof(s) = 'object'
                  and (case when jsonb_typeof(s -> 'id') = 'string' and s ->> 'id' <> '' then s ->> 'id'
                            when jsonb_typeof(s -> 'chave') in ('string', 'number', 'boolean') then s ->> 'chave'
                            else '' end) ~* '(estic|exig|adapta|esforc)');
      if secs::text is distinct from (
           select coalesce(jsonb_agg(s order by n), '[]'::jsonb)
             from jsonb_array_elements(d -> 'secoes') with ordinality as ts(s, n)
            where not (jsonb_typeof(s) = 'object'
                       and (case when jsonb_typeof(s -> 'id') = 'string' and s ->> 'id' <> '' then s ->> 'id'
                                 when jsonb_typeof(s -> 'chave') in ('string', 'number', 'boolean') then s ->> 'chave'
                                 else '' end) ~* '(estic|exig|adapta|esforc)'))::text then
        tinha := true;   -- algum item que citava a seção restrita saiu
      end if;
      d := jsonb_set(d, '{secoes}', secs);
    end if;
  end if;

  if tinha then d := d || '{"restrito": true}'::jsonb; end if;
  return d;
end;
$$;

-- Link técnico e histórico no formato do painel.
create or replace function disc_interno.relatorio_tecnico_json(p_relatorio uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'ok', true,
    'tecnica', json_build_object(
      'status', coalesce(r.tecnico_status, ''), 'token', coalesce(r.token_tecnico, ''),
      'nome', coalesce(r.tecnico_nome, ''), 'crp', coalesce(r.tecnico_crp, ''),
      'publicadoEm', disc_interno.iso(r.tecnico_publicado_em)),
    'historico', coalesce((
      select json_agg(json_build_object('acao', h.acao, 'nome', h.leitor_nome, 'crp', h.leitor_crp, 'por', h.gerado_por,
                                        'em', disc_interno.iso(h.em)) order by h.em desc, h.id)
        from (select * from public.leituras_tecnicas x where x.relatorio_id = r.id order by x.em desc limit 20) h), '[]'::json))
  from public.relatorios r where r.id = p_relatorio;
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos: as colunas tecnico_* só mudam pelas funções do painel; gerar/despublicar não mexe em "atualizado em"
-- -----------------------------------------------------------------------------

create or replace function disc_interno.relatorios_proteger_tecnico()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('disc.versao_tecnica', true), '') = 'sim' then return new; end if;
  if tg_op = 'INSERT' then
    if new.token_tecnico is not null or new.tecnico_status is not null or new.tecnico_nome is not null
       or new.tecnico_crp is not null or new.tecnico_publicado_em is not null then
      raise exception 'A versão técnica só é gerada pelo painel, com o nome e o CRP de quem vai ler.' using errcode = '42501';
    end if;
  elsif (new.token_tecnico, new.tecnico_status, new.tecnico_nome, new.tecnico_crp, new.tecnico_publicado_em)
        is distinct from (old.token_tecnico, old.tecnico_status, old.tecnico_nome, old.tecnico_crp, old.tecnico_publicado_em) then
    raise exception 'A versão técnica só é gerada pelo painel, com o nome e o CRP de quem vai ler.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists relatorios_proteger_tecnico on public.relatorios;
create trigger relatorios_proteger_tecnico before insert or update on public.relatorios
  for each row execute function disc_interno.relatorios_proteger_tecnico();

-- Mesma de 20261005120000_disc.sql; só não carimba "atualizado em" quando quem mexe é gerar/despublicar a versão técnica.
create or replace function disc_interno.relatorios_antes_gravar()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('disc.versao_tecnica', true), '') = 'sim' then return new; end if;
  new.atualizado_em := now();
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status is distinct from 'publicado') then
    new.publicado_em := now();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções públicas
-- -----------------------------------------------------------------------------

-- Relatório público. Link do dono (token): só publicado; equipe e lideranca na versão do dono. Link técnico
-- (token_tecnico): só com a versão técnica publicada; snapshot completo + versao 'tecnica' + leituraTecnica.
-- Nunca devolve o id da lista do ClickUp.
create or replace function public.relatorio_publico(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.relatorios%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    return disc_interno.erro('Relatório não encontrado ou fora do ar.');
  end if;
  select * into r from public.relatorios where token = p_token;
  if found then
    if r.status <> 'publicado' then
      return disc_interno.erro('Relatório não encontrado ou fora do ar.');
    end if;
    return json_build_object('ok', true,
      'modelo', coalesce(r.modelo, 'processo'),
      'relatorio', disc_interno.relatorio_versao_dono(r.dados #- '{processo,clickupListId}' #- '{processo,clickup_list_id}',
                                                      coalesce(r.modelo, 'processo')),
      'publicadoEm', disc_interno.iso(r.publicado_em));
  end if;
  select * into r from public.relatorios
   where token_tecnico = p_token and tecnico_status = 'publicado' and modelo in ('equipe', 'lideranca');
  if not found then
    return disc_interno.erro('Relatório não encontrado ou fora do ar.');
  end if;
  return json_build_object('ok', true,
    'modelo', r.modelo,
    'versao', 'tecnica',
    'relatorio', r.dados - 'leituraTecnica' - 'restrito',
    'leituraTecnica', json_build_object('nome', r.tecnico_nome, 'crp', r.tecnico_crp),
    'publicadoEm', disc_interno.iso(r.tecnico_publicado_em));
end;
$$;

-- Painel (só admin): link técnico e histórico de um relatório de equipe ou "Como liderar".
create or replace function public.relatorio_tecnico(p_relatorio uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  if not exists (select 1 from public.relatorios r where r.id = p_relatorio and r.modelo in ('equipe', 'lideranca')) then
    return disc_interno.erro('Relatório não encontrado.');
  end if;
  return disc_interno.relatorio_tecnico_json(p_relatorio);
end;
$$;

-- Painel (só admin): gera (ou troca) o link técnico com o nome e o CRP de quem vai ler e registra no histórico.
create or replace function public.gerar_relatorio_tecnico(p_relatorio uuid, p_nome text, p_crp text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nome text := disc_interno.nome_leitor(p_nome);
  v_crp text := disc_interno.crp_normalizado(p_crp);
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_modelo text;
  v_admin text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  if v_nome is null then return disc_interno.erro('Informe o nome completo de quem vai ler (nome e sobrenome, só letras).'); end if;
  if v_crp is null then
    return disc_interno.erro('CRP inválido. Use o formato RR/NNNNN: a região com 2 dígitos e o número (ex.: 06/12345).');
  end if;
  select r.modelo into v_modelo from public.relatorios r where r.id = p_relatorio and r.modelo in ('equipe', 'lideranca') for update;
  if not found then return disc_interno.erro('Relatório não encontrado.'); end if;
  select coalesce(nullif(btrim(a.nome), ''), 'Administrador') into v_admin from public.admins a where a.user_id = auth.uid();
  perform set_config('disc.versao_tecnica', 'sim', true);
  update public.relatorios
     set token_tecnico = v_token, tecnico_status = 'publicado', tecnico_nome = v_nome, tecnico_crp = v_crp,
         tecnico_publicado_em = now()
   where id = p_relatorio;
  perform set_config('disc.versao_tecnica', '', true);
  insert into public.leituras_tecnicas (relatorio_id, modelo, acao, leitor_nome, leitor_crp, gerado_por, gerado_por_id)
  values (p_relatorio, v_modelo, 'gerada', v_nome, v_crp, left(coalesce(v_admin, 'Administrador'), 120), auth.uid());
  return disc_interno.relatorio_tecnico_json(p_relatorio);
end;
$$;

-- Painel (só admin): desliga só o link técnico (o do dono continua como está). Já desligado: nada muda.
create or replace function public.despublicar_relatorio_tecnico(p_relatorio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.relatorios%rowtype;
  v_admin text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.relatorios x where x.id = p_relatorio and x.modelo in ('equipe', 'lideranca') for update;
  if not found then return disc_interno.erro('Relatório não encontrado.'); end if;
  if r.token_tecnico is null then return disc_interno.erro('Este relatório não tem versão técnica.'); end if;
  if r.tecnico_status = 'publicado' then
    select coalesce(nullif(btrim(a.nome), ''), 'Administrador') into v_admin from public.admins a where a.user_id = auth.uid();
    perform set_config('disc.versao_tecnica', 'sim', true);
    update public.relatorios set tecnico_status = 'despublicado' where id = p_relatorio;
    perform set_config('disc.versao_tecnica', '', true);
    insert into public.leituras_tecnicas (relatorio_id, modelo, acao, leitor_nome, leitor_crp, gerado_por, gerado_por_id)
    values (p_relatorio, r.modelo, 'despublicada', r.tecnico_nome, r.tecnico_crp, left(coalesce(v_admin, 'Administrador'), 120), auth.uid());
  end if;
  return disc_interno.relatorio_tecnico_json(p_relatorio);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões: o histórico só é LIDO por administradores; só as funções acima gravam
-- -----------------------------------------------------------------------------

alter table public.leituras_tecnicas enable row level security;

drop policy if exists leituras_tecnicas_admin_le on public.leituras_tecnicas;
create policy leituras_tecnicas_admin_le on public.leituras_tecnicas for select to authenticated
  using (public.e_admin());

revoke all on public.leituras_tecnicas from public;
revoke all on function disc_interno.crp_normalizado(text), disc_interno.nome_leitor(text), disc_interno.itens_sem_restrito(jsonb),
  disc_interno.lista_sem_exigido(jsonb), disc_interno.lista_tem_exigido(jsonb), disc_interno.relatorio_versao_dono(jsonb, text),
  disc_interno.relatorio_tecnico_json(uuid), disc_interno.relatorios_proteger_tecnico() from public;
revoke all on function public.relatorio_publico(text), public.relatorio_tecnico(uuid), public.gerar_relatorio_tecnico(uuid, text, text),
  public.despublicar_relatorio_tecnico(uuid) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.leituras_tecnicas from %I', papel);
    end if;
  end loop;
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on function public.relatorio_tecnico(uuid), public.gerar_relatorio_tecnico(uuid, text, text), '
        || 'public.despublicar_relatorio_tecnico(uuid) from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.relatorio_publico(text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.leituras_tecnicas to authenticated;
    grant execute on function public.relatorio_publico(text), public.relatorio_tecnico(uuid),
      public.gerar_relatorio_tecnico(uuid, text, text), public.despublicar_relatorio_tecnico(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.leituras_tecnicas to service_role;
    grant execute on function public.relatorio_publico(text) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261019120000_versao_tecnica
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
      (13, '20261018120000_clima_identificacao', to_regclass('public.clima_convites') is not null
                                                 and to_regprocedure('public.clima_identificacao(uuid)') is not null),
      (14, '20261019120000_versao_tecnica', to_regclass('public.leituras_tecnicas') is not null
                                            and to_regprocedure('public.gerar_relatorio_tecnico(uuid, text, text)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261019120000, 'migracoes', to_jsonb(aplicadas),
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

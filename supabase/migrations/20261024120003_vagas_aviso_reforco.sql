-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — REFORÇO DO AVISO DE ABERTURA (3ª revisão de segurança da onda 2). Roda DEPOIS de
-- 20261024120002_vagas_aviso_abertura.sql e precisa estar no ar ANTES do primeiro aviso real. Idempotente e seguro sobre
-- dados reais: acrescenta colunas, uma tabela de ajustes (fechada), funções e permissões, e recria versao_banco(). Só
-- apaga o que a regra manda (abaixo). À mão: SQL Editor → colar → Run. Contrato: docs/VAGAS-SPEC.md §6.7, §7.1, §8.8 e §8.9.
--
--   A1. FILA TRAVADA. Um anônimo punha na lista e-mails com caractere invisível ou espaço que não é ASCII (espaço sem
--       quebra, BOM, U+2028, espaço ideográfico...): o banco aceitava, a Edge Function recusava, cada recusa voltava para a
--       FRENTE da fila e a pessoa de verdade nunca era avisada. Agora:
--       1) vagas_interno.email aceita só ASCII visível (o mesmo de emailVagas na Function e de VAGAS_REGRAS.normalizarEmail);
--          as linhas da lista que não passariam são apagadas aqui (sem erro);
--       2) e-mail que a Function recusa não volta para a fila (vagas_conta_aviso_marcar ganha p_invalidos); falha passageira
--          vai para o FIM da fila (aviso_tentativas + 1) e, na 3ª, sai da fila do e-mail;
--       3) a Function devolve travado:true quando o lote não avisou ninguém e só teve falhas (a tela para o laço).
--   A2. TETO DIÁRIO. No máximo 60 e-mails de aviso em 24 h, somando todas as cidades (o plano grátis do Resend manda 100 por
--       dia; sobram 40 para confirmar conta, criar senha e convites). Muda pelo ajuste aviso_teto_diario (abaixo). O resumo
--       mostra quanto ainda cabe hoje e em quantos dias o aviso termina.
--   A4. LOTE INTERROMPIDO. Quem foi reservado e não teve o envio confirmado (a Function caiu no meio) volta para a fila UMA
--       vez depois de 1 hora (aviso_devolvido), em vez de ser apagado. Quem teve o envio confirmado (aviso_enviado_em) nunca
--       volta.
--   A5. A marca de 24 h do N2 (e os limites por e-mail e WhatsApp da 20261024120004) usam um hash COM SAL secreto desta
--       instalação (vagas_interno.hash_privado), guardado na tabela de ajustes, que só o dono lê (anon, authenticated e
--       service_role não leem). As marcas antigas, sem sal, são apagadas.
--   A6. Rodar a 20261022 de novo depois da 20261024120002 tira o EXECUTE do anon em vagas_lista_espera_sair_link: rode a
--       20261024120002 (e as seguintes) em seguida.
--   versao_banco(): a lista da 20261024120002 + 20261024120003_vagas_aviso_reforco.
--
-- Ajustes (SQL Editor, como dono):
--   insert into vagas_interno.ajustes (chave, valor) values ('aviso_teto_diario', '60')
--     on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ajustes da operação (schema fechado) e o sal desta instalação
-- -----------------------------------------------------------------------------

-- Valores que não mudam pelo site: só o dono, pelo SQL Editor. Hoje: aviso_teto_diario (número), sal_privado (gerado aqui)
-- e, a partir da 20261024120004, lista_espera_captcha.
create table if not exists vagas_interno.ajustes (
  chave          text primary key check (chave ~ '^[a-z_]{1,40}$'),
  valor          text not null default '',
  atualizado_em  timestamptz not null default now()
);
revoke all on vagas_interno.ajustes from public;
do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on vagas_interno.ajustes from %I', papel); end if;
  end loop;
end $$;
-- Sal desta instalação (64 hexadecimais aleatórios; gerado uma vez, nunca sai do banco).
insert into vagas_interno.ajustes (chave, valor)
values ('sal_privado', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

-- Valor de um ajuste ('' sem ele). O sal nunca sai por aqui.
create or replace function vagas_interno.ajuste(p_chave text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select a.valor from vagas_interno.ajustes a where a.chave = p_chave and a.chave not like 'sal\_%'), '');
$$;

-- A5. Hash com o sal secreto desta instalação (para contato que só serve de marca: e-mail ou WhatsApp). Sem o sal, não dá
-- para testar uma lista de e-mails conhecidos contra as marcas.
create or replace function vagas_interno.hash_privado(p text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(coalesce((select a.valor from vagas_interno.ajustes a where a.chave = 'sal_privado'), '')
    || ':' || lower(btrim(coalesce(p, ''))), 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- A1.1 E-mail: só ASCII visível
-- -----------------------------------------------------------------------------

-- E-mail normalizado (minúsculas, sem espaço nas pontas) ou ''. Só caracteres ASCII visíveis (! a ~), uma arroba, um ponto
-- depois dela, até 254. Igual a emailVagas (Edge Function) e a VAGAS_REGRAS.normalizarEmail: o que o banco aceita, a
-- Function também aceita (senão a fila do aviso travava).
create or replace function vagas_interno.email(p text)
returns text language sql immutable set search_path = '' as $$
  select case when e ~ '^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$' and char_length(e) <= 254 then e else '' end
  from (select lower(btrim(coalesce(p, ''), E' \t\n\r\f')) as e) x;
$$;

-- Linhas da lista de espera que a validação nova recusaria (nunca poderiam ser avisadas por e-mail): saem.
delete from public.vagas_lista_espera where vagas_interno.email(email) = '';

-- -----------------------------------------------------------------------------
-- Colunas da fila do aviso
-- -----------------------------------------------------------------------------

-- Tentativas de envio que falharam (a fila anda por tentativas e depois pela ordem de entrada; 3 = desiste do e-mail;
-- 99 = e-mail recusado pela Function).
alter table public.vagas_lista_espera add column if not exists aviso_tentativas int not null default 0;
alter table public.vagas_lista_espera drop constraint if exists vagas_lista_espera_aviso_tentativas_check;
alter table public.vagas_lista_espera add constraint vagas_lista_espera_aviso_tentativas_check check (aviso_tentativas between 0 and 99);
-- O lote interrompido já voltou para a fila uma vez (não volta de novo).
alter table public.vagas_lista_espera add column if not exists aviso_devolvido boolean not null default false;
-- Envio CONFIRMADO pela Function (avisado_em continua sendo a reserva). Na primeira aplicação, quem já estava marcado conta
-- como enviado (era a regra da 20261024120002: no máximo uma vez).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vagas_lista_espera'
                  and column_name = 'aviso_enviado_em') then
    alter table public.vagas_lista_espera add column aviso_enviado_em timestamptz;
    update public.vagas_lista_espera set aviso_enviado_em = avisado_em where avisado_em is not null;
  end if;
end $$;
drop index if exists public.vagas_lista_espera_aviso_idx;
create index if not exists vagas_lista_espera_aviso_fila_idx on public.vagas_lista_espera (cidade_id, aviso_tentativas, criado_em)
  where avisado_em is null;

-- -----------------------------------------------------------------------------
-- Funções do aviso (iguais às da 20261024120002, com A1, A2 e A4)
-- -----------------------------------------------------------------------------

-- A2. Teto de e-mails de aviso em 24 h (todas as cidades). Ajuste aviso_teto_diario; sem ajuste (ou inválido): 60.
create or replace function vagas_interno.aviso_teto_diario()
returns int language sql stable security definer set search_path = '' as $$
  select least(greatest(coalesce(vagas_interno.inteiro(to_jsonb(vagas_interno.ajuste('aviso_teto_diario'))), 60), 0), 10000);
$$;

-- Teto e previsão: porDia, quantos já saíram nas últimas 24 h, quantos ainda cabem agora e em quantos dias termina
-- (hoje conta como dia só se ainda cabe algum; null quando o teto é 0).
create or replace function vagas_interno.aviso_teto_json(p_a_avisar int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('porDia', x.teto, 'usados24h', x.usados, 'disponivel', greatest(x.teto - x.usados, 0),
    'diasPrevistos', case when coalesce(p_a_avisar, 0) = 0 then 0
                          when x.teto = 0 then null
                          when p_a_avisar <= greatest(x.teto - x.usados, 0) then 1
                          else (case when x.teto > x.usados then 1 else 0 end)
                               + ceil((p_a_avisar - greatest(x.teto - x.usados, 0))::numeric / x.teto)::int end)
  from (select vagas_interno.aviso_teto_diario() as teto,
               vagas_interno.contagem('aviso_email', '', interval '24 hours') as usados) x;
$$;

-- Contagens do aviso de uma cidade (nunca um contato): na lista; a avisar por e-mail (na fila); com envio confirmado;
-- em envio (reservado sem confirmação); sem e-mail (3 falhas ou e-mail recusado); a avisar pelo WhatsApp.
create or replace function vagas_interno.aviso_contagens(p_cidade uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'naLista', count(*)::int,
    'aAvisarEmail', count(*) filter (where l.avisado_em is null and l.aviso_tentativas < 3)::int,
    'avisadosEmail', count(*) filter (where l.aviso_enviado_em is not null)::int,
    'emEnvio', count(*) filter (where l.avisado_em is not null and l.aviso_enviado_em is null and l.aviso_tentativas < 3)::int,
    'semEmail', count(*) filter (where l.aviso_enviado_em is null and l.aviso_tentativas >= 3)::int,
    'aAvisarWhatsapp', count(*) filter (where l.whatsapp <> '' and l.whatsapp_avisado_em is null)::int)
  from public.vagas_lista_espera l where l.cidade_id = p_cidade;
$$;

-- Retenção (cidades ATIVAS; p_cidade null = todas): A4 — reservado há mais de 1 h sem envio confirmado volta para a fila
-- UMA vez (no fim dela); depois apaga quem teve o envio confirmado e já não espera o WhatsApp, e TODA a lista 30 dias
-- depois da abertura. Devolve quantas linhas saíram.
create or replace function vagas_interno.lista_espera_limpar(p_cidade uuid default null)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  update public.vagas_lista_espera l set avisado_em = null, aviso_devolvido = true, aviso_tentativas = least(l.aviso_tentativas + 1, 3)
    from public.vagas_cidades c
   where c.id = l.cidade_id and c.status = 'ativa' and (p_cidade is null or c.id = p_cidade)
     and l.avisado_em < now() - interval '1 hour' and l.aviso_enviado_em is null and l.aviso_tentativas < 3 and not l.aviso_devolvido;
  delete from public.vagas_lista_espera l using public.vagas_cidades c
   where c.id = l.cidade_id and c.status = 'ativa' and (p_cidade is null or c.id = p_cidade)
     and ((l.aviso_enviado_em is not null and (l.whatsapp = '' or l.whatsapp_avisado_em is not null))
          or (c.aberta_em is not null and c.aberta_em <= now() - interval '30 days'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Ação avisar_lista_espera: só a equipe (public.admins), cidade ATIVA. Reserva até p_limite (1 a 50, e no máximo o que
-- ainda cabe no teto de 24 h) contatos da fila — primeiro quem tem menos tentativas, depois os mais antigos —, marca
-- avisado_em (a reserva: no máximo uma vez) e devolve e-mail, perfil e o token de saída SÓ para a Function.
create or replace function public.vagas_conta_aviso_lote(p_user uuid, p_cidade text, p_limite integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_lim int := least(greatest(coalesce(p_limite, 25), 1), 50);
  v_lote jsonb;
  v_n int;
  q record;
  v_token text;
  v_saida jsonb := '[]'::jsonb;
  v_ct jsonb;
begin
  -- Só a Edge Function (service_role). Uma nova aplicação da 20261022 daria EXECUTE a authenticated pelo laço dela.
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  if p_user is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if not exists (select 1 from public.admins a where a.user_id = p_user) then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status <> 'ativa' then
    return vagas_interno.erro('A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.');
  end if;
  perform vagas_interno.lista_espera_limpar(c.id);
  -- A2: o lote cabe no teto de 24 h (todas as cidades).
  v_lim := least(v_lim, (vagas_interno.aviso_teto_json(0) ->> 'disponivel')::int);
  with escolhidos as (
    select l.id from public.vagas_lista_espera l
     where l.cidade_id = c.id and l.avisado_em is null and l.aviso_tentativas < 3
     order by l.aviso_tentativas, l.criado_em, l.id
     limit v_lim
     for update skip locked
  ), reservados as (
    update public.vagas_lista_espera l set avisado_em = now()
      from escolhidos e where l.id = e.id
    returning l.id, l.email, l.perfil, l.aviso_tentativas, l.criado_em
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'perfil', r.perfil)
                            order by r.aviso_tentativas, r.criado_em, r.id), '[]'::jsonb),
         count(*)::int
    into v_lote, v_n
    from reservados r;
  -- Um token de saída por pessoa do lote (64 hex; no banco, só o hash).
  for q in select x ->> 'id' as id, x ->> 'email' as email, x ->> 'perfil' as perfil from jsonb_array_elements(v_lote) x loop
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update public.vagas_lista_espera set sair_token_hash = vagas_interno.token_hash(v_token) where id = q.id::uuid;
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('id', q.id, 'email', q.email, 'perfil', q.perfil, 'sairToken', v_token));
  end loop;
  if v_n > 0 then
    -- Cada e-mail reservado conta no teto de 24 h.
    insert into public.vagas_limites (tipo, chave) select 'aviso_email', '' from generate_series(1, v_n);
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
    values (c.id, p_user, 'admin', 'aviso_email_lote', 'cidade', c.id, '', jsonb_build_object('reservados', v_n));
  end if;
  v_ct := vagas_interno.aviso_contagens(c.id);
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome), 'lote', v_saida,
    'contagens', v_ct, 'teto', vagas_interno.aviso_teto_json((v_ct ->> 'aAvisarEmail')::int)));
end;
$$;

-- Depois do envio (só a Function): p_enviados teve o envio confirmado (aviso_enviado_em; sai da lista se não espera o
-- WhatsApp); p_falhas (falha passageira) volta para o FIM da fila, até a 3ª; p_invalidos (e-mail que a Function recusa)
-- não volta: sem WhatsApp a avisar a linha sai, com WhatsApp fica só para ele. Só linhas da cidade, reservadas e sem envio
-- confirmado (rodar de novo não conta duas vezes). Devolve contagens.
create or replace function public.vagas_conta_aviso_marcar(p_user uuid, p_cidade text, p_enviados uuid[], p_falhas uuid[], p_invalidos uuid[])
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_ok int;
  v_falhas int;
  v_inv int;
  n int;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  if p_user is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if not exists (select 1 from public.admins a where a.user_id = p_user) then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  update public.vagas_lista_espera set avisado_em = null, aviso_tentativas = least(aviso_tentativas + 1, 3)
   where cidade_id = c.id and avisado_em is not null and aviso_enviado_em is null and aviso_tentativas < 3
     and id = any (coalesce(p_falhas, array[]::uuid[]));
  get diagnostics v_falhas = row_count;
  delete from public.vagas_lista_espera
   where cidade_id = c.id and avisado_em is not null and aviso_enviado_em is null and id = any (coalesce(p_invalidos, array[]::uuid[]))
     and (whatsapp = '' or whatsapp_avisado_em is not null);
  get diagnostics v_inv = row_count;
  update public.vagas_lista_espera set aviso_tentativas = 99
   where cidade_id = c.id and avisado_em is not null and aviso_enviado_em is null and aviso_tentativas < 99
     and id = any (coalesce(p_invalidos, array[]::uuid[]));
  get diagnostics n = row_count;
  v_inv := v_inv + n;
  update public.vagas_lista_espera set aviso_enviado_em = now()
   where cidade_id = c.id and avisado_em is not null and aviso_enviado_em is null and aviso_tentativas < 99
     and id = any (coalesce(p_enviados, array[]::uuid[]));
  get diagnostics v_ok = row_count;
  delete from public.vagas_lista_espera
   where cidade_id = c.id and aviso_enviado_em is not null and id = any (coalesce(p_enviados, array[]::uuid[]))
     and (whatsapp = '' or whatsapp_avisado_em is not null);
  if v_ok + v_falhas + v_inv > 0 then
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
    values (c.id, p_user, 'admin', 'aviso_email', 'cidade', c.id, '',
      jsonb_build_object('enviados', v_ok, 'falhas', v_falhas, 'invalidos', v_inv));
  end if;
  return vagas_interno.ok(jsonb_build_object('enviados', v_ok, 'falhas', v_falhas, 'invalidos', v_inv,
    'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- A versão de 4 parâmetros (a Function publicada com a 20261024120002) continua funcionando até a Function nova subir.
create or replace function public.vagas_conta_aviso_marcar(p_user uuid, p_cidade text, p_enviados uuid[], p_falhas uuid[])
returns json language sql volatile security definer set search_path = '' as $$
  select public.vagas_conta_aviso_marcar(p_user, p_cidade, p_enviados, p_falhas, array[]::uuid[]);
$$;

-- Situação do aviso de uma cidade, só números: status, abertura, até quando a lista fica (30 dias), contagens e o teto
-- (A2: quanto ainda cabe hoje e em quantos dias o e-mail termina) — para conferir ANTES de disparar.
create or replace function public.vagas_adm_aviso_resumo(p_cidade text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_ct jsonb;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  v_ct := vagas_interno.aviso_contagens(c.id);
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome, 'status', c.status,
      'abertaEm', disc_interno.iso(c.aberta_em),
      'listaAte', case when c.status = 'ativa' and c.aberta_em is not null then disc_interno.iso(c.aberta_em + interval '30 days') else '' end),
    'contagens', v_ct, 'teto', vagas_interno.aviso_teto_json((v_ct ->> 'aAvisarEmail')::int)));
end;
$$;

-- -----------------------------------------------------------------------------
-- A5. Marca de 24 h do N2 com o sal desta instalação
-- -----------------------------------------------------------------------------

-- Chave da marca: <cidade>:h:<hash com sal do e-mail>. As marcas antigas (sem sal, sem o ":h:") saem.
create or replace function vagas_interno.lista_espera_saiu(p_cidade uuid, p_email text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_cidade is null or coalesce(p_email, '') = '' then return; end if;
  perform vagas_interno.contar('lista_saiu', p_cidade::text || ':h:' || vagas_interno.hash_privado(p_email), interval '24 hours');
end;
$$;

create or replace function vagas_interno.lista_espera_saiu_recente(p_cidade uuid, p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select vagas_interno.contagem('lista_saiu', p_cidade::text || ':h:' || vagas_interno.hash_privado(p_email), interval '24 hours') > 0;
$$;

delete from public.vagas_limites where tipo = 'lista_saiu' and position(':h:' in chave) = 0;

-- -----------------------------------------------------------------------------
-- Permissões do que é novo (e do que foi recriado)
-- -----------------------------------------------------------------------------

do $$
declare
  papel text;
  f text;
  autenticadas text[] := array['public.vagas_adm_aviso_resumo(text)'];
  servico text[] := array['public.vagas_conta_aviso_lote(uuid, text, integer)', 'public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[])',
    'public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[], uuid[])'];
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on all functions in schema vagas_interno from %I', papel);
    end if;
  end loop;
  execute 'revoke all on all functions in schema vagas_interno from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on all functions in schema vagas_interno to service_role';
  end if;
  foreach f in array autenticadas || servico loop
    execute format('revoke all on function %s from public', f);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach f in array autenticadas loop execute format('grant execute on function %s to authenticated', f); end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco(): a lista da 20261024120002 + esta
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
                                            and to_regprocedure('public.gerar_relatorio_tecnico(uuid, text, text)') is not null),
      (15, '20261020120000_codigos_processo', to_regprocedure('disc_interno.gerar_codigo_processo()') is not null
                                              and to_regprocedure('disc_interno.codigo_link_bloqueado(text[])') is not null
                                              and exists (select 1 from pg_catalog.pg_constraint c
                                                           where c.conrelid = to_regclass('public.processos')
                                                             and c.conname = 'processos_codigo_formato')),
      (16, '20261021120000_feedback360', to_regclass('public.f360_respostas') is not null
                                         and to_regclass('public.f360_vinculos') is not null
                                         and to_regprocedure('public.f360_enviar(text, jsonb)') is not null),
      (17, '20261022120000_vagas', to_regclass('public.vagas_anuncios') is not null
                                   and to_regprocedure('public.vagas_anuncios_publicos(jsonb)') is not null),
      (18, '20261023120000_vagas_testes', to_regclass('public.vagas_tentativas') is not null
                                          and to_regprocedure('public.vagas_finalizar(uuid)') is not null),
      (19, '20261023120001_vagas_questoes', exists (select 1 from public.vagas_questoes q where q.ativa)),
      (20, '20261024120000_vagas_onda2', to_regclass('public.vagas_equipe_convites') is not null
                                         and to_regprocedure('public.vagas_op_indicadores(text)') is not null
                                         and exists (select 1 from pg_catalog.pg_attribute a
                                                      where a.attrelid = to_regclass('public.vagas_lista_espera')
                                                        and a.attname = 'whatsapp' and not a.attisdropped)),
      (21, '20261024120001_vagas_piloto_uruacu', exists (select 1 from public.vagas_cidades c where c.slug = 'uruacu-go')),
      (22, '20261024120002_vagas_aviso_abertura', exists (select 1 from pg_catalog.pg_attribute a
                                                    where a.attrelid = to_regclass('public.vagas_cidades')
                                                      and a.attname = 'aberta_em' and not a.attisdropped)
                                         and to_regprocedure('public.vagas_conta_aviso_lote(uuid, text, integer)') is not null),
      (23, '20261024120003_vagas_aviso_reforco', exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.vagas_lista_espera')
                                                    and a.attname = 'aviso_tentativas' and not a.attisdropped)
                                       and to_regprocedure('public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[], uuid[])') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261024120003, 'migracoes', to_jsonb(aplicadas),
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

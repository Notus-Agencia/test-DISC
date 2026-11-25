-- Vagas sem Caos v2: entrada por código de 6 dígitos (sem senha). ADITIVA e idempotente: só cria; nada é apagado nem trocado.
--
-- O que guarda: o HASH do código (HMAC calculado pela Edge Function vagas-conta, com sal por linha); o código em si nunca chega
-- ao banco. Vale 10 minutos, no máximo 5 tentativas, um pedido novo só depois de 30 s, e o pedido novo invalida o anterior.
-- A tabela fica em vagas_interno (fora da API), com RLS ligada e sem política: só a service_role (Edge Function) mexe.
--
-- Funções (public, SÓ a service_role executa; anon e authenticated não):
--   vagas_conta_codigo_novo(canal, destino, sal, hash, cf, xff)   limites + 30 s + grava o código novo
--   vagas_conta_codigo_tentar(destino, cf, xff)                   gasta UMA tentativa (atômico) e devolve sal e hash para conferir
--   vagas_conta_codigo_usar(id)                                   marca como usado (uma vez só)
--   vagas_conta_codigo_cancelar(id)                               apaga um código que não saiu (e-mail falhou)
--   vagas_conta_limite_v2(acao, cf, xff, chave, ator)             limites de cnpj, empresa_criar, arquivo_link e documento_link
-- Reaproveita vagas_interno.contar / origens_de / erro / ok (20261022120000_vagas.sql).

create schema if not exists vagas_interno;

create table if not exists vagas_interno.codigos_entrada (
  id         uuid primary key default gen_random_uuid(),
  canal      text not null check (canal in ('email', 'whatsapp')),
  destino    text not null check (char_length(destino) between 3 and 254),   -- e-mail em minúsculas ou WhatsApp só com dígitos
  sal        text not null check (sal ~ '^[0-9a-f]{32}$'),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  tentativas int not null default 0 check (tentativas >= 0),
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null,
  usado_em   timestamptz
);
create index if not exists codigos_entrada_destino_idx on vagas_interno.codigos_entrada (destino, criado_em desc);
create index if not exists codigos_entrada_criado_idx on vagas_interno.codigos_entrada (criado_em);

alter table vagas_interno.codigos_entrada enable row level security;

do $$
declare
  papel text;
begin
  execute 'revoke all on vagas_interno.codigos_entrada from public';
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on vagas_interno.codigos_entrada from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on vagas_interno.codigos_entrada to service_role';
  end if;
end $$;

-- Segunda trava: mesmo que alguém dê execute a anon/authenticated por engano numa migração futura, a função recusa quem chega
-- pela API com esses papéis (a Edge Function chama com a chave de serviço).
create or replace function vagas_interno.exige_servico()
returns void language plpgsql stable set search_path = '' as $$
declare
  v_papel text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                           nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''), '');
begin
  if v_papel in ('anon', 'authenticated') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
end;
$$;

-- Pedido de código: limites, espera de 30 s e o código novo (o anterior deste destino deixa de valer).
create or replace function public.vagas_conta_codigo_novo(p_canal text, p_destino text, p_sal text, p_hash text, p_cf text, p_xff text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  v_dest text := lower(btrim(coalesce(p_destino, '')));
  v_ult timestamptz;
  v_seg int;
  v_id uuid;
  o text;
begin
  perform vagas_interno.exige_servico();
  if p_canal is null or p_canal not in ('email', 'whatsapp') then return vagas_interno.erro('Canal inválido.'); end if;
  if char_length(v_dest) < 3 or char_length(v_dest) > 254 then return vagas_interno.erro('Destino inválido.'); end if;
  if p_sal is null or p_sal !~ '^[0-9a-f]{32}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return vagas_interno.erro('Dados inválidos.');
  end if;
  if vagas_interno.contar('codigo_total', '', interval '1 hour') > 600 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  select max(c.criado_em) into v_ult from vagas_interno.codigos_entrada c where c.destino = v_dest;
  if v_ult is not null and v_ult > now() - interval '30 seconds' then
    v_seg := greatest(ceil(extract(epoch from (v_ult + interval '30 seconds' - now())))::int, 1);
    return vagas_interno.erro('Espere alguns segundos para pedir outro código.',
      jsonb_build_object('codigo', 'aguarde', 'reenviarEmSeg', v_seg, 'aguardar', true));
  end if;
  foreach o in array vagas_interno.origens_de(p_cf, p_xff) loop
    if vagas_interno.contar('codigo_pedir', o, interval '1 hour') > 20 then
      return vagas_interno.erro(msg, '{"bloqueado": true}');
    end if;
  end loop;
  if vagas_interno.contar('codigo_destino', md5(v_dest), interval '1 hour') > 5 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  delete from vagas_interno.codigos_entrada c where c.criado_em < now() - interval '1 day';
  update vagas_interno.codigos_entrada c set usado_em = now() where c.destino = v_dest and c.usado_em is null;
  insert into vagas_interno.codigos_entrada (canal, destino, sal, hash, expira_em)
    values (p_canal, v_dest, p_sal, p_hash, now() + interval '10 minutes') returning id into v_id;
  return vagas_interno.ok(jsonb_build_object('id', v_id, 'reenviarEmSeg', 30, 'expiraEmSeg', 600));
end;
$$;

-- Uma tentativa de conferência. A tentativa é gasta ANTES de comparar (atômico: pedidos em paralelo não passam de 5).
-- Devolve sal e hash só para a Edge Function comparar; nunca volta para o navegador.
create or replace function public.vagas_conta_codigo_tentar(p_destino text, p_cf text, p_xff text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  v_dest text := lower(btrim(coalesce(p_destino, '')));
  v_id uuid;
  v_sal text;
  v_hash text;
  v_tent int;
  v_exp timestamptz;
  o text;
begin
  perform vagas_interno.exige_servico();
  if char_length(v_dest) < 3 or char_length(v_dest) > 254 then return vagas_interno.erro('Destino inválido.'); end if;
  foreach o in array vagas_interno.origens_de(p_cf, p_xff) loop
    if vagas_interno.contar('codigo_conferir', o, interval '1 hour') > 60 then
      return vagas_interno.erro(msg, '{"bloqueado": true}');
    end if;
  end loop;
  update vagas_interno.codigos_entrada c set tentativas = c.tentativas + 1
   where c.id = (select x.id from vagas_interno.codigos_entrada x where x.destino = v_dest and x.usado_em is null
                  order by x.criado_em desc limit 1)
     and c.expira_em > now() and c.tentativas < 5
  returning c.id, c.sal, c.hash, c.tentativas into v_id, v_sal, v_hash, v_tent;
  if v_id is null then
    select x.tentativas, x.expira_em into v_tent, v_exp from vagas_interno.codigos_entrada x
     where x.destino = v_dest and x.usado_em is null order by x.criado_em desc limit 1;
    if not found or v_exp <= now() then
      return vagas_interno.erro('Este código venceu ou já foi usado. Peça um novo código.', '{"codigo": "codigo_vencido"}');
    end if;
    return vagas_interno.erro('Você errou o código vezes demais. Peça um novo código.', '{"codigo": "tentativas"}');
  end if;
  return vagas_interno.ok(jsonb_build_object('id', v_id, 'sal', v_sal, 'hash', v_hash, 'restantes', 5 - v_tent));
end;
$$;

-- Código conferido: vale uma vez só (a segunda chamada, mesmo em paralelo, recebe erro) e os outros deste destino caem.
create or replace function public.vagas_conta_codigo_usar(p_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_dest text;
begin
  perform vagas_interno.exige_servico();
  update vagas_interno.codigos_entrada c set usado_em = now()
   where c.id = p_id and c.usado_em is null and c.expira_em > now()
  returning c.destino into v_dest;
  if v_dest is null then
    return vagas_interno.erro('Este código venceu ou já foi usado. Peça um novo código.', '{"codigo": "codigo_vencido"}');
  end if;
  update vagas_interno.codigos_entrada c set usado_em = now() where c.destino = v_dest and c.usado_em is null;
  return vagas_interno.ok();
end;
$$;

-- E-mail que não saiu: o código some (e a espera de 30 s não prende quem vai tentar de novo).
create or replace function public.vagas_conta_codigo_cancelar(p_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  perform vagas_interno.exige_servico();
  delete from vagas_interno.codigos_entrada c where c.id = p_id and c.usado_em is null;
  return vagas_interno.ok();
end;
$$;

-- Limites das outras ações novas da Function. cnpj: por origem; empresa_criar: por origem e por conta; links de arquivo: por conta.
create or replace function public.vagas_conta_limite_v2(p_acao text, p_cf text, p_xff text, p_chave text, p_ator uuid default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  o text;
  v_max int;
begin
  perform vagas_interno.exige_servico();
  if p_acao is null or p_acao not in ('cnpj', 'empresa_criar', 'arquivo_link', 'documento_link') then
    return vagas_interno.erro('Ação desconhecida.');
  end if;
  if vagas_interno.contar('novo_total_' || p_acao, '', interval '1 hour') > 3000 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  if p_acao in ('cnpj', 'empresa_criar') then
    v_max := case p_acao when 'cnpj' then 60 else 20 end;
    foreach o in array vagas_interno.origens_de(p_cf, p_xff) loop
      if vagas_interno.contar('novo_' || p_acao, o, interval '1 hour') > v_max then
        return vagas_interno.erro(msg, '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  if p_ator is not null then
    v_max := case p_acao when 'empresa_criar' then 10 when 'documento_link' then 60 when 'arquivo_link' then 200 else 60 end;
    if vagas_interno.contar('novo_ator_' || p_acao, p_ator::text, interval '1 hour') > v_max then
      return vagas_interno.erro(msg, '{"bloqueado": true}');
    end if;
  end if;
  return vagas_interno.ok();
end;
$$;

-- Permissões: só a service_role executa (os padrões do Supabase dariam execute a anon e authenticated em funções novas de public).
do $$
declare
  papel text;
  f text;
  lista text[] := array[
    'public.vagas_conta_codigo_novo(text, text, text, text, text, text)',
    'public.vagas_conta_codigo_tentar(text, text, text)',
    'public.vagas_conta_codigo_usar(uuid)',
    'public.vagas_conta_codigo_cancelar(uuid)',
    'public.vagas_conta_limite_v2(text, text, text, text, uuid)'];
begin
  foreach f in array lista loop
    execute format('revoke all on function %s from public', f);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  execute 'revoke all on function vagas_interno.exige_servico() from public';
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function vagas_interno.exige_servico() from %I', papel); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function vagas_interno.exige_servico() to service_role'; end if;
end $$;

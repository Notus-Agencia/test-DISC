-- =============================================================================
-- Teste DISC — histórico de envios por e-mail (o painel mostra "Enviado para … em dd/mm às hh:mm por Nome").
-- Roda DEPOIS de 20261005120000_disc.sql … 20261015120000_minimo_cobranca.sql (12ª migração).
-- Idempotente e seguro sobre dados reais: só cria a tabela, os gatilhos de limpeza e recria versao_banco;
-- nada é apagado. É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
--   * public.envios_email: um registro por TENTATIVA de envio pelo provedor de e-mail (Resend), com o mínimo:
--       tipo            'relatorio' (link de um relatório publicado, ação relatorio.enviarEmail da função "admin")
--                       | 'pedido' (link do relatório comprado, "Enviar para meu e-mail" da função "pagamento")
--       referencia      token do relatório (relatorios.token) ou id do pedido (pedidos.id, texto)
--       destinatario    o e-mail para onde foi
--       enviado_por     nome de quem enviou (como estava no painel na hora) ou 'cliente'
--       enviado_por_id  auth.users.id do administrador (nulo quando foi o cliente)
--       em              quando
--       resultado       'ok' | 'erro'
--       provedor_id     id do e-mail no provedor (Resend), para achar lá; nulo se não houver
--     Nada do conteúdo do e-mail (assunto, mensagem, nome do destinatário) é guardado.
--   * RLS: só administradores LEEM (painel). Ninguém grava pelo PostgREST: só as Edge Functions (service_role).
--   * Apagou o relatório ou o pedido: o histórico dele vai junto (gatilhos), para não sobrar e-mail solto.
--   * versao_banco() passa a conhecer esta migração (versão 20261016120000).
-- =============================================================================

create table if not exists public.envios_email (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,
  referencia      text not null,
  destinatario    text not null,
  enviado_por     text not null,
  enviado_por_id  uuid,
  em              timestamptz not null default now(),
  resultado       text not null,
  provedor_id     text,
  constraint envios_email_tipo_valido check (tipo in ('relatorio', 'pedido')),
  constraint envios_email_referencia_valida check (referencia ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint envios_email_destinatario_valido check (char_length(destinatario) between 3 and 254
                                                     and destinatario ~ '^[^\s@]+@[^\s@]+$'),
  constraint envios_email_quem_valido check (char_length(enviado_por) between 1 and 120
                                             and (enviado_por_id is not null or enviado_por = 'cliente')),
  constraint envios_email_resultado_valido check (resultado in ('ok', 'erro')),
  constraint envios_email_provedor_id_valido check (provedor_id is null or provedor_id ~ '^[A-Za-z0-9_.:-]{1,200}$')
);
create index if not exists envios_email_referencia_idx on public.envios_email (tipo, referencia, em desc);

-- -----------------------------------------------------------------------------
-- Limpeza: o histórico acompanha o relatório / o pedido
-- -----------------------------------------------------------------------------

create or replace function disc_interno.envios_email_apagar_relatorio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.envios_email e where e.tipo = 'relatorio' and e.referencia = old.token;
  return old;
end;
$$;

create or replace function disc_interno.envios_email_apagar_pedido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.envios_email e where e.tipo = 'pedido' and e.referencia = old.id::text;
  return old;
end;
$$;

drop trigger if exists envios_email_apagar on public.relatorios;
create trigger envios_email_apagar after delete on public.relatorios
  for each row execute function disc_interno.envios_email_apagar_relatorio();

drop trigger if exists envios_email_apagar on public.pedidos;
create trigger envios_email_apagar after delete on public.pedidos
  for each row execute function disc_interno.envios_email_apagar_pedido();

-- -----------------------------------------------------------------------------
-- RLS e permissões: administradores só leem; a service_role (Edge Functions) grava
-- -----------------------------------------------------------------------------

alter table public.envios_email enable row level security;

drop policy if exists envios_email_admin_le on public.envios_email;
create policy envios_email_admin_le on public.envios_email for select to authenticated
  using (public.e_admin());

revoke all on public.envios_email from public;
revoke all on function disc_interno.envios_email_apagar_relatorio(), disc_interno.envios_email_apagar_pedido() from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.envios_email from %I', papel);
      execute format('revoke all on function disc_interno.envios_email_apagar_relatorio(), '
        || 'disc_interno.envios_email_apagar_pedido() from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.envios_email to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, delete on public.envios_email to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261016120000_envios_email
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
      (11, '20261016120000_envios_email', to_regclass('public.envios_email') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261016120000, 'migracoes', to_jsonb(aplicadas),
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

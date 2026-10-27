-- Chave de acesso (digital ou rosto) do painel DISC (pedido do dono, 27/10/2026). Guarda só a chave PÚBLICA do aparelho.
-- Tabelas fechadas (RLS sem política): só a Edge Function chave-acesso, com a chave de serviço, lê e grava.
create table if not exists public.admin_chaves (
  id            bigserial primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  credencial_id text not null unique,
  chave_publica bytea not null,
  contador      bigint not null default 0,
  transportes   text[] not null default '{}',
  apelido       text not null,
  criado_em     timestamptz not null default now(),
  usado_em      timestamptz
);
create index if not exists admin_chaves_dono on public.admin_chaves (user_id);

-- desafio de uso único, vale 5 minutos
create table if not exists public.admin_chave_desafios (
  desafio   text primary key,
  tipo      text not null check (tipo in ('criar', 'entrar')),
  user_id   uuid,                      -- ao criar: de quem; ao entrar: vazio (a chave diz quem é)
  expira_em timestamptz not null
);

alter table public.admin_chaves enable row level security;
alter table public.admin_chave_desafios enable row level security;
revoke all on public.admin_chaves, public.admin_chave_desafios from anon, authenticated;
revoke all on sequence public.admin_chaves_id_seq from anon, authenticated;

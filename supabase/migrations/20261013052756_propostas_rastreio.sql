-- Cópia da migração aplicada direto no banco em 13/10/2026 05:27 (rastreio dos sites de proposta da Gestão Sem Caos,
-- outro projeto que usa este mesmo Supabase). Ela fica aqui só para o histórico do repositório bater com o do banco:
-- sem este arquivo, a integração GitHub → Supabase recusa aplicar as migrações seguintes ("migrations failed").
-- Já está aplicada; não é do Mapa DISC e versao_banco() não a confere.
-- Rastreio das propostas comerciais (sites de proposta da Gestão Sem Caos)
create table public.proposta_eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  proposta text not null check (char_length(proposta) <= 60),
  visitante text check (char_length(visitante) <= 40),
  visita text check (char_length(visita) <= 40),
  origem text check (char_length(origem) <= 60),
  tipo text not null check (tipo in ('abriu', 'slide', 'clique', 'saiu')),
  slide smallint check (slide between 0 and 200),
  titulo text check (char_length(titulo) <= 160),
  segundos integer check (segundos between 0 and 86400),
  detalhe jsonb check (pg_column_size(detalhe) <= 2000)
);
create index proposta_eventos_proposta_data on public.proposta_eventos (proposta, criado_em desc);
alter table public.proposta_eventos enable row level security;
create policy "site grava eventos da proposta" on public.proposta_eventos
  for insert to anon
  with check (proposta in ('funil-automatico'));

-- Chave do painel de cada proposta: sem política nenhuma, então a API não lê esta tabela
create table public.proposta_chaves (
  proposta text primary key,
  chave text not null
);
alter table public.proposta_chaves enable row level security;
insert into public.proposta_chaves (proposta, chave)
values ('funil-automatico', encode(extensions.gen_random_bytes(18), 'hex'));

-- Leitura para o painel: só devolve eventos com a chave certa
create or replace function public.proposta_relatorio(p_proposta text, p_chave text)
returns setof public.proposta_eventos
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.proposta_eventos e
  where e.proposta = p_proposta
    and exists (
      select 1 from public.proposta_chaves k
      where k.proposta = p_proposta and k.chave = p_chave
    )
  order by e.criado_em desc
  limit 5000;
$$;
revoke all on function public.proposta_relatorio(text, text) from public;
grant execute on function public.proposta_relatorio(text, text) to anon, authenticated;

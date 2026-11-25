-- =============================================================================
-- Vagas sem Caos v2 — BANCO, parte 1/4: esquema, filtro de texto contextual, estados da empresa, buckets e as 3 travas.
--
-- ORDEM PARA PUBLICAR (todas aditivas e idempotentes; cada uma recria versao_banco()):
--   ... 20261024120005_vagas_fase_c, 20261027120000_chave_acesso (outra frente),
--   20261101120000_vagas_v2_base            (esta: colunas, tabelas, buckets, filtro de texto, estados, sem as 3 travas)
--   20261101120001_vagas_v2_pessoa          (RPCs públicas e da pessoa: base, vaga, textoChecar, eu, candidatar, conversa...)
--   20261101120002_vagas_v2_empresa         (RPCs da empresa, verificação e as funções SÓ de servidor)
--   20261101120003_vagas_v2_equipe          (RPCs da equipe da cidade, migração de dados opcional, versao_banco final)
--   20261102120000_*                        (códigos de entrada: é do dono do SERVIDOR)
-- Contrato das respostas: vagas/js/v2/contrato.js (testado com validar() em tests/supabase/vagas_v2*.test.js).
--
-- FUNÇÕES SÓ DE SERVIDOR (EXECUTE só para service_role; a Edge Function vagas-conta as chama com a chave de serviço):
--   vagas_v2_conta_garantir_servidor(p_uid uuid, p_dados jsonb)   {tipo:'pessoa'|'empresa', termosVersao}      -> {ok, userId, tipo, novaConta}
--   vagas_v2_empresa_criar_servidor(p_uid uuid, p_dados jsonb)    campos de empresaCriar + consulta:{situacao,
--                                                                 razaoSocial, nomeFantasia, cidade, uf, abertura, mei} -> {ok, empresa}
--   vagas_v2_arquivo_link_servidor(p_uid uuid, p_candidatura uuid)                                              -> {ok, caminho, nome, bucket}
--   vagas_v2_documento_link_servidor(p_uid uuid, p_documento uuid)                                              -> {ok, caminho, nome, bucket}
--   (as duas últimas conferem a permissão pela regra 1A e registram o acesso; a função de servidor assina o link de 5 min.)
--
-- Nada é apagado: o que "saiu do caminho" (testes, selos, referências, banco de talentos, lista de espera) continua nas tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas e tabelas novas
-- -----------------------------------------------------------------------------

alter table public.vagas_areas add column if not exists curto text;
alter table public.vagas_areas add column if not exists icone text;

alter table public.vagas_empresas add column if not exists verificacao_estado text;
alter table public.vagas_empresas add column if not exists verificacao_prazo_em timestamptz;
alter table public.vagas_empresas add column if not exists verificacao_motivo text not null default '';
alter table public.vagas_empresas add column if not exists verificacao_pedida_em timestamptz;
alter table public.vagas_empresas add column if not exists verificacao_reenviada_em timestamptz;
alter table public.vagas_empresas add column if not exists consulta_cnpj jsonb;
alter table public.vagas_empresas add column if not exists responsavel text not null default '';
alter table public.vagas_empresas add column if not exists bairro text not null default '';
alter table public.vagas_empresas add column if not exists lojas jsonb not null default '[]'::jsonb;

alter table public.vagas_anuncios add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.vagas_anuncios add column if not exists segurada boolean not null default false;
alter table public.vagas_anuncios add column if not exists sinais jsonb not null default '[]'::jsonb;
alter table public.vagas_anuncios add column if not exists revisar_depois_em timestamptz;
alter table public.vagas_anuncios add column if not exists revisada_em timestamptz;
alter table public.vagas_anuncios add column if not exists id_local text;
alter table public.vagas_anuncios add column if not exists editada_em timestamptz;

alter table public.vagas_pessoas add column if not exists funcao text;
alter table public.vagas_pessoas add column if not exists bairro text;
alter table public.vagas_pessoas add column if not exists experiencias_v2 jsonb;
alter table public.vagas_pessoas add column if not exists tempo text;

alter table public.vagas_candidaturas add column if not exists etapa text;
alter table public.vagas_candidaturas add column if not exists etapa_anterior text;
alter table public.vagas_candidaturas add column if not exists forma text;
alter table public.vagas_candidaturas add column if not exists respostas jsonb not null default '[]'::jsonb;
alter table public.vagas_candidaturas add column if not exists mensagem text;
alter table public.vagas_candidaturas add column if not exists id_local text;
alter table public.vagas_candidaturas add column if not exists visto_em timestamptz;
alter table public.vagas_candidaturas add column if not exists conversa_em timestamptz;
alter table public.vagas_candidaturas add column if not exists marcada_em timestamptz;
alter table public.vagas_candidaturas add column if not exists fim_em timestamptz;
alter table public.vagas_candidaturas add column if not exists encerrada_por text;
alter table public.vagas_candidaturas add column if not exists entrevista jsonb;
alter table public.vagas_candidaturas add column if not exists whatsapp_liberado_em timestamptz;
alter table public.vagas_candidaturas add column if not exists v2 boolean not null default false;

alter table public.vagas_mensagens add column if not exists mid text;
alter table public.vagas_acessos_contato add column if not exists tipo_acesso text not null default 'contato';

-- A pessoa mínima (nome + WhatsApp + e-mail + cidade) passa a existir: o que antes era obrigatório vira opcional.
alter table public.vagas_pessoas alter column maior_18 set default true;
alter table public.vagas_pessoas alter column escolaridade drop not null;

create table if not exists public.vagas_curriculos (
  user_id     uuid primary key references public.vagas_contas (user_id) on delete cascade,
  caminho     text not null check (char_length(caminho) between 3 and 300),
  nome        text not null check (char_length(nome) between 1 and 200),
  tamanho_kb  integer not null check (tamanho_kb >= 0 and tamanho_kb <= 10240),
  tipo        text not null check (char_length(tipo) between 3 and 120),
  enviado_em  timestamptz not null default now()
);

create table if not exists public.vagas_salvas (
  user_id    uuid not null references public.vagas_contas (user_id) on delete cascade,
  anuncio_id uuid not null references public.vagas_anuncios (id) on delete cascade,
  em         timestamptz not null default now(),
  primary key (user_id, anuncio_id)
);

create table if not exists public.vagas_escondidas (
  user_id    uuid not null references public.vagas_contas (user_id) on delete cascade,
  anuncio_id uuid not null references public.vagas_anuncios (id) on delete cascade,
  em         timestamptz not null default now(),
  primary key (user_id, anuncio_id)
);

create table if not exists public.vagas_alertas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.vagas_contas (user_id) on delete cascade,
  funcao     text not null default '' check (char_length(funcao) <= 80),
  setor_id   text not null default '' check (char_length(setor_id) <= 60),
  cidade     text not null default '' check (char_length(cidade) <= 60),
  filtros    jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object' and char_length(filtros::text) <= 2000),
  canal      text not null default 'email' check (canal in ('email', 'whatsapp')),
  origem     text not null default 'v2' check (char_length(origem) <= 30),
  criado_em  timestamptz not null default now()
);
create index if not exists vagas_alertas_user on public.vagas_alertas (user_id);

create table if not exists public.vagas_empresa_documentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.vagas_empresas (id) on delete cascade,
  caminho     text not null check (char_length(caminho) between 3 and 300),
  nome        text not null check (char_length(nome) between 1 and 200),
  tipo        text not null check (char_length(tipo) between 3 and 120),
  enviado_por uuid,
  enviado_em  timestamptz not null default now(),
  unique (empresa_id, caminho)
);
create index if not exists vagas_empresa_documentos_empresa on public.vagas_empresa_documentos (empresa_id);

create table if not exists public.vagas_candidatura_historico (
  id             bigint generated always as identity primary key,
  candidatura_id uuid not null references public.vagas_candidaturas (id) on delete cascade,
  etapa          text not null,
  por            text not null default 'sistema' check (por in ('pessoa', 'empresa', 'sistema')),
  em             timestamptz not null default now()
);
create index if not exists vagas_candidatura_historico_k on public.vagas_candidatura_historico (candidatura_id, id);

create table if not exists public.vagas_avisos_pessoa (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.vagas_contas (user_id) on delete cascade,
  anuncio_id uuid references public.vagas_anuncios (id) on delete set null,
  mensagem   text not null check (char_length(mensagem) between 1 and 600),
  criado_em  timestamptz not null default now(),
  lido_em    timestamptz,
  enviado_em timestamptz
);
create index if not exists vagas_avisos_pessoa_user on public.vagas_avisos_pessoa (user_id, criado_em desc);

create unique index if not exists vagas_anuncios_id_local on public.vagas_anuncios (empresa_id, id_local) where id_local is not null;
create unique index if not exists vagas_candidaturas_id_local on public.vagas_candidaturas (pessoa_id, id_local) where id_local is not null;
create unique index if not exists vagas_mensagens_mid on public.vagas_mensagens (conversa_id, mid) where mid is not null;
create index if not exists vagas_anuncios_revisar on public.vagas_anuncios (cidade_id, revisar_depois_em) where revisar_depois_em is not null;
create index if not exists vagas_candidaturas_etapa on public.vagas_candidaturas (empresa_id, anuncio_id, criado_em desc);

-- -----------------------------------------------------------------------------
-- 2. Restrições: novas (colunas novas) e relaxadas (o que impedia a pessoa mínima, o tipo PJ/fim de semana, o novo motivo)
-- -----------------------------------------------------------------------------

do $$
begin
  alter table public.vagas_empresas drop constraint if exists vagas_empresas_v2_verificacao;
  alter table public.vagas_empresas add constraint vagas_empresas_v2_verificacao check (
    (verificacao_estado is null or verificacao_estado in ('em_verificacao', 'verificada', 'precisa_ajuste', 'vencida'))
    and char_length(verificacao_motivo) <= 600 and char_length(responsavel) <= 120 and char_length(bairro) <= 80
    and (consulta_cnpj is null or (jsonb_typeof(consulta_cnpj) = 'object' and char_length(consulta_cnpj::text) <= 4000))
    and jsonb_typeof(lojas) = 'array' and char_length(lojas::text) <= 4000);

  alter table public.vagas_anuncios drop constraint if exists vagas_anuncios_v2_extra;
  alter table public.vagas_anuncios add constraint vagas_anuncios_v2_extra check (
    jsonb_typeof(extra) = 'object' and char_length(extra::text) <= 12000
    and jsonb_typeof(sinais) = 'array' and char_length(sinais::text) <= 4000
    and (id_local is null or char_length(id_local) <= 80));

  alter table public.vagas_anuncios drop constraint if exists vagas_anuncios_turno_check;
  alter table public.vagas_anuncios add constraint vagas_anuncios_turno_check
    check (turno = any (array['manha', 'tarde', 'noite', 'comercial', 'escala', 'a_combinar', 'fim_de_semana']));

  alter table public.vagas_anuncios drop constraint if exists vagas_anuncios_unidade;
  alter table public.vagas_anuncios add constraint vagas_anuncios_unidade check (
    (modalidade = any (array['clt', 'temporario', 'estagio']) and valor_unidade = any (array['mes', 'hora']))
    or (modalidade = 'diaria' and valor_unidade = 'dia')
    or (modalidade = 'freelancer' and valor_unidade = any (array['servico', 'hora', 'dia', 'mes'])));

  alter table public.vagas_pessoas drop constraint if exists vagas_pessoas_cargos_check;
  alter table public.vagas_pessoas add constraint vagas_pessoas_cargos_check check (cardinality(cargos) <= 5);
  alter table public.vagas_pessoas drop constraint if exists vagas_pessoas_turnos_check;
  alter table public.vagas_pessoas add constraint vagas_pessoas_turnos_check
    check (turnos <@ array['manha', 'tarde', 'noite', 'madrugada', 'fim_de_semana', 'escala', 'comercial']);
  alter table public.vagas_pessoas drop constraint if exists vagas_pessoas_modalidades_check;
  alter table public.vagas_pessoas add constraint vagas_pessoas_modalidades_check
    check (modalidades <@ array['clt', 'temporario', 'diaria', 'freelancer', 'estagio']);
  alter table public.vagas_pessoas drop constraint if exists vagas_pessoas_v2_curriculo;
  alter table public.vagas_pessoas add constraint vagas_pessoas_v2_curriculo check (
    (funcao is null or char_length(funcao) <= 80) and (bairro is null or char_length(bairro) <= 80)
    and (tempo is null or char_length(tempo) <= 40)
    and (experiencias_v2 is null or (jsonb_typeof(experiencias_v2) = 'array' and char_length(experiencias_v2::text) <= 6000)));

  alter table public.vagas_pessoa_contato drop constraint if exists vagas_pessoa_contato_nome_check;
  alter table public.vagas_pessoa_contato add constraint vagas_pessoa_contato_nome_check
    check (char_length(nome) >= 2 and char_length(nome) <= 120);

  alter table public.vagas_candidaturas drop constraint if exists vagas_candidaturas_v2;
  alter table public.vagas_candidaturas add constraint vagas_candidaturas_v2 check (
    (etapa is null or etapa in ('nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu'))
    and (etapa_anterior is null or etapa_anterior in ('nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu'))
    and (forma is null or forma in ('anexo', 'montar', 'minimo'))
    and jsonb_typeof(respostas) = 'array' and char_length(respostas::text) <= 3000
    and (mensagem is null or char_length(mensagem) <= 1000)
    and (id_local is null or char_length(id_local) <= 80)
    and (encerrada_por is null or encerrada_por in ('pessoa', 'empresa', 'prazo'))
    and (entrevista is null or (jsonb_typeof(entrevista) = 'object' and char_length(entrevista::text) <= 2000)));

  alter table public.vagas_mensagens drop constraint if exists vagas_mensagens_mid_check;
  alter table public.vagas_mensagens add constraint vagas_mensagens_mid_check check (mid is null or char_length(mid) <= 80);

  alter table public.vagas_acessos_contato drop constraint if exists vagas_acessos_contato_tipo_acesso;
  alter table public.vagas_acessos_contato add constraint vagas_acessos_contato_tipo_acesso check (tipo_acesso in ('currículo', 'contato', 'arquivo'));

  alter table public.vagas_denuncias drop constraint if exists vagas_denuncias_motivo_check;
  alter table public.vagas_denuncias add constraint vagas_denuncias_motivo_check
    check (motivo = any (array['golpe', 'cobranca', 'documento', 'discriminacao', 'falsa', 'ofensa', 'contato', 'outro', 'dados_errados']));
end $$;

-- Setores (vagas_areas): as 16 áreas do desenho novo entram junto das 24 que já existiam (nada some); "curto" e "icone" para a tela.
insert into public.vagas_areas (slug, nome, ordem) values
  ('comercio', 'Comércio e varejo', 25), ('supermercado', 'Supermercado', 26), ('alimentacao', 'Alimentação e restaurante', 27),
  ('transporte', 'Transporte e logística', 28), ('industria', 'Indústria', 29), ('vendas', 'Vendas e telemarketing', 30)
on conflict (slug) do nothing;

update public.vagas_areas a set curto = x.curto, icone = x.icone
  from (values
    ('comercio', 'Comércio', 'sacola'), ('supermercado', 'Mercado', 'carrinho'), ('alimentacao', 'Alimentação', 'talheres'),
    ('cozinha', 'Cozinha', 'talheres'), ('saude', 'Saúde', 'cruz'), ('construcao', 'Construção', 'capacete'),
    ('manutencao', 'Manutenção', 'capacete'), ('transporte', 'Transporte', 'caminhao'), ('motorista', 'Motorista', 'caminhao'),
    ('logistica', 'Logística', 'caminhao'), ('agro', 'Agro', 'trator'), ('industria', 'Indústria', 'fabrica'), ('producao', 'Produção', 'fabrica'),
    ('administrativo', 'Escritório', 'pasta'), ('financeiro', 'Financeiro', 'pasta'), ('rh', 'RH', 'pasta'), ('beleza', 'Beleza', 'tesoura'),
    ('educacao', 'Educação', 'livro'), ('limpeza', 'Limpeza', 'vassoura'), ('domesticos', 'Casa', 'vassoura'), ('tecnologia', 'Tecnologia', 'notebook'),
    ('marketing', 'Marketing', 'notebook'), ('vendas', 'Vendas', 'fone'), ('vendas-externas', 'Vendas externas', 'fone'),
    ('vendas-loja', 'Vendas em loja', 'sacola'), ('atendimento', 'Atendimento', 'fone'), ('caixa', 'Caixa', 'carrinho'),
    ('hotelaria', 'Hotelaria', 'cama'), ('seguranca', 'Segurança', 'escudo'), ('outros', 'Outros', 'sacola')
  ) as x(slug, curto, icone)
 where a.slug = x.slug and (a.curto is null or a.icone is null);
update public.vagas_areas set curto = nome where curto is null;
update public.vagas_areas set icone = 'sacola' where icone is null;

-- -----------------------------------------------------------------------------
-- 3. Permissões das tabelas novas (só a pessoa lê o que é dela; escrita só pelas RPCs)
-- -----------------------------------------------------------------------------

alter table public.vagas_curriculos enable row level security;
alter table public.vagas_salvas enable row level security;
alter table public.vagas_escondidas enable row level security;
alter table public.vagas_alertas enable row level security;
alter table public.vagas_empresa_documentos enable row level security;
alter table public.vagas_candidatura_historico enable row level security;
alter table public.vagas_avisos_pessoa enable row level security;

drop policy if exists vagas_curriculos_dono on public.vagas_curriculos;
create policy vagas_curriculos_dono on public.vagas_curriculos for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_salvas_dono on public.vagas_salvas;
create policy vagas_salvas_dono on public.vagas_salvas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_escondidas_dono on public.vagas_escondidas;
create policy vagas_escondidas_dono on public.vagas_escondidas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_alertas_dono on public.vagas_alertas;
create policy vagas_alertas_dono on public.vagas_alertas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_avisos_pessoa_dono on public.vagas_avisos_pessoa;
create policy vagas_avisos_pessoa_dono on public.vagas_avisos_pessoa for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_empresa_documentos_ver on public.vagas_empresa_documentos;
create policy vagas_empresa_documentos_ver on public.vagas_empresa_documentos for select to authenticated
  using (empresa_id in (select public.vagas_ids_minhas_empresas())
         or empresa_id in (select e.id from public.vagas_empresas e where e.cidade_id in (select public.vagas_ids_minhas_cidades())));

do $$
declare
  papel text;
  t text;
  fechadas text[] := array['vagas_curriculos', 'vagas_salvas', 'vagas_escondidas', 'vagas_alertas', 'vagas_empresa_documentos',
    'vagas_candidatura_historico', 'vagas_avisos_pessoa'];
begin
  foreach t in array fechadas loop
    execute format('revoke all on public.%I from public', t);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on public.%I from %I', t, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant all on public.%I to service_role', t); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.vagas_curriculos, public.vagas_salvas, public.vagas_escondidas, public.vagas_alertas,
      public.vagas_avisos_pessoa, public.vagas_empresa_documentos to authenticated;
  end if;
  -- As colunas novas da candidatura e da empresa não abrem nenhuma leitura direta: as tabelas continuam sem política de leitura.
end $$;

-- -----------------------------------------------------------------------------
-- 4. Storage: buckets PRIVADOS e políticas (só onde existe o Storage do Supabase)
--    vagas-curriculos/<user_id>/…  : a pessoa grava, lê e apaga o próprio prefixo; a empresa NÃO lê direto (link assinado pelo servidor)
--    vagas-verificacao/<empresa_id>/… : membro da empresa grava e lê; a equipe da cidade lê pelo link assinado do servidor
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('vagas-curriculos', 'vagas-curriculos', false, 10485760,
        array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
      on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types$q$;
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('vagas-verificacao', 'vagas-verificacao', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
      on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types$q$;
  else
    execute $q$insert into storage.buckets (id, name, public) values ('vagas-curriculos', 'vagas-curriculos', false)
      on conflict (id) do update set public = false$q$;
    execute $q$insert into storage.buckets (id, name, public) values ('vagas-verificacao', 'vagas-verificacao', false)
      on conflict (id) do update set public = false$q$;
  end if;

  execute 'drop policy if exists vagas_curriculos_gravar on storage.objects';
  execute $q$create policy vagas_curriculos_gravar on storage.objects for insert to authenticated
    with check (bucket_id = 'vagas-curriculos' and name like (select auth.uid())::text || '/_%' and (select public.vagas_sou_pessoa()))$q$;
  execute 'drop policy if exists vagas_curriculos_ver_proprio on storage.objects';
  execute $q$create policy vagas_curriculos_ver_proprio on storage.objects for select to authenticated
    using (bucket_id = 'vagas-curriculos' and name like (select auth.uid())::text || '/_%')$q$;
  execute 'drop policy if exists vagas_curriculos_trocar on storage.objects';
  execute $q$create policy vagas_curriculos_trocar on storage.objects for update to authenticated
    using (bucket_id = 'vagas-curriculos' and name like (select auth.uid())::text || '/_%')
    with check (bucket_id = 'vagas-curriculos' and name like (select auth.uid())::text || '/_%' and (select public.vagas_sou_pessoa()))$q$;
  execute 'drop policy if exists vagas_curriculos_apagar on storage.objects';
  execute $q$create policy vagas_curriculos_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'vagas-curriculos' and name like (select auth.uid())::text || '/_%')$q$;

  execute 'drop policy if exists vagas_verificacao_gravar on storage.objects';
  execute $q$create policy vagas_verificacao_gravar on storage.objects for insert to authenticated
    with check (bucket_id = 'vagas-verificacao'
      and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(name, '/', 2) <> ''
      and (case when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(name, '/', 1)::uuid in (select public.vagas_ids_minhas_empresas()) else false end))$q$;
  execute 'drop policy if exists vagas_verificacao_ver on storage.objects';
  execute $q$create policy vagas_verificacao_ver on storage.objects for select to authenticated
    using (bucket_id = 'vagas-verificacao'
      and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (case when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(name, '/', 1)::uuid in (select public.vagas_ids_minhas_empresas()) else false end))$q$;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Filtro de texto CONTEXTUAL (proposta §5.5). Mesmas regras em vagas/js/regras.js (VAGAS_REGRAS.conferirTexto/conferirLista):
--    tests/supabase/vagas_v2.test.js confere que banco e JS dão o MESMO resultado. Três níveis:
--      barra : o texto não passa (a mensagem diz o que tirar e o que escrever no lugar);
--      forte : a vaga é publicada FORA do ar e a equipe libera numa revisão rápida;
--      fraco : a vaga vai ao ar e entra no topo da fila "Revisar depois".
--    O trecho vem do texto normalizado (minúsculas, sem acento) para os padrões "normal" e do texto em minúsculas para os "bruto".
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.padroes_texto()
returns table (ordem int, tipo text, nivel text, alvo text, padrao text)
language sql immutable set search_path = '' as $$
  select * from (values
    (10, 'golpe', 'barra', 'normal', ' (?:pague|paguem) (?:r )?(?:[0-9]+ )?'),
    (11, 'golpe', 'barra', 'normal', ' (?:pagar|pagamento|pagamentos) (?:de |da |do |pela |pelo |a |uma |um |o |as |os )?(?:taxa|taxas|inscricao|matricula|mensalidade|uniforme|curso|kit|material|exame|exames|treinamento|cadastro|documentacao) '),
    (12, 'golpe', 'barra', 'normal', ' taxas? (?:de |da |do |para |pra )?(?:inscricao|cadastro|matricula|adesao|participacao|selecao|treinamento|uniforme|material|documentacao|contratacao|admissao|liberacao|confirmacao|reserva|vaga|ativacao|emissao|kit|curso|exame|comecar|iniciar|participar|candidatura|entrevista) '),
    (13, 'golpe', 'barra', 'normal', ' (?:deposite|depositem|depositar|faca um deposito|fazer um deposito|deposito (?:inicial|antecipado|de garantia)|transfira|transferencia bancaria) '),
    (14, 'golpe', 'barra', 'normal', ' (?:pagamento antecipado|valor da inscricao|inscricao paga|cadastro pago|investimento inicial|investimento minimo|mediante pagamento|custo do (?:uniforme|curso|kit|treinamento|material|exame)) '),
    (15, 'golpe', 'barra', 'normal', ' (?:curso|kit) (?:pago|pagos|paga|pagas) '),
    (16, 'golpe', 'barra', 'normal', ' (?:faca|fazer|faz|enviar|envie|mande|mandar|manda|mandem|enviem|realize|realizar) (?:um |o |seu |sua )?(?:pix|deposito) '),
    (17, 'golpe', 'barra', 'normal', ' pix (?:para|pra) (?:garantir|reservar|confirmar|liberar|comecar|iniciar|ativar|cadastro|inscricao|vaga|taxa) '),
    (20, 'contato', 'barra', 'bruto', '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'),
    (21, 'contato', 'barra', 'bruto', '(?:\+?55[\s.-]*)?\(?[0-9]{2}\)?[\s.-]*9?[\s.-]?[0-9]{4}[\s.-]?[0-9]{4}'),
    (22, 'contato', 'barra', 'bruto', '(?:^|[\s(])@[a-z0-9_.]{3,}'),
    (23, 'contato', 'barra', 'bruto', '(?:^|[\s(])9[0-9]{4}[\s.-]?[0-9]{4}(?![0-9])'),
    (24, 'contato', 'barra', 'bruto', '(?:telefone|fone|celular|whatsapp|whats|zap|ligue|ligar)[^0-9a-z]{0,15}[0-9][0-9 .()-]{6,}'),
    (30, 'link', 'barra', 'bruto', '(?:https?://|www\.)[^\s]*'),
    (31, 'link', 'barra', 'bruto', '[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|ly|me|gl|gd|co|io|to|info|biz|xyz|site|online|app|link|click|top|vip|tk|page|lat|shop|store)(?![a-z0-9])(?:/[^\s]*)?'),
    (40, 'documento', 'barra', 'normal', ' (?:cpf|rg|identidade|titulo de eleitor|comprovante de (?:residencia|endereco|renda)|(?:manda|mande|envie|enviar|mandar) (?:seus|seu|os|o|teus|teu) documentos?|foto (?:do|da|de) (?:documento|identidade)|certidao de nascimento) '),
    (41, 'sensivel', 'barra', 'normal', ' (?:selfie|senha|dados bancarios|conta bancaria|cartao de credito|numero do cartao|foto (?:do|da) rosto|codigo de (?:verificacao|seguranca|confirmacao|acesso)) '),
    (50, 'discriminacao', 'barra', 'normal', ' (?:aparencia|boa apresentacao|bonit[ao]s?|magr[ao]s?) '),
    (51, 'discriminacao', 'barra', 'normal', ' (?:idade|faixa etaria) '),
    (52, 'discriminacao', 'barra', 'normal', ' ate (?:1[6-9]|[2-6][0-9]) anos '),
    (53, 'discriminacao', 'barra', 'normal', ' (?:entre|de) (?:1[6-9]|[2-6][0-9]) (?:a|e) (?:1[6-9]|[2-7][0-9]) anos '),
    (54, 'discriminacao', 'barra', 'normal', ' (?:solteir[ao]s?|casad[ao]s?|divorciad[ao]s?|viuv[ao]s?|estado civil) '),
    (55, 'discriminacao', 'barra', 'normal', ' (?:filh[ao]s?|gravid[ao]s?|gravidez|gestante) '),
    (56, 'discriminacao', 'barra', 'normal', ' (?:sexo|genero|(?:somente|apenas|so|exclusivo|exclusiva|exclusivamente) (?:para )?(?:mulher|mulheres|homem|homens|moca|mocas|rapaz|rapazes)) '),
    (57, 'discriminacao', 'barra', 'normal', ' (?:religi[a-z]*|evangelic[ao]s?|catolic[ao]s?|cor da pele|raca|etnia) '),
    (58, 'discriminacao', 'barra', 'normal', ' (?:nacionalidade|estrangeir[ao]s?|venezuelan[ao]s?|(?:somente|apenas|so) (?:para )?brasileir[ao]s?) '),
    (59, 'discriminacao', 'barra', 'normal', ' (?:antecedentes? (?!profission|de trabalho|de vendas|de experiencia)|nada consta|ficha limpa|ficha criminal|certidao criminal) '),
    (60, 'discriminacao', 'barra', 'normal', ' (?:sem|exceto|nao aceitamos|nao aceita|nao contratamos|nao contrata|proibido) (?:pessoas? com )?(?:deficien[a-z]*|pcd) '),
    (61, 'discriminacao', 'barra', 'normal', ' (?:boa saude|saude perfeita|doenc[a-z]*|hiv) '),
    (62, 'discriminacao', 'barra', 'normal', ' (?:vagas?|oportunidade|contratamos|procuramos|precisa se de|precisamos de|buscamos|selecionamos|admitimos|contrata se) (?:para |de )?(?:mulher|mulheres|homem|homens|moca|mocas|rapaz|rapazes|senhoras?|garotas?|garotos?) '),
    (70, 'golpe_forte', 'forte', 'normal', ' taxas? (?!de entrega|por entrega|por corrida|de servico|de comissao|de conversao|de sucesso|de juros|de retorno|de ocupacao|de atendimento|de pedido|de venda|de vendas|e gorjeta|e gorjetas|de gorjeta)'),
    (71, 'golpe_forte', 'forte', 'normal', ' (?:adesao|investimento|caucao|kit inicial|material proprio|pacote inicial|reserva de vaga) '),
    (72, 'golpe_forte', 'forte', 'normal', ' (?:cobramos|cobranca|cobrado|cobrar) '),
    (73, 'sinal', 'fraco', 'normal', ' (?:ganhe|ganhos?|ganhar) (?:ate|de ate|mais de) '),
    (74, 'sinal', 'fraco', 'normal', ' (?:renda extra|trabalhe em casa|trabalhe de casa|enriquecer|ficar rico|liberdade financeira) '),
    (75, 'sinal', 'fraco', 'normal', ' (?:ganhos|lucros?) (?:ilimitados?|garantidos?|altos?) '),
    (76, 'sinal', 'fraco', 'normal', ' ganhe (?:r )?[0-9]+ ')
  ) as t(ordem, tipo, nivel, alvo, padrao);
$$;

-- Os padrões de nível "barra" (o mesmo formato da lista antiga).
create or replace function vagas_interno.padroes_proibidos()
returns table (ordem int, tipo text, alvo text, padrao text)
language sql immutable set search_path = '' as $$
  select p.ordem, p.tipo, p.alvo, p.padrao from vagas_interno.padroes_texto() p where p.nivel = 'barra';
$$;

-- Quais tipos valem em cada contexto e em que nível. anuncio/empresa/mensagem/referencia/cartao/perfil são os contextos antigos.
create or replace function vagas_interno.niveis_do_contexto(p_contexto text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_contexto
    when 'anuncio' then '{"barra": ["golpe", "contato", "link", "discriminacao"], "forte": [], "fraco": []}'::jsonb
    when 'empresa' then '{"barra": ["golpe", "contato", "link", "discriminacao"], "forte": [], "fraco": []}'::jsonb
    when 'mensagem' then '{"barra": ["golpe", "contato", "link", "documento", "sensivel", "discriminacao"], "forte": [], "fraco": []}'::jsonb
    when 'referencia' then '{"barra": ["golpe", "contato", "link", "discriminacao"], "forte": [], "fraco": []}'::jsonb
    when 'cartao' then '{"barra": ["contato", "link"], "forte": [], "fraco": []}'::jsonb
    when 'perfil' then '{"barra": ["link"], "forte": [], "fraco": []}'::jsonb
    when 'vaga' then '{"barra": ["golpe", "contato", "link", "documento", "sensivel", "discriminacao"], "forte": ["golpe_forte"], "fraco": ["sinal"]}'::jsonb
    when 'conversa' then '{"barra": ["golpe", "contato", "link", "sensivel", "discriminacao"], "forte": [], "fraco": ["documento", "golpe_forte"]}'::jsonb
    else '{"barra": [], "forte": [], "fraco": []}'::jsonb end;
$$;

create or replace function vagas_interno.tipos_do_contexto(p_contexto text)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x), array[]::text[]) from jsonb_array_elements_text(vagas_interno.niveis_do_contexto(p_contexto) -> 'barra') x;
$$;

create or replace function vagas_interno.motivo_texto(p_tipo text)
returns text language sql immutable set search_path = '' as $$
  select case p_tipo when 'golpe' then 'cobranca' when 'golpe_forte' then 'cobranca' when 'contato' then 'contato' when 'link' then 'link'
    when 'documento' then 'documento' when 'sensivel' then 'dado_sensivel' when 'discriminacao' then 'igualdade' else 'sinal' end;
$$;

-- Mensagem por contexto. Nos contextos antigos o texto é o de sempre (o filtro mudou, as mensagens não); em "vaga" e "conversa"
-- a mensagem nunca acusa: diz o que tirar e o que escrever no lugar.
create or replace function vagas_interno.msg_texto(p_tipo text, p_trecho text, p_contexto text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_contexto = 'vaga' then case p_tipo
      when 'golpe' then 'Vagas não podem cobrar nada de quem se candidata. Tire "' || p_trecho || '" e escreva no lugar o que a empresa oferece (por exemplo: "uniforme fornecido pela empresa").'
      when 'contato' then 'Não precisa pôr o número: as pessoas chamam você pelo botão da vaga. Tire "' || p_trecho || '".'
      when 'link' then 'Não precisa pôr link: as pessoas chamam você pelo botão da vaga. Tire "' || p_trecho || '".'
      when 'documento' then 'Não peça documento no anúncio: ele só é combinado depois da contratação, nunca por mensagem. Tire "' || p_trecho || '".'
      when 'sensivel' then 'Não peça senha, selfie, código nem dados de banco: isso não se pede a quem procura vaga. Tire "' || p_trecho || '".'
      when 'golpe_forte' then 'O trecho "' || p_trecho || '" pede uma conferência rápida da equipe antes de a vaga ir ao ar.'
      when 'sinal' then 'O trecho "' || p_trecho || '" costuma chamar a atenção da equipe. Se puder, escreva o valor fixo e o que a pessoa faz no dia a dia.'
      else 'A lei não deixa escolher por sexo, idade, estado civil, aparência, religião ou saúde no anúncio. Tire "' || p_trecho || '" e escreva só o que a pessoa vai fazer no trabalho.' end
    when p_contexto = 'conversa' then case p_tipo
      when 'golpe' then 'Ninguém paga para se candidatar. Tire "' || p_trecho || '" e combine só a entrevista e o trabalho.'
      when 'contato' then 'Telefone e e-mail não vão por mensagem. Use os botões da conversa para passar o WhatsApp. Tire "' || p_trecho || '".'
      when 'link' then 'Não dá para mandar link por aqui. Tire "' || p_trecho || '".'
      when 'sensivel' then 'Não peça nem mande senha, selfie, código ou dados de banco por aqui. Tire "' || p_trecho || '".'
      when 'documento' then 'Atenção: ninguém pode pedir documento para você se candidatar.'
      when 'golpe_forte' then 'Atenção: ninguém pode cobrar nem pedir pagamento para você se candidatar.'
      else 'Aqui não se pergunta nem se conta idade, aparência, estado civil, filhos, religião, cor, nacionalidade, saúde ou antecedentes.' end
    when p_contexto = 'mensagem' then case p_tipo
      when 'golpe' then 'Mensagem bloqueada: ninguém paga para concorrer a uma vaga. Pedido de taxa, Pix ou depósito é golpe; se alguém pedir, denuncie.'
      when 'contato' then 'Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou, que libera o contato com segurança.'
      when 'link' then 'Mensagem bloqueada: não dá para mandar links por aqui.'
      when 'documento' then 'Mensagem bloqueada: não peça nem mande documento, senha, código ou dados de banco por aqui. Se alguém pedir, denuncie.'
      when 'sensivel' then 'Mensagem bloqueada: não peça nem mande documento, senha, código ou dados de banco por aqui. Se alguém pedir, denuncie.'
      else 'Mensagem bloqueada: aqui não se pergunta nem se conta idade, aparência, estado civil, filhos, religião, cor, nacionalidade, saúde ou antecedentes (Lei 9.029/1995).' end
    else case p_tipo
      when 'golpe' then 'Tire o trecho "' || p_trecho || '": ninguém paga para concorrer a uma vaga, então taxa, Pix e depósito não podem aparecer.'
      when 'contato' then 'Tire o telefone, e-mail ou perfil de rede social ("' || p_trecho || '"): o contato acontece pela plataforma, depois do Combinou.'
      when 'link' then 'Tire o link "' || p_trecho || '": o contato acontece pela plataforma.'
      when 'documento' then 'Tire o pedido de documento ("' || p_trecho || '").'
      when 'sensivel' then 'Tire o pedido de documento ("' || p_trecho || '").'
      else case when p_contexto = 'referencia'
        then 'Tire o trecho "' || p_trecho || '": a referência não pode falar de aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995).'
        else 'Tire o trecho "' || p_trecho || '": o texto não pode pedir aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995 e CLT, art. 373-A).' end end
  end;
$$;

-- Todas as ocorrências, por nível: {barra:[{tipo, trecho, motivo, mensagem}], forte:[...], fraco:[...]} (uma por padrão, na ordem dos padrões).
create or replace function vagas_interno.conferir_lista(p text, p_contexto text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  n text;
  b text;
  r record;
  m text;
  v_niv jsonb := vagas_interno.niveis_do_contexto(p_contexto);
  v_res jsonb := '{"barra": [], "forte": [], "fraco": []}'::jsonb;
  v_nivel text;
begin
  if coalesce(btrim(p), '') = '' then return v_res; end if;
  n := ' ' || vagas_interno.normalizar(p) || ' ';
  b := lower(p);
  for r in select x.ordem, x.tipo, x.nivel, x.alvo, x.padrao from vagas_interno.padroes_texto() x order by x.ordem loop
    -- O nível vale por contexto: o mesmo tipo pode barrar numa vaga e só alertar numa conversa.
    v_nivel := case when jsonb_exists(v_niv -> 'barra', r.tipo) then 'barra' when jsonb_exists(v_niv -> 'forte', r.tipo) then 'forte'
      when jsonb_exists(v_niv -> 'fraco', r.tipo) then 'fraco' else null end;
    if v_nivel is null then continue; end if;
    m := (regexp_match(case when r.alvo = 'bruto' then b else n end, r.padrao))[1];
    if m is not null then
      m := left(btrim(m, ' ()-.'), 60);
      -- Trechos que se contêm (o mesmo número visto por dois padrões) entram uma vez só.
      if exists (select 1 from jsonb_array_elements(v_res -> v_nivel) z
                  where z ->> 'tipo' = r.tipo and (position(m in (z ->> 'trecho')) > 0 or position((z ->> 'trecho') in m) > 0)) then
        continue;
      end if;
      v_res := jsonb_set(v_res, array[v_nivel], (v_res -> v_nivel) || jsonb_build_array(jsonb_build_object('tipo', r.tipo, 'trecho', m,
        'motivo', vagas_interno.motivo_texto(r.tipo), 'mensagem', vagas_interno.msg_texto(r.tipo, m, p_contexto))));
    end if;
  end loop;
  return v_res;
end;
$$;

-- O primeiro trecho barrado (a forma antiga {tipo, trecho, erro}); nulo quando o texto passa.
create or replace function vagas_interno.conferir_texto(p text, p_contexto text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  l jsonb := vagas_interno.conferir_lista(p, p_contexto) -> 'barra';
begin
  if jsonb_array_length(l) = 0 then return null; end if;
  return jsonb_build_object('tipo', l -> 0 ->> 'tipo', 'trecho', l -> 0 ->> 'trecho', 'erro', l -> 0 ->> 'mensagem');
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Ajudantes da v2 (respostas, estados da empresa, números)
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_erro(p_msg text, p_codigo text default null, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'erro', p_msg)
    || case when p_codigo is null then '{}'::jsonb else jsonb_build_object('codigo', p_codigo) end || coalesce(p_extra, '{}'::jsonb);
$$;

create or replace function vagas_interno.v2_ok(p jsonb default '{}'::jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', true) || coalesce(p, '{}'::jsonb);
$$;

create or replace function vagas_interno.v2_dados(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end;
$$;

create or replace function vagas_interno.v2_iso(p timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null else disc_interno.iso(p) end;
$$;

create or replace function vagas_interno.v2_uuid(p text)
returns uuid language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then btrim(p)::uuid else null end;
$$;

-- Conta de quem chama (pessoa, empresa ou qualquer uma); a mesma conferência de sempre, com "codigo".
create or replace function vagas_interno.v2_conta(p_tipo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v jsonb := vagas_interno.conta_atual(p_tipo);
begin
  if (v ->> 'ok')::boolean then return v; end if;
  return v || jsonb_build_object('codigo', case when v ? 'sessaoExpirada' then 'sessao_expirada' when v ? 'semConta' then 'sem_conta'
    when v ? 'suspensa' then 'conta_suspensa' when v ? 'confirmar' then 'confirmar_email' else 'sem_permissao' end);
end;
$$;

-- Estado da empresa para a tela: verificada | em_verificacao | precisa_ajuste | vencida | suspensa.
-- "Vencida" é calculado na leitura (o prazo passou sem a conferência): nenhum agendador é preciso e nada é apagado.
create or replace function vagas_interno.v2_estado_empresa(e public.vagas_empresas)
returns text language sql stable set search_path = '' as $$
  select case
    when e.status = 'suspensa' then 'suspensa'
    when e.status = 'ativa' then 'verificada'
    when e.verificacao_estado = 'precisa_ajuste' or (e.verificacao_estado is null and e.status_motivo <> '') then 'precisa_ajuste'
    when e.verificacao_prazo_em is not null and e.verificacao_prazo_em <= now() then 'vencida'
    else 'em_verificacao' end;
$$;

create or replace function vagas_interno.v2_empresa_anuncia(e public.vagas_empresas)
returns boolean language sql stable set search_path = '' as $$
  select vagas_interno.v2_estado_empresa(e) in ('verificada', 'em_verificacao');
$$;

-- AS 3 TRAVAS SAEM: a vaga de empresa em verificação (dentro do prazo, não recusada nem suspensa) fica no ar; a cidade em
-- pré-abertura (lista_espera) também publica. A diária que repete toda semana não vence pela data.
create or replace function vagas_interno.no_ar(a public.vagas_anuncios)
returns boolean language sql stable security definer set search_path = '' as $$
  select a.status = 'publicado'
    and (a.expira_em > now() or (a.modalidade = 'diaria' and coalesce(a.extra ->> 'repete', 'false') = 'true'))
    and exists (select 1 from public.vagas_empresas e where e.id = a.empresa_id and vagas_interno.v2_empresa_anuncia(e))
    and exists (select 1 from public.vagas_cidades c where c.id = a.cidade_id and c.status in ('ativa', 'lista_espera')
                 and (a.modalidade <> 'diaria' or a.data_trabalho >= vagas_interno.hoje(c.fuso)
                      or coalesce(a.extra ->> 'repete', 'false') = 'true'));
$$;

create or replace function vagas_interno.v2_reais(p_centavos integer)
returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || regexp_replace(trunc(p_centavos / 100.0)::bigint::text, '([0-9])(?=([0-9]{3})+$)', '\1.', 'g')
    || case when p_centavos % 100 = 0 then '' else ',' || lpad((p_centavos % 100)::text, 2, '0') end;
$$;

create or replace function vagas_interno.v2_membro_de(p_user uuid, p_empresa uuid, p_dono boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vagas_empresa_membros m
                  where m.empresa_id = p_empresa and m.user_id = p_user and m.ativo
                    and (not p_dono or m.papel = 'dono') and vagas_interno.conta_valida(m.user_id));
$$;

-- -----------------------------------------------------------------------------
-- 7. Gatilhos que passam a usar as regras novas
-- -----------------------------------------------------------------------------

-- A razão social vem da Receita: não passa pelo filtro de contato (ela pode ter ponto, número ou sigla). Nome fantasia, setor e
-- descrição continuam conferidos.
create or replace function vagas_interno.empresas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.criado_em := old.criado_em;
    -- O CNPJ só muda enquanto a empresa não está verificada ("Corrigir e pedir nova conferência").
    if new.cnpj is distinct from old.cnpj then
      if old.status = 'ativa' then new.cnpj := old.cnpj;
      else
        new.cnpj := vagas_interno.normalizar_cnpj(new.cnpj);
        if not vagas_interno.cnpj_valido(new.cnpj) then raise exception 'CNPJ inválido. Confira os números.'; end if;
      end if;
    end if;
  else
    new.cnpj := vagas_interno.normalizar_cnpj(new.cnpj);
    if not vagas_interno.cnpj_valido(new.cnpj) then raise exception 'CNPJ inválido. Confira os números.'; end if;
    if not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status in ('ativa', 'lista_espera')) then
      raise exception 'Ainda não chegamos a esta cidade. Entre na lista de espera.';
    end if;
  end if;
  if new.zona_id is not null and not exists (select 1 from public.vagas_zonas z where z.id = new.zona_id and z.cidade_id = new.cidade_id) then
    raise exception 'Escolha uma zona da cidade da empresa.';
  end if;
  t := coalesce(vagas_interno.conferir_texto(new.nome_fantasia, 'cartao'), vagas_interno.conferir_texto(new.setor, 'cartao'),
                vagas_interno.conferir_texto(new.descricao, 'empresa'));
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- A pessoa pode morar em cidade em pré-abertura (a vaga da região aparece para ela).
create or replace function vagas_interno.pessoas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  x text;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
  end if;
  if (tg_op = 'INSERT' or new.cidade_id is distinct from old.cidade_id)
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status in ('ativa', 'lista_espera')) then
    raise exception 'Ainda não chegamos a esta cidade. Entre na lista de espera.';
  end if;
  if new.cidade2_id is not null and (tg_op = 'INSERT' or new.cidade2_id is distinct from old.cidade2_id)
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade2_id and c.status in ('ativa', 'lista_espera')) then
    raise exception 'A segunda cidade ainda não está aberta. Escolha uma cidade ativa.';
  end if;
  if new.zona_id is not null and not exists (select 1 from public.vagas_zonas z where z.id = new.zona_id and z.cidade_id = new.cidade_id) then
    raise exception 'Escolha uma zona da sua cidade.';
  end if;
  foreach x in array new.cargos || new.cursos || array[coalesce(new.funcao, ''), coalesce(new.bairro, ''), coalesce(new.tempo, '')] loop
    t := vagas_interno.conferir_texto(x, 'cartao');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end loop;
  t := vagas_interno.conferir_texto(new.sobre, 'perfil');
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Mensagens da conversa passam pelo filtro de conversa (permissivo: data, CEP e endereço passam; cobrança, link, telefone, e-mail
-- e dados sensíveis não).
create or replace function vagas_interno.mensagens_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
begin
  if tg_op = 'UPDATE' then raise exception 'Mensagens não podem ser alteradas.'; end if;
  new.texto := btrim(new.texto);
  if new.autor <> 'sistema' then
    t := vagas_interno.conferir_texto(new.texto, 'conversa');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end if;
  return new;
end;
$$;

-- Denúncias de contas DIFERENTES tiram a vaga do ar: 2 para empresa em verificação, 3 para a verificada. "Pede dinheiro" com sinal
-- na conversa suspende a empresa toda, na hora (todas as vagas saem do ar; nada é apagado).
create or replace function vagas_interno.denuncias_depois_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_limite int;
  v_sinal boolean := false;
begin
  if new.alvo not in ('anuncio', 'mensagem') or not new.conta_no_limite then return null; end if;
  select * into a from public.vagas_anuncios where id = new.anuncio_id for update;
  if not found then return null; end if;
  select * into e from public.vagas_empresas where id = a.empresa_id for update;
  v_limite := case when e.status = 'ativa' then 3 else 2 end;
  if a.status = 'publicado' and new.alvo = 'anuncio' then
    if (select count(distinct d.autor) from public.vagas_denuncias d
         where d.anuncio_id = a.id and d.alvo = 'anuncio' and d.conta_no_limite and d.status = 'aberta') >= v_limite then
      update public.vagas_anuncios set status = 'suspenso', status_motivo = 'Fora do ar por denúncias, aguardando a moderação.' where id = a.id;
      insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
      values (a.cidade_id, null, 'sistema', 'suspender_por_denuncias', 'anuncio', a.id, v_limite || ' denúncias de contas diferentes.');
    end if;
  end if;
  if new.motivo in ('golpe', 'cobranca') and e.status <> 'suspensa' then
    if new.alvo = 'mensagem' and new.autor_mensagem = 'empresa' then
      v_sinal := jsonb_array_length(vagas_interno.conferir_lista(new.texto_denunciado, 'conversa') -> 'fraco') > 0
              or jsonb_array_length(vagas_interno.conferir_lista(new.texto_denunciado, 'vaga') -> 'forte') > 0;
    end if;
    if not v_sinal then
      select exists (select 1 from public.vagas_mensagens m join public.vagas_conversas v on v.id = m.conversa_id
                       join public.vagas_candidaturas k on k.id = v.candidatura_id
                      where k.empresa_id = e.id and m.autor = 'empresa' and m.criado_em > now() - interval '30 days'
                        and (jsonb_array_length(vagas_interno.conferir_lista(m.texto, 'conversa') -> 'fraco') > 0
                             or jsonb_array_length(vagas_interno.conferir_lista(m.texto, 'vaga') -> 'forte') > 0)) into v_sinal;
    end if;
    if v_sinal then
      update public.vagas_empresas set status = 'suspensa', status_motivo = 'Suspensa por denúncia de cobrança com sinal na conversa, aguardando a equipe.'
       where id = e.id;
      insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
      values (e.cidade_id, null, 'sistema', 'suspender_empresa_por_denuncia', 'empresa', e.id, 'Denúncia de cobrança com sinal na conversa.');
    end if;
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Publicação interna (vale para a RPC nova e para a antiga): sem revisão ANTES; sinal forte segura; o resto entra no ar
-- -----------------------------------------------------------------------------

-- Sinais da vaga: forte (segura) e fraco (publica e vai para o topo de "Revisar depois"). Texto + empresa + número.
create or replace function vagas_interno.v2_sinais_vaga(a public.vagas_anuncios, e public.vagas_empresas)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_txt text := coalesce(a.funcao, '') || E'\n' || coalesce(a.descricao, '') || E'\n' || coalesce(a.extra ->> 'horario', '') || E'\n'
    || coalesce((select string_agg(x, E'\n') from jsonb_array_elements_text(coalesce(a.extra -> 'beneficios', '[]'::jsonb)) x), '') || E'\n'
    || coalesce((select string_agg(x, E'\n') from jsonb_array_elements_text(coalesce(a.extra -> 'requisitos', '[]'::jsonb)) x), '') || E'\n'
    || coalesce((select string_agg(x, E'\n') from jsonb_array_elements_text(coalesce(a.extra -> 'atividades', '[]'::jsonb)) x), '') || E'\n'
    || coalesce((select string_agg(x, E'\n') from jsonb_array_elements_text(coalesce(a.extra -> 'diferenciais', '[]'::jsonb)) x), '');
  l jsonb := vagas_interno.conferir_lista(v_txt, 'vaga');
  v_sinais jsonb := '[]'::jsonb;
  x jsonb;
  v_media numeric;
  v_n int;
  v_abertura date;
  v_cidade_consulta text;
  v_cidade_empresa text;
  v_hash text := md5(vagas_interno.normalizar(a.descricao));
begin
  for x in select * from jsonb_array_elements(l -> 'forte') loop
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'forte', 'texto', 'Texto: "' || (x ->> 'trecho') || '"'));
  end loop;
  for x in select * from jsonb_array_elements(l -> 'fraco') loop
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'Texto: "' || (x ->> 'trecho') || '"'));
  end loop;
  -- WhatsApp usado por empresa já suspensa (forte).
  if e.whatsapp <> '' and exists (select 1 from public.vagas_empresas o where o.whatsapp = e.whatsapp and o.id <> e.id and o.status = 'suspensa') then
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'forte', 'texto', 'WhatsApp igual ao de uma empresa suspensa'));
  end if;
  -- Salário muito acima do comum da área (fraco): mais de 2 vezes a média das vagas no ar da mesma área e unidade, ou teto absoluto.
  select avg(x.valor_min_centavos), count(*) into v_media, v_n from public.vagas_anuncios x
   where x.area = a.area and x.valor_unidade = a.valor_unidade and x.id <> a.id and x.status = 'publicado' and x.expira_em > now();
  if (v_n >= 5 and a.valor_min_centavos > 2 * v_media)
     or (v_n < 5 and a.valor_min_centavos > case a.valor_unidade when 'mes' then 1000000 when 'dia' then 60000 when 'hora' then 10000 else 1000000 end) then
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'Salário muito acima do comum da área'));
  end if;
  -- CNPJ aberto há menos de 90 dias, cidade da consulta diferente da cidade da empresa (fraco).
  if e.consulta_cnpj is not null then
    begin v_abertura := nullif(e.consulta_cnpj ->> 'abertura', '')::date; exception when others then v_abertura := null; end;
    if v_abertura is not null and v_abertura > current_date - 90 then
      v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'CNPJ aberto há menos de 90 dias'));
    end if;
    v_cidade_consulta := vagas_interno.normalizar(coalesce(e.consulta_cnpj ->> 'cidade', ''));
    select vagas_interno.normalizar(c.nome) into v_cidade_empresa from public.vagas_cidades c where c.id = e.cidade_id;
    if v_cidade_consulta <> '' and v_cidade_consulta <> coalesce(v_cidade_empresa, '')
       and not exists (select 1 from public.vagas_cidades c where vagas_interno.normalizar(c.nome) = v_cidade_consulta
                         and c.status in ('ativa', 'lista_espera')) then
      v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'Cidade do CNPJ fora da região'));
    end if;
  end if;
  -- Mais de 3 vagas na última hora, texto igual ao de vaga de outra empresa (fraco).
  if vagas_interno.contagem('anuncio_novo_hora', e.id::text, interval '1 hour') > 3 then
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'Mais de 3 vagas em 1 hora'));
  end if;
  if exists (select 1 from public.vagas_anuncios o where o.empresa_id <> e.id and o.id <> a.id and md5(vagas_interno.normalizar(o.descricao)) = v_hash) then
    v_sinais := v_sinais || jsonb_build_array(jsonb_build_object('tipo', 'fraco', 'texto', 'Texto igual ao de vaga de outra empresa'));
  end if;
  return v_sinais;
end;
$$;

create or replace function vagas_interno.v2_vagas_no_ar_empresa(p_empresa uuid, p_exceto uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.vagas_anuncios x
   where x.empresa_id = p_empresa and x.status = 'publicado' and x.expira_em > now() and (p_exceto is null or x.id <> p_exceto);
$$;

-- Vai para o ar (ou fica segurada / rascunho). Devolve {estado: 'no_ar'|'revisao_rapida'|'rascunho', mensagens:[], anuncio: linha}.
-- Quem chama já conferiu dono, cidade e texto. Não conta "vaga nova do dia": isso é de quem cria a vaga.
create or replace function vagas_interno.v2_publicar_interno(p_anuncio uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_estado text;
  v_sinais jsonb;
  v_forte boolean;
  v_fraco boolean;
  v_verificada boolean;
  v_msgs jsonb := '[]'::jsonb;
begin
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  v_estado := vagas_interno.v2_estado_empresa(e);
  v_verificada := v_estado = 'verificada';
  if v_estado = 'suspensa' then
    return jsonb_build_object('erro', 'Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'codigo', 'empresa_suspensa');
  end if;
  if v_estado in ('precisa_ajuste', 'vencida') then
    return jsonb_build_object('estado', 'rascunho', 'anuncio', to_jsonb(a), 'mensagens', jsonb_build_array(
      case when v_estado = 'vencida'
        then 'O prazo de 7 dias para verificar a empresa terminou. Envie o que falta em "Verificação" e peça nova conferência: a vaga fica salva como rascunho.'
        else 'A equipe pediu um ajuste nos dados da empresa. Corrija em "Verificação" e peça nova conferência: a vaga fica salva como rascunho.' end));
  end if;
  if a.modalidade = 'diaria' and a.data_trabalho < (select vagas_interno.hoje(c.fuso) from public.vagas_cidades c where c.id = a.cidade_id)
     and coalesce(a.extra ->> 'repete', 'false') <> 'true' then
    return jsonb_build_object('erro', 'A data da diária já passou. Escolha outra data.', 'codigo', 'data_passada');
  end if;
  if not v_verificada and vagas_interno.v2_vagas_no_ar_empresa(a.empresa_id, a.id) >= 3 then
    return jsonb_build_object('estado', 'rascunho', 'anuncio', to_jsonb(a), 'mensagens', jsonb_build_array(
      'Sua empresa está em verificação e pode ter 3 vagas no ar ao mesmo tempo. Esta vaga ficou salva como rascunho: pause ou encerre outra vaga, ou espere a verificação, e publique de novo.'));
  end if;
  v_sinais := vagas_interno.v2_sinais_vaga(a, e);
  v_forte := exists (select 1 from jsonb_array_elements(v_sinais) s where s ->> 'tipo' = 'forte');
  v_fraco := exists (select 1 from jsonb_array_elements(v_sinais) s where s ->> 'tipo' = 'fraco');
  if v_forte then
    update public.vagas_anuncios set status = 'em_revisao', segurada = true, sinais = v_sinais, status_motivo = '',
      revisar_depois_em = coalesce(revisar_depois_em, now()), revisada_em = null where id = a.id returning * into a;
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
    values (a.cidade_id, null, 'sistema', 'segurar_vaga', 'anuncio', a.id, 'Sinal forte: revisão rápida antes de ir ao ar.');
    return jsonb_build_object('estado', 'revisao_rapida', 'anuncio', to_jsonb(a), 'mensagens', jsonb_build_array(
      'Sua vaga está em revisão rápida e entra no ar assim que a equipe liberar (meta: 2 horas úteis). Nada se perde.'));
  end if;
  update public.vagas_anuncios set status = 'publicado', segurada = false, status_motivo = '', sinais = v_sinais,
    publicado_em = coalesce(publicado_em, now()), expira_em = vagas_interno.expira_calculada(a),
    revisar_depois_em = case when not v_verificada or v_fraco then coalesce(revisar_depois_em, now()) else revisar_depois_em end,
    revisada_em = case when not v_verificada or v_fraco then null else revisada_em end
   where id = a.id returning * into a;
  if not v_verificada then
    v_msgs := jsonb_build_array('Sua vaga já está no ar com o selo "Empresa em verificação". A equipe confere a empresa em até 7 dias.');
  else
    v_msgs := jsonb_build_array('Sua vaga já está no ar.');
  end if;
  return jsonb_build_object('estado', 'no_ar', 'anuncio', to_jsonb(a), 'mensagens', v_msgs);
end;
$$;

-- Versão antiga (telas antigas, ainda no banco): sem a revisão antes. Empresa em verificação publica na hora (até 3 no ar).
create or replace function public.vagas_anuncio_publicar(p_anuncio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  r jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
  if a.status = 'publicado' then return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a), 'emRevisao', false, 'duplicado', true)); end if;
  if a.status = 'em_revisao' then return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a), 'emRevisao', true, 'duplicado', true)); end if;
  if a.status in ('suspenso', 'removido') then return vagas_interno.erro('Esta vaga está fora do ar pela moderação.'); end if;
  if a.status <> 'rascunho' then return vagas_interno.erro('Esta vaga já foi publicada. Use "Retomar" ou "Renovar".'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.'); end if;
  if not exists (select 1 from public.vagas_cidades c where c.id = a.cidade_id and c.status in ('ativa', 'lista_espera')) then
    return vagas_interno.erro('Ainda não chegamos a esta cidade. Entre na lista de espera.');
  end if;
  if a.modalidade = 'diaria' and a.data_trabalho < (select vagas_interno.hoje(c.fuso) from public.vagas_cidades c where c.id = a.cidade_id) then
    return vagas_interno.erro('A data da diária já passou. Escolha outra data.');
  end if;
  r := vagas_interno.v2_publicar_interno(a.id);
  if r ? 'erro' then return vagas_interno.erro(r ->> 'erro'); end if;
  select * into a from public.vagas_anuncios where id = p_anuncio;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a), 'emRevisao', r ->> 'estado' = 'revisao_rapida',
    'estado', r ->> 'estado', 'mensagens', r -> 'mensagens'));
end;
$$;

-- A equipe publica/devolve/remove: empresa em verificação (não vencida, não suspensa) PODE ter vaga no ar; sem "Aprove a empresa antes".
create or replace function public.vagas_op_anuncio_decidir(p_anuncio uuid, p_acao text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_motivo text := disc_interno.limpar_texto(p_motivo, 300);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  if not found then return vagas_interno.erro('Vaga não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(a.cidade_id);
  if v_papel is null then return vagas_interno.erro('Vaga não encontrada.'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if p_acao = 'publicar' then
    if a.status not in ('em_revisao', 'suspenso') then return vagas_interno.erro('Esta vaga não está esperando a moderação.'); end if;
    if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa: reative a empresa antes de publicar a vaga.'); end if;
    if a.modalidade = 'diaria' and a.data_trabalho < (select vagas_interno.hoje(c.fuso) from public.vagas_cidades c where c.id = a.cidade_id)
       and coalesce(a.extra ->> 'repete', 'false') <> 'true' then
      return vagas_interno.erro('A data da diária já passou.');
    end if;
    if a.status = 'em_revisao' or a.expira_em is null or a.expira_em <= now() then
      update public.vagas_anuncios set status = 'publicado', segurada = false, status_motivo = '', publicado_em = coalesce(publicado_em, now()),
        expira_em = vagas_interno.expira_calculada(a), revisada_em = now() where id = a.id returning * into a;
    else
      update public.vagas_anuncios set status = 'publicado', segurada = false, status_motivo = '', revisada_em = now() where id = a.id returning * into a;
    end if;
    update public.vagas_denuncias set status = 'improcedente', decidida_por = auth.uid(), decidida_em = now(),
      decisao_motivo = coalesce(nullif(v_motivo, ''), 'Vaga devolvida ao ar pela moderação.')
     where anuncio_id = a.id and alvo = 'anuncio' and status = 'aberta';
  elsif p_acao = 'devolver' then
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    if a.status not in ('em_revisao', 'suspenso') then return vagas_interno.erro('Esta vaga não está esperando a moderação.'); end if;
    update public.vagas_anuncios set status = 'rascunho', segurada = false, status_motivo = v_motivo where id = a.id returning * into a;
  elsif p_acao = 'remover' then
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    update public.vagas_anuncios set status = 'removido', segurada = false, status_motivo = v_motivo where id = a.id returning * into a;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  perform vagas_interno.registrar(a.cidade_id, v_papel, 'anuncio_' || p_acao, 'anuncio', a.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

-- Renovar/retomar da tela antiga: só exigia empresa 'ativa'; agora vale para empresa em verificação dentro do prazo.
create or replace function public.vagas_anuncio_acao(p_anuncio uuid, p_acao text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if a.status in ('suspenso', 'removido') then return vagas_interno.erro('Esta vaga está fora do ar pela moderação.'); end if;
  if p_acao = 'pausar' then
    if a.status <> 'publicado' then return vagas_interno.erro('Só dá para pausar uma vaga que está no ar.'); end if;
    update public.vagas_anuncios set status = 'pausado' where id = a.id returning * into a;
  elsif p_acao = 'retomar' then
    if a.status <> 'pausado' then return vagas_interno.erro('Só dá para retomar uma vaga pausada.'); end if;
    if a.expira_em <= now() then return vagas_interno.erro('O prazo desta vaga acabou. Use "Renovar".'); end if;
    if not vagas_interno.v2_empresa_anuncia(e) then return vagas_interno.erro('Esta empresa não pode anunciar agora. Veja a verificação.'); end if;
    update public.vagas_anuncios set status = 'publicado' where id = a.id returning * into a;
  elsif p_acao = 'encerrar' then
    if a.status <> 'encerrado' then
      update public.vagas_anuncios set status = 'encerrado', encerrado_em = now() where id = a.id returning * into a;
    end if;
  elsif p_acao = 'renovar' then
    if a.modalidade = 'diaria' then return vagas_interno.erro('Para outra data, crie uma diária nova.'); end if;
    if a.status not in ('publicado', 'pausado', 'encerrado') then return vagas_interno.erro('Só dá para renovar uma vaga que já foi publicada.'); end if;
    if not vagas_interno.v2_empresa_anuncia(e) then return vagas_interno.erro('Esta empresa não pode anunciar agora. Veja a verificação.'); end if;
    update public.vagas_anuncios set status = 'publicado', encerrado_em = null, expira_em = vagas_interno.expira_calculada(a)
     where id = a.id returning * into a;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

-- A recusa da equipe (legado) passa a tirar as vagas do ar e dar a saída "Corrigir e pedir nova conferência".
create or replace function public.vagas_op_empresa_decidir(p_empresa uuid, p_acao text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_motivo text := disc_interno.limpar_texto(p_motivo, 300);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into e from public.vagas_empresas where id = p_empresa for update;
  if not found then return vagas_interno.erro('Empresa não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(e.cidade_id);
  if v_papel is null then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if p_acao = 'aprovar' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if e.status = 'suspensa' then return vagas_interno.erro('Empresa suspensa: use "Reativar".'); end if;
    if e.status <> 'ativa' then
      update public.vagas_empresas set status = 'ativa', status_motivo = '', verificacao_estado = 'verificada', verificacao_motivo = '',
        cnpj_conferido_em = coalesce(cnpj_conferido_em, now()), cnpj_conferido_por = coalesce(cnpj_conferido_por, auth.uid())
       where id = e.id returning * into e;
    end if;
  elsif p_acao = 'suspender' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    update public.vagas_empresas set status = 'suspensa', status_motivo = v_motivo where id = e.id returning * into e;
  elsif p_acao = 'recusar' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    if e.status <> 'em_analise' then return vagas_interno.erro('Só dá para recusar uma empresa em análise.'); end if;
    update public.vagas_empresas set status_motivo = v_motivo, verificacao_estado = 'precisa_ajuste', verificacao_motivo = v_motivo
     where id = e.id returning * into e;
  elsif p_acao = 'reativar' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if e.status <> 'suspensa' then return vagas_interno.erro('Esta empresa não está suspensa.'); end if;
    update public.vagas_empresas set status = 'ativa', status_motivo = '', verificacao_estado = 'verificada',
      cnpj_conferido_em = coalesce(cnpj_conferido_em, now()), cnpj_conferido_por = coalesce(cnpj_conferido_por, auth.uid())
     where id = e.id returning * into e;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  perform vagas_interno.registrar(e.cidade_id, v_papel, 'empresa_' || p_acao, 'empresa', e.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('empresa', vagas_interno.empresa_json(e)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Permissões e versão
-- -----------------------------------------------------------------------------

revoke all on all functions in schema vagas_interno from public;
do $$
declare
  papel text;
  f record;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on all functions in schema vagas_interno from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema vagas_interno to service_role;
  end if;
  for f in select p.oid::regprocedure as assinatura from pg_catalog.pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname in ('vagas_anuncio_publicar', 'vagas_op_anuncio_decidir',
              'vagas_anuncio_acao', 'vagas_op_empresa_decidir') loop
    execute format('revoke all on function %s from public', f.assinatura);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f.assinatura, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f.assinatura); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f.assinatura); end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco(): a lista da 20261024120005 + as migrações da v2 até esta
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
                                       and to_regprocedure('public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[], uuid[])') is not null),
      (24, '20261024120004_vagas_pre_abertura', exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.vagas_anuncios')
                                                    and a.attname = 'pre_abertura' and not a.attisdropped)
                                       and exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.vagas_lista_espera')
                                                    and a.attname = 'origem' and not a.attisdropped)
                                       and to_regprocedure('public.vagas_conta_lista_espera(jsonb, text, text, boolean)') is not null),
      (25, '20261024120005_vagas_fase_c', to_regclass('public.vagas_referencia_envios_email') is not null
                                 and exists (select 1 from pg_catalog.pg_attribute a
                                              where a.attrelid = to_regclass('public.vagas_acessos_contato')
                                                and a.attname = 'papel' and not a.attisdropped)
                                 and to_regprocedure('vagas_interno.foto_aceita(uuid)') is not null
                                 and to_regclass('vagas_interno.denuncias_referencia') is not null),
      (26, '20261101120000_vagas_v2_base', exists (select 1 from pg_catalog.pg_attribute a
                                                  where a.attrelid = to_regclass('public.vagas_anuncios')
                                                    and a.attname = 'extra' and not a.attisdropped)
                                       and to_regprocedure('vagas_interno.conferir_lista(text, text)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261101120000, 'migracoes', to_jsonb(aplicadas),
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

-- =============================================================================
-- Teste DISC — Pesquisa de Clima da Equipe: modos de identificação (anônima, identificação opcional, identificada).
-- Roda DEPOIS de 20261017120000_clima.sql (14ª migração). Idempotente e seguro sobre dados reais: só acrescenta colunas
-- (as rodadas que já existem continuam ANÔNIMAS), tabelas, funções, gatilhos e políticas novas, e recria funções da
-- 20261017 mantendo o comportamento antigo intacto no modo anônimo. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Regras combinadas com o dono (registro: docs/SPEC.md, seção "Pesquisa de Clima: modos de identificação"):
--   * clima_rodadas.modo: 'anonima' (padrão, como a versão 1) | 'opcional' (link pessoal; no fim a pessoa escolhe se
--     identificar ou manter o anonimato) | 'identificada' (todos se identificam pelo link pessoal; sem link coletivo).
--     clima_rodadas.metodos: formas de confirmação ligadas na rodada ('email', 'whatsapp', 'dados'). Os dois ficam
--     TRAVADOS depois de criada a rodada.
--   * A identificação NUNCA muda o relatório do cliente: o cálculo, a supressão (k = 5/10) e o snapshot são os mesmos;
--     o snapshot só ganha rodada.modo (o relatório diz "pesquisa identificada", por transparência).
--   * public.clima_convites      link pessoal por colaborador (liderados diretos ativos de cada equipe, na criação),
--                                de USO ÚNICO quando a pessoa se identifica; formas de confirmação do link; cópia do hash
--                                de conferência (CPF/data) da rodada.
--   * public.clima_codigos       código de 6 dígitos (só o hash com sal), validade de 10 minutos, 5 tentativas; enviado
--                                por e-mail (Resend) ou WhatsApp (sem provedor ainda) pela Edge Function "clima".
--   * public.clima_conferencias  "3 últimos dígitos do CPF + dia e mês de nascimento" informados pela empresa no cadastro
--                                do colaborador: SÓ hash com sal (sha256), nunca o dado em claro. Fraco contra quem já
--                                conhece a data (são poucas combinações): é só uma barreira contra troca casual.
--                                Apagado junto com as respostas da rodada que o usou (retenção ou exclusão) e ao desligar
--                                o colaborador.
--   * public.clima_identificacoes liga uma resposta ao colaborador (só no modo opcional com "quero me identificar" e no
--                                modo identificado). Nunca IP. Sai junto com as respostas brutas (retenção).
--   * public.clima_acessos       registro de quem (administrador) abriu a tela "uso interno da consultoria" e quando.
--   * Ninguém lê essas tabelas pela API (nem o admin): só pelas funções. O cliente (relatório) nunca vê nomes.
--   * Funções novas: clima_codigo_novo (só service_role: Edge Function "clima"), clima_identificacao (admin; registra o
--     acesso), clima_desidentificar, clima_convite_renovar, clima_colaboradores_dados, clima_colaborador_salvar.
--   * Recriadas: clima_publica, clima_enviar, clima_criar_rodada, clima_gerar_relatorio, clima_excluir_rodada,
--     clima_apagar_brutas, disc_interno.clima_rodada_json e versao_banco (versão 20261018120000).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rodada: modo e formas de confirmação (travados depois de criada)
-- -----------------------------------------------------------------------------

alter table public.clima_rodadas add column if not exists modo text not null default 'anonima';
alter table public.clima_rodadas add column if not exists metodos text[] not null default '{}'::text[];
alter table public.clima_rodadas drop constraint if exists clima_rodadas_modo_valido;
alter table public.clima_rodadas add constraint clima_rodadas_modo_valido check (modo in ('anonima', 'opcional', 'identificada'));
alter table public.clima_rodadas drop constraint if exists clima_rodadas_metodos_validos;
alter table public.clima_rodadas add constraint clima_rodadas_metodos_validos
  check (metodos <@ array['email', 'whatsapp', 'dados']::text[] and (modo <> 'anonima' or cardinality(metodos) = 0));

create or replace function disc_interno.clima_rodadas_modo_travado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.modo is distinct from old.modo or new.metodos is distinct from old.metodos then
    raise exception 'O modo da pesquisa e as formas de confirmação não mudam depois que ela é criada.';
  end if;
  return new;
end;
$$;
drop trigger if exists clima_rodadas_modo_travado on public.clima_rodadas;
create trigger clima_rodadas_modo_travado before update on public.clima_rodadas
  for each row execute function disc_interno.clima_rodadas_modo_travado();

-- -----------------------------------------------------------------------------
-- Tabelas novas
-- -----------------------------------------------------------------------------

create table if not exists public.clima_conferencias (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  pessoa_id  uuid not null references public.pessoas (id) on delete cascade,
  sal        text not null check (sal ~ '^[0-9a-f]{32}$'),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  criado_em  timestamptz not null default now(),
  primary key (empresa_id, pessoa_id)
);

create table if not exists public.clima_convites (
  id         uuid primary key default gen_random_uuid(),
  rodada_id  uuid not null references public.clima_rodadas (id) on delete cascade,
  equipe_id  uuid not null references public.clima_equipes (id) on delete cascade,
  pessoa_id  uuid not null,   -- fotografia do organograma (sem chave estrangeira, como clima_equipes.lider_pessoa_id)
  nome       text not null check (char_length(nome) between 1 and 120),
  token      text not null unique check (token ~ '^[0-9a-f]{64}$'),
  metodos    text[] not null default '{}'::text[] check (metodos <@ array['email', 'whatsapp', 'dados']::text[]),
  conf_sal   text check (conf_sal is null or conf_sal ~ '^[0-9a-f]{32}$'),
  conf_hash  text check (conf_hash is null or conf_hash ~ '^[0-9a-f]{64}$'),
  usado      boolean not null default false,
  constraint clima_convites_um_por_equipe unique (equipe_id, pessoa_id)
);
create index if not exists clima_convites_rodada_idx on public.clima_convites (rodada_id);

create table if not exists public.clima_codigos (
  convite_id uuid primary key references public.clima_convites (id) on delete cascade,
  canal      text not null check (canal in ('email', 'whatsapp')),
  sal        text not null check (sal ~ '^[0-9a-f]{32}$'),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  expira_em  timestamptz not null,
  tentativas int not null default 0 check (tentativas >= 0),
  criado_em  timestamptz not null default now()
);

create table if not exists public.clima_identificacoes (
  resposta_id    uuid primary key references public.clima_respostas (id) on delete cascade,
  rodada_id      uuid not null references public.clima_rodadas (id) on delete cascade,
  convite_id     uuid unique references public.clima_convites (id) on delete set null,
  pessoa_id      uuid not null,
  nome           text not null check (char_length(nome) between 1 and 120),
  confirmado_por text not null check (confirmado_por in ('email', 'whatsapp', 'dados', 'link'))
);
create index if not exists clima_identificacoes_rodada_idx on public.clima_identificacoes (rodada_id);

-- Sem chave estrangeira: o registro de acesso continua mesmo se a pesquisa for excluída (só nome do admin e horário).
create table if not exists public.clima_acessos (
  id         uuid primary key default gen_random_uuid(),
  rodada_id  uuid not null,
  empresa_id uuid,
  admin_id   uuid,
  admin_nome text not null default '' check (char_length(admin_nome) <= 160),
  acao       text not null check (acao in ('abrir', 'desidentificar')),
  em         timestamptz not null default now()
);
create index if not exists clima_acessos_rodada_idx on public.clima_acessos (rodada_id, em desc);

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------

-- Hash com sal (sha256 de "sal:valor"), em hex.
create or replace function disc_interno.clima_hash(p_sal text, p_valor text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(coalesce(p_sal, '') || ':' || coalesce(p_valor, ''), 'UTF8')), 'hex');
$$;

create or replace function disc_interno.clima_sal()
returns text language sql volatile set search_path = '' as $$
  select replace(pg_catalog.gen_random_uuid()::text, '-', '');
$$;

-- Código de 6 dígitos com o gerador criptográfico do Postgres (48 bits aleatórios; viés desprezível no módulo).
create or replace function disc_interno.clima_codigo6()
returns text language sql volatile set search_path = '' as $$
  select lpad(((('x' || lpad(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12), 16, '0'))::bit(64)::bigint)
    % 1000000)::text, 6, '0');
$$;

-- {cpf3, nascimento} -> 'ccc:DDMM' (mesma regra de DISC_CLIMA.normalizarConferencia) ou null se inválido.
-- nascimento: "DD/MM", "D/M", "DD-MM", "DD.MM" ou "DDMM"; data de calendário válida (29/02 vale).
create or replace function disc_interno.clima_dados_norm(p jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_cpf text;
  v_nasc text;
  m text[];
  v_dia int;
  v_mes int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  v_cpf := btrim(disc_interno.texto(p -> 'cpf3'));
  if v_cpf !~ '^[0-9]{3}$' then return null; end if;
  v_nasc := btrim(disc_interno.texto(p -> 'nascimento'));
  m := regexp_match(v_nasc, '^([0-9]{1,2}) *[/.-] *([0-9]{1,2})$');
  if m is null then m := regexp_match(v_nasc, '^([0-9]{2})([0-9]{2})$'); end if;
  if m is null then return null; end if;
  v_dia := m[1]::int;
  v_mes := m[2]::int;
  if v_mes < 1 or v_mes > 12 or v_dia < 1
     or v_dia > (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])[v_mes] then
    return null;
  end if;
  return v_cpf || ':' || lpad(v_dia::text, 2, '0') || lpad(v_mes::text, 2, '0');
end;
$$;

-- "ana.souza@empresa.com.br" -> "a***@e***.com.br" (como DISC_CLIMA.mascararEmail).
create or replace function disc_interno.clima_mascarar_email(p text)
returns text language sql immutable set search_path = '' as $$
  select case when lower(btrim(coalesce(p, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+$' then ''
    else left(split_part(lower(btrim(p)), '@', 1), 1) || '***@' || left(split_part(lower(btrim(p)), '@', 2), 1) || '***'
         || coalesce(substring(split_part(lower(btrim(p)), '@', 2) from '(\.[^@]*)$'), '') end;
$$;

create or replace function disc_interno.clima_email_valido(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(p) <= 120;
$$;

-- Escores 0–100 de uma pessoa, já arredondados (tela de uso interno).
create or replace function disc_interno.clima_escores_inteiros(p_itens jsonb, p_papel text)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, case when jsonb_typeof(v) = 'number'
           then to_jsonb(disc_interno.clima_arred((v #>> '{}')::numeric)) else 'null'::jsonb end), '{}'::jsonb)
    from jsonb_each(disc_interno.clima_escores(p_itens, p_papel)) as t(k, v);
$$;

-- Nome do administrador logado (para o registro de acesso).
create or replace function disc_interno.clima_admin_nome()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select coalesce(nullif(btrim(a.nome), ''), u.email, '')
                     from public.admins a left join auth.users u on u.id = a.user_id
                    where a.user_id = auth.uid()), '');
$$;

-- Apaga do cadastro os dados de conferência (CPF/data) copiados para os links pessoais destas rodadas — só se não
-- mudaram depois (o hash do cadastro ainda é o mesmo da cópia). "Apagados junto com as respostas da rodada."
create or replace function disc_interno.clima_apagar_conferencias(p_ids uuid[])
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  delete from public.clima_conferencias cf
   using public.clima_convites cv, public.clima_rodadas r
   where cv.rodada_id = any(p_ids) and r.id = cv.rodada_id and cv.conf_hash is not null
     and cf.empresa_id = r.empresa_id and cf.pessoa_id = cv.pessoa_id and cf.hash = cv.conf_hash;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Ao desligar (ou excluir) o vínculo, os dados de conferência daquela empresa saem.
create or replace function disc_interno.clima_conferencia_ao_desligar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'ativo' and (tg_op = 'DELETE' or new.status <> 'ativo' or new.empresa_id <> old.empresa_id
                                or new.pessoa_id <> old.pessoa_id) then
    delete from public.clima_conferencias c where c.empresa_id = old.empresa_id and c.pessoa_id = old.pessoa_id;
  end if;
  return null;
end;
$$;
drop trigger if exists clima_conferencia_ao_desligar on public.vinculos;
create trigger clima_conferencia_ao_desligar after update or delete on public.vinculos
  for each row execute function disc_interno.clima_conferencia_ao_desligar();

-- -----------------------------------------------------------------------------
-- Rodada no formato do painel (+ modo, formas de confirmação, links pessoais e quantas se identificaram)
-- -----------------------------------------------------------------------------

create or replace function disc_interno.clima_rodada_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'empresaId', r.empresa_id, 'nome', r.nome, 'status', r.status,
    'complemento', r.complemento, 'n4', r.complemento and r.canal_texto <> '', 'canalTexto', r.canal_texto, 'canalUrl', r.canal_url,
    'contatoDados', r.contato_dados, 'versaoItens', r.versao_itens, 'retencaoDias', r.retencao_dias,
    'abertaEm', disc_interno.iso(r.aberta_em), 'encerradaEm', disc_interno.iso(r.encerrada_em),
    'entregueEm', disc_interno.iso(r.entregue_em), 'brutasApagadasEm', disc_interno.iso(r.brutas_apagadas_em),
    'modo', r.modo, 'metodos', to_jsonb(r.metodos),
    'identificadas', (select count(*) from public.clima_identificacoes i where i.rodada_id = r.id),
    'convidados', (select coalesce(sum(e.convidados), 0) from public.clima_equipes e where e.rodada_id = r.id),
    'respondentes', case when r.brutas_apagadas_em is not null then coalesce((r.resultado ->> 'respondentes')::int, 0)
                         else (select count(*) from public.clima_respostas x where x.rodada_id = r.id and x.papel = 'membro') end,
    'equipes', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'area', e.area, 'ordem', e.ordem,
                  'convidados', e.convidados,
                  'respondentes', case when r.brutas_apagadas_em is not null
                                       then coalesce((select (q ->> 'respondentes')::int from jsonb_array_elements(r.resultado -> 'equipes') q
                                                       where q ->> 'id' = e.id::text), 0)
                                       else (select count(*) from public.clima_respostas x where x.equipe_id = e.id and x.papel = 'membro') end,
                  'tokenEquipe', e.token_equipe, 'tokenLider', e.token_lider,
                  'convites', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'pessoaId', c.pessoa_id, 'nome', c.nome,
                                 'token', c.token, 'metodos', to_jsonb(c.metodos)) order by c.nome, c.id), '[]'::jsonb)
                                 from public.clima_convites c where c.equipe_id = e.id)) order by e.ordem), '[]'::jsonb)
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

-- Link coletivo (equipe), do líder ou PESSOAL (convite). Link pessoal já usado: {ok:false, usado:true}.
-- Modo identificado: o link coletivo não abre (só os pessoais e o do líder).
create or replace function public.clima_publica(p_token text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  MSG_LINK constant text := 'Link inválido ou pesquisa encerrada. Fale com quem enviou o link.';
  e public.clima_equipes%rowtype;
  r public.clima_rodadas%rowtype;
  cv public.clima_convites%rowtype;
  v_papel text;
  v_pessoal boolean := false;
  v_emp text;
  v_email text := '';
  v_tel text := '';
  v_saida jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return disc_interno.erro(MSG_LINK);
  end if;
  select * into e from public.clima_equipes where token_equipe = p_token;
  if found then v_papel := 'membro';
  else
    select * into e from public.clima_equipes where token_lider = p_token;
    if found then v_papel := 'lider';
    else
      select * into cv from public.clima_convites where token = p_token;
      if found then
        select * into e from public.clima_equipes where id = cv.equipe_id;
        v_papel := 'membro';
        v_pessoal := true;
      end if;
    end if;
  end if;
  if v_papel is null then
    return disc_interno.erro(MSG_LINK);
  end if;
  select * into r from public.clima_rodadas where id = e.rodada_id;
  if r.status <> 'aberta' then
    return json_build_object('ok', false, 'erro', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!', 'encerrada', true);
  end if;
  if v_pessoal and cv.usado then
    return json_build_object('ok', false, 'erro', 'Este link pessoal já foi usado para responder. Obrigado!', 'usado', true);
  end if;
  if not v_pessoal and v_papel = 'membro' and r.modo = 'identificada' then
    return disc_interno.erro('Esta pesquisa é identificada: responda pelo link pessoal que você recebeu.');
  end if;
  select nome into v_emp from public.empresas where id = r.empresa_id;
  v_saida := jsonb_build_object('ok', true, 'papel', v_papel, 'empresaNome', coalesce(v_emp, ''), 'equipeNome', e.nome,
    'complemento', r.complemento, 'n4', r.complemento and r.canal_texto <> '', 'canalTexto', r.canal_texto, 'canalUrl', r.canal_url,
    'contatoDados', r.contato_dados, 'retencaoDias', r.retencao_dias, 'versaoItens', r.versao_itens,
    'modo', r.modo, 'pessoal', v_pessoal);
  if v_pessoal then
    select coalesce(p.email, ''), regexp_replace(coalesce(p.telefone, ''), '[^0-9]', '', 'g') into v_email, v_tel
      from public.pessoas p where p.id = cv.pessoa_id;
    v_saida := v_saida || jsonb_build_object('metodos', to_jsonb(cv.metodos),
      'emailMascarado', case when 'email' = any(cv.metodos) then disc_interno.clima_mascarar_email(v_email) else '' end,
      'whatsappFinal', case when 'whatsapp' = any(cv.metodos) then right(coalesce(v_tel, ''), 2) else '' end);
  end if;
  return v_saida::json;
end;
$$;

-- Envio. p_respostas = {itens, comentario, segundos, chave (32 hex aleatórios do aparelho)} como na versão 1, e no link
-- pessoal também: identificar (modo opcional: true = "quero me identificar"; ausente/false = anônimo, como o link
-- coletivo, SEM marcar o link) e confirmacao = {metodo:'email'|'whatsapp', codigo:'123456'} | {metodo:'dados', cpf3,
-- nascimento:'DD/MM'}. Sem nenhuma forma de confirmação no link, o próprio link pessoal (de uso único) identifica.
create or replace function public.clima_enviar(p_token text, p_respostas jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  MSG_FORMATO constant text := 'Respostas em formato inválido.';
  MSG_LINK constant text := 'Link inválido ou pesquisa encerrada. Fale com quem enviou o link.';
  MSG_CODIGO constant text := 'Código incorreto ou vencido. Confira os 6 dígitos ou peça um novo código.';
  e public.clima_equipes%rowtype;
  r public.clima_rodadas%rowtype;
  cv public.clima_convites%rowtype;
  cd public.clima_codigos%rowtype;
  v_papel text;
  v_pessoal boolean := false;
  v_identificar boolean := false;
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
  v_conf jsonb;
  v_metodo text;
  v_por text;
  v_valor text;
  v_resp uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return disc_interno.erro(MSG_LINK);
  end if;
  select * into e from public.clima_equipes where token_equipe = p_token for update;
  if found then v_papel := 'membro';
  else
    select * into e from public.clima_equipes where token_lider = p_token for update;
    if found then v_papel := 'lider';
    else
      select * into cv from public.clima_convites where token = p_token for update;
      if found then
        select * into e from public.clima_equipes where id = cv.equipe_id for update;
        v_papel := 'membro';
        v_pessoal := true;
      end if;
    end if;
  end if;
  if v_papel is null then
    return disc_interno.erro(MSG_LINK);
  end if;
  select * into r from public.clima_rodadas where id = e.rodada_id;
  if r.status <> 'aberta' then
    return json_build_object('ok', false, 'erro', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!', 'encerrada', true);
  end if;
  if not v_pessoal and v_papel = 'membro' and r.modo = 'identificada' then
    return disc_interno.erro('Esta pesquisa é identificada: responda pelo link pessoal que você recebeu.');
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
  if v_pessoal and cv.usado then
    return json_build_object('ok', false, 'erro', 'Este link pessoal já foi usado para responder. Obrigado!', 'usado', true);
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

  -- identificação (só no link pessoal): modo identificado sempre; modo opcional só com "quero me identificar"
  if v_pessoal then
    v_identificar := r.modo = 'identificada' or (r.modo = 'opcional' and p_respostas -> 'identificar' = 'true'::jsonb);
  end if;
  if v_identificar then
    if cardinality(cv.metodos) = 0 then
      v_por := 'link';
    else
      v_conf := case when jsonb_typeof(p_respostas -> 'confirmacao') = 'object' then p_respostas -> 'confirmacao' else '{}'::jsonb end;
      v_metodo := disc_interno.texto(v_conf -> 'metodo');
      if not (v_metodo = any(cv.metodos)) then
        return json_build_object('ok', false, 'erro', 'Confirme que é você antes de enviar.', 'confirmar', true);
      end if;
      if v_metodo = 'dados' then
        if (select count(*) from public.limites_vendas l
             where l.tipo = 'clima_dados' and l.chave = cv.id::text and l.em > now() - interval '24 hours') >= 5 then
          return disc_interno.erro('Muitas tentativas com dados que não conferem. Tente de novo amanhã ou fale com quem enviou o link.');
        end if;
        v_valor := disc_interno.clima_dados_norm(v_conf);
        if v_valor is null then
          return disc_interno.erro('Informe os 3 últimos dígitos do CPF e o dia e o mês de nascimento (DD/MM).');
        end if;
        if cv.conf_hash is null or disc_interno.clima_hash(cv.conf_sal, v_valor) <> cv.conf_hash then
          perform disc_interno.contar_tentativa('clima_dados', cv.id::text, interval '24 hours');
          return disc_interno.erro('Os dados não conferem com o cadastro. Confira e tente de novo.');
        end if;
      else
        select * into cd from public.clima_codigos where convite_id = cv.id for update;
        if cd.convite_id is null or cd.canal <> v_metodo or cd.expira_em < now() or cd.tentativas >= 5 then
          return disc_interno.erro(MSG_CODIGO);
        end if;
        v_valor := regexp_replace(disc_interno.texto(v_conf -> 'codigo'), '[^0-9]', '', 'g');
        if v_valor !~ '^[0-9]{6}$' or disc_interno.clima_hash(cd.sal, v_valor) <> cd.hash then
          update public.clima_codigos set tentativas = tentativas + 1 where convite_id = cv.id;
          return disc_interno.erro(MSG_CODIGO);
        end if;
        delete from public.clima_codigos where convite_id = cv.id;
      end if;
      v_por := v_metodo;
    end if;
  end if;

  insert into public.clima_respostas (rodada_id, equipe_id, papel, versao_itens, itens, comentario, segundos)
    values (r.id, e.id, v_papel, r.versao_itens, v_itens, v_com, v_seg)
    returning id into v_resp;
  if v_identificar then
    insert into public.clima_identificacoes (resposta_id, rodada_id, convite_id, pessoa_id, nome, confirmado_por)
      values (v_resp, r.id, cv.id, cv.pessoa_id, cv.nome, v_por);
    update public.clima_convites set usado = true where id = cv.id;
    delete from public.clima_codigos where convite_id = cv.id;
  end if;
  insert into public.clima_recebidos (rodada_id, chave) values (r.id, v_hash);
  if v_identificar then
    return json_build_object('ok', true, 'identificada', true);
  end if;
  return json_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Código de confirmação: só a Edge Function "clima" (service_role) gera — ela manda por e-mail/WhatsApp.
-- Mensagem única para link inválido, usado, sem e-mail etc. (não revela se a pessoa existe ou o que falta).
-- Limites: 1 por minuto, 5 por link a cada 24 h e 500 a cada 10 min no total; validade 10 min; 5 tentativas.
-- -----------------------------------------------------------------------------

create or replace function public.clima_codigo_novo(p_token text, p_canal text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  MSG constant text := 'Não foi possível enviar um código por este link. Use outra forma de confirmação ou fale com quem enviou o link.';
  cv public.clima_convites%rowtype;
  r public.clima_rodadas%rowtype;
  v_email text;
  v_tel text;
  v_destino text;
  v_codigo text;
  v_sal text;
  v_ult timestamptz;
  v_emp text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_canal is null or p_canal not in ('email', 'whatsapp') then
    return disc_interno.erro(MSG);
  end if;
  select * into cv from public.clima_convites where token = p_token for update;
  if not found or cv.usado or not (p_canal = any(cv.metodos)) then return disc_interno.erro(MSG); end if;
  select * into r from public.clima_rodadas where id = cv.rodada_id;
  if r.status <> 'aberta' then return disc_interno.erro(MSG); end if;
  select lower(btrim(coalesce(p.email, ''))), regexp_replace(coalesce(p.telefone, ''), '[^0-9]', '', 'g') into v_email, v_tel
    from public.pessoas p where p.id = cv.pessoa_id;
  v_destino := case when p_canal = 'email' then coalesce(v_email, '') else coalesce(v_tel, '') end;
  if (p_canal = 'email' and not disc_interno.clima_email_valido(v_destino)) or (p_canal = 'whatsapp' and v_destino !~ '^[0-9]{10,13}$') then
    return disc_interno.erro(MSG);
  end if;
  select c.criado_em into v_ult from public.clima_codigos c where c.convite_id = cv.id;
  if v_ult is not null and v_ult > now() - interval '60 seconds' then
    return disc_interno.erro('Espere um minuto antes de pedir outro código.');
  end if;
  if disc_interno.contar_tentativa('clima_codigo', cv.id::text, interval '24 hours') > 5
     or disc_interno.contar_tentativa('clima_codigo_total', '', interval '10 minutes') > 500 then
    return disc_interno.erro('Muitos pedidos de código. Use outra forma de confirmação ou tente de novo mais tarde.');
  end if;
  v_codigo := disc_interno.clima_codigo6();
  v_sal := disc_interno.clima_sal();
  insert into public.clima_codigos (convite_id, canal, sal, hash, expira_em, tentativas, criado_em)
    values (cv.id, p_canal, v_sal, disc_interno.clima_hash(v_sal, v_codigo), now() + interval '10 minutes', 0, now())
    on conflict (convite_id) do update set canal = excluded.canal, sal = excluded.sal, hash = excluded.hash,
      expira_em = excluded.expira_em, tentativas = 0, criado_em = excluded.criado_em;
  select nome into v_emp from public.empresas where id = r.empresa_id;
  return json_build_object('ok', true, 'codigo', v_codigo, 'canal', p_canal, 'destino', v_destino,
    'destinoMascarado', case when p_canal = 'email' then disc_interno.clima_mascarar_email(v_destino) else 'final ' || right(v_destino, 2) end,
    'empresaNome', coalesce(v_emp, ''), 'minutos', 10);
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções do painel (authenticated; só admin)
-- -----------------------------------------------------------------------------

-- p_dados: {empresaId, nome, complemento, canalTexto, canalUrl, contatoDados, retencaoDias, modo?, metodos?,
--           equipes: [{liderId, convidados?}]}. Modo opcional/identificado: um link pessoal por liderado direto ativo.
-- Modo identificado: convidados = liderados (só responde quem está no cadastro).
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
  v_modo text;
  v_metodos text[] := array[]::text[];
  v_id uuid;
  v_eq uuid;
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
  v_modo := coalesce(nullif(btrim(disc_interno.texto(p_dados -> 'modo')), ''), 'anonima');
  if v_modo not in ('anonima', 'opcional', 'identificada') then return disc_interno.erro('Modo da pesquisa inválido.'); end if;
  if v_modo <> 'anonima' and jsonb_typeof(p_dados -> 'metodos') = 'array' then
    v_metodos := array(select m from unnest(array['email', 'whatsapp', 'dados']) with ordinality as t(m, o)
                        where p_dados -> 'metodos' ? m order by o);
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

  insert into public.clima_rodadas (empresa_id, nome, complemento, canal_texto, canal_url, contato_dados, retencao_dias, modo, metodos)
    values (v_emp, v_nome, v_compl, case when v_compl then v_canal else '' end, case when v_compl then v_url else '' end, v_contato, v_ret,
            v_modo, v_metodos)
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
      if v_modo = 'identificada' and v_conv <> v_diretos then
        raise exception 'Na pesquisa identificada só responde quem está no cadastro: inclua no organograma as pessoas que faltam.';
      end if;
    end if;
    select nome into v_pnome from public.pessoas where id = v_lider;
    insert into public.clima_equipes (rodada_id, lider_pessoa_id, nome, area, ordem, convidados, token_equipe, token_lider)
      values (v_id, v_lider, 'Equipe de ' || disc_interno.clima_nome_curto(v_pnome), left(btrim(v_vinc.area), 120), v_ordem, v_conv,
              disc_interno.token_aleatorio(), disc_interno.token_aleatorio())
      returning id into v_eq;
    if v_modo <> 'anonima' then
      -- Um link pessoal por liderado direto ativo. Formas de confirmação = as da rodada que a pessoa tem como usar.
      insert into public.clima_convites (rodada_id, equipe_id, pessoa_id, nome, token, metodos, conf_sal, conf_hash)
      select v_id, v_eq, p.id, left(coalesce(nullif(btrim(p.nome), ''), 'Colaborador(a)'), 120), disc_interno.token_aleatorio(),
             array(select m from unnest(v_metodos) with ordinality as t(m, o)
                    where (m = 'email' and disc_interno.clima_email_valido(lower(btrim(p.email))))
                       or (m = 'whatsapp' and regexp_replace(coalesce(p.telefone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10,13}$')
                       or (m = 'dados' and cf.hash is not null)
                    order by o),
             case when 'dados' = any(v_metodos) then cf.sal end, case when 'dados' = any(v_metodos) then cf.hash end
        from public.relacoes rl
        join public.vinculos vv on vv.pessoa_id = rl.para_pessoa and vv.empresa_id = v_emp and vv.status = 'ativo'
        join public.pessoas p on p.id = rl.para_pessoa
        left join public.clima_conferencias cf on cf.empresa_id = v_emp and cf.pessoa_id = p.id
       where rl.empresa_id = v_emp and rl.de_pessoa = v_lider and rl.tipo = 'lidera';
    end if;
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

-- Tela "uso interno da consultoria": quem tem link pessoal e se já respondeu com identificação; com a rodada encerrada
-- (e antes da retenção), as respostas identificadas (escores por tema, complemento e comentário). TODA abertura fica
-- registrada (quem e quando) e a lista de acessos volta junto.
create or replace function public.clima_identificacao(p_rodada uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
  v_disp boolean;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  if r.modo = 'anonima' then return disc_interno.erro('Esta pesquisa é anônima: ninguém se identifica.'); end if;
  insert into public.clima_acessos (rodada_id, empresa_id, admin_id, admin_nome, acao)
    values (r.id, r.empresa_id, auth.uid(), left(disc_interno.clima_admin_nome(), 160), 'abrir');
  v_disp := r.status = 'encerrada' and r.brutas_apagadas_em is null;
  return json_build_object('ok', true,
    'rodada', jsonb_build_object('id', r.id, 'nome', r.nome, 'modo', r.modo, 'status', r.status, 'complemento', r.complemento,
      'brutasApagadasEm', disc_interno.iso(r.brutas_apagadas_em)),
    'convites', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'equipeNome', e.nome,
                   'metodos', to_jsonb(c.metodos), 'usado', c.usado) order by e.ordem, c.nome, c.id), '[]'::jsonb)
                   from public.clima_convites c join public.clima_equipes e on e.id = c.equipe_id where c.rodada_id = r.id),
    'respostasDisponiveis', v_disp,
    'motivo', case when r.status <> 'encerrada' then 'aberta' when r.brutas_apagadas_em is not null then 'apagadas' else '' end,
    'respostas', case when v_disp then (
      select coalesce(jsonb_agg(jsonb_build_object('respostaId', i.resposta_id, 'nome', i.nome, 'equipeNome', e.nome,
               'confirmadoPor', i.confirmado_por, 'escores', disc_interno.clima_escores_inteiros(x.itens, 'membro'),
               'complemento', (select coalesce(jsonb_object_agg(k, x.itens -> k), '{}'::jsonb)
                                 from unnest(array['N1', 'N2', 'N3', 'N4', 'N5']) as k where x.itens ? k),
               'comentario', x.comentario) order by e.ordem, i.nome, i.resposta_id), '[]'::jsonb)
        from public.clima_identificacoes i
        join public.clima_respostas x on x.id = i.resposta_id
        join public.clima_equipes e on e.id = x.equipe_id
       where i.rodada_id = r.id) else '[]'::jsonb end,
    'acessos', (select coalesce(jsonb_agg(jsonb_build_object('nome', a.admin_nome, 'acao', a.acao, 'em', disc_interno.iso(a.em))
                  order by a.em desc), '[]'::jsonb)
                  from (select * from public.clima_acessos y where y.rodada_id = r.id order by y.em desc limit 50) a));
end;
$$;

-- "Tire o meu nome da minha resposta" (pedido do titular): a resposta continua, anônima. Fica registrado.
create or replace function public.clima_desidentificar(p_rodada uuid, p_resposta uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.clima_rodadas%rowtype;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into r from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  delete from public.clima_identificacoes where rodada_id = r.id and resposta_id = p_resposta;
  if not found then return disc_interno.erro('Resposta identificada não encontrada.'); end if;
  insert into public.clima_acessos (rodada_id, empresa_id, admin_id, admin_nome, acao)
    values (r.id, r.empresa_id, auth.uid(), left(disc_interno.clima_admin_nome(), 160), 'desidentificar');
  return json_build_object('ok', true);
end;
$$;

-- Novo link pessoal (o anterior deixa de funcionar): link perdido, encaminhado por engano ou bloqueado por tentativas.
create or replace function public.clima_convite_renovar(p_convite uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  cv public.clima_convites%rowtype;
  v_status text;
  v_token text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  select * into cv from public.clima_convites where id = p_convite for update;
  if not found then return disc_interno.erro('Link pessoal não encontrado.'); end if;
  select status into v_status from public.clima_rodadas where id = cv.rodada_id;
  if v_status <> 'aberta' then return disc_interno.erro('Esta pesquisa já foi encerrada.'); end if;
  if cv.usado then return disc_interno.erro('Este link já foi usado para responder: não dá para trocar.'); end if;
  v_token := disc_interno.token_aleatorio();
  update public.clima_convites set token = v_token where id = cv.id;
  delete from public.clima_codigos where convite_id = cv.id;
  delete from public.limites_vendas where tipo in ('clima_dados', 'clima_codigo') and chave = cv.id::text;
  return json_build_object('ok', true, 'convite', json_build_object('id', cv.id, 'token', v_token));
end;
$$;

-- Cadastro do colaborador (painel): e-mail e se há dados de conferência (CPF/data) — nunca os dados em si.
create or replace function public.clima_colaboradores_dados(p_empresa uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  return json_build_object('ok', true, 'pessoas', (select coalesce(jsonb_agg(jsonb_build_object('pessoaId', v.pessoa_id,
      'email', coalesce(p.email, ''),
      'conferencia', exists (select 1 from public.clima_conferencias c where c.empresa_id = v.empresa_id and c.pessoa_id = v.pessoa_id))
      order by p.nome, v.pessoa_id), '[]'::jsonb)
    from public.vinculos v join public.pessoas p on p.id = v.pessoa_id
   where v.empresa_id = p_empresa and v.status = 'ativo'));
end;
$$;

-- p_dados: {empresaId, pessoaId, email?: texto ('' apaga), cpf3?, nascimento?: 'DD/MM', apagarConferencia?: true}.
-- CPF/data viram hash com sal (sha256) na hora; o dado em claro não é gravado em lugar nenhum.
create or replace function public.clima_colaborador_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_pessoa uuid;
  v_email text;
  v_valor text;
  v_sal text;
  v_cpf text;
  v_nasc text;
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then return disc_interno.erro('Dados do colaborador ausentes.'); end if;
  v_emp := disc_interno.uuid_ou_nulo(p_dados -> 'empresaId');
  v_pessoa := disc_interno.uuid_ou_nulo(p_dados -> 'pessoaId');
  if v_emp is null or v_pessoa is null or not exists (select 1 from public.vinculos v where v.empresa_id = v_emp
       and v.pessoa_id = v_pessoa and v.status = 'ativo') then
    return disc_interno.erro('Colaborador não encontrado.');
  end if;
  if p_dados ? 'email' and jsonb_typeof(p_dados -> 'email') <> 'null' then
    v_email := lower(btrim(disc_interno.texto(p_dados -> 'email')));
    if v_email <> '' and not disc_interno.clima_email_valido(v_email) then return disc_interno.erro('E-mail inválido.'); end if;
    update public.pessoas set email = v_email where id = v_pessoa and email is distinct from v_email;
  end if;
  v_cpf := btrim(disc_interno.texto(p_dados -> 'cpf3'));
  v_nasc := btrim(disc_interno.texto(p_dados -> 'nascimento'));
  if p_dados -> 'apagarConferencia' = 'true'::jsonb then
    delete from public.clima_conferencias where empresa_id = v_emp and pessoa_id = v_pessoa;
  elsif v_cpf <> '' or v_nasc <> '' then
    v_valor := disc_interno.clima_dados_norm(jsonb_build_object('cpf3', v_cpf, 'nascimento', v_nasc));
    if v_valor is null then
      return disc_interno.erro('Confira os 3 últimos dígitos do CPF e o dia e o mês de nascimento (DD/MM).');
    end if;
    v_sal := disc_interno.clima_sal();
    insert into public.clima_conferencias (empresa_id, pessoa_id, sal, hash) values (v_emp, v_pessoa, v_sal, disc_interno.clima_hash(v_sal, v_valor))
      on conflict (empresa_id, pessoa_id) do update set sal = excluded.sal, hash = excluded.hash, criado_em = now();
  end if;
  return json_build_object('ok', true, 'email', (select coalesce(p.email, '') from public.pessoas p where p.id = v_pessoa),
    'conferencia', exists (select 1 from public.clima_conferencias c where c.empresa_id = v_emp and c.pessoa_id = v_pessoa));
end;
$$;

-- Relatório: igual à versão 1 + rodada.modo (o relatório diz "pesquisa identificada" por transparência). Nada de nomes.
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
      'versaoItens', r.versao_itens, 'modo', r.modo),
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

-- Excluir a rodada: leva respostas, identificações, links pessoais e códigos (cascata) e, como as respostas, os dados de
-- conferência (CPF/data) do cadastro que foram copiados para os links dela.
create or replace function public.clima_excluir_rodada(p_rodada uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_admin() then return disc_interno.erro('Sem permissão.'); end if;
  perform disc_interno.clima_apagar_conferencias(array[p_rodada]);
  delete from public.clima_rodadas where id = p_rodada;
  if not found then return disc_interno.erro('Pesquisa não encontrada.'); end if;
  return json_build_object('ok', true, 'id', p_rodada);
end;
$$;

-- Retenção (versão 1) + identificação: com as respostas brutas saem as identificações (cascata), os links pessoais e
-- códigos e os dados de conferência (CPF/data) do cadastro copiados para os links desta rodada.
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
  perform disc_interno.clima_apagar_conferencias(v_ids);
  delete from public.clima_respostas x where x.rodada_id = any(v_ids);
  get diagnostics v_resp = row_count;
  delete from public.clima_recebidos x where x.rodada_id = any(v_ids);
  delete from public.clima_identificacoes x where x.rodada_id = any(v_ids);
  delete from public.clima_convites x where x.rodada_id = any(v_ids);
  update public.clima_rodadas r set brutas_apagadas_em = now(),
    resultado = (r.resultado - 'lideres') || jsonb_build_object('lideres', '[]'::jsonb, 'lideresApagados', true)
   where r.id = any(v_ids);
  return json_build_object('ok', true, 'rodadas', coalesce(array_length(v_ids, 1), 0), 'respostas', v_resp);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões: ninguém lê as tabelas novas pela API (nem o admin); anon só as duas funções públicas
-- -----------------------------------------------------------------------------

alter table public.clima_conferencias enable row level security;
alter table public.clima_convites enable row level security;
alter table public.clima_codigos enable row level security;
alter table public.clima_identificacoes enable row level security;
alter table public.clima_acessos enable row level security;
-- (nenhuma política: só as funções do banco)

revoke all on public.clima_conferencias, public.clima_convites, public.clima_codigos, public.clima_identificacoes,
  public.clima_acessos from public;
revoke all on function disc_interno.clima_rodadas_modo_travado(), disc_interno.clima_hash(text, text), disc_interno.clima_sal(),
  disc_interno.clima_codigo6(), disc_interno.clima_dados_norm(jsonb), disc_interno.clima_mascarar_email(text),
  disc_interno.clima_email_valido(text), disc_interno.clima_escores_inteiros(jsonb, text), disc_interno.clima_admin_nome(),
  disc_interno.clima_apagar_conferencias(uuid[]), disc_interno.clima_conferencia_ao_desligar() from public;
revoke all on function public.clima_codigo_novo(text, text), public.clima_identificacao(uuid), public.clima_desidentificar(uuid, uuid),
  public.clima_convite_renovar(uuid), public.clima_colaboradores_dados(uuid), public.clima_colaborador_salvar(jsonb) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.clima_conferencias, public.clima_convites, public.clima_codigos, '
        || 'public.clima_identificacoes, public.clima_acessos from %I', papel);
      execute format('revoke all on function public.clima_codigo_novo(text, text), public.clima_identificacao(uuid), '
        || 'public.clima_desidentificar(uuid, uuid), public.clima_convite_renovar(uuid), public.clima_colaboradores_dados(uuid), '
        || 'public.clima_colaborador_salvar(jsonb) from %I', papel);
      execute format('revoke all on function disc_interno.clima_hash(text, text), disc_interno.clima_sal(), disc_interno.clima_codigo6(), '
        || 'disc_interno.clima_dados_norm(jsonb), disc_interno.clima_mascarar_email(text), disc_interno.clima_email_valido(text), '
        || 'disc_interno.clima_escores_inteiros(jsonb, text), disc_interno.clima_admin_nome(), '
        || 'disc_interno.clima_apagar_conferencias(uuid[]) from %I', papel);
      execute format('grant execute on function public.clima_publica(text), public.clima_enviar(text, jsonb) to %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.clima_identificacao(uuid), public.clima_desidentificar(uuid, uuid), public.clima_convite_renovar(uuid),
      public.clima_colaboradores_dados(uuid), public.clima_colaborador_salvar(jsonb) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.clima_codigo_novo(text, text) to service_role;
    grant select, delete on public.clima_conferencias, public.clima_convites, public.clima_codigos, public.clima_identificacoes
      to service_role;
    grant select on public.clima_acessos to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261018120000_clima_identificacao
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
                                                 and to_regprocedure('public.clima_identificacao(uuid)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261018120000, 'migracoes', to_jsonb(aplicadas),
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

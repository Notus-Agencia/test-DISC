-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — motor dos TESTES DE HABILIDADE (conhecimento prático) e do SELO "habilidade testada".
-- Roda DEPOIS de 20261005120000_disc.sql … 20261021120000_feedback360.sql (usa public.e_admin, public.limites_vendas e
-- disc_interno.origens_requisicao/contar_tentativa da 20261020). NÃO depende da 20261022 (fundação do Vagas): tudo se liga
-- a auth.users(id). O banco de questões NÃO fica no repositório: a 20261023120001_vagas_questoes.sql é só um ESPELHO com
-- comentário; o SQL de carga é gerado da cópia privada (scripts/montar-testes.mjs --conteudo … --saida …) e colado à mão no
-- SQL Editor (docs/VAGAS-TESTES.md). Enquanto não houver carga, versao_banco() mostra a 0001 em "faltando".
-- Idempotente e seguro sobre dados reais: só cria tabelas, índices, funções e políticas; recria versao_banco. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Contrato para as telas: docs/VAGAS-TESTES.md. Textos e formatação no cliente: vagas/js/testes.js (VAGAS_TESTES).
--
--   * public.vagas_testes               catálogo (slug, nome, competências, nº de questões da prova, minutos, validade do selo
--                                       em meses = 12, nota mínima do selo = 60 (PROVISÓRIA: Angoff antes de abrir), margem
--                                       da nota = 10 pontos (aproximação do erro de medida de 15 questões), versão, ativo).
--   * public.vagas_questoes             banco de questões COM GABARITO (coluna correta). Sem política nenhuma e sem permissão
--                                       para anon/authenticated: só as funções do banco leem. O gabarito nunca sai do banco.
--   * public.vagas_tentativas           uma prova: pessoa (auth.users), teste, início e fim pelo relógio do SERVIDOR, questões
--                                       sorteadas com a ordem embaralhada das alternativas ({id, alt:[4 índices]}), quantas já
--                                       foram respondidas, nota (calculada aqui), acertos por competência, sinais e alertas.
--   * public.vagas_tentativa_respostas  hora em que cada questão foi mostrada, posição escolhida na tela e a alternativa
--                                       original correspondente (para a análise de itens), se acertou e quando respondeu.
--   * public.vagas_selos                selo de quem tirou nota ≥ nota mínima: código público curto (8 caracteres), nota,
--                                       emitido em, válido até (12 meses), presencial (false: online, sem supervisão), revogado.
--
-- Regras (as mesmas em vagas/js/testes.js, conferidas por tests/supabase/vagas_testes.test.js):
--   * Sorteio (o mesmo de scripts/montar-testes.mjs, cotasPorCelula): 15 questões = 40% fáceis, 40% médias, 20% difíceis
--     (6/6/3), estratificadas por competência (competências em ordem sorteada; cada uma recebe 15/C, o resto vai às
--     primeiras; as dificuldades 3, depois 1, depois 2 são distribuídas em rodízio); no máximo 1 questão por GRUPO de
--     itens-irmãos (mesma situação-base ou mesmo tipo de conta); as que a pessoa já viu ficam por último. Célula sem questão
--     suficiente: completa na mesma competência, depois em qualquer uma. Ordem da prova: das mais fáceis para as mais
--     difíceis; alternativas embaralhadas por questão (gerador gen_random_uuid).
--   * Uma questão por vez, sem voltar: a função só devolve a questão atual; responder avança; reenviar a mesma resposta
--     (internet fraca) devolve o estado sem mudar nada.
--   * Tempo do servidor: termina_em = início + minutos; o servidor aceita a resposta da questão que JÁ ESTAVA NA TELA até
--     maior(termina_em, hora em que ela foi mostrada) + 10 s (tolerância para internet fraca; limite_em = termina_em + 10 s).
--     Depois do fim oficial nenhuma questão nova é entregue. Tentativa vencida fecha sozinha em qualquer consulta (status
--     tempo_esgotado; vale o que foi respondido; o que ficou sem resposta é erro). Encerrar antes de responder tudo conta.
--   * 1 tentativa por teste a cada 30 dias, contados do início da anterior em que ao menos 1 questão foi mostrada (uma
--     tentativa aberta por engano, sem nenhuma questão na tela, não conta). Refazer é grátis. Tentativa aberta é retomada.
--   * Só conta de PESSOA ativa faz teste: se a tabela da fundação public.vagas_contas existir (20261022), a tentativa exige
--     tipo = 'pessoa' e status = 'ativa' (conta de empresa, de operador ou usuário do DISC não colhe o banco). Sem a tabela
--     (migrações independentes), basta estar em auth.users.
--   * Nota = arredonda(100 × acertos ÷ total); sem resposta = erro. Selo com nota ≥ 60 (PROVISÓRIO; decisão e Angoff em
--     docs/VAGAS-TESTES.md), válido por 12 meses, mostrado com a margem ("nota 82 (±10)"); NUNCA diz "aprovado"/"reprovado". Resultado mostra acertos por competência, nunca quais
--     questões a pessoa errou (isso entregaria o gabarito).
--   * Sinais de fraude registrados, sem anular nada sozinhos: resposta em menos de 3 s depois de mostrada; troca de aba e
--     cópia de texto informadas pelo aparelho (vagas_registrar_sinal). Alertas: respostas_rapidas (≥ 1/3 das questões),
--     troca_aba (≥ 3), copiou_texto (≥ 1). Quem decide é uma pessoa da equipe (vagas_revogar_selo).
--   * Limite por origem ao iniciar (padrão da 20261020: cf-connecting-ip e 1º IP público de x-forwarded-for, IPv6 pelo /64,
--     tabela limites_vendas): 10 tentativas novas em 10 minutos ou 60 em 24 horas por origem (colheita em massa fica cara; um
--     ponto de internet compartilhado ainda cabe). Na conferência pública do selo,
--     cada código inexistente conta 1 erro; com 20 em 10 minutos ou 100 em 24 horas a origem recebe sempre "não encontrado".
--   * Datas mostradas (data do selo, validade) no fuso de Boa Vista (America/Boa_Vista); datas-hora em ISO UTC.
--   * Gancho para a fundação (20261022): vagas_interno.selos_cartao(p_user) = 1 selo válido por teste (maior nota; empate, o
--     mais recente) e vagas_interno.testes_exportar(p_user) para a exportação de dados da pessoa (LGPD).
--   * versao_banco() passa a conhecer esta migração e a 20261023120001 (versão 20261023120001).
-- =============================================================================

create schema if not exists vagas_interno;
revoke all on schema vagas_interno from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema vagas_interno from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema vagas_interno from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant usage on schema vagas_interno to service_role'; end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.vagas_testes (
  slug            text primary key check (slug ~ '^[a-z][a-z0-9_]{1,29}$'),
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  descricao       text not null default '' check (char_length(descricao) <= 400),
  competencias    jsonb not null default '[]'::jsonb check (jsonb_typeof(competencias) = 'array'),
  questoes_prova  int not null default 15 check (questoes_prova between 5 and 40),
  minutos         int not null default 20 check (minutos between 5 and 120),
  validade_meses  int not null default 12 check (validade_meses between 1 and 36),
  nota_minima     int not null default 60 check (nota_minima between 1 and 100),
  margem_nota     int not null default 10 check (margem_nota between 0 and 50),
  versao          text not null default '' check (char_length(versao) <= 40),
  ordem           int not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.vagas_questoes (
  id             text primary key check (id ~ '^[A-Z]{3}-[0-9]{3}$'),
  teste          text not null references public.vagas_testes (slug) on update cascade,
  competencia    text not null check (competencia ~ '^[a-z][a-z0-9_]{1,29}$'),
  dificuldade    smallint not null check (dificuldade between 1 and 3),
  grupo          text not null default '' check (grupo = '' or grupo ~ '^[a-z][a-z0-9_]{1,29}$'),
  texto          text not null default '' check (char_length(texto) <= 600),
  enunciado      text not null check (char_length(btrim(enunciado)) between 5 and 400),
  alternativas   jsonb not null check (jsonb_typeof(alternativas) = 'array' and jsonb_array_length(alternativas) = 4),
  correta        smallint not null check (correta between 0 and 3),
  ativa          boolean not null default true,
  atualizada_em  timestamptz not null default now()
);
create index if not exists vagas_questoes_sorteio_idx on public.vagas_questoes (teste, competencia, dificuldade) where ativa;
-- Colunas acrescentadas depois da primeira versão desta migração (bancos que já a tinham rodado).
alter table public.vagas_testes add column if not exists margem_nota int not null default 10 check (margem_nota between 0 and 50);
alter table public.vagas_questoes add column if not exists grupo text not null default ''
  check (grupo = '' or grupo ~ '^[a-z][a-z0-9_]{1,29}$');

create table if not exists public.vagas_tentativas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  teste            text not null references public.vagas_testes (slug) on update cascade,
  versao           text not null default '',
  status           text not null default 'aberta' check (status in ('aberta', 'concluida', 'tempo_esgotado')),
  iniciada_em      timestamptz not null default now(),
  termina_em       timestamptz not null,
  limite_em        timestamptz not null,
  finalizada_em    timestamptz,
  questoes         jsonb not null check (jsonb_typeof(questoes) = 'array'),
  total            int not null check (total between 1 and 40),
  respondidas      int not null default 0 check (respondidas >= 0),
  acertos          int check (acertos >= 0),
  nota             int check (nota between 0 and 100),
  nota_minima      int check (nota_minima between 1 and 100),
  por_competencia  jsonb check (por_competencia is null or jsonb_typeof(por_competencia) = 'array'),
  sinais           jsonb not null default '{}'::jsonb check (jsonb_typeof(sinais) = 'object'),
  alertas          text[] not null default '{}'::text[],
  constraint vagas_tentativas_fechamento check ((status = 'aberta') = (finalizada_em is null)),
  constraint vagas_tentativas_prazos check (termina_em >= iniciada_em and limite_em >= termina_em),
  constraint vagas_tentativas_respondidas check (respondidas <= total)
);
create unique index if not exists vagas_tentativas_uma_aberta on public.vagas_tentativas (user_id, teste) where status = 'aberta';
create index if not exists vagas_tentativas_pessoa_idx on public.vagas_tentativas (user_id, teste, iniciada_em desc);

create table if not exists public.vagas_tentativa_respostas (
  tentativa_id   uuid not null references public.vagas_tentativas (id) on delete cascade,
  ordem          int not null check (ordem between 0 and 39),
  questao_id     text not null references public.vagas_questoes (id) on update cascade,
  alternativa    smallint check (alternativa between 0 and 3),   -- POSIÇÃO mostrada na tela (não a da questão original)
  correta        boolean not null default false,
  exibida_em     timestamptz not null default now(),
  respondida_em  timestamptz,
  primary key (tentativa_id, ordem),
  constraint vagas_tentativa_respostas_coerente check ((alternativa is null) = (respondida_em is null))
);
-- Alternativa ORIGINAL (índice no banco de questões, antes de embaralhar) da resposta: a análise de itens (distratores que
-- ninguém escolhe, p, discriminação) usa esta coluna; com o tempo por item (respondida_em - exibida_em), sem dado da pessoa.
alter table public.vagas_tentativa_respostas add column if not exists alternativa_original smallint
  check (alternativa_original between 0 and 3);

create table if not exists public.vagas_selos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique check (codigo ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  user_id           uuid not null references auth.users (id) on delete cascade,
  teste             text not null references public.vagas_testes (slug) on update cascade,
  tentativa_id      uuid unique references public.vagas_tentativas (id) on delete set null,
  nota              int not null check (nota between 0 and 100),
  emitido_em        timestamptz not null default now(),
  valido_ate        date not null,
  presencial        boolean not null default false,
  revogado          boolean not null default false,
  revogado_em       timestamptz,
  motivo_revogacao  text not null default '' check (char_length(motivo_revogacao) <= 300),
  constraint vagas_selos_revogacao check (revogado = (revogado_em is not null))
);
create index if not exists vagas_selos_pessoa_idx on public.vagas_selos (user_id, teste, emitido_em desc);

-- -----------------------------------------------------------------------------
-- Auxiliares (schema fechado vagas_interno)
-- -----------------------------------------------------------------------------

-- {ok:false, erro, codigo, ...extra}: o mesmo formato das RPCs da fundação (flags como sessaoExpirada vão no extra).
create or replace function vagas_interno.teste_erro(p_codigo text, p_msg text, p_extra jsonb default '{}'::jsonb)
returns json language sql immutable set search_path = '' as $$
  select (jsonb_build_object('ok', false, 'erro', p_msg, 'codigo', p_codigo) || coalesce(p_extra, '{}'::jsonb))::json;
$$;

create or replace function vagas_interno.teste_erro_login()
returns json language sql immutable set search_path = '' as $$
  select vagas_interno.teste_erro('login', 'Entre na sua conta para fazer o teste.', '{"sessaoExpirada": true}'::jsonb);
$$;

-- Data-hora ISO-8601 UTC com milissegundos (null fica null).
create or replace function vagas_interno.teste_iso(p timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null else to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end;
$$;

-- Data (AAAA-MM-DD) e "hoje" no fuso de Boa Vista.
create or replace function vagas_interno.teste_data(p timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when p is null then null else to_char(p at time zone 'America/Boa_Vista', 'YYYY-MM-DD') end;
$$;
create or replace function vagas_interno.teste_hoje()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Boa_Vista')::date;
$$;

-- Pessoa logada de verdade: auth.uid() que existe em auth.users e não é sessão anônima. Senão, null.
create or replace function vagas_interno.teste_usuario()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid;
  c jsonb;
begin
  begin
    v := auth.uid();
  exception when others then
    return null;
  end;
  if v is null then return null; end if;
  begin
    c := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    c := null;
  end;
  if c is not null and jsonb_typeof(c) = 'object' and lower(coalesce(c ->> 'is_anonymous', 'false')) = 'true' then return null; end if;
  if not exists (select 1 from auth.users u where u.id = v) then return null; end if;
  return v;
end;
$$;

-- Código do selo: 8 caracteres de ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32^8 ≈ 10^12), do gerador criptográfico
-- (gen_random_uuid, sem os dígitos fixos de versão e variante; 256 é múltiplo de 32, então byte % 32 é uniforme).
create or replace function vagas_interno.teste_gerar_codigo()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  h text;
  cand text;
begin
  for t in 1..20 loop
    h := replace(pg_catalog.gen_random_uuid()::text, '-', '');
    h := substr(h, 1, 12) || substr(h, 18, 15);
    cand := '';
    for k in 0..7 loop
      cand := cand || substr(alfabeto, (('x' || substr(h, k * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
    end loop;
    if not exists (select 1 from public.vagas_selos s where s.codigo = cand) then return cand; end if;
  end loop;
  raise exception 'Não foi possível gerar o código do selo. Tente de novo.';
end;
$$;

-- "k7m2-qx9a " -> "K7M2QX9A"; '' se não tiver 8 caracteres do alfabeto.
create or replace function vagas_interno.teste_normalizar_codigo(p text)
returns text language sql immutable set search_path = '' as $$
  select case when s ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then s else '' end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as s) x;
$$;

-- Limite por origem (padrão da 20261020). Sem origem (conexão direta ao banco) nunca bloqueia. Em transação só de
-- leitura (GET) o erro não poderia ser contado: conta como bloqueada.
create or replace function vagas_interno.teste_origem_bloqueada(p_tipo text, p_origens text[], p_max_10min int, p_max_dia int)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_origens is null then return false; end if;
  if current_setting('transaction_read_only', true) = 'on' then return true; end if;
  return exists (
    select 1 from unnest(p_origens) o(chave)
    where (select count(*) from public.limites_vendas l
            where l.tipo = p_tipo and l.chave = o.chave and l.em > now() - interval '10 minutes') >= p_max_10min
       or (select count(*) from public.limites_vendas l
            where l.tipo = p_tipo and l.chave = o.chave and l.em > now() - interval '1 day') >= p_max_dia);
end;
$$;

create or replace function vagas_interno.teste_contar_origem(p_tipo text, p_origens text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  o text;
begin
  if p_origens is null then return; end if;
  foreach o in array p_origens loop
    perform disc_interno.contar_tentativa(p_tipo, o, interval '1 day');
  end loop;
end;
$$;

-- Selo -> JSON das telas: {codigo, teste, nome, nota (null se revogado), margem, questoes, data, validoAte, supervisao, situacao}.
-- "margem" (±10): a nota de 15 questões tem erro de medida; o selo mostra "nota 82 (±10)".
create or replace function vagas_interno.teste_selo_json(s public.vagas_selos)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'codigo', s.codigo, 'teste', s.teste, 'nome', coalesce(t.nome, s.teste),
    'nota', case when s.revogado then null else s.nota end, 'margem', coalesce(t.margem_nota, 10),
    'questoes', coalesce((select tt.total from public.vagas_tentativas tt where tt.id = s.tentativa_id), t.questoes_prova, 15),
    'data', vagas_interno.teste_data(s.emitido_em),
    'validoAte', to_char(s.valido_ate, 'YYYY-MM-DD'),
    'supervisao', case when s.presencial then 'presencial' else 'online' end,
    'situacao', case when s.revogado then 'revogado'
                     when s.valido_ate < vagas_interno.teste_hoje() then 'vencido'
                     else 'valido' end)
  from (select 1) um left join public.vagas_testes t on t.slug = s.teste;
$$;

-- Gancho da fundação: selos VÁLIDOS da pessoa, 1 por teste (maior nota; empate, o mais recente), sem "situacao".
create or replace function vagas_interno.selos_cartao(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j - 'situacao' order by x.ordem, x.teste), '[]'::jsonb)
  from (
    select distinct on (s.teste) s.teste, t.ordem, vagas_interno.teste_selo_json(s) as j
    from public.vagas_selos s
    join public.vagas_testes t on t.slug = s.teste
    where s.user_id = p_user and not s.revogado and s.valido_ate >= vagas_interno.teste_hoje()
    order by s.teste, s.nota desc, s.emitido_em desc
  ) x;
$$;

-- Prazo da tentativa: com uma questão na tela (mostrada e sem resposta), maior(termina_em, hora em que foi mostrada) + 10 s
-- (tolerância para internet fraca); sem questão na tela, o fim oficial (nenhuma questão nova depois dele).
create or replace function vagas_interno.teste_prazo(tt public.vagas_tentativas)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce((select greatest(tt.termina_em, r.exibida_em) + interval '10 seconds'
                     from public.vagas_tentativa_respostas r
                     where r.tentativa_id = tt.id and r.ordem = tt.respondidas and r.respondida_em is null),
                  tt.termina_em);
$$;

-- Tentativa vencida: aberta e passou do prazo.
create or replace function vagas_interno.teste_vencida(tt public.vagas_tentativas)
returns boolean language sql stable security definer set search_path = '' as $$
  select tt.status = 'aberta' and now() > vagas_interno.teste_prazo(tt);
$$;

-- Início da última tentativa que CONTA para os 30 dias (ao menos 1 questão mostrada); null se não houver.
create or replace function vagas_interno.teste_ultimo_inicio(p_user uuid, p_teste text)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(tt.iniciada_em) from public.vagas_tentativas tt
  where tt.user_id = p_user and tt.teste = p_teste
    and exists (select 1 from public.vagas_tentativa_respostas r where r.tentativa_id = tt.id);
$$;

-- Sorteio da prova (ver o cabeçalho). Devolve [{id, alt:[4 índices da alternativa original, na ordem em que aparecem]}].
create or replace function vagas_interno.teste_sortear(p_teste text, p_n int, p_vistas text[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  ordem_dif constant int[] := array[3, 1, 2];
  vistas text[] := coalesce(p_vistas, array[]::text[]);
  comps text[];
  nc int;
  q_dif int[];
  resta int[];
  cota int[];            -- cota[(i - 1) * 3 + d] = questões da competência i (na ordem sorteada) com dificuldade d
  falta_comp int[];
  falta int;
  ptr int := 0;
  guarda int;
  idx int;
  dd int;
  escolhidas text[] := array[]::text[];
  grupos text[] := array[]::text[];
  r record;
  saida jsonb := '[]'::jsonb;
begin
  select array_agg(x.competencia order by pg_catalog.gen_random_uuid()) into comps
    from (select distinct vq.competencia from public.vagas_questoes vq where vq.teste = p_teste and vq.ativa) x;
  if comps is null or coalesce(p_n, 0) < 1 then return '[]'::jsonb; end if;
  nc := cardinality(comps);

  -- Cotas: 40% fáceis, 20% difíceis, o resto médias; cada competência recebe n/C (o resto vai às primeiras);
  -- as dificuldades 3, 1 e 2 são distribuídas em rodízio entre as competências (igual a cotasPorCelula no JS).
  q_dif := array[round(p_n * 0.4)::int, 0, round(p_n * 0.2)::int];
  q_dif[2] := p_n - q_dif[1] - q_dif[3];
  resta := array_fill(0, array[nc]);
  for i in 1 .. nc loop
    resta[i] := p_n / nc + case when i <= p_n % nc then 1 else 0 end;
  end loop;
  cota := array_fill(0, array[nc * 3]);
  falta_comp := array_fill(0, array[nc]);
  foreach dd in array ordem_dif loop
    falta := q_dif[dd];
    guarda := 0;
    while falta > 0 and guarda < nc * 50 loop
      idx := (ptr % nc) + 1;
      if resta[idx] > 0 then
        cota[(idx - 1) * 3 + dd] := cota[(idx - 1) * 3 + dd] + 1;
        resta[idx] := resta[idx] - 1;
        falta := falta - 1;
      end if;
      ptr := ptr + 1;
      guarda := guarda + 1;
    end loop;
  end loop;

  -- Escolha: uma questão por vez, no máximo 1 por grupo de itens-irmãos, as não vistas primeiro. As células são
  -- preenchidas na mesma ordem das cotas (difíceis, fáceis, médias): a difícil, que tem menos questões, escolhe antes
  -- de uma irmã fácil ou média gastar o grupo (assim quem refaz quase nunca recebe questão repetida).
  foreach dd in array ordem_dif loop
    for i in 1 .. nc loop
      for j in 1 .. cota[(i - 1) * 3 + dd] loop
        select vq.id, vq.grupo into r from public.vagas_questoes vq
          where vq.teste = p_teste and vq.ativa and vq.competencia = comps[i] and vq.dificuldade = dd
            and vq.id <> all (escolhidas) and (vq.grupo = '' or vq.grupo <> all (grupos))
          order by (vq.id = any (vistas)), pg_catalog.gen_random_uuid() limit 1;
        if found then
          escolhidas := escolhidas || r.id::text;
          if r.grupo <> '' then grupos := grupos || r.grupo::text; end if;
        else
          falta_comp[i] := falta_comp[i] + 1;
        end if;
      end loop;
    end loop;
  end loop;

  -- Célula sem questão suficiente: completa na mesma competência (qualquer dificuldade), depois em qualquer competência
  -- e, em último caso, sem a regra dos grupos.
  for i in 1 .. nc loop
    for j in 1 .. falta_comp[i] loop
      select vq.id, vq.grupo into r from public.vagas_questoes vq
        where vq.teste = p_teste and vq.ativa and vq.competencia = comps[i]
          and vq.id <> all (escolhidas) and (vq.grupo = '' or vq.grupo <> all (grupos))
        order by (vq.id = any (vistas)), pg_catalog.gen_random_uuid() limit 1;
      if found then
        escolhidas := escolhidas || r.id::text;
        if r.grupo <> '' then grupos := grupos || r.grupo::text; end if;
      end if;
    end loop;
  end loop;
  while cardinality(escolhidas) < p_n loop
    select vq.id, vq.grupo into r from public.vagas_questoes vq
      where vq.teste = p_teste and vq.ativa and vq.id <> all (escolhidas)
      order by (vq.grupo <> '' and vq.grupo = any (grupos)), (vq.id = any (vistas)), pg_catalog.gen_random_uuid() limit 1;
    exit when not found;
    escolhidas := escolhidas || r.id::text;
    if r.grupo <> '' then grupos := grupos || r.grupo::text; end if;
  end loop;

  for r in
    select vq.id from public.vagas_questoes vq where vq.id = any (escolhidas)
    order by vq.dificuldade, pg_catalog.gen_random_uuid()
  loop
    saida := saida || jsonb_build_array(jsonb_build_object('id', r.id,
      'alt', (select jsonb_agg(p order by pg_catalog.gen_random_uuid()) from generate_series(0, 3) p)));
  end loop;
  return saida;
end;
$$;

-- Fecha a tentativa: nota no banco, acertos por competência, alertas e selo (nota ≥ nota mínima). Idempotente.
create or replace function vagas_interno.teste_fechar(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  tt public.vagas_tentativas%rowtype;
  t public.vagas_testes%rowtype;
  v_acertos int;
  v_rapidas int;
  v_nota int;
  v_comp jsonb;
  v_alertas text[] := array[]::text[];
  v_fim timestamptz;
begin
  select * into tt from public.vagas_tentativas where id = p_id for update;
  if not found or tt.status <> 'aberta' then return; end if;
  select * into t from public.vagas_testes where slug = tt.teste;
  select count(*) filter (where r.correta and r.respondida_em is not null),
         count(*) filter (where r.respondida_em is not null and r.respondida_em - r.exibida_em < interval '3 seconds')
    into v_acertos, v_rapidas
    from public.vagas_tentativa_respostas r where r.tentativa_id = p_id;
  v_nota := round(100.0 * v_acertos / tt.total)::int;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'acertos', x.acertos, 'total', x.total)
           order by x.pos), '[]'::jsonb)
    into v_comp
  from (
    select c.v ->> 'id' as id, c.v ->> 'nome' as nome, c.n as pos, count(*)::int as total,
           (count(*) filter (where r.correta and r.respondida_em is not null))::int as acertos
    from jsonb_array_elements(t.competencias) with ordinality c(v, n)
    join jsonb_array_elements(tt.questoes) with ordinality e(item, n) on true
    join public.vagas_questoes q on q.id = e.item ->> 'id' and q.competencia = c.v ->> 'id'
    left join public.vagas_tentativa_respostas r on r.tentativa_id = p_id and r.ordem = e.n - 1
    group by c.v ->> 'id', c.v ->> 'nome', c.n
  ) x;
  if v_rapidas * 3 >= tt.total then v_alertas := v_alertas || 'respostas_rapidas'::text; end if;
  if coalesce((tt.sinais ->> 'trocasAba')::int, 0) >= 3 then v_alertas := v_alertas || 'troca_aba'::text; end if;
  if coalesce((tt.sinais ->> 'copias')::int, 0) >= 1 then v_alertas := v_alertas || 'copiou_texto'::text; end if;
  v_fim := least(now(), tt.limite_em);
  update public.vagas_tentativas set
    status = case when tt.respondidas >= tt.total or now() <= tt.termina_em then 'concluida' else 'tempo_esgotado' end,
    finalizada_em = v_fim, acertos = v_acertos, nota = v_nota, nota_minima = t.nota_minima, por_competencia = v_comp,
    sinais = tt.sinais || jsonb_build_object('respostasRapidas', v_rapidas,
      'duracaoSeg', greatest(0, floor(extract(epoch from v_fim - tt.iniciada_em)))::int),
    alertas = v_alertas
  where id = p_id;
  if v_nota >= t.nota_minima then
    insert into public.vagas_selos (codigo, user_id, teste, tentativa_id, nota, emitido_em, valido_ate)
    values (vagas_interno.teste_gerar_codigo(), tt.user_id, tt.teste, tt.id, v_nota, v_fim,
      ((v_fim at time zone 'America/Boa_Vista')::date + make_interval(months => t.validade_meses))::date)
    on conflict (tentativa_id) do nothing;
  end if;
end;
$$;

-- Fecha as tentativas vencidas de uma pessoa (null = de todas, para um agendamento futuro pela service_role).
create or replace function vagas_interno.teste_fechar_vencidas(p_user uuid)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if current_setting('transaction_read_only', true) = 'on' then return 0; end if;
  for r in
    select tt.id from public.vagas_tentativas tt
    where tt.status = 'aberta' and (p_user is null or tt.user_id = p_user) and vagas_interno.teste_vencida(tt)
  loop
    perform vagas_interno.teste_fechar(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Resumo da tentativa para as telas.
create or replace function vagas_interno.teste_tentativa_json(tt public.vagas_tentativas, p_retomada boolean)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('ok', true, 'tentativa', json_build_object(
    'id', tt.id, 'teste', tt.teste, 'nome', coalesce(t.nome, tt.teste), 'total', tt.total, 'respondidas', tt.respondidas,
    'minutos', round(extract(epoch from tt.termina_em - tt.iniciada_em) / 60)::int,
    'segundosRestantes', greatest(0, floor(extract(epoch from tt.termina_em - now())))::int,
    'terminaEm', vagas_interno.teste_iso(tt.termina_em), 'retomada', p_retomada))
  from (select 1) um left join public.vagas_testes t on t.slug = tt.teste;
$$;

-- Questão atual (sem gabarito) e marca a hora em que foi mostrada (só da primeira vez: recarregar não zera o tempo).
create or replace function vagas_interno.teste_questao_json(tt public.vagas_tentativas)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  item jsonb := tt.questoes -> tt.respondidas;
  q public.vagas_questoes%rowtype;
  alts jsonb;
begin
  select * into q from public.vagas_questoes where id = item ->> 'id';
  insert into public.vagas_tentativa_respostas (tentativa_id, ordem, questao_id) values (tt.id, tt.respondidas, q.id)
  on conflict (tentativa_id, ordem) do nothing;
  select jsonb_agg(q.alternativas -> (p.v)::int order by p.n) into alts
    from jsonb_array_elements_text(item -> 'alt') with ordinality p(v, n);
  return jsonb_build_object('ok', true, 'fim', false, 'tentativa', tt.id, 'numero', tt.respondidas + 1, 'total', tt.total,
    'segundosRestantes', greatest(0, floor(extract(epoch from tt.termina_em - now())))::int,
    'questao', jsonb_build_object('texto', q.texto, 'enunciado', q.enunciado, 'alternativas', alts));
end;
$$;

-- Resultado de uma tentativa fechada (nunca diz quais questões a pessoa errou).
create or replace function vagas_interno.teste_resultado_json(tt public.vagas_tentativas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tentativa', tt.id, 'teste', tt.teste, 'nome', coalesce(t.nome, tt.teste), 'status', tt.status,
    'acertos', tt.acertos, 'total', tt.total, 'nota', tt.nota, 'margem', coalesce(t.margem_nota, 10),
    'notaMinima', coalesce(tt.nota_minima, t.nota_minima),
    'porCompetencia', coalesce(tt.por_competencia, '[]'::jsonb),
    'selo', (select vagas_interno.teste_selo_json(s) from public.vagas_selos s where s.tentativa_id = tt.id),
    'podeIniciarEm', case when exists (select 1 from public.vagas_tentativa_respostas r where r.tentativa_id = tt.id)
      then vagas_interno.teste_iso(tt.iniciada_em + interval '30 days') else null end)
  from (select 1) um left join public.vagas_testes t on t.slug = tt.teste;
$$;

-- Situação da pessoa num teste (para o catálogo).
create or replace function vagas_interno.teste_minha(p_user uuid, p_teste text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  ab public.vagas_tentativas%rowtype;
  ult public.vagas_tentativas%rowtype;
  s public.vagas_selos%rowtype;
  v_ini timestamptz;
begin
  select * into ab from public.vagas_tentativas where user_id = p_user and teste = p_teste and status = 'aberta';
  if ab.id is not null and vagas_interno.teste_vencida(ab) then ab := null; end if;
  select * into ult from public.vagas_tentativas
    where user_id = p_user and teste = p_teste and status <> 'aberta' order by iniciada_em desc limit 1;
  v_ini := vagas_interno.teste_ultimo_inicio(p_user, p_teste);
  select * into s from public.vagas_selos
    where user_id = p_user and teste = p_teste and not revogado and valido_ate >= vagas_interno.teste_hoje()
    order by nota desc, emitido_em desc limit 1;
  return jsonb_build_object(
    'aberta', case when ab.id is null then null else jsonb_build_object('tentativa', ab.id, 'respondidas', ab.respondidas,
      'total', ab.total, 'segundosRestantes', greatest(0, floor(extract(epoch from ab.termina_em - now())))::int) end,
    'ultima', case when ult.id is null then null else jsonb_build_object('status', ult.status, 'nota', ult.nota,
      'data', vagas_interno.teste_data(ult.finalizada_em)) end,
    'podeIniciarEm', case when ab.id is null and v_ini is not null and v_ini + interval '30 days' > now()
      then vagas_interno.teste_iso(v_ini + interval '30 days') else null end,
    'selo', case when s.id is null then null else vagas_interno.teste_selo_json(s) end);
end;
$$;

-- Para a exportação de dados da pessoa (LGPD): tentativas (resumo) e selos. Sem questões nem gabarito.
create or replace function vagas_interno.testes_exportar(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tentativas', coalesce((select jsonb_agg(jsonb_build_object('teste', tt.teste, 'status', tt.status,
        'iniciadaEm', vagas_interno.teste_iso(tt.iniciada_em), 'finalizadaEm', vagas_interno.teste_iso(tt.finalizada_em),
        'respondidas', tt.respondidas, 'total', tt.total, 'acertos', tt.acertos, 'nota', tt.nota,
        'porCompetencia', tt.por_competencia, 'sinais', tt.sinais, 'alertas', to_jsonb(tt.alertas)) order by tt.iniciada_em)
      from public.vagas_tentativas tt where tt.user_id = p_user), '[]'::jsonb),
    'selos', coalesce((select jsonb_agg(vagas_interno.teste_selo_json(s) order by s.emitido_em)
      from public.vagas_selos s where s.user_id = p_user), '[]'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- RPCs públicas
-- -----------------------------------------------------------------------------

-- Catálogo (anon e logado). Logado: + "minha" em cada teste. Só testes ativos e com questões.
create or replace function public.vagas_testes_catalogo()
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  lista jsonb;
begin
  if v_user is not null then perform vagas_interno.teste_fechar_vencidas(v_user); end if;
  select coalesce(jsonb_agg(
      jsonb_build_object('slug', t.slug, 'nome', t.nome, 'descricao', t.descricao, 'questoes', t.questoes_prova,
        'minutos', t.minutos, 'validadeMeses', t.validade_meses, 'notaMinima', t.nota_minima, 'margem', t.margem_nota,
        'competencias', (select coalesce(jsonb_agg(jsonb_build_object('id', c.v ->> 'id', 'nome', c.v ->> 'nome') order by c.n), '[]'::jsonb)
                         from jsonb_array_elements(t.competencias) with ordinality c(v, n)))
      || case when v_user is null then '{}'::jsonb else jsonb_build_object('minha', vagas_interno.teste_minha(v_user, t.slug)) end
      order by t.ordem, t.slug), '[]'::jsonb)
    into lista
  from public.vagas_testes t
  where t.ativo and exists (select 1 from public.vagas_questoes q where q.teste = t.slug and q.ativa);
  return json_build_object('ok', true,
    'regras', json_build_object('intervaloDias', 30, 'toleranciaSegPorQuestao', 10, 'supervisao', 'online'),
    'testes', lista);
end;
$$;

-- Começa (ou retoma) a tentativa da pessoa logada.
create or replace function public.vagas_iniciar_tentativa(p_teste text)
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  t public.vagas_testes%rowtype;
  ab public.vagas_tentativas%rowtype;
  v_ult timestamptz;
  v_origens text[];
  v_vistas text[];
  v_qs jsonb;
  v_tipo text;
  v_status text;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  -- Com a fundação (20261022) no banco: só conta de pessoa ativa faz teste.
  if to_regclass('public.vagas_contas') is not null then
    execute 'select c.tipo, c.status from public.vagas_contas c where c.user_id = $1' into v_tipo, v_status using v_user;
    if v_tipo is null or v_tipo <> 'pessoa' then
      return vagas_interno.teste_erro('so_pessoa', 'Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.');
    end if;
    if v_status <> 'ativa' then
      return vagas_interno.teste_erro('conta_inativa', 'Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.');
    end if;
  end if;
  select * into t from public.vagas_testes where slug = lower(btrim(coalesce(p_teste, ''))) and ativo;
  if not found then return vagas_interno.teste_erro('teste_indisponivel', 'Este teste não está disponível agora.'); end if;

  -- Uma por vez por pessoa e teste (duas abas ao mesmo tempo não criam duas tentativas).
  perform pg_advisory_xact_lock(hashtext('vagas_tentativa:' || v_user::text || ':' || t.slug));
  perform vagas_interno.teste_fechar_vencidas(v_user);

  select * into ab from public.vagas_tentativas where user_id = v_user and teste = t.slug and status = 'aberta';
  if found then return vagas_interno.teste_tentativa_json(ab, true); end if;

  v_ult := vagas_interno.teste_ultimo_inicio(v_user, t.slug);
  if v_ult is not null and v_ult + interval '30 days' > now() then
    return vagas_interno.teste_erro('aguarde', 'Você fez este teste há menos de 30 dias. Pode fazer de novo a partir de '
      || to_char((v_ult + interval '30 days') at time zone 'America/Boa_Vista', 'DD/MM/YYYY') || '.',
      jsonb_build_object('podeIniciarEm', vagas_interno.teste_iso(v_ult + interval '30 days')));
  end if;

  v_origens := disc_interno.origens_requisicao();
  if vagas_interno.teste_origem_bloqueada('vagas_tentativa', v_origens, 10, 60) then
    return vagas_interno.teste_erro('limite_origem', 'Muitos testes começados a partir desta conexão. Tente de novo mais tarde.');
  end if;

  select coalesce(array_agg(distinct e.item ->> 'id'), array[]::text[]) into v_vistas
    from public.vagas_tentativas tt, jsonb_array_elements(tt.questoes) e(item)
    where tt.user_id = v_user and tt.teste = t.slug;
  v_qs := vagas_interno.teste_sortear(t.slug, t.questoes_prova, v_vistas);
  if coalesce(jsonb_array_length(v_qs), 0) < t.questoes_prova then
    return vagas_interno.teste_erro('teste_indisponivel', 'Este teste não está disponível agora.');
  end if;

  insert into public.vagas_tentativas (user_id, teste, versao, iniciada_em, termina_em, limite_em, questoes, total)
  values (v_user, t.slug, t.versao, now(), now() + make_interval(mins => t.minutos),
    now() + make_interval(mins => t.minutos) + interval '10 seconds', v_qs, t.questoes_prova)
  returning * into ab;
  perform vagas_interno.teste_contar_origem('vagas_tentativa', v_origens);
  return vagas_interno.teste_tentativa_json(ab, false);
end;
$$;

-- Questão atual (uma por vez). Vencida: fecha e devolve {fim:true}.
create or replace function public.vagas_proxima_questao(p_tentativa uuid)
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  tt public.vagas_tentativas%rowtype;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  select * into tt from public.vagas_tentativas where id = p_tentativa and user_id = v_user for update;
  if not found then return vagas_interno.teste_erro('tentativa_inexistente', 'Teste não encontrado. Volte à lista de testes.'); end if;
  if vagas_interno.teste_vencida(tt) then
    perform vagas_interno.teste_fechar(tt.id);
    select * into tt from public.vagas_tentativas where id = p_tentativa;
  end if;
  if tt.status <> 'aberta' or tt.respondidas >= tt.total then
    return json_build_object('ok', true, 'fim', true, 'tentativa', tt.id, 'status', tt.status,
      'respondidas', tt.respondidas, 'total', tt.total);
  end if;
  return vagas_interno.teste_questao_json(tt)::json;
end;
$$;

-- Responde a questão atual (p_questao = número 1..total; p_alternativa = posição mostrada 0..3) e já devolve a próxima.
create or replace function public.vagas_responder(p_tentativa uuid, p_questao int, p_alternativa int)
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  tt public.vagas_tentativas%rowtype;
  r public.vagas_tentativa_respostas%rowtype;
  v_original int;
  v_certa smallint;
  base jsonb;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  select * into tt from public.vagas_tentativas where id = p_tentativa and user_id = v_user for update;
  if not found then return vagas_interno.teste_erro('tentativa_inexistente', 'Teste não encontrado. Volte à lista de testes.'); end if;
  if tt.status <> 'aberta' then
    return vagas_interno.teste_erro('encerrada', 'Este teste já foi encerrado.', '{"fim": true}'::jsonb);
  end if;
  -- Passou do prazo (fim oficial sem questão na tela, ou questão na tela além da tolerância de 10 s): fecha.
  if vagas_interno.teste_vencida(tt) then
    perform vagas_interno.teste_fechar(tt.id);
    return vagas_interno.teste_erro('tempo_esgotado', 'O tempo acabou. As respostas dadas até aqui foram guardadas.', '{"fim": true}'::jsonb);
  end if;
  if p_questao is null or p_questao < 1 or p_questao > tt.total then
    return vagas_interno.teste_erro('fora_de_ordem', 'Esta questão não está disponível. Siga para a questão atual.');
  end if;

  -- Reenvio de uma resposta já gravada (internet fraca): devolve o estado atual e não muda a resposta (sem voltar).
  if p_questao <= tt.respondidas then
    base := jsonb_build_object('ok', true, 'duplicado', true, 'respondidas', tt.respondidas, 'total', tt.total,
      'fim', tt.respondidas >= tt.total);
    if tt.respondidas < tt.total then base := base || jsonb_build_object('proxima', vagas_interno.teste_questao_json(tt)); end if;
    return base::json;
  end if;
  if p_questao > tt.respondidas + 1 then
    return vagas_interno.teste_erro('fora_de_ordem', 'Esta questão não está disponível. Siga para a questão atual.');
  end if;

  -- A questão atual precisa ter sido mostrada (pela vagas_proxima_questao ou pela resposta anterior).
  select * into r from public.vagas_tentativa_respostas where tentativa_id = tt.id and ordem = tt.respondidas;
  if not found then
    return vagas_interno.teste_erro('fora_de_ordem', 'Esta questão não está disponível. Siga para a questão atual.');
  end if;
  if p_alternativa is null or p_alternativa < 0 or p_alternativa > 3 then
    return vagas_interno.teste_erro('alternativa_invalida', 'Escolha uma das alternativas.');
  end if;
  v_original := (tt.questoes -> tt.respondidas -> 'alt' ->> p_alternativa)::int;
  select q.correta into v_certa from public.vagas_questoes q where q.id = r.questao_id;
  update public.vagas_tentativa_respostas
    set alternativa = p_alternativa, alternativa_original = v_original, correta = (v_original = v_certa), respondida_em = now()
    where tentativa_id = tt.id and ordem = tt.respondidas;
  update public.vagas_tentativas set respondidas = respondidas + 1 where id = tt.id returning * into tt;

  -- Última questão, ou fim oficial já passou (nenhuma questão nova depois do fim): fecha. A tela chama vagas_finalizar.
  if tt.respondidas >= tt.total or now() > tt.termina_em then
    perform vagas_interno.teste_fechar(tt.id);
    return json_build_object('ok', true, 'respondidas', tt.respondidas, 'total', tt.total, 'fim', true);
  end if;
  return (jsonb_build_object('ok', true, 'respondidas', tt.respondidas, 'total', tt.total, 'fim', false,
    'proxima', vagas_interno.teste_questao_json(tt)))::json;
end;
$$;

-- Encerra (se ainda aberta) e devolve o resultado. Idempotente.
create or replace function public.vagas_finalizar(p_tentativa uuid)
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  tt public.vagas_tentativas%rowtype;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  select * into tt from public.vagas_tentativas where id = p_tentativa and user_id = v_user for update;
  if not found then return vagas_interno.teste_erro('tentativa_inexistente', 'Teste não encontrado. Volte à lista de testes.'); end if;
  if tt.status = 'aberta' then
    perform vagas_interno.teste_fechar(tt.id);
    select * into tt from public.vagas_tentativas where id = p_tentativa;
  end if;
  return json_build_object('ok', true, 'resultado', vagas_interno.teste_resultado_json(tt));
end;
$$;

-- Sinal informado pelo aparelho durante a prova: 'troca_aba' (saiu da tela/aba) ou 'copiar' (copiou texto). Só registra.
create or replace function public.vagas_registrar_sinal(p_tentativa uuid, p_tipo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  v_chave text := case p_tipo when 'troca_aba' then 'trocasAba' when 'copiar' then 'copias' else null end;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  if v_chave is null then return vagas_interno.teste_erro('sinal_invalido', 'Sinal inválido.'); end if;
  update public.vagas_tentativas
    set sinais = sinais || jsonb_build_object(v_chave, least(999, coalesce((sinais ->> v_chave)::int, 0) + 1))
    where id = p_tentativa and user_id = v_user and status = 'aberta';
  if not found then return vagas_interno.teste_erro('tentativa_inexistente', 'Teste não encontrado. Volte à lista de testes.'); end if;
  return json_build_object('ok', true);
end;
$$;

-- Selos da pessoa logada (todos, com situação; "exibido" = o que vai no cartão: válido de maior nota por teste).
create or replace function public.vagas_meus_selos()
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_user uuid := vagas_interno.teste_usuario();
  lista jsonb;
begin
  if v_user is null then return vagas_interno.teste_erro_login(); end if;
  perform vagas_interno.teste_fechar_vencidas(v_user);
  select coalesce(jsonb_agg(vagas_interno.teste_selo_json(s) || jsonb_build_object('exibido', coalesce(s.id = (
      select x.id from public.vagas_selos x
      where x.user_id = v_user and x.teste = s.teste and not x.revogado and x.valido_ate >= vagas_interno.teste_hoje()
      order by x.nota desc, x.emitido_em desc limit 1), false))
    order by s.emitido_em desc), '[]'::jsonb)
    into lista
  from public.vagas_selos s where s.user_id = v_user;
  return json_build_object('ok', true, 'selos', lista);
end;
$$;

-- Conferência pública do selo pelo código (anon). Sem nome da pessoa. Limite por origem para códigos inexistentes.
create or replace function public.vagas_selo_publico(p_codigo text)
returns json language plpgsql volatile security definer set search_path = '' set timezone = 'UTC' as $$
declare
  msg constant text := 'Selo não encontrado. Confira o código.';
  v_codigo text := vagas_interno.teste_normalizar_codigo(p_codigo);
  v_origens text[] := disc_interno.origens_requisicao();
  s public.vagas_selos%rowtype;
begin
  if vagas_interno.teste_origem_bloqueada('vagas_selo', v_origens, 20, 100) then
    return vagas_interno.teste_erro('selo_inexistente', msg);
  end if;
  if v_codigo = '' then return vagas_interno.teste_erro('selo_inexistente', msg); end if;
  select * into s from public.vagas_selos where codigo = v_codigo;
  if not found then
    perform vagas_interno.teste_contar_origem('vagas_selo', v_origens);
    return vagas_interno.teste_erro('selo_inexistente', msg);
  end if;
  return json_build_object('ok', true, 'selo', vagas_interno.teste_selo_json(s));
end;
$$;

-- Só a equipe (public.e_admin): revoga um selo depois de revisão humana (fraude comprovada, erro de correção…).
create or replace function public.vagas_revogar_selo(p_codigo text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_codigo text := vagas_interno.teste_normalizar_codigo(p_codigo);
  v_motivo text := left(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), 300);
begin
  if not public.e_admin() then
    return vagas_interno.teste_erro('sem_permissao', 'Só a equipe da Gestão sem Caos pode revogar um selo.');
  end if;
  if v_motivo = '' then return vagas_interno.teste_erro('motivo', 'Escreva o motivo da revogação.'); end if;
  update public.vagas_selos set revogado = true, revogado_em = now(), motivo_revogacao = v_motivo
    where codigo = v_codigo and not revogado;
  if not found and not exists (select 1 from public.vagas_selos where codigo = v_codigo) then
    return vagas_interno.teste_erro('selo_inexistente', 'Selo não encontrado. Confira o código.');
  end if;
  return json_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões: a equipe (e_admin) lê tentativas e selos; questões, respostas e catálogo, ninguém pela API (só RPC).
-- -----------------------------------------------------------------------------

alter table public.vagas_testes enable row level security;
alter table public.vagas_questoes enable row level security;
alter table public.vagas_tentativas enable row level security;
alter table public.vagas_tentativa_respostas enable row level security;
alter table public.vagas_selos enable row level security;

drop policy if exists vagas_tentativas_equipe_le on public.vagas_tentativas;
create policy vagas_tentativas_equipe_le on public.vagas_tentativas for select to authenticated using (public.e_admin());
drop policy if exists vagas_selos_equipe_le on public.vagas_selos;
create policy vagas_selos_equipe_le on public.vagas_selos for select to authenticated using (public.e_admin());
-- vagas_testes, vagas_questoes e vagas_tentativa_respostas: nenhuma política (só as funções do banco).

revoke all on public.vagas_testes, public.vagas_questoes, public.vagas_tentativas, public.vagas_tentativa_respostas,
  public.vagas_selos from public;
revoke all on function vagas_interno.teste_erro(text, text, jsonb), vagas_interno.teste_erro_login(), vagas_interno.teste_iso(timestamptz),
  vagas_interno.teste_data(timestamptz), vagas_interno.teste_hoje(), vagas_interno.teste_usuario(), vagas_interno.teste_gerar_codigo(),
  vagas_interno.teste_normalizar_codigo(text), vagas_interno.teste_origem_bloqueada(text, text[], int, int),
  vagas_interno.teste_contar_origem(text, text[]), vagas_interno.teste_selo_json(public.vagas_selos), vagas_interno.selos_cartao(uuid),
  vagas_interno.teste_prazo(public.vagas_tentativas), vagas_interno.teste_vencida(public.vagas_tentativas),
  vagas_interno.teste_ultimo_inicio(uuid, text), vagas_interno.teste_sortear(text, int, text[]), vagas_interno.teste_fechar(uuid),
  vagas_interno.teste_fechar_vencidas(uuid), vagas_interno.teste_tentativa_json(public.vagas_tentativas, boolean),
  vagas_interno.teste_questao_json(public.vagas_tentativas), vagas_interno.teste_resultado_json(public.vagas_tentativas),
  vagas_interno.teste_minha(uuid, text), vagas_interno.testes_exportar(uuid) from public;
revoke all on function public.vagas_testes_catalogo(), public.vagas_iniciar_tentativa(text), public.vagas_proxima_questao(uuid),
  public.vagas_responder(uuid, int, int), public.vagas_finalizar(uuid), public.vagas_registrar_sinal(uuid, text),
  public.vagas_meus_selos(), public.vagas_selo_publico(text), public.vagas_revogar_selo(text, text) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.vagas_testes, public.vagas_questoes, public.vagas_tentativas, '
        || 'public.vagas_tentativa_respostas, public.vagas_selos from %I', papel);
      execute format('revoke all on all functions in schema vagas_interno from %I', papel);
      execute format('revoke all on function public.vagas_testes_catalogo(), public.vagas_iniciar_tentativa(text), '
        || 'public.vagas_proxima_questao(uuid), public.vagas_responder(uuid, int, int), public.vagas_finalizar(uuid), '
        || 'public.vagas_registrar_sinal(uuid, text), public.vagas_meus_selos(), public.vagas_selo_publico(text), '
        || 'public.vagas_revogar_selo(text, text) from %I', papel);
      execute format('grant execute on function public.vagas_testes_catalogo(), public.vagas_selo_publico(text) to %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.vagas_tentativas, public.vagas_selos to authenticated;
    grant execute on function public.vagas_iniciar_tentativa(text), public.vagas_proxima_questao(uuid),
      public.vagas_responder(uuid, int, int), public.vagas_finalizar(uuid), public.vagas_registrar_sinal(uuid, text),
      public.vagas_meus_selos(), public.vagas_revogar_selo(text, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.vagas_testes, public.vagas_questoes, public.vagas_tentativas, public.vagas_tentativa_respostas,
      public.vagas_selos to service_role;
    grant update on public.vagas_selos to service_role;
    grant execute on function vagas_interno.selos_cartao(uuid), vagas_interno.testes_exportar(uuid),
      vagas_interno.teste_fechar_vencidas(uuid) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261023120000_vagas_testes e 20261023120001_vagas_questoes (gerada). A entrada da 20261022 (fundação)
-- entra na integração.
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
      (17, '20261023120000_vagas_testes', to_regclass('public.vagas_tentativas') is not null
                                          and to_regprocedure('public.vagas_finalizar(uuid)') is not null),
      (18, '20261023120001_vagas_questoes', exists (select 1 from public.vagas_questoes q where q.ativa))
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261023120001, 'migracoes', to_jsonb(aplicadas),
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

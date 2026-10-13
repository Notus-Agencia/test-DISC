-- =============================================================================
-- Teste DISC — códigos de link de processo mais longos e limite de tentativas na consulta pública por código.
-- Roda DEPOIS das migrações anteriores (20261005120000_disc.sql … 20261017120000_clima.sql e as que vierem antes desta).
-- Idempotente e seguro sobre dados reais: troca uma regra (check) por outra mais larga e recria funções; nada é apagado
-- e NENHUM código existente muda (todo link já enviado continua valendo).
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Por quê: os links de processo (index.html?a=K7QZ) usavam 4 caracteres (~1 milhão de combinações) e
-- avaliacao_publica devolve o nome do processo e da empresa. Quem testasse códigos em sequência descobriria clientes.
--
--   * Processos NOVOS ganham código de 10 caracteres do alfabeto sem ambíguos ABCDEFGHJKLMNPQRSTUVWXYZ23456789
--     (32^10 ≈ 10^15 combinações), sorteados com o gerador criptográfico do Postgres (gen_random_uuid):
--     disc_interno.gerar_codigo_processo(). Os de 4 continuam valendo: normalizar_codigo e a regra da coluna
--     aceitam 4 OU 10 letras/algarismos (minúsculas e espaços são normalizados, como antes).
--   * Limite por origem nas duas consultas públicas por código (avaliacao_publica e enviar_resposta): cada código
--     INEXISTENTE conta 1 erro para a origem (tabela public.limites_vendas, tipo 'codigo_link', via contar_tentativa).
--     Com 20 erros em 10 minutos ou 100 em 24 horas a origem fica bloqueada: recebe a MESMA resposta de código
--     inexistente, até para um código certo. Processo desativado não conta (quem abre um link encerrado não é punido).
--   * Origem = IP do cliente como o PostgREST o recebe (request.headers), em DUAS chaves contadas separadamente:
--     cf-connecting-ip e o primeiro IP público de x-forwarded-for — quem forjar uma continua contado pela outra.
--     IPv6 conta pelo /64. Sem cabeçalhos (conexão direta ao banco: SQL Editor, migrações, testes) não há limite.
--     Chamada em transação só de leitura (GET no PostgREST), onde o erro não poderia ser contado: sempre a resposta
--     de código inexistente.
--   * versao_banco() passa a conhecer esta migração (versão 20261020120000).
-- Mesmas regras de formato em js/api.js, js/api-supabase.js, js/api-simulada.js e apps-script/Code.gs.
-- ATENÇÃO: não rode de novo as migrações anteriores depois desta sem rodar esta em seguida (a 20261011 recria
-- enviar_resposta e a 20261006 recria avaliacao_publica e o gatilho de processos sem o limite e com 4 caracteres).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Formato do código: 4 (antigos) ou 10 (novos) letras/algarismos
-- -----------------------------------------------------------------------------

-- normalizarCodigoAvaliacao: 4 ou 10 letras/algarismos (aceita minúsculas, espaços e apóstrofo inicial). '' se inválido.
create or replace function disc_interno.normalizar_codigo(p text)
returns text language sql immutable set search_path = '' as $$
  select case when s ~ '^([A-Z0-9]{4}|[A-Z0-9]{10})$' then s else '' end
  from (select upper(regexp_replace(regexp_replace(coalesce(p, ''), '^''', ''), '\s+', '', 'g')) as s) x;
$$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                 where conrelid = 'public.processos'::regclass and conname = 'processos_codigo_formato') then
    alter table public.processos add constraint processos_codigo_formato
      check (codigo ~ '^([A-Z0-9]{4}|[A-Z0-9]{10})$');
  end if;
end $$;
-- A regra antiga (só 4) sai depois que a nova já vale.
alter table public.processos drop constraint if exists processos_codigo_check;

-- Código novo: 10 caracteres de ABCDEFGHJKLMNPQRSTUVWXYZ23456789. Cada caractere vem de 1 byte do UUID aleatório
-- (gerador criptográfico; sem os dígitos fixos de versão e variante); 256 é múltiplo de 32, então byte % 32 é uniforme.
create or replace function disc_interno.gerar_codigo_processo()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  h text;
  cand text;
begin
  for t in 1..20 loop
    h := replace(pg_catalog.gen_random_uuid()::text, '-', '');
    h := substr(h, 1, 12) || substr(h, 18, 15);   -- 27 dígitos hexadecimais, todos aleatórios
    cand := '';
    for k in 0..9 loop
      cand := cand || substr(alfabeto, (('x' || substr(h, k * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
    end loop;
    if not exists (select 1 from public.processos pr where pr.codigo = cand) then return cand; end if;
  end loop;
  raise exception 'Não foi possível gerar um código novo. Tente de novo.';
end;
$$;

-- -----------------------------------------------------------------------------
-- processos: igual à 20261006, mas o código gerado tem 10 caracteres (os antigos ficam como estão)
-- -----------------------------------------------------------------------------

create or replace function disc_interno.processos_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  nome text;
begin
  if tg_op = 'UPDATE' and new.codigo is distinct from old.codigo and coalesce(new.codigo, '') = '' then
    new.codigo := old.codigo; -- o código do link nunca some
  end if;
  if coalesce(new.codigo, '') = '' then
    new.codigo := disc_interno.gerar_codigo_processo();
  else
    new.codigo := disc_interno.normalizar_codigo(new.codigo);
    if new.codigo = '' then raise exception 'Código do link inválido: use 4 ou 10 letras ou números.'; end if;
  end if;

  new.config := coalesce(new.config, '{}'::jsonb);
  if jsonb_typeof(new.config) <> 'object' then raise exception 'Configuração do processo inválida.'; end if;
  if char_length(new.config::text) > 40000 then raise exception 'Configuração do processo grande demais.'; end if;
  for x in
    select e from jsonb_array_elements(case when jsonb_typeof(new.config -> 'etapas') = 'array' then new.config -> 'etapas' else '[]'::jsonb end) e
    union all
    select e from jsonb_array_elements(case when jsonb_typeof(new.config -> 'bonus') = 'array' then new.config -> 'bonus' else '[]'::jsonb end) e
  loop
    if jsonb_typeof(x) = 'object' then
      nome := disc_interno.limpar_texto(disc_interno.texto(x -> 'campo'), 120);
      if nome <> '' and disc_interno.classificar_campo(nome, new.config) = 'sensivel' then
        raise exception 'O campo "%" é um dado sensível e não pode ser usado.', nome;
      end if;
    end if;
  end loop;

  if new.config ? 'formulario' then
    for x in
      select e from jsonb_array_elements(case when jsonb_typeof(new.config #> '{formulario,perguntas}') = 'array'
        then new.config #> '{formulario,perguntas}' else '[]'::jsonb end) e
    loop
      if jsonb_typeof(x) = 'object' then
        nome := disc_interno.limpar_texto(disc_interno.texto(x -> 'texto'), 200);
        -- Nas perguntas ao candidato não há exceção (nem saúde nem antecedentes).
        if nome <> '' and disc_interno.classificar_campo(nome, '{}'::jsonb) <> '' then
          raise exception 'A pergunta "%" pede um dado sensível e não pode ser usada.', nome;
        end if;
      end if;
    end loop;
    new.config := jsonb_set(new.config, '{formulario}', disc_interno.normalizar_formulario(new.config -> 'formulario'));
  end if;
  return new;
end;
$$;

drop trigger if exists processos_antes_gravar on public.processos;
create trigger processos_antes_gravar before insert or update on public.processos
  for each row execute function disc_interno.processos_antes_gravar();

-- -----------------------------------------------------------------------------
-- Origem da requisição e limite de erros de código
-- -----------------------------------------------------------------------------

-- Texto de cabeçalho -> inet (aceita "203.0.113.7:51234" e "[2001:db8::1]:443"); null se não for um IP.
create or replace function disc_interno.ip_de_texto(p text)
returns inet language plpgsql immutable set search_path = '' as $$
declare
  s text := btrim(coalesce(p, ''));
begin
  if s = '' or char_length(s) > 100 then return null; end if;
  if s ~ '^\[[0-9A-Fa-f:.]+\](:[0-9]+)?$' then
    s := substring(s from '^\[([0-9A-Fa-f:.]+)\]');
  elsif s ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}:[0-9]+$' then
    s := split_part(s, ':', 1);
  end if;
  begin
    return host(s::inet)::inet;   -- sem máscara ("1.2.3.4/8" vira 1.2.3.4)
  exception when others then
    return null;
  end;
end;
$$;

-- Endereço de rede privada, local ou reservada (não identifica a origem na internet).
create or replace function disc_interno.ip_publico(p inet)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and not (p <<= any (array['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '::/128', '::1/128', 'fc00::/7', 'fe80::/10']::inet[]));
$$;

-- Chave da origem: 'ip4:1.2.3.4' ou 'ip6:<prefixo /64>' (um aparelho troca de endereço dentro do /64).
create or replace function disc_interno.chave_ip(p inet)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when family(p) = 6 and p <<= '::ffff:0.0.0.0/96'::inet then 'ip4:' || substring(host(p) from '([0-9.]+)$')
    when family(p) = 6 then 'ip6:' || host(network(set_masklen(p, 64)))
    else 'ip4:' || host(p) end;
$$;

-- Chaves da origem da requisição feita pelo PostgREST: cf-connecting-ip e o primeiro IP público de x-forwarded-for
-- (sem repetir). Com cabeçalhos mas sem IP: {'sem-ip'}. Sem cabeçalhos (conexão direta ao banco): null.
create or replace function disc_interno.origens_requisicao()
returns text[] language plpgsql stable set search_path = '' as $$
declare
  h jsonb;
  saida text[] := array[]::text[];
  item text;
  ip inet;
  k text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  if h is null or jsonb_typeof(h) <> 'object' then return null; end if;
  if jsonb_typeof(h -> 'cf-connecting-ip') = 'string' then
    k := disc_interno.chave_ip(disc_interno.ip_de_texto(h ->> 'cf-connecting-ip'));
    if k is not null then saida := saida || k; end if;
  end if;
  if jsonb_typeof(h -> 'x-forwarded-for') = 'string' then
    foreach item in array string_to_array(left(h ->> 'x-forwarded-for', 2000), ',') loop
      ip := disc_interno.ip_de_texto(item);
      if disc_interno.ip_publico(ip) then
        k := disc_interno.chave_ip(ip);
        if not (k = any (saida)) then saida := saida || k; end if;
        exit;
      end if;
    end loop;
  end if;
  if cardinality(saida) = 0 then return array['sem-ip']; end if;
  return saida;
end;
$$;

-- Origem bloqueada para consultas por código: 20+ códigos inexistentes em 10 minutos ou 100+ em 24 horas em
-- qualquer uma das chaves. Transação só de leitura (o erro não poderia ser contado) também conta como bloqueada.
-- Sem origem (null = conexão direta ao banco) nunca bloqueia.
create or replace function disc_interno.codigo_link_bloqueado(p_origens text[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_origens is null then return false; end if;
  if current_setting('transaction_read_only', true) = 'on' then return true; end if;
  return exists (
    select 1 from unnest(p_origens) o(chave)
    where (select count(*) from public.limites_vendas l
            where l.tipo = 'codigo_link' and l.chave = o.chave and l.em > now() - interval '10 minutes') >= 20
       or (select count(*) from public.limites_vendas l
            where l.tipo = 'codigo_link' and l.chave = o.chave and l.em > now() - interval '1 day') >= 100);
end;
$$;

-- Conta 1 erro (código inexistente) para cada chave da origem. Sem origem: nada.
create or replace function disc_interno.registrar_codigo_inexistente(p_origens text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  o text;
begin
  if p_origens is null then return; end if;
  foreach o in array p_origens loop
    perform disc_interno.contar_tentativa('codigo_link', o, interval '1 day');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções públicas (anon) que consultam pelo código
-- -----------------------------------------------------------------------------

-- Dados do link (igual à 20261006) + limite por origem. Inexistente, desativado, mal escrito e origem bloqueada:
-- a MESMA resposta {ok:false, erro}. Agora volátil (grava o erro em limites_vendas).
create or replace function public.avaliacao_publica(p_codigo text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  msg constant text := 'Link inválido ou avaliação encerrada. Fale com quem enviou o link.';
  v_codigo text := disc_interno.normalizar_codigo(p_codigo);
  v_origens text[] := disc_interno.origens_requisicao();
  pr public.processos%rowtype;
  a jsonb;
begin
  if disc_interno.codigo_link_bloqueado(v_origens) then return disc_interno.erro(msg); end if;
  if v_codigo = '' then return disc_interno.erro(msg); end if;
  select * into pr from public.processos where codigo = v_codigo;
  if not found then
    perform disc_interno.registrar_codigo_inexistente(v_origens);
    return disc_interno.erro(msg);
  end if;
  if not pr.ativo then return disc_interno.erro(msg); end if;
  a := jsonb_build_object('codigo', pr.codigo, 'nome', pr.nome, 'tipo', pr.tipo,
    'empresaNome', pr.empresa, 'mostrarResultado', pr.mostrar_resultado,
    'formulario', disc_interno.normalizar_formulario(pr.config -> 'formulario'));
  return (jsonb_build_object('ok', true, 'avaliacao', a) || a)::json;
end;
$$;

-- Envio do processo seletivo: igual à 20261011 + o mesmo limite por origem na consulta do código do link.
create or replace function public.enviar_resposta(p_payload jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v jsonb;
  pl jsonb;
  d jsonb;
  existente public.respostas%rowtype;
  pr public.processos%rowtype;
  v_protocolo text;
  v_form jsonb := null;
  v_cod text;
  v_pessoa uuid;
  v_exigido text := null;
  v_modo_foto text;
  v_foto text := null;
  v_origens text[];
begin
  if p_payload is null then return disc_interno.erro('Dados do teste ausentes.'); end if;
  if char_length(p_payload::text) > 80000 then return disc_interno.erro('Requisição grande demais.'); end if;

  -- Formulário do processo do link (link inexistente/desativado: padrão; a recusa vem logo abaixo).
  -- Mesmo limite da avaliacao_publica: a origem que errou códigos demais recebe a resposta de link inexistente
  -- (até com um código certo) e cada código inexistente conta como erro — senão o envio viraria um jeito de
  -- descobrir quais códigos existem.
  if jsonb_typeof(p_payload) = 'object' then
    v_cod := disc_interno.normalizar_codigo(disc_interno.texto(p_payload -> 'avaliacao'));
    if v_cod <> '' then
      v_origens := disc_interno.origens_requisicao();
      if disc_interno.codigo_link_bloqueado(v_origens) then
        return disc_interno.erro('Este link de avaliação não está mais ativo.');
      end if;
      if not exists (select 1 from public.processos pp where pp.codigo = v_cod) then
        perform disc_interno.registrar_codigo_inexistente(v_origens);
      end if;
      select pp.config -> 'formulario' into v_form from public.processos pp where pp.codigo = v_cod and pp.ativo;
    end if;
  end if;

  v := disc_interno.validar_envio(p_payload, v_form);
  if not (v ->> 'ok')::boolean then return v::json; end if;
  pl := v -> 'payload';
  d := v -> 'disc';

  -- Parte 2: obrigatória e validada só com o formulário 'ligada'; senão o que vier é descartado.
  if disc_interno.normalizar_formulario(v_form) ->> 'parte2' = 'ligada' then
    v_exigido := case when jsonb_typeof(p_payload -> 'exigido') = 'string' then btrim(p_payload ->> 'exigido') else '' end;
    if not disc_interno.exigido_valido(v_exigido) then
      return disc_interno.erro('Responda também a segunda parte do teste.');
    end if;
    pl := pl || jsonb_build_object('exigido', v_exigido);
  end if;

  -- Foto (formulario.campos.foto): 'oculto' descarta; 'obrigatorio' exige; vazia = sem foto.
  v_modo_foto := disc_interno.normalizar_formulario(v_form) #>> '{campos,foto}';
  if v_modo_foto <> 'oculto' then
    v_foto := case when jsonb_typeof(p_payload -> 'foto') = 'string' then btrim(p_payload ->> 'foto') else '' end;
    if v_foto = '' then
      if v_modo_foto = 'obrigatorio' then return disc_interno.erro('Envie uma foto.'); end if;
      v_foto := null;
    elsif not disc_interno.foto_valida(v_foto) then
      return disc_interno.erro('Foto inválida ou grande demais. Escolha outra imagem.');
    end if;
  end if;

  -- Uma gravação por vez (protocolo único e limites sem corrida).
  perform pg_advisory_xact_lock(hashtext('disc_enviar_resposta'));

  select * into existente from public.respostas where id = pl ->> 'id';
  if found then
    if existente.origem = 'pessoal' then return disc_interno.erro('Identificador do envio inválido.'); end if;
    v_protocolo := existente.protocolo;
    if v_protocolo is null then
      begin
        v_protocolo := disc_interno.gerar_protocolo();
      exception when others then
        return disc_interno.erro(sqlerrm);
      end;
      update public.respostas set protocolo = v_protocolo where id = existente.id;
    end if;
    return json_build_object('ok', true, 'duplicado', true, 'id', existente.id, 'protocolo', v_protocolo);
  end if;

  if pl ->> 'avaliacao' <> '' then
    select * into pr from public.processos where codigo = pl ->> 'avaliacao';
    if not found or not pr.ativo then return disc_interno.erro('Este link de avaliação não está mais ativo.'); end if;
  end if;

  if (select count(*) from public.respostas r where r.origem = 'processo') >= 2000 then
    return disc_interno.erro('Limite de respostas atingido. Avise o recrutador.');
  end if;

  begin
    v_protocolo := disc_interno.gerar_protocolo();
  exception when others then
    return disc_interno.erro(sqlerrm);
  end;

  if (select count(*) from public.respostas r where r.origem = 'processo'
        and r.recebido_em > now() - interval '10 minutes') >= 40 then
    return disc_interno.erro('Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente.');
  end if;

  -- Ficha da pessoa: nome do envio e campos NÃO vazios do envio (vazio não apaga o que já havia; a foto
  -- nova substitui a antiga, sem foto mantém a que havia).
  insert into public.pessoas as pe (telefone, nome, idade, funcao, empresa, email, cidade, foto)
  values (pl ->> 'telefone', pl ->> 'nome', (pl ->> 'idade')::int, pl ->> 'funcao', pl ->> 'empresa',
    pl ->> 'email', pl ->> 'cidade', v_foto)
  on conflict (telefone) do update set
    nome = excluded.nome,
    idade = coalesce(excluded.idade, pe.idade),
    funcao = coalesce(nullif(excluded.funcao, ''), pe.funcao),
    empresa = coalesce(nullif(excluded.empresa, ''), pe.empresa),
    email = coalesce(nullif(excluded.email, ''), pe.email),
    cidade = coalesce(nullif(excluded.cidade, ''), pe.cidade),
    foto = coalesce(excluded.foto, pe.foto)
  returning id into v_pessoa;

  insert into public.respostas (id, processo_id, avaliacao, protocolo, recebido_em, nome, telefone, idade, vaga,
    funcao, empresa, email, cidade, extras, pessoa_id, inicio, fim, duracao_seg, respostas, exigido, foto, d, i, s, c, perfil,
    validacao, status, observacoes, payload)
  values (pl ->> 'id', pr.id, pl ->> 'avaliacao', v_protocolo, now(), pl ->> 'nome', pl ->> 'telefone',
    (pl ->> 'idade')::int, pl ->> 'vaga', pl ->> 'funcao', pl ->> 'empresa', pl ->> 'email', pl ->> 'cidade',
    pl -> 'extras', v_pessoa,
    nullif(pl ->> 'inicio', '')::timestamptz, nullif(pl ->> 'fim', '')::timestamptz,
    (pl ->> 'duracaoSeg')::int, pl ->> 'respostas', v_exigido, v_foto,
    (d #>> '{percentuais,D}')::numeric, (d #>> '{percentuais,I}')::numeric,
    (d #>> '{percentuais,S}')::numeric, (d #>> '{percentuais,C}')::numeric,
    d ->> 'codigo', pl -> 'validacao', 'em_analise', '', pl);

  -- Teste de equipe: quem responde pelo link de um processo 'equipe' ligado a uma empresa vira colaborador
  -- ativo dela (cargo = função informada), se ainda não tiver vínculo ativo em NENHUMA empresa.
  if pr.id is not null and pr.tipo = 'equipe' and pr.empresa_id is not null
     and not exists (select 1 from public.vinculos vi where vi.pessoa_id = v_pessoa and vi.status = 'ativo') then
    insert into public.vinculos (pessoa_id, empresa_id, cargo, status)
    values (v_pessoa, pr.empresa_id, left(coalesce(pl ->> 'funcao', ''), 120), 'ativo')
    on conflict do nothing;
  end if;

  return json_build_object('ok', true, 'id', pl ->> 'id', 'protocolo', v_protocolo);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões: auxiliares só para as funções do banco; as públicas continuam como estavam
-- -----------------------------------------------------------------------------

revoke all on function disc_interno.gerar_codigo_processo(), disc_interno.ip_de_texto(text), disc_interno.ip_publico(inet),
  disc_interno.chave_ip(inet), disc_interno.origens_requisicao(), disc_interno.codigo_link_bloqueado(text[]),
  disc_interno.registrar_codigo_inexistente(text[]) from public;
revoke all on function public.avaliacao_publica(text), public.enviar_resposta(jsonb) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on function disc_interno.gerar_codigo_processo(), disc_interno.ip_de_texto(text), '
        || 'disc_interno.ip_publico(inet), disc_interno.chave_ip(inet), disc_interno.origens_requisicao(), '
        || 'disc_interno.codigo_link_bloqueado(text[]), disc_interno.registrar_codigo_inexistente(text[]) from %I', papel);
      execute format('grant execute on function public.avaliacao_publica(text), public.enviar_resposta(jsonb) to %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.avaliacao_publica(text), public.enviar_resposta(jsonb) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261020120000_codigos_processo
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
      (13, '20261020120000_codigos_processo', to_regprocedure('disc_interno.gerar_codigo_processo()') is not null
                                              and to_regprocedure('disc_interno.codigo_link_bloqueado(text[])') is not null
                                              and exists (select 1 from pg_catalog.pg_constraint c
                                                           where c.conrelid = to_regclass('public.processos')
                                                             and c.conname = 'processos_codigo_formato'))
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261020120000, 'migracoes', to_jsonb(aplicadas),
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

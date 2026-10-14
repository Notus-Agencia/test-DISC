-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — ajustes da FASE C (revisões de psicologia, jurídico e das frentes). Roda DEPOIS de
-- 20261024120004_vagas_pre_abertura.sql. Idempotente e seguro sobre dados reais: acrescenta tabela, colunas, funções e
-- permissões, recria versao_banco() e só muda dados onde a regra manda (abaixo). Contrato: docs/VAGAS-SPEC.md.
--
--   1. VETO P2 (psicologia): a empresa NUNCA sabe o que a pessoa fez com a referência. Para a empresa (e a operação), o
--      estado é só 'enviada' ou 'removida' (pela moderação); "Referências dadas" não traz aceita/recusada/aceitaEm, nem as
--      enviadas por e-mail (que revelariam se o e-mail tem conta); a empresa não vê a própria referência no perfil da pessoa
--      (cartão: temReferencia; contato: referencias; página pública com login); oferecer de novo dá a MESMA resposta antes
--      e depois da resposta da pessoa; o limite de 20 em 30 dias conta todo envio por e-mail (vagas_referencia_envios_email).
--   2. CLT art. 442-A: experiência pedida na vaga = nao_precisa | ajuda | 6_meses. As vagas com ate_1, 1_a_3 ou mais_3 passam
--      a 6_meses aqui, e a entrada ainda aceita os ids antigos, convertendo.
--   3. vagas_cartoes ignora escolaridadeMin e experienciaMinMeses (como já ignora temSelo); ficam zona, turnos, CNH e pretensão.
--
-- Rodar a 20261022 ou a 20261024120000 de novo DEPOIS desta volta as funções redefinidas aqui à versão antiga: rode esta em
-- seguida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Veto P2: o que a empresa vê das referências que deu
-- -----------------------------------------------------------------------------

-- Cada referência oferecida por e-mail (só a contagem do limite de 20 em 30 dias; sem e-mail, sem pessoa). Sem acesso pela API.
create table if not exists public.vagas_referencia_envios_email (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null references public.vagas_empresas (id) on delete cascade,
  em          timestamptz not null default now()
);
create index if not exists vagas_referencia_envios_email_idx on public.vagas_referencia_envios_email (empresa_id, em);
alter table public.vagas_referencia_envios_email enable row level security;
revoke all on public.vagas_referencia_envios_email from public;
do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.vagas_referencia_envios_email from %I', papel);
    end if;
  end loop;
end $$;

-- Estado que a EMPRESA AUTORA (e a operação) enxerga: 'enviada' (o que ela escreveu, com a pessoa) ou 'removida' (pela
-- moderação). Nada do que a pessoa fez (aceitar, recusar, ocultar, remover, publicar) muda o que a empresa vê.
create or replace function vagas_interno.referencia_status_empresa(r public.vagas_referencias)
returns text language sql immutable set search_path = '' as $$
  select case when r.status = 'removida' and r.removida_por = 'moderacao' then 'removida' else 'enviada' end;
$$;

-- A empresa p_empresa enxerga esta referência no perfil da pessoa? Só referência VISÍVEL de OUTRA empresa: a própria nunca
-- aparece (aparecer só depois do aceite contaria à empresa que a pessoa aceitou).
create or replace function vagas_interno.referencia_para_empresa(r public.vagas_referencias, p_empresas uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select vagas_interno.referencia_visivel(r) and not (r.empresa_id = any (coalesce(p_empresas, array[]::uuid[])));
$$;

-- Limite de 20 em 30 dias: as referências da empresa que não vieram por e-mail + cada envio por e-mail (tenha o e-mail conta
-- ou não, aceite a pessoa ou não). O "restantes" não revela nem conta nem resposta.
create or replace function vagas_interno.referencias_no_mes(p_empresa uuid)
returns int language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.vagas_referencias r
           where r.empresa_id = p_empresa and r.criado_em > now() - interval '30 days' and r.origem <> 'email')
       + (select count(*)::int from public.vagas_referencia_envios_email x
           where x.empresa_id = p_empresa and x.em > now() - interval '30 days');
$$;

-- "Referências dadas": só o que a empresa escreveu e o estado DELA (enviada | removida pela moderação, e a moderação do
-- texto). As enviadas por e-mail não aparecem (revelariam se o e-mail tem conta). Nunca aceita, recusada ou aceitaEm.
create or replace function public.vagas_referencias_empresa(p_empresa uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('referencias', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, true)
      || jsonb_build_object('status', vagas_interno.referencia_status_empresa(r), 'textoMotivo', r.texto_motivo, 'origem', r.origem)
      order by r.criado_em desc)
    from public.vagas_referencias r where r.empresa_id = p_empresa and r.origem <> 'email'), '[]'::jsonb),
    'restantes30Dias', greatest(0, 20 - vagas_interno.referencias_no_mes(p_empresa))));
end;
$$;

-- Oferecer: IGUAL à da 20261022, com o veto P2 (mesma resposta antes e depois da resposta da pessoa; envio por e-mail conta
-- no limite; o estado devolvido é o da empresa).
create or replace function public.vagas_referencia_oferecer(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  v_uid uuid := auth.uid();
  re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_emp_txt text := btrim(disc_interno.texto(d -> 'empresaId'));
  e public.vagas_empresas%rowtype;
  cv public.vagas_referencia_convites%rowtype;
  k public.vagas_candidaturas%rowtype;
  r public.vagas_referencias%rowtype;
  v_pessoa uuid := null;
  v_origem text;
  v_neutro boolean := false;
  v_funcao text := disc_interno.limpar_texto(disc_interno.texto(d -> 'funcao'), 80);
  v_vinculo text := disc_interno.texto(d -> 'vinculo');
  v_ini date := vagas_interno.ler_mes(disc_interno.texto(d -> 'inicio'));
  v_fim date := null;
  v_pontos text[] := vagas_interno.lista_enum(d -> 'pontosFortes', vagas_interno.pontos_fortes());
  v_recomenda text[] := vagas_interno.lista_texto(d -> 'recomendaPara', 60);
  v_texto text := disc_interno.texto(d -> 'texto');
  v_mes date := date_trunc('month', now())::date;
  t jsonb;
  x text;
  v_email text;
  v_tok text := lower(btrim(disc_interno.texto(d -> 'conviteToken')));
  v_cand text := btrim(disc_interno.texto(d -> 'candidaturaId'));
  v_email_txt text := btrim(disc_interno.texto(d -> 'email'));
  neutro constant json := vagas_interno.ok('{"enviada": true}');
  v_no_limite boolean;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if v_emp_txt !~ re then return vagas_interno.erro('Empresa não encontrada.'); end if;
  select * into e from public.vagas_empresas where id = v_emp_txt::uuid;
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if e.status <> 'ativa' or e.cnpj_conferido_em is null then
    return vagas_interno.erro('Só empresa verificada pela Gestão sem Caos pode dar referência.');
  end if;
  -- Para quem
  if v_tok <> '' then
    select * into cv from public.vagas_referencia_convites where token = v_tok for update;
    if not found or cv.status <> 'aberto' or cv.expira_em <= now() or (cv.empresa_id is not null and cv.empresa_id <> e.id) then
      return vagas_interno.erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
    end if;
    v_pessoa := cv.pessoa_id;
    v_origem := 'convite';
  elsif v_cand <> '' then
    if v_cand !~ re then return vagas_interno.erro('Candidatura não encontrada.'); end if;
    select * into k from public.vagas_candidaturas where id = v_cand::uuid and empresa_id = e.id and status in ('combinou', 'contratada')
                                                       and contato_cortado_em is null;
    if not found then return vagas_interno.erro('Candidatura não encontrada.'); end if;
    v_pessoa := k.pessoa_id;
    v_origem := 'candidatura';
  elsif v_email_txt <> '' then
    v_email := vagas_interno.email(v_email_txt);
    if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
    if vagas_interno.contar('referencia_email', e.id::text, interval '1 day') > 30 then
      return vagas_interno.erro('Muitos envios por e-mail hoje. Tente de novo amanhã.', '{"bloqueado": true}');
    end if;
    select c.user_id into v_pessoa from auth.users u join public.vagas_contas c on c.user_id = u.id
     where lower(u.email) = v_email and c.tipo = 'pessoa' and c.status <> 'suspensa';
    v_origem := 'email';
    v_neutro := true;
  else
    return vagas_interno.erro('Informe para quem é a referência.');
  end if;
  -- Conteúdo
  if char_length(v_funcao) < 2 then return vagas_interno.erro('Informe a função que a pessoa exercia.'); end if;
  if v_vinculo not in ('clt', 'temporario', 'diaria', 'estagio', 'freelancer') then return vagas_interno.erro('Escolha o tipo de vínculo.'); end if;
  if v_ini is null then return vagas_interno.erro('Informe o mês de início (AAAA-MM).'); end if;
  if v_ini > v_mes then return vagas_interno.erro('O início não pode estar no futuro.'); end if;
  if btrim(disc_interno.texto(d -> 'fim')) <> '' then
    v_fim := vagas_interno.ler_mes(disc_interno.texto(d -> 'fim'));
    if v_fim is null then return vagas_interno.erro('Mês de saída inválido (AAAA-MM).'); end if;
    if v_fim < v_ini then return vagas_interno.erro('A saída não pode ser antes do início.'); end if;
    if v_fim > v_mes then return vagas_interno.erro('A saída não pode estar no futuro.'); end if;
  end if;
  if cardinality(v_pontos) < 1 or cardinality(v_pontos) > 3 then return vagas_interno.erro('Escolha de 1 a 3 pontos fortes.'); end if;
  if cardinality(v_recomenda) > 5 then return vagas_interno.erro('Escolha até 5 funções em "Recomendaria para".'); end if;
  if char_length(v_texto) > 300 then return vagas_interno.erro('O texto pode ter até 300 caracteres.'); end if;
  v_texto := disc_interno.limpar_texto(v_texto, 300);
  if d -> 'declaracao' is distinct from 'true'::jsonb then
    return vagas_interno.erro('Confirme a declaração de que a pessoa trabalhou na empresa no período informado.');
  end if;
  foreach x in array array[v_funcao] || v_recomenda loop
    t := vagas_interno.conferir_texto(x, 'cartao');
    if t is not null then return vagas_interno.erro(t ->> 'erro'); end if;
  end loop;
  t := vagas_interno.conferir_texto(v_texto, 'referencia');
  if t is not null then return vagas_interno.erro(t ->> 'erro'); end if;
  -- Limite de 20 em 30 dias, decidido ANTES de saber se o e-mail tem conta: a resposta por e-mail é a mesma com ou sem
  -- conta, inclusive no limite (e o limite conta só o que a empresa consegue ver: nada por e-mail que não foi aceito).
  v_no_limite := vagas_interno.referencias_no_mes(e.id) >= 20;
  if v_neutro and v_no_limite then return neutro; end if;
  -- Envio por e-mail conta no limite SEMPRE (com ou sem conta, aceita ou não): o contador não revela nada (20261024120005).
  if v_neutro then
    delete from public.vagas_referencia_envios_email where empresa_id = e.id and em < now() - interval '31 days';
    insert into public.vagas_referencia_envios_email (empresa_id) values (e.id);
  end if;
  if v_pessoa is null then return neutro; end if;
  -- Regra "1 por empresa por pessoa". Depois de dada, a empresa só muda a referência se a pessoa pedir de novo (convite).
  -- A MESMA resposta para pendente, aceita, ocultada, removida ou recusada (veto P2, 20261024120005: a empresa não descobre
  -- se a pessoa já respondeu nem o que respondeu).
  select * into r from public.vagas_referencias where empresa_id = e.id and pessoa_id = v_pessoa for update;
  if found and v_origem <> 'convite' then
    if v_neutro then return neutro; end if;
    return vagas_interno.erro('Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
  end if;
  if not found and v_no_limite then
    return vagas_interno.erro('Sua empresa chegou ao limite de 20 referências em 30 dias.', '{"bloqueado": true}');
  end if;
  begin
    if r.id is null then
      insert into public.vagas_referencias (empresa_id, pessoa_id, autor, convite_id, funcao, vinculo, inicio, fim, pontos_fortes, recomenda_para,
        texto, declaracao, texto_status, origem)
      values (e.id, v_pessoa, v_uid, cv.id, v_funcao, v_vinculo, v_ini, v_fim, v_pontos, v_recomenda, v_texto, true,
        case when v_texto = '' then 'sem_texto' else 'pendente' end, v_origem)
      returning * into r;
    else
      update public.vagas_referencias set autor = v_uid, convite_id = coalesce(cv.id, convite_id), funcao = v_funcao, vinculo = v_vinculo,
        inicio = v_ini, fim = v_fim, pontos_fortes = v_pontos, recomenda_para = v_recomenda, texto = v_texto, declaracao = true,
        texto_status = case when v_texto = '' then 'sem_texto' else 'pendente' end, texto_motivo = '', moderado_por = null, moderado_em = null,
        status = 'pendente', respondida_em = null, aceita_em = null, removida_por = null,
        origem = case when v_origem = 'email' then origem else v_origem end
      where id = r.id returning * into r;
    end if;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when unique_violation then
      -- Duas ofertas ao mesmo tempo para a mesma pessoa: a segunda recebe a mesma resposta de "já deu referência".
      if v_neutro then return neutro; end if;
      return vagas_interno.erro('Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
    when check_violation or not_null_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  insert into public.vagas_referencia_historico (referencia_id, acao, por) values (r.id, 'oferecida', 'empresa');
  if cv.id is not null then
    update public.vagas_referencia_convites set status = 'usado', usado_em = now(), referencia_id = r.id where id = cv.id;
  end if;
  if v_neutro then return neutro; end if;
  return vagas_interno.ok(jsonb_build_object('referencia', vagas_interno.referencia_json(r, true)
    || jsonb_build_object('status', vagas_interno.referencia_status_empresa(r))));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. CLT art. 442-A: experiência pedida na vaga
-- -----------------------------------------------------------------------------

-- Lista fechada (igual a VAGAS_REGRAS.EXPERIENCIAS_VAGA): não precisa | ajuda ter, mas não é obrigatória | pelo menos 6 meses
-- na função. A CLT (art. 442-A) não deixa exigir mais de 6 meses de experiência no mesmo tipo de atividade.
create or replace function vagas_interno.experiencias_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['nao_precisa', 'ajuda', '6_meses'];
$$;

-- As vagas que já existem: ate_1, 1_a_3 e mais_3 viram 6_meses (sem passar pelo gatilho: só esta coluna muda).
alter table public.vagas_anuncios drop constraint if exists vagas_anuncios_experiencia_check;
alter table public.vagas_anuncios disable trigger vagas_anuncios_antes_gravar;
update public.vagas_anuncios set experiencia = '6_meses' where experiencia in ('ate_1', '1_a_3', 'mais_3');
alter table public.vagas_anuncios enable trigger vagas_anuncios_antes_gravar;
alter table public.vagas_anuncios add constraint vagas_anuncios_experiencia_check check (experiencia in ('nao_precisa', 'ajuda', '6_meses'));

-- Leitura do anúncio: IGUAL à da 20261022, convertendo os ids antigos da experiência.
create or replace function vagas_interno.ler_anuncio(d jsonb, p_cidade_padrao uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_area text := lower(btrim(disc_interno.texto(d -> 'area')));
  v_funcao text := disc_interno.limpar_texto(disc_interno.texto(d -> 'funcao'), 60);
  v_mod text := disc_interno.texto(d -> 'modalidade');
  v_desc text := disc_interno.texto(d -> 'descricao');
  v_turno text := disc_interno.texto(d -> 'turno');
  -- 20261024120005 (CLT art. 442-A): os ids antigos de tempo de experiência viram '6_meses'.
  v_exp text := case when disc_interno.texto(d -> 'experiencia') in ('ate_1', '1_a_3', 'mais_3') then '6_meses'
                     else disc_interno.texto(d -> 'experiencia') end;
  v_esc text := coalesce(nullif(btrim(disc_interno.texto(d -> 'escolaridade')), ''), 'nao_exigida');
  v_ini text := coalesce(nullif(btrim(disc_interno.texto(d -> 'inicio')), ''), 'imediato');
  v_ini_data date := null;
  v_req text[] := vagas_interno.lista_enum(d -> 'requisitos', vagas_interno.requisitos_vaga());
  v_outro text := disc_interno.texto(vagas_interno.chave(d, 'requisitoOutro', 'requisito_outro'));
  v_selo text := lower(btrim(disc_interno.texto(d -> 'selo')));
  v_ben text[] := vagas_interno.lista_enum(d -> 'beneficios', vagas_interno.beneficios_vaga());
  v_comissao boolean := coalesce(d -> 'comissao' = 'true'::jsonb, false);
  v_fds boolean := coalesce(vagas_interno.chave(d, 'fimDeSemana', 'fim_de_semana') = 'true'::jsonb, false);
  v_qtd int := coalesce(vagas_interno.inteiro(d -> 'quantidade'), 1);
  v_min int := vagas_interno.inteiro(vagas_interno.chave(d, 'salarioDe', 'salario_de'));
  v_max int := vagas_interno.inteiro(vagas_interno.chave(d, 'salarioAte', 'salario_ate'));
  v_uni text := btrim(disc_interno.texto(vagas_interno.chave(d, 'valorUnidade', 'valor_unidade')));
  v_dias int := coalesce(vagas_interno.inteiro(vagas_interno.chave(d, 'diasNoAr', 'dias_no_ar')), 30);
  v_prazo int := coalesce(vagas_interno.inteiro(vagas_interno.chave(d, 'prazoHoras', 'prazo_horas')), 48);
  v_horas int := vagas_interno.inteiro(vagas_interno.chave(d, 'horasDia', 'horas_dia'));
  v_cid uuid := p_cidade_padrao;
  v_zona uuid := null;
  v_data date := null;
  v_hi time := null;
  v_hf time := null;
  v_txt text;
  v_hoje date;
begin
  if not exists (select 1 from public.vagas_areas ar where ar.slug = v_area and ar.ativa) then
    return jsonb_build_object('ok', false, 'erro', 'Escolha a área da vaga.');
  end if;
  if char_length(v_funcao) < 2 then return jsonb_build_object('ok', false, 'erro', 'Informe a função (ex.: Atendente).'); end if;
  if not (v_mod = any (vagas_interno.modalidades())) then
    return jsonb_build_object('ok', false, 'erro', 'Escolha o tipo de vaga: CLT, temporário, diária, freelancer ou estágio.');
  end if;
  if v_qtd < 1 or v_qtd > 100 then return jsonb_build_object('ok', false, 'erro', 'Quantidade de vagas inválida (1 a 100).'); end if;
  if not (v_turno = any (vagas_interno.turnos_vaga())) then return jsonb_build_object('ok', false, 'erro', 'Escolha o turno da vaga.'); end if;
  if not (v_exp = any (vagas_interno.experiencias_vaga())) then
    return jsonb_build_object('ok', false, 'erro', 'Escolha a experiência que a vaga pede.');
  end if;
  if not (v_esc = any (vagas_interno.escolaridades_vaga())) then return jsonb_build_object('ok', false, 'erro', 'Escolaridade mínima inválida.'); end if;
  if char_length(v_outro) > 80 then return jsonb_build_object('ok', false, 'erro', 'O requisito "Outro" pode ter até 80 caracteres.'); end if;
  v_outro := disc_interno.limpar_texto(v_outro, 80);
  if 'outro' = any (v_req) and v_outro = '' then return jsonb_build_object('ok', false, 'erro', 'Escreva qual é o outro requisito.'); end if;
  if v_outro <> '' and not ('outro' = any (v_req)) then v_req := vagas_interno.lista_enum(to_jsonb(v_req || 'outro'::text), vagas_interno.requisitos_vaga()); end if;
  if v_selo in ('', 'nenhum') then v_selo := null; end if;
  if v_selo is not null and not (v_selo = any (vagas_interno.testes_selo())) then
    return jsonb_build_object('ok', false, 'erro', 'Escolha um dos testes da plataforma ou "nenhum".');
  end if;
  -- Comissão: o campo e o benefício andam juntos.
  if v_comissao and not ('comissao' = any (v_ben)) then v_ben := vagas_interno.lista_enum(to_jsonb(v_ben || 'comissao'::text), vagas_interno.beneficios_vaga()); end if;
  v_comissao := 'comissao' = any (v_ben);
  if v_uni = '' then v_uni := case v_mod when 'diaria' then 'dia' when 'freelancer' then 'servico' else 'mes' end; end if;
  if v_min is null or v_min < 100 then
    return jsonb_build_object('ok', false, 'erro', case v_mod
      when 'estagio' then 'Informe o valor da bolsa.'
      when 'diaria' then 'Informe a data, o horário e o valor da diária.'
      when 'freelancer' then 'Informe o valor do serviço.'
      else 'Informe o salário ou a faixa salarial.' end);
  end if;
  if v_min > 10000000 or coalesce(v_max, 0) > 10000000 then return jsonb_build_object('ok', false, 'erro', 'Valor alto demais. Confira o salário.'); end if;
  if v_max is not null and v_max < v_min then
    return jsonb_build_object('ok', false, 'erro', 'O valor máximo da faixa não pode ser menor que o mínimo.');
  end if;
  if not ((v_mod in ('clt', 'temporario', 'estagio') and v_uni in ('mes', 'hora')) or (v_mod = 'diaria' and v_uni = 'dia')
          or (v_mod = 'freelancer' and v_uni in ('servico', 'hora', 'dia'))) then
    return jsonb_build_object('ok', false, 'erro', 'Unidade do valor inválida para este tipo de vaga.');
  end if;
  if char_length(v_desc) > 1500 then return jsonb_build_object('ok', false, 'erro', 'A descrição pode ter até 1.500 caracteres.'); end if;
  v_desc := vagas_interno.limpar_multilinha(v_desc, 1500);
  if char_length(v_desc) < 40 then return jsonb_build_object('ok', false, 'erro', 'Descreva a vaga em pelo menos 40 caracteres.'); end if;
  if btrim(disc_interno.texto(d -> 'cidade')) <> '' then
    select c.id into v_cid from public.vagas_cidades c where c.slug = lower(btrim(disc_interno.texto(d -> 'cidade'))) and c.status <> 'rascunho';
    if v_cid is null then return jsonb_build_object('ok', false, 'erro', 'Cidade não encontrada.'); end if;
  end if;
  if btrim(disc_interno.texto(d -> 'zona')) <> '' then
    select z.id into v_zona from public.vagas_zonas z where z.cidade_id = v_cid and z.slug = lower(btrim(disc_interno.texto(d -> 'zona')));
    if v_zona is null then return jsonb_build_object('ok', false, 'erro', 'Escolha uma zona da cidade da vaga.'); end if;
  end if;
  v_hoje := vagas_interno.hoje((select c.fuso from public.vagas_cidades c where c.id = v_cid));
  if v_mod = 'estagio' then
    if v_horas is null or v_horas < 1 or v_horas > 6 then
      return jsonb_build_object('ok', false, 'erro', 'Informe as horas por dia do estágio (até 6).');
    end if;
  else
    v_horas := null;
  end if;
  if v_mod = 'diaria' then
    v_txt := btrim(disc_interno.texto(vagas_interno.chave(d, 'data', 'dataTrabalho')));
    if v_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin v_data := v_txt::date; exception when others then v_data := null; end;
    end if;
    v_txt := btrim(disc_interno.texto(vagas_interno.chave(d, 'horaInicio', 'hora_inicio')));
    if v_txt ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_hi := v_txt::time; end if;
    v_txt := btrim(disc_interno.texto(vagas_interno.chave(d, 'horaFim', 'hora_fim')));
    if v_txt ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_hf := v_txt::time; end if;
    if v_data is null or v_hi is null or v_hf is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe a data, o horário e o valor da diária.');
    end if;
    if v_prazo < 48 or v_prazo > 168 then return jsonb_build_object('ok', false, 'erro', 'A diária fica no ar de 48 a 168 horas.'); end if;
    v_ini := 'data';
    v_ini_data := v_data;   -- a diária começa no dia do trabalho
  else
    v_prazo := null;
    if v_dias < 7 or v_dias > 60 then return jsonb_build_object('ok', false, 'erro', 'Escolha de 7 a 60 dias no ar.'); end if;
    if v_ini not in ('imediato', 'data') then return jsonb_build_object('ok', false, 'erro', 'Escolha quando a pessoa começa.'); end if;
    if v_ini = 'data' then
      v_txt := btrim(disc_interno.texto(vagas_interno.chave(d, 'inicioData', 'inicio_data')));
      if v_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        begin v_ini_data := v_txt::date; exception when others then v_ini_data := null; end;
      end if;
      if v_ini_data is null then return jsonb_build_object('ok', false, 'erro', 'Informe a data de início (AAAA-MM-DD).'); end if;
      if v_ini_data < v_hoje then return jsonb_build_object('ok', false, 'erro', 'A data de início não pode estar no passado.'); end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'campos', jsonb_build_object('area', v_area, 'funcao', v_funcao,
    'modalidade', v_mod, 'descricao', v_desc, 'turno', v_turno, 'fimDeSemana', v_fds,
    'comissao', v_comissao, 'inicio', v_ini, 'inicioData', v_ini_data, 'experiencia', v_exp, 'escolaridade', v_esc,
    'requisitos', to_jsonb(v_req), 'requisitoOutro', v_outro, 'selo', v_selo, 'beneficios', to_jsonb(v_ben), 'quantidade', v_qtd,
    'valorMin', v_min, 'valorMax', v_max, 'unidade', v_uni, 'diasNoAr', case when v_mod = 'diaria' then 30 else v_dias end,
    'prazoHoras', v_prazo, 'horasDia', v_horas,
    'cidadeId', v_cid, 'zonaId', v_zona, 'data', v_data, 'horaInicio', v_hi, 'horaFim', v_hf,
    'confidencial', coalesce(d -> 'confidencial' = 'true'::jsonb, false)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Cartões: sem filtro de escolaridade nem de tempo de experiência
-- -----------------------------------------------------------------------------

-- Cartões cegos por ordem de chegada: IGUAL à da 20261022, sem escolaridadeMin e experienciaMinMeses. Filtros que ficam:
-- status, zona, turnos, cnh, pretensaoMaxCentavos.
create or replace function public.vagas_cartoes(p_anuncio uuid, p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  v_status text[] := vagas_interno.lista_enum(f -> 'status', array['enviada', 'conversar', 'agora_nao', 'combinou', 'contratada', 'recusada']);
  v_zonas text[] := vagas_interno.lista_texto(case when jsonb_typeof(f -> 'zona') = 'string' then jsonb_build_array(f -> 'zona') else f -> 'zona' end, 60);
  v_turnos text[] := vagas_interno.lista_enum(f -> 'turnos', vagas_interno.turnos());
  v_cnh text[] := vagas_interno.lista_enum(f -> 'cnh', array['A', 'B', 'C', 'D', 'E']);
  v_pret int := vagas_interno.inteiro(f -> 'pretensaoMaxCentavos');
  lista jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into a from public.vagas_anuncios where id = p_anuncio;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
  select coalesce(jsonb_agg(x.item order by x.criado_em, x.id), '[]'::jsonb) into lista from (
    select k.criado_em, k.id, jsonb_build_object('candidaturaId', k.id, 'status', k.status, 'chegouEm', disc_interno.iso(k.criado_em),
        'contatoCortado', k.contato_cortado_em is not null,
        'cartao', vagas_interno.cartao(k.pessoa_id, k.empresa_id),
        'conversa', (select jsonb_build_object('status', v.status, 'naoLidas', vagas_interno.nao_lidas(v.id, 'empresa'),
                            'ultimaEm', disc_interno.iso(v.ultima_em)) from public.vagas_conversas v where v.candidatura_id = k.id)) as item
      from public.vagas_candidaturas k join public.vagas_pessoas p on p.user_id = k.pessoa_id
     where k.anuncio_id = a.id and k.status <> 'retirada'
       and (cardinality(v_status) = 0 or k.status = any (v_status))
       and (cardinality(v_zonas) = 0 or exists (select 1 from public.vagas_zonas z where z.id = p.zona_id and z.slug = any (v_zonas)))
       and (cardinality(v_turnos) = 0 or p.turnos && v_turnos)
       and (cardinality(v_cnh) = 0 or p.cnh @> v_cnh)
       and (v_pret is null or p.pretensao_centavos is null or p.pretensao_centavos <= v_pret)) x;
  -- Sem filtro por selo, nota ou referência (veto P3): o selo é só informação no cartão; a chave "temSelo" é ignorada.
  -- Desde a 20261024120005, "escolaridadeMin" e "experienciaMinMeses" também (nenhuma tela usa; tirariam o primeiro emprego).
  return vagas_interno.ok(jsonb_build_object('anuncio', jsonb_build_object('id', a.id, 'codigo', a.codigo, 'titulo', a.titulo, 'status', a.status),
    'cartoes', lista, 'total', jsonb_array_length(lista)));
end;
$$;


-- -----------------------------------------------------------------------------
-- Permissões do que é novo (e do que foi recriado)
-- -----------------------------------------------------------------------------

do $$
declare
  papel text;
  f text;
  autenticadas text[] := array['public.vagas_referencias_empresa(uuid)', 'public.vagas_referencia_oferecer(jsonb)',
    'public.vagas_cartoes(uuid, jsonb)'];
  servico text[] := array[]::text[];
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
-- versao_banco(): a lista da 20261024120004 + esta
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
      (25, '20261024120005_vagas_fase_c', to_regclass('public.vagas_referencia_envios_email') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261024120005, 'migracoes', to_jsonb(aplicadas),
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

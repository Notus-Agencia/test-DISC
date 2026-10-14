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
--      a 6_meses aqui, e a entrada ainda aceita os ids antigos, convertendo. No mural e no feed, "aceita sem experiência"
--      (semExperiencia) traz nao_precisa e ajuda; só 6_meses fica de fora.
--   3. vagas_cartoes ignora escolaridadeMin e experienciaMinMeses (como já ignora temSelo); ficam zona, turnos, CNH e pretensão.
--   4. OPERAÇÃO: vagas_op_empresa_decidir recusa 'suspender' de moderador(a) (O1: moderador só modera; "Sem permissão.").
--      vagas_op_empresas traz donos (pessoas donas com conta válida) e semDona; vagas_op_moderacao traz alvoNome
--      (título da vaga, nome fantasia, cidade ou zona — nunca nome de pessoa) e quem {papel, voce, email} (email mascarado,
--      só para a equipe e só de operador ou equipe; nunca de pessoa nem de membro de empresa). vagas_conta_limite aceita
--      'reenviar_op' (o reenvio de confirmação pela operação, sem captcha, com limite próprio por quem age) e
--      vagas_conta_consultar devolve conta.assistidaCidade (a Function só reenvia para conta assistida da cidade do operador).
--   5. PESSOA: vagas_foto_consentimento(p_aceito) grava o consentimento 'foto_opcional' (a tela chama ao enviar e ao apagar a
--      foto); quemViuMeuContato traz quem [{empresa, papel, vezes}] (papel de quem abriu na hora: dono | recrutador; nunca
--      e-mail); a carteira da experiência guarda "informal": null ("prefiro não dizer"; sem a chave continua false).
--   6. LIMPEZA: conta do cadastro assistido nunca confirmada é apagada 7 dias depois de criada (o texto do e-mail promete
--      isso): vagas_interno.contas_assistidas_limpar(), a cada cadastro assistido e agendável no pg_cron.
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

-- Mural e feed: IGUAL à da 20261022, mas "semExperiencia" (aceita sem experiência) inclui a vaga em que experiência só
-- "ajuda" (fica de fora só a que pede 6 meses).
create or replace function vagas_interno.listar_anuncios(p_cidades uuid[], p_filtro jsonb, p_pessoa uuid, p_areas_padrao text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_lim int := least(greatest(coalesce(vagas_interno.inteiro(f -> 'limite'), 20), 1), 20);
  v_zonas uuid[] := null;
  v_mods text[] := vagas_interno.lista_enum(f -> 'modalidade', vagas_interno.modalidades());
  v_hoje boolean := coalesce(f -> 'paraHoje' = 'true'::jsonb, false);
  v_busca text := left(vagas_interno.normalizar(disc_interno.texto(f -> 'busca')), 60);
  v_areas text[];
  v_padrao boolean := false;
  v_turnos text[] := vagas_interno.lista_enum(f -> 'turno', vagas_interno.turnos_vaga());
  v_sal int := vagas_interno.inteiro(f -> 'salarioMin');
  v_sem_exp boolean := coalesce(f -> 'semExperiencia' = 'true'::jsonb, false);
  v_total boolean := coalesce(f -> 'somenteTotal' = 'true'::jsonb, false);
  v_depois text := disc_interno.texto(f -> 'depois');
  v_dep_em timestamptz := null;
  v_dep_id uuid := null;
  a public.vagas_anuncios%rowtype;
  lista jsonb := '[]'::jsonb;
  n int := 0;
  v_prox text := '';
begin
  if jsonb_typeof(f -> 'zona') in ('string', 'array') then
    v_zonas := array(select z.id from public.vagas_zonas z where z.cidade_id = any (p_cidades)
      and z.slug = any (vagas_interno.lista_texto(case when jsonb_typeof(f -> 'zona') = 'string' then jsonb_build_array(f -> 'zona')
                                                        else f -> 'zona' end, 60)));
  end if;
  if cardinality(v_mods) = 0 then v_mods := null; end if;
  if f ? 'areas' then
    v_areas := array(select ar.slug from public.vagas_areas ar
                      where ar.slug = any (vagas_interno.lista_texto(case when jsonb_typeof(f -> 'areas') = 'string'
                                                                          then jsonb_build_array(f -> 'areas') else f -> 'areas' end, 40))
                      order by ar.ordem);
  else
    v_areas := coalesce(p_areas_padrao, array[]::text[]);
    v_padrao := cardinality(v_areas) > 0;
  end if;
  if v_depois ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and not v_total then
    -- Cursor com data impossível (ex.: mês 99) é só ignorado: nenhuma RPC lança erro cru para a tela.
    begin
      v_dep_em := split_part(v_depois, '_', 1)::timestamptz;
      v_dep_id := split_part(v_depois, '_', 2)::uuid;
    exception
      when others then v_dep_em := null; v_dep_id := null;
    end;
  end if;
  for a in
    select x.* from public.vagas_anuncios x
      join public.vagas_cidades c on c.id = x.cidade_id
     where x.cidade_id = any (p_cidades) and x.status = 'publicado' and x.expira_em > now() and c.status = 'ativa'
       and exists (select 1 from public.vagas_empresas e where e.id = x.empresa_id and e.status = 'ativa')
       and (x.modalidade <> 'diaria' or x.data_trabalho >= vagas_interno.hoje(c.fuso))
       and (v_zonas is null or x.zona_id = any (v_zonas))
       and (v_mods is null or x.modalidade = any (v_mods))
       and (not v_hoje or (x.modalidade = 'diaria' and x.data_trabalho = vagas_interno.hoje(c.fuso)))
       and (cardinality(v_areas) = 0 or x.area = any (v_areas))
       and (cardinality(v_turnos) = 0 or x.turno = any (v_turnos))
       and (v_sal is null or coalesce(x.valor_max_centavos, x.valor_min_centavos)::bigint
              * (case x.valor_unidade when 'mes' then 1 when 'dia' then 22 when 'hora' then 220 else 0 end) >= v_sal)
       and (not v_sem_exp or x.experiencia in ('nao_precisa', 'ajuda'))
       and (v_busca = '' or strpos(vagas_interno.normalizar(x.funcao || ' ' || (select ar.nome from public.vagas_areas ar where ar.slug = x.area)), v_busca) > 0)
       and (v_dep_em is null or (x.publicado_em, x.id) < (v_dep_em, v_dep_id))
       and (p_pessoa is null or (not exists (select 1 from public.vagas_pulos p where p.pessoa_id = p_pessoa and p.anuncio_id = x.id)
                                 and not exists (select 1 from public.vagas_candidaturas k where k.pessoa_id = p_pessoa and k.anuncio_id = x.id)))
     order by x.publicado_em desc, x.id desc
     limit case when v_total then 100000 else v_lim + 1 end
  loop
    n := n + 1;
    continue when v_total;
    exit when n > v_lim;
    lista := lista || jsonb_build_array(vagas_interno.anuncio_resumo(a, false));
    v_prox := to_char(a.publicado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '_' || a.id;
  end loop;
  if v_total then
    return jsonb_build_object('total', n, 'areasAplicadas', to_jsonb(v_areas), 'areasPadrao', v_padrao);
  end if;
  if n <= v_lim then v_prox := ''; end if;
  return jsonb_build_object('anuncios', lista, 'proximo', v_prox, 'areasAplicadas', to_jsonb(v_areas), 'areasPadrao', v_padrao);
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
-- 4. Pedidos da operação
-- -----------------------------------------------------------------------------

-- Empresas da operação: IGUAL à da 20261022 + donos e semDona.
create or replace function public.vagas_op_empresas(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_status text[] := vagas_interno.lista_enum(f -> 'status', array['em_analise', 'ativa', 'suspensa']);
  v_busca text := left(vagas_interno.normalizar(disc_interno.texto(f -> 'busca')), 60);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('empresas', coalesce((select jsonb_agg(vagas_interno.empresa_json(e) || jsonb_build_object(
      'anuncios', (select jsonb_build_object('total', count(*), 'noAr', count(*) filter (where vagas_interno.no_ar(a)))
                     from public.vagas_anuncios a where a.empresa_id = e.id),
      'denunciasAbertas', (select count(*)::int from public.vagas_denuncias d where d.empresa_id = e.id and d.status = 'aberta'),
      'membros', (select count(*)::int from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo),
      -- 20261024120005: pessoas donas com conta válida e "sem dona" (tem equipe, mas nenhuma dona válida) — o formulário de
      -- nomear dona (vagas_op_empresa_dono) só precisa aparecer aí.
      'donos', (select count(*)::int from public.vagas_empresa_membros m
                 where m.empresa_id = e.id and m.ativo and m.papel = 'dono' and vagas_interno.conta_valida(m.user_id)),
      'semDona', exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo)
                 and not exists (select 1 from public.vagas_empresa_membros m
                                  where m.empresa_id = e.id and m.ativo and m.papel = 'dono' and vagas_interno.conta_valida(m.user_id)))
      order by e.status = 'em_analise' desc, e.criado_em desc)
    from public.vagas_empresas e
   where e.cidade_id = any (v_cids) and (cardinality(v_status) = 0 or e.status = any (v_status))
     and (v_busca = '' or strpos(vagas_interno.normalizar(e.nome_fantasia || ' ' || e.razao_social || ' ' || e.cnpj), v_busca) > 0)),
    '[]'::jsonb)));
end;
$$;

-- Decisão sobre a empresa: IGUAL à da 20261022, mas moderador(a) também não SUSPENDE (revisão de código, O1: a regra é
-- "moderador só modera"; antes, o ramo 'suspender' não conferia o papel). Moderador(a) não aprova, recusa, suspende nem reativa.
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
      update public.vagas_empresas set status = 'ativa', status_motivo = '', cnpj_conferido_em = coalesce(cnpj_conferido_em, now()),
        cnpj_conferido_por = coalesce(cnpj_conferido_por, auth.uid()) where id = e.id returning * into e;
    end if;
  elsif p_acao = 'suspender' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;   -- O1 (20261024120005)
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    update public.vagas_empresas set status = 'suspensa', status_motivo = v_motivo where id = e.id returning * into e;
  elsif p_acao = 'recusar' then
    -- Cadastro recusado (ex.: CNPJ não confere): a empresa continua em análise, com o motivo visível para ela corrigir.
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    if e.status <> 'em_analise' then return vagas_interno.erro('Só dá para recusar uma empresa em análise.'); end if;
    update public.vagas_empresas set status_motivo = v_motivo where id = e.id returning * into e;
  elsif p_acao = 'reativar' then
    if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
    if e.status <> 'suspensa' then return vagas_interno.erro('Esta empresa não está suspensa.'); end if;
    update public.vagas_empresas set status = 'ativa', status_motivo = '', cnpj_conferido_em = coalesce(cnpj_conferido_em, now()),
      cnpj_conferido_por = coalesce(cnpj_conferido_por, auth.uid()) where id = e.id returning * into e;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  perform vagas_interno.registrar(e.cidade_id, v_papel, 'empresa_' || p_acao, 'empresa', e.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('empresa', vagas_interno.empresa_json(e)));
end;
$$;

-- Nome do alvo de um registro de moderação, para a tela: título da vaga, nome fantasia da empresa (também a da referência e
-- a da denúncia), cidade ou zona. Conta e operador: '' (nunca nome de pessoa).
create or replace function vagas_interno.moderacao_alvo_nome(p_alvo text, p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(case p_alvo
    when 'anuncio' then (select a.titulo from public.vagas_anuncios a where a.id = p_id)
    when 'empresa' then (select e.nome_fantasia from public.vagas_empresas e where e.id = p_id)
    when 'cidade' then (select c.nome from public.vagas_cidades c where c.id = p_id)
    when 'zona' then (select z.nome || ' (' || c.nome || ')' from public.vagas_zonas z join public.vagas_cidades c on c.id = z.cidade_id where z.id = p_id)
    when 'referencia' then (select e.nome_fantasia from public.vagas_referencias r join public.vagas_empresas e on e.id = r.empresa_id where r.id = p_id)
    when 'denuncia' then (select coalesce(a.titulo, e.nome_fantasia) from public.vagas_denuncias d
                            left join public.vagas_anuncios a on a.id = d.anuncio_id left join public.vagas_empresas e on e.id = d.empresa_id
                           where d.id = p_id)
    else '' end, '');
$$;

-- Registro de moderação: IGUAL ao da 20261022 + alvoNome e quem {papel, voce, email} (email: mascarado, só para a equipe e
-- só de quem é da operação ou da equipe; para o operador, '').
create or replace function public.vagas_op_moderacao(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_lim int := least(greatest(coalesce(vagas_interno.inteiro(f -> 'limite'), 100), 1), 200);
  v_equipe boolean := public.e_admin();
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('registros', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'em', disc_interno.iso(x.em),
      'papel', x.papel, 'acao', x.acao, 'alvo', x.alvo, 'alvoId', x.alvo_id, 'motivo', x.motivo, 'dados', x.dados,
      'cidade', (select c.slug from public.vagas_cidades c where c.id = x.cidade_id),
      -- 20261024120005: o nome do alvo (nunca nome de pessoa) e quem fez: papel, "foi você" e, só para a equipe, o e-mail
      -- mascarado de quem é da operação ou da equipe (nunca de pessoa nem de membro de empresa).
      'alvoNome', vagas_interno.moderacao_alvo_nome(x.alvo, x.alvo_id),
      'quem', jsonb_build_object('papel', x.papel, 'voce', x.ator is not null and x.ator = auth.uid(),
        'email', case when v_equipe and x.papel in ('operador', 'moderador', 'admin') and x.ator is not null
                      then coalesce(vagas_interno.mascarar_email((select u.email from auth.users u where u.id = x.ator)), '') else '' end))
      order by x.em desc, x.id desc)
    from (select * from public.vagas_moderacao m where m.cidade_id = any (v_cids) order by m.em desc, m.id desc limit v_lim) x), '[]'::jsonb)));
end;
$$;

-- Limites da Function: IGUAL à da 20261022 + 'reenviar_op' (reenvio de confirmação pela operação: 60 por hora por origem e
-- o limite de quem age) e a limpeza das contas assistidas no cadastro assistido.
create or replace function public.vagas_conta_limite(p_acao text, p_cf text, p_xff text, p_email text, p_ator uuid default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  o text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_max int;
begin
  if p_acao is null or p_acao not in ('cadastrar', 'reenviar', 'esqueci', 'assistido', 'operador', 'excluir', 'reenviar_op') then
    return vagas_interno.erro('Ação desconhecida.');
  end if;
  -- 20261024120005: o reenvio pela operação (sem captcha) sempre tem quem age; o cadastro assistido limpa as contas
  -- assistidas não confirmadas há 7 dias.
  if p_acao = 'reenviar_op' and p_ator is null then return vagas_interno.erro('Sem permissão.'); end if;
  if p_acao = 'assistido' then perform vagas_interno.contas_assistidas_limpar(); end if;
  if vagas_interno.contar('conta_total', '', interval '1 hour') > 300 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  v_max := case p_acao when 'cadastrar' then 5 when 'assistido' then 60 when 'operador' then 30 when 'reenviar_op' then 60 else 10 end;
  foreach o in array vagas_interno.origens_de(p_cf, p_xff) loop
    if vagas_interno.contar('conta_' || p_acao, o, interval '1 hour') > v_max then return vagas_interno.erro(msg, '{"bloqueado": true}'); end if;
    if p_acao = 'cadastrar' and vagas_interno.contagem('conta_cadastrar', o, interval '1 day') > 20 then
      return vagas_interno.erro(msg, '{"bloqueado": true}');
    end if;
  end loop;
  if v_email <> '' and vagas_interno.contar('conta_email', md5(v_email), interval '1 hour') > 3 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  if p_ator is not null and vagas_interno.contar('conta_ator', p_ator::text, interval '1 hour') > 60 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  return vagas_interno.ok();
end;
$$;

-- Consulta da Function: IGUAL à da 20261022 + conta.assistidaCidade (a operação só reenvia para conta assistida da cidade dela).
create or replace function public.vagas_conta_consultar(p_email text)
returns json language sql stable security definer set search_path = '' as $$
  select vagas_interno.ok(coalesce((select jsonb_build_object('existe', true, 'userId', u.id,
      'produto', coalesce(u.raw_app_meta_data ->> 'produto', ''), 'confirmada', u.email_confirmed_at is not null,
      'conta', (select jsonb_build_object('tipo', c.tipo, 'status', c.status,
                  'assistidaCidade', (select x.slug from public.vagas_cidades x where x.id = c.assistida_cidade_id))
                  from public.vagas_contas c where c.user_id = u.id),
      'admin', exists (select 1 from public.admins a where a.user_id = u.id))
    from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1),
    jsonb_build_object('existe', false)));
$$;

-- -----------------------------------------------------------------------------
-- 5. Pedidos da pessoa
-- -----------------------------------------------------------------------------

-- Consentimento da foto opcional (a tela chama ao enviar a foto, com true, e ao apagar, com false). Grava em
-- vagas_consentimentos só quando muda (versão = a dos termos da conta).
alter table public.vagas_consentimentos drop constraint if exists vagas_consentimentos_tipo_check;
alter table public.vagas_consentimentos add constraint vagas_consentimentos_tipo_check
  check (tipo in ('termos', 'privacidade', 'banco_talentos', 'foto_opcional'));

create or replace function public.vagas_foto_consentimento(p_aceito boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
  v_ultimo boolean;
  v_versao text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if p_aceito is null then return vagas_interno.erro('Dados inválidos. Confira os campos.'); end if;
  select c.aceito into v_ultimo from public.vagas_consentimentos c
   where c.user_id = v_uid and c.tipo = 'foto_opcional' order by c.em desc, c.id desc limit 1;
  if v_ultimo is distinct from p_aceito then
    select coalesce(nullif(k.termos_versao, ''), 'sem-versao') into v_versao from public.vagas_contas k where k.user_id = v_uid;
    insert into public.vagas_consentimentos (user_id, tipo, versao, aceito) values (v_uid, 'foto_opcional', v_versao, p_aceito);
  end if;
  return vagas_interno.ok(jsonb_build_object('fotoOpcional', p_aceito, 'duplicado', v_ultimo is not distinct from p_aceito));
end;
$$;

-- Quem abriu o contato: o papel na empresa (dono | recrutador) de quem abriu, na hora (nunca e-mail nem nome do membro).
alter table public.vagas_acessos_contato add column if not exists papel text;
alter table public.vagas_acessos_contato drop constraint if exists vagas_acessos_contato_papel_check;
alter table public.vagas_acessos_contato add constraint vagas_acessos_contato_papel_check check (papel is null or papel in ('dono', 'recrutador'));
create or replace function vagas_interno.acesso_contato_papel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.papel is null and new.user_id is not null and new.empresa_id is not null then
    select m.papel into new.papel from public.vagas_empresa_membros m where m.empresa_id = new.empresa_id and m.user_id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists vagas_acessos_contato_papel on public.vagas_acessos_contato;
create trigger vagas_acessos_contato_papel before insert on public.vagas_acessos_contato
  for each row execute function vagas_interno.acesso_contato_papel();
-- Acessos de antes desta migração: o papel atual de quem abriu (quem saiu da equipe fica sem papel).
update public.vagas_acessos_contato l set papel = m.papel from public.vagas_empresa_membros m
 where l.papel is null and m.empresa_id = l.empresa_id and m.user_id = l.user_id;

-- "Quem viu meu contato": IGUAL ao da 20261022 + quem [{empresa, papel, vezes}] (por papel de quem abriu; papel null =
-- quem abriu não está mais na equipe ou foi a operação de antes).
create or replace function public.vagas_quem_viu_meu_contato()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('acessos', coalesce((
    with base as (
      select l.*, coalesce(l.candidatura_id::text, 'a' || l.id::text) as grp
        from public.vagas_acessos_contato l where l.pessoa_id = auth.uid()
    ), por_papel as (
      select b.grp, b.empresa_nome, b.papel, count(*)::int as n from base b group by b.grp, b.empresa_nome, b.papel
    ), grupos as (
      select b.grp, max(b.candidatura_id::text)::uuid as candidatura_id, max(b.empresa_nome) as empresa_nome,
             max(b.anuncio_titulo) as anuncio_titulo, min(b.em) as primeira, max(b.em) as ultima, count(*)::int as vezes
        from base b group by b.grp
    )
    select jsonb_agg(jsonb_build_object('candidaturaId', g.candidatura_id,
        'empresa', g.empresa_nome, 'anuncio', g.anuncio_titulo, 'primeiraVez', disc_interno.iso(g.primeira),
        'ultimaVez', disc_interno.iso(g.ultima), 'vezes', g.vezes, 'cortadoEm', disc_interno.iso(k.contato_cortado_em),
        'podeCortar', k.id is not null and k.status in ('combinou', 'contratada') and k.contato_cortado_em is null,
        'quem', (select jsonb_agg(jsonb_build_object('empresa', pp.empresa_nome, 'papel', pp.papel, 'vezes', pp.n)
                                  order by pp.n desc, pp.papel nulls last)
                   from por_papel pp where pp.grp = g.grp))
        order by g.ultima desc)
      from grupos g
      left join public.vagas_candidaturas k on k.id = g.candidatura_id and k.pessoa_id = auth.uid()), '[]'::jsonb)));
end;
$$;

-- Carteira da experiência: true | false | null ("prefiro não dizer"). Quem já gravou fica como está (sem como saber).
alter table public.vagas_experiencias alter column informal drop not null;

-- Currículo: IGUAL ao da 20261024120000, guardando "informal": null (prefiro não dizer) como null. Sem a chave continua false
-- (as telas de antes não mandavam a chave para "Sim" nem para "Prefiro não dizer").
create or replace function public.vagas_pessoa_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
  c1 public.vagas_cidades%rowtype;
  v_cid2 uuid := null;
  v_zona uuid := null;
  v_cargos text[];
  v_esc text := disc_interno.texto(d -> 'escolaridade');
  v_turnos text[] := vagas_interno.lista_enum(d -> 'turnos', vagas_interno.turnos());
  v_cnh text[] := vagas_interno.lista_enum(d -> 'cnh', array['A', 'B', 'C', 'D', 'E']);
  v_mods text[] := vagas_interno.lista_enum(d -> 'modalidades', vagas_interno.modalidades());
  v_pret int := null;
  v_cursos text[];
  v_sobre text := disc_interno.texto(d -> 'sobre');
  v_nome text := disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 120);
  v_whats text := vagas_interno.normalizar_whatsapp(disc_interno.texto(d -> 'whatsapp'));
  v_email text := btrim(disc_interno.texto(d -> 'email'));
  v_exps jsonb := coalesce(d -> 'experiencias', '[]'::jsonb);
  v_areas text[] := null;
  x jsonb;
  v_ini date;
  v_fim date;
  v_func text;
  v_mes date := date_trunc('month', now())::date;
  i int := 0;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into c1 from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found or c1.status = 'rascunho' then return vagas_interno.erro('Escolha a sua cidade.'); end if;
  if btrim(disc_interno.texto(d -> 'cidade2')) <> '' then
    select x2.id into v_cid2 from public.vagas_cidades x2 where x2.slug = lower(btrim(disc_interno.texto(d -> 'cidade2'))) and x2.status <> 'rascunho';
    if v_cid2 is null then return vagas_interno.erro('Segunda cidade não encontrada.'); end if;
    if v_cid2 = c1.id then return vagas_interno.erro('Escolha duas cidades diferentes.'); end if;
  end if;
  if btrim(disc_interno.texto(d -> 'zona')) = '' then return vagas_interno.erro('Escolha a zona onde você mora.'); end if;
  select z.id into v_zona from public.vagas_zonas z where z.cidade_id = c1.id and z.slug = lower(btrim(disc_interno.texto(d -> 'zona'))) and z.ativa;
  if v_zona is null then return vagas_interno.erro('Escolha uma zona da sua cidade.'); end if;
  if d -> 'maior18' is distinct from 'true'::jsonb then
    return vagas_interno.erro('Para se cadastrar é preciso ter 18 anos ou mais.');
  end if;
  v_cargos := vagas_interno.lista_texto(d -> 'cargos', 60);
  if cardinality(v_cargos) < 1 or cardinality(v_cargos) > 5 then return vagas_interno.erro('Escolha de 1 a 5 funções que você procura.'); end if;
  if not (v_esc = any (vagas_interno.escolaridades())) then return vagas_interno.erro('Escolha a sua escolaridade.'); end if;
  if cardinality(v_turnos) = 0 then return vagas_interno.erro('Marque pelo menos um turno em que pode trabalhar.'); end if;
  if cardinality(v_mods) = 0 then
    return vagas_interno.erro('Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).');
  end if;
  if d ? 'pretensaoCentavos' and jsonb_typeof(d -> 'pretensaoCentavos') <> 'null' and disc_interno.texto(d -> 'pretensaoCentavos') <> '' then
    v_pret := vagas_interno.inteiro(d -> 'pretensaoCentavos');
    if v_pret is null or v_pret < 0 or v_pret > 10000000 then return vagas_interno.erro('Pretensão salarial inválida.'); end if;
  end if;
  v_cursos := vagas_interno.lista_texto(d -> 'cursos', 80);
  if cardinality(v_cursos) > 10 then return vagas_interno.erro('Informe até 10 cursos.'); end if;
  if d ? 'areas' or d ? 'areasInteresse' then
    v_areas := array(select ar.slug from public.vagas_areas ar
                      where ar.ativa and ar.slug = any (vagas_interno.lista_texto(vagas_interno.chave(d, 'areas', 'areasInteresse'), 40))
                      order by ar.ordem);
    if cardinality(v_areas) > 3 then return vagas_interno.erro('Escolha até 3 áreas de interesse.'); end if;
  end if;
  if char_length(v_sobre) > 600 then return vagas_interno.erro('O texto "Sobre você" pode ter até 600 caracteres.'); end if;
  v_sobre := vagas_interno.limpar_multilinha(v_sobre, 600);
  if not disc_interno.nome_valido(v_nome) then return vagas_interno.erro('Informe seu nome e sobrenome.'); end if;
  if v_whats !~ '^55[1-9][1-9]9[0-9]{8}$' then
    return vagas_interno.erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).');
  end if;
  if v_email <> '' then
    v_email := vagas_interno.email(v_email);
    if v_email = '' then return vagas_interno.erro('E-mail de contato inválido.'); end if;
  else
    select vagas_interno.email(u.email) into v_email from auth.users u where u.id = v_uid;
  end if;
  if jsonb_typeof(v_exps) <> 'array' then return vagas_interno.erro('Experiências inválidas.'); end if;
  if jsonb_array_length(v_exps) > 10 then return vagas_interno.erro('Informe até 10 experiências.'); end if;
  for x in select e from jsonb_array_elements(v_exps) e loop
    if jsonb_typeof(x) <> 'object' then return vagas_interno.erro('Experiências inválidas.'); end if;
    v_func := disc_interno.limpar_texto(disc_interno.texto(x -> 'funcao'), 80);
    if char_length(v_func) < 2 then return vagas_interno.erro('Informe a função de cada experiência.'); end if;
    v_ini := vagas_interno.ler_mes(disc_interno.texto(x -> 'inicio'));
    if v_ini is null then return vagas_interno.erro('Informe o mês de início de cada experiência (AAAA-MM).'); end if;
    if v_ini > v_mes then return vagas_interno.erro('O início de uma experiência não pode estar no futuro.'); end if;
    if btrim(disc_interno.texto(x -> 'fim')) <> '' then
      v_fim := vagas_interno.ler_mes(disc_interno.texto(x -> 'fim'));
      if v_fim is null then return vagas_interno.erro('Mês de saída inválido (AAAA-MM).'); end if;
      if v_fim < v_ini then return vagas_interno.erro('A saída não pode ser antes do início.'); end if;
      if v_fim > v_mes then return vagas_interno.erro('A saída não pode estar no futuro.'); end if;
    end if;
  end loop;

  begin
    insert into public.vagas_pessoas as p (user_id, cidade_id, cidade2_id, zona_id, maior_18, cargos, escolaridade, turnos, cnh,
      modalidades, pretensao_centavos, cursos, areas_interesse, sobre)
    values (v_uid, c1.id, v_cid2, v_zona, true, v_cargos, v_esc, v_turnos, v_cnh, v_mods, v_pret, v_cursos, coalesce(v_areas, '{}'::text[]), v_sobre)
    on conflict (user_id) do update set cidade_id = excluded.cidade_id, cidade2_id = excluded.cidade2_id, zona_id = excluded.zona_id,
      maior_18 = true, cargos = excluded.cargos, escolaridade = excluded.escolaridade, turnos = excluded.turnos, cnh = excluded.cnh,
      modalidades = excluded.modalidades, pretensao_centavos = excluded.pretensao_centavos, cursos = excluded.cursos,
      areas_interesse = coalesce(v_areas, p.areas_interesse), sobre = excluded.sobre;
    insert into public.vagas_pessoa_contato as ct (user_id, nome, whatsapp, email) values (v_uid, v_nome, v_whats, coalesce(v_email, ''))
    on conflict (user_id) do update set nome = excluded.nome, whatsapp = excluded.whatsapp, email = excluded.email, atualizado_em = now();
    delete from public.vagas_experiencias where user_id = v_uid;
    for x in select e from jsonb_array_elements(v_exps) e loop
      i := i + 1;
      insert into public.vagas_experiencias (user_id, funcao, empregador, inicio, fim, informal, ordem)
      values (v_uid, disc_interno.limpar_texto(disc_interno.texto(x -> 'funcao'), 80), disc_interno.limpar_texto(disc_interno.texto(x -> 'empregador'), 120),
        vagas_interno.ler_mes(disc_interno.texto(x -> 'inicio')),
        case when btrim(disc_interno.texto(x -> 'fim')) = '' then null else vagas_interno.ler_mes(disc_interno.texto(x -> 'fim')) end,
        case x -> 'informal' when 'true'::jsonb then true when 'null'::jsonb then null else false end, i);   -- null = prefiro não dizer
    end loop;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  return vagas_interno.ok(jsonb_build_object('pessoa', vagas_interno.pessoa_json(v_uid), 'cartao', vagas_interno.cartao(v_uid, null), 'completo', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Limpeza das contas do cadastro assistido nunca confirmadas
-- -----------------------------------------------------------------------------

-- O e-mail do cadastro assistido diz "Se não foi você, ignore o e-mail: a conta é apagada em 7 dias.". Apaga as contas
-- (pessoa ou empresa) criadas pela operação no cadastro assistido (app_metadata.produto = 'vagas'), ainda pendentes e com o
-- e-mail nunca confirmado, 7 dias depois de criadas: o usuário do Auth sai e, com ele, tudo da conta (chaves em cascata). Nunca
-- conta de operação, da equipe ou do painel DISC. A empresa que a operação cadastrou para essa conta fica; sem ninguém na
-- equipe, as vagas dela saem do ar pela regra de sempre (vagas_interno.membros_depois_sair) e a operação pode fazer outro
-- cadastro assistido para ela. Roda a cada cadastro assistido (vagas_conta_limite) e é agendável no pg_cron, uma vez por dia:
-- select vagas_interno.contas_assistidas_limpar();  Sem permissão no auth.users, devolve 0 (nada quebra).
create or replace function vagas_interno.contas_assistidas_limpar()
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int := 0;
  v_id uuid;
begin
  for v_id in
    select u.id from auth.users u join public.vagas_contas k on k.user_id = u.id
     where u.email_confirmed_at is null and k.status = 'pendente' and k.assistida_por is not null and k.tipo in ('pessoa', 'empresa')
       and k.confirmada_em is null and k.criado_em < now() - interval '7 days'
       and coalesce(u.raw_app_meta_data ->> 'produto', '') = 'vagas'
       and not exists (select 1 from public.vagas_operadores o where o.user_id = u.id)
       and not exists (select 1 from public.admins a where a.user_id = u.id)
     order by k.criado_em
     limit 200
  loop
    begin
      delete from auth.users u where u.id = v_id;
      n := n + 1;
    exception
      when insufficient_privilege then return n;
      when foreign_key_violation then null;   -- algo de fora ainda aponta para o usuário: fica para a próxima
    end;
  end loop;
  return n;
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
    'public.vagas_cartoes(uuid, jsonb)', 'public.vagas_op_empresas(jsonb)', 'public.vagas_op_empresa_decidir(uuid, text, text)', 'public.vagas_op_moderacao(jsonb)', 'public.vagas_foto_consentimento(boolean)',
    'public.vagas_quem_viu_meu_contato()', 'public.vagas_pessoa_salvar(jsonb)'];
  servico text[] := array[]::text[] || array['public.vagas_conta_limite(text, text, text, text, uuid)', 'public.vagas_conta_consultar(text)'];
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
      (25, '20261024120005_vagas_fase_c', to_regclass('public.vagas_referencia_envios_email') is not null
                                 and exists (select 1 from pg_catalog.pg_attribute a
                                              where a.attrelid = to_regclass('public.vagas_acessos_contato')
                                                and a.attname = 'papel' and not a.attisdropped))
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

-- Cartão cego: IGUAL ao da 20261022120000, com "prefiro não dizer" (informal null) saindo como false no cartão — para a
-- empresa, só "Não" (informal true) vira "sem carteira"; o currículo da pessoa continua guardando null.
create or replace function vagas_interno.cartao(p_user uuid, p_empresa uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
    'zona', case when z.id is null then null else jsonb_build_object('slug', z.slug, 'nome', z.nome) end,
    'cargos', to_jsonb(p.cargos),
    'experiencias', coalesce((select jsonb_agg(jsonb_build_object('funcao', x.funcao, 'meses', vagas_interno.meses(x.inicio, x.fim),
        'atual', x.fim is null, 'informal', coalesce(x.informal, false)) order by x.ordem, x.inicio desc)
      from public.vagas_experiencias x where x.user_id = p.user_id), '[]'::jsonb),
    'experienciaTotalMeses', coalesce((select sum(vagas_interno.meses(x.inicio, x.fim))::int
      from public.vagas_experiencias x where x.user_id = p.user_id), 0),
    'escolaridade', p.escolaridade, 'turnos', to_jsonb(p.turnos), 'cnh', to_jsonb(p.cnh), 'modalidades', to_jsonb(p.modalidades),
    'pretensaoCentavos', p.pretensao_centavos, 'cursos', to_jsonb(p.cursos), 'selos', vagas_interno.selos(p.user_id),
    'temReferencia', vagas_interno.tem_referencia(p.user_id, p_empresa))
  from public.vagas_pessoas p
  join public.vagas_cidades c on c.id = p.cidade_id
  left join public.vagas_zonas z on z.id = p.zona_id
  where p.user_id = p_user;
$$;


-- Baixar meus dados: IGUAL ao da 20261022120000, mas a conta SUSPENSA também baixa os próprios dados (LGPD, art. 18: acesso
-- vale mesmo com a conta suspensa; a tela da conta suspensa oferece "Baixar meus dados" e "Excluir a conta").
create or replace function public.vagas_exportar_meus_dados()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual(null);
  v_uid uuid := auth.uid();
  c public.vagas_contas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean and not coalesce((v_conta ->> 'suspensa')::boolean, false) then return v_conta::json; end if;
  select * into c from public.vagas_contas where user_id = v_uid;
  return vagas_interno.ok(jsonb_build_object('geradoEm', disc_interno.iso(now()),
    'conta', jsonb_build_object('tipo', c.tipo, 'status', c.status, 'email', (select u.email from auth.users u where u.id = v_uid),
      'criadoEm', disc_interno.iso(c.criado_em), 'confirmadaEm', disc_interno.iso(c.confirmada_em),
      'termosVersao', c.termos_versao, 'termosAceitosEm', disc_interno.iso(c.termos_aceitos_em)),
    'consentimentos', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'versao', x.versao, 'aceito', x.aceito,
        'ate', disc_interno.iso(x.ate), 'em', disc_interno.iso(x.em)) order by x.em) from public.vagas_consentimentos x where x.user_id = v_uid), '[]'::jsonb),
    'pessoa', vagas_interno.pessoa_json(v_uid),
    'testes', vagas_interno.testes_da_pessoa(v_uid),
    'foto', case when vagas_interno.tem_foto(v_uid) then 'Você tem uma foto guardada (só as empresas com Combinou a veem). Baixe pelo seu perfil.' else '' end,
    'candidaturas', coalesce((select jsonb_agg(vagas_interno.candidatura_pessoa(k) order by k.criado_em) from public.vagas_candidaturas k
                               where k.pessoa_id = v_uid), '[]'::jsonb),
    'pulos', coalesce((select jsonb_agg(jsonb_build_object('anuncio', jsonb_build_object('codigo', a.codigo, 'titulo', a.titulo), 'em', disc_interno.iso(p.em))
                         order by p.em) from public.vagas_pulos p join public.vagas_anuncios a on a.id = p.anuncio_id where p.pessoa_id = v_uid), '[]'::jsonb),
    'denunciasFeitas', coalesce((select jsonb_agg(jsonb_build_object('alvo', x.alvo, 'motivo', x.motivo, 'detalhe', x.detalhe, 'status', x.status,
                                   'em', disc_interno.iso(x.criado_em)) order by x.criado_em) from public.vagas_denuncias x where x.autor = v_uid), '[]'::jsonb),
    'mensagensEnviadas', coalesce((select jsonb_agg(jsonb_build_object('em', disc_interno.iso(m.criado_em), 'texto', m.texto) order by m.criado_em)
                                     from public.vagas_mensagens m where m.autor_user = v_uid), '[]'::jsonb),
    'acessosAoContato', coalesce((select jsonb_agg(jsonb_build_object('empresa', l.empresa_nome, 'anuncio', l.anuncio_titulo, 'em', disc_interno.iso(l.em))
                                    order by l.em) from public.vagas_acessos_contato l where l.pessoa_id = v_uid), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(vagas_interno.empresa_json(e) || jsonb_build_object('papel', m.papel))
                            from public.vagas_empresa_membros m join public.vagas_empresas e on e.id = m.empresa_id where m.user_id = v_uid), '[]'::jsonb),
    'operador', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.slug, 'papel', o.papel, 'ativo', o.ativo))
                            from public.vagas_operadores o join public.vagas_cidades x on x.id = o.cidade_id where o.user_id = v_uid), '[]'::jsonb),
    'referenciasRecebidas', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, true) || jsonb_build_object('status', r.status,
        'historico', (select jsonb_agg(jsonb_build_object('acao', h.acao, 'por', h.por, 'em', disc_interno.iso(h.em)) order by h.em)
                        from public.vagas_referencia_historico h where h.referencia_id = r.id)) order by r.criado_em)
      from public.vagas_referencias r where r.pessoa_id = v_uid), '[]'::jsonb),
    'pedidosDeReferencia', coalesce((select jsonb_agg(jsonb_build_object('empresaNome', x.empresa_nome, 'status', x.status,
        'criadoEm', disc_interno.iso(x.criado_em)) order by x.criado_em) from public.vagas_referencia_convites x where x.pessoa_id = v_uid), '[]'::jsonb)));
end;
$$;


-- O PostgREST relê o esquema.
notify pgrst, 'reload schema';

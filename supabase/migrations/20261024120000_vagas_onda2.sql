-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — ONDA 2 do banco: o que as telas precisaram e a fundação ainda não fazia.
-- Roda DEPOIS de 20261022120000_vagas.sql e 20261023120000_vagas_testes.sql (usa as tabelas e os auxiliares das duas).
-- Idempotente e seguro sobre dados reais: só acrescenta colunas, tabela, índices, funções e permissões; recria as funções
-- listadas abaixo com a MESMA assinatura e o MESMO formato de resposta. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
-- ATENÇÃO: rodar de novo a 20261022 ou a 20261023 DEPOIS desta volta as funções recriadas aqui à versão antiga (lista de
-- espera sem WhatsApp, fuso fixo de Roraima): rode esta em seguida. As funções só da Edge Function daqui conferem o papel
-- de quem chama por dentro (uma nova aplicação da 20261022 daria EXECUTE a "authenticated" a elas pelo laço de permissões).
--
-- Contrato completo (chamada, resposta e mensagens exatas): docs/VAGAS-SPEC.md §8 (8.1, 8.4a, 8.7, 8.8, 8.9).
-- Mesmas regras no navegador: vagas/js/regras.js (INDICADORES, corIndicador, lerListaEspera) e vagas/js/api-previa.js.
--
--   1. Lista de espera com WhatsApp OPCIONAL (decisão do dono): vagas_lista_espera_entrar aceita "whatsapp" (celular com
--      DDD, só algarismos depois de normalizar, mesma regra dos outros celulares do banco); a resposta continua neutra
--      (nada revela se o e-mail já estava). vagas_lista_espera_sair apaga a linha do e-mail (com o WhatsApp dela) ou, só com
--      o WhatsApp, tira esse número de todas as linhas da cidade. Consentimento: o texto do campo diz para que serve ("só para
--      avisar quando abrir"); whatsapp_em guarda quando ele foi dado. A operação e a equipe veem só contagens.
--   2. vagas_op_indicadores(p_cidade): os 15 indicadores de conteudo/vagas-operacao/indicadores.json (valor, alvo pelo PORTE
--      cadastrado da cidade — 'grande' ou 'pequena' —, cor ok/atencao/alerta pela regra do arquivo, marca de hipótese) e os
--      5 gatilhos, só agregados (nunca linha de pessoa), da praça (a cidade + o entorno dela). Operador(a)/moderador(a) só da
--      própria cidade; equipe (public.e_admin()) em todas. O que o banco não guarda volta como valor null + semDado.
--      A cidade ganha a coluna "porte" (null = ainda não cadastrado: sem alvo e sem cor); vagas_adm_cidade_salvar aceita "porte".
--      O arquivo (versão 2) só tem alvos de cidade pequena: porte 'grande' fica sem alvo até a operação definir um.
--   3. Equipe da empresa: quem é DONO(A) convida por e-mail (papel recrutador), lista a equipe, cancela convite e remove
--      membro (nunca a última pessoa dona). O convite é um token de uso único (só o hash fica no banco), vale 72 h, só serve
--      para a conta com AQUELE e-mail, confirmada, e só vira membro depois do aceite. O e-mail e a conta pendente de quem
--      ainda não tem conta saem da Edge Function vagas-conta (ação convite_equipe, JWT conferido no Auth), que pergunta tudo
--      ao banco em vagas_conta_convite_equipe (só service_role). Resposta neutra quanto à existência da conta. Limites por
--      empresa/dia, por e-mail e por origem. Registro em vagas_moderacao (papel novo 'empresa').
--   4. Fuso: nada fixo em Roraima. Padrão America/Sao_Paulo (coluna vagas_cidades.fuso, vagas_interno.hoje e
--      vagas_adm_cidade_salvar); nos testes de habilidade (20261023) a data do selo, o "hoje" e a data do "aguarde" passam a
--      usar o fuso da cidade da conta (vagas_interno.fuso_conta), com a mesma reserva. Nenhum texto com cidade/DDD de exemplo:
--      vagas_pessoa_salvar e vagas_adm_cidade_salvar recriadas só com a mensagem nova.
--   5. versao_banco(): a lista da 20261023 + 20261024120000_vagas_onda2 e 20261024120001_vagas_piloto_uruacu (dados).
--   6. Pedidos da frente de operação (só leitura): vagas_op_resumo ganha "repassePercentual" (o da própria linha de quem
--      chama; null para a equipe); vagas_adm_cidades() e vagas_adm_operadores(p_filtro) para o painel da equipe;
--      vagas_op_assistidos(p_filtro) com os cadastros assistidos ainda pendentes (e-mail MASCARADO; operador(a) vê só os que
--      criou). Nada disso devolve dado de pessoa além do que a própria operação digitou, e mascarado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas e tabela novas
-- -----------------------------------------------------------------------------

-- Porte da cidade (escolhe o alvo de cada indicador): 'pequena' (20 a 40 mil habitantes) | 'grande' (sem alvo no arquivo ainda).
-- null = ainda não cadastrado (os indicadores saem sem alvo e sem cor). Fuso padrão neutro para cidades novas.
alter table public.vagas_cidades add column if not exists porte text;
alter table public.vagas_cidades drop constraint if exists vagas_cidades_porte_check;
alter table public.vagas_cidades add constraint vagas_cidades_porte_check check (porte is null or porte in ('grande', 'pequena'));
alter table public.vagas_cidades alter column fuso set default 'America/Sao_Paulo';

-- Lista de espera: WhatsApp opcional (celular com DDD, 55 + 11 algarismos) e quando foi dado.
alter table public.vagas_lista_espera add column if not exists whatsapp text not null default '';
alter table public.vagas_lista_espera add column if not exists whatsapp_em timestamptz;
alter table public.vagas_lista_espera drop constraint if exists vagas_lista_espera_whatsapp_check;
alter table public.vagas_lista_espera add constraint vagas_lista_espera_whatsapp_check
  check (whatsapp = '' or whatsapp ~ '^55[1-9][1-9]9[0-9]{8}$');
alter table public.vagas_lista_espera drop constraint if exists vagas_lista_espera_whatsapp_em_check;
alter table public.vagas_lista_espera add constraint vagas_lista_espera_whatsapp_em_check check ((whatsapp = '') = (whatsapp_em is null));
create index if not exists vagas_lista_espera_whatsapp_idx on public.vagas_lista_espera (cidade_id, whatsapp) where whatsapp <> '';

-- Registro de moderação: os atos da equipe da empresa (convidar, cancelar, aceitar, remover) entram com papel 'empresa'.
alter table public.vagas_moderacao drop constraint if exists vagas_moderacao_papel_check;
alter table public.vagas_moderacao add constraint vagas_moderacao_papel_check
  check (papel in ('admin', 'operador', 'moderador', 'sistema', 'empresa'));

-- Convites para a equipe da empresa. O token só existe no e-mail: aqui fica o sha256 dele. Um aberto por e-mail e empresa.
-- 'vencido' não é guardado: é o aberto com expira_em no passado. Apagado 30 dias depois de encerrado (limpeza no próprio
-- convidar). Só as RPCs leem (nenhuma política).
create table if not exists public.vagas_equipe_convites (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.vagas_empresas (id) on delete cascade,
  email         text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  papel         text not null default 'recrutador' check (papel = 'recrutador'),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status        text not null default 'aberto' check (status in ('aberto', 'aceito', 'cancelado')),
  criado_por    uuid,   -- dono(a) que convidou (sem chave estrangeira: o registro fica)
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  usado_por     uuid,
  usado_em      timestamptz,
  encerrado_em  timestamptz,
  constraint vagas_equipe_convites_prazo check (expira_em > criado_em),
  constraint vagas_equipe_convites_uso check ((status = 'aceito') = (usado_em is not null))
);
create index if not exists vagas_equipe_convites_empresa_idx on public.vagas_equipe_convites (empresa_id, criado_em desc);
create unique index if not exists vagas_equipe_convites_um_aberto on public.vagas_equipe_convites (empresa_id, email) where status = 'aberto';

-- -----------------------------------------------------------------------------
-- Fuso (nada fixo numa cidade): reserva America/Sao_Paulo
-- -----------------------------------------------------------------------------

-- Data de hoje no fuso da cidade (sem fuso: America/Sao_Paulo). Mesma assinatura da 20261022.
create or replace function vagas_interno.hoje(p_fuso text)
returns date language sql stable set search_path = '' as $$
  select (now() at time zone coalesce(nullif(p_fuso, ''), 'America/Sao_Paulo'))::date;
$$;

-- Fuso da cidade da conta: a da pessoa; senão a da empresa (membro ativo mais antigo); senão a da operação; senão a do
-- cadastro assistido; senão America/Sao_Paulo.
create or replace function vagas_interno.fuso_conta(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.fuso from public.vagas_pessoas p join public.vagas_cidades c on c.id = p.cidade_id where p.user_id = p_user),
    (select c.fuso from public.vagas_empresa_membros m join public.vagas_empresas e on e.id = m.empresa_id
       join public.vagas_cidades c on c.id = e.cidade_id where m.user_id = p_user and m.ativo order by m.criado_em limit 1),
    (select c.fuso from public.vagas_operadores o join public.vagas_cidades c on c.id = o.cidade_id
      where o.user_id = p_user and o.ativo order by o.criado_em limit 1),
    (select c.fuso from public.vagas_contas x join public.vagas_cidades c on c.id = x.assistida_cidade_id where x.user_id = p_user),
    'America/Sao_Paulo');
$$;

-- Testes de habilidade (20261023): data e "hoje" no fuso da conta. teste_data/teste_hoje = da conta de quem chama (a própria
-- pessoa nas telas dela); *_de = da conta dona do selo (selo público, cartão).
create or replace function vagas_interno.teste_data_de(p timestamptz, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when p is null then null else to_char(p at time zone vagas_interno.fuso_conta(p_user), 'YYYY-MM-DD') end;
$$;
create or replace function vagas_interno.teste_hoje_de(p_user uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone vagas_interno.fuso_conta(p_user))::date;
$$;
create or replace function vagas_interno.teste_data(p timestamptz)
returns text language sql stable set search_path = '' as $$
  select vagas_interno.teste_data_de(p, vagas_interno.teste_usuario());
$$;
create or replace function vagas_interno.teste_hoje()
returns date language sql stable set search_path = '' as $$
  select vagas_interno.teste_hoje_de(vagas_interno.teste_usuario());
$$;

-- Igual à 20261023, com a data e a situação no fuso de quem tem o selo.
create or replace function vagas_interno.teste_selo_json(s public.vagas_selos)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'codigo', s.codigo, 'teste', s.teste, 'nome', coalesce(t.nome, s.teste),
    'nota', case when s.revogado then null else s.nota end, 'margem', coalesce(t.margem_nota, 10),
    'questoes', coalesce((select tt.total from public.vagas_tentativas tt where tt.id = s.tentativa_id), t.questoes_prova, 15),
    'data', vagas_interno.teste_data_de(s.emitido_em, s.user_id),
    'validoAte', to_char(s.valido_ate, 'YYYY-MM-DD'),
    'supervisao', case when s.presencial then 'presencial' else 'online' end,
    'situacao', case when s.revogado then 'revogado'
                     when s.valido_ate < vagas_interno.teste_hoje_de(s.user_id) then 'vencido'
                     else 'valido' end)
  from (select 1) um left join public.vagas_testes t on t.slug = s.teste;
$$;

-- Igual à 20261023, com o "hoje" de quem tem o selo.
create or replace function vagas_interno.selos_cartao(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j - 'situacao' order by x.ordem, x.teste), '[]'::jsonb)
  from (
    select distinct on (s.teste) s.teste, t.ordem, vagas_interno.teste_selo_json(s) as j
    from public.vagas_selos s
    join public.vagas_testes t on t.slug = s.teste
    where s.user_id = p_user and not s.revogado and s.valido_ate >= vagas_interno.teste_hoje_de(p_user)
    order by s.teste, s.nota desc, s.emitido_em desc
  ) x;
$$;

-- Igual à 20261023, com a validade do selo contada no fuso de quem fez a prova.
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
      ((v_fim at time zone vagas_interno.fuso_conta(tt.user_id))::date + make_interval(months => t.validade_meses))::date)
    on conflict (tentativa_id) do nothing;
  end if;
end;
$$;

-- Igual à 20261023, com a data do "pode fazer de novo a partir de" no fuso da pessoa.
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
      || to_char((v_ult + interval '30 days') at time zone vagas_interno.fuso_conta(v_user), 'DD/MM/YYYY') || '.',
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

-- Equipe: cria ou altera uma cidade (pelo slug). Igual à 20261022 + "porte" ('grande' | 'pequena' | '' = sem porte), o fuso
-- padrão America/Sao_Paulo e a alteração que muda SÓ as chaves enviadas (antes, alterar exigia mandar nome e UF de novo).
-- {slug, nome, uf, ibge?, status?, praca?, fuso?, porte?, metaListaEspera?, ordem?}
create or replace function public.vagas_adm_cidade_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_slug text := lower(btrim(disc_interno.texto(d -> 'slug')));
  v_status text := coalesce(nullif(disc_interno.texto(d -> 'status'), ''), 'rascunho');
  v_porte text := nullif(lower(btrim(disc_interno.texto(d -> 'porte'))), '');
  v_praca uuid := null;
  c public.vagas_cidades%rowtype;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$' or char_length(v_slug) > 60 then
    return vagas_interno.erro('Endereço da cidade inválido (ex.: nome-da-cidade-uf).');
  end if;
  if v_status not in ('rascunho', 'lista_espera', 'ativa', 'pausada') then return vagas_interno.erro('Status da cidade inválido.'); end if;
  if v_porte is not null and v_porte not in ('grande', 'pequena') then
    return vagas_interno.erro('Porte da cidade inválido (grande ou pequena).');
  end if;
  if btrim(disc_interno.texto(d -> 'praca')) <> '' then
    select x.id into v_praca from public.vagas_cidades x where x.slug = lower(btrim(disc_interno.texto(d -> 'praca')));
    if v_praca is null then return vagas_interno.erro('Cidade-polo não encontrada.'); end if;
  end if;
  begin
    -- Cidade que já existe: muda só as chaves enviadas (sem precisar mandar nome e UF de novo).
    select * into c from public.vagas_cidades where slug = v_slug for update;
    if found then
      update public.vagas_cidades x set
        nome = case when d ? 'nome' then disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 80) else x.nome end,
        uf = case when d ? 'uf' then upper(btrim(disc_interno.texto(d -> 'uf'))) else x.uf end,
        ibge = case when d ? 'ibge' then nullif(btrim(disc_interno.texto(d -> 'ibge')), '') else x.ibge end,
        fuso = case when d ? 'fuso' then coalesce(nullif(btrim(disc_interno.texto(d -> 'fuso')), ''), 'America/Sao_Paulo') else x.fuso end,
        status = case when d ? 'status' then v_status else x.status end,
        porte = case when d ? 'porte' then v_porte else x.porte end,
        praca_id = case when d ? 'praca' then v_praca else x.praca_id end,
        meta_lista_espera = case when d ? 'metaListaEspera' then vagas_interno.inteiro(d -> 'metaListaEspera') else x.meta_lista_espera end,
        ordem = case when d ? 'ordem' then coalesce(vagas_interno.inteiro(d -> 'ordem'), 0) else x.ordem end
      where x.id = c.id
      returning * into c;
    else
      insert into public.vagas_cidades (slug, nome, uf, ibge, fuso, status, porte, praca_id, meta_lista_espera, ordem)
      values (v_slug, disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 80), upper(btrim(disc_interno.texto(d -> 'uf'))),
        nullif(btrim(disc_interno.texto(d -> 'ibge')), ''), coalesce(nullif(btrim(disc_interno.texto(d -> 'fuso')), ''), 'America/Sao_Paulo'),
        v_status, v_porte, v_praca, vagas_interno.inteiro(d -> 'metaListaEspera'), coalesce(vagas_interno.inteiro(d -> 'ordem'), 0))
      returning * into c;
    end if;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation then return vagas_interno.erro('Dados da cidade inválidos. Confira nome, UF e IBGE.');
  end;
  perform vagas_interno.registrar(c.id, 'admin', 'cidade_salvar', 'cidade', c.id, '', jsonb_build_object('status', c.status, 'porte', c.porte));
  return vagas_interno.ok(jsonb_build_object('cidade', vagas_interno.cidade_json(c) || jsonb_build_object('porte', c.porte)));
end;
$$;

-- Currículo em 5 passos: igual à 20261022, só com a mensagem do WhatsApp sem DDD de exemplo (nenhuma cidade fixa em texto;
-- a mesma de conteudo/vagas-textos validacao.whatsapp_invalido e de VAGAS_REGRAS.lerPessoa).
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
        coalesce(x -> 'informal' = 'true'::jsonb, false), i);
    end loop;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  return vagas_interno.ok(jsonb_build_object('pessoa', vagas_interno.pessoa_json(v_uid), 'cartao', vagas_interno.cartao(v_uid, null), 'completo', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Lista de espera com WhatsApp opcional
-- -----------------------------------------------------------------------------

-- "Avise-me quando chegar" {cidade, email, perfil?, whatsapp?}. Limite: 10 por hora por origem. A resposta é a MESMA com ou
-- sem WhatsApp e não revela se o e-mail já estava na lista (contador aproximado, sem quem entrou hoje). Repetir o e-mail não
-- duplica; um WhatsApp novo substitui o anterior daquele e-mail; sem WhatsApp, o que estava fica.
create or replace function public.vagas_lista_espera_entrar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_perfil text := case when disc_interno.texto(d -> 'perfil') = 'empresa' then 'empresa' else 'pessoa' end;
  v_whats_txt text := btrim(disc_interno.texto(d -> 'whatsapp'));
  v_whats text := '';
  v_origens text[] := disc_interno.origens_requisicao();
  o text;
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found or c.status in ('rascunho', 'pausada') then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status = 'ativa' then return vagas_interno.erro('Esta cidade já está aberta: faça o seu cadastro.', '{"ativa": true}'); end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_whats_txt <> '' then
    v_whats := vagas_interno.normalizar_whatsapp(v_whats_txt);
    if v_whats !~ '^55[1-9][1-9]9[0-9]{8}$' then
      return vagas_interno.erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).');
    end if;
  end if;
  if v_origens is not null then
    foreach o in array v_origens loop
      if vagas_interno.contar('lista_espera', o, interval '1 hour') > 10 then
        return vagas_interno.erro('Muitas tentativas. Tente de novo mais tarde.', '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  insert into public.vagas_lista_espera as l (cidade_id, email, perfil, whatsapp, whatsapp_em)
  values (c.id, v_email, v_perfil, v_whats, case when v_whats <> '' then now() end)
  on conflict (cidade_id, email) do update set
    whatsapp = case when excluded.whatsapp <> '' then excluded.whatsapp else l.whatsapp end,
    whatsapp_em = case when excluded.whatsapp <> '' then excluded.whatsapp_em else l.whatsapp_em end;
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'interessados', vagas_interno.interessados(c.id)));
end;
$$;

-- Sair da lista de espera (LGPD) {cidade, email?, whatsapp?}: com o e-mail apaga a linha dele (e o WhatsApp junto); com o
-- WhatsApp tira esse número de todas as linhas da cidade (os e-mails ficam). Resposta sempre igual, exista ou não.
create or replace function public.vagas_lista_espera_sair(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_email_txt text := btrim(disc_interno.texto(d -> 'email'));
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_whats_txt text := btrim(disc_interno.texto(d -> 'whatsapp'));
  v_whats text := '';
  v_origens text[] := disc_interno.origens_requisicao();
  o text;
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if v_email_txt <> '' and v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_whats_txt <> '' then
    v_whats := vagas_interno.normalizar_whatsapp(v_whats_txt);
    if v_whats !~ '^55[1-9][1-9]9[0-9]{8}$' then
      return vagas_interno.erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).');
    end if;
  end if;
  if v_email = '' and v_whats = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_origens is not null then
    foreach o in array v_origens loop
      if vagas_interno.contar('lista_espera', o, interval '1 hour') > 10 then
        return vagas_interno.erro('Muitas tentativas. Tente de novo mais tarde.', '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  if v_email <> '' then delete from public.vagas_lista_espera where cidade_id = c.id and email = v_email; end if;
  if v_whats <> '' then
    update public.vagas_lista_espera set whatsapp = '', whatsapp_em = null where cidade_id = c.id and whatsapp = v_whats;
  end if;
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'removido', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Indicadores da praça (painel da operação e da equipe)
-- -----------------------------------------------------------------------------

-- Catálogo dos 15 indicadores = conteudo/vagas-operacao/indicadores.json (versão 2: alvo só de cidade pequena, "cidadePequena"
-- → porte 'pequena'; cidade de porte 'grande' fica sem alvo até a operação definir um); a mesma lista em
-- VAGAS_REGRAS.INDICADORES. tests/supabase/vagas_onda2.test.js compara os três.
create or replace function vagas_interno.indicadores_catalogo()
returns jsonb language sql immutable set search_path = '' as $$
  select '[
    {"chave":"vagas_ativas","nome":"Vagas ativas","unidade":"vagas","periodo":"agora","direcao":"maior_melhor",
     "alvo":{"pequena":20},"alvoLancamento":{"pequena":15},"hipotese":false},
    {"chave":"pessoas_com_selo_por_funcao","nome":"Pessoas com selo, por teste","unidade":"pessoas","periodo":"agora","direcao":"maior_melhor",
     "alvo":{"pequena":{"porTeste":null,"total":400}},"alvoLancamento":{"pequena":{"total":150}},"hipotese":false},
    {"chave":"vagas_3_interessados_72h","nome":"Vagas com 3 interessados com selo em 7 dias","unidade":"%","periodo":"30 dias",
     "direcao":"maior_melhor","alvo":{"pequena":70},"janela":{"pequena":"7d"},"hipotese":false},
    {"chave":"vagas_combinou_7d","nome":"Vagas com Combinou em 7 dias","unidade":"%","periodo":"30 dias","direcao":"maior_melhor",
     "alvo":{"pequena":60},"hipotese":true},
    {"chave":"primeira_resposta_empresa_dias","nome":"Primeira resposta da empresa","unidade":"dias","periodo":"30 dias","direcao":"menor_melhor",
     "alvo":{"pequena":7},"hipotese":false},
    {"chave":"contratacoes","nome":"Contratações","unidade":"contratações","periodo":"acumulado e mês","direcao":"maior_melhor",
     "alvo":{"pequena":3},"hipotese":false},
    {"chave":"empresas_ativas_mes","nome":"Empresas ativas por mês","unidade":"empresas","periodo":"mês","direcao":"maior_melhor",
     "alvo":{"pequena":15},"alvoLancamento":{"pequena":10},"hipotese":false},
    {"chave":"empresas_buscando_semana","nome":"Empresas buscando no banco por semana","unidade":"empresas","periodo":"semana","direcao":"maior_melhor",
     "alvo":{"pequena":null},"hipotese":false},
    {"chave":"empresas_pagantes","nome":"Empresas pagantes (mês)","unidade":"empresas","periodo":"mês","direcao":"maior_melhor",
     "alvo":{"pequena":5},"hipotese":false},
    {"chave":"receita_liquida_centavos","nome":"Receita líquida (mês)","unidade":"centavos","periodo":"mês","direcao":"maior_melhor",
     "alvo":{"pequena":null},"hipotese":false},
    {"chave":"denuncia_tempo_decisao_h","nome":"Tempo para decidir uma denúncia","unidade":"horas","periodo":"últimas 30","direcao":"menor_melhor",
     "alvo":{"pequena":24},"hipotese":true},
    {"chave":"emails_mes","nome":"E-mails enviados no mês","unidade":"e-mails","periodo":"mês","direcao":"menor_melhor",
     "alvo":{"pequena":3000},"alerta":2500,"hipotese":false},
    {"chave":"fila_moderacao","nome":"Esperando moderação há mais de 24 h","unidade":"itens","periodo":"agora","direcao":"menor_melhor",
     "alvo":{"pequena":0},"hipotese":true},
    {"chave":"lista_espera","nome":"Pessoas na lista de espera","unidade":"pessoas","periodo":"agora","direcao":"maior_melhor",
     "alvo":{"pequena":200},"hipotese":true},
    {"chave":"cadastros_assistidos_confirmados","nome":"Cadastros assistidos confirmados","unidade":"contas","periodo":"por mutirão e mês",
     "direcao":"maior_melhor","alvo":{"pequena":45},"hipotese":true}
  ]'::jsonb;
$$;

-- Os 5 gatilhos do arquivo (chave, nome, hipótese); as partes de cada um são montadas em vagas_op_indicadores.
create or replace function vagas_interno.gatilhos_catalogo()
returns jsonb language sql immutable set search_path = '' as $$
  select '[
    {"chave":"antes_de_cobrar","nome":"Pode começar a cobrar a empresa","hipotese":true},
    {"chave":"praca_viva","nome":"Praça viva (6 meses)","hipotese":false},
    {"chave":"abrir_proxima","nome":"Abrir outra praça (só quando o dono decidir; nenhuma cidade escolhida)","hipotese":true},
    {"chave":"trocar_parceiro","nome":"Trocar o parceiro","hipotese":false},
    {"chave":"pessoa_nao_paga","nome":"A pessoa não paga nada","hipotese":false}
  ]'::jsonb;
$$;

-- Número de um alvo (número solto, ou {total} quando o alvo tem partes); null se não houver.
create or replace function vagas_interno.alvo_numero(p jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p) when 'number' then (p #>> '{}')::numeric
    when 'object' then case when jsonb_typeof(p -> 'total') = 'number' then (p ->> 'total')::numeric end end;
$$;

-- Cor pela regra do arquivo: maior é melhor — ok (atingiu), atencao (70% ou mais do alvo), alerta (abaixo disso); menor é
-- melhor — ok (até o alvo), atencao (até 1,3 vez o alvo), alerta (acima). Sem valor ou sem alvo: null.
create or replace function vagas_interno.indicador_cor(p_valor numeric, p_alvo numeric, p_direcao text)
returns text language sql immutable set search_path = '' as $$
  select case when p_valor is null or p_alvo is null then null
    when p_direcao = 'menor_melhor' then case when p_valor <= p_alvo then 'ok' when p_valor <= p_alvo * 1.3 then 'atencao' else 'alerta' end
    else case when p_valor >= p_alvo then 'ok' when p_valor >= p_alvo * 0.7 then 'atencao' else 'alerta' end end;
$$;

-- Um indicador pronto: catálogo + porte + valor (+ semDado, detalhe e o que mais vier em p_extra).
create or replace function vagas_interno.indicador_json(p_chave text, p_porte text, p_valor numeric, p_extra jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('chave', i ->> 'chave', 'nome', i ->> 'nome', 'unidade', i ->> 'unidade', 'periodo', i ->> 'periodo',
      'direcao', i ->> 'direcao', 'hipotese', coalesce((i ->> 'hipotese')::boolean, false), 'valor', p_valor,
      'alvo', vagas_interno.alvo_numero(i #> array['alvo', coalesce(p_porte, '-')]),
      'alvoLancamento', vagas_interno.alvo_numero(i #> array['alvoLancamento', coalesce(p_porte, '-')]),
      'cor', vagas_interno.indicador_cor(p_valor, vagas_interno.alvo_numero(i #> array['alvo', coalesce(p_porte, '-')]), i ->> 'direcao'),
      'semDado', false, 'detalhe', '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb)
  from jsonb_array_elements(vagas_interno.indicadores_catalogo()) i where i ->> 'chave' = p_chave;
$$;

-- Parte de um gatilho e o gatilho montado: atingido = false se alguma parte é false; null se falta conferir alguma
-- (manual ou sem dado); true só com todas true. aplica = false: o gatilho não vale para esta cidade (porte).
create or replace function vagas_interno.gatilho_parte(p_descricao text, p_ok boolean, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('descricao', p_descricao, 'ok', p_ok) || coalesce(p_extra, '{}'::jsonb);
$$;
create or replace function vagas_interno.gatilho_json(p_chave text, p_aplica boolean, p_partes jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('chave', g ->> 'chave', 'nome', g ->> 'nome', 'hipotese', coalesce((g ->> 'hipotese')::boolean, false),
    'aplica', p_aplica,
    'atingido', case when not p_aplica or jsonb_array_length(p_partes) = 0 then null
      when exists (select 1 from jsonb_array_elements(p_partes) e where e -> 'ok' = 'false'::jsonb) then false
      when exists (select 1 from jsonb_array_elements(p_partes) e where jsonb_typeof(e -> 'ok') <> 'boolean') then null
      else true end,
    'partes', case when p_aplica then p_partes else '[]'::jsonb end)
  from jsonb_array_elements(vagas_interno.gatilhos_catalogo()) g where g ->> 'chave' = p_chave;
$$;

-- Painel da praça: a cidade pedida + as cidades do entorno dela (praca_id). Só contagens, porcentagens, medianas e totais
-- por teste/área/mutirão — nenhuma linha de pessoa, nenhum contato, nenhum id de pessoa. Operador(a)/moderador(a) só da
-- própria cidade; equipe em todas. stable: só lê.
create or replace function public.vagas_op_indicadores(p_cidade text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_cids uuid[];
  v_porte text;
  v_fuso text;
  v_hoje date;
  v_mes timestamptz;
  v_janela interval;
  v_tem_selos boolean := to_regclass('public.vagas_selos') is not null;
  cat jsonb := vagas_interno.indicadores_catalogo();
  v_testes text[] := vagas_interno.testes_selo();
  ind jsonb := '[]'::jsonb;
  gat jsonb := '[]'::jsonb;
  -- valores
  n_vagas int;
  vagas_teste jsonb;
  vagas_area jsonb;
  n_selo int;
  selo_teste jsonb;
  b3 int;
  ok3 int;
  b7 int;
  ok7 int;
  resp_base int;
  resp_med numeric;
  resp_sem7 numeric;
  contr int;
  contr_mes int;
  emp_mes int;
  den_base int;
  den_med numeric;
  den_24 int;
  fila_a int;
  fila_e int;
  fila_r int;
  le_total int;
  le_pessoa int;
  le_empresa int;
  le_whats int;
  ass_mes int;
  ass_eventos jsonb;
  -- alvos usados nos gatilhos
  a_vagas numeric;
  l_vagas numeric;
  a_selo numeric;
  l_selo numeric;
  a3 numeric;
  a_contr numeric;
  a_emp numeric;
  l_emp numeric;
  a_pag numeric;
  a_resp numeric;
  a_lista numeric;
  p3 numeric;
  v_viva jsonb;
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then
    return vagas_interno.erro(case when public.e_admin() then 'Cidade não encontrada.' else 'Sem permissão.' end);
  end if;
  if vagas_interno.papel_cidade(c.id) is null then return vagas_interno.erro('Sem permissão.'); end if;

  v_cids := array[c.id] || array(select x.id from public.vagas_cidades x where x.praca_id = c.id and x.id <> c.id);
  v_porte := c.porte;
  v_fuso := coalesce(nullif(c.fuso, ''), 'America/Sao_Paulo');
  v_hoje := (now() at time zone v_fuso)::date;
  v_mes := (date_trunc('month', v_hoje::timestamp)) at time zone v_fuso;
  v_janela := case (cat -> 2 -> 'janela' ->> coalesce(v_porte, '-')) when '72h' then interval '72 hours' else interval '7 days' end;

  -- 1. Vagas no ar (total, por teste valorizado no campo "selo" e por área).
  select count(*)::int into n_vagas from public.vagas_anuncios a where a.cidade_id = any (v_cids) and vagas_interno.no_ar(a);
  select coalesce(jsonb_object_agg(t.teste, (select count(*) from public.vagas_anuncios a
      where a.cidade_id = any (v_cids) and a.selo = t.teste and vagas_interno.no_ar(a))), '{}'::jsonb)
    into vagas_teste from unnest(v_testes) t(teste);
  select coalesce(jsonb_agg(jsonb_build_object('area', x.area, 'nome', ar.nome, 'valor', x.n) order by x.n desc, ar.ordem), '[]'::jsonb)
    into vagas_area
    from (select a.area, count(*)::int as n from public.vagas_anuncios a
           where a.cidade_id = any (v_cids) and vagas_interno.no_ar(a) group by a.area) x
    join public.vagas_areas ar on ar.slug = x.area;

  -- 2. Pessoas da praça com selo válido (total e por teste). Sem a migração dos testes: sem dado.
  if v_tem_selos then
    select count(distinct s.user_id)::int into n_selo from public.vagas_selos s
     where not s.revogado and s.valido_ate >= v_hoje
       and exists (select 1 from public.vagas_pessoas p where p.user_id = s.user_id and (p.cidade_id = any (v_cids) or p.cidade2_id = any (v_cids)));
    select coalesce(jsonb_object_agg(t.teste, (select count(distinct s.user_id) from public.vagas_selos s
        where s.teste = t.teste and not s.revogado and s.valido_ate >= v_hoje
          and exists (select 1 from public.vagas_pessoas p where p.user_id = s.user_id and (p.cidade_id = any (v_cids) or p.cidade2_id = any (v_cids))))),
        '{}'::jsonb)
      into selo_teste from unnest(v_testes) t(teste);

    -- 3. Vagas publicadas nos últimos 30 dias (e há pelo menos a janela) com 3+ candidaturas de quem tinha selo válido
    --    no momento do Quero, dentro da janela do porte (arquivo: 7 dias na cidade pequena; sem janela no porte: 7 dias).
    select count(*)::int, (count(*) filter (where x.n >= 3))::int into b3, ok3 from (
      select (select count(*) from public.vagas_candidaturas k
               where k.anuncio_id = a.id and k.status <> 'retirada' and k.criado_em <= a.publicado_em + v_janela
                 and exists (select 1 from public.vagas_selos s where s.user_id = k.pessoa_id and s.emitido_em <= k.criado_em
                              and s.valido_ate >= (k.criado_em at time zone v_fuso)::date
                              and (not s.revogado or s.revogado_em > k.criado_em))) as n
        from public.vagas_anuncios a
       where a.cidade_id = any (v_cids) and a.publicado_em is not null and a.status <> 'removido'
         and a.publicado_em >= now() - interval '30 days' and a.publicado_em <= now() - v_janela) x;
  end if;

  -- 4. Vagas publicadas nos últimos 30 dias (e há 7 dias ou mais) com Combinou em até 7 dias.
  select count(*)::int, (count(*) filter (where exists (select 1 from public.vagas_candidaturas k where k.anuncio_id = a.id
      and k.status in ('combinou', 'contratada') and k.combinou_em <= a.publicado_em + interval '7 days')))::int
    into b7, ok7
    from public.vagas_anuncios a
   where a.cidade_id = any (v_cids) and a.publicado_em is not null and a.status <> 'removido'
     and a.publicado_em >= now() - interval '30 days' and a.publicado_em <= now() - interval '7 days';

  -- 5. Primeira resposta da empresa (mediana em dias) nas candidaturas dos últimos 30 dias: a primeira decisão ou a conversa
  --    aberta pela empresa (o que vier antes); sem resposta há 7 dias ou mais conta com o tempo de espera (7+).
  select count(*)::int, round((percentile_cont(0.5) within group (order by y.dias))::numeric, 1),
         round(100.0 * count(*) filter (where y.dias > 7) / nullif(count(*), 0))
    into resp_base, resp_med, resp_sem7
    from (select extract(epoch from (coalesce(x.primeira, now()) - x.criado_em)) / 86400.0 as dias
            from (select k.criado_em, k.status, least(k.empresa_decidiu_em, v.criada_em) as primeira
                    from public.vagas_candidaturas k
                    join public.vagas_anuncios a on a.id = k.anuncio_id
                    left join public.vagas_conversas v on v.candidatura_id = k.id
                   where a.cidade_id = any (v_cids) and k.criado_em >= now() - interval '30 days') x
           where x.primeira is not null or (x.status <> 'retirada' and x.criado_em <= now() - interval '7 days')) y;

  -- 6. Contratações (acumulado e mês, pela cidade da vaga).
  select count(*)::int, (count(*) filter (where k.contratada_em >= v_mes))::int into contr, contr_mes
    from public.vagas_candidaturas k join public.vagas_anuncios a on a.id = k.anuncio_id
   where a.cidade_id = any (v_cids) and k.status = 'contratada';

  -- 7. Empresas verificadas da praça com alguma ação no mês: publicou vaga, decidiu candidatura ou escreveu na conversa.
  --    (Renovar não guarda data própria: não conta sozinho.)
  select count(*)::int into emp_mes from public.vagas_empresas e
   where e.cidade_id = any (v_cids) and e.status = 'ativa' and (
     exists (select 1 from public.vagas_anuncios a where a.empresa_id = e.id and a.publicado_em >= v_mes)
     or exists (select 1 from public.vagas_candidaturas k where k.empresa_id = e.id and k.empresa_decidiu_em >= v_mes)
     or exists (select 1 from public.vagas_candidaturas k join public.vagas_conversas v on v.candidatura_id = k.id
                  join public.vagas_mensagens m on m.conversa_id = v.id
                 where k.empresa_id = e.id and m.autor = 'empresa' and m.criado_em >= v_mes));

  -- 11. Denúncias: mediana (horas) das últimas 30 decididas e quantas estão abertas há mais de 24 h.
  select count(*)::int, round((percentile_cont(0.5) within group (order by extract(epoch from (z.decidida_em - z.criado_em)) / 3600.0))::numeric, 1)
    into den_base, den_med
    from (select x.decidida_em, x.criado_em from public.vagas_denuncias x
           where x.cidade_id = any (v_cids) and x.decidida_em is not null order by x.decidida_em desc limit 30) z;
  select count(*)::int into den_24 from public.vagas_denuncias x
   where x.cidade_id = any (v_cids) and x.status = 'aberta' and x.criado_em < now() - interval '24 hours';

  -- 13. Fila da moderação há mais de 24 h (vaga em revisão desde a última mudança; empresa em análise desde o cadastro;
  --     texto de referência em revisão, pela cidade da empresa).
  select count(*)::int into fila_a from public.vagas_anuncios a
   where a.cidade_id = any (v_cids) and a.status = 'em_revisao' and a.atualizado_em < now() - interval '24 hours';
  select count(*)::int into fila_e from public.vagas_empresas e
   where e.cidade_id = any (v_cids) and e.status = 'em_analise' and e.criado_em < now() - interval '24 hours';
  select count(*)::int into fila_r from public.vagas_referencias r join public.vagas_empresas e on e.id = r.empresa_id
   where e.cidade_id = any (v_cids) and r.texto_status = 'pendente' and r.criado_em < now() - interval '24 hours';

  -- 14. Lista de espera (só contagens: a operação nunca vê e-mail nem WhatsApp).
  select count(*)::int, (count(*) filter (where l.perfil = 'pessoa'))::int, (count(*) filter (where l.perfil = 'empresa'))::int,
         (count(*) filter (where l.whatsapp <> ''))::int
    into le_total, le_pessoa, le_empresa, le_whats
    from public.vagas_lista_espera l where l.cidade_id = any (v_cids);

  -- 15. Cadastros assistidos (pessoa ou empresa; o convite de operação não entra) confirmados no mês e por mutirão (90 dias).
  select count(*)::int into ass_mes from public.vagas_contas x
   where x.assistida_por is not null and x.assistida_cidade_id = any (v_cids) and x.tipo in ('pessoa', 'empresa') and x.confirmada_em >= v_mes;
  select coalesce(jsonb_agg(jsonb_build_object('codigoEvento', y.codigo, 'criadas', y.criadas, 'confirmadas', y.confirmadas,
      'cor', vagas_interno.indicador_cor(y.confirmadas,
        vagas_interno.alvo_numero(vagas_interno.indicador_json('cadastros_assistidos_confirmados', v_porte, null, null) -> 'alvo'), 'maior_melhor'))
      order by y.ultimo desc), '[]'::jsonb)
    into ass_eventos
    from (select x.codigo_evento as codigo, count(*)::int as criadas, (count(*) filter (where x.confirmada_em is not null))::int as confirmadas,
                 max(x.criado_em) as ultimo
            from public.vagas_contas x
           where x.assistida_por is not null and x.assistida_cidade_id = any (v_cids) and x.tipo in ('pessoa', 'empresa')
             and x.codigo_evento <> '' and x.criado_em >= now() - interval '90 days'
           group by x.codigo_evento order by max(x.criado_em) desc limit 20) y;

  -- Indicadores, na ordem do arquivo.
  p3 := case when b3 > 0 then round(100.0 * ok3 / b3) end;
  ind := jsonb_build_array(
    vagas_interno.indicador_json('vagas_ativas', v_porte, n_vagas,
      jsonb_build_object('detalhe', jsonb_build_object('porTeste', vagas_teste, 'porArea', vagas_area))),
    vagas_interno.indicador_json('pessoas_com_selo_por_funcao', v_porte, n_selo,
      case when v_tem_selos then jsonb_build_object('detalhe', jsonb_build_object('porTeste', selo_teste,
        'alvoPorTeste', cat -> 1 -> 'alvo' -> coalesce(v_porte, '-') -> 'porTeste',
        'alvoLancamentoPorTeste', cat -> 1 -> 'alvoLancamento' -> coalesce(v_porte, '-') -> 'porTeste'))
      else '{"semDado": true}'::jsonb end),
    vagas_interno.indicador_json('vagas_3_interessados_72h', v_porte, p3,
      case when not v_tem_selos then '{"semDado": true}'::jsonb
        else jsonb_build_object('semBase', b3 = 0, 'detalhe', jsonb_build_object('base', b3, 'comTres', ok3,
          'janelaHoras', (extract(epoch from v_janela) / 3600)::int)) end),
    vagas_interno.indicador_json('vagas_combinou_7d', v_porte, case when b7 > 0 then round(100.0 * ok7 / b7) end,
      jsonb_build_object('semBase', b7 = 0, 'detalhe', jsonb_build_object('base', b7, 'comCombinou', ok7))),
    vagas_interno.indicador_json('primeira_resposta_empresa_dias', v_porte, resp_med,
      jsonb_build_object('semBase', resp_base = 0, 'detalhe', jsonb_build_object('base', resp_base, 'semRespostaEm7DiasPct', resp_sem7))),
    vagas_interno.indicador_json('contratacoes', v_porte, contr, jsonb_build_object('detalhe', jsonb_build_object('mes', contr_mes))),
    vagas_interno.indicador_json('empresas_ativas_mes', v_porte, emp_mes, null),
    vagas_interno.indicador_json('empresas_buscando_semana', v_porte, null, '{"semDado": true}'::jsonb),
    vagas_interno.indicador_json('empresas_pagantes', v_porte, null, '{"semDado": true}'::jsonb),
    vagas_interno.indicador_json('receita_liquida_centavos', v_porte, null, '{"semDado": true}'::jsonb),
    vagas_interno.indicador_json('denuncia_tempo_decisao_h', v_porte, den_med,
      jsonb_build_object('semBase', den_base = 0, 'detalhe', jsonb_build_object('base', den_base, 'abertasMais24h', den_24))),
    vagas_interno.indicador_json('emails_mes', v_porte, null, jsonb_build_object('semDado', true, 'alerta', cat -> 11 -> 'alerta')),
    vagas_interno.indicador_json('fila_moderacao', v_porte, fila_a + fila_e + fila_r,
      jsonb_build_object('detalhe', jsonb_build_object('anuncios', fila_a, 'empresas', fila_e, 'referencias', fila_r))),
    vagas_interno.indicador_json('lista_espera', v_porte, le_total,
      jsonb_build_object('detalhe', jsonb_build_object('pessoa', le_pessoa, 'empresa', le_empresa, 'comWhatsapp', le_whats))),
    vagas_interno.indicador_json('cadastros_assistidos_confirmados', v_porte, ass_mes,
      jsonb_build_object('detalhe', jsonb_build_object('porMutirao', ass_eventos))));

  -- Gatilhos (os números vêm das metas de lançamento e dos alvos do porte da cidade; sem esses números — sem porte, ou porte
  -- sem alvo no arquivo — os gatilhos que dependem deles não se aplicam).
  a_vagas := (ind -> 0 ->> 'alvo')::numeric;          l_vagas := (ind -> 0 ->> 'alvoLancamento')::numeric;
  a_selo := (ind -> 1 ->> 'alvo')::numeric;           l_selo := (ind -> 1 ->> 'alvoLancamento')::numeric;
  a3 := (ind -> 2 ->> 'alvo')::numeric;               a_resp := (ind -> 4 ->> 'alvo')::numeric;
  a_contr := (ind -> 5 ->> 'alvo')::numeric;          a_emp := (ind -> 6 ->> 'alvo')::numeric;
  l_emp := (ind -> 6 ->> 'alvoLancamento')::numeric;  a_pag := (ind -> 8 ->> 'alvo')::numeric;
  a_lista := (ind -> 13 ->> 'alvo')::numeric;

  gat := jsonb_build_array(vagas_interno.gatilho_json('antes_de_cobrar', l_vagas is not null, jsonb_build_array(
    vagas_interno.gatilho_parte(format('Vagas no ar: %s ou mais', l_vagas), n_vagas >= l_vagas),
    vagas_interno.gatilho_parte(format('Empresas ativas no mês: %s ou mais', l_emp), emp_mes >= l_emp),
    vagas_interno.gatilho_parte(format('Pessoas com selo: %s ou mais', l_selo), n_selo >= l_selo,
      case when v_tem_selos then '{}'::jsonb else '{"semDado": true}'::jsonb end),
    vagas_interno.gatilho_parte(format('Vagas com 3 interessados com selo na janela: %s%% ou mais', a3), p3 >= a3,
      case when v_tem_selos then '{}'::jsonb else '{"semDado": true}'::jsonb end),
    vagas_interno.gatilho_parte(format('Contratações: %s ou mais', a_contr), contr >= a_contr))));
  v_viva := vagas_interno.gatilho_json('praca_viva', a_vagas is not null, jsonb_build_array(
    vagas_interno.gatilho_parte(format('Vagas no ar: %s ou mais', a_vagas), n_vagas >= a_vagas),
    vagas_interno.gatilho_parte(format('Pessoas com selo: %s ou mais', a_selo), n_selo >= a_selo,
      case when v_tem_selos then '{}'::jsonb else '{"semDado": true}'::jsonb end),
    vagas_interno.gatilho_parte(format('Empresas ativas no mês: %s ou mais', a_emp), emp_mes >= a_emp),
    vagas_interno.gatilho_parte(format('Empresas pagantes no mês: %s ou mais', a_pag), null, '{"semDado": true}'::jsonb),
    vagas_interno.gatilho_parte(format('Primeira resposta da empresa: até %s dias', a_resp), resp_med <= a_resp)));
  gat := gat || jsonb_build_array(v_viva,
    vagas_interno.gatilho_json('abrir_proxima', a_vagas is not null, jsonb_build_array(
      vagas_interno.gatilho_parte('Decisão do dono de abrir outra praça', null, '{"manual": true}'::jsonb),
      vagas_interno.gatilho_parte('Praça viva em 2 meses seguidos', case when v_viva -> 'atingido' = 'false'::jsonb then false end,
        '{"manual": true}'::jsonb),
      vagas_interno.gatilho_parte(format('Lista de espera da próxima cidade: %s ou mais (veja o painel dela)', a_lista), null, '{"manual": true}'::jsonb),
      vagas_interno.gatilho_parte('Parceiro local com contrato assinado', null, '{"manual": true}'::jsonb))),
    vagas_interno.gatilho_json('trocar_parceiro', true, jsonb_build_array(
      vagas_interno.gatilho_parte('Praça operada por parceiro: 90 dias de contrato sem concluir os passos 3 a 9 do manual', null, '{"manual": true}'::jsonb),
      vagas_interno.gatilho_parte('Falta grave (acesso indevido, cobrança de pessoa, uso da base)', null, '{"manual": true}'::jsonb))),
    -- Regra fixa, não um gatilho que se atinge: quem procura emprego nunca paga (nenhum produto pago para a pessoa).
    vagas_interno.gatilho_json('pessoa_nao_paga', true, jsonb_build_array(
      vagas_interno.gatilho_parte('Quem procura emprego não paga nada: não existe produto pago para a pessoa', true, '{"fixa": true}'::jsonb))));

  return vagas_interno.ok(jsonb_build_object(
    'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome, 'uf', c.uf, 'status', c.status, 'porte', c.porte, 'fuso', v_fuso),
    'praca', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'nome', x.nome, 'status', x.status)
                                order by x.id <> c.id, x.ordem, x.nome)
                         from public.vagas_cidades x where x.id = any (v_cids)), '[]'::jsonb),
    'mes', to_char(v_hoje, 'YYYY-MM'), 'geradoEm', disc_interno.iso(now()),
    'indicadores', ind, 'gatilhos', gat));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Equipe da empresa: convite pela própria empresa
-- -----------------------------------------------------------------------------

-- sha256 (hex) do token do convite: o token em claro só existe no e-mail.
create or replace function vagas_interno.token_hash(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(lower(btrim(coalesce(p, ''))), 'UTF8')), 'hex');
$$;

-- Convite visto pela dona/pelo dono. status: pendente | vencido | aceito | cancelado.
create or replace function vagas_interno.equipe_convite_json(cv public.vagas_equipe_convites)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', cv.id, 'email', cv.email, 'papel', cv.papel,
    'status', case when cv.status = 'aberto' and cv.expira_em <= now() then 'vencido' when cv.status = 'aberto' then 'pendente' else cv.status end,
    'criadoEm', disc_interno.iso(cv.criado_em), 'expiraEm', disc_interno.iso(cv.expira_em));
$$;

-- Convite que ESTA conta (logada, e-mail igual ao do convite) pode usar: aberto, no prazo, de quem ainda é dono(a) ativo(a)
-- da empresa. Senão null (a tela recebe sempre a mesma mensagem: não revela se o token existe nem de quem é).
create or replace function vagas_interno.equipe_convite_valido(p_token text, p_user uuid)
returns public.vagas_equipe_convites language plpgsql stable security definer set search_path = '' as $$
declare
  cv public.vagas_equipe_convites%rowtype;
  v_email text;
begin
  if lower(btrim(coalesce(p_token, ''))) !~ '^[0-9a-f]{64}$' or p_user is null then return null; end if;
  select * into cv from public.vagas_equipe_convites where token_hash = vagas_interno.token_hash(p_token);
  if not found or cv.status <> 'aberto' or cv.expira_em <= now() then return null; end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if v_email is distinct from cv.email then return null; end if;
  if not exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = cv.empresa_id and m.user_id = cv.criado_por
                  and m.ativo and m.papel = 'dono') then
    return null;
  end if;
  return cv;
end;
$$;

-- Equipe da empresa (só quem é dono(a)): membros ativos (e-mail de login, nome do cadastro, papel, desde quando, se pode ser
-- removido) e os convites (abertos e os encerrados nos últimos 30 dias).
create or replace function public.vagas_equipe_empresa(p_empresa uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  e public.vagas_empresas%rowtype;
  v_donos int;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found or not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if not vagas_interno.membro(p_empresa, true) then
    return vagas_interno.erro('Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  end if;
  select count(*)::int into v_donos from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo and m.papel = 'dono';
  return vagas_interno.ok(jsonb_build_object(
    'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia, 'status', e.status),
    'membros', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', coalesce(lower(u.email), ''),
        'nome', disc_interno.limpar_texto(coalesce(u.raw_user_meta_data ->> 'nome', ''), 120), 'papel', m.papel,
        'desde', disc_interno.iso(m.criado_em), 'eu', m.user_id = auth.uid(),
        'podeRemover', not (m.papel = 'dono' and v_donos <= 1))
        order by m.papel = 'dono' desc, m.criado_em)
      from public.vagas_empresa_membros m left join auth.users u on u.id = m.user_id
      where m.empresa_id = e.id and m.ativo), '[]'::jsonb),
    'convites', coalesce((select jsonb_agg(vagas_interno.equipe_convite_json(cv) order by cv.criado_em desc)
      from (select * from public.vagas_equipe_convites x
             where x.empresa_id = e.id and (x.status = 'aberto' or coalesce(x.usado_em, x.encerrado_em, x.criado_em) > now() - interval '30 days')
             order by x.criado_em desc limit 50) cv), '[]'::jsonb),
    'limites', jsonb_build_object('convitesPorDia', 10, 'convitesHoje', vagas_interno.contagem('equipe_convite_empresa', e.id::text, interval '1 day'),
      'membrosMax', 20, 'convitesAbertosMax', 20, 'validadeHoras', 72)));
end;
$$;

-- Cancela um convite aberto (só quem é dono(a)). Aceito não volta: para tirar o acesso, remover a pessoa.
create or replace function public.vagas_equipe_convite_cancelar(p_convite uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  cv public.vagas_equipe_convites%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into cv from public.vagas_equipe_convites where id = p_convite for update;
  if not found or not vagas_interno.membro(cv.empresa_id, true) then return vagas_interno.erro('Convite não encontrado.'); end if;
  if cv.status = 'cancelado' then
    return vagas_interno.ok(jsonb_build_object('convite', vagas_interno.equipe_convite_json(cv), 'duplicado', true));
  end if;
  if cv.status = 'aceito' then
    return vagas_interno.erro('Este convite já foi aceito. Para tirar o acesso, remova a pessoa da equipe.');
  end if;
  update public.vagas_equipe_convites set status = 'cancelado', encerrado_em = now() where id = cv.id returning * into cv;
  perform vagas_interno.registrar((select e.cidade_id from public.vagas_empresas e where e.id = cv.empresa_id), 'empresa',
    'equipe_convite_cancelar', 'empresa', cv.empresa_id, '');
  return vagas_interno.ok(jsonb_build_object('convite', vagas_interno.equipe_convite_json(cv)));
end;
$$;

-- Remove alguém da equipe (dono(a) remove qualquer membro; qualquer membro pode sair). Nunca a última pessoa dona.
-- Os convites abertos que ela fez são cancelados. As vagas, conversas e referências continuam da empresa.
create or replace function public.vagas_equipe_remover(p_empresa uuid, p_membro uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  v_uid uuid := auth.uid();
  m public.vagas_empresa_membros%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found or not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if p_membro is distinct from v_uid and not vagas_interno.membro(p_empresa, true) then
    return vagas_interno.erro('Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  end if;
  -- Dois donos removendo um ao outro ao mesmo tempo não deixam a empresa sem dono.
  perform pg_advisory_xact_lock(hashtext('vagas_equipe:' || e.id::text));
  select * into m from public.vagas_empresa_membros where empresa_id = e.id and user_id = p_membro and ativo for update;
  if not found then return vagas_interno.erro('Esta pessoa não está na equipe.'); end if;
  if m.papel = 'dono' and (select count(*) from public.vagas_empresa_membros x where x.empresa_id = e.id and x.ativo and x.papel = 'dono') <= 1 then
    return vagas_interno.erro('A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.');
  end if;
  update public.vagas_empresa_membros set ativo = false where empresa_id = e.id and user_id = p_membro;
  update public.vagas_equipe_convites set status = 'cancelado', encerrado_em = now()
   where empresa_id = e.id and criado_por = p_membro and status = 'aberto';
  perform vagas_interno.registrar(e.cidade_id, 'empresa', case when p_membro = v_uid then 'equipe_sair' else 'equipe_remover' end,
    'empresa', e.id, '', jsonb_build_object('papel', m.papel));
  return vagas_interno.ok(jsonb_build_object('removido', true, 'saiu', p_membro = v_uid));
end;
$$;

-- Quem recebeu o convite abre o link (logado com a conta de empresa do MESMO e-mail): empresa, papel e validade.
create or replace function public.vagas_equipe_convite(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  cv public.vagas_equipe_convites%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  cv := vagas_interno.equipe_convite_valido(p_token, auth.uid());
  if cv.id is null then return vagas_interno.erro('Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.'); end if;
  select * into e from public.vagas_empresas where id = cv.empresa_id;
  return vagas_interno.ok(jsonb_build_object('convite', jsonb_build_object(
    'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia,
      'cidade', (select jsonb_build_object('slug', c.slug, 'nome', c.nome) from public.vagas_cidades c where c.id = e.cidade_id)),
    'papel', cv.papel, 'expiraEm', disc_interno.iso(cv.expira_em),
    'jaMembro', exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = auth.uid() and m.ativo))));
end;
$$;

-- Aceitar: só a conta de empresa confirmada com o e-mail do convite; o token vale uma vez. Vira recrutador(a).
create or replace function public.vagas_equipe_convite_aceitar(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  v_uid uuid := auth.uid();
  cv public.vagas_equipe_convites%rowtype;
  e public.vagas_empresas%rowtype;
  v_dup boolean;
  v_papel text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  cv := vagas_interno.equipe_convite_valido(p_token, v_uid);
  if cv.id is null then return vagas_interno.erro('Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.'); end if;
  select * into e from public.vagas_empresas where id = cv.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}'); end if;
  perform pg_advisory_xact_lock(hashtext('vagas_equipe:' || e.id::text));
  -- Dois cliques ao mesmo tempo: o segundo encontra o convite já usado.
  select * into cv from public.vagas_equipe_convites where id = cv.id and status = 'aberto' for update;
  if not found then return vagas_interno.erro('Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.'); end if;
  v_dup := exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = v_uid and m.ativo);
  if not v_dup then
    if (select count(*) from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo) >= 20 then
      return vagas_interno.erro('A equipe desta empresa está completa. Fale com quem convidou.');
    end if;
    insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values (e.id, v_uid, 'recrutador')
    on conflict (empresa_id, user_id) do update set ativo = true, papel = 'recrutador';
  end if;
  update public.vagas_equipe_convites set status = 'aceito', usado_por = v_uid, usado_em = now() where id = cv.id;
  perform vagas_interno.registrar(e.cidade_id, 'empresa', 'equipe_aceitar', 'empresa', e.id, '', jsonb_build_object('papel', cv.papel));
  select m.papel into v_papel from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = v_uid;
  return vagas_interno.ok(jsonb_build_object('empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia, 'papel', v_papel,
    'status', e.status), 'duplicado', v_dup));
end;
$$;

-- Só para a Edge Function (ação convite_equipe; a função conferiu o JWT no Auth e manda o id): quem pede é dono(a) ativo(a)?
-- Cria o convite (72 h; o anterior aberto para o mesmo e-mail é cancelado) e devolve o token EM CLARO e o destino do e-mail
-- (nova | empresa | empresa_pendente | outro_tipo | nenhum) — os dois só para a função, nunca para a tela. Limites: 10
-- convites por empresa por dia, 3 por e-mail por empresa por dia, 30 por hora por origem; até 20 pessoas na equipe e 20
-- convites abertos. Apaga os convites encerrados há mais de 30 dias.
create or replace function public.vagas_conta_convite_equipe(p_user uuid, p_empresa uuid, p_email text, p_cf text, p_xff text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg_limite constant text := 'Muitos convites hoje. Tente de novo amanhã.';
  c public.vagas_contas%rowtype;
  e public.vagas_empresas%rowtype;
  cv public.vagas_equipe_convites%rowtype;
  v_email text := vagas_interno.email(p_email);
  v_token text;
  v_destino text;
  v_alvo_id uuid;
  v_alvo_conf boolean;
  v_alvo_tipo text;
  v_alvo_status text;
  o text;
begin
  -- Defesa a mais: a permissão já é só da service_role, mas uma nova aplicação da 20261022 daria EXECUTE a authenticated.
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_contas where user_id = p_user;
  if not found then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if c.status = 'suspensa' then return vagas_interno.erro('Esta conta está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}'); end if;
  if not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    return vagas_interno.erro('Confirme seu e-mail pelo link que enviamos antes de continuar.', '{"confirmar": true}');
  end if;
  if c.tipo <> 'empresa' then return vagas_interno.erro('Esta área é para empresas.'); end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found or not exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = p_user and m.ativo) then
    return vagas_interno.erro('Empresa não encontrada.');
  end if;
  if not exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = p_user and m.ativo and m.papel = 'dono') then
    return vagas_interno.erro('Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.');
  end if;
  if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}'); end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  -- Quem já está na equipe aparece na lista da própria dona/do próprio dono: dizer não revela nada novo.
  if exists (select 1 from public.vagas_empresa_membros m join auth.users u on u.id = m.user_id
              where m.empresa_id = e.id and m.ativo and lower(u.email) = v_email) then
    return vagas_interno.erro('Esta pessoa já faz parte da equipe.');
  end if;
  foreach o in array vagas_interno.origens_de(p_cf, p_xff) loop
    if vagas_interno.contar('equipe_convite_origem', o, interval '1 hour') > 30 then
      return vagas_interno.erro(msg_limite, '{"bloqueado": true}');
    end if;
  end loop;
  if vagas_interno.contar('equipe_convite_empresa', e.id::text, interval '1 day') > 10
     or vagas_interno.contar('equipe_convite_email', md5(e.id::text || ':' || v_email), interval '1 day') > 3 then
    return vagas_interno.erro(msg_limite, '{"bloqueado": true}');
  end if;
  if (select count(*) from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo) >= 20 then
    return vagas_interno.erro('A equipe já tem 20 pessoas. Remova alguém antes de convidar outra.');
  end if;
  if (select count(*) from public.vagas_equipe_convites x where x.empresa_id = e.id and x.status = 'aberto'
        and x.expira_em > now() and x.email <> v_email) >= 20 then
    return vagas_interno.erro('Sua empresa já tem 20 convites abertos. Cancele algum antes de convidar outra pessoa.');
  end if;
  -- Retenção: convite encerrado (aceito, cancelado ou vencido) some 30 dias depois; o registro de moderação fica sem e-mail.
  delete from public.vagas_equipe_convites x
   where (x.status <> 'aberto' and coalesce(x.usado_em, x.encerrado_em, x.criado_em) < now() - interval '30 days')
      or (x.status = 'aberto' and x.expira_em < now() - interval '30 days');
  update public.vagas_equipe_convites set status = 'cancelado', encerrado_em = now()
   where empresa_id = e.id and email = v_email and status = 'aberto';
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.vagas_equipe_convites (empresa_id, email, token_hash, criado_por, expira_em)
  values (e.id, v_email, vagas_interno.token_hash(v_token), p_user, now() + interval '72 hours')
  returning * into cv;
  -- Para onde vai o e-mail (decisão só da função; a tela recebe a mesma resposta em todos os casos).
  select u.id, u.email_confirmed_at is not null, x.tipo, x.status into v_alvo_id, v_alvo_conf, v_alvo_tipo, v_alvo_status
    from auth.users u left join public.vagas_contas x on x.user_id = u.id where lower(u.email) = v_email limit 1;
  v_destino := case
    when v_alvo_id is null then 'nova'
    when v_alvo_tipo = 'empresa' and v_alvo_status <> 'suspensa' and v_alvo_conf then 'empresa'
    when v_alvo_tipo = 'empresa' and v_alvo_status <> 'suspensa' then 'empresa_pendente'
    when v_alvo_tipo in ('pessoa', 'operador') and v_alvo_status <> 'suspensa' then 'outro_tipo'
    else 'nenhum' end;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
  values (e.cidade_id, p_user, 'empresa', 'equipe_convidar', 'empresa', e.id, '', jsonb_build_object('papel', cv.papel));
  return vagas_interno.ok(jsonb_build_object('convite', vagas_interno.equipe_convite_json(cv), 'token', v_token, 'destino', v_destino,
    'empresaNome', e.nome_fantasia, 'cidadeNome', (select x.nome from public.vagas_cidades x where x.id = e.cidade_id),
    'convidadoPor', (select disc_interno.limpar_texto(coalesce(u.raw_user_meta_data ->> 'nome', ''), 120) from auth.users u where u.id = p_user)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Pedidos da frente de operação (painel da equipe e operador.html) — só leitura
-- -----------------------------------------------------------------------------

-- "ana.souza@empresa.com.br" -> "a***@e***.com.br" (igual a mascararEmailVagas da Edge Function e ao mascarar da prévia).
create or replace function vagas_interno.mascarar_email(p text)
returns text language sql immutable set search_path = '' as $$
  select case when lower(btrim(coalesce(p, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+$' then ''
    else left(split_part(lower(btrim(p)), '@', 1), 1) || '***@' || left(split_part(lower(btrim(p)), '@', 2), 1) || '***'
         || coalesce(substring(split_part(lower(btrim(p)), '@', 2) from '(\.[^@]*)$'), '') end;
$$;

-- Resumo das cidades operadas: IGUAL ao da 20261022 + "repassePercentual" em cada cidade — o da linha de quem chama em
-- vagas_operadores (> 0: praça com parceiro, a tela mostra o repasse; 0: operação própria); null para a equipe sem linha.
create or replace function public.vagas_op_resumo()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_cids uuid[] := vagas_interno.cidades_operadas();
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(v_cids) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('cidades', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'nome', c.nome,
      'status', c.status, 'papel', vagas_interno.papel_cidade(c.id),
      'repassePercentual', (select o.repasse_percentual from public.vagas_operadores o
                             where o.user_id = auth.uid() and o.cidade_id = c.id and o.ativo limit 1),
      'contagens', jsonb_build_object(
        'empresasEmAnalise', (select count(*)::int from public.vagas_empresas e where e.cidade_id = c.id and e.status = 'em_analise'),
        'empresasAtivas', (select count(*)::int from public.vagas_empresas e where e.cidade_id = c.id and e.status = 'ativa'),
        'anunciosEmRevisao', (select count(*)::int from public.vagas_anuncios a where a.cidade_id = c.id and a.status = 'em_revisao'),
        'anunciosSuspensos', (select count(*)::int from public.vagas_anuncios a where a.cidade_id = c.id and a.status = 'suspenso'),
        'anunciosNoAr', (select count(*)::int from public.vagas_anuncios a where a.cidade_id = c.id and vagas_interno.no_ar(a)),
        'denunciasAbertas', (select count(*)::int from public.vagas_denuncias d where d.cidade_id = c.id and d.status = 'aberta'),
        'pessoas', (select count(*)::int from public.vagas_pessoas p where c.id in (p.cidade_id, p.cidade2_id)),
        'listaEspera', (select count(*)::int from public.vagas_lista_espera l where l.cidade_id = c.id)))
      order by c.ordem, c.nome)
    from public.vagas_cidades c where c.id = any (v_cids)), '[]'::jsonb)));
end;
$$;

-- Todas as cidades (inclusive rascunho e pausada) com o que o painel da equipe edita, e TODAS as zonas (inclusive as
-- desligadas). Só a equipe.
create or replace function public.vagas_adm_cidades()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('cidades', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nome', c.nome, 'uf', c.uf, 'ibge', c.ibge, 'fuso', c.fuso, 'status', c.status, 'porte', c.porte,
      'praca', (select x.slug from public.vagas_cidades x where x.id = c.praca_id),
      'metaListaEspera', c.meta_lista_espera, 'ordem', c.ordem,
      'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'slug', z.slug, 'nome', z.nome, 'bairros', to_jsonb(z.bairros),
                                   'ordem', z.ordem, 'ativa', z.ativa) order by z.ordem, z.nome)
                           from public.vagas_zonas z where z.cidade_id = c.id), '[]'::jsonb),
      'operadoresAtivos', (select count(*)::int from public.vagas_operadores o where o.cidade_id = c.id and o.ativo))
      order by c.ordem, c.nome)
    from public.vagas_cidades c), '[]'::jsonb)));
end;
$$;

-- Operadores e moderadores (só a equipe). Filtro {cidade?}. E-mail da conta de operação (a equipe convidou), cidade, papel,
-- ativo, repasse, versão do contrato, situação da conta (pendente = ainda não confirmou o e-mail do convite; ativa; suspensa),
-- quando ela aceitou o 1º acesso (contrato da operação) e o último ato registrado na moderação daquela cidade.
create or replace function public.vagas_adm_operadores(p_filtro jsonb)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_slug text := lower(btrim(coalesce(disc_interno.texto(f -> 'cidade'), '')));
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  if v_slug <> '' and not exists (select 1 from public.vagas_cidades c where c.slug = v_slug) then
    return vagas_interno.erro('Cidade não encontrada.');
  end if;
  return vagas_interno.ok(jsonb_build_object('operadores', coalesce((select jsonb_agg(jsonb_build_object(
      'email', coalesce(lower(u.email), ''), 'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
      'papel', o.papel, 'ativo', o.ativo, 'repassePercentual', o.repasse_percentual, 'contratoVersao', o.contrato_versao,
      'contaStatus', case when k.status = 'suspensa' then 'suspensa' when u.email_confirmed_at is null then 'pendente' else 'ativa' end,
      'contratoAceitoEm', disc_interno.iso(k.termos_aceitos_em),
      'criadoEm', disc_interno.iso(o.criado_em),
      'ultimoAto', (select jsonb_build_object('acao', m.acao, 'em', disc_interno.iso(m.em)) from public.vagas_moderacao m
                     where m.ator = o.user_id and m.cidade_id = o.cidade_id order by m.em desc, m.id desc limit 1))
      order by c.ordem, c.nome, o.ativo desc, o.papel, lower(u.email))
    from public.vagas_operadores o
    join public.vagas_cidades c on c.id = o.cidade_id
    left join public.vagas_contas k on k.user_id = o.user_id
    left join auth.users u on u.id = o.user_id
   where v_slug = '' or c.slug = v_slug), '[]'::jsonb)));
end;
$$;

-- Cadastros assistidos ainda PENDENTES (e-mail não confirmado) das cidades operadas — a lateral "Pendentes de confirmação" do
-- cadastro assistido. Filtro {cidade?}. Operador(a) vê só os que ELE(A) criou; equipe vê todos. Moderador(a) não faz cadastro
-- assistido. E-mail MASCARADO: a operação nunca lê contato de pessoa pela API; para mandar o link de novo, a tela pede o
-- e-mail completo (ação "assistido" ou "reenviar" da vagas-conta). Só os últimos 30 dias, até 200, mais novos primeiro.
create or replace function public.vagas_op_assistidos(p_filtro jsonb)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[];
  v_admin boolean := public.e_admin();
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  select coalesce(array_agg(x), array[]::uuid[]) into v_cids from unnest(vagas_interno.cidades_do_filtro(f)) x
   where vagas_interno.papel_cidade(x) in ('admin', 'operador');
  if cardinality(v_cids) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('contas', coalesce((select jsonb_agg(jsonb_build_object(
      'email', vagas_interno.mascarar_email(u.email), 'tipo', y.tipo, 'cidade', y.slug, 'codigoEvento', y.codigo_evento,
      'criadoEm', disc_interno.iso(y.criado_em)) order by y.criado_em desc)
    from (select k.user_id, k.tipo, k.codigo_evento, k.criado_em, c.slug
            from public.vagas_contas k join public.vagas_cidades c on c.id = k.assistida_cidade_id
           where k.status = 'pendente' and k.assistida_por is not null and k.assistida_cidade_id = any (v_cids)
             and k.tipo in ('pessoa', 'empresa') and k.criado_em > now() - interval '30 days'
             and (v_admin or k.assistida_por = auth.uid())
           order by k.criado_em desc limit 200) y
    join auth.users u on u.id = y.user_id
   where u.email_confirmed_at is null), '[]'::jsonb)));
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e permissões do que é novo (o laço da 20261022 não pega o que nasceu depois dela)
-- -----------------------------------------------------------------------------

alter table public.vagas_equipe_convites enable row level security;
-- vagas_equipe_convites: nenhuma política (só as RPCs).

do $$
declare
  papel text;
  f text;
  autenticadas text[] := array['public.vagas_op_indicadores(text)', 'public.vagas_equipe_empresa(uuid)', 'public.vagas_equipe_convite(text)',
    'public.vagas_equipe_convite_aceitar(text)', 'public.vagas_equipe_convite_cancelar(uuid)', 'public.vagas_equipe_remover(uuid, uuid)',
    'public.vagas_adm_cidade_salvar(jsonb)', 'public.vagas_iniciar_tentativa(text)', 'public.vagas_pessoa_salvar(jsonb)',
    'public.vagas_op_resumo()', 'public.vagas_adm_cidades()', 'public.vagas_adm_operadores(jsonb)', 'public.vagas_op_assistidos(jsonb)'];
  publicas text[] := array['public.vagas_lista_espera_entrar(jsonb)', 'public.vagas_lista_espera_sair(jsonb)'];
  servico text[] := array['public.vagas_conta_convite_equipe(uuid, uuid, text, text, text)'];
begin
  execute 'revoke all on public.vagas_equipe_convites from public';
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.vagas_equipe_convites from %I', papel);
      execute format('revoke all on all functions in schema vagas_interno from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.vagas_equipe_convites to service_role';
    execute 'grant execute on all functions in schema vagas_interno to service_role';
  end if;
  execute 'revoke all on all functions in schema vagas_interno from public';
  foreach f in array autenticadas || publicas || servico loop
    execute format('revoke all on function %s from public', f);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach f in array autenticadas || publicas loop execute format('grant execute on function %s to authenticated', f); end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach f in array publicas loop execute format('grant execute on function %s to anon', f); end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: copia a lista da 20261023 e acrescenta a 20 (esta) e a 21 (dados do piloto, 20261024120001).
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
      (21, '20261024120001_vagas_piloto_uruacu', exists (select 1 from public.vagas_cidades c where c.slug = 'uruacu-go'))
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261024120001, 'migracoes', to_jsonb(aplicadas),
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

-- =============================================================================
-- Vagas sem Caos v2 — BANCO, parte 4/4: EQUIPE DA CIDADE ("Revisar depois"), avisos e a migração de dados opcional.
-- Depende das partes 1 a 3. A equipe/operador NUNCA vê pessoa, currículo, contato nem candidatura: nenhuma função daqui lê essas
-- tabelas para devolver dado de pessoa (o aviso a quem se candidatou só grava; a equipe recebe apenas a contagem).
--
-- FUNÇÕES SÓ DE SERVIDOR desta parte (EXECUTE só service_role):
--   vagas_v2_avisos_pendentes_servidor(p_limite int)   -> {ok, avisos:[{id, userId, email, whatsapp, mensagem}]}  (fila de avisos: só leitura)
--   vagas_v2_avisos_marcar_servidor(p_ids uuid[])      -> {ok, marcados}   (marca enviado_em; quem envia é a função de servidor)
--   vagas_v2_migrar_lista_espera_servidor()            -> {ok, migrados, semConta}  (inscritos da lista de espera antiga viram alertas;
--                                                         idempotente; não envia nada; a lista antiga não é apagada)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fila "Revisar depois"
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_item_revisar(a public.vagas_anuncios)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vaga', vagas_interno.v2_vaga_json(a, true) || jsonb_build_object('estado', vagas_interno.v2_estado_vaga(a), 'motivo', nullif(a.status_motivo, '')),
    'empresa', jsonb_build_object('id', e.id, 'nome', e.nome_fantasia, 'cnpj', e.cnpj, 'cnpjFormatado', vagas_interno.formatar_cnpj(e.cnpj),
      'razaoSocial', e.razao_social, 'cidade', c.slug, 'bairro', e.bairro, 'whatsapp', e.whatsapp, 'email', e.email, 'responsavel', e.responsavel,
      'estado', vagas_interno.v2_estado_empresa(e), 'verificada', e.status = 'ativa', 'criadaEm', vagas_interno.v2_iso(e.criado_em),
      'prazoAte', vagas_interno.v2_iso(vagas_interno.v2_prazo_empresa(e)), 'motivoAjuste', nullif(coalesce(nullif(e.verificacao_motivo, ''), e.status_motivo), ''),
      'consultaCnpj', coalesce(e.consulta_cnpj, '{}'::jsonb), 'documentos', vagas_interno.v2_documentos_json(e.id),
      'vagasNoAr', vagas_interno.v2_vagas_no_ar_empresa(e.id)),
    'sinais', a.sinais,
    'denuncias', (select count(*) from public.vagas_denuncias d where d.anuncio_id = a.id and d.alvo in ('anuncio', 'mensagem') and d.status = 'aberta'),
    'denunciasDetalhe', (select coalesce(jsonb_agg(jsonb_build_object('motivo', d.motivo, 'em', vagas_interno.v2_iso(d.criado_em)) order by d.criado_em), '[]'::jsonb)
                           from public.vagas_denuncias d where d.anuncio_id = a.id and d.status = 'aberta'),
    'criadaEm', vagas_interno.v2_iso(coalesce(a.revisar_depois_em, a.criado_em)))
  from public.vagas_empresas e join public.vagas_cidades c on c.id = e.cidade_id where e.id = a.empresa_id;
$$;

create or replace function public.vagas_v2_op_revisar_depois(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_filtro text := coalesce(nullif(disc_interno.texto(d -> 'filtro'), ''), 'todas');
  v_cids uuid[];
  v_lista jsonb;
  v_totais jsonb;
begin
  if auth.uid() is null then return vagas_interno.v2_erro('Sessão expirada. Entre de novo.', 'sessao_expirada'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  if v_filtro not in ('todas', 'empresas', 'editadas', 'sinais', 'seguradas', 'denuncias') then
    return vagas_interno.v2_erro('Filtro inválido.', 'filtro_invalido');
  end if;
  v_cids := vagas_interno.cidades_do_filtro(d);
  select coalesce(jsonb_agg(vagas_interno.v2_item_revisar(a) order by a.segurada desc,
      exists (select 1 from jsonb_array_elements(a.sinais) s where s ->> 'tipo' = 'fraco') desc, coalesce(a.revisar_depois_em, a.criado_em), a.id), '[]'::jsonb) into v_lista
    from public.vagas_anuncios a where a.id = any (array(select x.id from public.vagas_anuncios x
      join public.vagas_empresas e on e.id = x.empresa_id
     where x.cidade_id = any (v_cids) and x.status in ('publicado', 'pausado', 'em_revisao', 'suspenso')
       and ((x.revisar_depois_em is not null and x.revisada_em is null)
            or exists (select 1 from public.vagas_denuncias dn where dn.anuncio_id = x.id and dn.status = 'aberta'))
       and (v_filtro = 'todas'
            or (v_filtro = 'empresas' and e.status = 'em_analise')
            or (v_filtro = 'editadas' and x.editada_em is not null)
            or (v_filtro = 'sinais' and jsonb_array_length(x.sinais) > 0)
            or (v_filtro = 'seguradas' and x.segurada)
            or (v_filtro = 'denuncias' and exists (select 1 from public.vagas_denuncias dn where dn.anuncio_id = x.id and dn.status = 'aberta')))
     order by coalesce(x.revisar_depois_em, x.criado_em), x.id limit 200));
  select jsonb_build_object('total', count(*), 'seguradas', count(*) filter (where a.segurada),
      'comSinais', count(*) filter (where jsonb_array_length(a.sinais) > 0),
      'empresasEmVerificacao', count(distinct a.empresa_id) filter (where e.status = 'em_analise'),
      'denuncias', count(*) filter (where exists (select 1 from public.vagas_denuncias dn where dn.anuncio_id = a.id and dn.status = 'aberta')))
    into v_totais from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id
   where a.cidade_id = any (v_cids) and a.status in ('publicado', 'pausado', 'em_revisao', 'suspenso')
     and ((a.revisar_depois_em is not null and a.revisada_em is null)
          or exists (select 1 from public.vagas_denuncias dn where dn.anuncio_id = a.id and dn.status = 'aberta'));
  return vagas_interno.v2_ok(jsonb_build_object('lista', v_lista, 'totais', v_totais));
end;
$$;

-- Decisão da equipe. "id" é o código da vaga (ou o id da empresa, nas ações da empresa). Tudo vai para vagas_moderacao (só inclusão).
create or replace function public.vagas_v2_op_revisar_decidir(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_acao text := disc_interno.texto(d -> 'acao');
  v_recado text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'recado'), 600);
  v_motivo text := disc_interno.limpar_texto(coalesce(nullif(disc_interno.texto(d -> 'motivo'), ''), v_recado), 300);
  v_id text := btrim(disc_interno.texto(d -> 'id'));
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_aid uuid := vagas_interno.v2_anuncio_id(v_id);
  v_papel text;
begin
  if auth.uid() is null then return vagas_interno.v2_erro('Sessão expirada. Entre de novo.', 'sessao_expirada'); end if;
  if v_acao not in ('verificar_empresa', 'pedir_documento', 'tirar_do_ar', 'suspender_empresa', 'liberar', 'recusar_empresa') then
    return vagas_interno.v2_erro('Ação inválida.', 'acao_invalida');
  end if;
  if v_aid is not null then
    select * into a from public.vagas_anuncios where id = v_aid for update;
    select * into e from public.vagas_empresas where id = a.empresa_id for update;
  else
    select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(v_id) for update;
    if not found then return vagas_interno.v2_erro('Não encontrei a vaga nem a empresa.', 'nao_encontrada'); end if;
  end if;
  v_papel := vagas_interno.papel_cidade(e.cidade_id);
  if v_papel is null then return vagas_interno.v2_erro('Não encontrei a vaga nem a empresa.', 'nao_encontrada'); end if;
  if v_acao in ('verificar_empresa', 'suspender_empresa', 'recusar_empresa') and v_papel = 'moderador' then
    return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao');
  end if;
  if v_acao in ('tirar_do_ar', 'liberar') and a.id is null then return vagas_interno.v2_erro('Informe a vaga.', 'nao_encontrada'); end if;

  if v_acao = 'verificar_empresa' then
    if e.status = 'suspensa' then return vagas_interno.v2_erro('Empresa suspensa: reative antes de verificar.', 'empresa_suspensa'); end if;
    update public.vagas_empresas set status = 'ativa', status_motivo = '', verificacao_estado = 'verificada', verificacao_motivo = '', verificacao_pedida_em = null,
      cnpj_conferido_em = coalesce(cnpj_conferido_em, now()), cnpj_conferido_por = coalesce(cnpj_conferido_por, auth.uid()) where id = e.id returning * into e;
    update public.vagas_anuncios set revisada_em = now() where empresa_id = e.id and revisar_depois_em is not null and revisada_em is null and jsonb_array_length(sinais) = 0;
    perform vagas_interno.registrar(e.cidade_id, v_papel, 'verificar_empresa', 'empresa', e.id, v_motivo, jsonb_build_object('recado', v_recado));
  elsif v_acao = 'pedir_documento' then
    if char_length(v_recado) < 3 then return vagas_interno.v2_erro('Escreva o recado para a empresa: qual documento enviar.', 'recado'); end if;
    if e.status = 'suspensa' then return vagas_interno.v2_erro('Empresa suspensa.', 'empresa_suspensa'); end if;
    update public.vagas_empresas set verificacao_motivo = left(v_recado, 600), verificacao_pedida_em = now() where id = e.id returning * into e;
    perform vagas_interno.registrar(e.cidade_id, v_papel, 'pedir_documento', 'empresa', e.id, v_motivo, jsonb_build_object('recado', v_recado));
  elsif v_acao = 'tirar_do_ar' then
    if char_length(v_recado) < 3 then return vagas_interno.v2_erro('Escreva o motivo e o recado para a empresa.', 'recado'); end if;
    update public.vagas_anuncios set status = 'suspenso', segurada = false, status_motivo = left(v_recado, 300), revisada_em = now() where id = a.id returning * into a;
    update public.vagas_denuncias set status = 'procedente', decidida_por = auth.uid(), decidida_em = now(), decisao_motivo = left(v_recado, 300)
     where anuncio_id = a.id and status = 'aberta';
    perform vagas_interno.registrar(a.cidade_id, v_papel, 'tirar_do_ar', 'anuncio', a.id, v_motivo, jsonb_build_object('recado', v_recado));
  elsif v_acao = 'suspender_empresa' then
    if char_length(v_recado) < 3 then return vagas_interno.v2_erro('Escreva o motivo e o recado para a empresa.', 'recado'); end if;
    update public.vagas_empresas set status = 'suspensa', status_motivo = left(v_recado, 300) where id = e.id returning * into e;
    perform vagas_interno.registrar(e.cidade_id, v_papel, 'suspender_empresa', 'empresa', e.id, v_motivo, jsonb_build_object('recado', v_recado));
  elsif v_acao = 'recusar_empresa' then
    if char_length(v_recado) < 3 then return vagas_interno.v2_erro('Escreva o que a empresa precisa corrigir.', 'recado'); end if;
    if e.status <> 'em_analise' then return vagas_interno.v2_erro('Só dá para recusar uma empresa que ainda não foi verificada.', 'estado_invalido'); end if;
    update public.vagas_empresas set verificacao_estado = 'precisa_ajuste', verificacao_motivo = left(v_recado, 600), status_motivo = left(v_recado, 300)
     where id = e.id returning * into e;
    perform vagas_interno.registrar(e.cidade_id, v_papel, 'recusar_empresa', 'empresa', e.id, v_motivo, jsonb_build_object('recado', v_recado));
  else
    -- liberar: a vaga segurada (ou tirada do ar por engano) vai ao ar; vaga que já está no ar só sai da fila ("revisei, está certa").
    if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa: reative a empresa antes.', 'empresa_suspensa'); end if;
    if a.status in ('em_revisao', 'suspenso') then
      if a.modalidade = 'diaria' and a.data_trabalho < (select vagas_interno.hoje(c.fuso) from public.vagas_cidades c where c.id = a.cidade_id)
         and coalesce(a.extra ->> 'repete', 'false') <> 'true' then
        return vagas_interno.v2_erro('A data da diária já passou.', 'data_passada');
      end if;
      update public.vagas_anuncios set status = 'publicado', segurada = false, status_motivo = '', publicado_em = coalesce(publicado_em, now()),
        expira_em = case when a.status = 'em_revisao' or a.expira_em is null or a.expira_em <= now() then vagas_interno.expira_calculada(a) else expira_em end,
        revisada_em = now() where id = a.id returning * into a;
      update public.vagas_denuncias set status = 'improcedente', decidida_por = auth.uid(), decidida_em = now(),
        decisao_motivo = coalesce(nullif(left(v_recado, 300), ''), 'Vaga devolvida ao ar pela equipe.') where anuncio_id = a.id and alvo in ('anuncio', 'mensagem') and status = 'aberta';
    else
      update public.vagas_anuncios set revisada_em = now() where id = a.id returning * into a;
    end if;
    perform vagas_interno.registrar(a.cidade_id, v_papel, 'liberar_vaga', 'anuncio', a.id, v_motivo, jsonb_build_object('recado', v_recado));
  end if;
  return vagas_interno.v2_ok();
end;
$$;

-- "Avisar quem se candidatou" (vaga de golpe): grava um aviso para cada pessoa que se candidatou; a equipe só recebe a contagem.
create or replace function public.vagas_v2_op_avisar_candidatos(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_msg text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'mensagem'), 600);
  v_n int;
  t jsonb;
begin
  if auth.uid() is null then return vagas_interno.v2_erro('Sessão expirada. Entre de novo.', 'sessao_expirada'); end if;
  select * into a from public.vagas_anuncios where id = vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId')) for update;
  if not found then return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada'); end if;
  v_papel := vagas_interno.papel_cidade(a.cidade_id);
  if v_papel is null then return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if char_length(v_msg) < 10 then return vagas_interno.v2_erro('Escreva a mensagem para quem se candidatou (pelo menos 10 letras).', 'mensagem'); end if;
  t := vagas_interno.conferir_texto(v_msg, 'perfil');
  if t is not null then return vagas_interno.v2_erro('Não ponha link na mensagem. ' || (t ->> 'erro'), 'texto_barrado'); end if;
  if not (a.status in ('suspenso', 'removido') or e.status = 'suspensa' or vagas_interno.v2_estado_empresa(e) = 'precisa_ajuste') then
    return vagas_interno.v2_erro('Tire a vaga do ar (ou suspenda a empresa) antes de avisar quem se candidatou.', 'vaga_no_ar');
  end if;
  insert into public.vagas_avisos_pessoa (user_id, anuncio_id, mensagem)
  select distinct k.pessoa_id, a.id, v_msg from public.vagas_candidaturas k
   where k.anuncio_id = a.id
     and not exists (select 1 from public.vagas_avisos_pessoa w where w.user_id = k.pessoa_id and w.anuncio_id = a.id and w.mensagem = v_msg);
  get diagnostics v_n = row_count;
  perform vagas_interno.registrar(a.cidade_id, v_papel, 'avisar_candidatos', 'anuncio', a.id, '', jsonb_build_object('avisados', v_n));
  return vagas_interno.v2_ok(jsonb_build_object('avisados', v_n));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Servidor: fila de avisos e migração da lista de espera
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_avisos_pendentes_servidor(p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  return vagas_interno.v2_ok(jsonb_build_object('avisos', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'userId', w.user_id,
      'email', coalesce(nullif(ct.email, ''), lower(u.email), ''), 'whatsapp', coalesce(ct.whatsapp, ''), 'mensagem', w.mensagem) order by w.criado_em)
    from (select * from public.vagas_avisos_pessoa x where x.enviado_em is null order by x.criado_em limit greatest(1, least(coalesce(p_limite, 100), 500))) w
    left join public.vagas_pessoa_contato ct on ct.user_id = w.user_id left join auth.users u on u.id = w.user_id), '[]'::jsonb)));
end;
$$;

create or replace function public.vagas_v2_avisos_marcar_servidor(p_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n int;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  update public.vagas_avisos_pessoa set enviado_em = now() where id = any (coalesce(p_ids, array[]::uuid[])) and enviado_em is null;
  get diagnostics v_n = row_count;
  return vagas_interno.v2_ok(jsonb_build_object('marcados', v_n));
end;
$$;

-- Quem está na lista de espera de uma cidade e tem conta de pessoa com o mesmo e-mail ganha um alerta "Avisar quando tiver vaga em <cidade>".
create or replace function public.vagas_v2_migrar_lista_espera_servidor()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n int;
  v_sem int;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  insert into public.vagas_alertas (user_id, cidade, canal, origem)
  select distinct u.id, c.slug, 'email', 'lista_espera'
    from public.vagas_lista_espera l join public.vagas_cidades c on c.id = l.cidade_id
    join auth.users u on lower(u.email) = lower(l.email) join public.vagas_contas ct on ct.user_id = u.id and ct.tipo = 'pessoa' and ct.status <> 'suspensa'
   where l.perfil = 'pessoa'
     and not exists (select 1 from public.vagas_alertas a where a.user_id = u.id and a.cidade = c.slug and a.origem = 'lista_espera');
  get diagnostics v_n = row_count;
  select count(*) into v_sem from public.vagas_lista_espera l
   where l.perfil = 'pessoa' and not exists (select 1 from auth.users u where lower(u.email) = lower(l.email));
  return vagas_interno.v2_ok(jsonb_build_object('migrados', v_n, 'semConta', v_sem));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Permissões
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
  for f in select p.oid::regprocedure as assinatura, p.proname from pg_catalog.pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname like 'vagas\_v2\_%' loop
    execute format('revoke all on function %s from public', f.assinatura);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f.assinatura, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f.assinatura); end if;
    if f.proname !~ '_servidor$' and exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if f.proname in ('vagas_v2_base', 'vagas_v2_vaga', 'vagas_v2_texto_checar') then
      foreach papel in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = papel) then execute format('grant execute on function %s to %I', f.assinatura, papel); end if;
      end loop;
    end if;
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
                                       and to_regprocedure('vagas_interno.conferir_lista(text, text)') is not null),
      (27, '20261101120001_vagas_v2_pessoa', to_regprocedure('public.vagas_v2_eu(jsonb)') is not null
                                       and to_regprocedure('public.vagas_v2_candidatar(jsonb)') is not null),
      (28, '20261101120002_vagas_v2_empresa', to_regprocedure('public.vagas_v2_vaga_publicar(jsonb)') is not null
                                       and to_regprocedure('public.vagas_v2_empresa_criar_servidor(uuid, jsonb)') is not null),
      (29, '20261101120003_vagas_v2_equipe', to_regprocedure('public.vagas_v2_op_revisar_decidir(jsonb)') is not null
                                       and to_regprocedure('public.vagas_v2_op_avisar_candidatos(jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261101120003, 'migracoes', to_jsonb(aplicadas),
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

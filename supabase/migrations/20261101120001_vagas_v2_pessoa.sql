-- =============================================================================
-- Vagas sem Caos v2 — BANCO, parte 2/4: leitura pública e tudo da PESSOA (perfil, currículo, candidatura, conversa, denúncia).
-- Depende da 20261101120000_vagas_v2_base. Forma de cada resposta: vagas/js/v2/contrato.js (um argumento p_dados jsonb, camelCase).
-- Rótulos de tela (tipo, turno, escolaridade) saem do modelo antigo: CLT/Temporário/Diária/Freelancer/Estágio/PJ, Manhã/Tarde/Noite/
-- Comercial/Escala 12x36/Fim de semana; valores em centavos viram reais; o código de 6 letras da vaga é o "id" da vaga na v2.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ajudantes de rótulo e de forma
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_turno_rotulo(p text)
returns text language sql immutable set search_path = '' as $$
  select case p when 'manha' then 'Manhã' when 'tarde' then 'Tarde' when 'noite' then 'Noite' when 'comercial' then 'Comercial'
    when 'escala' then 'Escala 12x36' when 'fim_de_semana' then 'Fim de semana' when 'madrugada' then 'Madrugada'
    when 'a_combinar' then 'A combinar' else coalesce(p, '') end;
$$;

create or replace function vagas_interno.v2_turno_id(p text)
returns text language sql immutable set search_path = '' as $$
  select case vagas_interno.normalizar(p)
    when 'manha' then 'manha' when 'tarde' then 'tarde' when 'noite' then 'noite' when 'comercial' then 'comercial'
    when 'escala 12x36' then 'escala' when 'escala' then 'escala' when 'fim de semana' then 'fim_de_semana' when 'fim_de_semana' then 'fim_de_semana'
    when 'madrugada' then 'madrugada' else null end;
$$;

create or replace function vagas_interno.v2_esc_rotulo(p text)
returns text language sql immutable set search_path = '' as $$
  select case p when 'fundamental_incompleto' then 'Ensino fundamental incompleto' when 'fundamental' then 'Ensino fundamental completo'
    when 'medio_incompleto' then 'Ensino médio incompleto' when 'medio' then 'Ensino médio completo' when 'tecnico' then 'Técnico completo'
    when 'superior_incompleto' then 'Superior em andamento' when 'superior' then 'Superior completo' when 'pos' then 'Pós-graduação'
    else '' end;
$$;

create or replace function vagas_interno.v2_esc_id(p text)
returns text language sql immutable set search_path = '' as $$
  select case vagas_interno.normalizar(p)
    when 'ensino fundamental incompleto' then 'fundamental_incompleto' when 'fundamental incompleto' then 'fundamental_incompleto'
    when 'ensino fundamental completo' then 'fundamental' when 'fundamental completo' then 'fundamental' when 'fundamental' then 'fundamental'
    when 'ensino medio incompleto' then 'medio_incompleto' when 'medio incompleto' then 'medio_incompleto'
    when 'ensino medio completo' then 'medio' when 'medio completo' then 'medio' when 'medio' then 'medio'
    when 'tecnico completo' then 'tecnico' when 'tecnico' then 'tecnico'
    when 'superior em andamento' then 'superior_incompleto' when 'superior incompleto' then 'superior_incompleto'
    when 'superior completo' then 'superior' when 'superior' then 'superior'
    when 'pos graduacao' then 'pos' when 'pos' then 'pos'
    else null end;
$$;

create or replace function vagas_interno.v2_esc_nivel(p text)
returns integer language sql immutable set search_path = '' as $$
  select case p when 'fundamental_incompleto' then 1 when 'fundamental' then 2 when 'medio_incompleto' then 3 when 'medio' then 4
    when 'tecnico' then 5 when 'superior_incompleto' then 5 when 'superior' then 6 when 'pos' then 7 else 0 end;
$$;

create or replace function vagas_interno.v2_tipo_rotulo(a public.vagas_anuncios)
returns text language sql immutable set search_path = '' as $$
  select case when a.extra ->> 'tipoRotulo' = 'PJ' and a.modalidade = 'freelancer' then 'PJ'
    else case a.modalidade when 'clt' then 'CLT' when 'temporario' then 'Temporário' when 'diaria' then 'Diária'
      when 'freelancer' then 'Freelancer' when 'estagio' then 'Estágio' else a.modalidade end end;
$$;

-- Estado da vaga para a tela (STATUS_VAGA do contrato).
create or replace function vagas_interno.v2_status_vaga(a public.vagas_anuncios)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when a.status = 'rascunho' then 'rascunho'
    when a.status = 'em_revisao' then case when a.segurada then 'segurada' else 'revisao' end
    when a.status = 'suspenso' then 'revisao'
    when a.status in ('encerrado', 'removido') then 'encerrada'
    when a.status = 'pausado' then 'pausada'
    when vagas_interno.no_ar(a) then 'aberta'
    else 'vencida' end;
$$;

create or replace function vagas_interno.v2_salario_json(a public.vagas_anuncios)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'min', round(a.valor_min_centavos / 100.0, 2), 'max', round(a.valor_max_centavos / 100.0, 2),
    'periodo', case a.valor_unidade when 'servico' then 'dia' else a.valor_unidade end, 'aCombinar', false,
    'texto', vagas_interno.v2_reais(a.valor_min_centavos)
      || case when a.valor_max_centavos is not null then ' a ' || vagas_interno.v2_reais(a.valor_max_centavos) else '' end
      || case a.valor_unidade when 'mes' then ' por mês' when 'dia' then ' por dia' when 'hora' then ' por hora' else ' por serviço' end,
    'obs', nullif(a.extra ->> 'salarioObs', '')));
$$;

-- A vaga no formato do contrato (VAGA). p_revelar: mostra a empresa de uma vaga confidencial.
create or replace function vagas_interno.v2_vaga_json(a public.vagas_anuncios, p_revelar boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.codigo, 'titulo', a.funcao,
    'empresaId', case when a.confidencial and not p_revelar then 'conf-' || a.codigo else a.empresa_id::text end,
    'setorId', a.area, 'tipo', vagas_interno.v2_tipo_rotulo(a), 'turno', vagas_interno.v2_turno_rotulo(a.turno),
    'horario', coalesce(nullif(a.extra ->> 'horario', ''),
      case when a.modalidade = 'diaria' then 'Dia ' || to_char(a.data_trabalho, 'DD/MM') || ', das ' || to_char(a.hora_inicio, 'HH24:MI') || ' às ' || to_char(a.hora_fim, 'HH24:MI')
           else vagas_interno.v2_turno_rotulo(a.turno) end),
    'salario', vagas_interno.v2_salario_json(a),
    'beneficios', coalesce(a.extra -> 'beneficios', (select coalesce(jsonb_agg(case b when 'vt' then 'Vale-transporte' when 'refeicao' then 'Refeição ou vale-alimentação'
        when 'saude' then 'Plano de saúde' when 'moradia' then 'Moradia' else 'Comissão' end), '[]'::jsonb) from unnest(a.beneficios) b)),
    'requisitos', coalesce(a.extra -> 'requisitos', vagas_interno.requisitos_lista(a.requisitos, a.requisito_outro)),
    'diferenciais', coalesce(a.extra -> 'diferenciais', '[]'::jsonb),
    'descricao', a.descricao,
    'atividades', coalesce(a.extra -> 'atividades', '[]'::jsonb),
    'perguntas', coalesce(a.extra -> 'perguntas', '[]'::jsonb),
    'vagasQtd', a.quantidade, 'semExperiencia', a.experiencia = 'nao_precisa',
    'pcd', coalesce((a.extra ->> 'pcd')::boolean, false), 'urgente', coalesce((a.extra ->> 'urgente')::boolean, false),
    'status', vagas_interno.v2_status_vaga(a), 'cidade', c.slug, 'bairro', coalesce(a.extra ->> 'bairro', ''),
    'publicadaEm', vagas_interno.v2_iso(coalesce(a.publicado_em, a.criado_em)), 'expiraEm', vagas_interno.v2_iso(a.expira_em),
    'repete', coalesce((a.extra ->> 'repete')::boolean, false), 'confidencial', a.confidencial)
    || case when a.modalidade = 'diaria' then jsonb_build_object('diaria', jsonb_build_object('data', to_char(a.data_trabalho, 'YYYY-MM-DD'),
         'das', to_char(a.hora_inicio, 'HH24:MI'), 'as', to_char(a.hora_fim, 'HH24:MI'))) else '{}'::jsonb end
  from public.vagas_cidades c where c.id = a.cidade_id;
$$;

create or replace function vagas_interno.v2_empresa_json(e public.vagas_empresas, p_revelar boolean default true)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_revelar then jsonb_build_object(
    'id', e.id, 'nome', e.nome_fantasia, 'setor', e.setor, 'cidade', c.slug, 'bairro', e.bairro, 'descricao', e.descricao,
    'iniciais', vagas_interno.iniciais(e.nome_fantasia), 'verificada', e.status = 'ativa', 'verificadaEm', vagas_interno.v2_iso(e.cnpj_conferido_em),
    'estado', vagas_interno.v2_estado_empresa(e))
  else jsonb_build_object('id', 'conf', 'nome', 'Empresa confidencial', 'setor', '', 'cidade', c.slug, 'bairro', '', 'descricao', '',
    'iniciais', '', 'verificada', e.status = 'ativa', 'verificadaEm', vagas_interno.v2_iso(e.cnpj_conferido_em), 'estado', vagas_interno.v2_estado_empresa(e)) end
  from public.vagas_cidades c where c.id = e.cidade_id;
$$;

-- Vaga pelo código de 6 letras (o "id" da v2) ou pelo uuid.
create or replace function vagas_interno.v2_anuncio_id(p text)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.vagas_anuncios a
   where a.codigo = upper(btrim(coalesce(p, ''))) or a.id = vagas_interno.v2_uuid(p) limit 1;
$$;

-- Resumo do currículo (só FATOS que a pessoa declarou; nada de nota, idade, estado civil, foto, CPF ou RG).
create or replace function vagas_interno.v2_resumo_pessoa(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'funcao', coalesce(nullif(p.funcao, ''), p.cargos[1], ''), 'cidade', c.slug, 'bairro', coalesce(p.bairro, (select z.nome from public.vagas_zonas z where z.id = p.zona_id), ''),
    'experiencias', coalesce(p.experiencias_v2, (select coalesce(jsonb_agg(jsonb_build_object('cargo', x.funcao, 'empresa', x.empregador,
        'inicio', to_char(x.inicio, 'YYYY-MM'), 'fim', to_char(x.fim, 'YYYY-MM')) order by x.ordem), '[]'::jsonb)
      from public.vagas_experiencias x where x.user_id = p.user_id)),
    'escolaridade', vagas_interno.v2_esc_rotulo(p.escolaridade), 'cursos', to_jsonb(p.cursos), 'cnh', to_jsonb(p.cnh),
    'turnos', coalesce((select jsonb_agg(vagas_interno.v2_turno_rotulo(t) order by i) from unnest(p.turnos) with ordinality u(t, i)), '[]'::jsonb),
    'pretensao', case when p.pretensao_centavos is null then null else round(p.pretensao_centavos / 100.0, 2) end,
    'tempo', coalesce(p.tempo, ''), 'texto', p.sobre, 'resumo', p.sobre)
  from public.vagas_pessoas p join public.vagas_cidades c on c.id = p.cidade_id where p.user_id = p_user;
$$;

create or replace function vagas_interno.v2_arquivo_json(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('nome', k.nome, 'tamanhoKb', k.tamanho_kb, 'tipo', k.tipo, 'enviadoEm', vagas_interno.v2_iso(k.enviado_em))
            from public.vagas_curriculos k where k.user_id = p_user);
$$;

-- Etapa canônica da candidatura (as antigas, sem a coluna nova, são lidas pelo status).
create or replace function vagas_interno.v2_etapa(k public.vagas_candidaturas)
returns text language sql immutable set search_path = '' as $$
  select coalesce(k.etapa, case k.status when 'enviada' then 'nova' when 'conversar' then 'em conversa' when 'combinou' then 'em conversa'
    when 'contratada' then 'contratada' else 'não seguiu' end);
$$;

-- A empresa pode ver nome completo, arquivo e WhatsApp: verificada, ou a pessoa liberou. (Regra 1A.)
create or replace function vagas_interno.v2_empresa_ve_contato(k public.vagas_candidaturas)
returns boolean language sql stable security definer set search_path = '' as $$
  select k.contato_cortado_em is null
    and exists (select 1 from public.vagas_empresas e where e.id = k.empresa_id and e.status = 'ativa')
    or (k.contato_cortado_em is null and k.whatsapp_liberado_em is not null
        and exists (select 1 from public.vagas_empresas e where e.id = k.empresa_id and e.status <> 'suspensa'));
$$;

create or replace function vagas_interno.v2_historico(p_candidatura uuid, p_visao text default 'empresa')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('etapa', h.etapa, 'em', vagas_interno.v2_iso(h.em), 'por', h.por) order by h.id), '[]'::jsonb)
    from public.vagas_candidatura_historico h where h.candidatura_id = p_candidatura;
$$;

create or replace function vagas_interno.v2_entrevista_json(k public.vagas_candidaturas)
returns jsonb language sql immutable set search_path = '' as $$
  select case when k.entrevista is null then null else
    jsonb_build_object('quando', k.entrevista ->> 'quando', 'onde', k.entrevista ->> 'onde',
      'confirmada', case when jsonb_typeof(k.entrevista -> 'confirmada') = 'boolean' then k.entrevista -> 'confirmada' else 'null'::jsonb end,
      'pediuOutro', coalesce((k.entrevista ->> 'pediuOutro')::boolean, false))
    || case when coalesce(k.entrevista ->> 'recado', '') <> '' then jsonb_build_object('recado', k.entrevista ->> 'recado') else '{}'::jsonb end end;
$$;

-- Marca a etapa da candidatura (e o status antigo coerente: NUNCA "combinou", para as RPCs antigas não abrirem o contato).
create or replace function vagas_interno.v2_mudar_etapa(p_candidatura uuid, p_etapa text, p_por text, p_desfazer boolean default false)
returns public.vagas_candidaturas language plpgsql volatile security definer set search_path = '' as $$
declare
  k public.vagas_candidaturas%rowtype;
  v_ant text;
begin
  select * into k from public.vagas_candidaturas where id = p_candidatura for update;
  v_ant := vagas_interno.v2_etapa(k);
  if p_desfazer then
    p_etapa := coalesce(nullif(k.etapa_anterior, ''), 'nova');
    if p_etapa = 'não seguiu' then p_etapa := 'nova'; end if;
  end if;
  if v_ant = p_etapa then return k; end if;
  update public.vagas_candidaturas set
    etapa = p_etapa,
    etapa_anterior = case when p_etapa = 'não seguiu' then v_ant else null end,
    status = case p_etapa when 'nova' then 'enviada' when 'vista' then 'enviada' when 'em conversa' then 'conversar'
      when 'entrevista marcada' then 'conversar' when 'contratada' then 'conversar' else case when p_por = 'pessoa' then 'retirada' else 'agora_nao' end end,
    empresa_decidiu_em = case when p_etapa in ('em conversa', 'entrevista marcada', 'contratada', 'não seguiu') and p_por = 'empresa'
      then coalesce(empresa_decidiu_em, now()) else empresa_decidiu_em end,
    pessoa_decidiu_em = case when p_etapa = 'não seguiu' and p_por = 'pessoa' then now() else pessoa_decidiu_em end,
    visto_em = case when p_etapa <> 'nova' then coalesce(visto_em, now()) else visto_em end,
    conversa_em = case when p_etapa in ('em conversa', 'entrevista marcada', 'contratada') then coalesce(conversa_em, now()) else conversa_em end,
    marcada_em = case when p_etapa = 'entrevista marcada' then now() else marcada_em end,
    contratada_em = case when p_etapa = 'contratada' then coalesce(contratada_em, now()) else contratada_em end,
    empresa_revelada_em = case when p_etapa in ('em conversa', 'entrevista marcada', 'contratada') then coalesce(empresa_revelada_em, now()) else empresa_revelada_em end,
    fim_em = case when p_etapa = 'não seguiu' then now() else null end,
    encerrada_por = case when p_etapa = 'não seguiu' then p_por else null end
   where id = p_candidatura returning * into k;
  insert into public.vagas_candidatura_historico (candidatura_id, etapa, por) values (k.id, p_etapa, p_por);
  return k;
end;
$$;

-- Mensagem do sistema na conversa (cria a conversa se faltar).
create or replace function vagas_interno.v2_aviso_sistema(p_candidatura uuid, p_texto text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.vagas_conversas where candidatura_id = p_candidatura;
  if v_id is null then insert into public.vagas_conversas (candidatura_id) values (p_candidatura) returning id into v_id; end if;
  insert into public.vagas_mensagens (conversa_id, autor, texto) values (v_id, 'sistema', left(p_texto, 1000));
  update public.vagas_conversas set ultima_em = now() where id = v_id;
end;
$$;

-- Texto livre de lista (benefícios, requisitos...): itens limpos, sem repetidos, com limite de itens e de tamanho.
create or replace function vagas_interno.v2_lista(v jsonb, p_max_itens int, p_max_len int)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce((select array_agg(t order by o) from (select t, min(o) o from (
    select disc_interno.limpar_texto(e #>> '{}', p_max_len) as t, o
      from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) with ordinality as x(e, o)
     where jsonb_typeof(e) = 'string') y where t <> '' group by t order by min(o) limit p_max_itens) z), array[]::text[]);
$$;

-- Perfil da pessoa. Cria ou atualiza: o que não vier fica como está. Mínimo para existir: nome, WhatsApp, cidade (e e-mail do login).
create or replace function vagas_interno.v2_perfil_gravar(p_uid uuid, d jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.vagas_pessoas%rowtype;
  ct public.vagas_pessoa_contato%rowtype;
  v_tem_p boolean;
  v_tem_c boolean;
  v_txt text;
  v_n int;
  v_cid public.vagas_cidades%rowtype;
  v_mes date := date_trunc('month', now())::date;
  v_exps jsonb := '[]'::jsonb;
  x jsonb;
  v_ini date;
  v_fim date;
  t jsonb;
  v_lista text[];
  v_turnos text[];
  v_item text;
begin
  select * into p from public.vagas_pessoas where user_id = p_uid;
  v_tem_p := found;
  select * into ct from public.vagas_pessoa_contato where user_id = p_uid;
  v_tem_c := found;
  if not v_tem_p then
    p.user_id := p_uid; p.maior_18 := true; p.cargos := array[]::text[]; p.turnos := array[]::text[]; p.cnh := array[]::text[];
    p.modalidades := array[]::text[]; p.cursos := array[]::text[]; p.areas_interesse := array[]::text[]; p.sobre := '';
  end if;
  if not v_tem_c then ct.user_id := p_uid; ct.nome := ''; ct.whatsapp := ''; ct.email := ''; end if;

  if d ? 'nome' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 120);
    if disc_interno.letras(v_txt) < 2 then return vagas_interno.v2_erro('Informe seu nome.', 'nome_invalido'); end if;
    t := vagas_interno.conferir_texto(v_txt, 'cartao');
    if t is not null then return vagas_interno.v2_erro(t ->> 'erro', 'texto_barrado'); end if;
    ct.nome := v_txt;
  end if;
  if ct.nome = '' then return vagas_interno.v2_erro('Informe seu nome.', 'nome_invalido'); end if;
  if d ? 'whatsapp' then
    v_txt := vagas_interno.normalizar_whatsapp(disc_interno.texto(d -> 'whatsapp'));
    if v_txt !~ '^55[1-9][1-9]9[0-9]{8}$' then
      return vagas_interno.v2_erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).', 'whatsapp_invalido');
    end if;
    ct.whatsapp := v_txt;
  end if;
  if ct.whatsapp = '' then return vagas_interno.v2_erro('Informe seu WhatsApp.', 'whatsapp_invalido'); end if;
  if d ? 'email' and btrim(disc_interno.texto(d -> 'email')) <> '' then
    v_txt := vagas_interno.email(disc_interno.texto(d -> 'email'));
    if v_txt = '' then return vagas_interno.v2_erro('E-mail inválido.', 'email_invalido'); end if;
    ct.email := v_txt;
  elsif ct.email = '' then
    select vagas_interno.email(u.email) into v_txt from auth.users u where u.id = p_uid;
    ct.email := coalesce(v_txt, '');
  end if;

  if d ? 'cidade' then
    select * into v_cid from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade'))) and status in ('ativa', 'lista_espera');
    if not found then return vagas_interno.v2_erro('Escolha a sua cidade.', 'cidade_invalida'); end if;
    if v_tem_p and v_cid.id <> p.cidade_id then p.zona_id := null; end if;
    p.cidade_id := v_cid.id;
  end if;
  if p.cidade_id is null then return vagas_interno.v2_erro('Escolha a sua cidade.', 'cidade_invalida'); end if;
  if d ? 'bairro' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'bairro'), 80);
    p.bairro := nullif(v_txt, '');
  end if;
  if d ? 'funcao' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'funcao'), 80);
    p.funcao := nullif(v_txt, '');
    p.cargos := case when v_txt = '' then array[]::text[] else array[left(v_txt, 60)] end;
  end if;
  if d ? 'tempo' then p.tempo := nullif(disc_interno.limpar_texto(disc_interno.texto(d -> 'tempo'), 40), ''); end if;
  if d ? 'resumo' then
    v_txt := disc_interno.texto(d -> 'resumo');
    if char_length(v_txt) > 600 then return vagas_interno.v2_erro('O resumo pode ter até 600 caracteres.', 'resumo_longo'); end if;
    p.sobre := vagas_interno.limpar_multilinha(v_txt, 600);
  end if;
  if d ? 'escolaridade' then
    v_txt := btrim(disc_interno.texto(d -> 'escolaridade'));
    if v_txt = '' then p.escolaridade := null;
    else
      p.escolaridade := vagas_interno.v2_esc_id(v_txt);
      if p.escolaridade is null then return vagas_interno.v2_erro('Escolaridade inválida.', 'escolaridade_invalida'); end if;
    end if;
  end if;
  if d ? 'cursos' then
    v_lista := vagas_interno.v2_lista(d -> 'cursos', 10, 80);
    p.cursos := v_lista;
  end if;
  if d ? 'cnh' then
    p.cnh := vagas_interno.lista_enum(case when jsonb_typeof(d -> 'cnh') = 'string' then
        (select coalesce(jsonb_agg(substr(c, i, 1)), '[]'::jsonb) from (select upper(d ->> 'cnh') c) q, generate_series(1, char_length(upper(d ->> 'cnh'))) i)
      else d -> 'cnh' end, array['A', 'B', 'C', 'D', 'E']);
  end if;
  if d ? 'turnos' then
    v_turnos := array[]::text[];
    for v_item in select e #>> '{}' from jsonb_array_elements(case when jsonb_typeof(d -> 'turnos') = 'array' then d -> 'turnos' else '[]'::jsonb end) e
                   where jsonb_typeof(e) = 'string' loop
      if vagas_interno.v2_turno_id(v_item) is not null and not (vagas_interno.v2_turno_id(v_item) = any (v_turnos)) then
        v_turnos := v_turnos || vagas_interno.v2_turno_id(v_item);
      end if;
    end loop;
    p.turnos := v_turnos;
  end if;
  if d ? 'pretensao' then
    if jsonb_typeof(d -> 'pretensao') = 'null' or btrim(disc_interno.texto(d -> 'pretensao')) = '' then p.pretensao_centavos := null;
    else
      begin v_n := round((disc_interno.texto(d -> 'pretensao'))::numeric * 100)::int; exception when others then v_n := null; end;
      if v_n is null or v_n < 0 or v_n > 10000000 then return vagas_interno.v2_erro('Pretensão salarial inválida.', 'pretensao_invalida'); end if;
      p.pretensao_centavos := v_n;
    end if;
  end if;
  if d ? 'experiencias' then
    if jsonb_typeof(d -> 'experiencias') <> 'array' or jsonb_array_length(d -> 'experiencias') > 10 then
      return vagas_interno.v2_erro('Informe até 10 experiências.', 'experiencias_invalidas');
    end if;
    for x in select e from jsonb_array_elements(d -> 'experiencias') e loop
      if jsonb_typeof(x) <> 'object' then return vagas_interno.v2_erro('Experiências inválidas.', 'experiencias_invalidas'); end if;
      v_txt := disc_interno.limpar_texto(disc_interno.texto(coalesce(x -> 'cargo', x -> 'funcao')), 80);
      if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe o cargo de cada experiência.', 'experiencias_invalidas'); end if;
      v_ini := vagas_interno.ler_mes(disc_interno.texto(x -> 'inicio'));
      if v_ini is null or v_ini > v_mes then return vagas_interno.v2_erro('Informe o mês de início de cada experiência (AAAA-MM).', 'experiencias_invalidas'); end if;
      v_fim := null;
      if btrim(disc_interno.texto(x -> 'fim')) <> '' then
        v_fim := vagas_interno.ler_mes(disc_interno.texto(x -> 'fim'));
        if v_fim is null or v_fim < v_ini or v_fim > v_mes then return vagas_interno.v2_erro('Mês de saída inválido (AAAA-MM).', 'experiencias_invalidas'); end if;
      end if;
      t := vagas_interno.conferir_texto(v_txt, 'cartao');
      if t is null then t := vagas_interno.conferir_texto(disc_interno.texto(coalesce(x -> 'empresa', x -> 'empregador')), 'perfil'); end if;
      if t is not null then return vagas_interno.v2_erro(t ->> 'erro', 'texto_barrado'); end if;
      v_exps := v_exps || jsonb_build_array(jsonb_build_object('cargo', v_txt,
        'empresa', disc_interno.limpar_texto(disc_interno.texto(coalesce(x -> 'empresa', x -> 'empregador')), 120),
        'inicio', to_char(v_ini, 'YYYY-MM'), 'fim', case when v_fim is null then null else to_char(v_fim, 'YYYY-MM') end));
    end loop;
    p.experiencias_v2 := v_exps;
  end if;

  begin
    insert into public.vagas_pessoas as pp (user_id, cidade_id, zona_id, maior_18, cargos, escolaridade, turnos, cnh, modalidades, pretensao_centavos,
      cursos, areas_interesse, sobre, funcao, bairro, experiencias_v2, tempo)
    values (p_uid, p.cidade_id, p.zona_id, true, p.cargos, p.escolaridade, p.turnos, p.cnh, p.modalidades, p.pretensao_centavos, p.cursos,
      p.areas_interesse, p.sobre, p.funcao, p.bairro, p.experiencias_v2, p.tempo)
    on conflict (user_id) do update set cidade_id = excluded.cidade_id, zona_id = excluded.zona_id, cargos = excluded.cargos,
      escolaridade = excluded.escolaridade, turnos = excluded.turnos, cnh = excluded.cnh, pretensao_centavos = excluded.pretensao_centavos,
      cursos = excluded.cursos, sobre = excluded.sobre, funcao = excluded.funcao, bairro = excluded.bairro,
      experiencias_v2 = excluded.experiencias_v2, tempo = excluded.tempo;
    insert into public.vagas_pessoa_contato as cc (user_id, nome, whatsapp, email) values (p_uid, ct.nome, ct.whatsapp, ct.email)
    on conflict (user_id) do update set nome = excluded.nome, whatsapp = excluded.whatsapp, email = excluded.email, atualizado_em = now();
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when check_violation or not_null_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  return vagas_interno.v2_ok();
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Públicas: base, vaga, textoChecar
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_base(p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  c public.vagas_cidades%rowtype;
  v_raiz uuid;
  v_ids uuid[];
  v_praca jsonb;
  v_cidades jsonb;
  v_vagas jsonb;
  v_empresas jsonb;
begin
  if btrim(disc_interno.texto(d -> 'cidade')) <> '' then
    select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade'))) and status in ('ativa', 'lista_espera');
  end if;
  if c.id is null then
    select * into c from public.vagas_cidades x where x.status in ('ativa', 'lista_espera')
     order by (x.status = 'ativa') desc, (x.praca_id is null) desc, x.ordem, x.nome limit 1;
  end if;
  if c.id is null then
    return vagas_interno.v2_ok(jsonb_build_object('praca', jsonb_build_object('id', '', 'nome', '', 'cidadePrincipal', '', 'uf', '', 'regiao', ''),
      'cidades', '[]'::jsonb, 'setores', (select coalesce(jsonb_agg(jsonb_build_object('id', a.slug, 'nome', a.nome, 'curto', coalesce(a.curto, a.nome),
        'icone', coalesce(a.icone, 'sacola')) order by a.ordem), '[]'::jsonb) from public.vagas_areas a where a.ativa),
      'vagas', '[]'::jsonb, 'empresas', '[]'::jsonb, 'geradoEm', vagas_interno.v2_iso(now())));
  end if;
  v_raiz := coalesce(c.praca_id, c.id);
  select array_agg(x.id) into v_ids from public.vagas_cidades x
   where (x.id = v_raiz or x.praca_id = v_raiz) and x.status in ('ativa', 'lista_espera');
  select jsonb_build_object('id', r.slug, 'nome', r.nome || ' e região', 'cidadePrincipal', r.slug, 'uf', r.uf, 'regiao', r.nome)
    into v_praca from public.vagas_cidades r where r.id = v_raiz;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.slug, 'nome', x.nome, 'uf', x.uf, 'principal', x.id = v_raiz, 'status', x.status,
      'bairros', (select coalesce(jsonb_agg(b order by o), '[]'::jsonb) from (select b, min(o) o from (
          select b, (z.ordem * 1000 + i) o from public.vagas_zonas z, unnest(z.bairros) with ordinality u(b, i) where z.cidade_id = x.id and z.ativa) q
          group by b) w)) order by (x.id = v_raiz) desc, x.ordem, x.nome), '[]'::jsonb)
    into v_cidades from public.vagas_cidades x where x.id = any (v_ids);
  select coalesce(jsonb_agg(vagas_interno.v2_vaga_json(a, false) order by a.publicado_em desc, a.codigo), '[]'::jsonb) into v_vagas
    from public.vagas_anuncios a where a.id = any (array(select x.id from public.vagas_anuncios x where x.cidade_id = any (v_ids) and vagas_interno.no_ar(x)
           order by x.publicado_em desc, x.codigo limit 500));
  select coalesce(jsonb_agg(vagas_interno.v2_empresa_json(e, true) order by e.nome_fantasia), '[]'::jsonb) into v_empresas
    from public.vagas_empresas e
   where exists (select 1 from public.vagas_anuncios x where x.empresa_id = e.id and x.cidade_id = any (v_ids) and not x.confidencial and vagas_interno.no_ar(x));
  -- Vaga confidencial: a empresa fica fora da lista; a vaga aponta para uma empresa genérica "conf-<código>".
  v_empresas := v_empresas || coalesce((select jsonb_agg(vagas_interno.v2_empresa_json(e, false) || jsonb_build_object('id', 'conf-' || a.codigo))
    from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id
   where a.cidade_id = any (v_ids) and a.confidencial and vagas_interno.no_ar(a)), '[]'::jsonb);
  return vagas_interno.v2_ok(jsonb_build_object('praca', v_praca, 'cidades', v_cidades,
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('id', a.slug, 'nome', a.nome, 'curto', coalesce(a.curto, a.nome), 'icone', coalesce(a.icone, 'sacola'))
                                          order by a.ordem), '[]'::jsonb) from public.vagas_areas a where a.ativa),
    'vagas', v_vagas, 'empresas', v_empresas, 'geradoEm', vagas_interno.v2_iso(now())));
end;
$$;

create or replace function public.vagas_v2_vaga(p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_id uuid := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'id'));
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_dono boolean;
begin
  if v_id is null then return vagas_interno.v2_erro('Vaga não encontrada ou já encerrada.', 'nao_encontrada'); end if;
  select * into a from public.vagas_anuncios where id = v_id;
  v_dono := auth.uid() is not null and vagas_interno.membro(a.empresa_id);
  if not vagas_interno.no_ar(a) and not v_dono then return vagas_interno.v2_erro('Vaga não encontrada ou já encerrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_json(a, v_dono),
    'empresa', vagas_interno.v2_empresa_json(e, v_dono or not a.confidencial)
      || case when a.confidencial and not v_dono then jsonb_build_object('id', 'conf-' || a.codigo) else '{}'::jsonb end));
end;
$$;

create or replace function public.vagas_v2_texto_checar(p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_texto text := disc_interno.texto(d -> 'texto');
  v_ctx text := case when disc_interno.texto(d -> 'contexto') = 'conversa' then 'conversa' else 'vaga' end;
  l jsonb;
begin
  if char_length(v_texto) > 6000 then return vagas_interno.v2_erro('Texto longo demais.', 'texto_longo'); end if;
  l := vagas_interno.conferir_lista(v_texto, v_ctx);
  return vagas_interno.v2_ok(jsonb_build_object('passa', jsonb_array_length(l -> 'barra') = 0,
    'barra', (select coalesce(jsonb_agg(jsonb_build_object('trecho', x ->> 'trecho', 'motivo', x ->> 'motivo', 'mensagem', x ->> 'mensagem')), '[]'::jsonb)
                from jsonb_array_elements(l -> 'barra') x),
    'fraco', (select coalesce(jsonb_agg(jsonb_build_object('trecho', x ->> 'trecho', 'motivo', x ->> 'motivo', 'mensagem', x ->> 'mensagem')), '[]'::jsonb)
                from jsonb_array_elements(l -> 'fraco') x),
    'forte', (select coalesce(jsonb_agg(jsonb_build_object('trecho', x ->> 'trecho', 'motivo', x ->> 'motivo', 'mensagem', x ->> 'mensagem')), '[]'::jsonb)
                from jsonb_array_elements(l -> 'forte') x)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Pessoa: eu, perfil, currículo, salvas, escondidas, alertas
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_alerta_json(a public.vagas_alertas)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'funcao', a.funcao, 'setorId', a.setor_id, 'cidade', a.cidade, 'filtros', a.filtros, 'canal', a.canal,
    'criadoEm', vagas_interno.v2_iso(a.criado_em));
$$;

create or replace function vagas_interno.v2_codigos(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(a.codigo), '[]'::jsonb) from public.vagas_anuncios a where a.id = any (p_ids);
$$;

create or replace function vagas_interno.v2_salvas(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(a.codigo order by s.em desc), '[]'::jsonb)
    from public.vagas_salvas s join public.vagas_anuncios a on a.id = s.anuncio_id where s.user_id = p_uid;
$$;

create or replace function vagas_interno.v2_escondidas(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.codigo order by x.em desc), '[]'::jsonb) from (
    select a.codigo, e.em from public.vagas_escondidas e join public.vagas_anuncios a on a.id = e.anuncio_id where e.user_id = p_uid
    union
    select a.codigo, p.em from public.vagas_pulos p join public.vagas_anuncios a on a.id = p.anuncio_id where p.pessoa_id = p_uid
      and not exists (select 1 from public.vagas_escondidas e2 where e2.user_id = p_uid and e2.anuncio_id = p.anuncio_id)) x;
$$;

create or replace function public.vagas_v2_eu(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  c public.vagas_contas%rowtype;
  v_email text;
  v_nome text;
  v_whats text := '';
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  update public.vagas_contas set ultimo_acesso_em = now() where user_id = v_uid returning * into c;
  select u.email, disc_interno.limpar_texto(coalesce(u.raw_user_meta_data ->> 'nome', ''), 120) into v_email, v_nome from auth.users u where u.id = v_uid;
  if c.tipo = 'pessoa' then
    select coalesce(nullif(ct.nome, ''), v_nome), ct.whatsapp into v_nome, v_whats from public.vagas_pessoa_contato ct where ct.user_id = v_uid;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object(
    'conta', jsonb_build_object('id', v_uid, 'nome', coalesce(v_nome, ''), 'whatsapp', coalesce(v_whats, ''), 'email', coalesce(v_email, ''),
      'criadaEm', vagas_interno.v2_iso(c.criado_em), 'tipo', c.tipo),
    'curriculo', jsonb_build_object('arquivo', vagas_interno.v2_arquivo_json(v_uid),
      'dados', coalesce(vagas_interno.v2_resumo_pessoa(v_uid), jsonb_build_object('funcao', '', 'cidade', '', 'bairro', '', 'experiencias', '[]'::jsonb,
        'escolaridade', '', 'cursos', '[]'::jsonb, 'cnh', '[]'::jsonb, 'turnos', '[]'::jsonb, 'pretensao', null, 'tempo', '', 'resumo', ''))),
    'salvas', vagas_interno.v2_salvas(v_uid), 'escondidas', vagas_interno.v2_escondidas(v_uid),
    'alertas', coalesce((select jsonb_agg(vagas_interno.v2_alerta_json(a) order by a.criado_em desc) from public.vagas_alertas a where a.user_id = v_uid), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'mensagem', x.mensagem, 'criadoEm', vagas_interno.v2_iso(x.criado_em),
        'vagaId', (select a.codigo from public.vagas_anuncios a where a.id = x.anuncio_id), 'lido', x.lido_em is not null) order by x.criado_em desc)
      from (select * from public.vagas_avisos_pessoa w where w.user_id = v_uid order by w.criado_em desc limit 10) x), '[]'::jsonb),
    'contadores', jsonb_build_object(
      'candidaturas', (select count(*) from public.vagas_candidaturas k where k.pessoa_id = v_uid),
      'ativas', (select count(*) from public.vagas_candidaturas k where k.pessoa_id = v_uid and vagas_interno.v2_etapa(k) <> 'não seguiu'),
      'naoLidas', coalesce((select sum(vagas_interno.nao_lidas(v.id, 'pessoa')) from public.vagas_conversas v
                              join public.vagas_candidaturas k on k.id = v.candidatura_id where k.pessoa_id = v_uid), 0),
      'salvas', (select count(*) from public.vagas_salvas s where s.user_id = v_uid),
      'escondidas', jsonb_array_length(vagas_interno.v2_escondidas(v_uid)),
      'alertas', (select count(*) from public.vagas_alertas a where a.user_id = v_uid),
      'avisos', (select count(*) from public.vagas_avisos_pessoa w where w.user_id = v_uid and w.lido_em is null))));
end;
$$;

create or replace function public.vagas_v2_perfil_salvar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  return vagas_interno.v2_perfil_gravar(auth.uid(), vagas_interno.v2_dados(p_dados));
end;
$$;

create or replace function public.vagas_v2_curriculo_guardar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  v_uid uuid := auth.uid();
  v_caminho text := btrim(disc_interno.texto(d -> 'caminho'));
  v_nome text := disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 200);
  v_tipo text := lower(btrim(disc_interno.texto(d -> 'tipo')));
  v_kb numeric;
  v_existe boolean := false;
  v_antigo text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_caminho !~ ('^' || v_uid::text || '/[^/]{1,200}$') then
    return vagas_interno.v2_erro('Arquivo inválido: ele precisa estar na sua pasta.', 'arquivo_invalido');
  end if;
  if v_nome = '' then return vagas_interno.v2_erro('Informe o nome do arquivo.', 'arquivo_invalido'); end if;
  if v_tipo not in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    return vagas_interno.v2_erro('Envie o currículo em PDF, Word, JPG, PNG ou HEIC.', 'arquivo_invalido');
  end if;
  begin v_kb := (disc_interno.texto(d -> 'tamanhoKb'))::numeric; exception when others then v_kb := null; end;
  if v_kb is null or v_kb < 0 or v_kb > 10240 then return vagas_interno.v2_erro('O arquivo pode ter até 10 MB.', 'arquivo_grande'); end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into v_existe using 'vagas-curriculos', v_caminho;
  end if;
  if not v_existe then return vagas_interno.v2_erro('Não encontrei o arquivo enviado. Tente enviar de novo.', 'arquivo_ausente'); end if;
  select caminho into v_antigo from public.vagas_curriculos where user_id = v_uid;
  insert into public.vagas_curriculos (user_id, caminho, nome, tamanho_kb, tipo) values (v_uid, v_caminho, v_nome, ceil(v_kb)::int, v_tipo)
  on conflict (user_id) do update set caminho = excluded.caminho, nome = excluded.nome, tamanho_kb = excluded.tamanho_kb, tipo = excluded.tipo, enviado_em = now();
  if v_antigo is not null and v_antigo <> v_caminho and to_regclass('storage.objects') is not null then
    execute 'delete from storage.objects o where o.bucket_id = $1 and o.name = $2' using 'vagas-curriculos', v_antigo;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('arquivo', vagas_interno.v2_arquivo_json(v_uid), 'removido', v_antigo));
end;
$$;

create or replace function public.vagas_v2_curriculo_apagar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  v_uid uuid := auth.uid();
  v_caminho text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  delete from public.vagas_curriculos where user_id = v_uid returning caminho into v_caminho;
  if v_caminho is not null and to_regclass('storage.objects') is not null then
    execute 'delete from storage.objects o where o.bucket_id = $1 and o.name = $2' using 'vagas-curriculos', v_caminho;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('removido', v_caminho));
end;
$$;

create or replace function public.vagas_v2_vaga_salvar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  v_id uuid := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId'));
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_id is null or not exists (select 1 from public.vagas_anuncios a where a.id = v_id and a.status not in ('rascunho', 'removido')) then
    return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada');
  end if;
  if d -> 'salvar' = 'false'::jsonb then
    delete from public.vagas_salvas where user_id = v_uid and anuncio_id = v_id;
  else
    if (select count(*) from public.vagas_salvas where user_id = v_uid) >= 300 then
      return vagas_interno.v2_erro('Você já salvou muitas vagas. Tire algumas da lista para salvar outra.', 'limite');
    end if;
    insert into public.vagas_salvas (user_id, anuncio_id) values (v_uid, v_id) on conflict do nothing;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('salvas', vagas_interno.v2_salvas(v_uid)));
end;
$$;

create or replace function public.vagas_v2_vaga_esconder(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  v_id uuid := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId'));
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_id is null or not exists (select 1 from public.vagas_anuncios a where a.id = v_id and a.status not in ('rascunho', 'removido')) then
    return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada');
  end if;
  if d -> 'esconder' = 'false'::jsonb then
    delete from public.vagas_escondidas where user_id = v_uid and anuncio_id = v_id;
    delete from public.vagas_pulos where pessoa_id = v_uid and anuncio_id = v_id;
  else
    if (select count(*) from public.vagas_escondidas where user_id = v_uid) >= 500 then
      return vagas_interno.v2_erro('Você já escondeu muitas vagas. Mostre algumas de novo para esconder outra.', 'limite');
    end if;
    insert into public.vagas_escondidas (user_id, anuncio_id) values (v_uid, v_id) on conflict do nothing;
    delete from public.vagas_salvas where user_id = v_uid and anuncio_id = v_id;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('escondidas', vagas_interno.v2_escondidas(v_uid)));
end;
$$;

create or replace function public.vagas_v2_alerta_salvar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  v_funcao text := disc_interno.limpar_texto(disc_interno.texto(d -> 'funcao'), 80);
  v_setor text := lower(btrim(disc_interno.texto(d -> 'setorId')));
  v_cidade text := lower(btrim(disc_interno.texto(d -> 'cidade')));
  v_canal text := coalesce(nullif(btrim(disc_interno.texto(d -> 'canal')), ''), 'email');
  v_filtros jsonb := case when jsonb_typeof(d -> 'filtros') = 'object' then d -> 'filtros' else '{}'::jsonb end;
  a public.vagas_alertas%rowtype;
  t jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_funcao = '' and v_setor = '' and v_cidade = '' then return vagas_interno.v2_erro('Escolha uma função, um setor ou uma cidade para o alerta.', 'alerta_vazio'); end if;
  if v_canal not in ('email', 'whatsapp') then return vagas_interno.v2_erro('Canal inválido.', 'canal_invalido'); end if;
  if char_length(v_filtros::text) > 2000 then return vagas_interno.v2_erro('Filtros longos demais.', 'filtros_longos'); end if;
  t := vagas_interno.conferir_texto(v_funcao, 'cartao');
  if t is not null then return vagas_interno.v2_erro(t ->> 'erro', 'texto_barrado'); end if;
  if v_setor <> '' and not exists (select 1 from public.vagas_areas ar where ar.slug = v_setor) then return vagas_interno.v2_erro('Setor inválido.', 'setor_invalido'); end if;
  if v_cidade <> '' and not exists (select 1 from public.vagas_cidades c where c.slug = v_cidade and c.status <> 'rascunho') then
    return vagas_interno.v2_erro('Cidade não encontrada.', 'cidade_invalida');
  end if;
  select * into a from public.vagas_alertas x where x.user_id = v_uid and x.funcao = v_funcao and x.setor_id = v_setor and x.cidade = v_cidade
    and x.canal = v_canal and x.filtros = v_filtros;
  if not found then
    if (select count(*) from public.vagas_alertas where user_id = v_uid) >= 20 then
      return vagas_interno.v2_erro('Você já tem 20 alertas. Apague algum para criar outro.', 'limite');
    end if;
    insert into public.vagas_alertas (user_id, funcao, setor_id, cidade, filtros, canal) values (v_uid, v_funcao, v_setor, v_cidade, v_filtros, v_canal)
    returning * into a;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('alerta', vagas_interno.v2_alerta_json(a),
    'alertas', (select coalesce(jsonb_agg(vagas_interno.v2_alerta_json(x) order by x.criado_em desc), '[]'::jsonb) from public.vagas_alertas x where x.user_id = v_uid)));
end;
$$;

create or replace function public.vagas_v2_alerta_apagar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  delete from public.vagas_alertas where user_id = v_uid and id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id'));
  return vagas_interno.v2_ok(jsonb_build_object('alertas',
    (select coalesce(jsonb_agg(vagas_interno.v2_alerta_json(x) order by x.criado_em desc), '[]'::jsonb) from public.vagas_alertas x where x.user_id = v_uid)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Candidatura (pessoa)
-- -----------------------------------------------------------------------------

-- A candidatura como a PESSOA vê (CANDIDATURA_PESSOA + vaga + empresa).
create or replace function vagas_interno.v2_candidatura_pessoa_json(k public.vagas_candidaturas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', k.id, 'vagaId', a.codigo, 'etapa', vagas_interno.v2_etapa(k), 'criadaEm', vagas_interno.v2_iso(k.criado_em),
    'marcos', jsonb_strip_nulls(jsonb_build_object('enviada', vagas_interno.v2_iso(k.criado_em), 'vista', vagas_interno.v2_iso(k.visto_em),
      'conversa', vagas_interno.v2_iso(k.conversa_em), 'marcada', vagas_interno.v2_iso(k.marcada_em), 'fim', vagas_interno.v2_iso(k.fim_em))),
    'entrevista', vagas_interno.v2_entrevista_json(k), 'encerradaPor', k.encerrada_por,
    'whatsappLiberado', k.whatsapp_liberado_em is not null or e.status = 'ativa', 'empresaVerificada', e.status = 'ativa',
    'naoLidas', coalesce((select vagas_interno.nao_lidas(v.id, 'pessoa') from public.vagas_conversas v where v.candidatura_id = k.id), 0),
    'forma', coalesce(k.forma, 'minimo'), 'respostas', k.respostas, 'mensagem', k.mensagem,
    'vaga', vagas_interno.v2_vaga_json(a, vagas_interno.revelada(k)),
    'empresa', vagas_interno.v2_empresa_json(e, vagas_interno.revelada(k))
      || case when a.confidencial and not vagas_interno.revelada(k) then jsonb_build_object('id', 'conf-' || a.codigo) else '{}'::jsonb end)
  from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id where a.id = k.anuncio_id;
$$;

create or replace function public.vagas_v2_candidatar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  v_uid uuid := auth.uid();
  v_id uuid := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId'));
  v_forma text := disc_interno.texto(d -> 'caminho');
  v_idlocal text := nullif(left(btrim(disc_interno.texto(d -> 'idLocal')), 80), '');
  v_msg text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'mensagem'), 1000);
  v_resp jsonb := '[]'::jsonb;
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  k public.vagas_candidaturas%rowtype;
  r jsonb;
  x jsonb;
  l jsonb;
  v_n int := 0;
  v_txt text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_idlocal is not null then
    select * into k from public.vagas_candidaturas where pessoa_id = v_uid and id_local = v_idlocal;
    if found then
      select * into e from public.vagas_empresas where id = k.empresa_id;
      return vagas_interno.v2_ok(jsonb_build_object('candidaturaId', k.id, 'etapa', vagas_interno.v2_etapa(k),
        'contatoSegue', case when e.status = 'ativa' then 'completo' else 'so_resumo' end, 'duplicado', true));
    end if;
  end if;
  if v_forma not in ('anexo', 'montar', 'minimo') then return vagas_interno.v2_erro('Escolha como enviar o seu currículo.', 'caminho_invalido'); end if;
  if v_id is null then return vagas_interno.v2_erro('Vaga não encontrada ou já encerrada.', 'vaga_indisponivel'); end if;
  select * into a from public.vagas_anuncios where id = v_id;
  if not vagas_interno.no_ar(a) then return vagas_interno.v2_erro('Esta vaga não está mais no ar.', 'vaga_indisponivel'); end if;
  if vagas_interno.membro(a.empresa_id) then return vagas_interno.v2_erro('Esta vaga é da sua empresa.', 'vaga_propria'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;

  if d ? 'dados' and jsonb_typeof(d -> 'dados') = 'object' then
    r := vagas_interno.v2_perfil_gravar(v_uid, d -> 'dados');
    if not (r ->> 'ok')::boolean then return r; end if;
  end if;
  if not exists (select 1 from public.vagas_pessoas p join public.vagas_pessoa_contato ct on ct.user_id = p.user_id where p.user_id = v_uid) then
    return vagas_interno.v2_erro('Informe nome, WhatsApp, e-mail e cidade para se candidatar.', 'perfil_incompleto');
  end if;
  if v_forma = 'anexo' and not exists (select 1 from public.vagas_curriculos c where c.user_id = v_uid) then
    return vagas_interno.v2_erro('Anexe o seu currículo antes de enviar.', 'sem_arquivo');
  end if;
  if v_forma = 'montar' and coalesce((select p.funcao is null and p.experiencias_v2 is null and p.sobre = '' and cardinality(p.cursos) = 0
                                       from public.vagas_pessoas p where p.user_id = v_uid), true) then
    return vagas_interno.v2_erro('Conte um pouco da sua experiência para montar o currículo.', 'curriculo_vazio');
  end if;

  if jsonb_typeof(d -> 'respostas') = 'array' then
    for x in select e2 from jsonb_array_elements(d -> 'respostas') e2 loop
      v_n := v_n + 1;
      exit when v_n > 5;
      if jsonb_typeof(x) = 'string' then
        v_txt := disc_interno.limpar_texto(x #>> '{}', 200);
        v_resp := v_resp || jsonb_build_array(v_txt);
      elsif jsonb_typeof(x) = 'object' then
        v_resp := v_resp || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'pergunta', nullif(disc_interno.limpar_texto(disc_interno.texto(x -> 'pergunta'), 200), ''),
          'resposta', disc_interno.limpar_texto(disc_interno.texto(x -> 'resposta'), 200))));
      elsif jsonb_typeof(x) = 'boolean' then
        v_resp := v_resp || jsonb_build_array(x);
      end if;
    end loop;
    for v_txt in select coalesce(y ->> 'resposta', y #>> '{}') from jsonb_array_elements(v_resp) y loop
      l := vagas_interno.conferir_lista(coalesce(v_txt, ''), 'conversa');
      if jsonb_array_length(l -> 'barra') > 0 then
        return vagas_interno.v2_erro(l -> 'barra' -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', l -> 'barra'));
      end if;
    end loop;
  end if;
  if v_msg <> '' then
    l := vagas_interno.conferir_lista(v_msg, 'conversa');
    if jsonb_array_length(l -> 'barra') > 0 then
      return vagas_interno.v2_erro(l -> 'barra' -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', l -> 'barra'));
    end if;
  end if;

  select * into k from public.vagas_candidaturas where anuncio_id = a.id and pessoa_id = v_uid for update;
  if found then
    if k.status <> 'retirada' then
      return vagas_interno.v2_ok(jsonb_build_object('candidaturaId', k.id, 'etapa', vagas_interno.v2_etapa(k),
        'contatoSegue', case when e.status = 'ativa' then 'completo' else 'so_resumo' end, 'duplicado', true));
    end if;
    update public.vagas_candidaturas set status = 'enviada', etapa = 'nova', etapa_anterior = null, pessoa_decidiu_em = null, fim_em = null,
      encerrada_por = null, forma = v_forma, respostas = v_resp, mensagem = nullif(v_msg, ''), v2 = true, visto_em = null, conversa_em = null,
      marcada_em = null, entrevista = null, whatsapp_liberado_em = null, criado_em = now()
     where id = k.id returning * into k;
    insert into public.vagas_candidatura_historico (candidatura_id, etapa, por) values (k.id, 'nova', 'pessoa');
  else
    if vagas_interno.contar('quero', v_uid::text, interval '1 day') > 30 then
      return vagas_interno.v2_erro('Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.', 'limite_dia');
    end if;
    begin
      insert into public.vagas_candidaturas (anuncio_id, pessoa_id, empresa_id, status, etapa, forma, respostas, mensagem, id_local, v2)
      values (a.id, v_uid, a.empresa_id, 'enviada', 'nova', v_forma, v_resp, nullif(v_msg, ''), v_idlocal, true) returning * into k;
    exception
      when unique_violation then
        select * into k from public.vagas_candidaturas where anuncio_id = a.id and pessoa_id = v_uid;
        return vagas_interno.v2_ok(jsonb_build_object('candidaturaId', k.id, 'etapa', vagas_interno.v2_etapa(k),
          'contatoSegue', case when e.status = 'ativa' then 'completo' else 'so_resumo' end, 'duplicado', true));
    end;
    insert into public.vagas_candidatura_historico (candidatura_id, etapa, por) values (k.id, 'nova', 'pessoa');
  end if;
  delete from public.vagas_pulos where pessoa_id = v_uid and anuncio_id = a.id;
  delete from public.vagas_escondidas where user_id = v_uid and anuncio_id = a.id;
  return vagas_interno.v2_ok(jsonb_build_object('candidaturaId', k.id, 'etapa', 'nova',
    'contatoSegue', case when e.status = 'ativa' then 'completo' else 'so_resumo' end));
end;
$$;

create or replace function public.vagas_v2_candidaturas(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  v_uid uuid := auth.uid();
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  return vagas_interno.v2_ok(jsonb_build_object('lista', coalesce((select jsonb_agg(vagas_interno.v2_candidatura_pessoa_json(k) order by k.criado_em desc)
    from public.vagas_candidaturas k where k.id = any (array(select x.id from public.vagas_candidaturas x where x.pessoa_id = v_uid
      order by x.criado_em desc limit 200))), '[]'::jsonb)));
end;
$$;

create or replace function public.vagas_v2_candidatura_retirar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into k from public.vagas_candidaturas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')) and pessoa_id = auth.uid() for update;
  if not found then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  if vagas_interno.v2_etapa(k) <> 'não seguiu' then
    perform vagas_interno.v2_mudar_etapa(k.id, 'não seguiu', 'pessoa');
    perform vagas_interno.v2_aviso_sistema(k.id, 'A pessoa retirou a candidatura.');
  end if;
  return vagas_interno.v2_ok();
end;
$$;

create or replace function public.vagas_v2_entrevista_responder(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  k public.vagas_candidaturas%rowtype;
  v_acao text := disc_interno.texto(d -> 'acao');
  v_txt text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'texto'), 300);
  l jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into k from public.vagas_candidaturas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')) and pessoa_id = auth.uid() for update;
  if not found then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  if vagas_interno.v2_etapa(k) <> 'entrevista marcada' or k.entrevista is null then
    return vagas_interno.v2_erro('Não há entrevista marcada nesta candidatura.', 'sem_entrevista');
  end if;
  if v_acao not in ('confirmar', 'outro_horario') then return vagas_interno.v2_erro('Ação inválida.', 'acao_invalida'); end if;
  if v_txt <> '' then
    l := vagas_interno.conferir_lista(v_txt, 'conversa');
    if jsonb_array_length(l -> 'barra') > 0 then
      return vagas_interno.v2_erro(l -> 'barra' -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', l -> 'barra'));
    end if;
  end if;
  if v_acao = 'confirmar' then
    update public.vagas_candidaturas set entrevista = k.entrevista || jsonb_build_object('confirmada', true, 'pediuOutro', false) where id = k.id;
    perform vagas_interno.v2_aviso_sistema(k.id, 'A pessoa confirmou a entrevista.');
  else
    update public.vagas_candidaturas set entrevista = k.entrevista || jsonb_build_object('confirmada', false, 'pediuOutro', true, 'pedido', v_txt) where id = k.id;
    perform vagas_interno.v2_aviso_sistema(k.id, 'A pessoa pediu outro horário' || case when v_txt <> '' then ': ' || v_txt else '.' end);
  end if;
  return vagas_interno.v2_ok();
end;
$$;

-- "Liberar meu WhatsApp": a pessoa libera, para ESTA candidatura, nome completo, arquivo e WhatsApp. Até 20 por dia por empresa em verificação.
create or replace function public.vagas_v2_whatsapp_liberar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into k from public.vagas_candidaturas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')) and pessoa_id = auth.uid() for update;
  if not found then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  if vagas_interno.v2_etapa(k) = 'não seguiu' then return vagas_interno.v2_erro('Esta candidatura foi encerrada.', 'encerrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está fora do ar. Não dá para liberar o contato agora.', 'empresa_suspensa'); end if;
  if e.status = 'ativa' or k.whatsapp_liberado_em is not null then return vagas_interno.v2_ok(); end if;
  if vagas_interno.contagem('whatsapp_liberacao', e.id::text, interval '1 day') >= 20 then
    return vagas_interno.v2_erro('Esta empresa já recebeu muitos contatos hoje. Tente de novo amanhã.', 'limite_empresa');
  end if;
  perform vagas_interno.contar('whatsapp_liberacao', e.id::text, interval '1 day');
  update public.vagas_candidaturas set whatsapp_liberado_em = now(), contato_cortado_em = null where id = k.id;
  perform vagas_interno.v2_aviso_sistema(k.id, 'A pessoa liberou o WhatsApp.');
  return vagas_interno.v2_ok();
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Conversa (pessoa e empresa): quem chama é descoberto pelo banco
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_conversa(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  k public.vagas_candidaturas%rowtype;
  v public.vagas_conversas%rowtype;
  v_lado text;
  v_alerta boolean := false;
  v_msgs jsonb;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into k from public.vagas_candidaturas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id'));
  v_lado := vagas_interno.lado(k);
  if v_lado is null then return vagas_interno.v2_erro('Conversa não encontrada.', 'nao_encontrada'); end if;
  select * into v from public.vagas_conversas where candidatura_id = k.id;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if v.id is not null then
    if v_lado = 'pessoa' then update public.vagas_conversas set lida_pessoa_em = now() where id = v.id;
    else update public.vagas_conversas set lida_empresa_em = now() where id = v.id; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'de', case when m.autor = 'sistema' then 'sistema' when m.autor = v_lado then 'eu' else 'ela' end,
        'txt', m.texto, 'ts', vagas_interno.v2_iso(m.criado_em)) order by m.criado_em, m.id), '[]'::jsonb) into v_msgs
      from public.vagas_mensagens m where m.conversa_id = v.id;
    select exists (select 1 from public.vagas_mensagens m where m.conversa_id = v.id and m.autor not in ('sistema', v_lado)
                    and (jsonb_array_length(vagas_interno.conferir_lista(m.texto, 'conversa') -> 'fraco') > 0)) into v_alerta;
  else
    v_msgs := '[]'::jsonb;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('mensagens', v_msgs, 'alertaGolpe', v_alerta, 'lado', v_lado,
    'podeEscrever', case when v_lado = 'pessoa' then v.id is not null and vagas_interno.v2_etapa(k) <> 'não seguiu'
                         else vagas_interno.v2_etapa(k) <> 'não seguiu' and vagas_interno.v2_estado_empresa(e) <> 'suspensa' end,
    'etapa', vagas_interno.v2_etapa(k)));
end;
$$;

create or replace function public.vagas_v2_mensagem_enviar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  v public.vagas_conversas%rowtype;
  m public.vagas_mensagens%rowtype;
  v_lado text;
  v_texto text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'texto'), 2000);
  v_mid text := nullif(left(btrim(disc_interno.texto(d -> 'mid')), 80), '');
  l jsonb;
  v_estado text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into k from public.vagas_candidaturas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'id'));
  v_lado := vagas_interno.lado(k);
  if v_lado is null then return vagas_interno.v2_erro('Conversa não encontrada.', 'nao_encontrada'); end if;
  select * into v from public.vagas_conversas where candidatura_id = k.id for update;
  if v_mid is not null and v.id is not null then
    select * into m from public.vagas_mensagens where conversa_id = v.id and mid = v_mid;
    if found then
      return vagas_interno.v2_ok(jsonb_build_object('mensagem', jsonb_build_object('id', m.id, 'de', 'eu', 'txt', m.texto, 'ts', vagas_interno.v2_iso(m.criado_em)), 'duplicado', true));
    end if;
  end if;
  if v_texto = '' then return vagas_interno.v2_erro('Escreva a mensagem.', 'texto_vazio'); end if;
  if char_length(v_texto) > 1000 then return vagas_interno.v2_erro('A mensagem pode ter até 1.000 caracteres.', 'texto_longo'); end if;
  l := vagas_interno.conferir_lista(v_texto, 'conversa');
  if jsonb_array_length(l -> 'barra') > 0 then
    return vagas_interno.v2_erro(l -> 'barra' -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', l -> 'barra'));
  end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  v_estado := vagas_interno.v2_estado_empresa(e);
  if vagas_interno.v2_etapa(k) = 'não seguiu' then return vagas_interno.v2_erro('Esta conversa foi encerrada.', 'encerrada'); end if;
  if v_lado = 'empresa' then
    if v_estado = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
    if v.id is not null and v.empresa_seguidas >= 3 then
      return vagas_interno.v2_erro('Espere a pessoa responder antes de mandar outra mensagem.', 'aguardar');
    end if;
    if vagas_interno.contar('msg_empresa', k.empresa_id::text, interval '1 day') > (case when v_estado = 'verificada' then 300 else 100 end) then
      return vagas_interno.v2_erro('Muitas mensagens hoje. Tente de novo amanhã.', 'limite_dia');
    end if;
    if v.id is null then insert into public.vagas_conversas (candidatura_id, criada_por) values (k.id, v_uid) returning * into v; end if;
    if vagas_interno.v2_etapa(k) in ('nova', 'vista') then perform vagas_interno.v2_mudar_etapa(k.id, 'em conversa', 'empresa'); end if;
  else
    if v.id is null then return vagas_interno.v2_erro('A empresa ainda não abriu uma conversa.', 'sem_conversa'); end if;
    if vagas_interno.contar('msg_pessoa', v_uid::text, interval '1 day') > 100 then
      return vagas_interno.v2_erro('Muitas mensagens hoje. Tente de novo amanhã.', 'limite_dia');
    end if;
  end if;
  begin
    insert into public.vagas_mensagens (conversa_id, autor, autor_user, texto, mid) values (v.id, v_lado, v_uid, v_texto, v_mid) returning * into m;
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when unique_violation then
      select * into m from public.vagas_mensagens where conversa_id = v.id and mid = v_mid;
      return vagas_interno.v2_ok(jsonb_build_object('mensagem', jsonb_build_object('id', m.id, 'de', 'eu', 'txt', m.texto, 'ts', vagas_interno.v2_iso(m.criado_em)), 'duplicado', true));
  end;
  if v_lado = 'empresa' then
    update public.vagas_conversas set ultima_em = now(), empresa_seguidas = empresa_seguidas + 1, lida_empresa_em = now(), status = 'aberta' where id = v.id;
  else
    update public.vagas_conversas set ultima_em = now(), empresa_seguidas = 0, lida_pessoa_em = now() where id = v.id;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('mensagem', jsonb_build_object('id', m.id, 'de', 'eu', 'txt', m.texto, 'ts', vagas_interno.v2_iso(m.criado_em)),
    'alerta', jsonb_array_length(l -> 'fraco') > 0));
end;
$$;

create or replace function public.vagas_v2_quem_viu(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  return vagas_interno.v2_ok(jsonb_build_object('lista', coalesce((select jsonb_agg(jsonb_build_object('empresa', x.empresa_nome, 'vaga', x.anuncio_titulo,
      'em', vagas_interno.v2_iso(x.em), 'o', x.tipo_acesso) order by x.em desc, x.id desc)
    from (select * from public.vagas_acessos_contato l where l.pessoa_id = auth.uid() order by l.em desc, l.id desc limit 100) x), '[]'::jsonb)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Denunciar (exige login; 2 contas diferentes derrubam a vaga de empresa em verificação, 3 a de empresa verificada)
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_denunciar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta(null);
  v_uid uuid := auth.uid();
  v_motivo text := disc_interno.texto(d -> 'motivo');
  v_detalhe text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'detalhe'), 600);
  v_mid uuid := vagas_interno.v2_uuid(disc_interno.texto(d -> 'mensagemId'));
  v_kid uuid := vagas_interno.v2_uuid(disc_interno.texto(d -> 'candidaturaId'));
  v_aid uuid := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId'));
  a public.vagas_anuncios%rowtype;
  m public.vagas_mensagens%rowtype;
  v public.vagas_conversas%rowtype;
  k public.vagas_candidaturas%rowtype;
  v_status_antes text;
  v_emp_antes text;
  v_derrubou boolean;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  if v_motivo not in ('cobranca', 'documento', 'falsa', 'dados_errados', 'discriminacao', 'outro', 'golpe', 'ofensa', 'contato') then
    return vagas_interno.v2_erro('Escolha o motivo da denúncia.', 'motivo_invalido');
  end if;
  if vagas_interno.contar('denuncia_conta', v_uid::text, interval '1 day') > 20 then
    return vagas_interno.v2_erro('Muitas denúncias em pouco tempo. Tente de novo amanhã.', 'limite_dia');
  end if;
  if v_mid is not null then
    select * into m from public.vagas_mensagens where id = v_mid;
    if not found then return vagas_interno.v2_erro('Mensagem não encontrada.', 'nao_encontrada'); end if;
    select * into v from public.vagas_conversas where id = m.conversa_id;
    select * into k from public.vagas_candidaturas where id = v.candidatura_id;
    if not ((k.pessoa_id = v_uid and m.autor = 'empresa') or (m.autor = 'pessoa' and vagas_interno.membro(k.empresa_id))) then
      return vagas_interno.v2_erro('Mensagem não encontrada.', 'nao_encontrada');
    end if;
    select * into a from public.vagas_anuncios where id = k.anuncio_id;
    if exists (select 1 from public.vagas_denuncias x where x.alvo = 'mensagem' and x.mensagem_id = m.id and x.autor = v_uid) then
      return vagas_interno.v2_ok(jsonb_build_object('derrubou', false, 'recebida', true, 'duplicado', true));
    end if;
    select a.status, (select e.status from public.vagas_empresas e where e.id = a.empresa_id) into v_status_antes, v_emp_antes;
    insert into public.vagas_denuncias (alvo, anuncio_id, mensagem_id, conversa_id, autor, conta_no_limite, motivo, detalhe, texto_denunciado, autor_mensagem, autor_mensagem_user)
    values ('mensagem', k.anuncio_id, m.id, v.id, v_uid, true, v_motivo, v_detalhe, left(m.texto, 1000), m.autor, m.autor_user);
  else
    if v_aid is null and v_kid is not null then
      select * into k from public.vagas_candidaturas where id = v_kid;
      if found and vagas_interno.lado(k) is not null then v_aid := k.anuncio_id; end if;
    end if;
    if v_aid is null then return vagas_interno.v2_erro('Vaga não encontrada ou já encerrada.', 'nao_encontrada'); end if;
    select * into a from public.vagas_anuncios where id = v_aid;
    if a.status in ('rascunho', 'removido') then return vagas_interno.v2_erro('Vaga não encontrada ou já encerrada.', 'nao_encontrada'); end if;
    if vagas_interno.membro(a.empresa_id) then return vagas_interno.v2_erro('Esta vaga é da sua empresa.', 'vaga_propria'); end if;
    if exists (select 1 from public.vagas_denuncias x where x.alvo = 'anuncio' and x.anuncio_id = a.id and x.autor = v_uid) then
      return vagas_interno.v2_ok(jsonb_build_object('derrubou', false, 'recebida', true, 'duplicado', true));
    end if;
    select a.status, (select e.status from public.vagas_empresas e where e.id = a.empresa_id) into v_status_antes, v_emp_antes;
    insert into public.vagas_denuncias (alvo, anuncio_id, autor, conta_no_limite, motivo, detalhe) values ('anuncio', a.id, v_uid, true, v_motivo, v_detalhe);
  end if;
  select (x.status <> 'publicado' and v_status_antes = 'publicado')
         or ((select e.status from public.vagas_empresas e where e.id = x.empresa_id) = 'suspensa' and v_emp_antes <> 'suspensa')
    into v_derrubou from public.vagas_anuncios x where x.id = a.id;
  return vagas_interno.v2_ok(jsonb_build_object('derrubou', coalesce(v_derrubou, false), 'recebida', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Permissões: todas autenticadas; base, vaga e textoChecar também anônimas
-- -----------------------------------------------------------------------------

revoke all on all functions in schema vagas_interno from public;
do $$
declare
  papel text;
  f record;
  anonimas text[] := array['vagas_v2_base', 'vagas_v2_vaga', 'vagas_v2_texto_checar'];
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
    if f.proname = any (anonimas) and exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', f.assinatura);
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
                                       and to_regprocedure('public.vagas_v2_candidatar(jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261101120001, 'migracoes', to_jsonb(aplicadas),
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

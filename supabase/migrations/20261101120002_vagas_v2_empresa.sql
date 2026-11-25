-- =============================================================================
-- Vagas sem Caos v2 — BANCO, parte 3/4: EMPRESA (cadastro em verificação, vagas, candidatos, chamar, entrevista, equipe, verificação)
-- e as funções SÓ de servidor. Depende da 20261101120000 e da 20261101120001.
--
-- Regra 1A da visão da empresa: empresa VERIFICADA recebe nome completo + currículo (arquivo) + WhatsApp juntos e chama com 1 toque;
-- empresa EM VERIFICAÇÃO vê só o primeiro nome e o resumo; arquivo e WhatsApp só depois que a pessoa libera ("Liberar meu WhatsApp").
-- A equipe/operador NUNCA lê pessoa, currículo, contato nem candidatura (nenhuma função da parte 4 toca nessas tabelas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ajudantes
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_empresa_dona_json(e public.vagas_empresas, p_papel text default 'dono')
returns jsonb language sql stable security definer set search_path = '' as $$
  select vagas_interno.v2_empresa_json(e, true) || jsonb_build_object(
    'papel', p_papel, 'cnpj', e.cnpj, 'cnpjFormatado', vagas_interno.formatar_cnpj(e.cnpj), 'razaoSocial', e.razao_social,
    'nomeFantasia', e.nome_fantasia, 'whatsapp', e.whatsapp, 'email', e.email, 'responsavel', e.responsavel, 'lojas', e.lojas,
    'prazoAte', case when vagas_interno.v2_estado_empresa(e) in ('em_verificacao', 'vencida') then vagas_interno.v2_iso(e.verificacao_prazo_em) else null end,
    'motivoAjuste', nullif(coalesce(nullif(e.verificacao_motivo, ''), e.status_motivo), ''));
$$;

create or replace function vagas_interno.v2_estado_vaga(a public.vagas_anuncios)
returns text language sql stable security definer set search_path = '' as $$
  select case a.status
    when 'rascunho' then 'rascunho'
    when 'em_revisao' then case when a.segurada then 'revisao_rapida' else 'em_revisao' end
    when 'suspenso' then 'suspensa'
    when 'removido' then 'removida'
    when 'pausado' then 'pausada'
    when 'encerrado' then 'encerrada'
    else case when vagas_interno.no_ar(a) then 'no_ar'
              when a.expira_em <= now() and coalesce(a.extra ->> 'repete', 'false') <> 'true' then 'expirada'
              else 'fora_do_ar' end end;
$$;

create or replace function vagas_interno.v2_limites_empresa(e public.vagas_empresas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('noAr', vagas_interno.v2_vagas_no_ar_empresa(e.id),
    'maxNoAr', case when e.status = 'ativa' then null else 3 end,
    'hoje', vagas_interno.contagem('anuncio_novo', e.id::text, interval '1 day'),
    'maxHoje', case when e.status = 'ativa' then 30 else 3 end);
$$;

-- Vaga para quem é da empresa: VAGA + estado, candidatos, novos, motivo e sinais.
create or replace function vagas_interno.v2_vaga_da_empresa_json(a public.vagas_anuncios)
returns jsonb language sql stable security definer set search_path = '' as $$
  select vagas_interno.v2_vaga_json(a, true) || jsonb_build_object(
    'estado', vagas_interno.v2_estado_vaga(a),
    'candidatos', (select count(*) from public.vagas_candidaturas k where k.anuncio_id = a.id and vagas_interno.v2_etapa(k) <> 'não seguiu'),
    'novos', (select count(*) from public.vagas_candidaturas k where k.anuncio_id = a.id and vagas_interno.v2_etapa(k) = 'nova'),
    'motivo', nullif(a.status_motivo, ''));
$$;

create or replace function vagas_interno.v2_registrar_acesso(k public.vagas_candidaturas, p_tipo text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.vagas_empresas%rowtype;
  a public.vagas_anuncios%rowtype;
begin
  if exists (select 1 from public.vagas_acessos_contato l where l.candidatura_id = k.id and l.user_id = auth.uid()
              and l.tipo_acesso = p_tipo and l.em > now() - interval '10 minutes') then
    return;
  end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  insert into public.vagas_acessos_contato (candidatura_id, pessoa_id, empresa_id, empresa_nome, anuncio_titulo, user_id, papel, tipo_acesso)
  values (k.id, k.pessoa_id, k.empresa_id, left(e.nome_fantasia, 120), left(a.funcao, 80), auth.uid(),
    (select m.papel from public.vagas_empresa_membros m where m.empresa_id = k.empresa_id and m.user_id = auth.uid()), p_tipo);
end;
$$;

-- A candidatura como a EMPRESA vê (CANDIDATO_EMPRESA). Nada de nota, idade, estado civil, foto, CPF ou RG.
create or replace function vagas_interno.v2_candidato_json(k public.vagas_candidaturas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', k.id, 'vagaId', a.codigo, 'etapa', vagas_interno.v2_etapa(k), 'criadaEm', vagas_interno.v2_iso(k.criado_em), 'visto', k.visto_em is not null,
    'nome', case when vagas_interno.v2_empresa_ve_contato(k) then ct.nome else split_part(ct.nome, ' ', 1) end,
    'nomeCompleto', vagas_interno.v2_empresa_ve_contato(k),
    'resumo', vagas_interno.v2_resumo_pessoa(k.pessoa_id),
    'arquivo', case when vagas_interno.v2_empresa_ve_contato(k) then (select jsonb_build_object('nome', c.nome, 'tamanhoKb', c.tamanho_kb, 'tipo', c.tipo)
                                                                       from public.vagas_curriculos c where c.user_id = k.pessoa_id) else null end,
    'whatsapp', case when vagas_interno.v2_empresa_ve_contato(k) then ct.whatsapp else null end,
    'whatsappLiberado', vagas_interno.v2_empresa_ve_contato(k),
    'forma', coalesce(k.forma, 'minimo'), 'respostas', k.respostas, 'mensagem', k.mensagem,
    'entrevista', vagas_interno.v2_entrevista_json(k), 'historico', vagas_interno.v2_historico(k.id),
    'naoLidas', coalesce((select vagas_interno.nao_lidas(v.id, 'empresa') from public.vagas_conversas v where v.candidatura_id = k.id), 0))
  from public.vagas_anuncios a, public.vagas_pessoa_contato ct where a.id = k.anuncio_id and ct.user_id = k.pessoa_id;
$$;

-- Verifica nome/lista de textos de uma vaga e devolve os trechos barrados (com o campo de onde vieram).
create or replace function vagas_interno.v2_barrar(p_campo text, p_texto text, p_acum jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select p_acum || coalesce((select jsonb_agg(jsonb_build_object('campo', p_campo, 'trecho', x ->> 'trecho', 'motivo', x ->> 'motivo', 'mensagem', x ->> 'mensagem'))
    from jsonb_array_elements(vagas_interno.conferir_lista(p_texto, 'vaga') -> 'barra') x), '[]'::jsonb);
$$;

-- Lê e valida a vaga da v2 (sobre a vaga atual, se houver: o que não vier fica como está). Devolve {ok, campos, extra} ou erro.
create or replace function vagas_interno.v2_ler_vaga(p_vaga jsonb, p_empresa public.vagas_empresas, p_atual public.vagas_anuncios)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_vaga);
  b jsonb;
  v_titulo text;
  v_area text;
  v_tipo text;
  v_mod text;
  v_turno text;
  v_horario text;
  v_sal jsonb;
  v_min int;
  v_max int;
  v_per text;
  v_obs text;
  v_desc text;
  v_ben text[]; v_req text[]; v_dif text[]; v_ati text[]; v_per2 text[];
  v_qtd int;
  v_cidade uuid;
  v_fuso text;
  v_hoje date;
  v_bairro text;
  v_repete boolean;
  v_pcd boolean;
  v_diaria jsonb;
  v_data date;
  v_hi time;
  v_hf time;
  v_horas int;
  v_conf boolean;
  v_barra jsonb := '[]'::jsonb;
  v_txt text;
  v_extra jsonb;
  v_norm text;
  i int;
  x text;
begin
  b := case when p_atual.id is null then '{}'::jsonb else vagas_interno.v2_vaga_json(p_atual, true) end;
  d := b || d;
  if jsonb_typeof(p_vaga -> 'salario') = 'object' then d := d || jsonb_build_object('salario', p_vaga -> 'salario'); end if;

  v_titulo := disc_interno.limpar_texto(disc_interno.texto(d -> 'titulo'), 60);
  if char_length(v_titulo) < 2 then return vagas_interno.v2_erro('Informe o título da vaga (ex.: Atendente).', 'titulo'); end if;
  v_area := lower(btrim(disc_interno.texto(d -> 'setorId')));
  if not exists (select 1 from public.vagas_areas ar where ar.slug = v_area and ar.ativa) then
    return vagas_interno.v2_erro('Escolha o setor da vaga.', 'setor');
  end if;
  v_tipo := vagas_interno.normalizar(disc_interno.texto(d -> 'tipo'));
  v_mod := case v_tipo when 'clt' then 'clt' when 'carteira assinada' then 'clt' when 'temporario' then 'temporario' when 'diaria' then 'diaria'
    when 'freelancer' then 'freelancer' when 'por servico' then 'freelancer' when 'estagio' then 'estagio' when 'pj' then 'freelancer' else null end;
  if v_mod is null then return vagas_interno.v2_erro('Escolha o tipo da vaga: carteira assinada, temporário, diária, por serviço, estágio ou PJ.', 'tipo'); end if;

  -- Salário: sempre um valor (nunca "a combinar").
  v_sal := case when jsonb_typeof(d -> 'salario') = 'object' then d -> 'salario' else '{}'::jsonb end;
  if v_sal -> 'aCombinar' = 'true'::jsonb or disc_interno.texto(v_sal -> 'min') = '' then
    return vagas_interno.v2_erro('Informe o salário. A vaga precisa mostrar o valor: não vale "a combinar".', 'salario_obrigatorio');
  end if;
  begin v_min := round((disc_interno.texto(v_sal -> 'min'))::numeric * 100)::int; exception when others then v_min := null; end;
  if v_min is null or v_min < 100 or v_min > 10000000 then return vagas_interno.v2_erro('Valor do salário inválido. Confira o número.', 'salario_invalido'); end if;
  v_max := null;
  if disc_interno.texto(v_sal -> 'max') <> '' then
    begin v_max := round((disc_interno.texto(v_sal -> 'max'))::numeric * 100)::int; exception when others then v_max := null; end;
    if v_max is null or v_max > 10000000 or v_max < v_min then return vagas_interno.v2_erro('O valor máximo da faixa não pode ser menor que o mínimo.', 'salario_invalido'); end if;
    if v_max = v_min then v_max := null; end if;
  end if;
  v_per := lower(btrim(disc_interno.texto(v_sal -> 'periodo')));
  if v_per = '' then v_per := case v_mod when 'diaria' then 'dia' else 'mes' end; end if;
  if not ((v_mod in ('clt', 'temporario', 'estagio') and v_per in ('mes', 'hora')) or (v_mod = 'diaria' and v_per = 'dia')
          or (v_mod = 'freelancer' and v_per in ('mes', 'dia', 'hora', 'servico'))) then
    return vagas_interno.v2_erro('O período do valor não combina com o tipo da vaga.', 'salario_periodo');
  end if;
  v_obs := disc_interno.limpar_texto(disc_interno.texto(v_sal -> 'obs'), 120);

  v_desc := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'descricao'), 1600);
  if char_length(v_desc) > 1500 then return vagas_interno.v2_erro('A descrição pode ter até 1.500 caracteres.', 'descricao'); end if;
  if char_length(v_desc) < 40 then return vagas_interno.v2_erro('Descreva a vaga em pelo menos 40 caracteres.', 'descricao'); end if;
  v_horario := disc_interno.limpar_texto(disc_interno.texto(d -> 'horario'), 160);
  v_ben := vagas_interno.v2_lista(d -> 'beneficios', 12, 90);
  v_req := vagas_interno.v2_lista(d -> 'requisitos', 12, 90);
  v_dif := vagas_interno.v2_lista(d -> 'diferenciais', 8, 90);
  v_ati := vagas_interno.v2_lista(d -> 'atividades', 10, 110);
  v_per2 := vagas_interno.v2_lista(d -> 'perguntas', 2, 120);
  begin v_qtd := coalesce(vagas_interno.inteiro(d -> 'vagasQtd'), 1); exception when others then v_qtd := 1; end;
  if v_qtd < 1 or v_qtd > 100 then return vagas_interno.v2_erro('Quantidade de vagas inválida (1 a 100).', 'quantidade'); end if;

  v_cidade := p_empresa.cidade_id;
  if btrim(disc_interno.texto(d -> 'cidade')) <> '' then
    select c.id into v_cidade from public.vagas_cidades c where c.slug = lower(btrim(disc_interno.texto(d -> 'cidade'))) and c.status in ('ativa', 'lista_espera');
    if v_cidade is null then return vagas_interno.v2_erro('Cidade não encontrada.', 'cidade'); end if;
  end if;
  select c.fuso into v_fuso from public.vagas_cidades c where c.id = v_cidade;
  v_hoje := vagas_interno.hoje(v_fuso);
  v_bairro := disc_interno.limpar_texto(disc_interno.texto(d -> 'bairro'), 80);
  v_repete := coalesce(d -> 'repete' = 'true'::jsonb, false);
  v_conf := coalesce(d -> 'confidencial' = 'true'::jsonb, false);
  if v_conf and p_empresa.status <> 'ativa' then
    return vagas_interno.v2_erro('Vaga confidencial só para empresa verificada.', 'confidencial_so_verificada');
  end if;

  v_data := null; v_hi := null; v_hf := null; v_horas := null;
  if v_mod = 'diaria' then
    v_diaria := case when jsonb_typeof(d -> 'diaria') = 'object' then d -> 'diaria' else '{}'::jsonb end;
    v_txt := btrim(disc_interno.texto(v_diaria -> 'data'));
    if v_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then begin v_data := v_txt::date; exception when others then v_data := null; end; end if;
    v_txt := btrim(disc_interno.texto(v_diaria -> 'das'));
    v_hi := case when v_txt ~ '^([01]?[0-9]|2[0-3])$' then (v_txt || ':00')::time when v_txt ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_txt::time else null end;
    v_txt := btrim(disc_interno.texto(v_diaria -> 'as'));
    v_hf := case when v_txt ~ '^([01]?[0-9]|2[0-3])$' then (v_txt || ':00')::time when v_txt ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_txt::time else null end;
    if v_data is null or v_hi is null or v_hf is null then
      return vagas_interno.v2_erro('Na diária, informe o dia, a hora de começar e a hora de terminar.', 'diaria');
    end if;
    if v_data < v_hoje and not (v_repete and p_atual.id is not null) then return vagas_interno.v2_erro('A data da diária já passou. Escolha outra data.', 'data_passada'); end if;
    if v_data > v_hoje + 7 then return vagas_interno.v2_erro('A diária precisa ser para os próximos 7 dias.', 'data_longe'); end if;
    v_turno := coalesce(vagas_interno.v2_turno_id(disc_interno.texto(d -> 'turno')),
      case when v_hi < time '12:00' then 'manha' when v_hi < time '18:00' then 'tarde' else 'noite' end);
    if v_horario = '' or not (p_vaga ? 'horario' and disc_interno.texto(p_vaga -> 'horario') <> '') then
      v_horario := 'Dia ' || to_char(v_data, 'DD/MM') || ', das ' || to_char(v_hi, 'HH24:MI') || ' às ' || to_char(v_hf, 'HH24:MI');
    end if;
  else
    v_repete := false;
    v_turno := vagas_interno.v2_turno_id(disc_interno.texto(d -> 'turno'));
    if v_turno is null then return vagas_interno.v2_erro('Escolha o turno da vaga.', 'turno'); end if;
  end if;
  if v_mod = 'estagio' then
    begin v_horas := coalesce(vagas_interno.inteiro(d -> 'horasDia'), 6); exception when others then v_horas := 6; end;
    if v_horas < 1 or v_horas > 6 then v_horas := 6; end if;
  end if;

  -- Filtro de texto (contexto "vaga"): tudo o que a pessoa vai ler.
  v_barra := vagas_interno.v2_barrar('titulo', v_titulo, v_barra);
  v_barra := vagas_interno.v2_barrar('descricao', v_desc, v_barra);
  v_barra := vagas_interno.v2_barrar('horario', v_horario, v_barra);
  v_barra := vagas_interno.v2_barrar('bairro', v_bairro, v_barra);
  v_barra := vagas_interno.v2_barrar('salario', v_obs, v_barra);
  foreach x in array v_ben loop v_barra := vagas_interno.v2_barrar('beneficios', x, v_barra); end loop;
  foreach x in array v_req loop v_barra := vagas_interno.v2_barrar('requisitos', x, v_barra); end loop;
  foreach x in array v_dif loop v_barra := vagas_interno.v2_barrar('diferenciais', x, v_barra); end loop;
  foreach x in array v_ati loop v_barra := vagas_interno.v2_barrar('atividades', x, v_barra); end loop;
  foreach x in array v_per2 loop v_barra := vagas_interno.v2_barrar('perguntas', x, v_barra); end loop;
  if jsonb_array_length(v_barra) > 0 then
    return vagas_interno.v2_erro(v_barra -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', v_barra));
  end if;

  -- "A vaga também é para pessoa com deficiência" vira o selo PcD.
  v_norm := ' ' || vagas_interno.normalizar(v_desc || ' ' || v_titulo || ' ' || array_to_string(v_dif || v_req || v_ati, ' ')) || ' ';
  v_pcd := coalesce(d -> 'pcd' = 'true'::jsonb, false) or v_norm ~ ' (?:pcd|pessoas? com deficiencia) ';

  v_extra := jsonb_strip_nulls(jsonb_build_object(
    'horario', nullif(v_horario, ''), 'beneficios', to_jsonb(v_ben), 'requisitos', to_jsonb(v_req), 'diferenciais', to_jsonb(v_dif),
    'atividades', to_jsonb(v_ati), 'perguntas', to_jsonb(v_per2), 'pcd', v_pcd, 'urgente', coalesce(d -> 'urgente' = 'true'::jsonb, false),
    'repete', v_repete, 'bairro', nullif(v_bairro, ''), 'salarioObs', nullif(v_obs, ''),
    'tipoRotulo', case when v_tipo = 'pj' then 'PJ' else null end));
  return vagas_interno.v2_ok(jsonb_build_object('campos', jsonb_build_object(
    'area', v_area, 'funcao', v_titulo, 'modalidade', v_mod, 'descricao', v_desc, 'turno', v_turno, 'fimDeSemana', v_turno = 'fim_de_semana',
    'inicio', case when v_mod = 'diaria' then 'data' else 'imediato' end, 'inicioData', v_data,
    'experiencia', case when coalesce(d -> 'semExperiencia' = 'true'::jsonb, false) then 'nao_precisa' else 'ajuda' end,
    'quantidade', v_qtd, 'valorMin', v_min, 'valorMax', v_max, 'unidade', v_per, 'data', v_data, 'horaInicio', v_hi, 'horaFim', v_hf,
    'horasDia', v_horas, 'prazoHoras', case when v_mod = 'diaria' then 168 else null end, 'diasNoAr', 30,
    'cidadeId', v_cidade, 'confidencial', v_conf), 'extra', v_extra));
end;
$$;

create or replace function vagas_interno.v2_gravar_vaga(p_id uuid, p_empresa uuid, f jsonb, p_extra jsonb, p_autor uuid, p_id_local text)
returns public.vagas_anuncios language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
begin
  if p_id is null then
    insert into public.vagas_anuncios (empresa_id, cidade_id, area, funcao, modalidade, descricao, turno, fim_de_semana, inicio, inicio_data, experiencia,
      horas_dia, prazo_horas, quantidade, valor_min_centavos, valor_max_centavos, valor_unidade, data_trabalho, hora_inicio, hora_fim, dias_no_ar,
      confidencial, criado_por, extra, id_local)
    values (p_empresa, (f ->> 'cidadeId')::uuid, f ->> 'area', f ->> 'funcao', f ->> 'modalidade', f ->> 'descricao', f ->> 'turno', (f ->> 'fimDeSemana')::boolean,
      f ->> 'inicio', (f ->> 'inicioData')::date, f ->> 'experiencia', (f ->> 'horasDia')::int, (f ->> 'prazoHoras')::int, (f ->> 'quantidade')::int,
      (f ->> 'valorMin')::int, (f ->> 'valorMax')::int, f ->> 'unidade', (f ->> 'data')::date, (f ->> 'horaInicio')::time, (f ->> 'horaFim')::time,
      (f ->> 'diasNoAr')::int, (f ->> 'confidencial')::boolean, p_autor, p_extra, p_id_local)
    returning * into a;
  else
    update public.vagas_anuncios set cidade_id = (f ->> 'cidadeId')::uuid, area = f ->> 'area', funcao = f ->> 'funcao', modalidade = f ->> 'modalidade',
      descricao = f ->> 'descricao', turno = f ->> 'turno', fim_de_semana = (f ->> 'fimDeSemana')::boolean, inicio = f ->> 'inicio',
      inicio_data = (f ->> 'inicioData')::date, experiencia = f ->> 'experiencia', horas_dia = (f ->> 'horasDia')::int,
      prazo_horas = (f ->> 'prazoHoras')::int, quantidade = (f ->> 'quantidade')::int, valor_min_centavos = (f ->> 'valorMin')::int,
      valor_max_centavos = (f ->> 'valorMax')::int, valor_unidade = f ->> 'unidade', data_trabalho = (f ->> 'data')::date,
      hora_inicio = (f ->> 'horaInicio')::time, hora_fim = (f ->> 'horaFim')::time, confidencial = (f ->> 'confidencial')::boolean, extra = p_extra
     where id = p_id returning * into a;
  end if;
  return a;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Empresa: minhas empresas, salvar
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_minhas_empresas(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.v2_conta('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  return vagas_interno.v2_ok(jsonb_build_object('empresas', coalesce((select jsonb_agg(vagas_interno.v2_empresa_dona_json(e, m.papel) order by e.nome_fantasia)
    from public.vagas_empresa_membros m join public.vagas_empresas e on e.id = m.empresa_id where m.user_id = auth.uid() and m.ativo), '[]'::jsonb)));
end;
$$;

create or replace function public.vagas_v2_empresa_salvar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
  v_txt text;
  v_zona uuid;
  t jsonb;
  x jsonb;
  v_lojas jsonb := null;
  v_estado text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId')) for update;
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if not vagas_interno.membro(e.id, true) then return vagas_interno.v2_erro('Só quem é dono(a) da conta da empresa pode alterar estes dados.', 'so_dono'); end if;
  v_estado := vagas_interno.v2_estado_empresa(e);
  if v_estado = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if d ? 'nomeFantasia' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'nomeFantasia'), 120);
    if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe o nome da empresa.', 'nome'); end if;
    e.nome_fantasia := v_txt;
  end if;
  if d ? 'setor' then e.setor := disc_interno.limpar_texto(disc_interno.texto(d -> 'setor'), 80); end if;
  if d ? 'descricao' then
    v_txt := disc_interno.texto(d -> 'descricao');
    if char_length(v_txt) > 800 then return vagas_interno.v2_erro('A descrição pode ter até 800 caracteres.', 'descricao'); end if;
    e.descricao := vagas_interno.limpar_multilinha(v_txt, 800);
  end if;
  if d ? 'bairro' then e.bairro := disc_interno.limpar_texto(disc_interno.texto(d -> 'bairro'), 80); end if;
  if d ? 'whatsapp' then
    v_txt := btrim(disc_interno.texto(d -> 'whatsapp'));
    if v_txt = '' then e.whatsapp := '';
    else
      e.whatsapp := vagas_interno.normalizar_whatsapp(v_txt);
      if e.whatsapp !~ '^55[1-9][1-9][0-9]{8,9}$' then return vagas_interno.v2_erro('WhatsApp da empresa inválido.', 'whatsapp'); end if;
    end if;
  end if;
  if d ? 'email' then
    v_txt := btrim(disc_interno.texto(d -> 'email'));
    e.email := case when v_txt = '' then '' else vagas_interno.email(v_txt) end;
    if v_txt <> '' and e.email = '' then return vagas_interno.v2_erro('E-mail da empresa inválido.', 'email'); end if;
  end if;
  if d ? 'lojas' then
    if jsonb_typeof(d -> 'lojas') <> 'array' or jsonb_array_length(d -> 'lojas') > 10 then return vagas_interno.v2_erro('Informe até 10 lojas.', 'lojas'); end if;
    v_lojas := '[]'::jsonb;
    for x in select l from jsonb_array_elements(d -> 'lojas') l loop
      if jsonb_typeof(x) <> 'object' then return vagas_interno.v2_erro('Lojas inválidas.', 'lojas'); end if;
      v_txt := disc_interno.limpar_texto(disc_interno.texto(x -> 'nome'), 80);
      if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe o nome de cada loja.', 'lojas'); end if;
      t := coalesce(vagas_interno.conferir_texto(v_txt, 'cartao'), vagas_interno.conferir_texto(disc_interno.texto(x -> 'bairro'), 'cartao'));
      if t is not null then return vagas_interno.v2_erro(t ->> 'erro', 'texto_barrado'); end if;
      v_lojas := v_lojas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', coalesce(nullif(left(btrim(disc_interno.texto(x -> 'id')), 40), ''), 'l' || (jsonb_array_length(v_lojas) + 1)),
        'nome', v_txt, 'bairro', nullif(disc_interno.limpar_texto(disc_interno.texto(x -> 'bairro'), 80), ''),
        'cidade', nullif(disc_interno.limpar_texto(disc_interno.texto(x -> 'cidade'), 60), ''))));
    end loop;
    e.lojas := v_lojas;
  end if;
  -- Enquanto não estiver verificada, dá para corrigir CNPJ e razão social.
  if d ? 'cnpj' or d ? 'razaoSocial' then
    if e.status = 'ativa' then return vagas_interno.v2_erro('A empresa já foi verificada: CNPJ e razão social não mudam mais. Fale com a equipe.', 'ja_verificada'); end if;
    if d ? 'razaoSocial' then
      v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'razaoSocial'), 160);
      if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe a razão social.', 'razao'); end if;
      e.razao_social := v_txt;
    end if;
    if d ? 'cnpj' then
      v_txt := vagas_interno.normalizar_cnpj(disc_interno.texto(d -> 'cnpj'));
      if not vagas_interno.cnpj_valido(v_txt) then return vagas_interno.v2_erro('CNPJ inválido. Confira os números.', 'cnpj'); end if;
      if v_txt <> e.cnpj and exists (select 1 from public.vagas_empresas o where o.cnpj = v_txt) then
        return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
      end if;
      e.cnpj := v_txt;
    end if;
  end if;
  begin
    update public.vagas_empresas set nome_fantasia = e.nome_fantasia, setor = e.setor, descricao = e.descricao, bairro = e.bairro, whatsapp = e.whatsapp,
      email = e.email, lojas = e.lojas, cnpj = e.cnpj, razao_social = e.razao_social where id = e.id returning * into e;
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when unique_violation then return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
    when check_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  return vagas_interno.v2_ok(jsonb_build_object('empresa', vagas_interno.v2_empresa_dona_json(e, 'dono')));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Vagas da empresa
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_vaga_publicar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  v_uid uuid := auth.uid();
  e public.vagas_empresas%rowtype;
  a public.vagas_anuncios%rowtype;
  v_idlocal text := nullif(left(btrim(disc_interno.texto(d -> 'idLocal')), 80), '');
  r jsonb;
  v_max int;
  v_estado text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId')) for update;
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  v_estado := vagas_interno.v2_estado_empresa(e);
  if v_estado = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if v_idlocal is not null then
    select * into a from public.vagas_anuncios where empresa_id = e.id and id_local = v_idlocal;
    if found then
      return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(a),
        'estado', case vagas_interno.v2_estado_vaga(a) when 'no_ar' then 'no_ar' when 'revisao_rapida' then 'revisao_rapida' else 'rascunho' end,
        'mensagens', '[]'::jsonb, 'duplicado', true));
    end if;
  end if;
  r := vagas_interno.v2_ler_vaga(d -> 'vaga', e, null);
  if not (r ->> 'ok')::boolean then return r; end if;
  v_max := case when e.status = 'ativa' then 30 else 3 end;
  if vagas_interno.contagem('anuncio_novo', e.id::text, interval '1 day') >= v_max then
    return vagas_interno.v2_erro('Hoje já foram criadas ' || v_max || ' vagas desta empresa. Tente de novo amanhã.', 'limite_dia');
  end if;
  begin
    a := vagas_interno.v2_gravar_vaga(null, e.id, r -> 'campos', r -> 'extra', v_uid, v_idlocal);
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when check_violation or not_null_violation or foreign_key_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  perform vagas_interno.contar('anuncio_novo', e.id::text, interval '1 day');
  perform vagas_interno.contar('anuncio_novo_hora', e.id::text, interval '1 hour');
  r := vagas_interno.v2_publicar_interno(a.id);
  if r ? 'erro' then return vagas_interno.v2_erro(r ->> 'erro', r ->> 'codigo'); end if;
  select * into a from public.vagas_anuncios where id = a.id;
  return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(a), 'estado', r ->> 'estado', 'mensagens', r -> 'mensagens'));
end;
$$;

create or replace function public.vagas_v2_vaga_editar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  r jsonb;
  v_sinais jsonb;
  v_forte boolean;
  v_verificada boolean;
  v_no_ar boolean;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into a from public.vagas_anuncios where id = vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'id')) for update;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada'); end if;
  if a.status = 'removido' then return vagas_interno.v2_erro('Esta vaga foi removida pela equipe e não pode ser editada.', 'removida'); end if;
  if a.status = 'suspenso' then return vagas_interno.v2_erro('Esta vaga está fora do ar, aguardando a equipe.', 'suspensa'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  r := vagas_interno.v2_ler_vaga(d -> 'vaga', e, a);
  if not (r ->> 'ok')::boolean then return r; end if;
  begin
    a := vagas_interno.v2_gravar_vaga(a.id, e.id, r -> 'campos', r -> 'extra', auth.uid(), null);
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when check_violation or not_null_violation or foreign_key_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  v_verificada := e.status = 'ativa';
  v_no_ar := a.status = 'publicado';
  if a.status in ('publicado', 'pausado') then
    v_sinais := vagas_interno.v2_sinais_vaga(a, e);
    v_forte := exists (select 1 from jsonb_array_elements(v_sinais) s where s ->> 'tipo' = 'forte');
    if v_forte then
      update public.vagas_anuncios set status = 'em_revisao', segurada = true, sinais = v_sinais, revisar_depois_em = now(), revisada_em = null, editada_em = now()
       where id = a.id returning * into a;
      insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
      values (a.cidade_id, null, 'sistema', 'segurar_vaga', 'anuncio', a.id, 'Sinal forte depois de editar: revisão rápida.');
    else
      -- Editar vaga no ar de empresa em verificação (ou com sinal fraco) manda a vaga para o topo de "Revisar depois".
      update public.vagas_anuncios set sinais = v_sinais, editada_em = now(),
        revisar_depois_em = case when not v_verificada or exists (select 1 from jsonb_array_elements(v_sinais) s where s ->> 'tipo' = 'fraco') then now() else revisar_depois_em end,
        revisada_em = case when not v_verificada or exists (select 1 from jsonb_array_elements(v_sinais) s where s ->> 'tipo' = 'fraco') then null else revisada_em end
       where id = a.id returning * into a;
    end if;
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(a),
    'estado', case vagas_interno.v2_estado_vaga(a) when 'no_ar' then 'no_ar' when 'revisao_rapida' then 'revisao_rapida' else 'rascunho' end));
end;
$$;

create or replace function public.vagas_v2_vaga_acao(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  a public.vagas_anuncios%rowtype;
  n public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_acao text := disc_interno.texto(d -> 'acao');
  v_estado text;
  v_max int;
  r jsonb;
  v_copia jsonb;
  v_hoje date;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into a from public.vagas_anuncios where id = vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'id')) for update;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id for update;
  v_estado := vagas_interno.v2_estado_empresa(e);
  if a.status in ('suspenso', 'removido') then return vagas_interno.v2_erro('Esta vaga está fora do ar pela equipe.', 'fora_do_ar'); end if;
  if v_acao in ('retomar', 'reabrir', 'renovar', 'publicar', 'duplicar') and v_estado <> 'verificada' and v_estado <> 'em_verificacao' then
    return vagas_interno.v2_erro('Esta empresa não pode anunciar agora. Veja a verificação da empresa.', 'empresa_' || v_estado);
  end if;
  if v_acao = 'pausar' then
    if a.status <> 'publicado' then return vagas_interno.v2_erro('Só dá para pausar uma vaga que está no ar.', 'estado_invalido'); end if;
    update public.vagas_anuncios set status = 'pausado' where id = a.id returning * into a;
  elsif v_acao = 'retomar' then
    if a.status <> 'pausado' then return vagas_interno.v2_erro('Só dá para retomar uma vaga pausada.', 'estado_invalido'); end if;
    if a.expira_em <= now() and coalesce(a.extra ->> 'repete', 'false') <> 'true' then return vagas_interno.v2_erro('O prazo desta vaga acabou. Use "Deixar mais 30 dias no ar".', 'prazo'); end if;
    if e.status <> 'ativa' and vagas_interno.v2_vagas_no_ar_empresa(e.id, a.id) >= 3 then
      return vagas_interno.v2_erro('Sua empresa está em verificação e pode ter 3 vagas no ar. Pause ou encerre outra para retomar esta.', 'limite_no_ar');
    end if;
    update public.vagas_anuncios set status = 'publicado' where id = a.id returning * into a;
  elsif v_acao = 'encerrar' then
    if a.status <> 'encerrado' then update public.vagas_anuncios set status = 'encerrado', encerrado_em = now() where id = a.id returning * into a; end if;
  elsif v_acao in ('reabrir', 'renovar') then
    if a.status = 'rascunho' or a.status = 'em_revisao' then return vagas_interno.v2_erro('Esta vaga ainda não foi publicada.', 'estado_invalido'); end if;
    if a.modalidade = 'diaria' and coalesce(a.extra ->> 'repete', 'false') <> 'true' then
      return vagas_interno.v2_erro('Para outra data, duplique a diária e escolha o novo dia.', 'diaria');
    end if;
    if a.status <> 'publicado' and e.status <> 'ativa' and vagas_interno.v2_vagas_no_ar_empresa(e.id, a.id) >= 3 then
      return vagas_interno.v2_erro('Sua empresa está em verificação e pode ter 3 vagas no ar. Pause ou encerre outra primeiro.', 'limite_no_ar');
    end if;
    if v_acao = 'renovar' then
      -- "Deixar mais 30 dias no ar": soma 30 dias ao prazo (no máximo 60 dias a partir de hoje).
      update public.vagas_anuncios set status = 'publicado', encerrado_em = null,
        expira_em = least(greatest(coalesce(expira_em, now()), now()) + interval '30 days', now() + interval '60 days')
       where id = a.id returning * into a;
    else
      update public.vagas_anuncios set status = 'publicado', encerrado_em = null, expira_em = vagas_interno.expira_calculada(a)
       where id = a.id returning * into a;
    end if;
  elsif v_acao = 'publicar' then
    if a.status <> 'rascunho' then return vagas_interno.v2_erro('Só dá para publicar um rascunho.', 'estado_invalido'); end if;
    r := vagas_interno.v2_publicar_interno(a.id);
    if r ? 'erro' then return vagas_interno.v2_erro(r ->> 'erro', r ->> 'codigo'); end if;
    select * into a from public.vagas_anuncios where id = a.id;
    return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(a), 'estado', r ->> 'estado', 'mensagens', r -> 'mensagens'));
  elsif v_acao = 'duplicar' then
    v_max := case when e.status = 'ativa' then 30 else 3 end;
    if vagas_interno.contagem('anuncio_novo', e.id::text, interval '1 day') >= v_max then
      return vagas_interno.v2_erro('Hoje já foram criadas ' || v_max || ' vagas desta empresa. Tente de novo amanhã.', 'limite_dia');
    end if;
    v_copia := vagas_interno.v2_vaga_json(a, true) || jsonb_build_object('titulo', left(a.funcao, 60));
    if a.modalidade = 'diaria' then
      v_hoje := vagas_interno.hoje((select c.fuso from public.vagas_cidades c where c.id = a.cidade_id));
      v_copia := jsonb_set(v_copia, '{diaria,data}', to_jsonb(to_char(least(greatest(a.data_trabalho, v_hoje + 1), v_hoje + 7), 'YYYY-MM-DD')));
      v_copia := v_copia - 'horario';
    end if;
    r := vagas_interno.v2_ler_vaga(v_copia, e, null);
    if not (r ->> 'ok')::boolean then
      -- Vaga antiga com data de diária vencida: a cópia nasce sem data válida; quem edita escolhe o novo dia.
      return r;
    end if;
    n := vagas_interno.v2_gravar_vaga(null, e.id, r -> 'campos', r -> 'extra', auth.uid(), null);
    perform vagas_interno.contar('anuncio_novo', e.id::text, interval '1 day');
    perform vagas_interno.contar('anuncio_novo_hora', e.id::text, interval '1 hour');
    return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(n)));
  else
    return vagas_interno.v2_erro('Ação inválida.', 'acao_invalida');
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('vaga', vagas_interno.v2_vaga_da_empresa_json(a)));
end;
$$;

create or replace function public.vagas_v2_vagas_da_empresa(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId'));
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  return vagas_interno.v2_ok(jsonb_build_object(
    'vagas', coalesce((select jsonb_agg(vagas_interno.v2_vaga_da_empresa_json(a) order by a.criado_em desc)
      from public.vagas_anuncios a where a.id = any (array(select x.id from public.vagas_anuncios x
        where x.empresa_id = e.id and x.status <> 'removido' order by x.criado_em desc limit 300))), '[]'::jsonb),
    'empresa', vagas_interno.v2_empresa_dona_json(e, (select m.papel from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = auth.uid())),
    'limites', vagas_interno.v2_limites_empresa(e)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Candidatos (regra 1A) e chamar
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_candidatura_da_empresa(p_id uuid)
returns public.vagas_candidaturas language sql stable security definer set search_path = '' as $$
  select k.* from public.vagas_candidaturas k where k.id = p_id and vagas_interno.membro(k.empresa_id);
$$;

create or replace function public.vagas_v2_candidatos(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  f jsonb := case when jsonb_typeof(d -> 'filtros') = 'object' then d -> 'filtros' else '{}'::jsonb end;
  e public.vagas_empresas%rowtype;
  v_vaga uuid;
  v_etapa text := nullif(disc_interno.texto(d -> 'etapa'), '');
  v_bairros text[];
  v_cnh text[];
  v_turnos text[];
  v_esc int;
  v_pret int;
  v_arq boolean := coalesce(f -> 'comArquivo' = 'true'::jsonb, false);
  v_lista jsonb;
  v_totais jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId'));
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if btrim(disc_interno.texto(d -> 'vagaId')) <> '' then
    v_vaga := vagas_interno.v2_anuncio_id(disc_interno.texto(d -> 'vagaId'));
    if v_vaga is null or not exists (select 1 from public.vagas_anuncios a where a.id = v_vaga and a.empresa_id = e.id) then
      return vagas_interno.v2_erro('Vaga não encontrada.', 'nao_encontrada');
    end if;
  end if;
  if v_etapa is not null and v_etapa not in ('nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu') then
    return vagas_interno.v2_erro('Etapa inválida.', 'etapa_invalida');
  end if;
  -- Filtros só por FATO que a pessoa declarou.
  v_bairros := array(select vagas_interno.normalizar(x) from unnest(vagas_interno.v2_lista(
    case when jsonb_typeof(f -> 'bairro') = 'string' then jsonb_build_array(f -> 'bairro') when jsonb_typeof(f -> 'bairros') = 'array' then f -> 'bairros'
         when jsonb_typeof(f -> 'bairro') = 'array' then f -> 'bairro' else '[]'::jsonb end, 20, 80)) x);
  v_cnh := vagas_interno.lista_enum(case when jsonb_typeof(f -> 'cnh') = 'string' then
      (select coalesce(jsonb_agg(substr(c, i, 1)), '[]'::jsonb) from (select upper(f ->> 'cnh') c) q, generate_series(1, char_length(upper(f ->> 'cnh'))) i)
    else f -> 'cnh' end, array['A', 'B', 'C', 'D', 'E']);
  v_turnos := array(select vagas_interno.v2_turno_id(x) from jsonb_array_elements_text(
    case when jsonb_typeof(f -> 'turno') = 'string' then jsonb_build_array(f -> 'turno') when jsonb_typeof(f -> 'turno') = 'array' then f -> 'turno'
         when jsonb_typeof(f -> 'turnos') = 'array' then f -> 'turnos' else '[]'::jsonb end) x where vagas_interno.v2_turno_id(x) is not null);
  v_esc := case when btrim(disc_interno.texto(f -> 'escolaridade')) = '' then null
    else vagas_interno.v2_esc_nivel(vagas_interno.v2_esc_id(disc_interno.texto(f -> 'escolaridade'))) end;
  begin v_pret := case when disc_interno.texto(f -> 'pretensaoAte') = '' then null else round((disc_interno.texto(f -> 'pretensaoAte'))::numeric * 100)::int end;
  exception when others then v_pret := null; end;

  select coalesce(jsonb_agg(vagas_interno.v2_candidato_json(k) order by k.criado_em desc, k.id), '[]'::jsonb) into v_lista
    from public.vagas_candidaturas k where k.id = any (array(select k0.id from public.vagas_candidaturas k0
            join public.vagas_pessoas p on p.user_id = k0.pessoa_id
           where k0.empresa_id = e.id and (v_vaga is null or k0.anuncio_id = v_vaga)
             and (v_etapa is null or vagas_interno.v2_etapa(k0) = v_etapa)
             and (cardinality(v_bairros) = 0 or vagas_interno.normalizar(coalesce(p.bairro, '')) = any (v_bairros))
             and (cardinality(v_cnh) = 0 or p.cnh @> v_cnh)
             and (cardinality(v_turnos) = 0 or p.turnos && v_turnos)
             and (v_esc is null or vagas_interno.v2_esc_nivel(p.escolaridade) >= v_esc)
             and (v_pret is null or (p.pretensao_centavos is not null and p.pretensao_centavos <= v_pret))
             and (not v_arq or exists (select 1 from public.vagas_curriculos c where c.user_id = k0.pessoa_id))
           order by k0.criado_em desc, k0.id limit 500));
  select jsonb_build_object('total', count(*), 'novos', count(*) filter (where vagas_interno.v2_etapa(k) = 'nova'),
    'porEtapa', jsonb_build_object('nova', count(*) filter (where vagas_interno.v2_etapa(k) = 'nova'),
      'vista', count(*) filter (where vagas_interno.v2_etapa(k) = 'vista'), 'em conversa', count(*) filter (where vagas_interno.v2_etapa(k) = 'em conversa'),
      'entrevista marcada', count(*) filter (where vagas_interno.v2_etapa(k) = 'entrevista marcada'),
      'contratada', count(*) filter (where vagas_interno.v2_etapa(k) = 'contratada'), 'não seguiu', count(*) filter (where vagas_interno.v2_etapa(k) = 'não seguiu')))
    into v_totais from public.vagas_candidaturas k where k.empresa_id = e.id and (v_vaga is null or k.anuncio_id = v_vaga);
  return vagas_interno.v2_ok(jsonb_build_object('lista', v_lista, 'totais', v_totais));
end;
$$;

create or replace function public.vagas_v2_candidato(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  v public.vagas_conversas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  k := vagas_interno.v2_candidatura_da_empresa(vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')));
  if k.id is null then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  -- Abrir o candidato marca "vista" e grava no "quem viu meu currículo" da pessoa.
  if vagas_interno.v2_etapa(k) = 'nova' then k := vagas_interno.v2_mudar_etapa(k.id, 'vista', 'empresa'); end if;
  perform vagas_interno.v2_registrar_acesso(k, 'currículo');
  select * into v from public.vagas_conversas where candidatura_id = k.id;
  if v.id is not null then update public.vagas_conversas set lida_empresa_em = now() where id = v.id; end if;
  return vagas_interno.v2_ok(jsonb_build_object('candidato', vagas_interno.v2_candidato_json(k), 'mensagens',
    coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'de', case when m.autor = 'sistema' then 'sistema' when m.autor = 'empresa' then 'eu' else 'ela' end,
        'txt', m.texto, 'ts', vagas_interno.v2_iso(m.criado_em)) order by m.criado_em, m.id)
      from public.vagas_mensagens m where m.conversa_id = v.id), '[]'::jsonb)));
end;
$$;

create or replace function public.vagas_v2_candidato_mover(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  v_etapa text := disc_interno.texto(d -> 'etapa');
  v_atual text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  k := vagas_interno.v2_candidatura_da_empresa(vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')));
  if k.id is null then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  v_atual := vagas_interno.v2_etapa(k);
  if coalesce(d -> 'desfazer' = 'true'::jsonb, false) then
    if v_atual <> 'não seguiu' or k.encerrada_por is distinct from 'empresa' then
      return vagas_interno.v2_erro('Só dá para desfazer um "Não seguir" feito pela empresa.', 'sem_desfazer');
    end if;
    k := vagas_interno.v2_mudar_etapa(k.id, 'nova', 'empresa', true);
    return vagas_interno.v2_ok(jsonb_build_object('candidato', vagas_interno.v2_candidato_json(k)));
  end if;
  if v_etapa not in ('nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu') then
    return vagas_interno.v2_erro('Etapa inválida.', 'etapa_invalida');
  end if;
  if v_atual = 'não seguiu' and k.encerrada_por = 'pessoa' then return vagas_interno.v2_erro('A pessoa retirou a candidatura.', 'encerrada_pela_pessoa'); end if;
  if v_etapa = 'entrevista marcada' and k.entrevista is null then
    return vagas_interno.v2_erro('Para marcar a entrevista, informe quando e onde.', 'entrevista_incompleta');
  end if;
  k := vagas_interno.v2_mudar_etapa(k.id, v_etapa, 'empresa');
  return vagas_interno.v2_ok(jsonb_build_object('candidato', vagas_interno.v2_candidato_json(k)));
end;
$$;

create or replace function public.vagas_v2_whatsapp_chamar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  ct public.vagas_pessoa_contato%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  k := vagas_interno.v2_candidatura_da_empresa(vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')));
  if k.id is null then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if vagas_interno.v2_etapa(k) = 'não seguiu' then return vagas_interno.v2_erro('Esta candidatura foi encerrada.', 'encerrada'); end if;
  if k.contato_cortado_em is not null then return vagas_interno.v2_erro('A pessoa deixou de compartilhar o contato com a sua empresa.', 'contato_cortado'); end if;
  if not vagas_interno.v2_empresa_ve_contato(k) then
    return vagas_interno.v2_erro('O WhatsApp aparece quando a empresa é verificada ou quando a pessoa libera. Por enquanto, converse pelo site.', 'whatsapp_nao_liberado');
  end if;
  if vagas_interno.contar('contato_empresa', k.empresa_id::text, interval '1 day') > 300 then
    return vagas_interno.v2_erro('Muitas consultas de contato hoje. Tente de novo amanhã.', 'limite_dia');
  end if;
  select * into ct from public.vagas_pessoa_contato where user_id = k.pessoa_id;
  perform vagas_interno.v2_registrar_acesso(k, 'contato');
  if vagas_interno.v2_etapa(k) in ('nova', 'vista') then perform vagas_interno.v2_mudar_etapa(k.id, 'em conversa', 'empresa'); end if;
  return vagas_interno.v2_ok(jsonb_build_object('whatsapp', ct.whatsapp, 'link', 'https://wa.me/' || ct.whatsapp));
end;
$$;

create or replace function public.vagas_v2_entrevista_marcar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  v_quando timestamptz;
  v_onde text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'onde'), 300);
  v_recado text := vagas_interno.limpar_multilinha(disc_interno.texto(d -> 'recado'), 300);
  l jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  k := vagas_interno.v2_candidatura_da_empresa(vagas_interno.v2_uuid(disc_interno.texto(d -> 'id')));
  if k.id is null then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if vagas_interno.v2_etapa(k) = 'não seguiu' then return vagas_interno.v2_erro('Esta candidatura foi encerrada.', 'encerrada'); end if;
  begin v_quando := (btrim(disc_interno.texto(d -> 'quando')))::timestamptz; exception when others then v_quando := null; end;
  if v_quando is null then return vagas_interno.v2_erro('Informe o dia e a hora da entrevista.', 'quando'); end if;
  if char_length(v_onde) < 3 then return vagas_interno.v2_erro('Informe onde será a entrevista.', 'onde'); end if;
  l := vagas_interno.conferir_lista(v_onde || E'\n' || v_recado, 'conversa');
  if jsonb_array_length(l -> 'barra') > 0 then
    return vagas_interno.v2_erro(l -> 'barra' -> 0 ->> 'mensagem', 'texto_barrado', jsonb_build_object('barra', l -> 'barra'));
  end if;
  update public.vagas_candidaturas set entrevista = jsonb_build_object('quando', vagas_interno.v2_iso(v_quando), 'onde', v_onde,
    'recado', v_recado, 'confirmada', null, 'pediuOutro', false) where id = k.id;
  k := vagas_interno.v2_mudar_etapa(k.id, 'entrevista marcada', 'empresa');
  perform vagas_interno.v2_aviso_sistema(k.id, 'Entrevista marcada para ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
    || ', em ' || v_onde || case when v_recado <> '' then '. Recado: ' || v_recado else '.' end);
  select * into k from public.vagas_candidaturas where id = k.id;
  return vagas_interno.v2_ok(jsonb_build_object('candidato', vagas_interno.v2_candidato_json(k)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Equipe da empresa (convite já vale em verificação: até 2 pessoas)
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_equipe_json(e public.vagas_empresas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(x.j order by x.o, x.t) from (
    select jsonb_build_object('userId', m.user_id, 'email', coalesce(lower(u.email), ''),
        'nome', disc_interno.limpar_texto(coalesce(u.raw_user_meta_data ->> 'nome', ''), 120), 'papel', m.papel, 'desde', vagas_interno.v2_iso(m.criado_em),
        'eu', m.user_id = auth.uid(), 'pendente', false,
        'podeRemover', not (m.papel = 'dono' and (select count(*) from public.vagas_empresa_membros z where z.empresa_id = e.id and z.ativo and z.papel = 'dono') <= 1)) j,
      case when m.papel = 'dono' then 0 else 1 end o, m.criado_em t
    from public.vagas_empresa_membros m left join auth.users u on u.id = m.user_id where m.empresa_id = e.id and m.ativo
    union all
    select jsonb_build_object('id', cv.id, 'email', cv.email, 'papel', cv.papel, 'desde', vagas_interno.v2_iso(cv.criado_em), 'expiraEm', vagas_interno.v2_iso(cv.expira_em),
        'eu', false, 'pendente', true, 'podeRemover', true), 2, cv.criado_em
    from public.vagas_equipe_convites cv where cv.empresa_id = e.id and cv.status = 'aberto' and cv.expira_em > now()) x), '[]'::jsonb);
$$;

create or replace function public.vagas_v2_equipe(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId'));
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if not vagas_interno.membro(e.id, true) then return vagas_interno.v2_erro('Só quem é dono(a) da conta da empresa pode ver a equipe.', 'so_dono'); end if;
  return vagas_interno.v2_ok(jsonb_build_object('equipe', vagas_interno.v2_equipe_json(e)));
end;
$$;

create or replace function public.vagas_v2_equipe_convidar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  v_uid uuid := auth.uid();
  e public.vagas_empresas%rowtype;
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_token text;
  cv public.vagas_equipe_convites%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId')) for update;
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if not vagas_interno.membro(e.id, true) then return vagas_interno.v2_erro('Só quem é dono(a) da conta da empresa pode convidar pessoas.', 'so_dono'); end if;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if v_email = '' then return vagas_interno.v2_erro('E-mail inválido.', 'email'); end if;
  if exists (select 1 from public.vagas_empresa_membros m join auth.users u on u.id = m.user_id where m.empresa_id = e.id and m.ativo and lower(u.email) = v_email) then
    return vagas_interno.v2_erro('Esta pessoa já faz parte da equipe.', 'ja_na_equipe');
  end if;
  if e.status <> 'ativa' and (select count(*) from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo and m.papel <> 'dono')
       + (select count(distinct x.email) from public.vagas_equipe_convites x where x.empresa_id = e.id and x.status = 'aberto' and x.expira_em > now() and x.email <> v_email) >= 2 then
    return vagas_interno.v2_erro('Enquanto a empresa está em verificação, dá para convidar até 2 pessoas. Depois da verificação, o limite sobe.', 'limite_equipe');
  end if;
  if vagas_interno.contar('equipe_convite_empresa', e.id::text, interval '1 day') > 10 then
    return vagas_interno.v2_erro('Muitos convites hoje. Tente de novo amanhã.', 'limite_dia');
  end if;
  if (select count(*) from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo) >= 20 then
    return vagas_interno.v2_erro('A equipe já tem 20 pessoas. Remova alguém antes de convidar outra.', 'limite_equipe');
  end if;
  update public.vagas_equipe_convites set status = 'cancelado', encerrado_em = now() where empresa_id = e.id and email = v_email and status = 'aberto';
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.vagas_equipe_convites (empresa_id, email, token_hash, criado_por, expira_em)
  values (e.id, v_email, vagas_interno.token_hash(v_token), v_uid, now() + interval '72 hours') returning * into cv;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
  values (e.cidade_id, v_uid, 'empresa', 'equipe_convidar', 'empresa', e.id, '', jsonb_build_object('papel', cv.papel));
  -- O e-mail do convite sai pela função de servidor; "token" permite mostrar um link para copiar enquanto isso.
  return vagas_interno.v2_ok(jsonb_build_object('equipe', vagas_interno.v2_equipe_json(e),
    'convite', jsonb_build_object('id', cv.id, 'email', cv.email, 'expiraEm', vagas_interno.v2_iso(cv.expira_em), 'token', v_token)));
end;
$$;

-- O convite pela função de servidor (e-mail do convite): a regra de "só empresa verificada" cai; em verificação vale até 2 pessoas.
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
  if exists (select 1 from public.vagas_empresa_membros m join auth.users u on u.id = m.user_id
              where m.empresa_id = e.id and m.ativo and lower(u.email) = v_email) then
    return vagas_interno.erro('Esta pessoa já faz parte da equipe.');
  end if;
  if e.status <> 'ativa' and (select count(*) from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo and m.papel <> 'dono')
       + (select count(distinct x.email) from public.vagas_equipe_convites x where x.empresa_id = e.id and x.status = 'aberto' and x.expira_em > now() and x.email <> v_email) >= 2 then
    return vagas_interno.erro('Enquanto a empresa está em verificação, dá para convidar até 2 pessoas.');
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
  delete from public.vagas_equipe_convites x
   where (x.status <> 'aberto' and coalesce(x.usado_em, x.encerrado_em, x.criado_em) < now() - interval '30 days')
      or (x.status = 'aberto' and x.expira_em < now() - interval '30 days');
  perform vagas_interno.contas_convite_limpar();
  update public.vagas_equipe_convites set status = 'cancelado', encerrado_em = now()
   where empresa_id = e.id and email = v_email and status = 'aberto';
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.vagas_equipe_convites (empresa_id, email, token_hash, criado_por, expira_em)
  values (e.id, v_email, vagas_interno.token_hash(v_token), p_user, now() + interval '72 hours')
  returning * into cv;
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
    'convidadoPor', (select case when vagas_interno.conferir_texto(x.nome, 'cartao') is null then x.nome else '' end
                       from (select disc_interno.limpar_texto(coalesce(u.raw_user_meta_data ->> 'nome', ''), 120) as nome
                               from auth.users u where u.id = p_user) x)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Verificação da empresa (E13)
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.v2_documentos_json(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'enviadoEm', vagas_interno.v2_iso(x.enviado_em)) order by x.enviado_em desc), '[]'::jsonb)
    from public.vagas_empresa_documentos x where x.empresa_id = p_empresa;
$$;

create or replace function public.vagas_v2_verificacao(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
  v_estado text;
  v_docs jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId'));
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  v_estado := vagas_interno.v2_estado_empresa(e);
  v_docs := vagas_interno.v2_documentos_json(e.id);
  return vagas_interno.v2_ok(jsonb_strip_nulls(jsonb_build_object('estado', v_estado,
    'passos', jsonb_build_array(
      jsonb_build_object('id', 'cnpj', 'titulo', 'CNPJ ativo na Receita Federal', 'feito', coalesce(e.consulta_cnpj ->> 'situacao', '') <> '' and not coalesce((e.consulta_cnpj ->> 'desatualizada')::boolean, false)),
      jsonb_build_object('id', 'responsavel', 'titulo', 'Responsável e WhatsApp da empresa', 'feito', e.responsavel <> '' and e.whatsapp <> ''),
      jsonb_build_object('id', 'documento', 'titulo', 'Documento da empresa (quando a equipe pedir)', 'feito', jsonb_array_length(v_docs) > 0 or e.verificacao_pedida_em is null),
      jsonb_build_object('id', 'equipe', 'titulo', 'Conferência da equipe do Vagas sem Caos', 'feito', v_estado = 'verificada')),
    'prazoAte', case when v_estado in ('em_verificacao', 'vencida') then vagas_interno.v2_iso(e.verificacao_prazo_em) else null end,
    'motivoAjuste', nullif(coalesce(nullif(e.verificacao_motivo, ''), e.status_motivo), ''),
    'verificadaEm', vagas_interno.v2_iso(e.cnpj_conferido_em), 'documentos', v_docs)));
end;
$$;

create or replace function public.vagas_v2_verificacao_documento(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
  v_caminho text := btrim(disc_interno.texto(d -> 'caminho'));
  v_nome text := disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 200);
  v_tipo text := lower(btrim(disc_interno.texto(d -> 'tipo')));
  v_existe boolean := false;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId'));
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if v_caminho !~ ('^' || e.id::text || '/[^/]{1,200}$') then return vagas_interno.v2_erro('Arquivo inválido: ele precisa estar na pasta da empresa.', 'arquivo_invalido'); end if;
  if v_nome = '' then return vagas_interno.v2_erro('Informe o nome do arquivo.', 'arquivo_invalido'); end if;
  if v_tipo not in ('application/pdf', 'image/jpeg', 'image/png') then return vagas_interno.v2_erro('Envie o documento em PDF, JPG ou PNG.', 'arquivo_invalido'); end if;
  if (select count(*) from public.vagas_empresa_documentos where empresa_id = e.id) >= 10 then
    return vagas_interno.v2_erro('A empresa já enviou 10 documentos. Fale com a equipe para trocar algum.', 'limite');
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into v_existe using 'vagas-verificacao', v_caminho;
  end if;
  if not v_existe then return vagas_interno.v2_erro('Não encontrei o arquivo enviado. Tente enviar de novo.', 'arquivo_ausente'); end if;
  insert into public.vagas_empresa_documentos (empresa_id, caminho, nome, tipo, enviado_por) values (e.id, v_caminho, v_nome, v_tipo, auth.uid())
  on conflict (empresa_id, caminho) do update set nome = excluded.nome, tipo = excluded.tipo, enviado_em = now();
  return vagas_interno.v2_ok(jsonb_build_object('documentos', vagas_interno.v2_documentos_json(e.id)));
end;
$$;

-- "Corrigir e pedir nova conferência": volta a "em verificação" com mais 7 dias. Enquanto não verificada, corrige CNPJ e nomes.
create or replace function public.vagas_v2_verificacao_reenviar(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_conta jsonb := vagas_interno.v2_conta('empresa');
  e public.vagas_empresas%rowtype;
  c jsonb := case when jsonb_typeof(d -> 'dados') = 'object' then d -> 'dados' else '{}'::jsonb end;
  v_estado text;
  v_txt text;
  v_cnpj_antes text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta; end if;
  select * into e from public.vagas_empresas where id = vagas_interno.v2_uuid(disc_interno.texto(d -> 'empresaId')) for update;
  if not found or not vagas_interno.membro(e.id) then return vagas_interno.v2_erro('Empresa não encontrada.', 'nao_encontrada'); end if;
  if not vagas_interno.membro(e.id, true) then return vagas_interno.v2_erro('Só quem é dono(a) da conta da empresa pode pedir nova conferência.', 'so_dono'); end if;
  v_estado := vagas_interno.v2_estado_empresa(e);
  if v_estado = 'verificada' then return vagas_interno.v2_erro('A empresa já está verificada.', 'ja_verificada'); end if;
  if v_estado = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  v_cnpj_antes := e.cnpj;
  if c ? 'razaoSocial' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(c -> 'razaoSocial'), 160);
    if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe a razão social.', 'razao'); end if;
    e.razao_social := v_txt;
  end if;
  if c ? 'nomeFantasia' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(c -> 'nomeFantasia'), 120);
    if char_length(v_txt) < 2 then return vagas_interno.v2_erro('Informe o nome da empresa.', 'nome'); end if;
    e.nome_fantasia := v_txt;
  end if;
  if c ? 'cnpj' then
    v_txt := vagas_interno.normalizar_cnpj(disc_interno.texto(c -> 'cnpj'));
    if not vagas_interno.cnpj_valido(v_txt) then return vagas_interno.v2_erro('CNPJ inválido. Confira os números.', 'cnpj'); end if;
    if v_txt <> e.cnpj and exists (select 1 from public.vagas_empresas o where o.cnpj = v_txt) then
      return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
    end if;
    e.cnpj := v_txt;
  end if;
  begin
    update public.vagas_empresas set razao_social = e.razao_social, nome_fantasia = e.nome_fantasia, cnpj = e.cnpj, status = 'em_analise',
      status_motivo = '', verificacao_estado = 'em_verificacao', verificacao_prazo_em = now() + interval '7 days', verificacao_pedida_em = null,
      verificacao_reenviada_em = now(),
      consulta_cnpj = case when e.cnpj <> v_cnpj_antes then jsonb_build_object('desatualizada', true, 'cnpjAnterior', v_cnpj_antes) else consulta_cnpj end
     where id = e.id returning * into e;
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when unique_violation then return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
    when check_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
  values (e.cidade_id, auth.uid(), 'empresa', 'pedir_nova_conferencia', 'empresa', e.id, '');
  return vagas_interno.v2_ok(jsonb_build_object('estado', vagas_interno.v2_estado_empresa(e)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Funções SÓ de servidor (EXECUTE só service_role)
-- -----------------------------------------------------------------------------

create or replace function public.vagas_v2_conta_garantir_servidor(p_uid uuid, p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  v_tipo text := disc_interno.texto(d -> 'tipo');
  v_versao text := btrim(disc_interno.texto(d -> 'termosVersao'));
  c public.vagas_contas%rowtype;
  v_nova boolean;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  if v_tipo not in ('pessoa', 'empresa') then return vagas_interno.v2_erro('Tipo de conta inválido.', 'tipo_invalido'); end if;
  if not exists (select 1 from auth.users u where u.id = p_uid) then return vagas_interno.v2_erro('Usuário não encontrado.', 'sem_usuario'); end if;
  insert into public.vagas_contas (user_id, tipo, status, confirmada_em) values (p_uid, v_tipo, 'ativa', now()) on conflict (user_id) do nothing;
  get diagnostics v_nova = row_count;
  select * into c from public.vagas_contas where user_id = p_uid for update;
  if c.tipo <> v_tipo then return vagas_interno.v2_erro('Este e-mail já tem uma conta de outro tipo.', 'tipo_diferente'); end if;
  if c.status = 'suspensa' then return vagas_interno.v2_erro('Esta conta está suspensa. Fale com a Gestão sem Caos.', 'conta_suspensa'); end if;
  -- Quem entrou por código no e-mail provou que o e-mail é seu.
  update public.vagas_contas set status = 'ativa', confirmada_em = coalesce(confirmada_em, now()), ultimo_acesso_em = now() where user_id = p_uid returning * into c;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_uid;
  if v_versao ~ '^[A-Za-z0-9._-]{1,40}$' and (c.termos_aceitos_em is null or c.termos_versao is distinct from v_versao) then
    update public.vagas_contas set termos_versao = v_versao, termos_aceitos_em = now() where user_id = p_uid;
    insert into public.vagas_consentimentos (user_id, tipo, versao, aceito) values (p_uid, 'termos', v_versao, true), (p_uid, 'privacidade', v_versao, true);
  end if;
  -- Quem estava na lista de espera de uma cidade com este e-mail ganha o alerta "Avisar quando tiver vaga" (a lista antiga continua).
  if v_tipo = 'pessoa' then
    insert into public.vagas_alertas (user_id, cidade, canal, origem)
    select distinct p_uid, ci.slug, 'email', 'lista_espera'
      from public.vagas_lista_espera l join public.vagas_cidades ci on ci.id = l.cidade_id join auth.users u on u.id = p_uid
     where l.perfil = 'pessoa' and lower(l.email) = lower(u.email)
       and not exists (select 1 from public.vagas_alertas a where a.user_id = p_uid and a.cidade = ci.slug and a.origem = 'lista_espera');
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('userId', p_uid, 'tipo', v_tipo, 'novaConta', v_nova));
end;
$$;

create or replace function public.vagas_v2_empresa_criar_servidor(p_uid uuid, p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := vagas_interno.v2_dados(p_dados);
  q jsonb := case when jsonb_typeof(d -> 'consulta') = 'object' then d -> 'consulta' else '{}'::jsonb end;
  c public.vagas_contas%rowtype;
  e public.vagas_empresas%rowtype;
  v_cnpj text := vagas_interno.normalizar_cnpj(disc_interno.texto(d -> 'cnpj'));
  v_razao text := disc_interno.limpar_texto(disc_interno.texto(q -> 'razaoSocial'), 160);
  v_fant text := disc_interno.limpar_texto(coalesce(nullif(disc_interno.texto(d -> 'nomeFantasia'), ''), disc_interno.texto(q -> 'nomeFantasia')), 120);
  v_whats text := vagas_interno.normalizar_whatsapp(disc_interno.texto(d -> 'whatsapp'));
  v_email text := btrim(disc_interno.texto(d -> 'email'));
  v_resp text := disc_interno.limpar_texto(disc_interno.texto(d -> 'responsavel'), 120);
  v_cid public.vagas_cidades%rowtype;
  v_situacao text := vagas_interno.normalizar(disc_interno.texto(q -> 'situacao'));
  v_existente public.vagas_empresas%rowtype;
  v_setor text := disc_interno.limpar_texto(disc_interno.texto(d -> 'setor'), 80);
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  select * into c from public.vagas_contas where user_id = p_uid;
  if not found then return vagas_interno.v2_erro('Sessão expirada. Entre de novo.', 'sessao_expirada'); end if;
  if c.status = 'suspensa' then return vagas_interno.v2_erro('Esta conta está suspensa. Fale com a Gestão sem Caos.', 'conta_suspensa'); end if;
  if c.tipo <> 'empresa' then return vagas_interno.v2_erro('Esta área é para empresas.', 'tipo_diferente'); end if;
  if (select count(*) from public.vagas_empresa_membros m where m.user_id = p_uid and m.papel = 'dono') >= 5 then
    return vagas_interno.v2_erro('Esta conta já cadastrou o máximo de empresas. Fale com a Gestão sem Caos.', 'limite_empresas');
  end if;
  if not vagas_interno.cnpj_valido(v_cnpj) then return vagas_interno.v2_erro('CNPJ inválido. Confira os números.', 'cnpj'); end if;
  if v_situacao <> 'ativa' then
    return vagas_interno.v2_erro('Este CNPJ não está ativo na Receita Federal, então ainda não dá para anunciar com ele.', 'cnpj_inativo');
  end if;
  select * into v_existente from public.vagas_empresas where cnpj = v_cnpj;
  if found then
    if v_existente.status = 'suspensa' then return vagas_interno.v2_erro('Este CNPJ não pode ser cadastrado agora. Fale com a Gestão sem Caos.', 'cnpj_bloqueado'); end if;
    return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
  end if;
  if char_length(v_razao) < 2 then v_razao := coalesce(nullif(v_fant, ''), ''); end if;
  if char_length(v_razao) < 2 then return vagas_interno.v2_erro('Não consegui ler a razão social do CNPJ. Tente de novo.', 'razao'); end if;
  if char_length(v_fant) < 2 then v_fant := left(v_razao, 120); end if;
  if char_length(v_resp) < 2 then return vagas_interno.v2_erro('Informe o nome de quem responde pela empresa.', 'responsavel'); end if;
  if v_whats !~ '^55[1-9][1-9][0-9]{8,9}$' then return vagas_interno.v2_erro('WhatsApp da empresa inválido.', 'whatsapp'); end if;
  if v_email <> '' then
    v_email := vagas_interno.email(v_email);
    if v_email = '' then return vagas_interno.v2_erro('E-mail da empresa inválido.', 'email'); end if;
  end if;
  select * into v_cid from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade'))) and status in ('ativa', 'lista_espera');
  if not found then return vagas_interno.v2_erro('Escolha a cidade da empresa.', 'cidade'); end if;
  begin
    insert into public.vagas_empresas (cidade_id, cnpj, mei, razao_social, nome_fantasia, setor, whatsapp, email, status, criada_por, verificacao_estado,
      verificacao_prazo_em, consulta_cnpj, responsavel, bairro)
    values (v_cid.id, v_cnpj, coalesce(q -> 'mei' = 'true'::jsonb, false), v_razao, v_fant, v_setor, v_whats, v_email, 'em_analise', p_uid, 'em_verificacao',
      now() + interval '7 days', jsonb_strip_nulls(jsonb_build_object('situacao', 'ATIVA', 'razaoSocial', nullif(v_razao, ''),
        'nomeFantasia', nullif(disc_interno.limpar_texto(disc_interno.texto(q -> 'nomeFantasia'), 120), ''),
        'cidade', nullif(disc_interno.limpar_texto(disc_interno.texto(q -> 'cidade'), 80), ''), 'uf', nullif(left(upper(btrim(disc_interno.texto(q -> 'uf'))), 2), ''),
        'abertura', nullif(left(btrim(disc_interno.texto(q -> 'abertura')), 10), ''), 'mei', coalesce(q -> 'mei' = 'true'::jsonb, false),
        'consultadoEm', vagas_interno.v2_iso(now()))), v_resp, disc_interno.limpar_texto(disc_interno.texto(d -> 'bairro'), 80))
    returning * into e;
    insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values (e.id, p_uid, 'dono');
  exception
    when raise_exception then return vagas_interno.v2_erro(sqlerrm, 'texto_barrado');
    when unique_violation then return vagas_interno.v2_erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.', 'cnpj_repetido');
    when check_violation or not_null_violation then return vagas_interno.v2_erro('Dados inválidos. Confira os campos.', 'dados_invalidos');
  end;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
  values (e.cidade_id, p_uid, 'empresa', 'empresa_criada', 'empresa', e.id, '');
  return vagas_interno.v2_ok(jsonb_build_object('empresa', vagas_interno.v2_empresa_dona_json(e, 'dono')));
end;
$$;

-- Permissão do arquivo do currículo: a regra 1A (verificada, ou a pessoa liberou). Registra "quem viu" e devolve o caminho no bucket.
create or replace function public.vagas_v2_arquivo_link_servidor(p_uid uuid, p_candidatura uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
  a public.vagas_anuncios%rowtype;
  cu public.vagas_curriculos%rowtype;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  select * into k from public.vagas_candidaturas where id = p_candidatura;
  if not found or not vagas_interno.v2_membro_de(p_uid, k.empresa_id) then return vagas_interno.v2_erro('Candidatura não encontrada.', 'nao_encontrada'); end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if e.status = 'suspensa' then return vagas_interno.v2_erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', 'empresa_suspensa'); end if;
  if vagas_interno.v2_etapa(k) = 'não seguiu' then return vagas_interno.v2_erro('Esta candidatura foi encerrada.', 'encerrada'); end if;
  if not vagas_interno.v2_empresa_ve_contato(k) then
    return vagas_interno.v2_erro('O arquivo aparece quando a empresa é verificada ou quando a pessoa libera o WhatsApp.', 'arquivo_nao_liberado');
  end if;
  select * into cu from public.vagas_curriculos where user_id = k.pessoa_id;
  if not found then return vagas_interno.v2_erro('A pessoa não anexou um arquivo.', 'sem_arquivo'); end if;
  if vagas_interno.contar('contato_empresa', k.empresa_id::text, interval '1 day') > 300 then
    return vagas_interno.v2_erro('Muitas consultas hoje. Tente de novo amanhã.', 'limite_dia');
  end if;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  if not exists (select 1 from public.vagas_acessos_contato l where l.candidatura_id = k.id and l.user_id = p_uid and l.tipo_acesso = 'arquivo' and l.em > now() - interval '10 minutes') then
    insert into public.vagas_acessos_contato (candidatura_id, pessoa_id, empresa_id, empresa_nome, anuncio_titulo, user_id, papel, tipo_acesso)
    values (k.id, k.pessoa_id, k.empresa_id, left(e.nome_fantasia, 120), left(a.funcao, 80), p_uid,
      (select m.papel from public.vagas_empresa_membros m where m.empresa_id = k.empresa_id and m.user_id = p_uid), 'arquivo');
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('caminho', cu.caminho, 'nome', cu.nome, 'bucket', 'vagas-curriculos'));
end;
$$;

-- Documento de verificação: dono/membro da empresa ou equipe da cidade da empresa.
create or replace function public.vagas_v2_documento_link_servidor(p_uid uuid, p_documento uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  doc public.vagas_empresa_documentos%rowtype;
  e public.vagas_empresas%rowtype;
  v_ok boolean;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.v2_erro('Sem permissão.', 'sem_permissao'); end if;
  select * into doc from public.vagas_empresa_documentos where id = p_documento;
  if not found then return vagas_interno.v2_erro('Documento não encontrado.', 'nao_encontrado'); end if;
  select * into e from public.vagas_empresas where id = doc.empresa_id;
  v_ok := vagas_interno.v2_membro_de(p_uid, e.id)
    or exists (select 1 from public.vagas_operadores o where o.user_id = p_uid and o.cidade_id = e.cidade_id and o.ativo and vagas_interno.conta_valida(o.user_id))
    or exists (select 1 from public.admins ad where ad.user_id = p_uid);
  if not v_ok then return vagas_interno.v2_erro('Documento não encontrado.', 'nao_encontrado'); end if;
  if not vagas_interno.v2_membro_de(p_uid, e.id) then
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
    values (e.cidade_id, p_uid, case when exists (select 1 from public.admins ad where ad.user_id = p_uid) then 'admin' else 'operador' end,
      'ver_documento', 'empresa', e.id, '');
  end if;
  return vagas_interno.v2_ok(jsonb_build_object('caminho', doc.caminho, 'nome', doc.nome, 'bucket', 'vagas-verificacao'));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Permissões
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
            where p.pronamespace = 'public'::regnamespace and (p.proname like 'vagas\_v2\_%' or p.proname = 'vagas_conta_convite_equipe') loop
    execute format('revoke all on function %s from public', f.assinatura);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f.assinatura, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f.assinatura); end if;
    if f.proname !~ '_servidor$' and f.proname <> 'vagas_conta_convite_equipe' and f.proname not in ('vagas_v2_base', 'vagas_v2_vaga', 'vagas_v2_texto_checar')
       and exists (select 1 from pg_roles where rolname = 'authenticated') then
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
                                       and to_regprocedure('public.vagas_v2_empresa_criar_servidor(uuid, jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261101120002, 'migracoes', to_jsonb(aplicadas),
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

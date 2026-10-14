-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — PRÉ-ABERTURA para empresas, CANAL de WhatsApp da cidade, ORIGEM e LIMITES da lista de
-- espera. Roda DEPOIS de 20261024120003_vagas_aviso_reforco.sql. Idempotente e seguro sobre dados reais: só acrescenta
-- colunas, um gatilho, funções e permissões, e recria versao_banco(). Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
-- Contrato: docs/VAGAS-SPEC.md §6.8, §7, §8.1, §8.4, §8.7, §8.8 e §8.9.
--
--   1. PRÉ-ABERTURA PARA EMPRESAS (P1). Na cidade em lista de espera a empresa já se cadastra (ela mesma ou pela operação),
--      a operação confere o CNPJ, a empresa cria e publica vaga e a moderação revisa. A vaga aprovada fica PRONTA e
--      INVISÍVEL: toda leitura pública (mural, feed, vaga pelo código, /v/, vista, contagens do painel) já exige cidade ativa
--      (vagas_interno.no_ar), e o Quero também — ninguém se candidata antes da abertura. A validade não corre antes da
--      abertura: a vaga publicada com a cidade fechada fica marcada (vagas_anuncios.pre_abertura) e, no momento em que a
--      cidade passa a ativa, um gatilho dá a ela publicado_em = abertura e expira_em = abertura + a validade normal, na mesma
--      transação (rodar de novo não estende nada: a marca sai). A empresa lê "Sua vaga entra no ar no dia em que <cidade>
--      abrir." (anuncio.aguardaAbertura/avisoAbertura). Pessoa continua sem cadastro em cidade fechada.
--   2. CANAL DE WHATSAPP DA CIDADE (P2): vagas_cidades.canal_whatsapp (só https://whatsapp.com/channel/<id>; null = não tem),
--      editado pela equipe em vagas_adm_cidade_salvar {canalWhatsapp} e lido em vagas_cidades_publicas (canalWhatsapp).
--   3. ORIGEM DO CADASTRO NA LISTA (P3): {origem} opcional, lista fechada (radio, cartaz, grupo, canal, escola, mutirao,
--      indicacao, outro); qualquer outra coisa vira null, nunca erro. O primeiro valor fica. Nada de URL, IP ou navegador.
--      O painel da praça conta por origem (lista_espera.detalhe.porOrigem), com o "menos de 3" da cidade protegida (I1).
--   4. LIMITES DA LISTA DE ESPERA: entrar e sair com contadores SEPARADOS. Entrar: 30 por hora por origem (300 com o
--      Turnstile conferido pela Edge Function: mutirão, escola, Wi-Fi da praça), 5 por hora por e-mail e 5 por hora por
--      WhatsApp, e (sem Turnstile) 1000 por hora no total. Sair: 10 por hora por origem. Os limites contam tentativas, não
--      quem existe: a resposta não revela se o e-mail está na lista. Campo isca {site} (honeypot): preenchido, a resposta é
--      igual à de sucesso e nada é gravado. Com o Turnstile no site (TURNSTILE_SITE_KEY), a tela manda {captcha} e o pedido vai
--      pela vagas-conta (ação lista_espera); com o ajuste lista_espera_captcha = 'sim' (vagas_interno.ajustes, da
--      20261024120003), o caminho direto (RPC pública) passa a recusar com {captcha:true}. As chaves dos limites por e-mail e
--      por WhatsApp usam o hash com sal (vagas_interno.hash_privado).
--   5. versao_banco(): a lista da 20261024120003 + 20261024120004_vagas_pre_abertura.
--
-- Rodar a 20261022, a 20261024120000, a 20261024120002 ou a 20261024120003 de novo DEPOIS desta volta as funções
-- redefinidas aqui à versão antiga (a pré-abertura some, o canal e a origem deixam de aparecer): rode esta em seguida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas
-- -----------------------------------------------------------------------------

alter table public.vagas_anuncios add column if not exists pre_abertura boolean not null default false;

alter table public.vagas_cidades add column if not exists canal_whatsapp text;
alter table public.vagas_cidades drop constraint if exists vagas_cidades_canal_whatsapp_check;
alter table public.vagas_cidades add constraint vagas_cidades_canal_whatsapp_check
  check (canal_whatsapp is null or canal_whatsapp ~ '^https://whatsapp\.com/channel/[0-9A-Za-z]{10,64}$');

alter table public.vagas_lista_espera add column if not exists origem text;
alter table public.vagas_lista_espera drop constraint if exists vagas_lista_espera_origem_check;
alter table public.vagas_lista_espera add constraint vagas_lista_espera_origem_check
  check (origem is null or origem in ('radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro'));

-- Ajuste novo (tabela vagas_interno.ajustes da 20261024120003): lista_espera_captcha = 'sim' faz a RPC pública da lista
-- de espera recusar; só a Edge Function, com o Turnstile, grava.

-- Origens aceitas no cadastro da lista de espera (lista fechada; a tela mostra os rótulos).
create or replace function vagas_interno.lista_espera_origens()
returns text[] language sql immutable set search_path = '' as $$
  select array['radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro'];
$$;

-- -----------------------------------------------------------------------------
-- 1. Pré-abertura para empresas (P1)
-- -----------------------------------------------------------------------------

-- Lê os dados de cadastro de uma empresa: IGUAL à da 20261022, aceitando a cidade em lista de espera.
create or replace function vagas_interno.ler_empresa(d jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cnpj text := vagas_interno.normalizar_cnpj(disc_interno.texto(d -> 'cnpj'));
  v_razao text := disc_interno.limpar_texto(disc_interno.texto(d -> 'razaoSocial'), 160);
  v_fant text := disc_interno.limpar_texto(disc_interno.texto(d -> 'nomeFantasia'), 120);
  v_setor text := disc_interno.limpar_texto(disc_interno.texto(d -> 'setor'), 80);
  v_desc text := disc_interno.texto(d -> 'descricao');
  v_whats_txt text := btrim(disc_interno.texto(d -> 'whatsapp'));
  v_whats text := '';
  v_email_txt text := btrim(disc_interno.texto(d -> 'email'));
  v_email text := '';
  c public.vagas_cidades%rowtype;
  v_zona uuid := null;
begin
  if not vagas_interno.cnpj_valido(v_cnpj) then return jsonb_build_object('ok', false, 'erro', 'CNPJ inválido. Confira os números.'); end if;
  if exists (select 1 from public.vagas_empresas e where e.cnpj = v_cnpj) then
    return jsonb_build_object('ok', false, 'erro', 'Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
  end if;
  if char_length(v_razao) < 2 then return jsonb_build_object('ok', false, 'erro', 'Informe a razão social.'); end if;
  if char_length(v_fant) < 2 then v_fant := left(v_razao, 120); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found or c.status = 'rascunho' then return jsonb_build_object('ok', false, 'erro', 'Escolha a cidade da empresa.'); end if;
  -- Pré-abertura (20261024120004): a empresa já se cadastra na cidade em lista de espera.
  if c.status not in ('ativa', 'lista_espera') then return jsonb_build_object('ok', false, 'erro', 'Ainda não chegamos a esta cidade. Entre na lista de espera.'); end if;
  if btrim(disc_interno.texto(d -> 'zona')) <> '' then
    select z.id into v_zona from public.vagas_zonas z where z.cidade_id = c.id and z.slug = lower(btrim(disc_interno.texto(d -> 'zona')));
    if v_zona is null then return jsonb_build_object('ok', false, 'erro', 'Escolha uma zona da cidade da empresa.'); end if;
  end if;
  if char_length(v_desc) > 800 then return jsonb_build_object('ok', false, 'erro', 'A descrição pode ter até 800 caracteres.'); end if;
  if v_whats_txt <> '' then
    v_whats := vagas_interno.normalizar_whatsapp(v_whats_txt);
    if v_whats !~ '^55[1-9][1-9][0-9]{8,9}$' then return jsonb_build_object('ok', false, 'erro', 'WhatsApp da empresa inválido.'); end if;
  end if;
  if v_email_txt <> '' then
    v_email := vagas_interno.email(v_email_txt);
    if v_email = '' then return jsonb_build_object('ok', false, 'erro', 'E-mail da empresa inválido.'); end if;
  end if;
  return jsonb_build_object('ok', true, 'campos', jsonb_build_object('cnpj', v_cnpj, 'mei', coalesce(d -> 'mei' = 'true'::jsonb, false),
    'razaoSocial', v_razao, 'nomeFantasia', v_fant, 'setor', v_setor, 'descricao', vagas_interno.limpar_multilinha(v_desc, 800),
    'whatsapp', v_whats, 'email', v_email, 'cidadeId', c.id, 'zonaId', v_zona));
end;
$$;

-- Empresa (gatilho): IGUAL à da 20261022, aceitando a cidade em lista de espera no cadastro.
create or replace function vagas_interno.empresas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.cnpj := old.cnpj;
    new.criado_em := old.criado_em;
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
  t := coalesce(vagas_interno.conferir_texto(new.nome_fantasia, 'cartao'), vagas_interno.conferir_texto(new.razao_social, 'cartao'),
                vagas_interno.conferir_texto(new.setor, 'cartao'), vagas_interno.conferir_texto(new.descricao, 'empresa'));
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Anúncio (gatilho): IGUAL à da 20261022, aceitando a cidade em lista de espera e marcando a vaga publicada antes da abertura.
create or replace function vagas_interno.anuncios_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  x text;
  v_fuso text;
  v_hoje date;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.codigo := old.codigo;
    new.empresa_id := old.empresa_id;
    new.criado_em := old.criado_em;
  end if;
  if coalesce(new.codigo, '') = '' then new.codigo := vagas_interno.gerar_codigo_anuncio(); end if;
  select c.fuso into v_fuso from public.vagas_cidades c where c.id = new.cidade_id;
  if (tg_op = 'INSERT' or new.cidade_id is distinct from old.cidade_id)
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status in ('ativa', 'lista_espera')) then
    raise exception 'Ainda não chegamos a esta cidade. Entre na lista de espera.';
  end if;
  if new.zona_id is not null and not exists (select 1 from public.vagas_zonas z where z.id = new.zona_id and z.cidade_id = new.cidade_id) then
    raise exception 'Escolha uma zona da cidade da vaga.';
  end if;
  if new.confidencial and not exists (select 1 from public.vagas_empresas e where e.id = new.empresa_id and e.cnpj_conferido_em is not null) then
    raise exception 'Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.';
  end if;
  if new.modalidade = 'diaria' and (tg_op = 'INSERT' or new.data_trabalho is distinct from old.data_trabalho
                                    or new.modalidade is distinct from old.modalidade) then
    v_hoje := vagas_interno.hoje(v_fuso);
    if new.data_trabalho < v_hoje then raise exception 'A data da diária já passou. Escolha outra data.'; end if;
    if new.data_trabalho > v_hoje + 7 then raise exception 'A diária precisa ser para os próximos 7 dias.'; end if;
  end if;
  if new.comissao and not ('comissao' = any (new.beneficios)) then new.beneficios := new.beneficios || 'comissao'::text; end if;
  if 'comissao' = any (new.beneficios) then new.comissao := true; end if;
  foreach x in array array[new.funcao, new.descricao, new.requisito_outro] loop
    t := vagas_interno.conferir_texto(x, 'anuncio');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end loop;
  -- Pré-abertura (20261024120004): a vaga que passa a 'publicado' numa cidade que ainda não abriu fica marcada; no dia em
  -- que a cidade abre, publicado_em e expira_em passam a contar da abertura (gatilho vagas_cidades_abriu_anuncios).
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status is distinct from 'publicado') then
    new.pre_abertura := not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status = 'ativa');
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Publicar: IGUAL à da 20261022, aceitando a cidade em lista de espera (a vaga fica pronta e invisível até a abertura).
create or replace function public.vagas_anuncio_publicar(p_anuncio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_revisao boolean;
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
  v_revisao := e.status <> 'ativa'
    or (select count(*) from public.vagas_anuncios x where x.empresa_id = e.id and x.publicado_em is not null) < 3;
  if v_revisao then
    update public.vagas_anuncios set status = 'em_revisao', status_motivo = '' where id = a.id returning * into a;
  else
    update public.vagas_anuncios set status = 'publicado', status_motivo = '', publicado_em = now(),
      expira_em = vagas_interno.expira_calculada(a) where id = a.id returning * into a;
  end if;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a), 'emRevisao', v_revisao));
end;
$$;

-- Anúncio visto pela empresa: IGUAL ao da 20261022 + aguardaAbertura/avisoAbertura (vaga publicada numa cidade que ainda
-- não abriu: não está no ar, o prazo não corre e não conta como expirada).
create or replace function vagas_interno.anuncio_empresa(a public.vagas_anuncios)
returns jsonb language sql stable security definer set search_path = '' as $$
  select vagas_interno.anuncio_detalhe(a, true) || jsonb_build_object(
    'empresaId', a.empresa_id, 'confidencial', a.confidencial, 'diasNoAr', a.dias_no_ar, 'prazoHoras', a.prazo_horas, 'status', a.status,
    'statusMotivo', a.status_motivo, 'noAr', vagas_interno.no_ar(a),
    'expirado', a.expira_em is not null and a.expira_em <= now() and not y.aguarda,
    'encerradoEm', disc_interno.iso(a.encerrado_em), 'criadoEm', disc_interno.iso(a.criado_em),
    'atualizadoEm', disc_interno.iso(a.atualizado_em),
    'candidaturas', (select jsonb_build_object('total', count(*) filter (where k.status <> 'retirada'),
        'novas', count(*) filter (where k.status = 'enviada'), 'conversar', count(*) filter (where k.status = 'conversar'),
        'combinou', count(*) filter (where k.status = 'combinou'), 'contratada', count(*) filter (where k.status = 'contratada'))
      from public.vagas_candidaturas k where k.anuncio_id = a.id),
    'aguardaAbertura', y.aguarda,
    'avisoAbertura', case when y.aguarda then 'Sua vaga entra no ar no dia em que ' || y.nome || ' abrir.' else '' end)
  from (select a.pre_abertura and a.status = 'publicado' and c.status <> 'ativa' as aguarda, c.nome
          from public.vagas_cidades c where c.id = a.cidade_id) y;
$$;

-- A cidade abriu: as vagas publicadas antes (marcadas) passam a contar da abertura, na mesma transação. Só na passagem
-- para 'ativa'; a marca sai, então abrir de novo (ou rodar de novo) não estende nada.
create or replace function vagas_interno.cidade_abriu_anuncios()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ativa' and old.status is distinct from 'ativa' then
    update public.vagas_anuncios a set publicado_em = now(), expira_em = vagas_interno.expira_calculada(a), pre_abertura = false
     where a.cidade_id = new.id and a.pre_abertura and a.status in ('publicado', 'pausado');
  end if;
  return null;
end;
$$;
drop trigger if exists vagas_cidades_abriu_anuncios on public.vagas_cidades;
create trigger vagas_cidades_abriu_anuncios after update of status on public.vagas_cidades
  for each row execute function vagas_interno.cidade_abriu_anuncios();

-- -----------------------------------------------------------------------------
-- 2. Canal de WhatsApp da cidade (P2) e as marcas da pré-abertura nas leituras públicas
-- -----------------------------------------------------------------------------

-- Cidade: IGUAL à da 20261022 + preAbertura, aceitaEmpresas e canalWhatsapp.
create or replace function vagas_interno.cidade_json(c public.vagas_cidades)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'slug', c.slug, 'nome', c.nome, 'uf', c.uf, 'status', c.status, 'fuso', c.fuso,
    'praca', (select p.slug from public.vagas_cidades p where p.id = c.praca_id),
    'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'slug', z.slug, 'nome', z.nome, 'bairros', to_jsonb(z.bairros))
                                 order by z.ordem, z.nome)
                         from public.vagas_zonas z where z.cidade_id = c.id and z.ativa), '[]'::jsonb),
    'interessados', case when c.status = 'lista_espera' then vagas_interno.interessados(c.id) else null end,
    'metaListaEspera', c.meta_lista_espera,
    -- 20261024120004: a empresa já pode se cadastrar e anunciar (a vaga entra no ar quando a cidade abrir) e o canal de
    -- WhatsApp da cidade (só o link do canal; null quando não há).
    'preAbertura', c.status = 'lista_espera', 'aceitaEmpresas', c.status in ('ativa', 'lista_espera'),
    'canalWhatsapp', c.canal_whatsapp);
$$;

-- Equipe: cria ou altera uma cidade. IGUAL à da 20261024120000 + {canalWhatsapp}.
create or replace function public.vagas_adm_cidade_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_slug text := lower(btrim(disc_interno.texto(d -> 'slug')));
  v_status text := coalesce(nullif(disc_interno.texto(d -> 'status'), ''), 'rascunho');
  v_porte text := nullif(lower(btrim(disc_interno.texto(d -> 'porte'))), '');
  v_praca uuid := null;
  v_canal text := nullif(btrim(disc_interno.texto(d -> 'canalWhatsapp')), '');
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
  -- Canal de WhatsApp da cidade (20261024120004): só o link de um canal; '' ou null tira.
  if v_canal is not null then
    v_canal := regexp_replace(v_canal, '/+$', '');
    if v_canal !~ '^https://whatsapp\.com/channel/[0-9A-Za-z]{10,64}$' then
      return vagas_interno.erro('Link do canal de WhatsApp inválido. Use o link do canal (https://whatsapp.com/channel/...).');
    end if;
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
        ordem = case when d ? 'ordem' then coalesce(vagas_interno.inteiro(d -> 'ordem'), 0) else x.ordem end,
        canal_whatsapp = case when d ? 'canalWhatsapp' then v_canal else x.canal_whatsapp end
      where x.id = c.id
      returning * into c;
    else
      insert into public.vagas_cidades (slug, nome, uf, ibge, fuso, status, porte, praca_id, meta_lista_espera, ordem, canal_whatsapp)
      values (v_slug, disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 80), upper(btrim(disc_interno.texto(d -> 'uf'))),
        nullif(btrim(disc_interno.texto(d -> 'ibge')), ''), coalesce(nullif(btrim(disc_interno.texto(d -> 'fuso')), ''), 'America/Sao_Paulo'),
        v_status, v_porte, v_praca, vagas_interno.inteiro(d -> 'metaListaEspera'), coalesce(vagas_interno.inteiro(d -> 'ordem'), 0), v_canal)
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

-- Todas as cidades para a equipe: IGUAL à da 20261024120000 + canalWhatsapp e abertaEm.
create or replace function public.vagas_adm_cidades()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('cidades', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nome', c.nome, 'uf', c.uf, 'ibge', c.ibge, 'fuso', c.fuso, 'status', c.status, 'porte', c.porte,
      'praca', (select x.slug from public.vagas_cidades x where x.id = c.praca_id),
      'metaListaEspera', c.meta_lista_espera, 'ordem', c.ordem, 'canalWhatsapp', c.canal_whatsapp, 'abertaEm', disc_interno.iso(c.aberta_em),
      'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'slug', z.slug, 'nome', z.nome, 'bairros', to_jsonb(z.bairros),
                                   'ordem', z.ordem, 'ativa', z.ativa) order by z.ordem, z.nome)
                           from public.vagas_zonas z where z.cidade_id = c.id), '[]'::jsonb),
      'operadoresAtivos', (select count(*)::int from public.vagas_operadores o where o.cidade_id = c.id and o.ativo))
      order by c.ordem, c.nome)
    from public.vagas_cidades c), '[]'::jsonb)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 e 4. Lista de espera: origem, limites separados, isca e o caminho com Turnstile
-- -----------------------------------------------------------------------------

-- Grava o "Avise-me quando chegar" {cidade, email, perfil?, whatsapp?, origem?, site?}. p_origens = chaves da origem do
-- pedido (IP); p_humano = o Turnstile foi conferido pela Edge Function (limite maior por origem). A resposta de sucesso é
-- a MESMA com ou sem WhatsApp, com ou sem origem, e não revela se o e-mail já estava na lista (contador aproximado).
-- Regras que continuam: o primeiro WhatsApp gravado para o e-mail fica (I5); e-mail que saiu há menos de 24 h entra sem
-- WhatsApp (N2).
create or replace function vagas_interno.lista_espera_gravar(p_dados jsonb, p_origens text[], p_humano boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_perfil text := case when disc_interno.texto(d -> 'perfil') = 'empresa' then 'empresa' else 'pessoa' end;
  v_whats_txt text := btrim(disc_interno.texto(d -> 'whatsapp'));
  v_whats text := '';
  v_origem text := lower(btrim(disc_interno.texto(d -> 'origem')));
  o text;
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found or c.status in ('rascunho', 'pausada') then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status = 'ativa' then return vagas_interno.erro('Esta cidade já está aberta: faça o seu cadastro.', '{"ativa": true}'); end if;
  -- Por origem (IP): 30 por hora; com o Turnstile conferido, 300 (muita gente na mesma rede no mutirão).
  if p_origens is not null then
    foreach o in array p_origens loop
      if vagas_interno.contar('lista_entrar', o, interval '1 hour') > (case when coalesce(p_humano, false) then 300 else 30 end) then
        return vagas_interno.erro(msg, '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  -- Sem Turnstile: teto geral (robô espalhado em muitos IPs). Se ele for atingido, ligue o Turnstile (SPEC §8.1).
  if not coalesce(p_humano, false) and vagas_interno.contar('lista_total', '', interval '1 hour') > 1000 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  -- Isca (honeypot): o campo "site" fica escondido na tela; quem preenche é robô. Resposta igual à de sucesso, nada gravado.
  if btrim(disc_interno.texto(d -> 'site')) <> '' then
    return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'interessados', vagas_interno.interessados(c.id)));
  end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_whats_txt <> '' then
    v_whats := vagas_interno.normalizar_whatsapp(v_whats_txt);
    if v_whats !~ '^55[1-9][1-9]9[0-9]{8}$' then
      return vagas_interno.erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).');
    end if;
  end if;
  -- Por e-mail e por WhatsApp (só o hash com sal na chave): 5 por hora cada, exista ou não na lista (não revela nada).
  if vagas_interno.contar('lista_email', vagas_interno.hash_privado(v_email), interval '1 hour') > 5 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  if v_whats <> '' and vagas_interno.contar('lista_whats', vagas_interno.hash_privado(v_whats), interval '1 hour') > 5 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  -- N2: saiu há menos de 24 h → entra sem WhatsApp (a resposta é a mesma).
  if v_whats <> '' and vagas_interno.lista_espera_saiu_recente(c.id, v_email) then v_whats := ''; end if;
  -- Origem: lista fechada; qualquer outra coisa vira null (nunca erro).
  if v_origem = '' or not (v_origem = any (vagas_interno.lista_espera_origens())) then v_origem := null; end if;
  insert into public.vagas_lista_espera as l (cidade_id, email, perfil, whatsapp, whatsapp_em, origem)
  values (c.id, v_email, v_perfil, v_whats, case when v_whats <> '' then now() end, v_origem)
  on conflict (cidade_id, email) do update set
    -- I5: o PRIMEIRO WhatsApp gravado fica (um terceiro não troca o número de outra pessoa). A primeira origem também.
    whatsapp = case when l.whatsapp = '' and excluded.whatsapp <> '' then excluded.whatsapp else l.whatsapp end,
    whatsapp_em = case when l.whatsapp = '' and excluded.whatsapp <> '' then excluded.whatsapp_em else l.whatsapp_em end,
    origem = coalesce(l.origem, excluded.origem);
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'interessados', vagas_interno.interessados(c.id)));
end;
$$;

-- RPC pública (sem Turnstile). Com o ajuste lista_espera_captcha = 'sim', recusa: o site passa a gravar só pela Edge
-- Function, que confere o Turnstile.
create or replace function public.vagas_lista_espera_entrar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if vagas_interno.ajuste('lista_espera_captcha') = 'sim' then
    return vagas_interno.erro('Confirme que você não é um robô e tente de novo.', '{"captcha": true}');
  end if;
  return vagas_interno.lista_espera_gravar(p_dados, disc_interno.origens_requisicao(), false);
end;
$$;

-- Só para a Edge Function (ação lista_espera): a origem vem dos cabeçalhos do pedido original (p_cf, p_xff) e p_humano diz
-- se o Turnstile foi conferido. Mesmas respostas da RPC pública.
create or replace function public.vagas_conta_lista_espera(p_dados jsonb, p_cf text, p_xff text, p_humano boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.lista_espera_gravar(p_dados, vagas_interno.origens_de(p_cf, p_xff), coalesce(p_humano, false));
end;
$$;

-- Sair da lista: IGUAL à da 20261024120002, com o limite SEPARADO do entrar (10 por hora por origem).
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
  x record;
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
      if vagas_interno.contar('lista_sair', o, interval '1 hour') > 10 then
        return vagas_interno.erro('Muitas tentativas. Tente de novo mais tarde.', '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  if v_email <> '' then
    for x in delete from public.vagas_lista_espera where cidade_id = c.id and email = v_email returning email loop
      perform vagas_interno.lista_espera_saiu(c.id, x.email);
    end loop;
  end if;
  if v_whats <> '' then
    for x in update public.vagas_lista_espera set whatsapp = '', whatsapp_em = null
              where cidade_id = c.id and whatsapp = v_whats returning email loop
      perform vagas_interno.lista_espera_saiu(c.id, x.email);
    end loop;
  end if;
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'removido', true));
end;
$$;

-- Painel da praça: IGUAL ao da 20261024120000 + lista_espera.detalhe.porOrigem (e "poucos" quando algum número da
-- origem sai como null na cidade protegida).
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
  le_origem jsonb;
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
  -- Proteção de números pequenos (revisão de segurança, I1): em cidade pequena (ou sem porte), quem operou o mutirão sabe
  -- quem fez a prova e quando; um contador de pessoas que sobe (ou não) em tempo real revelaria o resultado de alguém.
  -- Então as contagens de PESSOAS (com selo, total e por teste; contratações) são "até o fim de ontem" no fuso da cidade
  -- e, abaixo de 3, saem como null + "poucos": true.
  v_protege boolean;
  v_ate timestamptz;
  selo_poucos boolean := false;
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
  v_protege := v_porte is distinct from 'grande';
  v_ate := case when v_protege then (v_hoje::timestamp) at time zone v_fuso else now() end;

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

  -- 2. Pessoas da praça com selo válido (total e por teste). Sem a migração dos testes: sem dado. Cidade protegida: selo
  --    emitido até o fim de ontem e válido ontem (não revogado até lá); abaixo de 3, null + poucos.
  if v_tem_selos then
    select count(distinct s.user_id)::int into n_selo from public.vagas_selos s
     where s.emitido_em < v_ate and (not s.revogado or s.revogado_em >= v_ate)
       and s.valido_ate >= case when v_protege then v_hoje - 1 else v_hoje end
       and exists (select 1 from public.vagas_pessoas p where p.user_id = s.user_id and (p.cidade_id = any (v_cids) or p.cidade2_id = any (v_cids)));
    select coalesce(jsonb_object_agg(t.teste, (select count(distinct s.user_id) from public.vagas_selos s
        where s.teste = t.teste and s.emitido_em < v_ate and (not s.revogado or s.revogado_em >= v_ate)
          and s.valido_ate >= case when v_protege then v_hoje - 1 else v_hoje end
          and exists (select 1 from public.vagas_pessoas p where p.user_id = s.user_id and (p.cidade_id = any (v_cids) or p.cidade2_id = any (v_cids))))),
        '{}'::jsonb)
      into selo_teste from unnest(v_testes) t(teste);
    if v_protege then
      selo_poucos := n_selo < 3 or exists (select 1 from jsonb_each_text(selo_teste) x where x.value::int < 3);
      select coalesce(jsonb_object_agg(x.key, case when x.value::int < 3 then null else x.value::int end), '{}'::jsonb)
        into selo_teste from jsonb_each_text(selo_teste) x;
    end if;

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

  -- 6. Contratações (acumulado e mês, pela cidade da vaga). Cidade protegida: até o fim de ontem; abaixo de 3, null + poucos.
  select count(*)::int, (count(*) filter (where k.contratada_em >= v_mes))::int into contr, contr_mes
    from public.vagas_candidaturas k join public.vagas_anuncios a on a.id = k.anuncio_id
   where a.cidade_id = any (v_cids) and k.status = 'contratada' and (not v_protege or k.contratada_em < v_ate);

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
  -- 14b. De onde veio o cadastro na lista (20261024120004; lista fechada + naoInformada). Cidade protegida (I1): abaixo de
  --      3, null (a tela mostra "menos de 3").
  select jsonb_object_agg(x.k, case when v_protege and x.n < 3 then null else x.n end) into le_origem
    from (select o.k, (select count(*)::int from public.vagas_lista_espera l
                        where l.cidade_id = any (v_cids) and coalesce(l.origem, 'naoInformada') = o.k) as n
            from unnest(vagas_interno.lista_espera_origens() || 'naoInformada'::text) o(k)) x;

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
    vagas_interno.indicador_json('pessoas_com_selo_por_funcao', v_porte, case when v_protege and n_selo < 3 then null else n_selo end,
      case when v_tem_selos then jsonb_build_object('poucos', selo_poucos, 'ateOntem', v_protege, 'detalhe', jsonb_build_object('porTeste', selo_teste,
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
    vagas_interno.indicador_json('contratacoes', v_porte, case when v_protege and contr < 3 then null else contr end,
      jsonb_build_object('poucos', v_protege and (contr < 3 or contr_mes < 3), 'ateOntem', v_protege,
        'detalhe', jsonb_build_object('mes', case when v_protege and contr_mes < 3 then null else contr_mes end))),
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
      jsonb_build_object('poucos', v_protege and exists (select 1 from jsonb_each(le_origem) x where x.value = 'null'::jsonb),
        'detalhe', jsonb_build_object('pessoa', le_pessoa, 'empresa', le_empresa, 'comWhatsapp', le_whats, 'porOrigem', le_origem))),
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
    vagas_interno.gatilho_parte(format('Pessoas com selo: %s ou mais', l_selo),
      case when v_protege and n_selo < 3 then case when l_selo >= 3 then false end else n_selo >= l_selo end,
      case when v_tem_selos then '{}'::jsonb else '{"semDado": true}'::jsonb end),
    vagas_interno.gatilho_parte(format('Vagas com 3 interessados com selo na janela: %s%% ou mais', a3), p3 >= a3,
      case when v_tem_selos then '{}'::jsonb else '{"semDado": true}'::jsonb end),
    vagas_interno.gatilho_parte(format('Contratações: %s ou mais', a_contr),
      case when v_protege and contr < 3 then case when a_contr >= 3 then false end else contr >= a_contr end))));
  v_viva := vagas_interno.gatilho_json('praca_viva', a_vagas is not null, jsonb_build_array(
    vagas_interno.gatilho_parte(format('Vagas no ar: %s ou mais', a_vagas), n_vagas >= a_vagas),
    vagas_interno.gatilho_parte(format('Pessoas com selo: %s ou mais', a_selo),
      case when v_protege and n_selo < 3 then case when a_selo >= 3 then false end else n_selo >= a_selo end,
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
-- Permissões do que é novo (e do que foi recriado)
-- -----------------------------------------------------------------------------

do $$
declare
  papel text;
  f text;
  autenticadas text[] := array['public.vagas_anuncio_publicar(uuid)', 'public.vagas_adm_cidade_salvar(jsonb)', 'public.vagas_adm_cidades()',
    'public.vagas_op_indicadores(text)'];
  servico text[] := array['public.vagas_conta_lista_espera(jsonb, text, text, boolean)'];
  publicas text[] := array['public.vagas_lista_espera_entrar(jsonb)', 'public.vagas_lista_espera_sair(jsonb)'];
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
  foreach f in array autenticadas || servico || publicas loop
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
-- versao_banco(): a lista da 20261024120002 + esta
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
                                       and to_regprocedure('public.vagas_conta_lista_espera(jsonb, text, text, boolean)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261024120004, 'migracoes', to_jsonb(aplicadas),
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

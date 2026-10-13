-- =============================================================================
-- Vagas sem Caos (vagas.gestaosemcaos.com.br) · Gestão sem Caos — FUNDAÇÃO: cidades, contas, pessoas, empresas,
-- anúncios, candidaturas, conversas, denúncias, moderação e operadores locais.
-- Roda DEPOIS de 20261005120000_disc.sql … 20261021120000_feedback360.sql (usa os auxiliares genéricos de disc_interno:
-- erro, iso, texto, limpar_texto, nome_valido e os de origem da requisição da 20261020). Não mexe em nenhuma tabela do DISC.
-- Idempotente e seguro sobre dados reais: só cria o que falta, recria funções, gatilhos, políticas e permissões; as
-- sementes (cidades e zonas) só entram se ainda não existirem. Nada é apagado.
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Contrato completo (tabelas, estados, RPCs, mensagens, papéis e telas previstas): docs/VAGAS-SPEC.md.
-- Mesmas regras em JavaScript (prévia e validação no navegador): vagas/js/regras.js e vagas/js/api-previa.js
-- (tests/supabase/vagas.test.js confere que o filtro de textos do banco e o do JS dão o MESMO resultado).
--
--   * Tudo em public com prefixo vagas_ e RLS em TODAS as tabelas; funções internas no schema vagas_interno (fechado,
--     como disc_interno); RPCs públicas com prefixo vagas_. Escrita SÓ pelas RPCs (nenhuma tabela aceita insert/update/
--     delete direto de anon/authenticated).
--   * Multicidade desde o dado: cidade_id em pessoa (até 2 cidades), empresa e anúncio; cidade rascunho | lista_espera |
--     ativa | pausada. Só cidade ATIVA mostra anúncios e aceita cadastro de pessoa, empresa e anúncio.
--   * Privacidade por padrão: a empresa só vê o CARTÃO CEGO (zona, experiência, escolaridade, turnos, CNH, pretensão,
--     selos) até o Combinou; nome e contato ficam em vagas_pessoa_contato e só saem por vagas_contato_pessoa (cada
--     leitura fica em vagas_acessos_contato: a pessoa vê "quem viu meu contato"). O operador e a equipe não leem pessoa
--     nem contato pela API. Campos proibidos NÃO EXISTEM (idade, gênero, estado civil, filhos, gravidez, cor, religião,
--     foto, nacionalidade, saúde, antecedentes): só "tenho 18 anos ou mais".
--   * Anúncio: salário/faixa (ou bolsa, ou valor da diária/serviço) obrigatório; termos discriminatórios e de golpe,
--     links, telefone e e-mail no texto são recusados pelo banco; diária com data, horário e valor, no ar de 48 h a 7 dias;
--     confidencial só com CNPJ conferido; as 3 primeiras vagas de cada empresa passam pela revisão; 3 denúncias de contas
--     diferentes tiram o anúncio do ar até a moderação decidir.
--   * Fluxo: Quero (pessoa) → Quero conversar / Agora não (empresa) → mensagens pela plataforma (sem dados da pessoa;
--     pedido de dinheiro, Pix, documento, link ou contato é bloqueado) → a pessoa vê qual é a empresa (confidencial) →
--     Combinou (a pessoa confirma: nome e contato liberados) → contratada (gancho futuro para o DISC; nada ligado agora).
--   * Contas: e-mail + senha, criadas SÓ pela Edge Function vagas-conta (o cadastro livre do Auth continua desligado).
--     public.garantir_primeiro_admin() passa a NUNCA promover conta do Vagas sem Caos (app_metadata.produto = 'vagas' ou
--     linha em vagas_contas).
--   * Selos de habilidade: outra migração (20261023120000_vagas_testes.sql). O cartão já chama, se existir, a função
--     vagas_interno.selos_cartao(uuid) -> jsonb (lista de selos da pessoa); sem ela, "selos": [].
--   * versao_banco() passa a conhecer esta migração (versão 20261022120000).
-- ATENÇÃO: rodar de novo a 20261005 depois desta volta garantir_primeiro_admin à versão antiga: rode esta em seguida.
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

-- Cidades (a praça = cidade-polo + entorno: o entorno aponta para o polo em praca_id).
create table if not exists public.vagas_cidades (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$' and char_length(slug) <= 60),
  nome               text not null check (char_length(btrim(nome)) between 2 and 80),
  uf                 text not null check (uf ~ '^[A-Z]{2}$'),
  ibge               text check (ibge is null or ibge ~ '^[0-9]{7}$'),
  fuso               text not null default 'America/Boa_Vista' check (fuso ~ '^[A-Za-z_]+/[A-Za-z_]+$'),
  status             text not null default 'rascunho' check (status in ('rascunho', 'lista_espera', 'ativa', 'pausada')),
  praca_id           uuid references public.vagas_cidades (id) on delete set null,
  meta_lista_espera  int check (meta_lista_espera is null or meta_lista_espera between 1 and 1000000),
  ordem              int not null default 0,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint vagas_cidades_praca_outra check (praca_id is null or praca_id <> id)
);

-- Zonas: bairros agrupados (o cartão mostra só a zona).
create table if not exists public.vagas_zonas (
  id         uuid primary key default gen_random_uuid(),
  cidade_id  uuid not null references public.vagas_cidades (id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  nome       text not null check (char_length(btrim(nome)) between 2 and 60),
  bairros    text[] not null default '{}'::text[] check (cardinality(bairros) <= 120),
  ordem      int not null default 0,
  ativa      boolean not null default true,
  constraint vagas_zonas_slug_unico unique (cidade_id, slug)
);

-- Áreas da vaga (lista fechada, "como num marketplace"): o anúncio escolhe UMA; a pessoa marca até 3 de interesse.
create table if not exists public.vagas_areas (
  slug   text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  nome   text not null check (char_length(btrim(nome)) between 2 and 80),
  ordem  int not null default 0,
  ativa  boolean not null default true
);

-- Conta do Vagas sem Caos (1 tipo por conta). 'pendente' até a pessoa confirmar o e-mail pelo link.
create table if not exists public.vagas_contas (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  tipo                 text not null check (tipo in ('pessoa', 'empresa', 'operador')),
  status               text not null default 'pendente' check (status in ('pendente', 'ativa', 'suspensa')),
  assistida_por        uuid,   -- operador/equipe que fez o cadastro assistido (sem chave estrangeira: o registro fica)
  assistida_cidade_id  uuid references public.vagas_cidades (id) on delete set null,
  suspensa_motivo      text not null default '' check (char_length(suspensa_motivo) <= 300),
  termos_versao        text not null default '' check (termos_versao = '' or termos_versao ~ '^[A-Za-z0-9._-]{1,40}$'),
  termos_aceitos_em    timestamptz,
  codigo_evento        text not null default '' check (codigo_evento ~ '^[A-Za-z0-9_-]{0,40}$'),   -- mutirão do cadastro assistido
  criado_em            timestamptz not null default now(),
  confirmada_em        timestamptz,
  ultimo_acesso_em     timestamptz
);

-- Aceites (termos, privacidade, banco de talentos com prazo). Só inclusão.
create table if not exists public.vagas_consentimentos (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references public.vagas_contas (user_id) on delete cascade,
  tipo     text not null check (tipo in ('termos', 'privacidade', 'banco_talentos')),
  versao   text not null check (versao ~ '^[A-Za-z0-9._-]{1,40}$'),
  aceito   boolean not null,
  ate      timestamptz,
  em       timestamptz not null default now()
);
create index if not exists vagas_consentimentos_user_idx on public.vagas_consentimentos (user_id, tipo, em desc);

-- Cartão da pessoa (o que a empresa vê, sem nome). NÃO existem: idade, gênero, estado civil, filhos, gravidez, cor,
-- religião, foto, nacionalidade, saúde, antecedentes. "sobre" só aparece para a empresa depois do Combinou.
create table if not exists public.vagas_pessoas (
  user_id             uuid primary key references public.vagas_contas (user_id) on delete cascade,
  cidade_id           uuid not null references public.vagas_cidades (id),
  cidade2_id          uuid references public.vagas_cidades (id),
  zona_id             uuid references public.vagas_zonas (id) on delete set null,
  maior_18            boolean not null check (maior_18),
  cargos              text[] not null default '{}'::text[] check (cardinality(cargos) between 1 and 5),
  escolaridade        text not null check (escolaridade in ('fundamental_incompleto', 'fundamental', 'medio_incompleto', 'medio',
                                                             'tecnico', 'superior_incompleto', 'superior', 'pos')),
  turnos              text[] not null default '{}'::text[]
                      check (cardinality(turnos) >= 1 and turnos <@ array['manha', 'tarde', 'noite', 'madrugada', 'fim_de_semana', 'escala']::text[]),
  cnh                 text[] not null default '{}'::text[] check (cnh <@ array['A', 'B', 'C', 'D', 'E']::text[]),
  modalidades         text[] not null default '{}'::text[]
                      check (cardinality(modalidades) >= 1 and modalidades <@ array['clt', 'temporario', 'diaria', 'freelancer', 'estagio']::text[]),
  pretensao_centavos  int check (pretensao_centavos is null or pretensao_centavos between 0 and 10000000),
  cursos              text[] not null default '{}'::text[] check (cardinality(cursos) <= 10),
  areas_interesse     text[] not null default '{}'::text[] check (cardinality(areas_interesse) <= 3),   -- slugs de vagas_areas
  sobre               text not null default '' check (char_length(sobre) <= 600),
  banco_ate           timestamptz,   -- autorização (separada, com prazo) para o banco de talentos da fase 2
  referencias_token   text unique check (referencias_token is null or referencias_token ~ '^[0-9a-f]{64}$'),  -- página pública das referências
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint vagas_pessoas_cidades_distintas check (cidade2_id is null or cidade2_id <> cidade_id)
);
create index if not exists vagas_pessoas_cidade_idx on public.vagas_pessoas (cidade_id);
-- Para o aviso de vaga nova por área (fase 2): quem tem interesse numa área.
create index if not exists vagas_pessoas_areas_idx on public.vagas_pessoas using gin (areas_interesse);

-- Nome e contato: tabela separada (a RLS protege linhas, não colunas). Só o dono lê; a empresa, só depois do Combinou.
create table if not exists public.vagas_pessoa_contato (
  user_id        uuid primary key references public.vagas_pessoas (user_id) on delete cascade,
  nome           text not null check (char_length(nome) between 5 and 120),
  whatsapp       text not null check (whatsapp ~ '^55[1-9][1-9]9[0-9]{8}$'),
  email          text not null default '' check (email = '' or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  atualizado_em  timestamptz not null default now()
);

-- Experiências: no cartão vão função e tempo; o empregador só depois do Combinou.
create table if not exists public.vagas_experiencias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.vagas_pessoas (user_id) on delete cascade,
  funcao      text not null check (char_length(btrim(funcao)) between 2 and 80),
  empregador  text not null default '' check (char_length(empregador) <= 120),
  inicio      date not null check (inicio >= date '1960-01-01' and extract(day from inicio) = 1),
  fim         date check (fim is null or (fim >= inicio and extract(day from fim) = 1)),
  informal    boolean not null default false,
  ordem       int not null default 0
);
create index if not exists vagas_experiencias_user_idx on public.vagas_experiencias (user_id, ordem);

-- Empresas (CNPJ ou MEI; numérico ou alfanumérico, com dígitos conferidos). 'ativa' = aprovada pela operação com o
-- CNPJ conferido (consulta externa não: a operação confere à mão).
create table if not exists public.vagas_empresas (
  id                  uuid primary key default gen_random_uuid(),
  cidade_id           uuid not null references public.vagas_cidades (id),
  zona_id             uuid references public.vagas_zonas (id) on delete set null,
  cnpj                text not null unique check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  mei                 boolean not null default false,
  razao_social        text not null check (char_length(btrim(razao_social)) between 2 and 160),
  nome_fantasia       text not null check (char_length(btrim(nome_fantasia)) between 2 and 120),
  setor               text not null default '' check (char_length(setor) <= 80),
  descricao           text not null default '' check (char_length(descricao) <= 800),
  whatsapp            text not null default '' check (whatsapp = '' or whatsapp ~ '^55[1-9][1-9][0-9]{8,9}$'),
  email               text not null default '' check (email = '' or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  status              text not null default 'em_analise' check (status in ('em_analise', 'ativa', 'suspensa')),
  status_motivo       text not null default '' check (char_length(status_motivo) <= 300),
  cnpj_conferido_em   timestamptz,
  cnpj_conferido_por  uuid,
  criada_por          uuid,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint vagas_empresas_ativa_conferida check (status <> 'ativa' or cnpj_conferido_em is not null)
);
create index if not exists vagas_empresas_cidade_idx on public.vagas_empresas (cidade_id, status);

create table if not exists public.vagas_empresa_membros (
  empresa_id  uuid not null references public.vagas_empresas (id) on delete cascade,
  user_id     uuid not null references public.vagas_contas (user_id) on delete cascade,
  papel       text not null default 'recrutador' check (papel in ('dono', 'recrutador')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index if not exists vagas_empresa_membros_user_idx on public.vagas_empresa_membros (user_id);

-- Anúncios (as vagas). codigo = link curto /v/K7M2QX.
create table if not exists public.vagas_anuncios (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique check (codigo ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  empresa_id             uuid not null references public.vagas_empresas (id) on delete cascade,
  cidade_id              uuid not null references public.vagas_cidades (id),
  zona_id                uuid references public.vagas_zonas (id) on delete set null,
  -- Campos fechados ("como produto de marketplace", pedido do dono; chaves do design): área, função, turno, início,
  -- experiência, escolaridade, requisitos, selo e benefícios de listas fechadas; só a descrição e o requisito "outro" são
  -- texto livre (filtrados). O título é a própria função (coluna gerada, para a página /v/ e as listas).
  area                   text not null references public.vagas_areas (slug),
  funcao                 text not null check (char_length(btrim(funcao)) between 2 and 60),
  titulo                 text generated always as (funcao) stored,
  modalidade             text not null check (modalidade in ('clt', 'temporario', 'diaria', 'freelancer', 'estagio')),
  descricao              text not null check (char_length(btrim(descricao)) between 40 and 1500),
  turno                  text not null check (turno in ('manha', 'tarde', 'noite', 'comercial', 'escala', 'a_combinar')),
  fim_de_semana          boolean not null default false,
  comissao               boolean not null default false,
  inicio                 text not null default 'imediato' check (inicio in ('imediato', 'data')),
  inicio_data            date,
  experiencia            text not null check (experiencia in ('nao_precisa', 'ate_1', '1_a_3', 'mais_3')),
  escolaridade           text not null default 'nao_exigida'
                         check (escolaridade in ('nao_exigida', 'fundamental', 'medio', 'tecnico', 'superior')),
  requisitos             text[] not null default '{}'::text[]
                         check (requisitos <@ array['cnh_a', 'cnh_b', 'cnh_d', 'curso_registro', 'disponibilidade', 'outro']::text[]),
  requisito_outro        text not null default '' check (char_length(requisito_outro) <= 80),
  selo                   text check (selo is null or selo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- teste que a vaga valoriza: informativo, NUNCA filtro
  beneficios             text[] not null default '{}'::text[]
                         check (beneficios <@ array['vt', 'refeicao', 'saude', 'moradia', 'comissao']::text[]),
  horas_dia              int check (horas_dia is null or horas_dia between 1 and 6),              -- estágio (Lei 11.788/2008)
  prazo_horas            int check (prazo_horas is null or prazo_horas between 48 and 168),       -- diária: horas no ar
  quantidade             int not null default 1 check (quantidade between 1 and 100),
  valor_min_centavos     int not null check (valor_min_centavos between 100 and 10000000),
  valor_max_centavos     int check (valor_max_centavos is null or (valor_max_centavos >= valor_min_centavos and valor_max_centavos <= 10000000)),
  valor_unidade          text not null check (valor_unidade in ('mes', 'hora', 'dia', 'servico')),
  data_trabalho          date,
  hora_inicio            time,
  hora_fim               time,
  dias_no_ar             int not null default 30 check (dias_no_ar between 7 and 60),
  confidencial           boolean not null default false,
  status                 text not null default 'rascunho'
                         check (status in ('rascunho', 'em_revisao', 'publicado', 'pausado', 'encerrado', 'suspenso', 'removido')),
  status_motivo          text not null default '' check (char_length(status_motivo) <= 300),
  publicado_em           timestamptz,
  expira_em              timestamptz,
  encerrado_em           timestamptz,
  criado_por             uuid,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  constraint vagas_anuncios_diaria check (
    (modalidade = 'diaria') = (data_trabalho is not null)
    and (modalidade <> 'diaria' or (hora_inicio is not null and hora_fim is not null))),
  constraint vagas_anuncios_unidade check (
    (modalidade in ('clt', 'temporario', 'estagio') and valor_unidade in ('mes', 'hora'))
    or (modalidade = 'diaria' and valor_unidade = 'dia')
    or (modalidade = 'freelancer' and valor_unidade in ('servico', 'hora', 'dia'))),
  constraint vagas_anuncios_no_ar check (status not in ('publicado', 'pausado') or (publicado_em is not null and expira_em is not null)),
  constraint vagas_anuncios_inicio check ((inicio = 'data') = (inicio_data is not null)),
  constraint vagas_anuncios_comissao check (comissao = ('comissao' = any (beneficios))),
  constraint vagas_anuncios_outro check (('outro' = any (requisitos)) = (requisito_outro <> '')),
  constraint vagas_anuncios_estagio check ((modalidade = 'estagio') = (horas_dia is not null)),
  constraint vagas_anuncios_prazo check ((modalidade = 'diaria') = (prazo_horas is not null))
);
create index if not exists vagas_anuncios_lista_idx on public.vagas_anuncios (cidade_id, status, publicado_em desc, id desc);
create index if not exists vagas_anuncios_empresa_idx on public.vagas_anuncios (empresa_id, criado_em desc);
create index if not exists vagas_anuncios_area_idx on public.vagas_anuncios (area, cidade_id, publicado_em desc);

-- Pular (a pessoa não quer ver de novo).
create table if not exists public.vagas_pulos (
  pessoa_id   uuid not null references public.vagas_pessoas (user_id) on delete cascade,
  anuncio_id  uuid not null references public.vagas_anuncios (id) on delete cascade,
  em          timestamptz not null default now(),
  primary key (pessoa_id, anuncio_id)
);

-- Candidaturas ("Quero"). empresa_id copiado do anúncio pelo gatilho.
create table if not exists public.vagas_candidaturas (
  id                   uuid primary key default gen_random_uuid(),
  anuncio_id           uuid not null references public.vagas_anuncios (id) on delete cascade,
  pessoa_id            uuid not null references public.vagas_pessoas (user_id) on delete cascade,
  empresa_id           uuid not null references public.vagas_empresas (id) on delete cascade,
  status               text not null default 'enviada'
                       check (status in ('enviada', 'conversar', 'agora_nao', 'combinou', 'contratada', 'recusada', 'retirada')),
  criado_em            timestamptz not null default now(),
  empresa_decidiu_em   timestamptz,
  empresa_revelada_em  timestamptz,
  combinou_em          timestamptz,
  contratada_em        timestamptz,
  pessoa_decidiu_em    timestamptz,
  contato_cortado_em   timestamptz,   -- a pessoa cortou o acesso da empresa ao contato dela (vagas_cortar_acesso)
  atualizado_em        timestamptz not null default now(),
  constraint vagas_candidaturas_unica unique (anuncio_id, pessoa_id)
);
create index if not exists vagas_candidaturas_pessoa_idx on public.vagas_candidaturas (pessoa_id, criado_em desc);
create index if not exists vagas_candidaturas_anuncio_idx on public.vagas_candidaturas (anuncio_id, criado_em);
create index if not exists vagas_candidaturas_empresa_idx on public.vagas_candidaturas (empresa_id, status);

-- Conversa pela plataforma (uma por candidatura): a empresa escreve sem ver os dados da pessoa.
create table if not exists public.vagas_conversas (
  id                     uuid primary key default gen_random_uuid(),
  candidatura_id         uuid not null unique references public.vagas_candidaturas (id) on delete cascade,
  status                 text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  criada_por             uuid,
  criada_em              timestamptz not null default now(),
  ultima_em              timestamptz not null default now(),
  lida_pessoa_em         timestamptz,
  lida_empresa_em        timestamptz,
  empresa_seguidas       int not null default 0 check (empresa_seguidas >= 0)   -- mensagens da empresa sem resposta
);

-- id gerado no aparelho: reenviar não duplica.
create table if not exists public.vagas_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.vagas_conversas (id) on delete cascade,
  autor        text not null check (autor in ('empresa', 'pessoa', 'sistema')),
  autor_user   uuid,   -- quem escreveu (nunca mostrado à pessoa)
  texto        text not null check (char_length(btrim(texto)) between 1 and 1000),
  criado_em    timestamptz not null default now()
);
create index if not exists vagas_mensagens_conversa_idx on public.vagas_mensagens (conversa_id, criado_em);

create table if not exists public.vagas_denuncias (
  id                uuid primary key default gen_random_uuid(),
  alvo              text not null check (alvo in ('anuncio', 'mensagem', 'referencia')),
  anuncio_id        uuid references public.vagas_anuncios (id) on delete cascade,
  referencia_id     uuid,   -- (chave estrangeira criada depois de vagas_referencias)
  mensagem_id       uuid references public.vagas_mensagens (id) on delete set null,
  conversa_id       uuid references public.vagas_conversas (id) on delete set null,
  empresa_id        uuid references public.vagas_empresas (id) on delete cascade,
  cidade_id         uuid,   -- gravada pelo banco (sem chave estrangeira: o histórico fica)
  autor             uuid,   -- conta que denunciou; null = sem login (não entra na regra das 3)
  origem            text check (origem is null or char_length(origem) <= 200),
  conta_no_limite   boolean not null default false,
  motivo            text not null check (motivo in ('golpe', 'cobranca', 'documento', 'discriminacao', 'falsa', 'ofensa', 'contato', 'outro')),
  detalhe           text not null default '' check (char_length(detalhe) <= 600),
  texto_denunciado  text not null default '' check (char_length(texto_denunciado) <= 1000),
  autor_mensagem    text check (autor_mensagem is null or autor_mensagem in ('empresa', 'pessoa')),
  autor_mensagem_user uuid,   -- para suspender quem escreveu sem que a moderação saiba quem é
  status            text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  decidida_por      uuid,
  decidida_em       timestamptz,
  decisao_motivo    text not null default '' check (char_length(decisao_motivo) <= 300),
  criado_em         timestamptz not null default now(),
  constraint vagas_denuncias_alvo check ((alvo = 'anuncio' and anuncio_id is not null) or alvo = 'mensagem'
                                         or (alvo = 'referencia' and referencia_id is not null))
);
create unique index if not exists vagas_denuncias_uma_por_autor on public.vagas_denuncias (alvo, coalesce(referencia_id, mensagem_id, anuncio_id), autor)
  where autor is not null;
create index if not exists vagas_denuncias_cidade_idx on public.vagas_denuncias (cidade_id, status, criado_em desc);
create index if not exists vagas_denuncias_anuncio_idx on public.vagas_denuncias (anuncio_id) where anuncio_id is not null;
-- Motivos da lista fechada (mesma lista em VAGAS_REGRAS.MOTIVOS_DENUNCIA); refeita a cada aplicação para quem já tinha a tabela.
alter table public.vagas_denuncias drop constraint if exists vagas_denuncias_motivo_check;
alter table public.vagas_denuncias add constraint vagas_denuncias_motivo_check
  check (motivo in ('golpe', 'cobranca', 'documento', 'discriminacao', 'falsa', 'ofensa', 'contato', 'outro'));

-- Registro de moderação: só inclusão (a equipe "reverte" com um registro novo).
create table if not exists public.vagas_moderacao (
  id        bigint generated always as identity primary key,
  cidade_id uuid,
  ator      uuid,
  papel     text not null check (papel in ('admin', 'operador', 'moderador', 'sistema')),
  acao      text not null check (acao ~ '^[a-z_]{3,40}$'),
  alvo      text not null check (alvo in ('empresa', 'anuncio', 'denuncia', 'conta', 'cidade', 'zona', 'operador', 'referencia')),
  alvo_id   uuid,
  motivo    text not null default '' check (char_length(motivo) <= 300),
  dados     jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and char_length(dados::text) <= 4000),
  em        timestamptz not null default now()
);
create index if not exists vagas_moderacao_cidade_idx on public.vagas_moderacao (cidade_id, em desc);

-- Operador/parceiro local: modera e cadastra na própria cidade; NÃO lê pessoa nem contato.
create table if not exists public.vagas_operadores (
  user_id             uuid not null references public.vagas_contas (user_id) on delete cascade,
  cidade_id           uuid not null references public.vagas_cidades (id) on delete cascade,
  papel               text not null default 'operador' check (papel in ('operador', 'moderador')),
  ativo               boolean not null default true,
  repasse_percentual  numeric(5, 2) not null default 0 check (repasse_percentual between 0 and 100),
  contrato_versao     text not null default '' check (char_length(contrato_versao) <= 40),
  criado_em           timestamptz not null default now(),
  primary key (user_id, cidade_id)
);
create index if not exists vagas_operadores_cidade_idx on public.vagas_operadores (cidade_id);

-- "Avise-me quando chegar": só o total por cidade é público.
create table if not exists public.vagas_lista_espera (
  id          uuid primary key default gen_random_uuid(),
  cidade_id   uuid not null references public.vagas_cidades (id) on delete cascade,
  email       text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  perfil      text not null default 'pessoa' check (perfil in ('pessoa', 'empresa')),
  criado_em   timestamptz not null default now(),
  avisado_em  timestamptz,
  constraint vagas_lista_espera_unica unique (cidade_id, email)
);

-- Quem viu o contato (cada leitura do contato por uma empresa). A pessoa vê empresa, vaga e quando.
create table if not exists public.vagas_acessos_contato (
  id              bigint generated always as identity primary key,
  candidatura_id  uuid references public.vagas_candidaturas (id) on delete set null,
  pessoa_id       uuid not null references public.vagas_pessoas (user_id) on delete cascade,
  empresa_id      uuid references public.vagas_empresas (id) on delete set null,
  empresa_nome    text not null check (char_length(empresa_nome) <= 120),
  anuncio_titulo  text not null default '' check (char_length(anuncio_titulo) <= 80),
  user_id         uuid,   -- membro da empresa que abriu
  em              timestamptz not null default now()
);
create index if not exists vagas_acessos_contato_pessoa_idx on public.vagas_acessos_contato (pessoa_id, em desc);

-- Contador dos limites anti-abuso do Vagas sem Caos (separado do DISC).
create table if not exists public.vagas_limites (
  id     bigint generated always as identity primary key,
  tipo   text not null check (tipo ~ '^[a-z_]{1,40}$'),
  chave  text not null check (char_length(chave) <= 200),
  em     timestamptz not null default now()
);
create index if not exists vagas_limites_idx on public.vagas_limites (tipo, chave, em);
create index if not exists vagas_limites_em_idx on public.vagas_limites (em);

-- Vistas da página da vaga, por dia (só o total: nada de quem viu). 1 por origem (ou conta) por anúncio por dia; a própria
-- empresa não conta. Alimentada por vagas_anuncio_vista; lida por vagas_anuncio_numeros.
create table if not exists public.vagas_anuncio_vistas (
  anuncio_id  uuid not null references public.vagas_anuncios (id) on delete cascade,
  dia         date not null,
  total       int not null default 0 check (total >= 0),
  primary key (anuncio_id, dia)
);

-- Referência profissional (pública, positiva e factual): empresa VERIFICADA recomenda quem trabalhou com ela. Só aparece
-- depois do aceite da pessoa; a pessoa oculta ou remove quando quiser. 1 por empresa por pessoa. O texto livre só aparece
-- depois da moderação da operação da cidade da empresa.
create table if not exists public.vagas_referencia_convites (
  id             uuid primary key default gen_random_uuid(),
  pessoa_id      uuid not null references public.vagas_contas (user_id) on delete cascade,
  empresa_id     uuid references public.vagas_empresas (id) on delete cascade,   -- a empresa escolhida na plataforma (ou null)
  empresa_nome   text not null default '' check (char_length(empresa_nome) <= 120),
  token          text not null unique check (token ~ '^[0-9a-f]{64}$'),
  status         text not null default 'aberto' check (status in ('aberto', 'usado', 'cancelado', 'expirado')),
  expira_em      timestamptz not null default now() + interval '30 days',
  referencia_id  uuid,
  criado_em      timestamptz not null default now(),
  usado_em       timestamptz
);
create index if not exists vagas_referencia_convites_pessoa_idx on public.vagas_referencia_convites (pessoa_id, criado_em desc);

create table if not exists public.vagas_referencias (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.vagas_empresas (id) on delete cascade,
  pessoa_id        uuid not null references public.vagas_contas (user_id) on delete cascade,
  autor            uuid,   -- membro da empresa que escreveu
  convite_id       uuid references public.vagas_referencia_convites (id) on delete set null,
  funcao           text not null check (char_length(btrim(funcao)) between 2 and 80),
  vinculo          text not null check (vinculo in ('clt', 'temporario', 'diaria', 'estagio', 'freelancer')),
  inicio           date not null check (inicio >= date '1960-01-01' and extract(day from inicio) = 1),
  fim              date check (fim is null or (fim >= inicio and extract(day from fim) = 1)),
  -- Lista fechada da psicologia (12 comportamentos observáveis; a mesma de vagas_interno.pontos_fortes()).
  pontos_fortes    text[] not null check (cardinality(pontos_fortes) between 1 and 3 and pontos_fortes <@ array['pontualidade', 'atendimento',
                     'caixa_certo', 'organizacao', 'equipe', 'aprende_rapido', 'regras_seguranca', 'comunicacao', 'iniciativa',
                     'cuidado_material', 'vendas', 'situacao_dificil']::text[]),
  recomenda_para   text[] not null default '{}'::text[] check (cardinality(recomenda_para) <= 5),
  texto            text not null default '' check (char_length(texto) <= 300),
  declaracao       boolean not null check (declaracao),
  status           text not null default 'pendente' check (status in ('pendente', 'aceita', 'ocultada', 'recusada', 'removida')),
  -- Situação do texto livre (moderação): publicado = aparece para terceiros. Nunca "aprovado/reprovado" (a palavra não vai à tela).
  texto_status     text not null default 'sem_texto' check (texto_status in ('sem_texto', 'pendente', 'publicado', 'nao_publicado')),
  texto_motivo     text not null default '' check (char_length(texto_motivo) <= 300),
  moderado_por     uuid,
  moderado_em      timestamptz,
  removida_por     text check (removida_por is null or removida_por in ('pessoa', 'moderacao')),
  origem           text not null default 'convite' check (origem in ('convite', 'candidatura', 'email')),
  criado_em        timestamptz not null default now(),
  respondida_em    timestamptz,   -- última resposta da pessoa (interno: muda ao ocultar/mostrar; NUNCA sai para a empresa)
  aceita_em        timestamptz,   -- quando a pessoa aceitou (o que a empresa vê; ocultar/mostrar/remover não mudam)
  atualizado_em    timestamptz not null default now(),
  constraint vagas_referencias_uma_por_empresa unique (empresa_id, pessoa_id),
  constraint vagas_referencias_texto check ((texto = '') = (texto_status = 'sem_texto'))
);
create index if not exists vagas_referencias_pessoa_idx on public.vagas_referencias (pessoa_id, status);
create index if not exists vagas_referencias_empresa_idx on public.vagas_referencias (empresa_id, criado_em desc);
-- Quem já tinha a tabela com os valores antigos do texto ('aprovado'/'recusado'): converte e refaz a restrição.
alter table public.vagas_referencias drop constraint if exists vagas_referencias_texto_status_check;
update public.vagas_referencias set texto_status = case texto_status when 'aprovado' then 'publicado' when 'recusado' then 'nao_publicado' else texto_status end
 where texto_status in ('aprovado', 'recusado');
alter table public.vagas_referencias add constraint vagas_referencias_texto_status_check
  check (texto_status in ('sem_texto', 'pendente', 'publicado', 'nao_publicado'));

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.vagas_denuncias'::regclass and conname = 'vagas_denuncias_referencia_fk') then
    alter table public.vagas_denuncias add constraint vagas_denuncias_referencia_fk
      foreign key (referencia_id) references public.vagas_referencias (id) on delete cascade;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Auxiliares (schema vagas_interno — fora da API, sem acesso de anon/authenticated)
-- -----------------------------------------------------------------------------

-- {ok:false, erro, ...marcas}
create or replace function vagas_interno.erro(p_msg text, p_extra jsonb default '{}'::jsonb)
returns json language sql immutable set search_path = '' as $$
  select (jsonb_build_object('ok', false, 'erro', p_msg) || coalesce(p_extra, '{}'::jsonb))::json;
$$;

-- {ok:true, ...}
create or replace function vagas_interno.ok(p jsonb default '{}'::jsonb)
returns json language sql immutable set search_path = '' as $$
  select (jsonb_build_object('ok', true) || coalesce(p, '{}'::jsonb))::json;
$$;

-- Texto para comparar: sem acento, minúsculas, só a-z 0-9 separados por 1 espaço (igual a VAGAS_REGRAS.normalizar).
create or replace function vagas_interno.normalizar(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÅáàâãäåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÕÖóòôõöÚÙÛÜúùûüÝýÿ',
    'aaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooouuuuuuuuyyy')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Padrões recusados (mesma lista, na mesma ordem, de VAGAS_REGRAS.PADROES). alvo 'normal' = texto normalizado com um
-- espaço em cada ponta; 'bruto' = o texto original em minúsculas. Só grupos sem captura (?:…) e recursos comuns ao
-- Postgres e ao JavaScript.
create or replace function vagas_interno.padroes_proibidos()
returns table (ordem int, tipo text, alvo text, padrao text)
language sql immutable set search_path = '' as $$
  select * from (values
    (10, 'golpe', 'normal', ' taxas? '),
    (11, 'golpe', 'normal', ' pix '),
    (12, 'golpe', 'normal', ' (?:deposite|depositem|depositar|faca um deposito|fazer um deposito|transfira|transferencia bancaria) '),
    (13, 'golpe', 'normal', ' (?:pague|paguem|pagar (?:a|uma) (?:taxa|inscricao|matricula|mensalidade)|pagamento antecipado|valor da inscricao|inscricao paga|cadastro pago|curso pago|kit pago|investimento inicial) '),
    (20, 'contato', 'bruto', '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'),
    (21, 'contato', 'bruto', '(?:\d[\s().-]*){8,}'),
    (22, 'contato', 'bruto', '(?:^|[\s(])@[a-z0-9_.]{3,}'),
    (30, 'link', 'bruto', '(?:https?://|www\.)[^\s]*'),
    (31, 'link', 'bruto', '[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|ly|me|gl|gd|co|io|to|info|biz|xyz|site|online|app|link|click|top|vip|tk|page|lat|shop|store)(?![a-z0-9])(?:/[^\s]*)?'),
    (40, 'documento', 'normal', ' (?:cpf|rg|identidade|selfie|senha|titulo de eleitor|dados bancarios|conta bancaria|cartao de credito|numero do cartao|foto (?:do|da|de) (?:documento|identidade|rosto)|comprovante de (?:residencia|endereco|renda)|codigo de (?:verificacao|seguranca|confirmacao|acesso)|(?:manda|mande|envie|enviar|mandar) (?:seus|seu|os|o|teus|teu) documentos?) '),
    (50, 'discriminacao', 'normal', ' (?:aparencia|boa apresentacao|bonit[ao]s?|magr[ao]s?) '),
    (51, 'discriminacao', 'normal', ' (?:idade|faixa etaria) '),
    (52, 'discriminacao', 'normal', ' ate (?:1[6-9]|[2-6][0-9]) anos '),
    (53, 'discriminacao', 'normal', ' (?:entre|de) (?:1[6-9]|[2-6][0-9]) (?:a|e) (?:1[6-9]|[2-7][0-9]) anos '),
    (54, 'discriminacao', 'normal', ' (?:solteir[ao]s?|casad[ao]s?|divorciad[ao]s?|viuv[ao]s?|estado civil) '),
    (55, 'discriminacao', 'normal', ' (?:filh[ao]s?|gravid[ao]s?|gravidez|gestante) '),
    (56, 'discriminacao', 'normal', ' (?:sexo|genero|(?:somente|apenas|so) (?:para )?(?:mulher|mulheres|homem|homens|moca|mocas|rapaz|rapazes)) '),
    (57, 'discriminacao', 'normal', ' (?:religi[a-z]*|evangelic[ao]s?|catolic[ao]s?|cor da pele|raca|etnia) '),
    (58, 'discriminacao', 'normal', ' (?:nacionalidade|estrangeir[ao]s?|venezuelan[ao]s?|(?:somente|apenas|so) (?:para )?brasileir[ao]s?) '),
    (59, 'discriminacao', 'normal', ' (?:antecedentes?|nada consta|ficha limpa|ficha criminal|certidao criminal) '),
    (60, 'discriminacao', 'normal', ' (?:deficien[a-z]*|pcd) '),
    (61, 'discriminacao', 'normal', ' (?:boa saude|saude perfeita|doenc[a-z]*|hiv) ')
  ) as t(ordem, tipo, alvo, padrao);
$$;

-- O que cada tipo de texto confere.
create or replace function vagas_interno.tipos_do_contexto(p_contexto text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_contexto
    when 'anuncio' then array['golpe', 'contato', 'link', 'discriminacao']
    when 'empresa' then array['golpe', 'contato', 'link', 'discriminacao']
    when 'mensagem' then array['golpe', 'contato', 'link', 'documento', 'discriminacao']
    when 'referencia' then array['golpe', 'contato', 'link', 'discriminacao']
    when 'cartao' then array['contato', 'link']
    when 'perfil' then array['link']
    else array[]::text[] end;
$$;

-- Mensagem de recusa (igual a VAGAS_REGRAS.mensagemTexto).
create or replace function vagas_interno.msg_texto(p_tipo text, p_trecho text, p_contexto text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_contexto = 'mensagem' then case p_tipo
      when 'golpe' then 'Mensagem bloqueada: ninguém paga para concorrer a uma vaga. Pedido de taxa, Pix ou depósito é golpe; se alguém pedir, denuncie.'
      when 'contato' then 'Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou, que libera o contato com segurança.'
      when 'link' then 'Mensagem bloqueada: não dá para mandar links por aqui.'
      when 'documento' then 'Mensagem bloqueada: não peça nem mande documento, senha, código ou dados de banco por aqui. Se alguém pedir, denuncie.'
      else 'Mensagem bloqueada: aqui não se pergunta nem se conta idade, aparência, estado civil, filhos, religião, cor, nacionalidade, saúde ou antecedentes (Lei 9.029/1995).' end
    else case p_tipo
      when 'golpe' then 'Tire o trecho "' || p_trecho || '": ninguém paga para concorrer a uma vaga, então taxa, Pix e depósito não podem aparecer.'
      when 'contato' then 'Tire o telefone, e-mail ou perfil de rede social ("' || p_trecho || '"): o contato acontece pela plataforma, depois do Combinou.'
      when 'link' then 'Tire o link "' || p_trecho || '": o contato acontece pela plataforma.'
      when 'documento' then 'Tire o pedido de documento ("' || p_trecho || '").'
      else case when p_contexto = 'referencia'
        then 'Tire o trecho "' || p_trecho || '": a referência não pode falar de aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995).'
        else 'Tire o trecho "' || p_trecho || '": o texto não pode pedir aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995 e CLT, art. 373-A).' end end
  end;
$$;

-- null = texto aceito; senão {tipo, trecho, erro}.
create or replace function vagas_interno.conferir_texto(p text, p_contexto text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  n text;
  b text;
  r record;
  m text;
begin
  if coalesce(btrim(p), '') = '' then return null; end if;
  n := ' ' || vagas_interno.normalizar(p) || ' ';
  b := lower(p);
  for r in select x.tipo, x.alvo, x.padrao from vagas_interno.padroes_proibidos() x
            where x.tipo = any (vagas_interno.tipos_do_contexto(p_contexto)) order by x.ordem loop
    m := (regexp_match(case when r.alvo = 'bruto' then b else n end, r.padrao))[1];
    if m is not null then
      m := left(btrim(m, ' ()-.'), 60);
      return jsonb_build_object('tipo', r.tipo, 'trecho', m, 'erro', vagas_interno.msg_texto(r.tipo, m, p_contexto));
    end if;
  end loop;
  return null;
end;
$$;

-- Origem informada pela Edge Function (cf-connecting-ip e x-forwarded-for do pedido original), nas mesmas chaves de
-- disc_interno.origens_requisicao (20261020): 'ip4:1.2.3.4' / 'ip6:<prefixo /64>'; sem IP: {'sem-ip'}.
create or replace function vagas_interno.origens_de(p_cf text, p_xff text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  saida text[] := array[]::text[];
  item text;
  ip inet;
  k text;
begin
  k := disc_interno.chave_ip(disc_interno.ip_de_texto(p_cf));
  if k is not null then saida := saida || k; end if;
  foreach item in array string_to_array(left(coalesce(p_xff, ''), 2000), ',') loop
    ip := disc_interno.ip_de_texto(item);
    if disc_interno.ip_publico(ip) then
      k := disc_interno.chave_ip(ip);
      if not (k = any (saida)) then saida := saida || k; end if;
      exit;
    end if;
  end loop;
  if cardinality(saida) = 0 then return array['sem-ip']; end if;
  return saida;
end;
$$;

-- Registra uma tentativa e diz quantas houve na janela (inclui a atual). Limpa o que tem mais de 8 dias.
create or replace function vagas_interno.contar(p_tipo text, p_chave text, p_janela interval)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
  k text := left(coalesce(p_chave, ''), 200);
begin
  delete from public.vagas_limites where em < now() - interval '8 days';
  insert into public.vagas_limites (tipo, chave) values (p_tipo, k);
  select count(*) into n from public.vagas_limites where tipo = p_tipo and chave = k and em > now() - p_janela;
  return n;
end;
$$;

-- Quantas tentativas na janela (sem registrar).
create or replace function vagas_interno.contagem(p_tipo text, p_chave text, p_janela interval)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.vagas_limites
   where tipo = p_tipo and chave = left(coalesce(p_chave, ''), 200) and em > now() - p_janela;
$$;

-- Data de hoje no fuso da cidade (Roraima: America/Boa_Vista, UTC-4).
create or replace function vagas_interno.hoje(p_fuso text)
returns date language sql stable set search_path = '' as $$
  select (now() at time zone coalesce(nullif(p_fuso, ''), 'America/Boa_Vista'))::date;
$$;

-- Inteiro de um valor JSON (número inteiro ou texto só com algarismos); null se não for.
create or replace function vagas_interno.inteiro(v jsonb)
returns int language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(v) = 'number' and v::text ~ '^-?[0-9]{1,9}$' then (v::text)::int
    when jsonb_typeof(v) = 'string' and btrim(v #>> '{}') ~ '^-?[0-9]{1,9}$' then (btrim(v #>> '{}'))::int
    else null end;
$$;

-- Lista de textos (limpos, sem vazios, sem repetidos — sem diferenciar maiúsculas —, na ordem recebida).
create or replace function vagas_interno.lista_texto(v jsonb, p_max_len int)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(t order by o), array[]::text[]) from (
    select distinct on (lower(t)) t, o from (
      select disc_interno.limpar_texto(e #>> '{}', p_max_len) as t, o
        from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) with ordinality as x(e, o)
       where jsonb_typeof(e) = 'string') y
     where t <> '' order by lower(t), o) z;
$$;

-- Valores de uma lista fechada (os desconhecidos são ignorados), na ordem da lista. Aceita um texto solto.
create or replace function vagas_interno.lista_enum(v jsonb, p_permitidos text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(p order by i), array[]::text[]) from unnest(p_permitidos) with ordinality as u(p, i)
   where exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v
                   when jsonb_typeof(v) = 'string' then jsonb_build_array(v) else '[]'::jsonb end) e(x) where x = p);
$$;

create or replace function vagas_interno.turnos()
returns text[] language sql immutable set search_path = '' as $$
  select array['manha', 'tarde', 'noite', 'madrugada', 'fim_de_semana', 'escala'];
$$;

create or replace function vagas_interno.escolaridades()
returns text[] language sql immutable set search_path = '' as $$
  select array['fundamental_incompleto', 'fundamental', 'medio_incompleto', 'medio', 'tecnico', 'superior_incompleto', 'superior', 'pos'];
$$;

-- Listas fechadas do anúncio (iguais às de VAGAS_REGRAS).
create or replace function vagas_interno.turnos_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['manha', 'tarde', 'noite', 'comercial', 'escala', 'a_combinar'];
$$;
create or replace function vagas_interno.experiencias_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['nao_precisa', 'ate_1', '1_a_3', 'mais_3'];
$$;
create or replace function vagas_interno.escolaridades_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['nao_exigida', 'fundamental', 'medio', 'tecnico', 'superior'];
$$;
create or replace function vagas_interno.requisitos_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['cnh_a', 'cnh_b', 'cnh_d', 'curso_registro', 'disponibilidade', 'outro'];
$$;
create or replace function vagas_interno.beneficios_vaga()
returns text[] language sql immutable set search_path = '' as $$
  select array['vt', 'refeicao', 'saude', 'moradia', 'comissao'];
$$;
-- Testes que uma vaga pode citar como "valoriza o selo" (os 5 da migração 20261023; informativo, nunca filtro).
create or replace function vagas_interno.testes_selo()
returns text[] language sql immutable set search_path = '' as $$
  select array['atendimento', 'vendas', 'administrativo', 'caixa', 'portugues'];
$$;

create or replace function vagas_interno.modalidades()
returns text[] language sql immutable set search_path = '' as $$
  select array['clt', 'temporario', 'diaria', 'freelancer', 'estagio'];
$$;

-- WhatsApp: só algarismos; 10/11 -> 55 na frente; 12/13 começando com 55 -> igual; senão ''.
create or replace function vagas_interno.normalizar_whatsapp(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when char_length(d) in (10, 11) then '55' || d
    when char_length(d) in (12, 13) and left(d, 2) = '55' then d
    else '' end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- E-mail em minúsculas e sem espaços nas pontas; '' se inválido.
create or replace function vagas_interno.email(p text)
returns text language sql immutable set search_path = '' as $$
  select case when e ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and char_length(e) <= 254 then e else '' end
  from (select lower(btrim(coalesce(p, ''))) as e) x;
$$;

-- CNPJ (numérico ou alfanumérico, IN RFB 2.229/2024): só letras/algarismos, maiúsculas.
create or replace function vagas_interno.normalizar_cnpj(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- Dígitos verificadores: valor de cada caractere = código ASCII − 48; módulo 11 com os pesos de sempre.
create or replace function vagas_interno.cnpj_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  c text := vagas_interno.normalizar_cnpj(p);
  pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s int := 0;
  r int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' or c ~ '^(.)\1{13}$' then return false; end if;
  for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * pesos1[i]; end loop;
  r := s % 11;
  if (case when r < 2 then 0 else 11 - r end) <> substr(c, 13, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(c, i, 1)) - 48) * pesos2[i]; end loop;
  r := s % 11;
  return (case when r < 2 then 0 else 11 - r end) = substr(c, 14, 1)::int;
end;
$$;

create or replace function vagas_interno.formatar_cnpj(p text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(p) = 14
    then substr(p, 1, 2) || '.' || substr(p, 3, 3) || '.' || substr(p, 6, 3) || '/' || substr(p, 9, 4) || '-' || substr(p, 13, 2)
    else coalesce(p, '') end;
$$;

-- Iniciais do nome da empresa (2 primeiras palavras, sem "de/da/do/das/dos/e").
create or replace function vagas_interno.iniciais(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(coalesce(string_agg(left(w, 1), '' order by o), ''))
  from (select w, o from regexp_split_to_table(vagas_interno.normalizar(p), ' ') with ordinality as t(w, o)
         where w ~ '^[a-z]' and w not in ('de', 'da', 'do', 'das', 'dos', 'e') order by o limit 2) x;
$$;

-- 'AAAA-MM' -> primeiro dia do mês; null se inválido.
create or replace function vagas_interno.ler_mes(p text)
returns date language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p, '')) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then (btrim(p) || '-01')::date else null end;
$$;

-- Meses de uma experiência, contando o mês de início e o de fim (sem fim = até o mês atual).
create or replace function vagas_interno.meses(p_inicio date, p_fim date)
returns int language sql stable set search_path = '' as $$
  select greatest(1, (extract(year from f)::int * 12 + extract(month from f)::int)
                   - (extract(year from p_inicio)::int * 12 + extract(month from p_inicio)::int) + 1)
  from (select coalesce(p_fim, date_trunc('month', now())::date) as f) x;
$$;

-- Código curto do anúncio (link /v/K7M2QX): 6 caracteres sem ambíguos, gerador criptográfico.
create or replace function vagas_interno.gerar_codigo_anuncio()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  h text;
  cand text;
begin
  for t in 1..30 loop
    h := replace(pg_catalog.gen_random_uuid()::text, '-', '');
    h := substr(h, 1, 12) || substr(h, 18, 15);
    cand := '';
    for k in 0..5 loop
      cand := cand || substr(alfabeto, (('x' || substr(h, k * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
    end loop;
    if not exists (select 1 from public.vagas_anuncios a where a.codigo = cand) then return cand; end if;
  end loop;
  raise exception 'Não foi possível gerar um código novo. Tente de novo.';
end;
$$;

-- Selos de habilidade da pessoa (gancho da migração dos testes: vagas_interno.selos_cartao(uuid) -> jsonb). Sem ela, [].
create or replace function vagas_interno.selos(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if to_regprocedure('vagas_interno.selos_cartao(uuid)') is null then return '[]'::jsonb; end if;
  execute 'select vagas_interno.selos_cartao($1)' into r using p_user;
  return case when jsonb_typeof(r) = 'array' then r else '[]'::jsonb end;
exception when others then
  return '[]'::jsonb;
end;
$$;

-- Foto OPCIONAL da pessoa: arquivo <user_id>/foto.jpg no bucket PRIVADO 'vagas-fotos' do Storage (sem coluna no banco: a
-- verdade é o próprio arquivo). Nunca vai para o cartão cego; a empresa só recebe uma URL assinada curta depois do Combinou
-- (Edge Function vagas-conta, ação 'foto', que confere tudo em public.vagas_conta_foto).
create or replace function vagas_interno.tem_foto(p_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  r boolean := false;
begin
  if p_user is null or to_regclass('storage.objects') is null then return false; end if;
  execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into r
    using 'vagas-fotos', p_user::text || '/foto.jpg';
  return coalesce(r, false);
exception when others then
  return false;
end;
$$;

-- Conta do Vagas sem Caos de quem chama, já conferida. Promove 'pendente' -> 'ativa' quando o e-mail foi confirmado.
-- -> {ok:true, userId, tipo} | {ok:false, erro, sessaoExpirada|semConta|suspensa|confirmar}
create or replace function vagas_interno.conta_atual(p_tipo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  c public.vagas_contas%rowtype;
  v_conf timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão expirada. Entre de novo.', 'sessaoExpirada', true);
  end if;
  select * into c from public.vagas_contas where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Esta conta não é do Vagas sem Caos.', 'semConta', true);
  end if;
  if c.status = 'suspensa' then
    return jsonb_build_object('ok', false, 'erro', 'Esta conta está suspensa. Fale com a Gestão sem Caos.', 'suspensa', true);
  end if;
  if c.status = 'pendente' then
    select u.email_confirmed_at into v_conf from auth.users u where u.id = v_uid;
    if v_conf is null then
      return jsonb_build_object('ok', false, 'erro', 'Confirme seu e-mail pelo link que enviamos antes de continuar.', 'confirmar', true);
    end if;
    update public.vagas_contas set status = 'ativa', confirmada_em = coalesce(confirmada_em, v_conf) where user_id = v_uid
      returning * into c;
    -- O consentimento (termos + privacidade, com data) só vale a partir do clique no link: é aqui que ele é gravado.
    -- Antes disso a versão fica guardada em termos_versao, sem data e sem linha em vagas_consentimentos.
    if c.termos_versao <> '' and c.termos_aceitos_em is null then
      update public.vagas_contas set termos_aceitos_em = now() where user_id = v_uid returning * into c;
      insert into public.vagas_consentimentos (user_id, tipo, versao, aceito)
      values (v_uid, 'termos', c.termos_versao, true), (v_uid, 'privacidade', c.termos_versao, true);
    end if;
  end if;
  if p_tipo is not null and c.tipo <> p_tipo then
    return jsonb_build_object('ok', false, 'erro', case p_tipo
      when 'pessoa' then 'Esta área é para quem procura emprego.'
      when 'empresa' then 'Esta área é para empresas.'
      else 'Sem permissão.' end);
  end if;
  return jsonb_build_object('ok', true, 'userId', c.user_id, 'tipo', c.tipo);
end;
$$;

-- Conta válida para agir (existe, não suspensa e com e-mail confirmado).
create or replace function vagas_interno.conta_valida(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vagas_contas c join auth.users u on u.id = c.user_id
                  where c.user_id = p_user and c.status <> 'suspensa' and u.email_confirmed_at is not null);
$$;

-- Papel de quem chama na cidade: 'admin' (equipe da Gestão sem Caos = public.e_admin()), 'operador', 'moderador' ou null.
create or replace function vagas_interno.papel_cidade(p_cidade uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when public.e_admin() then 'admin'
    else (select o.papel from public.vagas_operadores o
           where o.user_id = auth.uid() and o.cidade_id = p_cidade and o.ativo and vagas_interno.conta_valida(o.user_id)
           limit 1) end;
$$;

-- Cidades em que quem chama opera (todas, para a equipe).
create or replace function vagas_interno.cidades_operadas()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when public.e_admin() then (select coalesce(array_agg(c.id), array[]::uuid[]) from public.vagas_cidades c)
    else (select coalesce(array_agg(o.cidade_id), array[]::uuid[]) from public.vagas_operadores o
           where o.user_id = auth.uid() and o.ativo and vagas_interno.conta_valida(o.user_id)) end;
$$;

-- Registro de moderação (só inclusão).
create or replace function vagas_interno.registrar(p_cidade uuid, p_papel text, p_acao text, p_alvo text, p_alvo_id uuid,
  p_motivo text, p_dados jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
  values (p_cidade, auth.uid(), coalesce(p_papel, 'sistema'), p_acao, p_alvo, p_alvo_id,
          coalesce(disc_interno.limpar_texto(p_motivo, 300), ''), coalesce(p_dados, '{}'::jsonb));
$$;

-- Interessados na lista de espera de uma cidade, APROXIMADO: só quem entrou até o dia anterior, arredondado para baixo em
-- dezenas. Assim ninguém descobre, entrando um e-mail e olhando o contador, se aquele e-mail já estava na lista.
create or replace function vagas_interno.interessados(p_cidade uuid)
returns int language sql stable security definer set search_path = '' as $$
  select ((count(*) / 10) * 10)::int from public.vagas_lista_espera l
   where l.cidade_id = p_cidade and l.criado_em < date_trunc('day', now());
$$;

-- Cidade (com zonas ativas e, na lista de espera, o total aproximado de interessados).
create or replace function vagas_interno.cidade_json(c public.vagas_cidades)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'slug', c.slug, 'nome', c.nome, 'uf', c.uf, 'status', c.status, 'fuso', c.fuso,
    'praca', (select p.slug from public.vagas_cidades p where p.id = c.praca_id),
    'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'slug', z.slug, 'nome', z.nome, 'bairros', to_jsonb(z.bairros))
                                 order by z.ordem, z.nome)
                         from public.vagas_zonas z where z.cidade_id = c.id and z.ativa), '[]'::jsonb),
    'interessados', case when c.status = 'lista_espera' then vagas_interno.interessados(c.id) else null end,
    'metaListaEspera', c.meta_lista_espera);
$$;

-- No ar = publicado, no prazo, empresa ativa, cidade ativa e (diária) data de hoje em diante.
create or replace function vagas_interno.no_ar(a public.vagas_anuncios)
returns boolean language sql stable security definer set search_path = '' as $$
  select a.status = 'publicado' and a.expira_em > now()
    and exists (select 1 from public.vagas_empresas e where e.id = a.empresa_id and e.status = 'ativa')
    and exists (select 1 from public.vagas_cidades c where c.id = a.cidade_id and c.status = 'ativa'
                 and (a.modalidade <> 'diaria' or a.data_trabalho >= vagas_interno.hoje(c.fuso)));
$$;

-- Prazo no ar: diária fica prazo_horas (48 h a 7 dias; depois do dia do trabalho ela sai do ar sozinha); o resto, dias_no_ar.
create or replace function vagas_interno.expira_calculada(a public.vagas_anuncios)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when a.modalidade = 'diaria' then now() + make_interval(hours => coalesce(a.prazo_horas, 48))
    else now() + make_interval(days => a.dias_no_ar) end;
$$;

-- Resumo público do anúncio. p_revelar = mostrar o nome da empresa mesmo se confidencial.
create or replace function vagas_interno.anuncio_resumo(a public.vagas_anuncios, p_revelar boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'codigo', a.codigo, 'titulo', a.titulo, 'funcao', a.funcao, 'modalidade', a.modalidade,
    'area', jsonb_build_object('slug', a.area, 'nome', (select ar.nome from public.vagas_areas ar where ar.slug = a.area)),
    'turno', a.turno, 'fimDeSemana', a.fim_de_semana, 'experiencia', a.experiencia, 'comissao', a.comissao, 'selo', a.selo,
    'valor', jsonb_build_object('minCentavos', a.valor_min_centavos, 'maxCentavos', a.valor_max_centavos, 'unidade', a.valor_unidade),
    'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
    'zona', case when z.id is null then null else jsonb_build_object('slug', z.slug, 'nome', z.nome) end,
    'empresa', case when a.confidencial and not p_revelar
      then jsonb_build_object('nome', 'Empresa confidencial', 'iniciais', '', 'confidencial', true, 'conferida', e.cnpj_conferido_em is not null)
      else jsonb_build_object('nome', e.nome_fantasia, 'iniciais', vagas_interno.iniciais(e.nome_fantasia), 'confidencial', a.confidencial,
                              'conferida', e.cnpj_conferido_em is not null) end,
    'diaria', case when a.modalidade = 'diaria' then jsonb_build_object('data', to_char(a.data_trabalho, 'YYYY-MM-DD'),
      'inicio', to_char(a.hora_inicio, 'HH24:MI'), 'fim', to_char(a.hora_fim, 'HH24:MI')) else null end,
    'paraHoje', a.modalidade = 'diaria' and a.data_trabalho = vagas_interno.hoje(c.fuso),
    'quantidade', a.quantidade,
    'publicadoEm', disc_interno.iso(a.publicado_em), 'expiraEm', disc_interno.iso(a.expira_em))
  from public.vagas_cidades c
  join public.vagas_empresas e on e.id = a.empresa_id
  left join public.vagas_zonas z on z.id = a.zona_id
  where c.id = a.cidade_id;
$$;

-- Requisitos em frases curtas (para a página da vaga e a prévia do link).
create or replace function vagas_interno.requisitos_lista(p_req text[], p_outro text)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(x.t order by x.o), '[]'::jsonb) from (values
    (1, case when 'cnh_a' = any (p_req) then 'CNH categoria A' end),
    (2, case when 'cnh_b' = any (p_req) then 'CNH categoria B' end),
    (3, case when 'cnh_d' = any (p_req) then 'CNH categoria D' end),
    (4, case when 'curso_registro' = any (p_req) then 'Curso com registro na área' end),
    (5, case when 'disponibilidade' = any (p_req) then 'Disponibilidade de horário' end),
    (6, case when 'outro' = any (p_req) then nullif(p_outro, '') end)) as x(o, t) where x.t is not null;
$$;

-- Página do anúncio: resumo + descrição, requisitos, benefícios e a empresa (sem setor/descrição se confidencial).
create or replace function vagas_interno.anuncio_detalhe(a public.vagas_anuncios, p_revelar boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select x.r || jsonb_build_object('descricao', a.descricao, 'requisitos', to_jsonb(a.requisitos), 'requisitoOutro', a.requisito_outro,
      'requisitosLista', vagas_interno.requisitos_lista(a.requisitos, a.requisito_outro), 'beneficios', to_jsonb(a.beneficios),
      'escolaridade', a.escolaridade, 'inicio', a.inicio, 'inicioData', coalesce(to_char(a.inicio_data, 'YYYY-MM-DD'), ''),
      'horasDia', a.horas_dia,
      'empresa', (x.r -> 'empresa') || case when a.confidencial and not p_revelar then jsonb_build_object('setor', '', 'descricao', '')
        else jsonb_build_object('setor', e.setor, 'descricao', e.descricao) end)
  from (select vagas_interno.anuncio_resumo(a, p_revelar) as r) x
  join public.vagas_empresas e on e.id = a.empresa_id;
$$;

-- Anúncio visto pela empresa (tudo, com as contagens de candidaturas).
create or replace function vagas_interno.anuncio_empresa(a public.vagas_anuncios)
returns jsonb language sql stable security definer set search_path = '' as $$
  select vagas_interno.anuncio_detalhe(a, true) || jsonb_build_object(
    'empresaId', a.empresa_id, 'confidencial', a.confidencial, 'diasNoAr', a.dias_no_ar, 'prazoHoras', a.prazo_horas, 'status', a.status,
    'statusMotivo', a.status_motivo, 'noAr', vagas_interno.no_ar(a),
    'expirado', a.expira_em is not null and a.expira_em <= now(),
    'encerradoEm', disc_interno.iso(a.encerrado_em), 'criadoEm', disc_interno.iso(a.criado_em),
    'atualizadoEm', disc_interno.iso(a.atualizado_em),
    'candidaturas', (select jsonb_build_object('total', count(*) filter (where k.status <> 'retirada'),
        'novas', count(*) filter (where k.status = 'enviada'), 'conversar', count(*) filter (where k.status = 'conversar'),
        'combinou', count(*) filter (where k.status = 'combinou'), 'contratada', count(*) filter (where k.status = 'contratada'))
      from public.vagas_candidaturas k where k.anuncio_id = a.id));
$$;

-- Lista fechada de pontos fortes da referência profissional: os 12 comportamentos observáveis da psicologia
-- (docs/painel-cientifico/vagas/evidencias.md §4A.4), na ordem da tela. Mesma lista em VAGAS_REGRAS.PONTOS_FORTES e na
-- restrição de vagas_referencias.pontos_fortes.
create or replace function vagas_interno.pontos_fortes()
returns text[] language sql immutable set search_path = '' as $$
  select array['pontualidade', 'atendimento', 'caixa_certo', 'organizacao', 'equipe', 'aprende_rapido', 'regras_seguranca',
               'comunicacao', 'iniciativa', 'cuidado_material', 'vendas', 'situacao_dificil'];
$$;

-- Referência visível para terceiros: aceita pela pessoa e de empresa ativa (verificada).
create or replace function vagas_interno.referencia_visivel(r public.vagas_referencias)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.status = 'aceita' and exists (select 1 from public.vagas_empresas e where e.id = r.empresa_id and e.status = 'ativa');
$$;

-- Status que a EMPRESA AUTORA (e a operação) enxerga. Veto P2 da psicologia: ocultar não gera aviso nem estado visível
-- para a empresa. Depois do aceite, ocultada e removida pela própria pessoa continuam 'aceita' para quem deu; removida
-- antes do aceite = 'recusada'. Só a remoção pela moderação aparece como 'removida'.
create or replace function vagas_interno.referencia_status_empresa(r public.vagas_referencias)
returns text language sql immutable set search_path = '' as $$
  select case
    when r.status in ('aceita', 'ocultada') then 'aceita'
    when r.status = 'removida' and r.removida_por = 'pessoa' then case when r.aceita_em is not null then 'aceita' else 'recusada' end
    else r.status end;
$$;

-- A empresa p_empresa enxerga esta referência no perfil da pessoa? Visível para todos, ou é dela mesma e, para ela, 'aceita'
-- (assim a empresa autora nunca nota a ocultação pela ausência).
create or replace function vagas_interno.referencia_para_empresa(r public.vagas_referencias, p_empresas uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select vagas_interno.referencia_visivel(r)
      or (r.empresa_id = any (coalesce(p_empresas, array[]::uuid[])) and vagas_interno.referencia_status_empresa(r) = 'aceita');
$$;

-- Cartão cego: só "tem referência de empresa verificada" (veto P1: sem contagem, sem pontos fortes, sem texto).
create or replace function vagas_interno.tem_referencia(p_user uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vagas_referencias r
                  where r.pessoa_id = p_user and vagas_interno.referencia_para_empresa(r, case when p_empresa is null then null else array[p_empresa] end));
$$;

-- Referências que contam no limite de 20 em 30 dias da empresa: as que ela consegue ver (nunca a pendente por e-mail, para
-- que o contador "restantes" não revele se um e-mail tem conta de pessoa).
create or replace function vagas_interno.referencias_no_mes(p_empresa uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.vagas_referencias r
   where r.empresa_id = p_empresa and r.criado_em > now() - interval '30 days'
     and (r.origem <> 'email' or vagas_interno.referencia_status_empresa(r) = 'aceita');
$$;

-- Referência completa. p_texto_sempre: a própria pessoa e a empresa autora veem o texto antes da moderação.
create or replace function vagas_interno.referencia_json(r public.vagas_referencias, p_texto_sempre boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id,
    'empresa', jsonb_build_object('nome', e.nome_fantasia, 'conferida', e.cnpj_conferido_em is not null, 'cidade', c.nome),
    'funcao', r.funcao, 'vinculo', r.vinculo, 'inicio', to_char(r.inicio, 'YYYY-MM'), 'fim', coalesce(to_char(r.fim, 'YYYY-MM'), ''),
    'atual', r.fim is null, 'pontosFortes', to_jsonb(r.pontos_fortes), 'recomendaPara', to_jsonb(r.recomenda_para),
    'texto', case when p_texto_sempre or r.texto_status = 'publicado' then r.texto else '' end,
    'textoStatus', r.texto_status, 'criadoEm', disc_interno.iso(r.criado_em))
  from public.vagas_empresas e join public.vagas_cidades c on c.id = e.cidade_id
  where e.id = r.empresa_id;
$$;

-- Cartão cego (o que a empresa vê antes do Combinou): sem nome, foto, idade, nacionalidade, contato, "sobre" nem empregador.
-- p_empresa = a empresa que está vendo (null = a própria pessoa vendo a prévia do cartão).
create or replace function vagas_interno.cartao(p_user uuid, p_empresa uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
    'zona', case when z.id is null then null else jsonb_build_object('slug', z.slug, 'nome', z.nome) end,
    'cargos', to_jsonb(p.cargos),
    'experiencias', coalesce((select jsonb_agg(jsonb_build_object('funcao', x.funcao, 'meses', vagas_interno.meses(x.inicio, x.fim),
        'atual', x.fim is null, 'informal', x.informal) order by x.ordem, x.inicio desc)
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

-- Mensagens não lidas por um lado ('pessoa' | 'empresa') numa conversa.
create or replace function vagas_interno.nao_lidas(p_conversa uuid, p_lado text)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.vagas_mensagens m join public.vagas_conversas v on v.id = m.conversa_id
   where m.conversa_id = p_conversa and m.autor <> p_lado
     and m.criado_em > coalesce(case when p_lado = 'pessoa' then v.lida_pessoa_em else v.lida_empresa_em end, '-infinity'::timestamptz);
$$;

-- A pessoa vê o nome da empresa? Não confidencial: sempre. Confidencial: depois de "ver a empresa" ou do Combinou.
create or replace function vagas_interno.revelada(k public.vagas_candidaturas)
returns boolean language sql stable security definer set search_path = '' as $$
  select not a.confidencial or k.empresa_revelada_em is not null or k.status in ('combinou', 'contratada')
  from public.vagas_anuncios a where a.id = k.anuncio_id;
$$;

-- Candidatura vista pela pessoa.
create or replace function vagas_interno.candidatura_pessoa(k public.vagas_candidaturas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', k.id, 'status', k.status, 'criadoEm', disc_interno.iso(k.criado_em),
    'atualizadoEm', disc_interno.iso(k.atualizado_em), 'empresaRevelada', vagas_interno.revelada(k),
    'contatoCortadoEm', disc_interno.iso(k.contato_cortado_em),
    'anuncio', vagas_interno.anuncio_resumo(a, vagas_interno.revelada(k)) || jsonb_build_object('noAr', vagas_interno.no_ar(a)),
    'conversa', (select jsonb_build_object('status', v.status, 'naoLidas', vagas_interno.nao_lidas(v.id, 'pessoa'),
                        'ultimaEm', disc_interno.iso(v.ultima_em))
                   from public.vagas_conversas v where v.candidatura_id = k.id),
    'combinou', case when k.status in ('combinou', 'contratada') then jsonb_build_object('em', disc_interno.iso(k.combinou_em),
      'empresa', jsonb_build_object('nome', e.nome_fantasia, 'whatsapp', e.whatsapp, 'email', e.email)) else null end)
  from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id
  where a.id = k.anuncio_id;
$$;

-- Empresa vista por quem é membro (ou pela operação).
create or replace function vagas_interno.empresa_json(e public.vagas_empresas)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', e.id, 'cnpj', e.cnpj, 'cnpjFormatado', vagas_interno.formatar_cnpj(e.cnpj), 'mei', e.mei,
    'razaoSocial', e.razao_social, 'nomeFantasia', e.nome_fantasia, 'setor', e.setor, 'descricao', e.descricao,
    'whatsapp', e.whatsapp, 'email', e.email, 'status', e.status, 'statusMotivo', e.status_motivo,
    'cnpjConferidoEm', disc_interno.iso(e.cnpj_conferido_em),
    'cidade', (select jsonb_build_object('slug', c.slug, 'nome', c.nome) from public.vagas_cidades c where c.id = e.cidade_id),
    'zona', (select jsonb_build_object('slug', z.slug, 'nome', z.nome) from public.vagas_zonas z where z.id = e.zona_id),
    'criadoEm', disc_interno.iso(e.criado_em));
$$;

-- Membro ativo da empresa? (conta válida). p_dono = exige papel 'dono'.
create or replace function vagas_interno.membro(p_empresa uuid, p_dono boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vagas_empresa_membros m
                  where m.empresa_id = p_empresa and m.user_id = auth.uid() and m.ativo
                    and (not p_dono or m.papel = 'dono') and vagas_interno.conta_valida(m.user_id));
$$;

-- Ids para as políticas de RLS (public: o papel authenticated precisa executar). Só devolvem o que é de quem chama.
create or replace function public.vagas_ids_minhas_empresas()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.empresa_id from public.vagas_empresa_membros m
   where m.user_id = auth.uid() and m.ativo and vagas_interno.conta_valida(m.user_id);
$$;

create or replace function public.vagas_ids_minhas_cidades()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select o.cidade_id from public.vagas_operadores o
   where o.user_id = auth.uid() and o.ativo and vagas_interno.conta_valida(o.user_id);
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos (valem para qualquer caminho de escrita, inclusive a service_role)
-- -----------------------------------------------------------------------------

create or replace function vagas_interno.cidades_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.fuso) then
    raise exception 'Fuso horário inválido.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists vagas_cidades_antes_gravar on public.vagas_cidades;
create trigger vagas_cidades_antes_gravar before insert or update on public.vagas_cidades
  for each row execute function vagas_interno.cidades_antes_gravar();

-- Bairros limpos e sem repetição.
create or replace function vagas_interno.zonas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := disc_interno.limpar_texto(new.nome, 60);
  new.bairros := vagas_interno.lista_texto(to_jsonb(coalesce(new.bairros, array[]::text[])), 60);
  return new;
end;
$$;
drop trigger if exists vagas_zonas_antes_gravar on public.vagas_zonas;
create trigger vagas_zonas_antes_gravar before insert or update on public.vagas_zonas
  for each row execute function vagas_interno.zonas_antes_gravar();

-- O tipo da conta não muda depois de criada.
create or replace function vagas_interno.contas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    -- O tipo só muda enquanto a conta está pendente e o e-mail não foi confirmado (quem tem o e-mail decide; ver
    -- vagas_conta_registrar). Depois, nunca.
    if not (old.status = 'pendente' and not exists (select 1 from auth.users u where u.id = old.user_id and u.email_confirmed_at is not null)) then
      new.tipo := old.tipo;
    end if;
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;
drop trigger if exists vagas_contas_antes_gravar on public.vagas_contas;
create trigger vagas_contas_antes_gravar before insert or update on public.vagas_contas
  for each row execute function vagas_interno.contas_antes_gravar();

-- Consentimentos: só inclusão (o aceite registrado não se altera).
create or replace function vagas_interno.so_inclusao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Registro só de inclusão: não pode ser alterado.';
end;
$$;
drop trigger if exists vagas_consentimentos_so_inclusao on public.vagas_consentimentos;
create trigger vagas_consentimentos_so_inclusao before update on public.vagas_consentimentos
  for each row execute function vagas_interno.so_inclusao();
drop trigger if exists vagas_moderacao_so_inclusao on public.vagas_moderacao;
create trigger vagas_moderacao_so_inclusao before update or delete on public.vagas_moderacao
  for each row execute function vagas_interno.so_inclusao();

-- Cartão da pessoa: cidade ativa (só cidade ativa aceita cadastro), zona da cidade, textos do cartão sem contato/link.
create or replace function vagas_interno.pessoas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  x text;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
  end if;
  if (tg_op = 'INSERT' or new.cidade_id is distinct from old.cidade_id)
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status = 'ativa') then
    raise exception 'Ainda não chegamos a esta cidade. Entre na lista de espera.';
  end if;
  if new.cidade2_id is not null and (tg_op = 'INSERT' or new.cidade2_id is distinct from old.cidade2_id)
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade2_id and c.status = 'ativa') then
    raise exception 'A segunda cidade ainda não está aberta. Escolha uma cidade ativa.';
  end if;
  if new.zona_id is not null and not exists (select 1 from public.vagas_zonas z where z.id = new.zona_id and z.cidade_id = new.cidade_id) then
    raise exception 'Escolha uma zona da sua cidade.';
  end if;
  foreach x in array new.cargos || new.cursos loop
    t := vagas_interno.conferir_texto(x, 'cartao');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end loop;
  t := vagas_interno.conferir_texto(new.sobre, 'perfil');
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists vagas_pessoas_antes_gravar on public.vagas_pessoas;
create trigger vagas_pessoas_antes_gravar before insert or update on public.vagas_pessoas
  for each row execute function vagas_interno.pessoas_antes_gravar();

create or replace function vagas_interno.experiencias_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
begin
  t := coalesce(vagas_interno.conferir_texto(new.funcao, 'cartao'), vagas_interno.conferir_texto(new.empregador, 'perfil'));
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  return new;
end;
$$;
drop trigger if exists vagas_experiencias_antes_gravar on public.vagas_experiencias;
create trigger vagas_experiencias_antes_gravar before insert or update on public.vagas_experiencias
  for each row execute function vagas_interno.experiencias_antes_gravar();

-- Empresa: CNPJ conferido nos dígitos (e não muda depois), cidade ativa no cadastro, zona da cidade, textos sem golpe/contato.
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
    if not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status = 'ativa') then
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
drop trigger if exists vagas_empresas_antes_gravar on public.vagas_empresas;
create trigger vagas_empresas_antes_gravar before insert or update on public.vagas_empresas
  for each row execute function vagas_interno.empresas_antes_gravar();

-- Anúncio: código curto, zona da cidade, cidade ativa, confidencial só com CNPJ conferido, diária para os próximos 7 dias,
-- textos sem discriminação, golpe, link nem contato.
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
     and not exists (select 1 from public.vagas_cidades c where c.id = new.cidade_id and c.status = 'ativa') then
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
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists vagas_anuncios_antes_gravar on public.vagas_anuncios;
create trigger vagas_anuncios_antes_gravar before insert or update on public.vagas_anuncios
  for each row execute function vagas_interno.anuncios_antes_gravar();

-- Empresa que fica sem nenhum membro ativo (o último excluiu a conta): as vagas saem do ar (encerradas) e as conversas
-- abertas são encerradas com aviso — ninguém mais responderia às pessoas.
create or replace function vagas_interno.membros_depois_sair()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := old.empresa_id;
  k record;
begin
  if tg_op = 'UPDATE' and new.ativo then return null; end if;
  if exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = v_empresa and m.ativo) then return null; end if;
  if not exists (select 1 from public.vagas_empresas e where e.id = v_empresa) then return null; end if;
  update public.vagas_anuncios set status = 'encerrado', encerrado_em = now(), status_motivo = 'A empresa saiu da plataforma.'
   where empresa_id = v_empresa and status in ('em_revisao', 'publicado', 'pausado');
  for k in select c.id from public.vagas_candidaturas c join public.vagas_conversas v on v.candidatura_id = c.id
            where c.empresa_id = v_empresa and v.status = 'aberta' loop
    perform vagas_interno.avisar_conversa(k.id, 'A empresa saiu da plataforma. Esta conversa foi encerrada.', 'encerrada');
  end loop;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
  select e.cidade_id, null, 'sistema', 'empresa_sem_membros', 'empresa', e.id, '' from public.vagas_empresas e where e.id = v_empresa;
  return null;
end;
$$;
drop trigger if exists vagas_empresa_membros_depois_sair on public.vagas_empresa_membros;
create trigger vagas_empresa_membros_depois_sair after delete or update of ativo on public.vagas_empresa_membros
  for each row execute function vagas_interno.membros_depois_sair();

-- Candidatura: empresa copiada do anúncio; anúncio, pessoa e empresa não mudam depois.
create or replace function vagas_interno.candidaturas_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.anuncio_id := old.anuncio_id;
    new.pessoa_id := old.pessoa_id;
    new.empresa_id := old.empresa_id;
    new.criado_em := old.criado_em;
  else
    select a.empresa_id into new.empresa_id from public.vagas_anuncios a where a.id = new.anuncio_id;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists vagas_candidaturas_antes_gravar on public.vagas_candidaturas;
create trigger vagas_candidaturas_antes_gravar before insert or update on public.vagas_candidaturas
  for each row execute function vagas_interno.candidaturas_antes_gravar();

-- Mensagem: o mesmo filtro do banco para qualquer caminho (dinheiro, Pix, documento, link, contato, dado proibido).
create or replace function vagas_interno.mensagens_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
begin
  if tg_op = 'UPDATE' then raise exception 'Mensagens não podem ser alteradas.'; end if;
  new.texto := btrim(new.texto);
  if new.autor <> 'sistema' then
    t := vagas_interno.conferir_texto(new.texto, 'mensagem');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vagas_mensagens_antes_gravar on public.vagas_mensagens;
create trigger vagas_mensagens_antes_gravar before insert or update on public.vagas_mensagens
  for each row execute function vagas_interno.mensagens_antes_gravar();

-- Denúncia: cidade e empresa gravadas pelo banco.
create or replace function vagas_interno.denuncias_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.anuncio_id is null and new.conversa_id is not null then
      select k.anuncio_id into new.anuncio_id from public.vagas_conversas v join public.vagas_candidaturas k on k.id = v.candidatura_id
       where v.id = new.conversa_id;
    end if;
    if new.referencia_id is not null then
      select e.cidade_id, e.id, r.texto into new.cidade_id, new.empresa_id, new.texto_denunciado
        from public.vagas_referencias r join public.vagas_empresas e on e.id = r.empresa_id where r.id = new.referencia_id;
    else
      select a.cidade_id, a.empresa_id into new.cidade_id, new.empresa_id from public.vagas_anuncios a where a.id = new.anuncio_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vagas_denuncias_antes_gravar on public.vagas_denuncias;
create trigger vagas_denuncias_antes_gravar before insert on public.vagas_denuncias
  for each row execute function vagas_interno.denuncias_antes_gravar();

-- 3 denúncias abertas, de contas diferentes, tiram o anúncio do ar até a moderação decidir.
create or replace function vagas_interno.denuncias_depois_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
begin
  if new.alvo <> 'anuncio' or not new.conta_no_limite then return null; end if;
  select * into a from public.vagas_anuncios where id = new.anuncio_id for update;
  if not found or a.status <> 'publicado' then return null; end if;
  if (select count(distinct d.autor) from public.vagas_denuncias d
       where d.anuncio_id = a.id and d.alvo = 'anuncio' and d.conta_no_limite and d.status = 'aberta') >= 3 then
    update public.vagas_anuncios set status = 'suspenso', status_motivo = 'Fora do ar por denúncias, aguardando a moderação.'
     where id = a.id;
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
    values (a.cidade_id, null, 'sistema', 'suspender_por_denuncias', 'anuncio', a.id, '3 denúncias de contas diferentes.');
  end if;
  return null;
end;
$$;
drop trigger if exists vagas_denuncias_depois_gravar on public.vagas_denuncias;
create trigger vagas_denuncias_depois_gravar after insert on public.vagas_denuncias
  for each row execute function vagas_interno.denuncias_depois_gravar();

-- Texto de várias linhas: \r\n -> \n, controles viram espaço, espaços repetidos somem, no máximo 1 linha em branco seguida.
create or replace function vagas_interno.limpar_multilinha(p text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(replace(coalesce(p, ''), E'\r\n', E'\n'),
    '[\x01-\x09\x0B-\x1F\x7F]', ' ', 'g'), '[ ]{2,}', ' ', 'g'), E'\n{3,}', E'\n\n', 'g'), E' \n'), p_max);
$$;

-- Lista de anúncios no ar das cidades dadas, do mais novo para o mais antigo (sem ranking), 20 por página, com cursor.
-- Filtros (só sobre a VAGA): zona, modalidade[], paraHoje, busca (função e nome da área), areas[] (OU entre elas), turno[],
-- salarioMin (centavos por mês: a faixa conta pelo teto; diária = valor do dia × 22; por hora × 220; "por serviço" fica de
-- fora), semExperiencia (experiencia = 'nao_precisa'), somenteTotal (só a contagem, para o botão "Ver N vagas").
-- Regra fixa: nenhum filtro por nota, selo, referência, idade ou sexo (chaves desconhecidas são ignoradas).
-- p_pessoa: tira os que ela pulou ou em que já se candidatou. p_areas_padrao: áreas usadas quando o filtro não traz "areas".
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
       and (not v_sem_exp or x.experiencia = 'nao_precisa')
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

-- Ficha da pessoa (para ela mesma).
create or replace function vagas_interno.pessoa_json(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
    'cidade2', (select jsonb_build_object('slug', c2.slug, 'nome', c2.nome) from public.vagas_cidades c2 where c2.id = p.cidade2_id),
    'zona', (select jsonb_build_object('slug', z.slug, 'nome', z.nome) from public.vagas_zonas z where z.id = p.zona_id),
    'maior18', p.maior_18, 'cargos', to_jsonb(p.cargos), 'escolaridade', p.escolaridade, 'turnos', to_jsonb(p.turnos),
    'cnh', to_jsonb(p.cnh), 'modalidades', to_jsonb(p.modalidades), 'pretensaoCentavos', p.pretensao_centavos,
    'cursos', to_jsonb(p.cursos), 'areas', to_jsonb(p.areas_interesse), 'sobre', p.sobre, 'temFoto', vagas_interno.tem_foto(p.user_id),
    'nome', coalesce(ct.nome, ''), 'whatsapp', coalesce(ct.whatsapp, ''), 'email', coalesce(ct.email, ''),
    'experiencias', coalesce((select jsonb_agg(jsonb_build_object('funcao', x.funcao, 'empregador', x.empregador,
        'inicio', to_char(x.inicio, 'YYYY-MM'), 'fim', coalesce(to_char(x.fim, 'YYYY-MM'), ''), 'informal', x.informal) order by x.ordem)
      from public.vagas_experiencias x where x.user_id = p.user_id), '[]'::jsonb),
    'bancoTalentosAte', disc_interno.iso(p.banco_ate), 'atualizadoEm', disc_interno.iso(p.atualizado_em))
  from public.vagas_pessoas p
  join public.vagas_cidades c on c.id = p.cidade_id
  left join public.vagas_pessoa_contato ct on ct.user_id = p.user_id
  where p.user_id = p_user;
$$;

-- =============================================================================
-- Funções públicas (anon e authenticated)
-- =============================================================================

-- Cidades abertas e em lista de espera, com as zonas.
create or replace function public.vagas_cidades_publicas()
returns json language sql stable security definer set search_path = '' as $$
  select vagas_interno.ok(jsonb_build_object('cidades', coalesce((select jsonb_agg(vagas_interno.cidade_json(c) order by c.ordem, c.nome)
    from public.vagas_cidades c where c.status in ('ativa', 'lista_espera')), '[]'::jsonb)));
$$;

-- Áreas das vagas (lista fechada, na ordem da tela).
create or replace function public.vagas_areas_publicas()
returns json language sql stable security definer set search_path = '' as $$
  select vagas_interno.ok(jsonb_build_object('areas', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'nome', a.nome) order by a.ordem, a.nome)
    from public.vagas_areas a where a.ativa), '[]'::jsonb)));
$$;

-- Mural da cidade (e do entorno da praça, por padrão). Com login de pessoa e sem "areas" no filtro, usa as áreas de
-- interesse dela (devolve areasAplicadas/areasPadrao; "areas": [] mostra todas).
create or replace function public.vagas_anuncios_publicos(p_filtro jsonb)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_cids uuid[];
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(f -> 'cidade')));
  if not found or c.status = 'rascunho' then return vagas_interno.erro('Cidade não encontrada.', '{"naoEncontrada": true}'); end if;
  if c.status = 'lista_espera' then
    return vagas_interno.erro('Ainda não chegamos a esta cidade. Entre na lista de espera.', jsonb_build_object('listaEspera', true,
      'interessados', vagas_interno.interessados(c.id)));   -- aproximado, como em vagas_cidades_publicas
  end if;
  if c.status = 'pausada' then return vagas_interno.erro('As vagas desta cidade estão pausadas no momento.', '{"pausada": true}'); end if;
  v_cids := array[c.id];
  if coalesce(f -> 'entorno' <> 'false'::jsonb, true) then
    v_cids := v_cids || array(select x.id from public.vagas_cidades x where x.praca_id = c.id and x.status = 'ativa');
  end if;
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome))
    || vagas_interno.listar_anuncios(v_cids, f, null,
         (select p.areas_interesse from public.vagas_pessoas p where p.user_id = auth.uid())));
end;
$$;

-- Página da vaga pelo link curto. Com sessão de pessoa: + minhaCandidatura {id, status}.
create or replace function public.vagas_anuncio_publico(p_codigo text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_cod text := upper(btrim(coalesce(p_codigo, '')));
  a public.vagas_anuncios%rowtype;
  k public.vagas_candidaturas%rowtype;
  v_revelar boolean := false;
  v_extra jsonb := '{}'::jsonb;
begin
  if v_cod !~ '^[A-Z0-9]{6}$' then return vagas_interno.erro('Vaga não encontrada ou já encerrada.', '{"naoEncontrada": true}'); end if;
  select * into a from public.vagas_anuncios where codigo = v_cod;
  if not found or not vagas_interno.no_ar(a) then
    return vagas_interno.erro('Vaga não encontrada ou já encerrada.', '{"naoEncontrada": true}');
  end if;
  if auth.uid() is not null then
    select * into k from public.vagas_candidaturas where anuncio_id = a.id and pessoa_id = auth.uid();
    if found then
      v_revelar := vagas_interno.revelada(k);
      v_extra := jsonb_build_object('minhaCandidatura', jsonb_build_object('id', k.id, 'status', k.status));
    end if;
  end if;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_detalhe(a, v_revelar) || v_extra));
end;
$$;

-- Conta 1 vista da página da vaga (a tela chama quando uma PESSOA abre a vaga; a prévia de link do WhatsApp não chama).
-- 1 por origem (ou por conta, com login) por anúncio por dia; membro da própria empresa não conta. -> {ok:true, contada}
create or replace function public.vagas_anuncio_vista(p_codigo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cod text := upper(btrim(coalesce(p_codigo, '')));
  a public.vagas_anuncios%rowtype;
  v_chave text;
  v_fuso text;
begin
  if v_cod !~ '^[A-Z0-9]{6}$' then return vagas_interno.erro('Vaga não encontrada ou já encerrada.', '{"naoEncontrada": true}'); end if;
  select * into a from public.vagas_anuncios where codigo = v_cod;
  if not found or not vagas_interno.no_ar(a) then
    return vagas_interno.erro('Vaga não encontrada ou já encerrada.', '{"naoEncontrada": true}');
  end if;
  if auth.uid() is not null and vagas_interno.membro(a.empresa_id) then return vagas_interno.ok('{"contada": false}'); end if;
  v_chave := case when auth.uid() is not null then 'u:' || auth.uid()::text
                  else coalesce((disc_interno.origens_requisicao())[1], 'sem-ip') end;
  -- Origem muito ativa (robô): para de contar.
  if vagas_interno.contar('vista_origem', v_chave, interval '1 hour') > 120 then return vagas_interno.ok('{"contada": false}'); end if;
  if vagas_interno.contar('vista', a.id::text || ':' || v_chave, interval '1 day') > 1 then return vagas_interno.ok('{"contada": false}'); end if;
  select c.fuso into v_fuso from public.vagas_cidades c where c.id = a.cidade_id;
  insert into public.vagas_anuncio_vistas (anuncio_id, dia, total) values (a.id, vagas_interno.hoje(v_fuso), 1)
    on conflict (anuncio_id, dia) do update set total = public.vagas_anuncio_vistas.total + 1;
  return vagas_interno.ok('{"contada": true}');
end;
$$;

-- "Avise-me quando chegar" (cidade em lista de espera). Limite: 10 por hora por origem.
create or replace function public.vagas_lista_espera_entrar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_perfil text := case when disc_interno.texto(d -> 'perfil') = 'empresa' then 'empresa' else 'pessoa' end;
  v_origens text[] := disc_interno.origens_requisicao();
  o text;
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found or c.status in ('rascunho', 'pausada') then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status = 'ativa' then return vagas_interno.erro('Esta cidade já está aberta: faça o seu cadastro.', '{"ativa": true}'); end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_origens is not null then
    foreach o in array v_origens loop
      if vagas_interno.contar('lista_espera', o, interval '1 hour') > 10 then
        return vagas_interno.erro('Muitas tentativas. Tente de novo mais tarde.', '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  insert into public.vagas_lista_espera (cidade_id, email, perfil) values (c.id, v_email, v_perfil)
    on conflict (cidade_id, email) do nothing;
  -- A resposta não revela se o e-mail já estava: o contador é aproximado e não inclui quem entrou hoje.
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'interessados', vagas_interno.interessados(c.id)));
end;
$$;

-- Sair da lista de espera (LGPD): {cidade, email}. Resposta sempre igual, exista ou não o e-mail na lista.
create or replace function public.vagas_lista_espera_sair(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_email text := vagas_interno.email(disc_interno.texto(d -> 'email'));
  v_origens text[] := disc_interno.origens_requisicao();
  o text;
begin
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  if v_origens is not null then
    foreach o in array v_origens loop
      if vagas_interno.contar('lista_espera', o, interval '1 hour') > 10 then
        return vagas_interno.erro('Muitas tentativas. Tente de novo mais tarde.', '{"bloqueado": true}');
      end if;
    end loop;
  end if;
  delete from public.vagas_lista_espera where cidade_id = c.id and email = v_email;
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'removido', true));
end;
$$;

-- Denúncia de anúncio (com ou sem login) ou de mensagem (só quem participa da conversa). Só a de conta conta para a
-- regra das 3. Limites: 20 por dia por conta; 5 por dia por origem sem login.
create or replace function public.vagas_denunciar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_alvo text := disc_interno.texto(d -> 'alvo');
  v_id text := btrim(disc_interno.texto(d -> 'id'));
  v_motivo text := disc_interno.texto(d -> 'motivo');
  v_detalhe text := disc_interno.limpar_texto(disc_interno.texto(d -> 'detalhe'), 600);
  v_uid uuid := auth.uid();
  v_conta jsonb;
  v_origens text[];
  v_origem text := null;
  o text;
  a public.vagas_anuncios%rowtype;
  m public.vagas_mensagens%rowtype;
  v public.vagas_conversas%rowtype;
  k public.vagas_candidaturas%rowtype;
  r public.vagas_referencias%rowtype;
  v_uuid boolean := v_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if v_motivo not in ('golpe', 'cobranca', 'documento', 'discriminacao', 'falsa', 'ofensa', 'contato', 'outro') then
    return vagas_interno.erro('Escolha o motivo da denúncia.');
  end if;
  if v_uid is not null then
    v_conta := vagas_interno.conta_atual(null);
    if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
    if vagas_interno.contar('denuncia_conta', v_uid::text, interval '1 day') > 20 then
      return vagas_interno.erro('Muitas denúncias em pouco tempo. Tente de novo amanhã.', '{"bloqueado": true}');
    end if;
  else
    v_origens := disc_interno.origens_requisicao();
    if v_origens is not null then
      v_origem := v_origens[1];
      foreach o in array v_origens loop
        if vagas_interno.contar('denuncia_origem', o, interval '1 day') > 5 then
          return vagas_interno.erro('Muitas denúncias em pouco tempo. Tente de novo amanhã.', '{"bloqueado": true}');
        end if;
      end loop;
    end if;
  end if;

  if v_alvo = 'anuncio' then
    if v_uuid then select * into a from public.vagas_anuncios where id = v_id::uuid;
    else select * into a from public.vagas_anuncios where codigo = upper(v_id); end if;
    if not found or a.status in ('rascunho', 'removido') then return vagas_interno.erro('Vaga não encontrada ou já encerrada.'); end if;
    if v_uid is not null and exists (select 1 from public.vagas_denuncias x where x.alvo = 'anuncio' and x.anuncio_id = a.id and x.autor = v_uid) then
      return vagas_interno.ok('{"recebida": true, "duplicado": true}');
    end if;
    insert into public.vagas_denuncias (alvo, anuncio_id, autor, origem, conta_no_limite, motivo, detalhe)
    values ('anuncio', a.id, v_uid, v_origem, v_uid is not null, v_motivo, v_detalhe);
  elsif v_alvo = 'mensagem' then
    if v_uid is null then return vagas_interno.erro('Entre na sua conta para denunciar uma mensagem.', '{"sessaoExpirada": true}'); end if;
    if not v_uuid then return vagas_interno.erro('Mensagem não encontrada.'); end if;
    select * into m from public.vagas_mensagens where id = v_id::uuid;
    if not found then return vagas_interno.erro('Mensagem não encontrada.'); end if;
    select * into v from public.vagas_conversas where id = m.conversa_id;
    select * into k from public.vagas_candidaturas where id = v.candidatura_id;
    if not ((k.pessoa_id = v_uid and m.autor = 'empresa') or (m.autor = 'pessoa' and vagas_interno.membro(k.empresa_id))) then
      return vagas_interno.erro('Mensagem não encontrada.');
    end if;
    if exists (select 1 from public.vagas_denuncias x where x.alvo = 'mensagem' and x.mensagem_id = m.id and x.autor = v_uid) then
      return vagas_interno.ok('{"recebida": true, "duplicado": true}');
    end if;
    insert into public.vagas_denuncias (alvo, anuncio_id, mensagem_id, conversa_id, autor, conta_no_limite, motivo, detalhe,
      texto_denunciado, autor_mensagem, autor_mensagem_user)
    values ('mensagem', k.anuncio_id, m.id, v.id, v_uid, true, v_motivo, v_detalhe, left(m.texto, 1000), m.autor, m.autor_user);
  elsif v_alvo = 'referencia' then
    if v_uid is null then return vagas_interno.erro('Entre na sua conta para denunciar uma referência.', '{"sessaoExpirada": true}'); end if;
    if not v_uuid then return vagas_interno.erro('Referência não encontrada.'); end if;
    -- Só a própria pessoa ou quem vê a referência (visível); a empresa autora nunca (a resposta não pode denunciar a ocultação).
    select * into r from public.vagas_referencias where id = v_id::uuid and status <> 'removida';
    if not found or r.empresa_id in (select public.vagas_ids_minhas_empresas())
       or not (r.pessoa_id = v_uid or vagas_interno.referencia_visivel(r)) then
      return vagas_interno.erro('Referência não encontrada.');
    end if;
    if exists (select 1 from public.vagas_denuncias x where x.alvo = 'referencia' and x.referencia_id = r.id and x.autor = v_uid) then
      return vagas_interno.ok('{"recebida": true, "duplicado": true}');
    end if;
    insert into public.vagas_denuncias (alvo, referencia_id, autor, conta_no_limite, motivo, detalhe)
    values ('referencia', r.id, v_uid, false, v_motivo, v_detalhe);
  else
    return vagas_interno.erro('Denúncia inválida.');
  end if;
  return vagas_interno.ok('{"recebida": true}');
end;
$$;

-- =============================================================================
-- Conta (qualquer tipo)
-- =============================================================================

-- Quem sou eu no Vagas sem Caos. A equipe da Gestão sem Caos (public.e_admin()) sem conta do Vagas: {conta:null, admin:true}.
create or replace function public.vagas_eu()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_conta jsonb;
  c public.vagas_contas%rowtype;
  v_email text;
begin
  if v_uid is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  v_conta := vagas_interno.conta_atual(null);
  if not (v_conta ->> 'ok')::boolean then
    if (v_conta ->> 'semConta') is not null and public.e_admin() then
      return vagas_interno.ok(jsonb_build_object('conta', null, 'admin', true, 'pessoa', null, 'empresas', '[]'::jsonb,
        'operador', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.slug, 'nome', x.nome, 'papel', 'admin') order by x.ordem, x.nome)
                                from public.vagas_cidades x), '[]'::jsonb)));
    end if;
    return v_conta::json;
  end if;
  update public.vagas_contas set ultimo_acesso_em = now() where user_id = v_uid returning * into c;
  select u.email into v_email from auth.users u where u.id = v_uid;
  return vagas_interno.ok(jsonb_build_object(
    'conta', jsonb_build_object('tipo', c.tipo, 'status', c.status, 'email', coalesce(v_email, ''), 'termosVersao', c.termos_versao,
      'termosAceitosEm', disc_interno.iso(c.termos_aceitos_em), 'criadoEm', disc_interno.iso(c.criado_em)),
    'admin', public.e_admin(),
    'pessoa', case when c.tipo = 'pessoa' then jsonb_build_object(
      'completo', exists (select 1 from public.vagas_pessoas p join public.vagas_pessoa_contato ct on ct.user_id = p.user_id where p.user_id = v_uid),
      'cidades', coalesce((select to_jsonb(array_remove(array[(select x.slug from public.vagas_cidades x where x.id = p.cidade_id),
                                                              (select x.slug from public.vagas_cidades x where x.id = p.cidade2_id)], null))
                             from public.vagas_pessoas p where p.user_id = v_uid), '[]'::jsonb),
      'referenciasPendentes', (select count(*)::int from public.vagas_referencias r where r.pessoa_id = v_uid and r.status = 'pendente'))
      else null end,
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia, 'papel', m.papel, 'status', e.status)
                                 order by e.nome_fantasia)
                            from public.vagas_empresa_membros m join public.vagas_empresas e on e.id = m.empresa_id
                           where m.user_id = v_uid and m.ativo), '[]'::jsonb),
    'operador', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.slug, 'nome', x.nome, 'papel', o.papel) order by x.ordem, x.nome)
                            from public.vagas_operadores o join public.vagas_cidades x on x.id = o.cidade_id
                           where o.user_id = v_uid and o.ativo), '[]'::jsonb)));
end;
$$;

-- Aceite dos termos e da privacidade (por versão) e, para a pessoa, a autorização do banco de talentos (12 meses).
-- Texto final dos termos: conteudo/vagas-textos/.
create or replace function public.vagas_aceitar_termos(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual(null);
  v_uid uuid := auth.uid();
  v_versao text := btrim(disc_interno.texto(d -> 'versao'));
  v_banco boolean;
  v_ate timestamptz := null;
  c public.vagas_contas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if v_versao !~ '^[A-Za-z0-9._-]{1,40}$' then return vagas_interno.erro('Versão dos termos inválida.'); end if;
  update public.vagas_contas set termos_versao = v_versao, termos_aceitos_em = now() where user_id = v_uid returning * into c;
  insert into public.vagas_consentimentos (user_id, tipo, versao, aceito) values (v_uid, 'termos', v_versao, true), (v_uid, 'privacidade', v_versao, true);
  if d ? 'bancoTalentos' and c.tipo = 'pessoa' then
    v_banco := coalesce(d -> 'bancoTalentos' = 'true'::jsonb, false);
    if v_banco then v_ate := now() + interval '180 days'; end if;   -- prazo de conteudo/vagas-textos (pessoa_banco_talentos)
    insert into public.vagas_consentimentos (user_id, tipo, versao, aceito, ate) values (v_uid, 'banco_talentos', v_versao, v_banco, v_ate);
    update public.vagas_pessoas set banco_ate = v_ate where user_id = v_uid;
  end if;
  return vagas_interno.ok(jsonb_build_object('termosVersao', c.termos_versao, 'termosAceitosEm', disc_interno.iso(c.termos_aceitos_em),
    'bancoTalentosAte', coalesce((select disc_interno.iso(p.banco_ate) from public.vagas_pessoas p where p.user_id = v_uid), '')));
end;
$$;

-- =============================================================================
-- Pessoa (quem procura emprego)
-- =============================================================================

create or replace function public.vagas_pessoa_minha()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('pessoa', vagas_interno.pessoa_json(v_uid), 'cartao', vagas_interno.cartao(v_uid, null),
    'completo', exists (select 1 from public.vagas_pessoas p join public.vagas_pessoa_contato ct on ct.user_id = p.user_id where p.user_id = v_uid)));
end;
$$;

-- Currículo em 5 passos (salva tudo de uma vez; chaves desconhecidas — idade, foto, gênero… — são ignoradas: esses
-- campos não existem).
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
    return vagas_interno.erro('WhatsApp inválido. Use DDD + número de celular (ex.: 95 99123-4567).');
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

-- Vagas das cidades da pessoa (sem as puladas e as que já pediu).
create or replace function public.vagas_feed(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
  p public.vagas_pessoas%rowtype;
  v_cids uuid[];
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into p from public.vagas_pessoas where user_id = v_uid;
  if not found then return vagas_interno.erro('Complete seu cadastro para ver as vagas.', '{"completar": true}'); end if;
  v_cids := array(select c.id from public.vagas_cidades c where c.id in (p.cidade_id, p.cidade2_id) and c.status = 'ativa');
  return vagas_interno.ok(vagas_interno.listar_anuncios(v_cids, p_filtro, v_uid, p.areas_interesse));
end;
$$;

-- "Quero": candidatura em 1 toque. Limite: 30 por dia.
create or replace function public.vagas_quero(p_anuncio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
  a public.vagas_anuncios%rowtype;
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not exists (select 1 from public.vagas_pessoas p join public.vagas_pessoa_contato ct on ct.user_id = p.user_id where p.user_id = v_uid) then
    return vagas_interno.erro('Complete seu cadastro antes de se candidatar.', '{"completar": true}');
  end if;
  select * into a from public.vagas_anuncios where id = p_anuncio;
  if not found or not vagas_interno.no_ar(a) then return vagas_interno.erro('Vaga não encontrada ou já encerrada.'); end if;
  if vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Esta vaga é da sua empresa.'); end if;
  select * into k from public.vagas_candidaturas where anuncio_id = a.id and pessoa_id = v_uid for update;
  if found then
    if k.status <> 'retirada' then
      return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k), 'duplicado', true));
    end if;
    update public.vagas_candidaturas set status = 'enviada', pessoa_decidiu_em = null where id = k.id returning * into k;
  else
    if vagas_interno.contar('quero', v_uid::text, interval '1 day') > 30 then
      return vagas_interno.erro('Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.', '{"bloqueado": true}');
    end if;
    begin
      insert into public.vagas_candidaturas (anuncio_id, pessoa_id, empresa_id) values (a.id, v_uid, a.empresa_id) returning * into k;
    exception
      when unique_violation then
        -- Dois "Quero" ao mesmo tempo (toque duplo): o segundo devolve a candidatura que o primeiro gravou.
        select * into k from public.vagas_candidaturas where anuncio_id = a.id and pessoa_id = v_uid;
        return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k), 'duplicado', true));
    end;
  end if;
  delete from public.vagas_pulos where pessoa_id = v_uid and anuncio_id = a.id;
  return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k)));
end;
$$;

-- "Pular": a vaga some do feed da pessoa.
create or replace function public.vagas_pular(p_anuncio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not exists (select 1 from public.vagas_pessoas p where p.user_id = v_uid) then
    return vagas_interno.erro('Complete seu cadastro para ver as vagas.', '{"completar": true}');
  end if;
  if not exists (select 1 from public.vagas_anuncios a where a.id = p_anuncio) then
    return vagas_interno.erro('Vaga não encontrada ou já encerrada.');
  end if;
  insert into public.vagas_pulos (pessoa_id, anuncio_id) values (v_uid, p_anuncio) on conflict do nothing;
  return vagas_interno.ok();
end;
$$;

-- Candidatura da própria pessoa (para as ações dela).
create or replace function vagas_interno.minha_candidatura(p_candidatura uuid)
returns public.vagas_candidaturas language sql stable security definer set search_path = '' as $$
  select * from public.vagas_candidaturas k where k.id = p_candidatura and k.pessoa_id = auth.uid();
$$;

-- Mensagem automática na conversa (se existir) e, se pedido, fecha ou reabre a conversa.
create or replace function vagas_interno.avisar_conversa(p_candidatura uuid, p_texto text, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.vagas_conversas where candidatura_id = p_candidatura;
  if v_id is null then return; end if;
  insert into public.vagas_mensagens (conversa_id, autor, texto) values (v_id, 'sistema', p_texto);
  update public.vagas_conversas set ultima_em = now(), status = coalesce(p_status, status) where id = v_id;
end;
$$;

-- Retirar a candidatura (antes do Combinou).
create or replace function public.vagas_retirar(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.minha_candidatura(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status in ('combinou', 'contratada') then return vagas_interno.erro('O contato já foi liberado. Avise a empresa pela conversa.'); end if;
  if k.status not in ('retirada', 'recusada') then
    update public.vagas_candidaturas set status = 'retirada', pessoa_decidiu_em = now() where id = k.id returning * into k;
    perform vagas_interno.avisar_conversa(k.id, 'A pessoa retirou a candidatura.', 'encerrada');
  end if;
  return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k)));
end;
$$;

create or replace function public.vagas_minhas_candidaturas()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('candidaturas', coalesce((select jsonb_agg(vagas_interno.candidatura_pessoa(k) order by k.atualizado_em desc)
    from public.vagas_candidaturas k where k.pessoa_id = auth.uid()), '[]'::jsonb)));
end;
$$;

-- Aceitar conversar: mostra qual é a empresa (vaga confidencial) ANTES de liberar o contato da pessoa.
create or replace function public.vagas_ver_empresa(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  k public.vagas_candidaturas%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.minha_candidatura(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status not in ('conversar', 'combinou', 'contratada') then
    return vagas_interno.erro('A empresa ainda não pediu para conversar.');
  end if;
  if k.empresa_revelada_em is null then
    update public.vagas_candidaturas set empresa_revelada_em = now() where id = k.id returning * into k;
  end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  return vagas_interno.ok(jsonb_build_object('empresa', jsonb_build_object('nome', e.nome_fantasia, 'razaoSocial', e.razao_social,
      'cnpjFormatado', vagas_interno.formatar_cnpj(e.cnpj), 'setor', e.setor, 'descricao', e.descricao,
      'cidade', (select c.nome from public.vagas_cidades c where c.id = e.cidade_id), 'conferidaEm', disc_interno.iso(e.cnpj_conferido_em)),
    'candidatura', vagas_interno.candidatura_pessoa(k)));
end;
$$;

-- Combinou: a pessoa confirma e libera nome e contato para a empresa (e recebe o contato da empresa).
create or replace function public.vagas_combinar(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  k public.vagas_candidaturas%rowtype;
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_dup boolean := false;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  -- Tranca a candidatura: dois "Combinou" ao mesmo tempo viram um Combinou e um "duplicado" (uma só mensagem de sistema).
  select * into k from public.vagas_candidaturas where id = p_candidatura and pessoa_id = auth.uid() for update;
  if not found then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  if k.status in ('combinou', 'contratada') then
    v_dup := k.contato_cortado_em is null;
    if not v_dup then
      -- A pessoa tinha cortado o acesso e volta a liberar o contato.
      update public.vagas_candidaturas set contato_cortado_em = null, pessoa_decidiu_em = now() where id = k.id returning * into k;
      perform vagas_interno.avisar_conversa(k.id, 'A pessoa voltou a compartilhar o contato.', 'aberta');
    end if;
  else
    if k.status = 'enviada' then return vagas_interno.erro('A empresa ainda não pediu para conversar.'); end if;
    if k.status <> 'conversar' then return vagas_interno.erro('Esta candidatura foi encerrada.'); end if;
    if a.status in ('suspenso', 'removido') or e.status <> 'ativa' then return vagas_interno.erro('Esta vaga está fora do ar.'); end if;
    if a.confidencial and k.empresa_revelada_em is null then
      return vagas_interno.erro('Veja primeiro qual é a empresa.', '{"verEmpresa": true}');
    end if;
    update public.vagas_candidaturas set status = 'combinou', combinou_em = now(), pessoa_decidiu_em = now(),
      empresa_revelada_em = coalesce(empresa_revelada_em, now()) where id = k.id returning * into k;
    if not exists (select 1 from public.vagas_conversas v where v.candidatura_id = k.id) then
      insert into public.vagas_conversas (candidatura_id) values (k.id);
    end if;
    perform vagas_interno.avisar_conversa(k.id, 'Combinou! O contato foi liberado para os dois lados.', 'aberta');
  end if;
  return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k),
    'empresa', jsonb_build_object('nome', e.nome_fantasia, 'whatsapp', e.whatsapp, 'email', e.email), 'duplicado', v_dup));
end;
$$;

-- Recusar o convite da empresa (antes do Combinou).
create or replace function public.vagas_recusar(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.minha_candidatura(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status in ('combinou', 'contratada') then return vagas_interno.erro('O contato já foi liberado. Avise a empresa pela conversa.'); end if;
  if k.status not in ('retirada', 'recusada') then
    update public.vagas_candidaturas set status = 'recusada', pessoa_decidiu_em = now() where id = k.id returning * into k;
    perform vagas_interno.avisar_conversa(k.id, 'A pessoa preferiu não seguir com esta vaga.', 'encerrada');
  end if;
  return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k)));
end;
$$;

-- "Quem viu meu contato": empresa, vaga e quando (agrupado por candidatura), com o que dá para fazer: cortar o acesso
-- (vagas_cortar_acesso) ou voltar a liberar (vagas_combinar).
create or replace function public.vagas_quem_viu_meu_contato()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('acessos', coalesce((select jsonb_agg(jsonb_build_object('candidaturaId', x.candidatura_id,
      'empresa', x.empresa_nome, 'anuncio', x.anuncio_titulo, 'primeiraVez', disc_interno.iso(x.primeira),
      'ultimaVez', disc_interno.iso(x.ultima), 'vezes', x.vezes, 'cortadoEm', disc_interno.iso(k.contato_cortado_em),
      'podeCortar', k.id is not null and k.status in ('combinou', 'contratada') and k.contato_cortado_em is null)
      order by x.ultima desc)
    from (select l.candidatura_id, max(l.empresa_nome) as empresa_nome, max(l.anuncio_titulo) as anuncio_titulo,
                 min(l.em) as primeira, max(l.em) as ultima, count(*)::int as vezes
            from public.vagas_acessos_contato l where l.pessoa_id = auth.uid()
           group by l.candidatura_id, case when l.candidatura_id is null then l.id end) x
    left join public.vagas_candidaturas k on k.id = x.candidatura_id and k.pessoa_id = auth.uid()), '[]'::jsonb)));
end;
$$;

-- A pessoa corta o acesso da empresa ao contato dela (depois do Combinou). A empresa deixa de abrir o contato e de
-- escrever na conversa; o que já foi visto continua registrado em "quem viu". Desfazer: vagas_combinar de novo.
create or replace function public.vagas_cortar_acesso(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  k public.vagas_candidaturas%rowtype;
  v_dup boolean := false;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.minha_candidatura(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status not in ('combinou', 'contratada') then
    return vagas_interno.erro('Seu contato não foi liberado para esta empresa.');
  end if;
  if k.contato_cortado_em is not null then
    v_dup := true;
  else
    update public.vagas_candidaturas set contato_cortado_em = now(), pessoa_decidiu_em = now() where id = k.id returning * into k;
    perform vagas_interno.avisar_conversa(k.id, 'A pessoa encerrou a conversa e deixou de compartilhar o contato.', 'encerrada');
  end if;
  return vagas_interno.ok(jsonb_build_object('candidatura', vagas_interno.candidatura_pessoa(k), 'duplicado', v_dup));
end;
$$;

-- =============================================================================
-- Empresa (quem contrata: CNPJ ou MEI)
-- =============================================================================

-- Lê os dados de cadastro de uma empresa. -> {ok:true, campos:{...}} | {ok:false, erro}
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
  if c.status <> 'ativa' then return jsonb_build_object('ok', false, 'erro', 'Ainda não chegamos a esta cidade. Entre na lista de espera.'); end if;
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

-- Grava a empresa lida por ler_empresa. -> a linha
create or replace function vagas_interno.inserir_empresa(p_campos jsonb, p_status text, p_criada_por uuid)
returns public.vagas_empresas language sql volatile security definer set search_path = '' as $$
  insert into public.vagas_empresas (cidade_id, zona_id, cnpj, mei, razao_social, nome_fantasia, setor, descricao, whatsapp, email,
    status, cnpj_conferido_em, cnpj_conferido_por, criada_por)
  values ((p_campos ->> 'cidadeId')::uuid, nullif(p_campos ->> 'zonaId', '')::uuid, p_campos ->> 'cnpj', (p_campos ->> 'mei')::boolean,
    p_campos ->> 'razaoSocial', p_campos ->> 'nomeFantasia', p_campos ->> 'setor', p_campos ->> 'descricao', p_campos ->> 'whatsapp',
    p_campos ->> 'email', p_status, case when p_status = 'ativa' then now() else null end,
    case when p_status = 'ativa' then p_criada_por else null end, p_criada_por)
  returning *;
$$;

-- A conta da empresa cadastra a empresa (fica 'em_analise' até a operação conferir o CNPJ).
create or replace function public.vagas_empresa_cadastrar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  v_uid uuid := auth.uid();
  v jsonb;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if (select count(*) from public.vagas_empresa_membros m where m.user_id = v_uid and m.papel = 'dono') >= 5 then
    return vagas_interno.erro('Esta conta já cadastrou o máximo de empresas. Fale com a Gestão sem Caos.');
  end if;
  v := vagas_interno.ler_empresa(d);
  if not (v ->> 'ok')::boolean then return vagas_interno.erro(v ->> 'erro'); end if;
  begin
    e := vagas_interno.inserir_empresa(v -> 'campos', 'em_analise', v_uid);
    insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values (e.id, v_uid, 'dono');
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when unique_violation then return vagas_interno.erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
    when check_violation or not_null_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  return vagas_interno.ok(jsonb_build_object('empresa', vagas_interno.empresa_json(e) || jsonb_build_object('papel', 'dono')));
end;
$$;

-- Dados básicos da empresa (só quem é dono(a)): nomeFantasia, setor, descricao, whatsapp, email, zona. Só as chaves enviadas mudam.
-- CNPJ, razão social, MEI e cidade só pela operação.
create or replace function public.vagas_empresa_salvar(p_empresa uuid, p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  e public.vagas_empresas%rowtype;
  v_txt text;
  v_zona uuid;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found or not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if not vagas_interno.membro(p_empresa, true) then
    return vagas_interno.erro('Só quem é dono(a) da conta da empresa pode alterar estes dados.');
  end if;
  if d ? 'nomeFantasia' then
    v_txt := disc_interno.limpar_texto(disc_interno.texto(d -> 'nomeFantasia'), 120);
    if char_length(v_txt) < 2 then return vagas_interno.erro('Informe o nome da empresa.'); end if;
    e.nome_fantasia := v_txt;
  end if;
  if d ? 'setor' then e.setor := disc_interno.limpar_texto(disc_interno.texto(d -> 'setor'), 80); end if;
  if d ? 'descricao' then
    v_txt := disc_interno.texto(d -> 'descricao');
    if char_length(v_txt) > 800 then return vagas_interno.erro('A descrição pode ter até 800 caracteres.'); end if;
    e.descricao := vagas_interno.limpar_multilinha(v_txt, 800);
  end if;
  if d ? 'whatsapp' then
    v_txt := btrim(disc_interno.texto(d -> 'whatsapp'));
    if v_txt = '' then e.whatsapp := '';
    else
      e.whatsapp := vagas_interno.normalizar_whatsapp(v_txt);
      if e.whatsapp !~ '^55[1-9][1-9][0-9]{8,9}$' then return vagas_interno.erro('WhatsApp da empresa inválido.'); end if;
    end if;
  end if;
  if d ? 'email' then
    v_txt := btrim(disc_interno.texto(d -> 'email'));
    e.email := case when v_txt = '' then '' else vagas_interno.email(v_txt) end;
    if v_txt <> '' and e.email = '' then return vagas_interno.erro('E-mail da empresa inválido.'); end if;
  end if;
  if d ? 'zona' then
    if btrim(disc_interno.texto(d -> 'zona')) = '' then e.zona_id := null;
    else
      select z.id into v_zona from public.vagas_zonas z where z.cidade_id = e.cidade_id and z.slug = lower(btrim(disc_interno.texto(d -> 'zona')));
      if v_zona is null then return vagas_interno.erro('Escolha uma zona da cidade da empresa.'); end if;
      e.zona_id := v_zona;
    end if;
  end if;
  begin
    update public.vagas_empresas set nome_fantasia = e.nome_fantasia, setor = e.setor, descricao = e.descricao, whatsapp = e.whatsapp,
      email = e.email, zona_id = e.zona_id where id = e.id returning * into e;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  return vagas_interno.ok(jsonb_build_object('empresa', vagas_interno.empresa_json(e)));
end;
$$;

create or replace function public.vagas_minhas_empresas()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('empresas', coalesce((select jsonb_agg(vagas_interno.empresa_json(e) || jsonb_build_object(
      'papel', m.papel,
      'anuncios', (select jsonb_build_object('total', count(*), 'noAr', count(*) filter (where vagas_interno.no_ar(a)),
          'rascunhos', count(*) filter (where a.status = 'rascunho'), 'emRevisao', count(*) filter (where a.status = 'em_revisao'))
        from public.vagas_anuncios a where a.empresa_id = e.id),
      'candidaturasNovas', (select count(*)::int from public.vagas_candidaturas k where k.empresa_id = e.id and k.status = 'enviada'))
      order by e.nome_fantasia)
    from public.vagas_empresa_membros m join public.vagas_empresas e on e.id = m.empresa_id
   where m.user_id = auth.uid() and m.ativo), '[]'::jsonb)));
end;
$$;

-- Primeiro valor presente entre as chaves (camelCase do contrato + snake_case usado nas telas do design).
create or replace function vagas_interno.chave(d jsonb, variadic p_chaves text[])
returns jsonb language sql immutable set search_path = '' as $$
  select (select d -> k from unnest(p_chaves) with ordinality as x(k, i) where d ? k order by i limit 1);
$$;

-- Lê o anúncio (campos fechados; chaves em docs/VAGAS-SPEC.md §8.4). -> {ok:true, campos:{...}} | {ok:false, erro}
create or replace function vagas_interno.ler_anuncio(d jsonb, p_cidade_padrao uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_area text := lower(btrim(disc_interno.texto(d -> 'area')));
  v_funcao text := disc_interno.limpar_texto(disc_interno.texto(d -> 'funcao'), 60);
  v_mod text := disc_interno.texto(d -> 'modalidade');
  v_desc text := disc_interno.texto(d -> 'descricao');
  v_turno text := disc_interno.texto(d -> 'turno');
  v_exp text := disc_interno.texto(d -> 'experiencia');
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

-- Grava (cria ou atualiza) o anúncio com os campos lidos por ler_anuncio. Erros do gatilho sobem como exceção.
create or replace function vagas_interno.gravar_anuncio(p_id uuid, p_empresa uuid, f jsonb, p_autor uuid)
returns public.vagas_anuncios language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
begin
  if p_id is null then
    insert into public.vagas_anuncios (empresa_id, cidade_id, zona_id, area, funcao, modalidade, descricao, turno, fim_de_semana,
      comissao, inicio, inicio_data, experiencia, escolaridade, requisitos, requisito_outro, selo, beneficios, horas_dia, prazo_horas,
      quantidade, valor_min_centavos, valor_max_centavos, valor_unidade, data_trabalho, hora_inicio, hora_fim, dias_no_ar,
      confidencial, criado_por)
    values (p_empresa, (f ->> 'cidadeId')::uuid, nullif(f ->> 'zonaId', '')::uuid, f ->> 'area', f ->> 'funcao',
      f ->> 'modalidade', f ->> 'descricao', f ->> 'turno', (f ->> 'fimDeSemana')::boolean, (f ->> 'comissao')::boolean, f ->> 'inicio',
      (f ->> 'inicioData')::date, f ->> 'experiencia', f ->> 'escolaridade', array(select jsonb_array_elements_text(f -> 'requisitos')),
      f ->> 'requisitoOutro', f ->> 'selo', array(select jsonb_array_elements_text(f -> 'beneficios')), (f ->> 'horasDia')::int,
      (f ->> 'prazoHoras')::int, (f ->> 'quantidade')::int, (f ->> 'valorMin')::int, (f ->> 'valorMax')::int, f ->> 'unidade',
      (f ->> 'data')::date, (f ->> 'horaInicio')::time, (f ->> 'horaFim')::time, (f ->> 'diasNoAr')::int,
      (f ->> 'confidencial')::boolean, p_autor)
    returning * into a;
  else
    update public.vagas_anuncios set cidade_id = (f ->> 'cidadeId')::uuid, zona_id = nullif(f ->> 'zonaId', '')::uuid,
      area = f ->> 'area', funcao = f ->> 'funcao', modalidade = f ->> 'modalidade', descricao = f ->> 'descricao',
      turno = f ->> 'turno', fim_de_semana = (f ->> 'fimDeSemana')::boolean, comissao = (f ->> 'comissao')::boolean,
      inicio = f ->> 'inicio', inicio_data = (f ->> 'inicioData')::date, experiencia = f ->> 'experiencia',
      escolaridade = f ->> 'escolaridade', requisitos = array(select jsonb_array_elements_text(f -> 'requisitos')),
      requisito_outro = f ->> 'requisitoOutro', selo = f ->> 'selo',
      beneficios = array(select jsonb_array_elements_text(f -> 'beneficios')), horas_dia = (f ->> 'horasDia')::int,
      prazo_horas = (f ->> 'prazoHoras')::int, quantidade = (f ->> 'quantidade')::int,
      valor_min_centavos = (f ->> 'valorMin')::int, valor_max_centavos = (f ->> 'valorMax')::int, valor_unidade = f ->> 'unidade',
      data_trabalho = (f ->> 'data')::date, hora_inicio = (f ->> 'horaInicio')::time, hora_fim = (f ->> 'horaFim')::time,
      dias_no_ar = (f ->> 'diasNoAr')::int, confidencial = (f ->> 'confidencial')::boolean
    where id = p_id returning * into a;
  end if;
  return a;
end;
$$;

-- Cria (rascunho) ou altera um anúncio. {id?} altera; senão {empresaId} cria.
create or replace function public.vagas_anuncio_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  v_uid uuid := auth.uid();
  v_id text := btrim(disc_interno.texto(d -> 'id'));
  v_emp text := btrim(disc_interno.texto(d -> 'empresaId'));
  re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if v_id <> '' then
    if v_id !~ re then return vagas_interno.erro('Vaga não encontrada.'); end if;
    select * into a from public.vagas_anuncios where id = v_id::uuid;
    if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
    if a.status = 'removido' then return vagas_interno.erro('Esta vaga foi removida pela moderação e não pode ser editada.'); end if;
    if a.status = 'suspenso' then return vagas_interno.erro('Esta vaga está fora do ar, aguardando a moderação.'); end if;
    select * into e from public.vagas_empresas where id = a.empresa_id;
  else
    if v_emp !~ re then return vagas_interno.erro('Empresa não encontrada.'); end if;
    select * into e from public.vagas_empresas where id = v_emp::uuid;
    if not found or not vagas_interno.membro(e.id) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  end if;
  if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.'); end if;
  v := vagas_interno.ler_anuncio(d, coalesce(a.cidade_id, e.cidade_id));
  if not (v ->> 'ok')::boolean then return vagas_interno.erro(v ->> 'erro'); end if;
  -- Limite de vagas novas por dia (conta só as que passaram na validação).
  if a.id is null and vagas_interno.contar('anuncio_novo', e.id::text, interval '1 day') > 30 then
    return vagas_interno.erro('Muitas vagas criadas hoje. Tente de novo amanhã.', '{"bloqueado": true}');
  end if;
  begin
    a := vagas_interno.gravar_anuncio(a.id, e.id, v -> 'campos', v_uid);
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation or foreign_key_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

-- Publicar um rascunho. Empresa ainda em análise ou com menos de 3 vagas já aprovadas: vai para a revisão.
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
  if not exists (select 1 from public.vagas_cidades c where c.id = a.cidade_id and c.status = 'ativa') then
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

-- pausar | retomar | encerrar | renovar
create or replace function public.vagas_anuncio_acao(p_anuncio uuid, p_acao text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if a.status in ('suspenso', 'removido') then return vagas_interno.erro('Esta vaga está fora do ar pela moderação.'); end if;
  if p_acao = 'pausar' then
    if a.status <> 'publicado' then return vagas_interno.erro('Só dá para pausar uma vaga que está no ar.'); end if;
    update public.vagas_anuncios set status = 'pausado' where id = a.id returning * into a;
  elsif p_acao = 'retomar' then
    if a.status <> 'pausado' then return vagas_interno.erro('Só dá para retomar uma vaga pausada.'); end if;
    if a.expira_em <= now() then return vagas_interno.erro('O prazo desta vaga acabou. Use "Renovar".'); end if;
    if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.'); end if;
    update public.vagas_anuncios set status = 'publicado' where id = a.id returning * into a;
  elsif p_acao = 'encerrar' then
    if a.status <> 'encerrado' then
      update public.vagas_anuncios set status = 'encerrado', encerrado_em = now() where id = a.id returning * into a;
    end if;
  elsif p_acao = 'renovar' then
    if a.modalidade = 'diaria' then return vagas_interno.erro('Para outra data, crie uma diária nova.'); end if;
    if a.status not in ('publicado', 'pausado', 'encerrado') then return vagas_interno.erro('Só dá para renovar uma vaga que já foi publicada.'); end if;
    if e.status <> 'ativa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.'); end if;
    update public.vagas_anuncios set status = 'publicado', encerrado_em = null, expira_em = vagas_interno.expira_calculada(a)
     where id = a.id returning * into a;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

create or replace function public.vagas_anuncios_empresa(p_empresa uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('anuncios', coalesce((select jsonb_agg(vagas_interno.anuncio_empresa(a) order by a.criado_em desc)
    from public.vagas_anuncios a where a.empresa_id = p_empresa), '[]'::jsonb)));
end;
$$;

-- Números da vaga para a empresa (só totais, nunca quem): vistas, Quero (sem as retiradas), com selo válido, conversas
-- abertas pela empresa, Combinou (inclui contratadas) e contratadas.
create or replace function public.vagas_anuncio_numeros(p_anuncio uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into a from public.vagas_anuncios where id = p_anuncio;
  if not found or not vagas_interno.membro(a.empresa_id) then return vagas_interno.erro('Vaga não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('anuncio', jsonb_build_object('id', a.id, 'codigo', a.codigo, 'titulo', a.titulo, 'status', a.status,
      'publicadoEm', disc_interno.iso(a.publicado_em)),
    'numeros', jsonb_build_object(
      'vistas', coalesce((select sum(v.total)::int from public.vagas_anuncio_vistas v where v.anuncio_id = a.id), 0),
      'quero', (select count(*)::int from public.vagas_candidaturas k where k.anuncio_id = a.id and k.status <> 'retirada'),
      'comSelo', (select count(*)::int from public.vagas_candidaturas k where k.anuncio_id = a.id and k.status <> 'retirada'
                    and jsonb_array_length(vagas_interno.selos(k.pessoa_id)) > 0),
      'conversas', (select count(*)::int from public.vagas_conversas v join public.vagas_candidaturas k on k.id = v.candidatura_id
                     where k.anuncio_id = a.id),
      'combinou', (select count(*)::int from public.vagas_candidaturas k where k.anuncio_id = a.id and k.status in ('combinou', 'contratada')),
      'contratadas', (select count(*)::int from public.vagas_candidaturas k where k.anuncio_id = a.id and k.status = 'contratada'))));
end;
$$;

-- Cartões cegos de quem disse "Quero", por ordem de chegada (sem ranking). Filtros só da lista fechada:
-- status, zona, escolaridadeMin, experienciaMinMeses, turnos, cnh, pretensaoMaxCentavos, temSelo.
create or replace function public.vagas_cartoes(p_anuncio uuid, p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  a public.vagas_anuncios%rowtype;
  v_status text[] := vagas_interno.lista_enum(f -> 'status', array['enviada', 'conversar', 'agora_nao', 'combinou', 'contratada', 'recusada']);
  v_zonas text[] := vagas_interno.lista_texto(case when jsonb_typeof(f -> 'zona') = 'string' then jsonb_build_array(f -> 'zona') else f -> 'zona' end, 60);
  v_esc int := array_position(vagas_interno.escolaridades(), disc_interno.texto(f -> 'escolaridadeMin'));
  v_exp int := vagas_interno.inteiro(f -> 'experienciaMinMeses');
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
       and (v_esc is null or array_position(vagas_interno.escolaridades(), p.escolaridade) >= v_esc)
       and (v_exp is null or coalesce((select sum(vagas_interno.meses(x.inicio, x.fim)) from public.vagas_experiencias x where x.user_id = p.user_id), 0) >= v_exp)
       and (cardinality(v_turnos) = 0 or p.turnos && v_turnos)
       and (cardinality(v_cnh) = 0 or p.cnh @> v_cnh)
       and (v_pret is null or p.pretensao_centavos is null or p.pretensao_centavos <= v_pret)) x;
  -- Sem filtro por selo, nota ou referência (veto P3): o selo é só informação no cartão; a chave "temSelo" é ignorada.
  return vagas_interno.ok(jsonb_build_object('anuncio', jsonb_build_object('id', a.id, 'codigo', a.codigo, 'titulo', a.titulo, 'status', a.status),
    'cartoes', lista, 'total', jsonb_array_length(lista)));
end;
$$;

-- Candidatura vista por um membro da empresa (ou null).
create or replace function vagas_interno.candidatura_da_empresa(p_candidatura uuid)
returns public.vagas_candidaturas language sql stable security definer set search_path = '' as $$
  select k.* from public.vagas_candidaturas k where k.id = p_candidatura and vagas_interno.membro(k.empresa_id);
$$;

-- "Quero conversar" | "Agora não".
create or replace function public.vagas_empresa_decidir(p_candidatura uuid, p_decisao text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.candidatura_da_empresa(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if p_decisao is null or p_decisao not in ('conversar', 'agora_nao') then return vagas_interno.erro('Decisão inválida.'); end if;
  if k.status in ('combinou', 'contratada') then return vagas_interno.erro('O Combinou já aconteceu: a decisão não muda mais.'); end if;
  if k.status in ('retirada', 'recusada') then return vagas_interno.erro('A pessoa encerrou esta candidatura.'); end if;
  if k.status <> p_decisao then
    update public.vagas_candidaturas set status = p_decisao, empresa_decidiu_em = now() where id = k.id returning * into k;
    if p_decisao = 'agora_nao' then
      perform vagas_interno.avisar_conversa(k.id, 'A empresa seguiu com outras pessoas nesta vaga.', 'encerrada');
    else
      update public.vagas_conversas set status = 'aberta' where candidatura_id = k.id;
    end if;
  end if;
  return vagas_interno.ok(jsonb_build_object('candidaturaId', k.id, 'status', k.status));
end;
$$;

-- Nome, contato e currículo completo: SÓ depois do Combinou. Cada leitura fica em vagas_acessos_contato.
create or replace function public.vagas_contato_pessoa(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  k public.vagas_candidaturas%rowtype;
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  ct public.vagas_pessoa_contato%rowtype;
  p public.vagas_pessoas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.candidatura_da_empresa(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status not in ('combinou', 'contratada') then
    return vagas_interno.erro('O contato só aparece depois do Combinou.', '{"semCombinou": true}');
  end if;
  if k.contato_cortado_em is not null then
    return vagas_interno.erro('A pessoa deixou de compartilhar o contato com a sua empresa.', '{"contatoCortado": true}');
  end if;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  -- Empresa suspensa pela moderação não lê mais o contato (a pessoa não sabe da suspensão para cortar o acesso).
  if e.status <> 'ativa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}'); end if;
  if vagas_interno.contar('contato_empresa', k.empresa_id::text, interval '1 day') > 300 then
    return vagas_interno.erro('Muitas consultas de contato hoje. Tente de novo amanhã.', '{"bloqueado": true}');
  end if;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  select * into ct from public.vagas_pessoa_contato where user_id = k.pessoa_id;
  select * into p from public.vagas_pessoas where user_id = k.pessoa_id;
  insert into public.vagas_acessos_contato (candidatura_id, pessoa_id, empresa_id, empresa_nome, anuncio_titulo, user_id)
  values (k.id, k.pessoa_id, k.empresa_id, e.nome_fantasia, a.titulo, auth.uid());
  return vagas_interno.ok(jsonb_build_object('pessoa', jsonb_build_object('nome', ct.nome, 'whatsapp', ct.whatsapp, 'email', ct.email,
    'sobre', p.sobre, 'temFoto', vagas_interno.tem_foto(k.pessoa_id), 'cartao', vagas_interno.cartao(k.pessoa_id, k.empresa_id),
    'referencias', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, false) order by coalesce(r.fim, current_date) desc, r.inicio desc)
      from public.vagas_referencias r where r.pessoa_id = k.pessoa_id and vagas_interno.referencia_para_empresa(r, array[k.empresa_id])), '[]'::jsonb),
    'experiencias', coalesce((select jsonb_agg(jsonb_build_object('funcao', x.funcao, 'empregador', x.empregador,
        'inicio', to_char(x.inicio, 'YYYY-MM'), 'fim', coalesce(to_char(x.fim, 'YYYY-MM'), ''), 'informal', x.informal) order by x.ordem)
      from public.vagas_experiencias x where x.user_id = k.pessoa_id), '[]'::jsonb))));
end;
$$;

-- Contratada (gancho futuro para o Mapa DISC de integração; nada é ligado ao DISC agora).
create or replace function public.vagas_marcar_contratada(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  k public.vagas_candidaturas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  k := vagas_interno.candidatura_da_empresa(p_candidatura);
  if k.id is null then return vagas_interno.erro('Candidatura não encontrada.'); end if;
  if k.status = 'combinou' then
    update public.vagas_candidaturas set status = 'contratada', contratada_em = now() where id = k.id returning * into k;
  elsif k.status <> 'contratada' then
    return vagas_interno.erro('Só dá para marcar como contratada depois do Combinou.');
  end if;
  return vagas_interno.ok(jsonb_build_object('candidaturaId', k.id, 'status', k.status));
end;
$$;

-- =============================================================================
-- Conversa pela plataforma (a empresa escreve sem ver os dados da pessoa)
-- =============================================================================

-- Lado de quem chama na candidatura: 'pessoa', 'empresa' ou null.
create or replace function vagas_interno.lado(k public.vagas_candidaturas)
returns text language sql stable security definer set search_path = '' as $$
  select case when k.id is null then null when k.pessoa_id = auth.uid() then 'pessoa'
              when vagas_interno.membro(k.empresa_id) then 'empresa' else null end;
$$;

create or replace function public.vagas_conversa(p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual(null);
  k public.vagas_candidaturas%rowtype;
  a public.vagas_anuncios%rowtype;
  v public.vagas_conversas%rowtype;
  v_lado text;
  v_pode boolean;
  v_outro text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into k from public.vagas_candidaturas where id = p_candidatura;
  v_lado := vagas_interno.lado(k);
  if v_lado is null then return vagas_interno.erro('Conversa não encontrada.'); end if;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  select * into v from public.vagas_conversas where candidatura_id = k.id;
  if v.id is not null then
    if v_lado = 'pessoa' then update public.vagas_conversas set lida_pessoa_em = now() where id = v.id;
    else update public.vagas_conversas set lida_empresa_em = now() where id = v.id; end if;
  end if;
  if v_lado = 'empresa' then
    v_pode := k.status in ('enviada', 'conversar', 'combinou', 'contratada') and a.status not in ('suspenso', 'removido')
              and k.contato_cortado_em is null
              and exists (select 1 from public.vagas_empresas e where e.id = k.empresa_id and e.status = 'ativa');
    v_outro := 'Pessoa candidata';
  else
    v_pode := v.id is not null and v.status = 'aberta' and k.status in ('conversar', 'combinou', 'contratada');
    v_outro := case when vagas_interno.revelada(k) then (select e.nome_fantasia from public.vagas_empresas e where e.id = k.empresa_id)
                    else 'Empresa confidencial' end;
  end if;
  return vagas_interno.ok(jsonb_build_object('candidaturaId', k.id, 'status', k.status, 'lado', v_lado,
    'anuncio', jsonb_build_object('titulo', a.titulo, 'codigo', a.codigo),
    'conversa', case when v.id is null then null else jsonb_build_object('id', v.id, 'status', v.status) end,
    'podeEscrever', v_pode, 'outroLado', v_outro, 'contatoCortado', k.contato_cortado_em is not null,
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto, 'em', disc_interno.iso(m.criado_em),
        'minha', m.autor = v_lado) order by m.criado_em, m.id)
      from public.vagas_mensagens m where m.conversa_id = v.id), '[]'::jsonb)));
end;
$$;

-- Envia uma mensagem. p_id = id gerado no aparelho (reenviar não duplica). A empresa abre a conversa (vale como "Quero
-- conversar"); a pessoa só responde. Até 3 mensagens seguidas da empresa sem resposta.
create or replace function public.vagas_mensagem_enviar(p_candidatura uuid, p_texto text, p_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual(null);
  v_uid uuid := auth.uid();
  k public.vagas_candidaturas%rowtype;
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v public.vagas_conversas%rowtype;
  m public.vagas_mensagens%rowtype;
  v_lado text;
  v_texto text := vagas_interno.limpar_multilinha(p_texto, 2000);
  t jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into k from public.vagas_candidaturas where id = p_candidatura;
  v_lado := vagas_interno.lado(k);
  if v_lado is null then return vagas_interno.erro('Conversa não encontrada.'); end if;
  if p_id is not null then
    select * into m from public.vagas_mensagens where id = p_id;
    if found then
      if m.autor_user is distinct from v_uid then return vagas_interno.erro('Identificador da mensagem inválido.'); end if;
      return vagas_interno.ok(jsonb_build_object('mensagem', jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto,
        'em', disc_interno.iso(m.criado_em), 'minha', true), 'duplicado', true));
    end if;
  end if;
  if v_texto = '' then return vagas_interno.erro('Escreva a mensagem.'); end if;
  if char_length(v_texto) > 1000 then return vagas_interno.erro('A mensagem pode ter até 1.000 caracteres.'); end if;
  t := vagas_interno.conferir_texto(v_texto, 'mensagem');
  if t is not null then return vagas_interno.erro(t ->> 'erro', jsonb_build_object('bloqueada', true, 'tipo', t ->> 'tipo')); end if;
  select * into a from public.vagas_anuncios where id = k.anuncio_id;
  select * into e from public.vagas_empresas where id = k.empresa_id;
  select * into v from public.vagas_conversas where candidatura_id = k.id for update;
  if v_lado = 'empresa' then
    if k.status in ('retirada', 'recusada') then return vagas_interno.erro('A pessoa encerrou esta candidatura.'); end if;
    if k.contato_cortado_em is not null then
      return vagas_interno.erro('A pessoa encerrou a conversa e deixou de compartilhar o contato com a sua empresa.', '{"contatoCortado": true}');
    end if;
    if k.status = 'agora_nao' then
      return vagas_interno.erro('Você marcou "Agora não" para esta pessoa. Mude para "Quero conversar" para escrever.');
    end if;
    if a.status in ('suspenso', 'removido') or e.status <> 'ativa' then return vagas_interno.erro('Esta vaga está fora do ar.'); end if;
    if v.id is not null and v.empresa_seguidas >= 3 then
      return vagas_interno.erro('Espere a pessoa responder antes de mandar outra mensagem.', '{"aguardar": true}');
    end if;
    if vagas_interno.contar('msg_empresa', k.empresa_id::text, interval '1 day') > 300 then
      return vagas_interno.erro('Muitas mensagens hoje. Tente de novo amanhã.', '{"bloqueado": true}');
    end if;
    if v.id is null then
      insert into public.vagas_conversas (candidatura_id, criada_por) values (k.id, v_uid) returning * into v;
    end if;
    if k.status = 'enviada' then
      update public.vagas_candidaturas set status = 'conversar', empresa_decidiu_em = now() where id = k.id;
    end if;
  else
    if v.id is null then return vagas_interno.erro('A empresa ainda não abriu uma conversa.'); end if;
    if v.status <> 'aberta' or k.status not in ('conversar', 'combinou', 'contratada') then
      return vagas_interno.erro('Esta conversa foi encerrada.');
    end if;
    if vagas_interno.contar('msg_pessoa', v_uid::text, interval '1 day') > 100 then
      return vagas_interno.erro('Muitas mensagens hoje. Tente de novo amanhã.', '{"bloqueado": true}');
    end if;
  end if;
  begin
    insert into public.vagas_mensagens (id, conversa_id, autor, autor_user, texto)
    values (coalesce(p_id, gen_random_uuid()), v.id, v_lado, v_uid, v_texto) returning * into m;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm, '{"bloqueada": true}');
  end;
  if v_lado = 'empresa' then
    update public.vagas_conversas set ultima_em = now(), empresa_seguidas = empresa_seguidas + 1, lida_empresa_em = now(), status = 'aberta'
     where id = v.id;
  else
    update public.vagas_conversas set ultima_em = now(), empresa_seguidas = 0, lida_pessoa_em = now() where id = v.id;
  end if;
  return vagas_interno.ok(jsonb_build_object('mensagem', jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto,
    'em', disc_interno.iso(m.criado_em), 'minha', true)));
end;
$$;

-- Conversas da pessoa.
create or replace function public.vagas_conversas_minhas()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  return vagas_interno.ok(jsonb_build_object('conversas', coalesce((select jsonb_agg(jsonb_build_object('candidaturaId', k.id, 'status', k.status,
      'conversaStatus', v.status, 'anuncio', jsonb_build_object('titulo', a.titulo, 'codigo', a.codigo),
      'empresa', case when vagas_interno.revelada(k) then e.nome_fantasia else 'Empresa confidencial' end,
      'naoLidas', vagas_interno.nao_lidas(v.id, 'pessoa'), 'ultimaEm', disc_interno.iso(v.ultima_em),
      'ultima', coalesce((select left(m.texto, 120) from public.vagas_mensagens m where m.conversa_id = v.id order by m.criado_em desc, m.id desc limit 1), ''))
      order by v.ultima_em desc)
    from public.vagas_conversas v join public.vagas_candidaturas k on k.id = v.candidatura_id
    join public.vagas_anuncios a on a.id = k.anuncio_id join public.vagas_empresas e on e.id = k.empresa_id
   where k.pessoa_id = auth.uid()), '[]'::jsonb)));
end;
$$;

-- Conversas da empresa (sem nenhum dado da pessoa).
create or replace function public.vagas_conversas_empresa(p_empresa uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('conversas', coalesce((select jsonb_agg(jsonb_build_object('candidaturaId', k.id, 'status', k.status,
      'conversaStatus', v.status, 'anuncio', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'codigo', a.codigo),
      'naoLidas', vagas_interno.nao_lidas(v.id, 'empresa'), 'ultimaEm', disc_interno.iso(v.ultima_em),
      'ultima', coalesce((select left(m.texto, 120) from public.vagas_mensagens m where m.conversa_id = v.id order by m.criado_em desc, m.id desc limit 1), ''))
      order by v.ultima_em desc)
    from public.vagas_conversas v join public.vagas_candidaturas k on k.id = v.candidatura_id
    join public.vagas_anuncios a on a.id = k.anuncio_id
   where k.empresa_id = p_empresa), '[]'::jsonb)));
end;
$$;

-- =============================================================================
-- Referência profissional pública (empresa verificada → pessoa; só aparece depois do aceite da pessoa)
-- =============================================================================

-- Histórico (só inclusão) do que acontece com cada referência: oferecida, aceita, recusada, ocultada, mostrada, removida,
-- texto aprovado/recusado.
create table if not exists public.vagas_referencia_historico (
  id             bigint generated always as identity primary key,
  referencia_id  uuid not null references public.vagas_referencias (id) on delete cascade,
  acao           text not null check (acao ~ '^[a-z_]{3,30}$'),
  por            text not null check (por in ('pessoa', 'empresa', 'moderacao')),
  em             timestamptz not null default now()
);
create index if not exists vagas_referencia_historico_idx on public.vagas_referencia_historico (referencia_id, em);
drop trigger if exists vagas_referencia_historico_so_inclusao on public.vagas_referencia_historico;
create trigger vagas_referencia_historico_so_inclusao before update on public.vagas_referencia_historico
  for each row execute function vagas_interno.so_inclusao();

-- Textos da referência: função e "recomenda para" sem contato/link; texto livre sem golpe, contato, link nem dado proibido.
create or replace function vagas_interno.referencias_antes_gravar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  x text;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.empresa_id := old.empresa_id;
    new.pessoa_id := old.pessoa_id;
    new.criado_em := old.criado_em;
  end if;
  foreach x in array array[new.funcao] || new.recomenda_para loop
    t := vagas_interno.conferir_texto(x, 'cartao');
    if t is not null then raise exception '%', t ->> 'erro'; end if;
  end loop;
  t := vagas_interno.conferir_texto(new.texto, 'referencia');
  if t is not null then raise exception '%', t ->> 'erro'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists vagas_referencias_antes_gravar on public.vagas_referencias;
create trigger vagas_referencias_antes_gravar before insert or update on public.vagas_referencias
  for each row execute function vagas_interno.referencias_antes_gravar();

-- "Ana Souza Lima" -> "Ana L." (primeiro nome + inicial do último).
create or replace function vagas_interno.nome_exibicao(p text)
returns text language sql immutable set search_path = '' as $$
  select case when cardinality(w) = 0 then ''
              when cardinality(w) = 1 then w[1]
              else w[1] || ' ' || upper(left(w[cardinality(w)], 1)) || '.' end
  from (select array(select x from regexp_split_to_table(btrim(coalesce(p, '')), '\s+') x where x <> '') as w) y;
$$;

-- A empresa oferece (ou responde ao convite da pessoa). Quem: membro logado de empresa ATIVA com CNPJ conferido.
-- Para quem: {conviteToken} (pedido da pessoa) | {candidaturaId} (depois do Combinou) | {email} (resposta neutra).
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
  if v_pessoa is null then return neutro; end if;
  -- Regra "1 por empresa por pessoa". Depois que a pessoa respondeu, a empresa só muda a referência se a pessoa
  -- pedir de novo (convite). A mesma resposta para aceita, ocultada, removida ou recusada (veto P2: nada denuncia a ocultação).
  select * into r from public.vagas_referencias where empresa_id = e.id and pessoa_id = v_pessoa for update;
  if found and r.status <> 'pendente' and v_origem <> 'convite' then
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
  return vagas_interno.ok(jsonb_build_object('referencia', vagas_interno.referencia_json(r, true) || jsonb_build_object('status', r.status)));
end;
$$;

-- A pessoa pede referência a uma empresa: {cnpj?} (empresa da plataforma) | {empresaNome} (ainda fora da plataforma).
-- Gera um link (caminho /referencia.html?t=<token>, 30 dias) para ela mandar à empresa.
create or replace function public.vagas_referencia_pedir(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
  v_cnpj text := vagas_interno.normalizar_cnpj(disc_interno.texto(d -> 'cnpj'));
  v_nome text := disc_interno.limpar_texto(disc_interno.texto(d -> 'empresaNome'), 120);
  e public.vagas_empresas%rowtype;
  cv public.vagas_referencia_convites%rowtype;
  t jsonb;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if v_cnpj <> '' then
    if not vagas_interno.cnpj_valido(v_cnpj) then return vagas_interno.erro('CNPJ inválido. Confira os números.'); end if;
    select * into e from public.vagas_empresas where cnpj = v_cnpj and status = 'ativa';
    if found then v_nome := e.nome_fantasia; end if;
  end if;
  if char_length(v_nome) < 2 then return vagas_interno.erro('Informe o nome da empresa.'); end if;
  t := vagas_interno.conferir_texto(v_nome, 'cartao');
  if t is not null then return vagas_interno.erro(t ->> 'erro'); end if;
  if vagas_interno.contar('referencia_pedir', v_uid::text, interval '1 day') > 10 then
    return vagas_interno.erro('Muitos pedidos hoje. Tente de novo amanhã.', '{"bloqueado": true}');
  end if;
  if (select count(*) from public.vagas_referencia_convites x where x.pessoa_id = v_uid and x.status = 'aberto' and x.expira_em > now()) >= 20 then
    return vagas_interno.erro('Você já tem 20 pedidos de referência abertos. Cancele algum antes de pedir outro.');
  end if;
  insert into public.vagas_referencia_convites (pessoa_id, empresa_id, empresa_nome, token)
  values (v_uid, e.id, v_nome, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  returning * into cv;
  return vagas_interno.ok(jsonb_build_object('convite', jsonb_build_object('id', cv.id, 'token', cv.token,
    'caminho', '/referencia.html?t=' || cv.token, 'expiraEm', disc_interno.iso(cv.expira_em), 'empresaNome', cv.empresa_nome,
    'empresaNaPlataforma', cv.empresa_id is not null)));
end;
$$;

-- A empresa abre o link do pedido (membro logado). Mostra o nome da pessoa (ela mesma mandou o link).
create or replace function public.vagas_referencia_convite(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
  cv public.vagas_referencia_convites%rowtype;
  v_nome text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into cv from public.vagas_referencia_convites where token = lower(btrim(coalesce(p_token, '')));
  if not found or cv.status <> 'aberto' or cv.expira_em <= now()
     or (cv.empresa_id is not null and not vagas_interno.membro(cv.empresa_id)) then
    return vagas_interno.erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
  end if;
  select coalesce(nullif(ct.nome, ''), nullif(disc_interno.limpar_texto(u.raw_user_meta_data ->> 'nome', 120), ''), '')
    into v_nome from auth.users u left join public.vagas_pessoa_contato ct on ct.user_id = u.id where u.id = cv.pessoa_id;
  return vagas_interno.ok(jsonb_build_object('convite', jsonb_build_object('pessoa', jsonb_build_object('nome', coalesce(v_nome, '')),
    'empresaNome', cv.empresa_nome, 'empresaId', cv.empresa_id, 'expiraEm', disc_interno.iso(cv.expira_em), 'status', cv.status)));
end;
$$;

-- A pessoa decide: aceitar | recusar | ocultar | mostrar | remover. Veto P2 da psicologia: ocultar e remover NÃO avisam a
-- empresa (nenhum e-mail, mensagem ou evento) e não mudam nada do que ela vê (vagas_interno.referencia_status_empresa);
-- remover tira a referência de todas as telas da pessoa e de terceiros (a empresa autora continua vendo o que escreveu).
create or replace function public.vagas_referencia_responder(p_referencia uuid, p_acao text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  r public.vagas_referencias%rowtype;
  v_novo text;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into r from public.vagas_referencias where id = p_referencia and pessoa_id = auth.uid() for update;
  if not found then return vagas_interno.erro('Referência não encontrada.'); end if;
  v_novo := case
    when p_acao = 'aceitar' and r.status = 'pendente' then 'aceita'
    when p_acao = 'recusar' and r.status = 'pendente' then 'recusada'
    when p_acao = 'ocultar' and r.status = 'aceita' then 'ocultada'
    when p_acao = 'mostrar' and r.status = 'ocultada' then 'aceita'
    when p_acao = 'remover' and r.status <> 'removida' then 'removida'
    else null end;
  if v_novo is null then return vagas_interno.erro('Ação inválida para esta referência.'); end if;
  if v_novo = 'removida' then
    update public.vagas_referencias set status = 'removida', removida_por = 'pessoa', respondida_em = now()
     where id = r.id returning * into r;
  else
    update public.vagas_referencias set status = v_novo, respondida_em = now(),
      aceita_em = case when p_acao = 'aceitar' then now() else aceita_em end
     where id = r.id returning * into r;
  end if;
  insert into public.vagas_referencia_historico (referencia_id, acao, por)
  values (r.id, case p_acao when 'aceitar' then 'aceita' when 'recusar' then 'recusada' when 'ocultar' then 'ocultada'
                             when 'mostrar' then 'mostrada' else 'removida' end, 'pessoa');
  return vagas_interno.ok(jsonb_build_object('referencia', vagas_interno.referencia_json(r, true) || jsonb_build_object('status', r.status)));
end;
$$;

-- Todas as referências da pessoa (inclusive pendentes) + pedidos abertos + link público.
create or replace function public.vagas_referencias_minhas()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  v_uid uuid := auth.uid();
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  update public.vagas_referencia_convites set status = 'expirado' where pessoa_id = v_uid and status = 'aberto' and expira_em <= now();
  return vagas_interno.ok(jsonb_build_object(
    'referencias', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, true) || jsonb_build_object('status', r.status,
        'textoMotivo', r.texto_motivo, 'visivel', vagas_interno.referencia_visivel(r))
        order by r.status = 'pendente' desc, r.criado_em desc)
      from public.vagas_referencias r where r.pessoa_id = v_uid and r.status <> 'removida'), '[]'::jsonb),
    'convites', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'empresaNome', x.empresa_nome, 'status', x.status,
        'caminho', case when x.status = 'aberto' then '/referencia.html?t=' || x.token else '' end, 'expiraEm', disc_interno.iso(x.expira_em),
        'criadoEm', disc_interno.iso(x.criado_em)) order by x.criado_em desc)
      from public.vagas_referencia_convites x where x.pessoa_id = v_uid and x.status in ('aberto', 'usado')), '[]'::jsonb),
    'caminhoPublico', coalesce((select '/referencias.html?t=' || p.referencias_token from public.vagas_pessoas p
                                 where p.user_id = v_uid and p.referencias_token is not null), '')));
end;
$$;

-- Referências que a empresa deu ("Referências dadas"; sem dados da pessoa). Status pela visão da empresa
-- (pendente | aceita | recusada | removida pela moderação): ocultar/remover pela pessoa NÃO aparece (veto P2). As enviadas
-- por e-mail só aparecem depois do aceite (assim a empresa não descobre quem tem conta).
create or replace function public.vagas_referencias_empresa(p_empresa uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('empresa');
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  if not vagas_interno.membro(p_empresa) then return vagas_interno.erro('Empresa não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('referencias', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, true)
      || jsonb_build_object('status', vagas_interno.referencia_status_empresa(r), 'textoMotivo', r.texto_motivo, 'origem', r.origem,
                            'aceitaEm', disc_interno.iso(r.aceita_em))
      order by r.criado_em desc)
    from public.vagas_referencias r
   where r.empresa_id = p_empresa and (r.origem <> 'email' or vagas_interno.referencia_status_empresa(r) = 'aceita')), '[]'::jsonb),
    'restantes30Dias', greatest(0, 20 - vagas_interno.referencias_no_mes(p_empresa))));
end;
$$;

-- A pessoa liga (ou desliga) a página pública das suas referências: /referencias.html?t=<token>.
create or replace function public.vagas_referencias_publicar(p_ligar boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual('pessoa');
  p public.vagas_pessoas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
  select * into p from public.vagas_pessoas where user_id = auth.uid() for update;
  if not found then return vagas_interno.erro('Complete seu cadastro antes de publicar suas referências.', '{"completar": true}'); end if;
  if coalesce(p_ligar, false) then
    if p.referencias_token is null then
      update public.vagas_pessoas set referencias_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
       where user_id = p.user_id returning * into p;
    end if;
  else
    update public.vagas_pessoas set referencias_token = null where user_id = p.user_id returning * into p;
  end if;
  return vagas_interno.ok(jsonb_build_object('caminho', coalesce('/referencias.html?t=' || p.referencias_token, '')));
end;
$$;

-- Página pública das referências que a pessoa escolheu publicar: nome curto e as referências aceitas (texto só aprovado).
-- Membro logado de uma empresa que deu referência continua vendo a dele como aceita (veto P2; sem login não há como saber
-- quem olha — limitação registrada em docs/VAGAS-SPEC.md).
create or replace function public.vagas_referencias_publicas(p_token text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  p public.vagas_pessoas%rowtype;
  v_minhas uuid[] := case when auth.uid() is null then array[]::uuid[]
                          else array(select public.vagas_ids_minhas_empresas()) end;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return vagas_interno.erro('Página não encontrada.'); end if;
  select * into p from public.vagas_pessoas where referencias_token = p_token;
  if not found or not vagas_interno.conta_valida(p.user_id) then return vagas_interno.erro('Página não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object(
    'pessoa', jsonb_build_object('nomeExibicao', vagas_interno.nome_exibicao((select ct.nome from public.vagas_pessoa_contato ct where ct.user_id = p.user_id))),
    'referencias', coalesce((select jsonb_agg(vagas_interno.referencia_json(r, false) order by coalesce(r.fim, current_date) desc, r.inicio desc)
      from public.vagas_referencias r where r.pessoa_id = p.user_id and vagas_interno.referencia_para_empresa(r, v_minhas)), '[]'::jsonb)));
end;
$$;

-- Vaga assistida: a operação da cidade cria ou edita a vaga de uma empresa com os MESMOS campos de vagas_anuncio_salvar
-- (+ empresaId e, opcional, publicar:true — a operação já é a revisão; a empresa precisa estar ativa).
create or replace function public.vagas_op_anuncio_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_id text := btrim(disc_interno.texto(d -> 'id'));
  v_emp text := btrim(disc_interno.texto(d -> 'empresaId'));
  re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v jsonb;
  v_papel text;
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if v_id <> '' then
    if v_id !~ re then return vagas_interno.erro('Vaga não encontrada.'); end if;
    select * into a from public.vagas_anuncios where id = v_id::uuid;
    if not found then return vagas_interno.erro('Vaga não encontrada.'); end if;
    select * into e from public.vagas_empresas where id = a.empresa_id;
  else
    if v_emp !~ re then return vagas_interno.erro('Empresa não encontrada.'); end if;
    select * into e from public.vagas_empresas where id = v_emp::uuid;
    if not found then return vagas_interno.erro('Empresa não encontrada.'); end if;
  end if;
  v_papel := vagas_interno.papel_cidade(e.cidade_id);
  if v_papel is null then return vagas_interno.erro(case when a.id is null then 'Empresa não encontrada.' else 'Vaga não encontrada.' end); end if;
  if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
  if a.status = 'removido' then return vagas_interno.erro('Esta vaga foi removida pela moderação e não pode ser editada.'); end if;
  if e.status = 'suspensa' then return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.'); end if;
  v := vagas_interno.ler_anuncio(d, coalesce(a.cidade_id, e.cidade_id));
  if not (v ->> 'ok')::boolean then return vagas_interno.erro(v ->> 'erro'); end if;
  begin
    a := vagas_interno.gravar_anuncio(a.id, e.id, v -> 'campos', auth.uid());
    if d -> 'publicar' = 'true'::jsonb and a.status not in ('publicado', 'pausado') then
      if e.status <> 'ativa' then raise exception 'Aprove a empresa antes de publicar a vaga.'; end if;
      update public.vagas_anuncios set status = 'publicado', status_motivo = '', publicado_em = coalesce(publicado_em, now()),
        expira_em = vagas_interno.expira_calculada(a), encerrado_em = null where id = a.id returning * into a;
    end if;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation or foreign_key_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  perform vagas_interno.registrar(a.cidade_id, v_papel, 'anuncio_assistido', 'anuncio', a.id, '',
    jsonb_build_object('publicado', a.status = 'publicado'));
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

-- Operação: textos de referência a moderar nas cidades das empresas (sem nenhum dado da pessoa).
create or replace function public.vagas_op_referencias(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_status text[] := vagas_interno.lista_enum(f -> 'textoStatus', array['pendente', 'publicado', 'nao_publicado']);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  if cardinality(v_status) = 0 then v_status := array['pendente']; end if;
  return vagas_interno.ok(jsonb_build_object('referencias', coalesce((select jsonb_agg(jsonb_build_object('id', r.id,
      'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia), 'funcao', r.funcao, 'vinculo', r.vinculo,
      'texto', r.texto, 'textoStatus', r.texto_status, 'textoMotivo', r.texto_motivo, 'status', vagas_interno.referencia_status_empresa(r),
      'criadoEm', disc_interno.iso(r.criado_em))
      order by r.criado_em)
    from public.vagas_referencias r join public.vagas_empresas e on e.id = r.empresa_id
   where e.cidade_id = any (v_cids) and r.texto_status = any (v_status)
     and vagas_interno.referencia_status_empresa(r) <> 'removida'), '[]'::jsonb)));
end;
$$;

-- Operação: aprovar_texto | recusar_texto | remover (fraude ou abuso; o texto é apagado).
create or replace function public.vagas_op_referencia_decidir(p_referencia uuid, p_acao text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.vagas_referencias%rowtype;
  v_cidade uuid;
  v_papel text;
  v_motivo text := disc_interno.limpar_texto(p_motivo, 300);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into r from public.vagas_referencias where id = p_referencia for update;
  if not found then return vagas_interno.erro('Referência não encontrada.'); end if;
  select e.cidade_id into v_cidade from public.vagas_empresas e where e.id = r.empresa_id;
  v_papel := vagas_interno.papel_cidade(v_cidade);
  if v_papel is null then return vagas_interno.erro('Referência não encontrada.'); end if;
  if p_acao = 'aprovar_texto' then
    if r.texto_status <> 'pendente' then return vagas_interno.erro('Este texto não está esperando a moderação.'); end if;
    update public.vagas_referencias set texto_status = 'publicado', texto_motivo = '', moderado_por = auth.uid(), moderado_em = now()
     where id = r.id returning * into r;
  elsif p_acao = 'recusar_texto' then
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    if r.texto_status not in ('pendente', 'publicado') then return vagas_interno.erro('Este texto não está esperando a moderação.'); end if;
    update public.vagas_referencias set texto_status = 'nao_publicado', texto_motivo = v_motivo, moderado_por = auth.uid(), moderado_em = now()
     where id = r.id returning * into r;
  elsif p_acao = 'remover' then
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    update public.vagas_referencias set status = 'removida', removida_por = 'moderacao', texto = '', texto_status = 'sem_texto',
      texto_motivo = v_motivo, moderado_por = auth.uid(), moderado_em = now() where id = r.id returning * into r;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  insert into public.vagas_referencia_historico (referencia_id, acao, por)
  values (r.id, case p_acao when 'aprovar_texto' then 'texto_publicado' when 'recusar_texto' then 'texto_nao_publicado' else 'removida' end, 'moderacao');
  perform vagas_interno.registrar(v_cidade, v_papel, 'referencia_' || p_acao, 'referencia', r.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('referencia', jsonb_build_object('id', r.id, 'status', vagas_interno.referencia_status_empresa(r),
    'textoStatus', r.texto_status)));
end;
$$;

-- =============================================================================
-- Operação local (operador/moderador da cidade) e equipe da Gestão sem Caos (public.e_admin()). Ninguém aqui lê pessoa
-- nem contato: só empresas, anúncios, denúncias (com o conteúdo denunciado) e contagens.
-- =============================================================================

-- Cidades (slugs) pedidas no filtro, dentro das que quem chama opera.
create or replace function vagas_interno.cidades_do_filtro(f jsonb)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), array[]::uuid[]) from public.vagas_cidades c
   where c.id = any (vagas_interno.cidades_operadas())
     and (coalesce(btrim(disc_interno.texto(f -> 'cidade')), '') = '' or c.slug = lower(btrim(disc_interno.texto(f -> 'cidade'))));
$$;

create or replace function public.vagas_op_resumo()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_cids uuid[] := vagas_interno.cidades_operadas();
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(v_cids) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('cidades', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'nome', c.nome,
      'status', c.status, 'papel', vagas_interno.papel_cidade(c.id), 'contagens', jsonb_build_object(
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

-- Empresas das cidades operadas. Filtro: {cidade?, status?, busca?}
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
      'membros', (select count(*)::int from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo))
      order by e.status = 'em_analise' desc, e.criado_em desc)
    from public.vagas_empresas e
   where e.cidade_id = any (v_cids) and (cardinality(v_status) = 0 or e.status = any (v_status))
     and (v_busca = '' or strpos(vagas_interno.normalizar(e.nome_fantasia || ' ' || e.razao_social || ' ' || e.cnpj), v_busca) > 0)),
    '[]'::jsonb)));
end;
$$;

-- aprovar (CNPJ conferido) | suspender | reativar. Moderador só suspende.
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

-- Cadastro assistido da empresa pela operação (já com o CNPJ conferido).
create or replace function public.vagas_op_empresa_cadastrar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v jsonb;
  v_papel text;
  e public.vagas_empresas%rowtype;
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  v := vagas_interno.ler_empresa(d);
  if not (v ->> 'ok')::boolean then return vagas_interno.erro(v ->> 'erro'); end if;
  v_papel := vagas_interno.papel_cidade((v #>> '{campos,cidadeId}')::uuid);
  if v_papel is null or v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
  begin
    e := vagas_interno.inserir_empresa(v -> 'campos', 'ativa', auth.uid());
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when unique_violation then return vagas_interno.erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
    when check_violation or not_null_violation then return vagas_interno.erro('Dados inválidos. Confira os campos.');
  end;
  perform vagas_interno.registrar(e.cidade_id, v_papel, 'empresa_cadastrar', 'empresa', e.id, '');
  return vagas_interno.ok(jsonb_build_object('empresa', vagas_interno.empresa_json(e)));
end;
$$;

-- Liga uma conta de empresa (pelo e-mail) a uma empresa: dono(a) se ainda não houver, senão recrutador(a).
create or replace function public.vagas_op_vincular_membro(p_empresa uuid, p_email text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_user uuid;
  v_papel_membro text;
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found then return vagas_interno.erro('Empresa não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(e.cidade_id);
  if v_papel is null then return vagas_interno.erro('Empresa não encontrada.'); end if;
  if v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
  select c.user_id into v_user from auth.users u join public.vagas_contas c on c.user_id = u.id
   where lower(u.email) = vagas_interno.email(p_email) and c.tipo = 'empresa';
  if v_user is null then
    return vagas_interno.erro('Não há conta de empresa com este e-mail. Peça para a empresa criar a conta (ou faça o cadastro assistido).');
  end if;
  -- Só para o cadastro assistido (empresa ainda sem ninguém). Empresa com membro ativo convida pelo painel dela: a operação
  -- nunca entra numa empresa alheia (e nunca chega ao contato das pessoas).
  if exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.ativo and m.user_id <> v_user) then
    return vagas_interno.erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
  end if;
  v_papel_membro := case when exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = e.id and m.papel = 'dono' and m.ativo)
                         then 'recrutador' else 'dono' end;
  insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values (e.id, v_user, v_papel_membro)
  on conflict (empresa_id, user_id) do update set ativo = true;
  perform vagas_interno.registrar(e.cidade_id, v_papel, 'empresa_vincular_membro', 'empresa', e.id, '', jsonb_build_object('papel', v_papel_membro));
  return vagas_interno.ok(jsonb_build_object('membro', jsonb_build_object('papel',
    (select m.papel from public.vagas_empresa_membros m where m.empresa_id = e.id and m.user_id = v_user))));
end;
$$;

-- Anúncios das cidades operadas (padrão: em revisão e suspensos). Filtro: {cidade?, status?}
create or replace function public.vagas_op_anuncios(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_status text[] := vagas_interno.lista_enum(f -> 'status', array['rascunho', 'em_revisao', 'publicado', 'pausado', 'encerrado', 'suspenso', 'removido']);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  if cardinality(v_status) = 0 then v_status := array['em_revisao', 'suspenso']; end if;
  return vagas_interno.ok(jsonb_build_object('anuncios', coalesce((select jsonb_agg(vagas_interno.anuncio_empresa(a) || jsonb_build_object(
      'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia, 'status', e.status,
                                    'cnpjFormatado', vagas_interno.formatar_cnpj(e.cnpj), 'conferida', e.cnpj_conferido_em is not null),
      'denunciasAbertas', (select count(*)::int from public.vagas_denuncias d where d.anuncio_id = a.id and d.status = 'aberta'))
      order by a.atualizado_em desc)
    from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id
   where a.cidade_id = any (v_cids) and a.status = any (v_status)), '[]'::jsonb)));
end;
$$;

-- publicar (aprova a revisão ou devolve ao ar depois de denúncia; as denúncias abertas viram improcedentes) | remover.
create or replace function public.vagas_op_anuncio_decidir(p_anuncio uuid, p_acao text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.vagas_anuncios%rowtype;
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_motivo text := disc_interno.limpar_texto(p_motivo, 300);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into a from public.vagas_anuncios where id = p_anuncio for update;
  if not found then return vagas_interno.erro('Vaga não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(a.cidade_id);
  if v_papel is null then return vagas_interno.erro('Vaga não encontrada.'); end if;
  select * into e from public.vagas_empresas where id = a.empresa_id;
  if p_acao = 'publicar' then
    if a.status not in ('em_revisao', 'suspenso') then return vagas_interno.erro('Esta vaga não está esperando a moderação.'); end if;
    if e.status <> 'ativa' then return vagas_interno.erro('Aprove a empresa antes de publicar a vaga.'); end if;
    if a.modalidade = 'diaria' and a.data_trabalho < (select vagas_interno.hoje(c.fuso) from public.vagas_cidades c where c.id = a.cidade_id) then
      return vagas_interno.erro('A data da diária já passou.');
    end if;
    if a.status = 'em_revisao' or a.expira_em is null or a.expira_em <= now() then
      update public.vagas_anuncios set status = 'publicado', status_motivo = '', publicado_em = coalesce(publicado_em, now()),
        expira_em = vagas_interno.expira_calculada(a) where id = a.id returning * into a;
    else
      update public.vagas_anuncios set status = 'publicado', status_motivo = '' where id = a.id returning * into a;
    end if;
    update public.vagas_denuncias set status = 'improcedente', decidida_por = auth.uid(), decidida_em = now(),
      decisao_motivo = coalesce(nullif(v_motivo, ''), 'Vaga devolvida ao ar pela moderação.')
     where anuncio_id = a.id and alvo = 'anuncio' and status = 'aberta';
  elsif p_acao = 'devolver' then
    -- Volta para a empresa corrigir: rascunho com o motivo (chave de conteudo/vagas-textos/moderacao.json) em statusMotivo.
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    if a.status not in ('em_revisao', 'suspenso') then return vagas_interno.erro('Esta vaga não está esperando a moderação.'); end if;
    update public.vagas_anuncios set status = 'rascunho', status_motivo = v_motivo where id = a.id returning * into a;
  elsif p_acao = 'remover' then
    if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
    update public.vagas_anuncios set status = 'removido', status_motivo = v_motivo where id = a.id returning * into a;
  else
    return vagas_interno.erro('Ação inválida.');
  end if;
  perform vagas_interno.registrar(a.cidade_id, v_papel, 'anuncio_' || p_acao, 'anuncio', a.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('anuncio', vagas_interno.anuncio_empresa(a)));
end;
$$;

-- Denúncias das cidades operadas (padrão: abertas). Mostra o conteúdo denunciado, nunca quem é a pessoa.
create or replace function public.vagas_op_denuncias(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_status text[] := vagas_interno.lista_enum(f -> 'status', array['aberta', 'procedente', 'improcedente']);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  if cardinality(v_status) = 0 then v_status := array['aberta']; end if;
  return vagas_interno.ok(jsonb_build_object('denuncias', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'alvo', d.alvo,
      'motivo', d.motivo, 'detalhe', d.detalhe, 'status', d.status, 'contaNoLimite', d.conta_no_limite, 'criadoEm', disc_interno.iso(d.criado_em),
      'decisaoMotivo', d.decisao_motivo, 'decididaEm', disc_interno.iso(d.decidida_em),
      'anuncio', (select jsonb_build_object('id', a.id, 'codigo', a.codigo, 'titulo', a.titulo, 'status', a.status,
                    'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia, 'status', e.status))
                    from public.vagas_anuncios a join public.vagas_empresas e on e.id = a.empresa_id where a.id = d.anuncio_id),
      'mensagem', case when d.alvo = 'mensagem' then jsonb_build_object('texto', d.texto_denunciado, 'autor', d.autor_mensagem) else null end,
      'referencia', (select jsonb_build_object('id', r.id, 'funcao', r.funcao, 'texto', r.texto, 'textoStatus', r.texto_status,
                       'status', vagas_interno.referencia_status_empresa(r),
                       'empresa', jsonb_build_object('id', e.id, 'nomeFantasia', e.nome_fantasia))
                       from public.vagas_referencias r join public.vagas_empresas e on e.id = r.empresa_id where r.id = d.referencia_id))
      order by d.criado_em desc)
    from public.vagas_denuncias d where d.cidade_id = any (v_cids) and d.status = any (v_status)), '[]'::jsonb)));
end;
$$;

-- Decide uma denúncia: {decisao:'procedente'|'improcedente', motivo, removerAnuncio?, suspenderEmpresa?, suspenderAutor?}.
-- suspenderAutor (denúncia de mensagem): suspende a conta da pessoa que escreveu (a moderação não fica sabendo quem é) ou
-- a empresa que escreveu.
create or replace function public.vagas_op_denuncia_decidir(p_denuncia uuid, p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  x public.vagas_denuncias%rowtype;
  v_papel text;
  v_dec text := disc_interno.texto(d -> 'decisao');
  v_motivo text := disc_interno.limpar_texto(disc_interno.texto(d -> 'motivo'), 300);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into x from public.vagas_denuncias where id = p_denuncia for update;
  if not found then return vagas_interno.erro('Denúncia não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(x.cidade_id);
  if v_papel is null then return vagas_interno.erro('Denúncia não encontrada.'); end if;
  if v_dec not in ('procedente', 'improcedente') then return vagas_interno.erro('Decisão inválida.'); end if;
  if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
  if (d -> 'suspenderEmpresa' = 'true'::jsonb or d -> 'suspenderAutor' = 'true'::jsonb) and v_papel = 'moderador' then
    return vagas_interno.erro('Sem permissão.');
  end if;
  update public.vagas_denuncias set status = v_dec, decidida_por = auth.uid(), decidida_em = now(), decisao_motivo = v_motivo
   where id = x.id returning * into x;
  if v_dec = 'procedente' then
    if d -> 'removerAnuncio' = 'true'::jsonb and x.anuncio_id is not null then
      update public.vagas_anuncios set status = 'removido', status_motivo = v_motivo where id = x.anuncio_id;
      perform vagas_interno.registrar(x.cidade_id, v_papel, 'anuncio_remover', 'anuncio', x.anuncio_id, v_motivo);
    end if;
    if (d -> 'suspenderEmpresa' = 'true'::jsonb or (d -> 'suspenderAutor' = 'true'::jsonb and x.autor_mensagem = 'empresa'))
       and x.empresa_id is not null then
      update public.vagas_empresas set status = 'suspensa', status_motivo = v_motivo where id = x.empresa_id;
      perform vagas_interno.registrar(x.cidade_id, v_papel, 'empresa_suspender', 'empresa', x.empresa_id, v_motivo);
    end if;
    if d -> 'removerReferencia' = 'true'::jsonb and x.referencia_id is not null then
      update public.vagas_referencias set status = 'removida', removida_por = 'moderacao', texto = '', texto_status = 'sem_texto',
        texto_motivo = v_motivo, moderado_por = auth.uid(), moderado_em = now() where id = x.referencia_id;
      insert into public.vagas_referencia_historico (referencia_id, acao, por) values (x.referencia_id, 'removida', 'moderacao');
      perform vagas_interno.registrar(x.cidade_id, v_papel, 'referencia_remover', 'referencia', x.referencia_id, v_motivo);
    end if;
    if d -> 'suspenderAutor' = 'true'::jsonb and x.autor_mensagem = 'pessoa' and x.autor_mensagem_user is not null then
      update public.vagas_contas set status = 'suspensa', suspensa_motivo = v_motivo where user_id = x.autor_mensagem_user;
      perform vagas_interno.registrar(x.cidade_id, v_papel, 'conta_suspender', 'conta', null, v_motivo, jsonb_build_object('denuncia', x.id));
    end if;
  end if;
  perform vagas_interno.registrar(x.cidade_id, v_papel, 'denuncia_' || v_dec, 'denuncia', x.id, v_motivo);
  return vagas_interno.ok(jsonb_build_object('denuncia', jsonb_build_object('id', x.id, 'status', x.status, 'decisaoMotivo', x.decisao_motivo)));
end;
$$;

-- Registro de moderação das cidades operadas. Filtro: {cidade?, limite? (até 200)}
create or replace function public.vagas_op_moderacao(p_filtro jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_cids uuid[] := vagas_interno.cidades_do_filtro(f);
  v_lim int := least(greatest(coalesce(vagas_interno.inteiro(f -> 'limite'), 100), 1), 200);
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if cardinality(vagas_interno.cidades_operadas()) = 0 then return vagas_interno.erro('Sem permissão.'); end if;
  return vagas_interno.ok(jsonb_build_object('registros', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'em', disc_interno.iso(x.em),
      'papel', x.papel, 'acao', x.acao, 'alvo', x.alvo, 'alvoId', x.alvo_id, 'motivo', x.motivo, 'dados', x.dados,
      'cidade', (select c.slug from public.vagas_cidades c where c.id = x.cidade_id)) order by x.em desc, x.id desc)
    from (select * from public.vagas_moderacao m where m.cidade_id = any (v_cids) order by m.em desc, m.id desc limit v_lim) x), '[]'::jsonb)));
end;
$$;

-- Equipe: cria ou altera uma cidade (pelo slug). {slug, nome, uf, ibge?, status?, praca?, fuso?, metaListaEspera?, ordem?}
create or replace function public.vagas_adm_cidade_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_slug text := lower(btrim(disc_interno.texto(d -> 'slug')));
  v_status text := coalesce(nullif(disc_interno.texto(d -> 'status'), ''), 'rascunho');
  v_praca uuid := null;
  c public.vagas_cidades%rowtype;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$' or char_length(v_slug) > 60 then
    return vagas_interno.erro('Endereço da cidade inválido (ex.: boa-vista-rr).');
  end if;
  if v_status not in ('rascunho', 'lista_espera', 'ativa', 'pausada') then return vagas_interno.erro('Status da cidade inválido.'); end if;
  if btrim(disc_interno.texto(d -> 'praca')) <> '' then
    select x.id into v_praca from public.vagas_cidades x where x.slug = lower(btrim(disc_interno.texto(d -> 'praca')));
    if v_praca is null then return vagas_interno.erro('Cidade-polo não encontrada.'); end if;
  end if;
  begin
    insert into public.vagas_cidades as x (slug, nome, uf, ibge, fuso, status, praca_id, meta_lista_espera, ordem)
    values (v_slug, disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 80), upper(btrim(disc_interno.texto(d -> 'uf'))),
      nullif(btrim(disc_interno.texto(d -> 'ibge')), ''), coalesce(nullif(btrim(disc_interno.texto(d -> 'fuso')), ''), 'America/Boa_Vista'),
      v_status, v_praca, vagas_interno.inteiro(d -> 'metaListaEspera'), coalesce(vagas_interno.inteiro(d -> 'ordem'), 0))
    on conflict (slug) do update set
      nome = case when d ? 'nome' then excluded.nome else x.nome end,
      uf = case when d ? 'uf' then excluded.uf else x.uf end,
      ibge = case when d ? 'ibge' then excluded.ibge else x.ibge end,
      fuso = case when d ? 'fuso' then excluded.fuso else x.fuso end,
      status = case when d ? 'status' then excluded.status else x.status end,
      praca_id = case when d ? 'praca' then excluded.praca_id else x.praca_id end,
      meta_lista_espera = case when d ? 'metaListaEspera' then excluded.meta_lista_espera else x.meta_lista_espera end,
      ordem = case when d ? 'ordem' then excluded.ordem else x.ordem end
    returning * into c;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation then return vagas_interno.erro('Dados da cidade inválidos. Confira nome, UF e IBGE.');
  end;
  perform vagas_interno.registrar(c.id, 'admin', 'cidade_salvar', 'cidade', c.id, '', jsonb_build_object('status', c.status));
  return vagas_interno.ok(jsonb_build_object('cidade', vagas_interno.cidade_json(c)));
end;
$$;

-- Equipe ou operador(a) da cidade: cria ou altera uma zona. {cidade, slug, nome?, bairros?, ordem?, ativa?}
create or replace function public.vagas_adm_zona_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  z public.vagas_zonas%rowtype;
  v_papel text;
  v_slug text := lower(btrim(disc_interno.texto(d -> 'slug')));
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(c.id);
  if v_papel is null or v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then return vagas_interno.erro('Endereço da zona inválido (ex.: zona-oeste).'); end if;
  begin
    insert into public.vagas_zonas as x (cidade_id, slug, nome, bairros, ordem, ativa)
    values (c.id, v_slug, disc_interno.limpar_texto(disc_interno.texto(d -> 'nome'), 60),
      vagas_interno.lista_texto(d -> 'bairros', 60), coalesce(vagas_interno.inteiro(d -> 'ordem'), 0), coalesce(d -> 'ativa' <> 'false'::jsonb, true))
    on conflict (cidade_id, slug) do update set
      nome = case when d ? 'nome' then excluded.nome else x.nome end,
      bairros = case when d ? 'bairros' then excluded.bairros else x.bairros end,
      ordem = case when d ? 'ordem' then excluded.ordem else x.ordem end,
      ativa = case when d ? 'ativa' then excluded.ativa else x.ativa end
    returning * into z;
  exception
    when raise_exception then return vagas_interno.erro(sqlerrm);
    when check_violation or not_null_violation then return vagas_interno.erro('Dados da zona inválidos. Confira o nome.');
  end;
  perform vagas_interno.registrar(c.id, v_papel, 'zona_salvar', 'zona', z.id, '');
  return vagas_interno.ok(jsonb_build_object('zona', jsonb_build_object('id', z.id, 'slug', z.slug, 'nome', z.nome, 'bairros', to_jsonb(z.bairros),
    'ordem', z.ordem, 'ativa', z.ativa)));
end;
$$;

-- Equipe: liga uma conta de operação (tipo 'operador', criada pelo convite da Edge Function) a uma cidade.
-- {email, cidade, papel?:'operador'|'moderador', ativo?, repassePercentual?, contratoVersao?}
create or replace function public.vagas_adm_operador_salvar(p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  c public.vagas_cidades%rowtype;
  v_user uuid;
  v_papel text := coalesce(nullif(disc_interno.texto(d -> 'papel'), ''), 'operador');
  o public.vagas_operadores%rowtype;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if v_papel not in ('operador', 'moderador') then return vagas_interno.erro('Papel inválido.'); end if;
  select x.user_id into v_user from auth.users u join public.vagas_contas x on x.user_id = u.id
   where lower(u.email) = vagas_interno.email(disc_interno.texto(d -> 'email')) and x.tipo = 'operador';
  if v_user is null then return vagas_interno.erro('Não há conta de operação com este e-mail. Use o convite de operador.'); end if;
  begin
    insert into public.vagas_operadores as x (user_id, cidade_id, papel, ativo, repasse_percentual, contrato_versao)
    values (v_user, c.id, v_papel, coalesce(d -> 'ativo' <> 'false'::jsonb, true),
      coalesce((disc_interno.texto(d -> 'repassePercentual'))::numeric, 0), disc_interno.limpar_texto(disc_interno.texto(d -> 'contratoVersao'), 40))
    on conflict (user_id, cidade_id) do update set papel = excluded.papel,
      ativo = case when d ? 'ativo' then excluded.ativo else x.ativo end,
      repasse_percentual = case when d ? 'repassePercentual' then excluded.repasse_percentual else x.repasse_percentual end,
      contrato_versao = case when d ? 'contratoVersao' then excluded.contrato_versao else x.contrato_versao end
    returning * into o;
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation then
      return vagas_interno.erro('Percentual de repasse inválido (0 a 100).');
  end;
  perform vagas_interno.registrar(c.id, 'admin', 'operador_salvar', 'operador', null, '', jsonb_build_object('papel', o.papel, 'ativo', o.ativo));
  return vagas_interno.ok(jsonb_build_object('operador', jsonb_build_object('cidade', c.slug, 'papel', o.papel, 'ativo', o.ativo,
    'repassePercentual', o.repasse_percentual, 'contratoVersao', o.contrato_versao)));
end;
$$;

-- =============================================================================
-- Só para a Edge Function vagas-conta (service_role): limites, consulta da conta e registro
-- =============================================================================

-- Limites das ações de conta (por origem, por e-mail, por quem age e no total). -> {ok:true} | {ok:false, erro, bloqueado}
create or replace function public.vagas_conta_limite(p_acao text, p_cf text, p_xff text, p_email text, p_ator uuid default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  msg constant text := 'Muitas tentativas. Tente de novo mais tarde.';
  o text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_max int;
begin
  if p_acao is null or p_acao not in ('cadastrar', 'reenviar', 'esqueci', 'assistido', 'operador', 'excluir') then
    return vagas_interno.erro('Ação desconhecida.');
  end if;
  if vagas_interno.contar('conta_total', '', interval '1 hour') > 300 then
    return vagas_interno.erro(msg, '{"bloqueado": true}');
  end if;
  v_max := case p_acao when 'cadastrar' then 5 when 'assistido' then 60 when 'operador' then 30 else 10 end;
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

-- Situação de um e-mail no Auth (só para a função). -> {ok, existe, userId, produto, confirmada, conta:{tipo,status}|null, admin}
create or replace function public.vagas_conta_consultar(p_email text)
returns json language sql stable security definer set search_path = '' as $$
  select vagas_interno.ok(coalesce((select jsonb_build_object('existe', true, 'userId', u.id,
      'produto', coalesce(u.raw_app_meta_data ->> 'produto', ''), 'confirmada', u.email_confirmed_at is not null,
      'conta', (select jsonb_build_object('tipo', c.tipo, 'status', c.status) from public.vagas_contas c where c.user_id = u.id),
      'admin', exists (select 1 from public.admins a where a.user_id = u.id))
    from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1),
    jsonb_build_object('existe', false)));
$$;

-- Registra a conta do Vagas sem Caos de um usuário recém-criado no Auth (idempotente).
-- {tipo, termosVersao?, assistidaPor?, cidade?, empresaId?, operador?:{cidade, papel}}
create or replace function public.vagas_conta_registrar(p_user uuid, p_dados jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_tipo text := disc_interno.texto(d -> 'tipo');
  v_versao text := btrim(disc_interno.texto(d -> 'termosVersao'));
  v_ator uuid := nullif(disc_interno.texto(d -> 'assistidaPor'), '')::uuid;
  v_cid uuid := null;
  v_emp uuid := nullif(disc_interno.texto(d -> 'empresaId'), '')::uuid;
  v_evento text := left(regexp_replace(disc_interno.texto(d -> 'codigoEvento'), '[^A-Za-z0-9_-]', '', 'g'), 40);
  c public.vagas_contas%rowtype;
  v_op_cid uuid;
begin
  if v_tipo not in ('pessoa', 'empresa', 'operador') then return vagas_interno.erro('Tipo de conta inválido.'); end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then return vagas_interno.erro('Usuário não encontrado.'); end if;
  if btrim(disc_interno.texto(d -> 'cidade')) <> '' then
    select x.id into v_cid from public.vagas_cidades x where x.slug = lower(btrim(disc_interno.texto(d -> 'cidade')));
    if v_cid is null then return vagas_interno.erro('Cidade não encontrada.'); end if;
  end if;
  insert into public.vagas_contas (user_id, tipo, assistida_por, assistida_cidade_id, codigo_evento) values (p_user, v_tipo, v_ator, v_cid, v_evento)
  on conflict (user_id) do nothing;
  select * into c from public.vagas_contas where user_id = p_user for update;
  if c.tipo <> v_tipo then
    -- Conta pendente "solta" (criada pelo cadastro aberto, sem e-mail confirmado, sem vínculo com empresa nem operação):
    -- quem tem o e-mail é quem decide o tipo (um terceiro pode ter "pré-registrado" o e-mail com o tipo errado).
    -- Conta assistida, com vínculo de empresa ou convite de operação, ou já confirmada: o tipo não muda (senão quem
    -- soubesse o e-mail derrubaria o vínculo — e, com ele, as vagas da empresa — antes do clique).
    if c.status = 'pendente' and c.assistida_por is null
       and not exists (select 1 from public.vagas_empresa_membros m where m.user_id = p_user)
       and not exists (select 1 from public.vagas_operadores o where o.user_id = p_user)
       and not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
      update public.vagas_contas set tipo = v_tipo where user_id = p_user returning * into c;
    else
      return vagas_interno.erro('Este e-mail já tem uma conta de outro tipo.');
    end if;
  end if;
  -- A versão dos termos fica guardada; o CONSENTIMENTO (data + linhas em vagas_consentimentos) só é gravado quando a conta
  -- passa de pendente a ativa, no clique do link (vagas_interno.conta_atual). Conta já ativa: grava na hora.
  if v_versao ~ '^[A-Za-z0-9._-]{1,40}$' and c.termos_versao is distinct from v_versao then
    if c.status = 'ativa' then
      update public.vagas_contas set termos_versao = v_versao, termos_aceitos_em = now() where user_id = p_user;
      insert into public.vagas_consentimentos (user_id, tipo, versao, aceito) values (p_user, 'termos', v_versao, true), (p_user, 'privacidade', v_versao, true);
    else
      update public.vagas_contas set termos_versao = v_versao, termos_aceitos_em = null where user_id = p_user;
    end if;
  end if;
  if v_emp is not null and v_tipo = 'empresa' then
    if not exists (select 1 from public.vagas_empresas e where e.id = v_emp and (v_cid is null or e.cidade_id = v_cid)) then
      return vagas_interno.erro('Empresa não encontrada.');
    end if;
    -- Mesma regra de vagas_op_vincular_membro: o cadastro assistido só entra em empresa SEM membro ativo (quem tem acesso
    -- convida pelo painel da empresa). A Function apaga o usuário criado pela metade quando isto falha.
    if exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = v_emp and m.ativo and m.user_id <> p_user) then
      return vagas_interno.erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
    end if;
    insert into public.vagas_empresa_membros (empresa_id, user_id, papel)
    values (v_emp, p_user, case when exists (select 1 from public.vagas_empresa_membros m where m.empresa_id = v_emp and m.papel = 'dono' and m.ativo)
                                then 'recrutador' else 'dono' end)
    on conflict (empresa_id, user_id) do update set ativo = true;
  end if;
  if v_tipo = 'operador' and jsonb_typeof(d -> 'operador') = 'object' then
    select x.id into v_op_cid from public.vagas_cidades x where x.slug = lower(btrim(disc_interno.texto(d #> '{operador,cidade}')));
    if v_op_cid is null then return vagas_interno.erro('Cidade não encontrada.'); end if;
    insert into public.vagas_operadores (user_id, cidade_id, papel)
    values (p_user, v_op_cid, case when disc_interno.texto(d #> '{operador,papel}') = 'moderador' then 'moderador' else 'operador' end)
    on conflict (user_id, cidade_id) do update set papel = excluded.papel, ativo = true;
  end if;
  if v_ator is not null then
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo)
    values (coalesce(v_cid, v_op_cid), v_ator, case when exists (select 1 from public.admins a where a.user_id = v_ator) then 'admin' else 'operador' end,
      case when v_tipo = 'operador' then 'convidar_operador' else 'cadastro_assistido' end, 'conta', p_user, '');
  end if;
  return vagas_interno.ok(jsonb_build_object('userId', p_user, 'tipo', c.tipo));
end;
$$;

-- Quem é o dono de um JWT (a função confere o token no Auth e pergunta aqui): admin, conta e cidades que opera.
create or replace function public.vagas_conta_quem(p_user uuid)
returns json language sql stable security definer set search_path = '' as $$
  select vagas_interno.ok(jsonb_build_object('admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'conta', (select jsonb_build_object('tipo', c.tipo, 'status', c.status) from public.vagas_contas c where c.user_id = p_user),
    'operador', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.slug, 'papel', o.papel))
                            from public.vagas_operadores o join public.vagas_cidades x on x.id = o.cidade_id
                           where o.user_id = p_user and o.ativo and vagas_interno.conta_valida(o.user_id)), '[]'::jsonb)));
$$;

-- Edge Function (ação 'foto'): pode este usuário ver esta foto? p_candidatura null = a própria foto (pessoa).
-- Empresa: membro ativo da empresa da candidatura, depois do Combinou e sem corte de acesso. -> {ok, caminho} | erro.
create or replace function public.vagas_conta_foto(p_user uuid, p_candidatura uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  k public.vagas_candidaturas%rowtype;
begin
  if p_user is null or not exists (select 1 from public.vagas_contas c where c.user_id = p_user) then
    return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}');
  end if;
  if not vagas_interno.conta_valida(p_user) then return vagas_interno.erro('Esta conta está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}'); end if;
  if p_candidatura is null then
    if not vagas_interno.tem_foto(p_user) then return vagas_interno.erro('Sem foto.', '{"semFoto": true}'); end if;
    return vagas_interno.ok(jsonb_build_object('caminho', p_user::text || '/foto.jpg'));
  end if;
  select * into k from public.vagas_candidaturas where id = p_candidatura;
  if not found or not exists (select 1 from public.vagas_empresa_membros m join public.vagas_contas c on c.user_id = m.user_id
                               where m.empresa_id = k.empresa_id and m.user_id = p_user and m.ativo and c.tipo = 'empresa') then
    return vagas_interno.erro('Candidatura não encontrada.');
  end if;
  if k.status not in ('combinou', 'contratada') then
    return vagas_interno.erro('A foto só aparece depois do Combinou.', '{"semCombinou": true}');
  end if;
  if k.contato_cortado_em is not null then
    return vagas_interno.erro('A pessoa deixou de compartilhar o contato com a sua empresa.', '{"contatoCortado": true}');
  end if;
  if not exists (select 1 from public.vagas_empresas e where e.id = k.empresa_id and e.status = 'ativa') then
    return vagas_interno.erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', '{"suspensa": true}');
  end if;
  if not vagas_interno.tem_foto(k.pessoa_id) then return vagas_interno.erro('Esta pessoa não pôs foto.', '{"semFoto": true}'); end if;
  return vagas_interno.ok(jsonb_build_object('caminho', k.pessoa_id::text || '/foto.jpg'));
end;
$$;

-- Política do Storage: só conta de pessoa (não suspensa) grava a própria foto.
create or replace function public.vagas_sou_pessoa()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vagas_contas c where c.user_id = auth.uid() and c.tipo = 'pessoa' and c.status <> 'suspensa');
$$;

-- Testes e selos da pessoa para a exportação (gancho da migração 20261023: vagas_interno.testes_exportar(uuid)). Sem ela, null.
create or replace function vagas_interno.testes_da_pessoa(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if to_regprocedure('vagas_interno.testes_exportar(uuid)') is null then return null; end if;
  execute 'select to_jsonb(vagas_interno.testes_exportar($1))' into r using p_user;
  return r;
exception when others then
  return null;
end;
$$;

-- Exportar os próprios dados (LGPD, portabilidade).
create or replace function public.vagas_exportar_meus_dados()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta jsonb := vagas_interno.conta_atual(null);
  v_uid uuid := auth.uid();
  c public.vagas_contas%rowtype;
begin
  if not (v_conta ->> 'ok')::boolean then return v_conta::json; end if;
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

-- =============================================================================
-- DISC: o primeiro login NUNCA promove conta do Vagas sem Caos a administradora do painel
-- =============================================================================

-- Igual à 20261005 + a recusa de contas do Vagas sem Caos (app_metadata.produto = 'vagas' ou linha em vagas_contas).
create or replace function public.garantir_primeiro_admin()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'erro', 'Sessão expirada. Entre de novo.', 'sessaoExpirada', true);
  end if;
  if exists (select 1 from public.admins where user_id = v_uid) then
    return json_build_object('ok', true, 'admin', true);
  end if;
  -- Conta do Vagas sem Caos: nunca vira administradora (nem a primeira).
  if exists (select 1 from auth.users u where u.id = v_uid and coalesce(u.raw_app_meta_data ->> 'produto', '') = 'vagas')
     or exists (select 1 from public.vagas_contas c where c.user_id = v_uid) then
    return json_build_object('ok', true, 'admin', false);
  end if;
  lock table public.admins in share row exclusive mode;
  if exists (select 1 from public.admins) then
    return json_build_object('ok', true, 'admin', false);
  end if;
  select coalesce(nullif(disc_interno.limpar_texto(u.raw_user_meta_data ->> 'nome', 120), ''),
                  nullif(disc_interno.limpar_texto(u.raw_user_meta_data ->> 'name', 120), ''),
                  coalesce(u.email, ''))
    into v_nome from auth.users u where u.id = v_uid;
  if not found then
    return json_build_object('ok', false, 'erro', 'Sessão expirada. Entre de novo.', 'sessaoExpirada', true);
  end if;
  insert into public.admins (user_id, nome) values (v_uid, left(coalesce(v_nome, ''), 120));
  return json_build_object('ok', true, 'admin', true, 'primeiro', true);
end;
$$;

-- =============================================================================
-- Sementes: Boa Vista/RR ativa (zonas por bairros principais — lista inicial para a operação conferir e editar),
-- Mucajaí e Cantá no entorno da praça, Rorainópolis na lista de espera. Só entram se ainda não existirem.
-- =============================================================================

insert into public.vagas_cidades (slug, nome, uf, ibge, fuso, status, ordem) values
  ('boa-vista-rr', 'Boa Vista', 'RR', '1400100', 'America/Boa_Vista', 'ativa', 1),
  ('mucajai-rr', 'Mucajaí', 'RR', '1400308', 'America/Boa_Vista', 'ativa', 2),
  ('canta-rr', 'Cantá', 'RR', '1400175', 'America/Boa_Vista', 'ativa', 3),
  ('rorainopolis-rr', 'Rorainópolis', 'RR', '1400472', 'America/Boa_Vista', 'lista_espera', 4)
on conflict (slug) do nothing;

insert into public.vagas_areas (slug, nome, ordem) values
  ('atendimento', 'Atendimento e recepção', 1), ('vendas-loja', 'Vendas em loja e balcão', 2),
  ('vendas-externas', 'Vendas externas e representação', 3), ('caixa', 'Caixa e operação de loja', 4),
  ('administrativo', 'Administrativo e escritório', 5), ('financeiro', 'Financeiro e contabilidade', 6),
  ('rh', 'Recursos humanos', 7), ('logistica', 'Estoque, logística e entregas', 8),
  ('motorista', 'Motorista e transporte', 9), ('producao', 'Produção e indústria', 10), ('construcao', 'Construção civil', 11),
  ('manutencao', 'Manutenção e reparos', 12), ('limpeza', 'Limpeza e conservação', 13), ('cozinha', 'Cozinha e restaurante', 14),
  ('hotelaria', 'Hotelaria e eventos', 15), ('beleza', 'Beleza e estética', 16), ('saude', 'Saúde e farmácia', 17),
  ('educacao', 'Educação e creche', 18), ('agro', 'Agropecuária e campo', 19), ('seguranca', 'Segurança e portaria', 20),
  ('marketing', 'Marketing, design e redes sociais', 21), ('tecnologia', 'Tecnologia e informática', 22),
  ('domesticos', 'Serviços domésticos e cuidado de pessoas', 23), ('outros', 'Outros comércios e serviços', 24)
on conflict (slug) do nothing;

update public.vagas_cidades set praca_id = (select id from public.vagas_cidades where slug = 'boa-vista-rr')
 where slug in ('mucajai-rr', 'canta-rr') and praca_id is null;

insert into public.vagas_zonas (cidade_id, slug, nome, bairros, ordem)
select c.id, z.slug, z.nome, z.bairros, z.ordem
  from public.vagas_cidades c
  join (values
    ('boa-vista-rr', 'centro-leste', 'Centro e Zona Leste',
      array['Centro', 'São Pedro', 'São Francisco', 'Aparecida', '31 de Março', 'Canarinho', 'Caçari', 'Paraviana', 'Bairro dos Estados'], 1),
    ('boa-vista-rr', 'zona-norte', 'Zona Norte', array['Aeroporto', 'Cauamé', 'Jardim Floresta', 'Mecejana', 'Pricumã', 'Jóquei Clube'], 2),
    ('boa-vista-rr', 'zona-sul', 'Zona Sul',
      array['Calungá', 'São Vicente', 'Treze de Setembro', 'Marechal Rondon', 'Centenário', 'Distrito Industrial'], 3),
    ('boa-vista-rr', 'zona-oeste', 'Zona Oeste',
      array['Pintolândia', 'Senador Hélio Campos', 'Cidade Satélite', 'Jardim Primavera', 'Tancredo Neves', 'Asa Branca', 'Buritis',
            'Cambará', 'Caimbé', 'Liberdade', 'Raiar do Sol', 'Nova Cidade', 'Doutor Sílvio Botelho', 'Santa Tereza', 'Alvorada'], 4),
    ('mucajai-rr', 'cidade-toda', 'Mucajaí (cidade toda)', array[]::text[], 1),
    ('canta-rr', 'cidade-toda', 'Cantá (cidade toda)', array[]::text[], 1),
    ('rorainopolis-rr', 'cidade-toda', 'Rorainópolis (cidade toda)', array[]::text[], 1)
  ) as z(cidade, slug, nome, bairros, ordem) on z.cidade = c.slug
on conflict (cidade_id, slug) do nothing;

-- =============================================================================
-- RLS e permissões. Escrita: NENHUMA tabela aceita insert/update/delete direto de anon/authenticated (só as RPCs).
-- Leitura direta: cidades/zonas abertas; dados da própria conta; empresa/anúncio para membro, operador da cidade e equipe.
-- Pessoa, contato, experiências: só a própria pessoa (nem a equipe nem o operador pela API). Candidaturas, conversas,
-- mensagens, acessos (exceto a própria pessoa), limites e lista de espera: ninguém pela API.
-- =============================================================================

alter table public.vagas_cidades enable row level security;
alter table public.vagas_zonas enable row level security;
alter table public.vagas_areas enable row level security;
alter table public.vagas_contas enable row level security;
alter table public.vagas_consentimentos enable row level security;
alter table public.vagas_pessoas enable row level security;
alter table public.vagas_pessoa_contato enable row level security;
alter table public.vagas_experiencias enable row level security;
alter table public.vagas_empresas enable row level security;
alter table public.vagas_empresa_membros enable row level security;
alter table public.vagas_anuncios enable row level security;
alter table public.vagas_pulos enable row level security;
alter table public.vagas_candidaturas enable row level security;
alter table public.vagas_conversas enable row level security;
alter table public.vagas_mensagens enable row level security;
alter table public.vagas_denuncias enable row level security;
alter table public.vagas_moderacao enable row level security;
alter table public.vagas_operadores enable row level security;
alter table public.vagas_lista_espera enable row level security;
alter table public.vagas_acessos_contato enable row level security;
alter table public.vagas_limites enable row level security;
alter table public.vagas_referencia_convites enable row level security;
alter table public.vagas_referencias enable row level security;
alter table public.vagas_referencia_historico enable row level security;
alter table public.vagas_anuncio_vistas enable row level security;

drop policy if exists vagas_cidades_anon on public.vagas_cidades;
create policy vagas_cidades_anon on public.vagas_cidades for select to anon using (status in ('ativa', 'lista_espera'));
drop policy if exists vagas_cidades_aut on public.vagas_cidades;
create policy vagas_cidades_aut on public.vagas_cidades for select to authenticated
  using (status in ('ativa', 'lista_espera') or (select public.e_admin()) or id in (select public.vagas_ids_minhas_cidades()));

drop policy if exists vagas_zonas_anon on public.vagas_zonas;
create policy vagas_zonas_anon on public.vagas_zonas for select to anon
  using (ativa and cidade_id in (select c.id from public.vagas_cidades c where c.status in ('ativa', 'lista_espera')));
drop policy if exists vagas_zonas_aut on public.vagas_zonas;
create policy vagas_zonas_aut on public.vagas_zonas for select to authenticated
  using ((ativa and cidade_id in (select c.id from public.vagas_cidades c where c.status in ('ativa', 'lista_espera')))
         or (select public.e_admin()) or cidade_id in (select public.vagas_ids_minhas_cidades()));

drop policy if exists vagas_areas_ver on public.vagas_areas;
create policy vagas_areas_ver on public.vagas_areas for select to anon, authenticated using (ativa);

drop policy if exists vagas_contas_dono on public.vagas_contas;
create policy vagas_contas_dono on public.vagas_contas for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_admin()));

drop policy if exists vagas_consentimentos_dono on public.vagas_consentimentos;
create policy vagas_consentimentos_dono on public.vagas_consentimentos for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists vagas_pessoas_dono on public.vagas_pessoas;
create policy vagas_pessoas_dono on public.vagas_pessoas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_pessoa_contato_dono on public.vagas_pessoa_contato;
create policy vagas_pessoa_contato_dono on public.vagas_pessoa_contato for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_experiencias_dono on public.vagas_experiencias;
create policy vagas_experiencias_dono on public.vagas_experiencias for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists vagas_pulos_dono on public.vagas_pulos;
create policy vagas_pulos_dono on public.vagas_pulos for select to authenticated using (pessoa_id = (select auth.uid()));

drop policy if exists vagas_empresas_ver on public.vagas_empresas;
create policy vagas_empresas_ver on public.vagas_empresas for select to authenticated
  using (id in (select public.vagas_ids_minhas_empresas()) or cidade_id in (select public.vagas_ids_minhas_cidades()) or (select public.e_admin()));

drop policy if exists vagas_empresa_membros_ver on public.vagas_empresa_membros;
create policy vagas_empresa_membros_ver on public.vagas_empresa_membros for select to authenticated
  using (empresa_id in (select public.vagas_ids_minhas_empresas()) or (select public.e_admin()));

drop policy if exists vagas_anuncios_ver on public.vagas_anuncios;
create policy vagas_anuncios_ver on public.vagas_anuncios for select to authenticated
  using (empresa_id in (select public.vagas_ids_minhas_empresas()) or cidade_id in (select public.vagas_ids_minhas_cidades()) or (select public.e_admin()));

drop policy if exists vagas_denuncias_ver on public.vagas_denuncias;
create policy vagas_denuncias_ver on public.vagas_denuncias for select to authenticated
  using (autor = (select auth.uid()) or cidade_id in (select public.vagas_ids_minhas_cidades()) or (select public.e_admin()));

drop policy if exists vagas_moderacao_ver on public.vagas_moderacao;
create policy vagas_moderacao_ver on public.vagas_moderacao for select to authenticated
  using (cidade_id in (select public.vagas_ids_minhas_cidades()) or (select public.e_admin()));

drop policy if exists vagas_operadores_ver on public.vagas_operadores;
create policy vagas_operadores_ver on public.vagas_operadores for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_admin()));

drop policy if exists vagas_acessos_contato_dono on public.vagas_acessos_contato;
create policy vagas_acessos_contato_dono on public.vagas_acessos_contato for select to authenticated using (pessoa_id = (select auth.uid()));
-- vagas_candidaturas, vagas_conversas, vagas_mensagens, vagas_lista_espera, vagas_limites, vagas_referencias,
-- vagas_referencia_convites, vagas_referencia_historico, vagas_anuncio_vistas: nenhuma política (só as RPCs; a referência pendente de uma pessoa
-- nunca é lida por outra empresa, pelo operador nem pela equipe pela API).

-- Tabelas: tudo fechado; depois só SELECT onde há política.
do $$
declare
  papel text;
  t text;
  tabelas text[] := array['vagas_cidades', 'vagas_zonas', 'vagas_areas', 'vagas_contas', 'vagas_consentimentos', 'vagas_pessoas', 'vagas_pessoa_contato',
    'vagas_experiencias', 'vagas_empresas', 'vagas_empresa_membros', 'vagas_anuncios', 'vagas_pulos', 'vagas_candidaturas', 'vagas_conversas',
    'vagas_mensagens', 'vagas_denuncias', 'vagas_moderacao', 'vagas_operadores', 'vagas_lista_espera', 'vagas_acessos_contato', 'vagas_limites',
    'vagas_referencia_convites', 'vagas_referencias', 'vagas_referencia_historico', 'vagas_anuncio_vistas'];
begin
  foreach t in array tabelas loop
    execute format('revoke all on public.%I from public', t);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on public.%I from %I', t, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant all on public.%I to service_role', t); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on public.vagas_cidades, public.vagas_zonas, public.vagas_areas to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.vagas_cidades, public.vagas_zonas, public.vagas_areas, public.vagas_contas, public.vagas_consentimentos, public.vagas_pessoas,
      public.vagas_pessoa_contato, public.vagas_experiencias, public.vagas_pulos, public.vagas_empresas, public.vagas_empresa_membros,
      public.vagas_anuncios, public.vagas_moderacao, public.vagas_operadores, public.vagas_acessos_contato to authenticated;
    -- Denúncias: a operação lê só o conteúdo; quem denunciou (autor, origem = chave do IP) e quem escreveu a mensagem
    -- denunciada (autor_mensagem_user) ficam fora do alcance de qualquer leitura direta (só a service_role).
    grant select (id, alvo, anuncio_id, referencia_id, mensagem_id, conversa_id, empresa_id, cidade_id, conta_no_limite, motivo, detalhe,
      texto_denunciado, autor_mensagem, status, decidida_por, decidida_em, decisao_motivo, criado_em) on public.vagas_denuncias to authenticated;
  end if;
end $$;

-- Funções: as internas fechadas; as públicas com a lista exata de quem executa.
revoke all on all functions in schema vagas_interno from public;
do $$
declare
  papel text;
  f record;
  publicas text[] := array['vagas_cidades_publicas', 'vagas_anuncios_publicos', 'vagas_anuncio_publico', 'vagas_lista_espera_entrar',
    'vagas_lista_espera_sair', 'vagas_denunciar', 'vagas_referencias_publicas', 'vagas_anuncio_vista', 'vagas_areas_publicas'];
  servico text[] := array['vagas_conta_limite', 'vagas_conta_consultar', 'vagas_conta_registrar', 'vagas_conta_quem', 'vagas_conta_foto'];
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
            where p.pronamespace = 'public'::regnamespace and p.proname like 'vagas\_%' loop
    execute format('revoke all on function %s from public', f.assinatura);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then execute format('revoke all on function %s from %I', f.assinatura, papel); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.assinatura);
    end if;
    if not (f.proname = any (servico)) and exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if f.proname = any (publicas) and exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', f.assinatura);
    end if;
  end loop;
end $$;

-- Storage: bucket PRIVADO 'vagas-fotos' (≤ 1 MB; jpg, png, webp). A pessoa grava, troca, lê e apaga só o próprio
-- <user_id>/foto.jpg; ninguém mais lê direto (a empresa recebe URL assinada curta pela Edge Function, depois do Combinou).
-- Só roda onde existe o Storage do Supabase.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('vagas-fotos', 'vagas-fotos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']$q$;
  else
    execute $q$insert into storage.buckets (id, name, public) values ('vagas-fotos', 'vagas-fotos', false)
      on conflict (id) do update set public = false$q$;
  end if;
  execute 'drop policy if exists vagas_fotos_gravar on storage.objects';
  execute $q$create policy vagas_fotos_gravar on storage.objects for insert to authenticated
    with check (bucket_id = 'vagas-fotos' and name = (select auth.uid())::text || '/foto.jpg' and (select public.vagas_sou_pessoa()))$q$;
  execute 'drop policy if exists vagas_fotos_trocar on storage.objects';
  execute $q$create policy vagas_fotos_trocar on storage.objects for update to authenticated
    using (bucket_id = 'vagas-fotos' and name = (select auth.uid())::text || '/foto.jpg')
    with check (bucket_id = 'vagas-fotos' and name = (select auth.uid())::text || '/foto.jpg' and (select public.vagas_sou_pessoa()))$q$;
  execute 'drop policy if exists vagas_fotos_ver_propria on storage.objects';
  execute $q$create policy vagas_fotos_ver_propria on storage.objects for select to authenticated
    using (bucket_id = 'vagas-fotos' and name = (select auth.uid())::text || '/foto.jpg')$q$;
  execute 'drop policy if exists vagas_fotos_apagar on storage.objects';
  execute $q$create policy vagas_fotos_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'vagas-fotos' and name = (select auth.uid())::text || '/foto.jpg')$q$;
end $$;

-- -----------------------------------------------------------------------------
-- versao_banco: + 20261022120000_vagas
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
                                   and to_regprocedure('public.vagas_anuncios_publicos(jsonb)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261022120000, 'migracoes', to_jsonb(aplicadas),
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

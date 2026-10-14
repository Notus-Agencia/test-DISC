-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — AVISO DE ABERTURA da lista de espera. Roda DEPOIS de 20261024120000_vagas_onda2.sql
-- (e da 20261024120001, de dados). Idempotente e seguro sobre dados reais: só acrescenta colunas, índices, um gatilho,
-- funções e permissões, e recria versao_banco(). Nada é apagado por esta migração (a limpeza é das funções, sob regra).
-- É aplicada sozinha pela integração do GitHub do Supabase no push; à mão: SQL Editor → colar → Run.
--
-- Por quê: a cidade junta interessados em lista de espera (e-mail obrigatório, WhatsApp opcional). Sem um caminho para
-- avisar quando ela abre, juntar cadastro não serve para nada. Contrato: docs/VAGAS-SPEC.md §6.7, §7.1, §8.8 e §8.9.
--
--   1. E-MAIL (Edge Function vagas-conta, ação avisar_lista_espera; só a equipe = public.admins): para uma cidade ATIVA,
--      vagas_conta_aviso_lote reserva um lote de quem ainda não foi avisado (marca avisado_em NA HORA: se a Function cair no
--      meio, ninguém recebe duas vezes) e devolve e-mail e perfil SÓ para a Function; ela manda o e-mail (modelo
--      conteudo/vagas-textos/emails/cidade-abriu.html) e devolve em vagas_conta_aviso_marcar quem recebeu e quem falhou
--      (os que falharam voltam para a fila). Rodar de novo não manda duas vezes. A tela recebe só contagens.
--   2. WHATSAPP (sem envio automático): a equipe vê no painel UM contato por vez — só de quem deixou o WhatsApp e ainda não
--      foi avisado por ele — e manda à mão pelo link wa.me que o banco já devolve pronto, com o texto fixo de
--      conteudo/vagas-textos/whatsapp.json (lista_espera_cidade_abriu). Cada número mostrado e cada "avisei" ficam no
--      registro de moderação (sem o número). Operador(a) de cidade NÃO vê esta fila (a operação nunca lê contato de pessoa).
--   3. RETENÇÃO: a linha some quando a pessoa já foi avisada pelo que pediu (e-mail; e WhatsApp, se deixou) ou 30 dias
--      depois da abertura da cidade (vagas_cidades.aberta_em, gravada por gatilho quando a cidade vira ativa), o que vier
--      primeiro. A limpeza (vagas_interno.lista_espera_limpar) roda a cada lote, a cada contato da fila e pode ser agendada
--      (pg_cron: select vagas_interno.lista_espera_limpar();). Quem criar conta continua só como conta.
--   4. SAIR COM TOKEN (revisão de segurança, I5): cada e-mail do aviso leva um link de saída com token de uso único (só o
--      hash fica no banco); vagas_lista_espera_sair_link(p_token) tira a pessoa da lista sem precisar do e-mail, com resposta
--      sempre igual. A saída pela página (vagas_lista_espera_sair, com o e-mail) continua.
--   5. 2ª REVISÃO DE SEGURANÇA da onda 2 (as funções abaixo valem por cima das da 20261024120000, que já está em produção):
--      N2 — quem saiu da lista (pelo e-mail, pelo WhatsApp ou pelo link) não ganha WhatsApp novo para aquele e-mail por 24 h:
--      sair + entrar com o e-mail de outra pessoa não troca mais o número dela (a resposta continua igual).
--      N1 — "a empresa tem dona" conta só dona com conta válida (não suspensa, e-mail confirmado): o gatilho
--      membros_sem_dono promove a pessoa válida mais antiga, e o operador pode nomear dona quando a única dona é inválida;
--      a nova dona precisa ter conta válida.
--      Rodar a 20261024120000 de novo DEPOIS desta volta essas funções à versão antiga: rode esta em seguida.
--   6. versao_banco(): a lista da 20261024 + 20261024120002_vagas_aviso_abertura.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas, índices e o gatilho da abertura
-- -----------------------------------------------------------------------------

-- Quando a cidade abriu (passou a ativa) pela última vez. Conta os 30 dias da retenção da lista de espera.
alter table public.vagas_cidades add column if not exists aberta_em timestamptz;
-- Quando a equipe marcou que avisou pelo WhatsApp (o e-mail usa o avisado_em que já existia).
alter table public.vagas_lista_espera add column if not exists whatsapp_avisado_em timestamptz;
-- Hash (sha256) do token do link "sair da lista" que vai no e-mail do aviso; o token em claro só passa pela Edge Function.
alter table public.vagas_lista_espera add column if not exists sair_token_hash text;
alter table public.vagas_lista_espera drop constraint if exists vagas_lista_espera_sair_token_check;
alter table public.vagas_lista_espera add constraint vagas_lista_espera_sair_token_check
  check (sair_token_hash is null or sair_token_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists vagas_lista_espera_sair_token_idx on public.vagas_lista_espera (sair_token_hash) where sair_token_hash is not null;
create index if not exists vagas_lista_espera_aviso_idx on public.vagas_lista_espera (cidade_id, criado_em) where avisado_em is null;
create index if not exists vagas_lista_espera_aviso_whats_idx on public.vagas_lista_espera (cidade_id, criado_em)
  where whatsapp <> '' and whatsapp_avisado_em is null;

create or replace function vagas_interno.cidade_aberta_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'ativa' and (tg_op = 'INSERT' or old.status is distinct from 'ativa') then
    new.aberta_em := now();
  end if;
  return new;
end;
$$;
drop trigger if exists vagas_cidades_aberta_em on public.vagas_cidades;
create trigger vagas_cidades_aberta_em before insert or update of status on public.vagas_cidades
  for each row execute function vagas_interno.cidade_aberta_em();
-- Cidades que já estavam abertas antes desta migração: contam a partir de agora.
update public.vagas_cidades set aberta_em = now() where status = 'ativa' and aberta_em is null;

-- -----------------------------------------------------------------------------
-- Retenção
-- -----------------------------------------------------------------------------

-- Apaga da lista de espera das cidades ATIVAS: quem já foi avisado pelo que pediu (e-mail há mais de 1 hora — o lote em
-- andamento fica — e, se deixou WhatsApp, também por ele) e TODA a lista 30 dias depois da abertura. p_cidade null = todas.
-- Devolve quantas linhas saíram.
create or replace function vagas_interno.lista_espera_limpar(p_cidade uuid default null)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  delete from public.vagas_lista_espera l using public.vagas_cidades c
   where c.id = l.cidade_id and c.status = 'ativa' and (p_cidade is null or c.id = p_cidade)
     and ((l.avisado_em is not null and l.avisado_em < now() - interval '1 hour' and (l.whatsapp = '' or l.whatsapp_avisado_em is not null))
          or (c.aberta_em is not null and c.aberta_em <= now() - interval '30 days'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Contagens do aviso de uma cidade (nunca um contato).
create or replace function vagas_interno.aviso_contagens(p_cidade uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'naLista', count(*)::int,
    'aAvisarEmail', count(*) filter (where l.avisado_em is null)::int,
    'avisadosEmail', count(*) filter (where l.avisado_em is not null)::int,
    'aAvisarWhatsapp', count(*) filter (where l.whatsapp <> '' and l.whatsapp_avisado_em is null)::int)
  from public.vagas_lista_espera l where l.cidade_id = p_cidade;
$$;

-- Texto da mensagem de WhatsApp do aviso: o MESMO de conteudo/vagas-textos/whatsapp.json (lista_espera_cidade_abriu), com
-- {{cidade}} e {{link_cidade}} preenchidos (tests/supabase/vagas_aviso_abertura.test.js compara com o arquivo).
create or replace function vagas_interno.aviso_whatsapp_texto(p_cidade_nome text, p_slug text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(
    'Oi! Aqui é a equipe do Vagas sem Caos, da Gestão sem Caos. Você pediu para ser avisado(a) quando abríssemos em {{cidade}}: '
      || 'abrimos! As vagas da cidade já estão no site: {{link_cidade}}' || chr(10) || chr(10)
      || 'Esta é a única mensagem sobre a lista de espera: depois dela, o seu número sai da lista.' || chr(10) || chr(10)
      || 'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.',
    '{{cidade}}', coalesce(p_cidade_nome, '')),
    '{{link_cidade}}', 'https://vagas.gestaosemcaos.com.br/cidade.html?cidade=' || coalesce(p_slug, ''));
$$;

-- Codifica um texto para a query de um link (UTF-8, %XX; só letras, algarismos e - _ . ~ ficam como estão).
create or replace function vagas_interno.url_codificar(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  b bytea := convert_to(coalesce(p, ''), 'UTF8');
  r text := '';
  c int;
begin
  for i in 0 .. length(b) - 1 loop
    c := get_byte(b, i);
    if (c between 48 and 57) or (c between 65 and 90) or (c between 97 and 122) or c in (45, 46, 95, 126) then
      r := r || chr(c);
    else
      r := r || '%' || upper(lpad(to_hex(c), 2, '0'));
    end if;
  end loop;
  return r;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. E-mail: só para a Edge Function (service_role)
-- -----------------------------------------------------------------------------

-- Ação avisar_lista_espera: quem pede é da equipe (public.admins; a Function conferiu o JWT no Auth e manda o id)? A cidade
-- está ATIVA? Reserva até p_limite (1 a 50) contatos ainda não avisados, mais antigos primeiro, marcando avisado_em agora
-- (at-most-once: rodar de novo, ou duas abas ao mesmo tempo, não manda duas vezes), e devolve e-mail e perfil deles SÓ para
-- a Function. Erros: Sem permissão. · Sessão expirada. Entre de novo. · Cidade não encontrada. · A cidade ainda não está
-- aberta. Abra a cidade antes de avisar a lista de espera.
create or replace function public.vagas_conta_aviso_lote(p_user uuid, p_cidade text, p_limite integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_lim int := least(greatest(coalesce(p_limite, 25), 1), 50);
  v_lote jsonb;
  v_n int;
  q record;
  v_token text;
  v_saida jsonb := '[]'::jsonb;
begin
  -- Só a Edge Function (service_role). Uma nova aplicação da 20261022 daria EXECUTE a authenticated pelo laço dela.
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  if p_user is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if not exists (select 1 from public.admins a where a.user_id = p_user) then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status <> 'ativa' then
    return vagas_interno.erro('A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.');
  end if;
  perform vagas_interno.lista_espera_limpar(c.id);
  with escolhidos as (
    select l.id from public.vagas_lista_espera l
     where l.cidade_id = c.id and l.avisado_em is null
     order by l.criado_em, l.id
     limit v_lim
     for update skip locked
  ), reservados as (
    update public.vagas_lista_espera l set avisado_em = now()
      from escolhidos e where l.id = e.id
    returning l.id, l.email, l.perfil, l.criado_em
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'perfil', r.perfil) order by r.criado_em, r.id), '[]'::jsonb),
         count(*)::int
    into v_lote, v_n
    from reservados r;
  -- Um token de saída por pessoa do lote (64 hex; no banco, só o hash).
  for q in select x ->> 'id' as id, x ->> 'email' as email, x ->> 'perfil' as perfil from jsonb_array_elements(v_lote) x loop
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update public.vagas_lista_espera set sair_token_hash = vagas_interno.token_hash(v_token) where id = q.id::uuid;
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('id', q.id, 'email', q.email, 'perfil', q.perfil, 'sairToken', v_token));
  end loop;
  if v_n > 0 then
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
    values (c.id, p_user, 'admin', 'aviso_email_lote', 'cidade', c.id, '', jsonb_build_object('reservados', v_n));
  end if;
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome), 'lote', v_saida,
    'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- Depois do envio: p_enviados recebeu o e-mail (sai da lista se não deixou WhatsApp a avisar); p_falhas volta para a fila
-- (avisado_em = null). Só mexe em linhas da cidade, reservadas (avisado_em preenchido). Devolve contagens.
create or replace function public.vagas_conta_aviso_marcar(p_user uuid, p_cidade text, p_enviados uuid[], p_falhas uuid[])
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  v_ok int;
  v_falhas int;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then return vagas_interno.erro('Sem permissão.'); end if;
  if p_user is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  if not exists (select 1 from public.admins a where a.user_id = p_user) then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  update public.vagas_lista_espera set avisado_em = null
   where cidade_id = c.id and avisado_em is not null and id = any (coalesce(p_falhas, array[]::uuid[]));
  get diagnostics v_falhas = row_count;
  select count(*)::int into v_ok from public.vagas_lista_espera
   where cidade_id = c.id and avisado_em is not null and id = any (coalesce(p_enviados, array[]::uuid[]));
  delete from public.vagas_lista_espera
   where cidade_id = c.id and avisado_em is not null and id = any (coalesce(p_enviados, array[]::uuid[]))
     and (whatsapp = '' or whatsapp_avisado_em is not null);
  if v_ok + v_falhas > 0 then
    insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
    values (c.id, p_user, 'admin', 'aviso_email', 'cidade', c.id, '', jsonb_build_object('enviados', v_ok, 'falhas', v_falhas));
  end if;
  return vagas_interno.ok(jsonb_build_object('enviados', v_ok, 'falhas', v_falhas, 'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- Link "sair da lista" do e-mail do aviso (público): apaga a linha do token (com e-mail e WhatsApp). Resposta SEMPRE igual
-- (token certo, errado, usado ou de quem já saiu): {ok:true, removido:true}. Não precisa do e-mail; nada é devolvido.
create or replace function public.vagas_lista_espera_sair_link(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if lower(btrim(coalesce(p_token, ''))) ~ '^[0-9a-f]{64}$' then
    delete from public.vagas_lista_espera where sair_token_hash = vagas_interno.token_hash(p_token);
  end if;
  return vagas_interno.ok(jsonb_build_object('removido', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Painel da equipe (authenticated + public.e_admin()): contagens e a fila do WhatsApp
-- -----------------------------------------------------------------------------

-- Situação do aviso de uma cidade, só números: status, quando abriu, até quando a lista fica (30 dias) e quantos faltam.
create or replace function public.vagas_adm_aviso_resumo(p_cidade text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome, 'status', c.status,
      'abertaEm', disc_interno.iso(c.aberta_em),
      'listaAte', case when c.status = 'ativa' and c.aberta_em is not null then disc_interno.iso(c.aberta_em + interval '30 days') else '' end),
    'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- Próximo contato a avisar pelo WhatsApp (UM por vez; o mesmo até a equipe marcar): só de quem deixou o número e ainda não
-- foi avisado por ele, numa cidade ATIVA. Mostrar o número fica registrado (sem o número). Vem com o texto fixo de
-- whatsapp.json e o link wa.me pronto (a tela só abre o link).
create or replace function public.vagas_adm_aviso_whatsapp(p_cidade text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.vagas_cidades%rowtype;
  l public.vagas_lista_espera%rowtype;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  select * into c from public.vagas_cidades where slug = lower(btrim(coalesce(p_cidade, '')));
  if not found then return vagas_interno.erro('Cidade não encontrada.'); end if;
  if c.status <> 'ativa' then
    return vagas_interno.erro('A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.');
  end if;
  perform vagas_interno.lista_espera_limpar(c.id);
  select * into l from public.vagas_lista_espera x
   where x.cidade_id = c.id and x.whatsapp <> '' and x.whatsapp_avisado_em is null
   order by x.criado_em, x.id limit 1;
  if found then
    perform vagas_interno.registrar(c.id, 'admin', 'aviso_whatsapp_ver', 'cidade', c.id, '');
  end if;
  return vagas_interno.ok(jsonb_build_object('cidade', jsonb_build_object('slug', c.slug, 'nome', c.nome),
    'contato', case when l.id is null then null else jsonb_build_object('id', l.id, 'whatsapp', l.whatsapp, 'perfil', l.perfil,
      'texto', vagas_interno.aviso_whatsapp_texto(c.nome, c.slug),
      'link', 'https://wa.me/' || l.whatsapp || '?text=' || vagas_interno.url_codificar(vagas_interno.aviso_whatsapp_texto(c.nome, c.slug))) end,
    'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- "Avisei" (ou "pular": número que não é WhatsApp) para o contato mostrado: marca whatsapp_avisado_em, registra (sem o número)
-- e tira da lista quem já recebeu o e-mail. De novo: duplicado. Erro: Contato não encontrado. (já saiu da lista).
create or replace function public.vagas_adm_aviso_whatsapp_feito(p_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.vagas_lista_espera%rowtype;
  c public.vagas_cidades%rowtype;
  v_dup boolean;
begin
  if not public.e_admin() then return vagas_interno.erro('Sem permissão.'); end if;
  select * into l from public.vagas_lista_espera where id = p_id for update;
  if not found or l.whatsapp = '' then return vagas_interno.erro('Contato não encontrado.'); end if;
  select * into c from public.vagas_cidades where id = l.cidade_id;
  if c.status <> 'ativa' then
    return vagas_interno.erro('A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.');
  end if;
  v_dup := l.whatsapp_avisado_em is not null;
  if not v_dup then
    update public.vagas_lista_espera set whatsapp_avisado_em = now() where id = l.id;
    perform vagas_interno.registrar(c.id, 'admin', 'aviso_whatsapp', 'cidade', c.id, '');
    -- Já avisada pelo e-mail também (ou com o e-mail em envio agora: o WhatsApp já avisou): sai da lista.
    delete from public.vagas_lista_espera where id = l.id and avisado_em is not null;
  end if;
  return vagas_interno.ok(jsonb_build_object('duplicado', v_dup, 'contagens', vagas_interno.aviso_contagens(c.id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Segunda revisão de segurança da onda 2 (N1, N2)
-- -----------------------------------------------------------------------------

-- N2. Marca que um e-mail saiu da lista de uma cidade (na tabela de limites, só o hash do e-mail; some em 8 dias). Por 24 h,
-- entrar de novo com esse e-mail não grava WhatsApp: quem tirou da lista o e-mail de outra pessoa não consegue pôr o
-- próprio número no lugar do dela. Quem saiu de verdade e quer o aviso pelo WhatsApp entra de novo no dia seguinte.
create or replace function vagas_interno.lista_espera_saiu(p_cidade uuid, p_email text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_cidade is null or coalesce(p_email, '') = '' then return; end if;
  perform vagas_interno.contar('lista_saiu', p_cidade::text || ':' || vagas_interno.token_hash(p_email), interval '24 hours');
end;
$$;

create or replace function vagas_interno.lista_espera_saiu_recente(p_cidade uuid, p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select vagas_interno.contagem('lista_saiu', p_cidade::text || ':' || vagas_interno.token_hash(p_email), interval '24 hours') > 0;
$$;

-- "Avise-me quando chegar" {cidade, email, perfil?, whatsapp?}: IGUAL à da 20261024120000 + N2 (e-mail que saiu há menos
-- de 24 h entra sem WhatsApp). Limite: 10 por hora por origem. A resposta é a MESMA com ou sem WhatsApp e não revela se o
-- e-mail já estava na lista. Repetir o e-mail não duplica; o primeiro WhatsApp gravado para aquele e-mail fica.
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
  -- N2: saiu há menos de 24 h → entra sem WhatsApp (a resposta é a mesma).
  if v_whats <> '' and vagas_interno.lista_espera_saiu_recente(c.id, v_email) then v_whats := ''; end if;
  insert into public.vagas_lista_espera as l (cidade_id, email, perfil, whatsapp, whatsapp_em)
  values (c.id, v_email, v_perfil, v_whats, case when v_whats <> '' then now() end)
  on conflict (cidade_id, email) do update set
    -- I5: o PRIMEIRO WhatsApp gravado fica (um terceiro não troca o número de outra pessoa).
    whatsapp = case when l.whatsapp = '' and excluded.whatsapp <> '' then excluded.whatsapp else l.whatsapp end,
    whatsapp_em = case when l.whatsapp = '' and excluded.whatsapp <> '' then excluded.whatsapp_em else l.whatsapp_em end;
  return vagas_interno.ok(jsonb_build_object('cidade', c.slug, 'interessados', vagas_interno.interessados(c.id)));
end;
$$;

-- Sair da lista de espera (LGPD) {cidade, email?, whatsapp?}: IGUAL à da 20261024120000 + N2 (marca a saída de cada e-mail
-- que saiu ou perdeu o número). Com o e-mail apaga a linha dele (e o WhatsApp junto); com o WhatsApp tira esse número de
-- todas as linhas da cidade (os e-mails ficam). Resposta sempre igual, exista ou não.
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
      if vagas_interno.contar('lista_espera', o, interval '1 hour') > 10 then
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

-- Link "sair da lista" do e-mail do aviso (público), agora também com a marca de saída do N2.
create or replace function public.vagas_lista_espera_sair_link(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  x record;
begin
  if lower(btrim(coalesce(p_token, ''))) ~ '^[0-9a-f]{64}$' then
    for x in delete from public.vagas_lista_espera where sair_token_hash = vagas_interno.token_hash(p_token) returning cidade_id, email loop
      perform vagas_interno.lista_espera_saiu(x.cidade_id, x.email);
    end loop;
  end if;
  return vagas_interno.ok(jsonb_build_object('removido', true));
end;
$$;

-- N1. Rede de segurança da empresa sem dona: IGUAL à da 20261024120000, mas "tem dona" e "quem vira dona" contam só conta
-- VÁLIDA (não suspensa, e-mail confirmado). Assim a empresa não fica nas mãos de uma conta suspensa.
create or replace function vagas_interno.membros_sem_dono()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := coalesce(old.empresa_id, new.empresa_id);
  v_novo uuid;
begin
  if not exists (select 1 from public.vagas_empresas e where e.id = v_empresa) then return null; end if;
  if exists (select 1 from public.vagas_empresa_membros m
              where m.empresa_id = v_empresa and m.ativo and m.papel = 'dono' and vagas_interno.conta_valida(m.user_id)) then
    return null;
  end if;
  select m.user_id into v_novo from public.vagas_empresa_membros m
   where m.empresa_id = v_empresa and m.ativo and m.papel <> 'dono' and vagas_interno.conta_valida(m.user_id)
   order by m.criado_em, m.user_id limit 1;
  if v_novo is null then return null; end if;   -- ninguém válido: a equipe da Gestão sem Caos resolve (vagas_op_empresa_dono)
  update public.vagas_empresa_membros set papel = 'dono' where empresa_id = v_empresa and user_id = v_novo;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
  select e.cidade_id, null, 'sistema', 'dono_automatico', 'empresa', e.id, 'A empresa ficou sem pessoa dona.', '{}'::jsonb
    from public.vagas_empresas e where e.id = v_empresa;
  return null;
end;
$$;

-- N1. A operação nomeia a nova pessoa dona: IGUAL à da 20261024120000, mas o operador pode agir quando nenhuma dona ativa
-- tem conta válida (suspensa ou sem e-mail confirmado), e a pessoa nomeada precisa ter conta válida.
create or replace function public.vagas_op_empresa_dono(p_empresa uuid, p_email text, p_motivo text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.vagas_empresas%rowtype;
  v_papel text;
  v_user uuid;
  v_email text := vagas_interno.email(p_email);
  v_motivo text := coalesce(disc_interno.limpar_texto(coalesce(p_motivo, ''), 300), '');
begin
  if auth.uid() is null then return vagas_interno.erro('Sessão expirada. Entre de novo.', '{"sessaoExpirada": true}'); end if;
  select * into e from public.vagas_empresas where id = p_empresa;
  if not found then return vagas_interno.erro('Empresa não encontrada.'); end if;
  v_papel := vagas_interno.papel_cidade(e.cidade_id);
  if v_papel is null or v_papel = 'moderador' then return vagas_interno.erro('Sem permissão.'); end if;
  if v_papel = 'operador' and exists (select 1 from public.vagas_empresa_membros d
                                       where d.empresa_id = e.id and d.ativo and d.papel = 'dono' and vagas_interno.conta_valida(d.user_id)) then
    return vagas_interno.erro('A empresa já tem uma pessoa dona. Para trocar, fale com a equipe da Gestão sem Caos.');
  end if;
  if v_motivo = '' then return vagas_interno.erro('Informe o motivo.'); end if;
  if v_email = '' then return vagas_interno.erro('E-mail inválido.'); end if;
  select m.user_id into v_user from public.vagas_empresa_membros m join auth.users u on u.id = m.user_id
   where m.empresa_id = e.id and m.ativo and lower(u.email) = v_email limit 1;
  if v_user is null then return vagas_interno.erro('Esta pessoa não está na equipe da empresa.'); end if;
  if not vagas_interno.conta_valida(v_user) then
    return vagas_interno.erro('Esta pessoa não pode ser dona agora: a conta dela está suspensa ou ainda não confirmou o e-mail.');
  end if;
  update public.vagas_empresa_membros set papel = 'dono' where empresa_id = e.id and user_id = v_user;
  perform vagas_interno.registrar(e.cidade_id, v_papel, 'empresa_dono', 'empresa', e.id, v_motivo, jsonb_build_object('papel', 'dono'));
  return vagas_interno.ok(jsonb_build_object('empresa', jsonb_build_object('id', e.id), 'membro', jsonb_build_object('papel', 'dono')));
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões do que é novo
-- -----------------------------------------------------------------------------

do $$
declare
  papel text;
  f text;
  autenticadas text[] := array['public.vagas_adm_aviso_resumo(text)', 'public.vagas_adm_aviso_whatsapp(text)',
    'public.vagas_adm_aviso_whatsapp_feito(uuid)', 'public.vagas_op_empresa_dono(uuid, text, text)'];
  servico text[] := array['public.vagas_conta_aviso_lote(uuid, text, integer)', 'public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[])'];
  publicas text[] := array['public.vagas_lista_espera_sair_link(text)', 'public.vagas_lista_espera_entrar(jsonb)',
    'public.vagas_lista_espera_sair(jsonb)'];
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
-- versao_banco: copia a lista da 20261024120000 e acrescenta a 22 (esta).
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
                                         and to_regprocedure('public.vagas_conta_aviso_lote(uuid, text, integer)') is not null)
    ) as t(ordem, nome, ok)
    order by ordem
  loop
    if m.ok then aplicadas := aplicadas || m.nome; else faltando := faltando || m.nome; end if;
  end loop;
  return json_build_object('ok', true, 'versao', 20261024120002, 'migracoes', to_jsonb(aplicadas),
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

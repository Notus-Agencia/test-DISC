-- =============================================================================
-- Vagas sem Caos (Gestão sem Caos) — DADOS: a cidade do piloto, informada pelo dono em 13/10: Uruaçu (GO), só ela por enquanto.
-- Roda DEPOIS de 20261024120000_vagas_onda2.sql (usa a coluna "porte"). Só dados; idempotente; nada é apagado.
--
--   * Cidade uruacu-go: Uruaçu, GO, IBGE 5221601 (código conferido no IBGE: mapa municipal e página do município), fuso
--     America/Sao_Paulo (Goiás usa o horário de Brasília), porte 'pequena' (42.546 habitantes no Censo 2022: os alvos de
--     "cidadePequena" de conteudo/vagas-operacao/indicadores.json), status 'lista_espera' (antes do lançamento ela capta
--     interessados; quem abre é a equipe, pelo painel: vagas_adm_cidade_salvar {slug:'uruacu-go', status:'ativa'}), ordem 1.
--     Se ela já existir (criada pelo painel), nada dela muda aqui.
--   * Zonas: a lista proposta pela operação (bloco "operacao — Uruaçu" da mesa da equipe). Rodar de novo só acrescenta zona
--     nova: zona que já existe (mesmo slug) fica como o painel deixou (revisão de segurança: a semente não desfaz o trabalho
--     do operador). Mudar nome, bairros ou ordem é pelo painel (vagas_adm_zona_salvar); para tirar uma zona, desative pelo
--     painel com {cidade, slug, nome, ativa:false} (a função da fundação pede o nome também). Este arquivo não apaga nem
--     desativa zona nenhuma.
--   * As cidades de Roraima da semente da fundação (dado fictício de exemplo) passam a 'rascunho' — só o status muda; zonas,
--     praça e qualquer dado ligado a elas ficam. Isso acontece UMA vez (marca 'piloto_definido' no registro de moderação):
--     rodar de novo não desfaz uma reativação feita depois pelo painel.
-- =============================================================================

insert into public.vagas_cidades (slug, nome, uf, ibge, fuso, status, porte, ordem)
values ('uruacu-go', 'Uruaçu', 'GO', '5221601', 'America/Sao_Paulo', 'lista_espera', 'pequena', 1)
on conflict (slug) do nothing;

-- Zonas de Uruaçu (operação, 13/10; exatamente a lista da mesa, inclusive as vazias): só os bairros cuja posição o nome ou o
-- endereço indica; o operador encaixa o resto na semana 1 (Setor São Sebastião, Setor Aeroporto, Setor Aeroporto II, Vila
-- Guimarães, Setor Santa Helena, Setor Bandeirantes, São Vicente, Vila Primavera I, Vale do Sol, Setor Rosem Parque).
-- Lista vazia é aceita.
insert into public.vagas_zonas (cidade_id, slug, nome, bairros, ordem)
select c.id, z.slug, z.nome, z.bairros, z.ordem
  from public.vagas_cidades c
  join (values
    ('centro', 'Centro', array['Centro', 'Setor Central', 'Vila Santana', 'Loteamento Santana'], 1),
    ('regiao-norte', 'Região Norte', array['Francisco Martins'], 2),
    ('regiao-sul', 'Região Sul', array['Setor Sul', 'Setor Sul I'], 3),
    ('regiao-leste', 'Região Leste', array[]::text[], 4),
    ('regiao-oeste', 'Região Oeste', array[]::text[], 5),
    ('zona-rural', 'Zona rural e lago', array['Zona rural', 'Geriaçu', 'Beira do Lago de Serra da Mesa'], 6)
  ) as z(slug, nome, bairros, ordem) on true
 where c.slug = 'uruacu-go'
on conflict (cidade_id, slug) do nothing;

-- A semente de exemplo da fundação sai do ar (uma vez só).
do $$
declare
  v_piloto uuid := (select c.id from public.vagas_cidades c where c.slug = 'uruacu-go');
  v_tiradas text[];
begin
  if v_piloto is null then return; end if;
  if exists (select 1 from public.vagas_moderacao m where m.acao = 'piloto_definido' and m.alvo = 'cidade' and m.alvo_id = v_piloto) then
    return;
  end if;
  with mudadas as (
    update public.vagas_cidades set status = 'rascunho'
     where slug in ('boa-vista-rr', 'mucajai-rr', 'canta-rr', 'rorainopolis-rr') and status <> 'rascunho'
    returning slug)
  select coalesce(array_agg(slug order by slug), array[]::text[]) into v_tiradas from mudadas;
  insert into public.vagas_moderacao (cidade_id, ator, papel, acao, alvo, alvo_id, motivo, dados)
  values (v_piloto, null, 'sistema', 'piloto_definido', 'cidade', v_piloto, 'Cidade do piloto definida pelo dono.',
    jsonb_build_object('rascunho', to_jsonb(v_tiradas)));
end $$;

-- O PostgREST relê o esquema.
notify pgrst, 'reload schema';

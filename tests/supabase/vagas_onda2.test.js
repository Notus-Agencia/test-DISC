'use strict';
// Testes da migração 20261024120000_vagas_onda2.sql (+ a de dados 20261024120001_vagas_piloto_uruacu.sql) num Postgres 17
// EMBUTIDO, com TODAS as migrações aplicadas em sequência e estas duas aplicadas duas vezes. Mesmo preparo "tipo Supabase"
// dos outros testes do banco. Cobre: versão, permissões das peças novas, a cidade do piloto e a semente antiga em rascunho,
// lista de espera com WhatsApp opcional (resposta neutra, saída), indicadores da praça (só agregados, só a própria cidade,
// alvo pelo porte, cor pela regra do arquivo, o mesmo catálogo do arquivo e do JS), convite de equipe pela empresa (só
// dono(a), token de uso único guardado com hash, validade, resposta neutra, limites, remover sem deixar a empresa sem dono)
// e o fuso da cidade da conta nos testes de habilidade (nada fixo em Roraima).
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const REGRAS = require('../../vagas/js/regras.js');

const RAIZ = path.join(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'supabase', 'migrations');
const ler = (n) => fs.readFileSync(path.join(PASTA, n + '.sql'), 'utf8');
const TODAS = fs.readdirSync(PASTA).filter((a) => a.endsWith('.sql')).sort().map((a) => a.replace(/\.sql$/, ''));
const ESTA = '20261024120000_vagas_onda2';
const DADOS = '20261024120001_vagas_piloto_uruacu';
const ANTES = TODAS.slice(0, TODAS.indexOf(ESTA));
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
const ARQ_INDICADORES = path.join(RAIZ, 'conteudo', 'vagas-operacao', 'indicadores.json');
const INVALIDO = 'Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.';
const SO_DONO_CONVIDAR = 'Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.';
const SO_DONO_EQUIPE = 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.';
const WHATS_INVALIDO = 'WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).';

const PREPARO_SUPABASE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema extensions;
  create extension if not exists pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint,
    allowed_mime_types text[], owner uuid);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text,
    owner uuid, metadata jsonb, created_at timestamptz default now(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;
`;

let pg = null;
let db = null;
let falhaInicio = null;
let M = null;   // scripts/montar-testes.mjs (banco de questões FICTÍCIO, só em memória)

test.before(async () => {
  try {
    M = await import('../../scripts/montar-testes.mjs');
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-onda2-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 62000 + Math.floor(Math.random() * 800),
      persistent: false, createPostgresUser: true, initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {}, onError: () => {}
    });
    await pg.initialise();
    await pg.start();
    db = pg.getPgClient();
    await db.connect();
    await db.query(PREPARO_SUPABASE);
  } catch (err) {
    falhaInicio = err;
  }
});

test.after(async () => {
  try { if (db) await db.end(); } catch (e) { /* ignora */ }
  try { if (pg) await pg.stop(); } catch (e) { /* ignora */ }
});

function exigirBanco() {
  if (falhaInicio) throw new Error('Postgres embutido não iniciou: ' + falhaInicio.message);
}

// Executa como o PostgREST: papel, usuário do JWT e (opcional) cabeçalhos da requisição.
async function como(papel, uid, sql, params, opcoes) {
  const o = opcoes || {};
  await db.query('begin');
  try {
    await db.query(`set local role ${papel}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    if (o.cabecalhos) await db.query("select set_config('request.headers', $1, true)", [JSON.stringify(o.cabecalhos)]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}
const js = (a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a);
async function rpcComo(papel, uid, fn, args, opcoes) {
  const lista = args || [];
  const marcas = lista.map((_, i) => '$' + (i + 1)).join(', ');
  return (await como(papel, uid, `select public.${fn}(${marcas}) as r`, lista.map(js), opcoes)).rows[0].r;
}
const anon = (fn, ...args) => rpcComo('anon', null, fn, args);
const anonIp = (n) => (fn, ...args) => rpcComo('anon', null, fn, args, { cabecalhos: { 'x-forwarded-for': '198.51.100.' + n } });
const de = (uid) => (fn, ...args) => rpcComo('authenticated', uid, fn, args);
const servico = (fn, ...args) => rpcComo('service_role', null, fn, args);

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}
function erro(r, padrao) {
  assert.equal(r.ok, false, JSON.stringify(r));
  if (padrao instanceof RegExp) assert.match(r.erro, padrao); else assert.equal(r.erro, padrao);
  return r;
}
function ok(r) { assert.equal(r.ok, true, r && r.erro); return r; }

let seq = 0;
async function usuarioAuth(email, opcoes) {
  const o = opcoes || {};
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ($1, $2, $3, $4, $5)`,
    [id, email, JSON.stringify(o.meta || {}), JSON.stringify(o.app || {}), o.confirmado === false ? null : new Date().toISOString()]);
  return id;
}
async function contaVagas(tipo, opcoes) {
  const o = opcoes || {};
  seq += 1;
  const email = o.email || (tipo + seq + '@onda2.teste');
  const id = await usuarioAuth(email, { app: { produto: 'vagas', tipo }, confirmado: o.confirmado, meta: o.meta });
  ok(await servico('vagas_conta_registrar', id, Object.assign({ tipo, termosVersao: '2026-10' }, o.dados || {})));
  return id;
}
const emailDe = async (uid) => (await db.query(`select email from auth.users where id = $1`, [uid])).rows[0].email;

function cnpjCom(base12) {
  const val = (c) => c.charCodeAt(0) - 48;
  const dv = (s, pesos) => { const r = s.split('').reduce((a, c, i) => a + val(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
function pessoaDados(extra) {
  return Object.assign({
    cidade: 'uruacu-go', zona: 'centro', maior18: true, cargos: ['Atendente'], escolaridade: 'medio', turnos: ['manha'],
    cnh: [], modalidades: ['clt'], cursos: [], sobre: '', nome: 'Pessoa de Teste Silva', whatsapp: '62 99123-4567', experiencias: []
  }, extra || {});
}
function anuncioDados(empresaId, extra) {
  return Object.assign({
    empresaId, area: 'atendimento', funcao: 'Atendente de loja', modalidade: 'clt',
    descricao: 'Atendimento no balcão, organização de prateleiras e apoio no caixa. Escala 6x1 com folga no domingo.',
    turno: 'comercial', experiencia: 'nao_precisa', escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'uruacu-go', zona: 'centro'
  }, extra || {});
}

const S = {};   // estado compartilhado entre os testes (em ordem)
// Os testes convidam muito pela mesma empresa: zera o contador diário entre as partes (o limite tem teste próprio).
const zerarLimitesEquipe = () => db.query(`delete from public.vagas_limites where tipo like 'equipe\\_convite%'`);

test('migrações em sequência e as duas da onda 2 duas vezes: DISC intacto, versão 20261024120001', async () => {
  exigirBanco();
  for (const n of ANTES) await db.query(ler(n));
  S.adminDisc = await usuarioAuth('dono@gestaosemcaos.teste');
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Dono')`, [S.adminDisc]);
  const anonAntes = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not like 'vagas\\_%' order by 1`)).rows;
  assert.equal((await anon('versao_banco')).versao, 20261023120001);
  // Banco de questões FICTÍCIO (só em memória) para os testes de habilidade.
  const lido = M.lerConteudo(FIXTURE);
  assert.deepEqual(lido.erros, []);
  await db.query(M.gerarSql(lido.dados));

  for (let i = 0; i < 2; i++) { await db.query(ler(ESTA)); await db.query(ler(DADOS)); }
  const v = await anon('versao_banco');
  assert.equal(v.versao, 20261024120001);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-3), ['20261023120001_vagas_questoes', ESTA, DADOS]);
  const anonDepois = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not like 'vagas\\_%' order by 1`)).rows;
  assert.deepEqual(anonDepois, anonAntes, 'o anon do DISC executa exatamente as mesmas funções');
  // Sem a peça nova, a 20 "falta"; sem a cidade do piloto, a 21.
  await db.query(`alter table public.vagas_equipe_convites rename to vagas_equipe_convites_x`);
  assert.deepEqual((await anon('versao_banco')).faltando, [ESTA]);
  await db.query(`alter table public.vagas_equipe_convites_x rename to vagas_equipe_convites`);
  await db.query(`update public.vagas_cidades set slug = 'uruacu-xx' where slug = 'uruacu-go'`);
  assert.deepEqual((await anon('versao_banco')).faltando, [DADOS]);
  await db.query(`update public.vagas_cidades set slug = 'uruacu-go' where slug = 'uruacu-xx'`);
});

test('guardas: tabela nova com RLS e sem acesso direto; funções novas com a lista exata de quem executa; nada fixo em Roraima', async () => {
  exigirBanco();
  const t = (await db.query(`select c.relrowsecurity r from pg_class c where c.oid = 'public.vagas_equipe_convites'::regclass`)).rows[0];
  assert.equal(t.r, true);
  for (const papel of ['anon', 'authenticated']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal((await db.query(`select has_table_privilege($1, 'public.vagas_equipe_convites', $2) x`, [papel, priv])).rows[0].x, false, papel + ' ' + priv);
    }
  }
  assert.equal((await db.query(`select count(*)::int n from pg_policies where tablename = 'vagas_equipe_convites'`)).rows[0].n, 0);
  await rejeita(como('authenticated', S.adminDisc, `select * from public.vagas_equipe_convites`), /permission denied/);
  // anon executa exatamente as funções públicas do Vagas (as mesmas da fundação).
  const anonVagas = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'vagas\\_%' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows
    .map((x) => x.proname);
  assert.deepEqual(anonVagas, ['vagas_anuncio_publico', 'vagas_anuncio_vista', 'vagas_anuncios_publicos', 'vagas_areas_publicas',
    'vagas_cidades_publicas', 'vagas_denunciar', 'vagas_lista_espera_entrar', 'vagas_lista_espera_sair', 'vagas_referencias_publicas',
    'vagas_selo_publico', 'vagas_testes_catalogo']);
  for (const fn of ['vagas_op_indicadores', 'vagas_equipe_empresa', 'vagas_equipe_convite', 'vagas_equipe_convite_aceitar',
    'vagas_equipe_convite_cancelar', 'vagas_equipe_remover', 'vagas_adm_cidade_salvar', 'vagas_pessoa_salvar', 'vagas_iniciar_tentativa']) {
    const r = (await db.query(`select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) a, bool_or(has_function_privilege('anon', p.oid, 'execute')) b
      from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [fn])).rows[0];
    assert.deepEqual(r, { a: true, b: false }, fn);
  }
  const srv = (await db.query(`select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) a, bool_or(has_function_privilege('anon', p.oid, 'execute')) b,
    bool_and(has_function_privilege('service_role', p.oid, 'execute')) s from pg_proc p where p.proname = 'vagas_conta_convite_equipe'`)).rows[0];
  assert.deepEqual(srv, { a: false, b: false, s: true });
  // Mesmo que alguém dê EXECUTE a authenticated (ex.: aplicar a 20261022 de novo), a função de serviço recusa por dentro.
  await db.query(`grant execute on function public.vagas_conta_convite_equipe(uuid, uuid, text, text, text) to authenticated`);
  erro(await de(S.adminDisc)('vagas_conta_convite_equipe', S.adminDisc, crypto.randomUUID(), 'x@y.com', '', ''), 'Sem permissão.');
  await db.query(`revoke execute on function public.vagas_conta_convite_equipe(uuid, uuid, text, text, text) from authenticated`);
  // Internas fechadas e search_path fixo em toda SECURITY DEFINER.
  assert.equal((await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vagas_interno' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or p.proname like 'vagas\\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).rows, []);
  // Indicadores só leem.
  assert.equal((await db.query(`select provolatile v from pg_proc where proname = 'vagas_op_indicadores'`)).rows[0].v, 's');
  // Nenhum fuso fixo de Roraima no código do Vagas (padrão neutro: America/Sao_Paulo).
  assert.deepEqual((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or (n.nspname = 'public' and p.proname like 'vagas\\_%')) and p.prosrc like '%Boa\\_Vista%'`)).rows, []);
  assert.equal((await db.query(`select column_default d from information_schema.columns where table_name = 'vagas_cidades' and column_name = 'fuso'`)).rows[0].d,
    "'America/Sao_Paulo'::text");
  assert.equal((await db.query(`select vagas_interno.hoje(null) = (now() at time zone 'America/Sao_Paulo')::date x`)).rows[0].x, true);
  // Colunas novas: só estas (nada de campo proibido — idade, sexo, foto… — entrou com a onda 2).
  const novas = (await db.query(`select table_name || '.' || column_name c from information_schema.columns
    where table_schema = 'public' and ((table_name = 'vagas_cidades' and column_name = 'porte')
      or (table_name = 'vagas_lista_espera' and column_name like 'whatsapp%') or table_name = 'vagas_equipe_convites') order by 1`)).rows.map((x) => x.c);
  assert.deepEqual(novas, ['vagas_cidades.porte', 'vagas_equipe_convites.criado_em', 'vagas_equipe_convites.criado_por', 'vagas_equipe_convites.email',
    'vagas_equipe_convites.empresa_id', 'vagas_equipe_convites.encerrado_em', 'vagas_equipe_convites.expira_em', 'vagas_equipe_convites.id',
    'vagas_equipe_convites.papel', 'vagas_equipe_convites.status', 'vagas_equipe_convites.token_hash', 'vagas_equipe_convites.usado_em',
    'vagas_equipe_convites.usado_por', 'vagas_lista_espera.whatsapp', 'vagas_lista_espera.whatsapp_em']);
});

test('piloto: Uruaçu (GO) em lista de espera, pequena, fuso de Brasília, com as zonas da operação; Roraima vira rascunho uma vez só', async () => {
  exigirBanco();
  const c = (await db.query(`select slug, nome, uf, ibge, fuso, status, porte, ordem from public.vagas_cidades where slug = 'uruacu-go'`)).rows[0];
  assert.deepEqual(c, { slug: 'uruacu-go', nome: 'Uruaçu', uf: 'GO', ibge: '5221601', fuso: 'America/Sao_Paulo', status: 'lista_espera', porte: 'pequena', ordem: 1 });
  const pub = ok(await anon('vagas_cidades_publicas'));
  assert.deepEqual(pub.cidades.map((x) => [x.slug, x.status]), [['uruacu-go', 'lista_espera']], 'só a cidade do piloto aparece, captando interessados');
  assert.deepEqual(pub.cidades[0].zonas.map((z) => z.slug), ['centro', 'regiao-norte', 'regiao-sul', 'regiao-leste', 'regiao-oeste', 'zona-rural']);
  assert.ok(pub.cidades[0].zonas[0].bairros.includes('Vila Santana'));
  assert.equal(pub.cidades[0].porte, undefined, 'o porte não sai na lista pública');
  const rr = (await db.query(`select slug, status from public.vagas_cidades where uf = 'RR' order by slug`)).rows;
  assert.ok(rr.length === 4 && rr.every((x) => x.status === 'rascunho'), JSON.stringify(rr));
  assert.ok((await db.query(`select count(*)::int n from public.vagas_zonas z join public.vagas_cidades c on c.id = z.cidade_id where c.uf = 'RR'`)).rows[0].n > 0,
    'zonas da semente antiga ficam (só o status mudou)');
  // Reativada pelo painel, continua ativa mesmo rodando a migração de dados de novo (a marca é gravada uma vez).
  await db.query(`update public.vagas_cidades set status = 'ativa' where slug = 'boa-vista-rr'`);
  await db.query(ler(DADOS));
  assert.equal((await db.query(`select status from public.vagas_cidades where slug = 'boa-vista-rr'`)).rows[0].status, 'ativa');
  await db.query(`update public.vagas_cidades set status = 'rascunho' where slug = 'boa-vista-rr'`);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_moderacao where acao = 'piloto_definido'`)).rows[0].n, 1);
  // A troca da lista de zonas pelo gancho: zona com o mesmo slug recebe os bairros do arquivo.
  await db.query(`update public.vagas_zonas set bairros = '{}' where slug = 'centro' and cidade_id = (select id from public.vagas_cidades where slug = 'uruacu-go')`);
  await db.query(ler(DADOS));
  assert.ok(ok(await anon('vagas_cidades_publicas')).cidades[0].zonas[0].bairros.includes('Centro'));

  // A equipe abre Uruaçu pelo painel (só o status muda: porte, fuso e zonas ficam).
  const aberta = ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'uruacu-go', status: 'ativa' })).cidade;
  assert.deepEqual([aberta.status, aberta.porte, aberta.fuso, aberta.nome, aberta.zonas.length], ['ativa', 'pequena', 'America/Sao_Paulo', 'Uruaçu', 6]);
  // Equipe cadastra cidades para os testes: uma vizinha no entorno, outra de porte grande e uma em lista de espera.
  S.operador = await contaVagas('operador', { dados: { operador: { cidade: 'uruacu-go', papel: 'operador' } } });
  S.moderador = await contaVagas('operador', { dados: { operador: { cidade: 'uruacu-go', papel: 'moderador' } } });
  erro(await de(S.operador)('vagas_adm_cidade_salvar', { slug: 'vizinha-go', nome: 'Vizinha', uf: 'GO' }), 'Sem permissão.');
  erro(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'Vizinha', nome: 'Vizinha', uf: 'GO' }), 'Endereço da cidade inválido (ex.: nome-da-cidade-uf).');
  erro(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'vizinha-go', nome: 'Vizinha', uf: 'GO', porte: 'media' }), 'Porte da cidade inválido (grande ou pequena).');
  const viz = ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'vizinha-go', nome: 'Vizinha', uf: 'GO', status: 'ativa', praca: 'uruacu-go' })).cidade;
  assert.equal(viz.fuso, 'America/Sao_Paulo', 'fuso padrão neutro');
  assert.equal(viz.porte, null);
  ok(await de(S.adminDisc)('vagas_adm_zona_salvar', { cidade: 'vizinha-go', slug: 'cidade-toda', nome: 'Vizinha (cidade toda)' }));
  const grande = ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'capital-go', nome: 'Capital', uf: 'GO', status: 'ativa', porte: 'grande' })).cidade;
  assert.equal(grande.porte, 'grande');
  ok(await de(S.adminDisc)('vagas_adm_zona_salvar', { cidade: 'capital-go', slug: 'centro', nome: 'Centro' }));
  ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'espera-go', nome: 'Espera', uf: 'GO', status: 'lista_espera' }));
  // Só a chave enviada muda: tirar o porte (string vazia) e manter o resto.
  assert.equal(ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'capital-go', porte: '' })).cidade.porte, null);
  assert.equal(ok(await de(S.adminDisc)('vagas_adm_cidade_salvar', { slug: 'capital-go', porte: 'grande' })).cidade.status, 'ativa');
  S.operadorCapital = await contaVagas('operador', { dados: { operador: { cidade: 'capital-go', papel: 'operador' } } });
});

test('currículo: a mensagem de WhatsApp inválido não traz DDD de exemplo (nenhuma cidade fixa em texto)', async () => {
  exigirBanco();
  const p = await contaVagas('pessoa');
  erro(await de(p)('vagas_pessoa_salvar', pessoaDados({ whatsapp: '123' })), WHATS_INVALIDO);
  assert.equal(REGRAS.lerPessoa(pessoaDados({ whatsapp: '123' })).erro, WHATS_INVALIDO, 'a mesma de VAGAS_REGRAS');
  const r = ok(await de(p)('vagas_pessoa_salvar', pessoaDados()));
  assert.equal(r.pessoa.whatsapp, '5562991234567');
  assert.equal(r.pessoa.cidade.slug, 'uruacu-go');
  S.pessoa = p;
});

test('lista de espera: WhatsApp opcional (celular com DDD), resposta neutra, saída pelo e-mail ou pelo WhatsApp; operação só vê contagens', async () => {
  exigirBanco();
  const ip = anonIp(10);
  erro(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'a@b.com', whatsapp: '6233221100' }), WHATS_INVALIDO);
  erro(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'a@b.com', whatsapp: '62 9912' }), WHATS_INVALIDO);
  erro(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'nao-e-email', whatsapp: '62991234567' }), 'E-mail inválido.');
  erro(await ip('vagas_lista_espera_entrar', { cidade: 'uruacu-go', email: 'a@b.com' }), 'Esta cidade já está aberta: faça o seu cadastro.');
  const linha = async (email) => (await db.query(`select l.whatsapp, l.whatsapp_em is not null tem_em from public.vagas_lista_espera l
    join public.vagas_cidades c on c.id = l.cidade_id where c.slug = 'espera-go' and l.email = $1`, [email])).rows[0];
  // Resposta idêntica: e-mail novo, repetido, com e sem WhatsApp.
  const r1 = ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'Ana@Exemplo.com', whatsapp: '(62) 99123-4567' }));
  const r2 = ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'ana@exemplo.com' }));
  const r3 = ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'beto@exemplo.com' }));
  const r4 = ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'cida@exemplo.com', whatsapp: '+55 62 98888-7777', perfil: 'empresa' }));
  assert.deepEqual([r1, r2, r3, r4], Array(4).fill({ ok: true, cidade: 'espera-go', interessados: 0 }));
  assert.deepEqual(await linha('ana@exemplo.com'), { whatsapp: '5562991234567', tem_em: true }, 'só algarismos; sem WhatsApp de novo, o que estava fica');
  assert.deepEqual(await linha('beto@exemplo.com'), { whatsapp: '', tem_em: false });
  ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'ana@exemplo.com', whatsapp: '62 97777-6666' }));
  assert.equal((await linha('ana@exemplo.com')).whatsapp, '5562977776666', 'um WhatsApp novo substitui o anterior');
  // Ninguém lê a lista direto (nem a equipe pela API).
  await rejeita(como('authenticated', S.adminDisc, `select whatsapp from public.vagas_lista_espera`), /permission denied/);
  await rejeita(como('anon', null, `select email from public.vagas_lista_espera`), /permission denied/);
  // Sair: pelo WhatsApp tira só o número (o e-mail fica); pelo e-mail apaga a linha com o WhatsApp. Resposta sempre igual.
  const sai = (d) => ip('vagas_lista_espera_sair', Object.assign({ cidade: 'espera-go' }, d));
  const OK_SAIR = { ok: true, cidade: 'espera-go', removido: true };
  assert.deepEqual(await sai({ whatsapp: '62988887777' }), OK_SAIR);
  assert.deepEqual(await linha('cida@exemplo.com'), { whatsapp: '', tem_em: false });
  assert.deepEqual(await sai({ email: 'ana@exemplo.com' }), OK_SAIR);
  assert.equal(await linha('ana@exemplo.com'), undefined);
  assert.deepEqual(await sai({ email: 'ninguem@exemplo.com' }), OK_SAIR);
  assert.deepEqual(await sai({ whatsapp: '62 91111-2222' }), OK_SAIR);
  erro(await sai({}), 'E-mail inválido.');
  erro(await sai({ email: 'x' }), 'E-mail inválido.');
  erro(await sai({ whatsapp: '12' }), WHATS_INVALIDO);
  // A operação/equipe vê só contagens (com quantos deram WhatsApp), nunca e-mail ou número.
  ok(await ip('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'davi@exemplo.com', whatsapp: '62 96666-5555' }));
  const ind = ok(await de(S.adminDisc)('vagas_op_indicadores', 'espera-go'));
  const lista = ind.indicadores.find((i) => i.chave === 'lista_espera');
  assert.deepEqual([lista.valor, lista.detalhe], [3, { pessoa: 2, empresa: 1, comWhatsapp: 1 }]);
  const texto = JSON.stringify(ind);
  for (const proibido of ['exemplo.com', '5562966665555', '96666']) assert.ok(!texto.includes(proibido), proibido);
  // Limite por origem continua (10 por hora).
  const outro = anonIp(11);
  for (let i = 0; i < 10; i++) ok(await outro('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'lim' + i + '@exemplo.com' }));
  assert.equal((await outro('vagas_lista_espera_entrar', { cidade: 'espera-go', email: 'lim99@exemplo.com', whatsapp: '62991234567' })).bloqueado, true);
});

test('indicadores: catálogo = arquivo = JS; cor pela regra do arquivo; porte escolhe o alvo; sem porte não há alvo nem cor', async () => {
  exigirBanco();
  const arq = JSON.parse(fs.readFileSync(ARQ_INDICADORES, 'utf8'));
  const cat = (await db.query(`select vagas_interno.indicadores_catalogo() c`)).rows[0].c;
  // O arquivo nomeia os alvos pela cidade de exemplo antiga ("boaVista") ou pelo porte; o banco e o JS, só pelo porte.
  const porte = (o) => {
    if (o === undefined) return undefined;
    const x = { grande: o.grande !== undefined ? o.grande : (o.cidadeGrande !== undefined ? o.cidadeGrande : o.boaVista),
      pequena: o.pequena !== undefined ? o.pequena : o.cidadePequena };
    Object.keys(x).forEach((k) => x[k] === undefined && delete x[k]);
    return x;
  };
  const doArquivo = arq.indicadores.map((i) => {
    const x = { chave: i.chave, nome: i.nome, unidade: i.unidade, periodo: i.periodo, direcao: i.direcao, alvo: porte(i.alvo),
      alvoLancamento: porte(i.alvoLancamento), janela: porte(i.janela), alerta: i.alerta, hipotese: i.hipotese };
    Object.keys(x).forEach((k) => x[k] === undefined && delete x[k]);
    return x;
  });
  assert.deepEqual(cat, doArquivo, 'banco = conteudo/vagas-operacao/indicadores.json');
  assert.deepEqual(REGRAS.INDICADORES, doArquivo, 'VAGAS_REGRAS.INDICADORES = arquivo');
  const gat = (await db.query(`select vagas_interno.gatilhos_catalogo() c`)).rows[0].c;
  assert.deepEqual(gat.map((g) => [g.chave, g.nome, g.hipotese]), arq.gatilhos.map((g) => [g.chave, g.nome, !!g.hipotese]));
  assert.deepEqual(REGRAS.GATILHOS.map((g) => [g.chave, g.nome, g.hipotese]), arq.gatilhos.map((g) => [g.chave, g.nome, !!g.hipotese]));
  // Cor: maior é melhor (70%) e menor é melhor (1,3 vez); o banco e o JS dão o mesmo resultado.
  const casos = [[150, 150, 'maior_melhor'], [105, 150, 'maior_melhor'], [104, 150, 'maior_melhor'], [0, 20, 'maior_melhor'], [7, 7, 'menor_melhor'],
    [9.1, 7, 'menor_melhor'], [9.2, 7, 'menor_melhor'], [0, 0, 'menor_melhor'], [1, 0, 'menor_melhor'], [null, 10, 'maior_melhor'], [5, null, 'maior_melhor']];
  for (const [v, a, d] of casos) {
    const sql = (await db.query(`select vagas_interno.indicador_cor($1, $2, $3) c`, [v, a, d])).rows[0].c;
    assert.equal(sql, REGRAS.corIndicador(v, a, d), JSON.stringify([v, a, d]));
  }
  assert.deepEqual(casos.slice(0, 9).map(([v, a, d]) => REGRAS.corIndicador(v, a, d)),
    ['ok', 'atencao', 'alerta', 'alerta', 'ok', 'atencao', 'alerta', 'ok', 'alerta']);
  // Porte: Uruaçu é pequena (alvo 20 vagas, lançamento 15); a capital-go é grande (o arquivo ainda não tem alvo de cidade
  // grande: sem alvo nem cor); a vizinha, sem porte.
  const peq = ok(await de(S.operador)('vagas_op_indicadores', 'uruacu-go'));
  const gde = ok(await de(S.adminDisc)('vagas_op_indicadores', 'capital-go'));
  const sem = ok(await de(S.adminDisc)('vagas_op_indicadores', 'vizinha-go'));
  const va = (r) => r.indicadores.find((i) => i.chave === 'vagas_ativas');
  assert.deepEqual([va(peq).alvo, va(peq).alvoLancamento, va(peq).cor, va(gde).alvo, va(gde).alvoLancamento, va(gde).cor], [20, 15, 'alerta', null, null, null]);
  assert.deepEqual([va(sem).alvo, va(sem).cor, sem.cidade.porte], [null, null, null]);
  assert.equal(peq.indicadores.length, 15);
  assert.deepEqual(peq.indicadores.map((i) => i.chave), arq.indicadores.map((i) => i.chave));
  assert.deepEqual(peq.gatilhos.map((g) => g.chave), arq.gatilhos.map((g) => g.chave));
  const fixos = ['trocar_parceiro', 'pessoa_nao_paga'];
  for (const r of [gde, sem]) {
    assert.ok(r.gatilhos.filter((g) => !fixos.includes(g.chave)).every((g) => g.aplica === false && g.atingido === null && g.partes.length === 0),
      'sem alvo do porte, nenhum gatilho de meta se aplica');
  }
  const naoPaga = peq.gatilhos.find((g) => g.chave === 'pessoa_nao_paga');
  assert.deepEqual([naoPaga.aplica, naoPaga.atingido, naoPaga.partes[0].fixa], [true, true, true], 'regra fixa: a pessoa nunca paga');
  // O que o banco não guarda: valor null + semDado.
  for (const k of ['empresas_buscando_semana', 'empresas_pagantes', 'receita_liquida_centavos', 'emails_mes']) {
    const i = peq.indicadores.find((x) => x.chave === k);
    assert.deepEqual([i.valor, i.semDado, i.cor], [null, true, null], k);
  }
  assert.equal(peq.indicadores.find((x) => x.chave === 'emails_mes').alerta, 2500);
  assert.deepEqual(peq.cidade, { slug: 'uruacu-go', nome: 'Uruaçu', uf: 'GO', status: 'ativa', porte: 'pequena', fuso: 'America/Sao_Paulo' });
  assert.deepEqual(peq.praca.map((x) => x.slug), ['uruacu-go', 'vizinha-go'], 'a praça = a cidade + o entorno');
});

test('indicadores: só a própria cidade (operador), todas (equipe); valores da praça só agregados — nenhuma pessoa', async () => {
  exigirBanco();
  // Permissões.
  await rejeita(anon('vagas_op_indicadores', 'uruacu-go'), /permission denied/);
  erro(await de(null)('vagas_op_indicadores', 'uruacu-go'), 'Sessão expirada. Entre de novo.');
  erro(await de(S.operadorCapital)('vagas_op_indicadores', 'uruacu-go'), 'Sem permissão.');
  erro(await de(S.operador)('vagas_op_indicadores', 'capital-go'), 'Sem permissão.');
  erro(await de(S.operador)('vagas_op_indicadores', 'nao-existe-go'), 'Sem permissão.', 'não revela se a cidade existe');
  erro(await de(S.adminDisc)('vagas_op_indicadores', 'nao-existe-go'), 'Cidade não encontrada.');
  erro(await de(S.pessoa)('vagas_op_indicadores', 'uruacu-go'), 'Sem permissão.');
  ok(await de(S.moderador)('vagas_op_indicadores', 'uruacu-go'));
  ok(await de(S.adminDisc)('vagas_op_indicadores', 'rorainopolis-rr'), 'equipe vê qualquer cidade, até rascunho');

  // Dados da praça: empresa verificada, 3 vagas (uma no entorno), candidaturas de pessoas com selo, um Combinou e uma contratação.
  const dono = await contaVagas('empresa', { meta: { nome: 'Dona da Loja' } });
  const emp = ok(await de(dono)('vagas_empresa_cadastrar', { cnpj: cnpjCom('321654980001'), razaoSocial: 'Loja Teste Uruaçu Ltda',
    nomeFantasia: 'Loja Teste', cidade: 'uruacu-go', zona: 'centro' })).empresa.id;
  ok(await de(S.operador)('vagas_op_empresa_decidir', emp, 'aprovar', 'CNPJ conferido'));
  const vaga = async (extra) => {
    const id = ok(await de(dono)('vagas_anuncio_salvar', anuncioDados(emp, extra))).anuncio.id;
    const pub = ok(await de(dono)('vagas_anuncio_publicar', id));
    if (pub.emRevisao) ok(await de(S.adminDisc)('vagas_op_anuncio_decidir', id, 'publicar', ''));   // a vizinha não é do operador de Uruaçu
    return id;
  };
  const a1 = await vaga({ selo: 'atendimento' });
  const a2 = await vaga({ funcao: 'Operador(a) de caixa', area: 'caixa', selo: 'caixa' });
  const a3 = await vaga({ funcao: 'Repositor', area: 'logistica', cidade: 'vizinha-go', zona: 'cidade-toda' });
  const pessoas = [];
  for (let i = 0; i < 3; i++) {
    const p = await contaVagas('pessoa', { meta: { nome: 'Pessoa Indicador ' + i } });
    ok(await de(p)('vagas_pessoa_salvar', pessoaDados({ nome: 'Pessoa Indicador Numero' + i, whatsapp: '62 9900' + (10000 + i) })));
    pessoas.push(p);
  }
  // Selos válidos (emitidos há 20 dias) para as 3.
  for (const p of pessoas) {
    await db.query(`insert into public.vagas_selos (codigo, user_id, teste, nota, emitido_em, valido_ate)
      values ($1, $2, 'atendimento', 80, now() - interval '20 days', (now() + interval '300 days')::date)`,
    [Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join(''), p]);
  }
  const ks = [];
  for (const p of pessoas) ks.push(ok(await de(p)('vagas_quero', a1)).candidatura.id);
  const kb = ok(await de(pessoas[0])('vagas_quero', a2)).candidatura.id;
  ok(await de(dono)('vagas_empresa_decidir', ks[0], 'conversar'));
  ok(await de(pessoas[0])('vagas_combinar', ks[0]));
  ok(await de(dono)('vagas_marcar_contratada', ks[0]));
  // a1 e a2 publicadas há 10 dias (base dos 30 dias, já passada a janela de 7 dias da cidade pequena); as candidaturas de a1
  // chegaram 1 dia depois; o Combinou, 2 dias depois.
  await db.query(`set session_replication_role = replica`);
  await db.query(`update public.vagas_anuncios set publicado_em = now() - interval '10 days', expira_em = now() + interval '20 days' where id = any ($1)`, [[a1, a2]]);
  await db.query(`update public.vagas_candidaturas set criado_em = now() - interval '9 days' where id = any ($1)`, [ks.concat([kb])]);
  await db.query(`update public.vagas_candidaturas set combinou_em = now() - interval '8 days', empresa_decidiu_em = now() - interval '8 days 12 hours' where id = $1`, [ks[0]]);
  await db.query(`set session_replication_role = origin`);
  // Cadastro assistido confirmado num mutirão; convite de operação não conta.
  const assist = await usuarioAuth('assistida@onda2.teste', { app: { produto: 'vagas', tipo: 'pessoa' } });
  ok(await servico('vagas_conta_registrar', assist, { tipo: 'pessoa', assistidaPor: S.operador, cidade: 'uruacu-go', codigoEvento: 'MUTIRAO-1' }));
  ok(await de(assist)('vagas_eu'));
  const naoConfirmou = await usuarioAuth('pendente-mutirao@onda2.teste', { app: { produto: 'vagas', tipo: 'pessoa' }, confirmado: false });
  ok(await servico('vagas_conta_registrar', naoConfirmou, { tipo: 'pessoa', assistidaPor: S.operador, cidade: 'uruacu-go', codigoEvento: 'MUTIRAO-1' }));
  // Fila: uma empresa em análise há 2 dias.
  const outraDona = await contaVagas('empresa');
  const emAnalise = ok(await de(outraDona)('vagas_empresa_cadastrar', { cnpj: cnpjCom('321654980002'), razaoSocial: 'Fila Ltda', cidade: 'uruacu-go' })).empresa.id;
  await db.query(`set session_replication_role = replica`);   // o gatilho não deixa mudar criado_em
  await db.query(`update public.vagas_empresas set criado_em = now() - interval '2 days' where id = $1`, [emAnalise]);
  await db.query(`set session_replication_role = origin`);

  const r = ok(await de(S.operador)('vagas_op_indicadores', 'uruacu-go'));
  const v = Object.fromEntries(r.indicadores.map((i) => [i.chave, i]));
  assert.equal(v.vagas_ativas.valor, 3, 'Uruaçu + entorno');
  assert.equal(v.vagas_ativas.cor, 'alerta');
  assert.deepEqual(v.vagas_ativas.detalhe.porTeste, { atendimento: 1, vendas: 0, administrativo: 0, caixa: 1, portugues: 0 });
  assert.deepEqual(v.vagas_ativas.detalhe.porArea.map((x) => [x.area, x.valor]).sort(), [['atendimento', 1], ['caixa', 1], ['logistica', 1]]);
  assert.equal(v.pessoas_com_selo_por_funcao.valor, 3);
  assert.equal(v.pessoas_com_selo_por_funcao.detalhe.porTeste.atendimento, 3);
  assert.deepEqual([v.pessoas_com_selo_por_funcao.alvo, v.pessoas_com_selo_por_funcao.alvoLancamento], [400, 150]);
  assert.deepEqual([v.vagas_3_interessados_72h.valor, v.vagas_3_interessados_72h.detalhe],
    [50, { base: 2, comTres: 1, janelaHoras: 168 }], 'a1 teve 3 interessados com selo dentro de 7 dias; a2, 1');
  assert.equal(v.vagas_3_interessados_72h.cor, 'atencao', '50 é 70% ou mais do alvo de 70');
  assert.deepEqual([v.vagas_combinou_7d.valor, v.vagas_combinou_7d.detalhe], [50, { base: 2, comCombinou: 1 }]);
  assert.equal(v.vagas_combinou_7d.hipotese, true);
  assert.deepEqual([v.contratacoes.valor, v.contratacoes.detalhe], [1, { mes: 1 }]);
  assert.equal(v.empresas_ativas_mes.valor, 1);
  assert.equal(typeof v.primeira_resposta_empresa_dias.valor, 'number');
  assert.equal(v.primeira_resposta_empresa_dias.detalhe.base, 4, '1 respondida + 3 sem resposta há 7 dias ou mais');
  assert.equal(v.primeira_resposta_empresa_dias.detalhe.semRespostaEm7DiasPct, 75);
  assert.equal(v.primeira_resposta_empresa_dias.valor, 9, 'mediana de [0,5; 9; 9; 9] dias');
  assert.equal(v.primeira_resposta_empresa_dias.cor, 'atencao', 'até 1,3 vez o alvo de 7 dias');
  assert.deepEqual([v.fila_moderacao.valor, v.fila_moderacao.detalhe], [1, { anuncios: 0, empresas: 1, referencias: 0 }]);
  assert.equal(v.fila_moderacao.cor, 'alerta', 'alvo 0: qualquer item é alerta');
  assert.equal(v.cadastros_assistidos_confirmados.valor, 1);
  assert.deepEqual(v.cadastros_assistidos_confirmados.detalhe.porMutirao.map((x) => [x.codigoEvento, x.criadas, x.confirmadas]), [['MUTIRAO-1', 2, 1]]);
  assert.equal(v.denuncia_tempo_decisao_h.semBase, true);
  // Gatilhos: falta muito para "antes de cobrar" (cidade pequena: 15 vagas, 10 empresas, 150 com selo, 70%, 3 contratações).
  const cobrar = r.gatilhos.find((g) => g.chave === 'antes_de_cobrar');
  assert.equal(cobrar.atingido, false);
  assert.deepEqual(cobrar.partes.map((p) => p.ok), [false, false, false, false, false]);
  assert.equal(cobrar.partes[0].descricao, 'Vagas no ar: 15 ou mais');
  const viva = r.gatilhos.find((g) => g.chave === 'praca_viva');
  assert.equal(viva.atingido, false);
  assert.equal(viva.partes.find((p) => /pagantes/.test(p.descricao)).semDado, true);
  const abrir = r.gatilhos.find((g) => g.chave === 'abrir_proxima');
  assert.deepEqual(abrir.partes.map((p) => p.ok), [null, false, null, null], 'decisão do dono (manual); praça viva já falha agora');
  assert.equal(abrir.atingido, false);
  assert.equal(r.gatilhos.find((g) => g.chave === 'trocar_parceiro').atingido, null, 'só marcação manual');
  // Só agregados: nada de id, nome, e-mail ou WhatsApp de pessoa, nem da empresa.
  const texto = JSON.stringify(r);
  const segredos = pessoas.concat([dono, outraDona, assist, naoConfirmou, S.operador, emp, emAnalise, ks[0], kb]);
  for (const p of pessoas) segredos.push(await emailDe(p));
  segredos.push('Pessoa Indicador', '5562990010000', 'Loja Teste', 'Dona da Loja', 'assistida@onda2.teste');
  for (const s of segredos) assert.ok(!texto.includes(s), 'vazou ' + s);
  // A equipe vê o mesmo; a vizinha sozinha (sem porte) vê só a vaga dela.
  assert.equal(ok(await de(S.adminDisc)('vagas_op_indicadores', 'uruacu-go')).indicadores[0].valor, 3);
  assert.equal(ok(await de(S.adminDisc)('vagas_op_indicadores', 'vizinha-go')).indicadores[0].valor, 1);
  S.dono = dono;
  S.empresa = emp;
});

test('equipe: só dono(a) convida; resposta e convite iguais para qualquer e-mail; token de uso único guardado só com hash', async () => {
  exigirBanco();
  const convidar = (uid, empresa, email, ipN) => servico('vagas_conta_convite_equipe', uid, empresa, email, '', '203.0.113.' + (ipN || 50));
  // Quem pode.
  const estranho = await contaVagas('empresa');
  erro(await convidar(estranho, S.empresa, 'x@y.com'), 'Empresa não encontrada.');
  erro(await convidar(S.pessoa, S.empresa, 'x@y.com'), 'Esta área é para empresas.');
  erro(await convidar(crypto.randomUUID(), S.empresa, 'x@y.com'), 'Sessão expirada. Entre de novo.');
  const pendente = await contaVagas('empresa', { confirmado: false });
  assert.equal((await convidar(pendente, S.empresa, 'x@y.com')).confirmar, true);
  erro(await convidar(S.dono, S.empresa, 'não é e-mail'), 'E-mail inválido.');
  erro(await convidar(S.dono, S.empresa, (await emailDe(S.dono)).toUpperCase()), 'Esta pessoa já faz parte da equipe.');
  // Destinos (só para a Edge Function): conta nova, empresa confirmada, empresa pendente, outro tipo, conta só do DISC.
  const empresaConfirmada = await contaVagas('empresa', { email: 'recrutadora@onda2.teste' });
  const empresaPendente = await contaVagas('empresa', { email: 'pendente-equipe@onda2.teste', confirmado: false });
  const pessoaOutra = await contaVagas('pessoa', { email: 'pessoa-equipe@onda2.teste' });
  const destinos = {};
  const convites = {};
  for (const [email, esperado] of [['nova-pessoa@onda2.teste', 'nova'], ['recrutadora@onda2.teste', 'empresa'],
    ['pendente-equipe@onda2.teste', 'empresa_pendente'], ['pessoa-equipe@onda2.teste', 'outro_tipo'], ['dono@gestaosemcaos.teste', 'nenhum']]) {
    const r = ok(await convidar(S.dono, S.empresa, email.toUpperCase()));
    assert.equal(r.destino, esperado, email);
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.equal(r.empresaNome, 'Loja Teste');
    assert.equal(r.cidadeNome, 'Uruaçu');
    assert.equal(r.convidadoPor, 'Dona da Loja');
    destinos[esperado] = r.token;
    convites[esperado] = r.convite;
  }
  // O convite que vai para a tela tem a mesma forma em todos os casos (nada diz se o e-mail tem conta).
  const forma = (c) => Object.assign({}, c, { id: 'x', email: 'x', criadoEm: 'x', expiraEm: 'x' });
  for (const c of Object.values(convites)) assert.deepEqual(forma(c), { id: 'x', email: 'x', papel: 'recrutador', status: 'pendente', criadoEm: 'x', expiraEm: 'x' });
  const horas = (Date.parse(convites.nova.expiraEm) - Date.parse(convites.nova.criadoEm)) / 3600000;
  assert.ok(Math.abs(horas - 72) < 0.01, 'validade curta: 72 h');
  // O token em claro não fica no banco: só o sha256.
  const linhas = (await db.query(`select * from public.vagas_equipe_convites`)).rows;
  assert.ok(!JSON.stringify(linhas).includes(destinos.empresa), 'token em claro gravado');
  const hash = crypto.createHash('sha256').update(destinos.empresa).digest('hex');
  assert.equal(linhas.filter((l) => l.token_hash === hash).length, 1);

  // Abrir e aceitar: só a conta de empresa confirmada do MESMO e-mail; nunca outra conta, nem pessoa.
  erro(await de(estranho)('vagas_equipe_convite', destinos.empresa), INVALIDO);
  erro(await de(estranho)('vagas_equipe_convite_aceitar', destinos.empresa), INVALIDO);
  erro(await de(pessoaOutra)('vagas_equipe_convite_aceitar', destinos.outro_tipo), 'Esta área é para empresas.');
  assert.equal((await de(empresaPendente)('vagas_equipe_convite_aceitar', destinos.empresa_pendente)).confirmar, true, 'só depois de confirmar o e-mail');
  erro(await de(empresaConfirmada)('vagas_equipe_convite', 'f'.repeat(64)), INVALIDO);
  erro(await de(empresaConfirmada)('vagas_equipe_convite', 'curto'), INVALIDO);
  await rejeita(anon('vagas_equipe_convite_aceitar', destinos.empresa), /permission denied/);
  const visto = ok(await de(empresaConfirmada)('vagas_equipe_convite', destinos.empresa.toUpperCase()));
  assert.deepEqual(visto.convite.empresa, { id: S.empresa, nomeFantasia: 'Loja Teste', cidade: { slug: 'uruacu-go', nome: 'Uruaçu' } });
  assert.deepEqual([visto.convite.papel, visto.convite.jaMembro], ['recrutador', false]);
  const aceito = ok(await de(empresaConfirmada)('vagas_equipe_convite_aceitar', destinos.empresa));
  assert.deepEqual(aceito, { ok: true, empresa: { id: S.empresa, nomeFantasia: 'Loja Teste', papel: 'recrutador', status: 'ativa' }, duplicado: false });
  assert.deepEqual(ok(await de(empresaConfirmada)('vagas_eu')).empresas.map((e) => [e.id, e.papel]), [[S.empresa, 'recrutador']]);
  erro(await de(empresaConfirmada)('vagas_equipe_convite_aceitar', destinos.empresa), INVALIDO, 'uso único');
  // A recrutadora não convida, não lista nem remove outras pessoas.
  erro(await convidar(empresaConfirmada, S.empresa, 'mais@onda2.teste'), SO_DONO_CONVIDAR);
  erro(await de(empresaConfirmada)('vagas_equipe_empresa', S.empresa), SO_DONO_EQUIPE);
  erro(await de(empresaConfirmada)('vagas_equipe_remover', S.empresa, S.dono), SO_DONO_EQUIPE);
  erro(await de(empresaConfirmada)('vagas_equipe_convite_cancelar', convites.nova.id), 'Convite não encontrado.');
  // Convite vencido não serve, mesmo para a conta certa.
  const tardia = await contaVagas('empresa', { email: 'tardia@onda2.teste' });
  const ct = ok(await convidar(S.dono, S.empresa, 'tardia@onda2.teste'));
  await db.query(`update public.vagas_equipe_convites set criado_em = now() - interval '4 days', expira_em = now() - interval '1 hour' where id = $1`, [ct.convite.id]);
  erro(await de(tardia)('vagas_equipe_convite_aceitar', ct.token), INVALIDO);
  // Convidar de novo o mesmo e-mail troca o convite (o token antigo deixa de valer).
  const c1 = ok(await convidar(S.dono, S.empresa, 'tardia@onda2.teste'));
  const c2 = ok(await convidar(S.dono, S.empresa, 'tardia@onda2.teste'));
  erro(await de(tardia)('vagas_equipe_convite_aceitar', c1.token), INVALIDO);
  // Cancelado não serve; aceito não se cancela.
  ok(await de(S.dono)('vagas_equipe_convite_cancelar', c2.convite.id));
  assert.equal((await de(S.dono)('vagas_equipe_convite_cancelar', c2.convite.id)).duplicado, true);
  erro(await de(tardia)('vagas_equipe_convite_aceitar', c2.token), INVALIDO);
  erro(await de(S.dono)('vagas_equipe_convite_cancelar', convites.empresa.id), 'Este convite já foi aceito. Para tirar o acesso, remova a pessoa da equipe.');
  erro(await de(S.dono)('vagas_equipe_convite_cancelar', crypto.randomUUID()), 'Convite não encontrado.');
  S.recrutadora = empresaConfirmada;
  S.empresaPendente = empresaPendente;
  S.destinos = destinos;
});

test('equipe: lista para quem é dono(a); remover nunca deixa a empresa sem dono; limites por empresa e por e-mail; registro sem e-mail', async () => {
  exigirBanco();
  await zerarLimitesEquipe();
  const vence = ok(await servico('vagas_conta_convite_equipe', S.dono, S.empresa, 'vence@onda2.teste', '', ''));
  await db.query(`update public.vagas_equipe_convites set criado_em = now() - interval '4 days', expira_em = now() - interval '1 hour' where id = $1`, [vence.convite.id]);
  const lista = ok(await de(S.dono)('vagas_equipe_empresa', S.empresa));
  assert.deepEqual(lista.membros.map((m) => [m.email, m.papel, m.eu, m.podeRemover]),
    [[await emailDe(S.dono), 'dono', true, false], ['recrutadora@onda2.teste', 'recrutador', false, true]]);
  assert.equal(lista.membros[0].nome, 'Dona da Loja');
  const porEmail = Object.fromEntries(lista.convites.map((c) => [c.email, c.status]));
  assert.equal(porEmail['recrutadora@onda2.teste'], 'aceito');
  assert.equal(porEmail['nova-pessoa@onda2.teste'], 'pendente');
  assert.ok(lista.convites.some((c) => c.email === 'tardia@onda2.teste' && c.status === 'cancelado'));
  assert.equal(porEmail['vence@onda2.teste'], 'vencido');
  assert.deepEqual(Object.keys(lista.limites).sort(), ['convitesAbertosMax', 'convitesHoje', 'convitesPorDia', 'membrosMax', 'validadeHoras']);
  erro(await de(S.pessoa)('vagas_equipe_empresa', S.empresa), 'Esta área é para empresas.');
  // A última pessoa dona não sai nem é removida; com duas donas, uma pode sair.
  erro(await de(S.dono)('vagas_equipe_remover', S.empresa, S.dono), 'A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.');
  erro(await de(S.dono)('vagas_equipe_remover', S.empresa, crypto.randomUUID()), 'Esta pessoa não está na equipe.');
  const segundaDona = await contaVagas('empresa');
  await db.query(`insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values ($1, $2, 'dono')`, [S.empresa, segundaDona]);
  assert.ok(ok(await de(S.dono)('vagas_equipe_empresa', S.empresa)).membros.every((m) => m.podeRemover));
  // Convite aberto feito pela segunda dona some quando ela sai.
  const dela = ok(await servico('vagas_conta_convite_equipe', segundaDona, S.empresa, 'convite-da-segunda@onda2.teste', '', ''));
  assert.deepEqual(ok(await de(segundaDona)('vagas_equipe_remover', S.empresa, segundaDona)), { ok: true, removido: true, saiu: true });
  assert.equal((await db.query(`select status from public.vagas_equipe_convites where id = $1`, [dela.convite.id])).rows[0].status, 'cancelado');
  erro(await de(segundaDona)('vagas_equipe_empresa', S.empresa), 'Empresa não encontrada.', 'quem saiu perde o acesso na hora');
  // Dona remove a recrutadora: ela perde o acesso; as vagas continuam no ar.
  assert.deepEqual(ok(await de(S.dono)('vagas_equipe_remover', S.empresa, S.recrutadora)), { ok: true, removido: true, saiu: false });
  assert.deepEqual(ok(await de(S.recrutadora)('vagas_eu')).empresas, []);
  erro(await de(S.recrutadora)('vagas_anuncios_empresa', S.empresa), 'Empresa não encontrada.');
  assert.ok(ok(await de(S.dono)('vagas_anuncios_empresa', S.empresa)).anuncios.some((a) => a.noAr));
  // Recrutador(a) pode sair sozinho(a).
  const r2 = await contaVagas('empresa', { email: 'sai-sozinha@onda2.teste' });
  const cv = ok(await servico('vagas_conta_convite_equipe', S.dono, S.empresa, 'sai-sozinha@onda2.teste', '', ''));
  ok(await de(r2)('vagas_equipe_convite_aceitar', cv.token));
  assert.equal(ok(await de(r2)('vagas_equipe_remover', S.empresa, r2)).saiu, true);
  // Empresa suspensa: não convida e não aceita.
  const cs = ok(await servico('vagas_conta_convite_equipe', S.dono, S.empresa, 'suspensa@onda2.teste', '', ''));
  const contaSusp = await contaVagas('empresa', { email: 'suspensa@onda2.teste' });
  await db.query(`update public.vagas_empresas set status = 'suspensa' where id = $1`, [S.empresa]);
  assert.equal((await servico('vagas_conta_convite_equipe', S.dono, S.empresa, 'z@onda2.teste', '', '')).suspensa, true);
  assert.equal((await de(contaSusp)('vagas_equipe_convite_aceitar', cs.token)).suspensa, true);
  await db.query(`update public.vagas_empresas set status = 'ativa' where id = $1`, [S.empresa]);
  // Limites: 3 por e-mail por empresa por dia; 10 por empresa por dia (as tentativas contam).
  const dona2 = await contaVagas('empresa');
  const emp2 = ok(await de(dona2)('vagas_empresa_cadastrar', { cnpj: cnpjCom('321654980003'), razaoSocial: 'Limites Ltda', cidade: 'uruacu-go' })).empresa.id;
  for (let i = 0; i < 3; i++) ok(await servico('vagas_conta_convite_equipe', dona2, emp2, 'mesmo@onda2.teste', '', ''));
  assert.equal((await servico('vagas_conta_convite_equipe', dona2, emp2, 'mesmo@onda2.teste', '', '')).bloqueado, true);
  for (let i = 0; i < 6; i++) ok(await servico('vagas_conta_convite_equipe', dona2, emp2, 'outro' + i + '@onda2.teste', '', ''));
  const lim = await servico('vagas_conta_convite_equipe', dona2, emp2, 'mais-um@onda2.teste', '', '');
  assert.deepEqual(lim, { ok: false, erro: 'Muitos convites hoje. Tente de novo amanhã.', bloqueado: true });
  // Registro de moderação: papel 'empresa', sem e-mail de ninguém; a operação vê o ato, não a pessoa.
  const reg = ok(await de(S.operador)('vagas_op_moderacao', { cidade: 'uruacu-go', limite: 200 })).registros.filter((x) => x.acao.startsWith('equipe_'));
  assert.deepEqual([...new Set(reg.map((x) => x.acao))].sort(), ['equipe_aceitar', 'equipe_convidar', 'equipe_convite_cancelar', 'equipe_remover', 'equipe_sair']);
  assert.ok(reg.every((x) => x.papel === 'empresa' && x.alvo === 'empresa'));
  assert.ok(!JSON.stringify(reg).includes('@'), 'nenhum e-mail no registro');
  await zerarLimitesEquipe();
  // Retenção: convite encerrado há mais de 30 dias some no próximo convite.
  await db.query(`update public.vagas_equipe_convites set encerrado_em = now() - interval '31 days' where status = 'cancelado' and empresa_id = $1`, [S.empresa]);
  ok(await servico('vagas_conta_convite_equipe', S.dono, S.empresa, 'depois-da-limpeza@onda2.teste', '', ''));
  assert.equal((await db.query(`select count(*)::int n from public.vagas_equipe_convites where status = 'cancelado' and empresa_id = $1
    and encerrado_em < now() - interval '30 days'`, [S.empresa])).rows[0].n, 0);
});

test('fuso: os testes de habilidade usam o fuso da cidade da conta (Uruaçu = Brasília), não um fixo de Roraima', async () => {
  exigirBanco();
  // Tentativa às 03:00 UTC de 01/10 (meia-noite em Brasília; 23 h do dia 30/09 em Boa Vista), fechada às 03:30 UTC.
  const qs = (await db.query(`select id from public.vagas_questoes where teste = 'atendimento' and ativa order by id limit 5`)).rows.map((x) => x.id);
  assert.equal(qs.length, 5);
  const tt = (await db.query(`insert into public.vagas_tentativas (user_id, teste, iniciada_em, termina_em, limite_em, questoes, total)
    values ($1, 'atendimento', '2026-10-01T03:00:00Z', '2026-10-01T03:20:00Z', '2026-10-01T03:30:00Z', $2, 5) returning id`,
  [S.pessoa, JSON.stringify(qs.map((id) => ({ id, alt: [0, 1, 2, 3] })))])).rows[0].id;
  for (let i = 0; i < 5; i++) {
    await db.query(`insert into public.vagas_tentativa_respostas (tentativa_id, ordem, questao_id, alternativa, correta, exibida_em, respondida_em)
      values ($1, $2, $3, 0, true, '2026-10-01T03:01:00Z', '2026-10-01T03:02:00Z')`, [tt, i, qs[i]]);
  }
  await db.query(`select vagas_interno.teste_fechar($1)`, [tt]);
  const selo = (await db.query(`select codigo, to_char(valido_ate, 'YYYY-MM-DD') v from public.vagas_selos where tentativa_id = $1`, [tt])).rows[0];
  assert.equal(selo.v, '2027-10-01', 'validade contada no dia de Brasília (em Boa Vista seria 2027-09-30)');
  const pub = ok(await anon('vagas_selo_publico', selo.codigo));
  assert.equal(pub.selo.data, '2026-10-01', 'data do selo no fuso da conta, mesmo para quem confere sem login');
  const cartao = (await db.query(`select vagas_interno.selos_cartao($1) c`, [S.pessoa])).rows[0].c;
  assert.ok(cartao.some((s) => s.codigo === selo.codigo && s.data === '2026-10-01'));
  // "Pode fazer de novo a partir de": 30 dias depois do início, no fuso da pessoa (31/10, não 30/10).
  const r = await de(S.pessoa)('vagas_iniciar_tentativa', 'atendimento');
  assert.equal(r.codigo, 'aguarde');
  assert.match(r.erro, /a partir de 31\/10\/2026\.$/);
  // Sem cidade (conta sem currículo nem empresa): reserva America/Sao_Paulo.
  assert.equal((await db.query(`select vagas_interno.fuso_conta($1) f`, [crypto.randomUUID()])).rows[0].f, 'America/Sao_Paulo');
  assert.equal((await db.query(`select vagas_interno.fuso_conta($1) f`, [S.operadorCapital])).rows[0].f, 'America/Sao_Paulo');
});

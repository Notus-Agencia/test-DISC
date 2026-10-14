'use strict';
// Testes da migração 20261024120005_vagas_fase_c.sql num Postgres 17 EMBUTIDO, com TODAS as migrações anteriores em sequência
// e esta aplicada duas vezes. Cobre o veto P2 (a empresa nunca sabe o que a pessoa fez com a referência), a experiência da
// vaga pela CLT (art. 442-A) com as vagas antigas convertidas, os filtros dos cartões, e os pedidos da operação e da pessoa
// (semDona, alvoNome/quem, reenvio pela operação, consentimento da foto, quem abriu o contato, carteira "prefiro não dizer"
// e a limpeza das contas assistidas não confirmadas).
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'supabase', 'migrations');
const ler = (n) => fs.readFileSync(path.join(PASTA, n + '.sql'), 'utf8');
const TODAS = fs.readdirSync(PASTA).filter((a) => a.endsWith('.sql')).sort().map((a) => a.replace(/\.sql$/, ''));
const ESTA = '20261024120005_vagas_fase_c';
const ANTES = TODAS.slice(0, TODAS.indexOf(ESTA));
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');

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
let M = null;

test.before(async () => {
  try {
    M = await import('../../scripts/montar-testes.mjs');
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-fasec-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 63000 + Math.floor(Math.random() * 800),
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
const js = (a) => (a !== null && typeof a === 'object' && !Array.isArray(a) ? JSON.stringify(a) : a);
async function rpcComo(papel, uid, fn, args, opcoes) {
  const lista = args || [];
  const marcas = lista.map((_, i) => '$' + (i + 1)).join(', ');
  return (await como(papel, uid, `select public.${fn}(${marcas}) as r`, lista.map(js), opcoes)).rows[0].r;
}
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
async function usuarioAuth(email) {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
    [id, email, JSON.stringify({ produto: 'vagas' })]);
  return id;
}
async function contaVagas(tipo, dados) {
  seq += 1;
  const id = await usuarioAuth(tipo + seq + '@aviso.teste');
  ok(await servico('vagas_conta_registrar', id, Object.assign({ tipo, termosVersao: '2026-10' }, dados || {})));
  return id;
}

const anon = (fn, ...args) => rpcComo('anon', null, fn, args);
const emailDe = async (id) => (await db.query(`select email from auth.users where id = $1`, [id])).rows[0].email;
function cnpjCom(base12) {
  const val = (c) => c.charCodeAt(0) - 48;
  const dv = (t, pesos) => { const r = t.split('').reduce((a, c, i) => a + val(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
function anuncioDados(empresaId, extra) {
  return Object.assign({
    empresaId, area: 'atendimento', funcao: 'Atendente de loja', modalidade: 'clt',
    descricao: 'Atendimento no balcão, organização de prateleiras e apoio no caixa. Escala 6x1 com folga no domingo.',
    turno: 'comercial', experiencia: 'nao_precisa', escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'fc-go', zona: 'centro'
  }, extra || {});
}
function pessoaDados(extra) {
  return Object.assign({
    cidade: 'fc-go', zona: 'centro', maior18: true, cargos: ['Atendente'], escolaridade: 'fundamental', turnos: ['manha'],
    cnh: [], modalidades: ['clt'], cursos: [], sobre: '', nome: 'Pessoa de Teste Silva', whatsapp: '62 99123-4567', experiencias: []
  }, extra || {});
}
// Empresa verificada com uma vaga publicada (a equipe aprova a empresa e publica a vaga).
async function empresaComVaga(base, razao, extra) {
  const dona = await contaVagas('empresa');
  const emp = ok(await de(dona)('vagas_empresa_cadastrar', { cnpj: cnpjCom(base), razaoSocial: razao, cidade: 'fc-go', zona: 'centro' })).empresa.id;
  ok(await de(S.admin)('vagas_op_empresa_decidir', emp, 'aprovar', 'CNPJ conferido'));
  const an = ok(await de(dona)('vagas_anuncio_salvar', anuncioDados(emp, extra))).anuncio.id;
  ok(await de(dona)('vagas_anuncio_publicar', an));
  if ((await db.query(`select status from public.vagas_anuncios where id = $1`, [an])).rows[0].status === 'em_revisao') {
    ok(await de(S.admin)('vagas_op_anuncio_decidir', an, 'publicar', ''));
  }
  return { dona, emp, an };
}

const S = {};

test('migrações em sequência e esta duas vezes: versão 20261024120005; as vagas antigas passam a 6_meses; anon não ganha nada', async () => {
  exigirBanco();
  for (const n of ANTES) await db.query(ler(n));
  const lido = M.lerConteudo(FIXTURE);
  assert.deepEqual(lido.erros, []);
  await db.query(M.gerarSql(lido.dados));
  S.admin = await usuarioAuth('dono@gestaosemcaos.teste');
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Dono')`, [S.admin]);
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'fc-go', nome: 'Fase C', uf: 'GO', status: 'ativa', porte: 'pequena' }));
  ok(await de(S.admin)('vagas_adm_zona_salvar', { cidade: 'fc-go', slug: 'centro', nome: 'Centro', bairros: ['Centro'] }));
  ok(await de(S.admin)('vagas_adm_zona_salvar', { cidade: 'fc-go', slug: 'norte', nome: 'Norte', bairros: ['Norte'] }));
  // Antes desta migração: vagas com os ids antigos da experiência.
  S.velha = await empresaComVaga('888777666001', 'Loja Antiga Ltda', { experiencia: 'mais_3' });
  const dona = S.velha.dona;
  const outra = ok(await de(dona)('vagas_anuncio_salvar', anuncioDados(S.velha.emp, { experiencia: 'ate_1', funcao: 'Repositor de loja' }))).anuncio.id;
  const anonDe = async () => (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((x) => x.proname);
  const antes = await anonDe();
  assert.equal((await anon('versao_banco')).versao, 20261024120004);
  for (let i = 0; i < 2; i++) await db.query(ler(ESTA));
  const v = await anon('versao_banco');
  assert.equal(v.versao, 20261024120005);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-2), ['20261024120004_vagas_pre_abertura', ESTA]);
  assert.deepEqual(await anonDe(), antes);
  assert.deepEqual((await db.query(`select experiencia from public.vagas_anuncios where id = any ($1) order by experiencia`, [[S.velha.an, outra]])).rows.map((x) => x.experiencia),
    ['6_meses', '6_meses']);
  await rejeita(como('authenticated', S.admin, `select * from public.vagas_referencia_envios_email`), /permission denied/);
  await rejeita(db.query(`update public.vagas_anuncios set experiencia = 'ate_1' where id = $1`, [outra]), /vagas_anuncios_experiencia_check/);
});

test('CLT art. 442-A: a vaga pede "não precisa", "ajuda" ou "pelo menos 6 meses"; os ids antigos entram convertidos', async () => {
  exigirBanco();
  const salvar = (exp) => de(S.velha.dona)('vagas_anuncio_salvar', anuncioDados(S.velha.emp, { experiencia: exp }));
  for (const [entra, fica] of [['nao_precisa', 'nao_precisa'], ['ajuda', 'ajuda'], ['6_meses', '6_meses'], ['1_a_3', '6_meses'], ['mais_3', '6_meses']]) {
    const an = ok(await salvar(entra)).anuncio;
    assert.equal(an.experiencia, fica, entra);
  }
  erro(await salvar('2_anos'), 'Escolha a experiência que a vaga pede.');
  const fn = (await db.query(`select vagas_interno.experiencias_vaga() l`)).rows[0].l;
  assert.deepEqual(fn, ['nao_precisa', 'ajuda', '6_meses']);
});

test('cartões: escolaridadeMin e experienciaMinMeses são ignorados (como temSelo); zona, turnos, CNH e pretensão continuam', async () => {
  exigirBanco();
  const p = await contaVagas('pessoa');
  ok(await de(p)('vagas_pessoa_salvar', pessoaDados({ escolaridade: 'fundamental', turnos: ['manha'], cnh: [], pretensaoCentavos: 200000 })));
  ok(await de(p)('vagas_quero', S.velha.an));
  const cartoes = async (f) => ok(await de(S.velha.dona)('vagas_cartoes', S.velha.an, f)).total;
  assert.equal(await cartoes({}), 1);
  assert.equal(await cartoes({ escolaridadeMin: 'superior', experienciaMinMeses: 24, temSelo: true }), 1, 'primeiro emprego não some');
  assert.equal(await cartoes({ zona: 'norte' }), 0);
  assert.equal(await cartoes({ turnos: ['noite'] }), 0);
  assert.equal(await cartoes({ cnh: ['B'] }), 0);
  assert.equal(await cartoes({ pretensaoMaxCentavos: 150000 }), 0);
  assert.equal(await cartoes({ zona: 'centro', turnos: ['manha'], pretensaoMaxCentavos: 250000 }), 1);
});

test('veto P2: a empresa nunca sabe o que a pessoa fez com a referência (lista, perfil, contato, nova oferta, limite)', async () => {
  exigirBanco();
  // A pessoa se candidata, a empresa conversa e a pessoa combina.
  const a = await empresaComVaga('888777666002', 'Mercado Referencia Ltda');
  const b = await empresaComVaga('888777666003', 'Padaria Outra Ltda');
  const p = await contaVagas('pessoa');
  ok(await de(p)('vagas_pessoa_salvar', pessoaDados({ nome: 'Maria Fernanda Souza' })));
  const k = ok(await de(p)('vagas_quero', a.an)).candidatura.id;
  ok(await de(a.dona)('vagas_empresa_decidir', k, 'conversar'));
  ok(await de(p)('vagas_combinar', k));
  const kb = ok(await de(p)('vagas_quero', b.an)).candidatura.id;
  const base = { empresaId: a.emp, funcao: 'Atendente', vinculo: 'clt', inicio: '2024-01', pontosFortes: ['equipe'], declaracao: true };
  const oferta = ok(await de(a.dona)('vagas_referencia_oferecer', Object.assign({ candidaturaId: k }, base)));
  assert.equal(oferta.referencia.status, 'enviada');
  const refId = oferta.referencia.id;
  // O que a empresa autora vê, antes de a pessoa responder.
  const visao = async () => ({
    dadas: ok(await de(a.dona)('vagas_referencias_empresa', a.emp)),
    oferta: await de(a.dona)('vagas_referencia_oferecer', Object.assign({ candidaturaId: k }, base)),
    cartao: ok(await de(a.dona)('vagas_cartoes', a.an, {})).cartoes.map((c) => c.cartao.temReferencia),
    contato: ok(await de(a.dona)('vagas_contato_pessoa', k)).pessoa.referencias
  });
  const antes = await visao();
  assert.deepEqual(antes.dadas.referencias.map((r) => r.status), ['enviada']);
  assert.ok(!('aceitaEm' in antes.dadas.referencias[0]) && !('respondidaEm' in antes.dadas.referencias[0]));
  assert.equal(antes.oferta.erro, 'Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.',
    'mesma resposta com a referência ainda pendente');
  assert.deepEqual(antes.cartao, [false]);
  assert.deepEqual(antes.contato, []);
  // A pessoa aceita, oculta, mostra, remove: nada muda para a empresa autora.
  for (const acao of ['aceitar', 'ocultar', 'mostrar']) {
    ok(await de(p)('vagas_referencia_responder', refId, acao));
    assert.deepEqual(await visao(), antes, acao);
  }
  // Outra empresa vê a referência aceita e visível (só "tem referência" no cartão).
  assert.deepEqual(ok(await de(b.dona)('vagas_cartoes', b.an, {})).cartoes.filter((c) => c.candidaturaId === kb).map((c) => c.cartao.temReferencia), [true]);
  // Página pública: com o login da empresa autora, a referência dela não aparece (nem aparecendo nem sumindo conta nada).
  const t = ok(await de(p)('vagas_referencias_publicar', true)).caminho.split('t=')[1];
  assert.equal(ok(await de(a.dona)('vagas_referencias_publicas', t)).referencias.length, 0);
  assert.equal(ok(await anon('vagas_referencias_publicas', t)).referencias.length, 1);
  ok(await de(p)('vagas_referencia_responder', refId, 'remover'));
  assert.deepEqual(await visao(), antes, 'remover');
  // Moderação removeu: aí a empresa vê "removida" (é ato da moderação, não da pessoa).
  ok(await de(S.admin)('vagas_op_referencia_decidir', refId, 'remover', 'fraude'));
  assert.deepEqual(ok(await de(a.dona)('vagas_referencias_empresa', a.emp)).referencias.map((r) => r.status), ['removida']);
  assert.deepEqual(ok(await de(S.admin)('vagas_op_referencias', { textoStatus: ['pendente', 'publicado', 'nao_publicado', 'sem_texto'] })).referencias
    .filter((r) => r.id === refId), [], 'removida pela moderação sai da fila');
  // Por e-mail: nunca aparece na lista (revelaria se o e-mail tem conta) e conta no limite igual, com conta ou sem.
  const c = await empresaComVaga('888777666004', 'Oficina Email Ltda');
  const r0 = ok(await de(c.dona)('vagas_referencias_empresa', c.emp)).restantes30Dias;
  const porEmail = (email) => de(c.dona)('vagas_referencia_oferecer', Object.assign({}, base, { empresaId: c.emp, email }));
  assert.deepEqual(await porEmail(await emailDe(p)), { ok: true, enviada: true });
  assert.deepEqual(await porEmail('ninguem-fc@nao-existe.teste'), { ok: true, enviada: true });
  const lista = ok(await de(c.dona)('vagas_referencias_empresa', c.emp));
  assert.deepEqual([lista.referencias.length, lista.restantes30Dias], [0, r0 - 2]);
  const deC = ok(await de(p)('vagas_referencias_minhas')).referencias.find((r) => r.empresa.nome !== 'Mercado Referencia Ltda');
  ok(await de(p)('vagas_referencia_responder', deC.id, 'aceitar'));
  const depois = ok(await de(c.dona)('vagas_referencias_empresa', c.emp));
  assert.deepEqual([depois.referencias.length, depois.restantes30Dias], [0, r0 - 2], 'o aceite não muda nada para a empresa');
  assert.equal((await db.query(`select count(*)::int n from public.vagas_referencia_envios_email where empresa_id = $1`, [c.emp])).rows[0].n, 2);
});

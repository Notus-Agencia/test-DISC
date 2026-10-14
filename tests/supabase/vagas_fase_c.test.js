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

async function publicar(dona, an) {
  ok(await de(dona)('vagas_anuncio_publicar', an));
  if ((await db.query(`select status from public.vagas_anuncios where id = $1`, [an])).rows[0].status === 'em_revisao') {
    ok(await de(S.admin)('vagas_op_anuncio_decidir', an, 'publicar', ''));
  }
}

test('mural e feed: "aceita sem experiência" traz as vagas em que experiência só ajuda; a de 6 meses fica de fora', async () => {
  exigirBanco();
  const e = await empresaComVaga('888777666005', 'Loja Ajuda Ltda', { experiencia: 'ajuda', funcao: 'Vendedor de loja' });
  const seis = ok(await de(e.dona)('vagas_anuncio_salvar', anuncioDados(e.emp, { experiencia: '6_meses', funcao: 'Caixa de loja' }))).anuncio.id;
  await publicar(e.dona, seis);
  const exps = async (f) => [...new Set(ok(await anon('vagas_anuncios_publicos', Object.assign({ cidade: 'fc-go', areas: [] }, f)))
    .anuncios.map((a) => a.experiencia))].sort();
  assert.deepEqual(await exps({}), ['6_meses', 'ajuda', 'nao_precisa']);
  assert.deepEqual(await exps({ semExperiencia: true }), ['ajuda', 'nao_precisa']);
  const p = await contaVagas('pessoa');
  ok(await de(p)('vagas_pessoa_salvar', pessoaDados()));
  const feed = ok(await de(p)('vagas_feed', { semExperiencia: true, areas: [] })).anuncios.map((a) => a.experiencia);
  assert.deepEqual([...new Set(feed)].sort(), ['ajuda', 'nao_precisa']);
});

test('operação: donos e semDona; alvoNome e quem no registro (e-mail mascarado só para a equipe; nunca de pessoa)', async () => {
  exigirBanco();
  S.op = await contaVagas('operador', { operador: { cidade: 'fc-go', papel: 'operador' } });
  const e = await empresaComVaga('888777666006', 'Bazar Sem Dona Ltda');
  const rec = await contaVagas('empresa');
  await db.query(`insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values ($1, $2, 'recrutador')`, [e.emp, rec]);
  const sozinha = await empresaComVaga('888777666008', 'Empresa Sozinha Ltda');
  const daEmpresa = async (id) => {
    const x = ok(await de(S.op)('vagas_op_empresas', { cidade: 'fc-go' })).empresas.find((y) => y.id === id);
    return [x.donos, x.semDona];
  };
  assert.deepEqual(await daEmpresa(e.emp), [1, false]);
  assert.deepEqual(await daEmpresa(sozinha.emp), [1, false]);
  // A dona fica sem conta válida (suspensa): a empresa tem equipe e nenhuma dona válida.
  await db.query(`update public.vagas_contas set status = 'suspensa' where user_id = $1`, [e.dona]);
  assert.deepEqual(await daEmpresa(e.emp), [0, true]);
  ok(await de(S.op)('vagas_op_empresa_dono', e.emp, await emailDe(rec), 'A pessoa dona saiu da empresa.'));
  assert.deepEqual(await daEmpresa(e.emp), [1, false]);
  // Cadastro assistido feito pelo operador: registro com alvo 'conta' (sem nome).
  const assistida = await contaVagas('pessoa', { assistidaPor: S.op, cidade: 'fc-go' });
  ok(await de(assistida)('vagas_pessoa_salvar', pessoaDados({ nome: 'Joana Assistida Pereira' })));
  const registros = async (uid) => ok(await de(uid)('vagas_op_moderacao', { cidade: 'fc-go', limite: 200 })).registros;
  const nome = (await db.query(`select nome_fantasia from public.vagas_empresas where id = $1`, [e.emp])).rows[0].nome_fantasia;
  const doOp = await registros(S.op);
  const dono = doOp.find((r) => r.acao === 'empresa_dono' && r.alvoId === e.emp);
  assert.deepEqual([dono.alvoNome, dono.quem], [nome, { papel: 'operador', voce: true, email: '' }]);
  const conta = doOp.find((r) => r.acao === 'cadastro_assistido' && r.alvoId === assistida);
  assert.deepEqual([conta.alvoNome, conta.quem], ['', { papel: 'operador', voce: true, email: '' }]);
  assert.ok(doOp.every((r) => r.quem.email === ''), 'o operador não vê e-mail de ninguém');
  assert.deepEqual(doOp.filter((r) => r.alvo === 'zona').map((r) => r.alvoNome).sort(), ['Centro (Fase C)', 'Norte (Fase C)']);
  assert.equal(doOp.find((r) => r.alvo === 'cidade').alvoNome, 'Fase C');
  // A equipe vê o e-mail mascarado de quem é da operação ou da equipe.
  const daEquipe = await registros(S.admin);
  const opEmail = await emailDe(S.op);
  assert.deepEqual(daEquipe.find((r) => r.id === dono.id).quem,
    { papel: 'operador', voce: false, email: opEmail.charAt(0) + '***@a***.teste' });
  assert.deepEqual(daEquipe.find((r) => r.alvo === 'cidade').quem, { papel: 'admin', voce: true, email: 'd***@g***.teste' });
  for (const r of daEquipe) {
    if (!['operador', 'moderador', 'admin'].includes(r.papel)) assert.equal(r.quem.email, '', r.acao);
    assert.ok(!/Joana|Maria|Pessoa de Teste/.test(r.alvoNome), r.alvoNome);
  }
});

test('reenvio pela operação: conta_limite aceita reenviar_op só com quem age; consultar devolve a cidade da conta assistida', async () => {
  exigirBanco();
  const lim = (acao, ator) => servico('vagas_conta_limite', acao, '203.0.113.50', '', 'alguem-fc@reenvio.teste', ator);
  erro(await lim('reenviar_op', null), 'Sem permissão.');
  ok(await lim('reenviar_op', S.op));
  erro(await lim('reenviar_outro', S.op), 'Ação desconhecida.');
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, 'assistida-fc@reenvio.teste', '{"produto":"vagas"}')`, [id]);
  ok(await servico('vagas_conta_registrar', id, { tipo: 'pessoa', assistidaPor: S.op, cidade: 'fc-go' }));
  assert.deepEqual(ok(await servico('vagas_conta_consultar', 'assistida-fc@reenvio.teste')).conta,
    { tipo: 'pessoa', status: 'pendente', assistidaCidade: 'fc-go' });
  assert.equal(ok(await servico('vagas_conta_consultar', await emailDe(S.op))).conta.assistidaCidade, null);
  await rejeita(de(S.op)('vagas_conta_limite', 'reenviar_op', '', '', '', S.op), /permission denied/);
});

test('pessoa: consentimento da foto opcional (grava só quando muda), quem abriu o contato (papel, nunca e-mail) e carteira "prefiro não dizer"', async () => {
  exigirBanco();
  const p = await contaVagas('pessoa');
  const exps = [
    { funcao: 'Atendente', empregador: 'Loja A', inicio: '2022-01', fim: '2023-01', informal: true },
    { funcao: 'Ajudante', empregador: 'Loja B', inicio: '2021-01', fim: '2021-06', informal: false },
    { funcao: 'Diarista', empregador: '', inicio: '2020-01', fim: '2020-06', informal: null },
    { funcao: 'Repositor', empregador: '', inicio: '2019-01', fim: '2019-06' }];
  const salvo = ok(await de(p)('vagas_pessoa_salvar', pessoaDados({ nome: 'Carla Contato Dias', experiencias: exps })));
  assert.deepEqual(salvo.pessoa.experiencias.map((x) => x.informal), [true, false, null, false], 'sem a chave: false, como antes');
  // Foto opcional: true ao enviar, false ao apagar; repetir não grava de novo.
  const foto = (v) => de(p)('vagas_foto_consentimento', v);
  assert.deepEqual(await foto(true), { ok: true, fotoOpcional: true, duplicado: false });
  assert.deepEqual(await foto(true), { ok: true, fotoOpcional: true, duplicado: true });
  assert.deepEqual(await foto(false), { ok: true, fotoOpcional: false, duplicado: false });
  erro(await foto(null), 'Dados inválidos. Confira os campos.');
  assert.deepEqual((await db.query(`select aceito, versao from public.vagas_consentimentos where user_id = $1 and tipo = 'foto_opcional' order by id`, [p])).rows,
    [{ aceito: true, versao: '2026-10' }, { aceito: false, versao: '2026-10' }]);
  await rejeita(anon('vagas_foto_consentimento', true), /permission denied/);
  // Quem abriu o contato: papel de quem abriu (dona, recrutador), por empresa; nunca e-mail.
  const a = await empresaComVaga('888777666007', 'Clinica Contato Ltda');
  const naoPessoa = await de(a.dona)('vagas_foto_consentimento', true);
  assert.equal(naoPessoa.ok, false);
  const rec = await contaVagas('empresa');
  await db.query(`insert into public.vagas_empresa_membros (empresa_id, user_id, papel) values ($1, $2, 'recrutador')`, [a.emp, rec]);
  const k = ok(await de(p)('vagas_quero', a.an)).candidatura.id;
  ok(await de(a.dona)('vagas_empresa_decidir', k, 'conversar'));
  ok(await de(p)('vagas_combinar', k));
  ok(await de(a.dona)('vagas_contato_pessoa', k));
  ok(await de(rec)('vagas_contato_pessoa', k));
  ok(await de(rec)('vagas_contato_pessoa', k));
  const acessos = ok(await de(p)('vagas_quem_viu_meu_contato')).acessos;
  assert.equal(acessos.length, 1);
  const nome = (await db.query(`select nome_fantasia from public.vagas_empresas where id = $1`, [a.emp])).rows[0].nome_fantasia;
  assert.deepEqual([acessos[0].vezes, acessos[0].empresa, acessos[0].podeCortar], [3, nome, true]);
  assert.deepEqual(acessos[0].quem, [{ empresa: nome, papel: 'recrutador', vezes: 2 }, { empresa: nome, papel: 'dono', vezes: 1 }]);
  assert.ok(!JSON.stringify(acessos).includes('@'), 'nenhum e-mail');
  assert.deepEqual((await db.query(`select papel from public.vagas_acessos_contato where pessoa_id = $1 order by id`, [p])).rows.map((x) => x.papel),
    ['dono', 'recrutador', 'recrutador']);
  await rejeita(db.query(`insert into public.vagas_acessos_contato (pessoa_id, empresa_nome, papel) values ($1, 'X', 'operador')`, [p]),
    /vagas_acessos_contato_papel_check/);
});

test('limpeza: conta do cadastro assistido nunca confirmada some 7 dias depois; o resto fica', async () => {
  exigirBanco();
  const pend = async (email, dados, dias, produto) => {
    const id = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ produto: produto || 'vagas' })]);
    ok(await servico('vagas_conta_registrar', id, Object.assign({ tipo: 'pessoa', assistidaPor: S.op, cidade: 'fc-go' }, dados)));
    // criado_em não muda pela API (gatilho): o teste envelhece a conta com o gatilho desligado.
    await db.query(`alter table public.vagas_contas disable trigger vagas_contas_antes_gravar`);
    await db.query(`update public.vagas_contas set criado_em = now() - make_interval(days => $2) where user_id = $1`, [id, dias]);
    await db.query(`alter table public.vagas_contas enable trigger vagas_contas_antes_gravar`);
    return id;
  };
  const velha = await pend('velha-fc@limpa.teste', {}, 8);
  const empresaVelha = await pend('empresa-velha-fc@limpa.teste', { tipo: 'empresa' }, 8);
  const ficam = [
    await pend('nova-fc@limpa.teste', {}, 6),
    await pend('aberta-fc@limpa.teste', { assistidaPor: '' }, 8),
    await pend('confirmada-fc@limpa.teste', {}, 8),
    await pend('convite-op-fc@limpa.teste', { tipo: 'operador', operador: { cidade: 'fc-go', papel: 'moderador' } }, 8),
    await pend('disc-fc@limpa.teste', {}, 8, 'disc')];
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [ficam[2]]);
  const todas = [velha, empresaVelha].concat(ficam);
  assert.equal((await db.query(`select vagas_interno.contas_assistidas_limpar() n`)).rows[0].n, 2);
  const restam = async (ids) => (await db.query(`select id from auth.users where id = any ($1)`, [ids])).rows.map((x) => x.id).sort();
  assert.deepEqual(await restam(todas), ficam.slice().sort());
  assert.equal((await db.query(`select count(*)::int n from public.vagas_contas where user_id = any ($1)`, [[velha, empresaVelha]])).rows[0].n, 0);
  assert.equal((await db.query(`select vagas_interno.contas_assistidas_limpar() n`)).rows[0].n, 0, 'rodar de novo não apaga mais nada');
  // A cada cadastro assistido (limite 'assistido' da Function) a limpeza roda sozinha.
  const outra = await pend('outra-velha-fc@limpa.teste', {}, 9);
  ok(await servico('vagas_conta_limite', 'assistido', '203.0.113.61', '', 'mais-uma-fc@limpa.teste', S.op));
  assert.deepEqual(await restam([outra]), []);
  await rejeita(como('authenticated', S.admin, `select vagas_interno.contas_assistidas_limpar()`), /permission denied/);
});

'use strict';
// Testes da migração 20261016120000_envios_email.sql (histórico de envios por e-mail: tabela, RLS só de leitura para
// administradores, gravação só pela service_role, limpeza junto com o relatório/pedido e versao_banco) num Postgres 17
// EMBUTIDO, com as 12 migrações aplicadas EM SEQUÊNCIA sobre dados "de produção" das anteriores.
// Mesmo preparo "tipo Supabase" de tests/supabase/minimo_cobranca.test.js.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { payloadValido } = require('../helpers/fixtures.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email'];
const SQL = MIGRACOES.map((n) => ler(n + '.sql'));
const ULTIMA = SQL.length - 1;

const PREPARO_SUPABASE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const ADMIN = 'aaaaaaaa-1111-4111-8111-111111111111';
const OUTRO = 'bbbbbbbb-2222-4222-8222-222222222222';

let pg = null;
let db = null;
let falhaInicio = null;

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-envios-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 61000 + Math.floor(Math.random() * 800),
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

async function como(papel, uid, sql, params) {
  await db.query('begin');
  try {
    await db.query(`set local role ${papel}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}
const anon = (sql, params) => como('anon', null, sql, params);
const admin = (sql, params) => como('authenticated', ADMIN, sql, params);
const outro = (sql, params) => como('authenticated', OUTRO, sql, params);
const servico = (sql, params) => como('service_role', null, sql, params);
async function rpcAnon(fn, ...args) {
  const marcas = args.map((_, i) => '$' + (i + 1)).join(', ');
  const vals = args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a));
  return (await como('anon', null, `select public.${fn}(${marcas}) as r`, vals)).rows[0].r;
}

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}

const INSERIR = `insert into public.envios_email (tipo, referencia, destinatario, enviado_por, enviado_por_id, resultado, provedor_id)
  values ($1, $2, $3, $4, $5, $6, $7) returning id`;
const registrar = (tipo, ref, para, quem, quemId, resultado, provedorId) =>
  servico(INSERIR, [tipo, ref, para, quem, quemId || null, resultado || 'ok', provedorId || null]);
const contar = async (ref) => (await db.query(`select count(*)::int as n from public.envios_email where referencia = $1`, [ref])).rows[0].n;

let seq = 0;
async function pedidoNovo() {
  seq += 1;
  const p = payloadValido({ id: 'pv-env-' + Date.now().toString(36) + '-' + seq, nome: 'Bia Pessoal Souza', email: 'bia' + seq + '@exemplo.com', telefone: '' });
  const r = await rpcAnon('enviar_resposta_pessoal', p);
  const ped = await rpcAnon('criar_pedido', r.tokenResumo, 'completo', null);
  assert.equal(ped.ok, true, JSON.stringify(ped));
  return ped.pedidoId;
}
async function relatorioNovo() {
  const proc = (await db.query(`insert into public.processos (nome, codigo) values ('Processo envio', null) returning id`)).rows[0].id;
  return (await db.query(`insert into public.relatorios (processo_id, dados, status) values ($1, '{}', 'publicado') returning token`, [proc])).rows[0].token;
}

test('as 12 migrações em sequência sobre dados antigos: idempotente; dados gravados intactos; versão nova', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'outro@x.com')`, [ADMIN, OUTRO]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Wellington')`, [ADMIN]);
  const pedidoAntigo = await pedidoNovo();
  const relAntigo = await relatorioNovo();
  assert.equal((await rpcAnon('versao_banco')).versao, 20261015120000);
  assert.deepEqual((await rpcAnon('versao_banco')).faltando, []);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpcAnon('versao_banco'), { ok: true, versao: 20261016120000, migracoes: MIGRACOES, faltando: [] });
  assert.ok((await db.query(`select 1 from public.pedidos where id = $1`, [pedidoAntigo])).rows.length, 'pedido antigo intacto');
  assert.ok((await db.query(`select 1 from public.relatorios where token = $1`, [relAntigo])).rows.length, 'relatório antigo intacto');
  // Um envio gravado sobrevive a rodar a migração de novo (e a anterior e esta em seguida).
  await registrar('relatorio', relAntigo, 'dono@empresa.com', 'Wellington', ADMIN, 'ok', '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794');
  await db.query(SQL[ULTIMA - 1]);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261015120000);
  await db.query(SQL[ULTIMA]);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261016120000);
  assert.equal(await contar(relAntigo), 1);
});

test('RLS: só administradores leem; ninguém grava pelo PostgREST; a service_role grava', async () => {
  exigirBanco();
  const rel = await relatorioNovo();
  await registrar('relatorio', rel, 'contratante@empresa.com', 'Wellington', ADMIN, 'ok', 're_123');
  await registrar('relatorio', rel, 'errado@empresa.com', 'Wellington', ADMIN, 'erro', null);
  const lidos = (await admin(`select tipo, referencia, destinatario, enviado_por, resultado, provedor_id from public.envios_email
    where referencia = $1 order by em desc, destinatario`, [rel])).rows;
  assert.equal(lidos.length, 2);
  assert.deepEqual(lidos.map((l) => l.resultado).sort(), ['erro', 'ok']);
  assert.equal((await outro(`select * from public.envios_email`)).rows.length, 0, 'logado sem ser admin não vê nada');
  await rejeita(anon(`select * from public.envios_email`), /permission denied/);
  await rejeita(admin(INSERIR, ['relatorio', rel, 'x@y.com', 'Wellington', ADMIN, 'ok', null]), /permission denied/);
  await rejeita(admin(`update public.envios_email set resultado = 'ok' where referencia = $1`, [rel]), /permission denied/);
  await rejeita(admin(`delete from public.envios_email where referencia = $1`, [rel]), /permission denied/);
  await rejeita(anon(INSERIR, ['relatorio', rel, 'x@y.com', 'cliente', null, 'ok', null]), /permission denied/);
  assert.equal(await contar(rel), 2);
});

test('regras: tipo, referência, e-mail, quem enviou ("cliente" ou um administrador), resultado e id do provedor', async () => {
  exigirBanco();
  const ped = await pedidoNovo();
  await registrar('pedido', ped, 'bia@exemplo.com', 'cliente', null, 'ok', 'abc-123');
  await rejeita(registrar('outro', ped, 'bia@exemplo.com', 'cliente'), /envios_email_tipo_valido/);
  await rejeita(registrar('pedido', 'a b', 'bia@exemplo.com', 'cliente'), /envios_email_referencia_valida/);
  await rejeita(registrar('pedido', ped, 'sem-arroba', 'cliente'), /envios_email_destinatario_valido/);
  await rejeita(registrar('pedido', ped, 'bia@exemplo.com', 'Fulano', null), /envios_email_quem_valido/);
  await rejeita(registrar('pedido', ped, 'bia@exemplo.com', '', ADMIN), /envios_email_quem_valido/);
  await rejeita(registrar('pedido', ped, 'bia@exemplo.com', 'cliente', null, 'talvez'), /envios_email_resultado_valido/);
  await rejeita(registrar('pedido', ped, 'bia@exemplo.com', 'cliente', null, 'ok', '<script>'), /envios_email_provedor_id_valido/);
  assert.equal(await contar(ped), 1);
  // Só as colunas combinadas: nada do conteúdo do e-mail.
  const colunas = (await db.query(`select column_name from information_schema.columns where table_schema = 'public'
    and table_name = 'envios_email' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.deepEqual(colunas, ['id', 'tipo', 'referencia', 'destinatario', 'enviado_por', 'enviado_por_id', 'em', 'resultado', 'provedor_id']);
});

test('apagar o relatório ou o pedido apaga o histórico dele (e só o dele)', async () => {
  exigirBanco();
  const rel1 = await relatorioNovo();
  const rel2 = await relatorioNovo();
  const ped = await pedidoNovo();
  await registrar('relatorio', rel1, 'a@b.com', 'Wellington', ADMIN);
  await registrar('relatorio', rel2, 'c@d.com', 'Wellington', ADMIN);
  await registrar('pedido', ped, 'bia@exemplo.com', 'cliente', null);
  await admin(`delete from public.relatorios where token = $1`, [rel1]);
  assert.equal(await contar(rel1), 0);
  assert.equal(await contar(rel2), 1);
  await servico(`delete from public.pedidos where id = $1`, [ped]);
  assert.equal(await contar(ped), 0);
  assert.equal(await contar(rel2), 1);
});

'use strict';
// Testes da migração 20261102120000_vagas_v2_codigos.sql (entrada por código de 6 dígitos) num Postgres 17 EMBUTIDO, com as
// migrações anteriores à v2 em sequência e esta aplicada duas vezes. Cobre: tabela fechada (RLS, sem acesso de anon e
// authenticated), funções só da service_role, código novo (30 s, limites, o novo invalida o antigo), tentativas (5, atômicas),
// vencimento (10 min), uso único, cancelamento e os limites das ações novas da Edge Function.
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
const ESTA = '20261102120000_vagas_v2_codigos';
// Só o que já existia antes da v2: este teste não depende das migrações do banco novo (20261101...).
const ANTES = TODAS.filter((n) => n < '20261101');

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

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-codigos-' + crypto.randomBytes(6).toString('hex'));
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

async function como(papel, sql, params, claims) {
  await db.query('begin');
  try {
    await db.query(`set local role ${papel}`);
    if (claims) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}
const chamar = async (papel, fn, args, claims) => {
  const marcas = (args || []).map((_, i) => '$' + (i + 1)).join(', ');
  return (await como(papel, `select public.${fn}(${marcas}) as r`, args || [], claims)).rows[0].r;
};
const servico = (fn, ...args) => chamar('service_role', fn, args);
const SAL = 'a1'.repeat(16);
const HASH = 'b2'.repeat(32);
const IP = '198.51.100.7';
let seq = 0;
const novoDestino = () => 'pessoa' + (++seq) + '@codigos.teste';
const pedir = (destino, ip) => servico('vagas_conta_codigo_novo', 'email', destino, SAL, HASH, ip || IP, '');
const linhas = async (destino) => (await db.query('select * from vagas_interno.codigos_entrada where destino = $1 order by criado_em', [destino])).rows;
const voltarNoTempo = (destino, seg) => db.query(
  `update vagas_interno.codigos_entrada set criado_em = criado_em - ($2 || ' seconds')::interval, expira_em = expira_em - ($2 || ' seconds')::interval where destino = $1`, [destino, String(seg)]);
const MUITAS = 'Muitas tentativas. Tente de novo mais tarde.';

test('migração aplicada duas vezes: tabela fechada (RLS), funções só da service_role', async () => {
  exigirBanco();
  for (const n of ANTES) await db.query(ler(n));
  await db.query(ler(ESTA));
  await db.query(ler(ESTA));
  const t = (await db.query(`select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vagas_interno' and c.relname = 'codigos_entrada'`)).rows[0];
  assert.equal(t.rls, true);
  for (const papel of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_table_privilege($1, 'vagas_interno.codigos_entrada', 'select') as p`, [papel])).rows[0].p, false, papel);
    assert.equal((await db.query(`select has_schema_privilege($1, 'vagas_interno', 'usage') as p`, [papel])).rows[0].p, false, papel);
  }
  assert.equal((await db.query(`select has_table_privilege('service_role', 'vagas_interno.codigos_entrada', 'insert') as p`)).rows[0].p, true);
  const funcoes = ['vagas_conta_codigo_novo(text, text, text, text, text, text)', 'vagas_conta_codigo_tentar(text, text, text)', 'vagas_conta_codigo_usar(uuid)',
    'vagas_conta_codigo_cancelar(uuid)', 'vagas_conta_limite_v2(text, text, text, text, uuid)'];
  for (const f of funcoes) {
    for (const papel of ['anon', 'authenticated']) {
      assert.equal((await db.query(`select has_function_privilege($1, 'public.${f}', 'execute') as p`, [papel])).rows[0].p, false, papel + ' ' + f);
    }
    assert.equal((await db.query(`select has_function_privilege('service_role', 'public.${f}', 'execute') as p`)).rows[0].p, true, f);
  }
  await assert.rejects(() => chamar('anon', 'vagas_conta_codigo_novo', ['email', 'a@b.com', SAL, HASH, IP, '']), /permission denied/);
  await assert.rejects(() => chamar('authenticated', 'vagas_conta_codigo_tentar', ['a@b.com', IP, '']), /permission denied/);
});

test('segunda trava: mesmo com execute dado por engano, quem chega como anon/authenticated pela API é recusado', async () => {
  exigirBanco();
  await db.query('grant execute on function public.vagas_conta_codigo_cancelar(uuid) to authenticated');
  try {
    await assert.rejects(() => chamar('authenticated', 'vagas_conta_codigo_cancelar', [crypto.randomUUID()], { role: 'authenticated' }), /Sem permissão/);
    await assert.rejects(() => chamar('service_role', 'vagas_conta_codigo_cancelar', [crypto.randomUUID()], { role: 'anon' }), /Sem permissão/);
    assert.equal((await chamar('service_role', 'vagas_conta_codigo_cancelar', [crypto.randomUUID()], { role: 'service_role' })).ok, true);
  } finally {
    await db.query('revoke execute on function public.vagas_conta_codigo_cancelar(uuid) from authenticated');
  }
});

test('codigo_novo: guarda só sal e hash, vale 10 minutos, o novo invalida o antigo e reenviar só depois de 30 s', async () => {
  exigirBanco();
  const d = novoDestino();
  const r = await pedir(d.toUpperCase());
  assert.equal(r.ok, true);
  assert.equal(r.reenviarEmSeg, 30);
  assert.equal(r.expiraEmSeg, 600);
  const [a] = await linhas(d);
  assert.equal(a.sal, SAL);
  assert.equal(a.hash, HASH);
  assert.equal(a.tentativas, 0);
  assert.equal(a.usado_em, null);
  assert.ok(Math.abs(new Date(a.expira_em).getTime() - new Date(a.criado_em).getTime() - 600000) < 1000);
  const cedo = await pedir(d);
  assert.equal(cedo.ok, false);
  assert.equal(cedo.codigo, 'aguarde');
  assert.equal(cedo.aguardar, true);
  assert.ok(cedo.reenviarEmSeg >= 1 && cedo.reenviarEmSeg <= 30);
  assert.equal((await linhas(d)).length, 1, 'nada novo foi gravado');
  await voltarNoTempo(d, 31);
  const de_novo = await pedir(d);
  assert.equal(de_novo.ok, true);
  const todas = await linhas(d);
  assert.equal(todas.length, 2);
  assert.notEqual(todas[0].usado_em, null, 'o código anterior deixou de valer');
  assert.equal(todas[1].usado_em, null);
  assert.equal((await servico('vagas_conta_codigo_novo', 'sms', d, SAL, HASH, IP, '')).erro, 'Canal inválido.');
  assert.equal((await servico('vagas_conta_codigo_novo', 'email', d, 'curto', HASH, IP, '')).erro, 'Dados inválidos.');
  assert.equal((await servico('vagas_conta_codigo_novo', 'email', d, SAL, 'x', IP, '')).erro, 'Dados inválidos.');
  assert.equal((await servico('vagas_conta_codigo_novo', 'email', '', SAL, HASH, IP, '')).erro, 'Destino inválido.');
});

test('codigo_tentar: 5 tentativas no máximo (a conta é gasta antes de comparar) e devolve sal e hash só para a função', async () => {
  exigirBanco();
  const d = novoDestino();
  const n = await pedir(d);
  for (let i = 1; i <= 5; i++) {
    const t = await servico('vagas_conta_codigo_tentar', d, IP, '');
    assert.equal(t.ok, true, 'tentativa ' + i);
    assert.equal(t.id, n.id);
    assert.equal(t.sal, SAL);
    assert.equal(t.hash, HASH);
    assert.equal(t.restantes, 5 - i);
  }
  const sexta = await servico('vagas_conta_codigo_tentar', d, IP, '');
  assert.equal(sexta.ok, false);
  assert.equal(sexta.codigo, 'tentativas');
  assert.equal((await linhas(d))[0].tentativas, 5);
  assert.ok(!('sal' in sexta) && !('hash' in sexta));
});

test('codigo_tentar: 12 conferências seguidas de origens diferentes: só 5 gastam tentativa (a conta é uma instrução só, sem corrida)', async () => {
  exigirBanco();
  const d = novoDestino();
  await pedir(d);
  const resultados = [];
  for (let i = 0; i < 12; i++) resultados.push(await servico('vagas_conta_codigo_tentar', d, '198.51.100.' + (10 + i), ''));
  assert.equal(resultados.filter((r) => r.ok).length, 5);
  assert.equal(resultados.filter((r) => !r.ok && r.codigo === 'tentativas').length, 7);
});

test('codigo_tentar: vencido (10 minutos) e sem pedido', async () => {
  exigirBanco();
  const sem = await servico('vagas_conta_codigo_tentar', novoDestino(), IP, '');
  assert.equal(sem.ok, false);
  assert.equal(sem.codigo, 'codigo_vencido');
  const d = novoDestino();
  await pedir(d);
  await voltarNoTempo(d, 601);
  const vencido = await servico('vagas_conta_codigo_tentar', d, IP, '');
  assert.equal(vencido.ok, false);
  assert.equal(vencido.codigo, 'codigo_vencido');
  assert.equal((await linhas(d))[0].tentativas, 0, 'vencido não gasta tentativa');
});

test('codigo_usar: uma vez só; derruba os outros do mesmo destino; vencido não usa', async () => {
  exigirBanco();
  const d = novoDestino();
  const n = await pedir(d);
  assert.equal((await servico('vagas_conta_codigo_usar', n.id)).ok, true);
  const de_novo = await servico('vagas_conta_codigo_usar', n.id);
  assert.equal(de_novo.ok, false);
  assert.equal(de_novo.codigo, 'codigo_vencido');
  assert.equal((await servico('vagas_conta_codigo_tentar', d, IP, '')).ok, false, 'usado não volta');
  const e = novoDestino();
  const v = await pedir(e);
  await voltarNoTempo(e, 601);
  assert.equal((await servico('vagas_conta_codigo_usar', v.id)).ok, false);
});

test('codigo_cancelar: apaga o código que não saiu e libera o reenvio; não apaga o já usado', async () => {
  exigirBanco();
  const d = novoDestino();
  const n = await pedir(d);
  assert.equal((await servico('vagas_conta_codigo_cancelar', n.id)).ok, true);
  assert.equal((await linhas(d)).length, 0);
  const outro = await pedir(d);
  assert.equal(outro.ok, true, 'sem esperar 30 s');
  await servico('vagas_conta_codigo_usar', outro.id);
  await servico('vagas_conta_codigo_cancelar', outro.id);
  assert.equal((await linhas(d)).length, 1);
});

test('limites do pedido: 5 por hora por destino e 20 por hora por origem', async () => {
  exigirBanco();
  const d = novoDestino();
  for (let i = 1; i <= 5; i++) {
    const r = await pedir(d, '198.51.100.50');
    assert.equal(r.ok, true, 'pedido ' + i);
    await voltarNoTempo(d, 40);
  }
  const sexto = await pedir(d, '198.51.100.50');
  assert.equal(sexto.ok, false);
  assert.equal(sexto.erro, MUITAS);
  assert.equal(sexto.bloqueado, true);
  const ip = '198.51.100.99';
  let bloqueado = 0;
  for (let i = 0; i < 24; i++) { const r = await pedir(novoDestino(), ip); if (!r.ok) { assert.equal(r.erro, MUITAS); bloqueado++; } }
  assert.equal(bloqueado, 4, 'a partir do 21º pedido da mesma origem');
});

test('limite da conferência: 60 por hora por origem', async () => {
  exigirBanco();
  const ip = '198.51.100.120';
  let bloqueado = 0;
  for (let i = 0; i < 62; i++) { const r = await servico('vagas_conta_codigo_tentar', novoDestino(), ip, ''); if (r.erro === MUITAS) bloqueado++; }
  assert.equal(bloqueado, 2);
});

test('limite_v2: cnpj por origem, empresa_criar por origem e por conta, links por conta; ação desconhecida', async () => {
  exigirBanco();
  assert.equal((await servico('vagas_conta_limite_v2', 'nada', IP, '', '', null)).erro, 'Ação desconhecida.');
  let bloq = 0;
  for (let i = 0; i < 62; i++) { const r = await servico('vagas_conta_limite_v2', 'cnpj', '198.51.100.130', '', '', null); if (!r.ok) { assert.equal(r.erro, MUITAS); bloq++; } }
  assert.equal(bloq, 2);
  const uid = crypto.randomUUID();
  bloq = 0;
  for (let i = 0; i < 12; i++) { const r = await servico('vagas_conta_limite_v2', 'empresa_criar', '198.51.100.140', '', '', uid); if (!r.ok) bloq++; }
  assert.equal(bloq, 2, 'a conta passa de 10 por hora');
  bloq = 0;
  const uid2 = crypto.randomUUID();
  for (let i = 0; i < 62; i++) { const r = await servico('vagas_conta_limite_v2', 'documento_link', '198.51.100.150', '', '', uid2); if (!r.ok) bloq++; }
  assert.equal(bloq, 2);
  assert.equal((await servico('vagas_conta_limite_v2', 'arquivo_link', '198.51.100.160', '', '', crypto.randomUUID())).ok, true);
});

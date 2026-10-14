'use strict';
// Testes da migração 20261024120003_vagas_aviso_reforco.sql (3ª revisão de segurança do aviso de abertura) num Postgres 17
// EMBUTIDO, com TODAS as migrações anteriores em sequência e esta aplicada duas vezes. Cobre: A1 (e-mail só ASCII visível;
// linhas antigas que não passariam saem; e-mail recusado pela Function não volta; falha passageira vai para o fim e para na
// 3ª), A2 (teto de 24 h, ajuste e previsão de dias), A4 (lote interrompido volta uma vez só) e A5 (marca do N2 com sal).
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
const ESTA = '20261024120003_vagas_aviso_reforco';
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
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-reforco-' + crypto.randomBytes(6).toString('hex'));
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
// As funções de serviço recebem arrays de uuid (o pg manda array JS como array do Postgres).
const lote = (user, cidade, limite) => servico('vagas_conta_aviso_lote', user, cidade, limite);
const marcar = (user, cidade, enviados, falhas, invalidos) => rpcComo('service_role', null, 'vagas_conta_aviso_marcar',
  invalidos === undefined ? [user, cidade, enviados, falhas] : [user, cidade, enviados, falhas, invalidos]);

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
const linhas = async (slug) => (await db.query(`select l.email, l.avisado_em is not null reservado, l.aviso_enviado_em is not null enviado,
  l.aviso_tentativas tentativas, l.aviso_devolvido devolvido from public.vagas_lista_espera l join public.vagas_cidades c on c.id = l.cidade_id
  where c.slug = $1 order by l.criado_em, l.id`, [slug])).rows;
const idDe = async (email) => (await db.query(`select id from public.vagas_lista_espera where email = $1`, [email])).rows[0].id;

const S = {};
const anon = (fn, ...args) => rpcComo('anon', null, fn, args);
const ajustar = (chave, valor) => db.query(`insert into vagas_interno.ajustes (chave, valor) values ($1, $2)
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`, [chave, valor]);
const zerarTeto = () => db.query(`delete from public.vagas_limites where tipo = 'aviso_email'`);
const ESQUISITOS = ['a b@ex.com', 'a﻿b@ex.com', 'a b@ex.com', 'a　b@ex.com', 'joão@ex.com', 'a​b@ex.com'];

test('migrações em sequência e esta duas vezes: versão 20261024120003; e-mails que não passariam saem; o que já foi avisado conta como enviado', async () => {
  exigirBanco();
  for (const n of ANTES) await db.query(ler(n));
  const lido = M.lerConteudo(FIXTURE);
  assert.deepEqual(lido.erros, []);
  await db.query(M.gerarSql(lido.dados));
  S.admin = await usuarioAuth('dono@gestaosemcaos.teste');
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Dono')`, [S.admin]);
  const anonDe = async () => (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((x) => x.proname);
  const antes = await anonDe();
  // Antes desta migração: a lista aceitava os e-mails esquisitos (o ataque A1), havia um já avisado e uma marca sem sal.
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'velha-go', nome: 'Velha', uf: 'GO', status: 'lista_espera' }));
  for (const [i, e] of ESQUISITOS.entries()) ok(await anonIp(10 + i)('vagas_lista_espera_entrar', { cidade: 'velha-go', email: e }));
  ok(await anonIp(30)('vagas_lista_espera_entrar', { cidade: 'velha-go', email: 'certa@exemplo.com' }));
  ok(await anonIp(31)('vagas_lista_espera_entrar', { cidade: 'velha-go', email: 'avisada@exemplo.com', whatsapp: '62 99111-0031' }));
  assert.equal((await db.query(`select count(*)::int n from public.vagas_lista_espera`)).rows[0].n, ESQUISITOS.length + 2, 'a 20261024120002 aceitava');
  await db.query(`update public.vagas_lista_espera set avisado_em = now() - interval '2 days' where email = 'avisada@exemplo.com'`);
  ok(await anonIp(32)('vagas_lista_espera_sair', { cidade: 'velha-go', email: 'saiu@exemplo.com' }));
  ok(await anonIp(32)('vagas_lista_espera_entrar', { cidade: 'velha-go', email: 'saiu@exemplo.com' }));
  ok(await anonIp(32)('vagas_lista_espera_sair', { cidade: 'velha-go', email: 'saiu@exemplo.com' }));
  assert.equal((await db.query(`select count(*)::int n from public.vagas_limites where tipo = 'lista_saiu'`)).rows[0].n, 1);
  assert.equal((await anon('versao_banco')).versao, 20261024120002);
  for (let i = 0; i < 2; i++) await db.query(ler(ESTA));
  const v = await anon('versao_banco');
  assert.equal(v.versao, 20261024120003);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-2), ['20261024120002_vagas_aviso_abertura', ESTA]);
  assert.deepEqual(await anonDe(), antes, 'anon executa exatamente as mesmas funções');
  assert.deepEqual((await linhas('velha-go')).map((x) => [x.email, x.reservado, x.enviado]),
    [['certa@exemplo.com', false, false], ['avisada@exemplo.com', true, true]], 'só ficam os e-mails que a Function aceita; o avisado conta como enviado');
  assert.equal((await db.query(`select count(*)::int n from public.vagas_limites where tipo = 'lista_saiu'`)).rows[0].n, 0, 'marca sem sal sai');
  // Rodar de novo não transforma reserva nova em envio confirmado.
  await db.query(`update public.vagas_lista_espera set avisado_em = now() where email = 'certa@exemplo.com'`);
  await db.query(ler(ESTA));
  assert.deepEqual((await linhas('velha-go')).map((x) => x.enviado), [false, true]);
  await db.query(`update public.vagas_lista_espera set avisado_em = null where email = 'certa@exemplo.com'`);
  // Permissões: marcar (4 e 5 parâmetros) e lote só para o serviço; ajustes e o sal fechados para todos menos o dono.
  const priv = async (assinatura) => (await db.query(`select has_function_privilege('anon', $1::regprocedure, 'execute') anon,
    has_function_privilege('authenticated', $1::regprocedure, 'execute') aut, has_function_privilege('service_role', $1::regprocedure, 'execute') srv`,
    [assinatura])).rows[0];
  for (const f of ['public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[])', 'public.vagas_conta_aviso_marcar(uuid, text, uuid[], uuid[], uuid[])',
    'public.vagas_conta_aviso_lote(uuid, text, integer)']) assert.deepEqual(await priv(f), { anon: false, aut: false, srv: true }, f);
  for (const papel of ['anon', 'authenticated', 'service_role']) {
    await rejeita(como(papel, null, `select valor from vagas_interno.ajustes`), /permission denied/);
  }
  assert.equal((await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vagas_interno' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or p.proname like 'vagas\\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).rows, []);
  const sal = (await db.query(`select valor from vagas_interno.ajustes where chave = 'sal_privado'`)).rows[0].valor;
  assert.match(sal, /^[0-9a-f]{64}$/);
  assert.equal((await db.query(`select vagas_interno.ajuste('sal_privado') v`)).rows[0].v, '', 'o sal não sai pelo ajuste()');
});

test('A1: o banco aceita só e-mail de ASCII visível (o mesmo que a Function e a tela aceitam)', async () => {
  exigirBanco();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'fila-go', nome: 'Fila', uf: 'GO', status: 'lista_espera' }));
  for (const [i, e] of ESQUISITOS.entries()) {
    erro(await anonIp(40 + i)('vagas_lista_espera_entrar', { cidade: 'fila-go', email: e }), 'E-mail inválido.');
  }
  const email = async (e) => (await db.query(`select vagas_interno.email($1) e`, [e])).rows[0].e;
  assert.equal(await email('  Ana.Souza+vagas@Exemplo.COM.br\t'), 'ana.souza+vagas@exemplo.com.br');
  for (const e of ['a b@ex.com', 'a@b@ex.com', 'ana@exemplo', '@ex.com', 'x'.repeat(250) + '@e.co']) assert.equal(await email(e), '', e);
  // O JS da Function e da tela concorda com o banco nos mesmos casos.
  const R = require('../../vagas/js/regras.js');
  for (const e of ESQUISITOS.concat(['a b@ex.com', 'ana@exemplo'])) assert.equal(R.normalizarEmail(e), '', e);
  assert.equal(R.normalizarEmail('  Ana.Souza+vagas@Exemplo.COM.br\t'), 'ana.souza+vagas@exemplo.com.br');
});

test('A1: e-mail recusado pela Function não volta; falha passageira vai para o FIM da fila e para na 3ª; WhatsApp continua', async () => {
  exigirBanco();
  await zerarTeto();
  for (const [i, e] of ['f1@exemplo.com', 'f2@exemplo.com', 'f3@exemplo.com', 'f4@exemplo.com'].entries()) {
    ok(await anonIp(50 + i)('vagas_lista_espera_entrar', { cidade: 'fila-go', email: e, whatsapp: e === 'f3@exemplo.com' ? '62 99111-0053' : '' }));
  }
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'fila-go', status: 'ativa' }));
  const l1 = ok(await lote(S.admin, 'fila-go', 3)).lote;
  assert.deepEqual(l1.map((x) => x.email), ['f1@exemplo.com', 'f2@exemplo.com', 'f3@exemplo.com']);
  const id = Object.fromEntries(l1.map((x) => [x.email, x.id]));
  const m = ok(await marcar(S.admin, 'fila-go', [id['f1@exemplo.com']], [id['f2@exemplo.com']], [id['f3@exemplo.com']]));
  assert.deepEqual([m.enviados, m.falhas, m.invalidos], [1, 1, 1]);
  assert.deepEqual(m.contagens, { naLista: 3, aAvisarEmail: 2, avisadosEmail: 0, emEnvio: 0, semEmail: 1, aAvisarWhatsapp: 1 });
  assert.deepEqual((await linhas('fila-go')).map((x) => [x.email, x.reservado, x.tentativas]),
    [['f2@exemplo.com', false, 1], ['f3@exemplo.com', true, 99], ['f4@exemplo.com', false, 0]], 'f1 recebeu e saiu; f3 (recusado) só espera o WhatsApp');
  // Marcar de novo não conta duas vezes.
  const m2 = ok(await marcar(S.admin, 'fila-go', [id['f1@exemplo.com']], [id['f2@exemplo.com']], [id['f3@exemplo.com']]));
  assert.deepEqual([m2.enviados, m2.falhas, m2.invalidos], [0, 0, 0]);
  // Quem falhou vai para o fim: f4 (nunca tentou) vem antes de f2.
  assert.deepEqual(ok(await lote(S.admin, 'fila-go', 1)).lote.map((x) => x.email), ['f4@exemplo.com']);
  // f2 falha mais duas vezes e sai da fila do e-mail (a versão de 4 parâmetros, da Function antiga, ainda funciona).
  for (let n = 0; n < 2; n++) {
    const l = ok(await lote(S.admin, 'fila-go', 5)).lote;
    assert.deepEqual(l.map((x) => x.email), ['f2@exemplo.com']);
    ok(await marcar(S.admin, 'fila-go', [], [l[0].id]));
  }
  assert.deepEqual(ok(await lote(S.admin, 'fila-go', 5)).lote, [], 'na 3ª falha desistimos do e-mail: sem laço');
  const r = ok(await de(S.admin)('vagas_adm_aviso_resumo', 'fila-go'));
  assert.deepEqual([r.contagens.aAvisarEmail, r.contagens.semEmail, r.contagens.emEnvio], [0, 2, 1]);
  // O e-mail recusado com WhatsApp: a fila do WhatsApp mostra; o "feito" tira a linha.
  const fila = ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'fila-go'));
  assert.equal(fila.contato.whatsapp, '5562991110053');
  ok(await de(S.admin)('vagas_adm_aviso_whatsapp_feito', fila.contato.id));
  assert.deepEqual((await linhas('fila-go')).map((x) => x.email), ['f2@exemplo.com', 'f4@exemplo.com']);
});

test('A2: teto de e-mails do aviso em 24 h (todas as cidades), configurável; o resumo mostra o que cabe e em quantos dias termina', async () => {
  exigirBanco();
  await zerarTeto();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'teto-go', nome: 'Teto', uf: 'GO', status: 'lista_espera' }));
  for (let i = 0; i < 12; i++) ok(await anonIp(60 + i)('vagas_lista_espera_entrar', { cidade: 'teto-go', email: 't' + i + '@exemplo.com' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'teto-go', status: 'ativa' }));
  const resumo = async () => ok(await de(S.admin)('vagas_adm_aviso_resumo', 'teto-go')).teto;
  assert.deepEqual(await resumo(), { porDia: 60, usados24h: 0, disponivel: 60, diasPrevistos: 1 }, 'padrão: 60 por dia');
  await ajustar('aviso_teto_diario', '5');
  assert.deepEqual(await resumo(), { porDia: 5, usados24h: 0, disponivel: 5, diasPrevistos: 3 });
  const l1 = ok(await lote(S.admin, 'teto-go', 50));
  assert.equal(l1.lote.length, 5);
  assert.deepEqual(l1.teto, { porDia: 5, usados24h: 5, disponivel: 0, diasPrevistos: 2 });
  const l2 = ok(await lote(S.admin, 'teto-go', 50));
  assert.deepEqual(l2.lote, [], 'acabou a cota de 24 h');
  // A cota é de todas as cidades: a fila-go também não manda.
  assert.deepEqual(ok(await lote(S.admin, 'fila-go', 50)).lote, []);
  // Falha não devolve a cota (conservador): o e-mail pode ter saído.
  ok(await marcar(S.admin, 'teto-go', [], l1.lote.map((x) => x.id), []));
  assert.equal((await resumo()).disponivel, 0);
  // 24 h depois, cabe de novo.
  await db.query(`update public.vagas_limites set em = now() - interval '25 hours' where tipo = 'aviso_email'`);
  assert.equal(ok(await lote(S.admin, 'teto-go', 50)).lote.length, 5);
  // Ajuste inválido volta ao padrão; 0 para tudo (sem previsão).
  await zerarTeto();
  await ajustar('aviso_teto_diario', 'muitos');
  assert.equal((await resumo()).porDia, 60);
  await ajustar('aviso_teto_diario', '0');
  assert.deepEqual(await resumo(), { porDia: 0, usados24h: 0, disponivel: 0, diasPrevistos: null });
  assert.deepEqual(ok(await lote(S.admin, 'teto-go', 50)).lote, []);
  await db.query(`delete from vagas_interno.ajustes where chave = 'aviso_teto_diario'`);
  await zerarTeto();
});

test('A4: lote interrompido (sem confirmação de envio) volta para a fila UMA vez depois de 1 h; envio confirmado nunca volta', async () => {
  exigirBanco();
  await zerarTeto();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'corte-go', nome: 'Corte', uf: 'GO', status: 'lista_espera' }));
  ok(await anonIp(80)('vagas_lista_espera_entrar', { cidade: 'corte-go', email: 'c1@exemplo.com' }));
  ok(await anonIp(81)('vagas_lista_espera_entrar', { cidade: 'corte-go', email: 'c2@exemplo.com', whatsapp: '62 99111-0081' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'corte-go', status: 'ativa' }));
  const l = ok(await lote(S.admin, 'corte-go', 5)).lote;
  const id = Object.fromEntries(l.map((x) => [x.email, x.id]));
  ok(await marcar(S.admin, 'corte-go', [id['c2@exemplo.com']], [], []));   // c2 recebeu (espera o WhatsApp); c1 ficou sem confirmação
  const velho = () => db.query(`update public.vagas_lista_espera set avisado_em = now() - interval '2 hours' where cidade_id = (select id from public.vagas_cidades where slug = 'corte-go')`);
  await velho();
  assert.deepEqual(ok(await lote(S.admin, 'corte-go', 5)).lote.map((x) => x.email), ['c1@exemplo.com'], 'c1 volta uma vez; c2 não');
  await velho();
  assert.deepEqual(ok(await lote(S.admin, 'corte-go', 5)).lote, [], 'a segunda interrupção não devolve (no máximo dois e-mails)');
  assert.deepEqual((await linhas('corte-go')).map((x) => [x.email, x.reservado, x.enviado, x.tentativas, x.devolvido]),
    [['c1@exemplo.com', true, false, 1, true], ['c2@exemplo.com', true, true, 0, false]]);
  assert.deepEqual(ok(await de(S.admin)('vagas_adm_aviso_resumo', 'corte-go')).contagens,
    { naLista: 2, aAvisarEmail: 0, avisadosEmail: 1, emEnvio: 1, semEmail: 0, aAvisarWhatsapp: 1 });
});

test('A5: a marca de 24 h do N2 usa o hash com o sal desta instalação (não dá para testar uma lista de e-mails conhecidos)', async () => {
  exigirBanco();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'sal-go', nome: 'Sal', uf: 'GO', status: 'lista_espera' }));
  ok(await anonIp(90)('vagas_lista_espera_entrar', { cidade: 'sal-go', email: 'ana-sal@exemplo.com', whatsapp: '62 99111-0090' }));
  ok(await anonIp(91)('vagas_lista_espera_sair', { cidade: 'sal-go', email: 'ana-sal@exemplo.com' }));
  ok(await anonIp(91)('vagas_lista_espera_entrar', { cidade: 'sal-go', email: 'ana-sal@exemplo.com', whatsapp: '62 98222-0091' }));
  assert.equal((await db.query(`select whatsapp from public.vagas_lista_espera where email = 'ana-sal@exemplo.com'`)).rows[0].whatsapp, '', 'o N2 continua valendo');
  const idCid = (await db.query(`select id from public.vagas_cidades where slug = 'sal-go'`)).rows[0].id;
  const chave = (await db.query(`select chave from public.vagas_limites where tipo = 'lista_saiu' and chave like $1`, [idCid + ':%'])).rows[0].chave;
  assert.match(chave, new RegExp('^' + idCid + ':h:[0-9a-f]{64}$'));
  const semSal = crypto.createHash('sha256').update('ana-sal@exemplo.com').digest('hex');
  assert.ok(!chave.includes(semSal), 'não é o sha256 puro do e-mail');
});

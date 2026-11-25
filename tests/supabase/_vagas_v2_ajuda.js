'use strict';
// Preparo comum dos testes do banco da Vagas sem Caos v2 (tests/supabase/vagas_v2*.test.js): Postgres 17 EMBUTIDO com o preparo
// "tipo Supabase", TODAS as migrações em sequência (inclusive as vagas_v2_*), cidades de teste, e atalhos para chamar as RPCs como
// anon, como pessoa/empresa logada ou como a função de servidor. Não é um teste: o nome começa com "_".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'supabase', 'migrations');
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
const CONTRATO = require('../../vagas/js/v2/contrato.js');

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

const TODAS = fs.readdirSync(PASTA).filter((a) => a.endsWith('.sql')).sort().map((a) => a.replace(/\.sql$/, ''));
const V2 = TODAS.filter((n) => n.startsWith('20261101'));
const ler = (n) => fs.readFileSync(path.join(PASTA, n + '.sql'), 'utf8');

const js = (a) => (a !== null && typeof a === 'object' && !Array.isArray(a) ? JSON.stringify(a) : a);

async function iniciar(rotulo, opcoes) {
  const o = opcoes || {};
  const M = await import('../../scripts/montar-testes.mjs');
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const dir = path.join(os.tmpdir(), 'disc-pg-vagas-v2-' + rotulo + '-' + crypto.randomBytes(6).toString('hex'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password: 'postgres', port: 63000 + Math.floor(Math.random() * 800),
    persistent: false, createPostgresUser: true, initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, onError: () => {}
  });
  await pg.initialise();
  await pg.start();
  const db = pg.getPgClient();
  await db.connect();
  await db.query(PREPARO_SUPABASE);
  const antes = o.ate ? TODAS.slice(0, TODAS.indexOf(o.ate)) : TODAS;
  for (const n of antes) await db.query(ler(n));
  if (!o.semFixture) {
    const lido = M.lerConteudo(FIXTURE);
    assert.deepEqual(lido.erros, []);
    await db.query(M.gerarSql(lido.dados));
  }

  async function como(papel, uid, sql, params, opcoesCall) {
    const oc = opcoesCall || {};
    await db.query('begin');
    try {
      await db.query(`set local role ${papel}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
      if (oc.cabecalhos) await db.query("select set_config('request.headers', $1, true)", [JSON.stringify(oc.cabecalhos)]);
      const r = await db.query(sql, params);
      await db.query('commit');
      return r;
    } catch (err) {
      await db.query('rollback');
      throw err;
    }
  }
  async function rpcComo(papel, uid, fn, args, opcoesCall) {
    const lista = args || [];
    const marcas = lista.map((_, i) => '$' + (i + 1)).join(', ');
    return (await como(papel, uid, `select public.${fn}(${marcas}) as r`, lista.map(js), opcoesCall)).rows[0].r;
  }
  const A = {
    db, pg, como, rpcComo, CONTRATO, M,
    anon: (fn, ...args) => rpcComo('anon', null, fn, args),
    de: (uid) => (fn, ...args) => rpcComo('authenticated', uid, fn, args),
    servico: (fn, ...args) => rpcComo('service_role', null, fn, args),
    async encerrar() {
      try { await db.end(); } catch (e) { /* ignora */ }
      try { await pg.stop(); } catch (e) { /* ignora */ }
    }
  };
  // v2: chama vagas_v2_<metodo> com {p_dados}; devolve a resposta (jsonb já vem como objeto)
  A.v2 = (uid) => (metodo, dados) => rpcComo(uid ? 'authenticated' : 'anon', uid, CONTRATO.METODOS[metodo].rpc, [dados || {}]);
  A.v2anon = (metodo, dados) => rpcComo('anon', null, CONTRATO.METODOS[metodo].rpc, [dados || {}]);
  // chama e confere a forma do contrato (validar()) quando a resposta é ok
  A.v2ok = (uid) => async (metodo, dados) => {
    const r = await A.v2(uid)(metodo, dados);
    assert.equal(r.ok, true, metodo + ': ' + JSON.stringify(r));
    assert.deepEqual(CONTRATO.validar(metodo, r), [], metodo + ': ' + JSON.stringify(r).slice(0, 400));
    return r;
  };
  return A;
}

function erro(r, codigo) {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(typeof r.erro, 'string');
  if (codigo) assert.equal(r.codigo, codigo, JSON.stringify(r));
  return r;
}
function ok(r) { assert.equal(r.ok, true, JSON.stringify(r)); return r; }
async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}

function cnpjCom(base12) {
  const val = (c) => c.charCodeAt(0) - 48;
  const dv = (t, pesos) => { const r = t.split('').reduce((a, c, i) => a + val(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}

let seq = 0;
async function usuarioAuth(A, email, nome) {
  const id = crypto.randomUUID();
  await A.db.query(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
    [id, email, JSON.stringify(nome ? { nome } : {})]);
  return id;
}
// Conta criada como o login por código cria (função de servidor).
async function conta(A, tipo, email) {
  seq += 1;
  const id = await usuarioAuth(A, email || (tipo + seq + '@v2.teste'));
  ok(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo, termosVersao: '2026-11' }));
  return id;
}

// Cenário comum: admin da casa, cidade ativa (com 2 zonas), cidade vizinha da mesma praça, cidade em pré-abertura e uma cidade de outra praça.
async function cenario(A) {
  const S = {};
  S.admin = await usuarioAuth(A, 'dono@v2.teste');
  await A.db.query(`insert into public.admins (user_id, nome) values ($1, 'Dono')`, [S.admin]);
  const adm = A.de(S.admin);
  ok(await adm('vagas_adm_cidade_salvar', { slug: 'fc-go', nome: 'Fase Cidade', uf: 'GO', status: 'ativa', porte: 'pequena' }));
  ok(await adm('vagas_adm_cidade_salvar', { slug: 'vz-go', nome: 'Vizinha', uf: 'GO', status: 'ativa', porte: 'pequena', praca: 'fc-go' }));
  ok(await adm('vagas_adm_cidade_salvar', { slug: 'pre-go', nome: 'Pré Abertura', uf: 'GO', status: 'lista_espera', porte: 'pequena', praca: 'fc-go' }));
  ok(await adm('vagas_adm_cidade_salvar', { slug: 'out-mt', nome: 'Outra Praça', uf: 'MT', status: 'ativa', porte: 'pequena' }));
  ok(await adm('vagas_adm_zona_salvar', { cidade: 'fc-go', slug: 'centro', nome: 'Centro', bairros: ['Centro', 'Setor Sul'] }));
  ok(await adm('vagas_adm_zona_salvar', { cidade: 'fc-go', slug: 'norte', nome: 'Norte', bairros: ['Setor Norte'] }));
  S.operador = await usuarioAuth(A, 'operadora@v2.teste');
  ok(await A.servico('vagas_conta_registrar', S.operador, { tipo: 'operador', termosVersao: '2026-11', operador: { cidade: 'fc-go', papel: 'operador' } }));
  S.moderador = await usuarioAuth(A, 'moderadora@v2.teste');
  ok(await A.servico('vagas_conta_registrar', S.moderador, { tipo: 'operador', termosVersao: '2026-11', operador: { cidade: 'fc-go', papel: 'moderador' } }));
  return S;
}

const COM = (extra) => Object.assign({
  titulo: 'Atendente de loja', setorId: 'comercio', tipo: 'CLT', turno: 'Comercial', horario: 'Segunda a sexta, das 8h às 18h',
  salario: { min: 1700, max: 2600, periodo: 'mes' }, beneficios: ['Vale-transporte'], requisitos: ['Gostar de atender o público'], diferenciais: [],
  descricao: 'Atendimento no balcão, organização de prateleiras e apoio no caixa. Folga no domingo e treinamento no primeiro mês.',
  atividades: ['Atender os clientes'], perguntas: [], vagasQtd: 1, semExperiencia: true, cidade: 'fc-go', bairro: 'Centro'
}, extra || {});

// Empresa criada como o servidor cria (em verificação, 7 dias). Devolve {uid, id}.
async function empresaEmVerificacao(A, base12, extra) {
  const uid = await conta(A, 'empresa');
  const r = ok(await A.servico('vagas_v2_empresa_criar_servidor', uid, Object.assign({
    cnpj: cnpjCom(base12), cidade: 'fc-go', bairro: 'Centro', setor: 'comercio', responsavel: 'Maria da Silva', whatsapp: '62 3' + String(1000000 + (seq += 1) * 7).slice(0, 3) + '-' + String(1000 + seq).slice(-4),
    consulta: { situacao: 'ATIVA', razaoSocial: 'Comércio Boa Compra Ltda', nomeFantasia: 'Loja Boa Compra', cidade: 'Fase Cidade', uf: 'GO', abertura: '2015-03-10', mei: false }
  }, extra || {})));
  return { uid, id: r.empresa.id };
}
// Empresa verificada (a equipe verifica).
async function empresaVerificada(A, S, base12, extra) {
  const e = await empresaEmVerificacao(A, base12, extra);
  ok(await A.v2(S.operador)('opRevisarDecidir', { id: e.id, acao: 'verificar_empresa' }));
  return e;
}
async function pessoa(A, nome, whatsapp, cidade) {
  const uid = await conta(A, 'pessoa');
  ok(await A.v2(uid)('perfilSalvar', { nome: nome || 'Ana Souza', whatsapp: whatsapp || '62991234567', email: 'p' + seq + '@pessoa.teste', cidade: cidade || 'fc-go', bairro: 'Centro' }));
  return uid;
}

module.exports = { iniciar, erro, ok, rejeita, cnpjCom, usuarioAuth, conta, cenario, COM, empresaEmVerificacao, empresaVerificada, pessoa, CONTRATO, TODAS, V2, ler, RAIZ };

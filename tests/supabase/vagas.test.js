'use strict';
// Testes da migração 20261022120000_vagas.sql (Vagas sem Caos: fundação) num Postgres 17 EMBUTIDO, com TODAS as migrações
// aplicadas em sequência (inclusive a cópia 20261013052756_propostas_rastreio) sobre dados "de produção" do DISC, e esta
// aplicada duas vezes. Mesmo preparo "tipo Supabase" dos outros testes, com auth.users completo (app_metadata e e-mail
// confirmado). Cobre: versao_banco, garantir_primeiro_admin (conta do Vagas nunca vira admin), RLS e permissões (guardas
// automáticos), privacidade (cartão cego, contato só depois do Combinou, operador e equipe sem acesso à pessoa, campos
// proibidos que não existem), filtro de textos (igual ao JS de vagas/js/regras.js), regras do anúncio (salário, diária,
// confidencial, revisão das 3 primeiras, 3 denúncias), fluxo Quero → conversa → ver empresa → Combinou → contratada,
// referência profissional, limites por origem e as funções só da Edge Function.
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
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n + '.sql'), 'utf8');
const ANTERIORES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013052756_propostas_rastreio', '20261013120000_conexoes', '20261014120000_stripe',
  '20261015120000_minimo_cobranca', '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao',
  '20261019120000_versao_tecnica', '20261020120000_codigos_processo', '20261021120000_feedback360'];
const ESTA = '20261022120000_vagas';
const NA_VERSAO = ANTERIORES.filter((n) => n !== '20261013052756_propostas_rastreio').concat([ESTA]);

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
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-' + crypto.randomBytes(6).toString('hex'));
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
const de = (uid) => (fn, ...args) => rpcComo('authenticated', uid, fn, args);
const servico = (fn, ...args) => rpcComo('service_role', null, fn, args);
const ip = (n) => ({ cabecalhos: { 'x-forwarded-for': '203.0.113.' + n, 'user-agent': 'teste' } });

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}
function erro(r, padrao) {
  assert.equal(r.ok, false, JSON.stringify(r));
  if (padrao instanceof RegExp) assert.match(r.erro, padrao); else assert.equal(r.erro, padrao);
}
function ok(r) { assert.equal(r.ok, true, r && r.erro); return r; }

// Usuários do Auth (como a Edge Function cria) + conta do Vagas registrada pela função de serviço.
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
  const email = o.email || (tipo + seq + '@vagas.teste');
  const id = await usuarioAuth(email, { app: { produto: 'vagas', tipo }, confirmado: o.confirmado, meta: o.meta });
  ok(await servico('vagas_conta_registrar', id, Object.assign({ tipo, termosVersao: '2026-10' }, o.dados || {})));
  return id;
}

// Hoje em Boa Vista (AAAA-MM-DD) e daqui a n dias.
async function hojeBV(n) {
  return (await db.query(`select to_char(vagas_interno.hoje('America/Boa_Vista') + $1::int, 'YYYY-MM-DD') as d`, [n || 0])).rows[0].d;
}
const mesAtual = () => new Date().toISOString().slice(0, 7);

// CNPJ válido a partir de 12 caracteres (mesma conta do banco e de VAGAS_REGRAS).
function cnpjCom(base12) {
  const val = (c) => c.charCodeAt(0) - 48;
  const dv = (s, pesos) => { const r = s.split('').reduce((a, c, i) => a + val(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}

function pessoaDados(extra) {
  return Object.assign({
    cidade: 'boa-vista-rr', zona: 'zona-oeste', maior18: true, cargos: ['Atendente', 'Caixa'], escolaridade: 'medio',
    turnos: ['manha', 'tarde'], cnh: ['B'], modalidades: ['clt', 'diaria'], pretensaoCentavos: 180000, cursos: ['Atendimento ao cliente (Senac)'],
    sobre: 'Gosto de atender bem e aprendo rápido.', nome: 'Maria Fernanda Souza', whatsapp: '(95) 99123-4567',
    experiencias: [{ funcao: 'Atendente', empregador: 'Loja Antiga Ltda', inicio: '2024-01', fim: '2025-06' },
      { funcao: 'Caixa', empregador: 'Mercadinho do Bairro', inicio: '2025-07', fim: '' }]
  }, extra || {});
}

function anuncioDados(empresaId, extra) {
  return Object.assign({
    empresaId, area: 'atendimento', funcao: 'Atendente de loja', modalidade: 'clt',
    descricao: 'Atendimento no balcão, organização de prateleiras e apoio no caixa. Escala 6x1 com folga no domingo.',
    turno: 'comercial', experiencia: 'nao_precisa', escolaridade: 'medio', requisitos: ['disponibilidade'], beneficios: ['vt', 'refeicao'],
    quantidade: 2, salarioDe: 162100, salarioAte: 190000, cidade: 'boa-vista-rr', zona: 'centro-leste'
  }, extra || {});
}

const S = {};   // estado compartilhado entre os testes (em ordem)

test('migrações em sequência (inclusive a cópia das propostas) e esta duas vezes: DISC intacto, versão nova', async () => {
  exigirBanco();
  for (const n of ANTERIORES) await db.query(ler(n));
  // Dados "de produção" do DISC.
  S.adminDisc = await usuarioAuth('dono@gestaosemcaos.teste');
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Dono')`, [S.adminDisc]);
  await db.query(`insert into public.empresas (nome) values ('Clínica Antiga')`);
  await db.query(`insert into public.processos (nome, empresa) values ('Recepção 2026', 'Clínica Antiga')`);
  const antes = (await db.query(`select (select count(*) from public.processos) p, (select count(*) from public.empresas) e,
    (select count(*) from public.admins) a`)).rows[0];
  const anonAntes = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not like 'vagas\\_%' order by 1`)).rows;
  assert.equal((await anon('versao_banco')).versao, 20261021120000);

  await db.query(ler(ESTA));
  await db.query(ler(ESTA));
  assert.deepEqual(await anon('versao_banco'), { ok: true, versao: 20261022120000, migracoes: NA_VERSAO, faltando: [] });
  const depois = (await db.query(`select (select count(*) from public.processos) p, (select count(*) from public.empresas) e,
    (select count(*) from public.admins) a`)).rows[0];
  assert.deepEqual(depois, antes);
  const anonDepois = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not like 'vagas\\_%' order by 1`)).rows;
  assert.deepEqual(anonDepois, anonAntes, 'o anon do DISC executa exatamente as mesmas funções');
  // A anterior de novo e esta em seguida: tudo de pé.
  await db.query(ler('20261021120000_feedback360'));
  assert.deepEqual((await anon('versao_banco')).faltando, []);
  await db.query(ler(ESTA));
  assert.equal((await anon('versao_banco')).versao, 20261022120000);
  // Sem as tabelas do Vagas, ela "falta".
  await db.query(`alter table public.vagas_anuncios rename to vagas_anuncios_x`);
  assert.deepEqual((await anon('versao_banco')).faltando, [ESTA]);
  await db.query(`alter table public.vagas_anuncios_x rename to vagas_anuncios`);
});

test('garantir_primeiro_admin NUNCA promove conta do Vagas (app_metadata ou vagas_contas), nem como a primeira', async () => {
  exigirBanco();
  // Banco sem nenhum administrador (o cenário mais perigoso).
  await db.query(`set session_replication_role = replica; delete from public.admins; set session_replication_role = origin;`);
  const pelaMarca = await usuarioAuth('so-app-metadata@vagas.teste', { app: { produto: 'vagas', tipo: 'pessoa' } });
  assert.deepEqual(await de(pelaMarca)('garantir_primeiro_admin'), { ok: true, admin: false });
  const pelaConta = await usuarioAuth('so-conta@vagas.teste');   // sem app_metadata, mas com linha em vagas_contas
  ok(await servico('vagas_conta_registrar', pelaConta, { tipo: 'empresa' }));
  assert.deepEqual(await de(pelaConta)('garantir_primeiro_admin'), { ok: true, admin: false });
  const operador = await contaVagas('operador');
  assert.deepEqual(await de(operador)('garantir_primeiro_admin'), { ok: true, admin: false });
  assert.equal((await db.query(`select count(*)::int as n from public.admins`)).rows[0].n, 0, 'ninguém do Vagas virou admin');
  // Usuário do painel (sem marca do Vagas) continua virando o primeiro admin.
  assert.deepEqual(await de(S.adminDisc)('garantir_primeiro_admin'), { ok: true, admin: true, primeiro: true });
  assert.deepEqual(await de(pelaMarca)('garantir_primeiro_admin'), { ok: true, admin: false });
});

test('guardas: RLS em todas as tabelas vagas_*, nenhuma política "true", nada de escrita direta, funções internas fechadas', async () => {
  exigirBanco();
  const tabelas = (await db.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'vagas\\_%' order by 1`)).rows;
  assert.ok(tabelas.length >= 22, 'tabelas do Vagas');
  for (const t of tabelas) assert.equal(t.relrowsecurity, true, t.relname + ' sem RLS');
  for (const nome of ['vagas_cidades', 'vagas_zonas', 'vagas_contas', 'vagas_pessoas', 'vagas_pessoa_contato', 'vagas_experiencias',
    'vagas_empresas', 'vagas_empresa_membros', 'vagas_anuncios', 'vagas_candidaturas', 'vagas_conversas', 'vagas_mensagens',
    'vagas_denuncias', 'vagas_moderacao', 'vagas_operadores', 'vagas_lista_espera', 'vagas_acessos_contato', 'vagas_referencias',
    'vagas_referencia_convites']) {
    assert.ok(tabelas.some((t) => t.relname === nome), 'falta a tabela ' + nome);
  }
  const politicas = (await db.query(`select tablename, policyname, qual, cmd, roles from pg_policies
    where schemaname = 'public' and tablename like 'vagas\\_%'`)).rows;
  for (const p of politicas) {
    assert.notEqual(String(p.qual).trim(), 'true', p.policyname);
    assert.equal(p.cmd, 'SELECT', p.policyname + ': só políticas de leitura');
    if (String(p.roles).includes('authenticated')) {
      assert.match(String(p.qual), /auth\.uid\(\)|e_admin\(\)|vagas_ids_minhas_|status|ativa/, p.policyname);
    }
  }
  // Nenhum privilégio de escrita para anon/authenticated em tabela do Vagas.
  const escrita = (await db.query(`select c.relname, r.papel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(papel)
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'vagas\\_%'
      and (has_table_privilege(r.papel, c.oid, 'INSERT') or has_table_privilege(r.papel, c.oid, 'UPDATE')
           or has_table_privilege(r.papel, c.oid, 'DELETE') or has_table_privilege(r.papel, c.oid, 'TRUNCATE'))`)).rows;
  assert.deepEqual(escrita, []);
  // anon lê só cidades e zonas; tabelas sensíveis sem leitura direta nem para authenticated.
  const leituraAnon = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'vagas\\_%' and has_table_privilege('anon', c.oid, 'SELECT') order by 1`)).rows
    .map((x) => x.relname);
  assert.deepEqual(leituraAnon, ['vagas_areas', 'vagas_cidades', 'vagas_zonas']);
  for (const t of ['vagas_candidaturas', 'vagas_conversas', 'vagas_mensagens', 'vagas_lista_espera', 'vagas_limites', 'vagas_referencias',
    'vagas_referencia_convites', 'vagas_referencia_historico', 'vagas_anuncio_vistas']) {
    assert.equal((await db.query(`select has_table_privilege('authenticated', 'public.${t}', 'SELECT') as x`)).rows[0].x, false, t);
  }
  // anon executa exatamente as funções públicas do Vagas; as de serviço só a service_role; internas fechadas.
  const anonVagas = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'vagas\\_%' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows
    .map((x) => x.proname);
  assert.deepEqual(anonVagas, ['vagas_anuncio_publico', 'vagas_anuncio_vista', 'vagas_anuncios_publicos', 'vagas_areas_publicas',
    'vagas_cidades_publicas', 'vagas_denunciar', 'vagas_lista_espera_entrar', 'vagas_lista_espera_sair', 'vagas_referencias_publicas']);
  for (const fn of ['vagas_conta_limite', 'vagas_conta_consultar', 'vagas_conta_registrar', 'vagas_conta_quem', 'vagas_conta_foto']) {
    const r = (await db.query(`select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) a, bool_or(has_function_privilege('anon', p.oid, 'execute')) b,
      bool_and(has_function_privilege('service_role', p.oid, 'execute')) s from pg_proc p where p.proname = $1`, [fn])).rows[0];
    assert.deepEqual(r, { a: false, b: false, s: true }, fn);
  }
  const internas = (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vagas_interno' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n;
  assert.equal(internas, 0);
  assert.equal((await db.query(`select has_schema_privilege('authenticated', 'vagas_interno', 'USAGE') a, has_schema_privilege('anon', 'vagas_interno', 'USAGE') b`)).rows[0].a, false);
  // Toda função SECURITY DEFINER do Vagas fixa o search_path.
  const semPath = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or p.proname like 'vagas\\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).rows;
  assert.deepEqual(semPath, []);
  // Escrita direta recusada pelo banco (mesmo tentando).
  await rejeita(como('anon', null, `insert into public.vagas_lista_espera (cidade_id, email) select id, 'x@y.com' from public.vagas_cidades limit 1`), /permission denied/);
});

test('campos proibidos NÃO EXISTEM em nenhuma tabela do Vagas (só "tenho 18 anos ou mais")', async () => {
  exigirBanco();
  const colunas = (await db.query(`select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name like 'vagas\\_%'`)).rows;
  const PROIBIDOS = ['idade', 'nasc', 'genero', 'sexo', 'civil', 'filho', 'gravid', 'gestante', 'cor', 'raca', 'etnia', 'religi', 'foto', 'imagem',
    'nacional', 'naturalidade', 'saude', 'doenc', 'deficien', 'pcd', 'antecedente', 'criminal', 'cpf', 'rg'];
  for (const c of colunas) {
    const partes = c.column_name.split('_');
    assert.ok(!partes.some((t) => PROIBIDOS.some((p) => t === p || (p.length > 3 && t.startsWith(p)))), c.table_name + '.' + c.column_name);
  }
  assert.ok(colunas.some((c) => c.table_name === 'vagas_pessoas' && c.column_name === 'maior_18'));
});

test('cidades e zonas: Boa Vista ativa com zonas, Mucajaí e Cantá no entorno, Rorainópolis em lista de espera', async () => {
  exigirBanco();
  const r = ok(await anon('vagas_cidades_publicas'));
  const porSlug = Object.fromEntries(r.cidades.map((c) => [c.slug, c]));
  assert.deepEqual(r.cidades.map((c) => c.slug), ['boa-vista-rr', 'mucajai-rr', 'canta-rr', 'rorainopolis-rr']);
  assert.equal(porSlug['boa-vista-rr'].status, 'ativa');
  assert.deepEqual(porSlug['boa-vista-rr'].zonas.map((z) => z.slug), ['centro-leste', 'zona-norte', 'zona-sul', 'zona-oeste']);
  assert.ok(porSlug['boa-vista-rr'].zonas.find((z) => z.slug === 'zona-oeste').bairros.includes('Pintolândia'));
  assert.equal(porSlug['mucajai-rr'].praca, 'boa-vista-rr');
  assert.equal(porSlug['canta-rr'].praca, 'boa-vista-rr');
  assert.equal(porSlug['rorainopolis-rr'].status, 'lista_espera');
  assert.equal(porSlug['rorainopolis-rr'].interessados, 0);
  assert.equal(porSlug['boa-vista-rr'].interessados, null);
  // Leitura direta do anon: as mesmas, nunca rascunho/pausada.
  await db.query(`insert into public.vagas_cidades (slug, nome, uf, status) values ('caracarai-rr', 'Caracaraí', 'RR', 'rascunho')`);
  const diretas = (await como('anon', null, `select slug from public.vagas_cidades order by ordem, nome`)).rows.map((x) => x.slug);
  assert.ok(!diretas.includes('caracarai-rr'));
  assert.equal((await anon('vagas_cidades_publicas')).cidades.length, 4);
  // Lista de espera: só cidade em lista de espera, e-mail válido, sem repetir, limite por origem.
  erro(await anon('vagas_lista_espera_entrar', { cidade: 'boa-vista-rr', email: 'a@b.com' }), 'Esta cidade já está aberta: faça o seu cadastro.');
  erro(await anon('vagas_lista_espera_entrar', { cidade: 'caracarai-rr', email: 'a@b.com' }), 'Cidade não encontrada.');
  erro(await anon('vagas_lista_espera_entrar', { cidade: 'rorainopolis-rr', email: 'invalido' }), 'E-mail inválido.');
  const um = await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'Pessoa@Exemplo.com ', perfil: 'pessoa' }], ip(10));
  // "interessados" é aproximado (dezenas, até o dia anterior): quem entrou hoje não aparece, e repetir o e-mail não muda nada.
  assert.deepEqual(um, { ok: true, cidade: 'rorainopolis-rr', interessados: 0 });
  assert.equal((await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'pessoa@exemplo.com' }], ip(10))).interessados, 0);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_lista_espera where email = 'pessoa@exemplo.com'`)).rows[0].n, 1, 'repetir não duplica');
  for (let i = 0; i < 8; i++) await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'p' + i + '@exemplo.com' }], ip(10));
  erro(await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'z@exemplo.com' }], ip(10)),
    'Muitas tentativas. Tente de novo mais tarde.');
  assert.equal((await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'z@exemplo.com' }], ip(11))).ok, true);
  // Mural da cidade em lista de espera ou pausada.
  const espera = await anon('vagas_anuncios_publicos', { cidade: 'rorainopolis-rr' });
  erro(espera, 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  assert.equal(espera.listaEspera, true);
  erro(await anon('vagas_anuncios_publicos', { cidade: 'nao-existe-rr' }), 'Cidade não encontrada.');
});

test('contas: e-mail não confirmado não age; confirmada vira ativa; tipo certo para cada área', async () => {
  exigirBanco();
  const pendente = await contaVagas('pessoa', { confirmado: false });
  const r = await de(pendente)('vagas_eu');
  erro(r, 'Confirme seu e-mail pelo link que enviamos antes de continuar.');
  assert.equal(r.confirmar, true);
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [pendente]);
  const eu = ok(await de(pendente)('vagas_eu'));
  assert.equal(eu.conta.tipo, 'pessoa');
  assert.equal(eu.conta.status, 'ativa');
  assert.equal(eu.conta.termosVersao, '2026-10');
  assert.equal(eu.admin, false);
  assert.equal(eu.pessoa.completo, false);
  await rejeita(anon('vagas_eu'), /permission denied/);
  erro(await de(null)('vagas_eu'), 'Sessão expirada. Entre de novo.');
  const disc = ok(await de(S.adminDisc)('vagas_eu'));
  assert.equal(disc.conta, null);
  assert.equal(disc.admin, true);
  const empresa = await contaVagas('empresa');
  erro(await de(empresa)('vagas_pessoa_minha'), 'Esta área é para quem procura emprego.');
  erro(await de(pendente)('vagas_minhas_empresas'), 'Esta área é para empresas.');
  // Registrar de novo é idempotente; outro tipo para o mesmo usuário é recusado.
  ok(await servico('vagas_conta_registrar', pendente, { tipo: 'pessoa' }));
  erro(await servico('vagas_conta_registrar', pendente, { tipo: 'empresa' }), 'Este e-mail já tem uma conta de outro tipo.');
  // Aceite de termos por versão + histórico (só inclusão).
  ok(await de(pendente)('vagas_aceitar_termos', { versao: '2026-11' }));
  assert.equal((await de(pendente)('vagas_eu')).conta.termosVersao, '2026-11');
  erro(await de(pendente)('vagas_aceitar_termos', { versao: 'tem espaço' }), 'Versão dos termos inválida.');
  await rejeita(db.query(`update public.vagas_consentimentos set aceito = false where user_id = $1`, [pendente]), /só de inclusão/);
  S.pessoaSemPerfil = pendente;
});

test('pessoa: cadastro valida cidade ativa, zona, 18+, WhatsApp; chaves proibidas são ignoradas; cartão cego sem nome', async () => {
  exigirBanco();
  const p = await contaVagas('pessoa');
  const salvar = (extra) => de(p)('vagas_pessoa_salvar', pessoaDados(extra));
  erro(await salvar({ maior18: false }), 'Para se cadastrar é preciso ter 18 anos ou mais.');
  erro(await salvar({ maior18: undefined }), 'Para se cadastrar é preciso ter 18 anos ou mais.');
  erro(await salvar({ cidade: 'rorainopolis-rr' }), 'Escolha uma zona da sua cidade.');
  erro(await salvar({ cidade: 'rorainopolis-rr', zona: 'cidade-toda' }), 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  erro(await salvar({ zona: '' }), 'Escolha a zona onde você mora.');
  erro(await salvar({ zona: 'cidade-toda' }), 'Escolha uma zona da sua cidade.');
  erro(await salvar({ cidade2: 'boa-vista-rr' }), 'Escolha duas cidades diferentes.');
  erro(await salvar({ cargos: [] }), 'Escolha de 1 a 5 funções que você procura.');
  erro(await salvar({ escolaridade: 'doutorado' }), 'Escolha a sua escolaridade.');
  erro(await salvar({ turnos: ['nunca'] }), 'Marque pelo menos um turno em que pode trabalhar.');
  erro(await salvar({ modalidades: [] }), 'Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).');
  erro(await salvar({ pretensaoCentavos: -1 }), 'Pretensão salarial inválida.');
  erro(await salvar({ nome: 'Maria' }), 'Informe seu nome e sobrenome.');
  erro(await salvar({ whatsapp: '95 3224-1234' }), 'WhatsApp inválido. Use DDD + número de celular (ex.: 95 99123-4567).');
  erro(await salvar({ email: 'nao-e-email' }), 'E-mail de contato inválido.');
  erro(await salvar({ experiencias: [{ funcao: 'Caixa', inicio: '2099-01' }] }), 'O início de uma experiência não pode estar no futuro.');
  erro(await salvar({ experiencias: [{ funcao: 'Caixa', inicio: '2024-05', fim: '2024-01' }] }), 'A saída não pode ser antes do início.');
  erro(await salvar({ experiencias: [{ funcao: 'Caixa', inicio: 'maio' }] }), 'Informe o mês de início de cada experiência (AAAA-MM).');
  erro(await salvar({ cargos: ['Atendente 95 99123-4567'] }), /^Tire o telefone, e-mail ou perfil de rede social/);
  erro(await salvar({ sobre: 'Veja meu portfólio em www.meusite.com' }), /^Tire o link/);
  // Campos que NÃO existem: são ignorados (não vão para lugar nenhum).
  const r = ok(await salvar({ idade: 34, genero: 'feminino', estadoCivil: 'casada', foto: 'data:image/jpeg;base64,/9j/AAA', nacionalidade: 'venezuelana',
    filhos: 2, religiao: 'x', saude: 'x', antecedentes: 'x', cidade2: 'mucajai-rr' }));
  const tudo = JSON.stringify(await db.query(`select to_jsonb(p) || to_jsonb(c) as x from public.vagas_pessoas p join public.vagas_pessoa_contato c using (user_id) where user_id = $1`, [p]));
  for (const v of ['feminino', 'casada', '/9j/', 'venezuelana', '"idade"', '"genero"']) assert.ok(!tudo.includes(v), v);
  assert.equal(r.pessoa.whatsapp, '5595991234567');
  assert.equal(r.pessoa.email, 'pessoa' + seq + '@vagas.teste', 'sem e-mail de contato, usa o do login');
  assert.deepEqual(r.pessoa.cidade2, { slug: 'mucajai-rr', nome: 'Mucajaí' });
  // O cartão cego (como a empresa vê): sem nome, contato, "sobre", empregador, foto, idade.
  const c = r.cartao;
  assert.deepEqual(Object.keys(c).sort(), ['cargos', 'cidade', 'cnh', 'cursos', 'escolaridade', 'experienciaTotalMeses', 'experiencias',
    'modalidades', 'pretensaoCentavos', 'selos', 'temReferencia', 'turnos', 'zona']);
  const txt = JSON.stringify(c);
  for (const v of ['Maria', 'Souza', '99123', '5595', '@', 'Loja Antiga', 'Mercadinho', 'aprendo rápido']) assert.ok(!txt.includes(v), v);
  assert.deepEqual(c.zona, { slug: 'zona-oeste', nome: 'Zona Oeste' });
  assert.deepEqual(c.experiencias[0], { funcao: 'Atendente', meses: 18, atual: false, informal: false });
  assert.equal(c.experiencias[1].atual, true);
  assert.deepEqual(c.selos, []);
  assert.equal(c.temReferencia, false);
  assert.equal((await de(p)('vagas_eu')).pessoa.completo, true);
  assert.deepEqual((await de(p)('vagas_eu')).pessoa.cidades, ['boa-vista-rr', 'mucajai-rr']);
  S.pessoa = p;
});

test('privacidade: pessoa e contato só pela própria pessoa — nem empresa, nem operador, nem a equipe (admin), nem anon', async () => {
  exigirBanco();
  const empresa = await contaVagas('empresa');
  const op = await contaVagas('operador', { dados: { operador: { cidade: 'boa-vista-rr', papel: 'operador' } } });
  S.operador = op;
  for (const t of ['vagas_pessoas', 'vagas_pessoa_contato', 'vagas_experiencias']) {
    assert.equal((await como('authenticated', S.pessoa, `select count(*)::int n from public.${t}`)).rows[0].n > 0, true, t + ' (dona)');
    for (const [quem, uid] of [['empresa', empresa], ['operador', op], ['admin', S.adminDisc], ['outra pessoa', S.pessoaSemPerfil]]) {
      assert.equal((await como('authenticated', uid, `select count(*)::int n from public.${t}`)).rows[0].n, 0, t + ' visto por ' + quem);
    }
    await rejeita(como('anon', null, `select * from public.${t}`), /permission denied/);
  }
  // Conta do Vagas não enxerga nada do DISC (tudo do painel exige e_admin()).
  for (const t of ['respostas', 'pessoas', 'processos', 'empresas', 'admins', 'relatorios', 'pedidos']) {
    assert.equal((await como('authenticated', S.pessoa, `select count(*)::int n from public.${t}`)).rows[0].n, 0, 'DISC.' + t);
  }
  assert.equal(await de(S.pessoa)('e_admin'), false);
});

test('empresa: CNPJ (numérico e alfanumérico) conferido, em análise até a operação aprovar', async () => {
  exigirBanco();
  const conta = await contaVagas('empresa');
  const cad = (extra) => de(conta)('vagas_empresa_cadastrar', Object.assign({ cnpj: '11.222.333/0001-81', razaoSocial: 'Mercado Bom Dia Ltda',
    nomeFantasia: 'Mercado Bom Dia', setor: 'Supermercado', cidade: 'boa-vista-rr', zona: 'centro-leste', whatsapp: '95 3224-5566',
    email: 'rh@mercadobomdia.com.br' }, extra || {}));
  erro(await cad({ cnpj: '11.222.333/0001-82' }), 'CNPJ inválido. Confira os números.');
  erro(await cad({ cnpj: '00000000000000' }), 'CNPJ inválido. Confira os números.');
  erro(await cad({ cidade: 'rorainopolis-rr' }), 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  erro(await cad({ razaoSocial: '' }), 'Informe a razão social.');
  erro(await cad({ whatsapp: '123' }), 'WhatsApp da empresa inválido.');
  erro(await cad({ descricao: 'Ligue 95 99999-0000' }), /^Tire o telefone/);
  const r = ok(await cad());
  assert.equal(r.empresa.status, 'em_analise');
  assert.equal(r.empresa.cnpj, '11222333000181');
  assert.equal(r.empresa.cnpjFormatado, '11.222.333/0001-81');
  assert.equal(r.empresa.papel, 'dono');
  erro(await cad(), 'Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
  // Alfanumérico (IN RFB 2.229/2024).
  const alfa = ok(await de(conta)('vagas_empresa_cadastrar', { cnpj: '12.ABC.345/01DE-35', razaoSocial: 'Padaria Nova Ltda', cidade: 'boa-vista-rr' }));
  assert.equal(alfa.empresa.cnpj, '12ABC34501DE35');
  assert.equal(alfa.empresa.nomeFantasia, 'Padaria Nova Ltda');
  S.empresaConta = conta;
  S.empresa = r.empresa.id;
  S.empresa2 = alfa.empresa.id;
  // Só o operador da cidade (ou a equipe) aprova; moderador não.
  const outra = await contaVagas('operador', { dados: { operador: { cidade: 'rorainopolis-rr' } } });
  erro(await de(outra)('vagas_op_empresa_decidir', S.empresa, 'aprovar', ''), 'Empresa não encontrada.');
  const moderador = await contaVagas('operador', { dados: { operador: { cidade: 'boa-vista-rr', papel: 'moderador' } } });
  S.moderador = moderador;
  erro(await de(moderador)('vagas_op_empresa_decidir', S.empresa, 'aprovar', ''), 'Sem permissão.');
  const ap = ok(await de(S.operador)('vagas_op_empresa_decidir', S.empresa, 'aprovar', 'CNPJ conferido na Receita'));
  assert.equal(ap.empresa.status, 'ativa');
  assert.ok(ap.empresa.cnpjConferidoEm);
  const mod = (await db.query(`select papel, acao, alvo from public.vagas_moderacao where alvo_id = $1`, [S.empresa])).rows;
  assert.deepEqual(mod, [{ papel: 'operador', acao: 'empresa_aprovar', alvo: 'empresa' }]);
  // Registro de moderação: só inclusão.
  await rejeita(db.query(`update public.vagas_moderacao set motivo = 'x'`), /só de inclusão/);
  await rejeita(db.query(`delete from public.vagas_moderacao`), /só de inclusão/);
  // RLS: membro vê a própria empresa; outra empresa não; operador da cidade vê.
  assert.equal((await como('authenticated', conta, `select count(*)::int n from public.vagas_empresas`)).rows[0].n, 2);
  assert.equal((await como('authenticated', S.pessoa, `select count(*)::int n from public.vagas_empresas`)).rows[0].n, 0);
  assert.equal((await como('authenticated', S.operador, `select count(*)::int n from public.vagas_empresas`)).rows[0].n, 2);
  assert.equal((await como('authenticated', outra, `select count(*)::int n from public.vagas_empresas`)).rows[0].n, 0);
  // Editar: só as chaves enviadas; CNPJ não muda.
  const ed = ok(await de(conta)('vagas_empresa_salvar', S.empresa, { setor: 'Varejo de alimentos', cnpj: '12ABC34501DE35' }));
  assert.equal(ed.empresa.setor, 'Varejo de alimentos');
  assert.equal(ed.empresa.cnpj, '11222333000181');
});

test('anúncio: salário obrigatório, diária com data/horário/valor, campos fechados, termos recusados pelo banco', async () => {
  exigirBanco();
  const salvar = (extra) => de(S.empresaConta)('vagas_anuncio_salvar', anuncioDados(S.empresa, extra));
  erro(await salvar({ salarioDe: null, salarioAte: null }), 'Informe o salário ou a faixa salarial.');
  erro(await salvar({ modalidade: 'estagio', salarioDe: 0, horasDia: 6 }), 'Informe o valor da bolsa.');
  erro(await salvar({ modalidade: 'freelancer', salarioDe: undefined }), 'Informe o valor do serviço.');
  erro(await salvar({ salarioAte: 100000 }), 'O valor máximo da faixa não pode ser menor que o mínimo.');
  erro(await salvar({ modalidade: 'diaria', salarioDe: 12000, salarioAte: null }), 'Informe a data, o horário e o valor da diária.');
  erro(await salvar({ modalidade: 'diaria', salarioDe: 12000, salarioAte: null, data: await hojeBV(-1), horaInicio: '08:00', horaFim: '17:00' }),
    'A data da diária já passou. Escolha outra data.');
  erro(await salvar({ modalidade: 'diaria', salarioDe: 12000, salarioAte: null, data: await hojeBV(8), horaInicio: '08:00', horaFim: '17:00' }),
    'A diária precisa ser para os próximos 7 dias.');
  erro(await salvar({ modalidade: 'diaria', salarioDe: 12000, salarioAte: null, data: await hojeBV(1), horaInicio: '08:00', horaFim: '17:00',
    prazoHoras: 200 }), 'A diária fica no ar de 48 a 168 horas.');
  erro(await salvar({ funcao: 'A' }), 'Informe a função (ex.: Atendente).');
  erro(await salvar({ descricao: 'curta demais para uma vaga' }), 'Descreva a vaga em pelo menos 40 caracteres.');
  // Campos fechados (vaga "como produto"): área, turno, experiência, escolaridade, requisitos, selo, início, estágio.
  erro(await salvar({ area: 'astronauta' }), 'Escolha a área da vaga.');
  erro(await salvar({ turno: 'madrugada' }), 'Escolha o turno da vaga.');
  erro(await salvar({ experiencia: undefined }), 'Escolha a experiência que a vaga pede.');
  erro(await salvar({ escolaridade: 'doutorado' }), 'Escolaridade mínima inválida.');
  erro(await salvar({ requisitos: ['outro'] }), 'Escreva qual é o outro requisito.');
  erro(await salvar({ requisitoOutro: 'x'.repeat(81) }), 'O requisito "Outro" pode ter até 80 caracteres.');
  erro(await salvar({ requisitoOutro: 'Ligar no 95 99876-5432' }), /^Tire o telefone/);
  erro(await salvar({ selo: 'astrologia' }), 'Escolha um dos testes da plataforma ou "nenhum".');
  erro(await salvar({ modalidade: 'estagio', salarioDe: 80000 }), 'Informe as horas por dia do estágio (até 6).');
  erro(await salvar({ modalidade: 'estagio', salarioDe: 80000, horasDia: 8 }), 'Informe as horas por dia do estágio (até 6).');
  erro(await salvar({ inicio: 'data' }), 'Informe a data de início (AAAA-MM-DD).');
  erro(await salvar({ inicio: 'data', inicioData: await hojeBV(-2) }), 'A data de início não pode estar no passado.');
  // Chaves em snake_case (as do design) também valem; comissão e benefício andam juntos; título = função.
  const snake = ok(await de(S.empresaConta)('vagas_anuncio_salvar', { empresaId: S.empresa, area: 'vendas-loja', funcao: 'Vendedor(a) de balcão',
    modalidade: 'clt', descricao: 'Atender clientes no balcão, montar pedidos e organizar a vitrine da loja.', turno: 'comercial',
    fim_de_semana: true, comissao: true, inicio: 'data', inicio_data: await hojeBV(10), experiencia: 'ate_1', escolaridade: 'nao_exigida',
    requisitos: ['cnh_b', 'curso_registro'], requisito_outro: 'Gostar de vender', selo: 'vendas', beneficios: ['saude', 'plano_saude'],
    salario_de: 162100, salario_ate: 200000, cidade: 'boa-vista-rr', zona: 'centro-leste' })).anuncio;
  assert.deepEqual([snake.titulo, snake.funcao, snake.area, snake.turno, snake.fimDeSemana, snake.comissao, snake.inicio, snake.inicioData,
    snake.experiencia, snake.escolaridade, snake.selo], ['Vendedor(a) de balcão', 'Vendedor(a) de balcão', { slug: 'vendas-loja', nome: 'Vendas em loja e balcão' },
    'comercial', true, true, 'data', await hojeBV(10), 'ate_1', 'nao_exigida', 'vendas']);
  assert.deepEqual(snake.requisitos, ['cnh_b', 'curso_registro', 'outro']);
  assert.equal(snake.requisitoOutro, 'Gostar de vender');
  assert.deepEqual(snake.requisitosLista, ['CNH categoria B', 'Curso com registro na área', 'Gostar de vender']);
  assert.deepEqual(snake.beneficios, ['saude', 'comissao'], 'benefício fora da lista é ignorado; comissão entra junto');
  assert.deepEqual(snake.valor, { minCentavos: 162100, maxCentavos: 200000, unidade: 'mes' });
  const est = ok(await salvar({ modalidade: 'estagio', salarioDe: 80000, horasDia: 6, funcao: 'Estagiário(a) de atendimento' })).anuncio;
  assert.deepEqual([est.horasDia, est.valor.unidade, est.escolaridade], [6, 'mes', 'medio']);
  erro(await salvar({ zona: 'cidade-toda' }), 'Escolha uma zona da cidade da vaga.');
  // Filtro de textos (banco): discriminação, golpe, link, telefone, e-mail.
  const casos = [
    ['Procuramos pessoa de boa aparência para o caixa.', /Tire o trecho "aparencia".*Lei 9\.029\/1995/],
    ['Atendente até 30 anos, ensino médio completo.', /Tire o trecho "ate 30 anos"/],
    ['Preferência por solteira sem filhos para o turno.', /Tire o trecho "solteira"/],
    ['Para participar é preciso pagar a taxa de inscrição.', /Tire o trecho "taxa": ninguém paga para concorrer/],
    ['Mande o Pix de confirmação da vaga para garantir.', /Tire o trecho "pix"/],
    ['Mais detalhes no link bit.ly/vaga-bv agora mesmo.', /^Tire o link "bit\.ly\/vaga-bv"/],
    ['Chame no WhatsApp (95) 99876-5432 para saber mais.', /^Tire o telefone, e-mail ou perfil de rede social/],
    ['Envie o currículo para rh@empresa.com.br hoje mesmo.', /^Tire o telefone, e-mail ou perfil de rede social \("rh@empresa\.com\.br"\)/],
    ['Vaga somente para brasileiros com experiência no caixa.', /Tire o trecho "somente para brasileiros"/]
  ];
  for (const [texto, padrao] of casos) erro(await salvar({ descricao: texto }), padrao);
  erro(await salvar({ funcao: 'Atendente 95 99876-5432' }), /^Tire o telefone/);
  // Confidencial só com CNPJ conferido: a empresa 2 ainda está em análise.
  erro(await de(S.empresaConta)('vagas_anuncio_salvar', anuncioDados(S.empresa2, { confidencial: true })),
    'Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.');
  // Mesmo por fora da RPC (service_role), o gatilho recusa.
  const direto = (descricao, valor) => como('service_role', null, `insert into public.vagas_anuncios (empresa_id, cidade_id, area, funcao,
    modalidade, descricao, turno, experiencia, valor_min_centavos, valor_unidade) select $1, c.id, 'caixa', 'Caixa', 'clt', $2, 'comercial',
    'nao_precisa', $3, 'mes' from public.vagas_cidades c where c.slug = 'boa-vista-rr'`, [S.empresa, descricao, valor]);
  await rejeita(direto('Trabalhar no caixa com boa aparência sempre.', 150000), /aparencia/);
  await rejeita(direto('Trabalhar no caixa atendendo clientes do bairro.', 0), /valor_min_centavos/);
  // Textos aceitos (sem falso positivo nas palavras comuns).
  const okA = ok(await salvar({ descricao: 'Auxiliar de depósito: carregar peso, conferir notas. Plano de saúde e Vale-transporte. Salário R$ 1.621,00.' }));
  assert.equal(okA.anuncio.status, 'rascunho');
  assert.match(okA.anuncio.codigo, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  S.anuncio1 = okA.anuncio.id;
});

test('publicar: empresa nova passa pela revisão nas 3 primeiras; depois vai direto; listagem pública só o que está no ar', async () => {
  exigirBanco();
  const criar = async (extra) => ok(await de(S.empresaConta)('vagas_anuncio_salvar', anuncioDados(S.empresa, extra))).anuncio.id;
  const pub1 = ok(await de(S.empresaConta)('vagas_anuncio_publicar', S.anuncio1));
  assert.equal(pub1.emRevisao, true);
  assert.equal(pub1.anuncio.status, 'em_revisao');
  assert.equal((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' })).anuncios.length, 0, 'em revisão não aparece');
  // Operação aprova (moderador também modera anúncio).
  const ap = ok(await de(S.moderador)('vagas_op_anuncio_decidir', S.anuncio1, 'publicar', ''));
  assert.equal(ap.anuncio.status, 'publicado');
  assert.equal(ap.anuncio.noAr, true);
  const dias = (await db.query(`select round(extract(epoch from expira_em - publicado_em) / 86400) d from public.vagas_anuncios where id = $1`, [S.anuncio1])).rows[0].d;
  assert.equal(Number(dias), 30);
  const a2 = await criar({ funcao: 'Caixa de supermercado', area: 'caixa', zona: 'zona-oeste' });
  const a3 = await criar({ funcao: 'Repositor', area: 'logistica', modalidade: 'temporario', diasNoAr: 15 });
  for (const id of [a2, a3]) {
    assert.equal(ok(await de(S.empresaConta)('vagas_anuncio_publicar', id)).emRevisao, true);
    ok(await de(S.operador)('vagas_op_anuncio_decidir', id, 'publicar', ''));
  }
  // A 4ª vai direto ao ar. Diária para hoje: no ar pelo prazo escolhido (48 h a 7 dias), aparece em "para hoje".
  const diaria = await criar({ funcao: 'Diária: ajudante de mudança', area: 'logistica', modalidade: 'diaria', salarioDe: 12000,
    salarioAte: null, data: await hojeBV(0), horaInicio: '07:00', horaFim: '16:00', zona: 'zona-sul', prazoHoras: 72 });
  const p4 = ok(await de(S.empresaConta)('vagas_anuncio_publicar', diaria));
  assert.equal(p4.emRevisao, false);
  assert.equal(p4.anuncio.status, 'publicado');
  const horas = (await db.query(`select extract(epoch from expira_em - publicado_em) / 3600 h from public.vagas_anuncios where id = $1`, [diaria])).rows[0].h;
  assert.ok(Math.abs(Number(horas) - 72) < 0.1, String(horas));
  const lista = ok(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' }));
  assert.equal(lista.anuncios.length, 4);
  assert.equal(lista.anuncios[0].id, diaria, 'mais novo primeiro (sem ranking)');
  assert.equal(lista.anuncios[0].paraHoje, true);
  assert.deepEqual(lista.anuncios[0].valor, { minCentavos: 12000, maxCentavos: null, unidade: 'dia' });
  assert.equal(lista.anuncios[0].empresa.nome, 'Mercado Bom Dia');
  assert.equal(lista.anuncios[0].empresa.iniciais, 'MB');
  assert.deepEqual((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', paraHoje: true })).anuncios.map((a) => a.id), [diaria]);
  assert.deepEqual((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', modalidade: ['temporario'] })).anuncios.map((a) => a.id), [a3]);
  assert.deepEqual((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', zona: 'zona-oeste' })).anuncios.map((a) => a.id), [a2]);
  assert.deepEqual((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', busca: 'supermercado' })).anuncios.map((a) => a.id), [a2]);
  // Paginação por cursor.
  const pag1 = ok(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', limite: 3 }));
  assert.equal(pag1.anuncios.length, 3);
  assert.ok(pag1.proximo);
  const pag2 = ok(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', limite: 3, depois: pag1.proximo }));
  assert.equal(pag2.anuncios.length, 1);
  assert.equal(pag2.proximo, '');
  // Página pública pelo código curto (sem dados internos).
  const cod = lista.anuncios[1].codigo;
  const pag = ok(await anon('vagas_anuncio_publico', cod.toLowerCase()));
  assert.equal(pag.anuncio.codigo, cod);
  assert.ok(pag.anuncio.descricao.length >= 40);
  for (const k of ['area', 'funcao', 'titulo', 'turno', 'fimDeSemana', 'experiencia', 'escolaridade', 'requisitos', 'requisitoOutro',
    'requisitosLista', 'beneficios', 'comissao', 'inicio', 'inicioData', 'selo', 'quantidade', 'valor']) assert.ok(k in pag.anuncio, k);
  assert.ok(!('empresaId' in pag.anuncio) && !('criadoPor' in pag.anuncio) && !('status' in pag.anuncio));
  erro(await anon('vagas_anuncio_publico', 'ZZZZZZ'), 'Vaga não encontrada ou já encerrada.');
  // Pausar some do mural; retomar volta; empresa suspensa some tudo; cidade pausada também.
  ok(await de(S.empresaConta)('vagas_anuncio_acao', a3, 'pausar'));
  assert.equal((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' })).anuncios.length, 3);
  ok(await de(S.empresaConta)('vagas_anuncio_acao', a3, 'retomar'));
  erro(await de(S.empresaConta)('vagas_anuncio_acao', diaria, 'renovar'), 'Para outra data, crie uma diária nova.');
  await db.query(`update public.vagas_cidades set status = 'pausada' where slug = 'boa-vista-rr'`);
  erro(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' }), 'As vagas desta cidade estão pausadas no momento.');
  erro(await anon('vagas_anuncio_publico', cod), 'Vaga não encontrada ou já encerrada.');
  await db.query(`update public.vagas_cidades set status = 'ativa' where slug = 'boa-vista-rr'`);
  S.anuncios = { a1: S.anuncio1, a2, a3, diaria };
});

test('vaga confidencial: nome escondido no mural e na candidatura até a pessoa aceitar conversar (ver a empresa)', async () => {
  exigirBanco();
  const conf = ok(await de(S.empresaConta)('vagas_anuncio_salvar', anuncioDados(S.empresa, { funcao: 'Vendedor(a) interno(a)', area: 'vendas-loja',
    confidencial: true, zona: 'centro-leste' }))).anuncio.id;
  ok(await de(S.empresaConta)('vagas_anuncio_publicar', conf));
  const lista = ok(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' }));
  const item = lista.anuncios.find((a) => a.id === conf);
  assert.deepEqual(item.empresa, { nome: 'Empresa confidencial', iniciais: '', confidencial: true, conferida: true });
  assert.ok(!JSON.stringify(item).includes('Bom Dia'));
  const det = ok(await anon('vagas_anuncio_publico', item.codigo));
  assert.equal(det.anuncio.empresa.nome, 'Empresa confidencial');
  assert.equal(det.anuncio.empresa.setor, '');
  assert.ok(!JSON.stringify(det).includes('Bom Dia') && !JSON.stringify(det).includes('11222333'));
  S.anuncios.conf = conf;
});

test('fluxo: Quero → cartão cego → conversa sem dados → filtro de golpe → ver empresa → Combinou → contato → contratada', async () => {
  exigirBanco();
  const p = S.pessoa;
  const emp = de(S.empresaConta);
  // Feed da pessoa (cidades dela; tira puladas e já pedidas).
  const feed = ok(await de(p)('vagas_feed', {}));
  assert.equal(feed.anuncios.length, 5);
  ok(await de(p)('vagas_pular', S.anuncios.a3));
  assert.equal((await de(p)('vagas_feed', {})).anuncios.length, 4);
  erro(await de(S.pessoaSemPerfil)('vagas_quero', S.anuncios.conf), 'Complete seu cadastro antes de se candidatar.');
  const q = ok(await de(p)('vagas_quero', S.anuncios.conf));
  assert.equal(q.candidatura.status, 'enviada');
  assert.equal(q.candidatura.empresaRevelada, false);
  assert.equal(q.candidatura.anuncio.empresa.nome, 'Empresa confidencial');
  assert.equal(ok(await de(p)('vagas_quero', S.anuncios.conf)).duplicado, true);
  const cand = q.candidatura.id;
  // A empresa vê o cartão cego, por ordem de chegada; nada de nome, contato, "sobre" ou empregador.
  const cartoes = ok(await emp('vagas_cartoes', S.anuncios.conf, {}));
  assert.equal(cartoes.total, 1);
  const txt = JSON.stringify(cartoes);
  for (const v of ['Maria', 'Fernanda', 'Souza', '99123', 'pessoa', 'aprendo', 'Loja Antiga', 'Mercadinho', p]) assert.ok(!txt.includes(v), v);
  assert.equal(cartoes.cartoes[0].candidaturaId, cand);
  // Filtros da lista fechada.
  assert.equal((await emp('vagas_cartoes', S.anuncios.conf, { escolaridadeMin: 'superior' })).total, 0);
  assert.equal((await emp('vagas_cartoes', S.anuncios.conf, { cnh: ['B'], turnos: ['manha'], experienciaMinMeses: 12, zona: 'zona-oeste' })).total, 1);
  assert.equal((await emp('vagas_cartoes', S.anuncios.conf, { pretensaoMaxCentavos: 100000 })).total, 0);
  assert.equal((await emp('vagas_cartoes', S.anuncios.conf, { temSelo: true })).total, 1, 'selo não é filtro (veto P3)');
  assert.equal((await emp('vagas_cartoes', S.anuncios.conf, { idade: 30, genero: 'x' })).total, 1, 'filtro fora da lista é ignorado');
  // Contato antes do Combinou: recusado. Outra empresa não acessa a candidatura.
  const semComb = await emp('vagas_contato_pessoa', cand);
  erro(semComb, 'O contato só aparece depois do Combinou.');
  const outraEmp = await contaVagas('empresa');
  erro(await de(outraEmp)('vagas_cartoes', S.anuncios.conf, {}), 'Vaga não encontrada.');
  erro(await de(outraEmp)('vagas_contato_pessoa', cand), 'Candidatura não encontrada.');
  erro(await de(outraEmp)('vagas_conversa', cand), 'Conversa não encontrada.');
  // A pessoa não escreve antes da empresa abrir a conversa; e não vê a empresa antes do "Quero conversar".
  erro(await de(p)('vagas_mensagem_enviar', cand, 'Olá!', null), 'A empresa ainda não abriu uma conversa.');
  erro(await de(p)('vagas_ver_empresa', cand), 'A empresa ainda não pediu para conversar.');
  erro(await de(p)('vagas_combinar', cand), 'A empresa ainda não pediu para conversar.');
  // A empresa escreve (abre a conversa = Quero conversar). Pedido de Pix/documento/contato é bloqueado.
  const idCliente = crypto.randomUUID();
  const m1 = ok(await emp('vagas_mensagem_enviar', cand, 'Olá! Gostamos do seu perfil. Você pode começar na segunda?', idCliente));
  assert.equal(m1.mensagem.autor, 'empresa');
  assert.equal(ok(await emp('vagas_mensagem_enviar', cand, 'Olá! Gostamos do seu perfil. Você pode começar na segunda?', idCliente)).duplicado, true);
  const golpe = await emp('vagas_mensagem_enviar', cand, 'Para garantir a vaga faça um Pix de R$ 50 de taxa.', null);
  erro(golpe, /^Mensagem bloqueada: ninguém paga para concorrer a uma vaga/);
  assert.equal(golpe.bloqueada, true);
  assert.equal(golpe.tipo, 'golpe');
  erro(await emp('vagas_mensagem_enviar', cand, 'Me manda seu CPF e uma selfie', null), /^Mensagem bloqueada: não peça nem mande documento/);
  erro(await emp('vagas_mensagem_enviar', cand, 'Me chama no 95 99876-5432', null), /^Mensagem bloqueada: telefone, e-mail e redes sociais/);
  erro(await emp('vagas_mensagem_enviar', cand, 'Qual a sua idade? Você é casada?', null), /^Mensagem bloqueada: aqui não se pergunta/);
  await rejeita(como('service_role', null, `insert into public.vagas_mensagens (conversa_id, autor, texto) select id, 'empresa', 'deposite a taxa' from public.vagas_conversas limit 1`),
    /Mensagem bloqueada/);
  const est = (await db.query(`select status from public.vagas_candidaturas where id = $1`, [cand])).rows[0].status;
  assert.equal(est, 'conversar');
  // Até 3 mensagens seguidas da empresa sem resposta.
  ok(await emp('vagas_mensagem_enviar', cand, 'Temos vaga para o turno da manhã.', null));
  ok(await emp('vagas_mensagem_enviar', cand, 'Aguardo seu retorno.', null));
  erro(await emp('vagas_mensagem_enviar', cand, 'Oi?', null), 'Espere a pessoa responder antes de mandar outra mensagem.');
  // A pessoa lê (nome da empresa ainda escondido), responde.
  const conv = ok(await de(p)('vagas_conversa', cand));
  assert.equal(conv.outroLado, 'Empresa confidencial');
  assert.equal(conv.podeEscrever, true);
  assert.equal(conv.mensagens.length, 3);
  assert.ok(!JSON.stringify(conv).includes('Bom Dia'));
  ok(await de(p)('vagas_mensagem_enviar', cand, 'Posso sim, tenho disponibilidade.', null));
  const convEmp = ok(await emp('vagas_conversa', cand));
  assert.equal(convEmp.outroLado, 'Pessoa candidata');
  assert.ok(!JSON.stringify(convEmp).includes('Maria'));
  assert.equal(ok(await emp('vagas_conversas_empresa', S.empresa)).conversas[0].naoLidas, 0);
  // Combinou exige ver a empresa antes (confidencial).
  const semVer = await de(p)('vagas_combinar', cand);
  erro(semVer, 'Veja primeiro qual é a empresa.');
  assert.equal(semVer.verEmpresa, true);
  const ver = ok(await de(p)('vagas_ver_empresa', cand));
  assert.equal(ver.empresa.nome, 'Mercado Bom Dia');
  assert.equal(ver.empresa.cnpjFormatado, '11.222.333/0001-81');
  // Ainda sem contato liberado.
  erro(await emp('vagas_contato_pessoa', cand), 'O contato só aparece depois do Combinou.');
  const comb = ok(await de(p)('vagas_combinar', cand));
  assert.equal(comb.candidatura.status, 'combinou');
  assert.deepEqual(comb.empresa, { nome: 'Mercado Bom Dia', whatsapp: '559532245566', email: 'rh@mercadobomdia.com.br' });
  // Agora a empresa vê nome e contato; cada leitura fica registrada e a pessoa vê "quem viu meu contato".
  const ct = ok(await emp('vagas_contato_pessoa', cand));
  assert.equal(ct.pessoa.nome, 'Maria Fernanda Souza');
  assert.equal(ct.pessoa.whatsapp, '5595991234567');
  assert.equal(ct.pessoa.experiencias[0].empregador, 'Loja Antiga Ltda');
  ok(await emp('vagas_contato_pessoa', cand));
  const viu = ok(await de(p)('vagas_quem_viu_meu_contato'));
  assert.equal(viu.acessos.length, 1);
  assert.equal(viu.acessos[0].empresa, 'Mercado Bom Dia');
  assert.equal(viu.acessos[0].vezes, 2);
  assert.equal(viu.acessos[0].anuncio, 'Vendedor(a) interno(a)');
  // Depois do Combinou a pessoa não "retira" (avisa pela conversa); a empresa marca contratada.
  erro(await de(p)('vagas_retirar', cand), 'O contato já foi liberado. Avise a empresa pela conversa.');
  erro(await emp('vagas_empresa_decidir', cand, 'agora_nao'), 'O Combinou já aconteceu: a decisão não muda mais.');
  assert.equal(ok(await emp('vagas_marcar_contratada', cand)).status, 'contratada');
  const minhas = ok(await de(p)('vagas_minhas_candidaturas'));
  assert.equal(minhas.candidaturas[0].status, 'contratada');
  assert.equal(minhas.candidaturas[0].anuncio.empresa.nome, 'Mercado Bom Dia');
  S.cand = cand;
});

test('fluxo alternativo: "Agora não" encerra a conversa; a pessoa recusa ou retira antes do Combinou', async () => {
  exigirBanco();
  const p2 = await contaVagas('pessoa');
  ok(await de(p2)('vagas_pessoa_salvar', pessoaDados({ nome: 'João Pedro Lima', whatsapp: '95 98111-2222', zona: 'zona-sul' })));
  const k1 = ok(await de(p2)('vagas_quero', S.anuncios.a1)).candidatura.id;
  const k2 = ok(await de(p2)('vagas_quero', S.anuncios.a2)).candidatura.id;
  const emp = de(S.empresaConta);
  ok(await emp('vagas_mensagem_enviar', k1, 'Podemos conversar?', null));
  ok(await emp('vagas_empresa_decidir', k1, 'agora_nao'));
  erro(await emp('vagas_mensagem_enviar', k1, 'Mais uma coisa', null), 'Você marcou "Agora não" para esta pessoa. Mude para "Quero conversar" para escrever.');
  erro(await de(p2)('vagas_mensagem_enviar', k1, 'Ok', null), 'Esta conversa foi encerrada.');
  ok(await emp('vagas_empresa_decidir', k2, 'conversar'));
  assert.equal(ok(await de(p2)('vagas_recusar', k2)).candidatura.status, 'recusada');
  erro(await emp('vagas_empresa_decidir', k2, 'conversar'), 'A pessoa encerrou esta candidatura.');
  const k3 = ok(await de(p2)('vagas_quero', S.anuncios.diaria)).candidatura.id;
  assert.equal(ok(await de(p2)('vagas_retirar', k3)).candidatura.status, 'retirada');
  assert.equal(ok(await emp('vagas_cartoes', S.anuncios.diaria, {})).total, 0, 'retirada some dos cartões');
  assert.equal(ok(await de(p2)('vagas_quero', S.anuncios.diaria)).candidatura.status, 'enviada', 'pode pedir de novo');
  S.pessoa2 = p2;
});

test('denúncias: 3 contas diferentes tiram o anúncio do ar; sem login não conta; operação devolve ou remove', async () => {
  exigirBanco();
  const alvo = S.anuncios.a2;
  const cod = (await db.query(`select codigo from public.vagas_anuncios where id = $1`, [alvo])).rows[0].codigo;
  erro(await anon('vagas_denunciar', { alvo: 'anuncio', id: cod, motivo: 'nada' }), 'Escolha o motivo da denúncia.');
  for (let i = 0; i < 3; i++) ok(await rpcComo('anon', null, 'vagas_denunciar', [{ alvo: 'anuncio', id: cod, motivo: 'golpe' }], ip(40 + i)));
  assert.equal((await db.query(`select status from public.vagas_anuncios where id = $1`, [alvo])).rows[0].status, 'publicado', 'sem login não derruba');
  const contas = [S.pessoa, S.pessoa2, S.pessoaSemPerfil];
  ok(await de(contas[0])('vagas_denunciar', { alvo: 'anuncio', id: alvo, motivo: 'golpe', detalhe: 'Pediram dinheiro' }));
  assert.equal(ok(await de(contas[0])('vagas_denunciar', { alvo: 'anuncio', id: alvo, motivo: 'golpe' })).duplicado, true);
  ok(await de(contas[1])('vagas_denunciar', { alvo: 'anuncio', id: alvo, motivo: 'falsa' }));
  assert.equal((await db.query(`select status from public.vagas_anuncios where id = $1`, [alvo])).rows[0].status, 'publicado');
  ok(await de(contas[2])('vagas_denunciar', { alvo: 'anuncio', id: alvo, motivo: 'cobranca' }));
  assert.equal((await db.query(`select status from public.vagas_anuncios where id = $1`, [alvo])).rows[0].status, 'suspenso');
  assert.ok(!(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' })).anuncios.some((a) => a.id === alvo));
  const sis = (await db.query(`select papel, acao from public.vagas_moderacao where alvo_id = $1 and papel = 'sistema'`, [alvo])).rows;
  assert.deepEqual(sis, [{ papel: 'sistema', acao: 'suspender_por_denuncias' }]);
  // A empresa não edita nem republica; a operação vê as denúncias (sem saber quem denunciou) e devolve ao ar.
  erro(await de(S.empresaConta)('vagas_anuncio_salvar', anuncioDados(S.empresa, { id: alvo })), 'Esta vaga está fora do ar, aguardando a moderação.');
  const den = ok(await de(S.operador)('vagas_op_denuncias', {}));
  assert.equal(den.denuncias.filter((d) => d.anuncio && d.anuncio.id === alvo).length, 6);
  assert.ok(!JSON.stringify(den).includes(S.pessoa), 'nunca o id de quem denunciou');
  ok(await de(S.operador)('vagas_op_anuncio_decidir', alvo, 'publicar', 'Conferido com a empresa'));
  assert.equal((await db.query(`select count(*)::int n from public.vagas_denuncias where anuncio_id = $1 and status = 'aberta'`, [alvo])).rows[0].n, 0);
  assert.ok((await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' })).anuncios.some((a) => a.id === alvo));
  // Denúncia de mensagem: só quem participa, sobre mensagem do outro lado; a operação vê só o texto.
  const msgEmp = (await db.query(`select m.id from public.vagas_mensagens m join public.vagas_conversas v on v.id = m.conversa_id
    where v.candidatura_id = $1 and m.autor = 'empresa' limit 1`, [S.cand])).rows[0].id;
  erro(await de(S.pessoa2)('vagas_denunciar', { alvo: 'mensagem', id: msgEmp, motivo: 'ofensa' }), 'Mensagem não encontrada.');
  ok(await de(S.pessoa)('vagas_denunciar', { alvo: 'mensagem', id: msgEmp, motivo: 'ofensa', detalhe: 'teste' }));
  const dm = ok(await de(S.moderador)('vagas_op_denuncias', {})).denuncias.find((d) => d.alvo === 'mensagem');
  assert.equal(dm.mensagem.autor, 'empresa');
  assert.match(dm.mensagem.texto, /Gostamos do seu perfil/);
  ok(await de(S.moderador)('vagas_op_denuncia_decidir', dm.id, { decisao: 'improcedente', motivo: 'Mensagem normal' }));
  erro(await de(S.moderador)('vagas_op_denuncia_decidir', dm.id, { decisao: 'procedente', motivo: 'x', suspenderEmpresa: true }), 'Sem permissão.');
});

test('referência profissional: só empresa verificada, só depois do aceite; no cartão cego só "tem referência" (veto P1)', async () => {
  exigirBanco();
  const emp = de(S.empresaConta);
  const base = { empresaId: S.empresa, funcao: 'Atendente', vinculo: 'clt', inicio: '2024-01', fim: '2025-06',
    pontosFortes: ['pontualidade', 'atendimento'], recomendaPara: ['Atendente', 'Caixa'], texto: 'Sempre chegou no horário e tratou bem os clientes.',
    declaracao: true };
  // A lista fechada é a da psicologia (12; "caixa_certo", nada de "honestidade").
  assert.deepEqual((await db.query(`select vagas_interno.pontos_fortes() p`)).rows[0].p, REGRAS.PONTOS_FORTES.map((x) => x.id));
  assert.equal(REGRAS.PONTOS_FORTES.length, 12);
  // Empresa não verificada não dá referência.
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { empresaId: S.empresa2, candidaturaId: S.cand })),
    'Só empresa verificada pela Gestão sem Caos pode dar referência.');
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, declaracao: false })),
    'Confirme a declaração de que a pessoa trabalhou na empresa no período informado.');
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, pontosFortes: [] })), 'Escolha de 1 a 3 pontos fortes.');
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, pontosFortes: ['honestidade', 'cuidado_caixa'] })),
    'Escolha de 1 a 3 pontos fortes.');
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, texto: 'Ótima, apesar dos filhos.' })), /a referência não pode falar de/);
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, texto: 'Ligue 95 99876-5432' })), /^Tire o telefone/);
  await rejeita(db.query(`insert into public.vagas_referencias (empresa_id, pessoa_id, funcao, vinculo, inicio, pontos_fortes, declaracao)
    values ($1, $2, 'Caixa', 'clt', '2024-01-01', array['honestidade'], true)`, [S.empresa, S.pessoa2]), /check constraint/);
  // Pela candidatura (depois do Combinou). Enquanto a pessoa não responde, a empresa ainda pode corrigir.
  const r = ok(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand })));
  assert.equal(r.referencia.status, 'pendente');
  assert.equal(r.referencia.textoStatus, 'pendente');
  const refId = r.referencia.id;
  const corrigida = ok(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, pontosFortes: ['pontualidade', 'caixa_certo'] })));
  assert.equal(corrigida.referencia.id, refId);
  assert.deepEqual(corrigida.referencia.pontosFortes, ['pontualidade', 'caixa_certo']);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_referencias where pessoa_id = $1`, [S.pessoa])).rows[0].n, 1);
  // Pendente: invisível para todos menos a pessoa (e a empresa autora vê o que deu).
  assert.equal((await de(S.pessoa)('vagas_pessoa_minha')).cartao.temReferencia, false);
  const minhas = ok(await de(S.pessoa)('vagas_referencias_minhas'));
  assert.equal(minhas.referencias.length, 1);
  assert.equal(minhas.referencias[0].empresa.nome, 'Mercado Bom Dia');
  assert.equal((await de(S.pessoa)('vagas_eu')).pessoa.referenciasPendentes, 1);
  for (const uid of [S.operador, S.adminDisc, S.pessoa2]) {
    await rejeita(como('authenticated', uid, `select * from public.vagas_referencias`), /permission denied/);
  }
  // Outra empresa (verificada) com Combinou com a mesma pessoa NÃO vê a referência pendente da primeira.
  const contaB = await contaVagas('empresa');
  const empB = ok(await de(contaB)('vagas_empresa_cadastrar', { cnpj: cnpjCom('445566770001'), razaoSocial: 'Farmácia Central Ltda', cidade: 'boa-vista-rr' })).empresa.id;
  ok(await de(S.operador)('vagas_op_empresa_decidir', empB, 'aprovar', ''));
  const anB = ok(await de(contaB)('vagas_anuncio_salvar', anuncioDados(empB, { funcao: 'Balconista de farmácia', area: 'saude' }))).anuncio.id;
  ok(await de(contaB)('vagas_anuncio_publicar', anB));
  ok(await de(S.operador)('vagas_op_anuncio_decidir', anB, 'publicar', ''));
  const kB = ok(await de(S.pessoa)('vagas_quero', anB)).candidatura.id;
  ok(await de(contaB)('vagas_empresa_decidir', kB, 'conversar'));
  ok(await de(S.pessoa)('vagas_combinar', kB));
  assert.deepEqual(ok(await de(contaB)('vagas_contato_pessoa', kB)).pessoa.referencias, [], 'pendente não aparece para outra empresa');
  assert.equal(ok(await de(contaB)('vagas_cartoes', anB, {})).cartoes[0].cartao.temReferencia, false);
  // Aceita: o cartão cego mostra SÓ "tem referência" — sem contagem, pontos fortes, empresa ou texto (veto P1).
  ok(await de(S.pessoa)('vagas_referencia_responder', refId, 'aceitar'));
  const cartaoB = ok(await de(contaB)('vagas_cartoes', anB, {})).cartoes[0].cartao;
  assert.equal(cartaoB.temReferencia, true);
  assert.deepEqual(Object.keys(cartaoB).filter((k) => /refer/i.test(k)), ['temReferencia']);
  for (const v of ['Bom Dia', 'horário', 'pontualidade', 'caixa_certo', 'pontosFortes', 'total']) assert.ok(!JSON.stringify(cartaoB).includes(v), v);
  // Depois do Combinou, a completa (texto só depois da moderação).
  let completa = ok(await de(contaB)('vagas_contato_pessoa', kB)).pessoa.referencias;
  assert.equal(completa.length, 1);
  assert.equal(completa[0].empresa.nome, 'Mercado Bom Dia');
  assert.deepEqual(completa[0].pontosFortes, ['pontualidade', 'caixa_certo']);
  assert.equal(completa[0].texto, '', 'texto ainda não moderado');
  // A operação modera só o texto (vê função, empresa e texto; nada da pessoa).
  const fila = ok(await de(S.moderador)('vagas_op_referencias', {}));
  assert.equal(fila.referencias.length, 1);
  assert.deepEqual(Object.keys(fila.referencias[0]).sort(), ['criadoEm', 'empresa', 'funcao', 'id', 'status', 'texto', 'textoMotivo', 'textoStatus', 'vinculo']);
  assert.ok(!JSON.stringify(fila).includes('Maria') && !JSON.stringify(fila).includes(S.pessoa));
  ok(await de(S.moderador)('vagas_op_referencia_decidir', refId, 'aprovar_texto', ''));
  completa = ok(await de(contaB)('vagas_contato_pessoa', kB)).pessoa.referencias;
  assert.equal(completa[0].texto, 'Sempre chegou no horário e tratou bem os clientes.');
  // 1 por empresa por pessoa: depois da resposta, só um novo pedido da pessoa reabre.
  const jaDeu = 'Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.';
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand, pontosFortes: ['organizacao'], texto: '' })), jaDeu);
  // Ocultar some do cartão e do contato para as OUTRAS empresas; mostrar volta; remover tira de vez.
  ok(await de(S.pessoa)('vagas_referencia_responder', refId, 'ocultar'));
  assert.equal((await de(contaB)('vagas_cartoes', anB, {})).cartoes[0].cartao.temReferencia, false);
  assert.deepEqual(ok(await de(contaB)('vagas_contato_pessoa', kB)).pessoa.referencias, []);
  ok(await de(S.pessoa)('vagas_referencia_responder', refId, 'mostrar'));
  assert.equal((await de(contaB)('vagas_cartoes', anB, {})).cartoes[0].cartao.temReferencia, true);
  erro(await de(S.pessoa)('vagas_referencia_responder', refId, 'aceitar'), 'Ação inválida para esta referência.');
  ok(await de(S.pessoa)('vagas_referencia_responder', refId, 'remover'));
  assert.equal((await de(contaB)('vagas_cartoes', anB, {})).cartoes[0].cartao.temReferencia, false);
  assert.equal(ok(await de(S.pessoa)('vagas_referencias_minhas')).referencias.length, 0);
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand })), jaDeu);
  const hist = (await db.query(`select acao, por from public.vagas_referencia_historico where referencia_id = $1 order by id`, [refId])).rows;
  assert.deepEqual(hist.map((h) => h.acao), ['oferecida', 'oferecida', 'aceita', 'texto_publicado', 'ocultada', 'mostrada', 'removida']);
  // Pedido da pessoa (convite por link): só a empresa escolhida abre; a oferta pelo convite reabre a referência removida.
  erro(await de(S.pessoa)('vagas_referencia_pedir', { cnpj: '11.222.333/0001-82' }), 'CNPJ inválido. Confira os números.');
  const conv = ok(await de(S.pessoa)('vagas_referencia_pedir', { cnpj: '11.222.333/0001-81' })).convite;
  assert.equal(conv.empresaNome, 'Mercado Bom Dia');
  assert.equal(conv.empresaNaPlataforma, true);
  assert.match(conv.caminho, /^\/referencia\.html\?t=[0-9a-f]{64}$/);
  erro(await de(contaB)('vagas_referencia_convite', conv.token), 'Convite inválido ou vencido. Peça um link novo à pessoa.');
  assert.equal(ok(await emp('vagas_referencia_convite', conv.token)).convite.pessoa.nome, 'Maria Fernanda Souza');
  const viaConvite = ok(await emp('vagas_referencia_oferecer', Object.assign({}, base, { conviteToken: conv.token })));
  assert.equal(viaConvite.referencia.status, 'pendente');
  assert.equal(viaConvite.referencia.id, refId);
  erro(await emp('vagas_referencia_oferecer', Object.assign({}, base, { conviteToken: conv.token })), 'Convite inválido ou vencido. Peça um link novo à pessoa.');
  // Pelo e-mail: resposta neutra; só aparece para a empresa depois do aceite.
  const neutroExiste = await de(contaB)('vagas_referencia_oferecer', Object.assign({}, base, { empresaId: empB, email: 'pessoa' + 99 + '@nao-existe.teste' }));
  assert.deepEqual(neutroExiste, { ok: true, enviada: true });
  const emailP2 = (await db.query(`select email from auth.users where id = $1`, [S.pessoa2])).rows[0].email;
  assert.deepEqual(await de(contaB)('vagas_referencia_oferecer', Object.assign({}, base, { empresaId: empB, email: emailP2.toUpperCase() })), { ok: true, enviada: true });
  assert.equal(ok(await de(contaB)('vagas_referencias_empresa', empB)).referencias.length, 0, 'enviada por e-mail e não aceita: invisível');
  const deP2 = ok(await de(S.pessoa2)('vagas_referencias_minhas')).referencias[0];
  ok(await de(S.pessoa2)('vagas_referencia_responder', deP2.id, 'aceitar'));
  assert.equal(ok(await de(contaB)('vagas_referencias_empresa', empB)).referencias.length, 1);
  // Página pública (a pessoa liga/desliga): nome curto, referências aceitas, texto só aprovado.
  ok(await de(S.pessoa)('vagas_referencia_responder', viaConvite.referencia.id, 'aceitar'));
  ok(await de(S.moderador)('vagas_op_referencia_decidir', viaConvite.referencia.id, 'aprovar_texto', ''));
  const pubLink = ok(await de(S.pessoa)('vagas_referencias_publicar', true)).caminho;
  const token = pubLink.split('t=')[1];
  const pub = ok(await anon('vagas_referencias_publicas', token));
  assert.equal(pub.pessoa.nomeExibicao, 'Maria S.');
  assert.equal(pub.referencias.length, 1);
  assert.equal(pub.referencias[0].empresa.nome, 'Mercado Bom Dia');
  assert.ok(!JSON.stringify(pub).includes('99123') && !JSON.stringify(pub).includes('Fernanda'));
  ok(await de(S.pessoa)('vagas_referencias_publicar', false));
  erro(await anon('vagas_referencias_publicas', token), 'Página não encontrada.');
  // Empresa suspensa: as referências dela somem.
  ok(await de(S.operador)('vagas_op_empresa_decidir', empB, 'suspender', 'Teste'));
  assert.equal(ok(await de(S.pessoa2)('vagas_pessoa_minha')).cartao.temReferencia, false);
  ok(await de(S.operador)('vagas_op_empresa_decidir', empB, 'reativar', ''));
  assert.equal(ok(await de(S.pessoa2)('vagas_pessoa_minha')).cartao.temReferencia, true);
  // Veto P3: nenhuma RPC aceita filtro "tem referência" (cartões ignoram a chave; nenhuma função tem o parâmetro).
  assert.equal(ok(await de(contaB)('vagas_cartoes', anB, { temReferencia: true })).total, 1, 'filtro "tem referência" é ignorado');
  const comFiltro = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'vagas_interno') and p.proname like 'vagas%' and p.prosrc ~* $1`,
    ["->>?\\s*'(temReferencia|comReferencia|referencia|referencias)'"])).rows;
  assert.deepEqual(comFiltro, []);
  S.empresaB = { conta: contaB, id: empB, anuncio: anB, cand: kB };
  S.refId = refId;
});

test('referência — veto P2: a empresa autora NÃO descobre por nenhuma RPC que a pessoa ocultou ou removeu', async () => {
  exigirBanco();
  const emp = de(S.empresaConta);
  const anuncioA = (await db.query(`select anuncio_id from public.vagas_candidaturas where id = $1`, [S.cand])).rows[0].anuncio_id;
  const emailP = (await db.query(`select email from auth.users where id = $1`, [S.pessoa])).rows[0].email;
  const token = ok(await de(S.pessoa)('vagas_referencias_publicar', true)).caminho.split('t=')[1];
  const base = { empresaId: S.empresa, funcao: 'Caixa', vinculo: 'clt', inicio: '2024-01', fim: '', pontosFortes: ['caixa_certo'],
    recomendaPara: [], texto: '', declaracao: true };
  assert.equal((await db.query(`select status from public.vagas_referencias where id = $1`, [S.refId])).rows[0].status, 'aceita');
  // Tudo o que a empresa autora consegue perguntar ao banco sobre a pessoa e a referência.
  const sem = (o, chaves) => { const c = JSON.parse(JSON.stringify(o)); for (const k of chaves) delete c[k]; return c; };
  const foto = async () => ({
    conversa: await emp('vagas_conversa', S.cand),   // primeiro: marca como lidas (o resto não muda entre as fotos)
    dadas: await emp('vagas_referencias_empresa', S.empresa),
    cartoes: await emp('vagas_cartoes', anuncioA, {}),
    contato: await emp('vagas_contato_pessoa', S.cand),
    publica: await emp('vagas_referencias_publicas', token),
    ofertaDeNovo: await emp('vagas_referencia_oferecer', Object.assign({}, base, { candidaturaId: S.cand })),
    ofertaEmail: await emp('vagas_referencia_oferecer', Object.assign({}, base, { email: emailP })),
    denunciar: await emp('vagas_denunciar', { alvo: 'referencia', id: S.refId, motivo: 'falsa' }),
    conversas: await emp('vagas_conversas_empresa', S.empresa),
    numeros: await emp('vagas_anuncio_numeros', anuncioA),
    anuncios: await emp('vagas_anuncios_empresa', S.empresa),
    eu: await emp('vagas_eu'),
    exportar: sem(await emp('vagas_exportar_meus_dados'), ['geradoEm'])
  });
  const contar = async () => (await db.query(`select (select count(*) from public.vagas_mensagens) m, (select count(*) from public.vagas_moderacao) d,
    (select count(*) from public.vagas_denuncias) x`)).rows[0];
  const antes = await foto();
  const linhas = await contar();
  assert.equal(antes.dadas.referencias.find((x) => x.id === S.refId).status, 'aceita');
  assert.equal(antes.cartoes.cartoes[0].cartao.temReferencia, true);
  assert.ok(antes.contato.pessoa.referencias.some((x) => x.id === S.refId));
  assert.ok(antes.publica.referencias.some((x) => x.id === S.refId));
  erro(antes.denunciar, 'Referência não encontrada.');
  for (const acao of ['ocultar', 'mostrar', 'ocultar', 'remover']) {
    ok(await de(S.pessoa)('vagas_referencia_responder', S.refId, acao));
    assert.deepEqual(await foto(), antes, 'depois de ' + acao + ': a empresa vê exatamente o mesmo');
    assert.deepEqual(await contar(), linhas, 'depois de ' + acao + ': nenhuma mensagem, registro ou aviso novo');
    // Para os outros, a ocultação vale (controle).
    const outros = acao === 'mostrar';
    assert.equal(ok(await de(S.empresaB.conta)('vagas_cartoes', S.empresaB.anuncio, {})).cartoes[0].cartao.temReferencia, outros, acao);
    assert.equal(ok(await anon('vagas_referencias_publicas', token)).referencias.some((x) => x.id === S.refId), outros, acao);
  }
  // A operação também não vê "ocultada" (a moderação só precisa do texto).
  const op = ok(await de(S.moderador)('vagas_op_referencias', { textoStatus: ['pendente', 'publicado', 'nao_publicado'] }));
  assert.ok(!JSON.stringify(op).includes('ocultada'));
  ok(await de(S.pessoa)('vagas_referencias_publicar', false));
});

test('números da vaga (só totais) e "cortar acesso": a pessoa tira o contato da empresa e pode liberar de novo', async () => {
  exigirBanco();
  const emp = de(S.empresaConta);
  const conf = S.anuncios.conf;
  const cod = (await db.query(`select codigo from public.vagas_anuncios where id = $1`, [conf])).rows[0].codigo;
  // Vistas: 1 por origem (ou conta) por dia; a própria empresa não conta; vaga inexistente/fora do ar não conta.
  const vista = (papel, uid, opcoes) => rpcComo(papel, uid, 'vagas_anuncio_vista', [cod], opcoes);
  assert.equal(ok(await vista('anon', null, ip(60))).contada, true);
  assert.equal(ok(await vista('anon', null, ip(60))).contada, false);
  assert.equal(ok(await vista('anon', null, ip(61))).contada, true);
  assert.equal(ok(await vista('authenticated', S.pessoa2)).contada, true);
  assert.equal(ok(await vista('authenticated', S.pessoa2)).contada, false);
  assert.equal(ok(await vista('authenticated', S.empresaConta)).contada, false);
  erro(await anon('vagas_anuncio_vista', 'ZZZZZZ'), 'Vaga não encontrada ou já encerrada.');
  const n = ok(await emp('vagas_anuncio_numeros', conf));
  assert.deepEqual(n.numeros, { vistas: 3, quero: 1, comSelo: 0, conversas: 1, combinou: 1, contratadas: 1 });
  assert.ok(!JSON.stringify(n).includes(S.pessoa) && !JSON.stringify(n).includes('Maria'));
  erro(await de(S.empresaB.conta)('vagas_anuncio_numeros', conf), 'Vaga não encontrada.');
  erro(await de(S.pessoa)('vagas_anuncio_numeros', conf), 'Esta área é para empresas.');
  assert.equal((await db.query(`select count(*)::int n from public.vagas_anuncio_vistas`)).rows[0].n >= 1, true);
  // Cortar acesso: só a dona da candidatura, só depois do Combinou.
  const k1 = (await db.query(`select id from public.vagas_candidaturas where pessoa_id = $1 and status = 'agora_nao' limit 1`, [S.pessoa2])).rows[0].id;
  erro(await de(S.pessoa2)('vagas_cortar_acesso', k1), 'Seu contato não foi liberado para esta empresa.');
  erro(await de(S.pessoa2)('vagas_cortar_acesso', S.cand), 'Candidatura não encontrada.');
  erro(await emp('vagas_cortar_acesso', S.cand), 'Esta área é para quem procura emprego.');
  const c = ok(await de(S.pessoa)('vagas_cortar_acesso', S.cand));
  assert.ok(c.candidatura.contatoCortadoEm);
  assert.equal(c.duplicado, false);
  assert.equal(ok(await de(S.pessoa)('vagas_cortar_acesso', S.cand)).duplicado, true);
  // A empresa não abre mais o contato nem escreve; o cartão mostra o corte.
  const semContato = await emp('vagas_contato_pessoa', S.cand);
  erro(semContato, 'A pessoa deixou de compartilhar o contato com a sua empresa.');
  assert.equal(semContato.contatoCortado, true);
  const conv = ok(await emp('vagas_conversa', S.cand));
  assert.equal(conv.podeEscrever, false);
  assert.equal(conv.contatoCortado, true);
  assert.equal(conv.mensagens[conv.mensagens.length - 1].texto, 'A pessoa encerrou a conversa e deixou de compartilhar o contato.');
  erro(await emp('vagas_mensagem_enviar', S.cand, 'Por que cortou?', null), 'A pessoa encerrou a conversa e deixou de compartilhar o contato com a sua empresa.');
  erro(await de(S.pessoa)('vagas_mensagem_enviar', S.cand, 'Oi', null), 'Esta conversa foi encerrada.');
  assert.equal(ok(await emp('vagas_cartoes', conf, {})).cartoes[0].contatoCortado, true);
  erro(await emp('vagas_referencia_oferecer', { empresaId: S.empresa, candidaturaId: S.cand, funcao: 'Caixa', vinculo: 'clt', inicio: '2024-01',
    pontosFortes: ['caixa_certo'], declaracao: true }), 'Candidatura não encontrada.');
  // "Quem viu meu contato" mostra a candidatura, o corte e o que dá para fazer.
  let viu = ok(await de(S.pessoa)('vagas_quem_viu_meu_contato')).acessos.find((a) => a.candidaturaId === S.cand);
  assert.ok(viu.cortadoEm);
  assert.equal(viu.podeCortar, false);
  assert.equal(viu.empresa, 'Mercado Bom Dia');
  // Liberar de novo = Combinou outra vez.
  const de2 = ok(await de(S.pessoa)('vagas_combinar', S.cand));
  assert.equal(de2.duplicado, false);
  assert.equal(de2.candidatura.contatoCortadoEm, '');
  assert.equal(ok(await emp('vagas_contato_pessoa', S.cand)).pessoa.nome, 'Maria Fernanda Souza');
  assert.equal(ok(await emp('vagas_conversa', S.cand)).podeEscrever, true);
  viu = ok(await de(S.pessoa)('vagas_quem_viu_meu_contato')).acessos.find((a) => a.candidaturaId === S.cand);
  assert.equal(viu.podeCortar, true);
  assert.equal(viu.cortadoEm, '');
  assert.equal(ok(await de(S.pessoa)('vagas_combinar', S.cand)).duplicado, true);
});

test('áreas e filtros da lista (vaga como produto): áreas OU, turno, salário mensal, sem experiência, só o total; nada de filtro por dado da pessoa', async () => {
  exigirBanco();
  // As 24 áreas, leitura pública.
  const areas = ok(await anon('vagas_areas_publicas')).areas;
  assert.equal(areas.length, 24);
  assert.deepEqual(areas.map((a) => a.slug), REGRAS.AREAS.map((a) => a.id));
  assert.deepEqual(areas.map((a) => a.nome), REGRAS.AREAS.map((a) => a.rotulo));
  assert.equal((await como('anon', null, `select count(*)::int n from public.vagas_areas`)).rows[0].n, 24);
  // Empresa de Cantá; vaga assistida pela equipe (mesmos campos; publicar direto).
  const conta = await contaVagas('empresa');
  const emp = ok(await de(conta)('vagas_empresa_cadastrar', { cnpj: cnpjCom('778899000001'), razaoSocial: 'Comercial Cantá Ltda', cidade: 'canta-rr' })).empresa.id;
  const base = { empresaId: emp, cidade: 'canta-rr', zona: 'cidade-toda', modalidade: 'clt', experiencia: 'nao_precisa',
    descricao: 'Vaga de teste do filtro em Cantá, com rotina explicada na conversa pela empresa.' };
  const opSalvar = (dados) => de(S.adminDisc)('vagas_op_anuncio_salvar', Object.assign({}, base, dados));
  erro(await opSalvar({ area: 'caixa', funcao: 'Caixa', turno: 'manha', salarioDe: 150000, publicar: true }), 'Aprove a empresa antes de publicar a vaga.');
  erro(await de(S.moderador)('vagas_op_anuncio_salvar', Object.assign({}, base, { area: 'caixa', funcao: 'Caixa', turno: 'manha', salarioDe: 150000 })),
    'Empresa não encontrada.', 'moderador de outra cidade');
  erro(await de(S.operador)('vagas_op_anuncio_salvar', Object.assign({}, base, { area: 'caixa', funcao: 'Caixa', turno: 'manha', salarioDe: 150000 })),
    'Empresa não encontrada.', 'operador de Boa Vista não age em Cantá');
  ok(await de(S.adminDisc)('vagas_op_empresa_decidir', emp, 'aprovar', 'CNPJ conferido'));
  const v1 = ok(await opSalvar({ area: 'caixa', funcao: 'Operador(a) de caixa', turno: 'manha', salarioDe: 150000, salarioAte: 200000, selo: 'caixa',
    publicar: true })).anuncio;
  assert.equal(v1.status, 'publicado');
  assert.equal(v1.selo, 'caixa');
  const v2 = ok(await opSalvar({ area: 'cozinha', funcao: 'Cozinheiro(a)', turno: 'noite', salarioDe: 180000, experiencia: '1_a_3', publicar: true })).anuncio;
  const v3 = ok(await opSalvar({ area: 'logistica', funcao: 'Ajudante de carga', turno: 'comercial', modalidade: 'diaria', salarioDe: 10000,
    data: await hojeBV(0), horaInicio: '07:00', horaFim: '16:00', publicar: true })).anuncio;
  const v4 = ok(await opSalvar({ area: 'vendas-loja', funcao: 'Vendedor(a) por serviço', turno: 'a_combinar', modalidade: 'freelancer',
    salarioDe: 500000, experiencia: 'ate_1', publicar: true })).anuncio;
  const v5 = ok(await opSalvar({ area: 'caixa', funcao: 'Estagiário(a) de caixa', turno: 'tarde', modalidade: 'estagio', salarioDe: 80000,
    horasDia: 6, publicar: true })).anuncio;
  const log = (await db.query(`select papel, acao from public.vagas_moderacao where alvo_id = $1`, [v1.id])).rows;
  assert.deepEqual(log, [{ papel: 'admin', acao: 'anuncio_assistido' }]);
  const ids = async (f) => ok(await anon('vagas_anuncios_publicos', Object.assign({ cidade: 'canta-rr', entorno: false }, f))).anuncios.map((a) => a.id).sort();
  const so = (...vs) => vs.map((v) => v.id).sort();
  assert.deepEqual(await ids({}), so(v1, v2, v3, v4, v5));
  assert.deepEqual(await ids({ areas: ['caixa'] }), so(v1, v5));
  assert.deepEqual(await ids({ areas: ['caixa', 'cozinha'] }), so(v1, v2, v5), 'áreas: OU entre elas');
  assert.deepEqual(await ids({ turno: ['noite'] }), so(v2));
  assert.deepEqual(await ids({ turno: 'manha' }), so(v1));
  assert.deepEqual(await ids({ salarioMin: 190000 }), so(v1, v3), 'faixa pelo teto; diária × 22; serviço e bolsa menor ficam de fora');
  assert.deepEqual(await ids({ semExperiencia: true }), so(v1, v3, v5));
  assert.deepEqual(await ids({ busca: 'cozinha' }), so(v2), 'busca no nome da área');
  assert.deepEqual(await ids({ modalidade: ['estagio', 'diaria'] }), so(v3, v5));
  // Só o total (botão "Ver N vagas").
  assert.deepEqual(await anon('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false, somenteTotal: true }),
    { ok: true, cidade: { slug: 'canta-rr', nome: 'Cantá' }, total: 5, areasAplicadas: [], areasPadrao: false });
  assert.equal(ok(await anon('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false, somenteTotal: true, areas: ['caixa'] })).total, 2);
  // Regra fixa: nenhum filtro por nota, selo, referência, idade ou sexo (as chaves são ignoradas).
  assert.deepEqual(await ids({ nota: 90, selo: 'caixa', temSelo: true, referencia: true, temReferencia: true, idade: 30, sexo: 'f', genero: 'x' }),
    so(v1, v2, v3, v4, v5));
  const fonte = (await db.query(`select string_agg(p.prosrc, ' ') t from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'vagas_interno') and p.proname in ('listar_anuncios', 'vagas_anuncios_publicos', 'vagas_feed')`)).rows[0].t;
  assert.ok(!/->>?\s*'(nota|selo|temSelo|referencia|temReferencia|idade|sexo|genero)'/.test(fonte));
  // Cartão da lista: área, função, turno, experiência; sem ranking (mais novo primeiro).
  const card = ok(await anon('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false })).anuncios.find((a) => a.id === v2.id);
  assert.deepEqual([card.area, card.funcao, card.turno, card.experiencia], [{ slug: 'cozinha', nome: 'Cozinha e restaurante' }, 'Cozinheiro(a)', 'noite', '1_a_3']);
  // Pessoa: até 3 áreas de interesse; a lista abre nelas (feed e mural com login); "areas": [] mostra tudo.
  const p = await contaVagas('pessoa');
  const dados = pessoaDados({ cidade: 'canta-rr', zona: 'cidade-toda', nome: 'Lia Moura Santos', whatsapp: '95 98777-6655' });
  erro(await de(p)('vagas_pessoa_salvar', Object.assign({}, dados, { areas: ['caixa', 'cozinha', 'saude', 'rh'] })), 'Escolha até 3 áreas de interesse.');
  const salva = ok(await de(p)('vagas_pessoa_salvar', Object.assign({}, dados, { areas: ['cozinha', 'astronauta'] })));
  assert.deepEqual(salva.pessoa.areas, ['cozinha'], 'área fora da lista é ignorada');
  ok(await de(p)('vagas_pessoa_salvar', dados));
  assert.deepEqual(ok(await de(p)('vagas_pessoa_minha')).pessoa.areas, ['cozinha'], 'sem a chave, as áreas ficam como estavam');
  const feed = ok(await de(p)('vagas_feed', {}));
  assert.deepEqual([feed.anuncios.map((a) => a.id), feed.areasAplicadas, feed.areasPadrao], [[v2.id], ['cozinha'], true]);
  const mural = ok(await de(p)('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false }));
  assert.deepEqual([mural.anuncios.map((a) => a.id), mural.areasPadrao], [[v2.id], true]);
  assert.equal(ok(await de(p)('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false, areas: [] })).anuncios.length, 5);
  assert.equal(ok(await anon('vagas_anuncios_publicos', { cidade: 'canta-rr', entorno: false })).areasPadrao, false, 'sem login, sem padrão');
  S.canta = { conta, emp, pessoa: p, v1 };
});

test('foto OPCIONAL: bucket privado; a pessoa grava só a própria; ninguém lê direto; URL só para a empresa do Combinou (Edge Function)', async () => {
  exigirBanco();
  const bucket = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'vagas-fotos'`)).rows[0];
  assert.deepEqual(bucket, { public: false, file_size_limit: '1048576', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
  const gravar = (uid, nome) => como('authenticated', uid, `insert into storage.objects (bucket_id, name, owner) values ('vagas-fotos', $1, $2)`, [nome, uid]);
  const ver = async (papel, uid) => (await como(papel, uid, `select name from storage.objects where bucket_id = 'vagas-fotos'`)).rows.map((r) => r.name);
  await gravar(S.pessoa, S.pessoa + '/foto.jpg');
  await rejeita(gravar(S.pessoa, S.pessoa2 + '/foto.jpg'), /row-level security/);
  await rejeita(gravar(S.pessoa, S.pessoa + '/outra.jpg'), /row-level security/);
  await rejeita(gravar(S.empresaConta, S.empresaConta + '/foto.jpg'), /row-level security/, 'conta de empresa não grava foto');
  await rejeita(como('anon', null, `insert into storage.objects (bucket_id, name) values ('vagas-fotos', 'x/foto.jpg')`), /row-level security/);
  assert.deepEqual(await ver('authenticated', S.pessoa), [S.pessoa + '/foto.jpg'], 'a pessoa vê a própria');
  for (const uid of [S.pessoa2, S.empresaConta, S.operador, S.adminDisc]) assert.deepEqual(await ver('authenticated', uid), [], uid);
  assert.deepEqual(await ver('anon', null), []);
  assert.equal((await como('authenticated', S.pessoa2, `delete from storage.objects where bucket_id = 'vagas-fotos'`)).rowCount, 0);
  // A ficha da pessoa diz que tem foto; o cartão cego nunca fala de foto.
  const minha = ok(await de(S.pessoa)('vagas_pessoa_minha'));
  assert.equal(minha.pessoa.temFoto, true);
  assert.ok(!/foto/i.test(JSON.stringify(minha.cartao)));
  assert.ok(!/foto/i.test(JSON.stringify(ok(await de(S.empresaConta)('vagas_cartoes', S.anuncios.conf, {})))));
  // Depois do Combinou, a empresa daquela candidatura sabe que há foto e pede a URL pela Edge Function (vagas_conta_foto confere).
  assert.equal(ok(await de(S.empresaConta)('vagas_contato_pessoa', S.cand)).pessoa.temFoto, true);
  assert.deepEqual(ok(await servico('vagas_conta_foto', S.empresaConta, S.cand)), { ok: true, caminho: S.pessoa + '/foto.jpg' });
  erro(await servico('vagas_conta_foto', null, S.cand), 'Sessão expirada. Entre de novo.');
  erro(await servico('vagas_conta_foto', S.empresaB.conta, S.cand), 'Candidatura não encontrada.');
  erro(await servico('vagas_conta_foto', S.pessoa2, S.cand), 'Candidatura não encontrada.');
  erro(await servico('vagas_conta_foto', S.operador, S.cand), 'Candidatura não encontrada.');
  const antes = (await db.query(`select id from public.vagas_candidaturas where pessoa_id = $1 and status = 'agora_nao' limit 1`, [S.pessoa2])).rows[0].id;
  await gravar(S.pessoa2, S.pessoa2 + '/foto.jpg');
  erro(await servico('vagas_conta_foto', S.empresaConta, antes), 'A foto só aparece depois do Combinou.');
  ok(await de(S.pessoa)('vagas_cortar_acesso', S.cand));
  erro(await servico('vagas_conta_foto', S.empresaConta, S.cand), 'A pessoa deixou de compartilhar o contato com a sua empresa.');
  ok(await de(S.pessoa)('vagas_combinar', S.cand));
  // A própria foto; sem foto; ninguém além da service_role executa a função.
  assert.deepEqual(ok(await servico('vagas_conta_foto', S.pessoa, null)), { ok: true, caminho: S.pessoa + '/foto.jpg' });
  erro(await servico('vagas_conta_foto', S.canta.pessoa, null), 'Sem foto.');
  await rejeita(como('authenticated', S.empresaConta, `select public.vagas_conta_foto($1, $2)`, [S.empresaConta, S.cand]), /permission denied/);
  await rejeita(como('anon', null, `select public.vagas_conta_foto(null, null)`), /permission denied/);
  // Apagou a foto: não há mais URL.
  await como('authenticated', S.pessoa, `delete from storage.objects where bucket_id = 'vagas-fotos' and name = $1`, [S.pessoa + '/foto.jpg']);
  assert.equal(ok(await de(S.pessoa)('vagas_pessoa_minha')).pessoa.temFoto, false);
  erro(await servico('vagas_conta_foto', S.empresaConta, S.cand), 'Esta pessoa não pôs foto.');
});

test('limites: Quero 30/dia, mensagens, contas (por origem, por e-mail, total) — sem revelar nada', async () => {
  exigirBanco();
  // vagas_conta_limite (só a service_role): 5 cadastros por hora por origem; 3 por hora por e-mail.
  const lim = (acao, n, email) => servico('vagas_conta_limite', acao, '', '198.51.100.' + n, email || '', null);
  for (let i = 0; i < 5; i++) ok(await lim('cadastrar', 7, 'x' + i + '@a.com'));
  erro(await lim('cadastrar', 7, 'y@a.com'), 'Muitas tentativas. Tente de novo mais tarde.');
  ok(await lim('cadastrar', 8, 'y@a.com'));
  for (let i = 0; i < 3; i++) ok(await lim('esqueci', 20 + i, 'mesmo@a.com'));
  erro(await lim('esqueci', 30, 'MESMO@a.com'), 'Muitas tentativas. Tente de novo mais tarde.');
  erro(await servico('vagas_conta_limite', 'apagar_tudo', '', '', '', null), 'Ação desconhecida.');
  // A chave do e-mail é um hash (o e-mail não fica no contador).
  assert.equal((await db.query(`select count(*)::int n from public.vagas_limites where chave like '%@%'`)).rows[0].n, 0);
  // Consulta e "quem" (só para a função).
  const c = ok(await servico('vagas_conta_consultar', 'PESSOA1@vagas.teste'));
  assert.equal(c.existe, false);
  const emailP = (await db.query(`select email from auth.users where id = $1`, [S.pessoa])).rows[0].email;
  const c2 = ok(await servico('vagas_conta_consultar', emailP.toUpperCase()));
  assert.deepEqual([c2.existe, c2.produto, c2.confirmada, c2.conta.tipo, c2.admin], [true, 'vagas', true, 'pessoa', false]);
  const q = ok(await servico('vagas_conta_quem', S.operador));
  assert.deepEqual(q.operador, [{ cidade: 'boa-vista-rr', papel: 'operador' }]);
  await rejeita(como('authenticated', S.pessoa, `select public.vagas_conta_consultar('x@y.com')`), /permission denied/);
  await rejeita(como('anon', null, `select public.vagas_conta_registrar(gen_random_uuid(), '{}'::jsonb)`), /permission denied/);
  // Quero: 30 por dia.
  const p3 = await contaVagas('pessoa');
  ok(await de(p3)('vagas_pessoa_salvar', pessoaDados({ nome: 'Ana Clara Dias', whatsapp: '95 98222-3333' })));
  await db.query(`insert into public.vagas_limites (tipo, chave) select 'quero', $1 from generate_series(1, 30)`, [p3]);
  erro(await de(p3)('vagas_quero', S.anuncios.a1), 'Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.');
});

test('cadastro assistido: conta pendente até a pessoa confirmar; operador não lê nada da pessoa depois', async () => {
  exigirBanco();
  const novo = await usuarioAuth('assistida@vagas.teste', { app: { produto: 'vagas', tipo: 'pessoa', assistido: true }, confirmado: false });
  ok(await servico('vagas_conta_registrar', novo, { tipo: 'pessoa', assistidaPor: S.operador, cidade: 'boa-vista-rr', codigoEvento: 'MUTIRAO-01' }));
  const conta = (await db.query(`select status, assistida_por, codigo_evento from public.vagas_contas where user_id = $1`, [novo])).rows[0];
  assert.deepEqual(conta, { status: 'pendente', assistida_por: S.operador, codigo_evento: 'MUTIRAO-01' });
  erro(await de(novo)('vagas_pessoa_salvar', pessoaDados()), 'Confirme seu e-mail pelo link que enviamos antes de continuar.');
  const log = (await db.query(`select papel, acao from public.vagas_moderacao where alvo_id = $1`, [novo])).rows;
  assert.deepEqual(log, [{ papel: 'operador', acao: 'cadastro_assistido' }]);
  // A pessoa confirma pelo link (e-mail confirmado) e usa a conta; o operador continua sem ver nada dela.
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [novo]);
  ok(await de(novo)('vagas_pessoa_salvar', pessoaDados({ nome: 'Rosa Maria Alves', whatsapp: '95 98444-5555' })));
  assert.equal((await como('authenticated', S.operador, `select count(*)::int n from public.vagas_pessoas where user_id = $1`, [novo])).rows[0].n, 0);
  const resumo = ok(await de(S.operador)('vagas_op_resumo'));
  assert.ok(!JSON.stringify(resumo).includes('Rosa'));
  assert.equal(resumo.cidades[0].slug, 'boa-vista-rr');
  assert.ok(resumo.cidades[0].contagens.pessoas >= 3);
});

test('exportar os próprios dados e o gancho dos selos no cartão (migração dos testes)', async () => {
  exigirBanco();
  const exp = ok(await de(S.pessoa)('vagas_exportar_meus_dados'));
  assert.equal(exp.conta.tipo, 'pessoa');
  assert.equal(exp.pessoa.nome, 'Maria Fernanda Souza');
  assert.ok(exp.candidaturas.length >= 2);
  assert.ok(exp.mensagensEnviadas.some((m) => /disponibilidade/.test(m.texto)));
  assert.ok(exp.acessosAoContato.length >= 2);
  assert.ok(exp.referenciasRecebidas.length >= 1);
  // Gancho: com vagas_interno.selos_cartao, o cartão passa a mostrar os selos (nunca filtro: "temSelo" é ignorado).
  await db.query(`create function vagas_interno.selos_cartao(p uuid) returns jsonb language sql stable as $$
    select case when p = '${S.pessoa}'::uuid then '[{"teste":"atendimento","nome":"Atendimento e recepção","nota":82,"data":"2026-10-10","codigo":"K7M2QX9A","validoAte":"2027-10-10","supervisao":"online"}]'::jsonb else '[]'::jsonb end $$`);
  try {
    const cartao = ok(await de(S.pessoa)('vagas_pessoa_minha')).cartao;
    assert.equal(cartao.selos.length, 1);
    assert.equal(cartao.selos[0].nota, 82);
    assert.equal(ok(await de(S.empresaB.conta)('vagas_cartoes', (await db.query(`select anuncio_id from public.vagas_candidaturas
      where pessoa_id = $1 and empresa_id = $2`, [S.pessoa, S.empresaB.id])).rows[0].anuncio_id, { temSelo: true })).total, 1);
  } finally {
    await db.query(`drop function vagas_interno.selos_cartao(uuid)`);
  }
  assert.deepEqual(ok(await de(S.pessoa)('vagas_pessoa_minha')).cartao.selos, []);
});

// ---------------------------------------------------------------------------------------------------------------------
// Correções da revisão independente de segurança (B1..B3, I1..I10) e de código (#6, #8, E(e)).
// ---------------------------------------------------------------------------------------------------------------------

// Dois clientes a mais para os testes de concorrência (cada um numa transação própria, como duas requisições).
async function cliente() { const c = pg.getPgClient(); await c.connect(); return c; }
async function rpcEm(cli, papel, uid, fn, args) {
  const lista = args || [];
  const marcas = lista.map((_, i) => '$' + (i + 1)).join(', ');
  await cli.query('begin');
  try {
    await cli.query(`set local role ${papel}`);
    await cli.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    const r = await cli.query(`select public.${fn}(${marcas}) as r`, lista.map(js));
    await cli.query('commit');
    return r.rows[0].r;
  } catch (err) { await cli.query('rollback'); throw err; }
}
const tenta = (p) => p.then((r) => ({ r }), (e) => ({ excecao: String(e.message) }));
const emailDe = async (uid) => (await db.query(`select email from auth.users where id = $1`, [uid])).rows[0].email;

test('revisão B1: oferecer referência por e-mail é indistinguível com ou sem conta — resposta, "restantes30Dias" e limite de 20', async () => {
  exigirBanco();
  const conta = await contaVagas('empresa');
  const emp = ok(await de(conta)('vagas_empresa_cadastrar', { cnpj: cnpjCom('990011220001'), razaoSocial: 'Loja Sonda Ltda', cidade: 'boa-vista-rr' })).empresa.id;
  ok(await de(S.operador)('vagas_op_empresa_decidir', emp, 'aprovar', ''));
  const base = { empresaId: emp, funcao: 'Caixa', vinculo: 'clt', inicio: '2024-01', fim: '', pontosFortes: ['caixa_certo'], recomendaPara: [], texto: '', declaracao: true };
  const restantes = async () => ok(await de(conta)('vagas_referencias_empresa', emp)).restantes30Dias;
  const antes = await restantes();
  const semConta = await de(conta)('vagas_referencia_oferecer', Object.assign({}, base, { email: 'ninguem@nao-existe.teste' }));
  const depois1 = await restantes();
  const comConta = await de(conta)('vagas_referencia_oferecer', Object.assign({}, base, { email: (await emailDe(S.pessoa2)).toUpperCase() }));
  const depois2 = await restantes();
  assert.deepEqual([semConta, comConta], [{ ok: true, enviada: true }, { ok: true, enviada: true }]);
  assert.deepEqual([antes, depois1, depois2], [20, 20, 20], 'o contador não cai com a pendente por e-mail');
  assert.equal(ok(await de(conta)('vagas_referencias_empresa', emp)).referencias.length, 0);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_referencias where empresa_id = $1`, [emp])).rows[0].n, 1, 'a pendente existe, mas invisível');
  // No limite de 20 (20 referências visíveis em 30 dias): a resposta por e-mail continua a mesma, com ou sem conta, e nada é gravado.
  for (let i = 0; i < 20; i++) {
    const p = await contaVagas('pessoa');
    await db.query(`insert into public.vagas_referencias (empresa_id, pessoa_id, funcao, vinculo, inicio, pontos_fortes, declaracao, origem, status, aceita_em)
      values ($1, $2, 'Caixa', 'clt', '2024-01-01', array['caixa_certo'], true, 'candidatura', 'aceita', now())`, [emp, p]);
  }
  assert.equal(await restantes(), 0);
  const n0 = (await db.query(`select count(*)::int n from public.vagas_referencias where empresa_id = $1`, [emp])).rows[0].n;
  assert.deepEqual(await de(conta)('vagas_referencia_oferecer', Object.assign({}, base, { email: 'outro@nao-existe.teste' })), { ok: true, enviada: true });
  assert.deepEqual(await de(conta)('vagas_referencia_oferecer', Object.assign({}, base, { email: await emailDe(S.pessoa) })), { ok: true, enviada: true });
  assert.equal((await db.query(`select count(*)::int n from public.vagas_referencias where empresa_id = $1`, [emp])).rows[0].n, n0, 'no limite nada é gravado');
  assert.equal(await restantes(), 0);
  S.empresaSonda = { conta, id: emp };
});

test('revisão B2: empresa suspensa pela moderação não lê contato nem foto e não escreve na conversa', async () => {
  exigirBanco();
  const emp = de(S.empresaB.conta);
  ok(await emp('vagas_contato_pessoa', S.empresaB.cand));
  ok(await de(S.operador)('vagas_op_empresa_decidir', S.empresaB.id, 'suspender', 'Golpe confirmado'));
  const ct = await emp('vagas_contato_pessoa', S.empresaB.cand);
  erro(ct, 'Esta empresa está suspensa. Fale com a Gestão sem Caos.');
  assert.equal(ct.suspensa, true);
  const foto = await servico('vagas_conta_foto', S.empresaB.conta, S.empresaB.cand);
  erro(foto, 'Esta empresa está suspensa. Fale com a Gestão sem Caos.');
  assert.equal(foto.suspensa, true);
  assert.equal(ok(await emp('vagas_conversa', S.empresaB.cand)).podeEscrever, false);
  erro(await emp('vagas_mensagem_enviar', S.empresaB.cand, 'Ainda aqui?', null), 'Esta vaga está fora do ar.');
  ok(await de(S.operador)('vagas_op_empresa_decidir', S.empresaB.id, 'reativar', ''));
  ok(await emp('vagas_contato_pessoa', S.empresaB.cand));
  assert.equal(ok(await emp('vagas_conversa', S.empresaB.cand)).podeEscrever, true);
});

test('revisão B3: a operação só vincula conta a empresa SEM membro ativo (cadastro assistido); com membro, só pelo painel da empresa', async () => {
  exigirBanco();
  const contaOp = await contaVagas('empresa');
  const emailOp = await emailDe(contaOp);
  const JA_TEM = 'Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.';
  erro(await de(S.operador)('vagas_op_vincular_membro', S.empresaB.id, emailOp), JA_TEM);
  erro(await de(S.adminDisc)('vagas_op_vincular_membro', S.empresaB.id, emailOp), JA_TEM);
  erro(await de(contaOp)('vagas_contato_pessoa', S.empresaB.cand), 'Candidatura não encontrada.');
  assert.equal((await db.query(`select count(*)::int n from public.vagas_empresa_membros where empresa_id = $1 and user_id = $2`, [S.empresaB.id, contaOp])).rows[0].n, 0);
  // Empresa cadastrada pela operação, ainda sem ninguém: vincula (dono); repetir não muda; uma segunda conta já não entra.
  const nova = ok(await de(S.operador)('vagas_op_empresa_cadastrar', { cnpj: cnpjCom('556677880001'), razaoSocial: 'Assistida Ltda', cidade: 'boa-vista-rr' })).empresa.id;
  assert.equal(ok(await de(S.operador)('vagas_op_vincular_membro', nova, emailOp)).membro.papel, 'dono');
  assert.equal(ok(await de(S.operador)('vagas_op_vincular_membro', nova, emailOp)).membro.papel, 'dono');
  const outra = await contaVagas('empresa');
  erro(await de(S.operador)('vagas_op_vincular_membro', nova, await emailDe(outra)), JA_TEM);
  S.assistida = { id: nova, conta: contaOp };
});

test('revisão I1/I2: nenhuma RPC lança erro cru; toques duplos (Quero, Combinou, oferta de referência) não quebram nem duplicam', async () => {
  exigirBanco();
  ok(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr', depois: '2026-99-99T00:00:00.000000Z_' + S.anuncios.a1 }));
  erro(await de(S.adminDisc)('vagas_adm_operador_salvar', { cidade: 'boa-vista-rr', email: await emailDe(S.operador), repassePercentual: '1e400' }),
    'Percentual de repasse inválido (0 a 100).');
  const c1 = await cliente();
  const c2 = await cliente();
  try {
    const p = await contaVagas('pessoa');
    ok(await de(p)('vagas_pessoa_salvar', pessoaDados({ nome: 'Joana Toque Duplo', whatsapp: '95 98777-6666' })));
    // Quero ×2 ao mesmo tempo: uma candidatura, as duas respostas {ok:true} (uma delas "duplicado").
    const q = await Promise.all([tenta(rpcEm(c1, 'authenticated', p, 'vagas_quero', [S.anuncios.a1])), tenta(rpcEm(c2, 'authenticated', p, 'vagas_quero', [S.anuncios.a1]))]);
    assert.ok(q.every((x) => x.r && x.r.ok === true), JSON.stringify(q));
    assert.equal(q.filter((x) => x.r.duplicado).length, 1);
    const cand = q[0].r.candidatura.id;
    assert.equal((await db.query(`select count(*)::int n from public.vagas_candidaturas where pessoa_id = $1 and anuncio_id = $2`, [p, S.anuncios.a1])).rows[0].n, 1);
    // Combinou ×2: um Combinou e um "duplicado"; UMA mensagem de sistema.
    ok(await de(S.empresaConta)('vagas_empresa_decidir', cand, 'conversar'));
    const cb = await Promise.all([tenta(rpcEm(c1, 'authenticated', p, 'vagas_combinar', [cand])), tenta(rpcEm(c2, 'authenticated', p, 'vagas_combinar', [cand]))]);
    assert.ok(cb.every((x) => x.r && x.r.ok === true && x.r.candidatura.status === 'combinou'), JSON.stringify(cb));
    assert.deepEqual(cb.map((x) => x.r.duplicado).sort(), [false, true]);
    const msgs = (await db.query(`select m.texto from public.vagas_mensagens m join public.vagas_conversas v on v.id = m.conversa_id
      where v.candidatura_id = $1 and m.autor = 'sistema'`, [cand])).rows;
    assert.equal(msgs.filter((m) => /^Combinou!/.test(m.texto)).length, 1);
    // Oferta de referência ×2 (mesma empresa, mesma pessoa): uma referência; a outra resposta é {ok:false} com a frase de sempre (ou "duplicado" por ordem).
    const base = { empresaId: S.empresa, candidaturaId: cand, funcao: 'Atendente', vinculo: 'clt', inicio: '2024-01', fim: '', pontosFortes: ['atendimento'], recomendaPara: [], texto: '', declaracao: true };
    const of = await Promise.all([tenta(rpcEm(c1, 'authenticated', S.empresaConta, 'vagas_referencia_oferecer', [base])), tenta(rpcEm(c2, 'authenticated', S.empresaConta, 'vagas_referencia_oferecer', [base]))]);
    assert.ok(of.every((x) => x.r), 'nenhuma exceção crua: ' + JSON.stringify(of));
    assert.ok(of.some((x) => x.r.ok === true));
    for (const x of of) if (!x.r.ok) assert.match(x.r.erro, /^Sua empresa já deu referência para esta pessoa/);
    assert.equal((await db.query(`select count(*)::int n from public.vagas_referencias where empresa_id = $1 and pessoa_id = $2`, [S.empresa, p])).rows[0].n, 1);
    S.pessoaToque = { id: p, cand };
  } finally {
    await c1.end();
    await c2.end();
  }
});

test('revisão I3 (veto P3 nos cartões): "temSelo" é ignorado — o selo é só informação no cartão', async () => {
  exigirBanco();
  const p = S.pessoaToque.id;
  await db.query(`create function vagas_interno.selos_cartao(p uuid) returns jsonb language sql stable as $$
    select case when p = '${p}'::uuid then '[{"teste":"atendimento","nome":"Atendimento","nota":82,"data":"2026-10-10","codigo":"K7M2QX9A","validoAte":"2027-10-10","supervisao":"online"}]'::jsonb else '[]'::jsonb end $$`);
  try {
    ok(await de(S.pessoa2)('vagas_quero', S.anuncios.a1));
    const sem = ok(await de(S.empresaConta)('vagas_cartoes', S.anuncios.a1, {}));
    const com = ok(await de(S.empresaConta)('vagas_cartoes', S.anuncios.a1, { temSelo: true }));
    assert.ok(sem.total >= 2);
    assert.equal(com.total, sem.total, 'nenhum cartão some com temSelo');
    assert.deepEqual(com.cartoes.map((c) => c.candidaturaId), sem.cartoes.map((c) => c.candidaturaId));
    assert.equal(sem.cartoes.filter((c) => c.cartao.selos.length).length, 1, 'o selo continua no cartão de quem tem');
    assert.ok(!/temSelo|v_selo/.test((await db.query(`select prosrc from pg_proc where proname = 'vagas_cartoes'`)).rows[0].prosrc.replace(/--[^\n]*/g, '')));
  } finally {
    await db.query(`drop function vagas_interno.selos_cartao(uuid)`);
  }
});

test('revisão I4: pré-registro por terceiro — conta pendente troca de tipo; consentimento só depois do clique no link', async () => {
  exigirBanco();
  const vitima = await usuarioAuth('vitima@vagas.teste', { app: { produto: 'vagas', tipo: 'empresa' }, confirmado: false });
  const consent = async () => (await db.query(`select tipo, versao from public.vagas_consentimentos where user_id = $1 order by id`, [vitima])).rows;
  const conta = async () => (await db.query(`select tipo, status, termos_versao, termos_aceitos_em from public.vagas_contas where user_id = $1`, [vitima])).rows[0];
  ok(await servico('vagas_conta_registrar', vitima, { tipo: 'empresa', termosVersao: '2026-10-13' }));
  assert.deepEqual(await conta(), { tipo: 'empresa', status: 'pendente', termos_versao: '2026-10-13', termos_aceitos_em: null });
  assert.deepEqual(await consent(), [], 'nenhum consentimento antes do clique');
  // A pessoa dona do e-mail cadastra de novo como pessoa: o tipo muda (ainda pendente).
  assert.equal(ok(await servico('vagas_conta_registrar', vitima, { tipo: 'pessoa', termosVersao: '2026-10-13' })).tipo, 'pessoa');
  assert.equal((await conta()).tipo, 'pessoa');
  erro(await de(vitima)('vagas_eu'), 'Confirme seu e-mail pelo link que enviamos antes de continuar.');
  assert.deepEqual(await consent(), []);
  // Clique no link (e-mail confirmado): conta ativa, consentimento gravado agora.
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [vitima]);
  const eu = ok(await de(vitima)('vagas_eu'));
  assert.deepEqual([eu.conta.tipo, eu.conta.status, eu.conta.termosVersao], ['pessoa', 'ativa', '2026-10-13']);
  assert.ok(eu.conta.termosAceitosEm);
  assert.deepEqual(await consent(), [{ tipo: 'termos', versao: '2026-10-13' }, { tipo: 'privacidade', versao: '2026-10-13' }]);
  assert.ok((await conta()).termos_aceitos_em);
  // Confirmada: o tipo não muda mais.
  erro(await servico('vagas_conta_registrar', vitima, { tipo: 'empresa' }), 'Este e-mail já tem uma conta de outro tipo.');
  assert.equal((await conta()).tipo, 'pessoa');
});

test('revisão I5/I8: exportar traz pulos e denúncias feitas; lista de espera com contador aproximado e saída pelo e-mail', async () => {
  exigirBanco();
  const exp = ok(await de(S.pessoa)('vagas_exportar_meus_dados'));
  assert.ok(exp.pulos.length >= 1 && exp.pulos[0].anuncio.codigo && exp.pulos[0].em);
  assert.ok(exp.denunciasFeitas.length >= 2 && exp.denunciasFeitas.every((d) => d.alvo && d.motivo && d.status));
  // Lista de espera: entrar não revela se o e-mail já estava (contador só até o dia anterior, em dezenas).
  const entrar = (email, n) => rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email }], ip(n));
  const n0 = (await db.query(`select count(*)::int n from public.vagas_lista_espera`)).rows[0].n;
  const r1 = ok(await entrar('alvo@espera.teste', 70));
  const r2 = ok(await entrar('alvo@espera.teste', 71));
  const r3 = ok(await entrar('novo@espera.teste', 72));
  assert.deepEqual([r1.interessados, r2.interessados, r3.interessados], [0, 0, 0]);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_lista_espera`)).rows[0].n, n0 + 2);
  const cid = ok(await anon('vagas_cidades_publicas')).cidades.find((c) => c.slug === 'rorainopolis-rr');
  assert.equal(cid.interessados, 0, 'quem entrou hoje não conta');
  const ror = (await db.query(`select id from public.vagas_cidades where slug = 'rorainopolis-rr'`)).rows[0].id;
  await db.query(`insert into public.vagas_lista_espera (cidade_id, email, criado_em) select $1, 'antiga' || g || '@espera.teste', now() - interval '2 days' from generate_series(1, 12) g`, [ror]);
  await db.query(`update public.vagas_lista_espera set criado_em = now() - interval '2 days' where email = 'alvo@espera.teste'`);
  assert.equal(ok(await anon('vagas_cidades_publicas')).cidades.find((c) => c.slug === 'rorainopolis-rr').interessados, 10, '13 até ontem -> dezena');
  assert.equal(ok(await entrar('mais-um@espera.teste', 73)).interessados, 10);
  // Sair: mesma resposta exista ou não o e-mail; o e-mail some.
  const sair = (email, n) => rpcComo('anon', null, 'vagas_lista_espera_sair', [{ cidade: 'rorainopolis-rr', email }], ip(n));
  assert.deepEqual(await sair('ALVO@espera.teste', 74), { ok: true, cidade: 'rorainopolis-rr', removido: true });
  assert.deepEqual(await sair('ninguem@espera.teste', 75), { ok: true, cidade: 'rorainopolis-rr', removido: true });
  assert.equal((await db.query(`select count(*)::int n from public.vagas_lista_espera where email = 'alvo@espera.teste'`)).rows[0].n, 0);
  erro(await sair('x', 76), 'E-mail inválido.');
  erro(await rpcComo('anon', null, 'vagas_lista_espera_sair', [{ cidade: 'nada', email: 'a@b.com' }], ip(77)), 'Cidade não encontrada.');
});

test('revisão I7: a operação não lê quem denunciou (autor, origem) nem quem escreveu a mensagem denunciada', async () => {
  exigirBanco();
  for (const uid of [S.operador, S.moderador, S.adminDisc]) {
    await rejeita(como('authenticated', uid, `select autor, origem from public.vagas_denuncias`), /permission denied/);
    await rejeita(como('authenticated', uid, `select autor_mensagem_user from public.vagas_denuncias`), /permission denied/);
    await rejeita(como('authenticated', uid, `select * from public.vagas_denuncias`), /permission denied/);
    assert.ok((await como('authenticated', uid, `select id, alvo, motivo, detalhe, status from public.vagas_denuncias`)).rows.length >= 1, 'o conteúdo continua legível');
  }
  const priv = async (col) => (await db.query(`select has_column_privilege('authenticated', 'public.vagas_denuncias', $1, 'SELECT') p`, [col])).rows[0].p;
  assert.deepEqual([await priv('autor'), await priv('origem'), await priv('autor_mensagem_user'), await priv('motivo')], [false, false, false, true]);
  assert.ok(!JSON.stringify(ok(await de(S.operador)('vagas_op_denuncias', { status: ['aberta', 'procedente', 'improcedente'] }))).includes('ip4:'));
});

test('revisão I10: quando o último membro ativo exclui a conta, as vagas da empresa saem do ar e as conversas abertas são encerradas', async () => {
  exigirBanco();
  const { id: emp, conta } = S.assistida;
  const vaga = ok(await de(S.operador)('vagas_op_anuncio_salvar', anuncioDados(emp, { funcao: 'Auxiliar de loja', publicar: true }))).anuncio;
  assert.equal(vaga.status, 'publicado');
  const p = S.pessoaToque.id;
  const cand = ok(await de(p)('vagas_quero', vaga.id)).candidatura.id;
  ok(await de(conta)('vagas_mensagem_enviar', cand, 'Olá! Podemos conversar sobre a vaga?', null));
  assert.equal((await db.query(`select status from public.vagas_conversas where candidatura_id = $1`, [cand])).rows[0].status, 'aberta');
  // A dona (único membro) exclui a conta (a Edge Function apaga em auth.users; a cascata chega aos membros).
  await db.query(`delete from auth.users where id = $1`, [conta]);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_empresa_membros where empresa_id = $1`, [emp])).rows[0].n, 0);
  const a = (await db.query(`select status, status_motivo, encerrado_em from public.vagas_anuncios where id = $1`, [vaga.id])).rows[0];
  assert.deepEqual([a.status, a.status_motivo, !!a.encerrado_em], ['encerrado', 'A empresa saiu da plataforma.', true]);
  assert.ok(!(await anon('vagas_anuncios_publicos', { cidade: 'boa-vista-rr' })).anuncios.some((x) => x.id === vaga.id));
  const conv = ok(await de(p)('vagas_conversa', cand));
  assert.equal(conv.conversa.status, 'encerrada');
  assert.equal(conv.podeEscrever, false);
  assert.equal(conv.mensagens[conv.mensagens.length - 1].texto, 'A empresa saiu da plataforma. Esta conversa foi encerrada.');
  assert.deepEqual((await db.query(`select papel, acao from public.vagas_moderacao where alvo_id = $1 and acao = 'empresa_sem_membros'`, [emp])).rows,
    [{ papel: 'sistema', acao: 'empresa_sem_membros' }]);
});

test('revisão #8/#6: a operação devolve a vaga para a empresa corrigir e recusa o cadastro da empresa com motivo; motivo "documento"', async () => {
  exigirBanco();
  const emp = de(S.empresaConta);
  // Vaga de empresa ainda em análise vai para revisão; a operação devolve (rascunho + motivo); a empresa corrige e manda de novo.
  const vaga = ok(await emp('vagas_anuncio_salvar', anuncioDados(S.empresa2, { funcao: 'Ajudante geral', cidade: 'boa-vista-rr', zona: 'zona-sul' }))).anuncio.id;
  assert.equal(ok(await emp('vagas_anuncio_publicar', vaga)).anuncio.status, 'em_revisao');
  erro(await de(S.operador)('vagas_op_anuncio_decidir', vaga, 'devolver', ''), 'Informe o motivo.');
  const dev = ok(await de(S.moderador)('vagas_op_anuncio_decidir', vaga, 'devolver', 'anuncio_sem_valor'));
  assert.deepEqual([dev.anuncio.status, dev.anuncio.statusMotivo, dev.anuncio.noAr], ['rascunho', 'anuncio_sem_valor', false]);
  assert.equal(ok(await emp('vagas_anuncios_empresa', S.empresa2)).anuncios.find((a) => a.id === vaga).statusMotivo, 'anuncio_sem_valor');
  erro(await de(S.operador)('vagas_op_anuncio_decidir', vaga, 'devolver', 'x'), 'Esta vaga não está esperando a moderação.');
  assert.deepEqual((await db.query(`select papel, acao, motivo from public.vagas_moderacao where alvo_id = $1 and acao = 'anuncio_devolver'`, [vaga])).rows,
    [{ papel: 'moderador', acao: 'anuncio_devolver', motivo: 'anuncio_sem_valor' }]);
  ok(await emp('vagas_anuncio_salvar', anuncioDados(S.empresa2, { id: vaga, funcao: 'Ajudante geral', cidade: 'boa-vista-rr', zona: 'zona-sul', salarioDe: 170000 })));
  const de2 = ok(await emp('vagas_anuncio_publicar', vaga)).anuncio;
  assert.deepEqual([de2.status, de2.statusMotivo], ['em_revisao', '']);
  // Empresa em análise recusada: continua em análise, com o motivo (visível para ela); moderador não decide; ativa não é recusável.
  erro(await de(S.operador)('vagas_op_empresa_decidir', S.empresa2, 'recusar', ''), 'Informe o motivo.');
  erro(await de(S.moderador)('vagas_op_empresa_decidir', S.empresa2, 'recusar', 'empresa_cnpj_nao_confere'), 'Sem permissão.');
  const rec = ok(await de(S.operador)('vagas_op_empresa_decidir', S.empresa2, 'recusar', 'empresa_cnpj_nao_confere'));
  assert.deepEqual([rec.empresa.status, rec.empresa.statusMotivo], ['em_analise', 'empresa_cnpj_nao_confere']);
  assert.equal(ok(await emp('vagas_minhas_empresas')).empresas.find((e) => e.id === S.empresa2).statusMotivo, 'empresa_cnpj_nao_confere');
  erro(await de(S.operador)('vagas_op_empresa_decidir', S.empresa, 'recusar', 'x'), 'Só dá para recusar uma empresa em análise.');
  const ap = ok(await de(S.operador)('vagas_op_empresa_decidir', S.empresa2, 'aprovar', ''));
  assert.deepEqual([ap.empresa.status, ap.empresa.statusMotivo], ['ativa', '']);
  // Motivo "documento" (lista fechada igual à de VAGAS_REGRAS.MOTIVOS_DENUNCIA).
  ok(await rpcComo('anon', null, 'vagas_denunciar', [{ alvo: 'anuncio', id: S.anuncios.a1, motivo: 'documento' }], ip(80)));
  const def = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'vagas_denuncias_motivo_check'`)).rows[0].d;
  assert.deepEqual(def.match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)), REGRAS.MOTIVOS_DENUNCIA.map((m) => m.id));
});

test('revisão E(e): o texto da referência é "publicado"/"nao_publicado" — nenhuma RPC devolve "aprovado"; rótulos em VAGAS_REGRAS.TEXTO_STATUS', async () => {
  exigirBanco();
  const def = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'vagas_referencias_texto_status_check'`)).rows[0].d;
  assert.deepEqual(def.match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)), REGRAS.TEXTO_STATUS.map((s) => s.id));
  // A referência por e-mail que a pessoa 2 aceitou tem texto pendente: a moderação publica; a pessoa e a fila veem "publicado".
  const pend = ok(await de(S.moderador)('vagas_op_referencias', { textoStatus: ['pendente'] })).referencias.find((r) => r.empresa.id === S.empresaB.id);
  assert.equal(ok(await de(S.moderador)('vagas_op_referencia_decidir', pend.id, 'aprovar_texto', '')).referencia.textoStatus, 'publicado');
  const minhas = ok(await de(S.pessoa2)('vagas_referencias_minhas'));
  assert.equal(minhas.referencias.find((r) => r.id === pend.id).textoStatus, 'publicado');
  assert.equal(REGRAS.rotulo(REGRAS.TEXTO_STATUS, 'publicado'), 'Texto publicado');
  const fila = ok(await de(S.moderador)('vagas_op_referencias', { textoStatus: ['pendente', 'publicado', 'nao_publicado'] }));
  assert.ok(fila.referencias.some((r) => r.id === pend.id && r.textoStatus === 'publicado'));
  assert.equal(ok(await de(S.moderador)('vagas_op_referencia_decidir', pend.id, 'recusar_texto', 'Fala de família')).referencia.textoStatus, 'nao_publicado');
  assert.deepEqual((await db.query(`select acao from public.vagas_referencia_historico where referencia_id = $1 and acao like 'texto%' order by id`, [pend.id])).rows.map((h) => h.acao),
    ['texto_publicado', 'texto_nao_publicado']);
  // ("recusada" continua: é a resposta da PESSOA à referência, não um julgamento do texto.)
  for (const o of [minhas, fila, ok(await de(S.pessoa2)('vagas_exportar_meus_dados'))]) assert.ok(!/aprovad|reprovad|"recusado"/i.test(JSON.stringify(o)), 'palavra proibida na resposta');
  // Nenhum valor devolvido pelas RPCs usa a palavra (fora da conversão dos dados antigos e dos comentários).
  const sql = ler(ESTA).replace(/--[^\n]*/g, '').replace(/update public\.vagas_referencias set texto_status = case[\s\S]*?;/, '');
  assert.ok(!/'(aprovado|recusado|texto_aprovado|texto_recusado)'/.test(sql));
});

test('reverificação (R1, B3 porta lateral, I8): conta assistida/vinculada não troca de tipo; assistido só entra em empresa sem membro; lista pública com contador aproximado', async () => {
  exigirBanco();
  const JA_TEM = 'Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.';
  const OUTRO_TIPO = 'Este e-mail já tem uma conta de outro tipo.';
  // R1: empresa cadastrada pela operação, dona assistida ainda pendente, vaga assistida no ar.
  const emp = ok(await de(S.operador)('vagas_op_empresa_cadastrar', { cnpj: cnpjCom('223344550001'), razaoSocial: 'Mercearia Assistida Ltda', cidade: 'boa-vista-rr' })).empresa.id;
  const dona = await usuarioAuth('dona-assistida@vagas.teste', { app: { produto: 'vagas', tipo: 'empresa', assistido: true }, confirmado: false });
  ok(await servico('vagas_conta_registrar', dona, { tipo: 'empresa', assistidaPor: S.operador, cidade: 'boa-vista-rr', empresaId: emp }));
  const vaga = ok(await de(S.operador)('vagas_op_anuncio_salvar', anuncioDados(emp, { funcao: 'Balconista', publicar: true }))).anuncio;
  assert.equal(vaga.status, 'publicado');
  // Quem souber o e-mail chama "cadastrar" como pessoa: o banco recusa (a Function mantém o tipo, reenvia o link e responde neutro).
  erro(await servico('vagas_conta_registrar', dona, { tipo: 'pessoa', termosVersao: '2026-10-13' }), OUTRO_TIPO);
  assert.equal((await db.query(`select tipo from public.vagas_contas where user_id = $1`, [dona])).rows[0].tipo, 'empresa');
  assert.equal((await db.query(`select count(*)::int n from public.vagas_empresa_membros where empresa_id = $1 and user_id = $2 and ativo`, [emp, dona])).rows[0].n, 1, 'o vínculo fica');
  assert.equal((await db.query(`select status from public.vagas_anuncios where id = $1`, [vaga.id])).rows[0].status, 'publicado', 'a vaga continua no ar');
  // Convite de operação pendente: idem.
  const op2 = await usuarioAuth('op-pendente@vagas.teste', { app: { produto: 'vagas', tipo: 'operador' }, confirmado: false });
  ok(await servico('vagas_conta_registrar', op2, { tipo: 'operador', assistidaPor: S.adminDisc, operador: { cidade: 'boa-vista-rr', papel: 'moderador' } }));
  erro(await servico('vagas_conta_registrar', op2, { tipo: 'pessoa', termosVersao: '2026-10-13' }), OUTRO_TIPO);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_operadores where user_id = $1`, [op2])).rows[0].n, 1);
  // Conta "solta" (cadastro aberto, sem vínculo, sem confirmar) continua podendo trocar (I4).
  const solta = await usuarioAuth('solta@vagas.teste', { app: { produto: 'vagas', tipo: 'empresa' }, confirmado: false });
  ok(await servico('vagas_conta_registrar', solta, { tipo: 'empresa', termosVersao: '2026-10-13' }));
  assert.equal(ok(await servico('vagas_conta_registrar', solta, { tipo: 'pessoa', termosVersao: '2026-10-13' })).tipo, 'pessoa');
  // B3 (porta lateral): cadastro assistido com empresaId de empresa que JÁ tem membro ativo é recusado; sem membro, entra como dono(a).
  const intruso = await usuarioAuth('intruso@vagas.teste', { app: { produto: 'vagas', tipo: 'empresa', assistido: true }, confirmado: false });
  erro(await servico('vagas_conta_registrar', intruso, { tipo: 'empresa', assistidaPor: S.operador, cidade: 'boa-vista-rr', empresaId: S.empresaB.id }), JA_TEM);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_empresa_membros where user_id = $1`, [intruso])).rows[0].n, 0);
  erro(await servico('vagas_conta_registrar', intruso, { tipo: 'empresa', assistidaPor: S.operador, cidade: 'boa-vista-rr', empresaId: emp }), JA_TEM, 'a assistida já tem a dona pendente');
  const vazia = ok(await de(S.operador)('vagas_op_empresa_cadastrar', { cnpj: cnpjCom('334455660001'), razaoSocial: 'Sem Ninguém Ltda', cidade: 'boa-vista-rr' })).empresa.id;
  ok(await servico('vagas_conta_registrar', intruso, { tipo: 'empresa', assistidaPor: S.operador, cidade: 'boa-vista-rr', empresaId: vazia }));
  assert.deepEqual((await db.query(`select papel, ativo from public.vagas_empresa_membros where empresa_id = $1`, [vazia])).rows, [{ papel: 'dono', ativo: true }]);
  // I8 (sobra): a lista pública de uma cidade em espera devolve o mesmo contador aproximado antes e depois de entrar.
  const antes = await anon('vagas_anuncios_publicos', { cidade: 'rorainopolis-rr' });
  erro(antes, 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  ok(await rpcComo('anon', null, 'vagas_lista_espera_entrar', [{ cidade: 'rorainopolis-rr', email: 'sobra@espera.teste' }], ip(90)));
  const depois = await anon('vagas_anuncios_publicos', { cidade: 'rorainopolis-rr' });
  assert.equal(depois.interessados, antes.interessados, 'entrar na lista não muda o número da lista pública');
  assert.equal(depois.interessados % 10, 0);
  assert.equal(depois.interessados, (await db.query(`select vagas_interno.interessados(id) n from public.vagas_cidades where slug = 'rorainopolis-rr'`)).rows[0].n);
});

test('filtro de textos: o banco (vagas_interno.conferir_texto) e o JS (VAGAS_REGRAS.conferirTexto) dão o MESMO resultado', async () => {
  exigirBanco();
  // A mesma lista de padrões, na mesma ordem.
  const sql = (await db.query(`select tipo, alvo, padrao from vagas_interno.padroes_proibidos() order by ordem`)).rows;
  assert.deepEqual(sql, REGRAS.PADROES.map((p) => ({ tipo: p.tipo, alvo: p.alvo, padrao: p.padrao })));
  for (const ctx of ['anuncio', 'empresa', 'mensagem', 'referencia', 'cartao', 'perfil', 'outro']) {
    assert.deepEqual((await db.query(`select vagas_interno.tipos_do_contexto($1) t`, [ctx])).rows[0].t, REGRAS.tiposDoContexto(ctx), ctx);
  }
  const corpus = [
    'Vaga de caixa, boa aparência', 'BOA APRESENTAÇÃO exigida', 'Exige idade mínima', 'Atendente até 30 anos', 'de 18 a 35 anos',
    'de 2 a 3 anos de experiência', 'Solteira, sem filhos', 'Divorciados não', 'Somente mulheres', 'Apenas para homens', 'sexo masculino',
    'Evangélico de preferência', 'Católica praticante', 'Não aceitamos estrangeiros', 'Somente brasileiros natos', 'Venezuelana com experiência',
    'Sem antecedentes criminais', 'Nada consta', 'Vaga PcD', 'Pessoa com deficiência', 'Boa saúde', 'Plano de saúde e VR',
    'Taxa de inscrição R$ 30', 'Pague R$ 20 pelo kit', 'Faça um depósito', 'Auxiliar de depósito', 'Chave Pix do RH', 'pagamento antecipado',
    'Ligue (95) 99123-4567', 'WhatsApp 95991234567', 'CEP 69.301-000', 'R$ 1.500,00 a R$ 2.000,00', 'rh@empresa.com.br', 'Instagram @lojinha_bv',
    'Veja bit.ly/abc123', 'https://golpe.example/x', 'www.vagas.com.br', 'Acesse lojinha.com.br/vagas', 'Excel avançado.', 'Ensino médio completo.',
    'Me manda seu CPF', 'Envie seus documentos', 'Qual sua senha?', 'Código de verificação: 1234', 'Você tem CNH B?', 'Gosto de trabalhar em equipe',
    'Ótima pessoa, apesar dos filhos', 'Mulher bonita e magra', 'Vaga na cidade de Boa Vista', 'Habilidade com vendas', 'Transfira o valor',
    'Atendimento ao público', 'Carregar peso, trabalho em altura (NR-35)', 'Empresa com mais de 20 anos de mercado', 'Gestante não', 'ÀÁÂÃÄÅÇÉÊÍÓÔÕÚÜÑ ok',
    'Telefone: 3224-5566', 'sem fim de semana', ''
  ];
  const ctxs = ['anuncio', 'mensagem', 'referencia', 'cartao', 'perfil'];
  for (const t of corpus) {
    assert.equal((await db.query(`select vagas_interno.normalizar($1) n`, [t])).rows[0].n, REGRAS.normalizar(t), 'normalizar: ' + t);
    for (const ctx of ctxs) {
      const banco = (await db.query(`select vagas_interno.conferir_texto($1, $2) r`, [t, ctx])).rows[0].r;
      const js = REGRAS.conferirTexto(t, ctx);
      assert.deepEqual(banco, js, ctx + ': ' + t);
    }
  }
  // CNPJ e WhatsApp: mesmas regras.
  for (const c of ['11.222.333/0001-81', '11222333000182', '12.ABC.345/01DE-35', '12ABC34501DE36', '00000000000000', 'abc', cnpjCom('ZZ0000010001')]) {
    assert.equal((await db.query(`select vagas_interno.cnpj_valido($1) v`, [c])).rows[0].v, REGRAS.cnpjValido(c), c);
  }
  for (const w of ['(95) 99123-4567', '95991234567', '5595991234567', '9532245566', '+55 95 3224-5566', '123', '']) {
    assert.equal((await db.query(`select vagas_interno.normalizar_whatsapp($1) v`, [w])).rows[0].v, REGRAS.normalizarWhatsapp(w), w);
  }
});

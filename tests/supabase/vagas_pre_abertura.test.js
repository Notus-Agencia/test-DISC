'use strict';
// Testes da migração 20261024120004_vagas_pre_abertura.sql num Postgres 17 EMBUTIDO, com TODAS as migrações anteriores em
// sequência e esta aplicada duas vezes. Cobre: versão e permissões; a pré-abertura para empresas (cadastro, CNPJ, vaga e
// revisão na cidade em lista de espera; a vaga pronta e invisível em toda leitura pública; nada de Quero; a validade
// contada da abertura, uma vez só); o canal de WhatsApp da cidade; a origem na lista de espera (e no painel, com o "menos
// de 3"); e os limites da lista (entrar e sair separados, por e-mail, por WhatsApp, isca, teto geral e o caminho do
// Turnstile pela Edge Function).
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
const ESTA = '20261024120004_vagas_pre_abertura';
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
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-pre-' + crypto.randomBytes(6).toString('hex'));
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
const MUITAS = 'Muitas tentativas. Tente de novo mais tarde.';
const ORIGENS = ['radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro'];
function cnpjCom(base12) {
  const val = (c) => c.charCodeAt(0) - 48;
  const dv = (t, pesos) => { const r = t.split('').reduce((a, c, i) => a + val(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
function anuncioDados(empresaId, extra) {
  return Object.assign({
    empresaId, area: 'atendimento', funcao: 'Atendente de padaria', modalidade: 'clt',
    descricao: 'Atendimento no balcão, organização das vitrines e apoio no caixa. Escala 6x1 com folga no domingo.',
    turno: 'comercial', experiencia: 'nao_precisa', escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'pre-go', zona: 'centro'
  }, extra || {});
}
function pessoaDados(extra) {
  return Object.assign({
    cidade: 'aberta-go', zona: 'centro', maior18: true, cargos: ['Atendente'], escolaridade: 'medio', turnos: ['manha'],
    cnh: [], modalidades: ['clt'], cursos: [], sobre: '', nome: 'Pessoa de Teste Silva', whatsapp: '62 99123-4567', experiencias: []
  }, extra || {});
}

const S = {};

test('migrações em sequência e esta duas vezes: versão 20261024120004; anon não ganha nada; serviço e ajustes fechados', async () => {
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
  assert.equal((await anon('versao_banco')).versao, 20261024120003);
  for (let i = 0; i < 2; i++) await db.query(ler(ESTA));
  const v = await anon('versao_banco');
  assert.equal(v.versao, 20261024120004);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-2), ['20261024120003_vagas_aviso_reforco', ESTA]);
  assert.deepEqual(await anonDe(), antes, 'anon executa exatamente as mesmas funções');
  await db.query(`alter table public.vagas_lista_espera rename column origem to origem_x`);
  assert.deepEqual((await anon('versao_banco')).faltando, [ESTA]);
  await db.query(`alter table public.vagas_lista_espera rename column origem_x to origem`);
  // Serviço: só service_role (e recusa por dentro, mesmo com EXECUTE dado por engano).
  const priv = (await db.query(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) anon,
    bool_or(has_function_privilege('authenticated', p.oid, 'execute')) aut, bool_and(has_function_privilege('service_role', p.oid, 'execute')) srv
    from pg_proc p where p.proname = 'vagas_conta_lista_espera' and p.pronamespace = 'public'::regnamespace`)).rows[0];
  assert.deepEqual(priv, { anon: false, aut: false, srv: true });
  await rejeita(rpcComo('authenticated', S.admin, 'vagas_conta_lista_espera', [{}, '', '', true]), /permission denied/);
  await db.query(`grant execute on function public.vagas_conta_lista_espera(jsonb, text, text, boolean) to authenticated`);
  erro(await rpcComo('authenticated', S.admin, 'vagas_conta_lista_espera', [{}, '', '', true]), 'Sem permissão.');
  await db.query(`revoke execute on function public.vagas_conta_lista_espera(jsonb, text, text, boolean) from authenticated`);
  assert.equal((await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vagas_interno' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or p.proname like 'vagas\\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).rows, []);
  await rejeita(como('authenticated', S.admin, `select * from vagas_interno.ajustes`), /permission denied/);
  await rejeita(como('anon', null, `select * from vagas_interno.ajustes`), /permission denied/);
  // Lista de espera: só estas colunas (nada de URL, IP ou navegador).
  assert.deepEqual((await db.query(`select column_name c from information_schema.columns where table_schema = 'public'
    and table_name = 'vagas_lista_espera' order by 1`)).rows.map((x) => x.c),
    ['avisado_em', 'aviso_devolvido', 'aviso_enviado_em', 'aviso_tentativas', 'cidade_id', 'criado_em', 'email', 'id', 'origem', 'perfil', 'sair_token_hash',
      'whatsapp', 'whatsapp_avisado_em', 'whatsapp_em']);
});

test('P1: na cidade em lista de espera a empresa se cadastra, tem o CNPJ conferido, cria e publica vaga; a vaga fica pronta e invisível', async () => {
  exigirBanco();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', nome: 'Preabertura', uf: 'GO', status: 'lista_espera', porte: 'pequena' }));
  ok(await de(S.admin)('vagas_adm_zona_salvar', { cidade: 'pre-go', slug: 'centro', nome: 'Centro', bairros: ['Centro'] }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'aberta-go', nome: 'Aberta', uf: 'GO', status: 'ativa', porte: 'pequena' }));
  ok(await de(S.admin)('vagas_adm_zona_salvar', { cidade: 'aberta-go', slug: 'centro', nome: 'Centro', bairros: ['Centro'] }));
  S.op = await contaVagas('operador', { operador: { cidade: 'pre-go', papel: 'operador' } });
  S.dona = await contaVagas('empresa');
  S.emp = ok(await de(S.dona)('vagas_empresa_cadastrar', { cnpj: cnpjCom('777666555001'), razaoSocial: 'Padaria Antecipada Ltda', cidade: 'pre-go', zona: 'centro' })).empresa.id;
  // A operação também cadastra empresa (assistida) na cidade fechada.
  ok(await de(S.op)('vagas_op_empresa_cadastrar', { cnpj: cnpjCom('777666555002'), razaoSocial: 'Mercado Antecipado Ltda', cidade: 'pre-go' }));
  ok(await de(S.op)('vagas_op_empresa_decidir', S.emp, 'aprovar', 'CNPJ conferido'));
  const an = ok(await de(S.dona)('vagas_anuncio_salvar', anuncioDados(S.emp))).anuncio;
  assert.equal(an.aguardaAbertura, false, 'rascunho não aguarda');
  const pub = ok(await de(S.dona)('vagas_anuncio_publicar', an.id));
  assert.equal(pub.emRevisao, true, 'as primeiras vagas passam pela revisão, como em cidade aberta');
  ok(await de(S.op)('vagas_op_anuncio_decidir', an.id, 'publicar', ''));
  const minha = ok(await de(S.dona)('vagas_anuncios_empresa', S.emp)).anuncios.find((x) => x.id === an.id);
  assert.deepEqual([minha.status, minha.noAr, minha.aguardaAbertura, minha.avisoAbertura, minha.expirado],
    ['publicado', false, true, 'Sua vaga entra no ar no dia em que Preabertura abrir.', false]);
  S.an = an.id;
  S.codigo = minha.codigo;
  // Invisível em toda leitura pública; nada de Quero.
  erro(await anon('vagas_anuncios_publicos', { cidade: 'pre-go' }), 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  erro(await anon('vagas_anuncio_publico', S.codigo), 'Vaga não encontrada ou já encerrada.');
  erro(await anon('vagas_anuncio_vista', S.codigo), 'Vaga não encontrada ou já encerrada.');
  S.pessoa = await contaVagas('pessoa');
  ok(await de(S.pessoa)('vagas_pessoa_salvar', pessoaDados()));
  erro(await de(S.pessoa)('vagas_quero', S.an), 'Vaga não encontrada ou já encerrada.');
  assert.ok(!ok(await de(S.pessoa)('vagas_feed', {})).anuncios.some((x) => x.id === S.an));
  assert.equal(ok(await de(S.op)('vagas_op_indicadores', 'pre-go')).indicadores.find((i) => i.chave === 'vagas_ativas').valor, 0);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_candidaturas where anuncio_id = $1`, [S.an])).rows[0].n, 0);
  // Pessoa continua sem cadastro na cidade fechada.
  const p2 = await contaVagas('pessoa');
  erro(await de(p2)('vagas_pessoa_salvar', pessoaDados({ cidade: 'pre-go' })), 'Ainda não chegamos a esta cidade. Entre na lista de espera.');
  // A cidade nas leituras públicas.
  const cid = ok(await anon('vagas_cidades_publicas')).cidades.find((c) => c.slug === 'pre-go');
  assert.deepEqual([cid.preAbertura, cid.aceitaEmpresas, cid.canalWhatsapp], [true, true, null]);
  const aberta = ok(await anon('vagas_cidades_publicas')).cidades.find((c) => c.slug === 'aberta-go');
  assert.deepEqual([aberta.preAbertura, aberta.aceitaEmpresas], [false, true]);
  // Rascunho e pausada continuam fechadas para empresa.
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'rasc-go', nome: 'Rasc', uf: 'GO', status: 'rascunho' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pausa-go', nome: 'Pausa', uf: 'GO', status: 'pausada' }));
  erro(await de(S.dona)('vagas_empresa_cadastrar', { cnpj: cnpjCom('777666555003'), razaoSocial: 'Outra Empresa Ltda', cidade: 'rasc-go' }), 'Escolha a cidade da empresa.');
  erro(await de(S.dona)('vagas_empresa_cadastrar', { cnpj: cnpjCom('777666555003'), razaoSocial: 'Outra Empresa Ltda', cidade: 'pausa-go' }),
    'Ainda não chegamos a esta cidade. Entre na lista de espera.');
});

test('P1: a cidade abre — a vaga entra no ar com publicação e validade contadas da abertura, na mesma transação e uma vez só', async () => {
  exigirBanco();
  // Pré-abertura longa: publicada há 40 dias, prazo vencido antes de abrir.
  await db.query(`update public.vagas_anuncios set publicado_em = now() - interval '40 days', expira_em = now() - interval '10 days' where id = $1`, [S.an]);
  const vaga = async () => (await db.query(`select a.publicado_em, a.expira_em, a.pre_abertura, a.dias_no_ar, c.aberta_em
    from public.vagas_anuncios a join public.vagas_cidades c on c.id = a.cidade_id where a.id = $1`, [S.an])).rows[0];
  assert.equal((await vaga()).pre_abertura, true);
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', status: 'ativa' }));
  const a = await vaga();
  assert.equal(a.pre_abertura, false);
  assert.equal(+a.publicado_em, +a.aberta_em, 'publicada no momento da abertura');
  assert.equal(+a.expira_em - +a.aberta_em, a.dias_no_ar * 86400000, 'validade normal a partir da abertura');
  ok(await anon('vagas_anuncio_publico', S.codigo));
  const minha = ok(await de(S.dona)('vagas_anuncios_empresa', S.emp)).anuncios.find((x) => x.id === S.an);
  assert.deepEqual([minha.noAr, minha.aguardaAbertura, minha.avisoAbertura], [true, false, '']);
  // Salvar "ativa" de novo, ou pausar e reabrir: a vaga que já estava no ar não ganha prazo novo.
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', status: 'ativa' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', status: 'pausada' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', status: 'ativa' }));
  const b = await vaga();
  assert.deepEqual([+b.publicado_em, +b.expira_em, b.pre_abertura], [+a.publicado_em, +a.expira_em, false]);
  // Agora a pessoa se candidata.
  ok(await de(S.pessoa)('vagas_quero', S.an));
});

test('P2: canal de WhatsApp da cidade — só o link de um canal, editado pela equipe, lido nas cidades públicas', async () => {
  exigirBanco();
  const CANAL = 'https://whatsapp.com/channel/0029VaTesteFicticio12345';
  const INVALIDO = 'Link do canal de WhatsApp inválido. Use o link do canal (https://whatsapp.com/channel/...).';
  const salvar = (canal) => de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', canalWhatsapp: canal });
  const publica = async (slug) => ok(await anon('vagas_cidades_publicas')).cidades.find((c) => c.slug === slug);
  for (const ruim of ['https://chat.whatsapp.com/AbCdEf1234567890', 'http://whatsapp.com/channel/0029VaTesteFicticio12345',
    'https://whatsapp.com/channel/curto', 'https://whatsapp.com/channel/0029VaTeste?x=1', 'javascript:alert(1)', 'https://wa.me/5562999999999',
    'https://whatsapp.com.golpe.example/channel/0029VaTesteFicticio12345']) {
    erro(await salvar(ruim), INVALIDO);
  }
  assert.equal(ok(await salvar(' ' + CANAL + '/ ')).cidade.canalWhatsapp, CANAL);
  assert.equal((await publica('pre-go')).canalWhatsapp, CANAL);
  const adm = ok(await de(S.admin)('vagas_adm_cidades')).cidades.find((c) => c.slug === 'pre-go');
  assert.equal(adm.canalWhatsapp, CANAL);
  assert.ok(adm.abertaEm, 'a equipe vê quando a cidade abriu');
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'pre-go', ordem: 5 }));
  assert.equal((await publica('pre-go')).canalWhatsapp, CANAL, 'mudar outra coisa não mexe no canal');
  assert.equal(ok(await salvar('')).cidade.canalWhatsapp, null);
  ok(await salvar(CANAL));
  assert.equal(ok(await salvar(null)).cidade.canalWhatsapp, null);
  erro(await de(S.op)('vagas_adm_cidade_salvar', { slug: 'pre-go', canalWhatsapp: CANAL }), 'Sem permissão.');
  await rejeita(db.query(`update public.vagas_cidades set canal_whatsapp = 'https://golpe.example' where slug = 'pre-go'`), /vagas_cidades_canal_whatsapp_check/);
  assert.equal((await publica('uruacu-go')).canalWhatsapp, null, 'a praça piloto nasce sem canal');
  // Cidade nova com canal já no cadastro.
  assert.equal(ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'canal-go', nome: 'Canal', uf: 'GO', status: 'lista_espera', canalWhatsapp: CANAL })).cidade.canalWhatsapp, CANAL);
});

test('P3 e isca: origem opcional de lista fechada (a primeira fica; o resto vira null); campo "site" preenchido responde igual e não grava', async () => {
  exigirBanco();
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'origem-go', nome: 'Origem', uf: 'GO', status: 'lista_espera', porte: 'pequena' }));
  const entra = (ip, d) => anonIp(ip)('vagas_lista_espera_entrar', Object.assign({ cidade: 'origem-go' }, d));
  const origemDe = async (email) => ((await db.query(`select origem from public.vagas_lista_espera where email = $1`, [email])).rows[0] || {}).origem;
  const normal = ok(await entra(1, { email: 'o1@exemplo.com', origem: 'radio' }));
  assert.deepEqual(Object.keys(normal).sort(), ['cidade', 'interessados', 'ok']);
  assert.equal(await origemDe('o1@exemplo.com'), 'radio');
  assert.deepEqual(await entra(1, { email: 'o1@exemplo.com', origem: 'cartaz' }), normal);
  assert.equal(await origemDe('o1@exemplo.com'), 'radio', 'a primeira origem fica');
  assert.deepEqual(await entra(1, { email: 'o9@exemplo.com' }), normal);
  ok(await entra(1, { email: 'o9@exemplo.com', origem: 'escola' }));
  assert.equal(await origemDe('o9@exemplo.com'), 'escola', 'sem origem antes: a que vier depois entra');
  let i = 0;
  for (const [o, esperado] of [['CARTAZ', 'cartaz'], [' grupo ', 'grupo'], ['canal', 'canal'], ['mutirao', 'mutirao'], ['indicacao', 'indicacao'],
    ['outro', 'outro'], ['facebook', null], ['https://golpe.example/?utm_source=x', null], [123, null], [null, null], ['', null], [{ a: 1 }, null]]) {
    i += 1;
    assert.deepEqual(await entra(1, { email: 'or' + i + '@exemplo.com', origem: o }), normal, JSON.stringify(o));
    assert.equal(await origemDe('or' + i + '@exemplo.com'), esperado, JSON.stringify(o));
  }
  // Isca: igual ao sucesso, nada gravado (nem o e-mail é conferido).
  const total = async () => (await db.query(`select count(*)::int n from public.vagas_lista_espera`)).rows[0].n;
  const antes = await total();
  assert.deepEqual(await entra(2, { email: 'robo@exemplo.com', site: 'http://spam.example' }), normal);
  assert.deepEqual(await entra(2, { email: 'nem-email', whatsapp: '123', site: 'x' }), normal);
  assert.equal(await total(), antes);
  assert.equal(await origemDe('robo@exemplo.com'), undefined);
  // Campo vazio não é isca.
  ok(await entra(2, { email: 'humano@exemplo.com', site: '  ' }));
  assert.equal(await total(), antes + 1);
});

test('limites da lista: entrar (30/h por origem) e sair (10/h por origem) separados; 5/h por e-mail e por WhatsApp; sem revelar quem está', async () => {
  exigirBanco();
  const entra = (ip, d) => anonIp(ip)('vagas_lista_espera_entrar', Object.assign({ cidade: 'origem-go' }, d));
  const sai = (ip, d) => anonIp(ip)('vagas_lista_espera_sair', Object.assign({ cidade: 'origem-go' }, d));
  const bloqueado = (r) => { erro(r, MUITAS); assert.equal(r.bloqueado, true); };
  // Mesma origem: 30 entradas passam, a 31ª não; o sair da mesma origem continua livre.
  for (let n = 0; n < 30; n++) ok(await entra(3, { email: 'ip3-' + n + '@exemplo.com' }));
  bloqueado(await entra(3, { email: 'ip3-x@exemplo.com' }));
  ok(await sai(3, { email: 'ip3-0@exemplo.com' }));
  // Sair: 10 por hora por origem; o entrar da mesma origem continua livre.
  for (let n = 0; n < 9; n++) ok(await sai(4, { email: 'ninguem' + n + '@exemplo.com' }));
  ok(await sai(4, { email: 'ip3-1@exemplo.com' }));
  bloqueado(await sai(4, { email: 'ip3-2@exemplo.com' }));
  ok(await entra(4, { email: 'ip4@exemplo.com' }));
  // Mesmo e-mail de origens diferentes: 5 por hora — exista ou não na lista (a resposta não diz quem está).
  for (let n = 0; n < 5; n++) ok(await entra(10 + n, { email: 'repetido@exemplo.com' }));
  bloqueado(await entra(20, { email: 'repetido@exemplo.com' }));
  for (let n = 0; n < 5; n++) ok(await entra(30 + n, { email: 'repetido@exemplo.com'.replace('repetido', 'novo' + n) }));
  // Mesmo WhatsApp com e-mails e origens diferentes: 5 por hora.
  for (let n = 0; n < 5; n++) ok(await entra(40 + n, { email: 'zap' + n + '@exemplo.com', whatsapp: '62 98111-0001' }));
  bloqueado(await entra(50, { email: 'zap9@exemplo.com', whatsapp: '62 98111-0001' }));
  ok(await entra(51, { email: 'zap9@exemplo.com' }), 'sem o número, entra');
  // As chaves dos limites guardam só o hash do e-mail e do número.
  const chaves = (await db.query(`select distinct tipo, chave from public.vagas_limites where tipo in ('lista_email', 'lista_whats')`)).rows;
  assert.ok(chaves.length > 0 && chaves.every((x) => /^[0-9a-f]{64}$/.test(x.chave)));
});

test('Turnstile: a Edge Function (service_role) grava com o limite maior por origem; com o ajuste ligado, a RPC pública recusa; teto geral', async () => {
  exigirBanco();
  const svc = (d, humano, xff) => servico('vagas_conta_lista_espera', Object.assign({ cidade: 'origem-go' }, d), '', xff, humano);
  for (let n = 0; n < 40; n++) ok(await svc({ email: 'mutirao' + n + '@exemplo.com', origem: 'mutirao' }, true, '203.0.113.50'));
  let r = null;
  for (let n = 0; n < 31; n++) r = await svc({ email: 'semcaptcha' + n + '@exemplo.com' }, false, '203.0.113.51');
  erro(r, MUITAS);
  erro(await svc({ cidade: 'nao-existe-go', email: 'x@exemplo.com' }, true, '203.0.113.52'), 'Cidade não encontrada.');
  // Ajuste ligado: a RPC pública recusa (nada gravado); o caminho da Function continua.
  await db.query(`insert into vagas_interno.ajustes (chave, valor) values ('lista_espera_captcha', 'sim')
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`);
  const c = erro(await anonIp(60)('vagas_lista_espera_entrar', { cidade: 'origem-go', email: 'direto@exemplo.com' }),
    'Confirme que você não é um robô e tente de novo.');
  assert.equal(c.captcha, true);
  assert.equal((await db.query(`select count(*)::int n from public.vagas_lista_espera where email = 'direto@exemplo.com'`)).rows[0].n, 0);
  ok(await svc({ email: 'direto@exemplo.com' }, true, '203.0.113.53'));
  await db.query(`delete from vagas_interno.ajustes where chave = 'lista_espera_captcha'`);
  ok(await anonIp(60)('vagas_lista_espera_entrar', { cidade: 'origem-go', email: 'direto2@exemplo.com' }));
  // Teto geral sem Turnstile (robô espalhado): 1000 por hora; com o Turnstile, não vale.
  await db.query(`insert into public.vagas_limites (tipo, chave) select 'lista_total', '' from generate_series(1, 1000)`);
  erro(await anonIp(61)('vagas_lista_espera_entrar', { cidade: 'origem-go', email: 'teto@exemplo.com' }), MUITAS);
  ok(await svc({ email: 'teto@exemplo.com' }, true, '203.0.113.54'));
  await db.query(`delete from public.vagas_limites where tipo = 'lista_total'`);
});

test('P3 no painel da praça: contagem por origem, com "menos de 3" na cidade protegida e o número cheio na cidade grande', async () => {
  exigirBanco();
  const op = await contaVagas('operador', { operador: { cidade: 'origem-go', papel: 'operador' } });
  const le = async () => ok(await de(op)('vagas_op_indicadores', 'origem-go')).indicadores.find((x) => x.chave === 'lista_espera');
  const reais = Object.fromEntries((await db.query(`select coalesce(l.origem, 'naoInformada') k, count(*)::int n from public.vagas_lista_espera l
    join public.vagas_cidades c on c.id = l.cidade_id where c.slug = 'origem-go' group by 1`)).rows.map((x) => [x.k, x.n]));
  const todas = ORIGENS.concat(['naoInformada']);
  const pequena = await le();
  assert.deepEqual(Object.keys(pequena.detalhe.porOrigem).sort(), todas.slice().sort());
  for (const k of todas) assert.equal(pequena.detalhe.porOrigem[k], (reais[k] || 0) < 3 ? null : reais[k], k);
  assert.equal(pequena.poucos, true);
  assert.ok(reais.mutirao >= 40 && pequena.detalhe.porOrigem.mutirao === reais.mutirao);
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'origem-go', porte: 'grande' }));
  const grande = await le();
  for (const k of todas) assert.equal(grande.detalhe.porOrigem[k], reais[k] || 0, k);
  assert.equal(grande.poucos, false);
});

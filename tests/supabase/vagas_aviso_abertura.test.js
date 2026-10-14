'use strict';
// Testes da migração 20261024120002_vagas_aviso_abertura.sql num Postgres 17 EMBUTIDO, com TODAS as migrações aplicadas em
// sequência e esta aplicada duas vezes. Cobre: versão e permissões; a data de abertura da cidade (gatilho); o lote do aviso
// por e-mail (só a equipe, só cidade ativa, reserva na hora: ninguém recebe duas vezes; quem falhou volta para a fila; quem
// saiu da lista antes não recebe; nada de outra cidade); a fila do WhatsApp (um contato por vez, só a equipe, texto do
// whatsapp.json e link wa.me prontos, cada número mostrado registrado sem o número); e a retenção (sai depois de avisada;
// tudo some 30 dias depois da abertura).
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
const ESTA = '20261024120002_vagas_aviso_abertura';
const ANTES = TODAS.slice(0, TODAS.indexOf(ESTA));
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
const FECHADA = 'A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.';
const WHATS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo', 'vagas-textos', 'whatsapp.json'), 'utf8'))
  .mensagens.find((m) => m.chave === 'lista_espera_cidade_abriu');

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
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-aviso-' + crypto.randomBytes(6).toString('hex'));
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
const marcar = (user, cidade, enviados, falhas) => rpcComo('service_role', null, 'vagas_conta_aviso_marcar', [user, cidade, enviados, falhas]);

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
const linhas = async (slug) => (await db.query(`select l.email, l.perfil, l.whatsapp, l.avisado_em is not null avisado,
  l.whatsapp_avisado_em is not null avisado_whats from public.vagas_lista_espera l join public.vagas_cidades c on c.id = l.cidade_id
  where c.slug = $1 order by l.criado_em, l.id`, [slug])).rows;
const idDe = async (email) => (await db.query(`select id from public.vagas_lista_espera where email = $1`, [email])).rows[0].id;

const S = {};

test('migrações em sequência e esta duas vezes: versão 20261024120002, DISC intacto', async () => {
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
  assert.equal((await rpcComo('anon', null, 'versao_banco', [])).versao, 20261024120001);
  for (let i = 0; i < 2; i++) await db.query(ler(ESTA));
  const v = await rpcComo('anon', null, 'versao_banco', []);
  assert.equal(v.versao, 20261024120002);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-2), ['20261024120001_vagas_piloto_uruacu', ESTA]);
  assert.deepEqual(await anonDe(), antes.concat(['vagas_lista_espera_sair_link']).sort(), 'anon ganha só o link de saída');
  await db.query(`alter table public.vagas_cidades rename column aberta_em to aberta_em_x`);
  assert.deepEqual((await rpcComo('anon', null, 'versao_banco', [])).faltando, [ESTA]);
  await db.query(`alter table public.vagas_cidades rename column aberta_em_x to aberta_em`);
});

test('guardas: funções de serviço só para service_role (e recusam por dentro); as da equipe só para authenticated; internas fechadas', async () => {
  exigirBanco();
  const priv = async (fn) => (await db.query(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) anon,
    bool_or(has_function_privilege('authenticated', p.oid, 'execute')) aut, bool_and(has_function_privilege('service_role', p.oid, 'execute')) srv
    from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [fn])).rows[0];
  for (const fn of ['vagas_conta_aviso_lote', 'vagas_conta_aviso_marcar']) assert.deepEqual(await priv(fn), { anon: false, aut: false, srv: true }, fn);
  for (const fn of ['vagas_adm_aviso_resumo', 'vagas_adm_aviso_whatsapp', 'vagas_adm_aviso_whatsapp_feito']) {
    assert.deepEqual(await priv(fn), { anon: false, aut: true, srv: true }, fn);
  }
  await rejeita(rpcComo('authenticated', S.admin, 'vagas_conta_aviso_lote', [S.admin, 'x-go', 10]), /permission denied/);
  // Mesmo com EXECUTE dado por engano (ex.: a 20261022 aplicada de novo), a função de serviço recusa quem não é o servidor.
  await db.query(`grant execute on function public.vagas_conta_aviso_lote(uuid, text, integer) to authenticated`);
  erro(await rpcComo('authenticated', S.admin, 'vagas_conta_aviso_lote', [S.admin, 'x-go', 10]), 'Sem permissão.');
  await db.query(`revoke execute on function public.vagas_conta_aviso_lote(uuid, text, integer) from authenticated`);
  assert.equal((await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vagas_interno' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'vagas_interno' or p.proname like 'vagas\\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).rows, []);
  // Colunas novas: só estas (nenhum contato novo guardado).
  assert.deepEqual((await db.query(`select table_name || '.' || column_name c from information_schema.columns
    where table_schema = 'public' and table_name like 'vagas\\_%' and column_name in ('aberta_em', 'whatsapp_avisado_em') order by 1`)).rows.map((x) => x.c),
    ['vagas_cidades.aberta_em', 'vagas_lista_espera.whatsapp_avisado_em']);
  await rejeita(como('authenticated', S.admin, `select email from public.vagas_lista_espera`), /permission denied/);
});

test('abertura: lista antes de abrir; o lote e a fila recusam cidade fechada; abrir grava aberta_em (uma vez por abertura)', async () => {
  exigirBanco();
  S.operador = await contaVagas('operador', { operador: { cidade: 'uruacu-go', papel: 'operador' } });
  S.pessoa = await contaVagas('pessoa');
  for (const [slug, status] of [['aviso-go', 'lista_espera'], ['outra-go', 'lista_espera'], ['velha-go', 'lista_espera'], ['caiu-go', 'lista_espera']]) {
    ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug, nome: slug.split('-')[0], uf: 'GO', status, porte: 'pequena' }));
  }
  const entra = (n, d) => anonIp(n)('vagas_lista_espera_entrar', d);
  ok(await entra(1, { cidade: 'aviso-go', email: 'ana@exemplo.com', perfil: 'pessoa', whatsapp: '62 99111-0001' }));
  ok(await entra(2, { cidade: 'aviso-go', email: 'beto@exemplo.com', perfil: 'pessoa' }));
  ok(await entra(3, { cidade: 'aviso-go', email: 'cida@exemplo.com', perfil: 'empresa', whatsapp: '62 99111-0003' }));
  ok(await entra(4, { cidade: 'aviso-go', email: 'davi@exemplo.com', perfil: 'empresa' }));
  ok(await entra(5, { cidade: 'aviso-go', email: 'eva@exemplo.com', perfil: 'pessoa', whatsapp: '62 99111-0005' }));
  ok(await entra(6, { cidade: 'outra-go', email: 'fabio@exemplo.com', perfil: 'pessoa', whatsapp: '62 99111-0006' }));
  ok(await entra(7, { cidade: 'velha-go', email: 'gina@exemplo.com', perfil: 'pessoa', whatsapp: '62 99111-0007' }));
  ok(await entra(8, { cidade: 'velha-go', email: 'hugo@exemplo.com', perfil: 'pessoa' }));
  ok(await entra(9, { cidade: 'caiu-go', email: 'ivo@exemplo.com', perfil: 'pessoa' }));
  ok(await entra(10, { cidade: 'caiu-go', email: 'joana@exemplo.com', perfil: 'pessoa', whatsapp: '62 99111-0010' }));
  // Eva sai da lista ANTES do aviso: não recebe nada.
  ok(await anonIp(11)('vagas_lista_espera_sair', { cidade: 'aviso-go', email: 'eva@exemplo.com' }));
  erro(await lote(S.admin, 'aviso-go', 10), FECHADA);
  erro(await de(S.admin)('vagas_adm_aviso_whatsapp', 'aviso-go'), FECHADA);
  const aberta = async (slug) => (await db.query(`select aberta_em from public.vagas_cidades where slug = $1`, [slug])).rows[0].aberta_em;
  assert.equal(await aberta('aviso-go'), null);
  for (const slug of ['aviso-go', 'velha-go', 'caiu-go']) ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug, status: 'ativa' }));
  const a1 = await aberta('aviso-go');
  assert.ok(a1 && Math.abs(Date.now() - a1.getTime()) < 60000);
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'aviso-go', status: 'ativa', nome: 'aviso' }));
  assert.equal((await aberta('aviso-go')).getTime(), a1.getTime(), 'salvar de novo sem mudar o status não mexe na data');
  const r = ok(await de(S.admin)('vagas_adm_aviso_resumo', 'aviso-go'));
  assert.deepEqual(r.contagens, { naLista: 4, aAvisarEmail: 4, avisadosEmail: 0, aAvisarWhatsapp: 2 });
  assert.equal(Date.parse(r.cidade.listaAte) - Date.parse(r.cidade.abertaEm), 30 * 86400000);
  // Cidade aberta não recebe mais ninguém na lista.
  erro(await entra(12, { cidade: 'aviso-go', email: 'novo@exemplo.com' }), 'Esta cidade já está aberta: faça o seu cadastro.');
});

test('e-mail: só a equipe; lotes reservados na hora (ninguém recebe duas vezes); falha volta para a fila; quem saiu e outra cidade ficam de fora', async () => {
  exigirBanco();
  erro(await lote(S.pessoa, 'aviso-go', 10), 'Sem permissão.');
  erro(await lote(S.operador, 'aviso-go', 10), 'Sem permissão.');
  erro(await lote(null, 'aviso-go', 10), 'Sessão expirada. Entre de novo.');
  erro(await lote(S.admin, 'nao-existe-go', 10), 'Cidade não encontrada.');
  const recebidos = [];
  const l1 = ok(await lote(S.admin, 'AVISO-GO', 2));
  assert.deepEqual(l1.cidade, { slug: 'aviso-go', nome: 'aviso' });
  assert.deepEqual(l1.lote.map((x) => [x.email, x.perfil]), [['ana@exemplo.com', 'pessoa'], ['beto@exemplo.com', 'pessoa']]);
  assert.ok(l1.lote.every((x) => Object.keys(x).sort().join() === 'email,id,perfil,sairToken'), 'só id, e-mail, perfil e o token de saída (nada de WhatsApp)');
  assert.ok(l1.lote.every((x) => /^[0-9a-f]{64}$/.test(x.sairToken)));
  // O token em claro não fica no banco (só o hash).
  const tokens = (await db.query(`select sair_token_hash from public.vagas_lista_espera where sair_token_hash is not null`)).rows.map((x) => x.sair_token_hash);
  assert.ok(l1.lote.every((x) => !tokens.includes(x.sairToken)) && tokens.length >= 2);
  S.tokenAna = l1.lote[0].sairToken;
  assert.deepEqual(l1.contagens, { naLista: 4, aAvisarEmail: 2, avisadosEmail: 2, aAvisarWhatsapp: 2 });
  recebidos.push(...l1.lote);
  // Outra aba ao mesmo tempo (antes de marcar): pega os PRÓXIMOS, nunca os reservados.
  const l2 = ok(await lote(S.admin, 'aviso-go', 50));
  assert.deepEqual(l2.lote.map((x) => x.email), ['cida@exemplo.com', 'davi@exemplo.com']);
  recebidos.push(...l2.lote);
  assert.deepEqual(ok(await lote(S.admin, 'aviso-go', 50)).lote, [], 'tudo reservado: nada para mandar');
  // Beto falhou (volta para a fila); Ana e Cida receberam (ficam só por causa do WhatsApp); Davi recebeu e sai.
  const m1 = ok(await marcar(S.admin, 'aviso-go', [l1.lote[0].id, l2.lote[0].id, l2.lote[1].id], [l1.lote[1].id]));
  assert.deepEqual([m1.enviados, m1.falhas], [3, 1]);
  assert.deepEqual((await linhas('aviso-go')).map((x) => [x.email, x.avisado]),
    [['ana@exemplo.com', true], ['beto@exemplo.com', false], ['cida@exemplo.com', true]]);
  const l3 = ok(await lote(S.admin, 'aviso-go', 50));
  assert.deepEqual(l3.lote.map((x) => x.email), ['beto@exemplo.com']);
  recebidos.push(...l3.lote);
  ok(await marcar(S.admin, 'aviso-go', [l3.lote[0].id], []));
  const fim = ok(await lote(S.admin, 'aviso-go', 50));
  assert.deepEqual([fim.lote, fim.contagens.aAvisarEmail], [[], 0], 'rodar de novo não manda para ninguém');
  // Cada e-mail saiu UMA vez (Beto duas reservas: a primeira falhou); Eva (saiu antes) e a outra cidade, nunca.
  const contagem = recebidos.reduce((o, x) => Object.assign(o, { [x.email]: (o[x.email] || 0) + 1 }), {});
  assert.deepEqual(contagem, { 'ana@exemplo.com': 1, 'beto@exemplo.com': 2, 'cida@exemplo.com': 1, 'davi@exemplo.com': 1 });
  assert.deepEqual((await linhas('outra-go')).map((x) => [x.email, x.avisado]), [['fabio@exemplo.com', false]]);
  // Marcar ids de outra cidade não mexe em nada.
  const fabio = await idDe('fabio@exemplo.com');
  ok(await marcar(S.admin, 'aviso-go', [fabio], [fabio]));
  assert.deepEqual((await linhas('outra-go')).map((x) => x.avisado), [false]);
  // Registro: contagens, nunca e-mail.
  const reg = (await db.query(`select acao, papel, dados::text d from public.vagas_moderacao where acao like 'aviso\\_email%' order by id`)).rows;
  assert.ok(reg.length >= 4 && reg.every((x) => x.papel === 'admin' && !x.d.includes('@')), JSON.stringify(reg));
});

test('WhatsApp: um contato por vez, só para a equipe, texto do whatsapp.json e link wa.me prontos; cada número mostrado fica registrado (sem o número)', async () => {
  exigirBanco();
  for (const quem of [S.operador, S.pessoa]) erro(await de(quem)('vagas_adm_aviso_whatsapp', 'aviso-go'), 'Sem permissão.');
  erro(await de(S.admin)('vagas_adm_aviso_whatsapp', 'outra-go'), FECHADA);
  erro(await de(S.admin)('vagas_adm_aviso_whatsapp', 'nao-existe-go'), 'Cidade não encontrada.');
  const antes = (await db.query(`select count(*)::int n from public.vagas_moderacao where acao = 'aviso_whatsapp_ver'`)).rows[0].n;
  const v1 = ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'aviso-go'));
  const texto = WHATS.texto.replace('{{cidade}}', 'aviso').replace('{{link_cidade}}', 'https://vagas.gestaosemcaos.com.br/cidade.html?cidade=aviso-go');
  assert.deepEqual([v1.contato.whatsapp, v1.contato.perfil, v1.contato.texto], ['5562991110001', 'pessoa', texto]);
  assert.match(v1.contato.link, /^https:\/\/wa\.me\/5562991110001\?text=[A-Za-z0-9%._~-]+$/);
  assert.equal(decodeURIComponent(v1.contato.link.split('?text=')[1]), texto);
  assert.deepEqual(Object.keys(v1.contato).sort(), ['id', 'link', 'perfil', 'texto', 'whatsapp']);
  assert.ok(!JSON.stringify(v1).includes('@'), 'sem e-mail');
  // O mesmo contato até a equipe marcar (não dá para "folhear" a lista).
  assert.equal(ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'aviso-go')).contato.id, v1.contato.id);
  erro(await de(S.operador)('vagas_adm_aviso_whatsapp_feito', v1.contato.id), 'Sem permissão.');
  const f1 = ok(await de(S.admin)('vagas_adm_aviso_whatsapp_feito', v1.contato.id));
  assert.equal(f1.duplicado, false);
  assert.deepEqual((await linhas('aviso-go')).map((x) => x.email), ['cida@exemplo.com'], 'Ana (e-mail e WhatsApp avisados) saiu da lista');
  const v2 = ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'aviso-go'));
  assert.deepEqual([v2.contato.whatsapp, v2.contato.perfil], ['5562991110003', 'empresa']);
  ok(await de(S.admin)('vagas_adm_aviso_whatsapp_feito', v2.contato.id));
  const v3 = ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'aviso-go'));
  assert.deepEqual([v3.contato, v3.contagens], [null, { naLista: 0, aAvisarEmail: 0, avisadosEmail: 0, aAvisarWhatsapp: 0 }]);
  erro(await de(S.admin)('vagas_adm_aviso_whatsapp_feito', v1.contato.id), 'Contato não encontrado.');
  const reg = (await db.query(`select acao, dados::text d, motivo from public.vagas_moderacao where acao like 'aviso\\_whatsapp%' order by id`)).rows;
  assert.equal(reg.filter((x) => x.acao === 'aviso_whatsapp_ver').length - antes, 3, 'cada número mostrado');
  assert.equal(reg.filter((x) => x.acao === 'aviso_whatsapp').length, 2, 'cada "avisei"');
  assert.ok(reg.every((x) => !/9911|5562|@/.test(x.d + x.motivo)), 'sem número nem e-mail no registro');
});

test('retenção: 30 dias depois da abertura a lista some; reserva abandonada (a Function caiu) conta como avisada e sai em 1 hora', async () => {
  exigirBanco();
  // Function caiu no meio do lote: Ivo e Joana ficam reservados (avisado_em) sem confirmação.
  assert.deepEqual(ok(await lote(S.admin, 'caiu-go', 10)).lote.map((x) => x.email), ['ivo@exemplo.com', 'joana@exemplo.com']);
  assert.deepEqual(ok(await lote(S.admin, 'caiu-go', 10)).lote, [], 'ninguém recebe duas vezes, nem depois de uma queda');
  await db.query(`update public.vagas_lista_espera set avisado_em = now() - interval '2 hours'
    where cidade_id = (select id from public.vagas_cidades where slug = 'caiu-go')`);
  assert.equal((await db.query(`select vagas_interno.lista_espera_limpar() n`)).rows[0].n >= 1, true);
  assert.deepEqual((await linhas('caiu-go')).map((x) => x.email), ['joana@exemplo.com'], 'Joana fica: ainda falta o WhatsApp');
  // 30 dias depois da abertura: tudo o que sobrou sai (mesmo sem aviso).
  assert.equal((await linhas('velha-go')).length, 2);
  await db.query(`update public.vagas_cidades set aberta_em = now() - interval '31 days' where slug in ('velha-go', 'caiu-go')`);
  ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'velha-go'));   // a fila também limpa
  assert.deepEqual(await linhas('velha-go'), []);
  await db.query(`select vagas_interno.lista_espera_limpar()`);
  assert.deepEqual(await linhas('caiu-go'), []);
  // Cidade ainda em lista de espera não é tocada pela limpeza.
  assert.equal((await linhas('outra-go')).length, 1);
  // Pausar e reabrir conta a abertura de novo.
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'velha-go', status: 'pausada' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'velha-go', status: 'ativa' }));
  const ab = (await db.query(`select aberta_em from public.vagas_cidades where slug = 'velha-go'`)).rows[0].aberta_em;
  assert.ok(Date.now() - ab.getTime() < 60000);
});

test('sair pelo link do e-mail (token): tira a pessoa sem o e-mail, resposta sempre igual, token não serve duas vezes', async () => {
  exigirBanco();
  const SAIU = { ok: true, removido: true };
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'token-go', nome: 'token', uf: 'GO', status: 'lista_espera', porte: 'pequena' }));
  ok(await anonIp(30)('vagas_lista_espera_entrar', { cidade: 'token-go', email: 'kelly@exemplo.com', whatsapp: '62 99111-0030' }));
  ok(await anonIp(31)('vagas_lista_espera_entrar', { cidade: 'token-go', email: 'leo@exemplo.com' }));
  ok(await de(S.admin)('vagas_adm_cidade_salvar', { slug: 'token-go', status: 'ativa' }));
  const l = ok(await lote(S.admin, 'token-go', 10)).lote;
  ok(await marcar(S.admin, 'token-go', l.map((x) => x.id), []));
  assert.deepEqual((await linhas('token-go')).map((x) => x.email), ['kelly@exemplo.com'], 'Kelly fica: falta o WhatsApp');
  // Kelly não quer o WhatsApp: o link do e-mail tira a linha toda.
  for (const t of ['x', 'f'.repeat(64), '', null]) assert.deepEqual(await rpcComo('anon', null, 'vagas_lista_espera_sair_link', [t]), SAIU);
  assert.equal((await linhas('token-go')).length, 1, 'token errado não mexe em nada');
  assert.deepEqual(await rpcComo('anon', null, 'vagas_lista_espera_sair_link', [l[0].sairToken.toUpperCase()]), SAIU);
  assert.deepEqual(await linhas('token-go'), []);
  assert.deepEqual(await rpcComo('anon', null, 'vagas_lista_espera_sair_link', [l[0].sairToken]), SAIU, 'de novo: igual');
  assert.deepEqual(ok(await de(S.admin)('vagas_adm_aviso_whatsapp', 'token-go')).contato, null, 'não aparece mais na fila do WhatsApp');
});

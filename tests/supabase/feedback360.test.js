'use strict';
// Testes da migração 20261021120000_feedback360.sql (Feedback 360 da Liderança): tabelas sem identificação, RLS (anon não lê
// nada; respostas, comentários, convites e a ligação link → resposta nem o admin lê), criação com o desenho de quem avalia
// quem (teto de 4, mínimo de 3, chefia = quem lidera), link individual (substituir/apagar a própria resposta), nada antes do
// encerramento, ligação link → resposta APAGADA no encerramento, moderação, devolutiva, relatório do líder, visão da chefia
// SÓ com o plano (nunca notas), consolidado com 5 ou mais líderes, retenção — e a CONFERÊNCIA CRUZADA: o cálculo e a
// supressão do banco (disc_interno.f360_calcular) dão exatamente o mesmo resultado que js/feedback360.js.
// Postgres 17 EMBUTIDO com as 17 migrações aplicadas em sequência, mesmo preparo "tipo Supabase" dos outros testes.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { prng } = require('../helpers/fixtures.js');
const F = require('../../js/feedback360.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao',
  '20261019120000_versao_tecnica', '20261020120000_codigos_processo', '20261021120000_feedback360'];
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
const MSG_LINK = 'Link inválido ou Feedback 360 encerrado. Fale com quem enviou o link.';

let pg = null;
let db = null;
let falhaInicio = null;

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-f360-' + crypto.randomBytes(6).toString('hex'));
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
function rpcComo(quem, fn, ...args) {
  const marcas = args.map((_, i) => '$' + (i + 1)).join(', ');
  const vals = args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a));
  return quem(`select public.${fn}(${marcas}) as r`, vals).then((x) => x.rows[0].r);
}
const rpcAnon = (fn, ...a) => rpcComo(anon, fn, ...a);
const rpcAdmin = (fn, ...a) => rpcComo(admin, fn, ...a);

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}

// ---------------------------------------------------------------------------------------------------------------
// Organograma de teste: Dona (topo) lidera L1, L2 e L3; L1 lidera 5, L2 lidera 3, L3 lidera 2; L2 "trabalha com" L3;
// mais 4 pessoas soltas (para "outros").
// ---------------------------------------------------------------------------------------------------------------
let seqTel = 0;
async function pessoa(nome) {
  seqTel += 1;
  return (await db.query(`insert into public.pessoas (telefone, nome) values ($1, $2) returning id`,
    ['55969' + String(10000000 + seqTel), nome])).rows[0].id;
}
async function empresaComOrganograma(nome) {
  const emp = (await db.query(`insert into public.empresas (nome) values ($1) returning id`, [nome])).rows[0].id;
  const o = { emp, D: await pessoa('Dona Maria da Silva'), L1: await pessoa('Bruno de Souza'), L2: await pessoa('Carla Mendes'), L3: await pessoa('Davi Rocha'),
    e: [], f: [], g: [], s: [] };
  for (let i = 0; i < 5; i++) o.e.push(await pessoa('Equipe Um ' + i + ' Teste'));
  for (let i = 0; i < 3; i++) o.f.push(await pessoa('Equipe Dois ' + i + ' Teste'));
  for (let i = 0; i < 2; i++) o.g.push(await pessoa('Equipe Tres ' + i + ' Teste'));
  for (let i = 0; i < 4; i++) o.s.push(await pessoa('Solta ' + i + ' Teste'));
  for (const p of [o.D, o.L1, o.L2, o.L3, ...o.e, ...o.f, ...o.g, ...o.s]) {
    await db.query(`insert into public.vinculos (pessoa_id, empresa_id, cargo, area) values ($1, $2, 'Cargo', 'Área')`, [p, emp]);
  }
  const rel = [[o.D, o.L1, 'lidera'], [o.D, o.L2, 'lidera'], [o.D, o.L3, 'lidera'], ...o.e.map((x) => [o.L1, x, 'lidera']),
    ...o.f.map((x) => [o.L2, x, 'lidera']), ...o.g.map((x) => [o.L3, x, 'lidera']), [o.L2, o.L3, 'direto']];
  for (const [de, para, tipo] of rel) {
    await db.query(`insert into public.relacoes (empresa_id, de_pessoa, para_pessoa, tipo) values ($1, $2, $3, $4)`, [emp, de, para, tipo]);
  }
  return o;
}
// Desenho padrão: L1 (chefia D, equipe 5, colega L2), L2 (chefia D, equipe 3, colegas L1 e L3).
function desenho(o, extra) {
  return Object.assign({ empresaId: o.emp, contatoRelatos: 'Diretoria jurídica (contrato)', canalTexto: 'o canal de ética da empresa',
    avaliados: [{ pessoaId: o.L1, chefia: [o.D], equipe: o.e, colegas: [o.L2] }, { pessoaId: o.L2, chefia: [o.D], equipe: o.f, colegas: [o.L1, o.L3] }] }, extra || {});
}
function todos(v, extra) {
  const it = {};
  F.IDS_ITENS.forEach((id) => { it[id] = v; });
  it.GLB1 = 4;
  return Object.assign(it, extra || {});
}
function tokens(ciclo) {
  const t = {};
  ciclo.convites.forEach((c) => { (t[c.avaliadoId + ':' + c.fonte] = t[c.avaliadoId + ':' + c.fonte] || []).push(c.token); });
  return (avaliadoId, fonte) => t[avaliadoId + ':' + fonte] || [];
}

test('as 17 migrações em sequência: idempotente, versão nova, modelos de relatório mantidos e o novo acrescentado', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'outro@x.com')`, [ADMIN, OUTRO]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Wellington')`, [ADMIN]);
  const proc = (await db.query(`insert into public.processos (nome) values ('Processo antigo') returning id`)).rows[0].id;
  const relAntigo = (await db.query(`insert into public.relatorios (processo_id, dados, status) values ($1, '{}', 'publicado') returning token`, [proc])).rows[0].token;
  assert.equal((await rpcAnon('versao_banco')).versao, 20261020120000);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpcAnon('versao_banco'), { ok: true, versao: 20261021120000, migracoes: MIGRACOES, faltando: [] });
  assert.ok((await db.query(`select 1 from public.relatorios where token = $1`, [relAntigo])).rows.length, 'relatório antigo intacto');
  // A anterior de novo e esta em seguida: continua tudo de pé.
  await db.query(SQL[ULTIMA - 1]);
  await db.query(SQL[ULTIMA]);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261021120000);
  const chk = (await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'relatorios_modelo_check'`)).rows[0].d;
  for (const m of ['processo', 'equipe', 'lideranca', 'pessoa', 'clima', 'feedback360']) assert.match(chk, new RegExp("'" + m + "'"), m);
  const dono = (await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'relatorios_modelo_dono'`)).rows[0].d;
  assert.match(dono, /clima_rodada_id/);
  assert.match(dono, /feedback360/);
  // Um modelo que outra migração tenha acrescentado continua aceito depois desta.
  await db.query(`alter table public.relatorios drop constraint relatorios_modelo_check`);
  await db.query(`alter table public.relatorios add constraint relatorios_modelo_check check (modelo in ('processo','equipe','lideranca','pessoa','clima','outro_modelo'))`);
  await db.query(SQL[ULTIMA]);
  const chk2 = (await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'relatorios_modelo_check'`)).rows[0].d;
  assert.match(chk2, /outro_modelo/);
  assert.match(chk2, /feedback360/);
});

test('tabelas sem identificação: respostas e comentários não têm pessoa, link, IP nem horário', async () => {
  exigirBanco();
  const colunas = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public'
    and table_name = $1 order by ordinal_position`, [t])).rows.map((r) => r.column_name);
  assert.deepEqual(await colunas('f360_respostas'), ['id', 'ciclo_id', 'avaliado_id', 'fonte', 'versao_itens', 'itens', 'segundos']);
  assert.deepEqual(await colunas('f360_comentarios'), ['id', 'ciclo_id', 'avaliado_id', 'fonte', 'pergunta', 'texto', 'texto_moderado', 'status', 'motivo', 'elegivel', 'sorteio']);
  assert.deepEqual(await colunas('f360_vinculos'), ['convite_id', 'resposta_id', 'comentarios']);
  const fks = async (t) => (await db.query(`select confrelid::regclass::text as alvo from pg_constraint where conrelid = $1::regclass and contype = 'f'`, ['public.' + t]))
    .rows.map((r) => r.alvo).sort();
  assert.deepEqual(await fks('f360_respostas'), ['f360_avaliados', 'f360_ciclos'], 'resposta sem chave para pessoas, convites ou respostas do DISC');
  assert.deepEqual(await fks('f360_comentarios'), ['f360_avaliados', 'f360_ciclos']);
});

test('RLS: anon não lê nada; logado sem ser admin não vê nada; admin lê ciclos e avaliados, mas NUNCA convites, respostas, comentários ou a ligação', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 RLS');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o));
  assert.equal(cr.ok, true, JSON.stringify(cr));
  const tk = tokens(cr.ciclo);
  const L1 = cr.ciclo.avaliados[0].id;
  assert.equal((await rpcAnon('f360_enviar', tk(L1, 'equipe')[0], { itens: { DIR1: 4 }, comentarios: { AB1: 'Bom' } })).ok, true);
  for (const t of ['f360_ciclos', 'f360_avaliados', 'f360_convites', 'f360_respostas', 'f360_comentarios', 'f360_vinculos']) {
    await rejeita(anon(`select * from public.${t}`), /permission denied/);
    await rejeita(anon(`insert into public.${t} default values`), /permission denied/);
  }
  assert.equal((await outro(`select * from public.f360_ciclos`)).rows.length, 0);
  assert.equal((await outro(`select * from public.f360_avaliados`)).rows.length, 0);
  assert.equal((await admin(`select * from public.f360_ciclos where empresa_id = $1`, [o.emp])).rows.length, 1);
  assert.equal((await admin(`select * from public.f360_avaliados where ciclo_id = $1`, [cr.ciclo.id])).rows.length, 2);
  for (const t of ['f360_convites', 'f360_respostas', 'f360_comentarios', 'f360_vinculos']) {
    await rejeita(admin(`select * from public.${t}`), /permission denied/);
  }
  await rejeita(admin(`update public.f360_ciclos set status = 'encerrado'`), /permission denied/);
  await rejeita(admin(`update public.f360_avaliados set resultado = '{}'`), /permission denied/);
  // Funções do painel: anon não executa; logado sem ser admin recebe "Sem permissão."
  for (const [fn, args] of [['f360_listar', [o.emp]], ['f360_criar_ciclo', [{}]], ['f360_encerrar', [cr.ciclo.id]], ['f360_comentarios', [L1]],
    ['f360_gerar_relatorio', [L1, {}]], ['f360_salvar_devolutiva', [L1, {}]]]) {
    await rejeita(rpcAnon(fn, ...args), /permission denied/);
  }
  assert.deepEqual(await rpcComo(outro, 'f360_listar', o.emp), { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual(await rpcComo(outro, 'f360_apagar_brutas', null, false), { ok: false, erro: 'Sem permissão.' });
  await rejeita(anon(`select disc_interno.f360_calcular('[]', '{}', '[]')`), /permission denied/);
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
});

test('criar ciclo: desenho do organograma, teto de 4 formulários (com exceção da chefia), mínimo de 3, chefia = quem lidera', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Criar');
  const erro = async (d) => (await rpcAdmin('f360_criar_ciclo', d)).erro;
  assert.match(await erro(desenho(o, { contatoRelatos: '' })), /protocolo de relatos/);
  assert.match(await erro(desenho(o, { avaliados: [] })), /pelo menos uma pessoa/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.s[0], equipe: [o.e[0], o.e[1], o.e[2]] }] })), /liderar alguém no organograma/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.L3, chefia: [o.D], equipe: o.g }] })), /Davi R\. precisa de pelo menos 3 pessoas convidadas/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.L1, chefia: [o.L2], equipe: o.e }] })), /A chefia de Bruno S\. precisa ser quem lidera/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.L1, chefia: [o.D], equipe: [o.f[0], o.e[0], o.e[1]] }] })), /A equipe de Bruno S\. só pode ter/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.L1, chefia: [o.D], equipe: o.e, colegas: [o.e[0]] }] })), /aparece duas vezes/);
  assert.match(await erro(desenho(o, { avaliados: [{ pessoaId: o.L1, chefia: [o.D], equipe: o.e, colegas: [o.L1] }] })), /não a própria pessoa/);
  assert.match(await erro(desenho(o, { encerramentoPrevisto: '2020-01-01' })), /Data prevista de encerramento inválida/);
  assert.match(await erro(desenho(o, { retencaoDias: 180 })), /de 30 a 90 dias/);
  assert.match(await erro(desenho(o, { canalUrl: 'javascript:x' })), /canal de denúncia inválido/);
  // Teto (organograma maior): C lidera A1..A5; cada Ai lidera 3; X sem liderados. Opcionais ≤ máx(0, 4 − obrigatórios).
  const emp2 = (await db.query(`insert into public.empresas (nome) values ('F360 Teto') returning id`)).rows[0].id;
  const C = await pessoa('Cecilia Chefe Teste'), X = await pessoa('Xavier Solto Teste');
  const A = [], eqA = [];
  for (let i = 0; i < 5; i++) { A.push(await pessoa('Lider ' + 'ABCDE'[i] + ' Teste')); eqA.push([]); for (let j = 0; j < 3; j++) eqA[i].push(await pessoa('Liderado ' + i + j + ' Teste')); }
  for (const p of [C, X, ...A, ...eqA.flat()]) await db.query(`insert into public.vinculos (pessoa_id, empresa_id) values ($1, $2)`, [p, emp2]);
  for (let i = 0; i < 5; i++) {
    await db.query(`insert into public.relacoes (empresa_id, de_pessoa, para_pessoa, tipo) values ($1, $2, $3, 'lidera')`, [emp2, C, A[i]]);
    for (const x of eqA[i]) await db.query(`insert into public.relacoes (empresa_id, de_pessoa, para_pessoa, tipo) values ($1, $2, $3, 'lidera')`, [emp2, A[i], x]);
  }
  const base = (outrosDe) => ({ empresaId: emp2, contatoRelatos: 'Contrato', avaliados: A.map((a, i) => ({ pessoaId: a, chefia: [C], equipe: eqA[i], outros: outrosDe(i) })) });
  // X em 5 listas de "outros": 5 > 4.
  assert.match(await erro(base(() => [X])), /Xavier S\. passaria do limite de 4 formulários/);
  const cincoChefia = await rpcAdmin('f360_criar_ciclo', base((i) => (i < 4 ? [X] : [])));
  assert.equal(cincoChefia.ok, true, 'X em 4 listas cabe; a chefia avalia os 5 líderes: ' + JSON.stringify(cincoChefia));
  await rpcAdmin('f360_excluir_ciclo', cincoChefia.ciclo.id);
  // Um liderado (1 obrigatório) cabe em no máximo 3 listas de outros.
  assert.match(await erro(base((i) => (i > 0 ? [eqA[0][0]] : []))), /Liderado 0\. passaria do limite/);
  assert.equal((await rpcAdmin('f360_criar_ciclo', base((i) => (i > 1 ? [eqA[0][0]] : [])))).ok, true);
  await rpcAdmin('f360_excluir_ciclo', (await rpcAdmin('f360_listar', emp2)).ciclos[0].id);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_ciclos where empresa_id = $1`, [o.emp])).rows[0].n, 0, 'nada gravado depois de um erro');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o, { nome: 'Feedback 360 · out/2026', retencaoDias: 60, manterLista: false }));
  assert.equal(cr.ok, true, JSON.stringify(cr));
  const c = cr.ciclo;
  assert.equal(c.status, 'aberto');
  assert.equal(c.retencaoDias, 60);
  assert.deepEqual(c.avaliados.map((a) => [a.nome, a.topo, a.chefias, a.convidados]), [
    ['Bruno S.', false, 1, { auto: 1, chefia: 1, colegas: 1, equipe: 5, outros: 0 }],
    ['Carla M.', false, 1, { auto: 1, chefia: 1, colegas: 2, equipe: 3, outros: 0 }]]);
  assert.equal(c.convites.length, 1 + 1 + 1 + 5 + 1 + 1 + 2 + 3);
  c.convites.forEach((x) => assert.match(x.token, /^[0-9a-f]{64}$/));
  assert.equal(new Set(c.convites.map((x) => x.token)).size, c.convites.length);
  assert.match(await erro(desenho(o)), /Já existe um Feedback 360 aberto/);
  await rpcAdmin('f360_excluir_ciclo', c.id);
  // Pesquisa de clima aberta na empresa: nunca os dois no mesmo mês.
  const clima = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] });
  assert.equal(clima.ok, true, JSON.stringify(clima));
  assert.match(await erro(desenho(o)), /pesquisa de clima aberta/);
  await rpcAdmin('clima_excluir_rodada', clima.rodada.id);
});

test('link individual: aviso por fonte, validação, nova resposta substitui a anterior, apagar a própria resposta, autoavaliação sem comentário', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Envio');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o, { encerramentoPrevisto: null, contatoDados: 'rh@empresa.com' }));
  const tk = tokens(cr.ciclo);
  const L1 = cr.ciclo.avaliados[0].id;
  const pub = await rpcAnon('f360_publica', tk(L1, 'equipe')[0]);
  assert.equal(pub.ok, true);
  assert.equal(pub.fonte, 'equipe');
  assert.equal(pub.avaliadoNome, 'Bruno S.');
  assert.equal(pub.empresaNome, 'F360 Envio');
  assert.equal(pub.respondido, false);
  assert.equal(pub.duasChefias, false);
  assert.match(pub.encerramentoPrevisto, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await rpcAnon('f360_publica', tk(L1, 'chefia')[0])).fonte, 'chefia');
  assert.equal((await rpcAnon('f360_publica', tk(L1, 'auto')[0])).fonte, 'auto');
  for (const t of [null, 'abc', 'f'.repeat(64)]) {
    assert.deepEqual(await rpcAnon('f360_publica', t), { ok: false, erro: MSG_LINK });
    assert.equal((await rpcAnon('f360_enviar', t, { itens: { DIR1: 3 } })).ok, false);
  }
  const t1 = tk(L1, 'equipe')[0];
  const ruins = [{ itens: { DIR1: 6 } }, { itens: { DIR1: 2.5 } }, { itens: { GLB1: 0 } }, { itens: { X9: 3 } }, { itens: { DIR1: '3' } },
    { itens: [1, 2] }, { itens: { DIR1: 3 }, segundos: -1 }, { itens: { DIR1: 3 }, comentarios: { AB3: 'x' } }, { itens: { DIR1: 3 }, comentarios: { AB1: 5 } }];
  for (const c of ruins) assert.deepEqual(await rpcAnon('f360_enviar', t1, c), { ok: false, erro: 'Respostas em formato inválido.' }, JSON.stringify(c));
  assert.deepEqual(await rpcAnon('f360_enviar', t1, { itens: { DIR1: null }, comentarios: { AB1: '   ' } }), { ok: false, erro: 'Responda pelo menos uma pergunta antes de enviar.' });
  assert.deepEqual(await rpcAnon('f360_enviar', t1, { itens: { DIR1: 4, DIR2: 0, GLB1: 5, FBK1: null }, comentarios: { AB1: ' Organiza\u0007 bem ', AB2: '' }, segundos: 99999 }), { ok: true });
  assert.equal((await rpcAnon('f360_publica', t1)).respondido, true);
  // Nova resposta pelo mesmo link substitui a anterior (não duplica).
  assert.deepEqual(await rpcAnon('f360_enviar', t1, { itens: { DIR1: 5 }, comentarios: { AB2: 'Ouvir mais' } }), { ok: true, substituida: true });
  const resp = (await db.query(`select fonte, itens, segundos from public.f360_respostas where avaliado_id = $1`, [L1])).rows;
  assert.deepEqual(resp, [{ fonte: 'equipe', itens: { DIR1: 5 }, segundos: null }]);
  assert.deepEqual((await db.query(`select pergunta, texto, status from public.f360_comentarios where avaliado_id = $1`, [L1])).rows,
    [{ pergunta: 'AB2', texto: 'Ouvir mais', status: 'pendente' }]);
  // Apagar a própria resposta pelo link (até o encerramento).
  assert.deepEqual(await rpcAnon('f360_apagar_resposta', t1), { ok: true, apagada: true });
  assert.deepEqual(await rpcAnon('f360_apagar_resposta', t1), { ok: true, apagada: false });
  assert.equal((await db.query(`select count(*)::int as n from public.f360_respostas where avaliado_id = $1`, [L1])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_comentarios where avaliado_id = $1`, [L1])).rows[0].n, 0);
  // Autoavaliação: comentários são descartados.
  assert.deepEqual(await rpcAnon('f360_enviar', tk(L1, 'auto')[0], { itens: todos(5), comentarios: { AB1: 'não vai' } }), { ok: true });
  assert.equal((await db.query(`select count(*)::int as n from public.f360_comentarios where avaliado_id = $1`, [L1])).rows[0].n, 0);
  // O painel só vê contagens agregadas (nunca texto nem quem respondeu).
  const lista = await rpcAdmin('f360_listar', o.emp);
  assert.deepEqual(lista.ciclos[0].avaliados[0].respondentes, { auto: 1, chefia: 0, colegas: 0, equipe: 0, outros: 0 });
  assert.ok(!JSON.stringify(lista).includes('Ouvir mais'));
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
});

test('nada antes do encerramento; encerrar congela o resultado e APAGA a ligação link → resposta e a lista de convidados', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Encerrar');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o));
  const tk = tokens(cr.ciclo);
  const [L1, L2] = cr.ciclo.avaliados.map((a) => a.id);
  for (const [i, t] of tk(L1, 'equipe').entries()) await rpcAnon('f360_enviar', t, { itens: todos(3 + (i % 2)), comentarios: { AB1: 'Continuar ' + i } });
  await rpcAnon('f360_enviar', tk(L1, 'chefia')[0], { itens: todos(2), comentarios: { AB2: 'Da chefia' } });
  await rpcAnon('f360_enviar', tk(L1, 'auto')[0], { itens: todos(5) });
  await rpcAnon('f360_enviar', tk(L2, 'equipe')[0], { itens: todos(4), comentarios: { AB1: 'Grupo pequeno' } });
  assert.match((await rpcAdmin('f360_comentarios', L1)).erro, /depois que o ciclo é encerrado/);
  assert.match((await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'lider' })).erro, /Encerre o ciclo/);
  assert.match((await rpcAdmin('f360_salvar_devolutiva', L1, { foco: 'x' })).erro, /depois que o ciclo é encerrado/);
  assert.equal((await rpcAdmin('f360_listar', o.emp)).ciclos[0].avaliados[0].resultado, null, 'nenhum resultado com o ciclo aberto');
  assert.ok((await db.query(`select count(*)::int as n from public.f360_vinculos`)).rows[0].n >= 8);

  const enc = await rpcAdmin('f360_encerrar', cr.ciclo.id);
  assert.equal(enc.ok, true, JSON.stringify(enc));
  assert.equal(enc.ciclo.status, 'encerrado');
  assert.deepEqual(enc.ciclo.convites, []);
  assert.match((await rpcAdmin('f360_encerrar', cr.ciclo.id)).erro, /já foi encerrado/);
  // A ligação link → resposta e a lista de convidados sumiram; as respostas ficaram, sem nada que aponte quem respondeu.
  assert.equal((await db.query(`select count(*)::int as n from public.f360_vinculos v join public.f360_convites c on c.id = v.convite_id where c.ciclo_id = $1`, [cr.ciclo.id])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_vinculos`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_convites where ciclo_id = $1`, [cr.ciclo.id])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_respostas where ciclo_id = $1`, [cr.ciclo.id])).rows[0].n, 8);
  assert.ok(enc.ciclo.listaApagadaEm);
  // Links encerrados.
  assert.deepEqual(await rpcAnon('f360_publica', tk(L1, 'equipe')[0]), { ok: false, erro: MSG_LINK });
  assert.equal((await rpcAnon('f360_enviar', tk(L1, 'equipe')[0], { itens: { DIR1: 3 } })).ok, false);
  await rejeita(db.query(`update public.f360_ciclos set status = 'aberto', encerrado_em = null where id = $1`, [cr.ciclo.id]), /não pode ser reaberto/);
  await rejeita(db.query(`insert into public.f360_respostas (ciclo_id, avaliado_id, fonte, versao_itens) values ($1, $2, 'equipe', 'v0')`, [cr.ciclo.id, L1]), /encerrado/);
  // Resultado: L1 liberado (equipe 5 + colega L2 sem resposta), chefia à parte e fora de "Outras pessoas"; L2 sem relatório.
  const [a1, a2] = enc.ciclo.avaliados;
  assert.equal(a1.resultado.liberado, true);
  assert.deepEqual(a1.resultado.grupos.map((g) => [g.id, g.n]), [['equipe', 5]]);
  assert.deepEqual(a1.resultado.outras.composicao, { equipe: 5 });
  assert.equal(a1.resultado.chefia.temas.DIR, 2);
  assert.equal(a1.resultado.outras.temas.DIR.media, 3.4);
  assert.equal(a1.resultado.auto.temas.DIR, 5);
  assert.equal(a2.resultado.liberado, false);
  assert.deepEqual(a2.resultado.grupos, []);
  assert.equal(a2.resultado.chefia, null);
  // Comentários: elegíveis só de grupos exibidos (e a chefia); o de grupo pequeno fica marcado.
  const com1 = await rpcAdmin('f360_comentarios', L1);
  assert.equal(com1.comentarios.length, 6);
  assert.deepEqual(com1.comentarios.filter((c) => c.chefia).map((c) => c.texto), ['Da chefia']);
  assert.ok(com1.comentarios.every((c) => c.elegivel));
  assert.ok(com1.comentarios.every((c) => !('fonte' in c)), 'sem o grupo de origem');
  const com2 = await rpcAdmin('f360_comentarios', L2);
  assert.deepEqual(com2.comentarios.map((c) => [c.texto, c.elegivel]), [['Grupo pequeno', false]]);
  // O mesmo resultado que o JS.
  const rs = (await db.query(`select fonte, itens, segundos from public.f360_respostas where avaliado_id = $1`, [L1])).rows;
  assert.deepEqual(a1.resultado, F.calcular({ respostas: rs, convidados: a1.convidados, excluir: [] }));
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
});

test('moderação, devolutiva, relatório do líder (só agregados), visão da chefia SÓ com o plano e snapshot protegido', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Relatório');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o));
  const tk = tokens(cr.ciclo);
  const L1 = cr.ciclo.avaliados[0].id;
  for (const [i, t] of tk(L1, 'equipe').entries()) {
    await rpcAnon('f360_enviar', t, { itens: todos(4, { APO1: i < 3 ? 0 : 2, RES3: 2 + (i % 3) }), comentarios: { AB1: 'Texto original ' + i, AB2: i === 0 ? 'Fulano me ofendeu' : '' }, segundos: 300 });
  }
  await rpcAnon('f360_enviar', tk(L1, 'chefia')[0], { itens: todos(3), comentarios: { AB1: 'Comentário da chefia' } });
  await rpcAnon('f360_enviar', tk(L1, 'auto')[0], { itens: todos(5) });
  await rpcAdmin('f360_encerrar', cr.ciclo.id);
  // Sem devolutiva: nada de relatório.
  assert.match((await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'lider' })).erro, /devolutiva como feita/);
  // Plano inválido, depois válido; devolutiva feita.
  assert.match((await rpcAdmin('f360_salvar_devolutiva', L1, { plano: { comportamentos: [] } })).erro, /1 ou 2 comportamentos/);
  assert.match((await rpcAdmin('f360_salvar_devolutiva', L1, { plano: { comportamentos: [{ item: 'XX1' }] } })).erro, /entre as 18 frases/);
  const plano = { comportamentos: [{ item: 'APO1', acao: 'Conversa individual a cada 15 dias' }], acoes: [{ texto: '1:1 quinzenal', prazo: '2026-11-30' }, { texto: '' }],
    contar: 'Vou contar o foco à equipe', apoio: 'A diretora', indicador: 'Pedir retorno em 60 dias', datas: { conversaEquipe: '2026-11-05', pulso: 'ontem' }, andamento: '' };
  const dv = await rpcAdmin('f360_salvar_devolutiva', L1, { temas: ['  Clareza   nas prioridades ', 9, ''], foco: 'Conversas individuais', observacao: 'Concordo com quase tudo.',
    plano, discAceito: true, devolutivaFeita: true });
  assert.equal(dv.ok, true, JSON.stringify(dv));
  const av = dv.ciclo.avaliados[0];
  assert.deepEqual(av.temas, ['Clareza nas prioridades']);
  assert.deepEqual(av.plano, F.validarPlano(plano).plano, 'mesma validação do plano no SQL e no JS');
  assert.ok(av.devolutivaEm);
  // Comentários pendentes bloqueiam o relatório do líder.
  assert.match((await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'lider' })).erro, /Modere todos os comentários/);
  const coms = (await rpcAdmin('f360_comentarios', L1)).comentarios;
  for (const c of coms) {
    if (c.texto === 'Fulano me ofendeu') {
      assert.match((await rpcAdmin('f360_moderar', c.id, { status: 'descartado' })).erro, /motivo/);
      const m = await rpcAdmin('f360_moderar', c.id, { status: 'descartado', motivo: 'relato' });
      assert.equal(m.relatosRegistrados, 1);
    } else if (c.texto === 'Texto original 1') {
      assert.match((await rpcAdmin('f360_moderar', c.id, { status: 'editado', texto: '  ' })).erro, /texto editado/);
      await rpcAdmin('f360_moderar', c.id, { status: 'editado', texto: 'Texto [trecho removido] editado' });
    } else {
      await rpcAdmin('f360_moderar', c.id, { status: 'mantido' });
    }
  }
  const g = await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'lider', publicar: true, consultor: 'Wellington' });
  assert.equal(g.ok, true, JSON.stringify(g));
  const pub = await rpcAnon('relatorio_publico', g.relatorio.token);
  assert.equal(pub.ok, true);
  assert.equal(pub.modelo, 'feedback360');
  const d = pub.relatorio;
  assert.equal(d.visao, 'lider');
  assert.deepEqual(d.temas, ['Clareza nas prioridades']);
  assert.equal(d.foco, 'Conversas individuais');
  assert.equal(d.observacao, 'Concordo com quase tudo.');
  assert.equal(d.disc, null, 'sem DISC cadastrado, nada de hipótese mesmo com o aceite');
  const res = (await rpcAdmin('f360_listar', o.emp)).ciclos[0].avaliados[0].resultado;
  assert.deepEqual(d.resultado, F.visaoLider(res), 'snapshot = visão do líder do resultado congelado (igual ao JS)');
  const texto = JSON.stringify(d);
  assert.ok(!/"dist"/.test(texto), 'sem distribuição por alternativa');
  assert.ok(!/Fulano me ofendeu/.test(texto), 'relato não vai para o líder');
  assert.ok(!/Texto original 1/.test(texto), 'o texto original editado não vai');
  assert.ok(/Texto \[trecho removido\] editado/.test(texto));
  assert.deepEqual(d.comentariosChefia, [{ pergunta: 'AB1', texto: 'Comentário da chefia' }]);
  assert.equal(d.comentarios.length, 5);
  assert.ok(d.comentarios.every((c) => Object.keys(c).sort().join() === 'pergunta,texto'), 'sem grupo de origem');
  // Visão da chefia: só o plano. Nenhuma nota, média, tema ou comentário.
  const gc = await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'chefia', publicar: true });
  const pc = (await rpcAnon('relatorio_publico', gc.relatorio.token)).relatorio;
  assert.equal(pc.visao, 'chefia');
  assert.deepEqual(Object.keys(pc).sort(), ['avaliado', 'ciclo', 'consultor', 'devolutivaEm', 'empresa', 'geradoEm', 'modelo', 'plano', 'titulo', 'versao', 'visao']);
  const tc = JSON.stringify(pc);
  for (const proibido of ['"media"', '"resultado"', '"outras"', '"comentariosChefia"', '"auto"', 'Comentário da chefia', 'Texto original', '"temas"', 'Clareza']) {
    assert.ok(!tc.includes(proibido), 'a chefia nunca vê: ' + proibido);
  }
  // Snapshot só pelo servidor; publicar/despublicar pode.
  await rejeita(admin(`update public.relatorios set dados = '{"modelo":"feedback360"}' where token = $1`, [g.relatorio.token]), /só é montado pelo servidor/);
  await rejeita(admin(`insert into public.relatorios (modelo, empresa_id, f360_ciclo_id, f360_avaliado_id, f360_visao, dados) values ('feedback360', $1, $2, $3, 'lider', '{}')`,
    [o.emp, cr.ciclo.id, L1]), /só é montado pelo servidor/);
  await admin(`update public.relatorios set status = 'rascunho' where token = $1`, [g.relatorio.token]);
  assert.deepEqual(await rpcAnon('relatorio_publico', g.relatorio.token), { ok: false, erro: 'Relatório não encontrado ou fora do ar.' });
  const g2 = await rpcAdmin('f360_gerar_relatorio', L1, { visao: 'lider', publicar: true });
  assert.equal(g2.relatorio.token, g.relatorio.token, 'um relatório por pessoa e visão');
  // Consolidado: só com 5 ou mais líderes.
  assert.match((await rpcAdmin('f360_gerar_consolidado', cr.ciclo.id, {})).erro, /5 ou mais líderes/);
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
  assert.equal((await db.query(`select count(*)::int as n from public.relatorios where token = $1`, [g.relatorio.token])).rows[0].n, 0, 'excluir o ciclo leva os relatórios');
});

test('respostas sinalizadas: o consultor decide por grupo e o resultado é recalculado (nunca exclusão silenciosa)', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Qualidade');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o));
  const tk = tokens(cr.ciclo);
  const L1 = cr.ciclo.avaliados[0].id;
  for (const [i, t] of tk(L1, 'equipe').entries()) await rpcAnon('f360_enviar', t, { itens: todos(i < 2 ? 5 : 3, { DIR1: i < 2 ? 5 : 2 }), segundos: i < 2 ? 10 : 300 });
  await rpcAdmin('f360_encerrar', cr.ciclo.id);
  const antes = (await rpcAdmin('f360_listar', o.emp)).ciclos[0].avaliados[0].resultado;
  assert.equal(antes.sinalizadas.equipe, 2);
  assert.equal(antes.grupos[0].n, 5);
  const depois = (await rpcAdmin('f360_recalcular', L1, ['equipe'])).ciclo.avaliados[0].resultado;
  assert.equal(depois.excluidas.equipe, 2);
  assert.equal(depois.grupos[0].n, 3);
  assert.deepEqual(depois.excluir, ['equipe']);
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
});

test('retenção: apaga respostas, comentários e lista vencidos (ou já) e mantém só o agregado', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('F360 Retenção');
  const cr = await rpcAdmin('f360_criar_ciclo', desenho(o, { retencaoDias: 30, manterLista: true }));
  const tk = tokens(cr.ciclo);
  const L1 = cr.ciclo.avaliados[0].id;
  for (const t of tk(L1, 'equipe')) await rpcAnon('f360_enviar', t, { itens: todos(4), comentarios: { AB1: 'x' } });
  const enc = await rpcAdmin('f360_encerrar', cr.ciclo.id);
  assert.equal(enc.ciclo.listaApagadaEm, '', 'com manterLista a lista fica (até o pulso, com aval do advogado)');
  assert.ok((await db.query(`select count(*)::int as n from public.f360_convites where ciclo_id = $1`, [cr.ciclo.id])).rows[0].n > 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_vinculos`)).rows[0].n, 0, 'a ligação link → resposta sai sempre');
  assert.deepEqual(await rpcAdmin('f360_apagar_brutas', null, false), { ok: true, avaliados: 0, respostas: 0, relatorios: 0 }, 'ainda no prazo');
  await db.query(`update public.f360_ciclos set encerrado_em = now() - interval '31 days' where id = $1`, [cr.ciclo.id]);
  const ap = await rpcAdmin('f360_apagar_brutas', null, false);
  assert.equal(ap.avaliados, 2);
  assert.equal(ap.respostas, 5);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_comentarios where ciclo_id = $1`, [cr.ciclo.id])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.f360_convites where ciclo_id = $1`, [cr.ciclo.id])).rows[0].n, 0);
  const lista = (await rpcAdmin('f360_listar', o.emp)).ciclos[0];
  assert.ok(lista.listaApagadaEm);
  assert.equal(lista.avaliados[0].resultado.outras.temas.DIR.media, 4, 'o agregado continua');
  assert.deepEqual(await rpcAdmin('f360_comentarios', L1), { ok: true, apagados: true, comentarios: [] });
  assert.match((await rpcAdmin('f360_recalcular', L1, [])).erro, /já foram apagadas/);
  // Conexão direta (SQL Editor/agendamento do dono) também pode chamar.
  assert.equal((await db.query(`select public.f360_apagar_brutas(null, false) as r`)).rows[0].r.ok, true);
  await rpcAdmin('f360_excluir_ciclo', cr.ciclo.id);
});

// ---------------------------------------------------------------------------------------------------------------
// Conferência cruzada SQL × JS: mesmo resultado, inclusive nos casos de borda da fusão e da supressão.
// ---------------------------------------------------------------------------------------------------------------
async function calcularSql(e) {
  return (await db.query(`select disc_interno.f360_calcular($1::jsonb, $2::jsonb, $3::jsonb) as r`,
    [JSON.stringify(e.respostas), JSON.stringify(e.convidados), JSON.stringify(e.excluir || [])])).rows[0].r;
}
function gerarEntrada(semente, op) {
  const rnd = prng(semente);
  op = op || {};
  const n = op.n || { auto: rnd() < 0.85 ? 1 : 0, chefia: Math.floor(rnd() * 3), colegas: Math.floor(rnd() * 7), equipe: Math.floor(rnd() * 12), outros: Math.floor(rnd() * 5) };
  const respostas = [];
  Object.keys(n).forEach((f) => {
    for (let j = 0; j < n[f]; j++) {
      const vies = 1 + Math.floor(rnd() * 5);
      const itens = {};
      F.IDS_ITENS.forEach((id) => {
        const x = rnd();
        if (x < (op.pular || 0.1)) return;
        if (x < (op.pular || 0.1) + (op.naoObservei || 0.12)) { itens[id] = 0; return; }
        itens[id] = Math.max(1, Math.min(5, vies + Math.floor(rnd() * 3) - 1));
      });
      if (rnd() < 0.8) itens.GLB1 = 1 + Math.floor(rnd() * 5);
      respostas.push({ fonte: f, itens, segundos: rnd() < 0.15 ? Math.floor(rnd() * 30) : 200 + Math.floor(rnd() * 400) });
    }
  });
  const convidados = {};
  Object.keys(n).forEach((f) => { convidados[f] = n[f] + (f === 'auto' ? 0 : Math.floor(rnd() * 3)); });
  convidados.auto = 1;
  return { respostas, convidados, excluir: op.excluir || (rnd() < 0.2 ? ['equipe'] : []) };
}

test('conferência cruzada: o banco e o js/feedback360.js calculam, fundem e suprimem igual (40 sorteios + casos de borda)', async () => {
  exigirBanco();
  const casos = [];
  for (let s = 1; s <= 40; s++) casos.push(gerarEntrada(s * 97));
  const borda = [
    { auto: 1, chefia: 1, colegas: 0, equipe: 2, outros: 4 },   // equipe < 3: funde com outros
    { auto: 1, chefia: 2, colegas: 1, equipe: 2, outros: 0 },   // fusão chega a 3
    { auto: 1, chefia: 1, colegas: 1, equipe: 1, outros: 0 },   // fusão abaixo de 3: sem relatório
    { auto: 0, chefia: 1, colegas: 3, equipe: 4, outros: 2 },   // outros < 3 vai para colegas
    { auto: 1, chefia: 0, colegas: 4, equipe: 6, outros: 3 },   // três grupos separados
    { auto: 1, chefia: 1, colegas: 0, equipe: 0, outros: 0 },   // só autoavaliação e chefia
    { auto: 1, chefia: 1, colegas: 5, equipe: 5, outros: 0 }
  ];
  borda.forEach((n, i) => casos.push(gerarEntrada(1000 + i, { n })));
  casos.push(gerarEntrada(2001, { n: { auto: 1, chefia: 1, colegas: 3, equipe: 6, outros: 0 }, naoObservei: 0.45 }));  // muita "não observei"
  casos.push(gerarEntrada(2002, { n: { auto: 1, chefia: 1, colegas: 4, equipe: 4, outros: 0 }, pular: 0.01, naoObservei: 0.01 }));
  const unanime = gerarEntrada(2003, { n: { auto: 1, chefia: 1, colegas: 3, equipe: 5, outros: 0 }, pular: 0.001, naoObservei: 0.001 });
  unanime.respostas.forEach((r) => { F.IDS_ITENS.forEach((id) => { r.itens[id] = 4; }); r.segundos = 2; });
  casos.push(unanime);
  for (const [i, c] of casos.entries()) {
    const sql = await calcularSql(c);
    const js = F.calcular(c);
    assert.deepEqual(sql, js, 'caso ' + i);
    const vl = (await db.query(`select disc_interno.f360_visao_lider($1::jsonb) as r`, [JSON.stringify(sql)])).rows[0].r;
    assert.deepEqual(vl, F.visaoLider(js), 'visão do líder, caso ' + i);
  }
  // Consolidado: mesmas regras (≥ 5 líderes; tema com ≥ 5; focos com ≥ 5 planos).
  const lideres = casos.slice(0, 12).map((c) => F.visaoLider(F.calcular(c)));
  const focos = [['APO1'], ['APO2', 'DIR1'], ['RES3'], [], ['COE2'], ['APO3'], ['FBK1', 'FBK2']];
  for (const [ls, fs] of [[lideres, focos], [lideres.slice(0, 4), focos], [lideres.slice(0, 7), focos.slice(0, 4)]]) {
    const sql = (await db.query(`select disc_interno.f360_consolidar($1::jsonb, $2::jsonb) as r`, [JSON.stringify(ls), JSON.stringify(fs)])).rows[0].r;
    assert.deepEqual(sql, F.consolidar(ls, fs));
  }
  // Plano: mesma validação.
  for (const p of [null, 'x', { comportamentos: [] }, { comportamentos: [{ item: 'DIR1' }, { item: 'DIR1' }] },
    { comportamentos: [{ item: 'DIR1', acao: '  a\u0007  b ' }], acoes: [{ texto: 'x', prazo: '2026-02-30' }, { texto: 'y', prazo: '2026-12-01' }, 'z'], datas: { pulso: '2027-01-15', checkin: 5 } },
    { comportamentos: [{ item: 'RES3' }], acoes: [{ texto: 'a' }, { texto: 'b' }, { texto: 'c' }, { texto: 'd' }] }]) {
    const sql = (await db.query(`select disc_interno.f360_validar_plano($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;
    const js = F.validarPlano(p);
    assert.deepEqual(sql, js.ok ? { ok: true, plano: js.plano } : js, JSON.stringify(p));
  }
});

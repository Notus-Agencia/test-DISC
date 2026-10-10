'use strict';
// Testes da migração 20261017120000_clima.sql (Pesquisa de Clima da Equipe): tabelas, RLS (anon não lê nada; respostas
// nem o admin lê), envio público pelo token com limites, nada antes do encerramento, resultado congelado, relatório só
// com o que o cliente pode ver, retenção — e a CONFERÊNCIA CRUZADA: o cálculo e a supressão do banco
// (disc_interno.clima_calcular) dão exatamente o mesmo resultado que js/clima.js (DISC_CLIMA.calcular).
// Postgres 17 EMBUTIDO com as 13 migrações aplicadas em sequência, mesmo preparo "tipo Supabase" dos outros testes.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { prng } = require('../helpers/fixtures.js');
const CL = require('../../js/clima.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima'];
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
    const dir = path.join(os.tmpdir(), 'disc-pg-clima-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 62000 + Math.floor(Math.random() * 800),
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
// Organograma de teste: líder L1 com 6 liderados, L2 com 3, L3 (que lidera L1 e L2) e uma pessoa sem liderados.
// ---------------------------------------------------------------------------------------------------------------
let seqTel = 0;
async function pessoa(nome) {
  seqTel += 1;
  return (await db.query(`insert into public.pessoas (telefone, nome) values ($1, $2) returning id`,
    ['55959' + String(10000000 + seqTel), nome])).rows[0].id;
}
async function empresaComOrganograma(nome) {
  const emp = (await db.query(`insert into public.empresas (nome) values ($1) returning id`, [nome])).rows[0].id;
  const L3 = await pessoa('Lia Diretora Silva');
  const L1 = await pessoa('Bruno de Souza');
  const L2 = await pessoa('Carla Mendes');
  const liderados1 = [];
  for (let i = 0; i < 6; i++) liderados1.push(await pessoa('Pessoa Um ' + i + ' Teste'));
  const liderados2 = [];
  for (let i = 0; i < 3; i++) liderados2.push(await pessoa('Pessoa Dois ' + i + ' Teste'));
  const solta = await pessoa('Sem Liderados Teste');
  const areas = { [L3]: 'Diretoria', [L1]: 'Comercial', [L2]: 'Comercial' };
  for (const p of [L3, L1, L2, ...liderados1, ...liderados2, solta]) {
    await db.query(`insert into public.vinculos (pessoa_id, empresa_id, cargo, area) values ($1, $2, 'Cargo', $3)`, [p, emp, areas[p] || 'Comercial']);
  }
  const rel = [[L3, L1], [L3, L2], ...liderados1.map((x) => [L1, x]), ...liderados2.map((x) => [L2, x])];
  for (const [de, para] of rel) {
    await db.query(`insert into public.relacoes (empresa_id, de_pessoa, para_pessoa, tipo) values ($1, $2, $3, 'lidera')`, [emp, de, para]);
  }
  return { emp, L1, L2, L3, solta };
}

const chave = () => crypto.randomBytes(16).toString('hex');
function itensTodos(v) {
  const it = {};
  CL.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; }));
  it.H1 = v;
  return it;
}
// Formulário do líder: A–E, FL1–FL3 (no lugar de F) e H1; sem G e sem N.
function itensLider(v) {
  const it = {};
  CL.telas('lider').forEach((t) => t.itens.forEach((id) => { it[id] = v; }));
  return it;
}

test('as 13 migrações em sequência: idempotente, versão nova, dados anteriores intactos', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'outro@x.com')`, [ADMIN, OUTRO]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Wellington')`, [ADMIN]);
  const proc = (await db.query(`insert into public.processos (nome) values ('Processo antigo') returning id`)).rows[0].id;
  const relAntigo = (await db.query(`insert into public.relatorios (processo_id, dados, status) values ($1, '{}', 'publicado') returning token`, [proc])).rows[0].token;
  assert.equal((await rpcAnon('versao_banco')).versao, 20261016120000);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpcAnon('versao_banco'), { ok: true, versao: 20261017120000, migracoes: MIGRACOES, faltando: [] });
  assert.ok((await db.query(`select 1 from public.relatorios where token = $1`, [relAntigo])).rows.length, 'relatório antigo intacto');
  // A anterior de novo e esta em seguida: continua tudo de pé.
  await db.query(SQL[ULTIMA - 1]);
  await db.query(SQL[ULTIMA]);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261017120000);
  // Relatório de modelo 'clima' passa a existir nas regras da tabela.
  const def = (await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'relatorios_modelo_check'`)).rows[0].d;
  assert.match(def, /clima/);
});

test('respostas anônimas: só rodada, equipe, papel, versão, itens, comentário e duração (nada que identifique)', async () => {
  exigirBanco();
  const colunas = (await db.query(`select column_name from information_schema.columns where table_schema = 'public'
    and table_name = 'clima_respostas' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.deepEqual(colunas, ['id', 'rodada_id', 'equipe_id', 'papel', 'versao_itens', 'itens', 'comentario', 'segundos']);
  const fks = (await db.query(`select confrelid::regclass::text as alvo from pg_constraint where conrelid = 'public.clima_respostas'::regclass and contype = 'f'`))
    .rows.map((r) => r.alvo).sort();
  assert.deepEqual(fks, ['clima_equipes', 'clima_rodadas'], 'sem chave estrangeira para pessoas ou respostas do DISC');
  const recebidos = (await db.query(`select column_name from information_schema.columns where table_schema = 'public'
    and table_name = 'clima_recebidos' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.deepEqual(recebidos, ['rodada_id', 'chave']);
});

test('RLS: anon não lê nada; logado sem ser admin não vê nada; admin lê rodadas e equipes, mas NUNCA as respostas', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima RLS');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] });
  assert.equal(cr.ok, true, JSON.stringify(cr));
  const tok = cr.rodada.equipes[0].tokenEquipe;
  assert.equal((await rpcAnon('clima_enviar', tok, { itens: { A1: 4 }, chave: chave() })).ok, true);
  for (const t of ['clima_rodadas', 'clima_equipes', 'clima_respostas', 'clima_recebidos']) {
    await rejeita(anon(`select * from public.${t}`), /permission denied/);
    await rejeita(anon(`insert into public.${t} default values`), /permission denied/);
  }
  assert.equal((await outro(`select * from public.clima_rodadas`)).rows.length, 0);
  assert.equal((await outro(`select * from public.clima_equipes`)).rows.length, 0);
  assert.ok((await admin(`select * from public.clima_rodadas where empresa_id = $1`, [o.emp])).rows.length === 1);
  assert.ok((await admin(`select * from public.clima_equipes`)).rows.length >= 1);
  await rejeita(admin(`select * from public.clima_respostas`), /permission denied/);
  await rejeita(admin(`select * from public.clima_recebidos`), /permission denied/);
  await rejeita(admin(`update public.clima_rodadas set status = 'encerrada'`), /permission denied/);
  await rejeita(admin(`delete from public.clima_equipes`), /permission denied/);
  // Funções do painel: anon não executa; logado sem ser admin recebe "Sem permissão."
  await rejeita(rpcAnon('clima_listar', o.emp), /permission denied/);
  await rejeita(rpcAnon('clima_resultado', cr.rodada.id), /permission denied/);
  await rejeita(rpcAnon('clima_criar_rodada', { empresaId: o.emp }), /permission denied/);
  assert.deepEqual(await rpcComo(outro, 'clima_listar', o.emp), { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual(await rpcComo(outro, 'clima_apagar_brutas', null, false), { ok: false, erro: 'Sem permissão.' });
  // O cálculo interno não é exposto.
  await rejeita(anon(`select disc_interno.clima_calcular('[]', '[]', false, false)`), /permission denied/);
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
});

test('criar rodada: equipes do organograma (lidera), convidados, mínimo de 5, uma aberta por empresa, canal', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Criar');
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [] })).erro, /pelo menos uma equipe/);
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.solta }] })).erro, /não lidera ninguém/);
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L2 }] })).erro, /menos de 5 pessoas convidadas/);
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1, convidados: 2 }] })).erro, /de 6/);
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, complemento: true, canalTexto: 'RH', canalUrl: 'javascript:x', equipes: [{ liderId: o.L1 }] })).erro, /canal de escuta inválido/);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_rodadas where empresa_id = $1`, [o.emp])).rows[0].n, 0, 'nada fica gravado depois de um erro');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, nome: 'Clima out/2026', complemento: true, canalTexto: 'o RH pelo canal interno',
    canalUrl: 'https://exemplo.com/escuta', retencaoDias: 60, equipes: [{ liderId: o.L3 }, { liderId: o.L1, convidados: 8 }, { liderId: o.L2 }] });
  assert.equal(cr.ok, true, JSON.stringify(cr));
  const r = cr.rodada;
  assert.equal(r.status, 'aberta');
  assert.equal(r.n4, true);
  assert.equal(r.retencaoDias, 60);
  assert.deepEqual(r.equipes.map((e) => [e.nome, e.area, e.convidados, e.respondentes]),
    [['Equipe de Lia D.', 'Diretoria', 2, 0], ['Equipe de Bruno S.', 'Comercial', 8, 0], ['Equipe de Carla M.', 'Comercial', 3, 0]]);
  r.equipes.forEach((e) => { assert.match(e.tokenEquipe, /^[0-9a-f]{64}$/); assert.match(e.tokenLider, /^[0-9a-f]{64}$/); assert.notEqual(e.tokenEquipe, e.tokenLider); });
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] })).erro, /Já existe uma pesquisa de clima aberta/);
  // Sem complemento, o canal não fica gravado e o N4 não liga.
  await rpcAdmin('clima_excluir_rodada', r.id);
  const sem = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, canalTexto: 'RH', equipes: [{ liderId: o.L1 }] });
  assert.equal(sem.rodada.n4, false);
  assert.equal(sem.rodada.canalTexto, '');
  await rpcAdmin('clima_excluir_rodada', sem.rodada.id);
});

test('link público e envio: token inválido, itens fora do formulário, vazio, reenvio, limite por equipe, líder uma vez', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Envio');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, complemento: true, canalTexto: 'RH', equipes: [{ liderId: o.L1 }] });
  const eq = cr.rodada.equipes[0];
  const pub = await rpcAnon('clima_publica', eq.tokenEquipe);
  assert.deepEqual(pub, { ok: true, papel: 'membro', empresaNome: 'Clima Envio', equipeNome: 'Equipe de Bruno S.', complemento: true, n4: true,
    canalTexto: 'RH', canalUrl: '', contatoDados: '', retencaoDias: 90, versaoItens: 'v0' });
  assert.equal((await rpcAnon('clima_publica', eq.tokenLider)).papel, 'lider');
  for (const t of [null, 'abc', 'f'.repeat(64)]) {
    assert.deepEqual(await rpcAnon('clima_publica', t), { ok: false, erro: 'Link inválido ou pesquisa encerrada. Fale com quem enviou o link.' });
    assert.equal((await rpcAnon('clima_enviar', t, { itens: { A1: 3 }, chave: chave() })).ok, false);
  }
  const ruins = [{ itens: { A1: 6 }, chave: chave() }, { itens: { A1: 2.5 }, chave: chave() }, { itens: { FL1: 3 }, chave: chave() },
    { itens: { X9: 3 }, chave: chave() }, { itens: { H2: 'texto' }, chave: chave() }, { itens: { A1: '3' }, chave: chave() },
    { itens: { A1: 3 } }, { itens: { A1: 3 }, chave: 'curta' }, { itens: [1, 2], chave: chave() }, { itens: { A1: 3 }, segundos: -1, chave: chave() }];
  for (const c of ruins) assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenEquipe, c), { ok: false, erro: 'Respostas em formato inválido.' }, JSON.stringify(c));
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { A1: null }, comentario: '   ', chave: chave() }),
    { ok: false, erro: 'Responda pelo menos uma pergunta antes de enviar.' });
  // Válido; reenvio com a mesma chave não duplica.
  const k1 = chave();
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { A1: 4, A3: 2, N4: 0, G1: null }, comentario: ' Mais\u0007 reuniões ', segundos: 99999, chave: k1 }), { ok: true });
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { A1: 4 }, chave: k1 }), { ok: true, duplicado: true });
  const linha = (await db.query(`select papel, itens, comentario, segundos from public.clima_respostas where equipe_id = $1`, [eq.id])).rows;
  assert.deepEqual(linha, [{ papel: 'membro', itens: { A1: 4, A3: 2, N4: 0 }, comentario: 'Mais reuniões', segundos: 86400 }]);
  // Comentário do líder é descartado; o líder responde uma vez só e não responde G nem N.
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenLider, { itens: { G1: 3 }, chave: chave() }), { ok: false, erro: 'Respostas em formato inválido.' });
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenLider, { itens: { A1: 5, FL1: 4 }, comentario: 'não vai', chave: chave() }), { ok: true });
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenLider, { itens: { A1: 5 }, chave: chave() }),
    { ok: false, erro: 'A resposta da liderança desta equipe já foi registrada.' });
  assert.equal((await db.query(`select comentario from public.clima_respostas where equipe_id = $1 and papel = 'lider'`, [eq.id])).rows[0].comentario, '');
  // Limite: a equipe não recebe mais respostas do que convidados (6).
  for (let i = 0; i < 5; i++) assert.equal((await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { B1: 3 }, chave: chave() })).ok, true);
  assert.match((await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { B1: 3 }, chave: chave() })).erro, /já recebeu todas as respostas esperadas/);
  // Contagem agregada para o painel (nunca quem respondeu).
  const lista = await rpcAdmin('clima_listar', o.emp);
  assert.equal(lista.rodadas[0].respondentes, 6);
  assert.equal(lista.rodadas[0].equipes[0].respondentes, 6);
  assert.ok(!JSON.stringify(lista).includes('Mais reuniões'), 'o painel nunca recebe o texto bruto pela lista');
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
});

test('nada enquanto a rodada está aberta; encerrar congela o resultado, as equipes e recusa envios', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Encerrar');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }, { liderId: o.L2 }] });
  const [e1, e2] = cr.rodada.equipes;
  for (let i = 0; i < 6; i++) await rpcAnon('clima_enviar', e1.tokenEquipe, { itens: itensTodos(4 - (i % 2)), comentario: i < 2 ? 'Comentário ' + i : '', chave: chave() });
  for (let i = 0; i < 2; i++) await rpcAnon('clima_enviar', e2.tokenEquipe, { itens: itensTodos(2), chave: chave() });
  assert.equal((await rpcAnon('clima_enviar', e1.tokenLider, { itens: itensLider(5), chave: chave() })).ok, true);
  assert.deepEqual(await rpcAdmin('clima_resultado', cr.rodada.id), { ok: false, erro: 'Os resultados só aparecem depois que a pesquisa é encerrada.' });
  assert.match((await rpcAdmin('clima_comentarios', cr.rodada.id)).erro, /depois que a pesquisa é encerrada/);
  assert.match((await rpcAdmin('clima_gerar_relatorio', cr.rodada.id, {})).erro, /Encerre a pesquisa/);

  const enc = await rpcAdmin('clima_encerrar', cr.rodada.id);
  assert.equal(enc.ok, true);
  assert.equal(enc.rodada.status, 'encerrada');
  assert.match((await rpcAdmin('clima_encerrar', cr.rodada.id)).erro, /já foi encerrada/);
  const res = (await rpcAdmin('clima_resultado', cr.rodada.id)).resultado;
  assert.equal(res.respondentes, 8);
  // e1 (6) aparece; e2 (2) fica em "Outras equipes"? Não: o resto (2) é menor que 5, então e1 some junto e só fica a empresa.
  assert.deepEqual(res.grupos.map((g) => g.id), ['empresa']);
  assert.deepEqual(res.equipes.map((e) => [e.situacao, e.motivo, e.grupo]), [['nao_aparece', 'complemento', 'empresa'], ['nao_aparece', 'minimo', 'empresa']]);
  assert.deepEqual(res.lideres, [], 'visão do líder só para equipes que aparecem');
  // O mesmo resultado que o JS.
  assert.deepEqual(res, CL.calcular({
    equipes: cr.rodada.equipes.map((e) => ({ id: e.id, nome: e.nome, area: e.area, ordem: e.ordem, convidados: e.convidados })),
    respostas: (await db.query(`select equipe_id, papel, itens, comentario, segundos from public.clima_respostas where rodada_id = $1`, [cr.rodada.id])).rows
      .map((x) => ({ equipeId: x.equipe_id, papel: x.papel, itens: x.itens, comentario: x.comentario, segundos: x.segundos })),
    complemento: false, n4: false }));
  // Depois do encerramento: link encerrado, envio recusado, equipes imutáveis, não reabre.
  assert.deepEqual(await rpcAnon('clima_publica', e1.tokenEquipe), { ok: false, erro: 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!', encerrada: true });
  assert.equal((await rpcAnon('clima_enviar', e1.tokenEquipe, { itens: { A1: 3 }, chave: chave() })).encerrada, true);
  await rejeita(db.query(`update public.clima_equipes set area = 'Outra' where id = $1`, [e1.id]), /não mudam mais/);
  await rejeita(db.query(`insert into public.clima_respostas (rodada_id, equipe_id, papel, versao_itens) values ($1, $2, 'membro', 'v0')`, [cr.rodada.id, e1.id]), /encerrada/);
  await rejeita(db.query(`update public.clima_rodadas set status = 'aberta', encerrada_em = null, resultado = null where id = $1`, [cr.rodada.id]), /não pode ser reaberta/);
  // Comentários: com menos de 10 respostas, não aparecem nem para o consultor.
  assert.deepEqual(await rpcAdmin('clima_comentarios', cr.rodada.id), { ok: true, disponivel: false, apagados: false, comentarios: [] });
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
});

test('relatório de clima: só agregados suprimidos no snapshot; temas só com 10+; o painel não grava o snapshot à mão', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Relatório');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, complemento: true, canalTexto: 'o RH', equipes: [{ liderId: o.L1, convidados: 12 }, { liderId: o.L2, convidados: 6 }] });
  const [e1, e2] = cr.rodada.equipes;
  const rnd = prng(7);
  for (let i = 0; i < 11; i++) {
    const it = itensTodos(1 + Math.floor(rnd() * 5));
    Object.assign(it, { N1: 4, N2: 3, N3: 2, N4: i < 2 ? 2 : 1, N5: 5 });
    await rpcAnon('clima_enviar', e1.tokenEquipe, { itens: it, comentario: 'Tema ' + (i % 3), segundos: 300, chave: chave() });
  }
  for (let i = 0; i < 5; i++) await rpcAnon('clima_enviar', e2.tokenEquipe, { itens: itensTodos(3), chave: chave() });
  assert.equal((await rpcAnon('clima_enviar', e1.tokenLider, { itens: itensLider(5), chave: chave() })).ok, true);
  await rpcAdmin('clima_encerrar', cr.rodada.id);
  const res = (await rpcAdmin('clima_resultado', cr.rodada.id)).resultado;
  assert.equal(res.lideres.length, 1, 'o consultor vê a visão do líder da equipe que aparece');
  assert.equal(res.complemento.n4.n, 11);
  assert.equal(res.complemento.n4.pct, 18);
  const com = await rpcAdmin('clima_comentarios', cr.rodada.id);
  assert.equal(com.disponivel, true);
  assert.deepEqual(com.comentarios.slice().sort(), Array.from({ length: 11 }, (_, i) => 'Tema ' + (i % 3)).sort());

  const g = await rpcAdmin('clima_gerar_relatorio', cr.rodada.id, { publicar: true, consultor: 'Wellington', temas: ['  Reuniões   longas ', 7, '', 'Ferramentas'] });
  assert.equal(g.ok, true, JSON.stringify(g));
  assert.equal(g.relatorio.status, 'publicado');
  const pub = await rpcAnon('relatorio_publico', g.relatorio.token);
  assert.equal(pub.ok, true);
  assert.equal(pub.modelo, 'clima');
  const d = pub.relatorio;
  assert.deepEqual(d.temas, ['Reuniões longas', 'Ferramentas']);
  assert.equal(d.consultor, 'Wellington');
  assert.equal(d.rodada.n4Ligado, true);
  assert.equal(d.resultado.lideres, undefined, 'a visão do líder nunca vai para o relatório do cliente');
  assert.equal(d.resultado.qualidade, undefined);
  assert.deepEqual(d.resultado, CL.visaoCliente(res), 'o snapshot = a visão do cliente do resultado congelado (igual ao JS)');
  const texto = JSON.stringify(d);
  assert.ok(!/"ad"/.test(texto), 'sem AD');
  assert.ok(!/Tema 0/.test(texto), 'sem texto literal de comentário');
  // Contagens só das equipes que aparecem.
  d.resultado.equipes.forEach((e) => { if (e.situacao !== 'aparece') assert.equal(e.respondentes, undefined); });
  // A rodada ganhou a data de entrega.
  assert.ok((await rpcAdmin('clima_listar', o.emp)).rodadas[0].entregueEm);
  // O painel não grava o snapshot direto; só publica/despublica.
  await rejeita(admin(`update public.relatorios set dados = '{"modelo":"clima"}' where token = $1`, [g.relatorio.token]), /só é montado pelo servidor/);
  await rejeita(admin(`insert into public.relatorios (modelo, empresa_id, clima_rodada_id, dados) values ('clima', $1, $2, '{}')`, [o.emp, cr.rodada.id]), /só é montado pelo servidor/);
  await admin(`update public.relatorios set status = 'rascunho' where token = $1`, [g.relatorio.token]);
  assert.deepEqual(await rpcAnon('relatorio_publico', g.relatorio.token), { ok: false, erro: 'Relatório não encontrado ou fora do ar.' });
  // Gerar de novo atualiza o mesmo relatório (um por rodada).
  const g2 = await rpcAdmin('clima_gerar_relatorio', cr.rodada.id, { publicar: true });
  assert.equal(g2.relatorio.token, g.relatorio.token);
  // Excluir a rodada leva o relatório junto.
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
  assert.equal((await db.query(`select count(*)::int as n from public.relatorios where token = $1`, [g.relatorio.token])).rows[0].n, 0);
});

test('retenção: apaga respostas brutas vencidas (ou já, por rodada), tira a visão do líder e mantém só agregados', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Retenção');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, retencaoDias: 30, equipes: [{ liderId: o.L1, convidados: 10 }] });
  const e1 = cr.rodada.equipes[0];
  for (let i = 0; i < 10; i++) await rpcAnon('clima_enviar', e1.tokenEquipe, { itens: itensTodos(4), comentario: 'texto ' + i, chave: chave() });
  assert.equal((await rpcAnon('clima_enviar', e1.tokenLider, { itens: itensLider(5), chave: chave() })).ok, true);
  await rpcAdmin('clima_encerrar', cr.rodada.id);
  assert.equal((await rpcAdmin('clima_resultado', cr.rodada.id)).resultado.lideres.length, 1);
  assert.deepEqual(await rpcAdmin('clima_apagar_brutas', null, false), { ok: true, rodadas: 0, respostas: 0 }, 'ainda no prazo');
  // Prazo vencido (encerrada há 31 dias, sem entrega): a função apaga.
  await db.query(`update public.clima_rodadas set encerrada_em = now() - interval '31 days' where id = $1`, [cr.rodada.id]);
  const ap = await rpcAdmin('clima_apagar_brutas', null, false);
  assert.deepEqual(ap, { ok: true, rodadas: 1, respostas: 11 });
  assert.equal((await db.query(`select count(*)::int as n from public.clima_respostas where rodada_id = $1`, [cr.rodada.id])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_recebidos where rodada_id = $1`, [cr.rodada.id])).rows[0].n, 0);
  const res = (await rpcAdmin('clima_resultado', cr.rodada.id)).resultado;
  assert.deepEqual(res.lideres, []);
  assert.equal(res.lideresApagados, true);
  assert.equal(res.grupos[0].dimensoes.A.escore, 65, 'o agregado continua (A3 invertido: 4 vira 2; média 3,6 = 65)');
  const lista = (await rpcAdmin('clima_listar', o.emp)).rodadas[0];
  assert.ok(lista.brutasApagadasEm);
  assert.equal(lista.respondentes, 10, 'a taxa continua a partir do agregado');
  assert.deepEqual(await rpcAdmin('clima_comentarios', cr.rodada.id), { ok: true, disponivel: false, apagados: true, comentarios: [] });
  // "Apagar já" de uma rodada encerrada no prazo; conexão direta (SQL Editor/agendamento do dono) também pode chamar.
  const cr2 = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] });
  await rpcAnon('clima_enviar', cr2.rodada.equipes[0].tokenEquipe, { itens: { A1: 2 }, chave: chave() });
  assert.equal((await rpcAdmin('clima_apagar_brutas', cr2.rodada.id, true)).rodadas, 0, 'rodada aberta não é apagada');
  await rpcAdmin('clima_encerrar', cr2.rodada.id);
  assert.deepEqual((await db.query(`select public.clima_apagar_brutas($1, true) as r`, [cr2.rodada.id])).rows[0].r, { ok: true, rodadas: 1, respostas: 1 });
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
  await rpcAdmin('clima_excluir_rodada', cr2.rodada.id);
});

// ---------------------------------------------------------------------------------------------------------------
// Conferência cruzada SQL × JS: mesmo resultado, inclusive nos casos de borda da supressão.
// ---------------------------------------------------------------------------------------------------------------
async function calcularSql(entrada) {
  return (await db.query(`select disc_interno.clima_calcular($1::jsonb, $2::jsonb, $3, $4) as r`,
    [JSON.stringify(entrada.equipes), JSON.stringify(entrada.respostas), !!entrada.complemento, !!entrada.n4])).rows[0].r;
}
function gerarEntrada(semente, opcoes) {
  const rnd = prng(semente);
  const op = opcoes || {};
  const areas = op.areas || ['Comercial', 'Comercial', 'Atendimento', '', 'Atendimento', 'Logística'];
  const tamanhos = op.tamanhos || areas.map(() => 1 + Math.floor(rnd() * 14));
  const equipes = tamanhos.map((n, i) => ({ id: 'e' + String.fromCharCode(97 + i), nome: 'Equipe ' + (i + 1), area: areas[i] || '', ordem: i, convidados: n + 2 }));
  const respostas = [];
  const ids = [];
  CL.BLOCOS.forEach((b) => b.itens.forEach((it) => ids.push(it.id)));
  equipes.forEach((e, i) => {
    for (let j = 0; j < tamanhos[i]; j++) {
      const vies = 1 + Math.floor(rnd() * 5);
      const itens = {};
      ids.concat(['H1', 'N1', 'N2', 'N3', 'N5']).forEach((id) => {
        if (rnd() < (op.pular || 0.15)) return;
        const v = Math.max(1, Math.min(5, vies + Math.floor(rnd() * 3) - 1));
        itens[id] = v;
      });
      if (rnd() < 0.8) itens.N4 = Math.floor(rnd() * 4);
      respostas.push({ equipeId: e.id, papel: 'membro', itens, comentario: rnd() < 0.3 ? 'c' : '', segundos: Math.floor(rnd() * 400) });
    }
    if (rnd() < 0.7) {
      const itens = {};
      ids.filter((id) => id[0] !== 'F' && id[0] !== 'G').concat(['FL1', 'FL2', 'FL3', 'H1']).forEach((id) => { if (rnd() < 0.9) itens[id] = 1 + Math.floor(rnd() * 5); });
      respostas.push({ equipeId: e.id, papel: 'lider', itens, comentario: '', segundos: null });
    }
  });
  return { equipes, respostas, complemento: op.complemento !== false, n4: op.n4 !== false };
}

test('conferência cruzada: o banco e o js/clima.js calculam e suprimem igual (30 rodadas sorteadas + casos de borda)', async () => {
  exigirBanco();
  const casos = [];
  for (let s = 1; s <= 30; s++) casos.push(gerarEntrada(s * 101));
  // Casos de borda: 4 equipes × 5; complemento com 9; área menos equipe < 5; tudo abaixo do mínimo; unanimidade.
  casos.push(gerarEntrada(5, { areas: ['', '', '', ''], tamanhos: [5, 5, 5, 5] }));
  casos.push(gerarEntrada(9, { areas: ['A', 'A', ''], tamanhos: [9, 0, 0] }));
  casos.push(gerarEntrada(11, { areas: ['Comercial', 'Comercial', 'Atendimento'], tamanhos: [8, 3, 9] }));
  casos.push(gerarEntrada(13, { areas: ['X', 'Y'], tamanhos: [2, 2] }));
  casos.push(gerarEntrada(17, { areas: ['', ''], tamanhos: [6, 6], pular: 0 }));
  const unanime = gerarEntrada(19, { areas: ['', ''], tamanhos: [7, 7], pular: 0 });
  unanime.respostas.forEach((r) => { if (r.papel === 'membro') Object.keys(r.itens).forEach((k) => { r.itens[k] = k === 'N4' ? 1 : 4; }); });
  casos.push(unanime);
  casos.push(gerarEntrada(23, { complemento: false }));
  casos.push(gerarEntrada(29, { n4: false }));
  for (const [i, c] of casos.entries()) {
    const sql = await calcularSql(c);
    const js = CL.calcular(c);
    assert.deepEqual(sql, js, 'caso ' + i);
    assert.deepEqual(await db.query(`select disc_interno.clima_visao_cliente($1::jsonb) as r`, [JSON.stringify(sql)]).then((x) => x.rows[0].r), CL.visaoCliente(js), 'visão do cliente, caso ' + i);
  }
});

test('suprimir (SQL): mesma árvore e mesmos cortes do JS', async () => {
  exigirBanco();
  const nos = [{ id: 'E', pai: '', ordem: 0 }, { id: 'A', pai: 'E', ordem: 1 }, { id: 'A1', pai: 'A', ordem: 1 }, { id: 'A2', pai: 'A', ordem: 2 },
    { id: 'B', pai: 'E', ordem: 3 }, { id: 'C', pai: 'E', ordem: 4 }];
  const cenarios = [
    { E: 30, A: 14, A1: 10, A2: 4, B: 9, C: 7 },
    { E: 20, A: 12, A1: 6, A2: 6, B: 5, C: 3 },
    { E: 4, A: 4, A1: 2, A2: 2, B: 0, C: 0 },
    { E: 25, A: 10, A1: 5, A2: 5, B: 10, C: 5 }
  ];
  const base = { E: true, A: true, A1: true, A2: true, B: true, C: true };
  for (const n of cenarios) {
    for (const k of [5, 10]) {
      const sql = (await db.query(`select disc_interno.clima_suprimir($1::jsonb, $2::jsonb, $3::jsonb, $4) as r`,
        [JSON.stringify(nos), JSON.stringify(n), JSON.stringify(base), k])).rows[0].r;
      assert.deepEqual(sql, CL.suprimir(nos, n, base, k), JSON.stringify(n) + ' k=' + k);
    }
  }
});

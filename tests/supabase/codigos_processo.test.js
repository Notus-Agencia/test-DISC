'use strict';
// Testes da migração 20261020120000_codigos_processo.sql (códigos de link de processo com 10 caracteres para os
// processos novos; os de 4 continuam valendo; limite por origem nas consultas públicas por código, com a mesma resposta
// para código inexistente e origem bloqueada) num Postgres 17 EMBUTIDO, com as 14 migrações aplicadas EM SEQUÊNCIA
// sobre dados "de produção" das anteriores. Mesmo preparo "tipo Supabase" de tests/supabase/clima.test.js.
// A origem é simulada como o PostgREST faz: request.headers (JSON) na transação.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { payloadValido } = require('../helpers/fixtures.js');
const API = require('../../js/api.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao', '20261019120000_versao_tecnica',
  '20261020120000_codigos_processo'];
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
const MSG = 'Link inválido ou avaliação encerrada. Fale com quem enviou o link.';
const MSG_ENVIO = 'Este link de avaliação não está mais ativo.';
const RE_NOVO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;

let pg = null;
let db = null;
let falhaInicio = null;

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-codigos-' + crypto.randomBytes(6).toString('hex'));
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

// Executa como o PostgREST: papel, usuário do JWT e (opcional) os cabeçalhos da requisição; somenteLeitura = GET.
async function como(papel, uid, sql, params, opcoes) {
  const o = opcoes || {};
  await db.query(o.somenteLeitura ? 'begin read only' : 'begin');
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
const admin = (sql, params) => como('authenticated', ADMIN, sql, params);
const json = (a) => (a && typeof a === 'object' ? JSON.stringify(a) : a);
async function rpc(fn, args, opcoes) {
  const marcas = args.map((_, i) => '$' + (i + 1)).join(', ');
  return (await como('anon', null, `select public.${fn}(${marcas}) as r`, args.map(json), opcoes)).rows[0].r;
}
// Consulta pública vinda de um IP (como o PostgREST na frente do Supabase mostra: x-forwarded-for).
const de = (ip, extra) => ({ cabecalhos: Object.assign({ 'x-forwarded-for': ip, 'user-agent': 'teste' }, extra || {}) });
const consultar = (codigo, opcoes) => rpc('avaliacao_publica', [codigo], opcoes);
const enviar = (payload, opcoes) => rpc('enviar_resposta', [payload], opcoes);

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}
async function limparLimites() { await db.query(`delete from public.limites_vendas where tipo = 'codigo_link'`); }
async function errosDe(chave) {
  return (await db.query(`select count(*)::int as n from public.limites_vendas where tipo = 'codigo_link' and chave = $1`, [chave])).rows[0].n;
}
async function funcoesDoAnon() {
  return (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'disc_interno') and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((x) => x.proname);
}

let seq = 0;
const novoId = () => 'cod-' + Date.now().toString(36) + '-' + (++seq);
const ANTIGO = {};   // códigos gravados antes da migração

test('as 14 migrações em sequência: códigos antigos intactos, idempotente, versão nova', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com')`, [ADMIN]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Admin')`, [ADMIN]);
  // Dados "de produção": um código sorteado pela regra antiga (4), um manual e um desativado, com resposta gravada.
  ANTIGO.sorteado = (await admin(`insert into public.processos (nome, empresa) values ('Recepção 2026', 'Clínica Antiga') returning codigo`)).rows[0].codigo;
  assert.match(ANTIGO.sorteado, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  ANTIGO.manual = (await admin(`insert into public.processos (nome, codigo, empresa) values ('Equipe', 'eqp1', 'Clínica Antiga') returning codigo`)).rows[0].codigo;
  assert.equal(ANTIGO.manual, 'EQP1');
  ANTIGO.desativado = (await admin(`insert into public.processos (nome, codigo, ativo) values ('Encerrado', 'OFF1', false) returning codigo`)).rows[0].codigo;
  const r = await enviar(payloadValido({ id: novoId(), avaliacao: ANTIGO.sorteado.toLowerCase() }));
  assert.equal(r.ok, true, r.erro);
  const antes = await funcoesDoAnon();
  assert.equal((await rpc('versao_banco', [])).versao, 20261017120000);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpc('versao_banco', []), { ok: true, versao: 20261020120000, migracoes: MIGRACOES, faltando: [] });
  // Nenhum código mudou; a resposta antiga continua ligada ao processo.
  const cods = (await db.query(`select codigo from public.processos order by criado_em`)).rows.map((x) => x.codigo);
  assert.deepEqual(cods, [ANTIGO.sorteado, ANTIGO.manual, ANTIGO.desativado]);
  const resp = (await db.query(`select r.avaliacao, p.codigo from public.respostas r join public.processos p on p.id = r.processo_id`)).rows;
  assert.deepEqual(resp, [{ avaliacao: ANTIGO.sorteado, codigo: ANTIGO.sorteado }]);
  // A regra antiga (só 4) saiu; a nova aceita 4 ou 10.
  const regras = (await db.query(`select conname, pg_get_constraintdef(oid) as d from pg_constraint
    where conrelid = 'public.processos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%codigo%'`)).rows;
  assert.deepEqual(regras.map((x) => x.conname), ['processos_codigo_formato']);
  // anon continua executando exatamente as mesmas funções (as auxiliares novas não entram na lista).
  assert.deepEqual(await funcoesDoAnon(), antes);
  // A anterior de novo e esta em seguida: tudo de pé.
  await db.query(SQL[ULTIMA - 1]);
  await db.query(SQL[ULTIMA]);
  assert.equal((await rpc('versao_banco', [])).versao, 20261020120000);
  // Sem esta migração, versao_banco (da anterior) não a conhece; com a regra antiga de volta, ela "falta".
  await db.query(`alter table public.processos drop constraint processos_codigo_formato`);
  assert.deepEqual((await rpc('versao_banco', [])).faltando, ['20261020120000_codigos_processo']);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual((await rpc('versao_banco', [])).faltando, []);
});

test('processo novo ganha 10 caracteres do alfabeto sem ambíguos; manuais de 4 ou 10 continuam aceitos', async () => {
  exigirBanco();
  const novos = [];
  for (let i = 0; i < 60; i++) {
    novos.push((await admin(`insert into public.processos (nome, empresa) values ($1, 'Empresa Nova') returning codigo`, ['Novo ' + i])).rows[0].codigo);
  }
  novos.forEach((c) => assert.match(c, RE_NOVO));
  assert.equal(new Set(novos).size, novos.length, 'sem repetição');
  // Os 32 símbolos aparecem (600 sorteios): o sorteio usa o alfabeto todo.
  assert.equal(new Set(novos.join('').split('')).size, 32);
  // O gerador sozinho também respeita o formato (e nunca devolve um código que já existe).
  const g = (await db.query(`select disc_interno.gerar_codigo_processo() as c from generate_series(1, 200)`)).rows.map((x) => x.c);
  g.forEach((c) => assert.match(c, RE_NOVO));
  // Código vazio/nulo informado também é sorteado com 10.
  const vazio = (await admin(`insert into public.processos (nome, codigo) values ('Vazio', '') returning codigo`)).rows[0].codigo;
  assert.match(vazio, RE_NOVO);
  // Manuais (importação da planilha, exemplos): 4 ou 10, minúsculas e espaços normalizados.
  assert.equal((await admin(`insert into public.processos (nome, codigo) values ('M4', ' ab 2c') returning codigo`)).rows[0].codigo, 'AB2C');
  assert.equal((await admin(`insert into public.processos (nome, codigo) values ('M10', 'k7qz 3mwr9t') returning codigo`)).rows[0].codigo, 'K7QZ3MWR9T');
  for (const ruim of ['ABCDE', 'ABC', 'K7QZ3MWR9', 'K7QZ3MWR9TX', 'AB-C', 'ÁBCD']) {
    await rejeita(admin(`insert into public.processos (nome, codigo) values ('Ruim', $1)`, [ruim]), /use 4 ou 10 letras ou números/);
  }
  // Editar um processo antigo não mexe no código; apagar o código também não.
  await admin(`update public.processos set nome = 'Recepção 2026 (editado)' where codigo = $1`, [ANTIGO.sorteado]);
  await admin(`update public.processos set codigo = '' where codigo = $1`, [ANTIGO.manual]);
  assert.equal((await db.query(`select count(*)::int as n from public.processos where codigo in ($1, $2)`, [ANTIGO.sorteado, ANTIGO.manual])).rows[0].n, 2);
  // A regra da coluna também vale para quem passa por fora do gatilho.
  await db.query(`alter table public.processos disable trigger processos_antes_gravar`);
  try {
    await rejeita(db.query(`insert into public.processos (nome, codigo) values ('Fora', 'abcd')`), /processos_codigo_formato/);
    await rejeita(db.query(`insert into public.processos (nome, codigo) values ('Fora', 'ABCDEFG')`), /processos_codigo_formato/);
  } finally {
    await db.query(`alter table public.processos enable trigger processos_antes_gravar`);
  }
  // Mesma regra de formato no site (js/api.js) e no banco.
  for (const c of [' ab 2c', 'k7qz 3mwr9t', 'ABCDE', "'SEL1", 'K7QZ3MWR9', '']) {
    const banco = (await db.query(`select disc_interno.normalizar_codigo($1) as c`, [c])).rows[0].c;
    assert.equal(API.normalizarCodigoAvaliacao(c.replace(/^'/, '')), banco, c);
  }
});

test('avaliacao_publica: código antigo (4) e novo (10) abrem o processo; inexistente, desativado e mal escrito dão a mesma resposta', async () => {
  exigirBanco();
  await limparLimites();
  const novo = (await admin(`insert into public.processos (nome, empresa, tipo) values ('Vendedor 2027', 'Loja Nova', 'selecao') returning codigo`)).rows[0].codigo;
  const r = await consultar(novo.toLowerCase().replace(/(.{5})/, '$1 '), de('203.0.113.10'));
  assert.equal(r.ok, true);
  assert.equal(r.avaliacao.codigo, novo);
  assert.equal(r.avaliacao.nome, 'Vendedor 2027');
  assert.equal(r.avaliacao.empresaNome, 'Loja Nova');
  const v = await consultar(ANTIGO.sorteado, de('203.0.113.10'));
  assert.equal(v.ok, true);
  assert.equal(v.avaliacao.codigo, ANTIGO.sorteado);
  assert.equal((await consultar('eqp1', de('203.0.113.10'))).avaliacao.codigo, 'EQP1');
  for (const c of ['ZZZZ', 'ZZZZZZZZZZ', ANTIGO.desativado, 'abc', 'K7QZ3MWR9', '<script>', '', null]) {
    assert.deepEqual(await consultar(c, de('203.0.113.10')), { ok: false, erro: MSG }, String(c));
  }
  // Só os 2 inexistentes bem formados contaram (desativado e mal escrito, não).
  assert.equal(await errosDe('ip4:203.0.113.10'), 2);
});

test('limite por origem: 20 códigos inexistentes em 10 minutos bloqueiam a origem, com a mesma resposta até para código certo', async () => {
  exigirBanco();
  await limparLimites();
  const ip = de('198.51.100.7');
  for (let i = 0; i < 20; i++) {
    const c = 'Q' + String(i).padStart(3, '0').replace(/0/g, 'A').replace(/1/g, 'B');
    assert.deepEqual(await consultar(c, ip), { ok: false, erro: MSG });
  }
  assert.equal(await errosDe('ip4:198.51.100.7'), 20);
  // Bloqueada: o código certo (novo ou antigo) recebe exatamente a resposta de inexistente — e não conta mais erro.
  const inexistente = await consultar('WWWW', ip);
  assert.deepEqual(await consultar(ANTIGO.sorteado, ip), inexistente);
  assert.deepEqual(inexistente, { ok: false, erro: MSG });
  assert.equal(await errosDe('ip4:198.51.100.7'), 20);
  // O envio pelo mesmo IP também é recusado como link inexistente (antes de validar o resto).
  assert.deepEqual(await enviar(payloadValido({ id: novoId(), avaliacao: ANTIGO.sorteado }), ip), { ok: false, erro: MSG_ENVIO });
  // Outra origem segue normal.
  assert.equal((await consultar(ANTIGO.sorteado, de('198.51.100.8'))).ok, true);
  // Passados 10 minutos (erros "envelhecidos"), a origem volta a consultar.
  await db.query(`update public.limites_vendas set em = em - interval '11 minutes' where tipo = 'codigo_link'`);
  assert.equal((await consultar(ANTIGO.sorteado, ip)).ok, true);
});

test('limite por origem: 100 erros em 24 horas também bloqueiam; processo desativado não conta', async () => {
  exigirBanco();
  await limparLimites();
  const chave = 'ip4:192.0.2.55';
  await db.query(`insert into public.limites_vendas (tipo, chave, em) select 'codigo_link', $1, now() - interval '3 hours' from generate_series(1, 99)`, [chave]);
  assert.equal((await consultar(ANTIGO.sorteado, de('192.0.2.55'))).ok, true, '99 no dia ainda passa');
  assert.deepEqual(await consultar('YYYY', de('192.0.2.55')), { ok: false, erro: MSG });
  assert.deepEqual(await consultar(ANTIGO.sorteado, de('192.0.2.55')), { ok: false, erro: MSG }, '100 no dia bloqueia');
  // Equipe inteira abrindo um link encerrado pela mesma rede: nunca bloqueia.
  for (let i = 0; i < 40; i++) assert.deepEqual(await consultar(ANTIGO.desativado, de('192.0.2.77')), { ok: false, erro: MSG });
  assert.equal(await errosDe('ip4:192.0.2.77'), 0);
  assert.equal((await consultar(ANTIGO.sorteado, de('192.0.2.77'))).ok, true);
  // Muitas consultas CERTAS da mesma rede (time respondendo junto) também não bloqueiam.
  for (let i = 0; i < 40; i++) assert.equal((await consultar(ANTIGO.manual, de('192.0.2.88'))).ok, true);
});

test('origem: forjar x-forwarded-for não escapa do cf-connecting-ip (e vice-versa); IPv6 conta pelo /64', async () => {
  exigirBanco();
  await limparLimites();
  // x-forwarded-for inventado a cada chamada, cf-connecting-ip fixo (posto pela Cloudflare): bloqueia pelo cf.
  for (let i = 0; i < 20; i++) {
    await consultar('XX' + String.fromCharCode(65 + i) + 'X', { cabecalhos: { 'cf-connecting-ip': '203.0.113.200', 'x-forwarded-for': '198.18.' + i + '.9' } });
  }
  assert.deepEqual(await consultar(ANTIGO.sorteado, { cabecalhos: { 'cf-connecting-ip': '203.0.113.200', 'x-forwarded-for': '198.18.99.9' } }), { ok: false, erro: MSG });
  // cf-connecting-ip inventado, x-forwarded-for real (os privados da rede interna são pulados): bloqueia pelo xff.
  for (let i = 0; i < 20; i++) {
    await consultar('XY' + String.fromCharCode(65 + i) + 'X', { cabecalhos: { 'cf-connecting-ip': '198.19.' + i + '.1', 'x-forwarded-for': '10.0.0.5, 192.168.1.9, 203.0.113.201:443, 172.70.1.1' } });
  }
  assert.equal(await errosDe('ip4:203.0.113.201'), 20);
  assert.deepEqual(await consultar(ANTIGO.sorteado, { cabecalhos: { 'cf-connecting-ip': '198.19.99.1', 'x-forwarded-for': '203.0.113.201' } }), { ok: false, erro: MSG });
  // O proxy que vem depois (172.70.1.1) não é a origem: não foi contado.
  assert.equal(await errosDe('ip4:172.70.1.1'), 0);
  // IPv6: endereços diferentes no mesmo /64 são a mesma origem; outro /64 segue livre.
  for (let i = 0; i < 20; i++) await consultar('XZ' + String.fromCharCode(65 + i) + 'X', de('2001:db8:aa:bb::' + (i + 1).toString(16)));
  assert.deepEqual(await consultar(ANTIGO.sorteado, de('[2001:db8:aa:bb:ffff::9]:51000')), { ok: false, erro: MSG });
  assert.equal((await consultar(ANTIGO.sorteado, de('2001:db8:aa:bc::1'))).ok, true);
  assert.equal(await errosDe('ip6:2001:db8:aa:bb::'), 20);
  // IPv4 escrito como IPv6 (::ffff:a.b.c.d) é o mesmo IPv4.
  await consultar('ZQZQ', de('::ffff:203.0.113.77'));
  assert.equal(await errosDe('ip4:203.0.113.77'), 1);
  // Cabeçalhos sem IP nenhum: uma origem só ("sem-ip"), também limitada.
  for (let i = 0; i < 20; i++) await consultar('XW' + String.fromCharCode(65 + i) + 'X', { cabecalhos: { 'user-agent': 'robo', 'x-forwarded-for': 'lixo' } });
  assert.deepEqual(await consultar(ANTIGO.sorteado, { cabecalhos: { 'user-agent': 'robo' } }), { ok: false, erro: MSG });
});

test('sem cabeçalhos (conexão direta ao banco) não há limite; GET (transação só de leitura) recebe sempre a resposta de inexistente', async () => {
  exigirBanco();
  await limparLimites();
  for (let i = 0; i < 25; i++) assert.deepEqual(await consultar('VV' + String.fromCharCode(65 + i) + 'V'), { ok: false, erro: MSG });
  assert.equal((await db.query(`select count(*)::int as n from public.limites_vendas where tipo = 'codigo_link'`)).rows[0].n, 0);
  assert.equal((await consultar(ANTIGO.sorteado)).ok, true);
  // GET no PostgREST = transação só de leitura: o erro não poderia ser contado, então nem o código certo responde.
  const leitura = Object.assign({ somenteLeitura: true }, de('203.0.113.99'));
  assert.deepEqual(await consultar(ANTIGO.sorteado, leitura), { ok: false, erro: MSG });
  assert.deepEqual(await consultar('NNNN', leitura), { ok: false, erro: MSG });
  assert.deepEqual(await enviar(payloadValido({ id: novoId(), avaliacao: 'NNNN' }), leitura), { ok: false, erro: MSG_ENVIO });
});

test('enviar_resposta: código novo e antigo gravam a resposta no processo; código inexistente conta erro da origem', async () => {
  exigirBanco();
  await limparLimites();
  const novo = (await admin(`insert into public.processos (nome, empresa) values ('Caixa 2027', 'Mercado Novo') returning id, codigo`)).rows[0];
  const ip = de('203.0.113.150');
  const a = await enviar(payloadValido({ id: novoId(), telefone: '5511977770001', avaliacao: novo.codigo.toLowerCase() }), ip);
  assert.equal(a.ok, true, a.erro);
  const linhaA = (await db.query(`select avaliacao, processo_id from public.respostas where id = $1`, [a.id])).rows[0];
  assert.deepEqual(linhaA, { avaliacao: novo.codigo, processo_id: novo.id });
  const b = await enviar(payloadValido({ id: novoId(), telefone: '5511977770002', avaliacao: ANTIGO.manual }), ip);
  assert.equal(b.ok, true, b.erro);
  assert.equal((await db.query(`select avaliacao from public.respostas where id = $1`, [b.id])).rows[0].avaliacao, 'EQP1');
  // Código inexistente: mesma mensagem de sempre, e conta 1 erro (desativado não conta).
  assert.deepEqual(await enviar(payloadValido({ id: novoId(), avaliacao: 'ZZZZZZZZZ2' }), ip), { ok: false, erro: MSG_ENVIO });
  assert.deepEqual(await enviar(payloadValido({ id: novoId(), avaliacao: ANTIGO.desativado }), ip), { ok: false, erro: MSG_ENVIO });
  assert.equal(await errosDe('ip4:203.0.113.150'), 1);
  // Erros do envio e da consulta somam na mesma conta: 19 consultas + 1 envio = bloqueada nas duas.
  for (let i = 0; i < 19; i++) await consultar('UU' + String.fromCharCode(65 + i) + 'U', ip);
  assert.deepEqual(await consultar(novo.codigo, ip), { ok: false, erro: MSG });
  assert.deepEqual(await enviar(payloadValido({ id: novoId(), telefone: '5511977770003', avaliacao: novo.codigo }), ip), { ok: false, erro: MSG_ENVIO });
  // Sem código (fluxo geral) o envio não depende do limite.
  const geral = await enviar(payloadValido({ id: novoId(), telefone: '5511977770004' }), ip);
  assert.equal(geral.ok, true, geral.erro);
});

test('permissões: as auxiliares novas não são executáveis por anon nem authenticated; limites_vendas fechada', async () => {
  exigirBanco();
  const aux = ['gerar_codigo_processo()', 'ip_de_texto(text)', 'ip_publico(inet)', 'chave_ip(inet)', 'origens_requisicao()',
    'codigo_link_bloqueado(text[])', 'registrar_codigo_inexistente(text[])'];
  for (const f of aux) {
    for (const papel of ['anon', 'authenticated']) {
      const r = await db.query(`select has_function_privilege($1, 'disc_interno.${f}', 'execute') as v`, [papel]);
      assert.equal(r.rows[0].v, false, `${papel} executa ${f}`);
    }
  }
  for (const papel of ['anon', 'authenticated', 'service_role']) {
    const r = await db.query(`select has_function_privilege($1, 'public.avaliacao_publica(text)', 'execute') as a,
      has_function_privilege($1, 'public.enviar_resposta(jsonb)', 'execute') as e`, [papel]);
    assert.deepEqual(r.rows[0], { a: true, e: true }, papel);
  }
  for (const pr of ['select', 'insert', 'update', 'delete']) {
    const r = await db.query(`select has_table_privilege('anon', 'public.limites_vendas', $1) v`, [pr]);
    assert.equal(r.rows[0].v, false, `anon tem ${pr} em limites_vendas`);
  }
  await rejeita(como('anon', null, `select disc_interno.gerar_codigo_processo()`), /permission denied/);
  // security definer com search_path fixo em todas as novas
  const semPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'disc_interno' and p.proname in ('codigo_link_bloqueado', 'registrar_codigo_inexistente', 'gerar_codigo_processo',
      'origens_requisicao', 'ip_de_texto', 'ip_publico', 'chave_ip')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(semPath.rows, []);
});

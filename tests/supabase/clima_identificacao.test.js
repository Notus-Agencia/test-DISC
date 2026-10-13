'use strict';
// Testes da migração 20261018120000_clima_identificacao.sql (Pesquisa de Clima: modos anônima, identificação opcional e
// identificada). RLS (anon não lê identidade; nem o admin lê as tabelas novas pela API; o cliente não vê nomes), link
// pessoal de uso único, confirmação por código (só a Edge Function gera; validade e tentativas limitadas) e por CPF/data
// (só hash com sal, nunca o dado em claro), registro de acesso da tela de uso interno, retenção e o relatório do cliente
// igual em todos os modos. Postgres 17 EMBUTIDO com as 14 migrações aplicadas em sequência.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const CL = require('../../js/clima.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao'];
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
const MSG_CODIGO = 'Código incorreto ou vencido. Confira os 6 dígitos ou peça um novo código.';

let pg = null;
let db = null;
let falhaInicio = null;

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-clima-id-' + crypto.randomBytes(6).toString('hex'));
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
const servico = (sql, params) => como('service_role', null, sql, params);
function rpcComo(quem, fn, ...args) {
  const marcas = args.map((_, i) => '$' + (i + 1)).join(', ');
  const vals = args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a));
  return quem(`select public.${fn}(${marcas}) as r`, vals).then((x) => x.rows[0].r);
}
const rpcAnon = (fn, ...a) => rpcComo(anon, fn, ...a);
const rpcAdmin = (fn, ...a) => rpcComo(admin, fn, ...a);
const rpcServico = (fn, ...a) => rpcComo(servico, fn, ...a);

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}

// Organograma: L1 lidera 6 (dois com e-mail), L2 lidera 3, L3 lidera L1 e L2.
let seqTel = 0;
async function pessoa(nome, email) {
  seqTel += 1;
  return (await db.query(`insert into public.pessoas (telefone, nome, email) values ($1, $2, $3) returning id`,
    ['55969' + String(10000000 + seqTel), nome, email || ''])).rows[0].id;
}
async function empresaComOrganograma(nome) {
  const emp = (await db.query(`insert into public.empresas (nome) values ($1) returning id`, [nome])).rows[0].id;
  const L3 = await pessoa('Lia Diretora Silva');
  const L1 = await pessoa('Bruno de Souza');
  const L2 = await pessoa('Carla Mendes');
  const liderados1 = [];
  for (let i = 0; i < 6; i++) liderados1.push(await pessoa('Pessoa Um ' + i + ' Teste', i < 2 ? 'pessoa.um' + i + '@empresa.com.br' : ''));
  const liderados2 = [];
  for (let i = 0; i < 3; i++) liderados2.push(await pessoa('Pessoa Dois ' + i + ' Teste'));
  const areas = { [L3]: 'Diretoria' };
  for (const p of [L3, L1, L2, ...liderados1, ...liderados2]) {
    await db.query(`insert into public.vinculos (pessoa_id, empresa_id, cargo, area) values ($1, $2, 'Cargo', $3)`, [p, emp, areas[p] || 'Comercial']);
  }
  const rel = [[L3, L1], [L3, L2], ...liderados1.map((x) => [L1, x]), ...liderados2.map((x) => [L2, x])];
  for (const [de, para] of rel) {
    await db.query(`insert into public.relacoes (empresa_id, de_pessoa, para_pessoa, tipo) values ($1, $2, $3, 'lidera')`, [emp, de, para]);
  }
  return { emp, L1, L2, L3, liderados1, liderados2 };
}

const chave = () => crypto.randomBytes(16).toString('hex');
function itensTodos(v) {
  const it = {};
  CL.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; }));
  it.H1 = v;
  return it;
}
// Todas as linhas das tabelas que guardam algo da pessoa, em texto (para procurar dado em claro).
async function tudoEmTexto() {
  const partes = [];
  for (const t of ['clima_conferencias', 'clima_convites', 'clima_codigos', 'clima_identificacoes', 'clima_respostas', 'clima_rodadas', 'limites_vendas']) {
    partes.push(JSON.stringify((await db.query(`select * from public.${t}`)).rows));
  }
  return partes.join('\n');
}
function convitesDe(rodada) {
  const lista = [];
  rodada.equipes.forEach((e) => e.convites.forEach((c) => lista.push(Object.assign({ equipeId: e.id }, c))));
  return lista;
}

test('as 14 migrações em sequência: idempotente, versão nova; rodadas que já existiam continuam anônimas', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'outro@x.com')`, [ADMIN, OUTRO]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Wellington')`, [ADMIN]);
  const o = await empresaComOrganograma('Clima Antiga');
  const antiga = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] });
  assert.equal(antiga.ok, true);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261017120000);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpcAnon('versao_banco'), { ok: true, versao: 20261018120000, migracoes: MIGRACOES, faltando: [] });
  const lista = await rpcAdmin('clima_listar', o.emp);
  assert.equal(lista.rodadas[0].modo, 'anonima');
  assert.deepEqual(lista.rodadas[0].metodos, []);
  assert.deepEqual(lista.rodadas[0].equipes[0].convites, []);
  // O link coletivo da rodada antiga continua igual (anônimo).
  const pub = await rpcAnon('clima_publica', antiga.rodada.equipes[0].tokenEquipe);
  assert.equal(pub.ok, true);
  assert.equal(pub.modo, 'anonima');
  assert.equal(pub.pessoal, false);
  assert.deepEqual(await rpcAnon('clima_enviar', antiga.rodada.equipes[0].tokenEquipe, { itens: { A1: 4 }, chave: chave() }), { ok: true });
  // A anterior de novo e esta em seguida: tudo de pé.
  await db.query(SQL[ULTIMA - 1]);
  await db.query(SQL[ULTIMA]);
  assert.equal((await rpcAnon('versao_banco')).versao, 20261018120000);
  await rpcAdmin('clima_excluir_rodada', antiga.rodada.id);
});

test('RLS: anon não lê nada de identidade; nem o admin lê as tabelas novas pela API; só as funções', async () => {
  exigirBanco();
  for (const t of ['clima_conferencias', 'clima_convites', 'clima_codigos', 'clima_identificacoes', 'clima_acessos']) {
    await rejeita(anon(`select * from public.${t}`), /permission denied/);
    await rejeita(anon(`insert into public.${t} default values`), /permission denied/);
    await rejeita(admin(`select * from public.${t}`), /permission denied/);
    await rejeita(outro(`select * from public.${t}`), /permission denied/);
  }
  // Funções do painel: anon não executa; logado sem ser admin recebe "Sem permissão."
  const id = crypto.randomUUID();
  for (const [fn, args] of [['clima_identificacao', [id]], ['clima_desidentificar', [id, id]], ['clima_convite_renovar', [id]],
    ['clima_colaboradores_dados', [id]], ['clima_colaborador_salvar', [{}]]]) {
    await rejeita(rpcAnon(fn, ...args), /permission denied/);
    assert.deepEqual(await rpcComo(outro, fn, ...args), { ok: false, erro: 'Sem permissão.' }, fn);
  }
  // Gerar código: só a Edge Function (service_role). Nem anon nem o admin pelo navegador.
  await rejeita(rpcAnon('clima_codigo_novo', 'a'.repeat(64), 'email'), /permission denied/);
  await rejeita(rpcAdmin('clima_codigo_novo', 'a'.repeat(64), 'email'), /permission denied/);
  await rejeita(anon(`select disc_interno.clima_hash('a', 'b')`), /permission denied/);
});

test('criar rodada nos modos: link pessoal por liderado ativo, formas de confirmação conforme o cadastro; modo travado', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Modos');
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'secreta', equipes: [{ liderId: o.L1 }] })).erro, /Modo da pesquisa inválido/);
  assert.match((await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'identificada', equipes: [{ liderId: o.L1, convidados: 8 }] })).erro,
    /só responde quem está no cadastro/);
  // CPF/data cadastrados para 1 pessoa da equipe de L1.
  assert.equal((await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados1[2], cpf3: '123', nascimento: '07/03' })).conferencia, true);
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'opcional', metodos: ['dados', 'email', 'fax'],
    equipes: [{ liderId: o.L1, convidados: 8 }, { liderId: o.L2 }] });
  assert.equal(cr.ok, true, JSON.stringify(cr));
  const r = cr.rodada;
  assert.equal(r.modo, 'opcional');
  assert.deepEqual(r.metodos, ['email', 'dados'], 'ordem fixa; desconhecido fica de fora');
  assert.equal(r.equipes[0].convidados, 8, 'no modo opcional dá para convidar gente fora do cadastro (link coletivo)');
  assert.equal(r.equipes[0].convites.length, 6);
  assert.equal(r.equipes[1].convites.length, 3);
  const porPessoa = {};
  convitesDe(r).forEach((c) => { porPessoa[c.pessoaId] = c; assert.match(c.token, /^[0-9a-f]{64}$/); });
  assert.deepEqual(porPessoa[o.liderados1[0]].metodos, ['email']);
  assert.deepEqual(porPessoa[o.liderados1[2]].metodos, ['dados']);
  assert.deepEqual(porPessoa[o.liderados1[4]].metodos, [], 'sem e-mail e sem CPF/data: o link pessoal sozinho');
  assert.equal(porPessoa[o.L1], undefined, 'o líder não ganha link pessoal na própria equipe');
  // Travado depois de criada.
  await rejeita(db.query(`update public.clima_rodadas set modo = 'anonima' where id = $1`, [r.id]), /não mudam depois/);
  await rejeita(db.query(`update public.clima_rodadas set metodos = '{}' where id = $1`, [r.id]), /não mudam depois/);
  await rejeita(db.query(`update public.clima_rodadas set metodos = '{"email"}', modo = 'anonima' where id = $1`, [r.id]), /check constraint|não mudam/);
  // Anônima: sem links pessoais nem formas de confirmação.
  await rpcAdmin('clima_excluir_rodada', r.id);
  await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados1[2], cpf3: '123', nascimento: '07/03' });
  const an = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, metodos: ['email'], equipes: [{ liderId: o.L1 }] });
  assert.equal(an.rodada.modo, 'anonima');
  assert.deepEqual(an.rodada.metodos, []);
  assert.deepEqual(an.rodada.equipes[0].convites, []);
  await rpcAdmin('clima_excluir_rodada', an.rodada.id);
});

test('CPF/data no cadastro: só hash com sal (nunca o dado em claro); validação; e-mail; desligar apaga', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Cadastro');
  const alvo = o.liderados2[0];
  for (const [cpf3, nascimento] of [['12', '07/03'], ['1234', '07/03'], ['abc', '07/03'], ['123', '31/04'], ['123', '00/05'], ['123', '07/13'], ['123', '']]) {
    assert.match((await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: alvo, cpf3, nascimento })).erro, /Confira os 3 últimos dígitos/, cpf3 + ' ' + nascimento);
  }
  assert.match((await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.L3, email: 'sem-arroba' })).erro, /E-mail inválido/);
  assert.match((await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: crypto.randomUUID(), cpf3: '123', nascimento: '07/03' })).erro, /não encontrado/);
  const s = await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: alvo, email: ' Ana@Empresa.COM ', cpf3: '987', nascimento: '29/02' });
  assert.deepEqual(s, { ok: true, email: 'ana@empresa.com', conferencia: true });
  const linha = (await db.query(`select * from public.clima_conferencias where pessoa_id = $1`, [alvo])).rows[0];
  assert.match(linha.sal, /^[0-9a-f]{32}$/);
  assert.equal(linha.hash, crypto.createHash('sha256').update(linha.sal + ':987:2902').digest('hex'), 'sha256 de "sal:ccc:DDMM"');
  assert.notEqual(linha.hash, crypto.createHash('sha256').update('987:2902').digest('hex'), 'com sal');
  const texto = await tudoEmTexto();
  for (const claro of ['987', '2902', '29/02']) assert.ok(!texto.includes('"' + claro) && !texto.includes(claro + '"') && !texto.includes(':' + claro), 'sem ' + claro + ' em claro');
  // O mesmo dado em outra pessoa gera hash diferente (sal por linha).
  await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados2[1], cpf3: '987', nascimento: '29/02' });
  const hashes = (await db.query(`select hash from public.clima_conferencias where pessoa_id = any($1)`, [[alvo, o.liderados2[1]]])).rows.map((x) => x.hash);
  assert.notEqual(hashes[0], hashes[1]);
  // Status no painel: e-mail e "tem conferência" (nunca o dado).
  const st = await rpcAdmin('clima_colaboradores_dados', o.emp);
  const st1 = st.pessoas.find((x) => x.pessoaId === alvo);
  assert.deepEqual(st1, { pessoaId: alvo, email: 'ana@empresa.com', conferencia: true });
  // Sem os ids (um uuid aleatório pode conter "987"): só os campos de dado é que não podem trazer o CPF.
  assert.ok(!JSON.stringify(st.pessoas.map(({ pessoaId, ...resto }) => resto)).includes('987'));
  // Apagar pelo painel; e desligar o colaborador apaga.
  assert.equal((await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: alvo, apagarConferencia: true })).conferencia, false);
  await db.query(`update public.vinculos set status = 'desligado', fim = current_date where pessoa_id = $1`, [o.liderados2[1]]);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_conferencias where pessoa_id = $1`, [o.liderados2[1]])).rows[0].n, 0);
});

test('identificada: link coletivo recusado; CPF/data conferem; uso único; tentativas limitadas; nada de IP', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Identificada');
  await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados1[3], cpf3: '045', nascimento: '15/08' });
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'identificada', metodos: ['dados', 'email'], equipes: [{ liderId: o.L1 }] });
  const r = cr.rodada;
  const eq = r.equipes[0];
  const cv = Object.fromEntries(convitesDe(r).map((c) => [c.pessoaId, c]));
  // Link coletivo não abre no modo identificado; o do líder abre.
  assert.match((await rpcAnon('clima_publica', eq.tokenEquipe)).erro, /é identificada: responda pelo link pessoal/);
  assert.match((await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { A1: 3 }, chave: chave() })).erro, /é identificada/);
  assert.equal((await rpcAnon('clima_publica', eq.tokenLider)).papel, 'lider');
  // Link pessoal com CPF/data.
  const tk = cv[o.liderados1[3]].token;
  const pub = await rpcAnon('clima_publica', tk);
  assert.deepEqual([pub.ok, pub.papel, pub.modo, pub.pessoal, pub.metodos, pub.emailMascarado], [true, 'membro', 'identificada', true, ['dados'], '']);
  assert.ok(!JSON.stringify(pub).includes('Pessoa Um'), 'o link não mostra o nome antes de confirmar');
  // Sem confirmação; método que o link não tem; formato inválido (não conta tentativa).
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave() }), { ok: false, erro: 'Confirme que é você antes de enviar.', confirmar: true });
  assert.equal((await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: '123456' } })).confirmar, true);
  assert.match((await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'dados', cpf3: '45', nascimento: '15/08' } })).erro, /Informe os 3 últimos dígitos/);
  // Dados errados: 5 tentativas em 24 h; a 6ª é recusada mesmo com o dado certo.
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '16/08' } }),
      { ok: false, erro: 'Os dados não conferem com o cadastro. Confira e tente de novo.' });
  }
  assert.match((await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/08' } })).erro, /Muitas tentativas/);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_respostas where rodada_id = $1`, [r.id])).rows[0].n, 0);
  // Link novo (painel) zera as tentativas e invalida o antigo.
  const nv = await rpcAdmin('clima_convite_renovar', cv[o.liderados1[3]].id);
  assert.equal(nv.ok, true);
  assert.match((await rpcAnon('clima_publica', tk)).erro, /Link inválido/);
  const tk2 = nv.convite.token;
  const k = chave();
  assert.deepEqual(await rpcAnon('clima_enviar', tk2, { itens: itensTodos(4), comentario: 'Mais conversa', chave: k, confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '1508' } }),
    { ok: true, identificada: true });
  // Reenvio da mesma chave (rede caiu): já gravado. Outro envio: o link é de uso único.
  assert.deepEqual(await rpcAnon('clima_enviar', tk2, { itens: itensTodos(4), chave: k }), { ok: true, duplicado: true });
  assert.deepEqual(await rpcAnon('clima_enviar', tk2, { itens: itensTodos(2), chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/08' } }),
    { ok: false, erro: 'Este link pessoal já foi usado para responder. Obrigado!', usado: true });
  assert.equal((await rpcAnon('clima_publica', tk2)).usado, true);
  assert.match((await rpcAdmin('clima_convite_renovar', cv[o.liderados1[3]].id)).erro, /já foi usado/);
  // Identificação guardada à parte (sem IP, sem horário); a resposta continua sem nada da pessoa.
  const ident = (await db.query(`select * from public.clima_identificacoes where rodada_id = $1`, [r.id])).rows;
  assert.equal(ident.length, 1);
  assert.deepEqual(Object.keys(ident[0]).sort(), ['confirmado_por', 'convite_id', 'nome', 'pessoa_id', 'resposta_id', 'rodada_id']);
  assert.equal(ident[0].confirmado_por, 'dados');
  assert.equal(ident[0].pessoa_id, o.liderados1[3]);
  const colunas = (await db.query(`select column_name from information_schema.columns where table_schema = 'public'
    and table_name = 'clima_respostas' order by ordinal_position`)).rows.map((x) => x.column_name);
  assert.deepEqual(colunas, ['id', 'rodada_id', 'equipe_id', 'papel', 'versao_itens', 'itens', 'comentario', 'segundos']);
  const todas = await tudoEmTexto();
  assert.ok(!/\b(\d{1,3}\.){3}\d{1,3}\b/.test(todas), 'nenhum endereço IP gravado');
  // Sem forma de confirmação: o link pessoal sozinho identifica (uso único).
  const soLink = cv[o.liderados1[5]].token;
  assert.deepEqual(cv[o.liderados1[5]].metodos, []);
  assert.deepEqual(await rpcAnon('clima_enviar', soLink, { itens: { A1: 2 }, chave: chave() }), { ok: true, identificada: true });
  assert.equal((await db.query(`select confirmado_por from public.clima_identificacoes where pessoa_id = $1`, [o.liderados1[5]])).rows[0].confirmado_por, 'link');
  await rpcAdmin('clima_excluir_rodada', r.id);
});

test('código por e-mail: só a Edge Function gera; 6 dígitos com hash e sal; 10 min; 5 tentativas; limites; mensagem única', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Código');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'identificada', metodos: ['email', 'whatsapp'], equipes: [{ liderId: o.L1 }] });
  const cv = Object.fromEntries(convitesDe(cr.rodada).map((c) => [c.pessoaId, c]));
  const tk = cv[o.liderados1[0]].token;
  assert.deepEqual(cv[o.liderados1[0]].metodos, ['email', 'whatsapp']);
  assert.deepEqual(cv[o.liderados1[4]].metodos, ['whatsapp'], 'sem e-mail: só o WhatsApp (o telefone é obrigatório no cadastro)');
  assert.equal((await rpcAnon('clima_publica', tk)).emailMascarado, 'p***@e***.com.br');
  // Mensagem única para link inválido, canal que o link não tem e canal inválido.
  const MSG = 'Não foi possível enviar um código por este link. Use outra forma de confirmação ou fale com quem enviou o link.';
  assert.deepEqual(await rpcServico('clima_codigo_novo', 'f'.repeat(64), 'email'), { ok: false, erro: MSG });
  assert.deepEqual(await rpcServico('clima_codigo_novo', cv[o.liderados1[4]].token, 'email'), { ok: false, erro: MSG });
  assert.deepEqual(await rpcServico('clima_codigo_novo', tk, 'sms'), { ok: false, erro: MSG });
  const c1 = await rpcServico('clima_codigo_novo', tk, 'email');
  assert.equal(c1.ok, true);
  assert.match(c1.codigo, /^[0-9]{6}$/);
  assert.equal(c1.destino, 'pessoa.um0@empresa.com.br');
  assert.equal(c1.destinoMascarado, 'p***@e***.com.br');
  assert.equal(c1.minutos, 10);
  const linha = (await db.query(`select * from public.clima_codigos where convite_id = $1`, [cv[o.liderados1[0]].id])).rows[0];
  assert.equal(linha.hash, crypto.createHash('sha256').update(linha.sal + ':' + c1.codigo).digest('hex'));
  assert.ok(!(await tudoEmTexto()).includes('"' + c1.codigo + '"'), 'o código não fica em claro no banco');
  const validade = (new Date(linha.expira_em) - Date.now()) / 60000;
  assert.ok(validade > 9 && validade <= 10.1, 'validade de 10 minutos');
  // 1 por minuto.
  assert.match((await rpcServico('clima_codigo_novo', tk, 'email')).erro, /Espere um minuto/);
  // Código errado: 5 tentativas; depois nem o certo vale.
  const errado = c1.codigo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: errado } }), { ok: false, erro: MSG_CODIGO });
  }
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: c1.codigo } }), { ok: false, erro: MSG_CODIGO });
  // Código do canal errado não vale; vencido não vale.
  await db.query(`update public.clima_codigos set criado_em = now() - interval '2 minutes' where convite_id = $1`, [cv[o.liderados1[0]].id]);
  const c2 = await rpcServico('clima_codigo_novo', tk, 'email');
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'whatsapp', codigo: c2.codigo } }), { ok: false, erro: MSG_CODIGO });
  await db.query(`update public.clima_codigos set expira_em = now() - interval '1 second' where convite_id = $1`, [cv[o.liderados1[0]].id]);
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: c2.codigo } }), { ok: false, erro: MSG_CODIGO });
  // Código novo e certo: identifica e apaga o código.
  await db.query(`update public.clima_codigos set criado_em = now() - interval '2 minutes' where convite_id = $1`, [cv[o.liderados1[0]].id]);
  const c3 = await rpcServico('clima_codigo_novo', tk, 'email');
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: ' ' + c3.codigo.slice(0, 3) + ' ' + c3.codigo.slice(3) } }),
    { ok: true, identificada: true });
  assert.equal((await db.query(`select count(*)::int as n from public.clima_codigos where convite_id = $1`, [cv[o.liderados1[0]].id])).rows[0].n, 0);
  assert.deepEqual(await rpcServico('clima_codigo_novo', tk, 'email'), { ok: false, erro: MSG }, 'link usado: mensagem única');
  // Limite de pedidos por link: 5 a cada 24 h.
  const tk2 = cv[o.liderados1[1]].token;
  for (let i = 0; i < 5; i++) {
    assert.equal((await rpcServico('clima_codigo_novo', tk2, 'email')).ok, true);
    await db.query(`update public.clima_codigos set criado_em = now() - interval '2 minutes' where convite_id = $1`, [cv[o.liderados1[1]].id]);
  }
  assert.match((await rpcServico('clima_codigo_novo', tk2, 'email')).erro, /Muitos pedidos de código/);
  // WhatsApp: mesmo caminho (o envio depende do provedor, na Edge Function).
  const w = await rpcServico('clima_codigo_novo', cv[o.liderados1[4]].token, 'whatsapp');
  assert.equal(w.ok, true);
  assert.match(w.destinoMascarado, /^final [0-9]{2}$/);
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
});

test('opcional: "prefiro manter o anonimato" vai como o link coletivo (não marca o link); "quero me identificar" liga', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Opcional');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'opcional', metodos: ['dados'], equipes: [{ liderId: o.L1, convidados: 7 }] });
  const eq = cr.rodada.equipes[0];
  const tk = eq.convites[0].token;
  // Link coletivo no modo opcional: anônimo, com o convite para usar o link pessoal.
  const pubEq = await rpcAnon('clima_publica', eq.tokenEquipe);
  assert.deepEqual([pubEq.modo, pubEq.pessoal], ['opcional', false]);
  assert.deepEqual(await rpcAnon('clima_enviar', eq.tokenEquipe, { itens: { A1: 5 }, chave: chave() }), { ok: true });
  // Anônimo pelo link pessoal: sem identificação e o link continua livre.
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 3 }, chave: chave(), identificar: false }), { ok: true });
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 3 }, chave: chave(), identificar: 'sim' }), { ok: true }, 'só true identifica');
  assert.equal((await db.query(`select count(*)::int as n from public.clima_identificacoes`)).rows[0].n, 0);
  assert.equal((await db.query(`select usado from public.clima_convites where token = $1`, [tk])).rows[0].usado, false);
  // "Quero me identificar" sem dados no cadastro: o link pessoal sozinho (de uso único).
  assert.deepEqual(eq.convites[0].metodos, []);
  assert.deepEqual(await rpcAnon('clima_enviar', tk, { itens: { A1: 2 }, chave: chave(), identificar: true }), { ok: true, identificada: true });
  assert.equal((await rpcAnon('clima_publica', tk)).usado, true);
  // O limite por equipe (convidados) continua valendo para todos os caminhos.
  const lista = await rpcAdmin('clima_listar', o.emp);
  assert.equal(lista.rodadas[0].respondentes, 4);
  assert.equal(lista.rodadas[0].identificadas, 1);
  assert.ok(!JSON.stringify(lista).includes('"usado"'), 'a lista do painel não diz quem respondeu');
  await rpcAdmin('clima_excluir_rodada', cr.rodada.id);
});

test('uso interno: registra quem abriu e quando; respostas só depois do encerramento; o cliente nunca vê nomes', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Uso Interno');
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'identificada', metodos: [], complemento: true, canalTexto: 'o RH',
    equipes: [{ liderId: o.L1 }, { liderId: o.L2 }] });
  const r = cr.rodada;
  const convites = convitesDe(r);
  assert.equal(convites.length, 9);
  for (const [i, c] of convites.entries()) {
    const it = itensTodos(1 + (i % 5));
    Object.assign(it, { N1: 3, N2: 4, N3: 2, N4: i === 0 ? 2 : 1, N5: 4 });
    assert.equal((await rpcAnon('clima_enviar', c.token, { itens: it, comentario: i < 3 ? 'Comentário de ' + i : '', chave: chave() })).ok, true);
  }
  // Aberta: só a situação de cada link (para lembrar quem falta), sem respostas. O acesso fica registrado.
  const a1 = await rpcAdmin('clima_identificacao', r.id);
  assert.equal(a1.ok, true);
  assert.equal(a1.respostasDisponiveis, false);
  assert.equal(a1.motivo, 'aberta');
  assert.deepEqual(a1.respostas, []);
  assert.equal(a1.convites.filter((c) => c.usado).length, 9);
  assert.equal(a1.acessos.length, 1);
  assert.equal(a1.acessos[0].nome, 'Wellington');
  assert.equal(a1.acessos[0].acao, 'abrir');
  assert.ok(Math.abs(new Date(a1.acessos[0].em) - Date.now()) < 60000);
  await rpcAdmin('clima_encerrar', r.id);
  const a2 = await rpcAdmin('clima_identificacao', r.id);
  assert.equal(a2.respostasDisponiveis, true);
  assert.equal(a2.respostas.length, 9);
  assert.equal(a2.acessos.length, 2);
  const uma = a2.respostas.find((x) => x.comentario === 'Comentário de 0');
  assert.ok(/^Pessoa (Um|Dois)/.test(uma.nome));
  assert.equal(uma.confirmadoPor, 'link');
  assert.equal(uma.escores.A, 20, 'todos 1, com A3 invertido (vira 5): média 1,8 → 20');
  assert.equal(uma.escores.H1, 0);
  assert.equal(uma.complemento.N4, 2);
  // O relatório do cliente: igual ao de uma pesquisa anônima com as mesmas respostas, só com o modo; nenhum nome.
  const res = (await rpcAdmin('clima_resultado', r.id)).resultado;
  const g = await rpcAdmin('clima_gerar_relatorio', r.id, { publicar: true, consultor: 'Wellington' });
  const pub = await rpcAnon('relatorio_publico', g.relatorio.token);
  assert.equal(pub.relatorio.rodada.modo, 'identificada');
  assert.deepEqual(pub.relatorio.resultado, CL.visaoCliente(res));
  const brutas = (await db.query(`select equipe_id, papel, itens, comentario, segundos from public.clima_respostas where rodada_id = $1`, [r.id])).rows;
  assert.deepEqual(res, CL.calcular({ equipes: r.equipes.map((e) => ({ id: e.id, nome: e.nome, area: e.area, ordem: e.ordem, convidados: e.convidados })),
    respostas: brutas.map((x) => ({ equipeId: x.equipe_id, papel: x.papel, itens: x.itens, comentario: x.comentario, segundos: x.segundos })),
    complemento: true, n4: true }), 'a identificação não muda o cálculo nem a supressão');
  const textoRel = JSON.stringify(pub);
  for (const c of convites) assert.ok(!textoRel.includes(c.nome) && !textoRel.includes(c.nome.split(' ')[0] + ' ' + c.nome.split(' ')[1]), 'sem ' + c.nome);
  assert.ok(!/Comentário de/.test(textoRel));
  // Tirar o nome de uma resposta (pedido do titular): continua no agregado, sem nome; fica registrado.
  assert.deepEqual(await rpcAdmin('clima_desidentificar', r.id, uma.respostaId), { ok: true });
  assert.match((await rpcAdmin('clima_desidentificar', r.id, uma.respostaId)).erro, /não encontrada/);
  const a3 = await rpcAdmin('clima_identificacao', r.id);
  assert.equal(a3.respostas.length, 8);
  assert.deepEqual(a3.acessos.map((x) => x.acao).slice(0, 2), ['abrir', 'desidentificar']);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_respostas where rodada_id = $1`, [r.id])).rows[0].n, 9);
  // Pesquisa anônima não tem tela de identificação.
  await rpcAdmin('clima_excluir_rodada', r.id);
  // O registro de acesso continua depois da exclusão.
  assert.ok((await db.query(`select count(*)::int as n from public.clima_acessos where rodada_id = $1`, [r.id])).rows[0].n >= 4);
  const an = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, equipes: [{ liderId: o.L1 }] });
  assert.match((await rpcAdmin('clima_identificacao', an.rodada.id)).erro, /é anônima/);
  await rpcAdmin('clima_excluir_rodada', an.rodada.id);
});

test('retenção: com as respostas brutas saem identificações, links, códigos e o CPF/data do cadastro; exclusão também', async () => {
  exigirBanco();
  const o = await empresaComOrganograma('Clima Retenção ID');
  for (const [i, p] of o.liderados1.entries()) {
    await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: p, cpf3: String(100 + i), nascimento: '1' + i + '/01' });
  }
  // Uma pessoa de outra equipe com CPF/data: não é tocada.
  await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados2[0], cpf3: '555', nascimento: '05/05' });
  const cr = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'identificada', metodos: ['dados', 'email'], retencaoDias: 30, equipes: [{ liderId: o.L1 }] });
  const r = cr.rodada;
  const cv = convitesDe(r);
  for (const [i, c] of cv.entries()) {
    const idx = o.liderados1.indexOf(c.pessoaId);
    assert.ok(c.metodos.includes('dados'));
    assert.equal((await rpcAnon('clima_enviar', c.token, { itens: itensTodos(4), chave: chave(), confirmacao: { metodo: 'dados', cpf3: String(100 + idx), nascimento: '1' + idx + '/1' } })).ok, true, 'convite ' + i);
  }
  await rpcServico('clima_codigo_novo', cv[0].token, 'email'); // link já usado: não gera
  // A empresa atualiza o CPF/data de uma pessoa depois de criada a rodada: o dado novo não é apagado pela retenção.
  await rpcAdmin('clima_colaborador_salvar', { empresaId: o.emp, pessoaId: o.liderados1[5], cpf3: '999', nascimento: '09/09' });
  await rpcAdmin('clima_encerrar', r.id);
  await db.query(`update public.clima_rodadas set encerrada_em = now() - interval '31 days' where id = $1`, [r.id]);
  assert.deepEqual(await rpcAdmin('clima_apagar_brutas', null, false), { ok: true, rodadas: 1, respostas: 6 });
  for (const t of ['clima_respostas', 'clima_identificacoes', 'clima_convites']) {
    assert.equal((await db.query(`select count(*)::int as n from public.${t} where rodada_id = $1`, [r.id])).rows[0].n, 0, t);
  }
  assert.equal((await db.query(`select count(*)::int as n from public.clima_codigos`)).rows[0].n, 0);
  const restantes = (await db.query(`select pessoa_id from public.clima_conferencias where empresa_id = $1 order by pessoa_id`, [o.emp])).rows.map((x) => x.pessoa_id).sort();
  assert.deepEqual(restantes, [o.liderados1[5], o.liderados2[0]].sort(), 'saem só os dados usados nesta rodada (e não alterados depois)');
  const a = await rpcAdmin('clima_identificacao', r.id);
  assert.deepEqual([a.respostasDisponiveis, a.motivo, a.respostas.length, a.convites.length], [false, 'apagadas', 0, 0]);
  // Excluir uma rodada (aberta) também leva os dados de conferência copiados para ela.
  const cr2 = await rpcAdmin('clima_criar_rodada', { empresaId: o.emp, modo: 'opcional', metodos: ['dados'], equipes: [{ liderId: o.L2 }, { liderId: o.L1 }] });
  assert.equal(cr2.ok, true);
  await rpcAdmin('clima_excluir_rodada', cr2.rodada.id);
  assert.equal((await db.query(`select count(*)::int as n from public.clima_conferencias where empresa_id = $1`, [o.emp])).rows[0].n, 0);
  await rpcAdmin('clima_excluir_rodada', r.id);
});

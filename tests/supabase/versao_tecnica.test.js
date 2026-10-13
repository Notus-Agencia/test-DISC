'use strict';
// Testes da migração 20261019120000_versao_tecnica.sql (versão técnica dos relatórios de equipe e "Como liderar") num
// Postgres 17 EMBUTIDO, com as 15 migrações aplicadas EM SEQUÊNCIA sobre dados "de produção" das anteriores:
//   - relatorio_publico pelo link de sempre entrega a versão do DONO (mesma regra de js/versao-tecnica.js — o SQL e o JS
//     dão o MESMO resultado), inclusive para relatórios publicados antes da migração;
//   - o link técnico só existe depois de gerar_relatorio_tecnico (só admin; nome e CRP validados) e entrega o completo;
//   - os dois links são independentes; gerar de novo troca o técnico;
//   - o histórico (leituras_tecnicas): só admin lê; ninguém grava, altera ou apaga pela API (só as funções); fica mesmo
//     depois de excluir o relatório; as colunas tecnico_* não mudam por UPDATE direto.
// Mesmo preparo "tipo Supabase" de tests/supabase/minimo_cobranca.test.js.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const VT = require('../../js/versao-tecnica.js');
const M = require('../../js/relatorio-modelos.js');
const AV = require('../../js/lideranca-avancado.js');
const EQUIPE_V1 = require('../fixtures/relatorio-equipe-v1.json');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const MIGRACOES = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao',
  '20261019120000_versao_tecnica'];
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
const GERADO = '2026-10-05T12:00:00.000Z';
const EXIGIDO_DI = '4321'.repeat(10);
const RES = {
  DI: { percentuais: { D: 45, I: 25, S: 15, C: 15 }, codigo: 'DI' },
  SC: { percentuais: { D: 15, I: 20, S: 45, C: 20 }, codigo: 'SC' },
  CS: { percentuais: { D: 10, I: 15, S: 25, C: 50 }, codigo: 'CS' }
};
const LEITURA = { nome: 'Fulana de Tal', crp: '06/12345' };

function equipeComParte2() {
  return M.equipe({
    empresa: { nome: 'Clínica Exemplo' },
    colaboradores: [
      { pessoaId: 'a', nome: 'Ana Paula Souza', cargo: 'Diretora', resultado: RES.DI },
      { pessoaId: 'b', nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
      { pessoaId: 'c', nome: 'Carla Dias', cargo: 'Analista', resultado: RES.CS, exigido: { percentuais: { D: 35, I: 30, S: 15, C: 20 }, codigo: 'DI' } }
    ],
    relacoes: [{ de: 'a', para: 'b', tipo: 'lidera' }, { de: 'b', para: 'c', tipo: 'lidera' }]
  }, { geradoEm: GERADO });
}
const lideranca = (avancado) => M.lideranca({ pessoa: { nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
  lider: { nome: 'Ana Paula Souza', resultado: RES.DI }, empresa: { nome: 'Clínica Exemplo' } }, avancado ? { geradoEm: GERADO, avancado: AV } : { geradoEm: GERADO });

let pg = null;
let db = null;
let falhaInicio = null;

test.before(async () => {
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-tecnica-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 61000 + Math.floor(Math.random() * 800),
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
async function rpc(quem, fn, ...args) {
  const marcas = args.map((_, i) => '$' + (i + 1)).join(', ');
  const vals = args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a));
  return (await quem(`select public.${fn}(${marcas}) as r`, vals)).rows[0].r;
}
const publico = (token) => rpc(anon, 'relatorio_publico', token);
async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}
const dono = async (dados, modelo) => (await db.query('select disc_interno.relatorio_versao_dono($1::jsonb, $2) as d', [JSON.stringify(dados), modelo])).rows[0].d;

const ids = {};
async function relatorio(modelo, dados, status) {
  const col = modelo === 'equipe' ? 'empresa_id' : modelo === 'processo' ? 'processo_id' : 'pessoa_id';
  const ref = modelo === 'equipe' ? ids.empresa : modelo === 'processo' ? ids.processo : ids.pessoa;
  return (await db.query(`insert into public.relatorios (modelo, ${col}, dados, status) values ($1, $2, $3, $4) returning id, token`,
    [modelo, ref, JSON.stringify(Object.assign({ modelo }, dados)), status || 'publicado'])).rows[0];
}

test('as 15 migrações em sequência sobre dados antigos: idempotente; relatório já publicado abre na versão do dono', async () => {
  exigirBanco();
  for (let i = 0; i < ULTIMA; i++) await db.query(SQL[i]);
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'outro@x.com')`, [ADMIN, OUTRO]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Wellington')`, [ADMIN]);
  ids.empresa = (await db.query(`insert into public.empresas (nome) values ('Clínica Exemplo') returning id`)).rows[0].id;
  ids.pessoa = (await db.query(`insert into public.pessoas (telefone, nome) values ('5511999990001', 'Bruno Lima') returning id`)).rows[0].id;
  ids.processo = (await db.query(`insert into public.processos (nome, codigo) values ('Processo', null) returning id`)).rows[0].id;
  const antigoEquipe = await relatorio('equipe', EQUIPE_V1);
  const antigoLid = await relatorio('lideranca', lideranca(false));
  const antigoProc = await relatorio('processo', { titulo: 'Processo X' });
  // antes da migração: o banco entrega tudo (a página escondia na tela)
  assert.ok((await publico(antigoEquipe.token)).relatorio.pressao);
  assert.equal((await rpc(anon, 'versao_banco')).versao, 20261018120000);

  await db.query(SQL[ULTIMA]);
  await db.query(SQL[ULTIMA]);
  assert.deepEqual(await rpc(anon, 'versao_banco'), { ok: true, versao: 20261019120000, migracoes: MIGRACOES, faltando: [] });

  const eq = await publico(antigoEquipe.token);
  assert.equal(eq.ok, true);
  assert.equal(eq.versao, undefined);
  assert.equal(eq.relatorio.restrito, true);
  assert.equal('pressao' in eq.relatorio, false);
  assert.deepEqual(eq.relatorio, VT.versaoDono(Object.assign({ modelo: 'equipe' }, EQUIPE_V1)));
  const li = await publico(antigoLid.token);
  assert.equal('exigido' in li.relatorio, false);
  assert.ok(!li.relatorio.secoes.some((s) => s.chave === 'esforco'));
  assert.deepEqual(li.relatorio, VT.versaoDono(Object.assign({ modelo: 'lideranca' }, lideranca(false))));
  assert.deepEqual((await publico(antigoProc.token)).relatorio, { modelo: 'processo', titulo: 'Processo X' });
  // os dados gravados continuam completos (nada apagado)
  assert.ok((await db.query('select dados from public.relatorios where id = $1', [antigoEquipe.id])).rows[0].dados.pressao);
  ids.antigoEquipe = antigoEquipe;
});

test('versão do dono: o SQL dá o MESMO resultado de js/versao-tecnica.js (vários snapshots e casos de borda)', async () => {
  exigirBanco();
  const casos = [
    ['equipe', equipeComParte2()], ['equipe', EQUIPE_V1], ['lideranca', lideranca(false)], ['lideranca', lideranca(true)],
    ['equipe', M.equipe({ empresa: { nome: 'X' }, colaboradores: [{ pessoaId: 'a', nome: 'Ana Souza', resultado: RES.DI }], relacoes: [] }, { geradoEm: GERADO })],
    ['pessoa', M.pessoa({ pessoa: { nome: 'Carla Dias', resultado: RES.CS, exigido: EXIGIDO_DI } }, { geradoEm: GERADO })],
    ['equipe', { modelo: 'equipe', pressao: null, mapa: { pontos: [{ id: 'p1', exigido: null }, 'x', [1]] }, colaboradores: 'nao-lista', leituraTecnica: LEITURA, restrito: false }],
    ['equipe', { modelo: 'equipe', mapa: 'x', colaboradores: [{ exigido: false }, null] }],
    ['lideranca', { modelo: 'lideranca', exigido: null, secoes: [{ id: '', chave: 'esforco' }, { id: 'plano', itens: ['ok', 'veja "Esforço de adaptação ao cargo"', 3, { t: 1 }], etapas: [{ itens: ['ESFORÇO DE ADAPTAÇÃO AO CARGO: x', 'y'] }, 'z', { itens: 'n' }] }, 'solto', { chave: 7 }, { chave: true }] }],
    ['lideranca', { modelo: 'lideranca', secoes: [{ id: 'retrato', itens: ['nada a tirar'] }] }],
    ['clima', { modelo: 'clima', titulo: 'Clima', leituraTecnica: LEITURA }]
  ];
  for (const [modelo, d] of casos) {
    const comModelo = Object.assign({}, d, { modelo });
    assert.deepEqual(await dono(comModelo, modelo), VT.versaoDono(comModelo), modelo + ': ' + JSON.stringify(d).slice(0, 80));
  }
  // CRP e nome: as mesmas regras do JS
  for (const c of ['06/12345', 'CRP 06/12345', 'crp-06/12345', 'CRP: 06/12345', ' 06 / 12345 ', '06-123456', '6/12345', '00/12345', '06/12', '06/0000',
    '06/1234567', 'RR/NNNNN', '06 12345', '01/123', '']) {
    const r = (await db.query('select disc_interno.crp_normalizado($1) as c', [c])).rows[0].c;
    assert.equal(r || '', VT.normalizarCrp(c), 'CRP ' + c);
  }
  for (const n of ['Fulana de Tal', '  Fulana   de  Tal ', 'Fulana', 'A B', 'Dra. Maria Souza', "João D'Ávila-Neto", 'Ana 3 Souza', '<b>Ana</b> Souza', 'Ana "Lu" Souza', 'x'.repeat(130)]) {
    const r = (await db.query('select disc_interno.nome_leitor($1) as n', [n])).rows[0].n;
    assert.equal(r || '', VT.normalizarNomeLeitor(n), 'nome ' + n);
  }
});

test('gerar_relatorio_tecnico: só admin; valida nome e CRP; link técnico completo; histórico com quem e quando', async () => {
  exigirBanco();
  const r = await relatorio('equipe', equipeComParte2());
  const antes = (await db.query('select atualizado_em from public.relatorios where id = $1', [r.id])).rows[0].atualizado_em;
  await rejeita(rpc(anon, 'gerar_relatorio_tecnico', r.id, LEITURA.nome, LEITURA.crp), /permission denied/);
  assert.deepEqual(await rpc(outro, 'gerar_relatorio_tecnico', r.id, LEITURA.nome, LEITURA.crp), { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual(await rpc(outro, 'relatorio_tecnico', r.id), { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual(await rpc(admin, 'gerar_relatorio_tecnico', r.id, LEITURA.nome, '6/123'), { ok: false, erro: VT.MSG_CRP });
  assert.deepEqual(await rpc(admin, 'gerar_relatorio_tecnico', r.id, 'Fulana', LEITURA.crp), { ok: false, erro: VT.MSG_NOME });
  const proc = await relatorio('processo', { titulo: 'P' });
  const pes = await relatorio('pessoa', { titulo: 'P' });
  for (const x of [proc, pes]) assert.deepEqual(await rpc(admin, 'gerar_relatorio_tecnico', x.id, LEITURA.nome, LEITURA.crp), { ok: false, erro: 'Relatório não encontrado.' });
  assert.equal((await db.query('select count(*)::int as n from public.leituras_tecnicas')).rows[0].n, 0, 'nada registrado nas recusas');

  const vazio = await rpc(admin, 'relatorio_tecnico', r.id);
  assert.deepEqual(vazio.tecnica, { status: '', token: '', nome: '', crp: '', publicadoEm: '' });
  const g = await rpc(admin, 'gerar_relatorio_tecnico', r.id, '  Fulana  de Tal ', 'CRP 06-12345');
  assert.equal(g.ok, true);
  assert.equal(g.tecnica.status, 'publicado');
  assert.match(g.tecnica.token, /^[0-9a-f]{64}$/);
  assert.notEqual(g.tecnica.token, r.token);
  assert.deepEqual([g.tecnica.nome, g.tecnica.crp], ['Fulana de Tal', '06/12345']);
  assert.deepEqual(g.historico.map((h) => [h.acao, h.nome, h.crp, h.por]), [['gerada', 'Fulana de Tal', '06/12345', 'Wellington']]);
  assert.match(g.historico[0].em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const linha = (await db.query('select gerado_por_id, modelo, relatorio_id from public.leituras_tecnicas')).rows[0];
  assert.deepEqual(linha, { gerado_por_id: ADMIN, modelo: 'equipe', relatorio_id: r.id });
  const depois = (await db.query('select atualizado_em from public.relatorios where id = $1', [r.id])).rows[0].atualizado_em;
  assert.equal(depois.toISOString(), antes.toISOString(), 'gerar não mexe no "atualizado em" do relatório');

  // link técnico: completo + quem vai ler; link do dono: sem a Parte 2
  const tec = await publico(g.tecnica.token);
  const dados = Object.assign({ modelo: 'equipe' }, equipeComParte2());
  assert.deepEqual(tec, { ok: true, modelo: 'equipe', versao: 'tecnica', relatorio: dados, leituraTecnica: LEITURA, publicadoEm: g.tecnica.publicadoEm });
  const d = await publico(r.token);
  assert.equal(d.versao, undefined);
  assert.deepEqual(d.relatorio, VT.versaoDono(dados));
  ids.r = r;
  ids.tokenTecnico = g.tecnica.token;
});

test('os dois links são independentes; gerar de novo troca o técnico; despublicar idempotente', async () => {
  exigirBanco();
  const r = ids.r;
  const erro = { ok: false, erro: 'Relatório não encontrado ou fora do ar.' };
  // despublicar o do dono (rascunho): o técnico continua
  await admin(`update public.relatorios set status = 'rascunho' where id = $1`, [r.id]);
  assert.deepEqual(await publico(r.token), erro);
  assert.equal((await publico(ids.tokenTecnico)).versao, 'tecnica');
  await admin(`update public.relatorios set status = 'publicado' where id = $1`, [r.id]);
  // gerar de novo: novo token, o anterior para
  const g2 = await rpc(admin, 'gerar_relatorio_tecnico', r.id, 'Beltrana Souza', '05/54321');
  assert.notEqual(g2.tecnica.token, ids.tokenTecnico);
  assert.deepEqual(await publico(ids.tokenTecnico), erro);
  assert.deepEqual((await publico(g2.tecnica.token)).leituraTecnica, { nome: 'Beltrana Souza', crp: '05/54321' });
  // despublicar o técnico: só ele para
  const d = await rpc(admin, 'despublicar_relatorio_tecnico', r.id);
  assert.equal(d.tecnica.status, 'despublicado');
  assert.deepEqual(await publico(g2.tecnica.token), erro);
  assert.equal((await publico(r.token)).ok, true);
  assert.deepEqual(d.historico.map((h) => [h.acao, h.nome]), [['despublicada', 'Beltrana Souza'], ['gerada', 'Beltrana Souza'], ['gerada', 'Fulana de Tal']]);
  assert.equal((await rpc(admin, 'despublicar_relatorio_tecnico', r.id)).historico.length, 3, 'já despublicada: nada muda');
  assert.deepEqual(await rpc(outro, 'despublicar_relatorio_tecnico', r.id), { ok: false, erro: 'Sem permissão.' });
  const semTec = await relatorio('lideranca', lideranca(true));
  assert.deepEqual(await rpc(admin, 'despublicar_relatorio_tecnico', semTec.id), { ok: false, erro: 'Este relatório não tem versão técnica.' });
  // "Como liderar" avançado também tem versão técnica
  const gl = await rpc(admin, 'gerar_relatorio_tecnico', semTec.id, LEITURA.nome, LEITURA.crp);
  const tl = await publico(gl.tecnica.token);
  assert.ok(tl.relatorio.exigido && tl.relatorio.secoes.some((s) => s.chave === 'esforco'));
  assert.equal((await publico(semTec.token)).relatorio.restrito, true);
});

test('histórico: só admin lê; ninguém grava, altera ou apaga pela API; colunas tecnico_* só pelas funções', async () => {
  exigirBanco();
  const r = ids.r;
  assert.ok((await admin('select * from public.leituras_tecnicas')).rows.length >= 3);
  assert.equal((await outro('select * from public.leituras_tecnicas')).rows.length, 0, 'não admin: RLS não mostra nada');
  await rejeita(anon('select * from public.leituras_tecnicas'), /permission denied/);
  const ins = `insert into public.leituras_tecnicas (relatorio_id, modelo, acao, leitor_nome, leitor_crp, gerado_por, gerado_por_id)
               values ($1, 'equipe', 'gerada', 'Fulana de Tal', '06/12345', 'X', $2)`;
  for (const quem of [admin, outro, anon, servico]) await rejeita(quem(ins, [r.id, ADMIN]), /permission denied/);
  await rejeita(admin(`update public.leituras_tecnicas set leitor_crp = '01/111'`), /permission denied/);
  await rejeita(admin(`delete from public.leituras_tecnicas`), /permission denied/);
  // UPDATE/INSERT direto nas colunas da versão técnica: recusado (até para admin)
  await rejeita(admin(`update public.relatorios set tecnico_status = 'publicado', tecnico_nome = 'Outra Pessoa' where id = $1`, [r.id]), /só é gerada pelo painel/);
  await rejeita(admin(`update public.relatorios set token_tecnico = $2 where id = $1`, [r.id, 'e'.repeat(64)]), /só é gerada pelo painel/);
  await rejeita(admin(`insert into public.relatorios (modelo, empresa_id, dados, token_tecnico, tecnico_status, tecnico_nome, tecnico_crp, tecnico_publicado_em)
    values ('equipe', $1, '{}', $2, 'publicado', 'Fulana de Tal', '06/12345', now())`, [ids.empresa, 'e'.repeat(64)]), /só é gerada pelo painel/);
  // salvar o snapshot (painel) continua normal e não mexe no técnico
  await admin(`update public.relatorios set dados = dados || '{"titulo":"Novo título"}'::jsonb where id = $1`, [r.id]);
  const t = await rpc(admin, 'relatorio_tecnico', r.id);
  assert.equal(t.tecnica.status, 'despublicado');
  // excluir o relatório: os links param e o histórico fica (sem o vínculo)
  const n = (await db.query('select count(*)::int as n from public.leituras_tecnicas where relatorio_id = $1', [r.id])).rows[0].n;
  await admin('delete from public.relatorios where id = $1', [r.id]);
  assert.deepEqual(await publico(r.token), { ok: false, erro: 'Relatório não encontrado ou fora do ar.' });
  assert.equal((await db.query('select count(*)::int as n from public.leituras_tecnicas where relatorio_id is null')).rows[0].n, n);
  // função interna não é chamável pela API
  await rejeita(anon(`select disc_interno.relatorio_versao_dono('{}'::jsonb, 'equipe')`), /permission denied/);
});

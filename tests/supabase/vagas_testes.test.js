'use strict';
// Testes da migração 20261023120000_vagas_testes.sql (motor dos testes de habilidade do Vagas sem Caos) num Postgres 17
// EMBUTIDO, com as migrações até a 20261021 aplicadas antes (a 20261022, da fundação, não é necessária: tudo se liga a
// auth.users). O conteúdo real NÃO fica no repositório: a 20261023120001_vagas_questoes.sql é um ESPELHO sem conteúdo (aqui
// se prova que aplicá-la não faz nada) e o banco de questões entra pelo SQL de carga gerado EM MEMÓRIA a partir do banco
// FICTÍCIO tests/fixtures/vagas-testes/ (scripts/montar-testes.mjs, o mesmo gerador que a equipe usa com a cópia privada).
// Confere: gabarito inacessível por anon/authenticated, sorteio (6/6/3, estratificado por competência, 1 por grupo de
// itens-irmãos, igual a cotasPorCelula do JS), alternativas embaralhadas, uma questão por vez, sem voltar, tempo do servidor
// com tolerância, 30 dias, nota no banco, selo com margem, conferência pública com limite por origem, revogação, permissões,
// e que vagas/js/testes.js usa as mesmas constantes, a mesma nota e as mesmas mensagens.
//
// Rodar: npm run test:supabase
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const T = require('../../vagas/js/testes.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (n) => fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', n + '.sql'), 'utf8');
const BASE = ['20261005120000_disc', '20261006120000_pessoas_formulario', '20261007120000_empresas_equipes',
  '20261008120000_parte2', '20261009120000_fotos', '20261010120000_mover_versao', '20261011120000_vendas',
  '20261012120000_infinitepay', '20261013120000_conexoes', '20261014120000_stripe', '20261015120000_minimo_cobranca',
  '20261016120000_envios_email', '20261017120000_clima', '20261018120000_clima_identificacao',
  '20261019120000_versao_tecnica', '20261020120000_codigos_processo', '20261021120000_feedback360'];
const FUNDACAO = '20261022120000_vagas';   // não é aplicada aqui (as migrações do Vagas são independentes): aparece em faltando
const MOTOR = '20261023120000_vagas_testes';
const QUESTOES = '20261023120001_vagas_questoes';
const TESTES = ['atendimento', 'vendas', 'administrativo', 'caixa', 'portugues'];
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
let M = null;          // scripts/montar-testes.mjs
let conteudo = null;   // banco FICTÍCIO por slug
let sqlCarga = '';     // SQL de carga gerado em memória (nunca gravado no repositório)

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

const ADMIN = 'aaaaaaaa-0000-4000-8000-00000000000a';
const P1 = '11111111-0000-4000-8000-000000000001';
const P2 = '22222222-0000-4000-8000-000000000002';
const P3 = '33333333-0000-4000-8000-000000000003';
const P4 = '44444444-0000-4000-8000-000000000004';
const P_ANON = '55555555-0000-4000-8000-000000000005';
const FANTASMA = '66666666-0000-4000-8000-000000000006';   // tem JWT, mas não existe em auth.users
const P5 = '77777777-0000-4000-8000-000000000007';         // conta de empresa (fundação) / tentativa sem questão na tela
const P6 = '88888888-0000-4000-8000-000000000008';
const RE_CODIGO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

let pg = null;
let db = null;
let falhaInicio = null;
const erros = {};   // codigo -> mensagem do banco (comparadas com vagas/js/testes.js no fim)

test.before(async () => {
  M = await import('../../scripts/montar-testes.mjs');
  const lido = M.lerConteudo(FIXTURE);
  assert.deepEqual(lido.erros, []);
  conteudo = lido.dados;
  sqlCarga = M.gerarSql(conteudo);
  try {
    const EmbeddedPostgres = (await import('embedded-postgres')).default;
    const dir = path.join(os.tmpdir(), 'disc-pg-vagas-testes-' + crypto.randomBytes(6).toString('hex'));
    pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'postgres', password: 'postgres', port: 64200 + Math.floor(Math.random() * 600),
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

// Executa como o PostgREST: papel, usuário do JWT, claims (opcional) e cabeçalhos (opcional); somenteLeitura = GET.
async function como(papel, uid, sql, params, opcoes) {
  const o = opcoes || {};
  await db.query(o.somenteLeitura ? 'begin read only' : 'begin');
  try {
    await db.query(`set local role ${papel}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    if (o.claims) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(o.claims)]);
    if (o.cabecalhos) await db.query("select set_config('request.headers', $1, true)", [JSON.stringify(o.cabecalhos)]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}
async function rpc(papel, uid, fn, args, opcoes) {
  const marcas = (args || []).map((_, i) => '$' + (i + 1)).join(', ');
  const r = (await como(papel, uid, `select public.${fn}(${marcas}) as r`, args || [], opcoes)).rows[0].r;
  if (r && r.ok === false && r.codigo) erros[r.codigo] = r.erro;
  return r;
}
const anon = (fn, args, opcoes) => rpc('anon', null, fn, args, opcoes);
const pessoa = (uid, fn, args, opcoes) => rpc('authenticated', uid, fn, args, opcoes);
const de = (ip) => ({ cabecalhos: { 'x-forwarded-for': ip, 'user-agent': 'teste' } });

async function rejeita(promessa, padrao) {
  await assert.rejects(promessa, (err) => { assert.match(String(err.message), padrao); return true; });
}

// Posição (na tela) da alternativa certa da questão "numero" de uma tentativa — só o teste (postgres) consegue ver.
async function posicaoCerta(tentativa, numero) {
  const r = (await db.query(`select tt.questoes -> ($2::int - 1) -> 'alt' as alt, q.correta
    from public.vagas_tentativas tt join public.vagas_questoes q on q.id = tt.questoes -> ($2::int - 1) ->> 'id'
    where tt.id = $1`, [tentativa, numero])).rows[0];
  return r.alt.indexOf(r.correta);
}
// Responde a prova toda: "certas" = quantas das primeiras acertar (as outras erram).
async function responderTudo(uid, tentativa, certas, deNumero) {
  let r = null;
  for (let n = deNumero || 1; n <= 15; n++) {
    const pos = await posicaoCerta(tentativa, n);
    r = await pessoa(uid, 'vagas_responder', [tentativa, n, n <= certas ? pos : (pos + 1) % 4]);
    assert.equal(r.ok, true, JSON.stringify(r));
    if (n < 15) assert.equal(r.proxima.numero, n + 1);
  }
  return r;
}
async function linhaTentativa(id) {
  return (await db.query(`select * from public.vagas_tentativas where id = $1`, [id])).rows[0];
}
function hojeBoaVista() { return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); }
function mais12Meses(aaaaMmDd) {
  const [a, m, d] = aaaaMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(a + 1, m - 1, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0);   // 29/02 -> 28/02
  return dt.toISOString().slice(0, 10);
}

test('migrações em sequência: espelho sem efeito, carga em memória idempotente, versao_banco, questão que sai fica inativa', async () => {
  exigirBanco();
  for (const n of BASE) await db.query(ler(n));
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'p1@x.com'), ($3, 'p2@x.com'),
    ($4, 'p3@x.com'), ($5, 'p4@x.com'), ($6, 'anonimo@x.com'), ($7, 'p5@x.com'), ($8, 'p6@x.com')`, [ADMIN, P1, P2, P3, P4, P_ANON, P5, P6]);
  await db.query(`insert into public.admins (user_id, nome) values ($1, 'Equipe')`, [ADMIN]);

  await db.query(ler(MOTOR));
  let v = await anon('versao_banco', []);
  assert.equal(v.versao, 20261023120001);
  assert.deepEqual(v.faltando, [FUNDACAO, QUESTOES], 'sem a fundação e sem o banco de questões, as duas aparecem como faltando');
  assert.deepEqual((await anon('vagas_testes_catalogo', [])).testes, [], 'catálogo vazio sem questões');

  // O espelho do repositório não carrega nada: é só comentário (o gabarito nunca passa pelo GitHub).
  const espelho = ler(QUESTOES);
  assert.deepEqual(M.checarEspelho(espelho), []);
  await db.query(espelho);
  assert.equal((await db.query(`select count(*)::int as n from public.vagas_questoes`)).rows[0].n, 0, 'espelho aplicado: nenhuma questão');
  assert.deepEqual((await anon('versao_banco', [])).faltando, [FUNDACAO, QUESTOES], 'continua faltando a carga');

  // A carga real é o SQL gerado pelo scripts/montar-testes.mjs (aqui, do banco FICTÍCIO), colado à mão no SQL Editor.
  await db.query(sqlCarga);
  const antes = (await db.query(`select atualizada_em from public.vagas_questoes where id = 'ATE-001'`)).rows[0].atualizada_em;
  await db.query(ler(MOTOR));
  await db.query(sqlCarga);
  v = await anon('versao_banco', []);
  assert.deepEqual(v, { ok: true, versao: 20261023120001, migracoes: [...BASE, MOTOR, QUESTOES], faltando: [FUNDACAO] });
  const depois = (await db.query(`select atualizada_em from public.vagas_questoes where id = 'ATE-001'`)).rows[0].atualizada_em;
  assert.equal(depois.getTime(), antes.getTime(), 'reaplicar sem mudança não mexe na questão');

  const n = (await db.query(`select teste, count(*)::int as n, count(*) filter (where grupo <> '')::int as g
    from public.vagas_questoes where ativa group by teste order by teste`)).rows;
  assert.deepEqual(n.map((x) => [x.teste, x.n]), [['administrativo', 80], ['atendimento', 80], ['caixa', 80], ['portugues', 80], ['vendas', 80]]);
  assert.ok(n.every((x) => x.g > 0), 'grupos de itens-irmãos gravados');

  // Questão que sai do conteúdo numa versão nova: fica inativa (nunca apagada: tentativas antigas apontam para ela).
  const comExtra = JSON.parse(JSON.stringify(conteudo));
  comExtra.atendimento.questoes.push(Object.assign({}, conteudo.atendimento.questoes[0], { id: 'ATE-999', grupo: undefined,
    enunciado: 'FICTÍCIO ATE-999: questão que vai sair do conteúdo?' }));
  await db.query(M.gerarSql(comExtra));
  assert.equal((await db.query(`select ativa from public.vagas_questoes where id = 'ATE-999'`)).rows[0].ativa, true);
  await db.query(sqlCarga);
  assert.equal((await db.query(`select ativa from public.vagas_questoes where id = 'ATE-999'`)).rows[0].ativa, false);
  assert.equal((await db.query(`select count(*)::int as n from public.vagas_questoes where ativa`)).rows[0].n, 400);
});

test('gabarito e tabelas fora do alcance de anon/authenticated; só catálogo e conferência públicos', async () => {
  exigirBanco();
  for (const t of ['vagas_questoes', 'vagas_testes', 'vagas_tentativas', 'vagas_tentativa_respostas', 'vagas_selos']) {
    await rejeita(como('anon', null, `select * from public.${t} limit 1`), /permission denied/);
  }
  for (const t of ['vagas_questoes', 'vagas_testes', 'vagas_tentativa_respostas']) {
    await rejeita(como('authenticated', P1, `select * from public.${t} limit 1`), /permission denied/);
  }
  await rejeita(como('authenticated', P1, `select correta from public.vagas_questoes`), /permission denied/);
  await rejeita(como('authenticated', P1, `update public.vagas_questoes set correta = 0`), /permission denied/);
  await rejeita(como('authenticated', P1, `insert into public.vagas_selos (codigo, user_id, teste, nota, valido_ate)
    values ('AAAA2222', $1, 'atendimento', 100, '2030-01-01')`, [P1]), /permission denied/);
  await rejeita(como('anon', null, `select vagas_interno.selos_cartao($1)`, [P1]), /permission denied/);
  await rejeita(como('authenticated', P1, `select vagas_interno.teste_sortear('caixa', 15, '{}')`), /permission denied/);
  const r = await db.query(`select has_schema_privilege('anon', 'vagas_interno', 'usage') as a,
    has_schema_privilege('authenticated', 'vagas_interno', 'usage') as b`);
  assert.deepEqual(r.rows[0], { a: false, b: false });

  const exec = async (papel) => (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'vagas\\_%' and has_function_privilege($1, p.oid, 'execute') order by 1`, [papel]))
    .rows.map((x) => x.proname);
  assert.deepEqual(await exec('anon'), ['vagas_selo_publico', 'vagas_testes_catalogo']);
  assert.deepEqual(await exec('authenticated'), ['vagas_finalizar', 'vagas_iniciar_tentativa', 'vagas_meus_selos',
    'vagas_proxima_questao', 'vagas_registrar_sinal', 'vagas_responder', 'vagas_revogar_selo', 'vagas_selo_publico',
    'vagas_testes_catalogo']);
  const pol = (await db.query(`select tablename from pg_policies where tablename like 'vagas\\_%' order by 1`)).rows.map((x) => x.tablename);
  assert.deepEqual(pol, ['vagas_selos', 'vagas_tentativas'], 'questões, respostas e catálogo sem política nenhuma');
});

test('catálogo: 5 testes na ordem, regras e números iguais aos do vagas/js/testes.js, sem gabarito', async () => {
  exigirBanco();
  const c = await anon('vagas_testes_catalogo', []);
  assert.equal(c.ok, true);
  assert.deepEqual(c.testes.map((t) => t.slug), TESTES);
  assert.deepEqual(c.regras, { intervaloDias: T.INTERVALO_DIAS, toleranciaSegPorQuestao: T.TOLERANCIA_SEG_POR_QUESTAO, supervisao: 'online' });
  for (const t of c.testes) {
    assert.equal(t.questoes, 15);
    assert.equal(t.minutos, t.slug === 'caixa' ? 25 : 20);
    assert.equal(t.validadeMeses, 12);
    assert.equal(t.notaMinima, T.NOTA_MINIMA);
    assert.equal(t.margem, T.MARGEM_PADRAO);
    assert.deepEqual(t.competencias, conteudo[t.slug].competencias);
    assert.ok(!('minha' in t), 'anon não tem "minha"');
  }
  assert.doesNotMatch(JSON.stringify(c), /correta|gabarito|alternativas|enunciado/);
  const logado = await pessoa(P1, 'vagas_testes_catalogo', []);
  assert.deepEqual(logado.testes[0].minha, { aberta: null, ultima: null, podeIniciarEm: null, selo: null });
});

test('sorteio: 6/6/3, estratificado por competência como cotasPorCelula, 1 por grupo, fácil antes, alternativas embaralhadas', async () => {
  exigirBanco();
  for (const slug of TESTES) {
    const porId = new Map(conteudo[slug].questoes.map((q) => [q.id, q]));
    const comps = conteudo[slug].competencias.map((c) => c.id);
    const esperado = M.cotasPorCelula(15, comps.length).map((c) => [c[1], c[2], c[3]].join('/')).sort();
    const posicoes = [0, 0, 0, 0];
    let identidade = 0;
    for (let k = 0; k < 30; k++) {
      const s = (await db.query(`select vagas_interno.teste_sortear($1, 15, '{}') as s`, [slug])).rows[0].s;
      assert.equal(s.length, 15);
      const qs = s.map((x) => porId.get(x.id));
      assert.ok(qs.every(Boolean), 'só questões do teste');
      assert.equal(new Set(s.map((x) => x.id)).size, 15, 'sem repetir');
      const dif = [1, 2, 3].map((d) => qs.filter((q) => q.dificuldade === d).length);
      assert.deepEqual(dif, [6, 6, 3], slug + ': 6 fáceis, 6 médias, 3 difíceis');
      assert.deepEqual(qs.map((q) => q.dificuldade), qs.map((q) => q.dificuldade).slice().sort(), 'das mais fáceis para as mais difíceis');
      const linhas = comps.map((c) => [1, 2, 3].map((d) => qs.filter((q) => q.competencia === c && q.dificuldade === d).length).join('/')).sort();
      assert.deepEqual(linhas, esperado, slug + ': cotas por competência × dificuldade iguais às do JS');
      const grupos = qs.filter((q) => q.grupo).map((q) => q.grupo);
      assert.equal(new Set(grupos).size, grupos.length, slug + ': no máximo 1 por grupo de itens-irmãos');
      for (const x of s) {
        assert.deepEqual(x.alt.slice().sort(), [0, 1, 2, 3], 'alternativas: uma permutação das 4');
        if (x.alt.join() === '0,1,2,3') identidade++;
        posicoes[x.alt.indexOf(porId.get(x.id).correta)]++;
      }
    }
    assert.ok(posicoes.every((p) => p > 60), slug + ': a certa aparece em todas as posições ' + posicoes.join('/'));
    assert.ok(identidade < 450 * 0.15, slug + ': alternativas embaralhadas');
    // Quem refaz: as questões já vistas ficam por último (com 80 no banco, quase nenhuma se repete; ao acaso seriam ~56).
    let repetidas = 0;
    for (let k = 0; k < 20; k++) {
      const a = (await db.query(`select vagas_interno.teste_sortear($1, 15, '{}') as s`, [slug])).rows[0].s.map((x) => x.id);
      const b = (await db.query(`select vagas_interno.teste_sortear($1, 15, $2::text[]) as s`, [slug, a])).rows[0].s.map((x) => x.id);
      repetidas += b.filter((id) => a.includes(id)).length;
    }
    assert.ok(repetidas <= 2, slug + ': ' + repetidas + ' questões repetidas em 20 provas refeitas');
  }
});

test('iniciar: login obrigatório (sem sessão anônima), teste inexistente, retoma a aberta, prazo e tolerância do servidor', async () => {
  exigirBanco();
  // Com a tabela da fundação (20261022) no banco: só conta de PESSOA ATIVA faz teste (empresa, operador, usuário do DISC: não).
  await db.query(`create table public.vagas_contas (user_id uuid primary key, tipo text not null, status text not null default 'pendente')`);
  try {
    assert.equal((await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento'])).codigo, 'so_pessoa', 'sem linha em vagas_contas');
    await db.query(`insert into public.vagas_contas (user_id, tipo, status) values ($1, 'empresa', 'ativa'), ($2, 'pessoa', 'pendente'),
      ($3, 'pessoa', 'suspensa')`, [P5, P1, P2]);
    assert.equal((await pessoa(P5, 'vagas_iniciar_tentativa', ['atendimento'])).codigo, 'so_pessoa', 'conta de empresa');
    assert.equal((await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento'])).codigo, 'conta_inativa', 'e-mail não confirmado');
    assert.equal((await pessoa(P2, 'vagas_iniciar_tentativa', ['atendimento'])).codigo, 'conta_inativa', 'conta suspensa');
    await db.query(`update public.vagas_contas set status = 'ativa' where user_id = $1`, [P1]);
    const ok = await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento']);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal((await db.query(`select count(*)::int as n from public.vagas_tentativas where user_id = $1`, [P1])).rows[0].n, 1);
  } finally {
    await db.query(`drop table public.vagas_contas`);
  }
  // A tentativa aberta sem nenhuma questão na tela não conta para os 30 dias (3.4): encerrada, a pessoa pode começar outra.
  const vazia = await pessoa(P1, 'vagas_finalizar', [(await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento'])).tentativa.id]);
  assert.deepEqual([vazia.resultado.status, vazia.resultado.acertos, vazia.resultado.nota, vazia.resultado.selo, vazia.resultado.podeIniciarEm],
    ['concluida', 0, 0, null, null]);
  assert.equal((await pessoa(P1, 'vagas_testes_catalogo', [])).testes[0].minha.podeIniciarEm, null);

  await rejeita(anon('vagas_iniciar_tentativa', ['atendimento']), /permission denied/);
  let r = await pessoa(FANTASMA, 'vagas_iniciar_tentativa', ['atendimento']);
  assert.deepEqual(r, { ok: false, erro: 'Entre na sua conta para fazer o teste.', codigo: 'login', sessaoExpirada: true });
  r = await pessoa(P_ANON, 'vagas_iniciar_tentativa', ['atendimento'], { claims: { sub: P_ANON, is_anonymous: true } });
  assert.equal(r.codigo, 'login', 'sessão anônima do Auth não faz teste');
  r = await pessoa(P1, 'vagas_iniciar_tentativa', ['culinaria']);
  assert.equal(r.codigo, 'teste_indisponivel');

  r = await pessoa(P1, 'vagas_iniciar_tentativa', [' Atendimento ']);
  assert.equal(r.ok, true, JSON.stringify(r));
  const t = r.tentativa;
  assert.equal(t.teste, 'atendimento');
  assert.equal(t.nome, conteudo.atendimento.nome);
  assert.equal(t.total, 15);
  assert.equal(t.minutos, 20);
  assert.equal(t.respondidas, 0);
  assert.equal(t.retomada, false);
  assert.ok(t.segundosRestantes >= 1195 && t.segundosRestantes <= 1200, String(t.segundosRestantes));
  assert.match(t.terminaEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const linha = await linhaTentativa(t.id);
  assert.equal((linha.limite_em - linha.termina_em) / 1000, T.TOLERANCIA_SEG_POR_QUESTAO, 'tolerância de 10 s depois do fim');
  assert.equal(linha.versao, conteudo.atendimento.versao);

  const de2 = await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento']);
  assert.equal(de2.tentativa.id, t.id);
  assert.equal(de2.tentativa.retomada, true);
  const estado = T.novoEstado(de2, 1000);
  assert.deepEqual(T.progresso(estado), { numero: 1, total: 15, respondidas: 0, percentual: 0, texto: 'Questão 1 de 15' });
  const cat = await pessoa(P1, 'vagas_testes_catalogo', []);
  assert.equal(cat.testes[0].minha.aberta.tentativa, t.id);
  assert.equal(T.situacaoDoTeste(cat.testes[0]).acao, 'continuar');
});

test('uma questão por vez, sem voltar; nota e selo calculados no banco; sinais registrados sem anular', async () => {
  exigirBanco();
  const t = (await pessoa(P1, 'vagas_iniciar_tentativa', ['atendimento'])).tentativa.id;
  let r = await pessoa(P1, 'vagas_responder', [t, 1, 0]);
  assert.equal(r.codigo, 'fora_de_ordem', 'questão que ainda não foi mostrada não pode ser respondida');

  const q1 = await pessoa(P1, 'vagas_proxima_questao', [t]);
  assert.equal(q1.ok, true);
  assert.equal(q1.fim, false);
  assert.equal(q1.numero, 1);
  assert.equal(q1.total, 15);
  assert.deepEqual(Object.keys(q1.questao).sort(), ['alternativas', 'enunciado', 'texto']);
  assert.equal(q1.questao.alternativas.length, 4);
  assert.doesNotMatch(JSON.stringify(q1), /correta|explicacao|"id"/);
  const exibida = (await db.query(`select exibida_em from public.vagas_tentativa_respostas where tentativa_id = $1 and ordem = 0`, [t])).rows[0].exibida_em;
  const q1b = await pessoa(P1, 'vagas_proxima_questao', [t]);
  assert.equal(q1b.questao.enunciado, q1.questao.enunciado, 'recarregar devolve a mesma questão');
  assert.deepEqual(q1b.questao.alternativas, q1.questao.alternativas, 'na mesma ordem');
  const exibida2 = (await db.query(`select exibida_em from public.vagas_tentativa_respostas where tentativa_id = $1 and ordem = 0`, [t])).rows[0].exibida_em;
  assert.equal(exibida2.getTime(), exibida.getTime(), 'recarregar não zera o tempo da questão');

  assert.equal((await pessoa(P1, 'vagas_responder', [t, 2, 0])).codigo, 'fora_de_ordem', 'não pula');
  assert.equal((await pessoa(P1, 'vagas_responder', [t, 1, 7])).codigo, 'alternativa_invalida');
  assert.equal((await pessoa(P1, 'vagas_responder', [t, 1, null])).codigo, 'alternativa_invalida');
  assert.equal((await pessoa(P2, 'vagas_proxima_questao', [t])).codigo, 'tentativa_inexistente', 'tentativa de outra pessoa');
  assert.equal((await pessoa(P2, 'vagas_responder', [t, 1, 0])).codigo, 'tentativa_inexistente');

  const pos = await posicaoCerta(t, 1);
  r = await pessoa(P1, 'vagas_responder', [t, 1, pos]);
  assert.equal(r.ok, true);
  assert.equal(r.respondidas, 1);
  assert.equal(r.fim, false);
  assert.equal(r.proxima.numero, 2, 'a resposta já traz a próxima questão');
  let estado = T.aplicarQuestao(T.novoEstado({ tentativa: { id: t, total: 15 } }, 0), q1, 0);
  estado = T.aplicarResposta(estado, r, 5000);
  assert.equal(estado.numero, 2);
  assert.equal(estado.questao.enunciado, r.proxima.questao.enunciado);

  // Reenvio (internet fraca) ou tentativa de voltar: devolve o estado e não muda a resposta gravada.
  const dup = await pessoa(P1, 'vagas_responder', [t, 1, (pos + 1) % 4]);
  assert.equal(dup.ok, true);
  assert.equal(dup.duplicado, true);
  assert.equal(dup.proxima.numero, 2);
  const g = (await db.query(`select r.alternativa, r.correta, r.alternativa_original = q.correta as original_certa
    from public.vagas_tentativa_respostas r join public.vagas_questoes q on q.id = r.questao_id
    where r.tentativa_id = $1 and r.ordem = 0`, [t])).rows[0];
  assert.deepEqual(g, { alternativa: pos, correta: true, original_certa: true }, 'guarda a alternativa original (análise de itens)');

  for (let i = 0; i < 3; i++) assert.equal((await pessoa(P1, 'vagas_registrar_sinal', [t, 'troca_aba'])).ok, true);
  assert.equal((await pessoa(P1, 'vagas_registrar_sinal', [t, 'copiar'])).ok, true);
  assert.equal((await pessoa(P1, 'vagas_registrar_sinal', [t, 'print'])).codigo, 'sinal_invalido');

  // 9 certas (as questões 1 a 9) e 6 erradas: nota 60, exatamente a nota mínima.
  const ultima = await responderTudo(P1, t, 9, 2);
  assert.equal(ultima.fim, true, 'a última resposta encerra');
  assert.ok(!('proxima' in ultima));
  assert.equal((await linhaTentativa(t)).status, 'concluida');
  const incoerentes = (await db.query(`select count(*)::int as n from public.vagas_tentativa_respostas r
    join public.vagas_tentativas tt on tt.id = r.tentativa_id
    where r.tentativa_id = $1 and r.alternativa_original is distinct from (tt.questoes -> r.ordem -> 'alt' ->> r.alternativa)::int`, [t])).rows[0].n;
  assert.equal(incoerentes, 0, 'alternativa original = a posição mostrada desfeita, em todas as respostas');
  const pq = await pessoa(P1, 'vagas_proxima_questao', [t]);
  assert.deepEqual([pq.fim, pq.status], [true, 'concluida']);
  const enc = await pessoa(P1, 'vagas_responder', [t, 15, 0]);
  assert.deepEqual([enc.ok, enc.codigo, enc.fim], [false, 'encerrada', true]);

  const f = await pessoa(P1, 'vagas_finalizar', [t]);
  assert.equal(f.ok, true);
  const res = f.resultado;
  assert.equal(res.acertos, 9);
  assert.equal(res.total, 15);
  assert.equal(res.nota, 60);
  assert.equal(res.nota, T.calcularNota(9, 15), 'mesma nota no banco e no JS');
  assert.equal(res.notaMinima, 60);
  assert.equal(res.margem, 10);
  assert.equal(res.status, 'concluida');
  assert.equal(res.porCompetencia.reduce((s, c) => s + c.total, 0), 15);
  assert.equal(res.porCompetencia.reduce((s, c) => s + c.acertos, 0), 9);
  assert.deepEqual(res.porCompetencia.map((c) => c.id), conteudo.atendimento.competencias.map((c) => c.id), 'na ordem do catálogo');
  assert.match(res.selo.codigo, RE_CODIGO);
  assert.equal(res.selo.nota, 60);
  assert.equal(res.selo.margem, 10);
  assert.equal(res.selo.supervisao, 'online');
  assert.equal(res.selo.situacao, 'valido');
  assert.equal(res.selo.data, hojeBoaVista());
  assert.equal(res.selo.validoAte, mais12Meses(res.selo.data));
  const linha = await linhaTentativa(t);
  assert.equal(Date.parse(res.podeIniciarEm), linha.iniciada_em.getTime() + 30 * 86400000);
  assert.doesNotMatch(JSON.stringify(f), /aprovad|reprovad|correta|explicacao/i);
  assert.deepEqual((await pessoa(P1, 'vagas_finalizar', [t])).resultado, res, 'finalizar é idempotente');

  // Sinais: tudo respondido em menos de 3 s, 3 trocas de aba e 1 cópia -> 3 alertas; o selo continua (quem decide é a equipe).
  assert.deepEqual(linha.alertas.slice().sort(), ['copiou_texto', 'respostas_rapidas', 'troca_aba']);
  assert.equal(linha.sinais.trocasAba, 3);
  assert.equal(linha.sinais.copias, 1);
  assert.equal(linha.sinais.respostasRapidas, 15);

  assert.equal(res.selo.questoes, 15, 'o selo diz quantas questões a prova teve');
  const texto = T.textoResultado(res);
  assert.equal(texto.titulo, 'Você ganhou o selo de ' + conteudo.atendimento.nome + '.');
  const sel = T.exibirSelo(res.selo, hojeBoaVista());
  assert.equal(sel.linhaNota, 'Nota 60 (±10)');
  assert.equal(sel.modalidade, 'Online, sem supervisão');
  for (const p of T.PALAVRAS_PROIBIDAS) assert.ok(!JSON.stringify([texto, sel]).toLowerCase().includes(p), p);
});

test('abaixo da nota mínima: sem selo; 30 dias para refazer (grátis) e a nova prova evita as questões já vistas', async () => {
  exigirBanco();
  const t = (await pessoa(P2, 'vagas_iniciar_tentativa', ['atendimento'])).tentativa.id;
  await pessoa(P2, 'vagas_proxima_questao', [t]);
  await responderTudo(P2, t, 8);
  const res = (await pessoa(P2, 'vagas_finalizar', [t])).resultado;
  assert.equal(res.nota, 53);
  assert.equal(res.selo, null);
  assert.equal(T.textoResultado(res).titulo, 'Ainda sem selo neste teste.');
  assert.equal((await db.query(`select count(*)::int as n from public.vagas_selos where user_id = $1`, [P2])).rows[0].n, 0);

  const ag = await pessoa(P2, 'vagas_iniciar_tentativa', ['atendimento']);
  assert.equal(ag.codigo, 'aguarde');
  assert.match(ag.erro, /^Você fez este teste há menos de 30 dias\. Pode fazer de novo a partir de \d{2}\/\d{2}\/\d{4}\.$/);
  assert.equal(ag.podeIniciarEm, res.podeIniciarEm);
  const cat = await pessoa(P2, 'vagas_testes_catalogo', []);
  assert.equal(cat.testes[0].minha.ultima.nota, 53);
  assert.equal(cat.testes[0].minha.podeIniciarEm, res.podeIniciarEm);
  assert.equal(T.situacaoDoTeste(cat.testes[0]).acao, 'aguardar');

  // 31 dias depois: pode refazer, e o sorteio prefere questões que a pessoa não viu.
  await db.query(`update public.vagas_tentativas set iniciada_em = iniciada_em - interval '31 days',
    termina_em = termina_em - interval '31 days', limite_em = limite_em - interval '31 days',
    finalizada_em = finalizada_em - interval '31 days' where id = $1`, [t]);
  const nova = await pessoa(P2, 'vagas_iniciar_tentativa', ['atendimento']);
  assert.equal(nova.ok, true, JSON.stringify(nova));
  const ids = async (id) => (await linhaTentativa(id)).questoes.map((x) => x.id);
  const vistas = new Set(await ids(t));
  const repetidas = (await ids(nova.tentativa.id)).filter((x) => vistas.has(x));
  // Preferência, não garantia (a regra dos grupos e as cotas 6/6/3 vêm antes): no máximo 1 (na simulação, 0 em 3000).
  assert.ok(repetidas.length <= 1, 'questões repetidas da tentativa anterior: ' + repetidas.join(', '));
});

test('tempo do servidor: tolerância só para a questão que já está na tela; vencida fecha sozinha ao consultar', async () => {
  exigirBanco();
  // Fim oficial passou há 5 s, questão 1 já na tela (mostrada antes do fim): vale até fim + 10 s, então a resposta conta e o
  // teste fecha (nenhuma questão nova depois do fim).
  const a = (await pessoa(P3, 'vagas_iniciar_tentativa', ['vendas'])).tentativa.id;
  await pessoa(P3, 'vagas_proxima_questao', [a]);
  await db.query(`update public.vagas_tentativas set iniciada_em = now() - interval '30 minutes', termina_em = now() - interval '5 seconds',
    limite_em = now() + interval '5 seconds' where id = $1`, [a]);
  await db.query(`update public.vagas_tentativa_respostas set exibida_em = now() - interval '20 seconds' where tentativa_id = $1`, [a]);
  const r = await pessoa(P3, 'vagas_responder', [a, 1, await posicaoCerta(a, 1)]);
  assert.deepEqual([r.ok, r.fim, r.respondidas], [true, true, 1]);
  assert.ok(!('proxima' in r));
  const res = (await pessoa(P3, 'vagas_finalizar', [a])).resultado;
  assert.equal(res.status, 'tempo_esgotado');
  assert.equal(res.acertos, 1);
  assert.equal(res.nota, 7);
  assert.equal(res.selo, null);

  // Passou da tolerância (fim há 200 s, questão 2 mostrada há 30 s: prazo = maior(fim, mostrada) + 10 s já venceu): não conta.
  const b = (await pessoa(P3, 'vagas_iniciar_tentativa', ['caixa'])).tentativa.id;
  await pessoa(P3, 'vagas_proxima_questao', [b]);
  await pessoa(P3, 'vagas_responder', [b, 1, await posicaoCerta(b, 1)]);
  await db.query(`update public.vagas_tentativas set iniciada_em = now() - interval '30 minutes', termina_em = now() - interval '200 seconds',
    limite_em = now() - interval '190 seconds' where id = $1`, [b]);
  await db.query(`update public.vagas_tentativa_respostas set exibida_em = now() - interval '30 seconds' where tentativa_id = $1 and ordem = 1`, [b]);
  const tarde = await pessoa(P3, 'vagas_responder', [b, 2, 0]);
  assert.deepEqual([tarde.ok, tarde.codigo, tarde.fim], [false, 'tempo_esgotado', true]);
  const lb = await linhaTentativa(b);
  assert.deepEqual([lb.status, lb.respondidas, lb.acertos], ['tempo_esgotado', 1, 1]);

  // A tolerância é da questão que está na tela, não da prova: mostrada 1 s antes do fim, vale 10 s depois do fim; mostrada
  // 60 s antes do fim, também só até fim + 10 s (e não 10 s × nº de questões).
  const b2 = (await pessoa(P6, 'vagas_iniciar_tentativa', ['caixa'])).tentativa.id;
  await pessoa(P6, 'vagas_proxima_questao', [b2]);
  await db.query(`update public.vagas_tentativas set iniciada_em = now() - interval '30 minutes', termina_em = now() - interval '12 seconds',
    limite_em = now() - interval '2 seconds' where id = $1`, [b2]);
  await db.query(`update public.vagas_tentativa_respostas set exibida_em = now() - interval '72 seconds' where tentativa_id = $1`, [b2]);
  assert.equal((await pessoa(P6, 'vagas_responder', [b2, 1, 0])).codigo, 'tempo_esgotado', 'fim + 12 s: passou dos 10 s');
  assert.equal((await linhaTentativa(b2)).status, 'tempo_esgotado');

  // Fim oficial passou sem questão na tela: a próxima consulta fecha.
  const c = (await pessoa(P3, 'vagas_iniciar_tentativa', ['administrativo'])).tentativa.id;
  await db.query(`update public.vagas_tentativas set iniciada_em = now() - interval '30 minutes', termina_em = now() - interval '1 second',
    limite_em = now() + interval '100 seconds' where id = $1`, [c]);
  const pq = await pessoa(P3, 'vagas_proxima_questao', [c]);
  assert.deepEqual([pq.ok, pq.fim, pq.status], [true, true, 'tempo_esgotado']);

  // O catálogo também fecha as vencidas da pessoa.
  const d = (await pessoa(P4, 'vagas_iniciar_tentativa', ['portugues'])).tentativa.id;
  await db.query(`update public.vagas_tentativas set iniciada_em = now() - interval '30 minutes', termina_em = now() - interval '300 seconds',
    limite_em = now() - interval '60 seconds' where id = $1`, [d]);
  const cat = await pessoa(P4, 'vagas_testes_catalogo', []);
  const item = cat.testes.find((x) => x.slug === 'portugues');
  assert.equal(item.minha.aberta, null);
  assert.equal(item.minha.podeIniciarEm, null, 'vencida sem nenhuma questão na tela: não conta para os 30 dias');
  assert.equal(item.minha.ultima.status, 'tempo_esgotado');
  assert.equal((await linhaTentativa(d)).status, 'tempo_esgotado');
  assert.deepEqual((await linhaTentativa(d)).alertas, [], 'sem resposta não há alerta');
});

test('selo: conferência pública sem dados da pessoa, limite por origem, vencido, revogado só pela equipe, cartão e meus selos', async () => {
  exigirBanco();
  await db.query(`delete from public.limites_vendas where tipo in ('vagas_selo', 'vagas_tentativa')`);
  const s1 = (await db.query(`select * from public.vagas_selos where user_id = $1`, [P1])).rows[0];
  const pub = await anon('vagas_selo_publico', [T.formatarCodigo(s1.codigo).toLowerCase() + ' ']);
  assert.equal(pub.ok, true, JSON.stringify(pub));
  assert.deepEqual(Object.keys(pub.selo).sort(), ['codigo', 'data', 'margem', 'nome', 'nota', 'questoes', 'situacao', 'supervisao', 'teste', 'validoAte']);
  assert.equal(pub.selo.questoes, 15);
  assert.deepEqual([pub.selo.codigo, pub.selo.nota, pub.selo.margem, pub.selo.supervisao, pub.selo.situacao], [s1.codigo, 60, 10, 'online', 'valido']);
  assert.doesNotMatch(JSON.stringify(pub), /p1@x\.com|11111111|user/);
  assert.equal((await anon('vagas_selo_publico', ['AAAA2222'])).codigo, 'selo_inexistente');
  assert.equal((await anon('vagas_selo_publico', ['xyz'])).codigo, 'selo_inexistente');

  // 20 códigos inexistentes da mesma origem: ela passa a receber "não encontrado" até para o código certo.
  for (let i = 0; i < 20; i++) await anon('vagas_selo_publico', ['ZZZZ' + 'ABCDEFGHJKLMNPQRSTUVWXYZ'.slice(i, i + 4)], de('203.0.113.50'));
  assert.equal((await anon('vagas_selo_publico', [s1.codigo], de('203.0.113.50'))).codigo, 'selo_inexistente');
  assert.equal((await anon('vagas_selo_publico', [s1.codigo], de('203.0.113.51'))).ok, true, 'outra origem não é afetada');
  assert.equal((await anon('vagas_selo_publico', [s1.codigo], Object.assign({ somenteLeitura: true }, de('203.0.113.52')))).codigo,
    'selo_inexistente', 'GET (só leitura) não conta erro: responde "não encontrado"');
  await db.query(`delete from public.limites_vendas where tipo = 'vagas_selo'`);

  // Um segundo selo de nota maior: o cartão mostra 1 por teste, o de maior nota válido.
  await db.query(`insert into public.vagas_selos (codigo, user_id, teste, nota, emitido_em, valido_ate)
    values ('BBBB2222', $1, 'atendimento', 87, now(), current_date + 300)`, [P1]);
  let cartao = (await db.query(`select vagas_interno.selos_cartao($1) as c`, [P1])).rows[0].c;
  assert.deepEqual(cartao.map((x) => [x.codigo, x.nota, x.margem, x.questoes, x.supervisao]), [['BBBB2222', 87, 10, 15, 'online']],
    'selo sem tentativa (inserido à mão): questoes = tamanho atual da prova');
  assert.ok(!('situacao' in cartao[0]));
  let meus = await pessoa(P1, 'vagas_meus_selos', []);
  assert.deepEqual(meus.selos.map((x) => [x.codigo, x.exibido]).sort(), [['BBBB2222', true], [s1.codigo, false]].sort());

  assert.equal((await pessoa(P1, 'vagas_revogar_selo', ['BBBB2222', 'teste'])).codigo, 'sem_permissao');
  assert.equal((await pessoa(ADMIN, 'vagas_revogar_selo', ['BBBB2222', '   '])).codigo, 'motivo');
  assert.equal((await pessoa(ADMIN, 'vagas_revogar_selo', ['bbbb-2222', 'Respostas iguais a outra conta; revisão humana.'])).ok, true);
  assert.equal((await pessoa(ADMIN, 'vagas_revogar_selo', ['BBBB2222', 'de novo'])).ok, true, 'revogar de novo é idempotente');
  assert.equal((await pessoa(ADMIN, 'vagas_revogar_selo', ['CCCC2222', 'x'])).codigo, 'selo_inexistente');
  const rev = await anon('vagas_selo_publico', ['BBBB2222']);
  assert.deepEqual([rev.selo.situacao, rev.selo.nota], ['revogado', null]);
  assert.equal(T.exibirSelo(rev.selo).rotuloSituacao, 'Cancelado pela equipe');
  cartao = (await db.query(`select vagas_interno.selos_cartao($1) as c`, [P1])).rows[0].c;
  assert.deepEqual(cartao.map((x) => x.codigo), [s1.codigo], 'revogado sai do cartão');

  await db.query(`update public.vagas_selos set valido_ate = current_date - 2 where codigo = $1`, [s1.codigo]);
  assert.equal((await anon('vagas_selo_publico', [s1.codigo])).selo.situacao, 'vencido');
  assert.deepEqual((await db.query(`select vagas_interno.selos_cartao($1) as c`, [P1])).rows[0].c, [], 'vencido sai do cartão');
  meus = await pessoa(P1, 'vagas_meus_selos', []);
  assert.ok(meus.selos.every((x) => x.exibido === false));

  // A equipe lê tentativas e selos; a pessoa comum não (só pelas funções).
  assert.ok((await como('authenticated', ADMIN, `select count(*)::int as n from public.vagas_selos`)).rows[0].n >= 2);
  assert.equal((await como('authenticated', P1, `select count(*)::int as n from public.vagas_selos`)).rows[0].n, 0);
  assert.equal((await como('authenticated', P1, `select count(*)::int as n from public.vagas_tentativas`)).rows[0].n, 0);
});

test('limite por origem ao iniciar: 10 em 10 minutos bloqueia a origem; sem cabeçalho (conexão direta) não há limite', async () => {
  exigirBanco();
  await db.query(`insert into public.limites_vendas (tipo, chave) select 'vagas_tentativa', 'ip4:198.51.100.7' from generate_series(1, 10)`);
  const r = await pessoa(P4, 'vagas_iniciar_tentativa', ['atendimento'], de('198.51.100.7'));
  assert.equal(r.codigo, 'limite_origem');
  const ok = await pessoa(P4, 'vagas_iniciar_tentativa', ['atendimento'], de('198.51.100.8'));
  assert.equal(ok.ok, true);
  assert.equal((await db.query(`select count(*)::int as n from public.limites_vendas where tipo = 'vagas_tentativa'
    and chave = 'ip4:198.51.100.8'`)).rows[0].n, 1, 'tentativa nova conta 1 para a origem');
  const retoma = await pessoa(P4, 'vagas_iniciar_tentativa', ['atendimento'], de('198.51.100.8'));
  assert.equal(retoma.tentativa.retomada, true);
  assert.equal((await db.query(`select count(*)::int as n from public.limites_vendas where tipo = 'vagas_tentativa'
    and chave = 'ip4:198.51.100.8'`)).rows[0].n, 1, 'retomar não conta');
  await db.query(`delete from public.limites_vendas where tipo = 'vagas_tentativa'`);
});

test('exportação (LGPD) sem questões nem gabarito; excluir a conta apaga tentativas e selos', async () => {
  exigirBanco();
  const ex = (await db.query(`select vagas_interno.testes_exportar($1) as e`, [P1])).rows[0].e;
  assert.ok(ex.tentativas.length >= 1);
  assert.ok(ex.selos.length >= 1);
  assert.doesNotMatch(JSON.stringify(ex), /correta|alternativas|"questoes":\s*\[/, 'sem a lista de questões (só o nº de questões do selo)');
  await db.query(`delete from auth.users where id = $1`, [P2]);
  const n = (await db.query(`select (select count(*) from public.vagas_tentativas where user_id = $1)::int as t,
    (select count(*) from public.vagas_tentativa_respostas r join public.vagas_tentativas tt on tt.id = r.tentativa_id
      where tt.user_id = $1)::int as r`, [P2])).rows[0];
  assert.deepEqual(n, { t: 0, r: 0 });
});

test('mensagens do banco iguais às de vagas/js/testes.js', () => {
  exigirBanco();
  const vistos = Object.keys(erros).sort();
  for (const c of ['alternativa_invalida', 'conta_inativa', 'encerrada', 'fora_de_ordem', 'limite_origem', 'login', 'motivo',
    'selo_inexistente', 'sem_permissao', 'sinal_invalido', 'so_pessoa', 'teste_indisponivel', 'tempo_esgotado', 'tentativa_inexistente']) {
    assert.ok(vistos.includes(c), 'o teste passou pelo erro ' + c);
    assert.equal(erros[c], T.MENSAGENS[c], c);
    assert.equal(T.mensagemErro(c), erros[c]);
  }
  assert.ok(erros.aguarde.startsWith(T.MENSAGENS.aguarde));
});

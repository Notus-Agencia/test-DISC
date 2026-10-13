'use strict';
// Feedback 360 pela API: a prévia (js/api-simulada.js) segue as mesmas regras e mensagens do banco
// (supabase/migrations/20261021120000_feedback360.sql) e o cliente Supabase (js/api-supabase.js) chama as funções certas.
const test = require('node:test');
const assert = require('node:assert/strict');
const SIM = require('../js/api-simulada.js');
const SB = require('../js/api-supabase.js');
const API = require('../js/api.js');
const S = require('../js/scoring.js');
const CL = require('../js/clima.js');
const F = require('../js/feedback360.js');

function localStorageFalso() {
  const dados = {};
  return { dados, getItem: (k) => (Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, removeItem: (k) => { delete dados[k]; } };
}
function nova(extra) {
  const armazenamento = localStorageFalso();
  const api = SIM.criar(Object.assign({ armazenamento, scoring: S, latenciaMs: 0, semente: false, clima: CL, f360: F }, extra || {}));
  const r = api.processar({ acao: 'primeiroAcesso', chave: 'previa', nome: 'Dona do Sistema', email: 'dona@empresa.com', senha: 'senha-forte-1' });
  if (!r.ok) throw new Error(r.erro);
  return { api, armazenamento, T: r.token };
}
function todos(v, extra) { const it = {}; F.IDS_ITENS.forEach((id) => { it[id] = v; }); it.GLB1 = 4; return Object.assign(it, extra || {}); }

// Dona lidera Bruno (5), Carla (3) e Davi (2); Carla "trabalha com" Davi; 2 pessoas soltas.
async function organograma(api, T) {
  const emp = (await api.salvarEmpresa(T, { nome: 'F360 Prévia' })).empresa;
  let tel = 0;
  const col = async (nome) => (await api.salvarColaborador(T, { empresaId: emp.id, nome, telefone: '1194444' + String(1000 + (++tel)), cargo: 'Cargo', area: 'Área' })).colaborador.pessoaId;
  const o = { emp: emp.id, D: await col('Dona Maria Silva'), B: await col('Bruno de Souza'), C: await col('Carla Mendes'), V: await col('Davi Rocha'), eb: [], ec: [], ev: [], s: [] };
  for (let i = 0; i < 5; i++) o.eb.push(await col('Equipe Bruno ' + i));
  for (let i = 0; i < 3; i++) o.ec.push(await col('Equipe Carla ' + i));
  for (let i = 0; i < 2; i++) o.ev.push(await col('Equipe Davi ' + i));
  for (let i = 0; i < 2; i++) o.s.push(await col('Solta ' + i + ' Teste'));
  const rel = [{ de: o.D, para: o.B, tipo: 'lidera' }, { de: o.D, para: o.C, tipo: 'lidera' }, { de: o.D, para: o.V, tipo: 'lidera' }, { de: o.C, para: o.V, tipo: 'direto' }]
    .concat(o.eb.map((x) => ({ de: o.B, para: x, tipo: 'lidera' }))).concat(o.ec.map((x) => ({ de: o.C, para: x, tipo: 'lidera' })))
    .concat(o.ev.map((x) => ({ de: o.V, para: x, tipo: 'lidera' })));
  await api.salvarRelacoes(T, emp.id, rel);
  return o;
}
function desenho(o, extra) {
  return Object.assign({ empresaId: o.emp, contatoRelatos: 'Diretoria (contrato)', avaliados: [
    { pessoaId: o.B, chefia: [o.D], equipe: o.eb, colegas: [o.C] }, { pessoaId: o.C, chefia: [o.D], equipe: o.ec, colegas: [o.B, o.V] }] }, extra || {});
}
function links(ciclo) {
  const t = {};
  ciclo.convites.forEach((c) => { (t[c.avaliadoId + ':' + c.fonte] = t[c.avaliadoId + ':' + c.fonte] || []).push(c.token); });
  return (a, f) => t[a + ':' + f] || [];
}

test('métodos do Feedback 360 nos três DISC_API (o Apps Script recusa)', async () => {
  const nomes = ['f360Publica', 'f360Enviar', 'f360ApagarResposta', 'f360Listar', 'f360CriarCiclo', 'f360Encerrar', 'f360Recalcular', 'f360Comentarios',
    'f360Moderar', 'f360SalvarDevolutiva', 'f360GerarRelatorio', 'f360GerarConsolidado', 'f360ExcluirCiclo', 'f360ApagarBrutas'];
  nomes.forEach((m) => assert.ok(API.METODOS.includes(m) && SB.METODOS.includes(m) && SIM.METODOS.includes(m), m));
  await assert.rejects(API.f360Publica('x'), /Disponível só com o servidor Supabase/);
});

test('prévia: criar ciclo com as mesmas regras do banco (desenho, teto, mínimo, um aberto, clima aberto)', async () => {
  const { api, T } = nova();
  const o = await organograma(api, T);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { contatoRelatos: '' })), /protocolo de relatos/);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { avaliados: [] })), /pelo menos uma pessoa/);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { avaliados: [{ pessoaId: o.V, chefia: [o.D], equipe: o.ev }] })), /Davi R\. precisa de pelo menos 3/);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { avaliados: [{ pessoaId: o.B, chefia: [o.C], equipe: o.eb }] })), /A chefia de Bruno S\. precisa ser quem lidera/);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { retencaoDias: 120 })), /de 30 a 90 dias/);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o, { encerramentoPrevisto: '2020-01-01' })), /Data prevista de encerramento inválida/);
  const c = (await api.f360CriarCiclo(T, desenho(o, { nome: 'Feedback 360 · teste' }))).ciclo;
  assert.equal(c.status, 'aberto');
  assert.deepEqual(c.avaliados.map((a) => [a.nome, a.topo, a.convidados]), [
    ['Bruno S.', false, { auto: 1, chefia: 1, colegas: 1, equipe: 5, outros: 0 }], ['Carla M.', false, { auto: 1, chefia: 1, colegas: 2, equipe: 3, outros: 0 }]]);
  assert.equal(c.convites.length, 15);
  assert.ok(c.convites.every((x) => /^[0-9a-f]{64}$/.test(x.token) && x.nome));
  assert.equal(c.consolidado, null);
  await assert.rejects(api.f360CriarCiclo(T, desenho(o)), /Já existe um Feedback 360 aberto/);
  await api.f360ExcluirCiclo(T, c.id);
  const clima = await api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.B }] });
  await assert.rejects(api.f360CriarCiclo(T, desenho(o)), /pesquisa de clima aberta/);
  await api.climaExcluirRodada(T, clima.rodada.id);
});

test('prévia: link individual, substituir e apagar a própria resposta, nada antes do encerramento, ligação apagada no encerramento', async () => {
  const { api, T, armazenamento } = nova();
  const o = await organograma(api, T);
  const c = (await api.f360CriarCiclo(T, desenho(o))).ciclo;
  const tk = links(c);
  const [B, C] = c.avaliados.map((a) => a.id);
  const pub = await api.f360Publica(tk(B, 'equipe')[0]);
  assert.deepEqual([pub.fonte, pub.avaliadoNome, pub.empresaNome, pub.respondido, pub.duasChefias], ['equipe', 'Bruno S.', 'F360 Prévia', false, false]);
  await assert.rejects(api.f360Publica('f'.repeat(64)), /Link inválido ou Feedback 360 encerrado/);
  await assert.rejects(api.f360Enviar(tk(B, 'equipe')[0], { itens: { DIR1: 9 } }), /Respostas em formato inválido/);
  await assert.rejects(api.f360Enviar(tk(B, 'equipe')[0], { itens: {} }), /Responda pelo menos uma pergunta/);
  assert.deepEqual(await api.f360Enviar(tk(B, 'equipe')[0], { itens: todos(2), comentarios: { AB1: 'primeira' } }), { ok: true });
  assert.deepEqual(await api.f360Enviar(tk(B, 'equipe')[0], { itens: todos(4), comentarios: { AB1: 'segunda' } }), { ok: true, substituida: true });
  assert.equal((await api.f360Publica(tk(B, 'equipe')[0])).respondido, true);
  assert.deepEqual(await api.f360ApagarResposta(tk(B, 'equipe')[1]), { ok: true, apagada: false });
  for (const t of tk(B, 'equipe')) await api.f360Enviar(t, { itens: todos(4, { DIR2: 3 }), comentarios: { AB2: 'Mais conversa' } });
  await api.f360Enviar(tk(B, 'chefia')[0], { itens: todos(3), comentarios: { AB1: 'Da chefia' } });
  await api.f360Enviar(tk(B, 'auto')[0], { itens: todos(5), comentarios: { AB1: 'não vai' } });
  await api.f360Enviar(tk(C, 'equipe')[0], { itens: todos(4), comentarios: { AB1: 'Grupo pequeno' } });
  // Guardado sem nada que identifique; os comentários ficam à parte, com a fonte.
  const brutas = JSON.parse(armazenamento.dados[SIM.CHAVES.f360Respostas]);
  assert.equal(brutas.length, 8);
  brutas.forEach((b) => assert.deepEqual(Object.keys(b).sort(), ['avaliadoId', 'cicloId', 'fonte', 'id', 'itens', 'segundos', 'versaoItens']));
  assert.ok(!JSON.stringify(brutas).includes('primeira'));
  // Painel: só contagens enquanto aberto.
  const l = (await api.f360Listar(T, o.emp)).ciclos[0];
  assert.deepEqual(l.avaliados[0].respondentes, { auto: 1, chefia: 1, colegas: 0, equipe: 5, outros: 0 });
  assert.equal(l.avaliados[0].resultado, null);
  await assert.rejects(api.f360Comentarios(T, B), /depois que o ciclo é encerrado/);
  await assert.rejects(api.f360GerarRelatorio(T, B, { visao: 'lider' }), /Encerre o ciclo/);
  // Encerrar: congela, apaga a ligação link → resposta e a lista de convidados.
  const e = (await api.f360Encerrar(T, c.id)).ciclo;
  assert.equal(e.status, 'encerrado');
  assert.deepEqual(e.convites, []);
  assert.deepEqual(JSON.parse(armazenamento.dados[SIM.CHAVES.f360Vinculos]), []);
  assert.deepEqual(JSON.parse(armazenamento.dados[SIM.CHAVES.f360Convites]), []);
  await assert.rejects(api.f360Publica(tk(B, 'equipe')[0]), /Link inválido ou Feedback 360 encerrado/);
  const rB = e.avaliados[0].resultado;
  assert.equal(rB.liberado, true);
  assert.deepEqual(rB.grupos.map((g) => g.id), ['equipe']);
  assert.equal(rB.chefia.temas.DIR, 3);
  assert.equal(e.avaliados[1].resultado.liberado, false);
  const com = await api.f360Comentarios(T, B);
  assert.equal(com.comentarios.length, 6);
  assert.deepEqual(com.comentarios[0], Object.assign({}, com.comentarios[0], { chefia: true, texto: 'Da chefia' }), 'a chefia vem primeiro');
  assert.deepEqual((await api.f360Comentarios(T, C)).comentarios.map((x) => x.elegivel), [false]);
});

test('prévia: moderação, devolutiva, relatório do líder e visão da chefia (só o plano); consolidado só com 5 líderes', async () => {
  const { api, T } = nova();
  const o = await organograma(api, T);
  const c = (await api.f360CriarCiclo(T, desenho(o))).ciclo;
  const tk = links(c);
  const B = c.avaliados[0].id;
  for (const [i, t] of tk(B, 'equipe').entries()) await api.f360Enviar(t, { itens: todos(3 + (i % 2), { DIR2: 2 }), comentarios: { AB1: 'Comentário ' + i } });
  await api.f360Enviar(tk(B, 'auto')[0], { itens: todos(5, { DIR2: 4 }) });
  await api.f360Encerrar(T, c.id);
  await assert.rejects(api.f360GerarRelatorio(T, B, { visao: 'lider' }), /devolutiva como feita/);
  await assert.rejects(api.f360SalvarDevolutiva(T, B, { plano: { comportamentos: [{ item: 'X' }] } }), /entre as 18 frases/);
  await api.f360SalvarDevolutiva(T, B, { temas: ['Tema um'], foco: 'Foco', plano: { comportamentos: [{ item: 'DIR2', acao: 'Combinar prazo' }] }, devolutivaFeita: true });
  await assert.rejects(api.f360GerarRelatorio(T, B, { visao: 'lider' }), /Modere todos os comentários/);
  const coms = (await api.f360Comentarios(T, B)).comentarios;
  await assert.rejects(api.f360Moderar(T, coms[0].id, { status: 'descartado' }), /motivo do descarte/);
  assert.equal((await api.f360Moderar(T, coms[0].id, { status: 'descartado', motivo: 'relato' })).relatosRegistrados, 1);
  await api.f360Moderar(T, coms[1].id, { status: 'editado', texto: 'Editado [trecho removido]' });
  for (const x of coms.slice(2)) await api.f360Moderar(T, x.id, { status: 'mantido' });
  const g = await api.f360GerarRelatorio(T, B, { visao: 'lider', publicar: true, consultor: 'W' });
  assert.equal(g.relatorio.status, 'publicado');
  const pr = await api.relatorioPublico(g.relatorio.token);
  assert.equal(pr.modelo, 'feedback360');
  assert.equal(pr.relatorio.visao, 'lider');
  assert.equal(pr.relatorio.comentarios.length, 4);
  assert.ok(pr.relatorio.comentarios.some((x) => x.texto === 'Editado [trecho removido]'));
  assert.ok(!JSON.stringify(pr.relatorio).includes(coms[0].texto), 'descartado não vai');
  const lista = (await api.f360Listar(T, o.emp)).ciclos[0];
  assert.deepEqual(pr.relatorio.resultado, F.visaoLider(lista.avaliados[0].resultado));
  assert.equal(lista.relatosRegistrados, 1);
  assert.equal(lista.avaliados[0].relatorios.lider.status, 'publicado');
  const gc = await api.f360GerarRelatorio(T, B, { visao: 'chefia', publicar: true });
  const pc = (await api.relatorioPublico(gc.relatorio.token)).relatorio;
  assert.deepEqual(Object.keys(pc).sort(), ['avaliado', 'ciclo', 'consultor', 'devolutivaEm', 'empresa', 'geradoEm', 'modelo', 'plano', 'titulo', 'versao', 'visao']);
  assert.deepEqual((await api.listarRelatoriosModelo(T, { empresaId: o.emp })).relatorios, [], 'fora da lista de modelos do painel');
  await assert.rejects(api.f360GerarConsolidado(T, c.id, {}), /5 ou mais líderes/);
  // Retenção já (por ciclo): o relatório publicado fica; não dá mais para refazer.
  assert.deepEqual(await api.f360ApagarBrutas(T, { cicloId: c.id, agora: true }), { ok: true, avaliados: 2, respostas: 6, relatorios: 0 });
  assert.equal((await api.relatorioPublico(g.relatorio.token)).ok, true);
  await assert.rejects(api.f360GerarRelatorio(T, B, { visao: 'lider' }), /já foram apagados/);
  await api.f360ExcluirCiclo(T, c.id);
  await assert.rejects(api.relatorioPublico(g.relatorio.token), /Relatório não encontrado/);
});

test('prévia com semente: ciclo encerrado da Clínica Exemplo e relatórios publicados (líder, Diego e visão da chefia)', async () => {
  const api = SIM.criar({ armazenamento: localStorageFalso(), scoring: S, latenciaMs: 0, clima: CL, f360: F });
  const pr = await api.relatorioPublico('exemplo-360');
  assert.equal(pr.modelo, 'feedback360');
  const d = pr.relatorio;
  assert.equal(d.avaliado.nome, 'Marta E.');
  assert.equal(d.empresa.nome, 'Clínica Exemplo');
  assert.deepEqual(d.resultado.grupos.map((g) => [g.nome, g.n]), [['Equipe e outros', 6]]);
  assert.deepEqual(d.resultado.outras.itens.APO1, { pouco: true });
  assert.equal(d.resultado.outras.itens.FBK2, null);
  assert.deepEqual(d.disc, { codigo: 'DC' });
  assert.equal(d.comentarios.length, 5);
  const dest = F.destaques(d.resultado);
  assert.deepEqual(dest.manter.map((x) => x.item), ['DIR3', 'DIR1', 'RES3', 'FBK3']);
  assert.deepEqual(dest.desenvolver.map((x) => x.item), ['COE3', 'AUT1', 'RES2']);
  assert.deepEqual(F.diferencas(d.resultado).filter((x) => x.grupo === 'outras').map((x) => x.tema), ['APO', 'COE']);
  const diego = (await api.relatorioPublico('exemplo-360-diego')).relatorio;
  assert.deepEqual(diego.resultado.grupos.map((g) => [g.nome, g.n]), [['Colegas e equipe', 3]]);
  assert.ok(F.IDS_ITENS.every((id) => diego.resultado.outras.itens[id] === null || diego.resultado.outras.itens[id].pouco), 'com 3 respostas, nenhuma frase');
  const chefia = (await api.relatorioPublico('exemplo-360-chefia')).relatorio;
  assert.equal(chefia.visao, 'chefia');
  assert.equal(chefia.resultado, undefined);
  assert.deepEqual(chefia.plano.comportamentos.map((x) => x.item), ['FBK1', 'DIR2']);
  const login = await api.login('admin@previa.com', 'previa123');
  const l = (await api.f360Listar(login.token, 'emp_previa_clinica')).ciclos;
  assert.equal(l.length, 1);
  assert.equal(l[0].status, 'encerrado');
  assert.deepEqual(l[0].avaliados.map((a) => [a.nome, a.resultado.liberado]), [['Marta E.', true], ['Diego E.', true], ['Paulo M.', false]]);
  assert.equal(l[0].avaliados[0].relatorios.lider.token, 'exemplo-360');
});

// ---------------------------------------------------------------------------------------------------------------
// Cliente Supabase: chama as funções certas do banco e normaliza as respostas.
// ---------------------------------------------------------------------------------------------------------------
function clienteFalso(respostasRpc) {
  const chamadas = [];
  const sessao = { access_token: 'jwt', user: { id: '11111111-1111-4111-8111-111111111111', email: 'dona@empresa.com' } };
  const cli = {
    auth: { getSession: async () => ({ data: { session: sessao }, error: null }) },
    rpc: async (nome, args) => { chamadas.push({ nome, args }); const f = respostasRpc[nome]; return { data: f ? f(args) : { ok: true }, error: null }; },
    from: () => { throw new Error('não deveria ler tabela'); },
    functions: { invoke: async () => ({ data: null, error: null }) }
  };
  return { chamadas, cli };
}

test('cliente Supabase: funções f360_* com os argumentos do contrato', async () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  const TK = 'a'.repeat(64);
  const REL = { id: 'r1', token: 'b'.repeat(64), status: 'publicado' };
  const ciclo = { id: ID, status: 'encerrado', avaliados: [{ id: ID, relatorios: { lider: REL, chefia: null } }], convites: [], consolidado: REL };
  const { chamadas, cli } = clienteFalso({
    f360_publica: () => ({ ok: true, fonte: 'equipe', avaliadoNome: 'Ana P.' }),
    f360_enviar: () => ({ ok: true, substituida: true }),
    f360_apagar_resposta: () => ({ ok: true, apagada: true }),
    f360_listar: () => ({ ok: true, ciclos: [ciclo] }),
    f360_criar_ciclo: () => ({ ok: true, ciclo }),
    f360_encerrar: () => ({ ok: true, ciclo }),
    f360_recalcular: () => ({ ok: true, ciclo }),
    f360_comentarios: () => ({ ok: true, apagados: false, comentarios: [{ id: 'c1' }] }),
    f360_moderar: () => ({ ok: true, id: 'c1', status: 'mantido', relatosRegistrados: 0 }),
    f360_salvar_devolutiva: () => ({ ok: true, ciclo }),
    f360_gerar_relatorio: () => ({ ok: true, relatorio: Object.assign({ visao: 'lider' }, REL) }),
    f360_gerar_consolidado: () => ({ ok: false, erro: 'O consolidado da liderança só aparece com 5 ou mais líderes com relatório liberado e devolutiva feita.' }),
    f360_excluir_ciclo: () => ({ ok: true, id: ID }),
    f360_apagar_brutas: () => ({ ok: true, avaliados: 2, respostas: 9, relatorios: 0 })
  });
  const api = SB.criar({ cliente: cli, url: 'https://exemplo.supabase.co', chave: 'k', local: { href: 'https://site.com/admin.html', origin: 'https://site.com', pathname: '/admin.html' }, scoring: S });
  assert.equal((await api.f360Publica(TK.toUpperCase())).fonte, 'equipe');
  assert.deepEqual(chamadas.pop(), { nome: 'f360_publica', args: { p_token: TK } });
  await assert.rejects(api.f360Publica('xyz'), /Link inválido ou Feedback 360 encerrado/);
  assert.deepEqual(await api.f360Enviar(TK, { itens: { DIR1: 3 } }), { ok: true, substituida: true });
  assert.deepEqual(chamadas.pop().args, { p_token: TK, p_respostas: { itens: { DIR1: 3 } } });
  assert.deepEqual(await api.f360ApagarResposta(TK), { ok: true, apagada: true });
  const l = await api.f360Listar('jwt', ID);
  assert.equal(l.ciclos[0].avaliados[0].relatorios.lider.url, 'https://site.com/relatorio.html?r=' + 'b'.repeat(64));
  assert.equal(l.ciclos[0].avaliados[0].relatorios.chefia, null);
  assert.equal(l.ciclos[0].consolidado.url, 'https://site.com/relatorio.html?r=' + 'b'.repeat(64));
  assert.deepEqual(chamadas.pop(), { nome: 'f360_listar', args: { p_empresa: ID } });
  await api.f360CriarCiclo('jwt', { empresaId: ID, avaliados: [] });
  assert.equal(chamadas.pop().nome, 'f360_criar_ciclo');
  await api.f360Encerrar('jwt', ID);
  assert.deepEqual(chamadas.pop(), { nome: 'f360_encerrar', args: { p_ciclo: ID } });
  await api.f360Recalcular('jwt', ID, ['equipe', 'chefia', 'x']);
  assert.deepEqual(chamadas.pop(), { nome: 'f360_recalcular', args: { p_avaliado: ID, p_excluir: ['equipe'] } });
  assert.deepEqual((await api.f360Comentarios('jwt', ID)).comentarios, [{ id: 'c1' }]);
  await api.f360Moderar('jwt', ID, { status: 'editado', texto: ' texto ', motivo: '' });
  assert.deepEqual(chamadas.pop(), { nome: 'f360_moderar', args: { p_comentario: ID, p_dados: { status: 'editado', texto: 'texto', motivo: '' } } });
  await api.f360SalvarDevolutiva('jwt', ID, { foco: 'x', devolutivaFeita: true });
  assert.deepEqual(chamadas.pop(), { nome: 'f360_salvar_devolutiva', args: { p_avaliado: ID, p_dados: { foco: 'x', devolutivaFeita: true } } });
  const g = await api.f360GerarRelatorio('jwt', ID, { visao: 'lider', publicar: true, consultor: 'W' });
  assert.deepEqual(chamadas.pop().args, { p_avaliado: ID, p_opcoes: { visao: 'lider', publicar: true, consultor: 'W' } });
  assert.equal(g.relatorio.url, 'https://site.com/relatorio.html?r=' + 'b'.repeat(64));
  assert.equal(g.relatorio.modelo, 'feedback360');
  await assert.rejects(api.f360GerarConsolidado('jwt', ID, {}), /5 ou mais líderes/);
  assert.deepEqual(await api.f360ApagarBrutas('jwt', { cicloId: ID, agora: true }), { ok: true, avaliados: 2, respostas: 9, relatorios: 0 });
  assert.deepEqual(chamadas.pop().args, { p_ciclo: ID, p_agora: true });
  await api.f360ApagarBrutas('jwt');
  assert.deepEqual(chamadas.pop().args, { p_ciclo: null, p_agora: false });
  await assert.rejects(api.f360Encerrar('jwt', 'nao-e-uuid'), /Ciclo não encontrado/);
  await assert.rejects(api.f360Comentarios('jwt', 'x'), /Pessoa avaliada não encontrada/);
});

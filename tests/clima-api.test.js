'use strict';
// Pesquisa de clima pela API: a prévia (js/api-simulada.js) segue as mesmas regras e mensagens do banco
// (supabase/migrations/20261017120000_clima.sql) e o cliente Supabase (js/api-supabase.js) chama as funções certas.
const test = require('node:test');
const assert = require('node:assert/strict');
const SIM = require('../js/api-simulada.js');
const SB = require('../js/api-supabase.js');
const API = require('../js/api.js');
const S = require('../js/scoring.js');
const CL = require('../js/clima.js');

function localStorageFalso() {
  const dados = {};
  return { dados, getItem: (k) => (Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, removeItem: (k) => { delete dados[k]; } };
}
function nova(extra) {
  const armazenamento = localStorageFalso();
  const api = SIM.criar(Object.assign({ armazenamento, scoring: S, latenciaMs: 0, semente: false, clima: CL }, extra || {}));
  const r = api.processar({ acao: 'primeiroAcesso', chave: 'previa', nome: 'Dona do Sistema', email: 'dona@empresa.com', senha: 'senha-forte-1' });
  if (!r.ok) throw new Error(r.erro);
  return { api, armazenamento, T: r.token };
}
const chave = () => require('node:crypto').randomBytes(16).toString('hex');
function todos(v) { const it = {}; CL.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; })); it.H1 = v; return it; }

// Empresa com Lia (lidera Bruno e Carla), Bruno (lidera 6) e Carla (lidera 3).
async function organograma(api, T) {
  const emp = (await api.salvarEmpresa(T, { nome: 'Clima Prévia' })).empresa;
  let tel = 0;
  const col = async (nome, area) => (await api.salvarColaborador(T, { empresaId: emp.id, nome, telefone: '1193333' + String(1000 + (++tel)), cargo: 'Cargo', area })).colaborador.pessoaId;
  const lia = await col('Lia Diretora Silva', 'Diretoria');
  const bruno = await col('Bruno de Souza', 'Comercial');
  const carla = await col('Carla Mendes Lima', 'Comercial');
  const rel = [{ de: lia, para: bruno, tipo: 'lidera' }, { de: lia, para: carla, tipo: 'lidera' }];
  for (let i = 0; i < 6; i++) rel.push({ de: bruno, para: await col('Pessoa Um ' + i + ' Teste', 'Comercial'), tipo: 'lidera' });
  for (let i = 0; i < 3; i++) rel.push({ de: carla, para: await col('Pessoa Dois ' + i + ' Teste', 'Comercial'), tipo: 'lidera' });
  const solta = await col('Sem Liderados Teste', 'Comercial');
  await api.salvarRelacoes(T, emp.id, rel);
  return { emp: emp.id, lia, bruno, carla, solta };
}

test('métodos de clima nos três DISC_API (o Apps Script recusa)', async () => {
  const nomes = ['climaPublica', 'climaEnviar', 'climaListar', 'climaCriarRodada', 'climaEncerrar', 'climaResultado', 'climaComentarios',
    'climaGerarRelatorio', 'climaExcluirRodada', 'climaApagarBrutas'];
  nomes.forEach((m) => {
    assert.ok(API.METODOS.includes(m) && SB.METODOS.includes(m) && SIM.METODOS.includes(m), m);
  });
  await assert.rejects(API.climaPublica('x'), /Disponível só com o servidor Supabase/);
});

test('prévia: criar rodada com as mesmas regras do banco', async () => {
  const { api, T } = nova();
  const o = await organograma(api, T);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, equipes: [] }), /pelo menos uma equipe/);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.solta }] }), /não lidera ninguém/);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.carla }] }), /menos de 5 pessoas convidadas/);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.bruno, convidados: 2 }] }), /de 6 \(liderados no organograma\) a 500/);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, complemento: true, canalTexto: 'RH', canalUrl: 'http://x', equipes: [{ liderId: o.bruno }] }), /canal de escuta inválido/);
  const r = (await api.climaCriarRodada(T, { empresaId: o.emp, nome: 'Clima teste', complemento: true, canalTexto: 'o RH',
    equipes: [{ liderId: o.lia }, { liderId: o.bruno, convidados: 8 }, { liderId: o.carla }] })).rodada;
  assert.deepEqual(r.equipes.map((e) => [e.nome, e.area, e.convidados, e.respondentes]),
    [['Equipe de Lia D.', 'Diretoria', 2, 0], ['Equipe de Bruno S.', 'Comercial', 8, 0], ['Equipe de Carla M.', 'Comercial', 3, 0]]);
  assert.equal(r.status, 'aberta');
  assert.equal(r.n4, true);
  assert.equal(r.relatorio, null);
  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.bruno }] }), /Já existe uma pesquisa de clima aberta/);
  assert.equal((await api.climaListar(T, o.emp)).rodadas.length, 1);
});

test('prévia: resposta anônima pelo link, nada antes do encerramento, resultado congelado e relatório publicado', async () => {
  const { api, T, armazenamento } = nova();
  const o = await organograma(api, T);
  const r = (await api.climaCriarRodada(T, { empresaId: o.emp, complemento: true, canalTexto: 'o RH', equipes: [{ liderId: o.bruno, convidados: 12 }, { liderId: o.carla, convidados: 6 }] })).rodada;
  const [e1, e2] = r.equipes;
  const pub = await api.climaPublica(e1.tokenEquipe);
  assert.equal(pub.papel, 'membro');
  assert.equal(pub.empresaNome, 'Clima Prévia');
  assert.equal(pub.n4, true);
  assert.equal((await api.climaPublica(e1.tokenLider)).papel, 'lider');
  await assert.rejects(api.climaPublica('f'.repeat(64)), /Link inválido ou pesquisa encerrada/);
  await assert.rejects(api.climaEnviar(e1.tokenEquipe, { itens: { FL1: 3 }, chave: chave() }), /Respostas em formato inválido/);
  await assert.rejects(api.climaEnviar(e1.tokenEquipe, { itens: {}, chave: chave() }), /Responda pelo menos uma pergunta/);
  const k = chave();
  assert.deepEqual(await api.climaEnviar(e1.tokenEquipe, { itens: Object.assign(todos(4), { N1: 4, N4: 2 }), comentario: 'Mais pausas', chave: k }), { ok: true });
  assert.deepEqual(await api.climaEnviar(e1.tokenEquipe, { itens: todos(4), chave: k }), { ok: true, duplicado: true });
  for (let i = 0; i < 10; i++) await api.climaEnviar(e1.tokenEquipe, { itens: Object.assign(todos(1 + (i % 5)), { N1: 3, N4: 1 }), comentario: i % 2 ? 'Tema ' + i : '', chave: chave() });
  for (let i = 0; i < 5; i++) await api.climaEnviar(e2.tokenEquipe, { itens: todos(5), chave: chave() });
  await api.climaEnviar(e1.tokenLider, { itens: Object.fromEntries(CL.itensPermitidos('lider').map((id) => [id, 5])), chave: chave() });
  await assert.rejects(api.climaEnviar(e1.tokenLider, { itens: { A1: 5 }, chave: chave() }), /liderança desta equipe já foi registrada/);
  // O que fica guardado: nada que identifique (nem horário, nem id).
  const brutas = JSON.parse(armazenamento.dados[SIM.CHAVES.climaRespostas]);
  assert.equal(brutas.length, 17);
  brutas.forEach((b) => assert.deepEqual(Object.keys(b).sort(), ['comentario', 'equipeId', 'itens', 'papel', 'rodadaId', 'segundos', 'versaoItens']));
  // Painel: só contagens agregadas enquanto aberta.
  const lista = (await api.climaListar(T, o.emp)).rodadas[0];
  assert.deepEqual(lista.equipes.map((e) => e.respondentes), [11, 5]);
  assert.equal(lista.respondentes, 16);
  await assert.rejects(api.climaResultado(T, r.id), /só aparecem depois que a pesquisa é encerrada/);
  await assert.rejects(api.climaGerarRelatorio(T, r.id, {}), /Encerre a pesquisa/);
  // Encerrar: resultado igual ao do js/clima.js, envio recusado.
  const enc = await api.climaEncerrar(T, r.id);
  assert.equal(enc.rodada.status, 'encerrada');
  assert.deepEqual(enc.resultado.grupos.map((g) => g.id), ['empresa', e1.id, e2.id]);
  assert.equal(enc.resultado.lideres.length, 1);
  await assert.rejects(api.climaEnviar(e1.tokenEquipe, { itens: { A1: 3 }, chave: chave() }), (e) => e.resposta && e.resposta.encerrada === true);
  await assert.rejects(api.climaPublica(e1.tokenEquipe), /já foi encerrada/);
  const com = await api.climaComentarios(T, r.id);
  assert.equal(com.disponivel, true);
  assert.equal(com.comentarios.length, 6);
  // Relatório: snapshot só com a visão do cliente; aparece em relatorioPublico com o modelo 'clima'; fora da lista de modelos.
  const g = await api.climaGerarRelatorio(T, r.id, { publicar: true, consultor: 'Wellington', temas: ['Pausas', '', 'Escala'] });
  assert.equal(g.relatorio.status, 'publicado');
  assert.match(g.relatorio.url, /relatorio\.html\?r=[0-9a-f]{64}$/);
  const pr = await api.relatorioPublico(g.relatorio.token);
  assert.equal(pr.modelo, 'clima');
  assert.deepEqual(pr.relatorio.temas, ['Pausas', 'Escala']);
  assert.deepEqual(pr.relatorio.resultado, CL.visaoCliente(enc.resultado));
  assert.equal(pr.relatorio.resultado.lideres, undefined);
  assert.deepEqual((await api.listarRelatoriosModelo(T, { empresaId: o.emp })).relatorios, []);
  assert.ok((await api.climaListar(T, o.emp)).rodadas[0].entregueEm);
  assert.equal((await api.climaListar(T, o.emp)).rodadas[0].relatorio.status, 'publicado');
  // Retenção: "apagar já" tira as brutas e a visão do líder.
  assert.deepEqual(await api.climaApagarBrutas(T, { rodadaId: r.id, agora: true }), { ok: true, rodadas: 1, respostas: 17 });
  assert.deepEqual((await api.climaResultado(T, r.id)).resultado.lideres, []);
  assert.deepEqual(await api.climaComentarios(T, r.id), { ok: true, disponivel: false, apagados: true, comentarios: [] });
  assert.equal((await api.climaListar(T, o.emp)).rodadas[0].respondentes, 16, 'a contagem continua pelo agregado');
  // Excluir leva o relatório junto.
  await api.climaExcluirRodada(T, r.id);
  await assert.rejects(api.relatorioPublico(g.relatorio.token), /Relatório não encontrado/);
});

test('prévia: limite por equipe (convidados) e só admin no painel', async () => {
  const { api, T } = nova();
  const o = await organograma(api, T);
  const r = (await api.climaCriarRodada(T, { empresaId: o.emp, equipes: [{ liderId: o.bruno }] })).rodada;
  for (let i = 0; i < 6; i++) await api.climaEnviar(r.equipes[0].tokenEquipe, { itens: { A1: 3 }, chave: chave() });
  await assert.rejects(api.climaEnviar(r.equipes[0].tokenEquipe, { itens: { A1: 3 }, chave: chave() }), /já recebeu todas as respostas esperadas/);
  await assert.rejects(api.climaListar('', o.emp), /Sessão expirada/);
});

test('prévia com semente: a Clínica Exemplo tem a pesquisa encerrada e o relatório publicado relatorio.html#r-exemplo-clima', async () => {
  const api = SIM.criar({ armazenamento: localStorageFalso(), scoring: S, latenciaMs: 0, clima: CL });
  const pr = await api.relatorioPublico('exemplo-clima');
  assert.equal(pr.modelo, 'clima');
  const res = pr.relatorio.resultado;
  assert.equal(pr.relatorio.empresa.nome, 'Clínica Exemplo');
  assert.equal(res.respondentes, 19);
  assert.deepEqual(res.grupos.map((g) => [g.tipo, g.nome]), [['empresa', 'Toda a empresa'], ['equipe', 'Equipe de Diego E.'], ['outras', 'Outras equipes']]);
  assert.deepEqual(res.equipes.map((e) => [e.nome, e.situacao, e.motivo]),
    [['Equipe de Marta E.', 'outras', 'minimo'], ['Equipe de Diego E.', 'aparece', ''], ['Equipe de Paulo M.', 'outras', 'complemento']]);
  assert.ok(res.complemento.ligado && res.complemento.n4, 'complemento NR-1 com N4 no total da empresa');
  assert.equal(pr.relatorio.temas.length, 3);
  const login = await api.login('admin@previa.com', 'previa123');
  const lista = await api.climaListar(login.token, 'emp_previa_clinica');
  assert.equal(lista.rodadas[0].status, 'encerrada');
  assert.equal(lista.rodadas[0].relatorio.token, 'exemplo-clima');
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

test('cliente Supabase: funções clima_* com os argumentos do contrato', async () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  const TK = 'a'.repeat(64);
  const rodada = { id: ID, status: 'encerrada', equipes: [], relatorio: { id: 'r1', token: 'b'.repeat(64), status: 'publicado' } };
  const { chamadas, cli } = clienteFalso({
    clima_publica: () => ({ ok: true, papel: 'membro', empresaNome: 'X' }),
    clima_enviar: (a) => (a.p_respostas.chave === 'dup' ? { ok: true, duplicado: true } : { ok: true }),
    clima_listar: () => ({ ok: true, rodadas: [rodada] }),
    clima_criar_rodada: () => ({ ok: true, rodada }),
    clima_encerrar: () => ({ ok: true, rodada, resultado: { grupos: [] } }),
    clima_resultado: () => ({ ok: false, erro: 'Os resultados só aparecem depois que a pesquisa é encerrada.' }),
    clima_comentarios: () => ({ ok: true, disponivel: true, apagados: false, comentarios: ['a', 'b'] }),
    clima_gerar_relatorio: () => ({ ok: true, relatorio: { id: 'r1', token: 'b'.repeat(64), status: 'publicado' } }),
    clima_excluir_rodada: () => ({ ok: true, id: ID }),
    clima_apagar_brutas: () => ({ ok: true, rodadas: 1, respostas: 9 })
  });
  const api = SB.criar({ cliente: cli, url: 'https://exemplo.supabase.co', chave: 'k', local: { href: 'https://site.com/admin.html', origin: 'https://site.com', pathname: '/admin.html' }, scoring: S });
  assert.equal((await api.climaPublica(TK.toUpperCase())).papel, 'membro');
  assert.deepEqual(chamadas.pop(), { nome: 'clima_publica', args: { p_token: TK } });
  await assert.rejects(api.climaPublica('xyz'), /Link inválido ou pesquisa encerrada/);
  assert.deepEqual(await api.climaEnviar(TK, { itens: { A1: 3 }, chave: 'dup' }), { ok: true, duplicado: true });
  assert.deepEqual(chamadas.pop().args, { p_token: TK, p_respostas: { itens: { A1: 3 }, chave: 'dup' } });
  const l = await api.climaListar('jwt', ID);
  assert.equal(l.rodadas[0].relatorio.url, 'https://site.com/relatorio.html?r=' + 'b'.repeat(64));
  assert.deepEqual(chamadas.pop(), { nome: 'clima_listar', args: { p_empresa: ID } });
  await api.climaCriarRodada('jwt', { empresaId: ID, equipes: [] });
  assert.equal(chamadas.pop().nome, 'clima_criar_rodada');
  assert.deepEqual((await api.climaEncerrar('jwt', ID)).resultado, { grupos: [] });
  assert.deepEqual(chamadas.pop(), { nome: 'clima_encerrar', args: { p_rodada: ID } });
  await assert.rejects(api.climaResultado('jwt', ID), /só aparecem depois que a pesquisa é encerrada/);
  assert.deepEqual((await api.climaComentarios('jwt', ID)).comentarios, ['a', 'b']);
  const g = await api.climaGerarRelatorio('jwt', ID, { publicar: true, consultor: 'W', temas: ['  um ', '', 'dois'] });
  assert.deepEqual(chamadas.pop().args, { p_rodada: ID, p_opcoes: { publicar: true, consultor: 'W', temas: ['um', 'dois'] } });
  assert.equal(g.relatorio.url, 'https://site.com/relatorio.html?r=' + 'b'.repeat(64));
  assert.deepEqual(await api.climaApagarBrutas('jwt', { rodadaId: ID, agora: true }), { ok: true, rodadas: 1, respostas: 9 });
  assert.deepEqual(chamadas.pop().args, { p_rodada: ID, p_agora: true });
  await api.climaApagarBrutas('jwt');
  assert.deepEqual(chamadas.pop().args, { p_rodada: null, p_agora: false });
  await assert.rejects(api.climaEncerrar('jwt', 'nao-e-uuid'), /Pesquisa não encontrada/);
});

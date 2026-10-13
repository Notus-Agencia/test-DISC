'use strict';
// Pesquisa de clima com identificação (modos anônima, identificação opcional e identificada): textos do aviso por modo
// (quem vê o nome: SÓ a Gestão sem Caos), regras do CPF/data, e a prévia (js/api-simulada.js) com as mesmas regras e
// mensagens da migração 20261018120000_clima_identificacao.sql; o cliente Supabase chama as funções certas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const SIM = require('../js/api-simulada.js');
const SB = require('../js/api-supabase.js');
const API = require('../js/api.js');
const S = require('../js/scoring.js');
const CL = require('../js/clima.js');

function localStorageFalso() {
  const dados = {};
  return { dados, getItem: (k) => (Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, removeItem: (k) => { delete dados[k]; } };
}
function nova() {
  const armazenamento = localStorageFalso();
  const api = SIM.criar({ armazenamento, scoring: S, latenciaMs: 0, semente: false, clima: CL });
  const r = api.processar({ acao: 'primeiroAcesso', chave: 'previa', nome: 'Dona do Sistema', email: 'dona@empresa.com', senha: 'senha-forte-1' });
  if (!r.ok) throw new Error(r.erro);
  return { api, armazenamento, T: r.token };
}
const chave = () => crypto.randomBytes(16).toString('hex');
function todos(v) { const it = {}; CL.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; })); it.H1 = v; return it; }
function textoAviso(a) { return [a.titulo, a.sobretitulo, a.destaque].concat(a.paragrafos.map((p) => p.rotulo + ' ' + p.texto)).join(' '); }

async function organograma(api, T) {
  const emp = (await api.salvarEmpresa(T, { nome: 'Clima ID Prévia' })).empresa;
  let tel = 0;
  const col = async (nome) => (await api.salvarColaborador(T, { empresaId: emp.id, nome, telefone: '1194444' + String(1000 + (++tel)), cargo: 'Cargo', area: 'Comercial' })).colaborador.pessoaId;
  const bruno = await col('Bruno de Souza');
  const equipe = [];
  for (let i = 0; i < 6; i++) equipe.push(await col('Pessoa ' + i + ' Teste'));
  await api.salvarRelacoes(T, emp.id, equipe.map((p) => ({ de: bruno, para: p, tipo: 'lidera' })));
  return { emp: emp.id, bruno, equipe };
}

// ---------------------------------------------------------------------------------------------------------------
// Textos e regras puras (js/clima.js)
// ---------------------------------------------------------------------------------------------------------------

test('aviso: anônimo igual à versão 1; com identificação diz que SÓ a Gestão sem Caos vê o nome, nunca a empresa', () => {
  const base = { empresa: 'Clínica Exemplo', complemento: true, retencaoDias: 90 };
  const v1 = CL.avisoRespondente(base);
  assert.deepEqual(CL.avisoRespondente(Object.assign({ modo: 'anonima' }, base)), v1);
  assert.deepEqual(CL.avisoRespondente(Object.assign({ modo: 'identificada', pessoal: false }, base)).paragrafos, v1.paragrafos,
    'o aviso com identificação só vale no link pessoal');
  assert.equal(v1.sobretitulo, 'Anônima e voluntária · cerca de 5 minutos');
  assert.equal(v1.destaque, '');
  assert.ok(textoAviso(v1).includes('não guardamos nome, telefone, e-mail nem endereço de internet'));

  const op = CL.avisoRespondente(Object.assign({ modo: 'opcional', pessoal: true }, base));
  const id = CL.avisoRespondente(Object.assign({ modo: 'identificada', pessoal: true }, base));
  for (const [nome, a] of [['opcional', op], ['identificada', id]]) {
    const t = textoAviso(a);
    assert.ok(t.includes('só a consultoria (Gestão sem Caos) vê o seu nome') || t.includes('só a consultoria (Gestão sem Caos), junto com as suas respostas'), nome);
    assert.ok(t.includes('A empresa (dono, RH e liderança) nunca vê o seu nome nem as suas respostas'), nome);
    assert.ok(t.includes('Um grupo só aparece no relatório com pelo menos 5 respostas. Detalhes e comentários, só com 10 ou mais.'), nome + ': mesmas regras de mínimo');
    assert.ok(t.includes('Ninguém da empresa vê a sua resposta nem sabe se você respondeu.'), nome);
    assert.ok(/endereço de internet/.test(t), nome + ': nunca IP');
    assert.ok(!t.includes('Não pedimos o seu nome'), nome + ': não promete anonimato');
    assert.ok(!t.includes('não fica ligada a você: não guardamos nome'), nome);
    assert.ok(/tirar o seu nome/.test(t), nome + ': direito de tirar o nome');
    for (const p of CL.PALAVRAS_PROIBIDAS) assert.ok(!t.toLowerCase().includes(p), nome + ': ' + p);
  }
  assert.equal(op.sobretitulo, 'Identificação opcional · cerca de 5 minutos');
  assert.ok(textoAviso(op).includes('"Quero me identificar" e "Prefiro manter o anonimato"'));
  assert.ok(textoAviso(op).includes('ninguém, nem a Gestão sem Caos, sabe se você respondeu'));
  assert.match(op.destaque, /só com a consultoria \(Gestão sem Caos\)/);
  assert.equal(id.sobretitulo, 'Pesquisa identificada · cerca de 5 minutos');
  assert.ok(textoAviso(id).includes('Se não quiser se identificar, você pode não responder.'));
  // Link coletivo no modo opcional: anônimo + o caminho para se identificar.
  const coletivo = CL.avisoRespondente(Object.assign({ modo: 'opcional', pessoal: false }, base));
  assert.equal(coletivo.sobretitulo, v1.sobretitulo);
  assert.ok(textoAviso(coletivo).includes('Use o link pessoal que você recebeu. Por este link, a resposta é anônima.'));
});

test('N4, modos, alerta, formas de confirmação, CPF/data e máscara de e-mail', () => {
  assert.equal(CL.textoN4('o RH'), 'Se você está passando por isso, procure o RH. Esta pesquisa não é canal de denúncia e não identifica quem respondeu.');
  assert.match(CL.textoN4('o RH', true), /não é canal de denúncia: a empresa não recebe o seu nome junto com esta resposta\.$/);
  assert.deepEqual(CL.MODOS, ['anonima', 'opcional', 'identificada']);
  assert.equal(CL.MODOS_INFO.anonima.recomendado, true);
  assert.equal(CL.ALERTA_IDENTIFICACAO, 'Nos modos com identificação as respostas tendem a ser menos sinceras, principalmente sobre liderança. Recomende o modo anônimo.');
  assert.equal(CL.modoValido('x'), 'anonima');
  assert.equal(CL.comIdentificacao('opcional') && CL.comIdentificacao('identificada') && !CL.comIdentificacao('anonima'), true);
  assert.deepEqual(CL.METODOS_CONFIRMACAO, ['email', 'whatsapp', 'dados']);
  assert.deepEqual(CL.normalizarConferencia('045', '15/08'), { ok: true, valor: '045:1508' });
  assert.deepEqual(CL.normalizarConferencia(' 045 ', '5-8'), { ok: true, valor: '045:0508' });
  assert.deepEqual(CL.normalizarConferencia('045', '2902'), { ok: true, valor: '045:2902' });
  for (const [c, n] of [['45', '15/08'], ['0450', '15/08'], ['abc', '15/08'], ['045', '31/04'], ['045', '30/02'], ['045', '00/01'], ['045', '15/13'], ['045', '']]) {
    assert.equal(CL.normalizarConferencia(c, n).ok, false, c + ' ' + n);
  }
  assert.equal(CL.mascararEmail('Ana.Souza@Empresa.com.br'), 'a***@e***.com.br');
  assert.equal(CL.mascararEmail('x@localhost'), 'x***@l***');
  assert.equal(CL.mascararEmail('sem-arroba'), '');
  // Textos do relatório sobre o modo: transparência, sem nomes e sem palavras proibidas.
  for (const t of [CL.TEXTOS.identificada, CL.TEXTOS.opcional]) {
    assert.match(t, /não aparecem neste relatório/);
    assert.match(t, /mínimos de 5 e 10/);
    for (const p of CL.PALAVRAS_PROIBIDAS) assert.ok(!t.toLowerCase().includes(p), p);
  }
});

test('tela de resposta e painel: corpo da identificação, máscara da data, mensagem do link pessoal e avisos', () => {
  const R = require('../js/clima-resposta.js');
  const AC = require('../js/admin-clima.js');
  assert.deepEqual(R.montarIdentificacao({ modo: 'anonima' }), { ok: true, extra: {} });
  assert.deepEqual(R.montarIdentificacao({ modo: 'opcional', escolha: 'anonimo', metodos: ['email'] }), { ok: true, extra: { identificar: false } });
  assert.equal(R.montarIdentificacao({ modo: 'opcional', metodos: ['email'] }).ok, false);
  assert.deepEqual(R.montarIdentificacao({ modo: 'identificada', metodos: [] }), { ok: true, extra: { identificar: true } });
  assert.equal(R.montarIdentificacao({ modo: 'identificada', metodos: ['email', 'dados'] }).erro, 'Escolha como confirmar que é você.');
  assert.equal(R.montarIdentificacao({ modo: 'identificada', metodos: ['email'], metodo: 'email', codigo: '123456' }).ok, false, 'sem pedir o código');
  assert.equal(R.montarIdentificacao({ modo: 'identificada', metodos: ['email'], metodo: 'email', codigoPedido: true, codigo: '12345' }).erro, 'Digite os 6 números do código.');
  assert.deepEqual(R.montarIdentificacao({ modo: 'identificada', metodos: ['email'], metodo: 'email', codigoPedido: true, codigo: '123 456' }).extra,
    { identificar: true, confirmacao: { metodo: 'email', codigo: '123456' } });
  assert.equal(R.montarIdentificacao({ modo: 'identificada', metodos: ['dados'], metodo: 'dados', cpf3: '04', nascimento: '15/08' }).erro, 'Informe os 3 últimos dígitos do CPF.');
  assert.deepEqual(R.montarIdentificacao({ modo: 'opcional', escolha: 'identificar', metodos: ['dados'], metodo: 'dados', cpf3: '045', nascimento: '15/08' }).extra,
    { identificar: true, confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/08' } });
  assert.deepEqual(['1508', '15/0', '1a5', '150899'].map(R.mascararNascimento), ['15/08', '15/0', '15', '15/08']);
  const msgId = AC.mensagemPessoal('Clínica Exemplo', 'Ana Souza', 'https://x/clima.html?t=a', 'identificada');
  assert.match(msgId, /^Olá, Ana! Este é o seu link pessoal/);
  assert.match(msgId, /só a Gestão sem Caos vê o seu nome/);
  assert.match(msgId, /não encaminhe\.\nhttps:\/\/x\/clima\.html\?t=a$/);
  assert.match(AC.mensagemPessoal('', '', 'L', 'opcional'), /^Olá! .*manter o anonimato/);
  assert.ok(!/notus/i.test(msgId));
  assert.deepEqual(AC.avisosPessoais({ equipes: [{ convites: [{ metodos: ['email'] }, { metodos: [] }] }, { convites: [{ metodos: [] }] }] }),
    ['2 links pessoais sem forma de confirmação (sem e-mail e sem CPF/data no cadastro): o link sozinho identifica a pessoa. Mande só para ela.']);
  assert.deepEqual(AC.avisosPessoais({ equipes: [{ convites: [{ metodos: ['dados'] }] }] }), []);
  assert.equal(AC.snapshotPrevia({ modo: 'identificada' }, {}, { nome: 'X' }, [], '').rodada.modo, 'identificada');
});

test('métodos novos nos três DISC_API (o Apps Script recusa)', async () => {
  const nomes = ['climaPedirCodigo', 'climaEnvios', 'climaIdentificacao', 'climaDesidentificar', 'climaRenovarConvite', 'climaColaboradoresDados',
    'climaSalvarColaborador'];
  nomes.forEach((m) => assert.ok(API.METODOS.includes(m) && SB.METODOS.includes(m) && SIM.METODOS.includes(m), m));
  await assert.rejects(API.climaPedirCodigo('x', 'email'), /Disponível só com o servidor Supabase/);
});

// ---------------------------------------------------------------------------------------------------------------
// Prévia (mesmas regras do banco)
// ---------------------------------------------------------------------------------------------------------------

test('prévia: identificada com CPF/data e código por e-mail; uso único; tentativas; o relatório não muda', async () => {
  const { api, T, armazenamento } = nova();
  const o = await organograma(api, T);
  // Cadastro: e-mail para a pessoa 0, CPF/data para a 1 (só hash com sal).
  assert.deepEqual(await api.climaSalvarColaborador(T, { empresaId: o.emp, pessoaId: o.equipe[0], email: 'Pessoa0@Empresa.com' }), { ok: true, email: 'pessoa0@empresa.com', conferencia: false });
  await assert.rejects(api.climaSalvarColaborador(T, { empresaId: o.emp, pessoaId: o.equipe[1], cpf3: '45', nascimento: '15/08' }), /Confira os 3 últimos dígitos/);
  assert.equal((await api.climaSalvarColaborador(T, { empresaId: o.emp, pessoaId: o.equipe[1], cpf3: '045', nascimento: '15/08' })).conferencia, true);
  const guardado = JSON.stringify(armazenamento.dados);
  assert.ok(!guardado.includes('045:1508') && !guardado.includes('15/08'), 'CPF/data nunca em claro');
  const dados = await api.climaColaboradoresDados(T, o.emp);
  assert.deepEqual(dados.pessoas.find((p) => p.pessoaId === o.equipe[1]), { pessoaId: o.equipe[1], email: '', conferencia: true });

  await assert.rejects(api.climaCriarRodada(T, { empresaId: o.emp, modo: 'identificada', equipes: [{ liderId: o.bruno, convidados: 8 }] }), /só responde quem está no cadastro/);
  const r = (await api.climaCriarRodada(T, { empresaId: o.emp, modo: 'identificada', metodos: ['dados', 'email'], equipes: [{ liderId: o.bruno }] })).rodada;
  assert.equal(r.modo, 'identificada');
  assert.deepEqual(r.metodos, ['email', 'dados']);
  const cv = Object.fromEntries(r.equipes[0].convites.map((c) => [c.pessoaId, c]));
  assert.equal(r.equipes[0].convites.length, 6);
  assert.deepEqual(cv[o.equipe[0]].metodos, ['email']);
  assert.deepEqual(cv[o.equipe[1]].metodos, ['dados']);
  assert.deepEqual(cv[o.equipe[2]].metodos, []);
  // Link coletivo recusado; link pessoal mostra as formas de confirmação, sem o nome.
  await assert.rejects(api.climaPublica(r.equipes[0].tokenEquipe), /é identificada: responda pelo link pessoal/);
  const pub = await api.climaPublica(cv[o.equipe[0]].token);
  assert.deepEqual([pub.modo, pub.pessoal, pub.metodos, pub.emailMascarado], ['identificada', true, ['email'], 'p***@e***.com']);
  assert.ok(!JSON.stringify(pub).includes('Pessoa 0'));
  // Código por e-mail (prévia: o código volta para a tela; nada sai).
  const c = await api.climaPedirCodigo(cv[o.equipe[0]].token, 'email');
  assert.equal(c.simulado, true);
  assert.match(c.codigoPrevia, /^[0-9]{6}$/);
  assert.equal(c.destino, 'p***@e***.com');
  await assert.rejects(api.climaPedirCodigo(cv[o.equipe[0]].token, 'email'), /Espere um minuto/);
  await assert.rejects(api.climaPedirCodigo(cv[o.equipe[2]].token, 'email'), /Não foi possível enviar um código por este link/);
  const tk0 = cv[o.equipe[0]].token;
  await assert.rejects(api.climaEnviar(tk0, { itens: { A1: 4 }, chave: chave() }), (e) => e.resposta.confirmar === true);
  const errado = c.codigoPrevia === '000000' ? '111111' : '000000';
  await assert.rejects(api.climaEnviar(tk0, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: errado } }), /Código incorreto ou vencido/);
  assert.deepEqual(await api.climaEnviar(tk0, { itens: todos(4), comentario: 'Mais conversa', chave: chave(), confirmacao: { metodo: 'email', codigo: c.codigoPrevia } }),
    { ok: true, identificada: true });
  await assert.rejects(api.climaEnviar(tk0, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'email', codigo: c.codigoPrevia } }), (e) => e.resposta.usado === true);
  await assert.rejects(api.climaPublica(tk0), /já foi usado/);
  // CPF/data: 5 erros e a 6ª é recusada; link novo zera e invalida o antigo.
  const tk1 = cv[o.equipe[1]].token;
  for (let i = 0; i < 5; i++) await assert.rejects(api.climaEnviar(tk1, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '16/08' } }), /não conferem/);
  await assert.rejects(api.climaEnviar(tk1, { itens: { A1: 4 }, chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/08' } }), /Muitas tentativas/);
  const nv = await api.climaRenovarConvite(T, cv[o.equipe[1]].id);
  await assert.rejects(api.climaPublica(tk1), /Link inválido/);
  assert.equal((await api.climaEnviar(nv.convite.token, { itens: todos(3), chave: chave(), confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/8' } })).identificada, true);
  // Sem forma de confirmação: o link pessoal sozinho.
  for (const p of o.equipe.slice(2)) assert.equal((await api.climaEnviar(cv[p].token, { itens: todos(2), chave: chave() })).identificada, true);
  // Painel: só contagens; uso interno registra o acesso; respostas só depois do encerramento.
  const lista = (await api.climaListar(T, o.emp)).rodadas[0];
  assert.equal(lista.identificadas, 6);
  assert.ok(!JSON.stringify(lista).includes('"usado"'));
  const a1 = await api.climaIdentificacao(T, r.id);
  assert.deepEqual([a1.respostasDisponiveis, a1.motivo, a1.respostas.length, a1.convites.filter((x) => x.usado).length], [false, 'aberta', 0, 6]);
  assert.equal(a1.acessos[0].acao, 'abrir');
  await api.climaEncerrar(T, r.id);
  const a2 = await api.climaIdentificacao(T, r.id);
  assert.equal(a2.respostas.length, 6);
  assert.equal(a2.acessos.length, 2);
  const p0 = a2.respostas.find((x) => x.comentario === 'Mais conversa');
  assert.equal(p0.nome, 'Pessoa 0 Teste');
  assert.equal(p0.confirmadoPor, 'email');
  assert.equal(p0.escores.A, 65);
  // Relatório: igual a uma pesquisa anônima com as mesmas respostas (só o modo, para transparência); nenhum nome.
  const g = await api.climaGerarRelatorio(T, r.id, { publicar: true });
  const pubRel = await api.relatorioPublico(g.relatorio.token);
  assert.equal(pubRel.relatorio.rodada.modo, 'identificada');
  const textoRel = JSON.stringify(pubRel);
  for (const c2 of r.equipes[0].convites) assert.ok(!textoRel.includes(c2.nome), c2.nome);
  assert.ok(!textoRel.includes('Mais conversa'));
  // Tirar o nome (pedido do titular).
  await api.climaDesidentificar(T, r.id, p0.respostaId);
  assert.equal((await api.climaIdentificacao(T, r.id)).respostas.length, 5);
  // Retenção: identificação, links e o CPF/data copiado saem.
  await api.climaApagarBrutas(T, { rodadaId: r.id, agora: true });
  const a3 = await api.climaIdentificacao(T, r.id);
  assert.deepEqual([a3.motivo, a3.respostas.length, a3.convites.length], ['apagadas', 0, 0]);
  assert.equal((await api.climaColaboradoresDados(T, o.emp)).pessoas.filter((p) => p.conferencia).length, 0);
});

test('prévia: opcional — anônimo pelo link pessoal não marca nada; "quero me identificar" liga; anônima não tem tela de uso interno', async () => {
  const { api, T } = nova();
  const o = await organograma(api, T);
  const r = (await api.climaCriarRodada(T, { empresaId: o.emp, modo: 'opcional', metodos: ['dados'], equipes: [{ liderId: o.bruno, convidados: 8 }] })).rodada;
  assert.equal(r.equipes[0].convidados, 8);
  const tk = r.equipes[0].convites[0].token;
  const coletivo = await api.climaPublica(r.equipes[0].tokenEquipe);
  assert.deepEqual([coletivo.modo, coletivo.pessoal], ['opcional', false]);
  assert.deepEqual(await api.climaEnviar(tk, { itens: { A1: 3 }, chave: chave(), identificar: false }), { ok: true });
  assert.deepEqual(await api.climaEnviar(tk, { itens: { A1: 3 }, chave: chave() }), { ok: true });
  assert.equal((await api.climaListar(T, o.emp)).rodadas[0].identificadas, 0);
  assert.deepEqual(await api.climaEnviar(tk, { itens: { A1: 2 }, chave: chave(), identificar: true }), { ok: true, identificada: true });
  await assert.rejects(api.climaPublica(tk), /já foi usado/);
  assert.deepEqual(await api.climaEnviar(r.equipes[0].tokenEquipe, { itens: { A1: 5 }, chave: chave() }), { ok: true });
  assert.equal((await api.climaListar(T, o.emp)).rodadas[0].respondentes, 4);
  await api.climaExcluirRodada(T, r.id);
  const an = (await api.climaCriarRodada(T, { empresaId: o.emp, metodos: ['email'], equipes: [{ liderId: o.bruno }] })).rodada;
  assert.deepEqual([an.modo, an.metodos, an.equipes[0].convites], ['anonima', [], []]);
  await assert.rejects(api.climaIdentificacao(T, an.id), /é anônima/);
  assert.deepEqual(await api.climaEnvios(T), { ok: true, email: true, whatsapp: false, simulado: true });
});

// ---------------------------------------------------------------------------------------------------------------
// Cliente Supabase
// ---------------------------------------------------------------------------------------------------------------

test('cliente Supabase: funções e Edge Functions da identificação com os argumentos do contrato', async () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  const ID2 = '33333333-3333-4333-8333-333333333333';
  const TK = 'a'.repeat(64);
  const chamadas = [];
  const invocacoes = [];
  const sessao = { access_token: 'jwt', user: { id: '11111111-1111-4111-8111-111111111111', email: 'dona@empresa.com' } };
  const respostas = {
    clima_enviar: () => ({ ok: true, identificada: true }),
    clima_identificacao: () => ({ ok: true, rodada: { id: ID, modo: 'identificada' }, convites: [{ id: ID2, nome: 'Ana', usado: true }], respostasDisponiveis: true,
      motivo: '', respostas: [{ respostaId: ID2, nome: 'Ana' }], acessos: [{ nome: 'W', acao: 'abrir', em: '2026-10-13T12:00:00.000Z' }] }),
    clima_desidentificar: () => ({ ok: true }),
    clima_convite_renovar: () => ({ ok: true, convite: { id: ID2, token: 'b'.repeat(64) } }),
    clima_colaboradores_dados: () => ({ ok: true, pessoas: [{ pessoaId: ID2, email: 'a@b.com', conferencia: true }] }),
    clima_colaborador_salvar: () => ({ ok: true, email: 'a@b.com', conferencia: true })
  };
  const cli = {
    auth: { getSession: async () => ({ data: { session: sessao }, error: null }) },
    rpc: async (nome, args) => { chamadas.push({ nome, args }); const f = respostas[nome]; return { data: f ? f(args) : { ok: true }, error: null }; },
    from: () => { throw new Error('não deveria ler tabela'); },
    functions: { invoke: async (nome, op) => {
      invocacoes.push({ nome, corpo: op.body });
      if (nome === 'admin') return { data: { ok: true, email: true, whatsapp: false }, error: null };
      return { data: { ok: true, canal: op.body.canal, destino: 'a***@b***.com', minutos: 10 }, error: null };
    } }
  };
  const api = SB.criar({ cliente: cli, url: 'https://exemplo.supabase.co', chave: 'k', local: { href: 'https://site.com/admin.html', origin: 'https://site.com', pathname: '/admin.html' }, scoring: S });
  assert.deepEqual(await api.climaEnviar(TK, { itens: { A1: 3 }, chave: chave(), identificar: true, confirmacao: { metodo: 'dados', cpf3: '045', nascimento: '15/08' } }),
    { ok: true, identificada: true });
  assert.deepEqual(chamadas.pop().args.p_respostas.confirmacao, { metodo: 'dados', cpf3: '045', nascimento: '15/08' });
  assert.deepEqual(await api.climaPedirCodigo(TK.toUpperCase(), 'email'), { ok: true, canal: 'email', destino: 'a***@b***.com', minutos: 10 });
  assert.deepEqual(invocacoes.pop(), { nome: 'clima', corpo: { acao: 'codigo', token: TK, canal: 'email' } });
  await assert.rejects(api.climaPedirCodigo(TK, 'sms'), /Forma de confirmação inválida/);
  await assert.rejects(api.climaPedirCodigo('x', 'email'), /Link inválido/);
  assert.deepEqual(await api.climaEnvios('jwt'), { ok: true, email: true, whatsapp: false });
  assert.deepEqual(invocacoes.pop(), { nome: 'admin', corpo: { acao: 'clima.envios' } });
  const ident = await api.climaIdentificacao('jwt', ID);
  assert.equal(ident.respostas[0].nome, 'Ana');
  assert.deepEqual(chamadas.pop(), { nome: 'clima_identificacao', args: { p_rodada: ID } });
  await api.climaDesidentificar('jwt', ID, ID2);
  assert.deepEqual(chamadas.pop(), { nome: 'clima_desidentificar', args: { p_rodada: ID, p_resposta: ID2 } });
  await assert.rejects(api.climaDesidentificar('jwt', ID, 'x'), /não encontrada/);
  assert.equal((await api.climaRenovarConvite('jwt', ID2)).convite.token, 'b'.repeat(64));
  assert.deepEqual(chamadas.pop(), { nome: 'clima_convite_renovar', args: { p_convite: ID2 } });
  assert.deepEqual((await api.climaColaboradoresDados('jwt', ID)).pessoas, [{ pessoaId: ID2, email: 'a@b.com', conferencia: true }]);
  assert.deepEqual(chamadas.pop(), { nome: 'clima_colaboradores_dados', args: { p_empresa: ID } });
  await api.climaSalvarColaborador('jwt', { empresaId: ID, pessoaId: ID2, email: ' a@b.com ', cpf3: '045', nascimento: '15/08' });
  assert.deepEqual(chamadas.pop(), { nome: 'clima_colaborador_salvar', args: { p_dados: { empresaId: ID, pessoaId: ID2, email: 'a@b.com', cpf3: '045', nascimento: '15/08' } } });
  await api.climaSalvarColaborador('jwt', { empresaId: ID, pessoaId: ID2, apagarConferencia: true, cpf3: '1' });
  assert.deepEqual(chamadas.pop().args.p_dados, { empresaId: ID, pessoaId: ID2, apagarConferencia: true });
  // Edge Function "clima" ainda não publicada: mensagem amigável para quem responde.
  cli.functions.invoke = async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 404, json: async () => ({}) } } });
  await assert.rejects(api.climaPedirCodigo(TK, 'email'), /O envio do código não está disponível agora/);
});

// ---------------------------------------------------------------------------------------------------------------
// Relatório (js/relatorio-view.js): o mesmo em todos os modos; o identificado diz "pesquisa identificada" (Como ler,
// anexo PGR, Método e capa) e nunca mostra nomes.
// ---------------------------------------------------------------------------------------------------------------

test('relatório: "pesquisa identificada" em Como ler, no anexo PGR, no Método e na capa; dados iguais aos do anônimo', () => {
  const V = require('../js/relatorio-view.js');
  const equipes = [{ id: 'e1', nome: 'Equipe de Ana S.', area: '', ordem: 0, convidados: 12 }];
  const respostas = [];
  for (let j = 0; j < 11; j++) respostas.push({ equipeId: 'e1', papel: 'membro', itens: Object.assign(todos(2 + (j % 3)), { N1: 2, N2: 3, N3: 4, N5: 4, N4: 1 }) });
  const res = CL.calcular({ equipes, respostas, complemento: true, n4: true });
  const snap = (modo) => ({ modelo: 'clima', versao: 1, titulo: 'Pesquisa de clima · Empresa X', geradoEm: '2026-10-10T12:00:00.000Z',
    empresa: { nome: 'Empresa X', cidade: '' }, consultor: 'Consultor', rodada: { nome: 'Clima', abertaEm: '2026-09-01T12:00:00.000Z',
      encerradaEm: '2026-09-20T12:00:00.000Z', complemento: true, n4Ligado: true, canalTexto: 'o RH', canalUrl: '', versaoItens: 'v0', modo },
    resultado: CL.visaoCliente(res), temas: [] });
  const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const an = V.montarHtml(snap('anonima'));
  const id = V.montarHtml(snap('identificada'));
  const op = V.montarHtml(snap('opcional'));
  assert.ok(!texto(an).includes('identificad'), 'anônima: nada muda');
  assert.equal((id.match(/data-modo="identificada"/g) || []).length, 2, 'Como ler e anexo PGR');
  assert.ok(texto(id).includes(CL.TEXTOS.identificada));
  assert.ok(texto(id).includes('Pesquisa de clima · identificada'), 'capa');
  assert.ok(texto(id).includes('A empresa não vê a resposta de ninguém nem quem respondeu.'));
  assert.ok(texto(id).includes('este relatório não identifica quem respondeu'));
  assert.ok(texto(op).includes(CL.TEXTOS.opcional), 'opcional: no Método');
  assert.ok(!/data-modo="identificada"/.test(op));
  // Os resultados são os mesmos (só os textos de transparência mudam): resumo e grupos idênticos.
  const secao = (html, nome) => (new RegExp('data-secao="' + nome + '"[\\s\\S]*?</section>').exec(html) || [''])[0];
  for (const nome of ['resumo', 'grupos', 'fatores']) {
    assert.ok(secao(an, nome).length > 100, nome);
    assert.equal(secao(id, nome).replace('este relatório não identifica', 'não identifica'), secao(an, nome), nome);
  }
  for (const p of CL.PALAVRAS_PROIBIDAS) assert.ok(!texto(id).toLowerCase().includes(p), p);
});
